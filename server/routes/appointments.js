/* ============================================================
   Appointments — decision 4.

   GET    /api/appointments        ?from=YYYY-MM-DD&days=N  the caller's list
   POST   /api/appointments        { postingId, uhid, slotStart }
   DELETE /api/appointments/:id    cancel
   POST   /api/appointments/:id/no-show   the patient did not come

   Whose list it is (a patient's own, a doctor's own, a hospital's) is
   decided in list_appointments(), not here.

   book_appointment() locks the doctor, checks the slot is real and
   free, and inserts — all in one transaction. If two requests race
   for one slot, the second is refused with "That slot has just been
   taken" and the route turns that into a 409. scripts/race-booking.js
   demonstrates exactly that through this endpoint.
   ============================================================ */

const express = require('express');
const { call } = require('../db/pool');
const { ah, httpError, id } = require('../db/errors');
const { requireLogin } = require('../auth');
const { bool } = require('../lib/format');

const router = express.Router();

router.get('/appointments', requireLogin, ah(async (req, res) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const from = req.query.from === undefined ? today : String(req.query.from);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw httpError(400, 'from must be a date, YYYY-MM-DD.');
  const days = req.query.days === undefined ? 1 : Number(req.query.days);
  if (!Number.isInteger(days)) throw httpError(400, 'days must be a whole number.');
  const [rows] = await call('list_appointments', [req.session.account.id, from, days]);
  res.json(rows.map(r => ({ ...r, canCancel: bool(r.canCancel), canNoShow: bool(r.canNoShow) })));
}));

router.post('/appointments/:id/no-show', requireLogin, ah(async (req, res) => {
  await call('mark_no_show', [req.session.account.id, id(req.params.id, 'The appointment id')]);
  res.json({ status: 'no_show' });
}));

router.post('/appointments', requireLogin, ah(async (req, res) => {
  const { postingId, uhid, slotStart } = req.body;
  if (!postingId || !uhid || !slotStart) throw httpError(400, 'postingId, uhid and slotStart are all required.');
  const [[booked]] = await call('book_appointment', [req.session.account.id, id(postingId, 'postingId'), String(uhid), String(slotStart)]);
  res.status(201).json({ appointmentId: booked.appointment_id, slotStart: booked.slot_start, slotEnd: booked.slot_end });
}));

router.delete('/appointments/:id', requireLogin, ah(async (req, res) => {
  await call('cancel_appointment', [req.session.account.id, id(req.params.id, 'The appointment id')]);
  res.json({ cancelled: true });
}));

module.exports = router;
