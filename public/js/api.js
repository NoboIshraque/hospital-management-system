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
  patients: [],        // the national search list, loaded by the shell when online

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
    if (!res.ok) throw apiError(res.status, (data && data.error) || `Request failed (${res.status}).`, data);
    return data;
  },
  get(url)        { return API.request('GET', url); },
  post(url, body) { return API.request('POST', url, body || {}); },
  del(url)        { return API.request('DELETE', url); }
};

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
    // Served over http but no API behind it (a static preview server):
    // fall back to the sample data rather than showing a broken page.
    API.online = false;
  }
  return API.online;
})();
