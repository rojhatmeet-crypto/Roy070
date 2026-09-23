// Portaal voor de zzp'er: uren invullen en indienen, facturen en gegevens bekijken.
import { Router } from 'express';
import { html } from '../views/html.js';
import { pageHead, hoursForm, hoursTable, sheetBadge, invoiceBadge, shareButtons, emptyState, weekNav } from '../views/components.js';
import { invoiceDoc } from '../views/invoice.js';
import { requireRole } from '../auth.js';
import * as ts from '../domain/timesheets.js';
import { loadInvoice } from '../domain/invoices.js';
import { currentWeek } from '../domain/dashboard.js';
import { euro, hours, weekLabel, isValidWeek, fmtDate, today, addDays, toInt, weekNumber } from '../util.js';
import { parseHoursForm, baseUrl, approvalText, attempt } from './shared.js';

export default function zzpRoutes(db) {
  const r = Router();
  r.use(requireRole('zzp'));

  const myPlacement = (req, id) => db.get(`
    SELECT p.*, pr.naam AS project_naam, pr.projectnummer, pr.locatie, k.naam AS klant_naam
      FROM plaatsingen p JOIN projecten pr ON pr.id = p.project_id JOIN klanten k ON k.id = pr.klant_id
     WHERE p.id = ? AND p.zzp_id = ?`, id, req.user.zzp_id);

  r.get('/', (req, res) => {
    const week = currentWeek();
    const placements = db.all(`
      SELECT p.id, p.functie, p.inkoop_cents, pr.naam AS project_naam, k.naam AS klant_naam, u.status,
             (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
        FROM plaatsingen p JOIN projecten pr ON pr.id = p.project_id JOIN klanten k ON k.id = pr.klant_id
        LEFT JOIN urenstaten u ON u.plaatsing_id = p.id AND u.week = ?
       WHERE p.zzp_id = ? AND p.actief = 1 ORDER BY p.id DESC`, week, req.user.zzp_id);
    const recent = db.all(`
      SELECT u.id, u.week, u.status, u.plaatsing_id, u.afkeur_reden, pr.naam AS project_naam,
             (SELECT COALESCE(SUM(minuten), 0) FROM uren WHERE urenstaat_id = u.id) AS minuten
        FROM urenstaten u JOIN plaatsingen p ON p.id = u.plaatsing_id JOIN projecten pr ON pr.id = p.project_id
       WHERE p.zzp_id = ? AND u.week < ? ORDER BY u.week DESC, u.id DESC LIMIT 12`, req.user.zzp_id, week);
    const several = new Set(recent.map((u) => u.plaatsing_id)).size > 1;

    res.page('Uren', html`<div class="narrow">
      ${pageHead({ title: 'Mijn uren', sub: weekLabel(week) })}
      ${placements.length ? html`<div class="cards">
        ${placements.map((p) => {
          const open = !p.status || ['concept', 'afgekeurd'].includes(p.status);
          return html`<section class="card job">
            <div class="job__top">
              <div><h2 class="job__title">${p.project_naam}</h2><p class="job__meta">${p.klant_naam} · ${p.functie}</p></div>
              ${sheetBadge(p.status || 'concept')}
            </div>
            <div class="job__actions">
              <a class="btn ${open ? 'btn--primary' : ''}" href="/mijn/uren/${p.id}/${week}">${open ? 'Uren invullen' : `Bekijk ${hours(p.minuten)} uur`}</a>
              <span class="muted small">${euro(p.inkoop_cents)} per uur</span>
            </div>
          </section>`;
        })}
      </div>` : emptyState('Je hebt op dit moment geen opdracht.')}

      ${recent.length ? html`<h2 class="section-title">Eerdere weken</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Week</th><th class="num">Uren</th><th>Status</th></tr></thead>
        <tbody>${recent.map((u) => html`<tr>
          <td><a href="/mijn/uren/${u.plaatsing_id}/${u.week}">Week ${weekNumber(u.week)}</a>${several ? html`<p class="muted small">${u.project_naam}</p>` : ''}
            ${u.status === 'afgekeurd' ? html`<p class="error">${u.afkeur_reden}</p>` : ''}</td>
          <td class="num">${hours(u.minuten)}</td><td>${sheetBadge(u.status)}</td></tr>`)}</tbody>
      </table></div>` : ''}</div>`);
  });

  const sheetPage = (req, res, p, week, error = '') => {
    const existing = db.get('SELECT * FROM urenstaten WHERE plaatsing_id = ? AND week = ?', p.id, week);
    const sheet = existing ? ts.loadTimesheet(db, existing.id) : null;
    const entries = sheet ? ts.entries(db, sheet.id, week) : ts.entries(db, -1, week);
    const status = sheet?.status || 'concept';
    const editable = ['concept', 'afgekeurd'].includes(status);
    const url = `/mijn/uren/${p.id}`;
    const nav = weekNav(`${url}/`, week);
    let statusBlock = '';
    if (status === 'ingediend' && sheet.approval_token) {
      statusBlock = html`<div class="panel panel--warn">
        <p><strong>Ingediend.</strong> Wacht op goedkeuring van ${sheet.goedkeurder_naam || 'de uitvoerder'}.</p>
        ${shareButtons({ url: `${baseUrl(req)}/goedkeuren/${sheet.approval_token}`, text: approvalText(sheet), phone: sheet.goedkeurder_telefoon, email: sheet.goedkeurder_email, subject: `Uren ${sheet.zzp_naam} week ${weekNumber(week)}` })}
      </div>`;
    } else if (status === 'goedgekeurd') {
      statusBlock = html`<div class="panel panel--good"><p><strong>Goedgekeurd</strong> door ${sheet.goedgekeurd_door} op ${fmtDate(sheet.goedgekeurd_op.slice(0, 10))}.</p></div>`;
    } else if (status === 'afgekeurd') {
      statusBlock = html`<div class="panel panel--crit"><p><strong>Afgekeurd</strong> door ${sheet.goedgekeurd_door}: ${sheet.afkeur_reden}</p><p>Pas de uren aan en dien ze opnieuw in.</p></div>`;
    }
    res.page(`Uren week ${weekNumber(week)}`, html`<div class="narrow">
      ${pageHead({ back: { href: '/mijn', label: 'Mijn uren' }, title: p.project_naam, sub: `${p.klant_naam} · ${p.functie}` })}
      ${nav}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      ${statusBlock}
      <div class="card">${editable ? hoursForm({ action: `${url}/${week}`, csrf: req.csrf, entries, editable: true }) : hoursTable(entries)}</div></div>`);
  };

  r.get('/uren/:plaatsing/:week', (req, res) => {
    const p = myPlacement(req, toInt(req.params.plaatsing));
    if (!p || !isValidWeek(req.params.week)) return res.status(404).page('Niet gevonden', emptyState('Deze opdracht of week bestaat niet.'));
    sheetPage(req, res, p, req.params.week);
  });

  r.post('/uren/:plaatsing/:week', (req, res) => {
    const p = myPlacement(req, toInt(req.params.plaatsing));
    const week = req.params.week;
    if (!p || !isValidWeek(week)) return res.status(404).send('Niet gevonden');
    if (!p.actief) return sheetPage(req, res, p, week, 'Deze opdracht is afgesloten.');
    const parsed = parseHoursForm(req.body, week);
    if (parsed.error) return sheetPage(req, res, p, week, parsed.error);
    return attempt(() => {
      const sheet = ts.findOrCreate(db, p.id, week);
      ts.save(db, sheet.id, parsed.items, req.user.email);
      if (req.body.actie === 'indienen') {
        ts.submit(db, sheet.id, req.user.email);
      } else {
        res.flash('Opgeslagen.');
      }
      res.redirect(303, `/mijn/uren/${p.id}/${week}`);
    }, (msg) => sheetPage(req, res, p, week, msg));
  });

  r.get('/facturen', (req, res) => {
    const rows = db.all(`SELECT * FROM facturen WHERE soort = 'inkoop' AND zzp_id = ? ORDER BY week DESC, id DESC LIMIT 100`, req.user.zzp_id);
    const open = rows.filter((f) => ['definitief', 'verzonden'].includes(f.status)).reduce((a, f) => a + f.totaal_cents, 0);
    res.page('Facturen', html`
      ${pageHead({ title: 'Facturen' })}
      <div class="kpis kpis--2">
        <div class="kpi"><span class="kpi__label">Nog te ontvangen</span><span class="kpi__value">${euro(open)}</span></div>
        <div class="kpi"><span class="kpi__label">Betaald dit jaar</span><span class="kpi__value">${euro(rows.filter((f) => f.status === 'betaald' && (f.betaald_op || '').startsWith(today().slice(0, 4))).reduce((a, f) => a + f.totaal_cents, 0))}</span></div>
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Factuur</th><th>Week</th><th class="num">Bedrag</th><th>Status</th></tr></thead>
        <tbody>${rows.map((f) => html`<tr>
          <td><a href="/mijn/facturen/${f.id}">${f.nummer || f.extern_nummer || 'Wacht op jouw factuur'}</a></td>
          <td>Week ${weekNumber(f.week)}</td><td class="num">${euro(f.totaal_cents)}</td>
          <td>${invoiceBadge(f)}${f.betaald_op ? html` <span class="muted small">${fmtDate(f.betaald_op)}</span>` : ''}</td></tr>`)}</tbody>
      </table></div>` : emptyState('Nog geen facturen.')}`);
  });

  r.get('/facturen/:id', (req, res) => {
    const f = db.get(`SELECT id FROM facturen WHERE id = ? AND soort = 'inkoop' AND zzp_id = ?`, toInt(req.params.id), req.user.zzp_id);
    if (!f) return res.status(404).page('Niet gevonden', emptyState('Factuur niet gevonden.'));
    const inv = loadInvoice(db, f.id);
    res.page('Factuur', html`
      ${pageHead({ back: { href: '/mijn/facturen', label: 'Facturen' }, title: inv.nummer || inv.extern_nummer || `Week ${weekNumber(inv.week)}`, actions: html`<button class="btn" type="button" data-print>Printen</button>` })}
      ${inv.status === 'wacht_op_factuur' ? html`<p class="panel panel--warn no-print">Stuur je eigen factuur van ${euro(inv.totaal_cents)} aan RKS Infra.</p>` : ''}
      ${invoiceDoc(inv)}`);
  });

  r.get('/gegevens', (req, res) => {
    const z = db.get('SELECT * FROM zzpers WHERE id = ?', req.user.zzp_id);
    const certs = db.all('SELECT * FROM certificaten WHERE zzp_id = ? ORDER BY geldig_tot', z.id);
    const t = today(), soon = addDays(t, 30);
    res.page('Mijn gegevens', html`
      ${pageHead({ title: 'Mijn gegevens', sub: 'Klopt er iets niet? Laat het RKS weten.' })}
      <div class="grid-2">
        <div class="card"><h2>Bedrijf</h2><dl class="facts">
          <div><dt>Naam</dt><dd>${z.naam}</dd></div>
          <div><dt>Bedrijfsnaam</dt><dd>${z.bedrijfsnaam || '–'}</dd></div>
          <div><dt>KvK</dt><dd>${z.kvk || '–'}</dd></div>
          <div><dt>Btw-id</dt><dd>${z.btw_id || (z.btw_regime === 'kor' ? 'KOR, geen btw' : '–')}</dd></div>
          <div><dt>IBAN</dt><dd>${z.iban || '–'}</dd></div>
          <div><dt>Self-billing</dt><dd>${z.selfbilling_akkoord_op ? `Akkoord sinds ${fmtDate(z.selfbilling_akkoord_op)}` : 'Nee, je stuurt zelf facturen'}</dd></div>
        </dl></div>
        <div class="card"><h2>Certificaten</h2>
          ${certs.length ? html`<ul class="list">${certs.map((c) => html`<li><span>${c.soort}</span>${c.geldig_tot ? html`<span class="badge badge--${c.geldig_tot < t ? 'crit' : c.geldig_tot <= soon ? 'warn' : 'good'}">${c.geldig_tot < t ? 'Verlopen' : 'Geldig tot'} ${fmtDate(c.geldig_tot)}</span>` : ''}</li>`)}</ul>` : html`<p class="muted">Geen certificaten.</p>`}
        </div>
      </div>`);
  });

  return r;
}
