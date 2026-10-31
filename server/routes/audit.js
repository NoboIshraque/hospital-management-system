/* ============================================================
   Audit — decision 2.

   GET  /api/audit/break-glass             unreviewed break-glass reads
   POST /api/audit/break-glass/:id/review  mark one reviewed
   POST /api/patients/merge                { losingUhid, survivingUhid, reason }
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah, httpError } = require('../db/errors');
const { requireLogin, requirePermission } = require('../auth');

const router = express.Router();

router.get('/audit/break-glass', requirePermission('audit.review'), ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_break_glass_queue ORDER BY at DESC');
  res.json(rows);
}));

/* review_break_glass() makes the one change the access log's triggers
   allow: stamping reviewed_by, once. */
router.post('/audit/break-glass/:id/review', requireLogin, ah(async (req, res) => {
  await call('review_break_glass', [req.session.account.id, Number(req.params.id)]);
  res.json({ reviewed: true });
}));

router.post('/patients/merge', requireLogin, ah(async (req, res) => {
  const { losingUhid, survivingUhid, reason } = req.body;
  if (!losingUhid || !survivingUhid) throw httpError(400, 'losingUhid and survivingUhid are required.');
  await call('merge_patients', [req.session.account.id, losingUhid, survivingUhid, reason || null]);
  res.json({ merged: true, survivingUhid });
}));

module.exports = router;
