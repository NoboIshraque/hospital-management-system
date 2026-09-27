# CLAUDE.md — UHID National Hospital Management System

Context for anyone (human or Claude) working in this repo. Read this before writing code.

## What this is

A **Database Management System course project** — a nationwide hospital management and
health-record system. Every patient gets one **UHID** on first contact with any hospital,
and their record follows them to every other connected hospital in the country.

Author: Nobo Ishraque, Dept. of ICT, Bangladesh University of Professionals.
Final deadline: **25 October 2026.** Frontend must be presentable **immediately** — it is
being shown to the course teacher.

**This is a DBMS course, not a web development course.** The database carries the marks.
The frontend exists to demonstrate the database. Do not let UI polish crowd out schema work.

## Stack — do not change these

| Layer | Technology |
|---|---|
| Database | MySQL 8 |
| Backend | Node.js + Express + `mysql2` (not yet built) |
| Frontend | **Vanilla HTML, CSS, JavaScript** |

**No frameworks.** No React, no Vue, no Tailwind, no build step, no bundler, no TypeScript.
The course requires plain HTML/CSS/JS and the author is learning these. Adding a framework
would be actively harmful. Libraries in general need a real justification.

## Architecture — the decision that shapes everything

**Static HTML pages that call a REST API with `fetch()`, served as static files by Express.**
Not EJS, not server-side rendering.

Why: the frontend had to be built *before* the backend existed. Pages fetch from local mock
JSON now; in Week 4 the URLs change to real API endpoints and nothing else does.

**The consequence that matters:** mock JSON in `mock/` must have exactly the shape the real
API will return. If you invent a different shape per screen, Week 4 becomes a rewrite.

### The site has two halves

| Page | What it is |
|---|---|
| `public/index.html` | **The public landing page — the front door.** No account needed: hospitals, doctors, services, how a UHID works, FAQ. |
| `public/login.html` | Sign-in. The four demo accounts. |
| `public/privacy.html` | What the prototype stores, what leaves the browser, what the real system will do. Static, loads no JavaScript. |
| `public/pages/*.html` | **The clinical console.** Needs a session; a signed-out browser is sent to `login.html` by `js/shell.js`. |

`index.html` was the login screen until September 2026. It is now the public site, and login
moved to `login.html`. **`LOGIN_HREF` in `js/util.js` is the single place that knows where the
sign-in page lives** — it works out the `../` for itself from `document.body.dataset.page`.
If you add a page, give its `<body>` a `data-page`, and add root-level pages to `AT_ROOT`.

## Repository layout

```
docs/         er-design.md (the ER model), plus use cases, data dictionary, normalization
database/     schema.sql, seed.sql, queries.sql, views, triggers, procedures
server/       Express app — routes/ controllers/ services/ db/
public/       Frontend served as static files
  index.html    public landing page
  login.html    sign-in
  privacy.html  data-handling statement
  favicon.svg   brand mark
  css/          tokens, base, components, shell, site, per-screen, responsive
  js/           data, seed, store, util, shell, auth, home
  pages/        the clinical console — one .html + one .js per screen
mock/         Mock JSON standing in for the API
prototype/    uhid-prototype.html — single-file working prototype (see below)
```

## The prototype is the reference implementation

`prototype/uhid-prototype.html` is a complete, working, single-file build. **Read it before
writing any frontend code.** It already contains:

- A design system (CSS custom properties, light + dark themes)
- Login with username/password and four demo accounts
- Patient registration with live duplicate detection
- Patient search across all hospitals
- Patient record with encounter timeline, prescriptions, access log
- Doctor directory with filters, availability slot grid, booking flow
- Ward bed board with admission and discharge
- localStorage persistence for registered patients

Work in `public/` splits this into proper files. **Match its conventions exactly** — do not
invent a second visual language or a second way of rendering.

**What the prototype does not contain.** The public landing page, `privacy.html`, the site
nav bar with its services dropdown, the hero figure, and the ambient light layer are all
newer work with no prototype counterpart. They live in `css/site.css` and `js/home.js` and
they use the same tokens and the same rendering rules — the prototype is still the authority
on *how* to build, it is just no longer a complete inventory of *what* exists.

### Design tokens (from the prototype's `:root`)

Light theme; dark theme redefines the same names. Always use the token, never a raw hex.

```
--ground #EEF2F4   --surface #FFFFFF   --surface-2 #F5F8F9   --surface-3 #E7EDF0
--rail   #0C2B3A   (dark sidebar)      --rail-ink #A9C2CE
--ink    #0E1B22   --ink-2 #47606D     --ink-3 #78909D
--line   #D3DEE3   --line-2 #BACAD1
--brand  #0E6E8C   --brand-ink #0A5570 --brand-soft #DDEDF3  --on-brand #FFFFFF
--ok     #17753F   --warn #96550A      --crit #A81F2D        --info #4A3E9E
                   (each has a matching --*-soft background)
--r 5px  (border radius)
```

Fonts: **IBM Plex Sans** (UI), **IBM Plex Mono** (UHIDs, times, IDs, any aligned digits),
**IBM Plex Serif** (brand mark only). Loaded from Google Fonts.

Semantic colour is separate from brand colour: `--ok` / `--warn` / `--crit` mean bed status,
allergy severity, appointment state. Never use `--brand` to mean "good".

### Code conventions

- **Template literals** for HTML generation, never string concatenation with `+`.
- **Always `esc()`** any data value before putting it in HTML. A patient named `<script>`
  must not break the page.
- Render from data. No hardcoded table rows or list items anywhere.
- Every screen needs **loading, empty, and error states**. A blank timeline must say why
  it is blank, not render nothing.
- `localStorage` reads and writes are always wrapped in `try/catch` — private browsing
  makes them throw.
- Plain functions and a small `S` state object. No classes, no state library.
- **`Number()` anything that goes into a `style` attribute.** `esc()` protects HTML; a style
  attribute is a second injection surface and needs its own guard.
- **All media queries live in `css/responsive.css`, which is linked last on every page.**
  They win on source order alone. Link it anywhere but last and the layout breaks.
- **Site content arrays live in `js/home.js`, not `js/data.js`.** `data.js` holds what becomes
  MySQL lookup tables in Week 4 — hospitals, doctors, departments. Nav links, service copy,
  FAQ text and hero steps are page chrome and must not be mixed in with it.
- **Animate `transform` and `opacity` only.** Both are composited; animating anything else
  makes the browser re-lay-out the page every frame.
- **Every animation degrades under `prefers-reduced-motion: reduce`** — to no movement, never
  to no content. There is one block at the bottom of `site.css` that turns them all off.
- **Every page carries the same furniture:** a favicon, a `theme-color`, a `.skip-link` as the
  first thing in `<body>`, and an `id="main"` for it to skip to.
- Raw hex is banned everywhere except two files that cannot read CSS custom properties:
  `favicon.svg` and the `theme-color` meta tag. Both hold `#0E6E8C`, which is `--brand`.
  If the brand colour ever changes, those two change by hand.

### What the public page must not become

It says plainly, in the strip above the nav, that it is a course project and not a live
government service. **Do not dress it up as an official government portal** — no ministry
seals, no borrowed logos, no invented endorsements. Honest disclosure reads as more
professional than fake officialdom, and it keeps the project clear of implying an approval
it does not have. Invented testimonials and fabricated notices are out for the same reason.

## Data shapes — these are the API contract

Defined in the prototype's mock data. Keep them stable; the MySQL schema and the Express
endpoints must match.

- `hospital` — id, name, div, dist, tier
- `doctor` — id, name, dept, qual, hospitalId, fee, bmdc
- `patient` — uhid, name, dob, sex, blood, phone, nid, district, address, kin,
  registeredAt, registeredHospitalId, identityVerified, allergies[], encounters[]
- `encounter` — date, hospitalId, type (OPD/Emergency/Inpatient), doctor, dept, dx, notes, rx[]

UHID format: `BD-<year>-<5-digit serial>-<check digit>`, e.g. `BD-2026-13052-1`.
The check digit is the serial's digits summed mod 10 — `1+3+0+5+2 = 11`, so `1`.

> This example used to read `BD-2019-04821-7`, which does not satisfy the rule stated on the
> line above it: `0+4+8+2+1 = 15`, so it should end in `5`. The five patients in `js/seed.js`
> were built from that wrong example and are all still wrong. See **Open items**.

## The seven design decisions that carry this project

Do not quietly undo any of these — they are the reason the project scores.

1. **UHID is anchored to a national ID.** Registration duplicate-checks on NID, name + date
   of birth, and mobile before issuing. A patient with two UHIDs is the failure the whole
   system exists to prevent.
2. **Access is granted, not assumed.** Role-based permissions, patient consent grants with
   expiry, and an `access_log` written by a database trigger on every clinical read.
   Emergency break-glass access is allowed but flagged.
3. **Doctor availability is computed, never stored** — from recurring schedule, minus leave
   exceptions, minus existing bookings.
4. **Booking is transactional.** `UNIQUE(doctor_id, slot_start)` plus a stored procedure
   using `SELECT … FOR UPDATE`. Two patients cannot take one slot.
5. **`encounter` is the clinical hub.** Diagnoses, prescriptions, lab orders and vitals all
   hang off it. Diagnoses/medicines/tests reference catalogue tables, never free text.
6. **Referrals are what make it national.** Hospital A refers to Hospital B; B sees the full
   history on arrival.
7. **Bed state changes via trigger**, on admission / transfer / discharge — not in app code.

## Roles

Patient · Receptionist · Doctor · Hospital Admin · System Admin · Lab Technician.
**Receptionist admits** to a bed; **Doctor discharges.** There is no separate ward-staff role.

## Status

*Keep this table honest — it is the first thing a new session reads.*

| | |
|---|---|
| Frontend prototype | Built (single file) |
| Console split into `public/` | Done — 5 screens, shared shell |
| Public landing page | Done — nav, dropdown, hero, services, hospitals, doctors, FAQ, footer |
| Privacy / data-handling page | Done |
| Repo + GitHub | Done |
| Use cases | Not started |
| **ER model** | **Written — `docs/er-design.md`. Draft: §8 has 5 questions needing the author's answer** |
| **schema.sql** | **Not started — this is now the critical path** |
| Express API | Not started |

## Open items — do not lose these

- **The seed UHIDs fail the project's own check-digit rule.** `issueUhid()` in
  `pages/register.js` computes the check digit as the serial's digits summed mod 10, and
  none of the five patients in `js/seed.js` satisfy it — `BD-2019-04821-7` sums to 15, so it
  should end in 5, not 7. The example in this file is wrong in the same way, which is
  probably where it came from. Correct digits: `04821→5`, `11904→5`, `00723→2`, `38104→6`,
  `27615→1`. Fixing it means touching `seed.js`, the hardcoded default in `shell.js`, and the
  format example below. Flagged to the author on 5 Sep 2026; not yet actioned.
  This now blocks `database/seed.sql`: `docs/er-design.md` §4.2 puts a `CHECK` on the UHID
  format, so MySQL will reject these five rows outright.
- **No print stylesheet.** A patient record that prints properly matters in a hospital
  system. Not started.
- **No 404 page.** Worth adding when Express starts serving the site in Week 4, not before.

## Working rules

- The author is **comfortable with SQL, new to Node.js.** Explain Node/Express concepts;
  do not over-explain SQL.
- Prefer showing *why* a decision was made over just making it. He has to defend this work
  in a viva and cannot defend code he has not understood.

## Git — commit and push without being asked

The author's laptop is the only copy of anything not yet pushed, and losing work to a dead
machine would be fatal to this project. **So commit and push on your own initiative. Do not
wait to be asked, and do not ask permission each time.**

### When to commit and push

After **each piece of work that is finished and verified** — a page that renders, a query
that returns the right rows, a bug that is fixed, a file that is split out.

**The rule that matters: never end a turn with finished work sitting unpushed.** If you have
completed something and checked that it works, it is committed and pushed before you reply.
Not "later", not "at the end of the session" — a session can end without warning, and
anything still only on the laptop is gone. `git push` follows every `git commit`; a commit
that has not been pushed has not protected anything.

This also means a new session can always start from GitHub and be certain it has everything.
Along with the work itself, keep this file current (see below), so the next session inherits
the reasoning and not just the code.

Do **not** commit after every individual file edit *within* one piece of work — a commit is
a checkpoint, not a keystroke log. But once the piece is done and verified, push it.

### Keep CLAUDE.md current

This file is the memory between sessions. When a change makes it wrong, fix it **in the same
commit as the change**, not in a tidy-up afterwards. In particular:

- **Status table** — when something moves from not started to done.
- **Repository layout** — when a file or folder is added.
- **Open items** — when a defect is found and not immediately fixed, write it down with
  enough detail to act on cold. When it is fixed, delete the entry.
- **Code conventions** — when a new rule is established, or an old one turns out to be wrong.
- **Data shapes and the design decisions** — if either genuinely changes, which should be
  rare and deliberate.

A stale CLAUDE.md is worse than no CLAUDE.md, because the next session will trust it.

### How

```
git add .
git commit -m "<what changed, in plain words>"
git push
```

Write messages that describe the change: `"Split prototype CSS into public/css/app.css"`,
`"Add patient search page with live filtering"`, `"Fix duplicate check missing saved
patients"`. Never `"update"`, `"changes"`, `"wip"`, or `"fix"` alone.

Do not add Claude attribution, co-author trailers, or emoji to commit messages. This is
coursework submitted under the author's name and the history should read as his.

### Before committing

- **Never commit code you have not verified works.** If a page was changed, open it and
  check it renders. A broken commit is worse than no commit.
- Run `git status` first and look at what is actually staged. If something unexpected
  appears — a large file, anything that looks like a credential, a stray database dump —
  stop and tell the author instead of committing it.
- `node_modules/` and `.env` are covered by `.gitignore`. If either ever shows up in
  `git status`, something is wrong with the ignore file — say so, do not commit it.

### Hard limits

- Work on `main`. This is a solo student project; do not create branches unless asked.
- **Never** `git push --force`, `git reset --hard`, `git rebase`, or anything else that
  rewrites or discards history. If a push is rejected, stop and explain the situation.
- If a push fails on authentication, say so plainly and let the author sign in. Do not
  retry in a loop and do not attempt to reconfigure credentials.
- Never commit secrets. If real database credentials appear anywhere but `.env`, flag it.
