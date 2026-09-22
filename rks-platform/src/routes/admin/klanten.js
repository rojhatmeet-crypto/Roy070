import { html, raw } from '../../views/html.js';
import { pageHead, field, select, csrfField, shareButtons, emptyState } from '../../views/components.js';
import { createInvite } from '../../auth.js';
import { euro, toInt, clean, fmtDate } from '../../util.js';
import { FormError, attempt, baseUrl } from '../shared.js';

const FIELDS = ['naam', 'contactpersoon', 'email', 'telefoon', 'adres', 'postcode', 'plaats', 'kvk', 'btw_id'];
const BTW_VERKOOP = [['verlegd', 'Btw verlegd (onderaanneming of inlening in de bouw)'], ['21', 'Btw 21%']];

function read(body) {
  const v = {};
  for (const f of FIELDS) v[f] = clean(body[f], 200);
  v.email = v.email.toLowerCase();
  v.btw_id = v.btw_id.toUpperCase().replace(/\s+/g, '');
  v.betaaltermijn_dagen = Math.min(120, Math.max(0, toInt(body.betaaltermijn_dagen) ?? 30));
  v.actief = body.actief === '1' ? 1 : 0;
  if (!v.naam) throw new FormError('Vul de bedrijfsnaam in.');
  if (v.kvk && !/^\d{8}$/.test(v.kvk)) throw new FormError('Een KvK-nummer heeft 8 cijfers.');
  return v;
}

function readProject(body) {
  const v = { naam: clean(body.naam, 150), projectnummer: clean(body.projectnummer, 60), locatie: clean(body.locatie, 150),
    verkoop_btw: body.verkoop_btw === '21' ? '21' : 'verlegd', actief: body.actief === '1' ? 1 : 0 };
  if (!v.naam) throw new FormError('Vul de projectnaam in.');
  return v;
}

export function register(r, db) {
  r.get('/klanten', (req, res) => {
    const rows = db.all(`SELECT k.*, (SELECT COUNT(*) FROM projecten p WHERE p.klant_id = k.id AND p.actief = 1) AS projecten,
      (SELECT COALESCE(SUM(totaal_cents), 0) FROM facturen f WHERE f.klant_id = k.id AND f.status IN ('definitief', 'verzonden')) AS open
      FROM klanten k ORDER BY k.actief DESC, k.naam`);
    res.page('Klanten', html`
      ${pageHead({ title: 'Klanten', actions: html`<a class="btn btn--primary" href="/beheer/klanten/nieuw">Nieuwe klant</a>` })}
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Klant</th><th>Contactpersoon</th><th class="num">Projecten</th><th class="num">Openstaand</th></tr></thead>
        <tbody>${rows.map((k) => html`<tr class="${k.actief ? '' : 'is-muted'}"><td><a href="/beheer/klanten/${k.id}">${k.naam}</a><p class="muted small">${k.plaats}</p></td>
          <td>${k.contactpersoon}<p class="muted small">${k.telefoon}</p></td><td class="num">${k.projecten}</td><td class="num">${euro(k.open)}</td></tr>`)}</tbody>
      </table></div>` : emptyState('Nog geen klanten.')}`);
  });

  const page = (req, res, v, { id = null, error = '', invite = '' } = {}) => {
    const projects = id ? db.all('SELECT * FROM projecten WHERE klant_id = ? ORDER BY actief DESC, naam', id) : [];
    const users = id ? db.all('SELECT * FROM users WHERE klant_id = ? ORDER BY naam', id) : [];
    res.page(id ? v.naam : 'Nieuwe klant', html`
      ${pageHead({ eyebrow: 'Klant', title: id ? v.naam : 'Nieuwe klant' })}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      ${invite ? html`<div class="panel panel--good"><h2>Uitnodiging klaar</h2><p>Met deze link maakt de opdrachtgever een account aan om uren goed te keuren en facturen te zien. 7 dagen geldig.</p>
        ${shareButtons({ url: invite.url, text: `Beste ${invite.naam}, via deze link maakt u uw account aan in het portaal van RKS Infra:`, email: invite.email, subject: 'Uw account bij RKS Infra' })}</div>` : ''}
      <div class="grid-2 grid-2--wide">
        <form method="post" action="${id ? `/beheer/klanten/${id}` : '/beheer/klanten/nieuw'}" class="card form-grid">
          ${csrfField(req.csrf)}
          <fieldset><legend>Bedrijf</legend>
            ${field({ label: 'Bedrijfsnaam', name: 'naam', value: v.naam, required: true })}
            ${field({ label: 'Adres', name: 'adres', value: v.adres })}
            <div class="row-2">${field({ label: 'Postcode', name: 'postcode', value: v.postcode })}${field({ label: 'Plaats', name: 'plaats', value: v.plaats })}</div>
            <div class="row-2">${field({ label: 'KvK-nummer', name: 'kvk', value: v.kvk, inputmode: 'numeric' })}${field({ label: 'Btw-id', name: 'btw_id', value: v.btw_id, hint: 'Verplicht op facturen met btw verlegd.' })}</div>
          </fieldset>
          <fieldset><legend>Contact en betaling</legend>
            ${field({ label: 'Contactpersoon', name: 'contactpersoon', value: v.contactpersoon })}
            <div class="row-2">${field({ label: 'Telefoon', name: 'telefoon', type: 'tel', value: v.telefoon })}${field({ label: 'E-mail voor facturen', name: 'email', type: 'email', value: v.email })}</div>
            ${field({ label: 'Betaaltermijn (dagen)', name: 'betaaltermijn_dagen', type: 'number', value: v.betaaltermijn_dagen, min: 0, max: 120, required: true })}
          </fieldset>
          <label class="check"><input type="checkbox" name="actief" value="1"${v.actief ? raw(' checked') : ''}> Actief</label>
          <div class="form-actions"><button class="btn btn--primary" type="submit">Opslaan</button><a class="btn" href="/beheer/klanten">Annuleren</a></div>
        </form>
        ${id ? html`<div class="stack">
          <div class="card"><h2>Projecten</h2>
            ${projects.length ? html`<ul class="list">${projects.map((p) => html`<li><a href="/beheer/projecten/${p.id}">${p.naam}</a><span class="muted small">${p.verkoop_btw === 'verlegd' ? 'Btw verlegd' : 'Btw 21%'}${p.actief ? '' : ' · afgesloten'}</span></li>`)}</ul>` : html`<p class="muted">Nog geen projecten.</p>`}
            <form method="post" action="/beheer/klanten/${id}/projecten" class="stack">${csrfField(req.csrf)}
              ${field({ label: 'Nieuw project', name: 'naam', value: '', required: true, placeholder: 'Bijvoorbeeld: Rioolvervanging Centrum' })}
              <div class="row-2">${field({ label: 'Projectnummer', name: 'projectnummer', value: '' })}${field({ label: 'Locatie', name: 'locatie', value: '' })}</div>
              ${select({ label: 'Btw op de verkoopfactuur', name: 'verkoop_btw', value: 'verlegd', options: BTW_VERKOOP })}
              <input type="hidden" name="actief" value="1">
              <button class="btn" type="submit">Project toevoegen</button></form>
          </div>
          <div class="card"><h2>Accounts van de klant</h2>
            ${users.length ? html`<ul class="list">${users.map((u) => html`<li><span>${u.naam}<span class="muted small"> ${u.email}</span></span>${u.password_hash ? html`<span class="badge badge--good">Actief</span>` : html`<span class="badge badge--warn">Uitgenodigd</span>`}</li>`)}</ul>` : html`<p class="muted">Uitvoerders kunnen ook zonder account goedkeuren via de link. Een account is handig voor wie vaak goedkeurt of facturen wil inzien.</p>`}
            <form method="post" action="/beheer/klanten/${id}/uitnodigen" class="stack">${csrfField(req.csrf)}
              <div class="row-2">${field({ label: 'Naam', name: 'naam', value: '', required: true })}${field({ label: 'E-mail', name: 'email', type: 'email', value: '', required: true })}</div>
              <button class="btn" type="submit">Uitnodigen</button></form>
          </div>
        </div>` : ''}
      </div>`);
  };

  const blank = { naam: '', contactpersoon: '', email: '', telefoon: '', adres: '', postcode: '', plaats: '', kvk: '', btw_id: '', betaaltermijn_dagen: 30, actief: 1 };
  const cols = [...FIELDS, 'betaaltermijn_dagen', 'actief'];

  r.get('/klanten/nieuw', (req, res) => page(req, res, blank));
  r.post('/klanten/nieuw', (req, res) => attempt(() => {
    const v = read(req.body);
    const id = db.run(`INSERT INTO klanten (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => v[c])).id;
    db.audit(req.user.email, 'klant aangemaakt', 'klant', id, v.naam);
    res.flash(`${v.naam} is toegevoegd. Voeg nu een project toe.`);
    res.redirect(303, `/beheer/klanten/${id}`);
  }, (msg) => page(req, res, { ...blank, ...req.body, actief: req.body.actief === '1' }, { error: msg })));

  const load = (id) => db.get('SELECT * FROM klanten WHERE id = ?', id);
  r.get('/klanten/:id', (req, res) => {
    const k = load(toInt(req.params.id));
    if (!k) return res.status(404).page('Niet gevonden', emptyState('Klant niet gevonden.'));
    page(req, res, k, { id: k.id });
  });
  r.post('/klanten/:id', (req, res) => {
    const id = toInt(req.params.id);
    const old = load(id);
    if (!old) return res.status(404).send('Niet gevonden');
    return attempt(() => {
      const v = read(req.body);
      db.run(`UPDATE klanten SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => v[c]), id);
      res.flash('Opgeslagen.');
      res.redirect(303, `/beheer/klanten/${id}`);
    }, (msg) => page(req, res, { ...old, ...req.body, actief: req.body.actief === '1' }, { id, error: msg }));
  });

  r.post('/klanten/:id/projecten', (req, res) => {
    const id = toInt(req.params.id);
    const k = load(id);
    if (!k) return res.status(404).send('Niet gevonden');
    return attempt(() => {
      const p = readProject(req.body);
      db.run('INSERT INTO projecten (klant_id, naam, projectnummer, locatie, verkoop_btw, actief) VALUES (?, ?, ?, ?, ?, ?)', id, p.naam, p.projectnummer, p.locatie, p.verkoop_btw, p.actief);
      res.flash(`Project ${p.naam} toegevoegd.`);
      res.redirect(303, `/beheer/klanten/${id}`);
    }, (msg) => page(req, res, k, { id, error: msg }));
  });

  r.post('/klanten/:id/uitnodigen', (req, res) => {
    const id = toInt(req.params.id);
    const k = load(id);
    if (!k) return res.status(404).send('Niet gevonden');
    const naam = clean(req.body.naam, 100), email = clean(req.body.email, 200).toLowerCase();
    if (!naam || !email) return page(req, res, k, { id, error: 'Vul naam en e-mail in.' });
    const other = db.get('SELECT id FROM users WHERE email = ? AND (klant_id IS NULL OR klant_id <> ?)', email, id);
    if (other) return page(req, res, k, { id, error: 'Dit e-mailadres hoort al bij een ander account.' });
    const t = createInvite(db, { email, naam, rol: 'klant', klantId: id });
    db.audit(req.user.email, 'klant uitgenodigd', 'klant', id, email);
    page(req, res, k, { id, invite: { url: `${baseUrl(req)}/uitnodiging/${t}`, naam, email } });
  });

  // ---------- project bewerken ----------
  const projectPage = (req, res, p, error = '') => res.page(p.naam, html`
    ${pageHead({ eyebrow: p.klant_naam, title: p.naam })}
    ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
    <form method="post" class="card form-grid narrow">${csrfField(req.csrf)}
      ${field({ label: 'Projectnaam', name: 'naam', value: p.naam, required: true })}
      <div class="row-2">${field({ label: 'Projectnummer', name: 'projectnummer', value: p.projectnummer })}${field({ label: 'Locatie', name: 'locatie', value: p.locatie })}</div>
      ${select({ label: 'Btw op de verkoopfactuur', name: 'verkoop_btw', value: p.verkoop_btw, options: BTW_VERKOOP, hint: 'Bepaal per project of de verleggingsregeling geldt. Twijfel je, vraag het de boekhouder.' })}
      <label class="check"><input type="checkbox" name="actief" value="1"${p.actief ? raw(' checked') : ''}> Project loopt</label>
      <div class="form-actions"><button class="btn btn--primary" type="submit">Opslaan</button><a class="btn" href="/beheer/klanten/${p.klant_id}">Terug naar ${p.klant_naam}</a></div>
    </form>
    <p class="muted small">Aangemaakt op ${fmtDate(p.created_at.slice(0, 10))}.</p>`);

  const loadProject = (id) => db.get('SELECT p.*, k.naam AS klant_naam FROM projecten p JOIN klanten k ON k.id = p.klant_id WHERE p.id = ?', id);
  r.get('/projecten/:id', (req, res) => {
    const p = loadProject(toInt(req.params.id));
    if (!p) return res.status(404).page('Niet gevonden', emptyState('Project niet gevonden.'));
    projectPage(req, res, p);
  });
  r.post('/projecten/:id', (req, res) => {
    const p = loadProject(toInt(req.params.id));
    if (!p) return res.status(404).send('Niet gevonden');
    return attempt(() => {
      const v = readProject(req.body);
      db.run('UPDATE projecten SET naam = ?, projectnummer = ?, locatie = ?, verkoop_btw = ?, actief = ? WHERE id = ?', v.naam, v.projectnummer, v.locatie, v.verkoop_btw, v.actief, p.id);
      res.flash('Project opgeslagen.');
      res.redirect(303, `/beheer/klanten/${p.klant_id}`);
    }, (msg) => projectPage(req, res, { ...p, ...req.body }, msg));
  });
}
