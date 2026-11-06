/* ============================================================
   UHID — talking to the server

   Two ways to open this site, and both work:

   - Served by Express (npm start → http://localhost:3000): every
     page reads and writes through the JSON API, and MySQL is the
     source of truth. The constants in js/data.js are replaced, in
     place, by what the API returns, so the code that renders them
     does not change.
   - Opened straight from disk (file://): there is no server, so the
     pages keep using js/data.js, js/seed.js and localStorage exactly
     as the prototype did. Useful when MySQL is not running.

   API.ready is a promise that settles once the page knows which of
   the two it is in: true = online, false = offline sample data.
   ============================================================ */

const API_ROOT = '/api';

const API = {
  online: false,
  down: null,          // set when the server answers but the API fails at start-up (H2.14)
  patients: [],        // the patients this page has found by searching (never the whole country)

  async request(method, url, body) {
    let res;
    try {
      res = await fetch(API_ROOT + url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
      });
    } catch (e) {
      throw apiError(0, 'The server is not answering. Check that npm start is still running.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* an empty or non-JSON body */ }
    // The session ended (30 minutes idle, 8 hours, or a server restart):
    // back to sign-in, instead of an error box on every screen (H2.14).
    // Not for the sign-in calls themselves, which answer 401 on purpose.
    if (res.status === 401 && API.online && url !== '/login' && url !== '/me') {
      try { session.clear(); } catch (e) { /* store.js not loaded on this page */ }
      location.replace(LOGIN_HREF);
    }
    if (!res.ok) throw apiError(res.status, (data && data.error) || `Request failed (${res.status}).`, data);
    return data;
  },
  get(url)        { return API.request('GET', url); },
  post(url, body) { return API.request('POST', url, body || {}); },
  del(url)        { return API.request('DELETE', url); },

  /* Finding a patient. search_patients() in MySQL refuses a vague query,
     returns at most 20 people with NID and phone masked, and logs each one
     it returns (security review L1). What comes back is kept in
     API.patients so store.find() can answer for this page. */
  async searchPatients(q) {
    const rows = await API.post('/patients/search', { q });
    API.remember(rows);
    return rows;
  },
  remember(rows) {
    for (const p of rows) {
      const i = API.patients.findIndex(x => x.uhid === p.uhid);
      if (i >= 0) API.patients[i] = p; else API.patients.push(p);
    }
  },

  /* Opening a record: a POST, never a GET (security review W1). A link on
     another website can make the browser GET a page with the session
     cookie attached; it cannot make it POST one with it (SameSite=Lax). */
  readRecord(uhid, breakGlassReason) {
    return API.post('/patients/' + encodeURIComponent(uhid) + '/read',
      breakGlassReason ? { breakGlass: true, reason: breakGlassReason } : {});
  }
};

/* Is this query specific enough for search_patients()? The same rule the
   database applies, checked here only to avoid sending a request that is
   bound to be refused: a UHID, an NID (10, 13 or 17 digits), an 11-digit
   mobile number, or at least 3 letters of a name. */
function specificQuery(q) {
  q = q.trim();
  const digits = q.replace(/\D/g, '');
  const letters = q.replace(/[^\p{L}]/gu, '');
  if (/^BD-\d{4}-\d{5}-\d$/i.test(q)) return true;
  if (!letters && [10, 11, 13, 17].includes(digits.length)) return true;
  return letters.length >= 3;
}

/* An Error that also carries the HTTP status, so a screen can tell
   "not allowed" (403) from "break-glass is possible" (423). */
function apiError(status, message, data) {
  const e = new Error(message);
  e.status = status;
  e.breakGlassAvailable = Boolean(data && data.breakGlassAvailable);
  return e;
}

/* Replace an array's contents without replacing the array: every file
   that already holds a reference to HOSPITALS sees the new rows. */
const replaceContents = (target, items) => target.splice(0, target.length, ...items);

API.ready = (async () => {
  if (!/^https?:$/.test(location.protocol)) return false;
  try {
    const [hospitals, doctors, departments] = await Promise.all([
      API.get('/hospitals'), API.get('/doctors'), API.get('/departments')
    ]);
    replaceContents(HOSPITALS, hospitals);
    replaceContents(DOCTORS, doctors);
    replaceContents(DEPARTMENTS, departments);
    API.online = true;
  } catch (e) {
    if (e.status >= 500) {
      // The server is there but its API is failing (MySQL stopped, most
      // likely). Do NOT fall back to the sample data: that would show
      // invented patients and accept the offline demo passwords with no
      // warning (stress test H2.14). Pages show API.down instead.
      API.online = true;
      API.down = e.message;
    } else {
      // Served over http but no API behind it (a static preview server):
      // fall back to the sample data rather than showing a broken page.
      API.online = false;
    }
  }
  return API.online;
})();
