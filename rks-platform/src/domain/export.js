// Export naar de boekhouding: CSV (alle facturen in een periode) en UBL 2.1
// per factuur (NLCIUS). UBL importeren Moneybird, Exact Online, e-Boekhouden
// en de meeste andere pakketten. Test de eerste import altijd even met je boekhouder.
import { REGELINGEN, factuurVermeldingen } from './btw.js';
import { weekDays } from '../util.js';

const csvCell = (v) => {
  const s = String(v ?? '');
  // voorkom formule-injectie in spreadsheets
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const dec = (cents) => (cents / 100).toFixed(2).replace('.', ',');

export function invoicesCsv(rows) {
  const head = ['soort', 'nummer', 'extern_nummer', 'status', 'factuurdatum', 'vervaldatum', 'week', 'relatie', 'kvk', 'btw_id',
    'btw_regeling', 'bedrag_excl', 'btw', 'totaal', 'self_billing', 'betaald_op'];
  const lines = rows.map((f) => [
    f.soort, f.nummer || '', f.extern_nummer || '', f.status, f.factuurdatum || '', f.vervaldatum || '', f.week,
    f.relatie, f.relatie_kvk || '', f.relatie_btw || '', REGELINGEN[f.btw_regeling], dec(f.subtotaal_cents), dec(f.btw_cents),
    dec(f.totaal_cents), f.selfbilling ? 'ja' : 'nee', f.betaald_op || '',
  ].map(csvCell).join(';'));
  return '﻿' + [head.join(';'), ...lines].join('\r\n') + '\r\n';
}

const x = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const amt = (cents) => (cents / 100).toFixed(2);

function party(p) {
  const lines = [
    '<cac:Party>',
    `<cac:PartyName><cbc:Name>${x(p.naam)}</cbc:Name></cac:PartyName>`,
    '<cac:PostalAddress>',
    `<cbc:StreetName>${x(p.adres)}</cbc:StreetName>`,
    `<cbc:CityName>${x(p.plaats)}</cbc:CityName>`,
    `<cbc:PostalZone>${x(p.postcode)}</cbc:PostalZone>`,
    '<cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country>',
    '</cac:PostalAddress>',
  ];
  if (p.btw_id) lines.push(`<cac:PartyTaxScheme><cbc:CompanyID>${x(p.btw_id)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`);
  lines.push('<cac:PartyLegalEntity>', `<cbc:RegistrationName>${x(p.naam)}</cbc:RegistrationName>`);
  if (p.kvk) lines.push(`<cbc:CompanyID schemeID="0106">${x(p.kvk)}</cbc:CompanyID>`);
  lines.push('</cac:PartyLegalEntity>', '</cac:Party>');
  return lines.join('');
}

const TAX = {
  '21': { id: 'S', pct: '21', reason: '' },
  verlegd: { id: 'AE', pct: '0', reason: '<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Btw verlegd</cbc:TaxExemptionReason>' },
  geen: { id: 'E', pct: '0', reason: '<cbc:TaxExemptionReason>Kleineondernemersregeling</cbc:TaxExemptionReason>' },
};

export function invoiceUbl(inv) {
  const t = TAX[inv.btw_regeling];
  const days = weekDays(inv.week);
  const nummer = inv.nummer || inv.extern_nummer || `CONCEPT-${inv.id}`;
  const notes = factuurVermeldingen({ regeling: inv.btw_regeling, afnemerBtwId: inv.afnemer.btw_id, selfbilling: inv.selfbilling });
  const lines = inv.regels.map((r, i) => [
    '<cac:InvoiceLine>',
    `<cbc:ID>${i + 1}</cbc:ID>`,
    `<cbc:InvoicedQuantity unitCode="HUR">${(r.minuten / 60).toFixed(2)}</cbc:InvoicedQuantity>`,
    `<cbc:LineExtensionAmount currencyID="EUR">${amt(r.bedrag_cents)}</cbc:LineExtensionAmount>`,
    `<cac:Item><cbc:Name>${x(r.omschrijving)}</cbc:Name>`,
    `<cac:ClassifiedTaxCategory><cbc:ID>${t.id}</cbc:ID><cbc:Percent>${t.pct}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>`,
    `<cac:Price><cbc:PriceAmount currencyID="EUR">${amt(r.tarief_cents)}</cbc:PriceAmount></cac:Price>`,
    '</cac:InvoiceLine>',
  ].join('')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${x(nummer)}</cbc:ID>
<cbc:IssueDate>${x(inv.factuurdatum || days[6])}</cbc:IssueDate>
${inv.vervaldatum ? `<cbc:DueDate>${x(inv.vervaldatum)}</cbc:DueDate>` : ''}
<cbc:InvoiceTypeCode>${inv.selfbilling ? '389' : '380'}</cbc:InvoiceTypeCode>
${notes.map((n) => `<cbc:Note>${x(n)}</cbc:Note>`).join('')}
<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cac:InvoicePeriod><cbc:StartDate>${days[0]}</cbc:StartDate><cbc:EndDate>${days[6]}</cbc:EndDate></cac:InvoicePeriod>
<cac:AccountingSupplierParty>${party(inv.leverancier)}</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>${party(inv.afnemer)}</cac:AccountingCustomerParty>
${inv.leverancier.iban ? `<cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cbc:PaymentID>${x(nummer)}</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>${x(inv.leverancier.iban.replace(/\s/g, ''))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ''}
<cac:TaxTotal>
<cbc:TaxAmount currencyID="EUR">${amt(inv.btw_cents)}</cbc:TaxAmount>
<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${amt(inv.subtotaal_cents)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${amt(inv.btw_cents)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${t.id}</cbc:ID><cbc:Percent>${t.pct}</cbc:Percent>${t.reason}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
</cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${amt(inv.subtotaal_cents)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${amt(inv.subtotaal_cents)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${amt(inv.totaal_cents)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${amt(inv.totaal_cents)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lines}
</Invoice>
`;
}
