/* ============================================================
   Sessions kept in MySQL (checklist I6).

   express-session asks a "store" to get, set, touch and destroy sessions.
   Its default store is the server's memory, which a restart empties —
   every user signed out. This store keeps them in the web_session table
   instead, through the session_* procedures (uhid_app has no table rights).

   The browser's cookie holds a random session id. The table holds only a
   SHA-256 of it, so the table alone cannot be used to sign in as anyone.
   ============================================================ */

const crypto = require('crypto');
const session = require('express-session');
const { call } = require('./pool');

const hash = sid => crypto.createHash('sha256').update(String(sid)).digest('hex');

// '2026-11-07 14:03:00' in the server's local time, which is MySQL's NOW().
const mysqlTime = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const expiry = sess => mysqlTime(sess && sess.cookie && sess.cookie.expires
  ? new Date(sess.cookie.expires)
  : new Date(Date.now() + 30 * 60 * 1000));

class MySQLSessionStore extends session.Store {
  constructor() {
    super();
    // Expired rows are removed every 15 minutes. unref(): this timer alone
    // does not keep the process running.
    this.timer = setInterval(() => call('session_purge').catch(() => {}), 15 * 60 * 1000);
    this.timer.unref();
  }

  get(sid, cb) {
    call('session_get', [hash(sid)])
      .then(([rows]) => {
        if (!rows || !rows.length) return cb(null, null);
        const d = rows[0].data;
        cb(null, typeof d === 'string' ? JSON.parse(d) : d);
      })
      .catch(cb);
  }

  set(sid, sess, cb) {
    const accountId = sess.account ? sess.account.id : null;
    call('session_set', [hash(sid), accountId, JSON.stringify(sess), expiry(sess)])
      .then(() => cb && cb(null))
      .catch(e => cb && cb(e));
  }

  touch(sid, sess, cb) {
    call('session_touch', [hash(sid), expiry(sess)])
      .then(() => cb && cb(null))
      .catch(e => cb && cb(e));
  }

  destroy(sid, cb) {
    call('session_destroy', [hash(sid)])
      .then(() => cb && cb(null))
      .catch(e => cb && cb(e));
  }
}

module.exports = { MySQLSessionStore };
