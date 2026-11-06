/* POST /api/login · POST /api/logout · GET /api/me */

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, call } = require('../db/pool');
const { ah } = require('../db/errors');
const { requireLogin, frontendRole, clientIp } = require('../auth');
const { loginLimiter } = require('../security');

const router = express.Router();

/* S6. A hash of nothing in particular, at the same cost as the real
   ones. When the username does not exist, the password is still
   compared — against this — so a wrong username takes as long as a
   wrong password and the timing does not reveal which accounts exist. */
const DUMMY_HASH = bcrypt.hashSync('no-such-account', 10);

router.post('/login', ah(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().slice(0, 40);
  const password = String(req.body.password || '').slice(0, 200);

  const ip = clientIp(req) || 'unknown';

  // S1. Too many failures for this username or this address: wait.
  const wait = loginLimiter.blockedFor(ip, username);
  if (wait) {
    res.set('Retry-After', String(wait));
    return res.status(429).json({ error: `Too many failed sign-ins. Try again in ${Math.ceil(wait / 60)} minute(s).` });
  }
  // Count this attempt now, before anything is awaited (stress test H1.6).
  loginLimiter.attempt(ip, username);

  // Usernames are plain ASCII (stress test H1.6). MySQL compares text
  // ignoring accents and width, so 'ｓｙｓａｄｍｉｎ' or 'sýsadmin' found the
  // account 'sysadmin' — each spelling with a fresh limit of its own.
  if (!/^[a-z0-9._-]{1,40}$/.test(username)) {
    return res.status(401).json({ error: 'No account matches those details.' });
  }

  const [rows] = await call('get_login', [username]);
  const account = rows[0];

  // bcrypt.compare re-hashes what was typed with the salt stored inside
  // the hash. The plaintext never reaches SQL. One message for "no such
  // user" and "wrong password", so the form cannot reveal usernames.
  const ok = await bcrypt.compare(password, account ? account.password_hash : DUMMY_HASH) && Boolean(account);
  if (!ok) return res.status(401).json({ error: 'No account matches those details.' });
  loginLimiter.succeed(ip, username);

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
      patientUhid: account.patient_uhid,
      mustChange: account.must_change === 1 || account.must_change === true,
      loginAt: Date.now()               // for the 8-hour limit in requireLogin
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

/* What the sign-in page needs to know about this installation. In demo
   mode (DEMO_MODE=1 in server/.env, as for the course) it lists the demo
   accounts; a real installation leaves DEMO_MODE out and lists nothing. */
router.get('/config', (req, res) => res.json({ demo: process.env.DEMO_MODE === '1' }));

module.exports = router;
