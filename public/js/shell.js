/* ============================================================
   UHID — app shell
   Runs on every signed-in page, before that page's own script.

   In the single-file prototype this work was done by signIn() and
   go(): one document stayed loaded and #view.innerHTML was swapped.
   Now each screen is its own document, so the shell is rebuilt on
   every page load — from the session and the query string.

   The point of doing it this way: every render function on every
   screen still reads S and still calls go() and openPatient()
   exactly as before. Only these few functions changed.
   ============================================================ */

/* The one state object. No classes, no state library.
   account is who is signed in: { name, role, roleLabel, hospitalId, patientUhid }
   — from GET /api/me when online, from ROLES when offline. */
const S = { role: null, account: null, page: null, patient: null, doctor: null, slot: null, tab: 'timeline' };

/* Was PAGES[page].crumb — the render half now lives in each page file. */
const CRUMBS = {
  register: 'Registration',
  search:   'Patient search',
  record:   'Patient record',
  book:     'Appointments',
  wards:    'Wards &amp; beds',
  encounter: 'Record encounter',
  referrals: 'Referral inbox',
  lab:      'Lab worklist',
  audit:    'Break-glass review',
  merge:    'Merge records'
};

/* ------------------------------------------------------------
   NAVIGATION
   ------------------------------------------------------------ */

/* The selected patient rides in the query string. That is the whole
   reason a record is now a link you can send to a colleague — and
   the reason S.patient survives moving between screens without the
   application having to remember anything. */
function patientQuery() {
  return S.patient ? '?uhid=' + encodeURIComponent(S.patient.uhid) : '';
}

function go(page) {
  carryToasts();
  location.href = page + '.html' + patientQuery();
}

function openPatient(uhid) {
  const p = store.find(uhid);
  if (!p) { toast('Not found', 'No patient holds ' + uhid + '.', 'err'); return; }
  S.patient = p;
  rememberCurrent(p);
  go('record');
}

/* Online there is no patient list to look a UHID up in when the next page
   loads, so the selected patient's UHID and name — nothing else — are kept
   in sessionStorage for this tab, to label the screens. It is gone when the
   tab closes. privacy.html says so. */
const CURRENT_KEY = 'uhid.current.v1';
function rememberCurrent(p) {
  if (!API.online) return;
  try { sessionStorage.setItem(CURRENT_KEY, JSON.stringify({ uhid: p.uhid, name: p.name })); }
  catch (e) { /* storage unavailable: screens show the UHID instead of the name */ }
}
function recallCurrent(uhid) {
  try {
    const c = JSON.parse(sessionStorage.getItem(CURRENT_KEY) || 'null');
    if (c && c.uhid === uhid && typeof c.name === 'string') return c;
  } catch (e) { /* storage unavailable or damaged */ }
  return null;
}

async function signOut() {
  if (API.online) {
    try { await API.post('/logout'); } catch (e) { /* signed out either way */ }
  }
  session.clear();
  carryToasts();
  location.href = LOGIN_HREF;
}

/* Each page file ends with boot(renderX). Start-up is asynchronous —
   it may have to ask the server who is signed in — so boot waits for
   it. The guard may have sent a signed-out browser to the login page;
   if it did, S.role is null and we must not render a clinical screen
   into a document that is on its way out. */
function boot(render) {
  SHELL_READY.then(() => { if (S.role) render($('#view')); });
}

/* While anything is being fetched, the screen says so. */
const loadingHtml = what => `<div class="card empty-state" aria-busy="true"><b>Loading&hellip;</b>${esc(what)}</div>`;
const errorHtml = (title, msg) => `<div class="card empty-state"><b>${esc(title)}</b>${esc(msg)}</div>`;

/* The screens added after the prototype write straight to MySQL and have
   no sample-data stand-in. Opened from disk, they say so plainly rather
   than pretend: what the screen does, and how to see it work. */
const needsServerHtml = what => `
  <div class="card empty-state">
    <b>This screen runs on the database</b>
    ${esc(what)} It has no sample-data version. Start the server (<span class="mono">npm start</span> in
    <span class="mono">server/</span>) and open <span class="mono">http://localhost:3000</span> to use it.
  </div>`;

/* ------------------------------------------------------------
   PAGE START-UP
   ------------------------------------------------------------ */

const SHELL_READY = (async function start() {
  S.page = document.body.dataset.page;
  const online = await API.ready;

  /* Access is granted, not assumed — a signed-out browser never
     reaches a clinical screen. Online, the SERVER decides: GET
     /api/me answers 401 without a valid session cookie. Offline
     there is no server, and this check in JavaScript is only a
     stand-in — not a security control, and you should say so. */
  if (online) {
    try {
      S.account = await API.get('/me');
    } catch (e) {
      if (e.status === 401) { session.clear(); location.replace(LOGIN_HREF); return; }
      document.body.innerHTML = errorHtml('The console could not start', e.message);
      return;
    }
    session.set(S.account.role);
  } else {
    const sess = session.get();
    if (!sess || !ROLES[sess.role]) { location.replace(LOGIN_HREF); return; }
    const r0 = ROLES[sess.role];
    S.account = { role: sess.role, name: r0.who, roleLabel: r0.label, hospitalId: r0.hospital,
                  patientUhid: sess.role === 'patient' ? 'BD-2019-04821-5' : null };
  }

  const r = ROLES[S.account.role];
  if (!r) {
    document.body.innerHTML = errorHtml('No console for this role', `${S.account.roleLabel || S.account.role} accounts have no screens in this prototype yet.`);
    return;
  }
  S.role = S.account.role;

  /* No national list is loaded (security review L1): staff find patients
     by searching. A patient's list is one person: themselves. */
  if (online && S.role === 'patient') {
    API.patients = [{ uhid: S.account.patientUhid, name: S.account.name }];
  }

  /* Which patient is open? The query string — or, for the patient
     role, their own record. Staff start with nobody selected and must
     search first, which is the correct behaviour, not an
     inconvenience. Online, a UHID that is not in the search list (an
     old card merged into another record) is still passed on: the
     server resolves it. */
  const uhid = new URLSearchParams(location.search).get('uhid');
  const wanted = uhid || (S.role === 'patient' ? S.account.patientUhid : null);
  S.patient = wanted
    ? (store.find(wanted) || (online ? (recallCurrent(wanted) || { uhid: wanted, name: wanted }) : null))
    : null;

  const hospitalName = S.account.hospitalId ? hospital(S.account.hospitalId).name : 'National access';
  $('#me-name').textContent = S.account.name;
  $('#me-role').textContent = r.label;
  $('#me-av').textContent   = initials(S.account.name);
  $('#hosp').textContent    = hospitalName;
  $('#crumb').innerHTML     = `${esc(r.label)} &nbsp;/&nbsp; <b>${CRUMBS[S.page]}</b>`;

  /* Real links now, not buttons. Separate documents mean the back
     button, middle-click and open-in-new-tab all work — so the nav
     should be marked up as what it actually is. */
  $('#nav').innerHTML = r.nav.map(([id, label]) =>
    `<a href="${id}.html${patientQuery()}" data-page="${id}"${id === S.page ? ' class="on"' : ''}>` +
    `<span class="ic">${icon(id)}</span>${label}</a>`).join('');

  $('#signout').addEventListener('click', signOut);
  $('#reset-demo-2').addEventListener('click', resetDemo);

  $('#app').hidden = false;
  showFlashes();
})();

/* Global search jumps to the first match. Online it is a real search,
   with the same rules as the search screen. */
$('#gsearch').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  if (API.online) {
    if (!specificQuery(q)) { toast('Be more specific', 'Search by UHID, NID, an 11-digit mobile number, or at least 3 letters of the name.', 'err'); return; }
    let rows;
    try { rows = await API.searchPatients(q); }
    catch (err) { toast('Search failed', err.message, 'err'); return; }
    e.target.value = '';
    if (rows.length) openPatient(rows[0].uhid);
    else toast('No match', 'Nobody on file matches that.', 'err');
    return;
  }
  const digits = q.replace(/\D/g, '');
  const hit = store.all().find(p =>
    p.name.toLowerCase().includes(q) || p.uhid.toLowerCase().includes(q) ||
    (digits.length > 2 && (p.phone || '').replace(/\D/g, '').includes(digits)) ||
    (digits.length > 2 && p.nid && p.nid.includes(digits)));
  e.target.value = '';
  if (hit) openPatient(hit.uhid);
  else toast('No match', 'Nobody on file matches that.', 'err');
});
