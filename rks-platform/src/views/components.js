import { html, raw, attrs } from './html.js';
import { euro, hours, fmtDate, fmtDateShort, fmtDay, weekLabel, shiftWeek, today, lineAmount, centsToInput } from '../util.js';

export const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

// Paginakop: titel, optioneel een terug-link erboven en een korte regel eronder.
export function pageHead({ title, sub = '', back = null, actions = '' }) {
  return html`<div class="page-head">
    <div>
      ${back ? html`<a class="page-head__back" href="${back.href}">← ${back.label}</a>` : ''}
      <h1>${title}</h1>
      ${sub ? html`<p class="page-head__sub">${sub}</p>` : ''}
    </div>
    ${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}
  </div>`;
}

// Weekkiezer: vorige, huidige, volgende. base eindigt op '/' of '?week='.
export const weekNav = (base, week) => html`<nav class="week-nav" aria-label="Week kiezen">
  <a class="btn btn--sm" href="${base}${shiftWeek(week, -1)}" aria-label="Vorige week">‹</a>
  <strong>${weekLabel(week)}</strong>
  <a class="btn btn--sm" href="${base}${shiftWeek(week, 1)}" aria-label="Volgende week">›</a>
</nav>`;

const SHEET_STATUS = {
  concept: ['neutral', 'Niet ingediend'],
  ingediend: ['warn', 'Wacht op goedkeuring'],
  goedgekeurd: ['good', 'Goedgekeurd'],
  afgekeurd: ['crit', 'Afgekeurd'],
};
export const sheetBadge = (status) => {
  const [tone, label] = SHEET_STATUS[status] || ['neutral', status];
  return html`<span class="badge badge--${tone}">${label}</span>`;
};

export function invoiceBadge(f) {
  const overdue = ['definitief', 'verzonden'].includes(f.status) && f.soort === 'verkoop' && f.vervaldatum && f.vervaldatum < today();
  if (overdue) return html`<span class="badge badge--crit">Te laat</span>`;
  const map = {
    concept: ['neutral', 'Concept'],
    wacht_op_factuur: ['warn', 'Wacht op factuur'],
    definitief: ['info', f.soort === 'inkoop' ? 'Te betalen' : 'Definitief'],
    verzonden: ['info', 'Verzonden'],
    betaald: ['good', 'Betaald'],
  };
  const [tone, label] = map[f.status] || ['neutral', f.status];
  return html`<span class="badge badge--${tone}">${label}</span>`;
}

export function field({ label, name, value = '', type = 'text', hint = '', required = false, error = '', ...rest }) {
  const id = rest.id || `f-${name}`;
  return html`<div class="field${error ? ' has-error' : ''}">
    <label for="${id}">${label}${required ? '' : html` <span class="optional">optioneel</span>`}</label>
    <input id="${id}" name="${name}" type="${type}" value="${value ?? ''}"${attrs({ required, ...rest, id: undefined })}>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
    ${error ? html`<p class="error">${error}</p>` : ''}
  </div>`;
}

export function select({ label, name, options, value = '', hint = '', required = true }) {
  return html`<div class="field">
    <label for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}"${attrs({ required })}>
      ${options.map(([v, l]) => html`<option value="${v}"${String(v) === String(value) ? raw(' selected') : ''}>${l}</option>`)}
    </select>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
  </div>`;
}

export const moneyField = (opts) => field({ ...opts, value: centsToInput(opts.value), inputmode: 'decimal', placeholder: '0,00' });

export function emptyState(text, action = '') {
  return html`<div class="empty"><p>${text}</p>${action}</div>`;
}

// Weektabel van een urenstaat, alleen lezen. De kolom omschrijving alleen als er iets in staat.
export function hoursTable(entries) {
  const total = entries.reduce((a, e) => a + e.minuten, 0);
  const notes = entries.some((e) => e.omschrijving);
  return html`<table class="table hours-table">
    <thead><tr><th>Dag</th><th class="num">Uren</th>${notes ? html`<th>Omschrijving</th>` : ''}</tr></thead>
    <tbody>${entries.map((e) => html`<tr class="${e.minuten ? '' : 'is-empty'}">
      <td><span class="day">${fmtDay(e.datum)}</span> ${fmtDateShort(e.datum)}</td>
      <td class="num">${e.minuten ? hours(e.minuten) : '–'}</td>
      ${notes ? html`<td>${e.omschrijving}</td>` : ''}</tr>`)}</tbody>
    <tfoot><tr><td>Totaal</td><td class="num">${hours(total)}</td>${notes ? html`<td></td>` : ''}</tr></tfoot>
  </table>`;
}

// Invulformulier voor een week (zzp'er of beheer namens zzp'er).
export function hoursForm({ action, csrf, entries, editable, submitLabel = 'Indienen' }) {
  const total = entries.reduce((a, e) => a + e.minuten, 0);
  return html`<form class="hours-form" method="post" action="${action}" data-hours-form>
    ${csrfField(csrf)}
    <div class="hours-grid">
      ${entries.map((e, i) => html`<div class="hours-row${i >= 5 ? ' is-weekend' : ''}">
        <label class="hours-row__day" for="h-${i}"><span class="day">${fmtDay(e.datum)}</span> ${fmtDateShort(e.datum)}</label>
        <input class="hours-row__input" id="h-${i}" name="uren_${e.datum}" inputmode="decimal" autocomplete="off"
               value="${e.minuten ? (e.minuten / 60).toString().replace('.', ',') : ''}" placeholder="0" ${editable ? '' : raw('disabled')}>
        ${e.omschrijving ? html`<input type="hidden" name="note_${e.datum}" value="${e.omschrijving}">` : ''}
      </div>`)}
    </div>
    <div class="hours-total"><span>Totaal</span><strong data-hours-total>${hours(total)} uur</strong></div>
    ${editable ? html`<div class="form-actions">
      <button class="btn btn--primary btn--lg" type="submit" name="actie" value="indienen">${submitLabel}</button>
      <button class="btn btn--lg" type="submit" name="actie" value="opslaan">Opslaan</button>
    </div>` : ''}
  </form>`;
}

// Goedkeuren of afkeuren (publieke link en klantportaal).
export function approvalForm({ action, csrf = '', defaultName = '' }) {
  return html`<form class="approval" method="post" action="${action}">
    ${csrf ? csrfField(csrf) : ''}
    <div class="field">
      <label for="f-naam">Je naam</label>
      <input id="f-naam" name="naam" value="${defaultName}" required autocomplete="name">
    </div>
    <button class="btn btn--primary btn--lg btn--block" type="submit" name="actie" value="goedkeuren">Goedkeuren</button>
    <details class="reject">
      <summary>Afkeuren</summary>
      <div class="field">
        <label for="f-reden">Wat klopt er niet?</label>
        <textarea id="f-reden" name="reden" rows="3" maxlength="500"></textarea>
      </div>
      <button class="btn btn--danger" type="submit" name="actie" value="afkeuren">Afkeuren</button>
    </details>
  </form>`;
}

// Delen zonder de link zelf te tonen: WhatsApp, kopiëren en eventueel e-mail.
export function shareButtons({ url, text, phone = '', email = '', subject = '' }) {
  const number = phone.replace(/\D/g, '').replace(/^0/, '31');
  const wa = `https://wa.me/${number}?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const mail = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;
  return html`<div class="share">
    <a class="btn btn--whatsapp" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>
    <button class="btn" type="button" data-copy="${url}">Kopieer link</button>
    ${email ? html`<a class="btn" href="${mail}">E-mail</a>` : ''}
  </div>`;
}

export function kpi({ label, value, note = '', tone = '' }) {
  return html`<div class="kpi${tone ? ` kpi--${tone}` : ''}"><span class="kpi__label">${label}</span><span class="kpi__value">${value}</span>${note ? html`<span class="kpi__note">${note}</span>` : ''}</div>`;
}

export const rateSummary = (minuten, inkoop, verkoop) => {
  const k = lineAmount(minuten, inkoop), o = lineAmount(minuten, verkoop);
  return html`<dl class="facts">
    <div><dt>Inkoop</dt><dd>${hours(minuten)} × ${euro(inkoop)} = ${euro(k)}</dd></div>
    <div><dt>Verkoop</dt><dd>${hours(minuten)} × ${euro(verkoop)} = ${euro(o)}</dd></div>
    <div><dt>Brutomarge</dt><dd><strong>${euro(o - k)}</strong> · ${euro(verkoop - inkoop)} per uur</dd></div>
  </dl>`;
};

export { weekLabel, fmtDate };
