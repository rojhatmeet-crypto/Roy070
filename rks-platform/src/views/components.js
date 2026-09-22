import { html, raw, attrs } from './html.js';
import { euro, hours, fmtDate, fmtDateShort, fmtDay, weekLabel, today, lineAmount, centsToInput } from '../util.js';

export const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

export function pageHead({ title, sub = '', eyebrow = '', actions = '' }) {
  return html`<div class="page-head">
    <div>
      ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
      <h1>${title}</h1>
      ${sub ? html`<p class="page-head__sub">${sub}</p>` : ''}
    </div>
    ${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}
  </div>`;
}

const SHEET_STATUS = {
  concept: ['neutral', 'Nog niet ingediend'],
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
    wacht_op_factuur: ['warn', 'Wacht op factuur zzp\'er'],
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

// Weektabel van een urenstaat, alleen lezen.
export function hoursTable(entries) {
  const total = entries.reduce((a, e) => a + e.minuten, 0);
  return html`<table class="table hours-table">
    <thead><tr><th>Dag</th><th class="num">Uren</th><th>Omschrijving</th></tr></thead>
    <tbody>${entries.map((e) => html`<tr class="${e.minuten ? '' : 'is-empty'}">
      <td><span class="day">${fmtDay(e.datum)}</span> ${fmtDateShort(e.datum)}</td>
      <td class="num">${e.minuten ? hours(e.minuten) : '–'}</td>
      <td>${e.omschrijving}</td></tr>`)}</tbody>
    <tfoot><tr><td>Totaal</td><td class="num">${hours(total)}</td><td></td></tr></tfoot>
  </table>`;
}

// Invulformulier voor een week (zzp'er of beheer namens zzp'er).
export function hoursForm({ action, csrf, entries, editable, submitLabel = 'Indienen ter goedkeuring' }) {
  const total = entries.reduce((a, e) => a + e.minuten, 0);
  return html`<form class="hours-form" method="post" action="${action}" data-hours-form>
    ${csrfField(csrf)}
    <div class="hours-grid">
      ${entries.map((e, i) => html`<div class="hours-row">
        <label class="hours-row__day" for="h-${i}"><span class="day">${fmtDay(e.datum)}</span> ${fmtDateShort(e.datum)}</label>
        <input class="hours-row__input" id="h-${i}" name="uren_${e.datum}" inputmode="decimal" autocomplete="off"
               value="${e.minuten ? (e.minuten / 60).toString().replace('.', ',') : ''}" placeholder="0" ${editable ? '' : raw('disabled')}
               aria-label="Uren op ${fmtDay(e.datum)} ${fmtDateShort(e.datum)}">
        <input class="hours-row__note" name="note_${e.datum}" value="${e.omschrijving}" placeholder="Wat heb je gedaan?" maxlength="200"
               ${editable ? '' : raw('disabled')} aria-label="Omschrijving ${fmtDay(e.datum)}">
      </div>`)}
    </div>
    <div class="hours-total"><span>Totaal deze week</span><strong data-hours-total>${hours(total)} uur</strong></div>
    ${editable ? html`<div class="form-actions">
      <button class="btn btn--primary" type="submit" name="actie" value="indienen">${submitLabel}</button>
      <button class="btn" type="submit" name="actie" value="opslaan">Opslaan als concept</button>
    </div>
    <p class="hint">Vul uren in per kwartier, zoals 8 of 7,75. Na indienen kun je niets meer wijzigen tot de uren zijn goed- of afgekeurd.</p>` : ''}
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
    <div class="approval__actions">
      <button class="btn btn--primary btn--lg" type="submit" name="actie" value="goedkeuren">Uren goedkeuren</button>
    </div>
    <details class="reject">
      <summary>Klopt er iets niet?</summary>
      <div class="field">
        <label for="f-reden">Wat moet er worden aangepast?</label>
        <textarea id="f-reden" name="reden" rows="3" maxlength="500" placeholder="Bijvoorbeeld: vrijdag was 6 uur in plaats van 8."></textarea>
      </div>
      <button class="btn btn--danger" type="submit" name="actie" value="afkeuren">Uren afkeuren</button>
    </details>
  </form>`;
}

export function shareButtons({ url, text, phone = '', email = '', subject = '' }) {
  const wa = `https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '31')}?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const waAny = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const mail = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;
  return html`<div class="share">
    <div class="share__link"><input readonly value="${url}" aria-label="Link" data-select><button class="btn btn--sm" type="button" data-copy="${url}">Kopieer link</button></div>
    <div class="share__buttons">
      <a class="btn btn--whatsapp" href="${phone ? wa : waAny}" target="_blank" rel="noopener">Stuur via WhatsApp</a>
      ${email ? html`<a class="btn" href="${mail}">Stuur per e-mail</a>` : ''}
    </div>
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
