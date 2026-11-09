// Records the demo video, one clip per scene, into video/out/clips/.
//
//   node record.mjs                 every scene, recorded (reset the database first: npm run db:reset,
//                                   then restart npm start)
//   node record.mjs --dry s01 s02   only those scenes, not recorded; checkpoint screenshots go to
//                                   video/out/shots/ so a scene can be checked before filming it
//
// Chrome runs headless, so nothing appears on the desktop and nothing else on the screen can get
// into the video.
import { session, probe, HERE, W, H } from './demo.mjs';
import { fitViewport } from './cdp.mjs';
import { scenes as fullScenes } from './scenes.mjs';
import { scenes as shortScenes } from './scenes-short.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const want = args.filter((a) => !a.startsWith('--'));
const short = args.includes('--short');            // the 2-minute cut (scenes-short.mjs)
const scenes = short ? shortScenes : fullScenes;
const chosen = want.length ? scenes.filter((s) => want.some((w) => s.id.startsWith(w))) : scenes;
const clipDir = path.join(HERE, 'out', short ? 'clips-short' : 'clips'), shotDir = path.join(HERE, 'out', 'shots');
mkdirSync(clipDir, { recursive: true }); mkdirSync(shotDir, { recursive: true });

const { conn, tab, d, close, recorder } = await session({ headless: !args.includes('--headed') });
const rec = dry ? null : await recorder();
// Capturing a tab makes Chrome show its "sharing this tab" bar, which takes height from the page;
// fit the window again so the page is 1536 x 864 (1920 x 1080 in the video) while it is filmed.
if (rec) { await fitViewport(conn, tab, W, H); console.log('viewport', await tab.eval('[innerWidth, innerHeight]')); }
const log = [];
try {
  for (const s of chosen) {
    const shot = async (name) => {
      if (!dry) return;
      const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(shotDir, `${s.id}-${name}.png`), Buffer.from(data, 'base64'));
    };
    process.stdout.write(`${s.id} … `);
    if (s.pace) d.setPace(s.pace);
    if (s.setup) await s.setup(d);
    const t0 = Date.now();
    if (rec) await rec.start();
    try {
      if (s.caption) await d.caption(s.caption[0], s.caption[1], s.captionMs || 5500);
      await s.run(d, shot);
    } catch (e) {
      console.log('FAILED: ' + e.message);
      const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(shotDir, `${s.id}-FAILED.png`), Buffer.from(data, 'base64'));
      console.log(await probe(tab));
      if (rec) await rec.stop(path.join(clipDir, `${s.id}-FAILED.webm`));
      process.exitCode = 1;
      break;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (rec) {
      const bytes = await rec.stop(path.join(clipDir, `${s.id}.webm`));
      console.log(`${secs}s, ${(bytes / 1e6).toFixed(1)} MB`);
    } else console.log(`${secs}s (dry)`);
    log.push({ id: s.id, title: s.title, seconds: Number(secs) });
  }
} finally {
  if (rec) await rec.end().catch(() => {});
  await close();
  if (!dry && log.length) writeFileSync(path.join(clipDir, 'clips.json'), JSON.stringify(log, null, 2));
}
