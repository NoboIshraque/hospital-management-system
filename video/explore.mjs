// Development aid: run a few steps without recording, then print the controls on screen and
// save a screenshot to out/explore.png.   node explore.mjs "<js using d>"
import { session, probe, HERE } from './demo.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const steps = process.argv[2] || '';
const { tab, d, close } = await session({ headless: true });
try {
  const fn = new Function('d', `return (async () => { ${steps} })()`);
  try { await fn(d); } catch (e) { console.log('STEP FAILED:', e.message); }
  await d.pause(800);
  console.log(await probe(tab));
  mkdirSync(path.join(HERE, 'out'), { recursive: true });
  const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(HERE, 'out', 'explore.png'), Buffer.from(data, 'base64'));
} finally { await close(); }
