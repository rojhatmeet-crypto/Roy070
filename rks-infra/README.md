# RKS Infra, website

Website voor **RKS Infra**: personeel voor grond-, weg- en waterbouw. De site is
gericht op aannemers die grondwerkers, monteurs of ondersteuning bij
funderingsmachines zoeken, en op vakmensen die werk zoeken.

Gewone HTML, CSS en JavaScript. Geen framework en geen build-stap: de map kan
zo op elke webhost (of GitHub Pages) worden gezet.

## Bekijken

Open `index.html` via een lokale webserver, bijvoorbeeld:

```bash
cd rks-infra
python3 -m http.server 8000
# open http://localhost:8000
```

## Wat zit erin

| Onderdeel | Wat het doet |
|---|---|
| Hero | Kernboodschap, twee knoppen en drie kerngegevens |
| Werkzaamheden | 12 disciplines met filter. Klik op een kaart voor een detailvenster met werkzaamheden, profielen en kennis. Vorige/volgende met knoppen of pijltjestoetsen. Elke discipline heeft een eigen link, bijvoorbeeld `#riolering`. |
| Over ons | Wie RKS Infra is en wat aannemers mogen verwachten |
| Werkwijze | Vier stappen, aan te klikken |
| Werken bij | Oproep aan vakmensen |
| Veelgestelde vragen | Uitklapbare vragen |
| Contact | Formulier met twee keuzes: *Ik zoek personeel* en *Ik zoek werk*. Het formulier stelt het bericht op en laat de bezoeker kiezen: versturen per e-mail of via WhatsApp, of de tekst kopiëren. |
| Mobiel | Menu als overlay en een actiebalk onderin (Bellen, WhatsApp, Aanvragen) |

## ✏️ Nog invullen voordat de site live gaat

De contactgegevens zijn **plaatshouders**. Zoek en vervang in `index.html`:

| Plaatshouder | Vervangen door |
|---|---|
| `06 00 00 00 00` | Telefoonnummer zoals het op de site moet staan |
| `+31600000000` | Telefoonnummer voor de belknoppen (`tel:`), met landcode |
| `31600000000` | WhatsApp-nummer, met landcode en zonder `+` |
| `info@example.com` | Echt e-mailadres |

Het formulier leest het e-mailadres en het WhatsApp-nummer uit het blok
*Contact*, dus daar hoeft niets extra voor te gebeuren.

**Teksten controleren.** De teksten beschrijven wat een personeelsleverancier in
de GWW doorgaans doet. Controleer vooral de onderdelen *Kennis en papieren* per
discipline (VCA, BEI-LS, CROW 400, aanpikker/signaalgever) en pas ze aan op wat
jullie mensen echt hebben.

**Eventueel toevoegen:** KvK-nummer, vestigingsadres, NEN 4400-1 / SNA-keurmerk
of VCU-certificaat als jullie die hebben.

### Formulier echt laten versturen (optioneel)

Nu opent het formulier het e-mailprogramma of WhatsApp van de bezoeker, met het
bericht al ingevuld. Wil je dat berichten direct binnenkomen zonder tussenstap,
koppel dan een formulierdienst (zoals Formspree of Netlify Forms) en verstuur de
opgestelde tekst in `assets/js/main.js` (functie `compose`) naar die dienst.

## Mappen

```
rks-infra/
├── index.html
├── manifest.webmanifest      # icoon en naam bij "Zet op beginscherm"
├── favicon.svg
└── assets/
    ├── css/style.css
    ├── js/main.js
    ├── fonts/                # Archivo en IBM Plex Mono, zelf gehost
    ├── icons/                # app-iconen (PNG)
    └── img/                  # logo's (SVG) en foto's (WebP, 2 formaten)
```

## Logo

Het logo in `assets/img/` is een vectorversie (SVG) van het aangeleverde logo,
zodat het op elk formaat scherp blijft. Er zijn drie varianten:

- `logo.svg` voor lichte achtergronden
- `logo-light.svg` voor donkere achtergronden (footer)
- `logo-mark.svg` alleen het beeldmerk

## Lettertypes

- [Archivo](https://fonts.google.com/specimen/Archivo), SIL Open Font License
- [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), SIL Open Font License

De lettertypes worden vanaf de eigen server geladen. Er gaat dus geen verkeer
naar Google, wat prettig is voor de AVG.

## Foto's

Alle foto's komen van [Unsplash](https://unsplash.com) en vallen onder de
[Unsplash License](https://unsplash.com/license): gratis te gebruiken, ook
commercieel, zonder verplichte naamsvermelding. Ze zijn verkleind en omgezet
naar WebP.

| Bestand | Bron |
|---|---|
| `hero` | https://images.unsplash.com/photo-1593436878396-e943a3cac98f |
| `grondwerk` | https://images.unsplash.com/photo-1652303518379-c0ef1c9fb2b1 |
| `riolering` | https://images.unsplash.com/photo-1751054824448-749f467ffc4f |
| `asfalt` | https://images.unsplash.com/photo-1784454936344-e310462059b8 |
| `water-gas` | https://images.unsplash.com/photo-1693907986952-3cd372e4c9d8 |
| `kabels` | https://images.unsplash.com/photo-1699979501975-c88e4f0ca69f |
| `sloopwerk` | https://images.unsplash.com/photo-1572949645415-8f26e838a1d4 |
| `sanering` | https://images.unsplash.com/photo-1759579471231-4e68075ebc76 |
| `leidingwerk` | https://images.unsplash.com/photo-1565364507085-325347bae748 |
| `brandwater` | https://images.unsplash.com/photo-1612120729769-bd0d8a171ae4 |
| `fundering` | https://images.unsplash.com/photo-1780415493102-9d9fbb669bf4 |
| `beton` | https://images.unsplash.com/photo-1640101086894-7d70c3e70179 |
| `machinist` | https://images.unsplash.com/photo-1660476960636-0f06a095f88b |
| `ploeg` | https://images.unsplash.com/photo-1593436878048-92622a77d315 |
| `werken-bij` | https://images.unsplash.com/photo-1614213951697-a45781262acf |

Hebben jullie eigen projectfoto's? Vervang dan de bestanden in `assets/img/`
met dezelfde naam (`naam-640.webp` en `naam-1280.webp`). Eigen foto's van eigen
mensen werken altijd beter dan stockfoto's.
