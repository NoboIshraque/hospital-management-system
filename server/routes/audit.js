/* ============================================================
   Audit — decision 2.

   GET  /api/audit/break-glass             unreviewed break-glass reads
   POST /api/audit/break-glass/:id/review  mark one reviewed
   GET  /api/audit/duplicates              pairs that may be one person
   POST /api/patients/merge                { losingUhid, survivingUhid, reason }
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah, httpError, id } = require('../db/errors');
const { requireLogin, requirePermission } = require('../auth');

const router = express.Router();

/* A hospital admin sees reads made at their own hospital; the system
   admin, who has no hospital, sees the country. review_break_glass()
   enforces the same rule in the database, so this filter is only what
   the list shows, not what protects it. */
router.get('/audit/break-glass', requireLogin, ah(async (req, res) => {
  const [rows] = await call('break_glass_queue', [req.session.account.id]);
  res.json(rows.map(r => ({ ...r, hoursWaiting: Number(r.hoursWaiting) })));
}));

/* review_break_glass() makes the one change the access log's triggers
   allow: stamping reviewed_by, once — with a verdict, and a reason when the
   access was not justified (checklist I11). */
router.post('/audit/break-glass/:id/review', requireLogin, ah(async (req, res) => {
  const { verdict, note } = req.body;
  await call('review_break_glass', [req.session.account.id, id(req.params.id, 'The log id'),
    verdict ? String(verdict) : null, note ? String(note) : null]);
  res.json({ reviewed: true, verdict });
}));

/* Pairs the database thinks may be one person (a self-join view). Only for
   those who may merge: the list itself is a hint, merge_patients() is the act. */
router.get('/audit/duplicates', requirePermission('patient.merge'), ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_possible_duplicates ORDER BY name');
  res.json(rows);
}));

router.post('/patients/merge', requireLogin, ah(async (req, res) => {
  const { losingUhid, survivingUhid, reason } = req.body;
  if (!losingUhid || !survivingUhid) throw httpError(400, 'losingUhid and survivingUhid are required.');
  await call('merge_patients', [req.session.account.id, losingUhid, survivingUhid, reason || null]);
  res.json({ merged: true, survivingUhid });
}));

module.exports = router;
