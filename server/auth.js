/* ============================================================
   Sessions and the guards routes use.

   After POST /api/login succeeds, the account is kept in
   req.session.account on the SERVER. The browser holds only a
   signed, random session id in an httpOnly cookie, which page
   JavaScript cannot read. Every route takes "who is asking" from
   req.session — never from the request body or the URL — so a user
   cannot claim to be someone else.

   Sessions live in memory: restarting the server signs everyone
   out. Fine for a course project; a real deployment would keep them
   in a store such as Redis or a MySQL table.
   ============================================================ */

const session = require('express-session');
const { pool } = require('./db/pool');
const { ah } = require('./db/errors');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is missing from server/.env. Set it to any long random sentence.');
  process.exit(1);
}

const sessionMiddleware = session({
  name: 'uhid.sid',
  secret: process.env.SESSION_SECRET,   // signs the cookie so it cannot be forged
  resave: false,
  saveUninitialized: false,             // no cookie until someone signs in
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
});

function requireLogin(req, res, next) {
  if (!req.session.account) return res.status(401).json({ error: 'Please sign in.' });
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

module.exports = { sessionMiddleware, requireLogin, requirePermission, frontendRole };
