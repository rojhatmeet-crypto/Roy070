// RKS Infra platform: webserver.
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { sessionMiddleware, csrfMiddleware, cookie, parseCookies } from './auth.js';
import { layout } from './views/layout.js';
import { html } from './views/html.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import zzpRoutes from './routes/zzp.js';
import klantRoutes from './routes/klant.js';
import adminRoutes from './routes/admin.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(db = openDb()) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self' https://wa.me; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.use(express.static(join(here, '..', 'public'), { maxAge: '7d', index: false }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(sessionMiddleware(db));
  app.use(csrfMiddleware);

  // Meldingen die één keer na een redirect worden getoond.
  app.use((req, res, next) => {
    const flash = parseCookies(req.headers.cookie).rks_flash;
    if (flash) cookie(res, 'rks_flash', '', { maxAge: 0 });
    res.flash = (msg) => cookie(res, 'rks_flash', msg, { maxAge: 60 });
    res.page = (title, body, opts = {}) => res.send(String(layout({
      title, body, user: req.user, csrf: req.csrf, path: req.path, flash: flash || '', ...opts,
    })));
    next();
  });

  app.use(authRoutes(db));
  app.use(publicRoutes(db));
  app.use('/mijn', zzpRoutes(db));
  app.use('/klant', klantRoutes(db));
  app.use('/beheer', adminRoutes(db));

  app.use((req, res) => res.status(404).page('Niet gevonden', html`<div class="card narrow"><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet of je hebt er geen toegang toe.</p><p><a href="/">Naar de startpagina</a></p></div>`));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).page('Fout', html`<div class="card narrow"><h1>Er ging iets mis</h1><p>Probeer het opnieuw. Blijft het misgaan, neem dan contact op met RKS.</p></div>`);
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`RKS platform draait op http://localhost:${port}`));
}
