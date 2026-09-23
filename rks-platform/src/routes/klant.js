// Portaal voor de opdrachtgever: uren goedkeuren en facturen bekijken.
// Een opdrachtgever ziet nooit inkooptarieven of marges.
import { Router } from 'express';
import { html } from '../views/html.js';
import { pageHead, hoursTable, approvalForm, sheetBadge, invoiceBadge, emptyState } from '../views/components.js';
import { invoiceDoc } from '../views/invoice.js';
import { requireRole } from '../auth.js';
import * as ts from '../domain/timesheets.js';
import { loadInvoice } from '../domain/invoices.js';
import { euro, hours, weekLabel, fmtDate, toInt, weekNumber, clean } from '../util.js';
import { attempt } from './shared.js';

export default function klantRoutes(db) {
  const r = Router();
  r.use(requireRole('klant'));

  const sheets = (req, where) => db.all(`
    SELECT u.id, u.week, u.status, u.goedgekeurd_door, z.naam AS zzp_naam, pr.naam AS project_naam, p.functie,
           (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
      FROM urenstaten u JOIN plaatsingen p ON p.id = u.plaatsing_id JOIN projecten pr ON pr.id = p.project_id
      JOIN zzpers z ON z.id = p.zzp_id
     WHERE pr.klant_id = ? AND ${where} ORDER BY u.week DESC, z.naam LIMIT 50`, req.user.klant_id);

  const table = (rows) => html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Vakman</th><th>Project</th><th>Week</th><th class="num">Uren</th><th>Status</th></tr></thead>
    <tbody>${rows.map((u) => html`<tr>
      <td><a href="/klant/uren/${u.id}">${u.zzp_naam}</a></td>
      <td>${u.project_naam}</td><td>Week ${weekNumber(u.week)}</td><td class="num">${hours(u.minuten)}</td><td>${sheetBadge(u.status)}</td></tr>`)}</tbody>
  </table></div>`;

  r.get('/', (req, res) => {
    const pending = sheets(req, `u.status = 'ingediend'`);
    const done = sheets(req, `u.status IN ('goedgekeurd', 'afgekeurd')`);
    res.page('Uren', html`
      ${pageHead({ title: 'Uren goedkeuren' })}
      <h2 class="section-title">Te beoordelen <span class="count">${pending.length}</span></h2>
      ${pending.length ? table(pending) : emptyState('Er wachten geen uren.')}
      ${done.length ? html`<h2 class="section-title">Eerder beoordeeld</h2>${table(done)}` : ''}`);
  });

  const mySheet = (req, id) => {
    const s = ts.loadTimesheet(db, id);
    return s && s.klant_id === req.user.klant_id ? s : null;
  };

  const detail = (req, res, sheet, error = '') => {
    const entries = ts.entries(db, sheet.id, sheet.week);
    res.page(`Uren ${sheet.zzp_naam}`, html`
      ${pageHead({ back: { href: '/klant', label: 'Uren' }, title: sheet.zzp_naam, sub: `${weekLabel(sheet.week)} · ${sheet.project_naam}`, actions: sheetBadge(sheet.status) })}
      <div class="grid-2 grid-2--wide">
        <div class="card">
          <div class="big-total"><span>Totaal</span><strong>${hours(sheet.minuten)} uur</strong></div>
          ${hoursTable(entries)}
        </div>
        <div class="card">
          ${sheet.status === 'ingediend' ? html`${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}${approvalForm({ action: `/klant/uren/${sheet.id}`, csrf: req.csrf, defaultName: req.user.naam })}`
            : sheet.status === 'goedgekeurd' ? html`<p>Goedgekeurd door ${sheet.goedgekeurd_door} op ${fmtDate(sheet.goedgekeurd_op.slice(0, 10))}.</p>`
            : sheet.status === 'afgekeurd' ? html`<p>Afgekeurd door ${sheet.goedgekeurd_door}:</p><p class="quote">${sheet.afkeur_reden}</p>` : ''}
        </div>
      </div>`);
  };

  r.get('/uren/:id', (req, res) => {
    const sheet = mySheet(req, toInt(req.params.id));
    if (!sheet) return res.status(404).page('Niet gevonden', emptyState('Deze uren bestaan niet of horen niet bij jullie projecten.'));
    detail(req, res, sheet);
  });

  r.post('/uren/:id', (req, res) => {
    const sheet = mySheet(req, toInt(req.params.id));
    if (!sheet) return res.status(404).send('Niet gevonden');
    const naam = clean(req.body.naam, 100) || req.user.naam;
    return attempt(() => {
      if (req.body.actie === 'afkeuren') {
        ts.reject(db, sheet.id, naam, clean(req.body.reden, 500), 'klantportaal');
        res.flash(`Uren van ${sheet.zzp_naam} afgekeurd.`);
      } else {
        ts.approve(db, sheet.id, naam, 'klantportaal');
        res.flash(`Uren van ${sheet.zzp_naam} goedgekeurd.`);
      }
      res.redirect(303, '/klant');
    }, (msg) => detail(req, res, mySheet(req, sheet.id), msg));
  });

  r.get('/facturen', (req, res) => {
    const rows = db.all(`SELECT * FROM facturen WHERE soort = 'verkoop' AND klant_id = ? AND status IN ('definitief', 'verzonden', 'betaald')
                          ORDER BY factuurdatum DESC, id DESC LIMIT 100`, req.user.klant_id);
    res.page('Facturen', html`
      ${pageHead({ title: 'Facturen' })}
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Factuur</th><th>Datum</th><th>Week</th><th class="num">Bedrag</th><th>Status</th></tr></thead>
        <tbody>${rows.map((f) => html`<tr>
          <td><a href="/klant/facturen/${f.id}">${f.nummer}</a></td><td>${fmtDate(f.factuurdatum)}</td><td>Week ${weekNumber(f.week)}</td>
          <td class="num">${euro(f.totaal_cents)}</td><td>${invoiceBadge(f)}</td></tr>`)}</tbody>
      </table></div>` : emptyState('Nog geen facturen.')}`);
  });

  r.get('/facturen/:id', (req, res) => {
    const f = db.get(`SELECT id FROM facturen WHERE id = ? AND soort = 'verkoop' AND klant_id = ? AND status IN ('definitief', 'verzonden', 'betaald')`,
      toInt(req.params.id), req.user.klant_id);
    if (!f) return res.status(404).page('Niet gevonden', emptyState('Factuur niet gevonden.'));
    const inv = loadInvoice(db, f.id);
    res.page('Factuur', html`${pageHead({ back: { href: '/klant/facturen', label: 'Facturen' }, title: inv.nummer, actions: html`<button class="btn" type="button" data-print>Printen</button>` })}${invoiceDoc(inv)}`);
  });

  return r;
}
