import { html } from '../../views/html.js';
import { pageHead, field, csrfField, shareButtons } from '../../views/components.js';
import { createInvite } from '../../auth.js';
import { clean, fmtDate } from '../../util.js';
import { baseUrl } from '../shared.js';

const COMPANY = [
  ['bedrijf_naam', 'Bedrijfsnaam'], ['bedrijf_adres', 'Adres'], ['bedrijf_postcode', 'Postcode'], ['bedrijf_plaats', 'Plaats'],
  ['bedrijf_kvk', 'KvK-nummer'], ['bedrijf_btw_id', 'Btw-id'], ['bedrijf_iban', 'IBAN'], ['bedrijf_email', 'E-mail'], ['bedrijf_telefoon', 'Telefoon'],
];

export function register(r, db) {
  const page = (req, res, { error = '', invite = null } = {}) => {
    const s = db.settings();
    const admins = db.all(`SELECT * FROM users WHERE rol = 'admin' ORDER BY naam`);
    res.page('Instellingen', html`
      ${pageHead({ title: 'Instellingen', sub: 'Deze gegevens staan op je facturen.' })}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      ${invite ? html`<div class="panel panel--good"><h2>Uitnodiging klaar</h2>${shareButtons({ url: invite.url, text: `Hoi ${invite.naam}, via deze link maak je je beheerdersaccount aan voor het RKS-platform:`, email: invite.email, subject: 'Beheerdersaccount RKS Infra' })}</div>` : ''}
      <div class="grid-2 grid-2--wide">
        <form method="post" action="/beheer/instellingen" class="card form-grid">${csrfField(req.csrf)}
          <fieldset><legend>Bedrijfsgegevens RKS Infra</legend>
            ${field({ label: 'Bedrijfsnaam', name: 'bedrijf_naam', value: s.bedrijf_naam, required: true })}
            ${field({ label: 'Adres', name: 'bedrijf_adres', value: s.bedrijf_adres, required: true })}
            <div class="row-2">${field({ label: 'Postcode', name: 'bedrijf_postcode', value: s.bedrijf_postcode, required: true })}${field({ label: 'Plaats', name: 'bedrijf_plaats', value: s.bedrijf_plaats, required: true })}</div>
            <div class="row-2">${field({ label: 'KvK-nummer', name: 'bedrijf_kvk', value: s.bedrijf_kvk, required: true })}${field({ label: 'Btw-id', name: 'bedrijf_btw_id', value: s.bedrijf_btw_id, required: true })}</div>
            ${field({ label: 'IBAN', name: 'bedrijf_iban', value: s.bedrijf_iban, required: true })}
            <div class="row-2">${field({ label: 'E-mail', name: 'bedrijf_email', type: 'email', value: s.bedrijf_email })}${field({ label: 'Telefoon', name: 'bedrijf_telefoon', value: s.bedrijf_telefoon })}</div>
          </fieldset>
          <fieldset><legend>Factuurnummering</legend>
            ${field({ label: 'Voorvoegsel', name: 'factuur_prefix', value: s.factuur_prefix, required: true, maxlength: 10, hint: `Het volgende nummer wordt ${s.factuur_prefix || 'RKS'}-${new Date().getFullYear()}-${String((s.factuur_jaar === String(new Date().getFullYear()) ? Number(s.factuur_volgnummer) : 0) + 1).padStart(4, '0')}. Nummers lopen zonder gaten door en beginnen elk jaar opnieuw.` })}
          </fieldset>
          <div class="form-actions"><button class="btn btn--primary" type="submit">Opslaan</button></div>
        </form>
        <div class="stack">
          <div class="card"><h2>Beheerders</h2>
            <ul class="list">${admins.map((a) => html`<li><span>${a.naam}<span class="muted small"> ${a.email}</span></span><span class="muted small">${a.laatst_ingelogd ? `Laatst ${fmtDate(a.laatst_ingelogd.slice(0, 10))}` : 'Uitgenodigd'}</span></li>`)}</ul>
            <form method="post" action="/beheer/instellingen/beheerder" class="stack">${csrfField(req.csrf)}
              <div class="row-2">${field({ label: 'Naam', name: 'naam', value: '', required: true })}${field({ label: 'E-mail', name: 'email', type: 'email', value: '', required: true })}</div>
              <button class="btn" type="submit">Beheerder uitnodigen</button></form>
          </div>
          <div class="card"><h2>Logboek</h2><p class="muted">Wie wat wanneer heeft goedgekeurd, gewijzigd of gefactureerd.</p><a class="btn" href="/beheer/logboek">Logboek bekijken</a></div>
        </div>
      </div>`);
  };

  r.get('/instellingen', (req, res) => page(req, res));
  r.post('/instellingen', (req, res) => {
    for (const [key] of COMPANY) db.setSetting(key, clean(req.body[key], 200));
    db.setSetting('bedrijf_btw_id', clean(req.body.bedrijf_btw_id, 30).toUpperCase().replace(/\s+/g, ''));
    db.setSetting('bedrijf_iban', clean(req.body.bedrijf_iban, 40).toUpperCase());
    const prefix = clean(req.body.factuur_prefix, 10).replace(/[^A-Za-z0-9]/g, '');
    if (prefix) db.setSetting('factuur_prefix', prefix);
    db.audit(req.user.email, 'instellingen gewijzigd', 'settings');
    res.flash('Instellingen opgeslagen.');
    res.redirect(303, '/beheer/instellingen');
  });

  r.post('/instellingen/beheerder', (req, res) => {
    const naam = clean(req.body.naam, 100), email = clean(req.body.email, 200).toLowerCase();
    if (!naam || !email) return page(req, res, { error: 'Vul naam en e-mail in.' });
    const existing = db.get('SELECT rol FROM users WHERE email = ?', email);
    if (existing && existing.rol !== 'admin') return page(req, res, { error: 'Dit e-mailadres hoort al bij een vakman of klant.' });
    const t = createInvite(db, { email, naam, rol: 'admin' });
    db.audit(req.user.email, 'beheerder uitgenodigd', 'user', null, email);
    page(req, res, { invite: { url: `${baseUrl(req)}/uitnodiging/${t}`, naam, email } });
  });

  r.get('/logboek', (req, res) => {
    const rows = db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300');
    res.page('Logboek', html`
      ${pageHead({ back: { href: '/beheer/instellingen', label: 'Instellingen' }, title: 'Logboek' })}
      <div class="table-wrap"><table class="table table--compact">
        <thead><tr><th>Moment</th><th>Wie</th><th>Actie</th><th>Details</th></tr></thead>
        <tbody>${rows.map((a) => html`<tr><td class="nowrap">${a.at.replace('T', ' ').slice(0, 16)}</td><td>${a.wie}</td><td>${a.actie} <span class="muted small">${a.entiteit} ${a.entiteit_id || ''}</span></td><td>${a.details}</td></tr>`)}</tbody>
      </table></div>`);
  });
}
