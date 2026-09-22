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

## 🎮 Volt — het spelletje

Op **https://rojhatmeet-crypto.github.io/Roy070/game/** staat Volt: een
arcade-spelletje waarin je als vonkje door een stroomcircuit vliegt. Tik om
te zappen, ontwijk de weerstanden, verzamel bliksems (+2) en verbeter je
record. Ook installeerbaar als eigen app (paars bliksem-icoon) via
Safari → Deel → "Zet op beginscherm".

## 🏗️ RKS Infra — website

In de map [`rks-infra/`](rks-infra/) staat de website van **RKS Infra**
(personeel voor grond-, weg- en waterbouw). Zie
[`rks-infra/README.md`](rks-infra/README.md) voor uitleg, de plaatshouders die
nog ingevuld moeten worden en de fotobronnen.

Live: **https://rojhatmeet-crypto.github.io/Roy070/rks-infra/**

De workflow `deploy-rks-infra.yml` zet alleen deze map op GitHub Pages en laat
de rest van de site staan.

## 🧾 RKS Infra — platform

In [`rks-platform/`](rks-platform/) staat de software achter RKS Infra:
urenregistratie voor zzp'ers, goedkeuring door de uitvoerder via een link,
automatische inkoop- en verkoopfacturen (self-billing, btw verlegd) en een
dashboard met marge per uur. Zie [`rks-platform/README.md`](rks-platform/README.md).

Dit is een server met een database, dus het draait niet op GitHub Pages. Het
bestand `render.yaml` zet het met één klik op [Render](https://render.com).

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
