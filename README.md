# Roy070 — iPhone app mode (PWA)

Deze repo bevat alles om de site als **app** op een iPhone te laten draaien:
fullscreen, zonder Safari-balken, met een eigen icoon op het beginscherm.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | Startpagina met alle iPhone app-mode tags + installatie-uitleg |
| `manifest.webmanifest` | Web app manifest (`display: standalone`) |
| `sw.js` | Service worker (offline/cache) |
| `icons/apple-touch-icon.png` | Icoon dat iPhone op het beginscherm zet (180×180) |
| `icons/icon-192.png`, `icons/icon-512.png` | Manifest-iconen |

## Zo installeer je de app op iPhone

1. Open de site in **Safari** op je iPhone
2. Tik op de **Deel-knop** (vierkantje met pijl omhoog)
3. Kies **"Zet op beginscherm"**
4. Tik op **"Voeg toe"**

De site opent daarna fullscreen als app.

## Heb je al een eigen site? Voeg dan dit toe aan je `<head>`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Roy070">
<meta name="theme-color" content="#111827">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

En zet `manifest.webmanifest`, `sw.js` en de map `icons/` in de root van je site.

## Belangrijk over trycloudflare-links

Een `*.trycloudflare.com`-URL is **tijdelijk**: hij verandert elke keer dat je
de tunnel opnieuw start, en de app op het beginscherm blijft naar de oude URL
wijzen. Voor een app-icoon dat blijft werken heb je een **vast adres** nodig,
bijvoorbeeld:

- **GitHub Pages** (gratis): zet deze repo op GitHub Pages, dan draait de site
  op `https://<gebruikersnaam>.github.io/Roy070/`
- Een **named Cloudflare Tunnel** met eigen domein (gratis met een eigen domein)

Ook geldt: "Zet op beginscherm" in app mode werkt alleen via **HTTPS** (beide
opties hierboven regelen dat automatisch).

## Lokaal testen

```bash
python3 -m http.server 8000
# daarna tunnel starten, bijv.:
cloudflared tunnel --url http://localhost:8000
```
