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
node record.mjs                  # all 15 scenes → video\out\clips\*.webm  (about 10 minutes)
node record.mjs --dry s08        # try one scene without recording; screenshots in out\shots
node frames.mjs out\clips\s02-registration.webm 5 20    # check frames of a clip
```

The scenes depend on each other (s08's lab order feeds s11, s09's break-glass feeds s12), so a real
take is always the whole list on a freshly reset database.

## Steps

- [x] 1. Glow: avoided entirely — no desktop control is used (see Decisions).
- [x] 2. Recorder built and checked (frames pulled from a test clip: clean 1920 × 1078, no overlay)
- [x] 3. All 15 scenes written and dry-run clean on a reset database (9 Nov, about 23:15)
- [x] 4. Final take: `db:reset`, restart server, `node record.mjs` (second take, 9 Nov ~23:45 — the
      first had a page 56 px short; see "Fixed on the way")
- [ ] 5. Edit in Clipchamp: order, trim, title cards, export 1080p
- [ ] 6. Timing sheet for the voice-over (below), final file path written here

## Clips

In `video/out/clips/` (git-ignored; regenerate with `node record.mjs`). Lengths are the raw takes.

| Clip | Shows | demo-script.md | ≈ s |
|---|---|---|---|
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

## Fixed on the way (so nobody hits them again)

- Chrome's password manager (save / "found in a data breach" prompts for demo1234) silently ate all
  mouse input in headless mode after a few sign-ins → turned off in the recording profile (cdp.mjs).
- Capturing a tab adds Chrome's "sharing this tab" bar, shortening the page by ~56 px → record.mjs
  fits the window again after the recorder starts.
- The patient's landing page re-renders its nav after the doctor list loads → s13 waits for it.
- Headless Chrome ignores `--lang`, so date fields are typed in mm/dd/yyyy order (values are right).

## Notes for whoever picks this up

- Editing has not started. Next: Nobo connects the Claude in Chrome extension and signs in to
  app.clipchamp.com; then import the 15 clips (each under 10 MB, so the extension can upload them),
  cut dead time (typing at sign-in, waits), add short title cards per part, export 1080p.
- The original 2-minute voice-over script is in the Claude Doc linked above (other account). The
  raw clips total about 8.5 minutes, so the edit needs that script, or a target length from Nobo.

