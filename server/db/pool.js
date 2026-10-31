/* ============================================================
   The connection pool every route uses.

   It connects as uhid_app — the least-privilege user grants.sql
   creates — and never as root. uhid_app can run procedures and read
   views and lookup tables, nothing else. So if a route ever tries
   to read the patient table directly, MySQL refuses it: the rules
   in procedures.sql cannot be skipped by a careless route.

   A pool keeps up to 10 connections open and lends one to each
   query, instead of opening a new connection per request.
   ============================================================ */

const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.APP_DB_USER || !process.env.APP_DB_PASSWORD) {
  console.error('APP_DB_USER / APP_DB_PASSWORD are missing from server/.env.\n' +
                'Run  npm run db:reset  once: it creates the uhid_app user and adds them.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
  database: process.env.DB_NAME || 'uhid',
  dateStrings: true,        // '2026-08-08 09:00:00', not a JS Date in the server's time zone
  connectionLimit: 10
});

/* Call a stored procedure and return its result sets.

     const sets = await call('get_patient_record', [6, uhid, false, null, ip]);
     sets[0]  → rows of the procedure's first SELECT
     sets[1]  → rows of the second, and so on

   `db` is the pool by default; pass a single connection instead when the
   call is one step of a transaction (see routes/clinical.js). */
async function call(procedure, args = [], db = pool) {
  const placeholders = args.map(() => '?').join(', ');
  const [result] = await db.query(`CALL ${procedure}(${placeholders})`, args);
  // The last element is MySQL's status packet for the CALL itself, not rows.
  return Array.isArray(result) ? result.filter(Array.isArray) : [];
}

module.exports = { pool, call };
