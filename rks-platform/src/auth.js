// Inloggen, sessies, rollen en CSRF-bescherming.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { token, addDays, today } from './util.js';

const COOKIE = 'rks_sid';
const SESSION_DAYS = 14;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

export const passwordProblem = (pw) => {
  if (!pw || pw.length < 10) return 'Kies een wachtwoord van minimaal 10 tekens.';
  if (pw.length > 200) return 'Dit wachtwoord is te lang.';
  return '';
};

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(res, name, value, { maxAge, httpOnly = true } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const age = maxAge === undefined ? '' : `; Max-Age=${maxAge}`;
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}${secure}${age}`);
}

export function createSession(db, res, userId) {
  const id = token(32);
  db.run('INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)', id, userId, token(24), addDays(today(), SESSION_DAYS));
  db.run(`UPDATE users SET laatst_ingelogd = datetime('now') WHERE id = ?`, userId);
  cookie(res, COOKIE, id, { maxAge: SESSION_DAYS * 86400 });
}

export function destroySession(db, req, res) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) db.run('DELETE FROM sessions WHERE id = ?', sid);
  cookie(res, COOKIE, '', { maxAge: 0 });
}

// Zet req.user en req.csrf als er een geldige sessie is.
export function sessionMiddleware(db) {
  return (req, res, next) => {
    const sid = parseCookies(req.headers.cookie)[COOKIE];
    req.user = null;
    if (sid) {
      const row = db.get(`SELECT s.csrf, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.id = ? AND u.actief = 1`, sid);
      if (row && row.expires_at >= today()) {
        const { csrf, expires_at, password_hash, invite_token, ...user } = row;
        req.user = user;
        req.csrf = csrf;
      } else if (row) {
        db.run('DELETE FROM sessions WHERE id = ?', sid);
      }
    }
    res.locals.user = req.user;
    res.locals.csrf = req.csrf || '';
    next();
  };
}

// Elke POST van een ingelogde gebruiker moet het CSRF-token van de sessie meesturen.
export function csrfMiddleware(req, res, next) {
  if (req.method !== 'POST' || !req.user) return next();
  const sent = String(req.body?._csrf || '');
  const ok = sent.length === req.csrf.length && timingSafeEqual(Buffer.from(sent), Buffer.from(req.csrf));
  if (!ok) return res.status(403).send('Deze pagina is verlopen. Ga terug, vernieuw de pagina en probeer het opnieuw.');
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(`/login?terug=${encodeURIComponent(req.originalUrl)}`);
    if (!roles.includes(req.user.rol)) return res.status(403).send('Je hebt geen toegang tot deze pagina.');
    next();
  };
}

export const homeFor = (user) => ({ admin: '/beheer', zzp: '/mijn', klant: '/klant' }[user?.rol] || '/login');

// Eenvoudige rem op inlogpogingen per IP-adres.
const attempts = new Map();
export function loginAllowed(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, list);
  return list.length < 10;
}
export const loginFailed = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
export const loginSucceeded = (ip) => attempts.delete(ip);

export function createInvite(db, { email, naam, rol, zzpId = null, klantId = null }) {
  const t = token(24);
  const expires = addDays(today(), 7);
  const existing = db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) {
    db.run('UPDATE users SET invite_token = ?, invite_expires = ?, actief = 1 WHERE id = ?', t, expires, existing.id);
  } else {
    db.run('INSERT INTO users (email, naam, rol, zzp_id, klant_id, invite_token, invite_expires) VALUES (?, ?, ?, ?, ?, ?, ?)',
      email, naam, rol, zzpId, klantId, t, expires);
  }
  return t;
}
