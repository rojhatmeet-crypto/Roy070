import { html, raw } from '../../views/html.js';
import { pageHead, invoiceBadge, shareButtons, csrfField, emptyState } from '../../views/components.js';
import { invoiceDoc } from '../../views/invoice.js';
import * as inv from '../../domain/invoices.js';
import { invoicesCsv, invoiceUbl } from '../../domain/export.js';
import { euro, fmtDate, today, toInt, weekNumber, clean, parseDate } from '../../util.js';
import { baseUrl, attempt } from '../shared.js';

const FILTERS = {
  verkoop: [['alle', 'Alle'], ['concept', 'Concept'], ['open', 'Openstaand'], ['telaat', 'Te laat'], ['betaald', 'Betaald']],
  inkoop: [['alle', 'Alle'], ['wacht', 'Wacht op factuur'], ['open', 'Te betalen'], ['betaald', 'Betaald']],
};

function query(db, soort, filter, { van = '', tot = '' } = {}) {
  const where = ['f.soort = ?'], params = [soort];
  if (filter === 'concept') where.push(`f.status = 'concept'`);
  if (filter === 'wacht') where.push(`f.status = 'wacht_op_factuur'`);
  if (filter === 'open') where.push(`f.status IN ('definitief', 'verzonden')`);
  if (filter === 'telaat') { where.push(`f.status IN ('definitief', 'verzonden') AND f.vervaldatum < ?`); params.push(today()); }
  if (filter === 'betaald') where.push(`f.status = 'betaald'`);
  if (van) { where.push('COALESCE(f.factuurdatum, f.created_at) >= ?'); params.push(van); }
  if (tot) { where.push('COALESCE(f.factuurdatum, f.created_at) <= ?'); params.push(`${tot} 23:59:59`); }
  return db.all(`
    SELECT f.*, COALESCE(k.naam, NULLIF(z.bedrijfsnaam, ''), z.naam) AS relatie, COALESCE(k.kvk, z.kvk) AS relatie_kvk, COALESCE(k.btw_id, z.btw_id) AS relatie_btw
      FROM facturen f LEFT JOIN klanten k ON k.id = f.klant_id LEFT JOIN zzpers z ON z.id = f.zzp_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE f.status WHEN 'concept' THEN 0 WHEN 'wacht_op_factuur' THEN 1 ELSE 2 END, f.week DESC, f.id DESC LIMIT 500`, ...params);
}

export function register(r, db) {
  r.get('/facturen', (req, res) => {
    const soort = req.query.soort === 'inkoop' ? 'inkoop' : 'verkoop';
    const filter = FILTERS[soort].some(([k]) => k === req.query.filter) ? req.query.filter : 'alle';
    const rows = query(db, soort, filter);
    const total = rows.reduce((a, f) => a + f.totaal_cents, 0);
    const concepts = soort === 'verkoop' ? rows.filter((f) => f.status === 'concept') : [];
    res.page('Facturen', html`
      ${pageHead({ title: 'Facturen', actions: html`<a class="btn" href="/beheer/facturen/export.csv?soort=${soort}&filter=${filter}">Exporteer CSV</a>` })}
      <div class="toolbar">
        <div class="tabs tabs--primary">
          <a href="/beheer/facturen?soort=verkoop"${soort === 'verkoop' ? raw(' aria-current="page"') : ''}>Verkoop aan klanten</a>
          <a href="/beheer/facturen?soort=inkoop"${soort === 'inkoop' ? raw(' aria-current="page"') : ''}>Inkoop van zzp'ers</a>
        </div>
        <div class="tabs">${FILTERS[soort].map(([k, l]) => html`<a href="/beheer/facturen?soort=${soort}&filter=${k}"${k === filter ? raw(' aria-current="page"') : ''}>${l}</a>`)}</div>
      </div>
      ${concepts.length ? html`<form class="panel panel--info bulk" method="post" action="/beheer/facturen/definitief-alle">${csrfField(req.csrf)}
        <p><strong>${concepts.length} conceptfacturen</strong> met goedgekeurde uren. Maak ze definitief om nummers toe te kennen.</p>
        <button class="btn btn--primary" type="submit">Alle concepten definitief maken</button></form>` : ''}
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Factuur</th><th>${soort === 'verkoop' ? 'Klant' : 'Vakman'}</th><th>Week</th><th>Vervaldatum</th><th class="num">Bedrag</th><th>Status</th></tr></thead>
        <tbody>${rows.map((f) => html`<tr>
          <td><a href="/beheer/facturen/${f.id}">${f.nummer || f.extern_nummer || (f.status === 'concept' ? 'Concept' : 'Nog geen nummer')}</a>${f.selfbilling ? html`<p class="muted small">Self-billing</p>` : ''}</td>
          <td>${f.relatie}</td><td>Week ${weekNumber(f.week)}</td><td>${f.vervaldatum ? fmtDate(f.vervaldatum) : '–'}</td>
          <td class="num">${euro(f.totaal_cents)}</td><td>${invoiceBadge(f)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="4">Totaal ${rows.length} facturen</td><td class="num">${euro(total)}</td><td></td></tr></tfoot>
      </table></div>` : emptyState('Geen facturen met dit filter.')}`);
  });

  r.get('/facturen/export.csv', (req, res) => {
    const soort = req.query.soort === 'inkoop' ? 'inkoop' : 'verkoop';
    const filter = String(req.query.filter || 'alle');
    const van = parseDate(req.query.van) ? req.query.van : '', tot = parseDate(req.query.tot) ? req.query.tot : '';
    res.type('text/csv; charset=utf-8').attachment(`rks-${soort}facturen-${today()}.csv`).send(invoicesCsv(query(db, soort, filter, { van, tot })));
  });

  r.post('/facturen/definitief-alle', (req, res) => {
    const concepts = db.all(`SELECT id FROM facturen WHERE soort = 'verkoop' AND status = 'concept' ORDER BY week, id`);
    const done = [], failed = [];
    for (const f of concepts) {
      try { done.push(inv.finalizeSales(db, f.id, req.user.email)); } catch (err) {
        if (!(err instanceof inv.InvoiceError)) throw err;
        failed.push(err.message);
      }
    }
    res.flash(done.length ? `${done.length} facturen definitief: ${done[0]}${done.length > 1 ? ` tot en met ${done[done.length - 1]}` : ''}.${failed.length ? ` ${failed.length} niet gelukt: ${failed[0]}` : ''}`
      : `Niet gelukt: ${failed[0] || 'geen concepten'}`);
    res.redirect(303, '/beheer/facturen?soort=verkoop');
  });

  const detail = (req, res, id, error = '') => {
    const f = inv.loadInvoice(db, id);
    if (!f) return res.status(404).page('Niet gevonden', emptyState('Factuur niet gevonden.'));
    const link = `${baseUrl(req)}/factuur/${f.public_token}`;
    const klant = f.klant_id ? db.get('SELECT * FROM klanten WHERE id = ?', f.klant_id) : null;
    const zzp = f.zzp_id ? db.get('SELECT * FROM zzpers WHERE id = ?', f.zzp_id) : null;
    const missing = f.soort === 'verkoop' && f.status === 'concept' ? inv.missingForSales(db, id) : [];
    const form = (actie, label, extra = '', cls = 'btn--primary') => html`<form method="post" action="/beheer/facturen/${id}" class="stack">${csrfField(req.csrf)}${extra}<button class="btn ${cls}" name="actie" value="${actie}">${label}</button></form>`;
    let actions;
    if (f.status === 'concept') {
      actions = missing.length ? html`<p class="panel panel--warn">Nog niet compleet: ${missing.join(', ')}.</p>`
        : form('definitief', 'Definitief maken', html`<p class="muted small">Je kunt nog uren toevoegen zolang de factuur concept is. Na definitief krijgt de factuur een nummer.</p>`);
    } else if (f.status === 'wacht_op_factuur') {
      actions = form('extern', 'Factuur ontvangen', html`<p class="muted small">${zzp.naam} heeft geen self-billing akkoord. Leg het nummer vast van de factuur die je van ${zzp.naam} ontving.</p>
        <div class="field"><label for="f-extern">Factuurnummer van ${zzp.naam}</label><input id="f-extern" name="extern_nummer" required></div>`);
    } else if (['definitief', 'verzonden'].includes(f.status)) {
      actions = html`
        ${f.soort === 'verkoop' ? html`<div class="stack"><h3>Versturen</h3>${shareButtons({ url: link, text: `Factuur ${f.nummer} van RKS Infra, ${euro(f.totaal_cents)}, vervaldatum ${fmtDate(f.vervaldatum)}.`, phone: klant.telefoon, email: klant.email, subject: `Factuur ${f.nummer} RKS Infra` })}
          ${f.status === 'definitief' ? form('verzonden', 'Markeer als verzonden', '', '') : html`<p class="muted small">Verzonden op ${fmtDate(f.verzonden_op)}.</p>`}</div>` : ''}
        ${form('betaald', f.soort === 'verkoop' ? 'Betaling ontvangen' : 'Betaald aan zzp\'er', html`<div class="field"><label for="f-datum">Datum betaling</label><input id="f-datum" name="datum" type="date" value="${today()}" required></div>`)}`;
    } else if (f.status === 'betaald') {
      actions = html`<p class="panel panel--good">Betaald op ${fmtDate(f.betaald_op)}.</p>`;
    }
    res.page('Factuur', html`
      ${pageHead({ eyebrow: f.soort === 'verkoop' ? 'Verkoopfactuur' : 'Inkoopfactuur', title: f.nummer || f.extern_nummer || 'Concept', actions: invoiceBadge(f) })}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <div class="invoice-layout">
        <div>${invoiceDoc(f)}</div>
        <aside class="stack no-print">
          <div class="card stack">${actions}</div>
          <div class="card stack"><h3>Downloaden</h3>
            <button class="btn" type="button" data-print>Printen of opslaan als pdf</button>
            <a class="btn" href="/beheer/facturen/${id}/ubl">UBL voor de boekhouding</a>
          </div>
          <p><a href="/beheer/facturen?soort=${f.soort}">Terug naar facturen</a></p>
        </aside>
      </div>`);
  };

  r.get('/facturen/:id', (req, res) => detail(req, res, toInt(req.params.id)));

  r.get('/facturen/:id/ubl', (req, res) => {
    const f = inv.loadInvoice(db, toInt(req.params.id));
    if (!f) return res.status(404).send('Niet gevonden');
    res.type('application/xml').attachment(`${f.nummer || f.extern_nummer || `concept-${f.id}`}.xml`).send(invoiceUbl(f));
  });

  r.post('/facturen/:id', (req, res) => {
    const id = toInt(req.params.id);
    return attempt(() => {
      const actie = req.body.actie;
      if (actie === 'definitief') res.flash(`Factuur ${inv.finalizeSales(db, id, req.user.email)} is definitief.`);
      else if (actie === 'verzonden') { inv.markSent(db, id, req.user.email); res.flash('Gemarkeerd als verzonden.'); }
      else if (actie === 'betaald') {
        const datum = parseDate(req.body.datum) ? req.body.datum : today();
        inv.markPaid(db, id, datum, req.user.email); res.flash('Betaling vastgelegd.');
      } else if (actie === 'extern') { inv.registerSupplierInvoice(db, id, clean(req.body.extern_nummer, 60), req.user.email); res.flash('Factuur van de zzp\'er vastgelegd.'); }
      res.redirect(303, `/beheer/facturen/${id}`);
    }, (msg) => detail(req, res, id, msg));
  });
}
