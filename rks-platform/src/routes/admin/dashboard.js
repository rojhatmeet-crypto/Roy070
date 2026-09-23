import { html, raw } from '../../views/html.js';
import { pageHead, kpi, emptyState, weekNav } from '../../views/components.js';
import * as dash from '../../domain/dashboard.js';
import { euro, euro0, hours, weekLabel, shiftWeek, isValidWeek, weekNumber } from '../../util.js';

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
    const per = req.query.per === 'zzp' ? 'zzp' : 'klant';
    const s = dash.periodStats(db, [week]);
    const prev = dash.periodStats(db, [shiftWeek(week, -1)]);
    const series = dash.weeklySeries(db, week, 8);
    const rows = dash.breakdown(db, [week], per);
    const todo = dash.todo(db);
    const delta = prev.marge ? Math.round(((s.marge - prev.marge) / Math.abs(prev.marge)) * 100) : null;
    const tab = (key, label) => html`<a href="/beheer?week=${week}&per=${key}"${per === key ? raw(' aria-current="page"') : ''}>${label}</a>`;

    res.page('Overzicht', html`
      ${pageHead({ title: 'Overzicht', actions: weekNav('/beheer?week=', week) })}

      <section class="kpis" aria-label="Kerncijfers van de week">
        ${kpi({ label: 'Goedgekeurde uren', value: hours(s.minuten), note: `${s.zzpers} ${s.zzpers === 1 ? 'vakman' : 'vakmensen'}` })}
        ${kpi({ label: 'Omzet', value: euro0(s.omzet) })}
        ${kpi({ label: 'Brutomarge', value: euro0(s.marge), note: delta === null ? '' : `${delta >= 0 ? '+' : ''}${delta}% t.o.v. vorige week` })}
        ${kpi({ label: 'Marge per uur', value: euro(s.margePerUur), note: s.omzet ? `${Math.round((s.marge / s.omzet) * 1000) / 10}% van de omzet` : '' })}
      </section>

      <div class="grid-2 grid-2--wide">
        <section class="card">
          <div class="card__head"><h2>Brutomarge per week</h2></div>
          ${marginChart(series, week)}
          <details class="table-toggle"><summary>Als tabel</summary>
            <table class="table table--compact"><thead><tr><th>Week</th><th class="num">Uren</th><th class="num">Omzet</th><th class="num">Marge</th><th class="num">Per uur</th></tr></thead>
            <tbody>${series.map((x) => html`<tr><td>${weekNumber(x.week)}</td><td class="num">${hours(x.minuten)}</td><td class="num">${euro0(x.omzet)}</td><td class="num">${euro0(x.marge)}</td><td class="num">${euro(x.margePerUur)}</td></tr>`)}</tbody></table>
          </details>
        </section>
        <section class="card">
          <div class="card__head"><h2>Actie nodig</h2></div>
          ${todo.length ? html`<ul class="todo">${todo.map((t) => html`<li><a href="${t.link}">
            <span class="todo__dot todo__dot--${t.ernst}" aria-hidden="true"></span><span class="todo__text">${t.tekst}</span><span class="todo__count">${t.aantal}</span></a></li>`)}</ul>`
            : html`<p class="muted">Niets te doen.</p>`}
        </section>
      </div>

      <section class="card">
        <div class="card__head"><h2>${weekLabel(week)}</h2><div class="tabs">${tab('klant', 'Per klant')}${tab('zzp', 'Per vakman')}</div></div>
        ${rows.length ? breakdownTable(rows, per === 'zzp' ? 'Vakman' : 'Klant', per === 'zzp' ? '/beheer/zzpers/' : '/beheer/klanten/') : emptyState('Geen goedgekeurde uren in deze week.')}
      </section>`);
  };
}

const breakdownTable = (rows, label, link) => html`<div class="table-wrap"><table class="table">
  <thead><tr><th>${label}</th><th class="num">Uren</th><th class="num">Omzet</th><th class="num">Marge</th><th class="num">Per uur</th></tr></thead>
  <tbody>${rows.map((r) => html`<tr><td><a href="${link}${r.id}">${r.naam}</a></td><td class="num">${hours(r.minuten)}</td><td class="num">${euro0(r.omzet)}</td><td class="num">${euro0(r.marge)}</td><td class="num">${euro(r.margePerUur)}</td></tr>`)}</tbody>
</table></div>`;
