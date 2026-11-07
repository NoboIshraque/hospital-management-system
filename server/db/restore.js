/* ============================================================
   npm run db:restore -- <backup file>

   Puts the database back to the moment a backup was taken.

   1. Takes a safety backup of the database as it is NOW (…-before-restore),
      so a restore of the wrong file can itself be undone.
   2. Runs the backup file through the mysql client. The file starts with
      DROP DATABASE, so everything since the backup is replaced.
   3. Runs grants.sql again: the uhid_app user and its rights live in
      MySQL's own tables, not in the uhid database, so the dump does not
      carry them — and every procedure the server calls needs its grant.

   With no file named, it lists the backups there are.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { tool, withCredentials, run } = require('./mysql-tools');
const { backup, BACKUP_DIR } = require('./backup');
const { connect, runFile } = require('./run-sql');
const { appPassword } = require('./app-password');

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    const list = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')).sort() : [];
    console.log(list.length ? 'Backups:\n' + list.map(f => '  ' + f).join('\n') +
      '\n\nRestore one with:  npm run db:restore -- <file name>' : 'No backups yet. Make one with  npm run db:backup');
    return;
  }
  const file = fs.existsSync(arg) ? arg : path.join(BACKUP_DIR, arg);
  if (!fs.existsSync(file)) throw new Error(`No such backup: ${arg}`);
  const head = fs.readFileSync(file, 'utf8').slice(0, 4000);
  if (!/MySQL dump/.test(head) || !/CREATE DATABASE/.test(head)) {
    throw new Error('That file is not a database backup made by npm run db:backup.');
  }

  const safety = await backup('before-restore');
  console.log(`  safety copy of the current database: ${path.basename(safety.file)}`);

  await withCredentials(cnf => run(tool('mysql'), [`--defaults-extra-file=${cnf}`, '--default-character-set=utf8mb4'],
    { stdinFile: file }));
  console.log(`  restored ${path.basename(file)}`);

  const conn = await connect();
  try {
    await conn.query('SET @uhid_app_password = ?', [appPassword()]);
    await runFile(conn, path.join(__dirname, '..', '..', 'database', 'grants.sql'), { quiet: true });
    const [[c]] = await conn.query(`SELECT (SELECT COUNT(*) FROM uhid.patient) AS patients,
      (SELECT COUNT(*) FROM uhid.encounter) AS encounters, (SELECT COUNT(*) FROM uhid.user_account) AS accounts`);
    console.log(`  grants re-applied\n\nRestored: ${c.patients} patients, ${c.encounters} encounters, ${c.accounts} accounts.`);
  } finally { await conn.end(); }
})().catch(e => { console.error('Restore FAILED — ' + e.message); process.exit(1); });
