/* ============================================================
   Patients.

   GET  /api/patients          the national search list (demographics only)
   POST /api/patients          register a patient and issue a UHID
   GET  /api/patients/:uhid    the clinical record — a logged read
        ?breakGlass=1&reason=…   emergency access, flagged for review
   ============================================================ */

const express = require('express');
const { pool, call } = require('../db/pool');
const { ah } = require('../db/errors');
const { requireLogin, requirePermission } = require('../auth');
const { bool, num } = require('../lib/format');

const router = express.Router();

/* v_patient_directory is a view, and views do not check permissions,
   so the route asks the database first. Patients cannot list everyone. */
router.get('/patients', requirePermission('patient.read_demographics'), ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_patient_directory ORDER BY registeredAt DESC, name');
  res.json(rows.map(p => ({ ...p, identityVerified: bool(p.identityVerified), encounterCount: num(p.encounterCount) })));
}));

/* register_patient() does everything that matters — the NID check, the
   locked UHID serial, the allergy lookup — in one transaction. The route
   only passes the form through. */
router.post('/patients', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const allergies = Array.isArray(b.allergies) ? b.allergies.join(',') : (b.allergies || null);
  const [[issued]] = await call('register_patient', [
    req.session.account.id,
    b.name, b.dob || null, b.sex, b.blood || null, b.phone || null, b.nid || null,
    b.district || null, b.address || null, b.kinName || null, b.kinRelation || null, b.kinPhone || null,
    allergies
  ]);
  const [[row]] = await pool.query('SELECT * FROM v_patient_directory WHERE uhid = ?', [issued.uhid]);
  res.status(201).json({ ...row, identityVerified: bool(row.identityVerified), encounterCount: 0 });
}));

/* The record. get_patient_record() decides the access basis, writes the
   access log, and only then returns eight result sets. This turns them
   into the one nested object js/seed.js describes — the API is where the
   normalized tables become the frontend's shape (er-design.md §4.3). */
router.get('/patients/:uhid', requireLogin, ah(async (req, res) => {
  const breakGlass = req.query.breakGlass === '1';
  const sets = await call('get_patient_record', [
    req.session.account.id, req.params.uhid, breakGlass, req.query.reason || null, req.ip
  ]);
  const [patientRows, allergies, encounters, rxLines, labs, vitals, referrals, accessLog] = sets;
  const p = patientRows[0];

  const byEncounter = (rows, map) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.encounter_id)) m.set(r.encounter_id, []);
      m.get(r.encounter_id).push(map(r));
    }
    return m;
  };
  const rx = byEncounter(rxLines, r => r.line);
  const lab = byEncounter(labs, r => ({ test: r.test, status: r.status, value: r.value, abnormal: bool(r.abnormal), ref: r.ref || null }));
  const vit = byEncounter(vitals, r => ({ recordedAt: r.recordedAt, bp: r.bp, pulse: r.pulse, temp: num(r.temp), spo2: r.spo2, weight: num(r.weight) }));

  res.json({
    uhid: p.uhid, name: p.name, dob: p.dob, sex: p.sex, blood: p.blood,
    phone: p.phone || '', nid: p.nid || '', district: p.district || '',
    address: p.address || '', kin: p.kin || '',
    registeredAt: p.registeredAt, registeredHospitalId: p.registeredHospitalId,
    identityVerified: bool(p.identityVerified),
    mergedUhids: p.mergedUhids ? p.mergedUhids.split(',') : [],
    access: { basis: p.basis, consentExpires: p.consentExpires, breakGlass: p.basis === 'break_glass' },
    allergies,
    encounters: encounters.map(e => ({
      id: e.id, date: e.date, hospitalId: e.hospitalId, type: e.type, doctor: e.doctor,
      dept: e.dept, dx: e.dx, notes: e.notes, isOpen: bool(e.isOpen),
      rx: rx.get(e.id) || [], labs: lab.get(e.id) || [], vitals: vit.get(e.id) || []
    })),
    referrals,
    accessLog: accessLog.map(l => ({ ...l, reviewed: bool(l.reviewed) }))
  });
}));

module.exports = router;
