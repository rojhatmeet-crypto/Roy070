/* =========================================================
   RKS Infra, interactie
   Geen afhankelijkheden. Werkt zonder build-stap.
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Jaartal in de footer ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Header: rand bij scrollen ---------- */
  const header = $('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobiel menu ---------- */
  const menuToggle = $('.menu-toggle');
  const mobileMenu = $('#mobile-menu');

  const setMenu = (open) => {
    menuToggle.setAttribute('aria-expanded', String(open));
    mobileMenu.hidden = !open;
    $('.menu-toggle__label', menuToggle).textContent = open ? 'Sluiten' : 'Menu';
  };
  menuToggle.addEventListener('click', () => setMenu(mobileMenu.hidden));
  mobileMenu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileMenu.hidden) { setMenu(false); menuToggle.focus(); }
  });
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  /* ---------- Actief menu-item tijdens scrollen ---------- */
  const navLinks = $$('.main-nav a[href^="#"]');
  const sectionsById = new Map(
    navLinks.map((a) => [a.getAttribute('href').slice(1), a]).filter(([id]) => document.getElementById(id))
  );
  if ('IntersectionObserver' in window && sectionsById.size) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.remove('is-current'));
        const link = sectionsById.get(entry.target.id);
        if (link) link.classList.add('is-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sectionsById.forEach((_, id) => spy.observe(document.getElementById(id)));
  }

  /* =========================================================
     Werkzaamheden: filter
     ========================================================= */
  const works = $$('.work');
  const filters = $$('.filter');

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.filter;
      filters.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      works.forEach((card) => {
        const show = cat === 'alle' || card.dataset.cat === cat;
        card.hidden = !show;
        card.classList.remove('is-entering');
        if (show && !reducedMotion) {
          void card.offsetWidth; // herstart animatie
          card.classList.add('is-entering');
        }
      });
    });
  });

  /* =========================================================
     Werkzaamheden: detailvenster
     ========================================================= */
  const dialog = $('#work-dialog');
  const d = {
    tag: $('#drawer-tag'),
    count: $('#drawer-count'),
    title: $('#drawer-title'),
    img: $('#drawer-img'),
    content: $('#drawer-content'),
    scroll: $('#drawer-scroll'),
    cta: $('#drawer-cta'),
    prev: $('#drawer-prev'),
    next: $('#drawer-next'),
    prevLabel: $('#drawer-prev-label'),
    nextLabel: $('#drawer-next-label'),
  };
  const workIds = works.map((w) => w.id);
  let currentIndex = -1;
  let returnFocus = null;
  let afterClose = null;

  const titleOf = (card) => $('.work__title', card).textContent.trim();
  const pad = (n) => String(n).padStart(2, '0');

  const fill = (index) => {
    const card = works[index];
    const img = $('.work__media img', card);
    currentIndex = index;

    d.tag.textContent = $('.tag', card).textContent;
    d.count.textContent = `${pad(index + 1)} / ${pad(works.length)}`;
    d.title.textContent = titleOf(card);
    d.img.src = img.dataset.full || img.currentSrc || img.src;
    d.img.alt = img.alt;
    d.img.style.objectPosition = img.style.objectPosition || '';
    d.content.innerHTML = $('.work__detail', card).innerHTML;
    d.cta.dataset.discipline = card.id;
    d.cta.firstChild.textContent = `Personeel aanvragen voor ${titleOf(card).toLowerCase()} `;

    const prev = works[(index - 1 + works.length) % works.length];
    const next = works[(index + 1) % works.length];
    d.prevLabel.textContent = titleOf(prev);
    d.nextLabel.textContent = titleOf(next);
    d.scroll.scrollTop = 0;
  };

  const openDrawer = (id, { push = true } = {}) => {
    const index = workIds.indexOf(id);
    if (index === -1) return;
    fill(index);
    if (!dialog.open) {
      returnFocus = document.activeElement;
      dialog.classList.remove('is-closing');
      dialog.showModal();
      $('[data-close]', dialog).focus();
    }
    const url = `#${id}`;
    if (push && location.hash !== url) history.pushState({ drawer: id }, '', url);
    else if (!push) history.replaceState({ drawer: id, initial: !history.state }, '', url);
  };

  const finishClose = () => {
    const done = () => {
      dialog.classList.remove('is-closing');
      dialog.close();
      const card = works[currentIndex];
      const link = card ? $('.work__link', card) : null;
      const target = returnFocus && document.contains(returnFocus) ? returnFocus : link;
      if (target && !afterClose) target.focus({ preventScroll: true });
      if (afterClose) { const fn = afterClose; afterClose = null; fn(); }
    };
    if (!dialog.open) return;
    if (reducedMotion) { done(); return; }
    let finished = false;
    const once = () => { if (!finished) { finished = true; done(); } };
    dialog.classList.add('is-closing');
    dialog.addEventListener('animationend', once, { once: true });
    setTimeout(once, 450); // vangnet als er geen animationend komt
  };

  // Sluiten via knop, Esc of klik naast het venster.
  const requestClose = () => {
    if (history.state && history.state.drawer && !history.state.initial) {
      history.back(); // popstate sluit het venster
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      finishClose();
    }
  };

  const step = (dir) => {
    const index = (currentIndex + dir + works.length) % works.length;
    fill(index);
    history.replaceState({ ...(history.state || {}), drawer: works[index].id }, '', `#${works[index].id}`);
  };

  window.addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    if (workIds.includes(id)) openDrawer(id, { push: false });
    else finishClose();
  });

  dialog.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) requestClose(); });
  $('[data-close]', dialog).addEventListener('click', requestClose);
  d.prev.addEventListener('click', () => step(-1));
  d.next.addEventListener('click', () => step(1));
  dialog.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  // Aanvraag vanuit het venster: sluiten, formulier invullen, naar contact.
  d.cta.addEventListener('click', (e) => {
    e.preventDefault();
    const discipline = d.cta.dataset.discipline;
    afterClose = () => {
      setMode('personeel');
      setDiscipline(discipline);
      scrollToContact();
    };
    requestClose();
  });

  // Links naar een discipline (kaarten en footer) openen het venster.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || link.closest('dialog')) return;
    const id = link.getAttribute('href').slice(1);
    if (!workIds.includes(id)) return;
    e.preventDefault();
    openDrawer(id);
  });

  // Direct openen als de pagina met bijvoorbeeld #riolering wordt geladen.
  if (workIds.includes(location.hash.slice(1))) {
    openDrawer(location.hash.slice(1), { push: false });
  }

  /* =========================================================
     Werkwijze: stappen
     ========================================================= */
  const tabs = $$('.steps__tab');
  const progress = $('.steps__progress span');

  const selectTab = (tab, focus = false) => {
    tabs.forEach((t, i) => {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !active;
      if (active && progress) progress.style.width = `${((i + 1) / tabs.length) * 100}%`;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });

  /* =========================================================
     Kopieerknoppen
     ========================================================= */
  const copyText = async (text, fallbackEl) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      if (fallbackEl) {
        const range = document.createRange();
        range.selectNodeContents(fallbackEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return false;
    }
  };
  const flash = (btn, ok, doneText = 'Gekopieerd') => {
    const original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = ok ? doneText : 'Geselecteerd';
    btn.classList.add('is-done');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('is-done'); }, 2000);
  };
  $$('.copy[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.copy, btn.previousElementSibling);
      flash(btn, ok);
    });
  });

  /* =========================================================
     Contactformulier
     ========================================================= */
  const form = $('#contact-form');
  const result = $('#form-result');
  const preview = $('#form-preview');
  const contactSection = $('#contact');
  const mailLink = $('[data-contact="email"]');
  const waLink = $('[data-contact="whatsapp"]');
  const EMAIL = mailLink ? mailLink.dataset.address : '';
  const WHATSAPP = waLink ? waLink.dataset.number : '';

  const modeInputs = $$('input[name="mode"]', form);
  const getMode = () => (modeInputs.find((i) => i.checked) || modeInputs[0]).value;

  function setMode(mode) {
    modeInputs.forEach((i) => { i.checked = i.value === mode; });
    $$('[data-for]', form).forEach((el) => {
      const active = el.dataset.for === mode;
      el.hidden = !active;
      // Velden van de andere modus uitschakelen, zodat ze niet worden gevalideerd.
      if (el.matches('.field, fieldset')) {
        $$('input, select, textarea', el).forEach((c) => { c.disabled = !active; });
        if (el.matches('fieldset')) el.disabled = !active;
      }
    });
    const bericht = $('#f-bericht');
    bericht.placeholder = mode === 'werk'
      ? 'Bijvoorbeeld: vijf jaar ervaring als rioleur, beschikbaar vanaf volgende maand.'
      : 'Bijvoorbeeld: twee grondwerkers voor een rioolvervanging, vier weken, start maandag.';
  }

  function setDiscipline(id) {
    const select = $('#f-discipline');
    if (id && $$('option', select).some((o) => o.value === id)) select.value = id;
  }

  function scrollToContact() {
    contactSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => $('#f-naam').focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  }

  modeInputs.forEach((i) => i.addEventListener('change', () => setMode(getMode())));
  setMode(getMode());

  // Knoppen elders op de pagina kiezen alvast de juiste modus.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-mode]');
    if (!trigger || trigger.closest('dialog')) return;
    setMode(trigger.dataset.mode);
    if (!result.hidden) showForm();
  });

  const fieldOf = (input) => input.closest('.field');
  const setError = (input, message) => {
    const field = fieldOf(input);
    const out = $(`#${input.id}-error`);
    field.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (out) {
      out.textContent = message || '';
      if (message) input.setAttribute('aria-describedby', out.id);
      else input.removeAttribute('aria-describedby');
    }
  };

  const validate = () => {
    const mode = getMode();
    const checks = [
      ['#f-naam', (v) => (v ? '' : 'Vul uw naam in.')],
      ['#f-telefoon', (v) => {
        if (!v) return 'Vul een telefoonnummer in, zodat we u kunnen bellen.';
        return v.replace(/\D/g, '').length >= 10 ? '' : 'Dit telefoonnummer lijkt niet compleet. Gebruik minimaal 10 cijfers.';
      }],
      ['#f-email', (v, el) => (!v || el.validity.valid ? '' : 'Dit e-mailadres klopt niet. Controleer het apenstaartje en de domeinnaam.')],
    ];
    if (mode === 'personeel') checks.splice(1, 0, ['#f-bedrijf', (v) => (v ? '' : 'Vul de naam van uw bedrijf in.')]);

    let firstInvalid = null;
    checks.forEach(([sel, rule]) => {
      const el = $(sel);
      const message = rule(el.value.trim(), el);
      setError(el, message);
      if (message && !firstInvalid) firstInvalid = el;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  };

  // Foutmelding verdwijnt zodra het veld wordt aangepast.
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field && field.classList.contains('has-error')) setError(e.target, '');
  });

  const optionText = (sel) => {
    const el = $(sel);
    return el && el.value ? el.options[el.selectedIndex].text : '';
  };
  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, day] = iso.split('-');
    return `${day}-${m}-${y}`;
  };
  const lines = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

  const compose = () => {
    const val = (sel) => $(sel).value.trim();
    const mode = getMode();
    const note = val('#f-bericht');

    if (mode === 'personeel') {
      const discipline = optionText('#f-discipline');
      const subject = `Personeelsaanvraag${discipline ? `: ${discipline}` : ''}`;
      const body = [
        'Aanvraag personeel via de website',
        '',
        lines([['Naam', val('#f-naam')], ['Bedrijf', val('#f-bedrijf')], ['Telefoon', val('#f-telefoon')], ['E-mail', val('#f-email')]]),
        '',
        lines([
          ['Werkzaamheden', discipline],
          ['Aantal mensen', optionText('#f-aantal')],
          ['Gewenste start', formatDate(val('#f-start'))],
          ['Verwachte duur', optionText('#f-duur') || 'nog niet bekend'],
          ['Locatie', val('#f-locatie')],
        ]),
        note ? `\nToelichting:\n${note}` : '',
      ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
      return { subject, body, mode };
    }

    const papieren = $$('input[name="papieren"]:checked', form).map((c) => c.value).join(', ');
    const subject = `Aanmelding: ${val('#f-naam')}`;
    const body = [
      'Aanmelding werkzoekende via de website',
      '',
      lines([['Naam', val('#f-naam')], ['Woonplaats', val('#f-woonplaats')], ['Telefoon', val('#f-telefoon')], ['E-mail', val('#f-email')]]),
      '',
      lines([['Vakgebied', optionText('#f-discipline')], ['Ervaring', optionText('#f-ervaring')], ['Certificaten', papieren]]),
      note ? `\nToelichting:\n${note}` : '',
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { subject, body, mode };
  };

  const showForm = () => {
    result.hidden = true;
    form.hidden = false;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;
    const { subject, body, mode } = compose();

    preview.textContent = `${subject}\n\n${body}`;
    $('#send-mail').href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $('#send-whatsapp').href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`${subject}\n\n${body}`)}`;
    $('.form-result__title', result).textContent = mode === 'werk' ? 'Je aanmelding staat klaar' : 'Uw aanvraag staat klaar';
    $('p:not(.eyebrow)', result).textContent = mode === 'werk'
      ? 'Er is nog niets verstuurd. Kies hieronder hoe je het bericht wilt versturen.'
      : 'Er is nog niets verstuurd. Kies hieronder hoe u het bericht wilt versturen.';

    form.hidden = true;
    result.hidden = false;
    result.focus({ preventScroll: true });
    const top = result.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight * 0.6) {
      result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  });

  $('#copy-message').addEventListener('click', async (e) => {
    const ok = await copyText(preview.textContent, preview);
    flash(e.currentTarget, ok, 'Tekst gekopieerd');
  });
  $('#edit-message').addEventListener('click', () => {
    showForm();
    $('#f-naam').focus();
  });

  /* =========================================================
     Mobiele actiebalk: zichtbaar na de hero-knoppen, weg bij contact
     ========================================================= */
  const actionBar = $('#action-bar');
  const heroActions = $('.hero__actions');
  if (actionBar && heroActions && 'IntersectionObserver' in window) {
    let heroVisible = true;
    let contactVisible = false;
    const update = () => actionBar.classList.toggle('is-visible', !heroVisible && !contactVisible);
    // De balk neemt het over zodra de knoppen in de hero uit beeld zijn.
    new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; update(); }).observe(heroActions);
    new IntersectionObserver(([entry]) => { contactVisible = entry.isIntersecting; update(); }, { threshold: 0.15 }).observe(contactSection);
  }
})();
