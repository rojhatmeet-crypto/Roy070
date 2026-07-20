# Roy070 — iPhone app mode (PWA)

Deze repo bevat alles om de site als **app** op een iPhone te laten draaien:
fullscreen, zonder Safari-balken, met een eigen icoon op het beginscherm.

## 🌐 Live site

**https://rojhatmeet-crypto.github.io/Roy070/**

De site draait op GitHub Pages (gratis, vaste URL, automatisch HTTPS).

## 📲 Zo installeer je de app op iPhone

1. Open de site in **Safari** op je iPhone
2. Tik op de **Deel-knop** (vierkantje met pijl omhoog)
3. Kies **"Zet op beginscherm"**
4. Tik op **"Voeg toe"**

De site opent daarna fullscreen als app.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | Startpagina met alle iPhone app-mode tags + installatie-uitleg |
| `manifest.webmanifest` | Web app manifest (`display: standalone`) |
| `sw.js` | Service worker (offline/cache) |
| `icons/apple-touch-icon.png` | Icoon dat iPhone op het beginscherm zet (180×180) |
| `icons/icon-192.png`, `icons/icon-512.png` | Manifest-iconen |
| `.github/workflows/deploy-pages.yml` | Zet elke push automatisch live op GitHub Pages |

Let op: alle paden in `index.html`, `manifest.webmanifest` en `sw.js` zijn
**relatief** (dus `icons/...` in plaats van `/icons/...`), omdat de site op
GitHub Pages onder het subpad `/Roy070/` draait.

## 🔄 Site aanpassen

Push je wijzigingen naar deze repo — de workflow zet ze automatisch live op
de `gh-pages` branch. Na 1 à 2 minuten staat de nieuwe versie online.

## Heb je al een eigen site? Voeg dan dit toe aan je `<head>`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Roy070">
<meta name="theme-color" content="#111827">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
```

En zet `manifest.webmanifest`, `sw.js` en de map `icons/` naast je `index.html`.
