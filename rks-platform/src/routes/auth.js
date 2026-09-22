import { Router } from 'express';
import { html } from '../views/html.js';
import { csrfField } from '../views/components.js';
import {
  verifyPassword, hashPassword, passwordProblem, createSession, destroySession, homeFor,
  loginAllowed, loginFailed, loginSucceeded,
} from '../auth.js';
import { clean, today } from '../util.js';

const safeReturn = (url) => (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '');

export default function authRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => res.redirect(req.user ? homeFor(req.user) : '/login'));

  const loginPage = (res, { email = '', error = '', terug = '' } = {}) => res.page('Inloggen', html`
    <div class="auth">
      <h1>Inloggen</h1>
      <p class="muted">Voor vakmensen, opdrachtgevers en RKS.</p>
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <form method="post" action="/login" class="stack">
        <input type="hidden" name="terug" value="${terug}">
        <div class="field"><label for="f-email">E-mailadres</label><input id="f-email" name="email" type="email" autocomplete="username" required value="${email}"></div>
        <div class="field"><label for="f-pw">Wachtwoord</label><input id="f-pw" name="wachtwoord" type="password" autocomplete="current-password" required></div>
        <button class="btn btn--primary btn--lg" type="submit">Inloggen</button>
      </form>
      <p class="hint">Wachtwoord vergeten? Vraag RKS om een nieuwe uitnodigingslink.</p>
    </div>`, { bare: true });

  r.get('/login', (req, res) => {
    if (req.user) return res.redirect(homeFor(req.user));
    loginPage(res, { terug: safeReturn(req.query.terug) });
  });

  r.post('/login', (req, res) => {
    const ip = req.ip;
    const email = clean(req.body.email, 200).toLowerCase();
    const terug = safeReturn(req.body.terug);
    if (!loginAllowed(ip)) return res.status(429).send('Te veel inlogpogingen. Probeer het over een kwartier opnieuw.');
    const user = db.get('SELECT * FROM users WHERE email = ? AND actief = 1', email);
    if (!user || !verifyPassword(String(req.body.wachtwoord || ''), user.password_hash)) {
      loginFailed(ip);
      res.status(401);
      return loginPage(res, { email, terug, error: 'Dit e-mailadres en wachtwoord horen niet bij elkaar.' });
    }
    loginSucceeded(ip);
    createSession(db, res, user.id);
    res.redirect(terug || homeFor(user));
  });

  r.post('/logout', (req, res) => {
    destroySession(db, req, res);
    res.redirect('/login');
  });

  // ---------- uitnodiging: wachtwoord instellen ----------
  const inviteUser = (t) => db.get('SELECT * FROM users WHERE invite_token = ? AND invite_expires >= ? AND actief = 1', t, today());

  const invitePage = (res, user, error = '') => res.page('Account activeren', html`
    <div class="auth">
      <h1>Welkom, ${user.naam}</h1>
      <p class="muted">Kies een wachtwoord voor ${user.email}. Daarna ben je meteen ingelogd.</p>
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <form method="post" class="stack">
        <div class="field"><label for="f-pw">Nieuw wachtwoord</label><input id="f-pw" name="wachtwoord" type="password" autocomplete="new-password" minlength="10" required><p class="hint">Minimaal 10 tekens.</p></div>
        <div class="field"><label for="f-pw2">Herhaal wachtwoord</label><input id="f-pw2" name="herhaal" type="password" autocomplete="new-password" required></div>
        <button class="btn btn--primary btn--lg" type="submit">Account activeren</button>
      </form>
    </div>`, { bare: true });

  r.get('/uitnodiging/:token', (req, res) => {
    const user = inviteUser(req.params.token);
    if (!user) return res.status(404).page('Link verlopen', html`<div class="auth"><h1>Deze link werkt niet meer</h1><p>De uitnodiging is verlopen of al gebruikt. Vraag RKS om een nieuwe link.</p></div>`, { bare: true });
    invitePage(res, user);
  });

  r.post('/uitnodiging/:token', (req, res) => {
    const user = inviteUser(req.params.token);
    if (!user) return res.redirect(`/uitnodiging/${encodeURIComponent(req.params.token)}`);
    const pw = String(req.body.wachtwoord || '');
    const problem = passwordProblem(pw) || (pw !== String(req.body.herhaal || '') ? 'De twee wachtwoorden zijn niet gelijk.' : '');
    if (problem) return invitePage(res, user, problem);
    db.run('UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires = NULL WHERE id = ?', hashPassword(pw), user.id);
    db.audit(user.email, 'account geactiveerd', 'user', user.id);
    createSession(db, res, user.id);
    res.redirect(homeFor(user));
  });

  // ---------- eerste installatie ----------
  // Alleen beschikbaar zolang er nog geen beheerder is, en alleen met de SETUP_CODE uit de omgeving.
  const hasAdmin = () => Boolean(db.get(`SELECT 1 FROM users WHERE rol = 'admin'`));
  const setupPage = (res, error = '') => res.page('Installatie', html`
    <div class="auth">
      <h1>Eerste beheerder aanmaken</h1>
      ${process.env.SETUP_CODE ? '' : html`<p class="error-box">Stel eerst de omgevingsvariabele SETUP_CODE in bij je hosting en start de app opnieuw.</p>`}
      ${error ? html`<p class="error-box" role="alert">${error}</p>` : ''}
      <form method="post" class="stack">
        <div class="field"><label for="f-code">Installatiecode</label><input id="f-code" name="code" type="password" required><p class="hint">De waarde van SETUP_CODE.</p></div>
        <div class="field"><label for="f-naam">Je naam</label><input id="f-naam" name="naam" required></div>
        <div class="field"><label for="f-email">E-mailadres</label><input id="f-email" name="email" type="email" required></div>
        <div class="field"><label for="f-pw">Wachtwoord</label><input id="f-pw" name="wachtwoord" type="password" minlength="10" required></div>
        <button class="btn btn--primary btn--lg" type="submit">Beheerder aanmaken</button>
      </form>
    </div>`, { bare: true });

  r.get('/setup', (req, res) => (hasAdmin() ? res.redirect('/login') : setupPage(res)));
  r.post('/setup', (req, res) => {
    if (hasAdmin()) return res.redirect('/login');
    const code = process.env.SETUP_CODE;
    if (!code || String(req.body.code || '') !== code) return setupPage(res, 'De installatiecode klopt niet.');
    const naam = clean(req.body.naam, 100), email = clean(req.body.email, 200).toLowerCase();
    const pw = String(req.body.wachtwoord || '');
    const problem = (!naam || !email ? 'Vul je naam en e-mailadres in.' : '') || passwordProblem(pw);
    if (problem) return setupPage(res, problem);
    const id = db.run(`INSERT INTO users (email, naam, rol, password_hash) VALUES (?, ?, 'admin', ?)`, email, naam, hashPassword(pw)).id;
    db.audit(email, 'eerste beheerder aangemaakt', 'user', id);
    createSession(db, res, id);
    res.redirect('/beheer/instellingen');
  });

  return r;
}

export { csrfField };
