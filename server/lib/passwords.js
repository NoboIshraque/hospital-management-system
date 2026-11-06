/* ============================================================
   Passwords — the rules for choosing one, and one-time passwords.

   bcrypt runs here in Node because it is not a MySQL function; the
   database only ever receives the 60-character hash.
   ============================================================ */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COST = 10;   // bcrypt work factor: about 70 ms a hash on the laptop

/* Words nobody may use as a password: the old shared demo password,
   and the first things anyone would guess. */
const BANNED = new Set(['demo1234', 'password', 'password1', '1234567890', '12345678910',
  'qwertyuiop', 'bangladesh', 'dhaka12345', 'hospital123', 'uhid123456']);

/* Why a proposed password is refused, or null if it is acceptable.
   Length is what makes a password hard to guess, so the rule is
   length (10+), not a mix of symbols that people write on a note. */
function passwordProblem(password, username) {
  if (typeof password !== 'string' || password.length < 10) return 'A password needs at least 10 characters.';
  if (password.length > 200) return 'A password can be at most 200 characters.';
  const lower = password.toLowerCase();
  if (BANNED.has(lower)) return 'That password is too common. Choose another.';
  if (username && lower.includes(String(username).toLowerCase())) return 'A password must not contain your username.';
  if (/^(.)\1+$/.test(password)) return 'A password must not be one character repeated.';
  return null;
}

/* A one-time password an administrator or the desk hands over: 12
   characters from an alphabet without look-alikes (no 0/O, 1/l/I), so
   it can be read aloud or written down without mistakes. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function oneTimePassword() {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

const hash = password => bcrypt.hash(password, COST);

module.exports = { passwordProblem, oneTimePassword, hash };
