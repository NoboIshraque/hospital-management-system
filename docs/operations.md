# Operations — running UHID for real

Everything a hospital network needs to run this system, apart from the hosting itself. Written
7 November 2026 (checklist section I). Each section names the command, what it does, and why.

## 1. A new installation

```
cd server
npm ci
copy .env.example .env          (then edit it: SESSION_SECRET, DB_*; remove DEMO_MODE)
npm run db:install -- --admin <username>
npm start
```

`db:install` builds the database from `schema → triggers → procedures → views → reference →
grants` — **not** `seed.sql`, which is the demo. `reference.sql` holds what every installation
needs: the 64 districts, hospital kinds, departments, the six roles and their permissions, and the
clinical catalogues. The script creates **one** account, the first system administrator, and prints
its one-time password once. Everything else is done in the app:

1. The administrator signs in and is made to choose their own password.
2. **Hospital setup → Hospitals**: add each hospital.
3. **Staff accounts**: create each hospital's administrator.
4. Each hospital admin, on **Hospital setup**: post doctors (by BMDC number), set fees, add weekly
   sessions and leave, add wards and beds; on **Staff accounts**: create reception, doctor and lab
   accounts.
5. Reception registers patients and gives them a portal login.

`npm run first-day:test` does all of this automatically against an empty install, books a patient,
and restores the database that was there before. It is the proof that nobody needs to edit SQL.

`db:install` refuses to touch an existing `uhid` database. `--replace` replaces it, after backing
it up.

## 2. Secrets

| Where | What | Read by |
|---|---|---|
| `server/.env` | `SESSION_SECRET`, `APP_DB_USER` / `APP_DB_PASSWORD` (uhid_app), `DB_HOST`/`DB_PORT`/`DB_NAME`, `COOKIE_SECURE`, `NODE_ENV` | the running site |
| `server/.env.admin` | `DB_USER` / `DB_PASSWORD` — MySQL root | the database scripts only |

Both are git-ignored. On a development laptop root's login may sit in `.env`; the site prints a note.
With `NODE_ENV=production` the site **refuses to start** while `DB_PASSWORD` is in `.env`: the running
site connects as `uhid_app`, which can only run the procedures and read the views, and it must not be
able to read root's password either. On a server, keep `.env.admin` only while you run a database
script, or keep the scripts on a different machine.

## 3. Backups

```
npm run db:backup                       → backups/uhid-YYYY-MM-DD-HHMMSS.sql
npm run db:restore                      → lists the backups
npm run db:restore -- <file name>       → puts the database back to that moment
```

- `mysqldump --single-transaction`: one consistent snapshot while the hospitals keep working.
  The file holds every table, row, trigger, procedure and view.
- `backups/` is git-ignored: a backup is patient data.
- Restore first saves the current database (`…-before-restore.sql`), so restoring the wrong file
  can be undone; then it re-applies `grants.sql`, because uhid_app's rights live in MySQL's own
  tables, not in the dump.
- Root's password goes to `mysqldump` in a temporary option file readable only by this user, never
  on the command line where other programs could see it.
- **Tested:** `npm run first-day:test` backs up, installs an empty network over it, and restores —
  18 patients, 24 encounters and 17 accounts come back.
- Copy the files somewhere other than the server's disk (another machine, encrypted storage). A
  backup on the disk that failed is not a backup.

## 4. Keeping it running

| | |
|---|---|
| **Health** | `GET /api/health` → `200 {status:'ok', database:'up'}`, or `503` when MySQL does not answer. Point a monitor at it. |
| **Request log** | One line per request in `logs/requests-YYYY-MM-DD.log`: time, method, path, status, milliseconds, account id. UHIDs in paths are masked, query strings and bodies are never written — who read which record is in MySQL's `access_log`, not here. `REQUEST_LOG=file` keeps it off the console, `off` turns it off. |
| **Clean shutdown** | Ctrl+C, a service stop, or a `shutdown` message: new requests are refused, requests in progress finish, the database connections close, then the process exits. `npm run shutdown:test` proves it. |
| **Restart** | Sessions are in MySQL (`web_session`), so a restart signs nobody out. `npm run restart:test` proves it. |
| **At boot (Windows)** | `server/scripts/windows-tasks.ps1`, run once in an administrator PowerShell, registers *UHID server* (at start-up, restarted if it stops, `NODE_ENV=production`) and *UHID nightly backup* (02:00). |
| **At boot (Linux)** | a systemd unit: `ExecStart=/usr/bin/node /srv/uhid/server/app.js`, `WorkingDirectory=/srv/uhid/server`, `Environment=NODE_ENV=production`, `Restart=always`, `KillSignal=SIGTERM`. |

## 5. Hosting — the one step left

Everything above runs on this laptop. Putting it on a public address needs:

1. A server (a VPS) with MySQL 8.4 and Node 24, and a domain name pointing at it.
2. HTTPS: a reverse proxy (Caddy or nginx) in front of the site, with a certificate (Let's Encrypt).
   The site keeps listening on 127.0.0.1:3000; only the proxy faces the internet. Then set
   `COOKIE_SECURE=1` (secure cookies and HSTS) and tell Express how many proxies to trust
   (`app.set('trust proxy', 1)` in `app.js`, so the login limiter and the access log see the real
   client address).
3. `db:install` there (not `db:reset`), no `DEMO_MODE`, root's password only in `.env.admin`.
4. The nightly backup copied off the machine.
