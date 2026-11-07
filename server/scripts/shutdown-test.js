/* npm run shutdown:test — the server stops cleanly (checklist I9).
   Starts app.js, sends a request that is still running when the stop
   arrives, and checks: the request is answered, the process exits 0, and
   it said "Stopped cleanly". */
const { fork } = require('child_process');
const path = require('path');
const PORT = 3998;
const child = fork(path.join(__dirname, '..', 'app.js'), [], { env: { ...process.env, PORT: String(PORT), REQUEST_LOG: 'file' }, silent: true });
let out = '';
child.stdout.on('data', d => { out += d; });
child.stderr.on('data', d => { out += d; });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 50 && !/running at/.test(out); i++) await wait(200);
  const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
  // A request that is being worked on when the stop arrives: the doctor
  // list computes a fortnight of availability. 30 ms in, it has reached the
  // server and is running.
  const inFlight = fetch(`http://127.0.0.1:${PORT}/api/doctors`).then(r => r.status);
  await wait(30);
  child.send('shutdown');
  const status = await inFlight;
  const code = await new Promise(r => child.once('exit', r));
  const ok = health.status === 'ok' && status === 200 && code === 0 && /Stopped cleanly/.test(out);
  console.log(`health ${health.status} · in-flight request answered ${status} · exit code ${code} · ${/Stopped cleanly/.test(out) ? 'stopped cleanly' : 'did not say it stopped cleanly'}`);
  console.log(ok ? '✓ Clean shutdown.' : '✗ Not a clean shutdown.\n' + out);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); child.kill(); process.exit(1); });
