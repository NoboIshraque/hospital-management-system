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

/* The hero figure. One patient, three hospitals, one record —
   the whole argument for the project in three lines. The hospitals
   are looked up in HOSPITALS so the names on the front page can
   never drift from the ones in the directory below. */
const JOURNEY = [
  { hospitalId: 1, year: '2019', what: 'First contact · UHID issued' },
  { hospitalId: 3, year: '2024', what: 'Emergency · allergy recorded' },
  { hospitalId: 4, year: '2026', what: 'Referral · full history on arrival' }
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

/* The marker on the hero thread — a hospital, not a generic dot. */
const hospGlyph = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 13.8V5.9L8 2.4l5.4 3.5v7.9"/><path d="M6.3 13.8v-3.2h3.4v3.2"/><path d="M8 5.6v2.4M6.8 6.8h2.4"/></svg>`;

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
  /* The thread. The last stop is the live one, so it carries the
     brand marker and the pill — the eye lands there last. */
  $('#thread').innerHTML = JOURNEY.map((j, i) => {
    const h    = hospital(j.hospitalId);
    const last = i === JOURNEY.length - 1;
    return `
      <li class="tnode${last ? ' now' : ''}">
        <span class="tyear mono">${esc(j.year)}</span>
        <span class="tmark">${hospGlyph}</span>
        <span class="tbody">
          <b>${esc(h.name)}${last ? ' <span class="pill ok">now</span>' : ''}</b>
          <span class="twhat">${esc(j.what)}</span>
          <span class="twhere">${esc(h.dist)} &middot; ${esc(h.div)} division</span>
        </span>
      </li>`;
  }).join('');

  $('#art-cap').innerHTML = `${svcIcon('consent')}<span>One record, three hospitals,
    seven years apart. Every one of those reads needed the patient&rsquo;s consent
    &mdash; or logged emergency access.</span>`;

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

function renderDoctors() {
  $('#d-dept').innerHTML =
    `<option value="">All departments</option>` +
    DEPARTMENTS.map(d => `<option>${esc(d)}</option>`).join('');

  $('#d-q').addEventListener('input', runDoctorList);
  $('#d-dept').addEventListener('change', runDoctorList);
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
renderRest();

/* Anything the page we came from handed over — a sign-out message
   arrives this way if the user lands here rather than on login. */
showFlashes();
