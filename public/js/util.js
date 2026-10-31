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

function toast(title, msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

function modal(html) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  scrim.addEventListener('click', e => { if (e.target === scrim) scrim.remove(); });
  const onKey = e => { if (e.key === 'Escape') { scrim.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  $$('[data-close]', scrim).forEach(b => b.addEventListener('click', () => scrim.remove()));
  document.body.appendChild(scrim);
  return scrim;
}

function icon(id) {
  const paths = {
    register: '<path d="M8 1.5v13M1.5 8h13"/>',
    search:   '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14.2 14.2"/>',
    book:     '<rect x="1.8" y="3" width="12.4" height="11.2" rx="1.6"/><path d="M1.8 6.6h12.4M5.2 1.6v2.6M10.8 1.6v2.6"/>',
    record:   '<path d="M3.5 1.8h9v12.4h-9z"/><path d="M6 5.2h4M6 8h4M6 10.8h2.4"/>',
    wards:    '<path d="M1.6 12.4V6.6l6.4-4.2 6.4 4.2v5.8"/><path d="M1.6 12.4h12.8M5.6 12.4V9h4.8v3.4"/>'
  };
  return `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[id] || ''}</svg>`;
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
