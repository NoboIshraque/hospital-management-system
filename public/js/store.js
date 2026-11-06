/* ============================================================
   UHID — persistence
   localStorage standing in for MySQL. Every read and write is
   wrapped in try/catch because private browsing mode makes
   localStorage throw rather than return null.
   ============================================================ */

/* patients and wards are v2 because v1 cached the seed UHIDs with
   wrong check digits (BD-2019-04821-7 should end in 5). A browser
   holding v1 would keep showing them and could no longer find the
   patient login's own record; bumping the key makes it start again
   from the corrected seed. */
const PATIENT_KEY = 'uhid.patients.v2';
const SESSION_KEY = 'uhid.session.v1';
const WARD_KEY    = 'uhid.wards.v2';
const FLASH_KEY   = 'uhid.flash.v1';

/* Online (served by Express) there is no national list in the browser:
   store.all() is only the patients this page has found by searching
   (API.searchPatients fills API.patients), and localStorage is not used
   for patients at all. Offline, it is the seed plus anything registered
   in this browser, as before. */
const store = {
  all() {
    if (API.online) return API.patients;
    try {
      const raw = localStorage.getItem(PATIENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) { /* storage unavailable — fall through to seed */ }
    return SEED_PATIENTS.slice();
  },
  write(list) {
    try { localStorage.setItem(PATIENT_KEY, JSON.stringify(list)); }
    catch (e) { toast('Not saved', 'This browser is blocking local storage, so new patients will not survive a refresh.', 'err'); }
  },
  add(patient) {
    if (API.online) { API.patients.unshift(patient); return patient; }
    const list = store.all();
    list.unshift(patient);
    store.write(list);
    return patient;
  },
  find(uhid) {
    return store.all().find(p => p.uhid === uhid) || null;
  },
  reset() {
    try {
      localStorage.removeItem(PATIENT_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(WARD_KEY);
    } catch (e) {}
  }
};

/* Offline, this IS the session. Online, the server's session cookie is
   the real one and this is only a hint for the landing page's "Open
   console" button; the console asks GET /api/me on every page load. */
const session = {
  get() {
    try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  },
  set(role) { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ role })); } catch (e) {} },
  clear()   { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
};

/* ------------------------------------------------------------
   Ward beds.
   The single-file prototype held bed state in memory, so an
   admission survived until you reloaded. Now that each screen is
   its own document, "go to search and come back" IS a reload — so
   the board has to be stored or every admission would vanish.
   Same shape and the same try/catch discipline as `store` above.
   ------------------------------------------------------------ */

const wardStore = {
  all(seed) {
    try {
      const raw = localStorage.getItem(WARD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) { /* storage unavailable — fall through to seed */ }
    return seed;
  },
  write(list) {
    try { localStorage.setItem(WARD_KEY, JSON.stringify(list)); }
    catch (e) { toast('Not saved', 'This browser is blocking local storage, so bed changes will not survive.', 'err'); }
  }
};

/* ------------------------------------------------------------
   Flash messages.
   A toast raised immediately before a navigation would be thrown
   away with the page. go() hands any toast still on screen to this
   queue and the next page replays it, so "Appointment booked" still
   lands — exactly as it did when this was all one document.
   sessionStorage, not localStorage: a flash is for the next page
   load only, never for the next visit.
   ------------------------------------------------------------ */

const flash = {
  queue(list) {
    if (!list.length) return;
    try { sessionStorage.setItem(FLASH_KEY, JSON.stringify(list)); } catch (e) {}
  },
  drain() {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      sessionStorage.removeItem(FLASH_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
};
