/* ============================================================
   UHID — index.html — the public landing page

   The one screen that needs no account. It shows what is common to
   everybody — hospitals, doctors, services, how the record works —
   and hands anyone who needs a clinical screen to login.html.

   Everything on it is rendered from the arrays below or from
   data.js. Nothing is hardcoded in the markup, so adding a service
   or a hospital is one edit, not three.
   ============================================================ */

/* ------------------------------------------------------------
   SITE CONTENT
   Page chrome, not reference data — so it lives here rather than
   in data.js, which becomes MySQL lookup tables in week 4.
   ------------------------------------------------------------ */

/* Nav bar links. Each one is a section on this page. */
const NAV_LINKS = [
  ['#hospitals',    'Hospitals'],
  ['#doctors',      'Doctors'],
  ['#appointments', 'Appointments'],
  ['#how',          'How it works']
];

/* The dropdown and the services grid render from this single list.
   `note` is the one-liner in the menu, `body` the card on the page. */
const SERVICES = [
  { id: 'emergency', icon: 'emergency', urgent: true,
    label: 'Emergency & casualty',
    note:  'Round-the-clock casualty at every connected hospital',
    body:  'A casualty doctor can open a record immediately under break-glass access, without waiting for consent. The read is still written to the access log and flagged for review.' },

  { id: 'ambulance', icon: 'ambulance', urgent: true,
    label: 'Ambulance dispatch',
    note:  'Nearest available vehicle, by district',
    body:  'Dispatch is requested against the patient UHID where there is one, so the receiving hospital knows who is arriving before the doors open.' },

  { id: 'blood', icon: 'blood',
    label: 'Blood bank',
    note:  'Group availability and donor registry',
    body:  'Stock by blood group across the network, and a donor registry keyed to the same national identity — a donor is never re-registered at a second hospital.' },

  { id: 'lab', icon: 'lab',
    label: 'Laboratory & diagnostics',
    note:  'Test orders and results on the record',
    body:  'A test ordered in one hospital is attached to the encounter that ordered it. The result is visible wherever the patient is treated next, so tests are not repeated needlessly.' },

  { id: 'beds', icon: 'beds',
    label: 'Inpatient & ward beds',
    note:  'Live bed state, ward by ward',
    body:  'Admission, transfer and discharge change bed state through a database trigger, never through application code — so the board and the record can never disagree.' },

  { id: 'referral', icon: 'referral',
    label: 'Referrals between hospitals',
    note:  'Upazila to district to medical college',
    body:  'A referral hands the patient to another hospital along with their history. The receiving doctor sees the full record on arrival instead of starting from an empty page.' },

  { id: 'consent', icon: 'consent',
    label: 'Consent & access log',
    note:  'Grant access, set an expiry, see every read',
    body:  'Access is granted, not assumed. A patient grants a hospital access for a period, and can see exactly who opened their record, where, and on what basis.' },

  { id: 'verify', icon: 'verify',
    label: 'Verify a UHID',
    note:  'Check a number before you trust it',
    body:  'The check digit is derived from the serial, so a mistyped or invented UHID fails validation before it ever reaches the database.' }
];

/* The hero figure: how a UHID works, start to finish. Deliberately
   general — no hospital, no patient, no example number. It is the
   process a visitor needs to understand before any of the names
   further down the page mean anything. */
const HOW_STEPS = [
  { n: '01', icon: 'idcard',
    t: 'Identity is verified first',
    a: 'Checked against the national ID before anything is issued',
    b: 'Duplicate-checked on NID, on name with date of birth, and on mobile' },

  { n: '02', icon: 'tag',
    t: 'One UHID is issued',
    a: 'BD · year of first contact · serial · check digit',
    b: 'One per citizen, for life — never one per hospital' },

  { n: '03', icon: 'referral',
    t: 'The record follows the patient',
    a: 'Any connected hospital opens the same history',
    b: 'Allergies, diagnoses, prescriptions, lab results, referrals' },

  { n: '04', icon: 'consent',
    t: 'Every read leaves a trace',
    a: 'Opened on the patient’s consent, or under emergency access',
    b: 'Written to the access log by a database trigger, not by app code' }
];

const APPT_STEPS = [
  ['Find a doctor',   'Filter the national directory by department, hospital or division. Fees are shown before you commit to anything.'],
  ['Pick a free slot', 'Slots are computed from the weekly schedule, minus approved leave, minus what is already booked. Nothing is shown that cannot be taken.'],
  ['Confirm',          'The slot is locked to your UHID inside a transaction, so two patients clicking the same slot at the same instant can never both succeed.'],
  ['Turn up',          'The doctor opens your national record — allergies, past diagnoses, current medication — not a blank sheet of paper.']
];

const RULES = [
  { n: '01', t: 'Identity before records',
    b: 'A UHID is anchored to a national ID. Registration duplicate-checks on NID, on name and date of birth, and on mobile number before it will issue a new one.',
    d: 'Because a patient with two UHIDs is a national record split silently in half.' },
  { n: '02', t: 'Access is granted, not assumed',
    b: 'Role-based permissions, consent grants that expire, and an access log written by a database trigger on every clinical read. Emergency access is allowed, but flagged.',
    d: 'A record everyone can read is not a health record, it is a leak.' },
  { n: '03', t: 'Availability is computed',
    b: 'A doctor&rsquo;s free slots are never stored. They are derived on demand from the recurring schedule, the leave exceptions, and the bookings already taken.',
    d: 'Stored availability drifts out of date the moment anything changes.' },
  { n: '04', t: 'Booking is transactional',
    b: 'A unique constraint on doctor and slot start, plus a stored procedure holding the row with SELECT &hellip; FOR UPDATE while it books.',
    d: 'Two patients, one slot, one instant — the database decides, not luck.' }
];

/* The lights drifting behind the hero.

   x/y place the centre and s is the diameter. Each light then
   wanders through two waypoints — dx/dy and ex/ey — rather than
   sliding along one line and back, which is what stops eight
   circles from looking like eight metronomes.

   t is how long a full loop takes; d is where in that loop it
   starts, negative so they are already scattered on the first
   frame instead of pulsing together like a heartbeat.

   Brand tones only: --ok, --warn and --crit mean bed status,
   allergy severity and appointment state in this system, and
   decoration must not borrow a colour that carries meaning. */
const GLOWS = [
  { tone: 'brand', x: 12, y: 22, s: 420, dx:  150, dy:   80, ex:   60, ey:  190, t: 15, d:  0, o: .16 },
  { tone: 'deep',  x: 54, y:  8, s: 340, dx: -120, dy:  140, ex:  100, ey:   60, t: 13, d: -5, o: .13 },
  { tone: 'brand', x: 86, y: 42, s: 460, dx: -170, dy: -110, ex:  -70, ey:  120, t: 18, d: -9, o: .14 },
  { tone: 'pale',  x: 30, y: 86, s: 380, dx:  160, dy:  -90, ex:  -80, ey:  -60, t: 20, d: -6, o: .20 },
  { tone: 'deep',  x: 72, y: 78, s: 300, dx:  110, dy:  120, ex:  -90, ey:   70, t: 12, d: -2, o: .12 },
  { tone: 'brand', x: 44, y: 52, s: 200, dx: -140, dy:   90, ex:  130, ey:  -80, t: 10, d: -7, o: .20 },
  { tone: 'deep',  x: 24, y: 62, s: 160, dx:  120, dy: -130, ex:  -60, ey:  110, t:  9, d: -3, o: .22 },
  { tone: 'brand', x: 64, y: 26, s: 180, dx: -100, dy:  120, ex:   90, ey:   90, t: 11, d: -8, o: .18 }
];

/* The questions a visitor actually arrives with. Every answer is
   one of the design decisions stated in plain words — which is the
   honest way round: the decision came first, the answer follows
   from it. */
const FAQS = [
  ['Do I have to apply for a UHID?',
   'No. One is issued the first time you present at any connected hospital. Reception verifies your identity against your national ID and the system checks that you do not already hold a UHID before it issues one.'],

  ['I have been treated at several hospitals already. Will I end up with several UHIDs?',
   'That is the exact failure the system exists to prevent. Registration duplicate-checks on national ID, on name with date of birth, and on mobile number. Where a match is found, the existing record is opened instead of a second one being created.'],

  ['Can any doctor read my whole history?',
   'No. Access is granted, not assumed. A hospital holds access for a period, on your consent, and only staff whose role requires it — a receptionist sees the demographics needed to register you, not your diagnoses.'],

  ['What happens if I arrive unconscious?',
   'A casualty doctor can open your record immediately under break-glass access, without waiting for a consent that you are in no position to give. Every such read is written to the access log by a database trigger and flagged for review afterwards.'],

  ['Can I see who has opened my record?',
   'Yes. The access log shows who opened it, at which hospital, when, and on what basis — consent, role, or emergency. It is written by the database itself rather than by the application, so it cannot be skipped.'],

  ['Is anything ever deleted?',
   'Clinical history is not deleted. A record that can be quietly edited is not evidence of anything, so corrections are recorded as corrections and the original entry stays visible alongside them.']
];

const EMERGENCY_NUMBERS = [
  { n: '999',   k: 'National emergency', s: 'Police, fire and ambulance' },
  { n: '16263', k: 'Shastho Batayon',    s: 'Government health advice line, 24 hours' }
];

const FOOT_COLS = [
  ['Explore', [['#hospitals', 'Hospitals'], ['#doctors', 'Doctors'], ['#appointments', 'Appointments'], ['#how', 'How it works']]],
  ['Services', [['#svc-emergency', 'Emergency & casualty'], ['#svc-blood', 'Blood bank'], ['#svc-lab', 'Laboratory'], ['#svc-beds', 'Ward beds']]],
  ['Your record', [['#svc-consent', 'Consent & access log'], ['#svc-verify', 'Verify a UHID'], ['login.html', 'Sign in'], ['login.html', 'Register at a hospital']]]
];

/* ------------------------------------------------------------
   ICONS
   Same 16x16 stroke style as icon() in util.js. These belong to
   the public site only, which is why they are not in there.
   ------------------------------------------------------------ */

function svcIcon(id) {
  const paths = {
    emergency: '<path d="M1.6 8h3l1.6-3.6 2.2 7L10.6 8h3.8"/>',
    ambulance: '<rect x="1.4" y="4.4" width="8.6" height="6" rx="1.2"/><path d="M10 6.6h2.4l2.2 2.6v1.2H10z"/><circle cx="4.6" cy="12.1" r="1.4"/><circle cx="11.4" cy="12.1" r="1.4"/><path d="M4.6 7.4h2.6M5.9 6.1v2.6"/>',
    blood:     '<path d="M8 1.7s4.3 4.6 4.3 7.4a4.3 4.3 0 11-8.6 0C3.7 6.3 8 1.7 8 1.7z"/>',
    lab:       '<path d="M6.3 1.8v4.4L2.9 12.3a1.2 1.2 0 001 1.9h8.2a1.2 1.2 0 001-1.9L9.7 6.2V1.8"/><path d="M5.4 1.8h5.2M4.6 9.9h6.8"/>',
    beds:      '<path d="M1.7 4.3v9.4M1.7 8.4h12.6v5.3M14.3 13.7H1.7"/><circle cx="5.1" cy="6.4" r="1.5"/>',
    referral:  '<path d="M1.8 5.2h8.6M8.1 2.8l2.5 2.4-2.5 2.4"/><path d="M14.2 10.8H5.6M7.9 8.4l-2.5 2.4 2.5 2.4"/>',
    consent:   '<path d="M8 1.6l5.2 2v4.1c0 3.4-2.2 5.8-5.2 6.7-3-.9-5.2-3.3-5.2-6.7V3.6z"/><path d="M5.8 7.9l1.7 1.8 3-3.3"/>',
    verify:    '<circle cx="8" cy="8" r="6.2"/><path d="M5.3 8.2l2 2 3.4-3.9"/>'
  };
  return `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[id] || ''}</svg>`;
}

const chevron = `<svg class="chev" width="11" height="11" viewBox="0 0 16 16" fill="none"
  stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>`;

/* Markers for the hero thread. Steps 3 and 4 are the same ideas as
   two of the services, so they reuse those icons; steps 1 and 2 get
   their own, because a check inside a circle and a check inside a
   shield are indistinguishable at 34px. */
function stepIcon(id) {
  const own = {
    idcard: '<rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.6"/><circle cx="5.5" cy="7" r="1.6"/><path d="M3.3 11c.5-1.3 3.9-1.3 4.4 0"/><path d="M9.8 6.4h2.8M9.8 9h2.8"/>',
    tag:    '<path d="M8.5 1.8h4a1.7 1.7 0 011.7 1.7v4l-6.4 6.4a1.2 1.2 0 01-1.7 0L2 10.2a1.2 1.2 0 010-1.7z"/><circle cx="11" cy="5" r="1.1"/>'
  };
  if (!own[id]) return svcIcon(id);
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${own[id]}</svg>`;
}

/* ------------------------------------------------------------
   NAV BAR
   ------------------------------------------------------------ */

function renderNav() {
  /* Somebody already signed in should be offered their console,
     not a login form they do not need. */
  const sess = session.get();
  const signedIn = sess && ROLES[sess.role];
  const cta = signedIn
    ? { href: 'pages/' + ROLES[sess.role].nav[0][0] + '.html', label: 'Open console' }
    : { href: 'login.html', label: 'Sign in' };

  $('#nav-links').innerHTML = `
    ${NAV_LINKS.map(([href, label]) => `<a class="nav-link" href="${href}">${label}</a>`).join('')}
    <div class="dd" id="dd">
      <button type="button" class="nav-link dd-btn" id="dd-btn" aria-expanded="false" aria-controls="dd-panel">
        Services ${chevron}
      </button>
      <div class="dd-panel" id="dd-panel" role="menu" aria-labelledby="dd-btn">
        <div class="dd-grid">
          ${SERVICES.map((s, i) => `
            <a class="dd-item" role="menuitem" href="#svc-${esc(s.id)}" style="--i:${i}">
              <span class="dd-ic${s.urgent ? ' urgent' : ''}">${svcIcon(s.icon)}</span>
              <span class="dd-txt">
                <b>${esc(s.label)}</b>
                <span>${esc(s.note)}</span>
              </span>
            </a>`).join('')}
        </div>
        <div class="dd-foot">
          ${pinIcon}
          <span>All eight services run on the same patient identity. Nothing is re-collected at the counter.</span>
        </div>
      </div>
    </div>
    <a class="btn primary nav-cta" href="${cta.href}">${cta.label}</a>`;

  wireDropdown();
}

/* The dropdown: click or keyboard opens it, hover opens it on a
   desktop pointer, Escape and any click outside close it. The
   animation itself is CSS — this only owns the `open` class. */
function wireDropdown() {
  const dd   = $('#dd');
  const btn  = $('#dd-btn');
  const fine = window.matchMedia('(hover: hover) and (min-width: 861px)');

  const open  = () => { dd.classList.add('open');    btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { dd.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    /* On a desktop pointer the menu is already open — moving the
       mouse onto the button opened it — so a click there must not
       toggle it straight back shut. The mouse closes it by leaving.
       On touch, and for the keyboard, the click is the only way in
       and out, so there it toggles. */
    if (fine.matches) { open(); return; }
    dd.classList.contains('open') ? close() : open();
  });

  dd.addEventListener('mouseenter', () => { if (fine.matches) open(); });
  dd.addEventListener('mouseleave', () => { if (fine.matches) close(); });

  /* Choosing a service closes the menu — otherwise it hangs over
     the section the browser has just scrolled to. */
  $$('.dd-item', dd).forEach(a => a.addEventListener('click', close));

  document.addEventListener('click', e => { if (!dd.contains(e.target)) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dd.classList.contains('open')) { close(); btn.focus(); }
  });
}

function wireNavToggle() {
  const btn   = $('#nav-toggle');
  const links = $('#nav-links');

  btn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('on', open);
  });

  /* Tapping a link on a phone should close the menu behind it. */
  links.addEventListener('click', e => {
    if (!e.target.closest('a')) return;
    links.classList.remove('open');
    btn.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
  });

  /* A flat bar over the hero, a shadowed one once you scroll. */
  const nav = $('#site-nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ------------------------------------------------------------
   HERO
   ------------------------------------------------------------ */

function renderHero() {
  /* Every value goes through Number() before it reaches a style
     attribute. These are authored constants today, but a style
     attribute is a place where a string from anywhere else could
     do real damage, and the habit is worth keeping. */
  $('#glows').innerHTML = GLOWS.map(g =>
    `<span class="glow ${esc(g.tone)}" style="` +
    `--x:${Number(g.x)}%;--y:${Number(g.y)}%;--s:${Number(g.s)}px;` +
    `--dx:${Number(g.dx)}px;--dy:${Number(g.dy)}px;` +
    `--ex:${Number(g.ex)}px;--ey:${Number(g.ey)}px;` +
    `--t:${Number(g.t)}s;--d:${Number(g.d)}s;--o:${Number(g.o)}"></span>`).join('');

  /* The thread. One unbroken line down the four steps — the line is
     the record, and the pulse running down it is what makes the
     figure read as a sequence rather than a list. */
  $('#thread').innerHTML = HOW_STEPS.map(s => `
    <li class="tnode">
      <span class="tstep mono">${esc(s.n)}</span>
      <span class="tmark">${stepIcon(s.icon)}</span>
      <span class="tbody">
        <b>${esc(s.t)}</b>
        <span class="twhat">${esc(s.a)}</span>
        <span class="twhere">${esc(s.b)}</span>
      </span>
    </li>`).join('');

  $('#art-cap').innerHTML = `${svcIcon('consent')}<span>Issued once, honoured
    everywhere, and never opened silently. That is the whole system in four
    steps.</span>`;

  renderStats();
}

/* The four numbers under the hero. Its own function so it can be drawn
   again once the real counts arrive from the API (see START). */
function renderStats() {
  const stats = [
    { n: HOSPITALS.length,   k: 'Connected hospitals', s: 'Public, private and upazila' },
    { n: DIVISIONS.length,   k: 'Divisions covered',   s: 'Every division in the country' },
    { n: DOCTORS.length,     k: 'Doctors listed',      s: DEPARTMENTS.length + ' departments' },
    { n: '1',                k: 'Record per citizen',  s: 'For life, not per hospital' }
  ];

  $('#stats').innerHTML = stats.map(s => `
    <div class="stat">
      <b class="mono">${esc(s.n)}</b>
      <span class="k">${esc(s.k)}</span>
      <span class="s">${esc(s.s)}</span>
    </div>`).join('');
}

/* ------------------------------------------------------------
   SERVICES
   ------------------------------------------------------------ */

function renderServices() {
  $('#svc-grid').innerHTML = SERVICES.map(s => `
    <article class="card svc" id="svc-${esc(s.id)}">
      <div class="svc-ic${s.urgent ? ' urgent' : ''}">${svcIcon(s.icon)}</div>
      <h3>${esc(s.label)}</h3>
      <p>${esc(s.body)}</p>
    </article>`).join('');
}

/* ------------------------------------------------------------
   HOSPITALS
   Division chips filter the grid. Doctor counts are computed from
   DOCTORS, not stored — the same principle as slot availability.
   ------------------------------------------------------------ */

let hospDiv = '';

function renderHospitals() {
  const divs = [...new Set(HOSPITALS.map(h => h.div))];

  $('#div-chips').innerHTML =
    [['', 'All divisions']].concat(divs.map(d => [d, d]))
      .map(([v, label]) =>
        `<button type="button" class="chip${v === hospDiv ? ' on' : ''}" data-div="${esc(v)}">${esc(label)}</button>`)
      .join('');

  $$('#div-chips .chip').forEach(b => b.addEventListener('click', () => {
    hospDiv = b.dataset.div;
    renderHospitals();
  }));

  const list = HOSPITALS.filter(h => !hospDiv || h.div === hospDiv);
  const out  = $('#hosp-grid');

  if (!list.length) {
    out.innerHTML = `<div class="card empty-state"><b>No hospital yet</b>No connected hospital in this division so far. The network is being extended division by division.</div>`;
    return;
  }

  out.innerHTML = list.map(h => {
    const docs = DOCTORS.filter(d => d.hospitalId === h.id).length;
    return `
      <article class="card hosp-card">
        <div class="hosp-top">
          <h3>${esc(h.name)}</h3>
          <span class="pill ${h.tier === 'Private' ? 'info' : 'mute'}">${esc(h.tier)}</span>
        </div>
        <div class="hosp-where">${pinIcon}<span>${esc(h.dist)} district &middot; ${esc(h.div)} division</span></div>
        <div class="hosp-foot">
          <span>${docs} doctor${docs === 1 ? '' : 's'} listed</span>
          <a class="hosp-link" href="#doctors">See doctors</a>
        </div>
      </article>`;
  }).join('');
}

/* ------------------------------------------------------------
   DOCTORS
   Same card as the booking screen — one visual language, one
   place to change it.
   ------------------------------------------------------------ */

/* Drawn twice: once at once from the built-in list, again when the API
   answers. The listeners are added only the first time, and the chosen
   department survives the redraw (stress test H3.5). */
let doctorFiltersBound = false;
function renderDoctors() {
  const chosen = $('#d-dept').value;
  $('#d-dept').innerHTML = `<option value="">All departments</option>${DEPARTMENTS.map(d =>
    `<option${d === chosen ? ' selected' : ''}>${esc(d)}</option>`).join('')}`;
  if (!doctorFiltersBound) {
    $('#d-q').addEventListener('input', runDoctorList);
    $('#d-dept').addEventListener('change', runDoctorList);
    doctorFiltersBound = true;
  }
  runDoctorList();
}

function runDoctorList() {
  const q    = $('#d-q').value.trim().toLowerCase();
  const dept = $('#d-dept').value;
  const out  = $('#doc-out');

  const list = DOCTORS.filter(d =>
    (!dept || d.dept === dept) && (!q || d.name.toLowerCase().includes(q)));

  if (!list.length) {
    out.innerHTML = `<div class="card empty-state"><b>No doctor found</b>Nobody in the directory matches that. Try clearing the department, or search a shorter part of the name.</div>`;
    return;
  }

  out.innerHTML = `
    <p class="count">${list.length} doctor${list.length === 1 ? '' : 's'} ${dept || q ? 'matching' : 'across the network'}</p>
    <div class="doc-list">${list.map(d => {
      const h = hospital(d.hospitalId);
      return `
      <article class="card doc">
        <div class="doc-top">
          <div class="doc-av">${initials(d.name)}</div>
          <div class="doc-id">
            <b>${esc(d.name)}</b>
            <span class="spec">${esc(d.dept)}</span>
            <span class="qual">${esc(d.qual)}</span>
          </div>
        </div>
        <div class="doc-where">${pinIcon}
          <span>${esc(h.name)}<br><span class="doc-sub">${esc(h.dist)}, ${esc(h.div)} &middot; ${esc(h.tier)}</span></span>
        </div>
        <div class="doc-foot">
          <span class="next-free">
            <span class="fee">&#2547;${esc(d.fee)} consultation</span><br>
            <span class="doc-sub">BMDC ${esc(d.bmdc)}</span>
          </span>
          <a class="btn sm primary" href="login.html">Book</a>
        </div>
      </article>`;
    }).join('')}</div>`;
}

/* ------------------------------------------------------------
   APPOINTMENTS, RULES, EMERGENCY, FOOTER
   ------------------------------------------------------------ */

/* The FAQ list. Buttons rather than <details>, so the open and shut
   states can animate; aria-expanded and aria-controls carry the
   same information to a screen reader that the chevron carries to
   everyone else. The first answer starts open so the section reads
   as content rather than as a row of closed bars. */
function renderFaq() {
  $('#faq-list').innerHTML = FAQS.map(([q, a], i) => `
    <div class="faq-item${i === 0 ? ' open' : ''}">
      <h3 class="faq-q">
        <button type="button" class="faq-btn" id="faq-b-${i}"
                aria-expanded="${i === 0}" aria-controls="faq-p-${i}">
          <span>${esc(q)}</span>
          ${chevron}
        </button>
      </h3>
      <div class="faq-a" id="faq-p-${i}" role="region" aria-labelledby="faq-b-${i}">
        <div class="faq-a-in"><p>${esc(a)}</p></div>
      </div>
    </div>`).join('');

  $$('#faq-list .faq-btn').forEach(btn => btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const open = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  }));
}

function renderRest() {
  $('#appt-steps').innerHTML = APPT_STEPS.map(([t, b], i) => `
    <li class="step">
      <span class="step-n mono">${i + 1}</span>
      <div><b>${esc(t)}</b><p>${esc(b)}</p></div>
    </li>`).join('');

  /* RULES carries a couple of deliberate entities (&hellip;, &rsquo;),
     so it is trusted authored copy, not data — hence no esc() on
     the body. Anything from the API always goes through esc(). */
  $('#rules').innerHTML = RULES.map(r => `
    <article class="rule">
      <span class="rule-n mono">${r.n}</span>
      <h3>${r.t}</h3>
      <p>${r.b}</p>
      <p class="rule-why">${r.d}</p>
    </article>`).join('');

  $('#emg-nums').innerHTML = EMERGENCY_NUMBERS.map(e => `
    <div class="emg-num">
      <b class="mono">${esc(e.n)}</b>
      <span class="k">${esc(e.k)}</span>
      <span class="s">${esc(e.s)}</span>
    </div>`).join('');

  $('#foot-cols').innerHTML = FOOT_COLS.map(([title, links]) => `
    <div class="foot-col">
      <h4>${esc(title)}</h4>
      ${links.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join('')}
    </div>`).join('');
}

/* ------------------------------------------------------------
   START
   ------------------------------------------------------------ */

renderNav();
wireNavToggle();
renderHero();
renderServices();
renderHospitals();
renderDoctors();
renderFaq();
renderRest();

/* Served by Express, the hospital and doctor lists come from the
   database. The page draws at once from the built-in copies, then
   redraws the three sections that use them when the API has answered,
   so a slow server never leaves the page blank. */
API.ready.then(online => {
  if (!online) return;
  renderStats();
  renderHospitals();
  renderDoctors();
});

/* A fragment in the URL is resolved by the browser while this page
   is still an empty shell. Every section then grows as it renders,
   so someone opening a shared link to #doctors lands somewhere near
   the top instead. Now that everything is on the page, go there
   again. querySelector throws on a fragment that is not a valid
   selector, and a stray link is not worth an exception. */
if (location.hash) {
  try {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView();
  } catch (e) { /* not a selector — leave the page where it is */ }
}

/* Anything the page we came from handed over — a sign-out message
   arrives this way if the user lands here rather than on login. */
showFlashes();
