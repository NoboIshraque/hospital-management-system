/* ============================================================
   The mysql and mysqldump command-line programs, for backup and restore.

   mysqldump writes a database out as SQL that rebuilds it exactly —
   tables, rows, triggers, procedures, views. mysql runs such a file back.
   Both come with MySQL (C:\Program Files\MySQL\MySQL Server 8.4\bin).

   The root password must never appear on a command line (any program on
   the machine can read another's command line). So it goes into a
   temporary option file, readable only by this user, that the programs
   read with --defaults-extra-file, and the file is deleted straight after.
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
// Root's login may live in .env.admin, away from the running site (I10).
// Loaded first: dotenv never overwrites a value already set.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.admin') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CANDIDATES = [
  process.env.MYSQL_BIN,
  'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin',
  '/usr/bin', '/usr/local/bin', '/usr/local/mysql/bin'
].filter(Boolean);

/* Where mysql.exe / mysqldump live: MYSQL_BIN in .env, the usual MySQL 8.4
   folder, or else whatever is on PATH. */
function tool(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  for (const dir of CANDIDATES) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  return exe;
}

/* Run fn(optionFilePath), with the root credentials in a temporary file. */
async function withCredentials(fn) {
  if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
    throw new Error('DB_USER / DB_PASSWORD (the MySQL root login) are missing from server/.env.admin and server/.env.');
  }
  const q = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const file = path.join(os.tmpdir(), `uhid-${crypto.randomBytes(8).toString('hex')}.cnf`);
  fs.writeFileSync(file, `[client]\nuser=${q(process.env.DB_USER)}\npassword=${q(process.env.DB_PASSWORD)}\n` +
    `host=${q(process.env.DB_HOST || '127.0.0.1')}\nport=${Number(process.env.DB_PORT || 3306)}\n`, { mode: 0o600 });
  try { return await fn(file); }
  finally { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } }
}

/* Run a program; resolve when it exits 0, reject with its error output. */
function run(cmd, args, { stdinFile } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdinFile ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => reject(new Error(`Could not run ${cmd}: ${e.message}. Set MYSQL_BIN in server/.env to MySQL's bin folder.`)));
    child.on('exit', code => {
      // mysqldump warns on stderr even when it succeeds; only the exit code counts.
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} failed (exit ${code}): ${err.trim().split('\n').filter(l => !/Using a password/.test(l)).join(' ')}`));
    });
    if (stdinFile) fs.createReadStream(stdinFile).pipe(child.stdin);
  });
}

module.exports = { tool, withCredentials, run };
