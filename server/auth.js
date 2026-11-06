/* ============================================================
   Sessions and the guards routes use.

   After POST /api/login succeeds, the account is kept in
   req.session.account on the SERVER. The browser holds only a
   signed, random session id in an httpOnly cookie, which page
   JavaScript cannot read. Every route takes "who is asking" from
   req.session — never from the request body or the URL — so a user
   cannot claim to be someone else.

   Two time limits (security review S5): a session ends after 30
   minutes with no request (the cookie's maxAge, renewed on every
   request by rolling: true), and after 8 hours whatever happens
   (loginAt, checked in requireLogin) — a shift, not for ever.

   Sessions live in memory: restarting the server signs everyone
   out. Fine for one laptop (accepted, review item S4); a site on
   several servers would keep them in a shared store such as a MySQL
   table.
   ============================================================ */

const session = require('express-session');
const { pool } = require('./db/pool');
const { ah } = require('./db/errors');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is missing from server/.env. Set it to any long random sentence.');
  process.exit(1);
}

const IDLE_MS  = 30 * 60 * 1000;          // 30 minutes without a request
const SHIFT_MS = 8 * 60 * 60 * 1000;      // 8 hours from sign-in, at most

const sessionMiddleware = session({
  name: 'uhid.sid',
  secret: process.env.SESSION_SECRET,   // signs the cookie so it cannot be forged
  resave: false,
  saveUninitialized: false,             // no cookie until someone signs in
  rolling: true,                        // each request restarts the idle clock
  cookie: {
    httpOnly: true,                     // page JavaScript cannot read it
    sameSite: 'lax',                    // not sent on another site's POST
    secure: process.env.COOKIE_SECURE === '1',   // S3: HTTPS only, once the site has HTTPS
    maxAge: IDLE_MS
  }
});

function requireLogin(req, res, next) {
  const account = req.session.account;
  if (!account) return res.status(401).json({ error: 'Please sign in.' });
  if (Date.now() - (account.loginAt || 0) > SHIFT_MS) {
    return req.session.destroy(() => res.status(401).json({ error: 'Your session has ended. Please sign in again.' }));
  }
  // A one-time password (new account, reset) must be replaced before the
  // account may do anything else: only /api/me, /api/me/password and
  // /api/logout answer until it is (checklist I1).
  if (account.mustChange && !req.originalUrl.startsWith('/api/me')) {
    return res.status(403).json({ error: 'Choose your own password before you continue.', mustChangePassword: true });
  }
  next();
}

/* Ask the DATABASE whether this account has the permission. The
   role → permission table is the one source of truth; the API never
   keeps its own copy. Used only in front of views, which (unlike the
   procedures) do not check permissions themselves. */
function requirePermission(code) {
  return [requireLogin, ah(async (req, res, next) => {
    const [[row]] = await pool.query('SELECT has_permission(?, ?) AS ok', [req.session.account.id, code]);
    if (!row.ok) {
      return res.status(403).json({ error: `Your role is not allowed to do this (it needs the ${code} permission).` });
    }
    next();
  })];
}

/* The role names the frontend's ROLES object uses (js/data.js). The
   database calls the hospital administrator 'hospital_admin'. */
const FRONTEND_ROLE = { hospital_admin: 'admin' };
const frontendRole = code => FRONTEND_ROLE[code] || code;

/* The caller's address, as written to access_log: a real IP or nothing
   (stress test H2.1 — a forged or oversized value once broke every logged read). */
const net = require('net');
const clientIp = req => (net.isIP(req.ip || '') ? req.ip : null);

module.exports = { sessionMiddleware, requireLogin, requirePermission, frontendRole, clientIp };
