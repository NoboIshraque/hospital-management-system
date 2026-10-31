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

const express = require('express');
const { sessionMiddleware } = require('./auth');
const { errorHandler } = require('./db/errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');                 // don't advertise the framework
app.set('trust proxy', 'loopback');          // req.ip is the real client when run behind a local proxy
app.use(express.json({ limit: '100kb' }));
app.use(sessionMiddleware);

// Every API response is about one user's data: never cache it.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/reference'));
app.use('/api', require('./routes/audit'));        // before patients: /patients/merge
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
if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`UHID running at http://localhost:${PORT}  (API under /api)`);
  });
}

module.exports = app;
