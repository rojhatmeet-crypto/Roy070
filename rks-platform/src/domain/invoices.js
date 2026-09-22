// Facturatie: automatisch bij goedkeuring van uren.
//
// Per goedgekeurde urenstaat:
//  - inkoop: een self-billing factuur van de zzp'er aan RKS (als de zzp'er daar
//    schriftelijk mee akkoord is), anders een regel "wacht op factuur"
//  - verkoop: een regel op de conceptfactuur van RKS aan de klant voor die week
//
// Verkoopfacturen krijgen pas een nummer als ze definitief worden. Zo loopt de
// nummering zonder gaten door.
import { btwBedrag, inkoopRegeling } from './btw.js';
import { lineAmount, today, addDays, token, pad, hours, weekNumber } from '../util.js';

export class InvoiceError extends Error {}

export function recalc(db, factuurId) {
  const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
  const sub = db.get('SELECT COALESCE(SUM(bedrag_cents), 0) AS s FROM factuurregels WHERE factuur_id = ?', factuurId).s;
  const btw = btwBedrag(sub, f.btw_regeling);
  db.run('UPDATE facturen SET subtotaal_cents = ?, btw_cents = ?, totaal_cents = ? WHERE id = ?', sub, btw, sub + btw, factuurId);
}

function nextSelfBillingNumber(db, zzp) {
  const seq = zzp.selfbilling_volgnummer + 1;
  db.run('UPDATE zzpers SET selfbilling_volgnummer = ? WHERE id = ?', seq, zzp.id);
  return `SB-${pad(zzp.id, 3)}-${pad(seq, 4)}`;
}

function nextSalesNumber(db, jaar) {
  const s = db.settings();
  let seq = Number(s.factuur_volgnummer) || 0;
  if (s.factuur_jaar !== String(jaar)) seq = 0;
  seq += 1;
  db.setSetting('factuur_volgnummer', seq);
  db.setSetting('factuur_jaar', jaar);
  return `${s.factuur_prefix || 'RKS'}-${jaar}-${pad(seq, 4)}`;
}

// Wordt aangeroepen binnen de transactie van de goedkeuring.
export function createInvoicesForTimesheet(db, urenstaatId, wie) {
  const u = db.get(`
    SELECT u.*, p.zzp_id, p.project_id, p.functie, pr.klant_id, pr.naam AS project_naam, pr.projectnummer,
           pr.verkoop_btw, z.naam AS zzp_naam
      FROM urenstaten u
      JOIN plaatsingen p ON p.id = u.plaatsing_id
      JOIN projecten pr ON pr.id = p.project_id
      JOIN zzpers z ON z.id = p.zzp_id
     WHERE u.id = ?`, urenstaatId);
  if (!u || u.status !== 'goedgekeurd') throw new InvoiceError('Alleen goedgekeurde uren kunnen worden gefactureerd.');
  if (db.get('SELECT 1 FROM factuurregels WHERE urenstaat_id = ?', urenstaatId)) {
    throw new InvoiceError('Deze urenstaat is al gefactureerd.');
  }
  const minuten = db.get('SELECT COALESCE(SUM(minuten), 0) AS m FROM uren WHERE urenstaat_id = ?', urenstaatId).m;
  const zzp = db.get('SELECT * FROM zzpers WHERE id = ?', u.zzp_id);
  const plaatsing = db.get('SELECT * FROM plaatsingen WHERE id = ?', u.plaatsing_id);
  const wk = weekNumber(u.week);
  const project = u.projectnummer ? `${u.project_naam} (${u.projectnummer})` : u.project_naam;
  const vandaag = today();

  // ---- inkoop: zzp'er -> RKS ----
  const regelingIn = inkoopRegeling(plaatsing, zzp);
  const selfbilling = Boolean(zzp.selfbilling_akkoord_op);
  const inkoopId = db.run(`
    INSERT INTO facturen (soort, status, zzp_id, week, btw_regeling, selfbilling, nummer, factuurdatum, vervaldatum, public_token)
    VALUES ('inkoop', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    selfbilling ? 'definitief' : 'wacht_op_factuur',
    zzp.id, u.week, regelingIn, selfbilling ? 1 : 0,
    selfbilling ? nextSelfBillingNumber(db, zzp) : null,
    selfbilling ? vandaag : null,
    selfbilling ? addDays(vandaag, zzp.betaaltermijn_dagen) : null,
    token()).id;
  db.run(`INSERT INTO factuurregels (factuur_id, urenstaat_id, omschrijving, minuten, tarief_cents, bedrag_cents)
          VALUES (?, ?, ?, ?, ?, ?)`,
    inkoopId, urenstaatId,
    `${u.functie || 'Werkzaamheden'} project ${project}, week ${wk}: ${hours(minuten)} uur`,
    minuten, u.inkoop_cents, lineAmount(minuten, u.inkoop_cents));
  recalc(db, inkoopId);

  // ---- verkoop: RKS -> klant, verzameld per klant, week en btw-regeling ----
  let verkoop = db.get(`SELECT id FROM facturen WHERE soort = 'verkoop' AND status = 'concept'
                          AND klant_id = ? AND week = ? AND btw_regeling = ?`, u.klant_id, u.week, u.verkoop_btw);
  if (!verkoop) {
    verkoop = { id: db.run(`INSERT INTO facturen (soort, status, klant_id, week, btw_regeling, public_token)
                            VALUES ('verkoop', 'concept', ?, ?, ?, ?)`, u.klant_id, u.week, u.verkoop_btw, token()).id };
  }
  db.run(`INSERT INTO factuurregels (factuur_id, urenstaat_id, omschrijving, minuten, tarief_cents, bedrag_cents)
          VALUES (?, ?, ?, ?, ?, ?)`,
    verkoop.id, urenstaatId,
    `${u.functie || 'Inzet vakman'} ${u.zzp_naam}, project ${project}, week ${wk}`,
    minuten, u.verkoop_cents, lineAmount(minuten, u.verkoop_cents));
  recalc(db, verkoop.id);

  db.audit(wie, 'facturen aangemaakt', 'urenstaat', urenstaatId, `inkoop #${inkoopId}, verkoop #${verkoop.id}`);
  return { inkoopId, verkoopId: verkoop.id };
}

// Wat ontbreekt er om een verkoopfactuur definitief te maken?
export function missingForSales(db, factuurId) {
  const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
  const k = db.get('SELECT * FROM klanten WHERE id = ?', f.klant_id);
  const s = db.settings();
  const miss = [];
  if (!s.bedrijf_kvk) miss.push('KvK-nummer van RKS (instellingen)');
  if (!s.bedrijf_btw_id) miss.push('btw-id van RKS (instellingen)');
  if (!s.bedrijf_iban) miss.push('IBAN van RKS (instellingen)');
  if (!s.bedrijf_adres || !s.bedrijf_plaats) miss.push('adres van RKS (instellingen)');
  if (!k.adres || !k.plaats) miss.push(`adres van ${k.naam}`);
  if (f.btw_regeling === 'verlegd' && !k.btw_id) miss.push(`btw-id van ${k.naam}, verplicht bij btw verlegd`);
  if (!db.get('SELECT 1 FROM factuurregels WHERE factuur_id = ?', factuurId)) miss.push('factuurregels');
  return miss;
}

export function finalizeSales(db, factuurId, wie) {
  return db.tx(() => {
    const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
    if (!f || f.soort !== 'verkoop') throw new InvoiceError('Factuur niet gevonden.');
    if (f.status !== 'concept') throw new InvoiceError('Deze factuur is al definitief.');
    const miss = missingForSales(db, factuurId);
    if (miss.length) throw new InvoiceError(`Vul eerst aan: ${miss.join(', ')}.`);
    const k = db.get('SELECT betaaltermijn_dagen FROM klanten WHERE id = ?', f.klant_id);
    const datum = today();
    const nummer = nextSalesNumber(db, datum.slice(0, 4));
    db.run(`UPDATE facturen SET status = 'definitief', nummer = ?, factuurdatum = ?, vervaldatum = ? WHERE id = ?`,
      nummer, datum, addDays(datum, k.betaaltermijn_dagen), factuurId);
    db.audit(wie, 'factuur definitief', 'factuur', factuurId, nummer);
    return nummer;
  });
}

export function registerSupplierInvoice(db, factuurId, externNummer, wie) {
  return db.tx(() => {
    const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
    if (!f || f.soort !== 'inkoop' || f.status !== 'wacht_op_factuur') throw new InvoiceError('Deze inkoopfactuur wacht niet op een factuur.');
    if (!externNummer) throw new InvoiceError('Vul het factuurnummer van de zzp\'er in.');
    const z = db.get('SELECT betaaltermijn_dagen FROM zzpers WHERE id = ?', f.zzp_id);
    const datum = today();
    db.run(`UPDATE facturen SET status = 'definitief', extern_nummer = ?, factuurdatum = ?, vervaldatum = ? WHERE id = ?`,
      externNummer, datum, addDays(datum, z.betaaltermijn_dagen), factuurId);
    db.audit(wie, 'factuur zzp\'er ontvangen', 'factuur', factuurId, externNummer);
  });
}

export function markSent(db, factuurId, wie) {
  const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
  if (!f || f.status !== 'definitief') throw new InvoiceError('Alleen een definitieve factuur kan als verzonden worden gemarkeerd.');
  db.run(`UPDATE facturen SET status = 'verzonden', verzonden_op = ? WHERE id = ?`, today(), factuurId);
  db.audit(wie, 'factuur verzonden', 'factuur', factuurId);
}

export function markPaid(db, factuurId, datum, wie) {
  const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
  if (!f || !['definitief', 'verzonden'].includes(f.status)) throw new InvoiceError('Alleen een definitieve of verzonden factuur kan betaald worden.');
  db.run(`UPDATE facturen SET status = 'betaald', betaald_op = ? WHERE id = ?`, datum || today(), factuurId);
  db.audit(wie, 'factuur betaald', 'factuur', factuurId, datum || today());
}

// Alles wat nodig is om een factuur te tonen of te exporteren.
export function loadInvoice(db, factuurId) {
  const f = db.get('SELECT * FROM facturen WHERE id = ?', factuurId);
  if (!f) return null;
  const regels = db.all('SELECT * FROM factuurregels WHERE factuur_id = ? ORDER BY id', factuurId);
  const s = db.settings();
  const rks = {
    naam: s.bedrijf_naam, adres: s.bedrijf_adres, postcode: s.bedrijf_postcode, plaats: s.bedrijf_plaats,
    kvk: s.bedrijf_kvk, btw_id: s.bedrijf_btw_id, iban: s.bedrijf_iban, email: s.bedrijf_email, telefoon: s.bedrijf_telefoon,
  };
  let leverancier, afnemer;
  if (f.soort === 'verkoop') {
    const k = db.get('SELECT * FROM klanten WHERE id = ?', f.klant_id);
    leverancier = rks;
    afnemer = { naam: k.naam, adres: k.adres, postcode: k.postcode, plaats: k.plaats, kvk: k.kvk, btw_id: k.btw_id, contact: k.contactpersoon };
  } else {
    const z = db.get('SELECT * FROM zzpers WHERE id = ?', f.zzp_id);
    leverancier = { naam: z.bedrijfsnaam || z.naam, contact: z.naam, adres: z.adres, postcode: z.postcode, plaats: z.plaats, kvk: z.kvk, btw_id: z.btw_id, iban: z.iban };
    afnemer = rks;
  }
  return { ...f, regels, leverancier, afnemer };
}
