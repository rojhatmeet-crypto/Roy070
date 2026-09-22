import { html, raw } from './html.js';

const NAV = {
  admin: [
    ['/beheer', 'Dashboard'],
    ['/beheer/uren', 'Uren'],
    ['/beheer/facturen', 'Facturen'],
    ['/beheer/plaatsingen', 'Opdrachten'],
    ['/beheer/zzpers', 'Zzp\'ers'],
    ['/beheer/klanten', 'Klanten'],
    ['/beheer/instellingen', 'Instellingen'],
  ],
  zzp: [
    ['/mijn', 'Mijn uren'],
    ['/mijn/facturen', 'Facturen'],
    ['/mijn/gegevens', 'Mijn gegevens'],
  ],
  klant: [
    ['/klant', 'Uren goedkeuren'],
    ['/klant/facturen', 'Facturen'],
  ],
};
const ROLE_LABEL = { admin: 'Beheer', zzp: 'Vakman', klant: 'Opdrachtgever' };

function isActive(path, href) {
  if (href === '/beheer' || href === '/mijn' || href === '/klant') return path === href;
  return path === href || path.startsWith(`${href}/`);
}

export function layout({ title, user, csrf, path = '', body, flash = '', bare = false }) {
  const nav = user ? NAV[user.rol] || [] : [];
  return html`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#F3F5F2">
<title>${title ? `${title} · ` : ''}RKS Infra</title>
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css">
<script src="/js/app.js" defer></script>
</head>
<body class="${bare ? 'is-bare' : ''}">
<header class="app-header">
  <div class="app-header__inner">
    <a class="brand" href="${user ? (user.rol === 'admin' ? '/beheer' : user.rol === 'zzp' ? '/mijn' : '/klant') : '/'}">
      <img src="/img/logo.svg" alt="RKS Infra" width="96" height="36">
      ${user ? html`<span class="brand__role">${ROLE_LABEL[user.rol]}</span>` : ''}
    </a>
    ${user ? html`
    <nav class="app-nav" aria-label="Hoofdmenu">
      ${nav.map(([href, label]) => html`<a href="${href}"${isActive(path, href) ? raw(' aria-current="page"') : ''}>${label}</a>`)}
    </nav>
    <form class="logout" method="post" action="/logout">
      <input type="hidden" name="_csrf" value="${csrf}">
      <span class="logout__name">${user.naam}</span>
      <button class="link" type="submit">Uitloggen</button>
    </form>` : ''}
  </div>
</header>
<main class="app-main">
  ${flash ? html`<div class="flash" role="status">${flash}</div>` : ''}
  ${body}
</main>
</body>
</html>`;
}
