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

/* The one state object. No classes, no state library. */
const S = { role: null, page: null, patient: null, doctor: null, slot: null, tab: 'timeline' };

/* Was PAGES[page].crumb — the render half now lives in each page file. */
const CRUMBS = {
  register: 'Registration',
  search:   'Patient search',
  record:   'Patient record',
  book:     'Appointments',
  wards:    'Wards &amp; beds'
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
  go('record');
}

function signOut() {
  session.clear();
  carryToasts();
  location.href = LOGIN_HREF;
}

/* Each page file ends with boot(renderX). The guard below may have
   already sent a signed-out browser to the login page; if it did,
   S.role is null and we must not render a clinical screen into a
   document that is on its way out. */
function boot(render) {
  if (S.role) render($('#view'));
}

/* ------------------------------------------------------------
   PAGE START-UP
   ------------------------------------------------------------ */

(function start() {
  S.page = document.body.dataset.page;

  /* Access is granted, not assumed — a signed-out browser never
     reaches a clinical screen. In week 4 the server enforces this
     as well; a client-side check alone is not a security control,
     and you should say so if anyone asks. */
  const sess = session.get();
  if (!sess || !ROLES[sess.role]) { location.replace(LOGIN_HREF); return; }
  S.role = sess.role;

  const r = ROLES[S.role];

  /* Which patient is open? The query string — or, for the patient
     role, their own record, which is what signIn() used to do.
     Staff start with nobody selected and must search first, which
     is the correct behaviour, not an inconvenience. */
  const uhid = new URLSearchParams(location.search).get('uhid');
  S.patient = uhid ? store.find(uhid)
                   : (S.role === 'patient' ? store.find('BD-2019-04821-5') : null);

  $('#me-name').textContent = r.who;
  $('#me-role').textContent = r.label;
  $('#me-av').textContent   = initials(r.who);
  $('#hosp').textContent    = r.hospital ? hospital(r.hospital).name : 'National access';
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

/* Global search jumps to the first match. */
$('#gsearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  const digits = q.replace(/\D/g, '');
  const hit = store.all().find(p =>
    p.name.toLowerCase().includes(q) || p.uhid.toLowerCase().includes(q) ||
    (digits.length > 2 && p.phone.replace(/\D/g, '').includes(digits)) ||
    (digits.length > 2 && p.nid && p.nid.includes(digits)));
  e.target.value = '';
  if (hit) openPatient(hit.uhid);
  else toast('No match', 'Nobody on file matches that.', 'err');
});
