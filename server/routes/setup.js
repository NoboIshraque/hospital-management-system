/* ============================================================
   Hospital setup (checklist I5) — what used to need seed.sql.

   GET  /api/setup/hospitals                 every hospital (system admin), or your own
   POST /api/setup/hospitals                 { name, district, tier, address, phone }   system admin
   POST /api/setup/hospitals/:id/active      { active }                                 system admin
   GET  /api/setup/:hospitalId               postings, schedules, leave, wards, beds, and the form choices
   POST /api/setup/:hospitalId/postings      { bmdc, name, qual, dept, fee, from }
   POST /api/setup/postings/:id/fee          { fee }
   POST /api/setup/postings/:id/end          { lastDay }
   POST /api/setup/postings/:id/schedules    { weekday, start, end, slot, from }
   POST /api/setup/schedules/:id/end         { lastDay }
   POST /api/setup/leave                     { doctorId, from, to, reason } → { bookedInside }
   DELETE /api/setup/leave/:id
   POST /api/setup/:hospitalId/wards         { name, type, sex }
   POST /api/setup/wards/:id/beds            { prefix, count }
   POST /api/setup/beds/service              { wardId, bedNo, out }

   Every rule — who may change which hospital, no stranded bookings, no
   doctor in two places at once — is in the procedures (procedures.sql §13).
   ============================================================ */

const express = require('express');
const { call } = require('../db/pool');
const { ah, id } = require('../db/errors');
const { requireLogin } = require('../auth');
const { bool, num } = require('../lib/format');
const reference = require('./reference');

const router = express.Router();
const me = req => req.session.account.id;
const str = v => (v === undefined || v === null || v === '' ? null : String(v));
const changed = (res, body) => { reference.clearDoctorsCache(); res.json(body || { saved: true }); };

router.get('/setup/hospitals', requireLogin, ah(async (req, res) => {
  const [rows] = await call('list_hospitals', [me(req)]);
  res.json(rows.map(h => ({ ...h, active: bool(h.active), postings: num(h.postings) })));
}));

router.post('/setup/hospitals', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const [[r]] = await call('add_hospital', [me(req), str(b.name), str(b.district), str(b.tier), str(b.address), str(b.phone)]);
  res.status(201);
  changed(res, { hospitalId: r.hospital_id });
}));

router.post('/setup/hospitals/:id/active', requireLogin, ah(async (req, res) => {
  await call('set_hospital_active', [me(req), id(req.params.id, 'The hospital id'), req.body.active === true]);
  changed(res, { active: req.body.active === true });
}));

router.get('/setup/:hospitalId', requireLogin, ah(async (req, res) => {
  const [postings, schedules, leave, wards, beds, wardTypes, tiers] =
    await call('org_setup', [me(req), id(req.params.hospitalId, 'The hospital id')]);
  res.json({
    postings: postings.map(p => ({ ...p, fee: num(p.fee), bookedAhead: num(p.bookedAhead) })),
    schedules,
    leave,
    wards: wards.map(w => ({ ...w, beds: num(w.beds), outOfService: num(w.outOfService) || 0 })),
    beds: beds.map(b => ({ ...b, outOfService: bool(b.outOfService) })),
    wardTypes,
    tiers: tiers.map(t => t.name)
  });
}));

router.post('/setup/:hospitalId/postings', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const [[r]] = await call('post_doctor', [me(req), id(req.params.hospitalId, 'The hospital id'), str(b.bmdc), str(b.name),
    str(b.qual), str(b.dept), b.fee === '' || b.fee == null ? null : Number(b.fee), str(b.from)]);
  res.status(201);
  changed(res, { postingId: r.posting_id, doctorId: r.doctor_id });
}));

router.post('/setup/postings/:id/fee', requireLogin, ah(async (req, res) => {
  await call('set_posting_fee', [me(req), id(req.params.id, 'The posting id'), req.body.fee == null ? null : Number(req.body.fee)]);
  changed(res);
}));

router.post('/setup/postings/:id/end', requireLogin, ah(async (req, res) => {
  await call('end_posting', [me(req), id(req.params.id, 'The posting id'), str(req.body.lastDay)]);
  changed(res);
}));

router.post('/setup/postings/:id/schedules', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const [[r]] = await call('add_schedule', [me(req), id(req.params.id, 'The posting id'),
    b.weekday === undefined || b.weekday === '' ? null : Number(b.weekday), str(b.start), str(b.end),
    b.slot == null ? null : Number(b.slot), str(b.from)]);
  res.status(201);
  changed(res, { scheduleId: r.schedule_id });
}));

router.post('/setup/schedules/:id/end', requireLogin, ah(async (req, res) => {
  await call('end_schedule', [me(req), id(req.params.id, 'The session id'), str(req.body.lastDay)]);
  changed(res);
}));

router.post('/setup/leave', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const [[r]] = await call('add_leave', [me(req), id(b.doctorId, 'doctorId'), str(b.from), str(b.to), str(b.reason)]);
  res.status(201);
  changed(res, { leaveId: r.leave_id, bookedInside: num(r.bookedInside) });
}));

router.delete('/setup/leave/:id', requireLogin, ah(async (req, res) => {
  await call('remove_leave', [me(req), id(req.params.id, 'The leave id')]);
  changed(res);
}));

router.post('/setup/:hospitalId/wards', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const [[r]] = await call('add_ward', [me(req), id(req.params.hospitalId, 'The hospital id'), str(b.name), str(b.type), str(b.sex)]);
  res.status(201);
  changed(res, { wardId: r.ward_id });
}));

router.post('/setup/wards/:id/beds', requireLogin, ah(async (req, res) => {
  const [[r]] = await call('add_beds', [me(req), id(req.params.id, 'The ward id'), str(req.body.prefix),
    req.body.count == null ? null : Number(req.body.count)]);
  res.status(201);
  changed(res, r);
}));

router.post('/setup/beds/service', requireLogin, ah(async (req, res) => {
  const b = req.body;
  await call('set_bed_service', [me(req), id(b.wardId, 'wardId'), str(b.bedNo), b.out === true]);
  changed(res, { outOfService: b.out === true });
}));

module.exports = router;
