// Het deel van Express dat het platform gebruikt, zodat dezelfde routes in de browser draaien.
// Volgt Express waar het ertoe doet: routers onder een prefix zien een relatief req.path,
// req.originalUrl blijft volledig, en middleware met vier argumenten vangt fouten af.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(path) {
  const keys = [];
  const src = path.replace(/\/$/, '').split('/').map((seg) => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return escapeRe(seg);
  }).join('/');
  return { keys, exact: new RegExp(`^${src}/?$`), prefix: new RegExp(`^${src}(?=/|$)`) };
}

// Zoals de 'simple' query parser van Express 5: herhaalde sleutels worden een lijst.
export function parseQuery(str) {
  const out = {};
  for (const [k, v] of new URLSearchParams(str)) {
    if (!(k in out)) out[k] = v;
    else out[k] = [].concat(out[k], v);
  }
  return out;
}

function stack() {
  const layers = [];

  function handle(req, res, done) {
    let i = 0;
    const next = (err) => {
      const layer = layers[i++];
      if (!layer) return done(err);
      const path = req.path;
      let m;
      if (layer.method) {
        if (req.method !== layer.method) return next(err);
        m = layer.exact.exec(path);
      } else {
        m = layer.prefix.exec(path);
      }
      if (!m) return next(err);
      const errorHandler = layer.fn.length === 4;
      if (Boolean(err) !== errorHandler) return next(err);

      if (layer.method) req.params = Object.fromEntries(layer.keys.map((k, j) => [k, decodeURIComponent(m[j + 1])]));
      const mounted = !layer.method && m[0] !== '';
      const saved = { path: req.path, baseUrl: req.baseUrl };
      if (mounted) { req.baseUrl = saved.baseUrl + m[0]; req.path = path.slice(m[0].length) || '/'; }
      const resume = (e) => { Object.assign(req, saved); next(e); };
      try {
        if (errorHandler) layer.fn(err, req, res, resume);
        else layer.fn(req, res, resume);
      } catch (e) {
        resume(e);
      }
    };
    next();
  }

  const app = (req, res, done) => handle(req, res, done);
  app.use = (...args) => {
    const path = typeof args[0] === 'string' ? args.shift() : '';
    for (const fn of args) layers.push({ ...compile(path === '/' ? '' : path), fn });
    return app;
  };
  for (const method of ['get', 'post']) {
    app[method] = (path, ...fns) => {
      for (const fn of fns) layers.push({ method: method.toUpperCase(), ...compile(path), fn });
      return app;
    };
  }
  return app;
}

export const Router = () => stack();

export default function express() {
  const app = stack();
  app.disable = () => app;
  app.set = () => app;
  return app;
}
express.Router = Router;
express.static = () => (req, res, next) => next();
express.urlencoded = () => (req, res, next) => {
  if (req.method === 'POST') req.body = parseQuery(req.rawBody || '');
  next();
};

const TYPES = { text: 'text/plain', html: 'text/html', xml: 'application/xml', json: 'application/json' };

export class Response {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = '';
    this.locals = {};
    this.finished = false;
  }
  status(code) { this.statusCode = code; return this; }
  set(name, value) {
    if (typeof name === 'object') for (const [k, v] of Object.entries(name)) this.headers[k.toLowerCase()] = v;
    else this.headers[name.toLowerCase()] = value;
    return this;
  }
  get(name) { return this.headers[name.toLowerCase()]; }
  append(name, value) {
    const k = name.toLowerCase();
    this.headers[k] = [].concat(this.headers[k] || [], value);
    return this;
  }
  type(t) { return this.set('content-type', t.includes('/') ? t : TYPES[t] || t); }
  attachment(filename) { this.filename = filename; return this.set('content-disposition', `attachment; filename="${filename}"`); }
  send(body = '') { this.body = String(body); this.finished = true; return this; }
  redirect(a, b) {
    if (typeof a === 'number') { this.statusCode = a; this.headers.location = b; } else { this.statusCode = 302; this.headers.location = a; }
    this.finished = true;
    return this;
  }
}

export function createRequest({ method, url, host, cookie = '', body = '' }) {
  const u = new URL(url, `https://${host}`);
  return {
    method,
    originalUrl: u.pathname + u.search,
    path: u.pathname,
    baseUrl: '',
    query: parseQuery(u.search),
    params: {},
    headers: { host, cookie },
    protocol: 'https',
    secure: true,
    ip: '127.0.0.1',
    rawBody: body,
    body: undefined,
    get(name) { return this.headers[name.toLowerCase()]; },
  };
}
