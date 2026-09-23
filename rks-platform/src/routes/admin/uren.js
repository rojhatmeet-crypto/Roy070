import { html, raw } from '../../views/html.js';
import { pageHead, hoursTable, hoursForm, sheetBadge, shareButtons, rateSummary, csrfField, emptyState, weekNav } from '../../views/components.js';
import * as ts from '../../domain/timesheets.js';
import { hours, weekLabel, shiftWeek, isValidWeek, fmtDate, toInt, weekNumber, clean, euro } from '../../util.js';
import { parseHoursForm, baseUrl, approvalText, attempt } from '../shared.js';
import { currentWeek } from '../../domain/dashboard.js';

const STATUS_FILTERS = [['alle', 'Alle'], ['ingediend', 'Wacht op goedkeuring'], ['goedgekeurd', 'Goedgekeurd'], ['afgekeurd', 'Afgekeurd'], ['concept', 'Concept']];

export function register(r, db) {
  r.get('/uren', (req, res) => {
    const status = STATUS_FILTERS.some(([k]) => k === req.query.status) ? req.query.status : 'alle';
    const week = isValidWeek(req.query.week) ? req.query.week : '';
    const where = [], params = [];
    if (status !== 'alle') { where.push('u.status = ?'); params.push(status); }
    if (week) { where.push('u.week = ?'); params.push(week); }
    const rows = db.all(`
      SELECT u.id, u.week, u.status, z.naam AS zzp_naam, k.naam AS klant_naam, pr.naam AS project_naam,
             (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
        FROM urenstaten u JOIN plaatsingen p ON p.id = u.plaatsing_id JOIN projecten pr ON pr.id = p.project_id
        JOIN klanten k ON k.id = pr.klant_id JOIN zzpers z ON z.id = p.zzp_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY u.week DESC, CASE u.status WHEN 'ingediend' THEN 0 WHEN 'afgekeurd' THEN 1 ELSE 2 END, z.naam LIMIT 300`, ...params);
    const qs = (o) => new URLSearchParams({ status, ...(week ? { week } : {}), ...o }).toString();
    res.page('Uren', html`
      ${pageHead({ title: 'Uren', sub: week ? weekLabel(week) : '' })}
      <div class="toolbar">
        <div class="tabs">${STATUS_FILTERS.map(([k, l]) => html`<a href="/beheer/uren?${qs({ status: k })}"${k === status ? raw(' aria-current="page"') : ''}>${l}</a>`)}</div>
        <div class="tabs">
          ${week ? html`<a href="/beheer/uren?${qs({ week: shiftWeek(week, -1) })}">Vorige week</a><a href="/beheer/uren?${new URLSearchParams({ status })}">Alle weken</a><a href="/beheer/uren?${qs({ week: shiftWeek(week, 1) })}">Volgende week</a>`
            : html`<a href="/beheer/uren?${qs({ week: currentWeek() })}">Deze week</a>`}
        </div>
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Week</th><th>Vakman</th><th>Klant en project</th><th class="num">Uren</th><th>Status</th></tr></thead>
        <tbody>${rows.map((u) => html`<tr>
          <td><a href="/beheer/uren/${u.id}">Week ${weekNumber(u.week)}</a><p class="muted small">${u.week.slice(0, 4)}</p></td>
          <td>${u.zzp_naam}</td><td>${u.klant_naam}<p class="muted small">${u.project_naam}</p></td>
          <td class="num">${hours(u.minuten)}</td><td>${sheetBadge(u.status)}</td></tr>`)}</tbody>
      </table></div>` : emptyState('Geen urenstaten gevonden met dit filter.')}`);
  });

  const detail = (req, res, id, error = '') => {
    const s = ts.loadTimesheet(db, id);
    if (!s) return res.status(404).page('Niet gevonden', emptyState('Urenstaat niet gevonden.'));
    const entries = ts.entries(db, s.id, s.week);
    const inkoop = s.inkoop_cents ?? s.p_inkoop, verkoop = s.verkoop_cents ?? s.p_verkoop;
    const invoices = db.all(`SELECT DISTINCT f.id, f.soort, f.nummer, f.status FROM facturen f JOIN factuurregels r ON r.factuur_id = f.id WHERE r.urenstaat_id = ?`, s.id);
    const link = s.approval_token ? `${baseUrl(req)}/goedkeuren/${s.approval_token}` : '';
    res.page(`Uren ${s.zzp_naam}`, html`
      ${pageHead({ back: { href: '/beheer/uren', label: 'Uren' }, title: `${s.zzp_naam}, week ${weekNumber(s.week)}`, sub: `${s.klant_naam} · ${s.project_naam}`, actions: sheetBadge(s.status) })}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <div class="grid-2 grid-2--wide">
        <div class="card">${hoursTable(entries)}
          ${s.status === 'concept' || s.status === 'afgekeurd' ? html`<p><a class="btn" href="/beheer/plaatsingen/${s.plaatsing_id}/uren/${s.week}">Uren invullen namens ${s.zzp_naam}</a></p>` : ''}
        </div>
        <div class="stack">
          <div class="card"><h2>Bedragen</h2>${rateSummary(s.minuten, inkoop, verkoop)}
            ${s.status === 'goedgekeurd' ? html`<p class="muted small">Tarieven vastgelegd bij goedkeuring.</p>` : ''}
          </div>
          ${s.status === 'ingediend' ? html`
          <div class="card">
            <h2>Link voor de uitvoerder</h2>
            <p class="muted">${s.goedkeurder_naam || 'Uitvoerder'}${s.goedkeurder_telefoon ? `, ${s.goedkeurder_telefoon}` : ''}. Geldig tot ${fmtDate(s.approval_expires)}.</p>
            ${shareButtons({ url: link, text: approvalText(s), phone: s.goedkeurder_telefoon, email: s.goedkeurder_email, subject: `Uren ${s.zzp_naam} week ${weekNumber(s.week)}` })}
            <form method="post" action="/beheer/uren/${s.id}" class="inline-form">${csrfField(req.csrf)}<button class="link" name="actie" value="nieuwe_link">Nieuwe link maken</button></form>
          </div>
          <div class="card">
            <h2>Goedkeuren namens opdrachtgever</h2>
            <p class="muted small">Alleen met schriftelijke goedkeuring, bijvoorbeeld per mail.</p>
            <form method="post" action="/beheer/uren/${s.id}" class="stack">${csrfField(req.csrf)}
              <div class="field"><label for="f-naam">Goedgekeurd door</label><input id="f-naam" name="naam" required value="${s.goedkeurder_naam}"></div>
              <div class="field"><label for="f-bewijs">Hoe is goedgekeurd?</label><input id="f-bewijs" name="bewijs" required placeholder="Bijvoorbeeld: e-mail van 22 september"></div>
              <div class="form-actions"><button class="btn btn--primary" name="actie" value="goedkeuren">Goedkeuren</button></div>
              <details class="reject"><summary>Afkeuren</summary>
                <div class="field"><label for="f-reden">Reden</label><textarea id="f-reden" name="reden" rows="2"></textarea></div>
                <button class="btn btn--danger" name="actie" value="afkeuren">Afkeuren</button></details>
            </form>
          </div>` : ''}
          ${s.status === 'goedgekeurd' ? html`<div class="card"><h2>Goedgekeurd</h2><p>Door ${s.goedgekeurd_door} op ${fmtDate(s.goedgekeurd_op.slice(0, 10))}.</p>
            <ul class="list">${invoices.map((f) => html`<li><a href="/beheer/facturen/${f.id}">${f.soort === 'verkoop' ? 'Verkoopfactuur' : 'Inkoopfactuur'} ${f.nummer || '(concept)'}</a></li>`)}</ul></div>` : ''}
          ${s.status === 'afgekeurd' ? html`<div class="card"><h2>Afgekeurd</h2><p>Door ${s.goedgekeurd_door}:</p><p class="quote">${s.afkeur_reden}</p></div>` : ''}
        </div>
      </div>`);
  };

  r.get('/uren/:id', (req, res) => detail(req, res, toInt(req.params.id)));

  r.post('/uren/:id', (req, res) => {
    const id = toInt(req.params.id);
    return attempt(() => {
      const actie = req.body.actie;
      if (actie === 'nieuwe_link') { ts.renewApprovalLink(db, id, req.user.email); res.flash('Nieuwe goedkeuringslink gemaakt. De oude werkt niet meer.'); }
      else if (actie === 'afkeuren') { ts.reject(db, id, req.user.naam, clean(req.body.reden, 500), 'beheer'); res.flash('Uren afgekeurd.'); }
      else if (actie === 'goedkeuren') {
        const bewijs = clean(req.body.bewijs, 200);
        if (!bewijs) return detail(req, res, id, 'Leg vast hoe de opdrachtgever heeft goedgekeurd.');
        ts.approve(db, id, clean(req.body.naam, 100), `namens opdrachtgever door ${req.user.naam}: ${bewijs}`);
        res.flash('Uren goedgekeurd. De facturen zijn aangemaakt.');
      }
      res.redirect(303, `/beheer/uren/${id}`);
    }, (msg) => detail(req, res, id, msg));
  });

  // ---------- uren invullen namens een vakman ----------
  const placement = (id) => db.get(`SELECT p.*, z.naam AS zzp_naam, pr.naam AS project_naam, k.naam AS klant_naam FROM plaatsingen p
    JOIN zzpers z ON z.id = p.zzp_id JOIN projecten pr ON pr.id = p.project_id JOIN klanten k ON k.id = pr.klant_id WHERE p.id = ?`, id);

  const onBehalf = (req, res, p, week, error = '') => {
    const existing = db.get('SELECT * FROM urenstaten WHERE plaatsing_id = ? AND week = ?', p.id, week);
    if (existing && !['concept', 'afgekeurd'].includes(existing.status)) return res.redirect(`/beheer/uren/${existing.id}`);
    const entries = ts.entries(db, existing ? existing.id : -1, week);
    const base = `/beheer/plaatsingen/${p.id}/uren`;
    res.page('Uren invullen', html`
      ${pageHead({ back: { href: `/beheer/plaatsingen/${p.id}`, label: 'Opdracht' }, title: `Uren van ${p.zzp_naam}`, sub: `${p.klant_naam} · ${p.project_naam}` })}
      ${weekNav(`${base}/`, week)}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <div class="card narrow">${hoursForm({ action: `${base}/${week}`, csrf: req.csrf, entries, editable: true })}</div>`);
  };

  r.get('/plaatsingen/:id/uren/:week', (req, res) => {
    const p = placement(toInt(req.params.id));
    if (!p || !isValidWeek(req.params.week)) return res.status(404).page('Niet gevonden', emptyState('Niet gevonden.'));
    onBehalf(req, res, p, req.params.week);
  });

  r.post('/plaatsingen/:id/uren/:week', (req, res) => {
    const p = placement(toInt(req.params.id));
    const week = req.params.week;
    if (!p || !isValidWeek(week)) return res.status(404).send('Niet gevonden');
    const parsed = parseHoursForm(req.body, week);
    if (parsed.error) return onBehalf(req, res, p, week, parsed.error);
    return attempt(() => {
      const sheet = ts.findOrCreate(db, p.id, week);
      ts.save(db, sheet.id, parsed.items, `${req.user.email} namens ${p.zzp_naam}`);
      if (req.body.actie === 'indienen') {
        ts.submit(db, sheet.id, `${req.user.email} namens ${p.zzp_naam}`);
        res.flash('Uren ingediend. Stuur de goedkeuringslink naar de uitvoerder.');
        return res.redirect(303, `/beheer/uren/${sheet.id}`);
      }
      res.flash('Opgeslagen als concept.');
      res.redirect(303, `/beheer/plaatsingen/${p.id}/uren/${week}`);
    }, (msg) => onBehalf(req, res, p, week, msg));
  });
}

export { hours };
