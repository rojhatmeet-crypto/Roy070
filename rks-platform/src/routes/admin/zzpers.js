import { html, raw } from '../../views/html.js';
import { pageHead, field, select, csrfField, shareButtons, emptyState } from '../../views/components.js';
import { createInvite } from '../../auth.js';
import { euro, fmtDate, parseDate, toInt, clean, today, addDays } from '../../util.js';
import { FormError, attempt, baseUrl } from '../shared.js';

const CERT_SOORTEN = ['VCA Basis', 'VCA VOL', 'BEI-LS / NEN 3140', 'PE-lassen', 'Aanpikker', 'Signaalgever', 'Rijbewijs BE', 'Rijbewijs C'];
const FIELDS = ['naam', 'bedrijfsnaam', 'email', 'telefoon', 'adres', 'postcode', 'plaats', 'kvk', 'btw_id', 'iban', 'notities'];

function read(body) {
  const v = {};
  for (const f of FIELDS) v[f] = clean(body[f], f === 'notities' ? 2000 : 200);
  v.email = v.email.toLowerCase();
  v.iban = v.iban.toUpperCase().replace(/\s+/g, ' ');
  v.btw_id = v.btw_id.toUpperCase().replace(/\s+/g, '');
  v.btw_regime = body.btw_regime === 'kor' ? 'kor' : 'normaal';
  v.selfbilling_akkoord_op = parseDate(body.selfbilling_akkoord_op) ? body.selfbilling_akkoord_op : null;
  v.betaaltermijn_dagen = Math.min(90, Math.max(0, toInt(body.betaaltermijn_dagen) ?? 14));
  v.actief = body.actief === '1' ? 1 : 0;
  if (!v.naam) throw new FormError('Vul de naam in.');
  if (v.kvk && !/^\d{8}$/.test(v.kvk)) throw new FormError('Een KvK-nummer heeft 8 cijfers.');
  if (v.iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,30}$/.test(v.iban)) throw new FormError('Dit IBAN lijkt niet te kloppen.');
  return v;
}

const vcaBadge = (geldig) => {
  if (!geldig) return html`<span class="badge badge--neutral">Onbekend</span>`;
  const t = today();
  if (geldig < t) return html`<span class="badge badge--crit">Verlopen</span>`;
  if (geldig <= addDays(t, 30)) return html`<span class="badge badge--warn">Tot ${fmtDate(geldig)}</span>`;
  return html`<span class="badge badge--good">Tot ${fmtDate(geldig)}</span>`;
};

export function register(r, db) {
  r.get('/zzpers', (req, res) => {
    const rows = db.all(`
      SELECT z.*, (SELECT MIN(geldig_tot) FROM certificaten c WHERE c.zzp_id = z.id AND c.soort LIKE 'VCA%') AS vca,
             (SELECT COUNT(*) FROM plaatsingen p WHERE p.zzp_id = z.id AND p.actief = 1) AS opdrachten,
             (SELECT CASE WHEN password_hash IS NOT NULL THEN 'actief' ELSE 'uitgenodigd' END FROM users u WHERE u.zzp_id = z.id LIMIT 1) AS account
        FROM zzpers z ORDER BY z.actief DESC, z.naam`);
    res.page('Zzp\'ers', html`
      ${pageHead({ title: 'Zzp\'ers', sub: `${rows.filter((z) => z.actief).length} actief`, actions: html`<a class="btn btn--primary" href="/beheer/zzpers/nieuw">Nieuwe zzp'er</a>` })}
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Naam</th><th>Contact</th><th>VCA</th><th>Self-billing</th><th class="num">Opdrachten</th><th>Account</th></tr></thead>
        <tbody>${rows.map((z) => html`<tr class="${z.actief ? '' : 'is-muted'}">
          <td><a href="/beheer/zzpers/${z.id}">${z.naam}</a><p class="muted small">${z.bedrijfsnaam}</p></td>
          <td>${z.telefoon}<p class="muted small">${z.email}</p></td>
          <td>${vcaBadge(z.vca)}</td>
          <td>${z.selfbilling_akkoord_op ? html`<span class="badge badge--good">Akkoord</span>` : html`<span class="badge badge--neutral">Nee</span>`}</td>
          <td class="num">${z.opdrachten}</td>
          <td>${z.account === 'actief' ? html`<span class="badge badge--good">Actief</span>` : z.account === 'uitgenodigd' ? html`<span class="badge badge--warn">Uitgenodigd</span>` : html`<span class="muted small">Geen</span>`}</td></tr>`)}</tbody>
      </table></div>` : emptyState('Nog geen zzp\'ers.')}`);
  });

  const page = (req, res, v, { id = null, error = '', invite = '' } = {}) => {
    const certs = id ? db.all('SELECT * FROM certificaten WHERE zzp_id = ? ORDER BY geldig_tot', id) : [];
    const user = id ? db.get('SELECT * FROM users WHERE zzp_id = ?', id) : null;
    const opdrachten = id ? db.all(`SELECT p.id, p.functie, p.inkoop_cents, p.verkoop_cents, p.actief, pr.naam AS project, k.naam AS klant FROM plaatsingen p
      JOIN projecten pr ON pr.id = p.project_id JOIN klanten k ON k.id = pr.klant_id WHERE p.zzp_id = ? ORDER BY p.actief DESC, p.id DESC`, id) : [];
    res.page(id ? v.naam : 'Nieuwe zzp\'er', html`
      ${pageHead({ eyebrow: 'Zzp\'er', title: id ? v.naam : 'Nieuwe zzp\'er', actions: id ? html`<a class="btn" href="/beheer/plaatsingen/nieuw?zzp=${id}">Opdracht toevoegen</a>` : '' })}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      ${invite ? html`<div class="panel panel--good"><h2>Uitnodiging klaar</h2><p>Stuur deze link naar ${v.naam}. Hiermee kiest hij of zij een wachtwoord. De link is 7 dagen geldig.</p>
        ${shareButtons({ url: invite, text: `Hoi ${v.naam.split(' ')[0]}, via deze link maak je je account aan voor het urenportaal van RKS Infra:`, phone: v.telefoon, email: v.email, subject: 'Je account bij RKS Infra' })}</div>` : ''}
      <div class="grid-2 grid-2--wide">
        <form method="post" action="${id ? `/beheer/zzpers/${id}` : '/beheer/zzpers/nieuw'}" class="card form-grid">
          ${csrfField(req.csrf)}
          <fieldset><legend>Persoon en bedrijf</legend>
            ${field({ label: 'Naam', name: 'naam', value: v.naam, required: true, autocomplete: 'off' })}
            ${field({ label: 'Bedrijfsnaam', name: 'bedrijfsnaam', value: v.bedrijfsnaam })}
            <div class="row-2">${field({ label: 'Mobiel', name: 'telefoon', type: 'tel', value: v.telefoon })}${field({ label: 'E-mail', name: 'email', type: 'email', value: v.email })}</div>
            ${field({ label: 'Adres', name: 'adres', value: v.adres })}
            <div class="row-2">${field({ label: 'Postcode', name: 'postcode', value: v.postcode })}${field({ label: 'Plaats', name: 'plaats', value: v.plaats })}</div>
          </fieldset>
          <fieldset><legend>Facturatie</legend>
            <div class="row-2">${field({ label: 'KvK-nummer', name: 'kvk', value: v.kvk, inputmode: 'numeric' })}${field({ label: 'Btw-id', name: 'btw_id', value: v.btw_id })}</div>
            ${field({ label: 'IBAN', name: 'iban', value: v.iban })}
            ${select({ label: 'Btw', name: 'btw_regime', value: v.btw_regime, options: [['normaal', 'Btw-plichtig'], ['kor', 'Kleineondernemersregeling (geen btw)']] })}
            <div class="row-2">
              ${field({ label: 'Akkoord self-billing sinds', name: 'selfbilling_akkoord_op', type: 'date', value: v.selfbilling_akkoord_op || '', hint: 'Alleen invullen met schriftelijk akkoord. Dan maakt RKS de facturen namens de vakman op.' })}
              ${field({ label: 'Betaaltermijn (dagen)', name: 'betaaltermijn_dagen', type: 'number', value: v.betaaltermijn_dagen, min: 0, max: 90, required: true })}
            </div>
          </fieldset>
          <div class="field"><label for="f-notities">Notities <span class="optional">optioneel</span></label><textarea id="f-notities" name="notities" rows="3">${v.notities}</textarea></div>
          <label class="check"><input type="checkbox" name="actief" value="1"${v.actief ? raw(' checked') : ''}> Actief</label>
          <div class="form-actions"><button class="btn btn--primary" type="submit">Opslaan</button><a class="btn" href="/beheer/zzpers">Annuleren</a></div>
        </form>
        ${id ? html`<div class="stack">
          <div class="card"><h2>Certificaten</h2>
            ${certs.length ? html`<ul class="list">${certs.map((c) => html`<li><span>${c.soort}${c.nummer ? html` <span class="muted small">${c.nummer}</span>` : ''}</span>
              <span class="list__end">${vcaBadge(c.geldig_tot)}<form method="post" action="/beheer/zzpers/${id}/certificaten/${c.id}/verwijderen">${csrfField(req.csrf)}<button class="link small" data-confirm="Certificaat verwijderen?">Verwijder</button></form></span></li>`)}</ul>` : html`<p class="muted">Nog geen certificaten.</p>`}
            <form method="post" action="/beheer/zzpers/${id}/certificaten" class="stack add-cert">${csrfField(req.csrf)}
              <div class="field"><label for="f-soort">Certificaat</label><input id="f-soort" name="soort" list="cert-soorten" required placeholder="VCA Basis"><datalist id="cert-soorten">${CERT_SOORTEN.map((s) => html`<option value="${s}">`)}</datalist></div>
              <div class="row-2">${field({ label: 'Nummer', name: 'nummer', value: '' })}${field({ label: 'Geldig tot', name: 'geldig_tot', type: 'date', value: '' })}</div>
              <button class="btn" type="submit">Certificaat toevoegen</button></form>
          </div>
          <div class="card"><h2>Account</h2>
            ${user ? html`<p>${user.email} · ${user.password_hash ? html`<span class="badge badge--good">Actief</span>` : html`<span class="badge badge--warn">Uitgenodigd</span>`}</p>
              ${user.laatst_ingelogd ? html`<p class="muted small">Laatst ingelogd ${fmtDate(user.laatst_ingelogd.slice(0, 10))}</p>` : ''}` : html`<p class="muted">Nog geen account. Met een account vult ${v.naam} zelf uren in.</p>`}
            <form method="post" action="/beheer/zzpers/${id}/uitnodigen">${csrfField(req.csrf)}<button class="btn" type="submit"${v.email ? '' : raw(' disabled')}>${user ? 'Nieuwe inloglink maken' : 'Account aanmaken en uitnodigen'}</button></form>
            ${v.email ? '' : html`<p class="hint">Vul eerst een e-mailadres in.</p>`}
          </div>
          <div class="card"><h2>Opdrachten</h2>
            ${opdrachten.length ? html`<ul class="list">${opdrachten.map((p) => html`<li><a href="/beheer/plaatsingen/${p.id}">${p.klant} · ${p.project}</a><span class="muted small">${euro(p.inkoop_cents)} / ${euro(p.verkoop_cents)}${p.actief ? '' : ' · afgesloten'}</span></li>`)}</ul>` : html`<p class="muted">Nog geen opdrachten.</p>`}
          </div>
        </div>` : ''}
      </div>`);
  };

  const blank = { naam: '', bedrijfsnaam: '', email: '', telefoon: '', adres: '', postcode: '', plaats: '', kvk: '', btw_id: '', iban: '', btw_regime: 'normaal', selfbilling_akkoord_op: null, betaaltermijn_dagen: 14, notities: '', actief: 1 };
  const cols = [...FIELDS, 'btw_regime', 'selfbilling_akkoord_op', 'betaaltermijn_dagen', 'actief'];

  r.get('/zzpers/nieuw', (req, res) => page(req, res, blank));
  r.post('/zzpers/nieuw', (req, res) => attempt(() => {
    const v = read(req.body);
    const id = db.run(`INSERT INTO zzpers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => v[c])).id;
    db.audit(req.user.email, 'zzp\'er aangemaakt', 'zzp', id, v.naam);
    res.flash(`${v.naam} is toegevoegd.`);
    res.redirect(303, `/beheer/zzpers/${id}`);
  }, (msg) => page(req, res, { ...blank, ...req.body, actief: req.body.actief === '1' }, { error: msg })));

  const load = (id) => db.get('SELECT * FROM zzpers WHERE id = ?', id);
  r.get('/zzpers/:id', (req, res) => {
    const z = load(toInt(req.params.id));
    if (!z) return res.status(404).page('Niet gevonden', emptyState('Zzp\'er niet gevonden.'));
    page(req, res, z, { id: z.id });
  });

  r.post('/zzpers/:id', (req, res) => {
    const id = toInt(req.params.id);
    const old = load(id);
    if (!old) return res.status(404).send('Niet gevonden');
    return attempt(() => {
      const v = read(req.body);
      db.run(`UPDATE zzpers SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => v[c]), id);
      if (old.iban !== v.iban) db.audit(req.user.email, 'IBAN gewijzigd', 'zzp', id, `${old.iban || '-'} naar ${v.iban || '-'}`);
      if (old.selfbilling_akkoord_op !== v.selfbilling_akkoord_op) db.audit(req.user.email, 'self-billing akkoord gewijzigd', 'zzp', id, v.selfbilling_akkoord_op || 'ingetrokken');
      if (v.email) db.run('UPDATE users SET email = ?, naam = ? WHERE zzp_id = ?', v.email, v.naam, id);
      res.flash('Opgeslagen.');
      res.redirect(303, `/beheer/zzpers/${id}`);
    }, (msg) => page(req, res, { ...old, ...req.body, actief: req.body.actief === '1' }, { id, error: msg }));
  });

  r.post('/zzpers/:id/certificaten', (req, res) => {
    const id = toInt(req.params.id);
    if (!load(id)) return res.status(404).send('Niet gevonden');
    const soort = clean(req.body.soort, 100);
    if (soort) db.run('INSERT INTO certificaten (zzp_id, soort, nummer, geldig_tot) VALUES (?, ?, ?, ?)', id, soort, clean(req.body.nummer, 60), parseDate(req.body.geldig_tot) ? req.body.geldig_tot : null);
    res.redirect(303, `/beheer/zzpers/${id}`);
  });

  r.post('/zzpers/:id/certificaten/:cid/verwijderen', (req, res) => {
    const id = toInt(req.params.id);
    db.run('DELETE FROM certificaten WHERE id = ? AND zzp_id = ?', toInt(req.params.cid), id);
    res.redirect(303, `/beheer/zzpers/${id}`);
  });

  r.post('/zzpers/:id/uitnodigen', (req, res) => {
    const z = load(toInt(req.params.id));
    if (!z) return res.status(404).send('Niet gevonden');
    if (!z.email) return page(req, res, z, { id: z.id, error: 'Vul eerst een e-mailadres in.' });
    const other = db.get('SELECT id FROM users WHERE email = ? AND (zzp_id IS NULL OR zzp_id <> ?)', z.email, z.id);
    if (other) return page(req, res, z, { id: z.id, error: 'Dit e-mailadres hoort al bij een ander account.' });
    const t = createInvite(db, { email: z.email, naam: z.naam, rol: 'zzp', zzpId: z.id });
    db.audit(req.user.email, 'uitnodiging gemaakt', 'zzp', z.id);
    page(req, res, z, { id: z.id, invite: `${baseUrl(req)}/uitnodiging/${t}` });
  });
}
