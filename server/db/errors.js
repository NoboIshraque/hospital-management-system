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
  1213: 409,   // deadlock: two requests on the same rows; the loser is rolled back
  1205: 409,   // waited too long for a lock
  1406: 400, 1265: 400, 1292: 400, 1366: 400, 1264: 400, 1048: 400, 1318: 400, // a value too long, of the wrong type, out of range, missing
  1452: 400,   // a foreign key pointed at nothing: the request named something that does not exist
  1451: 409    // a row other rows still point at
};

/* I3. Routes check type and size before calling a procedure: a whole
   number for every id, and a cap on list lengths, so one request
   cannot hold locks while it runs hundreds of procedure calls. */
function id(value, name) {
  // A JSON number, or a string of digits: not true, "0x10" or "1e2" (stress test H3.4).
  const ok = (typeof value === 'number' && Number.isInteger(value))
          || (typeof value === 'string' && /^[0-9]{1,10}$/.test(value));
  const n = Number(value);
  if (!ok || n < 1 || n > 4294967295) throw httpError(400, `${name} must be a whole number.`);
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
  3819: 'One of the values is outside what the database accepts.',
  1213: 'Someone else was changing the same record at that moment. Try again.',
  1205: 'Someone else was changing the same record at that moment. Try again.',
  // Stress test H2.5: a user's mistake is a 400 with a plain sentence, not a 500.
  1406: 'One of the values is too long.',
  1265: 'One of the values is not in an accepted form.',
  1292: 'One of the dates or values is not valid.',
  1366: 'One of the values is not in an accepted form.',
  1264: 'One of the numbers is out of range.',
  1048: 'A required value is missing.',
  1318: 'The request did not match what the server expects.'
};

/* Messages from Express's own JSON reader describe the parser's internals
   (stress test H3.4); the browser gets a fixed sentence instead. */
const BODY = {
  'entity.parse.failed': 'The request body is not valid JSON.',
  'entity.too.large': 'The request is too large.'
};

function errorHandler(err, req, res, next) {   // eslint-disable-line no-unused-vars
  const status = err.status || STATUS[err.errno] || 500;
  if (status === 500 || PLAIN[err.errno]) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  }
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server.'
         : (PLAIN[err.errno] || BODY[err.type] || (err.type ? 'The request could not be read.' : err.message)),
    breakGlassAvailable: err.errno === 5423
  });
}

module.exports = { httpError, ah, errorHandler, id, list };
