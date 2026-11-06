/* ============================================================
   UHID — helpers
   Small, dependency-free functions used by every screen.
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* Escape everything that came from data before it goes into HTML.
   With a real API this is what stops a patient named <script> from
   breaking your page. */
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const hospital = id => HOSPITALS.find(h => h.id === id) || { name: '—', div: '—', dist: '—', tier: '—' };

const initials = name => String(name || '?')
  .replace(/^Dr\.\s*/, '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w))
  .slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

/* The UHID check digit: the serial's five digits summed, mod 10.
   '13052' → 1+3+0+5+2 = 11 → 1, so BD-2026-13052-1. The database
   enforces the same rule as ck_patient_uhid_check_digit, so a UHID
   built any other way is one MySQL will refuse to store. This is the
   only place in the frontend that knows the rule. */
const uhidCheckDigit = serial => String(serial).split('').reduce((a, d) => a + Number(d), 0) % 10;

const fmtDate = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* '2026-10-31 22:06:02' (how the API sends a DATETIME), or a Date,
   → '31 Oct 2026 · 22:06' in local time. */
const fmtDateTime = s => {
  const d = s instanceof Date ? s : new Date(String(s).replace(' ', 'T'));
  if (isNaN(d)) return '—';
  return `${fmtDate(d)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function ageFrom(dob) {
  const d = new Date(dob);
  if (isNaN(d)) return '—';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

/* Today as YYYY-MM-DD in the computer's own time zone. toISOString() is
   UTC, which before 06:00 in Dhaka is still yesterday (stress test H3.5). */
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Run an async action from a button once: the button is disabled while it
   runs, so a double click cannot send it twice (stress test H3.5). */
async function busy(btn, action) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try { await action(); } finally { if (btn.isConnected) btn.disabled = false; }
}

function toast(title, msg, kind) {
  const box = $('#toasts');
  // Announced by screen readers; errors interrupt, the rest wait their turn.
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const el = document.createElement('div');
  if (kind === 'err') el.setAttribute('role', 'alert');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

/* A dialog. Keyboard users land inside it, Tab stays inside it, Escape
   closes it, and focus goes back to where it was when it closes — however
   it closes, even when a caller simply removes it (stress test H3.5). */
function modal(html) {
  const before = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const box = $('.modal', scrim);
  const title = $('h3', box);
  if (title) { title.id = 'modal-title-' + Date.now(); box.setAttribute('aria-labelledby', title.id); }
  scrim.addEventListener('click', e => { if (e.target === scrim) scrim.remove(); });
  // The key listener lives on the dialog itself, so it goes when the dialog goes.
  scrim.addEventListener('keydown', e => {
    if (e.key === 'Escape') { scrim.remove(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('button, [href], input, select, textarea', box).filter(x => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  });
  $$('[data-close]', scrim).forEach(b => b.addEventListener('click', () => scrim.remove()));
  document.body.appendChild(scrim);
  const first = $('input, select, textarea, button.primary, button', box);
  if (first) first.focus();
  const watch = new MutationObserver(() => {
    if (!scrim.isConnected) { watch.disconnect(); if (before && before.isConnected) before.focus(); }
  });
  watch.observe(document.body, { childList: true });
  return scrim;
}

function icon(id) {
  const paths = {
    register: '<path d="M8 1.5v13M1.5 8h13"/>',
    search:   '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14.2 14.2"/>',
    book:     '<rect x="1.8" y="3" width="12.4" height="11.2" rx="1.6"/><path d="M1.8 6.6h12.4M5.2 1.6v2.6M10.8 1.6v2.6"/>',
    record:   '<path d="M3.5 1.8h9v12.4h-9z"/><path d="M6 5.2h4M6 8h4M6 10.8h2.4"/>',
    wards:    '<path d="M1.6 12.4V6.6l6.4-4.2 6.4 4.2v5.8"/><path d="M1.6 12.4h12.8M5.6 12.4V9h4.8v3.4"/>',
    encounter: '<path d="M10.6 1.8l3.6 3.6-7.8 7.8H2.8V9.6z"/><path d="M8.8 3.6l3.6 3.6"/>',
    referrals: '<path d="M1.8 8h9.6M8 4.4L11.6 8 8 11.6"/><path d="M14.2 2.4v11.2"/>',
    lab:      '<path d="M6 1.8h4M6.6 1.8v4.6L2.6 13a1 1 0 00.9 1.4h9a1 1 0 00.9-1.4L9.4 6.4V1.8"/><path d="M4.4 10h7.2"/>',
    audit:    '<path d="M8 1.6l5.6 2.2v4c0 3.4-2.4 5.6-5.6 6.6-3.2-1-5.6-3.2-5.6-6.6v-4z"/><path d="M5.6 8l1.7 1.7L10.6 6.4"/>',
    merge:    '<path d="M3.2 1.8v3.6c0 2 1.6 3.2 4.8 4.4M12.8 1.8v3.6c0 2-1.6 3.2-4.8 4.4V14.2"/>',
    appointments: '<rect x="1.8" y="3" width="12.4" height="11.2" rx="1.6"/><path d="M1.8 6.6h12.4M5.2 1.6v2.6M10.8 1.6v2.6M4.6 9.2h6.8M4.6 11.8h4.4"/>',
    account:  '<circle cx="8" cy="5.4" r="3"/><path d="M2.4 14.4c.6-3 2.8-4.6 5.6-4.6s5 1.6 5.6 4.6"/>',
    accounts: '<circle cx="6" cy="5.6" r="2.6"/><path d="M1.4 14c.5-2.6 2.3-4 4.6-4s4.1 1.4 4.6 4"/><path d="M10.6 3.2a2.6 2.6 0 010 4.8M12.4 10.4c1.2.6 2 1.8 2.2 3.6"/>'
  };
  return `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[id] || ''}</svg>`;
}

/* A one-time password, shown once (checklist I1). The server keeps only
   its hash, so this dialog is the only place it ever appears: closing it
   without writing it down means a new reset. */
function showOneTime(title, username, password, note) {
  const sc = modal(`
    <div class="modal-h"><h3>${esc(title)}</h3><p>${esc(note)}</p></div>
    <div class="modal-b">
      <dl class="kv">
        <dt>Username</dt><dd class="mono">${esc(username)}</dd>
        <dt>One-time password</dt><dd class="mono" style="font-size:17px;letter-spacing:.06em">${esc(password)}</dd>
      </dl>
      <p class="hint" style="margin-top:12px">Shown once. It is not stored anywhere it could be read again; at the first sign-in it must be replaced.</p>
    </div>
    <div class="modal-f"><button class="btn" data-copy>Copy password</button><button class="btn primary" data-close>Done</button></div>`);
  $('[data-copy]', sc).addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(password); b.textContent = 'Copied'; }
    catch (err) { toast('Could not copy', 'Write it down from the screen instead.', 'err'); }
  });
  return sc;
}

/* Reception gives a patient a login for their own record (checklist I1):
   a username they choose and a one-time password, which they replace at
   their first sign-in. Asking again for someone who already has a login
   gives them a fresh one-time password (issue_patient_login). */
function issuePortalLogin(uhid, name) {
  const first = String(name || '').toLowerCase().replace(/^(md|mst|mrs|mr|dr)\.?\s+/, '').split(/\s+/)[0] || '';
  const suggestion = first.replace(/[^a-z0-9._-]/g, '');
  const sc = modal(`
    <div class="modal-h"><h3>Patient portal login</h3><p>For ${esc(name || uhid)}: lets them see their own record and book appointments from home.</p></div>
    <div class="modal-b">
      <label class="label" for="pl-user">Username</label>
      <input class="field mono" id="pl-user" maxlength="40" value="${esc(suggestion)}" autocomplete="off">
      <p class="hint">3 to 40 lower-case letters, digits, dots, dashes or underscores. If the patient already has a login, it keeps its username and gets a new one-time password.</p>
    </div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Create login</button></div>`);
  $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
    let r;
    try { r = await API.post(`/patients/${encodeURIComponent(uhid)}/login`, { username: $('#pl-user', sc).value.trim().toLowerCase() }); }
    catch (err) { toast('No login created', err.message, 'err'); return; }
    sc.remove();
    showOneTime('Portal login ready', r.username, r.oneTimePassword,
      'Give it to the patient on paper. They choose their own password the first time they sign in.');
  }));
}

const pinIcon = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.5" style="flex:none;margin-top:2px"><path d="M8 14.5s5.2-4.4 5.2-8a5.2 5.2 0 10-10.4 0c0 3.6 5.2 8 5.2 8z"/><circle cx="8" cy="6.4" r="1.9"/></svg>`;

const warnIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.7" style="flex:none;margin-top:1px"><path d="M8 1.6L15 14H1z"/><path d="M8 6v3.4M8 11.6v.1"/></svg>`;

/* ------------------------------------------------------------
   Where the login page is from here. The public landing page
   (index.html) and login.html sit at the root; every clinical
   screen sits one level down in pages/.
   ------------------------------------------------------------ */

const AT_ROOT = ['home', 'login'].includes(document.body.dataset.page);
const LOGIN_HREF = (AT_ROOT ? '' : '../') + 'login.html';

/* Hand any toast still on screen to the next page, so a message
   raised just before a navigation is not thrown away with the
   document that raised it. */
function carryToasts() {
  flash.queue($$('#toasts .toast').map(el => ({
    title: el.querySelector('b').textContent,
    msg:   el.querySelector('span').textContent,
    kind:  el.classList.contains('err') ? 'err' : ''
  })));
}

/* Replay whatever the previous page handed over. */
function showFlashes() {
  flash.drain().forEach(t => toast(t.title, t.msg, t.kind));
}

function resetDemo() {
  /* Online, the data lives in MySQL, and a web page must never be able to
     wipe a database. The reset is a deliberate act on the server. */
  if (typeof API !== 'undefined' && API.online) {
    modal(`
      <div class="modal-h"><h3>Reset demo data</h3><p>The data now lives in MySQL, not in this browser.</p></div>
      <div class="modal-b">To put the database back to the sample data, stop the server and run
        <span class="mono">npm run db:reset</span> in the <span class="mono">server</span> folder, then
        <span class="mono">npm start</span> again. A web page is deliberately not allowed to do this.</div>
      <div class="modal-f"><button class="btn primary" data-close>Understood</button></div>`);
    return;
  }
  const sc = modal(`
    <div class="modal-h"><h3>Reset demo data</h3><p>Removes every patient you registered and signs you out.</p></div>
    <div class="modal-b">The five sample patients come back, and anyone you added in this browser is discarded. Useful right before a presentation.</div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Reset</button></div>`);
  $('[data-ok]', sc).addEventListener('click', () => {
    store.reset();
    session.clear();
    sc.remove();
    /* Raise the toast before leaving, not after: carryToasts()
       hands it to the login page, which replays it on arrival. */
    toast('Demo data reset', 'Back to the five sample patients.');
    carryToasts();
    location.href = LOGIN_HREF;
  });
}
