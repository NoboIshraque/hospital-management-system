/* ============================================================
   Wards and beds — decision 7.

   GET  /api/wards                          the bed board for the signed-in hospital
   POST /api/admissions                     { uhid, postingId, wardId, bedNo, complaint }
   POST /api/admissions/:id/transfer        { wardId, bedNo }
   POST /api/admissions/:id/discharge       { summary, outcome }
   POST /api/beds/clean                     { wardId, bedNo }

   No route here ever sets a bed's status. Each one calls a procedure
   that writes bed_occupancy; the triggers on that table change the
   bed. The uhid_app user could not UPDATE bed even if a route tried.
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah, httpError, id } = require('../db/errors');
const { requireLogin } = require('../auth');
const { num } = require('../lib/format');

const router = express.Router();

/* v_bed_board, grouped into the WARDS shape pages/wards.js renders:
   [{ id, name, type, beds: [{ no, status, patient, uhid, dx, days, admissionId }] }] */
router.get('/wards', requireLogin, ah(async (req, res) => {
  const hospitalId = req.session.account.hospitalId;
  if (!hospitalId) throw httpError(400, 'The bed board belongs to a hospital, and this account has none.');
  const [rows] = await pool.query(
    'SELECT * FROM v_bed_board WHERE hospital_id = ? ORDER BY ward_id, no', [hospitalId]);
  const wards = [];
  for (const r of rows) {
    let w = wards[wards.length - 1];
    if (!w || w.id !== r.ward_id) {
      w = { id: r.ward_id, name: r.ward, type: r.wardType, beds: [] };
      wards.push(w);
    }
    w.beds.push({
      no: r.no, status: r.status, admissionId: r.admissionId,
      patient: r.patient, uhid: r.uhid, dx: r.dx, days: num(r.days)
    });
  }
  res.json(wards);
}));

router.post('/admissions', requireLogin, ah(async (req, res) => {
  const { uhid, postingId, wardId, bedNo, complaint } = req.body;
  if (!uhid || !postingId || !wardId || !bedNo) throw httpError(400, 'uhid, postingId, wardId and bedNo are all required.');
  const [[r]] = await call('admit_patient', [req.session.account.id, String(uhid), id(postingId, 'postingId'),
    id(wardId, 'wardId'), String(bedNo), complaint ? String(complaint) : null]);
  res.status(201).json({ admissionId: r.admission_id, encounterId: r.encounter_id });
}));

router.post('/admissions/:id/transfer', requireLogin, ah(async (req, res) => {
  const { wardId, bedNo } = req.body;
  if (!wardId || !bedNo) throw httpError(400, 'wardId and bedNo are required.');
  await call('transfer_patient', [req.session.account.id, id(req.params.id, 'The admission id'), id(wardId, 'wardId'), String(bedNo)]);
  res.json({ transferred: true });
}));

router.post('/admissions/:id/discharge', requireLogin, ah(async (req, res) => {
  await call('discharge_patient', [req.session.account.id, id(req.params.id, 'The admission id'),
    req.body.summary || null, req.body.outcome || null]);
  res.json({ discharged: true });
}));

router.post('/beds/clean', requireLogin, ah(async (req, res) => {
  const { wardId, bedNo } = req.body;
  if (!wardId || !bedNo) throw httpError(400, 'wardId and bedNo are required.');
  await call('mark_bed_clean', [req.session.account.id, id(wardId, 'wardId'), String(bedNo)]);
  res.json({ status: 'free' });
}));

module.exports = router;
