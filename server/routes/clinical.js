/* ============================================================
   Clinical writes — decisions 5 and 6.

   POST /api/encounters      a whole visit, in ONE transaction
   POST /api/lab-results     { orderId, valueNum, valueText }
   POST /api/referrals       { encounterId, toHospitalId, dept, reason, urgency }
   GET  /api/referrals/inbox patients referred to this hospital, not yet arrived
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah, httpError } = require('../db/errors');
const { requireLogin, requirePermission } = require('../auth');

const router = express.Router();

/* A visit is several STEP procedures (procedures.sql header): open the
   encounter, add each diagnosis, vitals, each drug line, each lab order,
   close it. They run on ONE borrowed connection inside ONE transaction,
   so if the fourth drug line hits an allergy, the encounter and the three
   lines before it are rolled back too — the visit is saved whole or not
   at all.

   body: { uhid, type: 'OPD'|'Emergency', complaint, notes,
           diagnoses: [{ icd10, primary, certainty, note }],
           vitals: { systolic, diastolic, pulse, temp, spo2, weight },
           prescriptions: [{ medicineId, dose, frequency, days, instruction }],
           labTests: ['Haemoglobin', …],
           end: true }                                                      */
router.post('/encounters', requireLogin, ah(async (req, res) => {
  const me = req.session.account.id;
  const b = req.body;
  if (!b.uhid) throw httpError(400, 'uhid is required.');
  if (!Array.isArray(b.diagnoses) || b.diagnoses.length === 0) throw httpError(400, 'Record at least one diagnosis.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[opened]] = await call('start_encounter', [me, b.uhid, b.type || 'OPD', b.complaint || null, b.notes || null], conn);
    const encounterId = opened.encounter_id;

    for (const [i, d] of b.diagnoses.entries()) {
      await call('add_diagnosis', [me, encounterId, d.icd10, d.primary ?? i === 0, d.certainty || null, d.note || null], conn);
    }
    if (b.vitals) {
      const v = b.vitals;
      await call('record_vitals', [me, encounterId, v.systolic ?? null, v.diastolic ?? null,
        v.pulse ?? null, v.temp ?? null, v.spo2 ?? null, v.weight ?? null], conn);
    }
    for (const rx of b.prescriptions || []) {
      await call('prescribe', [me, encounterId, rx.medicineId, rx.dose, rx.frequency, rx.days ?? null, rx.instruction || null], conn);
    }
    for (const test of b.labTests || []) {
      await call('order_lab', [me, encounterId, test], conn);
    }
    if (b.end) await call('end_encounter', [me, encounterId], conn);

    await conn.commit();
    res.status(201).json({ encounterId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();     // always give the connection back, or the pool runs dry
  }
}));

router.post('/lab-results', requireLogin, ah(async (req, res) => {
  const { orderId, valueNum, valueText } = req.body;
  if (!orderId || (valueNum == null && !valueText)) throw httpError(400, 'orderId and a value are required.');
  await call('report_lab_result', [req.session.account.id, orderId, valueNum ?? null, valueText || null]);
  res.status(201).json({ reported: true });
}));

/* refer_patient() writes the referral AND a 24-hour consent grant to the
   receiving hospital, in one transaction — the seam between decisions 2 and 6. */
router.post('/referrals', requireLogin, ah(async (req, res) => {
  const { encounterId, toHospitalId, dept, reason, urgency } = req.body;
  if (!encounterId || !toHospitalId) throw httpError(400, 'encounterId and toHospitalId are required.');
  const [[r]] = await call('refer_patient', [req.session.account.id, encounterId, toHospitalId,
    dept || null, reason || null, urgency || null]);
  res.status(201).json({ referralId: r.referral_id });
}));

router.get('/referrals/inbox', requirePermission('patient.read_clinical'), ah(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM v_referral_inbox WHERE toHospitalId = ? ORDER BY referredAt',
    [req.session.account.hospitalId]);
  res.json(rows);
}));

module.exports = router;
