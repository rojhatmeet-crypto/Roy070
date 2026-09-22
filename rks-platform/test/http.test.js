// Integratietests via echte HTTP-verzoeken: rollen, afscherming, CSRF en de hele keten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.RKS_TODAY = '2026-09-22';

const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { seed, DEMO_PASSWORD } = await import('../scripts/seed.js');

let server, base, db;

before(async () => {
  db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  const jar = new Map();
  const req = async (path, { method = 'GET', form } = {}) => {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    let body;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const v = pair.slice(i + 1);
      if (/Max-Age=0/.test(c)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), v);
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text };
  };
  const csrfFrom = (html) => (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  return {
    req,
    async login(email) {
      const r = await req('/login', { method: 'POST', form: { email, wachtwoord: DEMO_PASSWORD } });
      assert.equal(r.status, 302, `login ${email}`);
      return r;
    },
    async csrf(path) { return csrfFrom((await req(path)).text); },
  };
}

test('niet ingelogd: doorsturen naar inloggen', async () => {
  const c = client();
  const r = await c.req('/beheer');
  assert.equal(r.status, 302);
  assert.match(r.location, /^\/login/);
});

test('verkeerd wachtwoord geeft geen toegang', async () => {
  const c = client();
  const r = await c.req('/login', { method: 'POST', form: { email: 'beheer@rks.demo', wachtwoord: 'fout' } });
  assert.equal(r.status, 401);
  assert.equal((await c.req('/beheer')).status, 302);
});

test('vakman ziet eigen tarief, niet de verkoopprijs, en geen beheer', async () => {
  const c = client();
  await c.login('mehmet@rks.demo');
  const home = await c.req('/mijn');
  assert.equal(home.status, 200);
  assert.match(home.text, /€ 47,00/);
  assert.doesNotMatch(home.text, /61,00/);
  assert.equal((await c.req('/beheer')).status, 403);
  assert.equal((await c.req('/klant')).status, 403);
  // opdracht van een andere vakman
  const other = db.get(`SELECT p.id FROM plaatsingen p JOIN zzpers z ON z.id = p.zzp_id WHERE z.naam <> 'Mehmet Yilmaz' LIMIT 1`).id;
  assert.equal((await c.req(`/mijn/uren/${other}/2026-W38`)).status, 404);
  // factuur van een andere vakman
  const inv = db.get(`SELECT f.id FROM facturen f JOIN zzpers z ON z.id = f.zzp_id WHERE f.soort = 'inkoop' AND z.naam <> 'Mehmet Yilmaz' LIMIT 1`).id;
  assert.equal((await c.req(`/mijn/facturen/${inv}`)).status, 404);
});

test('opdrachtgever ziet alleen eigen projecten en geen inkooptarieven', async () => {
  const c = client();
  await c.login('uitvoerder@vandijk.demo');
  const home = await c.req('/klant');
  assert.equal(home.status, 200);
  assert.doesNotMatch(home.text, /Kabel &amp; Leiding Oost|Funderingstechniek West/);
  const foreign = db.get(`SELECT u.id FROM urenstaten u JOIN plaatsingen p ON p.id = u.plaatsing_id JOIN projecten pr ON pr.id = p.project_id
                           JOIN klanten k ON k.id = pr.klant_id WHERE k.naam LIKE 'Kabel%' LIMIT 1`).id;
  assert.equal((await c.req(`/klant/uren/${foreign}`)).status, 404);
  const own = db.get(`SELECT u.id FROM urenstaten u JOIN plaatsingen p ON p.id = u.plaatsing_id JOIN projecten pr ON pr.id = p.project_id
                       JOIN klanten k ON k.id = pr.klant_id WHERE k.naam LIKE 'Van Dijk%' AND u.status = 'goedgekeurd' LIMIT 1`).id;
  const detail = await c.req(`/klant/uren/${own}`);
  assert.equal(detail.status, 200);
  assert.doesNotMatch(detail.text, /47,00|Inkoop/);
  const foreignInvoice = db.get(`SELECT f.id FROM facturen f JOIN klanten k ON k.id = f.klant_id WHERE k.naam LIKE 'Kabel%' AND f.status <> 'concept' LIMIT 1`).id;
  assert.equal((await c.req(`/klant/facturen/${foreignInvoice}`)).status, 404);
  assert.equal((await c.req('/beheer')).status, 403);
});

test('POST zonder CSRF-token wordt geweigerd', async () => {
  const c = client();
  await c.login('beheer@rks.demo');
  const r = await c.req('/beheer/instellingen', { method: 'POST', form: { bedrijf_naam: 'Hack' } });
  assert.equal(r.status, 403);
  assert.notEqual(db.setting('bedrijf_naam'), 'Hack');
});

test('hele keten: vakman dient 40 uur in, uitvoerder keurt goed via link, facturen en dashboard kloppen', async () => {
  const zzp = client();
  await zzp.login('mehmet@rks.demo');
  const plaatsing = db.get(`SELECT p.id FROM plaatsingen p JOIN zzpers z ON z.id = p.zzp_id WHERE z.naam = 'Mehmet Yilmaz'`).id;
  const week = '2026-W39';
  const path = `/mijn/uren/${plaatsing}/${week}`;
  const token = await zzp.csrf(path);
  const form = { _csrf: token, actie: 'indienen' };
  for (const d of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']) form[`uren_${d}`] = '8';
  const sub = await zzp.req(path, { method: 'POST', form });
  assert.equal(sub.status, 303);
  const page = await zzp.req(path);
  const link = (page.text.match(/\/goedkeuren\/([A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(link, 'goedkeuringslink op de pagina');

  // uitvoerder zonder account
  const anon = client();
  const view = await anon.req(`/goedkeuren/${link}`);
  assert.equal(view.status, 200);
  assert.match(view.text, /40 uur/);
  assert.doesNotMatch(view.text, /47,00|61,00/);
  const ok = await anon.req(`/goedkeuren/${link}`, { method: 'POST', form: { actie: 'goedkeuren', naam: 'Jeroen Bakker' } });
  assert.equal(ok.status, 303);
  assert.match((await anon.req(`/goedkeuren/${link}`)).text, /Goedgekeurd door Jeroen Bakker/);

  // vergrendeld: opnieuw indienen kan niet
  const again = await zzp.req(path, { method: 'POST', form: { ...form, _csrf: await zzp.csrf(path) } });
  assert.match(again.text, /kunnen niet meer worden gewijzigd/);

  const sheet = db.get('SELECT id FROM urenstaten WHERE plaatsing_id = ? AND week = ?', plaatsing, week).id;
  const inkoop = db.get(`SELECT f.* FROM facturen f JOIN factuurregels r ON r.factuur_id = f.id WHERE r.urenstaat_id = ? AND f.soort = 'inkoop'`, sheet);
  const verkoopRegel = db.get(`SELECT r.* FROM factuurregels r JOIN facturen f ON f.id = r.factuur_id WHERE r.urenstaat_id = ? AND f.soort = 'verkoop'`, sheet);
  assert.equal(inkoop.subtotaal_cents, 188000);
  assert.equal(inkoop.selfbilling, 1);
  assert.equal(verkoopRegel.bedrag_cents, 244000);

  const admin = client();
  await admin.login('beheer@rks.demo');
  const dash = await admin.req(`/beheer?week=${week}`);
  assert.equal(dash.status, 200);
  assert.match(dash.text, /€ 560/);
});

test('uitnodiging: account activeren met eigen wachtwoord', async () => {
  const admin = client();
  await admin.login('beheer@rks.demo');
  const zzp = db.get(`SELECT id FROM zzpers WHERE naam = 'Kevin Smit'`).id;
  const r = await admin.req(`/beheer/zzpers/${zzp}/uitnodigen`, { method: 'POST', form: { _csrf: await admin.csrf(`/beheer/zzpers/${zzp}`) } });
  assert.equal(r.status, 200);
  const invite = (r.text.match(/\/uitnodiging\/([A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(invite);
  const kevin = client();
  assert.equal((await kevin.req(`/uitnodiging/${invite}`)).status, 200);
  const short = await kevin.req(`/uitnodiging/${invite}`, { method: 'POST', form: { wachtwoord: 'kort', herhaal: 'kort' } });
  assert.match(short.text, /minimaal 10 tekens/);
  const done = await kevin.req(`/uitnodiging/${invite}`, { method: 'POST', form: { wachtwoord: 'een-goed-wachtwoord', herhaal: 'een-goed-wachtwoord' } });
  assert.equal(done.status, 302);
  assert.equal(done.location, '/mijn');
  assert.equal((await kevin.req('/mijn')).status, 200);
  assert.equal((await client().req(`/uitnodiging/${invite}`)).status, 404, 'link is eenmalig');
});

test('installatiepagina is dicht zodra er een beheerder is', async () => {
  const r = await client().req('/setup');
  assert.equal(r.status, 302);
});

test('publieke factuurlink toont geen concepten', async () => {
  const concept = db.get(`SELECT public_token FROM facturen WHERE status = 'concept' LIMIT 1`).public_token;
  assert.equal((await client().req(`/factuur/${concept}`)).status, 404);
  const sent = db.get(`SELECT public_token, nummer FROM facturen WHERE soort = 'verkoop' AND status = 'verzonden' LIMIT 1`);
  const r = await client().req(`/factuur/${sent.public_token}`);
  assert.equal(r.status, 200);
  assert.match(r.text, new RegExp(sent.nummer));
  const ubl = await client().req(`/factuur/${sent.public_token}/ubl`);
  assert.match(ubl.text, /<Invoice xmlns=/);
});

test('inkooplijst toont de naam van de vakman, ook zonder bedrijfsnaam', async () => {
  const admin = client();
  await admin.login('beheer@rks.demo');
  const r = await admin.req('/beheer/facturen?soort=inkoop&filter=wacht');
  assert.equal(r.status, 200);
  assert.match(r.text, /Tom Jansen/);
  const csv = await admin.req('/beheer/facturen/export.csv?soort=inkoop&filter=wacht');
  assert.match(csv.text, /Tom Jansen/);
});

test('menu markeert de pagina waar je bent', async () => {
  const admin = client();
  await admin.login('beheer@rks.demo');
  const current = async (path) => ((await admin.req(path)).text.match(/<nav class="app-nav"[\s\S]*?<\/nav>/)[0].match(/aria-current="page">([^<]+)/) || [])[1];
  assert.equal(await current('/beheer'), 'Dashboard');
  assert.equal(await current('/beheer/facturen?soort=inkoop'), 'Facturen');
  assert.equal(await current('/beheer/zzpers'), 'Zzp&#39;ers');
});
