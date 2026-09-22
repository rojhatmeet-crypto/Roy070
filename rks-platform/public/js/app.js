// Kleine verbeteringen bovenop de server-pagina's. Alles werkt ook zonder JavaScript.
(() => {
  'use strict';
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Kopieerknoppen
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copy;
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Gekopieerd'; }
    catch { const input = btn.parentElement.querySelector('input'); if (input) { input.select(); } btn.textContent = 'Geselecteerd'; }
    setTimeout(() => { btn.textContent = label; }, 1800);
  });
  $$('[data-select]').forEach((el) => el.addEventListener('focus', () => el.select()));

  // Printen
  $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));

  // Bevestiging bij verwijderen
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-confirm]');
    if (el && !window.confirm(el.dataset.confirm)) e.preventDefault();
  });

  const toMinutes = (v) => {
    const s = String(v || '').trim();
    if (!s) return 0;
    if (/^\d{1,2}:\d{2}$/.test(s)) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : 0;
  };
  const fmtHours = (min) => (min / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 });

  // Live totaal in het urenformulier
  $$('[data-hours-form]').forEach((form) => {
    const out = form.querySelector('[data-hours-total]');
    const update = () => {
      const total = $$('.hours-row__input', form).reduce((a, i) => a + toMinutes(i.value), 0);
      out.textContent = `${fmtHours(total)} uur`;
    };
    form.addEventListener('input', update);
  });

  // Live marge in het opdrachtformulier
  $$('[data-margin-form]').forEach((form) => {
    const inkoop = form.querySelector('[data-inkoop]');
    const verkoop = form.querySelector('[data-verkoop]');
    const out = form.querySelector('[data-margin-out]');
    const euro = (v) => v.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
    const parse = (v) => { let s = String(v || '').replace(/[€\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = Number(s); return s && Number.isFinite(n) ? n : null; };
    const update = () => {
      const a = parse(inkoop.value), b = parse(verkoop.value);
      if (a === null || b === null) { out.textContent = ''; return; }
      const m = b - a;
      out.textContent = `Marge ${euro(m)} per uur${b ? `, ${(m / b * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}% van de verkoopprijs` : ''}. Bij 40 uur per week: ${euro(m * 40)}.`;
      out.classList.toggle('is-neg', m < 0);
    };
    form.addEventListener('input', update);
    update();
  });
})();
