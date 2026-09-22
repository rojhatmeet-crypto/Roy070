// Publieke pagina's met een geheime link: uren goedkeuren zonder account,
// en een factuur bekijken.
import { Router } from 'express';
import { html } from '../views/html.js';
import { hoursTable, approvalForm, sheetBadge } from '../views/components.js';
import { invoiceDoc } from '../views/invoice.js';
import * as ts from '../domain/timesheets.js';
import { loadInvoice } from '../domain/invoices.js';
import { invoiceUbl } from '../domain/export.js';
import { weekLabel, hours, fmtDate, today, clean } from '../util.js';
import { attempt } from './shared.js';

export default function publicRoutes(db) {
  const r = Router();

  const byToken = (t) => {
    const row = db.get('SELECT id, approval_expires FROM urenstaten WHERE approval_token = ?', String(t));
    return row ? { ...ts.loadTimesheet(db, row.id), approval_expires: row.approval_expires } : null;
  };

  const approvalPage = (req, res, sheet, error = '') => {
    const entries = ts.entries(db, sheet.id, sheet.week);
    const expired = sheet.approval_expires && sheet.approval_expires < today();
    let action;
    if (sheet.status === 'goedgekeurd') {
      action = html`<div class="result result--good"><h2>Goedgekeurd</h2><p>Goedgekeurd door ${sheet.goedgekeurd_door} op ${fmtDate(sheet.goedgekeurd_op.slice(0, 10))}. De uren zijn vergrendeld. Bedankt!</p></div>`;
    } else if (sheet.status !== 'ingediend') {
      action = html`<div class="result"><p>Deze uren wachten niet meer op goedkeuring.</p></div>`;
    } else if (expired) {
      action = html`<div class="result result--warn"><p>Deze link is verlopen. Vraag de vakman of RKS om een nieuwe link.</p></div>`;
    } else {
      action = html`${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
        ${approvalForm({ action: `/goedkeuren/${encodeURIComponent(req.params.token)}`, csrf: req.csrf, defaultName: sheet.goedkeurder_naam })}`;
    }
    res.page('Uren goedkeuren', html`
      <div class="approve-page">
        <p class="eyebrow">Uren goedkeuren</p>
        <h1>${sheet.zzp_naam}</h1>
        <dl class="facts">
          <div><dt>Project</dt><dd>${sheet.project_naam}${sheet.projectnummer ? ` (${sheet.projectnummer})` : ''}</dd></div>
          <div><dt>Opdrachtgever</dt><dd>${sheet.klant_naam}</dd></div>
          <div><dt>Periode</dt><dd>${weekLabel(sheet.week)}</dd></div>
          <div><dt>Status</dt><dd>${sheetBadge(sheet.status)}</dd></div>
        </dl>
        <div class="big-total"><span>Totaal</span><strong>${hours(sheet.minuten)} uur</strong></div>
        ${hoursTable(entries)}
        ${action}
        <p class="hint">Deze pagina is alleen bereikbaar via de persoonlijke link. Na goedkeuring kan niemand de uren meer wijzigen.</p>
      </div>`, { bare: true });
  };

  r.get('/goedkeuren/:token', (req, res) => {
    const sheet = byToken(req.params.token);
    if (!sheet) return res.status(404).page('Link ongeldig', html`<div class="auth"><h1>Deze link werkt niet</h1><p>De link is ongeldig of vervangen door een nieuwe. Vraag de vakman of RKS om de actuele link.</p></div>`, { bare: true });
    approvalPage(req, res, sheet);
  });

  r.post('/goedkeuren/:token', (req, res) => {
    const sheet = byToken(req.params.token);
    if (!sheet) return res.redirect(`/goedkeuren/${encodeURIComponent(req.params.token)}`);
    if (sheet.approval_expires && sheet.approval_expires < today()) return approvalPage(req, res, sheet);
    const naam = clean(req.body.naam, 100);
    const reden = clean(req.body.reden, 500);
    return attempt(() => {
      if (req.body.actie === 'afkeuren') {
        ts.reject(db, sheet.id, naam, reden, 'goedkeuringslink');
        return res.page('Uren afgekeurd', html`<div class="approve-page"><div class="result result--warn"><h1>Uren afgekeurd</h1><p>${sheet.zzp_naam} krijgt je opmerking te zien en kan de uren aanpassen en opnieuw indienen.</p><p class="quote">${reden}</p></div></div>`, { bare: true });
      }
      ts.approve(db, sheet.id, naam, 'goedkeuringslink');
      res.redirect(303, `/goedkeuren/${encodeURIComponent(req.params.token)}`);
    }, (msg) => approvalPage(req, res, byToken(req.params.token) || sheet, msg));
  });

  // ---------- factuur via link ----------
  const invoiceByToken = (t) => {
    const f = db.get(`SELECT id FROM facturen WHERE public_token = ? AND status IN ('definitief', 'verzonden', 'betaald')`, String(t));
    return f ? loadInvoice(db, f.id) : null;
  };

  r.get('/factuur/:token', (req, res) => {
    const inv = invoiceByToken(req.params.token);
    if (!inv) return res.status(404).page('Factuur niet gevonden', html`<div class="auth"><h1>Factuur niet gevonden</h1><p>Deze link is ongeldig.</p></div>`, { bare: true });
    res.page(`Factuur ${inv.nummer || inv.extern_nummer}`, html`
      <div class="doc-actions no-print">
        <button class="btn" type="button" data-print>Printen of opslaan als pdf</button>
        <a class="btn" href="/factuur/${encodeURIComponent(req.params.token)}/ubl">Download UBL (boekhouding)</a>
      </div>
      ${invoiceDoc(inv)}`, { bare: true });
  });

  r.get('/factuur/:token/ubl', (req, res) => {
    const inv = invoiceByToken(req.params.token);
    if (!inv) return res.status(404).send('Niet gevonden');
    res.type('application/xml').attachment(`${inv.nummer || inv.extern_nummer || `factuur-${inv.id}`}.xml`).send(invoiceUbl(inv));
  });

  return r;
}
