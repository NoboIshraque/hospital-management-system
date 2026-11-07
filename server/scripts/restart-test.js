/* ============================================================
   npm run restart:test — a session survives a server restart (checklist I6).

   Starts the app, signs in, stops the app completely, starts a fresh copy
   in a NEW Node process, and asks /api/me with the same cookie. With the
   old in-memory store the answer was 401; with web_session it is 200.
   ============================================================ */

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3999;
const base = `http://127.0.0.1:${PORT}`;

function start() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'app.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The server did not start.')), 15000);
    const ready = async () => {
      try { await fetch(base + '/api/config'); clearTimeout(t); resolve(child); }
      catch { setTimeout(ready, 200); }
    };
    ready();
    child.on('exit', code => { clearTimeout(t); reject(new Error(`The server exited (${code}).`)); });
  });
}

const stop = child => new Promise(r => { child.removeAllListeners('exit'); child.once('exit', r); child.kill(); });

(async () => {
  let server = await start();
  const login = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: 'rezaul', password: 'demo1234' })
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  console.log(`Signed in as rezaul: ${login.status}`);
  await stop(server);
  console.log('Server stopped. Starting a new process…');

  server = await start();
  const me = await fetch(base + '/api/me', { headers: { Cookie: cookie } });
  await stop(server);
  const ok = me.status === 200;
  console.log(ok ? '✓ Still signed in after the restart (the session is in MySQL).'
                 : `✗ Signed out by the restart: /api/me answered ${me.status}.`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(1); });
