/* ============================================================
   Patients.

   POST /api/patients/search     { q }  find a patient — specific, at most 20,
                                  NID and phone masked, every match logged
   POST /api/patients/matches    { name, dob, phone, nid }  the registration
                                  desk's duplicate check (decision 1)
   POST /api/patients            register a patient and issue a UHID
   POST /api/patients/:uhid/read the clinical record — a logged read
        { breakGlass: true, reason }   emergency access, flagged for review
   POST /api/allergies           { uhid, allergen, severity, note } a doctor records an allergy
   GET  /api/consents            a patient's own consent grants (A9)
   POST /api/consents/:id/revoke the patient takes one back

   There is no "list every patient" endpoint any more (security review
   L1), and opening a record is a POST, not a GET (W1): the browser sends
   the session cookie when someone follows a link from another website,
   so a GET that writes the access log could be triggered by a link. A
   POST from another site arrives without the cookie (SameSite=Lax).
   ============================================================ */

const express = require('express');
const { call } = require('../db/pool');
const { ah, id } = require('../db/errors');
const { requireLogin, clientIp } = require('../auth');
const { bool, num } = require('../lib/format');

const router = express.Router();

/* search_patients() checks the permission, refuses a vague query, masks
   NID and phone, and writes one access_log row per person it returns. */
const searchRow = p => ({ ...p, identityVerified: bool(p.identityVerified), encounterCount: num(p.encounterCount) });

router.post('/patients/search', requireLogin, ah(async (req, res) => {
  const q = typeof req.body.q === 'string' ? req.body.q.slice(0, 100) : '';
  const [rows] = await call('search_patients', [req.session.account.id, q, clientIp(req)]);
  res.json(rows.map(searchRow));
}));

router.post('/patients/matches', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const [rows] = await call('registration_matches', [req.session.account.id,
    b.name || null, b.dob || null, b.phone || null, b.nid || null, clientIp(req)]);
  res.json(rows.map(searchRow));
}));

/* register_patient() does everything that matters — the NID check, the
   locked UHID serial, the allergy lookup — in one transaction. The route
   only passes the form through. */
router.post('/patients', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const allergies = Array.isArray(b.allergies) ? b.allergies.join(',') : (b.allergies || null);
  const [[row]] = await call('register_patient', [
    req.session.account.id,
    b.name, b.dob || null, b.sex, b.blood || null, b.phone || null, b.nid || null,
    b.district || null, b.address || null, b.kinName || null, b.kinRelation || null, b.kinPhone || null,
    allergies
  ]);
  delete row.patient_id;     // an internal key: the API speaks in UHIDs
  res.status(201).json({ ...row, identityVerified: bool(row.identityVerified), encounterCount: 0 });
}));

/* The record. get_patient_record() decides the access basis, writes the
   access log, and only then returns eight result sets. This turns them
   into the one nested object js/seed.js describes — the API is where the
   normalized tables become the frontend's shape (er-design.md §4.3). */
router.post('/patients/:uhid/read', requireLogin, ah(async (req, res) => {
  const breakGlass = req.body.breakGlass === true;
  const reason = typeof req.body.reason === 'string' ? req.body.reason : null;
  const sets = await call('get_patient_record', [
    req.session.account.id, req.params.uhid, breakGlass, reason, clientIp(req)
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

/* record_allergy() lets a doctor record an allergy from their own open
   visit (stress test H2.10: before, allergies were set only at registration). */
router.post('/allergies', requireLogin, ah(async (req, res) => {
  const b = req.body;
  await call('record_allergy', [req.session.account.id, b.uhid || null, b.allergen || null,
    b.severity || null, b.note || null]);
  res.status(201).json({ recorded: true });
}));

/* A9. The patient's side of consent. Both procedures find the patient
   from the account, so a patient can only ever see and revoke their own
   grants; staff accounts are refused (403) by the procedure itself. */
router.get('/consents', requireLogin, ah(async (req, res) => {
  const [rows] = await call('list_consents', [req.session.account.id]);
  res.json(rows);
}));

router.post('/consents/:id/revoke', requireLogin, ah(async (req, res) => {
  await call('revoke_consent', [req.session.account.id, id(req.params.id, 'The consent id')]);
  res.json({ revoked: true });
}));

module.exports = router;
