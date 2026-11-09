// The recording harness for the demo video.
//
// It starts Chrome with its DevTools port open, drives the demo tab through the DevTools
// protocol (clicks, typing, scrolling, the same events a mouse and keyboard send), and records
// that tab with Chrome's own tab capture (getDisplayMedia + MediaRecorder, run in a second,
// hidden tab). Nothing controls the desktop, so no screen overlay can end up in the video.
//
// Used by video/record.mjs. Needs Node 22+ (global WebSocket) and Google Chrome.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- one DevTools websocket connection, with sessions for each tab ----
class Conn {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message + ' ' + (msg.error.data || ''))) : resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn) { this.handlers.push(fn); }
}

export async function launch({ profileDir, headless = true, width = 1920, height = 1080, scale = 1 }) {
  mkdirSync(path.join(profileDir, 'Default'), { recursive: true });
  // No password manager: its save / breach prompts ("demo1234 was found in a data breach") are
  // browser windows that, in headless Chrome, silently swallow every mouse event sent to the page.
  writeFileSync(path.join(profileDir, 'Default', 'Preferences'), JSON.stringify({
    credentials_enable_service: false, credentials_enable_autosignin: false,
    profile: { password_manager_enabled: false, password_manager_leak_detection: false },
    autofill: { profile_enabled: false, credit_card_enabled: false },
  }));
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`,
    '--auto-select-tab-capture-source-by-title=UHID',
    '--lang=en-GB', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--hide-scrollbars', '--mute-audio',
    '--disable-features=Translate,MediaRouter,OptimizationHints,PasswordLeakDetection,PasswordManagerOnboarding,AutofillServerCommunication',
    '--password-store=basic', '--disable-save-password-bubble',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 50 && !info; i++) {
    await sleep(200);
    try { info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch {}
  }
  if (!info) throw new Error('Chrome did not open its DevTools port');
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const conn = new Conn(ws);
  return { conn, proc, close: async () => { try { await conn.send('Browser.close'); } catch {} proc.kill(); } };
}

// A tab: navigate, evaluate, and send real input events.
export async function openTab(conn, url, { width, height, newWindow = true } = {}) {
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank', newWindow, width, height });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => conn.send(m, p, sessionId);
  await s('Page.enable'); await s('Runtime.enable');
  await s('Page.setBypassCSP', { enabled: true });
  const tab = {
    targetId, sessionId, send: s,
    async goto(u) {
      const loaded = new Promise((res) => {
        const h = (msg) => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { res(); } };
        conn.on(h);
      });
      await s('Page.navigate', { url: u });
      await loaded;
    },
    async eval(expr, { gesture = false } = {}) {
      const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: gesture });
      if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
  };
  if (url) await tab.goto(url);
  return tab;
}

// Make the tab's viewport w x h CSS pixels (Chrome runs at --force-device-scale-factor, so at 1.25
// that is 1920 x 1080 device pixels). At a fractional scale the window size rounds, so a few sizes
// round the estimate are tried, and a viewport within 3 px is accepted: the recorder scales the
// capture to exactly 1920 x 1080, and a 2 px difference is invisible. (Emulating the viewport
// instead does not work: tab capture records the real window, not the emulated one.)
export async function fitViewport(conn, tab, w, h) {
  const { windowId } = await conn.send('Browser.getWindowForTarget', { targetId: tab.targetId });
  const size = () => tab.eval('[innerWidth, innerHeight]');
  let best = null;
  for (let round = 0; round < 3; round++) {
    const [iw, ih] = await size();
    const err = Math.abs(iw - w) + Math.abs(ih - h);
    if (!best || err < best.err) best = { err, iw, ih };
    if (err === 0) return [iw, ih];
    const { bounds } = await conn.send('Browser.getWindowBounds', { windowId });
    await conn.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + w - iw, height: bounds.height + h - ih } });
    await sleep(300);
  }
  const [iw, ih] = await size();
  if (Math.abs(iw - w) <= 3 && Math.abs(ih - h) <= 3) return [iw, ih];
  throw new Error('viewport is ' + iw + 'x' + ih + ', wanted ' + w + 'x' + h);
}

// ---- the recorder: a second tab that captures the demo tab by its title ----
export async function startRecorder(conn, origin) {
  const rec = await openTab(conn, origin + '/__recorder__', { width: 400, height: 300 });
  await rec.eval(`document.title = 'recorder'`);
  await rec.eval(`(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false, selfBrowserSurface: 'exclude', preferCurrentTab: false });
    window.__chunks = [];
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    mr.ondataavailable = (e) => { if (e.data.size) window.__chunks.push(e.data); };
    window.__mr = mr; window.__stream = stream;
    window.__settings = stream.getVideoTracks()[0].getSettings();
    return true;
  })()`, { gesture: true });
  const settings = await rec.eval('window.__settings');
  return {
    settings,
    async start() { await rec.eval(`window.__chunks = []; window.__mr.start(1000); true`); },
    async stop(file) {
      await rec.eval(`new Promise((r) => { window.__mr.onstop = r; window.__mr.stop(); })`);
      await rec.eval(`(async () => { window.__blob = new Blob(window.__chunks, { type: 'video/webm' }); window.__buf = new Uint8Array(await window.__blob.arrayBuffer()); return window.__buf.length; })()`);
      const len = await rec.eval('window.__buf.length');
      const parts = [];
      const CH = 4 * 1024 * 1024;
      for (let off = 0; off < len; off += CH) {
        const b64 = await rec.eval(`(() => { const s = window.__buf.subarray(${off}, ${off + CH}); let bin = ''; for (let i = 0; i < s.length; i += 0x8000) bin += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000)); return btoa(bin); })()`);
        parts.push(Buffer.from(b64, 'base64'));
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, Buffer.concat(parts));
      return len;
    },
    async end() { await rec.eval(`window.__stream.getTracks().forEach((t) => t.stop()); true`); },
  };
}
