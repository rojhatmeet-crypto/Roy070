# I&M Elektro — website

Bedrijfswebsite van **I&M Elektro**, elektrotechnisch installateur
(laagspanningsinstallaties, saneren, groepenkasten, storingen, keuringen,
verlichting, laadpalen, data/domotica).

De site is **responsive**: één `index.html` die zich aanpast aan telefoon,
tablet en pc. Op de telefoon is hij bovendien te installeren als app
(fullscreen, eigen icoon op het beginscherm).

## 🌐 Live site

**https://rojhatmeet-crypto.github.io/Roy070/**

Draait op GitHub Pages (gratis, vaste URL, automatisch HTTPS). Elke push
naar een branch uit `.github/workflows/deploy-pages.yml` wordt na 1 à 2
minuten automatisch live gezet.

## ✏️ Nog invullen (placeholders)

Alle contactgegevens staan nu als placeholder in `index.html`. Zoek op
`PLACEHOLDER` en vervang:

| Placeholder | Vervangen door |
|---|---|
| `tel:+31600000000` en `06 - 00 00 00 00` | echt telefoonnummer |
| `https://wa.me/31600000000` | echt WhatsApp-nummer (landcode, zonder `+`) |
| `info@imelektro.nl` | echt e-mailadres |
| `KvK: 00000000` | KvK-nummer |
| `Regio Den Haag en omstreken` | werkgebied / adres |
| openingstijden in het contactblok | echte tijden |

Onderaan `index.html` staan in het script ook `CONTACT_EMAIL` en
`WHATSAPP_NUMBER`: die gebruikt het offerteformulier.

## 📋 Offerteformulier

Het formulier werkt zonder server: de bezoeker kiest **"Verstuur per
e-mail"** (opent het mailprogramma met een ingevuld bericht) of **"Verstuur
via WhatsApp"** (opent WhatsApp met het bericht). Zo komt de aanvraag direct
bij jullie binnen.

## 📲 Als app op de telefoon

1. Open de site in **Safari** (iPhone) of **Chrome** (Android)
2. Tik op **Delen** → **"Zet op beginscherm"** (iPhone) of het menu →
   **"Toevoegen aan startscherm"** (Android)

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De complete website (HTML, CSS en JavaScript in één bestand) |
| `assets/logo.png` | Het I&M Elektro-logo |
| `icons/` | App-iconen gemaakt van het logo (192, 512, maskable, apple-touch) |
| `manifest.webmanifest` | Web app manifest (app-modus) |
| `sw.js` | Service worker (offline/cache) |
| `game/` | Volt, een klein arcade-spelletje (staat los van de bedrijfssite) |
| `.github/workflows/deploy-pages.yml` | Zet elke push automatisch live op GitHub Pages |

Alle paden zijn **relatief** (`icons/...`, niet `/icons/...`), omdat de site
op GitHub Pages onder het subpad `/Roy070/` draait.
