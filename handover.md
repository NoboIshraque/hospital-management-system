# Handover — where the project stands

Written 1 November 2026, at the end of the session that took the project from "schema only" to a
running system. Read this first in the next session, then `CLAUDE.md`.

## In one paragraph

Every item in `CHECKLIST.md` is done, verified, committed and pushed (last commit `d1574fb`).
The database, the Express API, the frontend wired to the API, the documentation, the viva demo
script and the three learning guides all exist and are tested. Item 1 below (the ER document and
diagrams lagging the schema) was **finished on 1 November 2026**. Item 2 (screens) was **finished the same day**. **Two things are still not done**: Abir and Noria
have not started their guides; and the laptop is short of memory. Details below.

---

## What exists and how it was verified

| Part | Where | Verified by |
|---|---|---|
| Database: 40 tables, 21 triggers, 33 procedures + 4 functions, 9 views | `database/schema.sql` … `views.sql` | `npm run db:test` — 135 tests, all pass (6 Nov 2026) |
| Sample data: 8 hospitals, 11 doctors, 18 patients | `database/seed.sql` | loads clean in `npm run db:reset` |
| Least-privilege app user `uhid_app` | `database/grants.sql` | denied SELECT on `patient`, UPDATE on `bed`, DELETE/TRUNCATE on `access_log` |
| 20 demonstration queries | `database/queries.sql` | all run and return sensible rows |
| Express API, 30 endpoints | `server/`, reference in `docs/api.md` | `npm run api:test` — 76 checks, all pass |
| Booking under concurrency | `server/scripts/race-booking.js` | `npm run race` — 5 of 5 rounds, exactly one booking each |
| Frontend on the API (and offline on sample data) | `public/`, switch in `public/js/api.js` | 25-step headless browser test, no JavaScript errors; all 21 standalone screens captured with no errors |
| Print stylesheet, 404 page | `public/css/responsive.css`, `public/404.html` | rendered in headless Edge |
| Documentation | `docs/use-cases.md`, `data-dictionary.md`, `normalization.md`, `api.md`, `demo-script.md` | — |
| Learning guides | `docs/guides/nobo.md`, `abir.md`, `noria.md` | every code block run against the real database and its output copied in |
| Project explainer (plain-language guide to everything) | Claude Docs: https://claude.ai/artifact/DUBUDir3h1ACyH4YPTRQjD | written 1 Nov 2026 from the code; each claim checked against it |
| Complete demo guide (11 parts, about 25 minutes) | Claude Docs: https://claude.ai/artifact/B6G2q8WTQVwoLaUAkrpSdU | the new screens' steps browser-tested 1 Nov 2026; the fuller version of `docs/demo-script.md`, for rehearsing |
| Frontend report for submission | Claude Docs: https://claude.ai/artifact/C8xcUhqZniSFzf6ipK8XFh | 25 screenshots, 34 file snippets; export via the doc's name → Export → PDF or Word |

The browser test and screenshot scripts lived in a temporary folder and are **not** in the repo.
`npm run api:test` and `npm run db:test` are the committed checks.

---

## 6 November 2026: the security review's group 1 is done

All five items of `CHECKLIST.md` G1–G5 are fixed, tested and pushed: a doctor needs an
appointment, referral, consent or admission — or a reviewed reason — to open an encounter;
"treating" is the doctor's own encounter or department; ward actions, cancellations and merges
are limited to the caller's hospital; only an encounter's own doctor writes into it; there is no
national patient list (a masked, logged search instead); and opening a record is a POST.
`docs/er-design.md` §8.3 lists each rule. **Still open: G6**, the review's groups 2–4 (going
live, hardening, accepted risks) — decide with the author.

Found on the way: `t_value` in `tests.sql` had never recorded a result (an error handler
swallowed a collation error in its own INSERT), so `db:test` was really checking 74 of its 101
tests. Fixed; it now runs 135 and all pass.

**Demo changes to rehearse:** admitting a patient now starts with *Find the patient* (type
`Karim` → Find) instead of a list; a doctor recording an encounter for someone they have no
basis for is asked for a reason.

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

### 2. ~~Some features had no screen~~ — done 1 November 2026

The team chose to build the screens. Every feature in the old table now has one, and every
role's `ROLES` description in `public/js/data.js` matches what its screens do:

| Feature | Screen | Who |
|---|---|---|
| Record an encounter (diagnoses, vitals, prescriptions, lab orders, one transaction) | `pages/encounter.html`, and *Record encounter* on the record | doctor |
| Refer to another hospital | *Refer…* on each encounter at the doctor's own hospital (record page) | doctor |
| Referral inbox | `pages/referrals.html` | doctor |
| Enter lab results | `pages/lab.html` — the worklist, from the new `lab_worklist()` procedure | lab technician |
| Review break-glass reads | `pages/audit.html` — own hospital for a hospital admin, all for the system admin | admin |
| Merge duplicate UHIDs | `pages/merge.html` — suggestions from the new self-join view `v_possible_duplicates` | admin |
| Transfer between beds | *Transfer…* on an occupied bed (bed board) | receptionist, doctor |

Database changes made on the way, each with a test: `lab_worklist()` (a procedure, because test
names are clinical content and views hold none); `review_break_glass()` now refuses a read made
at another hospital — before, Nasima at Dhaka Medical could clear Chattogram's;
`report_lab_result()` returns the abnormal flag its trigger decided; and `v_possible_duplicates`.

The five new screens need the server. Opened from disk they say so (`needsServerHtml()` in
`js/shell.js`); bed transfer works offline too.

**Browser-tested 1 November 2026**, as doctor (allergy refusal rolled the whole visit back; the
corrected visit saved; referral sent), Square's doctor (it arrived in their inbox), lab technician
(10.2 g/dL Haemoglobin flagged abnormal by the trigger), hospital admin (queue scoped; merge),
receptionist (transfer to the female ward refused, then a valid transfer), system admin (reviewed
the Chattogram read), and offline mode.

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
npm run db:test                   # 135 PASS
npm run api:test                  # 76 passed, 0 failed
npm start                         # http://localhost:3000 — only when you need the site
```

Then tell Claude: *"Read handover.md and CLAUDE.md, and pick up from there."*

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
