/* ============================================================
   Turning database refusals into HTTP responses.

   procedures.sql refuses with SIGNAL and sets MYSQL_ERRNO to say
   what kind of refusal it is. This file is the one place that
   knows how each number becomes an HTTP status, so every route
   reports errors the same way.
   ============================================================ */

const STATUS = {
  1644: 409,   // SIGNAL with no errno set: a business rule said no
  5403: 403,   // procedures.sql: your role may not do this
  5404: 404,   // procedures.sql: no such patient / appointment / encounter
  5423: 423,   // get_patient_record: no access basis — break-glass is possible
  3819: 409,   // a CHECK constraint refused the value
  1062: 409,   // duplicate key
  1452: 400,   // a foreign key pointed at nothing: the request named something that does not exist
  1451: 409    // a row other rows still point at
};

/* I3. Routes check type and size before calling a procedure: a whole
   number for every id, and a cap on list lengths, so one request
   cannot hold locks while it runs hundreds of procedure calls. */
function id(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4294967295) throw httpError(400, `${name} must be a whole number.`);
  return n;
}
function list(value, name, max) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw httpError(400, `${name} must be a list.`);
  if (value.length > max) throw httpError(400, `At most ${max} ${name} in one request.`);
  return value;
}

/* An error a route raises on purpose: throw httpError(400, '…'). */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/* Express 4 does not catch a rejected promise from an async route, so
   every async route is wrapped in this: any error goes to errorHandler. */
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* The last middleware in app.js. MySQL refusals show their message
   (it was written for the user — see the header of triggers.sql);
   anything unexpected is logged here and hidden from the browser,
   because internal error text tells an attacker how the system works. */
/* W4. These four come from MySQL itself, not from a SIGNAL we wrote, and
   their text names tables and constraints (e.g. "uq_patient_nid"),
   which tells an outsider how the schema is built. The browser gets a
   plain sentence; the server log keeps the original. */
const PLAIN = {
  1062: 'That would create a duplicate of something that must be unique.',
  1451: 'That is still in use by other records, so it cannot be removed.',
  1452: 'The request refers to something that does not exist.',
  3819: 'One of the values is outside what the database accepts.'
};

function errorHandler(err, req, res, next) {   // eslint-disable-line no-unused-vars
  const status = err.status || STATUS[err.errno] || 500;
  if (status === 500 || PLAIN[err.errno]) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  }
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server.' : (PLAIN[err.errno] || err.message),
    breakGlassAvailable: err.errno === 5423
  });
}

module.exports = { httpError, ah, errorHandler, id, list };
