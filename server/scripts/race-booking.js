/* ============================================================
   npm run race — decision 4, demonstrated through the real API.

   Two receptionists at two different hospitals — Rezaul at Dhaka
   Medical and Jahanara at Chattogram — try to book the SAME slot with
   the SAME doctor at the SAME instant, for two different patients.
   Each round must end with exactly one booking and one polite refusal.

   What makes it safe is in the database, not here: book_appointment()
   locks the doctor's row (SELECT … FOR UPDATE), so the second request
   waits, then sees the first booking; and UNIQUE(doctor_id, active_slot)
   would refuse a second row even if the lock were missing.

   The script starts the server inside this process, so it needs no
   other window. It cancels each winning booking afterwards, so the
   database is left as it was.
   ============================================================ */

const ROUNDS = 5;

async function main() {
  const app = require('../app');
  const { pool } = require('../db/pool');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function signIn(username) {
    const res = await fetch(base + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'demo1234' })
    });
    if (!res.ok) throw new Error(`Could not sign in as ${username}. Has npm run db:reset been run?`);
    const cookie = res.headers.get('set-cookie').split(';')[0];
    return (method, url, body) => fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined
    }).then(async r => ({ status: r.status, body: await r.json() }));
  }

  const rezaul = await signIn('rezaul');
  const jahanara = await signIn('jahanara');

  const grid = await fetch(base + '/api/doctors/1/availability?days=14').then(r => r.json());
  const free = grid.flatMap(d => d.slots.map(s => ({ ...s, label: d.label }))).filter(s => !s.taken);
  if (free.length < ROUNDS) throw new Error('Not enough free slots for Dr. Anisur Rahman in the next 14 days.');

  console.log('Dr. Anisur Rahman, Dhaka Medical College Hospital — two receptionists, one slot, same instant.\n');
  let correct = 0;

  for (let i = 0; i < ROUNDS; i++) {
    const slot = free[i];
    const t0 = Date.now();
    const [a, b] = await Promise.all([
      rezaul('POST', '/api/appointments', { postingId: 1, uhid: 'BD-2020-27615-1', slotStart: slot.start }),
      jahanara('POST', '/api/appointments', { postingId: 1, uhid: 'BD-2021-11904-5', slotStart: slot.start })
    ]);
    const ms = Date.now() - t0;
    const winners = [a, b].filter(r => r.status === 201);
    const losers = [a, b].filter(r => r.status === 409);
    const ok = winners.length === 1 && losers.length === 1;
    if (ok) correct++;

    const who = a.status === 201 ? 'Rezaul (for Shirin Akter)' : 'Jahanara (for Fatema Begum)';
    console.log(`Round ${i + 1}  ${slot.label} ${slot.time}  (${ms} ms)`);
    console.log(`  booked:   ${winners.length ? who : 'nobody'}`);
    console.log(`  refused:  ${losers.length ? losers[0].body.error : 'nobody'}`);
    console.log(`  ${ok ? '✓ exactly one booking' : '✗ WRONG: ' + JSON.stringify([a, b])}\n`);

    for (const w of winners) await rezaul('DELETE', `/api/appointments/${w.body.appointmentId}`);
  }

  console.log(`${correct} of ${ROUNDS} rounds ended with exactly one booking.`);
  server.close();
  await pool.end();
  if (correct !== ROUNDS) process.exit(1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
