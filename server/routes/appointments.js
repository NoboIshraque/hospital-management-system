/* ============================================================
   Appointments — decision 4.

   POST   /api/appointments        { postingId, uhid, slotStart }
   DELETE /api/appointments/:id    cancel

   book_appointment() locks the doctor, checks the slot is real and
   free, and inserts — all in one transaction. If two requests race
   for one slot, the second is refused with "That slot has just been
   taken" and the route turns that into a 409. scripts/race-booking.js
   demonstrates exactly that through this endpoint.
   ============================================================ */

const express = require('express');
const { call } = require('../db/pool');
const { ah, httpError } = require('../db/errors');
const { requireLogin } = require('../auth');

const router = express.Router();

router.post('/appointments', requireLogin, ah(async (req, res) => {
  const { postingId, uhid, slotStart } = req.body;
  if (!postingId || !uhid || !slotStart) throw httpError(400, 'postingId, uhid and slotStart are all required.');
  const [[booked]] = await call('book_appointment', [req.session.account.id, postingId, uhid, slotStart]);
  res.status(201).json({ appointmentId: booked.appointment_id, slotStart: booked.slot_start, slotEnd: booked.slot_end });
}));

router.delete('/appointments/:id', requireLogin, ah(async (req, res) => {
  await call('cancel_appointment', [req.session.account.id, Number(req.params.id)]);
  res.json({ cancelled: true });
}));

module.exports = router;
