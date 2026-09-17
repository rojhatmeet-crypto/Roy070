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

## 📤 De site delen

De site staat gewoon op internet, dus delen is niets meer dan de link
doorsturen:

**https://rojhatmeet-crypto.github.io/Roy070/**

- **Appen of mailen:** plak de link in WhatsApp, een sms of een mail. De
  ontvanger heeft niets nodig: geen account, geen app.
- **QR-code:** `assets/qr-website.png` bevat een QR-code met het logo erin.
  Laat hem zien op je scherm of print hem; met de camera van de telefoon gaat
  de site open. Handig op een visitekaartje, de bus of een offerte.
- **Laten zien op je telefoon:** open de link in Safari of Chrome en kies
  Delen → "Zet op beginscherm". De site staat dan als app op je scherm.

Iedereen met de link kan de site bekijken; om hem te wijzigen is toegang tot
deze GitHub-repo nodig.

### Later een eigen domeinnaam

Wil je `www.imelektro.nl` in plaats van het github.io-adres? Koop de
domeinnaam (ongeveer 10 euro per jaar), zet een bestand `CNAME` met daarin de
domeinnaam in deze repo en laat de domeinnaam bij je provider naar GitHub
Pages wijzen. De site zelf hoeft daar niet voor te veranderen.

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

## 📷 Foto's

De foto's staan in `assets/foto/` en komen van Pexels (gratis, ook voor
commercieel gebruik, geen bronvermelding verplicht). De herkomst per foto staat
in `assets/foto/BRONNEN.md`.

Hebben jullie eigen foto's van echte klussen? Vervang de bestanden dan gewoon
door foto's met dezelfde naam (liggend, ongeveer 900 x 675 pixels; `hero.jpg`
1800 x 1100). Eigen foto's werken altijd beter dan stockfoto's.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De complete website (HTML, CSS en JavaScript in één bestand) |
| `assets/logo.png` | Het I&M Elektro-logo |
| `assets/foto/` | Foto's van de site + `BRONNEN.md` met de herkomst |
| `assets/qr-website.png` | QR-code naar de site, met logo in het midden |
| `icons/` | App-iconen gemaakt van het logo (192, 512, maskable, apple-touch) |
| `manifest.webmanifest` | Web app manifest (app-modus) |
| `sw.js` | Service worker (offline/cache) |
| `game/` | Volt, een klein arcade-spelletje (staat los van de bedrijfssite) |
| `.github/workflows/deploy-pages.yml` | Zet elke push automatisch live op GitHub Pages |

Alle paden zijn **relatief** (`icons/...`, niet `/icons/...`), omdat de site
op GitHub Pages onder het subpad `/Roy070/` draait.
