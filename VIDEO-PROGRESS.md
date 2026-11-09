# Demo video — progress log

The last piece of work: a screen-recorded demo of the running system, edited, with the voice-over
added afterwards by Nobo. This file is the hand-over: a new session (or a new account) reads it and
carries on from the first unticked step.

## The brief (Nobo, 9 Nov 2026)

- Claude records the video itself on the laptop: **Snipping Tool → Record**.
- Editing in **Clipchamp** (or another online editor).
- **The glowing edges Claude's desktop control draws round the screen must not be in the video.**
- No voice-over: Nobo records that afterwards, so the video needs a timing sheet showing what is on
  screen when.
- **No longer than 2 minutes** (Nobo, 10 Nov 2026).
- Follow the demo flow in `docs/demo-script.md`. (The 2-minute shot list and voice-over script is a
  Claude Doc — https://claude.ai/artifact/KKUNayCUGqdnQp2gwviC45 — made on Nobo's other account; the
  account this started on cannot open it.)

## Decisions taken (9 Nov 2026)

- **Recording without desktop control** (Nobo's choice, after the Snipping Tool permission was
  declined): `video/record.mjs` starts a headless Chrome, drives the demo through the DevTools
  protocol and Chrome records its own tab (`getDisplayMedia` + `MediaRecorder` → WebM). Nothing
  controls the desktop, so the glow cannot appear; a bad take is just run again. A drawn cursor
  (in `video/demo.mjs`) shows where each click lands.
- Video: 1920 × 1078, 30 fps, VP9 WebM, light theme, 125 % zoom (the laptop's own scaling).
- Console parts (`npm run race`, the mysql client, `npm run db:test`) cannot be filmed headless, so
  `video/capture-terminal.mjs` runs them for real and saves the output; `video/terminal.html` plays
  it back in a console window. The text is the real output (the mysql errors drop "at line N", as
  the interactive client does; the db:test table is shown as its PASS/number/name/result columns).
- **Editing: Clipchamp in Nobo's Chrome via the Claude in Chrome extension** — Nobo connects the
  extension and signs in to app.clipchamp.com. (Clipchamp is not installed; computer use may only
  look at a browser, not click in it.)

## How to re-record (fresh account, same laptop)

```
cd E:\hospital-management-system\video
node capture-terminal.mjs        # only if the console outputs need refreshing; resets the DB itself
cd ..\server
npm.cmd run db:reset             # stop npm start first, restart it after
npm.cmd start
cd ..\video
node record.mjs --short          # THE 2-MINUTE CUT: 12 clips → video\out\clips-short\  (about 4 minutes)
node record.mjs                  # the full 8:41 cut: 17 clips → video\out\clips\  (about 11 minutes)
node record.mjs --dry s08        # try one scene without recording; screenshots in out\shots
node frames.mjs out\clips\s02-registration.webm 5 20    # check frames of a clip
```

The scenes depend on each other (the visit's lab order feeds the lab scene, and so on), so a real
take is always the whole list on a freshly reset database. `--dry` with `--short` tries the short cut.

## Steps

- [x] 1. Glow: avoided entirely — no desktop control is used (see Decisions).
- [x] 2. Recorder built and checked (frames pulled from clips: 1918 × 1080, no overlay)
- [x] 3. Full cut: 17 clips (title card, the 15 parts of demo-script.md, closing card), 8:41.
- [x] 4. Part titles and the two cards built into the recording (Clipchamp's text boxes could not
      be placed by automation — its canvas ignores synthetic drags).
- [x] 5. **2-minute cut** (`video/scenes-short.mjs`, 10 Nov ~01:00): 12 clips, sign-ins off camera,
      quicker pointer and typing, each part reduced to its key moment. Every clip's end frame checked.
- [x] 6. Clipchamp project **"UHID demo video"** (Nobo's Clipchamp, OneDrive → Videos → Clipchamp):
      the 12 short clips on the timeline in order, **1:45.83**. Only the short cut is in the project.
      No transitions (Clipchamp's "Add transition" buttons ignore automated clicks; hard cuts suit a
      screen demo). Add them by hand if wanted — each adds no length.
- [x] 7. Timing sheet (below)
- [ ] 8. Nobo: voice-over in Clipchamp (Record & create → audio, or Import media → a narration file,
      dragged onto the audio track), then **Export → 1080p**. Not exported yet on purpose: export
      once, after the voice-over. Keep the narration within 1:45, or the video grows past it.

## Timing sheet — the 2-minute cut (Clipchamp timeline, 1:45.83)

Measured from the clip positions on the timeline (within half a second). Each part's title shows
in the lower left for its first ~3 seconds.

| Starts | Part | Length | On screen | Say (from docs/demo-script.md) |
|---|---|---|---|---|
| 0:00 | Title card | 4.5 s | Project name, tagline, author | One UHID per person; the record follows them to every hospital |
| 0:04 | Registration | 15.5 s | "Md. Rahim" + 12/04/1978 → two possible duplicates; new patient → UHID BD-2026-00001-1 | Duplicate check before issuing (decision 1); the UHID comes from a locked counter, check digit verified by a CHECK |
| 0:20 | Booking | 7 s | Dr. Anisur's slot grid, booked slots struck through; a slot booked | Slots computed from schedule − leave − bookings (decision 3); booking in a locked transaction (decision 4) |
| 0:27 | Race test | 4.5 s | `npm run race`: 5 of 5 rounds, exactly one booking | Two receptionists, one slot, same instant — the lock and the UNIQUE key |
| 0:31 | Wards | 13.5 s | Abdul Karim admitted to GM-04 → turns red; transfer to the female ward → refused | A trigger sets bed status (decision 7); the wrong ward is refused and rolled back |
| 0:45 | National record | 5.5 s | Rahim's record: access basis "active consent grant", Square → Dhaka Medical referral, 5 encounters | The referral granted consent (decisions 6 and 2); every read is logged first |
| 0:50 | Recording a visit | 20 s | Diagnosis, Amlodipine + Amoxicillin, Haemoglobin → "Nothing was saved"; Amoxicillin removed → saved, referral Arrived | One transaction; the allergy trigger rolls back every line (decision 5) |
| 1:10 | Break-glass | 9 s | Fatema refused → break-glass with a reason → red banner | Emergency access allowed, never silent; it waits for review (decision 2) |
| 1:19 | Lab | 5 s | Haemoglobin 10.2 → Abnormal | A trigger decides abnormal from the reference range |
| 1:25 | Merge | 8 s | The two Rahim records compared and merged | Self-join finds the duplicate; one transaction moves everything (decision 1) |
| 1:33 | The database itself | 9 s | mysql: bed status update, access-log delete, wrong check digit — all refused | The rules live in MySQL, not in the pages |
| 1:42 | Closing card | 4 s | 41 tables · 21 triggers · 84 procedures and functions · 9 views · 309 tests | The database enforces the rules |

## Timing sheet — the full cut (8:41, not in the Clipchamp project)

Start times are within a second. Inside each part, the order of events is the "Shows" column of
the clip table below; each part opens with its title in the lower left for about 5 seconds.

| Starts | Part | Length | Say over it (from docs/demo-script.md) |
|---|---|---|---|
| 0:00 | Title card | 7 s | What the project is: one UHID per person, record follows them to every hospital |
| 0:07 | Public site | 16 s | Course project strip; counts and next-free times come from MySQL (decision 3) |
| 0:23 | Registration | 67 s | Duplicate check before issuing; UHID from a locked counter, check digit CHECK; repeated NID refused by the procedure |
| 1:30 | Reception's view | 18 s | Demographics only — the database withholds history from this role |
| 1:48 | Booking | 19 s | Slot grid is one procedure (recursive CTE: schedule − leave − bookings) |
| 2:07 | Race test | 15 s | Two receptionists, one slot, same instant — the row lock and UNIQUE key; same for one bed |
| 2:22 | Wards | 72 s | Trigger sets the colour; sex-restricted ward refused and rolled back; receptionist cannot discharge |
| 3:34 | National record | 37 s | Consent grant from the referral; 5 encounters, 4 hospitals; every read logged first |
| 4:11 | Recording a visit | 49 s | Seven calls in one transaction; allergy trigger rolls all back; fix one line; referral now Arrived |
| 5:00 | Referral + break-glass | 48 s | Referral writes a 24-hour consent; Fatema refused; break-glass with a reason, awaiting review |
| 5:48 | Discharge | 26 s | Doctor must give outcome and summary; trigger sets cleaning |
| 6:14 | Lab | 26 s | Collected → reported; Abnormal decided by a trigger from the reference range |
| 6:40 | Administrator | 42 s | Review the break-glass read; self-join finds the duplicate; merge in one transaction |
| 7:22 | Patient's view | 28 s | The patient sees every reader of their record |
| 7:51 | The database itself | 30 s | Four statements refused by MySQL directly |
| 8:21 | Tests | 13 s | 309 tests, each with its exact error number |
| 8:34 | Closing card | 7 s | The database enforces the rules |

## Clips

In `video/out/clips/` (git-ignored; regenerate with `node record.mjs`). Lengths are the raw takes.

| Clip | Shows | demo-script.md | ≈ s |
|---|---|---|---|
| s00-title | Opening card: project name, tagline, author, stack | – | 7 |
| s01-public-site | Landing page, "course project" strip, hospitals, doctor cards with computed next-free | 1 | 16 |
| s02-registration | Rezaul signs in; Md. Rahim + 12/04/1978 → two possible duplicates; new patient → UHID BD-2026-00001-1; same NID again → refused | 2 | 68 |
| s03-reception-view | Rahim's record as reception: "Demographics only", allergies, no history | 3 | 19 |
| s04-booking | Dr. Anisur's slot grid (struck-through = booked), book a slot → toast | 4 | 19 |
| s05-race | `npm run race`: 5/5 single bookings, 5/5 single admissions (real output, replayed) | 4 | 16 |
| s06-wards | Admit Abdul Karim to GM-04 → red; transfer to GF-03 refused (other sex); transfer to GM-08; receptionist's discharge refused | 5 | 71 |
| s07-national-record | Dr. Anisur opens Rahim: consent basis, Square→DMCH referral, 5 encounters across 4 hospitals, abnormal cholesterol, Who has viewed this | 6.1–6.4 | 37 |
| s08-encounter | Record encounter: I10, Amlodipine + Amoxicillin, Haemoglobin → "Nothing was saved" (allergy trigger, rollback); remove Amoxicillin → saved, referral now Arrived | 6.5–6.7 | 50 |
| s09-referral-breakglass | Refer to Square (urgent, patient agrees); Fatema refused → break-glass with reason → access log "awaiting review" | 6.8–6.10 | 49 |
| s10-discharge | Doctor discharges GM-08 (Improved + summary) → cleaning | 6.11 | 26 |
| s11-lab | Rumana: Collected, 10.2 → Abnormal (trigger) | 7 | 27 |
| s12-admin | Nasima: break-glass review → Justified; Merge records: the two Rahims → merged | 8 | 42 |
| s13-patient | Rahim signs in: own record, Who has viewed this | 9 | 29 |
| s14-database | mysql: bed status, access log delete, allergy insert, wrong check digit — all refused (real errors) | 11 | 31 |
| s15-tests | `npm run db:test`: 309 PASS (real output) | 11 | 14 |
| s16-end | Closing card: 41 tables · 21 triggers · 84 procedures/functions · 9 views · 309 tests | – | 7 |

## Fixed on the way (so nobody hits them again)

- Chrome's password manager (save / "found in a data breach" prompts for demo1234) silently ate all
  mouse input in headless mode after a few sign-ins → turned off in the recording profile (cdp.mjs).
- Capturing a tab adds Chrome's "sharing this tab" bar, shortening the page by ~56 px → record.mjs
  fits the window again after the recorder starts.
- The patient's landing page re-renders its nav after the doctor list loads → s13 waits for it.
- Headless Chrome ignores `--lang`, so date fields are typed in mm/dd/yyyy order (values are right).

## Notes for whoever picks this up

- How the clips got into Clipchamp (it has no file input, only the system file picker): a temporary
  `<input type=file>` was added to the Clipchamp page, the Claude in Chrome extension's file upload
  filled it (under ~7.5 MB per call), and the files were handed to Clipchamp's drop zone as a
  drag-and-drop event. Fetching them from a localhost server is blocked by Chrome's local-network
  protection on that site.
- The temporary file input lives only in that open Clipchamp tab; a reloaded page needs it again
  (one line of JavaScript, see the session that built this, or just drag the files in by hand from
  `video\out\clips-short\`).
- The original 2-minute voice-over script is in the Claude Doc linked above (other account). The
  2-minute cut follows the same flows; the timing sheet above says what is on screen when. If a
  part needs more or less time for the narration, change its pauses in `video/scenes-short.mjs`
  and re-record (`db:reset` first): about 4 minutes, then swap the clip in Clipchamp.
