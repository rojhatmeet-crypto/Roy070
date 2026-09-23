import { html, raw } from './html.js';

const NAV = {
  admin: [
    ['/beheer', 'Overzicht'],
    ['/beheer/uren', 'Uren'],
    ['/beheer/facturen', 'Facturen'],
    ['/beheer/plaatsingen', 'Opdrachten'],
    ['/beheer/zzpers', 'Zzp\'ers'],
    ['/beheer/klanten', 'Klanten'],
    ['/beheer/instellingen', 'Instellingen'],
  ],
  zzp: [
    ['/mijn', 'Uren'],
    ['/mijn/facturen', 'Facturen'],
    ['/mijn/gegevens', 'Gegevens'],
  ],
  klant: [
    ['/klant', 'Uren'],
    ['/klant/facturen', 'Facturen'],
  ],
};
const ROLE_LABEL = { admin: 'Beheer', zzp: 'Vakman', klant: 'Opdrachtgever' };

// Startpagina's van een rol zijn alleen actief op zichzelf, plus de urenpagina's eronder.
const ROOTS = { '/beheer': null, '/mijn': '/mijn/uren/', '/klant': '/klant/uren/' };
function isActive(path, href) {
  if (href in ROOTS) return path === href || Boolean(ROOTS[href] && path.startsWith(ROOTS[href]));
  return path === href || path.startsWith(`${href}/`);
}

export function layout({ title, user, csrf, path = '', body, flash = '', bare = false }) {
  const nav = user ? NAV[user.rol] || [] : [];
  const withNav = Boolean(user) && !bare;
  return html`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#FFFFFF">
<title>${title ? `${title} · ` : ''}RKS Infra</title>
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css">
<script src="/js/app.js" defer></script>
</head>
<body class="${withNav ? 'has-nav' : 'is-bare'}">
<div class="shell">
<header class="app-header">
  <div class="app-header__inner">
    <a class="brand" href="${user ? homeHref(user) : '/'}"><img src="/img/logo.svg" alt="RKS Infra" width="80" height="30"></a>
    ${withNav ? html`
    <nav class="app-nav" aria-label="Hoofdmenu">
      ${nav.map(([href, label]) => html`<a href="${href}"${isActive(path, href) ? raw(' aria-current="page"') : ''}>${label}</a>`)}
    </nav>` : ''}
    ${user ? html`
    <form class="logout" method="post" action="/logout">
      <input type="hidden" name="_csrf" value="${csrf}">
      <span class="logout__name">${user.naam}<span class="logout__role">${ROLE_LABEL[user.rol]}</span></span>
      <button class="link" type="submit">Uitloggen</button>
    </form>` : ''}
  </div>
</header>
<main class="app-main">
  ${flash ? html`<div class="flash" role="status">${flash}</div>` : ''}
  ${body}
</main>
</div>
</body>
</html>`;
}

const homeHref = (user) => ({ admin: '/beheer', zzp: '/mijn', klant: '/klant' }[user.rol] || '/');
