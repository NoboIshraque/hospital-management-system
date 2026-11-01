# Handover — where the project stands

Written 1 November 2026, at the end of the session that took the project from "schema only" to a
running system. Read this first in the next session, then `CLAUDE.md`.

## In one paragraph

Every item in `CHECKLIST.md` is done, verified, committed and pushed (last commit `d1574fb`).
The database, the Express API, the frontend wired to the API, the documentation, the viva demo
script and the three learning guides all exist and are tested. Item 1 below (the ER document and
diagrams lagging the schema) was **finished on 1 November 2026**. **Three things are still not
done**: some features have no screen; Abir and Noria have not started their guides; and the
laptop is short of memory. Details below.

---

## What exists and how it was verified

| Part | Where | Verified by |
|---|---|---|
| Database: 40 tables, 21 triggers, 28 procedures + 4 functions, 8 views | `database/schema.sql` … `views.sql` | `npm run db:test` — 72 tests, all pass |
| Sample data: 8 hospitals, 11 doctors, 18 patients | `database/seed.sql` | loads clean in `npm run db:reset` |
| Least-privilege app user `uhid_app` | `database/grants.sql` | denied SELECT on `patient`, UPDATE on `bed`, DELETE/TRUNCATE on `access_log` |
| 20 demonstration queries | `database/queries.sql` | all run and return sensible rows |
| Express API, 28 endpoints | `server/`, reference in `docs/api.md` | `npm run api:test` — 64 checks, all pass |
| Booking under concurrency | `server/scripts/race-booking.js` | `npm run race` — 5 of 5 rounds, exactly one booking each |
| Frontend on the API (and offline on sample data) | `public/`, switch in `public/js/api.js` | 25-step headless browser test, no JavaScript errors; all 21 standalone screens captured with no errors |
| Print stylesheet, 404 page | `public/css/responsive.css`, `public/404.html` | rendered in headless Edge |
| Documentation | `docs/use-cases.md`, `data-dictionary.md`, `normalization.md`, `api.md`, `demo-script.md` | — |
| Learning guides | `docs/guides/nobo.md`, `abir.md`, `noria.md` | every code block run against the real database and its output copied in |
| Frontend report for submission | Claude Docs: https://claude.ai/artifact/C8xcUhqZniSFzf6ipK8XFh | 25 screenshots, 34 file snippets; export via the doc's name → Export → PDF or Word |

The browser test and screenshot scripts lived in a temporary folder and are **not** in the repo.
`npm run api:test` and `npm run db:test` are the committed checks.

---

## What is NOT done — the next session's work

### 1. ~~The ER document and diagrams no longer matched the schema~~ — done 1 November 2026

Building the procedures led to six changes that `docs/er-design.md` and the Chen diagrams did
not show. All six are now in both:

| Change | `er-design.md` | Chen diagrams (both files) |
| --- | --- | --- |
| New table `uhid_sequence (year, last_serial)` | §4.2 entity table, and the UHID-issuing paragraph | Page 4: a stand-alone entity, top right, with a note that it has no relationship |
| `medicine.drug_class` | §4.3 entity table, and the catalogue-rule paragraph | Page 2: attribute of `medicine` |
| `user_account.staff_name` | §4.2 entity table and role table, with why it is not a copy of the patient's or doctor's name | Page 4: attribute of `user_account` |
| `appointment.active_slot` and `UNIQUE(doctor_id, active_slot)` | §1 decision 4, §4.4 entity table, and the unique-constraint section | Page 3: a derived attribute (dashed ellipse in the ellipse version) |
| `referral.to_department_id` | §4.5 entity table, §4.5 diagram, §5 relationship table | Page 5: a `department` entity joined to `refers` with "N (dept)" |
| Access-log trigger refuses pre-reviewed rows, instead of "flagging" after insert | §4.5 | — (triggers are not drawn) |

Also corrected in `er-design.md`: `book_appointment()` locks the doctor's row, not the
posting's, and its overlap check is a locking read (§4.4). §7 says both phases are built. §8.2 is
new: the six changes, each with its reason, as the original decisions in §8.1 are recorded. §9
is all done.

**How it was checked.** The diagrams were edited as XML, since draw.io could not be run here:
every new shape was placed by measured free space (at least 40 px from every other shape, with no
line through it), both files re-parse as valid draw.io XML, page 1 of each is byte-for-byte
unchanged, and pages 2 to 5 were rendered to images and looked at. **Open the two Chen files in
draw.io once** and nudge anything you would place differently. The positions are clear of
everything else, but the choice of spot was a program's, not yours.

**The crow's-foot file `uhid-er.drawio` was not updated**, by your decision. CLAUDE.md now
says it is no longer maintained.

### 2. Some features work in the database and API but have no screen

Tested and working through procedures and `/api`, but not reachable by clicking in the website:

| Feature | Procedure | Endpoint |
|---|---|---|
| Doctor records an encounter: diagnoses, vitals, prescriptions, lab orders | `start_encounter()` … `end_encounter()` | `POST /api/encounters` |
| Doctor refers a patient to another hospital | `refer_patient()` | `POST /api/referrals` |
| Referral inbox for the receiving hospital | `v_referral_inbox` | `GET /api/referrals/inbox` |
| Lab technician enters a result | `report_lab_result()` | `POST /api/lab-results` |
| Admin reviews break-glass reads | `v_break_glass_queue`, `review_break_glass()` | `GET/POST /api/audit/break-glass` |
| Admin merges duplicate UHIDs | `merge_patients()` | `POST /api/patients/merge` |
| Transfer a patient between beds | `transfer_patient()` | `POST /api/admissions/:id/transfer` |

The problem: the console's role descriptions in `public/js/data.js` (`ROLES`) promise these. The
doctor's says "records encounters, prescribes, refers, discharges". The lab technician and
system admin logins land on screens with nothing role-specific.

**A decision is needed from the team:**
- **Build the screens** (most useful: the doctor's "record encounter" form on the record page,
  and an admin break-glass review list), or
- **Soften the `ROLES` blurbs** to match what the screens do, and demonstrate these features
  through SQL and the API, as `docs/demo-script.md` step 9 already does. Defensible for a DBMS
  course, where the database carries the marks.

### 3. The team's part

- **Add Abir and Noria as collaborators** on GitHub (Settings → Collaborators). They cannot push
  until they accept. Step 0.3 of `docs/guides/nobo.md` covers it.
- Each works through their guide in `docs/guides/`. Their practice files go in
  `server/practice/<name>/` with prefixed objects (`nb_`, `ab_`, `nr_`).
- All three should rehearse `docs/demo-script.md` and the viva map at the end of Nobo's guide.

### 4. The laptop is short of memory

Claude Code shut the server (and earlier a test MySQL) down twice for low memory. Close heavy
programs before the demo. The server is **not running** now; start it with `npm start` in
`server/`.

---

## Starting the next session

```powershell
cd E:\hospital-management-system
git pull                          # in case Abir or Noria pushed practice work
cd server
npm run db:reset                  # fresh data; also checks MySQL and .env are working
npm run db:test                   # 72 PASS
npm run api:test                  # 64 passed, 0 failed
npm start                         # http://localhost:3000 — only when you need the site
```

Then tell Claude: *"Read handover.md and CLAUDE.md, then start on item 2."*

## Facts the next session needs

- **MySQL 8.4.13** runs as Windows service `MySQL84` on 127.0.0.1:3306. Root password and the
  `uhid_app` password are in `server/.env` (git-ignored). Code reads them from there; never
  print them, never commit them.
- **The API connects as `uhid_app`, never root.** It can only run procedures and read views and
  lookup tables. Any new route that needs data must get it from a view or a procedure.
- **Run `npm run db:test` before committing a change in `database/`, and `npm run api:test`
  before committing a change in `server/`.** Both rebuild the database when they finish.
- **Re-run `npm run db:reset` on the morning of the demo.** Dr. Anisur reads Md. Rahim Uddin's
  record under a referral consent grant that expires 24 hours after the seed data is loaded.
- **If you change a procedure, view or seed row the guides use**, re-check the expected output
  printed in `docs/guides/*.md`.
- **Git:** work on `main`, commit and push after each verified piece, no force-push, no rebase,
  and no Claude attribution in commit messages (CLAUDE.md "Git").
- The original deadline in CLAUDE.md, 25 October 2026, has passed. The team's own target was
  7 November 2026. Confirm the real submission date with the teacher.
