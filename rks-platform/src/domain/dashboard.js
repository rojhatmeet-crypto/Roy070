// Cijfers voor het dashboard. Alles gebaseerd op goedgekeurde uren met de
// tarieven zoals die bij goedkeuring zijn vastgelegd.
import { lineAmount, today, addDays, shiftWeek, isoWeekOf } from '../util.js';

function approvedRows(db, weeks) {
  if (!weeks.length) return [];
  const marks = weeks.map(() => '?').join(',');
  return db.all(`
    SELECT u.id, u.week, u.inkoop_cents, u.verkoop_cents, p.zzp_id, pr.klant_id, k.naam AS klant_naam, z.naam AS zzp_naam,
           (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
      FROM urenstaten u
      JOIN plaatsingen p ON p.id = u.plaatsing_id
      JOIN projecten pr ON pr.id = p.project_id
      JOIN klanten k ON k.id = pr.klant_id
      JOIN zzpers z ON z.id = p.zzp_id
     WHERE u.status = 'goedgekeurd' AND u.week IN (${marks})`, ...weeks);
}

function summarize(rows) {
  let minuten = 0, omzet = 0, kosten = 0;
  const zzps = new Set();
  for (const r of rows) {
    minuten += r.minuten;
    omzet += lineAmount(r.minuten, r.verkoop_cents);
    kosten += lineAmount(r.minuten, r.inkoop_cents);
    zzps.add(r.zzp_id);
  }
  const marge = omzet - kosten;
  return { minuten, omzet, kosten, marge, zzpers: zzps.size, margePerUur: minuten ? Math.round((marge * 60) / minuten) : 0 };
}

export function periodStats(db, weeks) {
  return summarize(approvedRows(db, weeks));
}

export function breakdown(db, weeks, key) {
  const groups = new Map();
  for (const r of approvedRows(db, weeks)) {
    const id = r[key === 'klant' ? 'klant_id' : 'zzp_id'];
    const naam = key === 'klant' ? r.klant_naam : r.zzp_naam;
    if (!groups.has(id)) groups.set(id, { id, naam, rows: [] });
    groups.get(id).rows.push(r);
  }
  return [...groups.values()].map((g) => ({ id: g.id, naam: g.naam, ...summarize(g.rows) })).sort((a, b) => b.marge - a.marge);
}

export function weeklySeries(db, endWeek, n = 8) {
  const weeks = Array.from({ length: n }, (_, i) => shiftWeek(endWeek, i - (n - 1)));
  return weeks.map((w) => ({ week: w, ...periodStats(db, [w]) }));
}

export function receivables(db) {
  const vandaag = today();
  const open = db.all(`SELECT totaal_cents, vervaldatum FROM facturen WHERE soort = 'verkoop' AND status IN ('definitief', 'verzonden')`);
  const payables = db.all(`SELECT totaal_cents, status FROM facturen WHERE soort = 'inkoop' AND status IN ('definitief', 'verzonden', 'wacht_op_factuur')`);
  const concepts = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(totaal_cents), 0) AS s FROM facturen WHERE soort = 'verkoop' AND status = 'concept'`);
  return {
    debiteuren: open.reduce((a, f) => a + f.totaal_cents, 0),
    debiteurenAantal: open.length,
    teLaat: open.filter((f) => f.vervaldatum && f.vervaldatum < vandaag).reduce((a, f) => a + f.totaal_cents, 0),
    teLaatAantal: open.filter((f) => f.vervaldatum && f.vervaldatum < vandaag).length,
    crediteuren: payables.reduce((a, f) => a + f.totaal_cents, 0),
    crediteurenAantal: payables.length,
    conceptAantal: concepts.n,
    conceptBedrag: concepts.s,
  };
}

// Signalen die aandacht vragen, gesorteerd op ernst.
export function alerts(db) {
  const vandaag = today();
  const binnen30 = addDays(vandaag, 30);
  const out = [];

  for (const c of db.all(`
      SELECT c.soort, c.geldig_tot, z.id AS zzp_id, z.naam FROM certificaten c JOIN zzpers z ON z.id = c.zzp_id
       WHERE z.actief = 1 AND c.geldig_tot IS NOT NULL AND c.geldig_tot <= ? ORDER BY c.geldig_tot`, binnen30)) {
    const verlopen = c.geldig_tot < vandaag;
    out.push({ ernst: verlopen ? 'crit' : 'warn', tekst: `${c.soort} van ${c.naam} ${verlopen ? 'is verlopen' : 'verloopt'} op`, datum: c.geldig_tot, link: `/beheer/zzpers/${c.zzp_id}` });
  }
  const oud = db.all(`SELECT u.id, u.week, z.naam, k.naam AS klant FROM urenstaten u
      JOIN plaatsingen p ON p.id = u.plaatsing_id JOIN zzpers z ON z.id = p.zzp_id
      JOIN projecten pr ON pr.id = p.project_id JOIN klanten k ON k.id = pr.klant_id
     WHERE u.status = 'ingediend' AND date(u.ingediend_op) <= date(?)`, addDays(vandaag, -3));
  for (const u of oud) out.push({ ernst: 'warn', tekst: `Uren van ${u.naam} bij ${u.klant} wachten al meer dan 3 dagen op goedkeuring`, link: `/beheer/uren/${u.id}` });

  for (const p of db.all(`SELECT p.id, z.naam, pr.naam AS project FROM plaatsingen p JOIN zzpers z ON z.id = p.zzp_id
      JOIN projecten pr ON pr.id = p.project_id WHERE p.actief = 1 AND p.contract_getekend_op IS NULL`)) {
    out.push({ ernst: 'warn', tekst: `Geen getekende overeenkomst vastgelegd voor ${p.naam} op ${p.project}`, link: `/beheer/plaatsingen/${p.id}` });
  }
  for (const z of db.all(`SELECT DISTINCT z.id, z.naam FROM zzpers z JOIN plaatsingen p ON p.zzp_id = z.id
      WHERE p.actief = 1 AND z.selfbilling_akkoord_op IS NULL`)) {
    out.push({ ernst: 'info', tekst: `${z.naam} heeft geen akkoord voor self-billing. Inkoopfacturen wachten op een eigen factuur.`, link: `/beheer/zzpers/${z.id}` });
  }
  const r = receivables(db);
  if (r.teLaatAantal) out.push({ ernst: 'crit', tekst: `${r.teLaatAantal} verkoopfactuur${r.teLaatAantal > 1 ? 'en' : ''} over de vervaldatum`, link: '/beheer/facturen?soort=verkoop&filter=telaat' });
  if (r.conceptAantal) out.push({ ernst: 'info', tekst: `${r.conceptAantal} conceptfactuur${r.conceptAantal > 1 ? 'en' : ''} klaar om definitief te maken`, link: '/beheer/facturen?soort=verkoop&filter=concept' });

  const order = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.ernst] - order[b.ernst]);
}

// Wat RKS moet doen, per soort samengevat. Alleen soorten met een aantal.
export function todo(db) {
  const vandaag = today();
  const binnen30 = addDays(vandaag, 30);
  const count = (sql, ...params) => db.get(sql, ...params).n;
  const r = receivables(db);
  const items = [
    { ernst: 'crit', tekst: 'Facturen te laat betaald', aantal: r.teLaatAantal, link: '/beheer/facturen?soort=verkoop&filter=telaat' },
    { ernst: 'crit', tekst: 'Certificaten verlopen', link: '/beheer/zzpers',
      aantal: count(`SELECT COUNT(*) AS n FROM certificaten c JOIN zzpers z ON z.id = c.zzp_id WHERE z.actief = 1 AND c.geldig_tot < ?`, vandaag) },
    { ernst: 'warn', tekst: 'Uren wachten op goedkeuring', link: '/beheer/uren?status=ingediend',
      aantal: count(`SELECT COUNT(*) AS n FROM urenstaten WHERE status = 'ingediend'`) },
    { ernst: 'warn', tekst: 'Certificaten verlopen binnen 30 dagen', link: '/beheer/zzpers',
      aantal: count(`SELECT COUNT(*) AS n FROM certificaten c JOIN zzpers z ON z.id = c.zzp_id WHERE z.actief = 1 AND c.geldig_tot >= ? AND c.geldig_tot <= ?`, vandaag, binnen30) },
    { ernst: 'warn', tekst: 'Opdrachten zonder getekend contract', link: '/beheer/plaatsingen',
      aantal: count(`SELECT COUNT(*) AS n FROM plaatsingen WHERE actief = 1 AND contract_getekend_op IS NULL`) },
    { ernst: 'info', tekst: 'Conceptfacturen klaar om te versturen', aantal: r.conceptAantal, link: '/beheer/facturen?soort=verkoop&filter=concept' },
    { ernst: 'info', tekst: 'Wachten op factuur van zzp\'er', link: '/beheer/facturen?soort=inkoop&filter=wacht',
      aantal: count(`SELECT COUNT(*) AS n FROM facturen WHERE soort = 'inkoop' AND status = 'wacht_op_factuur'`) },
  ];
  return items.filter((i) => i.aantal > 0);
}

export const currentWeek = () => isoWeekOf(today());
