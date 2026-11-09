// Smoke test for the recorder: a few seconds of the landing page, scrolled, saved to video/out/test.webm.
import { launch, openTab, startRecorder, fitViewport, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://localhost:3000';
const headless = !process.argv.includes('--headed');
const { conn, close } = await launch({ profileDir: path.join(process.env.TEMP, 'uhid-video-profile'), headless, scale: 1.25 });
try {
  const demo = await openTab(conn, null, { width: 1536, height: 864 });
  await demo.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await demo.goto(ORIGIN + '/');
  await fitViewport(conn, demo, 1536, 864);
  console.log('viewport:', await demo.eval('[innerWidth, innerHeight, devicePixelRatio]'));
  const rec = await startRecorder(conn, ORIGIN);
  console.log('capture:', rec.settings.width, rec.settings.height);
  await rec.start();
  await sleep(1500);
  for (let i = 0; i < 8; i++) { await demo.eval('window.scrollBy({ top: 120, behavior: "smooth" })'); await sleep(500); }
  const n = await rec.stop(path.join(here, 'out', 'test.webm'));
  console.log('saved bytes:', n);
  await rec.end();
} finally { await close(); }
