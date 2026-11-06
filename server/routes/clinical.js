/* ============================================================
   Clinical writes — decisions 5 and 6.

   POST /api/encounters      a whole visit, in ONE transaction
   GET  /api/lab-orders      the lab technician's worklist at their hospital
   POST /api/lab-results     { orderId, valueNum, valueText } → { abnormal }
   POST /api/referrals       { encounterId, toHospitalId, dept, reason, urgency }
   GET  /api/referrals/inbox patients referred to this hospital, not yet arrived
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah, httpError, id, list } = require('../db/errors');
const { requireLogin, requirePermission } = require('../auth');
const { bool, num } = require('../lib/format');

const router = express.Router();

/* A visit is several STEP procedures (procedures.sql header): open the
   encounter, add each diagnosis, vitals, each drug line, each lab order,
   close it. They run on ONE borrowed connection inside ONE transaction,
   so if the fourth drug line hits an allergy, the encounter and the three
   lines before it are rolled back too — the visit is saved whole or not
   at all.

   body: { uhid, type: 'OPD'|'Emergency', complaint, notes,
           reason   — needed only when the doctor has no appointment today,
                      referral, consent or admission for this patient; it is
                      logged and reviewed like break-glass (security review A1)
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
  // I3: a visit is a handful of lines, not hundreds. Each line is a
  // procedure call inside one transaction that is holding locks.
  const diagnoses = list(b.diagnoses, 'diagnoses', 10);
  const prescriptions = list(b.prescriptions, 'drug lines', 20);
  const labTests = list(b.labTests, 'lab tests', 20);
  // Each line must be the right shape (stress test H2.5: [null] crashed with a 500).
  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  if (!diagnoses.every(d => isObj(d) && typeof d.icd10 === 'string')) throw httpError(400, 'Each diagnosis needs an icd10 code.');
  if (!prescriptions.every(isObj)) throw httpError(400, 'Each drug line must be an object.');
  if (!labTests.every(t => typeof t === 'string')) throw httpError(400, 'Each lab test is a name.');
  if (b.vitals != null && !isObj(b.vitals)) throw httpError(400, 'vitals must be an object.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[opened]] = await call('start_encounter', [me, b.uhid, b.type || 'OPD', b.complaint || null, b.notes || null, b.reason || null], conn);
    const encounterId = opened.encounter_id;

    for (const [i, d] of diagnoses.entries()) {
      await call('add_diagnosis', [me, encounterId, d.icd10, d.primary ?? i === 0, d.certainty || null, d.note || null], conn);
    }
    if (b.vitals) {
      const v = b.vitals;
      await call('record_vitals', [me, encounterId, v.systolic ?? null, v.diastolic ?? null,
        v.pulse ?? null, v.temp ?? null, v.spo2 ?? null, v.weight ?? null], conn);
    }
    for (const rx of prescriptions) {
      await call('prescribe', [me, encounterId, id(rx.medicineId, 'medicineId'), rx.dose, rx.frequency, rx.days ?? null, rx.instruction || null], conn);
    }
    for (const test of labTests) {
      await call('order_lab', [me, encounterId, test], conn);
    }
    if (b.end) await call('end_encounter', [me, encounterId], conn);

    await conn.commit();
    res.status(201).json({ encounterId });
  } catch (err) {
    await conn.rollback();
    // The rollback also undid the flagged access_log row start_encounter
    // wrote for a doctor with no basis — but the refusal may already have
    // told them something (an allergy). Log it again, outside the
    // transaction, so it stays (stress test H2.2).
    if (b.reason) {
      try { await call('log_unsaved_encounter', [me, String(b.uhid), String(b.reason).slice(0, 300)]); }
      catch (e) { /* the visit's own error is the one to report */ }
    }
    throw err;
  } finally {
    conn.release();     // always give the connection back, or the pool runs dry
  }
}));

/* lab_worklist() checks lab.report and keeps to the caller's hospital
   itself — a test name is clinical content, so it is not in a view. */
router.get('/lab-orders', requireLogin, ah(async (req, res) => {
  const [rows] = await call('lab_worklist', [req.session.account.id]);
  res.json(rows.map(r => ({ ...r, refLow: num(r.refLow), refHigh: num(r.refHigh), hoursWaiting: num(r.hoursWaiting) })));
}));

/* The answer says whether the result is abnormal — decided by
   trg_lab_result_bi from the test's reference range, not by this code. */
router.post('/lab-results', requireLogin, ah(async (req, res) => {
  const { orderId, valueNum, valueText } = req.body;
  if (!orderId || (valueNum == null && !valueText)) throw httpError(400, 'orderId and a value are required.');
  if (valueNum != null && !Number.isFinite(Number(valueNum))) throw httpError(400, 'valueNum must be a number.');
  const [[r]] = await call('report_lab_result', [req.session.account.id, id(orderId, 'orderId'), valueNum ?? null, valueText || null]);
  res.status(201).json({ reported: true, abnormal: bool(r.abnormal) });
}));

/* refer_patient() writes the referral AND a 24-hour consent grant to the
   receiving hospital, in one transaction — the seam between decisions 2 and 6. */
router.post('/referrals', requireLogin, ah(async (req, res) => {
  const { encounterId, toHospitalId, dept, reason, urgency } = req.body;
  if (!encounterId || !toHospitalId) throw httpError(400, 'encounterId and toHospitalId are required.');
  const [[r]] = await call('refer_patient', [req.session.account.id, id(encounterId, 'encounterId'), id(toHospitalId, 'toHospitalId'),
    dept || null, reason || null, urgency || null]);
  res.status(201).json({ referralId: r.referral_id });
}));

/* referral_inbox() checks the permission and keeps to the caller's
   hospital in the database: referral reasons are clinical content. */
router.get('/referrals/inbox', requireLogin, ah(async (req, res) => {
  const [rows] = await call('referral_inbox', [req.session.account.id]);
  res.json(rows);
}));

module.exports = router;
