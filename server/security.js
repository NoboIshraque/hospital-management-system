/* ============================================================
   Web-layer protections — the security review's groups 2 and 3.

   The database is the last line of defence and carries the real
   rules (procedures.sql). These are the browser-facing defences in
   front of it, each named by its finding ID in the review:

   securityHeaders   W3  what the browser may load, and that no other
                         site may frame the console (clickjacking)
   sameOriginWrites  W2  refuse a write that another website started
   loginLimiter      S1  slow down password guessing

   Nothing here needs a library. Each is a few lines of Express
   middleware, which is easier to explain in a viva than a package.
   ============================================================ */

/* W3. Content-Security-Policy is a list of where the page may load
   things from. Everything is 'self' except the IBM Plex fonts from
   Google. style-src needs 'unsafe-inline' because the screens use
   style="…" attributes; scripts do NOT — no page has an inline
   <script> or onclick=, so an injected script tag would not run even
   if esc() were ever forgotten. frame-ancestors 'none' stops another
   site showing the console inside a frame and tricking a click on
   "Merge" or "Mark reviewed". */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',          // never guess a file's type
    'X-Frame-Options': 'DENY',                    // frame-ancestors, for older browsers
    'Referrer-Policy': 'same-origin',             // a UHID in the address never leaks to Google Fonts
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  // S3. HSTS tells the browser "only ever HTTPS for this site". Sent only
  // when the site really is on HTTPS (COOKIE_SECURE=1 in .env); sending it
  // on http://localhost would do nothing useful.
  if (process.env.COOKIE_SECURE === '1') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/* W2. A backstop behind the SameSite=Lax cookie. Browsers label every
   request with where it came from: Sec-Fetch-Site (modern browsers)
   and Origin (on every POST/DELETE). A write that another site started
   is refused. Requests with neither header — curl, the test scripts —
   are not from a browser page, so there is no other site to refuse. */
function sameOriginWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'This request came from another website and was refused.' });
  }
  const origin = req.get('Origin');
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch (e) { /* "null" or garbage */ }
    if (host !== req.get('Host')) {
      return res.status(403).json({ error: 'This request came from another website and was refused.' });
    }
  }
  next();
}

/* S1. Failed sign-ins are counted per username and per address, in
   memory. After 5 failures on one username (or 30 from one address)
   within 15 minutes, that username (or address) must wait out the rest
   of the window. A success clears the username's count. Kept in memory
   on purpose: it resets when the server restarts, which is fine for one
   laptop; a site on several servers would keep it in a shared store. */
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { user: 5, ip: 30 };
const failures = new Map();   // key → { count, first }

function entry(key) {
  const e = failures.get(key);
  if (e && Date.now() - e.first > WINDOW_MS) { failures.delete(key); return null; }
  return e || null;
}

const loginLimiter = {
  /* Seconds left before this login may be tried again, or 0. */
  blockedFor(ip, username) {
    for (const [key, limit] of [[`ip:${ip}`, LIMITS.ip], [`user:${username}`, LIMITS.user]]) {
      const e = entry(key);
      if (e && e.count >= limit) return Math.ceil((e.first + WINDOW_MS - Date.now()) / 1000);
    }
    return 0;
  },
  /* Counted BEFORE the password is checked, in the same tick as
     blockedFor() (stress test H1.6). Counting after the check let 40
     parallel guesses all pass blockedFor() before any was counted. A
     correct password then refunds the attempt (succeed). */
  attempt(ip, username) {
    for (const key of [`ip:${ip}`, `user:${username}`]) {
      const e = entry(key);
      if (e) e.count++;
      else failures.set(key, { count: 1, first: Date.now() });
    }
  },
  succeed(ip, username) {
    failures.delete(`user:${username}`);
    const e = entry(`ip:${ip}`);
    if (e && e.count > 0) e.count--;
  }
};

/* Expired entries are swept every five minutes, and the map is capped, so
   a stream of made-up usernames cannot grow it without end (stress test
   H3.4). unref(): the timer never keeps the process alive on its own. */
setInterval(() => { for (const k of failures.keys()) entry(k); }, 5 * 60 * 1000).unref();
const MAX_KEYS = 20000;
const _attempt = loginLimiter.attempt;
loginLimiter.attempt = (ip, username) => {
  if (failures.size > MAX_KEYS) failures.clear();
  _attempt(ip, username);
};

module.exports = { securityHeaders, sameOriginWrites, loginLimiter };
