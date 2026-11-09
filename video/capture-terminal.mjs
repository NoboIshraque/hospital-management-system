// Runs the three console parts of the demo for real and saves their output to video/out/term/,
// which the terminal scenes (s05, s14) play back in video/terminal.html:
//   race.txt    npm run race            (two receptionists, one slot; two admissions, one bed)
//   sql.txt     the mysql client, as root, running four statements the database must refuse
//   dbtest.txt  npm run db:test         (309 tests)
// npm run race leaves discharged stays behind and db:test rebuilds the database, so run this
// BEFORE npm run db:reset and the recording.   node capture-terminal.mjs
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { HERE } from './demo.mjs';

const SERVER = path.join(HERE, '..', 'server');
const OUT = path.join(HERE, 'out', 'term');
mkdirSync(OUT, { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: SERVER, encoding: 'utf8', shell: process.platform === 'win32', ...opts });

console.log('race …');
let r = sh(npm, ['run', '--silent', 'race']);
writeFileSync(path.join(OUT, 'race.txt'), r.stdout + r.stderr);

console.log('mysql …');
writeFileSync(path.join(OUT, 'session.sql'), [
  "UPDATE bed SET status_id = 1 WHERE bed_no = 'GM-01';",
  'DELETE FROM access_log WHERE log_id = 1;',
  "INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency) VALUES (10, 9, 15, '1 capsule', 'three times daily');",
  "INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id) VALUES ('BD-2026-70413-4', 'X', '2000-01-01', 'Male', CURDATE(), 1);",
].join('\n') + '\n');
const require = createRequire(path.join(SERVER, 'package.json'));
require('dotenv').config({ path: path.join(SERVER, '.env') });
const { tool, withCredentials } = require('./db/mysql-tools');
await withCredentials(async (cnf) => {
  const m = spawnSync(tool('mysql'), ['--defaults-extra-file=' + cnf, '--force', '-vvv', '--table', 'uhid'],
    { input: readFileSync(path.join(OUT, 'session.sql')), encoding: 'utf8' });
  writeFileSync(path.join(OUT, 'sql.txt'), m.stdout + '\n---STDERR---\n' + m.stderr);
});

console.log('db:test …');
r = sh(npm, ['run', 'db:test']);
writeFileSync(path.join(OUT, 'dbtest.txt'), r.stdout + r.stderr);
const pass = (r.stdout.match(/'PASS'/g) || []).length, fail = (r.stdout.match(/'FAIL'/g) || []).length;
console.log(`done: ${pass} PASS, ${fail} FAIL`);
