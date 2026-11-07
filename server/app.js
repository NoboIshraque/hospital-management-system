/* ============================================================
   UHID National Hospital Management System — the Express server.

   One process does two jobs:
     /api/…       the JSON API, in routes/
     everything   the pages in public/, served as static files
   So the site and its API share one address (http://localhost:3000)
   and the browser sends the session cookie to both.

   Start it:   npm start        (from the server folder)
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

/* Checklist I10: the running site needs uhid_app's password, never root's.
   Root's login is for the database scripts (db:reset, db:install,
   db:backup, db:restore), which read it from server/.env.admin. A
   production start refuses to run while root's password is in .env:
   anyone who broke into the site would otherwise hold the whole database. */
if (process.env.DB_PASSWORD !== undefined && require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to start: DB_PASSWORD (MySQL root) is in server/.env.\n' +
      'Move DB_USER and DB_PASSWORD to server/.env.admin: the database scripts read it, the site does not.');
    process.exit(1);
  }
  console.log('Note: root\u2019s MySQL password is in server/.env. Fine on a development laptop; ' +
    'on a real server move it to server/.env.admin (docs/operations.md).');
}

const express = require('express');
const { sessionMiddleware } = require('./auth');
const { securityHeaders, sameOriginWrites } = require('./security');
const { errorHandler } = require('./db/errors');
const { requestLog } = require('./lib/request-log');
const { pool } = require('./db/pool');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');                 // don't advertise the framework
// No proxy is trusted (stress test H2.1). With 'loopback', every client of a
// server bound to 127.0.0.1 counted as a proxy, so any of them could name its
// own address in X-Forwarded-For: dodge the per-address login limit and forge
// the IP written to access_log. Behind a real proxy, set the hop count here.
app.set('trust proxy', false);
app.use(requestLog);                         // I9: one line per request, UHIDs masked
app.use(securityHeaders);                    // W3: CSP, no framing, nosniff (security.js)
app.use(express.json({ limit: '100kb' }));
app.use(sessionMiddleware);
app.use('/api', sameOriginWrites);           // W2: refuse writes started by another website

// Every API response is about one user's data: never cache it.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.use('/api', require('./routes/health'));       // I9: GET /api/health
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/reference'));
app.use('/api', require('./routes/audit'));        // before patients: /patients/merge
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/setup'));
app.use('/api', require('./routes/patients'));
app.use('/api', require('./routes/appointments'));
app.use('/api', require('./routes/wards'));
app.use('/api', require('./routes/clinical'));

app.use('/api', (req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}.` }));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Anything else is a page that does not exist.
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), err => {
    if (err) res.type('text').send('Page not found.');
  });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';   // behind a reverse proxy on the same machine, keep 127.0.0.1
if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`UHID running at http://localhost:${PORT}  (API under /api, health at /api/health)`);
  });

  /* Checklist I9: a clean shutdown. On Ctrl+C, or when Windows or a
     service manager stops the process: stop taking new requests, let the
     ones in progress finish, close the database connections, then exit.
     If something hangs, give up after 10 seconds. */
  let stopping = false;
  const shutdown = signal => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: finishing the requests in progress, then stopping...`);
    server.close(async () => {
      try { await pool.end(); } catch (e) { /* already closed */ }
      console.log('Stopped cleanly.');
      process.exit(0);
    });
    setTimeout(() => { console.error('Requests still running after 10 s; stopping anyway.'); process.exit(1); }, 10000).unref();
  };
  ['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach(s => process.on(s, () => shutdown(s)));
  // Windows has no real signals: process managers (PM2, and the test in
  // scripts/shutdown-test.js) ask a Node process to stop with this message.
  process.on('message', m => { if (m === 'shutdown') shutdown('shutdown message'); });
}

module.exports = app;
