import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RKS_TODAY = '2026-09-22';

const { openDb } = await import('../src/db.js');
const ts = await import('../src/domain/timesheets.js');
const inv = await import('../src/domain/invoices.js');
const dash = await import('../src/domain/dashboard.js');
const exp = await import('../src/domain/export.js');
const u = await import('../src/util.js');

function setup({ selfbilling = true, verkoopBtw = 'verlegd', kor = false } = {}) {
  const db = openDb(':memory:');
  const klant = db.run(`INSERT INTO klanten (naam, adres, postcode, plaats, btw_id, betaaltermijn_dagen)
                        VALUES ('Aannemer X', 'Dijk 1', '1234 AB', 'Utrecht', 'NL001234567B01', 30)`).id;
  const project = db.run(`INSERT INTO projecten (klant_id, naam, verkoop_btw) VALUES (?, 'Rioolvervanging Centrum', ?)`, klant, verkoopBtw).id;
  const zzp = db.run(`INSERT INTO zzpers (naam, btw_regime, selfbilling_akkoord_op, iban) VALUES ('Mehmet', ?, ?, 'NL00BANK0123456789')`,
    kor ? 'kor' : 'normaal', selfbilling ? '2026-09-01' : null).id;
  const plaatsing = db.run(`INSERT INTO plaatsingen (zzp_id, project_id, functie, inkoop_cents, verkoop_cents, inkoop_btw)
                            VALUES (?, ?, 'Rioleur', 4700, 6100, 'verlegd')`, zzp, project).id;
  return { db, klant, project, zzp, plaatsing };
}

function fortyHours(db, plaatsing, week = '2026-W38') {
  const sheet = ts.findOrCreate(db, plaatsing, week);
  const days = u.weekDays(week);
  ts.save(db, sheet.id, days.slice(0, 5).map((datum) => ({ datum, minuten: 480, omschrijving: '' })), 'test');
  return sheet.id;
}

function fillSettings(db) {
  for (const [k, v] of Object.entries({ bedrijf_kvk: '12345678', bedrijf_btw_id: 'NL009876543B01', bedrijf_iban: 'NL00RABO0123456789', bedrijf_adres: 'Straat 1', bedrijf_plaats: 'Den Haag' })) db.setSetting(k, v);
}

test('uren en bedragen parseren', () => {
  assert.equal(u.parseHours('8'), 480);
  assert.equal(u.parseHours('7,75'), 465);
  assert.equal(u.parseHours('7:30'), 450);
  assert.equal(u.parseHours(''), 0);
  assert.equal(u.parseHours('25'), null);
  assert.equal(u.parseEuro('47'), 4700);
  assert.equal(u.parseEuro('€ 61,50'), 6150);
  assert.equal(u.parseEuro('1.234,56'), 123456);
  assert.equal(u.parseEuro('abc'), null);
  assert.equal(u.lineAmount(2400, 4700), 188000);
});

test('ISO-weken', () => {
  assert.equal(u.isoWeekOf('2026-09-22'), '2026-W39');
  assert.equal(u.isoWeekOf('2026-01-01'), '2026-W01');
  assert.equal(u.isoWeekOf('2027-01-01'), '2026-W53');
  assert.deepEqual(u.weekDays('2026-W38').slice(0, 2), ['2026-09-14', '2026-09-15']);
  assert.equal(u.shiftWeek('2026-W01', -1), '2025-W52');
  assert.ok(u.isValidWeek('2026-W53'));
  assert.ok(!u.isValidWeek('2025-W53'));
});

test('voorbeeld Mehmet: 40 uur × €47 inkoop / €61 verkoop', () => {
  const { db, plaatsing } = setup();
  const id = fortyHours(db, plaatsing);
  assert.equal(ts.totalMinutes(db, id), 2400);
  const tok = ts.submit(db, id, 'Mehmet');
  assert.ok(tok.length > 20);
  const { inkoopId, verkoopId } = ts.approve(db, id, 'Uitvoerder Jan', 'link');

  const inkoop = inv.loadInvoice(db, inkoopId);
  assert.equal(inkoop.subtotaal_cents, 188000);
  assert.equal(inkoop.btw_cents, 0);
  assert.equal(inkoop.status, 'definitief');
  assert.equal(inkoop.selfbilling, 1);
  assert.match(inkoop.nummer, /^SB-\d{3}-0001$/);

  const verkoop = inv.loadInvoice(db, verkoopId);
  assert.equal(verkoop.subtotaal_cents, 244000);
  assert.equal(verkoop.status, 'concept');
  assert.equal(verkoop.nummer, null);

  const stats = dash.periodStats(db, ['2026-W38']);
  assert.equal(stats.omzet, 244000);
  assert.equal(stats.kosten, 188000);
  assert.equal(stats.marge, 56000);
  assert.equal(stats.margePerUur, 1400);
  assert.equal(stats.zzpers, 1);
});

test('btw 21% op de verkoopfactuur', () => {
  const { db, plaatsing } = setup({ verkoopBtw: '21' });
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  const { verkoopId } = ts.approve(db, id, 'Jan', 'link');
  const f = inv.loadInvoice(db, verkoopId);
  assert.equal(f.btw_cents, 51240);
  assert.equal(f.totaal_cents, 295240);
});

test('KOR: geen btw op de inkoopfactuur', () => {
  const { db, plaatsing } = setup({ kor: true });
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  const { inkoopId } = ts.approve(db, id, 'Jan', 'link');
  assert.equal(inv.loadInvoice(db, inkoopId).btw_regeling, 'geen');
});

test('zonder self-billing akkoord wacht de inkoop op een eigen factuur', () => {
  const { db, plaatsing } = setup({ selfbilling: false });
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  const { inkoopId } = ts.approve(db, id, 'Jan', 'link');
  let f = inv.loadInvoice(db, inkoopId);
  assert.equal(f.status, 'wacht_op_factuur');
  assert.equal(f.nummer, null);
  inv.registerSupplierInvoice(db, inkoopId, '2026-017', 'admin');
  f = inv.loadInvoice(db, inkoopId);
  assert.equal(f.status, 'definitief');
  assert.equal(f.extern_nummer, '2026-017');
  assert.equal(f.vervaldatum, '2026-10-06');
});

test('ingediende uren zijn vergrendeld; afkeuren maakt ze weer bewerkbaar', () => {
  const { db, plaatsing } = setup();
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  assert.throws(() => ts.save(db, id, [{ datum: '2026-09-14', minuten: 60 }], 'x'), /al ingediend/);
  assert.throws(() => ts.reject(db, id, 'Jan', '', 'link'), /Geef aan/);
  ts.reject(db, id, 'Jan', 'Vrijdag was 6 uur', 'link');
  ts.save(db, id, [{ datum: '2026-09-18', minuten: 360, omschrijving: '' }], 'Mehmet');
  assert.equal(ts.totalMinutes(db, id), 4 * 480 + 360);
  ts.submit(db, id, 'Mehmet');
  ts.approve(db, id, 'Jan', 'link');
  assert.throws(() => ts.approve(db, id, 'Jan', 'link'), /wachten niet/);
  assert.throws(() => ts.save(db, id, [{ datum: '2026-09-14', minuten: 60 }], 'x'), /al ingediend/);
});

test('alleen hele kwartieren en dagen binnen de week', () => {
  const { db, plaatsing } = setup();
  const sheet = ts.findOrCreate(db, plaatsing, '2026-W38');
  assert.throws(() => ts.save(db, sheet.id, [{ datum: '2026-09-14', minuten: 50 }], 'x'), /kwartier/);
  assert.throws(() => ts.save(db, sheet.id, [{ datum: '2026-09-21', minuten: 60 }], 'x'), /buiten deze week/);
  assert.throws(() => ts.submit(db, sheet.id, 'x'), /Vul eerst uren in/);
});

test('tarieven worden vastgelegd bij goedkeuring', () => {
  const { db, plaatsing } = setup();
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  ts.approve(db, id, 'Jan', 'link');
  db.run('UPDATE plaatsingen SET inkoop_cents = 5000, verkoop_cents = 7000 WHERE id = ?', plaatsing);
  assert.equal(dash.periodStats(db, ['2026-W38']).marge, 56000);
});

test('verkoopfacturen: verzamelen per klant en week, nummering zonder gaten', () => {
  const { db, plaatsing, project } = setup();
  const zzp2 = db.run(`INSERT INTO zzpers (naam, selfbilling_akkoord_op) VALUES ('Piet', '2026-09-01')`).id;
  const p2 = db.run(`INSERT INTO plaatsingen (zzp_id, project_id, functie, inkoop_cents, verkoop_cents) VALUES (?, ?, 'Grondwerker', 4500, 5800)`, zzp2, project).id;
  const a = fortyHours(db, plaatsing);
  const b = fortyHours(db, p2);
  ts.submit(db, a, 'Mehmet'); ts.submit(db, b, 'Piet');
  const r1 = ts.approve(db, a, 'Jan', 'link');
  const r2 = ts.approve(db, b, 'Jan', 'link');
  assert.equal(r1.verkoopId, r2.verkoopId);
  const f = inv.loadInvoice(db, r1.verkoopId);
  assert.equal(f.regels.length, 2);
  assert.equal(f.subtotaal_cents, 244000 + 232000);

  assert.throws(() => inv.finalizeSales(db, r1.verkoopId, 'admin'), /KvK-nummer van RKS/);
  fillSettings(db);
  assert.equal(inv.finalizeSales(db, r1.verkoopId, 'admin'), 'RKS-2026-0001');
  assert.throws(() => inv.finalizeSales(db, r1.verkoopId, 'admin'), /al definitief/);
  const after = inv.loadInvoice(db, r1.verkoopId);
  assert.equal(after.vervaldatum, '2026-10-22');

  // volgende week: nieuwe conceptfactuur en volgend nummer
  const c = fortyHours(db, plaatsing, '2026-W39');
  ts.submit(db, c, 'Mehmet');
  const r3 = ts.approve(db, c, 'Jan', 'link');
  assert.notEqual(r3.verkoopId, r1.verkoopId);
  assert.equal(inv.finalizeSales(db, r3.verkoopId, 'admin'), 'RKS-2026-0002');
});

test('btw verlegd vereist het btw-id van de klant', () => {
  const { db, plaatsing, klant } = setup();
  fillSettings(db);
  db.run(`UPDATE klanten SET btw_id = '' WHERE id = ?`, klant);
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  const { verkoopId } = ts.approve(db, id, 'Jan', 'link');
  assert.throws(() => inv.finalizeSales(db, verkoopId, 'admin'), /btw-id van Aannemer X/);
});

test('betaalstatus en openstaande posten', () => {
  const { db, plaatsing } = setup();
  fillSettings(db);
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  const { verkoopId, inkoopId } = ts.approve(db, id, 'Jan', 'link');
  inv.finalizeSales(db, verkoopId, 'admin');
  inv.markSent(db, verkoopId, 'admin');
  let r = dash.receivables(db);
  assert.equal(r.debiteuren, 244000);
  assert.equal(r.crediteuren, 188000);
  inv.markPaid(db, verkoopId, '2026-10-01', 'admin');
  inv.markPaid(db, inkoopId, '2026-10-01', 'admin');
  r = dash.receivables(db);
  assert.equal(r.debiteuren, 0);
  assert.equal(r.crediteuren, 0);
});

test('export: UBL en CSV', () => {
  const { db, plaatsing } = setup();
  fillSettings(db);
  const id = fortyHours(db, plaatsing);
  ts.submit(db, id, 'Mehmet');
  const { verkoopId, inkoopId } = ts.approve(db, id, 'Jan', 'link');
  inv.finalizeSales(db, verkoopId, 'admin');
  const xml = exp.invoiceUbl(inv.loadInvoice(db, verkoopId));
  assert.match(xml, /<cbc:ID>RKS-2026-0001<\/cbc:ID>/);
  assert.match(xml, /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>/);
  assert.match(xml, /<cbc:ID>AE<\/cbc:ID>/);
  assert.match(xml, /<cbc:InvoicedQuantity unitCode="HUR">40.00<\/cbc:InvoicedQuantity>/);
  assert.match(xml, /<cbc:PayableAmount currencyID="EUR">2440.00<\/cbc:PayableAmount>/);
  const sb = exp.invoiceUbl(inv.loadInvoice(db, inkoopId));
  assert.match(sb, /<cbc:InvoiceTypeCode>389<\/cbc:InvoiceTypeCode>/);
  assert.match(sb, /Factuur uitgereikt door afnemer/);
  // tags in balans
  for (const doc of [xml, sb]) {
    const open = (doc.match(/<(cac|cbc):[A-Za-z]+[ >]/g) || []).length;
    const close = (doc.match(/<\/(cac|cbc):[A-Za-z]+>/g) || []).length;
    assert.equal(open, close);
  }
  const csv = exp.invoicesCsv([{ soort: 'verkoop', nummer: 'RKS-1', status: 'definitief', week: '2026-W38', relatie: '=HYPERLINK("x")', btw_regeling: '21', subtotaal_cents: 100, btw_cents: 21, totaal_cents: 121, selfbilling: 0 }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /1,00;0,21;1,21/);
});

test('signalen: verlopen VCA en ontbrekende overeenkomst', () => {
  const { db, zzp } = setup();
  db.run(`INSERT INTO certificaten (zzp_id, soort, geldig_tot) VALUES (?, 'VCA Basis', '2026-09-01')`, zzp);
  db.run(`INSERT INTO certificaten (zzp_id, soort, geldig_tot) VALUES (?, 'BEI-LS', '2026-10-10')`, zzp);
  const a = dash.alerts(db);
  assert.ok(a.some((x) => x.ernst === 'crit' && /VCA Basis van Mehmet is verlopen/.test(x.tekst)));
  assert.ok(a.some((x) => x.ernst === 'warn' && /BEI-LS van Mehmet verloopt/.test(x.tekst)));
  assert.ok(a.some((x) => /Geen getekende overeenkomst/.test(x.tekst)));
});
