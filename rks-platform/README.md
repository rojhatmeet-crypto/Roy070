# RKS Infra platform

Urenregistratie, goedkeuring en automatische facturatie voor zzp-vakmensen in de
infra. Gebouwd voor RKS Infra als tussenpartij tussen zzp'er en aannemer.

```
Zzp'er vult uren in  →  uitvoerder keurt goed via link  →  uren vergrendeld
        ↓                                                          ↓
  self-billing inkoopfactuur (zzp'er → RKS)        verkoopfactuur (RKS → klant)
        ↓                                                          ↓
                         dashboard met marge per uur
```

**Demo (1 minuut):** [`docs/rks-platform-demo.mp4`](docs/rks-platform-demo.mp4). Eén werkweek
van vakman, uitvoerder en RKS, opgenomen met de demodata.

## Wat het doet

**Voor de vakman (zzp'er), op de telefoon**
- Ziet zijn opdrachten met zijn eigen tarief. De verkoopprijs en de marge ziet hij nooit.
- Vult per week zijn uren in, per kwartier, met een korte omschrijving per dag.
- Dient in en stuurt met één knop de goedkeuringslink via WhatsApp naar de uitvoerder.
- Ziet zijn facturen aan RKS en of ze betaald zijn, plus zijn certificaten met vervaldatum.

**Voor de uitvoerder of opdrachtgever**
- Keurt goed via een persoonlijke link, zonder account en zonder app.
- Kan afkeuren met een reden. De vakman past de uren dan aan en dient opnieuw in.
- Wie vaker goedkeurt, kan een account krijgen met een overzicht en de facturen van RKS.
- Ziet nooit inkooptarieven of marges.

**Voor RKS (beheer)**
- Dashboard per week met actieve zzp'ers, goedgekeurde uren, omzet, zzp-kosten, brutomarge en gemiddelde marge per uur. Daarnaast openstaande en te late facturen, bedragen te betalen aan zzp'ers, marge per klant en per vakman, en een grafiek over acht weken.
- Signalen: VCA en andere certificaten die verlopen, uren die te lang op goedkeuring wachten, opdrachten zonder getekende overeenkomst, zzp'ers zonder akkoord voor self-billing, en facturen over de vervaldatum.
- Opdrachten met eigen inkoop- en verkooptarief per zzp'er en project. De marge zie je live tijdens het invullen.
- Facturen: concepten definitief maken met nummering zonder gaten, versturen via link, WhatsApp of e-mail, betalingen vastleggen, en export als CSV en UBL voor de boekhouding.
- Zzp'ers en klanten beheren, accounts uitnodigen met een link, en een logboek van wie wat heeft goedgekeurd of gewijzigd.

## Zo werkt de facturatie

Na goedkeuring gebeurt dit automatisch:

1. **Uren vergrendeld.** De tarieven van dat moment worden vastgelegd. Een latere tariefwijziging raakt deze week niet meer.
2. **Inkoopfactuur van de zzp'er aan RKS.**
   - Heeft de zzp'er schriftelijk akkoord gegeven voor self-billing, dan maakt het systeem de factuur namens hem op. Hij krijgt een eigen nummerreeks en de vermelding *Factuur uitgereikt door afnemer*.
   - Zonder akkoord komt er een regel *Wacht op factuur zzp'er*. RKS legt het factuurnummer vast zodra zijn eigen factuur binnen is.
3. **Verkoopfactuur van RKS aan de klant.** Die wordt per klant per week verzameld als concept. Na *Definitief maken* krijgt hij een nummer, bijvoorbeeld RKS-2026-0001, plus een factuurdatum en vervaldatum.

Voorbeeld uit de tests: Mehmet werkt 40 uur voor €47 inkoop en €61 verkoop.

| | Berekening | Bedrag |
|---|---|---|
| Mehmet krijgt | 40 × €47 | €1.880 |
| Klant betaalt | 40 × €61 | €2.440 |
| RKS brutomarge | €14 per uur | €560 |

### Btw

| Regeling | Wanneer | Op de factuur |
|---|---|---|
| Btw 21% | Normaal tarief | 21% btw |
| Btw verlegd | Onderaanneming of inlening in de bouw | "Btw verlegd" en het btw-id van de afnemer, verplicht |
| Geen btw | Zzp'er met kleineondernemersregeling (KOR) | Geen btw |

Je stelt de verkoop-btw in per project en de inkoop-btw per opdracht. Een zzp'er met
KOR factureert altijd zonder btw. Een factuur met btw verlegd kan pas definitief als
het btw-id van de klant bekend is. **Of de verleggingsregeling geldt, bepaal je per
opdracht. Laat dit toetsen door de boekhouder.**

## Belangrijk: de software maakt iemand geen zzp'er

Het platform regelt uren en facturen. Of iemand echt zelfstandig werkt, hangt af
van de praktijk op de bouwplaats. Daarom zitten deze zaken erin:

- per opdracht een veld voor een afgebakende opdrachtomschrijving en de getekende overeenkomst, met een signaal als die ontbreekt
- self-billing alleen met vastgelegd, schriftelijk akkoord van de zzp'er
- een logboek van goedkeuringen, tariefwijzigingen en IBAN-wijzigingen

Zijn er feitelijk leiding en toezicht door de aannemer, dan kan het gaan om
arbeidskrachten ter beschikking stellen. De Wtta geldt vanaf 1 januari 2027. De
handhaving van de toelatingsplicht start op 1 januari 2028.

## Lokaal draaien

Nodig: Node.js 22.13 of nieuwer. De database is SQLite, ingebouwd in Node, dus er hoeft geen aparte databaseserver te draaien.

```bash
cd rks-platform
npm install
npm run seed      # demodata: fictieve klanten, 12 vakmensen, 8 weken uren
npm start         # http://localhost:3000
npm test          # 25 tests: rekenregels, btw, rechten, de hele keten
```

Demo-accounts, alleen na `npm run seed`, met wachtwoord `demo-wachtwoord-2026`:

| Rol | E-mail |
|---|---|
| RKS beheer | beheer@rks.demo |
| Vakman | mehmet@rks.demo |
| Opdrachtgever | uitvoerder@vandijk.demo |

## Browserdemo zonder server

`npm run demo:build` maakt `demo/dist/rks-platform-demo.html`: het hele platform in één
bestand dat in de browser draait. Het gebruikt dezelfde routes, schermen en rekenregels
als de server, met SQLite in het geheugen van de browser (sql.js). Bovenaan wissel je
tussen vakman, uitvoerder en RKS. Berichten via WhatsApp of mail worden niet verstuurd;
je ziet de tekst en kunt de link zelf openen. Wat je doet, blijft in die browser.

Handig om te laten zien en te testen. Voor echt gebruik is de server nodig, want de
gegevens moeten centraal staan en veilig bewaard worden.

| Bestand | Rol |
|---|---|
| `demo/main.js` | Vangt klikken en formulieren af en stuurt ze naar de app |
| `demo/shim/` | Browserversies van Express, `node:sqlite`, `node:crypto` en `node:fs` |
| `demo/build.mjs` | Bundelt alles met esbuild tot één HTML-bestand |

## Online zetten (Render)

Het platform heeft een server en een vaste schijf nodig. GitHub Pages is daarvoor
niet geschikt. De repository bevat een `render.yaml` voor Render:

1. Maak een account op [render.com](https://render.com) en koppel GitHub.
2. Kies **New → Blueprint** en selecteer deze repository.
3. Render maakt de dienst *rks-platform* aan, met een schijf van 1 GB voor de database. Dat is het Starter-abonnement, ongeveer $7 per maand plus de schijf.
4. Open na de deploy in Render het tabblad **Environment** en kopieer de waarde van `SETUP_CODE`.
5. Ga naar `https://<jouw-app>.onrender.com/setup`, vul de code in en maak het eerste beheerdersaccount aan.
6. Vul onder **Instellingen** de echte bedrijfsgegevens in: adres, KvK, btw-id en IBAN. Zonder deze gegevens kan geen factuur definitief worden.
7. Voeg klanten, projecten, zzp'ers en opdrachten toe en nodig de zzp'ers uit.

**Draai `npm run seed` nooit op de echte omgeving.** Het script weigert als er al gegevens zijn.

Een eigen domein, zoals `app.rksinfra.nl`, stel je in Render in onder *Custom Domains*.
Render zorgt automatisch voor https.

**Back-ups.** Render maakt dagelijks een snapshot van de schijf. Exporteer daarnaast
regelmatig de facturen als CSV voor de boekhouding.

## Nog niet ingebouwd

Dit is een werkende eerste versie. De volgende stappen liggen voor de hand:

- **E-mail automatisch versturen.** Nu deel je links via WhatsApp of je eigen mail. Een koppeling met bijvoorbeeld Postmark of Mailgun is een kleine uitbreiding.
- **Live koppeling met het boekhoudpakket.** De UBL-export werkt al. Een directe API-koppeling met Moneybird, Exact of e-Boekhouden volgt zodra jullie een pakket kiezen.
- **Bankkoppeling.** Betalingen leg je nu handmatig vast. Automatisch afletteren kan via de bank of het boekhoudpakket.
- **Creditfacturen** voor correcties op definitieve facturen.
- **Tweestapsverificatie** voor beheerders.
- **Pdf op de server.** Nu sla je een factuur als pdf op via *Printen*.

## Techniek

| Onderdeel | Keuze |
|---|---|
| Server | Node.js 22 en Express 5, pagina's opgebouwd op de server |
| Database | SQLite via `node:sqlite`, bedragen in centen, uren in minuten |
| Beveiliging | Wachtwoorden met scrypt, sessiecookies (HttpOnly, SameSite), CSRF-tokens, strikte CSP. Rollen worden per verzoek gecontroleerd en elke query filtert op de eigen zzp'er of klant |
| Goedkeuringslinks | Willekeurig token van 192 bits, 14 dagen geldig, na afkeuren ongeldig |
| Tests | `node:test`: 14 domeintests en 11 HTTP-integratietests |

```
rks-platform/
├── src/
│   ├── server.js          # app, beveiligingsheaders, routes
│   ├── schema.sql         # database
│   ├── domain/            # uren, facturen, btw, dashboard, export (geen HTTP)
│   ├── routes/            # beheer, vakman, klant, publieke links, inloggen
│   └── views/             # HTML-templates met automatische escaping
├── public/                # css, js, lettertypes, logo
├── scripts/seed.js        # demodata
└── test/                  # unit- en integratietests
```
