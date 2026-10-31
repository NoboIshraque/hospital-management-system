/* ============================================================
   Reference data — what js/data.js used to hold as constants.

   GET /api/hospitals                    HOSPITALS
   GET /api/departments                  DEPARTMENTS
   GET /api/districts                    the 64 districts, for registration
   GET /api/catalogue                    allergens, medicines, diagnoses, lab tests
   GET /api/doctors                      DOCTORS, plus each one's next free slot
   GET /api/doctors/:id/availability     the slot grid on the booking screen

   Hospitals, departments and doctors are public — the landing page
   shows them to visitors who have not signed in.
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah, httpError } = require('../db/errors');
const { requireLogin } = require('../auth');
const { nextFreeLabel, groupSlotsByDay, num } = require('../lib/format');

const router = express.Router();

router.get('/hospitals', ah(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, `div`, dist, tier FROM v_hospital_directory ORDER BY id');
  res.json(rows);
}));

router.get('/departments', ah(async (req, res) => {
  const [rows] = await pool.query('SELECT name FROM department ORDER BY department_id');
  res.json(rows.map(r => r.name));
}));

router.get('/districts', ah(async (req, res) => {
  const [rows] = await pool.query('SELECT district, `div` FROM v_district_list ORDER BY district');
  res.json(rows);
}));

router.get('/catalogue', requireLogin, ah(async (req, res) => {
  const [allergens] = await pool.query('SELECT name, class FROM allergen ORDER BY name');
  const [medicines] = await pool.query(
    'SELECT medicine_id AS id, generic_name AS name, form, strength, drug_class AS class FROM medicine ORDER BY generic_name');
  const [diagnoses] = await pool.query('SELECT icd10_code AS code, term FROM diagnosis ORDER BY term');
  const [labTests] = await pool.query('SELECT name, unit FROM lab_test ORDER BY name');
  res.json({ allergens, medicines, diagnoses, labTests });
}));

/* One row per current posting (er-design.md §4.2): id is the posting id.
   nextFree comes from ONE call to doctor_availability() for every posting
   over the next fortnight — the first slot per posting that is not taken. */
router.get('/doctors', ah(async (req, res) => {
  const [doctors] = await pool.query('SELECT * FROM v_doctor_directory ORDER BY id');
  const [slots] = await call('doctor_availability', [null, todayYmd(), 14]);
  const first = new Map();
  for (const s of slots) {
    if (!s.taken && !first.has(s.posting_id)) first.set(s.posting_id, s.slot_start);
  }
  res.json(doctors.map(d => ({
    ...d,
    fee: num(d.fee),
    nextFree: first.has(d.id) ? nextFreeLabel(first.get(d.id)) : null
  })));
}));

router.get('/doctors/:id/availability', ah(async (req, res) => {
  const id = Number(req.params.id);
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Doctor id must be a positive number.');
  const [rows] = await call('doctor_availability', [id, todayYmd(), days]);
  res.json(groupSlotsByDay(rows));
}));

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = router;
