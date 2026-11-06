/* ============================================================
   Accounts and passwords (checklist I1).

   POST /api/me/password            { current, next }   change your own
   GET  /api/accounts               the staff accounts an admin manages
   POST /api/accounts               { username, role, hospitalId, doctorId, staffName }
                                    → { accountId, username, oneTimePassword }
   POST /api/accounts/:id/reset     → { oneTimePassword }
   POST /api/accounts/:id/active    { active: true|false }
   POST /api/patients/:uhid/login   { username } → { username, oneTimePassword }
                                    reception issues (or re-issues) a patient's portal login

   A one-time password is made here, shown ONCE in the answer, and only
   its hash is stored. Its owner must replace it at the next sign-in.
   Who may manage whom is decided in the database (require_account_scope).
   ============================================================ */

const express = require('express');
const bcrypt = require('bcryptjs');
const { call } = require('../db/pool');
const { ah, httpError, id } = require('../db/errors');
const { requireLogin, clientIp } = require('../auth');
const { passwordProblem, oneTimePassword, hash } = require('../lib/passwords');

const router = express.Router();
const bool = v => v === 1 || v === true || v === '1';

router.post('/me/password', requireLogin, ah(async (req, res) => {
  const me = req.session.account;
  const { current, next } = req.body;
  if (typeof current !== 'string' || typeof next !== 'string') throw httpError(400, 'Give your current password and a new one.');

  // Check the current password the same way sign-in does.
  const [[row]] = await call('get_login', [me.username]);
  if (!row || !(await bcrypt.compare(current, row.password_hash))) {
    throw httpError(400, 'Your current password is not right.');
  }
  if (current === next) throw httpError(400, 'Choose a password different from the current one.');
  const problem = passwordProblem(next, me.username);
  if (problem) throw httpError(400, problem);

  await call('change_password', [me.id, await hash(next)]);
  me.mustChange = false;
  res.json({ changed: true });
}));

router.get('/accounts', requireLogin, ah(async (req, res) => {
  const [rows] = await call('list_accounts', [req.session.account.id]);
  res.json(rows.map(r => ({ ...r, active: bool(r.active), mustChange: bool(r.mustChange), isYou: bool(r.isYou) })));
}));

router.post('/accounts', requireLogin, ah(async (req, res) => {
  const b = req.body;
  const username = String(b.username || '').trim().toLowerCase();
  const password = oneTimePassword();
  const [[made]] = await call('create_staff_account', [req.session.account.id, username, await hash(password),
    String(b.role || ''), b.hospitalId == null || b.hospitalId === '' ? null : id(b.hospitalId, 'hospitalId'),
    b.doctorId == null || b.doctorId === '' ? null : id(b.doctorId, 'doctorId'),
    b.staffName ? String(b.staffName) : null]);
  res.status(201).json({ accountId: made.account_id, username, oneTimePassword: password });
}));

router.post('/accounts/:id/reset', requireLogin, ah(async (req, res) => {
  const password = oneTimePassword();
  await call('reset_password', [req.session.account.id, id(req.params.id, 'The account id'), await hash(password)]);
  res.json({ oneTimePassword: password });
}));

router.post('/accounts/:id/active', requireLogin, ah(async (req, res) => {
  await call('set_account_active', [req.session.account.id, id(req.params.id, 'The account id'), req.body.active === true]);
  res.json({ active: req.body.active === true });
}));

router.post('/patients/:uhid/login', requireLogin, ah(async (req, res) => {
  const password = oneTimePassword();
  const [[r]] = await call('issue_patient_login', [req.session.account.id, req.params.uhid,
    String(req.body.username || '').trim().toLowerCase(), await hash(password), clientIp(req)]);
  res.status(201).json({ username: r.username, oneTimePassword: password });
}));

module.exports = router;
