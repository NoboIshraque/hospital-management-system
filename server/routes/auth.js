/* POST /api/login · POST /api/logout · GET /api/me */

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, call } = require('../db/pool');
const { ah } = require('../db/errors');
const { requireLogin, frontendRole } = require('../auth');

const router = express.Router();

router.post('/login', ah(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const [rows] = await call('get_login', [username]);
  const account = rows[0];

  // bcrypt.compare re-hashes what was typed with the salt stored inside
  // the hash. The plaintext never reaches SQL. One message for "no such
  // user" and "wrong password", so the form cannot reveal usernames.
  const ok = account && await bcrypt.compare(password, account.password_hash);
  if (!ok) return res.status(401).json({ error: 'No account matches those details.' });

  await pool.query('CALL record_login(?)', [account.account_id]);

  // A fresh session id on login, so an id handed out before sign-in
  // cannot be reused afterwards (session fixation).
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.account = {
      id: account.account_id,
      username: account.username,
      role: frontendRole(account.role),
      roleCode: account.role,
      roleLabel: account.role_label,
      name: account.name,
      hospitalId: account.hospital_id,
      patientUhid: account.patient_uhid
    };
    res.json(req.session.account);
  });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('uhid.sid');
    res.json({ signedOut: true });
  });
});

router.get('/me', requireLogin, (req, res) => res.json(req.session.account));

module.exports = router;
