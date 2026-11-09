// Pull still frames out of a recorded clip so it can be checked without playing it.
//   node frames.mjs out/clip.webm 1 4 8      -> out/frames/clip-1s.png, -4s, -8s, and the duration
import { launch, openTab } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, ...times] = process.argv.slice(2);
const abs = path.resolve(file);
const { conn, close } = await launch({ profileDir: path.join(process.env.TEMP, 'uhid-video-frames'), headless: true });
try {
  const tab = await openTab(conn, pathToFileURL(abs).href, { width: 800, height: 600 });
  await tab.eval(`(async () => {
    const v = document.querySelector('video'); v.pause(); v.muted = true; window.__v = v;
    if (v.readyState < 1) await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('cannot load video')); });
    if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((r) => (v.ontimeupdate = r)); v.ontimeupdate = null; }
    return true; })()`);
  const info = await tab.eval(`({ duration: __v.duration, w: __v.videoWidth, h: __v.videoHeight })`);
  console.log(info);
  mkdirSync(path.join(path.dirname(abs), 'frames'), { recursive: true });
  // Show the video at its own size, top-left, and screenshot the tab (a canvas from file:// is tainted).
  await tab.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  await tab.eval(`document.documentElement.style.cssText = 'margin:0;padding:0;overflow:hidden'; document.body.style.cssText = 'margin:0;padding:0;display:block'; Object.assign(__v.style, { position: 'fixed', top: '0', left: '0', width: '960px', height: '540px', maxWidth: 'none', maxHeight: 'none', margin: '0', objectFit: 'fill' }); __v.controls = false; true`);
  for (const t of times) {
    await tab.eval(`(async () => { __v.currentTime = ${Number(t)}; await new Promise((r) => (__v.onseeked = r)); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()`);
    const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
    const out = path.join(path.dirname(abs), 'frames', `${path.basename(abs, path.extname(abs))}-${t}s.png`);
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(out);
  }
} finally { await close(); }
