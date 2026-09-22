// Factuurweergave, geschikt om te printen of als pdf op te slaan.
import { html } from './html.js';
import { euro, hours, fmtDate, weekDays, weekNumber } from '../util.js';
import { factuurVermeldingen } from '../domain/btw.js';

const party = (p, label) => html`<div class="inv-party">
  <p class="inv-label">${label}</p>
  <p class="inv-party__name">${p.naam}</p>
  ${p.contact && p.contact !== p.naam ? html`<p>t.a.v. ${p.contact}</p>` : ''}
  ${p.adres ? html`<p>${p.adres}</p>` : ''}
  ${p.postcode || p.plaats ? html`<p>${p.postcode} ${p.plaats}</p>` : ''}
  ${p.kvk ? html`<p>KvK ${p.kvk}</p>` : ''}
  ${p.btw_id ? html`<p>Btw-id ${p.btw_id}</p>` : ''}
</div>`;

export function invoiceDoc(inv) {
  const days = weekDays(inv.week);
  const isConcept = ['concept', 'wacht_op_factuur'].includes(inv.status);
  const nummer = inv.nummer || inv.extern_nummer || 'Nog niet toegekend';
  const notes = factuurVermeldingen({ regeling: inv.btw_regeling, afnemerBtwId: inv.afnemer.btw_id, selfbilling: inv.selfbilling });
  const title = inv.selfbilling ? 'Factuur (self-billing)' : 'Factuur';
  return html`<article class="invoice${isConcept ? ' is-concept' : ''}">
    ${isConcept ? html`<p class="invoice__stamp">${inv.status === 'concept' ? 'Concept' : 'Wacht op factuur van de zzp\'er'}</p>` : ''}
    <header class="invoice__head">
      <div>
        ${inv.soort === 'verkoop' ? html`<img src="/img/logo.svg" alt="RKS Infra" width="150" height="56">` : html`<p class="inv-party__name inv-big">${inv.leverancier.naam}</p>`}
      </div>
      <div class="invoice__title">
        <h2>${title}</h2>
        <dl>
          <div><dt>Factuurnummer</dt><dd>${nummer}</dd></div>
          <div><dt>Factuurdatum</dt><dd>${inv.factuurdatum ? fmtDate(inv.factuurdatum) : '–'}</dd></div>
          <div><dt>Vervaldatum</dt><dd>${inv.vervaldatum ? fmtDate(inv.vervaldatum) : '–'}</dd></div>
          <div><dt>Periode</dt><dd>Week ${weekNumber(inv.week)}, ${fmtDate(days[0])} tot en met ${fmtDate(days[6])}</dd></div>
        </dl>
      </div>
    </header>
    <div class="invoice__parties">
      ${party(inv.leverancier, 'Van')}
      ${party(inv.afnemer, 'Aan')}
    </div>
    <table class="invoice__lines">
      <thead><tr><th>Omschrijving</th><th class="num">Uren</th><th class="num">Tarief</th><th class="num">Bedrag</th></tr></thead>
      <tbody>${inv.regels.map((r) => html`<tr><td>${r.omschrijving}</td><td class="num">${hours(r.minuten)}</td><td class="num">${euro(r.tarief_cents)}</td><td class="num">${euro(r.bedrag_cents)}</td></tr>`)}</tbody>
    </table>
    <div class="invoice__totals">
      <dl>
        <div><dt>Totaal exclusief btw</dt><dd>${euro(inv.subtotaal_cents)}</dd></div>
        <div><dt>${inv.btw_regeling === '21' ? 'Btw 21%' : inv.btw_regeling === 'verlegd' ? 'Btw verlegd' : 'Btw'}</dt><dd>${euro(inv.btw_cents)}</dd></div>
        <div class="grand"><dt>Te betalen</dt><dd>${euro(inv.totaal_cents)}</dd></div>
      </dl>
    </div>
    ${notes.length ? html`<ul class="invoice__notes">${notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
    <footer class="invoice__foot">
      ${inv.leverancier.iban ? html`<p>Graag het bedrag binnen de betaaltermijn overmaken naar <strong>${inv.leverancier.iban}</strong> t.n.v. ${inv.leverancier.naam}, onder vermelding van het factuurnummer.</p>` : ''}
      ${inv.selfbilling ? html`<p>Deze factuur is op basis van goedgekeurde uren opgesteld door de afnemer, met voorafgaand akkoord van de leverancier. De leverancier blijft verantwoordelijk voor de juistheid.</p>` : ''}
    </footer>
  </article>`;
}
