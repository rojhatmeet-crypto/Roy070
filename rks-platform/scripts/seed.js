// Vult een lege database met demodata: fictieve klanten, vakmensen, opdrachten,
// acht weken uren en facturen. Alleen voor demo en testen, nooit in productie.
//
//   npm run seed            (weigert als er al gegevens zijn)
//   npm run seed -- --force (wist eerst alles)
import { openDb } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import * as ts from '../src/domain/timesheets.js';
import * as inv from '../src/domain/invoices.js';
import { today, isoWeekOf, shiftWeek, weekDays, addDays } from '../src/util.js';

export const DEMO_PASSWORD = 'demo-wachtwoord-2026';

export function seed(db, { force = false } = {}) {
  const hasData = db.get('SELECT COUNT(*) AS n FROM users').n > 0;
  if (hasData && !force) throw new Error('De database bevat al gegevens. Gebruik --force om alles te wissen.');
  if (force) {
    db.exec(`DELETE FROM factuurregels; DELETE FROM facturen; DELETE FROM uren; DELETE FROM urenstaten; DELETE FROM sessions;
             DELETE FROM users; DELETE FROM plaatsingen; DELETE FROM certificaten; DELETE FROM projecten; DELETE FROM zzpers;
             DELETE FROM klanten; DELETE FROM audit_log; DELETE FROM settings;`);
    db.setSetting('factuur_prefix', 'RKS');
    db.setSetting('factuur_volgnummer', '0');
    db.setSetting('factuur_jaar', '');
  }

  const settings = {
    bedrijf_naam: 'RKS Infra', bedrijf_adres: 'Voorbeeldstraat 1 (demo)', bedrijf_postcode: '2500 AA', bedrijf_plaats: 'Den Haag',
    bedrijf_kvk: '12345678', bedrijf_btw_id: 'NL000000000B01', bedrijf_iban: 'NL00 BANK 0000 0000 00', bedrijf_email: 'info@example.com', bedrijf_telefoon: '06 00 00 00 00',
  };
  for (const [k, v] of Object.entries(settings)) db.setSetting(k, v);

  const pw = hashPassword(DEMO_PASSWORD);
  db.run(`INSERT INTO users (email, naam, rol, password_hash) VALUES ('beheer@rks.demo', 'Beheer RKS', 'admin', ?)`, pw);

  // ---------- klanten en projecten ----------
  const klant = (naam, plaats, contact, projects) => {
    const id = db.run(`INSERT INTO klanten (naam, contactpersoon, email, adres, postcode, plaats, kvk, btw_id, betaaltermijn_dagen)
      VALUES (?, ?, ?, 'Industrieweg 10', '1234 AB', ?, '87654321', 'NL111111111B01', 30)`, naam, contact, `facturen@${plaats.toLowerCase()}.demo`, plaats).id;
    return { id, projects: projects.map(([p, nr]) => db.run(`INSERT INTO projecten (klant_id, naam, projectnummer, locatie, verkoop_btw) VALUES (?, ?, ?, ?, 'verlegd')`, id, p, nr, plaats).id) };
  };
  const vanDijk = klant('Van Dijk Infra (demo)', 'Utrecht', 'Jeroen Bakker', [['Rioolvervanging Lombok', 'P-2611'], ['Herinrichting Kanaalstraat', 'P-2618']]);
  const kabel = klant('Kabel & Leiding Oost (demo)', 'Apeldoorn', 'Sandra Mulder', [['Glasvezel Zutphen', 'KL-0934'], ['MS-kabeltracé Deventer', 'KL-0941']]);
  const fundering = klant('Funderingstechniek West (demo)', 'Rotterdam', 'Marco de Wit', [['Damwand kade Schiedam', 'FW-117'], ['Heiwerk nieuwbouw Delft', 'FW-121']]);

  // ---------- vakmensen en opdrachten ----------
  const vakmensen = [
    ['Mehmet Yilmaz', 'Yilmaz Infra', 'Rioleur', 4700, 6100, vanDijk.projects[0], 'Jeroen Bakker', true, false, 200],
    ['Jan de Boer', '', 'Grondwerker', 4200, 5200, vanDijk.projects[0], 'Jeroen Bakker', true, false, 400],
    ['Kevin Smit', 'Smit Grondwerk', 'Allround grondwerker', 4500, 5800, vanDijk.projects[1], 'Ruud Peters', true, false, 90],
    ['Ahmet Kaya', 'Kaya Leidingwerk', 'Leidingmonteur', 5000, 6500, vanDijk.projects[1], 'Ruud Peters', true, false, 300],
    ['Piotr Wiśniewski', '', 'Grondwerker', 4200, 5300, kabel.projects[0], 'Sandra Mulder', true, true, 25],
    ['Dennis Visser', 'Visser Kabeltechniek', 'Kabelmonteur', 5500, 7000, kabel.projects[1], 'Henk Jansen', true, false, 500],
    ['Youssef El Amrani', '', 'Kabelwerker', 4400, 5700, kabel.projects[0], 'Sandra Mulder', false, false, -10],
    ['Sander Meijer', 'Meijer PE-lastechniek', 'PE-lasser', 6000, 7800, kabel.projects[1], 'Henk Jansen', true, false, 600],
    ['Bram Hendriks', '', 'Heier', 5200, 6700, fundering.projects[1], 'Marco de Wit', true, false, 250],
    ['Rachid Amrani', 'Amrani Funderingen', 'Hulpmachinist', 4600, 6000, fundering.projects[1], 'Marco de Wit', true, false, 180],
    ['Tom Jansen', '', 'Betonwerker', 4500, 5900, fundering.projects[0], 'Lisa de Graaf', false, false, 365],
    ['Erik Lambers', '', 'Grondwerker', 4300, 5500, fundering.projects[0], 'Lisa de Graaf', true, false, 45],
  ];
  const vandaag = today();
  const placements = vakmensen.map(([naam, bedrijf, functie, inkoop, verkoop, projectId, goedkeurder, selfbilling, kor, vcaDagen], i) => {
    const zzpId = db.run(`INSERT INTO zzpers (naam, bedrijfsnaam, email, telefoon, adres, postcode, plaats, kvk, btw_id, iban, btw_regime, selfbilling_akkoord_op)
      VALUES (?, ?, ?, '', 'Dorpsstraat 1', '1000 AA', 'Den Haag', ?, ?, ?, ?, ?)`,
    naam, bedrijf, `${naam.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@rks.demo`, String(70000000 + i * 1111),
    kor ? '' : `NL00000000${String(i).padStart(1, '0')}B0${(i % 9) + 1}`, `NL00 DEMO 0000 0000 ${String(i).padStart(2, '0')}`,
    kor ? 'kor' : 'normaal', selfbilling ? addDays(vandaag, -120) : null).id;
    db.run(`INSERT INTO certificaten (zzp_id, soort, nummer, geldig_tot) VALUES (?, 'VCA Basis', ?, ?)`, zzpId, `VCA-${100200 + i}`, addDays(vandaag, vcaDagen));
    const id = db.run(`INSERT INTO plaatsingen (zzp_id, project_id, functie, opdracht, inkoop_cents, verkoop_cents, inkoop_btw, startdatum,
        modelovereenkomst, contract_getekend_op, goedkeurder_naam, goedkeurder_email, goedkeurder_telefoon)
      VALUES (?, ?, ?, ?, ?, ?, 'verlegd', ?, 'Modelovereenkomst tussenkomst', ?, ?, '', '')`,
    zzpId, projectId, functie, `${functie}swerkzaamheden volgens werkomschrijving project`, inkoop, verkoop, addDays(vandaag, -120),
    i === 6 || i === 10 ? null : addDays(vandaag, -118), goedkeurder).id;
    return { id, zzpId, naam, goedkeurder };
  });

  db.run(`INSERT INTO users (email, naam, rol, zzp_id, password_hash) VALUES ('mehmet@rks.demo', 'Mehmet Yilmaz', 'zzp', ?, ?)`, placements[0].zzpId, pw);
  db.run(`INSERT INTO users (email, naam, rol, klant_id, password_hash) VALUES ('uitvoerder@vandijk.demo', 'Jeroen Bakker', 'klant', ?, ?)`, vanDijk.id, pw);

  // ---------- acht weken uren ----------
  const thisWeek = isoWeekOf(vandaag);
  const weeks = Array.from({ length: 8 }, (_, i) => shiftWeek(thisWeek, i - 8)); // 8 weken tot en met vorige week
  let rnd = 7;
  const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };

  weeks.forEach((week, wi) => {
    const isLast = wi === weeks.length - 1;
    placements.forEach((p, pi) => {
      if (rand() < 0.08 && !isLast) return; // af en toe een week vrij
      const days = weekDays(week).slice(0, 5);
      const items = days.map((datum) => ({ datum, minuten: [480, 480, 480, 510, 450, 420][Math.floor(rand() * 6)], omschrijving: '' }));
      const sheet = ts.findOrCreate(db, p.id, week);
      ts.save(db, sheet.id, items, 'seed');
      ts.submit(db, sheet.id, 'seed');
      if (isLast && pi % 4 === 1) return; // vorige week: een paar wachten nog op goedkeuring
      if (isLast && pi === 6) { ts.reject(db, sheet.id, p.goedkeurder, 'Donderdag was ik er niet, dat was een regendag.', 'goedkeuringslink'); return; }
      ts.approve(db, sheet.id, p.goedkeurder, 'goedkeuringslink');
    });
  });

  // ---------- facturen definitief, verstuurd en deels betaald ----------
  for (const f of db.all(`SELECT id, week FROM facturen WHERE soort = 'verkoop' AND status = 'concept' ORDER BY week, klant_id`)) {
    const age = weeks.indexOf(f.week);
    if (age === weeks.length - 1) continue; // vorige week nog concept
    inv.finalizeSales(db, f.id, 'seed');
    const datum = addDays(weekDays(f.week)[6], 1);
    db.run(`UPDATE facturen SET factuurdatum = ?, vervaldatum = ?, status = 'verzonden', verzonden_op = ? WHERE id = ?`, datum, addDays(datum, 30), datum, f.id);
    if (age <= weeks.length - 5 || (age === weeks.length - 4 && f.id % 2)) {
      db.run(`UPDATE facturen SET status = 'betaald', betaald_op = ? WHERE id = ?`, addDays(datum, 24 + (f.id % 9)), f.id);
    }
  }
  for (const f of db.all(`SELECT id, week, status FROM facturen WHERE soort = 'inkoop'`)) {
    const datum = addDays(weekDays(f.week)[6], 1);
    if (f.status === 'definitief') db.run('UPDATE facturen SET factuurdatum = ?, vervaldatum = ? WHERE id = ?', datum, addDays(datum, 14), f.id);
    if (f.status === 'definitief' && weeks.indexOf(f.week) <= weeks.length - 3) db.run(`UPDATE facturen SET status = 'betaald', betaald_op = ? WHERE id = ?`, addDays(datum, 13), f.id);
  }
  db.run(`UPDATE urenstaten SET ingediend_op = datetime(ingediend_op, '-4 days') WHERE status = 'ingediend'`);
  return { placements: placements.length, weeks: weeks.length };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const db = openDb();
  const out = seed(db, { force: process.argv.includes('--force') });
  console.log(`Demodata klaar: ${out.placements} vakmensen, ${out.weeks} weken.`);
  console.log(`Inloggen met wachtwoord "${DEMO_PASSWORD}":`);
  console.log('  beheer@rks.demo          (RKS, beheer)');
  console.log('  mehmet@rks.demo          (vakman)');
  console.log('  uitvoerder@vandijk.demo  (opdrachtgever)');
}
