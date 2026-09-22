// Browserdemo van het RKS-platform. Dezelfde routes, schermen en rekenregels als de server,
// met SQLite in het geheugen van de browser. Klikken en formulieren gaan naar de app in plaats
// van naar een server; wat je doet blijft alleen in deze browser.
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';
import { useSqlJs, restoreFrom } from './shim/sqlite.js';
import { Response, createRequest } from './shim/express.js';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { layout } from '../src/views/layout.js';
import { html } from '../src/views/html.js';
import { seed, DEMO_PASSWORD } from '../scripts/seed.js';
import '../public/js/app.js';

/* global __BUILD_ID__, __LOGO__ */
const HOST = 'rks-demo.local';
const ORIGIN = `https://${HOST}`;
const KEY = `rks-demo:${__BUILD_ID__}`;
const ROLES = {
  admin: { label: 'RKS', email: 'beheer@rks.demo' },
  zzp: { label: 'Vakman', email: 'mehmet@rks.demo' },
  klant: { label: 'Uitvoerder', email: 'uitvoerder@vandijk.demo' },
};

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, text = '') => Object.assign(document.createElement(tag), props, text ? { textContent: text } : {});
const appEl = $('#app');
const bar = $('#demo-bar');
const guide = $('#demo-guide');
const modal = $('#demo-modal');

// ---------- opslag in deze browser (mag ontbreken) ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* vol of geblokkeerd: de demo werkt gewoon door */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};
const toB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let db;
let app;
let jar = {};
let current = '/';
let visited = [];

function boot(fresh) {
  if (db) db.raw.close();
  db = null;
  let state = null;
  if (!fresh) {
    const saved = store.get(`${KEY}:db`);
    try { state = JSON.parse(store.get(`${KEY}:state`) || 'null'); } catch { state = null; }
    if (saved) {
      try {
        restoreFrom(fromB64(saved));
        db = openDb(':memory:');
      } catch {
        db = null;
        state = null;
      }
    }
  }
  if (!db || !db.get('SELECT COUNT(*) AS n FROM users').n) {
    db?.raw.close();
    db = openDb(':memory:');
    seed(db);
    state = null;
  }
  app = createApp(db);
  jar = state?.jar || {};
  current = state?.path || '/';
  visited = [];
  return Boolean(state);
}

function persist({ withDb = false } = {}) {
  if (withDb) store.set(`${KEY}:db`, toB64(db.raw.export()));
  store.set(`${KEY}:state`, JSON.stringify({ jar, path: current }));
}

// ---------- verzoeken naar de app ----------
function dispatch(method, url, body = '') {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const req = createRequest({ method, url, host: HOST, cookie, body });
  const res = new Response();
  app(req, res, (err) => {
    if (err) console.error(err);
    res.status(err ? 500 : 404).send(err ? 'Er ging iets mis.' : 'Pagina niet gevonden.');
  });
  for (const c of [].concat(res.headers['set-cookie'] || [])) {
    const [pair, ...attrs] = c.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    if (attrs.some((a) => /^\s*Max-Age=0\s*$/i.test(a))) delete jar[name];
    else jar[name] = pair.slice(i + 1);
  }
  return res;
}

function toLocal(href) {
  if (!href) return null;
  if (href.startsWith(ORIGIN)) return href.slice(ORIGIN.length) || '/';
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (href.startsWith('?')) return current.split('?')[0] + href;
  return null;
}

let started = false;
const phone = window.matchMedia('(max-width: 760px)');

function go(method, url, body = '', { back = false } = {}) {
  // Op de telefoon staat de uitleg na de eerste stap niet meer boven elke pagina.
  if (started && phone.matches) guide.hidden = true;
  let res = dispatch(method, url, body);
  for (let hops = 0; res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5; hops++) {
    url = toLocal(res.headers.location) || '/';
    res = dispatch('GET', url);
  }
  if (res.filename) {
    showFile(res);
    persist({ withDb: method === 'POST' });
    return;
  }
  if (!back && url !== current) visited.push(current);
  visited = visited.slice(-30);
  current = url;
  render(res);
  persist({ withDb: method === 'POST' });
}

// ---------- tekenen ----------
function currentUser() {
  const sid = jar.rks_sid && decodeURIComponent(jar.rks_sid);
  return sid ? db.get('SELECT u.rol, u.naam FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?', sid) : null;
}

function render(res) {
  let page = res.body;
  if (!page.includes('<main')) {
    // Korte tekstmeldingen van de server (geen toegang, verlopen formulier) in de gewone opmaak.
    page = String(layout({ title: 'Melding', user: null, bare: true, body: html`<div class="auth"><h1>Melding</h1><p>${page}</p><p><a href="/">Naar de startpagina</a></p></div>` }));
  }
  const doc = new DOMParser().parseFromString(page.replaceAll('"/img/logo.svg"', `"${__LOGO__}"`), 'text/html');
  document.body.classList.toggle('is-bare', doc.body.classList.contains('is-bare'));
  appEl.replaceChildren(...doc.body.childNodes);

  window.RKS.enhance(appEl);
  // Printen kan niet in deze weergave; de factuur staat al op het scherm.
  for (const b of appEl.querySelectorAll('[data-print]')) b.hidden = true;
  // Links die in het echt via WhatsApp of mail gaan, kun je hier zelf openen.
  for (const input of appEl.querySelectorAll('input[readonly]')) {
    if (!input.value.startsWith(ORIGIN)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sm demo-open';
    btn.textContent = 'Open link';
    btn.dataset.demoOpen = input.value;
    input.parentElement.append(btn);
  }
  if (current.startsWith('/login')) {
    const note = el('p', { className: 'panel panel--info small' });
    note.append('Demo: kies bovenaan Vakman, Uitvoerder of RKS. Zelf inloggen kan ook, bijvoorbeeld met ',
      el('strong', {}, 'mehmet@rks.demo'), ' en wachtwoord ', el('strong', {}, DEMO_PASSWORD), '.');
    appEl.querySelector('.auth h1')?.after(note);
  }
  updateBar();
  window.scrollTo(0, 0);
}

function updateBar() {
  const user = currentUser();
  for (const b of bar.querySelectorAll('[data-role]')) b.setAttribute('aria-pressed', String(user?.rol === b.dataset.role));
  $('[data-demo-back]', bar).disabled = visited.length === 0;
  $('[data-demo-who]', bar).textContent = user ? `Je bent nu ${user.naam}` : 'Niet ingelogd';
}

// ---------- rol wisselen ----------
function logout() {
  if (jar.rks_sid) db.run('DELETE FROM sessions WHERE id = ?', decodeURIComponent(jar.rks_sid));
  delete jar.rks_sid;
}
function loginAs(rol) {
  logout();
  go('POST', '/login', new URLSearchParams({ email: ROLES[rol].email, wachtwoord: DEMO_PASSWORD }).toString());
}
// Zoals de ontvanger het ziet: zonder in te loggen.
function openAsRecipient(url) {
  logout();
  closeModal();
  go('GET', toLocal(url) || '/');
}

// ---------- venster voor meldingen ----------
function openModal({ title, body, actions }) {
  $('[data-modal-title]', modal).textContent = title;
  const content = $('[data-modal-body]', modal);
  content.replaceChildren(...[].concat(body));
  const row = $('[data-modal-actions]', modal);
  row.replaceChildren(...actions.map(({ label, primary, run }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn${primary ? ' btn--primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => { if (run) run(); else closeModal(); });
    return b;
  }));
  modal.hidden = false;
  row.querySelector('button')?.focus();
}
function closeModal() { modal.hidden = true; }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

const copyAction = (text) => ({
  label: 'Kopieer',
  run: async () => {
    try { await navigator.clipboard.writeText(text); } catch { $('textarea', modal)?.select(); }
  },
});

function showMessage(kind, href) {
  const u = new URL(href);
  const text = kind === 'whatsapp' ? u.searchParams.get('text') || '' : [u.searchParams.get('subject'), u.searchParams.get('body')].filter(Boolean).join('\n\n');
  const to = kind === 'whatsapp' ? u.pathname.slice(1) : decodeURIComponent(u.pathname);
  const link = (text.match(new RegExp(`${ORIGIN.replace(/\./g, '\\.')}\\S+`)) || [])[0];
  openModal({
    title: kind === 'whatsapp' ? 'Hier opent WhatsApp' : 'Hier opent je mailprogramma',
    body: [
      el('p', {}, kind === 'whatsapp'
        ? `In de echte app opent WhatsApp met dit bericht${to ? ` voor +${to}` : '. Je kiest dan zelf naar wie het gaat'}. In de demo wordt niets verstuurd.`
        : `In de echte app opent je mailprogramma met dit bericht${to ? ` aan ${to}` : ''}. In de demo wordt niets verstuurd.`),
      el('textarea', { readOnly: true, rows: 5, value: text, className: 'demo-text' }),
      link ? el('p', { className: 'muted small' }, 'Open de link om te zien wat de ontvanger ziet. Je wordt daarvoor uitgelogd.') : '',
    ].filter(Boolean),
    actions: [
      ...(link ? [{ label: 'Open link als ontvanger', primary: true, run: () => openAsRecipient(link) }] : []),
      copyAction(text),
      { label: 'Sluiten' },
    ],
  });
}

let downloads = null;
window.claude?.use?.('downloads').then((d) => { downloads = d; }, () => {});

function showFile(res) {
  const name = res.filename;
  const canSave = downloads && /\.csv$/i.test(name);
  openModal({
    title: name,
    body: [
      el('p', {}, /\.xml$/i.test(name)
        ? 'UBL-factuur voor de boekhouding. In de echte app download je dit bestand en lees je het in bij Moneybird, Exact of e-Boekhouden.'
        : 'Export voor de boekhouding of Excel. In de echte app wordt dit bestand gedownload.'),
      el('textarea', { readOnly: true, rows: 10, value: res.body.replace(/^﻿/, ''), className: 'demo-text demo-text--code' }),
    ],
    actions: [
      ...(canSave ? [{
        label: 'Opslaan als bestand',
        primary: true,
        run: async () => { try { await downloads.save({ filename: name, data: res.body }); closeModal(); } catch { /* geweigerd of niet beschikbaar */ } },
      }] : []),
      copyAction(res.body),
      { label: 'Sluiten' },
    ],
  });
}

// ---------- klikken en formulieren ----------
function submit(form, submitter) {
  const method = (form.getAttribute('method') || 'get').toUpperCase();
  const action = toLocal(form.getAttribute('action')) || current;
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (typeof v === 'string') params.append(k, v);
  if (submitter?.name) params.append(submitter.name, submitter.value);
  if (method === 'GET') go('GET', `${action.split('?')[0]}?${params}`);
  else go('POST', action, params.toString());
}

// Bevestigen gaat in de pagina zelf; een browservenster werkt hier niet.
window.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-confirm]');
  if (!btn || !appEl.contains(btn)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openModal({
    title: btn.dataset.confirm,
    body: [],
    actions: [{ label: 'Ja', primary: true, run: () => { closeModal(); submit(btn.form, btn); } }, { label: 'Annuleren' }],
  });
}, true);

document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-demo-open]');
  if (opener) { openAsRecipient(opener.dataset.demoOpen); return; }
  const a = e.target.closest('a[href]');
  if (!a || !appEl.contains(a) || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const href = a.getAttribute('href');
  if (href.startsWith('https://wa.me/')) { e.preventDefault(); showMessage('whatsapp', href); return; }
  if (href.startsWith('mailto:')) { e.preventDefault(); showMessage('mail', href); return; }
  const local = toLocal(href);
  if (local === null) return;
  e.preventDefault();
  go('GET', local);
});

document.addEventListener('submit', (e) => {
  if (!appEl.contains(e.target)) return;
  e.preventDefault();
  submit(e.target, e.submitter);
});

// ---------- demobalk en uitleg ----------
bar.addEventListener('click', (e) => {
  const role = e.target.closest('[data-role]');
  if (role) { loginAs(role.dataset.role); return; }
  if (e.target.closest('[data-demo-back]') && visited.length) { go('GET', visited.pop(), '', { back: true }); return; }
  if (e.target.closest('[data-demo-guide]')) { guide.hidden = !guide.hidden; store.set(`${KEY}:guide`, guide.hidden ? 'dicht' : 'open'); return; }
  if (e.target.closest('[data-demo-reset]')) {
    openModal({
      title: 'Opnieuw beginnen?',
      body: [el('p', {}, 'Alles wat je in de demo hebt gedaan, wordt gewist. Je begint weer met de voorbeeldgegevens.')],
      actions: [{
        label: 'Opnieuw beginnen',
        primary: true,
        run: () => { closeModal(); store.del(`${KEY}:db`); store.del(`${KEY}:state`); boot(true); loginAs('zzp'); },
      }, { label: 'Annuleren' }],
    });
  }
});
guide.addEventListener('click', (e) => {
  const role = e.target.closest('[data-role]');
  if (role) loginAs(role.dataset.role);
  if (e.target.closest('[data-guide-close]')) { guide.hidden = true; store.set(`${KEY}:guide`, 'dicht'); }
});

// ---------- start ----------
initSqlJs().then((SQL) => {
  useSqlJs(SQL);
  const resumed = boot(false);
  guide.hidden = store.get(`${KEY}:guide`) === 'dicht';
  bar.hidden = false;
  if (resumed) go('GET', current);
  else loginAs('zzp');
  started = true;
}).catch((err) => {
  console.error(err);
  appEl.innerHTML = '<div class="demo-loading"><p>De demo kon niet starten in deze browser. Probeer een recente versie van Chrome, Safari of Edge.</p></div>';
});
