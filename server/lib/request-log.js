/* ============================================================
   The request log (checklist I9): one line per request —

   2026-11-07T09:41:12.004Z  POST /api/patients/BD-####-#####-#/read  200  38 ms  account 6
   (shown here with # for the masking stars, which cannot sit before a slash in a comment)

   to the console (API requests) and to logs/requests-YYYY-MM-DD.log
   (git-ignored). What it is for: "the site was slow at ten", "who was
   getting 403s". What it is not: the access log. Who read which patient is
   recorded in MySQL's access_log by the procedures; this file must not
   become a second, unprotected copy of that. So UHIDs in addresses are
   masked, and no request body, query string or cookie is ever written.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(DIR, { recursive: true });

const maskUhid = p => p.replace(/BD-\d{4}-\d{5}-\d/g, 'BD-****-*****-*');

function requestLog(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (process.env.REQUEST_LOG === 'off') return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const who = req.session && req.session.account ? `account ${req.session.account.id}` : '-';
    // originalUrl: routers strip their mount path ('/api') from req.path.
    // The query string is cut off: it is never written.
    const where = maskUhid(req.originalUrl.split('?')[0]);
    const line = `${new Date().toISOString()}  ${req.method} ${where}  ${res.statusCode}  ${ms.toFixed(0)} ms  ${who}`;
    if (where.startsWith('/api') && process.env.REQUEST_LOG !== 'file') console.log(line);
    fs.appendFile(path.join(DIR, `requests-${line.slice(0, 10)}.log`), line + '\n', () => {});
  });
  next();
}

module.exports = { requestLog };
