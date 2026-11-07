/* ============================================================
   GET /api/health — is the site up, and can it reach its database?

   For whoever (or whatever) watches the site: a monitoring service, a
   scheduled check, the person on call. 200 with { status: 'ok' } when
   MySQL answers; 503 with { status: 'down' } when it does not. Public,
   and says nothing about patients, accounts or configuration.
   ============================================================ */

const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();
const STARTED = Date.now();

router.get('/health', async (req, res) => {
  const t = Date.now();
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up', databaseMs: Date.now() - t,
               uptimeSeconds: Math.round((Date.now() - STARTED) / 1000) });
  } catch (e) {
    res.status(503).json({ status: 'down', database: 'not answering' });
  }
});

module.exports = router;
