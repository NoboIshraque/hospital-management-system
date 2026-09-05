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

const fmtDate = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
   Where the login page is from here. index.html sits at the root,
   every clinical screen sits one level down in pages/.
   ------------------------------------------------------------ */

const LOGIN_HREF = document.body.dataset.page === 'login' ? 'index.html' : '../index.html';

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
