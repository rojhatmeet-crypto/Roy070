import { html, raw } from '../../views/html.js';
import { pageHead, kpi, emptyState } from '../../views/components.js';
import * as dash from '../../domain/dashboard.js';
import { euro, euro0, hours, weekLabel, shiftWeek, isValidWeek, weekNumber, fmtDate } from '../../util.js';

// Staafgrafiek brutomarge per week. De gekozen week in het accent, de rest grijs.
function marginChart(series, selected) {
  const W = 640, H = 220, padL = 56, padR = 12, padT = 18, padB = 30;
  const max = Math.max(...series.map((s) => s.marge), 1);
  const rawStep = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= rawStep);
  const top = step * Math.ceil(max / step);
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const slot = (W - padL - padR) / series.length;
  const bw = Math.min(24, slot * 0.5);
  const ticks = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);

  const bars = series.map((s, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const y0 = y(0), y1 = y(Math.max(0, s.marge));
    const h = y0 - y1;
    const r = Math.min(4, h);
    const d = h > 0 ? `M${x},${y0} L${x},${y1 + r} Q${x},${y1} ${x + r},${y1} L${x + bw - r},${y1} Q${x + bw},${y1} ${x + bw},${y1 + r} L${x + bw},${y0} Z` : '';
    const isSel = s.week === selected;
    return `<g class="bar${isSel ? ' is-selected' : ''}"><title>Week ${weekNumber(s.week)}: ${euro0(s.marge)} brutomarge, ${hours(s.minuten)} uur</title>
      <rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${H - padT - padB}"></rect>
      ${d ? `<path d="${d}"></path>` : ''}
      ${isSel ? `<text class="val" x="${x + bw / 2}" y="${y1 - 6}" text-anchor="middle">${euro0(s.marge)}</text>` : ''}
      <text class="xl" x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">wk ${weekNumber(s.week)}</text></g>`;
  }).join('');
  const grid = ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"></line><text class="yl" x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${euro0(v * 1).replace('€ ', '€')}</text>`).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Brutomarge per week, laatste ${series.length} weken"><g class="grid">${grid}</g>${bars}</svg>`);
}

export function dashboardRoute(db) {
  return (req, res) => {
    const latest = db.get(`SELECT MAX(week) AS w FROM urenstaten WHERE status = 'goedgekeurd'`).w;
    const week = isValidWeek(req.query.week) ? req.query.week : (latest || dash.currentWeek());
    const s = dash.periodStats(db, [week]);
    const prev = dash.periodStats(db, [shiftWeek(week, -1)]);
    const last4 = dash.periodStats(db, [0, 1, 2, 3].map((i) => shiftWeek(week, -i)));
    const rec = dash.receivables(db);
    const pending = db.get(`SELECT COUNT(*) AS n FROM urenstaten WHERE status = 'ingediend'`).n;
    const series = dash.weeklySeries(db, week, 8);
    const perKlant = dash.breakdown(db, [week], 'klant');
    const perZzp = dash.breakdown(db, [week], 'zzp');
    const alerts = dash.alerts(db);
    const delta = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}% t.o.v. vorige week` : '');

    res.page('Dashboard', html`
      ${pageHead({ eyebrow: 'Dashboard', title: weekLabel(week), actions: html`<nav class="week-nav week-nav--compact" aria-label="Week kiezen">
        <a class="btn btn--sm" href="/beheer?week=${shiftWeek(week, -1)}">Vorige</a>
        <a class="btn btn--sm" href="/beheer?week=${dash.currentWeek()}">Deze week</a>
        <a class="btn btn--sm" href="/beheer?week=${shiftWeek(week, 1)}">Volgende</a></nav>` })}

      <section class="kpis kpis--hero" aria-label="Kerncijfers van de week">
        <div class="kpi kpi--hero"><span class="kpi__label">Brutomarge</span><span class="kpi__value">${euro0(s.marge)}</span><span class="kpi__note">${delta(s.marge, prev.marge)}</span></div>
        ${kpi({ label: 'Actieve zzp\'ers', value: s.zzpers })}
        ${kpi({ label: 'Goedgekeurde uren', value: hours(s.minuten) })}
        ${kpi({ label: 'Omzet', value: euro0(s.omzet) })}
        ${kpi({ label: 'Zzp-kosten', value: euro0(s.kosten) })}
        ${kpi({ label: 'Gemiddelde marge', value: `${euro(s.margePerUur)} /u`, note: s.omzet ? `${Math.round((s.marge / s.omzet) * 1000) / 10}% van de omzet` : '' })}
      </section>

      <section class="kpis kpis--4" aria-label="Openstaand">
        ${kpi({ label: 'Openstaande facturen', value: euro0(rec.debiteuren), note: rec.teLaatAantal ? `${euro0(rec.teLaat)} over de vervaldatum` : `${rec.debiteurenAantal} facturen`, tone: rec.teLaatAantal ? 'crit' : '' })}
        ${kpi({ label: 'Te betalen aan zzp\'ers', value: euro0(rec.crediteuren), note: `${rec.crediteurenAantal} facturen` })}
        ${kpi({ label: 'Wacht op goedkeuring', value: pending, note: 'urenstaten', tone: pending ? 'warn' : '' })}
        ${kpi({ label: 'Concepten klaar', value: rec.conceptAantal, note: euro0(rec.conceptBedrag) })}
      </section>

      <div class="grid-2 grid-2--wide">
        <section class="card">
          <div class="card__head"><h2>Brutomarge per week</h2><span class="muted small">Laatste 4 weken: ${euro0(last4.marge)} · ${hours(last4.minuten)} uur</span></div>
          ${marginChart(series, week)}
          <details class="table-toggle"><summary>Toon als tabel</summary>
            <table class="table table--compact"><thead><tr><th>Week</th><th class="num">Uren</th><th class="num">Omzet</th><th class="num">Marge</th><th class="num">Per uur</th></tr></thead>
            <tbody>${series.map((x) => html`<tr><td>${weekNumber(x.week)}</td><td class="num">${hours(x.minuten)}</td><td class="num">${euro0(x.omzet)}</td><td class="num">${euro0(x.marge)}</td><td class="num">${euro(x.margePerUur)}</td></tr>`)}</tbody></table>
          </details>
        </section>
        <section class="card">
          <div class="card__head"><h2>Aandacht nodig</h2><span class="muted small">${alerts.length} signalen</span></div>
          ${alerts.length ? html`<ul class="alerts">${alerts.slice(0, 8).map((a) => html`<li class="alert alert--${a.ernst}">
            <span class="alert__icon" aria-hidden="true"></span><a href="${a.link}">${a.tekst}${a.datum ? ` ${fmtDate(a.datum)}` : ''}</a></li>`)}</ul>
            ${alerts.length > 8 ? html`<p class="muted small">En nog ${alerts.length - 8} andere.</p>` : ''}` : html`<p class="muted">Alles op orde.</p>`}
        </section>
      </div>

      <div class="grid-2">
        <section class="card"><h2>Per klant</h2>${perKlant.length ? breakdownTable(perKlant, 'Klant', '/beheer/klanten/') : emptyState('Geen goedgekeurde uren in deze week.')}</section>
        <section class="card"><h2>Per vakman</h2>${perZzp.length ? breakdownTable(perZzp, 'Vakman', '/beheer/zzpers/') : emptyState('Geen goedgekeurde uren in deze week.')}</section>
      </div>`);
  };
}

const breakdownTable = (rows, label, link) => html`<div class="table-wrap"><table class="table table--compact">
  <thead><tr><th>${label}</th><th class="num">Uren</th><th class="num">Omzet</th><th class="num">Marge</th><th class="num">Per uur</th></tr></thead>
  <tbody>${rows.map((r) => html`<tr><td><a href="${link}${r.id}">${r.naam}</a></td><td class="num">${hours(r.minuten)}</td><td class="num">${euro0(r.omzet)}</td><td class="num">${euro0(r.marge)}</td><td class="num">${euro(r.margePerUur)}</td></tr>`)}</tbody>
</table></div>`;
