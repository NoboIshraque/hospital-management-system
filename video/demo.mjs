// Driving the demo tab like a person would: a visible cursor that glides to what it clicks,
// typing at reading pace, smooth scrolling. Elements are found by their visible text or label,
// the way the demo script describes them, so the scenes read like the script.
import { launch, openTab, startRecorder, fitViewport, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ORIGIN = 'http://localhost:3000';
export const W = 1536, H = 864; // CSS pixels; at 125 % that is 1920 x 1080 in the video

// Runs in every page before its own scripts: the cursor drawing and the element finder.
const PAGE_HELPERS = String.raw`
(() => {
  const KEY = '__demo_cursor';
  let pos = { x: ${W / 2}, y: ${H / 2} };
  try { pos = JSON.parse(sessionStorage.getItem(KEY)) || pos; } catch {}
  let cur;
  function make() {
    if (cur || !document.body || location.protocol === 'file:') return;  // no pointer on the console pages
    cur = document.createElement('div');
    cur.setAttribute('aria-hidden', 'true');
    cur.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:none;will-change:transform';
    cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.5 15 Z" fill="black" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cur);
    place(pos.x, pos.y);
  }
  function place(x, y) {
    pos = { x, y };
    try { sessionStorage.setItem(KEY, JSON.stringify(pos)); } catch {}
    if (cur) cur.style.transform = 'translate(' + (x - 3) + 'px,' + (y - 2) + 'px)';
  }
  function ripple(x, y) {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;left:' + (x - 18) + 'px;top:' + (y - 18) + 'px;width:36px;height:36px;border-radius:50%;' +
      'background:rgba(14,110,140,.28);border:2px solid rgba(14,110,140,.55);z-index:2147483646;pointer-events:none;' +
      'transform:scale(.3);opacity:1;transition:transform .45s ease-out, opacity .45s ease-out';
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.2)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  }
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const textOf = (el) => norm(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.title || '');
  // spec: { sel, text, exact, label, nth, within }
  function find(spec) {
    let scope = document;
    if (spec.within) { const w = find(spec.within); if (!w) return null; scope = w; }
    if (spec.label) {
      const want = norm(spec.label).toLowerCase();
      const labels = [...scope.querySelectorAll('label')].filter((l) => visible(l) || l.control);
      for (const l of labels) {
        const t = norm(l.innerText).toLowerCase();
        if (t === want || t.startsWith(want)) {
          const c = l.control || l.querySelector('input,select,textarea') ||
            l.parentElement.querySelector('input,select,textarea');
          if (c) return c;
        }
      }
      const byPh = [...scope.querySelectorAll('input,textarea')].find((i) => norm(i.placeholder).toLowerCase().startsWith(want) && visible(i));
      if (byPh) return byPh;
      const byAria = [...scope.querySelectorAll('input,select,textarea')].find((i) => norm(i.getAttribute('aria-label')).toLowerCase().startsWith(want));
      return byAria || null;
    }
    const pool = [...scope.querySelectorAll(spec.sel || 'button, a, [role=button], summary, label, input[type=submit], input[type=button], td, th, li, h1, h2, h3, h4, p, span, div, strong, b')].filter(visible);
    let hits = pool;
    if (spec.text != null) {
      const want = norm(spec.text);
      hits = pool.filter((el) => { const t = textOf(el); return spec.exact ? t === want : t.includes(want); });
      if (!spec.sel) {
        // prefer the innermost match: drop any hit that contains another hit
        hits = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
      }
    }
    const n = spec.nth || 0;
    return (n < 0 ? hits[hits.length + n] : hits[n]) || null;
  }
  window.__demo = { make, place, ripple, find, textOf, get pos() { return pos; },
    rectOf(spec) { const el = find(spec); if (!el) return null; const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; },
    // centre the element in view if it is not comfortably on screen
    async reveal(spec) { const el = find(spec); if (!el) return false; const r = el.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight - 40) { el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await new Promise((res) => setTimeout(res, 750)); }
      return true; },
    caption,
  };

  // The part title shown at the start of each scene: a lower-third in the site's own colours
  // (--rail, --rail-ink, --brand). It is kept in sessionStorage with an end time, so a sign-in that
  // changes page in the middle of it shows it again on the next page until it is due to go.
  const CAP = '__demo_caption';
  let capEl;
  function caption(title, sub, ms) {
    if (title) { try { sessionStorage.setItem(CAP, JSON.stringify({ title, sub, until: Date.now() + ms })); } catch {} }
    let c; try { c = JSON.parse(sessionStorage.getItem(CAP)); } catch {}
    if (!c || !document.body) return;
    const left = c.until - Date.now();
    if (left < 300) return;
    if (capEl) capEl.remove();
    capEl = document.createElement('div');
    capEl.setAttribute('aria-hidden', 'true');
    capEl.style.cssText = 'position:fixed;left:244px;bottom:30px;z-index:2147483645;pointer-events:none;max-width:860px;' +
      'background:rgba(12,43,58,.95);border-left:5px solid #0E6E8C;border-radius:5px;padding:13px 22px 14px 18px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.25);font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;' +
      'opacity:0;transform:translateY(12px);transition:opacity .45s ease, transform .45s ease';
    const t = document.createElement('div'); t.textContent = c.title;
    t.style.cssText = 'color:#fff;font-size:22px;font-weight:600;letter-spacing:.1px;line-height:1.25';
    const s = document.createElement('div'); s.textContent = c.sub || '';
    s.style.cssText = 'color:#A9C2CE;font-size:15px;margin-top:4px;line-height:1.35';
    capEl.append(t, s);
    document.documentElement.appendChild(capEl);
    const el = capEl;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none'; }));
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(12px)'; setTimeout(() => el.remove(), 500); }, left - 450);
  }
  const showPending = () => caption();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showPending); else showPending();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make); else make();
  new MutationObserver(() => { if (cur && !cur.isConnected) document.documentElement.appendChild(cur); })
    .observe(document.documentElement, { childList: true });
})();
`;

export async function session({ headless = true } = {}) {
  const { conn, close } = await launch({ profileDir: path.join(process.env.TEMP, 'uhid-video-profile'), headless, scale: 1.25 });
  const tab = await openTab(conn, null, { width: W, height: H });
  await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await tab.send('Emulation.setLocaleOverride', { locale: 'en-GB' });
  await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
  await tab.goto(ORIGIN + '/');
  await fitViewport(conn, tab, W, H);
  // a fresh profile every run: clear the site's storage and cookies so every take starts signed out
  await tab.send('Network.enable');
  await tab.send('Network.clearBrowserCookies');
  await tab.eval('try { localStorage.clear(); sessionStorage.clear(); } catch {} true');
  const d = driver(tab);
  return { conn, tab, d, close, recorder: () => startRecorder(conn, ORIGIN) };
}

export function driver(tab) {
  const ev = (js) => tab.eval(js);
  const J = JSON.stringify;
  let pos = { x: W / 2, y: H / 2 };

  async function waitFor(spec, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await ev(`!!(window.__demo && __demo.find(${J(spec)}))`)) return true; } catch {}
      await sleep(120);
    }
    throw new Error('not found on page: ' + J(spec) + ' at ' + (await ev('location.pathname').catch(() => '?')));
  }
  async function moveTo(x, y, ms = 550) {
    const from = { ...pos };
    const steps = Math.max(8, Math.round(ms / 22));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const nx = from.x + (x - from.x) * e, ny = from.y + (y - from.y) * e;
      await ev(`__demo.make(); __demo.place(${nx}, ${ny}); true`);
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: nx, y: ny });
      await sleep(ms / steps);
    }
    pos = { x, y };
  }
  async function target(spec) {
    await waitFor(spec);
    await ev(`__demo.reveal(${J(spec)})`);
    const r = await ev(`__demo.rectOf(${J(spec)})`);
    if (!r) throw new Error('lost element ' + J(spec));
    return r;
  }
  async function clickAt(x, y) {
    await ev(`__demo.ripple(${x}, ${y}); true`);
    await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  const api = {
    tab, sleep, waitFor, moveTo,
    pause: (ms) => sleep(ms),
    async goto(url) { await tab.goto(url.startsWith('http') || url.startsWith('file') ? url : ORIGIN + url); await sleep(400); await ev(`__demo.make(); __demo.place(${pos.x}, ${pos.y}); true`); },
    async click(spec, { dwell = 250, after = 600 } = {}) {
      if (typeof spec === 'string') spec = { text: spec };
      const r = await target(spec);
      await moveTo(r.x, r.y);
      await sleep(dwell);
      await clickAt(r.x, r.y);
      await sleep(after);
    },
    async hover(spec, ms = 800) { if (typeof spec === 'string') spec = { text: spec }; const r = await target(spec); await moveTo(r.x, r.y); await sleep(ms); },
    async type(spec, text, { cps = 14, clear = true, after = 300 } = {}) {
      if (typeof spec === 'string') spec = { label: spec };
      const r = await target(spec);
      await moveTo(r.x, r.y);
      await sleep(150);
      await clickAt(r.x, r.y);
      await sleep(150);
      if (clear) await ev(`(() => { const el = __demo.find(${J(spec)}); el.focus(); el.select && el.select(); return true; })()`);
      if (clear) { await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); }
      for (const ch of text) {
        await tab.send('Input.insertText', { text: ch });
        await sleep(1000 / cps * (0.6 + Math.random() * 0.8));
      }
      await sleep(after);
    },
    // key-by-key typing, for date fields (which ignore inserted text)
    async keys(spec, text, { cps = 9, after = 300 } = {}) {
      if (typeof spec === 'string') spec = { label: spec };
      const r = await target(spec);
      await moveTo(r.x, r.y); await sleep(150);
      // click the field's left edge so typing starts at its first segment
      const left = await ev(`(() => { const r = __demo.find(${J(spec)}).getBoundingClientRect(); return r.left + 18; })()`);
      await clickAt(left, r.y); await sleep(200);
      for (const ch of text) {
        const code = /\d/.test(ch) ? 'Digit' + ch : undefined;
        await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, windowsVirtualKeyCode: ch.charCodeAt(0) });
        await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: ch.charCodeAt(0) });
        await sleep(1000 / cps);
      }
      await sleep(after);
    },
    // set a <select> or date input the way a person would see it change (no typing animation)
    async choose(spec, value, { after = 500 } = {}) {
      if (typeof spec === 'string') spec = { label: spec };
      const r = await target(spec);
      await moveTo(r.x, r.y); await sleep(200); await clickAt(r.x, r.y); await sleep(250);
      const ok = await ev(`(() => { const el = __demo.find(${J(spec)}); if (!el) return 'no element';
        if (el.tagName === 'SELECT') { const want = ${J(value)}.toLowerCase();
          const o = [...el.options].find((o) => o.text.toLowerCase().includes(want) || o.value.toLowerCase() === want);
          if (!o) return 'no option ' + ${J(value)} + ' in ' + [...el.options].map((o) => o.text).join(' | ');
          el.value = o.value; } else { el.value = ${J(value)}; }
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); return true; })()`);
      if (ok !== true) throw new Error('choose: ' + ok);
      await sleep(after);
    },
    async key(key, code = key, vk) {
      const kc = vk || { Enter: 13, Escape: 27, Tab: 9 }[key];
      await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: kc, text: key === 'Enter' ? '\r' : undefined });
      if (key === 'Enter') await tab.send('Input.dispatchKeyEvent', { type: 'char', key, code, text: '\r', windowsVirtualKeyCode: kc });
      await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc });
    },
    async caption(title, sub, ms = 5000) { await ev(`__demo.caption(${J(title)}, ${J(sub)}, ${Number(ms)}); true`); },
    async scrollBy(dy, ms = 900) { await ev(`window.scrollBy({ top: ${dy}, behavior: 'smooth' }); true`); await sleep(ms); },
    async scrollTo(spec, block = 'start', ms = 900) {
      if (typeof spec === 'string') spec = { text: spec };
      await waitFor(spec);
      await ev(`(() => { const el = __demo.find(${J(spec)}); const y = el.getBoundingClientRect().top + scrollY - ${block === 'start' ? 110 : 'innerHeight / 2'}; window.scrollTo({ top: y, behavior: 'smooth' }); return true; })()`);
      await sleep(ms);
    },
    async text(spec) { if (typeof spec === 'string') spec = { text: spec }; return ev(`(() => { const el = __demo.find(${J(spec)}); return el ? __demo.textOf(el) : null; })()`); },
    async pageHas(str) { return ev(`document.body.innerText.includes(${J(str)})`); },
    async login(user, pass = 'demo1234') {
      await api.goto('/login.html');
      await api.type({ sel: '#l-user' }, user, { cps: 12 });
      await api.type({ sel: '#l-pass' }, pass, { cps: 18 });
      await api.click({ sel: '#login-form button[type=submit]' }, { after: 300 });
      // wait for the console to load and finish its first render
      const t0 = Date.now();
      while (Date.now() - t0 < 10000) {
        const ok = await ev(`location.pathname.includes('/pages/') && document.readyState === 'complete' && !!document.querySelector('#nav a') && !!document.querySelector('#view *')`).catch(() => false);
        if (ok) break;
        await sleep(150);
      }
      await sleep(1200);
    },
    async signout() { await api.click({ sel: '#signout' }, { after: 1200 }); },
  };
  return api;
}

// What is on screen: every visible control with how to reach it.
export async function probe(tab) {
  return tab.eval(`(() => {
    const out = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const el of document.querySelectorAll('#view input, #view select, #view textarea, #view button, #view a, #view [role=button], dialog input, dialog button, dialog select, dialog textarea, .modal button, .modal input, .modal select, .modal textarea, #nav a')) {
      if (!vis(el) && el.tagName !== 'SELECT') continue;
      const lab = el.labels && el.labels[0] ? el.labels[0].innerText.trim().replace(/\\s+/g, ' ') : '';
      out.push([el.tagName.toLowerCase(), el.id && '#' + el.id, el.name && 'name=' + el.name, el.type && el.tagName === 'INPUT' ? 'type=' + el.type : '',
        lab && 'label=' + lab.slice(0, 40), (el.innerText || el.placeholder || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 50)].filter(Boolean).join(' '));
    }
    return location.pathname + location.search + '\\n' + out.join('\\n');
  })()`);
}
