// Urenstaten: invullen, indienen, goedkeuren of afkeuren.
// Na goedkeuring zijn de uren vergrendeld en worden de facturen aangemaakt.
import { weekDays, isValidWeek, token, addDays, today } from '../util.js';
import { createInvoicesForTimesheet } from './invoices.js';

export class TimesheetError extends Error {}

const EDITABLE = ['concept', 'afgekeurd'];
const APPROVAL_DAYS = 14;

export function findOrCreate(db, plaatsingId, week) {
  if (!isValidWeek(week)) throw new TimesheetError('Ongeldige week.');
  const existing = db.get('SELECT * FROM urenstaten WHERE plaatsing_id = ? AND week = ?', plaatsingId, week);
  if (existing) return existing;
  const id = db.run('INSERT INTO urenstaten (plaatsing_id, week) VALUES (?, ?)', plaatsingId, week).id;
  return db.get('SELECT * FROM urenstaten WHERE id = ?', id);
}

export function entries(db, urenstaatId, week) {
  const rows = db.all('SELECT datum, minuten, omschrijving FROM uren WHERE urenstaat_id = ?', urenstaatId);
  const byDate = new Map(rows.map((r) => [r.datum, r]));
  return weekDays(week).map((datum) => byDate.get(datum) || { datum, minuten: 0, omschrijving: '' });
}

export const totalMinutes = (db, urenstaatId) =>
  db.get('SELECT COALESCE(SUM(minuten), 0) AS m FROM uren WHERE urenstaat_id = ?', urenstaatId).m;

// items: [{ datum, minuten, omschrijving }]
export function save(db, urenstaatId, items, wie) {
  return db.tx(() => {
    const u = db.get('SELECT * FROM urenstaten WHERE id = ?', urenstaatId);
    if (!u) throw new TimesheetError('Urenstaat niet gevonden.');
    if (!EDITABLE.includes(u.status)) throw new TimesheetError('Deze uren zijn al ingediend en kunnen niet meer worden gewijzigd.');
    const p = db.get('SELECT startdatum, einddatum FROM plaatsingen WHERE id = ?', u.plaatsing_id);
    const days = new Set(weekDays(u.week));
    for (const it of items) {
      if (!days.has(it.datum)) throw new TimesheetError('Een datum valt buiten deze week.');
      if (!Number.isInteger(it.minuten) || it.minuten < 0 || it.minuten > 1440) throw new TimesheetError('Ongeldig aantal uren.');
      if (it.minuten % 15 !== 0) throw new TimesheetError('Vul uren in per kwartier, bijvoorbeeld 7,75 of 8,25.');
      if (it.minuten > 0 && ((p.startdatum && it.datum < p.startdatum) || (p.einddatum && it.datum > p.einddatum))) {
        throw new TimesheetError('Er staan uren op een dag buiten de looptijd van deze opdracht.');
      }
    }
    for (const it of items) {
      db.run(`INSERT INTO uren (urenstaat_id, datum, minuten, omschrijving) VALUES (?, ?, ?, ?)
              ON CONFLICT(urenstaat_id, datum) DO UPDATE SET minuten = excluded.minuten, omschrijving = excluded.omschrijving`,
        urenstaatId, it.datum, it.minuten, it.omschrijving || '');
    }
    db.audit(wie, 'uren opgeslagen', 'urenstaat', urenstaatId);
  });
}

export function submit(db, urenstaatId, wie) {
  return db.tx(() => {
    const u = db.get('SELECT * FROM urenstaten WHERE id = ?', urenstaatId);
    if (!u) throw new TimesheetError('Urenstaat niet gevonden.');
    if (!EDITABLE.includes(u.status)) throw new TimesheetError('Deze uren zijn al ingediend.');
    if (totalMinutes(db, urenstaatId) <= 0) throw new TimesheetError('Vul eerst uren in voordat je indient.');
    const t = token();
    db.run(`UPDATE urenstaten SET status = 'ingediend', ingediend_op = datetime('now'), afkeur_reden = '',
            approval_token = ?, approval_expires = ? WHERE id = ?`, t, addDays(today(), APPROVAL_DAYS), urenstaatId);
    db.audit(wie, 'uren ingediend', 'urenstaat', urenstaatId);
    return t;
  });
}

// Nieuwe goedkeuringslink, bijvoorbeeld als de oude is verlopen.
export function renewApprovalLink(db, urenstaatId, wie) {
  const u = db.get('SELECT status FROM urenstaten WHERE id = ?', urenstaatId);
  if (!u || u.status !== 'ingediend') throw new TimesheetError('Alleen ingediende uren hebben een goedkeuringslink.');
  const t = token();
  db.run('UPDATE urenstaten SET approval_token = ?, approval_expires = ? WHERE id = ?', t, addDays(today(), APPROVAL_DAYS), urenstaatId);
  db.audit(wie, 'nieuwe goedkeuringslink', 'urenstaat', urenstaatId);
  return t;
}

export function approve(db, urenstaatId, naam, via) {
  return db.tx(() => {
    const u = db.get('SELECT * FROM urenstaten WHERE id = ?', urenstaatId);
    if (!u) throw new TimesheetError('Urenstaat niet gevonden.');
    if (u.status !== 'ingediend') throw new TimesheetError('Deze uren wachten niet op goedkeuring.');
    if (!naam) throw new TimesheetError('Vul je naam in bij het goedkeuren.');
    const p = db.get('SELECT inkoop_cents, verkoop_cents FROM plaatsingen WHERE id = ?', u.plaatsing_id);
    // Tarieven worden hier vastgelegd; een latere tariefwijziging raakt deze week niet meer.
    db.run(`UPDATE urenstaten SET status = 'goedgekeurd', goedgekeurd_op = datetime('now'), goedgekeurd_door = ?,
            inkoop_cents = ?, verkoop_cents = ? WHERE id = ?`, naam, p.inkoop_cents, p.verkoop_cents, urenstaatId);
    db.audit(`${naam} (${via})`, 'uren goedgekeurd', 'urenstaat', urenstaatId);
    return createInvoicesForTimesheet(db, urenstaatId, `${naam} (${via})`);
  });
}

export function reject(db, urenstaatId, naam, reden, via) {
  return db.tx(() => {
    const u = db.get('SELECT * FROM urenstaten WHERE id = ?', urenstaatId);
    if (!u) throw new TimesheetError('Urenstaat niet gevonden.');
    if (u.status !== 'ingediend') throw new TimesheetError('Deze uren wachten niet op goedkeuring.');
    if (!naam) throw new TimesheetError('Vul je naam in.');
    if (!reden) throw new TimesheetError('Geef aan wat er niet klopt, zodat de uren kunnen worden aangepast.');
    db.run(`UPDATE urenstaten SET status = 'afgekeurd', afkeur_reden = ?, goedgekeurd_door = ?, approval_token = NULL WHERE id = ?`,
      reden, naam, urenstaatId);
    db.audit(`${naam} (${via})`, 'uren afgekeurd', 'urenstaat', urenstaatId, reden);
  });
}

// Urenstaat met alle context, voor schermen.
export function loadTimesheet(db, urenstaatId) {
  return db.get(`
    SELECT u.*, p.zzp_id, p.functie, p.inkoop_cents AS p_inkoop, p.verkoop_cents AS p_verkoop,
           p.goedkeurder_naam, p.goedkeurder_email, p.goedkeurder_telefoon,
           pr.id AS project_id, pr.naam AS project_naam, pr.projectnummer, pr.locatie,
           k.id AS klant_id, k.naam AS klant_naam, z.naam AS zzp_naam, z.telefoon AS zzp_telefoon,
           (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
      FROM urenstaten u
      JOIN plaatsingen p ON p.id = u.plaatsing_id
      JOIN projecten pr ON pr.id = p.project_id
      JOIN klanten k ON k.id = pr.klant_id
      JOIN zzpers z ON z.id = p.zzp_id
     WHERE u.id = ?`, urenstaatId);
}
