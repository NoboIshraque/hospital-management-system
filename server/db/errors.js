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
  1452: 400    // a foreign key pointed at nothing: the request named something that does not exist
};

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
function errorHandler(err, req, res, next) {   // eslint-disable-line no-unused-vars
  const status = err.status || STATUS[err.errno] || 500;
  if (status === 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  }
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server.' : err.message,
    breakGlassAvailable: err.errno === 5423
  });
}

module.exports = { httpError, ah, errorHandler };
