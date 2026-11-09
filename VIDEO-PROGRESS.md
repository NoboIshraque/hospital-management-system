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
- [ ] 4. Final take: `db:reset`, restart server, `node record.mjs`
- [ ] 5. Edit in Clipchamp: order, trim, title cards, export 1080p
- [ ] 6. Timing sheet for the voice-over (below), final file path written here

## Clips

| # | Scene (demo-script.md part) | File | Status |
|---|---|---|---|

## Notes for whoever picks this up

