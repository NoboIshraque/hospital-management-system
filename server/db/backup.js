/* ============================================================
   npm run db:backup — a complete copy of the database, as one SQL file.

   Writes backups/uhid-YYYY-MM-DD-HHMMSS.sql at the top of the repository
   (git-ignored: a backup holds patient data and must never be committed).
   The file rebuilds the database exactly: tables and rows, triggers,
   procedures, functions and views. Restore it with npm run db:restore.

   --single-transaction: InnoDB gives mysqldump one consistent snapshot, so
   the hospital keeps working while the backup runs, and the copy is of one
   instant — never half of a booking.

   A real installation runs this every night (Windows Task Scheduler; see
   docs/operations.md) and keeps the files somewhere other than this disk.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { tool, withCredentials, run } = require('./mysql-tools');

const DIR = path.join(__dirname, '..', '..', 'backups');
const DB = process.env.DB_NAME || 'uhid';

async function backup(label = '') {
  fs.mkdirSync(DIR, { recursive: true });
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const file = path.join(DIR, `${DB}-${stamp}${label ? '-' + label : ''}.sql`);
  await withCredentials(cnf => run(tool('mysqldump'), [
    `--defaults-extra-file=${cnf}`,          // must come first
    '--single-transaction', '--routines', '--triggers', '--events',
    '--add-drop-database', '--set-gtid-purged=OFF', '--no-tablespaces',
    '--default-character-set=utf8mb4',
    `--result-file=${file}`,
    '--databases', DB
  ]));
  const size = fs.statSync(file).size;
  if (size < 1000) throw new Error(`The backup file is only ${size} bytes; something went wrong.`);
  return { file, size };
}

module.exports = { backup, BACKUP_DIR: DIR };

if (require.main === module) {
  backup()
    .then(({ file, size }) => console.log(`Backup written: ${file} (${(size / 1024).toFixed(0)} KB)`))
    .catch(e => { console.error('Backup FAILED — ' + e.message); process.exit(1); });
}
