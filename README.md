# I&M Elektra — website + iPhone app mode (PWA)

De website van **I&M Elektra**, gebouwd als PWA zodat hij op een iPhone als
**app** draait: fullscreen, zonder Safari-balken, met eigen icoon op het
beginscherm.

## 🌐 Live site

**https://rojhatmeet-crypto.github.io/Roy070/**

De site draait op GitHub Pages (gratis, vaste URL, automatisch HTTPS).

## 📲 Zo installeer je de app op iPhone

1. Open de site in **Safari** op je iPhone
2. Tik op de **Deel-knop** (vierkantje met pijl omhoog)
3. Kies **"Zet op beginscherm"**
4. Tik op **"Voeg toe"**

De site opent daarna fullscreen als app.

## ✏️ Nog invullen

De contactknoppen bevatten **placeholder-nummers**. Vervang in `index.html`:

- `tel:+31600000000` → echt telefoonnummer
- `https://wa.me/31600000000` → echt WhatsApp-nummer (met landcode, zonder +)

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De I&M Elektra website + alle iPhone app-mode tags |
| `manifest.webmanifest` | Web app manifest (`display: standalone`) |
| `sw.js` | Service worker (offline/cache) |
| `icons/` | Bliksem-logo als app-icoon (incl. 180×180 apple-touch-icon) |
| `.github/workflows/deploy-pages.yml` | Zet elke push automatisch live op GitHub Pages |

Let op: alle paden zijn **relatief** (dus `icons/...` in plaats van
`/icons/...`), omdat de site op GitHub Pages onder het subpad `/Roy070/`
draait.

## 🔄 Site aanpassen

Push je wijzigingen naar deze repo — de workflow zet ze automatisch live op
de `gh-pages` branch. Na 1 à 2 minuten staat de nieuwe versie online.
