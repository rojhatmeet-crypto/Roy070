import { html, raw } from '../../views/html.js';
import { pageHead, field, select, moneyField, csrfField, sheetBadge, emptyState } from '../../views/components.js';
import { euro, hours, parseEuro, parseDate, toInt, clean, weekNumber } from '../../util.js';
import { currentWeek } from '../../domain/dashboard.js';
import { FormError, attempt } from '../shared.js';

const BTW_IN = [['verlegd', 'Btw verlegd (onderaanneming in de bouw)'], ['21', 'Btw 21%'], ['geen', 'Geen btw (KOR)']];

function read(body) {
  const v = {
    zzp_id: toInt(body.zzp_id), project_id: toInt(body.project_id), functie: clean(body.functie, 100), opdracht: clean(body.opdracht, 1000),
    inkoop_cents: parseEuro(body.inkoop), verkoop_cents: parseEuro(body.verkoop),
    inkoop_btw: BTW_IN.some(([k]) => k === body.inkoop_btw) ? body.inkoop_btw : 'verlegd',
    startdatum: parseDate(body.startdatum) ? body.startdatum : null, einddatum: parseDate(body.einddatum) ? body.einddatum : null,
    modelovereenkomst: clean(body.modelovereenkomst, 200), contract_getekend_op: parseDate(body.contract_getekend_op) ? body.contract_getekend_op : null,
    goedkeurder_naam: clean(body.goedkeurder_naam, 100), goedkeurder_email: clean(body.goedkeurder_email, 200).toLowerCase(),
    goedkeurder_telefoon: clean(body.goedkeurder_telefoon, 30), actief: body.actief === '1' ? 1 : 0,
  };
  if (!v.zzp_id) throw new FormError('Kies een vakman.');
  if (!v.project_id) throw new FormError('Kies een project.');
  if (v.inkoop_cents === null || v.verkoop_cents === null) throw new FormError('Vul een geldig inkoop- en verkooptarief in, bijvoorbeeld 47,00.');
  if (v.verkoop_cents < v.inkoop_cents) throw new FormError('Het verkooptarief is lager dan het inkooptarief. Dan maakt RKS verlies op elk uur.');
  if (v.startdatum && v.einddatum && v.einddatum < v.startdatum) throw new FormError('De einddatum ligt voor de startdatum.');
  return v;
}

export function register(r, db) {
  r.get('/plaatsingen', (req, res) => {
    const rows = db.all(`
      SELECT p.*, z.naam AS zzp_naam, pr.naam AS project_naam, k.naam AS klant_naam
        FROM plaatsingen p JOIN zzpers z ON z.id = p.zzp_id JOIN projecten pr ON pr.id = p.project_id JOIN klanten k ON k.id = pr.klant_id
       ORDER BY p.actief DESC, k.naam, z.naam`);
    res.page('Opdrachten', html`
      ${pageHead({ title: 'Opdrachten', actions: html`<a class="btn btn--primary" href="/beheer/plaatsingen/nieuw">Nieuwe opdracht</a>` })}
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Vakman</th><th>Klant en project</th><th class="num">Inkoop</th><th class="num">Verkoop</th><th class="num">Marge per uur</th><th>Contract</th></tr></thead>
        <tbody>${rows.map((p) => html`<tr class="${p.actief ? '' : 'is-muted'}">
          <td><a href="/beheer/plaatsingen/${p.id}">${p.zzp_naam}</a><p class="muted small">${p.functie}${p.actief ? '' : ' · afgesloten'}</p></td>
          <td>${p.klant_naam}<p class="muted small">${p.project_naam}</p></td>
          <td class="num">${euro(p.inkoop_cents)}</td><td class="num">${euro(p.verkoop_cents)}</td>
          <td class="num"><strong>${euro(p.verkoop_cents - p.inkoop_cents)}</strong><p class="muted small">${p.verkoop_cents ? Math.round(((p.verkoop_cents - p.inkoop_cents) / p.verkoop_cents) * 1000) / 10 : 0}% marge</p></td>
          <td>${p.contract_getekend_op ? html`<span class="badge badge--good">Getekend</span>` : html`<span class="badge badge--warn">Ontbreekt</span>`}</td></tr>`)}</tbody>
      </table></div>` : emptyState('Nog geen opdrachten. Maak eerst een klant, project en vakman aan.')}`);
  });

  const form = (req, res, v, { id = null, error = '' } = {}) => {
    const zzps = db.all('SELECT id, naam FROM zzpers WHERE actief = 1 OR id = ? ORDER BY naam', v.zzp_id || 0);
    const projects = db.all(`SELECT pr.id, pr.naam, k.naam AS klant FROM projecten pr JOIN klanten k ON k.id = pr.klant_id
                              WHERE pr.actief = 1 OR pr.id = ? ORDER BY k.naam, pr.naam`, v.project_id || 0);
    const sheets = id ? db.all(`SELECT u.id, u.week, u.status, (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
                                 FROM urenstaten u WHERE u.plaatsing_id = ? ORDER BY u.week DESC LIMIT 10`, id) : [];
    res.page(id ? 'Opdracht bewerken' : 'Nieuwe opdracht', html`
      ${pageHead({ back: { href: '/beheer/plaatsingen', label: 'Opdrachten' }, title: id ? 'Opdracht' : 'Nieuwe opdracht', actions: id ? html`<a class="btn" href="/beheer/plaatsingen/${id}/uren/${currentWeek()}">Uren invullen</a>` : '' })}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <form method="post" class="card form-grid" data-margin-form>
        ${csrfField(req.csrf)}
        <fieldset><legend>Wie en waar</legend>
          ${select({ label: 'Vakman', name: 'zzp_id', value: v.zzp_id, options: [['', 'Kies een vakman'], ...zzps.map((z) => [z.id, z.naam])] })}
          ${select({ label: 'Project', name: 'project_id', value: v.project_id, options: [['', 'Kies een project'], ...projects.map((p) => [p.id, `${p.klant} · ${p.naam}`])] })}
          ${field({ label: 'Functie', name: 'functie', value: v.functie, required: true, placeholder: 'Bijvoorbeeld: Rioleur' })}
          <div class="field"><label for="f-opdracht">Opdracht <span class="optional">optioneel</span></label>
            <textarea id="f-opdracht" name="opdracht" rows="3" placeholder="Beschrijf het resultaat of de werkzaamheden die de zelfstandige uitvoert.">${v.opdracht}</textarea>
            <p class="hint">Beschrijf een afgebakend resultaat, niet "meewerken in de ploeg".</p></div>
        </fieldset>
        <fieldset><legend>Tarieven per uur</legend>
          <div class="row-2">
            ${moneyField({ label: 'Inkoop: vakman krijgt', name: 'inkoop', value: v.inkoop_cents, required: true, 'data-inkoop': true })}
            ${moneyField({ label: 'Verkoop: klant betaalt', name: 'verkoop', value: v.verkoop_cents, required: true, 'data-verkoop': true })}
          </div>
          <p class="margin-preview" data-margin-out aria-live="polite">${v.inkoop_cents !== null && v.verkoop_cents !== null ? `Marge ${euro(v.verkoop_cents - v.inkoop_cents)} per uur` : ''}</p>
          ${select({ label: 'Btw op de factuur van de vakman aan RKS', name: 'inkoop_btw', value: v.inkoop_btw, options: BTW_IN, })}
        </fieldset>
        <fieldset><legend>Looptijd en contract</legend>
          <div class="row-2">
            ${field({ label: 'Startdatum', name: 'startdatum', type: 'date', value: v.startdatum || '' })}
            ${field({ label: 'Einddatum', name: 'einddatum', type: 'date', value: v.einddatum || '' })}
          </div>
          ${field({ label: 'Overeenkomst', name: 'modelovereenkomst', value: v.modelovereenkomst, placeholder: 'Bijvoorbeeld: modelovereenkomst tussenkomst, versie 2026' })}
          ${field({ label: 'Getekend op', name: 'contract_getekend_op', type: 'date', value: v.contract_getekend_op || '' })}
        </fieldset>
        <fieldset><legend>Wie keurt de uren goed?</legend>
          ${field({ label: 'Naam uitvoerder of opdrachtgever', name: 'goedkeurder_naam', value: v.goedkeurder_naam })}
          <div class="row-2">
            ${field({ label: 'Mobiel (voor WhatsApp)', name: 'goedkeurder_telefoon', type: 'tel', value: v.goedkeurder_telefoon })}
            ${field({ label: 'E-mail', name: 'goedkeurder_email', type: 'email', value: v.goedkeurder_email })}
          </div>
        </fieldset>
        <label class="check"><input type="checkbox" name="actief" value="1"${v.actief ? raw(' checked') : ''}> Opdracht loopt</label>
        <div class="form-actions"><button class="btn btn--primary" type="submit">Opslaan</button><a class="btn" href="/beheer/plaatsingen">Annuleren</a></div>
      </form>
      ${sheets.length ? html`<h2 class="section-title">Laatste weken</h2><div class="table-wrap"><table class="table table--compact"><tbody>
        ${sheets.map((u) => html`<tr><td><a href="/beheer/uren/${u.id}">Week ${weekNumber(u.week)}</a></td><td class="num">${hours(u.minuten)} uur</td><td>${sheetBadge(u.status)}</td></tr>`)}
      </tbody></table></div>` : ''}`);
  };

  const blank = { zzp_id: toInt(0), project_id: null, functie: '', opdracht: '', inkoop_cents: null, verkoop_cents: null, inkoop_btw: 'verlegd', startdatum: null, einddatum: null, modelovereenkomst: '', contract_getekend_op: null, goedkeurder_naam: '', goedkeurder_email: '', goedkeurder_telefoon: '', actief: 1 };

  r.get('/plaatsingen/nieuw', (req, res) => form(req, res, { ...blank, zzp_id: toInt(req.query.zzp), project_id: toInt(req.query.project) }));

  r.post('/plaatsingen/nieuw', (req, res) => attempt(() => {
    const v = read(req.body);
    const id = db.run(`INSERT INTO plaatsingen (zzp_id, project_id, functie, opdracht, inkoop_cents, verkoop_cents, inkoop_btw, startdatum, einddatum,
      modelovereenkomst, contract_getekend_op, goedkeurder_naam, goedkeurder_email, goedkeurder_telefoon, actief) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    v.zzp_id, v.project_id, v.functie, v.opdracht, v.inkoop_cents, v.verkoop_cents, v.inkoop_btw, v.startdatum, v.einddatum,
    v.modelovereenkomst, v.contract_getekend_op, v.goedkeurder_naam, v.goedkeurder_email, v.goedkeurder_telefoon, v.actief).id;
    db.audit(req.user.email, 'opdracht aangemaakt', 'plaatsing', id, `${euro(v.inkoop_cents)} / ${euro(v.verkoop_cents)}`);
    res.flash('Opdracht aangemaakt.');
    res.redirect(303, `/beheer/plaatsingen/${id}`);
  }, (msg) => form(req, res, { ...blank, ...req.body, zzp_id: toInt(req.body.zzp_id), project_id: toInt(req.body.project_id), inkoop_cents: parseEuro(req.body.inkoop), verkoop_cents: parseEuro(req.body.verkoop), actief: req.body.actief === '1' }, { error: msg })));

  r.get('/plaatsingen/:id', (req, res) => {
    const p = db.get('SELECT * FROM plaatsingen WHERE id = ?', toInt(req.params.id));
    if (!p) return res.status(404).page('Niet gevonden', emptyState('Opdracht niet gevonden.'));
    form(req, res, p, { id: p.id });
  });

  r.post('/plaatsingen/:id', (req, res) => {
    const id = toInt(req.params.id);
    const old = db.get('SELECT * FROM plaatsingen WHERE id = ?', id);
    if (!old) return res.status(404).send('Niet gevonden');
    return attempt(() => {
      const v = read(req.body);
      db.run(`UPDATE plaatsingen SET zzp_id=?, project_id=?, functie=?, opdracht=?, inkoop_cents=?, verkoop_cents=?, inkoop_btw=?, startdatum=?, einddatum=?,
        modelovereenkomst=?, contract_getekend_op=?, goedkeurder_naam=?, goedkeurder_email=?, goedkeurder_telefoon=?, actief=? WHERE id=?`,
      v.zzp_id, v.project_id, v.functie, v.opdracht, v.inkoop_cents, v.verkoop_cents, v.inkoop_btw, v.startdatum, v.einddatum,
      v.modelovereenkomst, v.contract_getekend_op, v.goedkeurder_naam, v.goedkeurder_email, v.goedkeurder_telefoon, v.actief, id);
      if (old.inkoop_cents !== v.inkoop_cents || old.verkoop_cents !== v.verkoop_cents) {
        db.audit(req.user.email, 'tarieven gewijzigd', 'plaatsing', id, `${euro(old.inkoop_cents)}/${euro(old.verkoop_cents)} naar ${euro(v.inkoop_cents)}/${euro(v.verkoop_cents)}`);
      }
      res.flash('Opdracht opgeslagen. Nieuwe tarieven gelden voor uren die nog niet zijn goedgekeurd.');
      res.redirect(303, `/beheer/plaatsingen/${id}`);
    }, (msg) => form(req, res, { ...old, ...req.body, zzp_id: toInt(req.body.zzp_id), project_id: toInt(req.body.project_id), inkoop_cents: parseEuro(req.body.inkoop), verkoop_cents: parseEuro(req.body.verkoop), actief: req.body.actief === '1' }, { id, error: msg }));
  });
}
