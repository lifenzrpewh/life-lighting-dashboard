# Pāua — operating manual

**Renamed 2026-10-04** from LIFE Lighting Dashboard (the owner's name). Where a
path or id is concerned it is ASCII `paua`: the package, the data folder
`%APPDATA%\paua` (the old `life-lighting-dashboard` folder is moved in whole on
the first run, `src/bridge/data-dir.ts`), the exe and the installer. People read
"Pāua": the window, the shortcut, the uninstall entry. The installer keeps the old
`appId` so it upgrades an old install in place rather than beside it. Dated notes
below keep the old name where they quote the past.

Touchscreen dashboard for grandMA3, beside the console: the Cue Manager (the
visuals app, embedded) next to the console's own web remote, which carries every
button and every edit. Volunteer-simple, with an operator mode. Electron on Windows.

**Second pivot, 2026-10-02: the visuals app draws the run order.** The dashboard's
own read-only run order is off the screen; the real Cue Manager sits in its column,
so notes are edited in place, songs-only and every other rule are the app's own,
and there is one source of truth. Booth devices may edit (the owner's choice).
`src/shared/cue-pane.ts` has the reasons.

**Pivot, 2026-09-27: the MA draws the buttons.** The trigger board, bottom rail
and cue editor are gone; volunteers fire from an MA layout view in the pane and
the LD edits in MA's own editor. `docs/PLAN.md` Phase 1 has the shape and the
reasons.

**Read in this order:** `docs/PLAN.md` (the spec — architecture and phasing),
`docs/MA3_READ_MODEL.md` (✅ desk-verified API facts, read before touching console
code). This file is the operating manual. A fact lives in one place — link, don't
copy.

## Status — all three channels VERIFIED, Phase 1 shell standing

Badge convention: ✅ VERIFIED (dated on-console observation) · ⚠️ UNVERIFIED ·
🔬 RESEARCHED · ❌ FAILED. Harness-green alone is ⚠️. onPC counts as on-console.

**Desk run 2026-09-20, onPC 2.3.2.0, show "Mount Eden Base" — 9/10.**
`SendOSC` works from a plugin **including the string form**, so channel C is
viable and the console-direct architecture holds. Object reads cost ~0.01 ms.
The full read model is in `docs/MA3_READ_MODEL.md`.

| | |
|---|---|
| ✅ `src/bridge/export-parse.ts` | Export XML parser, verified against the real 856-file / 431 MB library. |
| ✅ `spikes/scan-exports.mjs` | Derives `export-blacklist.json`. No desk needed. |
| ✅ `console-plugin/LifeBridge.lua` | Probe v1, run on the console 2026-09-21 — pushed 14 results back over `SendOSC`. Read-only on the show. `OSC_ENTRY = 3`. |
| ✅ `scripts/build-plugin-xml.mjs` | Embeds the Lua into a self-contained importable XML. Round-trip verified before the file lands. |
| ✅ `console-plugin/_test_lifebridge.lua` | Offline harness, 240 checks. |
| ✅ `spikes/osc-probe.mjs` | Both directions exercised on the desk 2026-09-21. `--listen-only` watches without sending; decodes OSC args properly. |
| ✅ `src/shared/reading.ts` | The four states as types. `matchReading` has no default branch, so rendering a timeout as a value does not compile. 10 tests. |
| ✅ `src/main` · `src/preload` · `src/renderer` | Electron kiosk: windows on a grid, the status bar and Connections. Builds, runs, renders all four states. The link round-trips through LifeBridge (`src/main/bridge/link.ts`, below). |
| ⚠️ `src/main/ma-pane.ts` | The web remote as a `WebContentsView`. Real web remote on onPC 2.3.2.0, **not a desk**. Never stuck for good (2026-10-01): a 15 s load timeout, and a fresh login after 10 s of MA's own overlay saying something it never recovers from (✅ the read works in the sandbox; the fresh login is unit-tested, not watched firing). **Reload MA** (↻) in its slot's strip. The six desk checks are in `docs/MA3_READ_MODEL.md` § Web remote. |
| ✅ `src/main/settings.ts` | Console address, port, MA users; passwords via the OS keystore. macOS Keychain, and **Windows DPAPI on the Windows box, 2026-10-04**: an operator password saved sealed (no plaintext on disk), still opened after the data folder was moved for the rename, then removed. **2026-10-08:** also Admin's passcode, as a salted scrypt hash only (`src/bridge/passcode.ts`), under `adminPasscode`. |
| ⚠️ `src/shared/admin.ts` · `src/renderer/components/PasscodeSheet.tsx` · `src/renderer/mode.ts` · `src/main/kiosk.ts` (`admin:*`) | **Admin** (operator mode until 2026-10-08, in every word a person reads; the code keeps `operator`). **A passcode, not a 3 s hold** (the owner, 2026-10-08): Pāua's own keypad, or Keyboard for letters; opens on the keypad when it is all digits. Main checks it (`admin:unlock`) and is the only way in; the page may only step down. Five wrong tries, a 30 s wait, said in words. None set: a tap goes in, and Settings says so. **Forgotten:** with Pāua closed, delete `adminPasscode` from `settings.json` (header of `src/shared/admin.ts`, `docs/FIELD_TEST.md` § Admin). **Timeout per computer**: 2, 5, 10, 15 (default), 30 or 60 min. In the dev kiosk over CDP on the Mac, 2026-10-08: set, wrong tries, the wait, the right one, Keyboard, the 2-minute drop. ⚠️ Not by finger or on the Windows box. |
| ⚠️ `src/renderer/showMode.ts` · `Grid.tsx` (`bare`) · `StatusBar.tsx` (`ShowButton`) | **Show mode** (2026-10-13, the owner's: "a fullscreen that takes away the windows' tops and locks the screen to whatever mode it is in"). A tool in the bar's tray, for anyone: the windows lose their strips (the page takes the 56 px), no edge grips, Layouts and Settings gone, an alert's tap opens nothing (its × still works), Connections read-only, the Showfile sheet without its writes; the lock becomes **Show mode** (· Admin), and Admin's idle drop waits. **Out is Admin's way in** whatever the mode: the passcode sheet titled Leave Show mode, or a tap with none set; leaving lands in Admin. Remembered per computer (`paua.showMode`), the mode still booting volunteer; hideable in Settings › Top bar (the way out never hides). In the dev kiosk on the Mac over CDP: in and out from volunteer and Admin, a wrong passcode refused, a reload kept it, the page boxes 892 → 948 px. ⚠️ Not by finger, on Windows, or the idle hold watched for its full timeout. `docs/FIELD_TEST.md` § Show mode. |
| ✅ `src/renderer/mock.ts` | The mock lying desk: healthy / stale / silent / unreachable / cold, keys `1`–`5` in dev. Drives the real derivation, not a parallel one. |
| ✅ `src/bridge/osc.ts` | OSC 1.0 decoder. An unknown type tag fails the **whole message**, not just that argument — OSC args are positional, so skipping one reads every later value at the wrong offset and a fader level becomes whatever four bytes sit there. |
| ✅ `src/bridge/channel-b.ts` | Executor updates off the wire. A channel C push is `other-channel`, not an error: one port carries both. The middle `,sif` integer is carried un-named because its meaning is still unobserved. |
| ✅ `src/bridge/coalesce.ts` | Newest-wins per object, time-free so the caller owns the frame rate. Drops superseded values, never unseen ones. |
| ✅ `spikes/channel-b-live.mjs` | Points the **shipped** decoder at the desk, so the unit tests are not the only evidence. Sends nothing. |
| ✅ `src/renderer/components/ShowfileSheet.tsx` · `src/shared/showfile-write.ts` · LifeBridge `shows` | **Save As and Load** from the showfile chip's ▸ (2026-10-04; the console card since the 2026-10-05 look): offered names (campus + NZ date and time, 31-char meter), read back before "saved"; Load from the console's own list, operator mode, live link, save-first ticked, 3 s hold. **On onPC 2.3.2.0 on the Windows box, 2026-10-04:** Save As read back in ~2 s once it sent `/NoConfirmation` (a bare `SaveShow` left a confirm dialog on the console and saved nothing); Loads read back in 22 s and in over 60 s. One Load froze onPC on its progress bar, in the session where that dialog had been cancelled; the same Load on a fresh onPC worked. "Save first" saves a changed show (its file rewritten the moment the Load went) and leaves an unchanged one alone. `docs/PLAN.md` Phase 3. |
| ✅ `src/bridge/showfile.ts` · LifeBridge `show` · `watch` | The showfile chip. **LIVE against onPC 2.3.2.0, 2026-09-30**: `ON BASE SHOW Mount Eden Base`, read on link-up and again 5:04 later in a quiet gap. **Watched since 2026-10-02**: the ask is `watch`, and LifeBridge then pushes any change within a second (the chip went amber 1.8 s after a base change, in the kiosk). A Load ends the watcher, so a Load still waits for the next link-up or ask. An older plugin's `unknown verb watch` falls back to `show`. `docs/MA3_READ_MODEL.md` § The showfile, watched. |
| ✅ `src/main/cue-pane.ts` | The Cue Manager (`visuals.prodapps.life`) as a `WebContentsView` in the run order's column. Persistent session (sign-in, service worker, offline queue survive a restart), locked to its origin, 15 s load timeout, Reload beside it, its Connections row can clear it. **Working on this Mac, 2026-10-02 (owner-observed):** signed in by the app's own QR as a booth device, songs-only and note editing both work. Server side: `visuals-song-comms` `2675660` (booth devices edit), migrations `20261002090000_pairing_kind` and `20261002100000_booth_device_edit`. Not yet on Windows. **Device-only since 2026-10-09** (visuals-song-comms `7772992`, keyed on `KIOSK_USER_AGENT_MARK`, which `cue-pane.ts` sets on the session before the first load): signed out, the pane shows only the device QR (no email form); signed in as a person, it asks to sign out and pair as a device instead of showing the app. The admin approving picks an **existing device or a new one**, devices are renamed in the app's Admin › Devices, and a device gets no song audio (Listen hidden, `pco-media` refuses it). ⚠️ Not yet seen in the kiosk. |
| ⚠️ `src/renderer/components/ConnectionsPanel.tsx` · `src/renderer/components/SettingsPanel.tsx` · `src/renderer/components/settings/` · `src/shared/connections.ts` | **Connections and Settings, split 2026-10-08** (the owner's choice). **Connections** on the bar: a list anyone reads, one row per connection, dot, state, detail and address, no fields; in Admin a row opens Settings at it. **Settings** (gear, Admin only, not drawn otherwise): what Connections held (each connection's fields with its own Save, On/Off, Add a web page / NDI source / capture input, This computer), plus **Admin** (passcode, timeout) and **Top bar**; version and log path at the foot of its list. The bar's dot is the worst connection that is set up; one not set up is `off`, never `down`. In the dev kiosk over CDP on the Mac, 2026-10-08. ⚠️ Not by finger. |
| ✅ `src/bridge/arena.ts` · `src/main/arena.ts` | Arena's link: `GET /api/v1/product` every 2 s, its row in Connections. Against Arena 7.28 on the Windows box, 2026-10-02. |
| ✅ `src/bridge/arena-live.ts` · `src/main/arena.ts` | What Arena plays, over its websocket: each composition push gives which clip is connected on each layer, subscriptions keep the faders current, and the link poll keeps it from going stale. Read against Arena 7.28 on the Windows box, 2026-10-03, in the kiosk. Shown as the Arena view in a slot, thumbnails through main on an `arena:` scheme; the kiosk log names what plays. Each playing clip shows its time left, at the clip × group × composition speed (LIFE's VFX group runs at 1.795), watched counting a video down to `0:00 held` on 2026-10-03. `docs/VISUALS_DASHBOARD.md` § Seen on Arena (2026-10-03). |
| ⚠️ `src/shared/layout.ts` · `src/renderer/components/Grid.tsx` · `src/renderer/layoutStore.ts` | **Windows, freeform, MA3-style** (2026-10-05, the owner's decisions of 2026-10-04; replaced the two slots of 2026-10-03 and their divider). **No grid since the night of 2026-10-05** (the owner: freeform, but never overlapping): places in units of a 1200 × 800 screen, a drag that follows the finger, edges snapping within 16 px onto the screen's or another window's, a resized edge stopping flush against a window in its way; a grid layout and the saved layouts come across × 100. Owner-driven by mouse in the kiosk that night (a run order 517 units wide, a window added under the MA, the edge between them moved). Never overlapping; each with tabs, tapped by anyone. **Edit layout** (for everyone since 2026-10-08, from a pencil at the end of any window's strip; was operator mode, in Layouts): pages become pictures, drag a window to move it, an edge or corner to resize; a move over another window shows red and is not taken; + and × for tabs, a tab dragged to reorder or into another window (2026-10-05), a **double tap** on a tab names it in that layout only, in or out of Edit layout (2026-10-11, the owner; a ✎ per tab from 2026-10-08, gone; emptied, the view's name again; kept in saved layouts), Add window, Remove window. A page (MA, run order, embed) shows in one tab at a time; another tab of it says so and offers **Move it here**, which moves the page without logging in again. **For everyone, out of Edit layout:** the edge two windows share drags (a grip in the 12 px gap, the one place a page cannot cover), the windows on one side growing as the other side's shrink, pages as pictures while dragged (2026-10-05, the owner's ask: the old divider's "just adjust the windows"; dragged both ways as a volunteer over CDP). A turned-off connection's tabs leave and come back. Default: run order on the left third, MA on the rest; a machine's old slots come back as its two windows. In the kiosk on the Windows box over CDP, 2026-10-05: resized, moved, refused a move onto the MA, added a window with Arena and a second MA tab, moved the MA into it (1359×403, no new login). ⚠️ Not yet by a finger. Video's Fit is a pop-out's only now. |
| ⚠️ `src/renderer/components/LayoutsPanel.tsx` · `src/shared/layout.ts` (saved layouts) | **Saved layouts** (2026-10-05): Layouts in the top bar (and, since 2026-10-06, the folded strip) opens the list as a dropdown over the windows, pages as pictures while it is open (was: in the windows' place), each layout drawn as a picture of its windows (2026-10-05 look); anyone taps one to switch, and the button names the layout on screen (same windows and tabs, whichever tab shows). Anyone saves the layout on screen under a name (the same name replaces it) and deletes with a second tap (operator mode's until 2026-10-08). Up to 12, in this computer's storage (`paua.layouts`). In the kiosk over CDP, 2026-10-05: two saved, switched as a volunteer, the MA back in its saved window. |
| ⚠️ `src/renderer/theme.css` · `src/renderer/components/ui.tsx` · `src/renderer/components/StatusBar.tsx` · every component | **The plum look** (2026-10-09, in v1.0.0, from the owner's nine-round "Pāua palette" playground of 2026-10-08, https://claude.ai/artifact/KpEQSRUpXMdCC4cJHjQQbQ): plum and blue (#331832 #694D75 #1B5299 #9FC2CC #F1ECCE) with surfaces and text at 40% colour and the selected blue at 70%; Archivo (bundled, Plex gone), extrabold titles over a grey line; 2 px corners on windows and cards, 4 px on controls; one blue fill for selected (a tab's fill slides between tabs). **The bar**: Layouts and an alert lane left (base show, console not answering, other connections down; empty on a good day), countdown and clock as big numbers over captions centre, a tray right (Connections with its dot as a badge, Mark only while Settings › Top bar › **Testing** is on, Settings in Admin, the lock, blue and saying Admin in Admin); folds from a **handle** on its bottom edge, tap or drag, instantly. **Alerts put away by a ×** (2026-10-11, the owner): each but the base show's, until its words change or it clears and comes back; in memory only, and the Connections badge still shows the worst (CDP on the Mac). The console card is gone: the show is on Connections' Console row with a **Showfile** button. **The Guide is a view** (`'guide'`, native, poppable), no longer a bar button and sheet. In the dev kiosk on the Mac over CDP, 2026-10-09; ⚠️ not on Windows or by finger. **Its values come from [life-look](https://github.com/lifenzrpewh/life-look) since 2026-10-09** (private, shared with the Cue Manager): `src/renderer/look.css` is a committed copy, `npm run look:sync` / `look:check`; `theme.css` only maps tokens onto its roles, no palette hex. Checked against the mock in a browser: every token resolves to the value it had. What follows is the look it replaced. **The overhaul, direction A "Pāua"** (2026-10-05, overnight, the owner's ask; **the owner chose A**, with the neutrals moved halfway back towards the original greys, and merged it the same morning). Cool slate neutrals and one iridescent accent, nacre, only on the tab showing, operator mode and editing; IBM Plex Sans and Mono and lucide icons, all bundled (no fetch). Shared pieces in `ui.tsx` (Button, IconButton, Segmented, Sheet, Card, Placeholder, Dot, view icons). The bar in three zones (60 px since the afternoon of 2026-10-05, and a chevron folds it to a 36 px strip): a console card (link and show; tap for the showfile sheet) left, countdown and clock centred, Layouts · Connections · Mark flag · mode (a lock) right; operator mode lays the nacre line under the bar. One Layouts button: layouts as pictures of their windows, Edit this layout and Save inside (operator). Connections as a list and a detail; Showfile as two cards a screen apart; windows with edges, icon tabs and icon tools; Edit layout draws its handles; Add window opens its view menu. In the kiosk on the Windows box over CDP: every screen, volunteer and operator, a pop-out and back, Add window. ⚠️ Not by a finger. **2026-10-08: one bar at two heights**: folded is the same bar at 36 px, every item in its place and working (the folded strip and Edit layout left the bar); flex zones so the time is never covered (the clock went behind Admin's buttons), the buttons dropping words when short of room; Admin hides any item but the lock, Settings and the chevron (Settings › Top bar, `src/renderer/barItems.ts`, `paua.barHidden`). Checked over CDP at 1024, 1280 and 1920, both modes and heights. ⚠️ Not by finger. |
| ✅ `src/main/pane-snapshot.ts` · `src/renderer/components/Still.tsx` | **Pages as pictures**: each page stands in as a picture of itself while the layout is edited, since nothing can be drawn over a live page (first for the divider, 2026-10-03, owner: "feels good"; for Edit layout, 2026-10-05, taken before the pages are hidden). |
| ⚠️ `src/main/popout.ts` · `src/shared/popout.ts` · `src/renderer/PopOut.tsx` | **Pop out**: any tab's view (embeds too) into a window of its own, on top of the kiosk; every tab of that view says so and offers **Show** (forward, on top) and **Bring back**; the pop-out's **Send behind** lets the kiosk over it (2026-10-05: sent behind, Show focused it, Bring back closed it home, over CDP; the stacking itself not watched by eye); closing the window brings the view home, as does a kiosk reload. The MA and run order move page and all. Seen working in the kiosk on the Windows box, 2026-10-03, driven over the debugging port; not yet by a finger or on a second display. `docs/VISUALS_DASHBOARD.md` § Pop a view out. |
| ✅ `src/renderer/components/ClipsView.tsx` · `src/bridge/arena-control.ts` | **Clips**, the trigger screen (2026-10-04): Arena's grid in a slot or popped out; tap a clip, fire a column, Clear a layer, drag a fader; everyone may. The only writer to Arena: four templated requests, ids checked against the composition, never `/clips/…/clear` or `/clearclips` (tested). A tap is one bodiless POST: `true`/`false` only selected the clip. Fired by clicks in the kiosk on the Windows box. Above it and the Arena view, clips whose file is missing (⚠️ not yet seen with a real one). `docs/VISUALS_DASHBOARD.md` § The pieces. |
| ✅ `src/shared/media-check.ts` · `src/bridge/lookbook.ts` · `src/main/lookbook.ts` · `src/renderer/components/MediaCheck.tsx` | **The media check** (2026-10-04), a Media row in the Arena view: the service the run order has open (by its Planning Center plan, since 2026-10-05), or one picked from the lookbook app (lookbooks-lifenz.replit.app, which already parses PCO's `Media No.` into codes like `CF588`), and each B, F and A code reads ✓, not in Arena, file missing, another version, or the lookbook has no file. The lookbook is the truth for the version. ✅ **Against the owner's up-to-date Central composition, 2026-10-05**, on the Windows box: ✓ on seven codes, three not loaded, and "may differ" on CB095 (an operator can confirm it **Same** by hand since 2026-10-05; kept per computer, for that pair of names only): the same picture, but the lookbook's file is named `…-v5` and Arena's is not (the extension is ignored; a format change alone passes, the owner's rule, 2026-10-05). Stills carry their file path. ⚠️ Not yet at a booth or from the NAS. `docs/VISUALS_DASHBOARD.md` § the media check. |
| ⚠️ `src/main/video-feed.ts` · `src/renderer/components/VideoView.tsx` | **One Video view for every feed** (2026-10-08, the owner's item 8): a Video tab picks its own feed (this computer's Spout/Syphon sender, an NDI source, a capture input) from `FeedPicker.tsx`, kept in the layout; old NDI, capture and Video tabs convert on reading; one Spout/Syphon picture at a time, said in words; NDI and capture added in Settings › Video sources (`docs/VISUALS_DASHBOARD.md` § One Video view). ⚠️ Mac stand-ins only. **The video feed**: a Spout/Syphon sender (Arena's multiview, to be) as a **Video** view, GPU to GPU through `@napolab/texture-bridge` and Electron's `sharedTexture`, the pages still sandboxed. Seen live from a stand-in sender (`spikes/spout-test-sender.cjs`) and from **Arena 7.28's Spout output** on the Windows box, 2026-10-03, in a slot and popped out; capped at 30 fps (60 since 2026-10-05 with the ring build: three staging textures and a GPU fence against tearing on fades; 47-48 fps read from Arena's 50). A touch-sized source picker, and **Fit** to give the space the picture's shape. 16-bit (Arena's High Detail) goes through **LIFE's build of the addon** (`native/texture-bridge/`, built by GitHub Actions), converted to 8-bit on the GPU: ✅ exact against a 16-bit stand-in (`spikes/spout-16bit-sender.cs`), 2026-10-03, and ✅ **from Arena at 16 bpc**, 2026-10-04 (owner-set and owner-watched; the kiosk read 1920×1080 at 27 fps, no failure; the stock addon refuses 16-bit, and the sender's own format is not logged). ✅ **Fades no longer freeze** (2026-10-05, owner-watched on Arena: "seems good now"): Arena's picture carries alpha, so each frame is drawn on black; reproduced and measured with `spikes/video-lag/` (`--alpha`). `[video]` lines in the log say where a stall is, each 5 s with one. **Restart video** (2026-10-08, merged from `video-restart`): for anyone, in the view's strip, over its no-picture words, beside the Video feed in Connections and in Settings › Video feed; after 10 s with no frame the view says why (two graphics cards, most likely), and the row is not LIVE without a picture. ⚠️ Not on Windows or a two-card machine. **2026-10-11, after 1.0.0:** at the booth that never had a picture, 1.0.0's showed "until i changed tab then it died". A tab switch closed the receiver and opened a new one; now an unwatched receiver is **kept 120 s** and the same one resumes, and the preload **counts the views watching** (before, one closing stopped the feed for another, and only the last mounted drew). Seen on the Mac against the stand-in (two views, one closed, reopened on the same receiver); ✅ **the owner, 2026-10-13: the Spout picture is good** at the booths. `docs/VISUALS_DASHBOARD.md` § The video feed. |
| ⚠️ `src/shared/ndi.ts` · `src/main/ndi.ts` · `src/main/ndi-worker.ts` · `src/renderer/components/NdiView.tsx` | **NDI sources as views** (2026-10-05, the owner's ask: "similar to the embeds"). Settings › Video sources (Admin; Connections › Add an NDI source until 2026-10-08) lists what NDI finds; each added is a Video tab's feed (its own view until 2026-10-08) and a row. NDI's own runtime (ProPresenter's `NDI 5 Runtime`) through **koffi** (prebuilt FFI, no addon to build) in a **utilityProcess**; each page gets its own MessagePort, so frames skip main; copied with `memcpy` (❌ `koffi.view` kills the process in Electron), thinned to the size drawn. In the kiosk over CDP: Arena's composition NDI (5800×2036) at **42 fps** sent 1933×678; a stand-in (`spikes/ndi-test-sender.cjs`) at 50 fps, colours read back within 1. Costs the page ~60% at that rate. ⚠️ Not by finger, a camera, another machine, macOS, or the installed build. `docs/VISUALS_DASHBOARD.md` § NDI sources as views. |
| ⚠️ `src/shared/capture.ts` · `src/renderer/capture.ts` · `src/renderer/components/CaptureView.tsx` | **Capture inputs** (2026-10-05, the owner's ask: Blackmagic, "and OBS"): anything the computer sees as a camera (a Desktop Video card input, an ATEM Mini, OBS Virtual Camera, a webcam) as a view, by `getUserMedia` in the page, no native code. Added like NDI sources (Settings › Video sources since 2026-10-08, a Video tab's feed), kept by device name. Main's new camera rule: video only, never the microphone. In the kiosk over CDP: the webcam at 1920×1080, 29.7 fps, popped out; OBS's camera with OBS closed refused, said in words. ⚠️ No Blackmagic card here. In v0.2.4. `docs/VISUALS_DASHBOARD.md` § Capture inputs. |
| ✅ `src/bridge/ontime.ts` · `src/bridge/propresenter.ts` · `src/main/timers.ts` | The countdown chip beside the clock: OnTime (`GET /api/poll`) whenever an event is running there, ProPresenter's timer, labelled by its stage message (`Wrap up: 3:38`, `/v1/timers/current`, `/v1/stage/message`), otherwise, one at a time. The rule is `chooseTimer` in `src/shared/timer.ts`. **Both shown correctly against the real programs, 2026-10-02, on the Windows box:** ProPresenter 18.2, and OnTime as LIFE runs it, **our own fork** (`lifenz-prod/ontime` v4.0.1, not upstream; its events carry extra `cue` and `custom` fields the decoder ignores). A ProPresenter countdown that may not overrun ends `00:00:00` `complete`; overrun states are still unseen. Which ProPresenter timer to follow is the ProPresenter row in Connections, by name, because a booth runs several at once; a named timer it does not have is said, never swapped for another. Past zero, either countdown goes red. ProPresenter's port is **1025** unless set otherwise (the owner, 2026-10-08). |
| ⚠️ `src/renderer/components/TimerView.tsx` · `TimerChip.tsx` (`timerFace`) | **The Timer view** (2026-10-08, the owner's item 1): the bar's countdown as a view any window may hold, as many tabs as wanted, scaled to its window (container units), red past zero, stale held dimmed with its age, `?` in words; one `timerFace` draws both, so they cannot disagree, by `chooseTimer`'s rule (no source picker). On while OnTime or ProPresenter is. In the dev kiosk on this Mac over CDP against a stand-in OnTime: counting, overtime red, stale, popped out. ⚠️ Not against the real programs or by finger. **2026-10-11, the owner: no dotted `?` box.** A face with nothing to count (`idle`: not answering, or no event or timer running and no stage message) draws no chip on the bar, and the view says "No countdown running" with which program and why; a named ProPresenter timer that is missing is still said. Seen on the Mac against a stand-in OnTime (counting, stopped, gone). |
| ⏸ `src/backend/` · `src/main/backend/` | The dashboard's own run order, **retired from the screen 2026-10-02** and not started. ✅ It did read the live backend first (pairing as a Central booth device, the plan shown). Delete once the Cue Manager has run a service. |
| ⚠️ `src/shared/embeds.ts` · `src/main/embeds.ts` · `src/renderer/components/EmbedPane.tsx` | **Embeds** (2026-10-05): any web page, added by name and address in Connections (operator mode), is a view of its own with its own sign-in (a partition per embed), − / + zoom remembered per embed, Reload, Pop out, and a row saying loaded / loading / not loading that can be turned off. New windows open in the computer's browser; the user agent drops Electron's name, for Google. Removing one clears its session, and its folder at the next start. In the kiosk on the Windows box over CDP, 2026-10-05: added, placed over its slot, zoomed (saved, re-applied after a reload), popped out and back, off and on, renamed, removed. ⚠️ Not signed in to Google (its sign-in raised a Windows passkey dialog, cancelled); a new-window link not tried. |
| ⚠️ `build/icon.svg` · `scripts/render-icon.cjs` · `src/main/kiosk.ts` (mark, windowed) | **The pāua icon, windowed mode, MARK** (2026-10-05). The icon is a drawn shell (`build/icon.svg`, rendered to `build/icon.png` and `assets/icon.png` by `npx electron scripts/render-icon.cjs`), for the installer, taskbar and Dock; ⚠️ not yet seen in an installed build. **This screen** in Connections (operator mode): Full screen or Window, at once, no restart (watched both ways in the kiosk). **MARK** in the status bar (a flag since the 2026-10-05 look), for anyone: a `[mark] ===== tester's mark N =====` line in the log with the mode, layout and views on screen, and the button says which number (watched). |
| ⚠️ `src/shared/holding.ts` · `src/renderer/components/HoldingView.tsx` · `src/renderer/useMediaCheck.ts` | **The Holding view** (2026-10-05, the owner's idea): the holding layers as rows of thumbnails, each clip marked against the run sheet the media check follows; inspect only. **Pictures over words since the afternoon of 2026-10-05**: only what needs a look is marked, what belongs in a column stands there as a dashed "+ place" tile, one-offs wait in a No column tray and are placed per service, a clip on screen may be replaced after a red tick at the confirmation, and the Arena view's Media row is one line that opens Holding. **A column is one moment of the service across every layer, found by Arena's column names**: PRE, POST, WTL, NSL, BIBLES, WTG and PROMO (the owner's pattern for every campus, after a first version that guessed per layer placed the PM foregrounds wrongly, 2026-10-05); each item's codes into its column, announcements into PROMO, nothing placed while columns are unnamed. To place, Place or Choose; Update all; every write to Arena confirmed first; operator mode, and **not drawn in volunteer mode** (2026-10-06). **The normal background fills HOLD BG's gaps** up to the last PROMO in Update all (2026-10-06, `backgroundGaps`; ⚠️ not yet run against Arena); a column named PREACH takes the message's background. Names are the layer group's columns. **Files by code and size** (the lookbook's are the drive's byte for byte): the check says "different file" by size; the drive is searched by code; the lookbook's file is the backup, downloaded only when the confirmation's question gets a yes. ✅ Dry runs against the live composition, the drive and the lookbook; ✅ loads through the button (the owner's Place all), ✅ lookbook downloads through it (the owner's Update all, 11:12). ⚠️ Not by finger; the live tick not yet seen. **2026-10-13, branch `holding-fixes` (not merged):** a **Plan** panel and a result line that stays (`explainPlan`, `media:run`, `[holding]` in the log); a **one-off is one column** across its layers, its BG following; a refused load **looked at again**, Arena's words kept, and **It's there** (orange, `thereKey`); **place anywhere** on its layer, kept per service (`Pin`, `pinTargets`); **same code, different file** (side by side, versions, the drive's files, Files to check); announcements and one-off FGs **from PROMO 1 onwards** in run-sheet order. Dev kiosk on the Mac over CDP against the stand-in and the live lookbook; ⚠️ not against Arena or by finger. `docs/VISUALS_DASHBOARD.md` § The Holding view (§ The owner's fixes, 2026-10-13). |
| ⚠️ `src/shared/holding-map.ts` · `src/renderer/holdingMapStore.ts` · `settings/holding.tsx` | **The Holding map** (2026-10-11, the owner's "matrix"): Settings › Holding, per computer. Arena's named HOLDING columns down the side; what each takes from the run sheet (words) and, per layer, Default / Item only / Normal BG / Leave alone / Fixed code; code families (two letters) to a layer or none; presets with Reset, and To a file / Import between computers. Holding's rules are its default and an empty map is them exactly (tested). Every Holding function takes the map last. Checked over CDP on the Mac against `spikes/arena-stand-in.mjs`. ⚠️ Not against a real composition or by finger. **Add a column** (2026-10-11, the owner): a row for a name Arena does not have yet, assigned now, in effect once a HOLDING column is named the same; kept once something in it is set; a row not in Arena has a × that drops its rule (CDP on the Mac, Arena off). `docs/VISUALS_DASHBOARD.md` § The Holding map. |
| ⚠️ `src/renderer/components/LookbookView.tsx` · `src/shared/holding.ts` (`looksOf`, `lookSteps`) | **The Lookbook view** (2026-10-05, the owner's ask: Holding's twin, "BIG and obvious"): one card per moment of the run sheet with the lookbook's own composed picture (`previewPath`, served 1600 wide on `lookbook://large/…`), the A-screen or lower third, a tick when Arena has it all, amber and **Load** (that moment only) when not, green when on screen. Same rules and confirmation as Holding. One look a row, filling the view. ✅ In the kiosk over CDP against Central PM 4 Oct: 7 cards, 6 ticked. ⚠️ Load not pressed; not by finger. `docs/VISUALS_DASHBOARD.md` § The Lookbook view. **Clear old FGs** (`oldForegrounds`, `emptyWire`): HOLD FG clips this run sheet does not use, offered in Update all's confirmation (a tick) and as a header button; main empties a slot only on HOLD FG, still holding the code shown, not on screen. ⚠️ Never pressed: Arena's `/clips/…/clear` not yet watched. § Clear old FGs. |
| ⚠️ `src/shared/guide.ts` · `src/main/embeds.ts` (guide) | **The Creative Guide** (2026-10-05): LIFE's Notion guide, an embed of main's own, zoom and reload. **A view since 2026-10-09** (`'guide'`, the owner's choice in the playground, to quieten the bar): + › Guide in any window, pops out; it was Guide on the top bar opening a sheet. ✅ Showing as a tab in the dev kiosk on the Mac, 2026-10-09. ⚠️ Not by finger. |
| ⚠️ `src/shared/media-fetch.ts` · `src/bridge/media-files.ts` · `src/main/media-fetch.ts` | **Fetching media** (2026-10-05): Fetch, Place and Update all copy a code's file into the **local folder** and load it into every clip with the old one, or the column it belongs in. The file is found on the **graphics drive by code and size**, else downloaded from the **lookbook**, only after the confirmation asks (the owner's safeguard). **Browse** for both folders. ✅ Loads through the button: the owner's Place all, 10:21, put five files from `G:` into Arena (in the wrong columns, since fixed: § The Holding view). ✅ **A lookbook download through the button**: the owner's Update all, 2026-10-05 11:12, downloaded CF464 and CB105 and loaded them (paua.log). **A clip on screen** is replaced only after the confirmation's red tick, the yes naming the clips (`allowLive`). ⚠️ Whether a file loaded over another keeps the clip's settings, and what the audience sees on a live replace, not yet watched. `docs/VISUALS_DASHBOARD.md` § Fetching media. |
| ✅ `src/bridge/log-file.ts` · `src/main/log.ts` | **The app's own log**, `paua.log` in the data folder, timed, two 5 MB files at most; the kiosk page's errors and a crashed GPU or page process go in too. Version and path at the foot of Connections. Watched writing on the Windows box, 2026-10-04. |
| ✅ `src/main/entry.ts` · `src/main/supervisor.ts` · `src/bridge/supervise.ts` | **The installed app's watchdog**: Paua.exe in Node mode runs the app and restarts it 5 s after a crash, gives up after 5 in 2 minutes, leaves a clean quit alone. A checkout is left to kiosk.cmd. Watched on the packaged build on the Windows box, 2026-10-04. |
| ✅ `.github/workflows/release.yml` · `docs/FIELD_TEST.md` | **Field-test builds**: a tag `v<version>` builds `Paua-Setup-<v>.exe` and `Paua-<v>-arm64.dmg` (ad-hoc signed, Syphon.framework left as upstream signed it) and drafts a release; logs pushed to `release-build-log`. v0.1.0 built green 2026-10-04. ⚠️ Neither file installed anywhere yet; the Mac build never opened on a Mac. |
| ⚠️ `src/shared/updates.ts` · `src/main/updates.ts` · `settings/computer.tsx` (`UpdatesCard`) | **Updates** (2026-10-11, the owner's ask and choice of host): electron-updater reads the newest **published** release of the public `lifenzrpewh/paua-releases` (this repo is private; a token in the app could be taken out of it). Checked a minute after the start and every 4 h; **never installed by itself**: the bar's alert lane says "Pāua X is out", Settings › This computer has Check for updates and Update (Admin, asked twice), which downloads, installs silently and reopens. Windows only (the Mac build is ad-hoc signed; told to download by hand). The release build drafts the same release there when the `RELEASES_TOKEN` secret is set; publishing that draft is the rollout. `PAUA_FAKE_UPDATE=<version>` on a checkout pretends one is out (the screens watched that way on the Mac, 2026-10-11). ⚠️ The repo and secret not yet made; no real update installed; the watchdog's part not watched. `docs/FIELD_TEST.md` § Updates. |
| ✅ `src/bridge/ping.ts` · `src/main/bridge/link.ts` | The link: after 15 s of console silence, `SendOSC 3 "/ping,s,<token>"` over A, echoed back over C; anything the console says counts as proof it is there. **LIVE against onPC 2.3.2.0 on this Mac, 2026-09-30: 5 asks a quiet minute, one command line each.** A ping a second through the plugin was two lines a second, far too loud. `docs/MA3_READ_MODEL.md` § The link ping. |

**✅ Delivery is proven, both directions — desk `10.11.60.40`, 2.3.2.0, 2026-09-21.**
A command sent as `/life/cmd` `,s` **executed on the console**, and one fader move
pushed **269 messages** back as `/life/14.14.1.6.1005` `,sif`. Channels A and B
are real. Full format and the traps in `docs/MA3_READ_MODEL.md` § OSC transport.

Working config: OSC row 3 `OSCData 3` · port **8003** · prefix `life` · destination
`10.11.60.182` · Receive/Send/Receive Command/Send Command all Yes.

✅ **Re-verified end to end from the Windows box, 2026-09-21** — desk
`10.11.60.40`, dashboard on `10.11.60.215`. All three channels, on a fresh
checkout with nothing carried over from the Mac.

**Row 3 must not send where the console hears itself** (2026-10-11): the desk lagged with row 3 on
8003 sending to the broadcast `10.11.60.255`, from the moment Pāua linked up; fine later the same
day with the rows changed and Pāua on 1.1.0, cause not pinned down. Send to the Pāua computer's own
address. `docs/MA3_READ_MODEL.md` § The link ping, item 5.

**The destination is per-machine, not a constant.** The `10.11.60.182` above is
one station’s address, and reading it as configuration is why the first run here
came back silent: channel A worked, B and C had nowhere to go. Whatever machine
the dashboard is on goes in that field.

**Diagnose a silent channel B by calling the plugin first.** `SendOSC` leaves
through the same entry’s destination and `Send`, so channel C arriving proves
both are right and narrows the silence to which executors the native OSC output
covers — a different setting entirely. Staring at a dead B instead spends the
afternoon on the wrong half of the config.

**Channel B is chattier than first measured.** One sweep of two executors pushed
**771 messages in 30 s** — `/life/14.14.1.6.1004` and `.1005`, both
`,sif ["FaderMaster", 3, n]`. That is ~26/s against the ~9/s recorded from a
single control, so coalescing per object before anything reaches React is a
requirement, not a nicety.

✅ **The shipped decoder read the desk, 2026-09-21.** `spikes/channel-b-live.mjs`
took **1221 packets, decoded 1221** — nothing undecodable, nothing of an
unrecognised shape — and the coalescer turned them into **267 rendered frames**
at 10 Hz, a 4.6x reduction with the last position of every fader intact. 16 unit
tests cover the decode and the buffer; this is what moves them past harness-green.

⚠️ **It also widened the read model:** four executors live rather than two,
and levels past the earlier maximum, so neither the executor set nor the value
range may be assumed. Both recorded in `docs/MA3_READ_MODEL.md` — Channel B,
which is where wire facts live.

⚠️ **The trap that cost the afternoon:** editing an entry's `Port` does **not**
move the live socket — row 3 displayed `8000` while still listening on `8010`.
Toggle `Enable Input` off/on to rebind. Verify from outside with a connected-UDP
port scan (unbound → `ECONNREFUSED`, bound → silence) **plus two controls**, or
ICMP filtering will read as "bound".

**✅ Channel C too.** `Call Plugin "LifeBridge"` sent over channel A produced **14
messages back** over `SendOSC`, carrying the whole probe report. A command goes in
over the network and structure comes out over the network, console-direct, no
shared filesystem. The architecture holds end to end.

Two defects only the desk could show, both now fixed and commented in the source:
`SendOSC` **prepends the entry's Prefix** (so plugin addresses are bare `/probe/x`,
not `/life/probe/x`), and it **does not carry UTF-8** (an em-dash arrived as
`b \0 \20`, so `oscSafe` strips to ASCII).

**Plugin deployment is solved: the XML is self-contained.** `npm run build:plugin`
embeds the Lua as base64 blocks (1024-byte stride, `Size` = block count, UTF-8 BOM
— all three are importer requirements that fail quietly). Import one file; there is
no `.lua` to copy and no path to be wrong. A test fails if the XML drifts from the
Lua, so the stale-import trap cannot happen silently.

⚠️ **That guards the FILE, not the console.** Re-importing does not reload
a plugin the console already has in memory: a rebuilt XML imported over plugin
7 on 2026-09-21 ran the old code, and `Call Plugin` reported success while doing
it. Distribution is solved; deployment is not. Delete the plugin object and
re-import, or restart the console — details and the proof in
`docs/MA3_READ_MODEL.md`. The same cache is why module state survives between
calls, so anything shipped must reset what it owns.

## The four channels

| | Carries | Mechanism |
|---|---|---|
| **A** Command out | every write | OSC/UDP → `/<prefix>/cmd`, fire-and-forget |
| **B** Live state in | active flags, fader levels | console's native OSC out |
| **C** Structure in | cue lists, timing, recipe lines | console plugin → `SendOSC` push |
| **D** Bulk fallback | same, offline | `Export Sequence` → parse XML, **never during a service** |

**The MA pane shrinks these.** A carries only showfile writes now, B is no longer
needed for button feedback (MA draws it), and C only for showfile info and a
heartbeat. Nothing is deleted until the console track resumes and decides.

The dashboard runs on the backup PC but **talks to the console, not the PC it sits
on**. Reading the local onPC's synced copy would make session health load-bearing,
and a station that falls out of session keeps answering confidently and wrongly.

## Rules

- **A read that failed must never come back looking like an answer.** `ParseResult`
  is a discriminated union; the bridge returns typed errors, never a fallback
  value. The prior tooling does `send(...) or "No groups found"`, which makes a
  slow desk look like an empty show. Don't reintroduce that shape.
- **`LifeBridge.lua` is read-only on the show.** `SendOSC` is the only command it
  may ever issue — the harness fails if that changes. This is what makes it safe
  to run on a live showfile.
- **Never write below sequence/macro 1001.** That's basefile territory. Never write
  inside a generator-swept range; the next Show Creator run erases it.
- **Every write is unconfirmed until a read-back shows it.** `Cmd()` discards its
  return, so a failed command is indistinguishable from a successful one.
- **Resist configuration.** Anything the show can describe about itself is read from
  the show; a setting for it is a bug in the derivation. `src/shared/settings.ts`
  holds only what no show knows (console address, web remote port, the two MA
  users, where OnTime and ProPresenter are) and must stay that way.
- **The MA pane is a picture, not a reading.** Its best state is `showing`: a page
  loaded. Never render it as "live", and never draw over it; a native view cannot
  be overlaid, so anything said about it sits beside it.
- **A password never crosses to the renderer.** Main builds the login URL; the
  screen learns only whether a password is set.

## Hazards, all already paid for

**Console API** (✅ 2026-09-20 — details in `docs/MA3_READ_MODEL.md`):

- **A cue's `NO` is the display number × 1000.** SNAP, documented as cue 2, reads
  `NO=2000`. And `seq:Ptr(i)` is **positional** — position 1 is OffCue. So neither
  index nor `NO` is the number a person sees, and they mislead in opposite
  directions. Convert at the boundary; never let a raw `NO` reach a UI or a command.
- **Properties are read with `obj:Get("NAME")`, not as Lua fields.** Field access
  returns `nil` silently. That is how probe v0 reported a recipe line with no group
  as a PASS.
- **The recipe line's group is `SELECTION`, not `Object`**, and it returns a handle.
- **`CUEOUTFADE` defaults to the string `"CueTiming"`.** Writing it explicitly is
  what creates a split `0/0`. Set `CUEINFADE` only.
- **`HookObjectChange` does not install.** Poll instead — the sequence exposes
  `CURRENTCUE`/`CUENO`/`CUENAME` directly and a read is 0.01 ms.
- **`ObjectList` returns `{}`, not nil, for a missing object.** An empty table is
  truthy; treating it as a hit reports every sequence as present.

**Export / showfile:**

- **`Export Sequence` hard-crashes the console** on a cue Part holding non-empty
  `SelectionData` (`MA3_SYNTAX_REFERENCE.md:568`, ❌ 2026-08-27). Two truncated
  artifacts survive in the library. Honour `export-blacklist.json`; `"Command
  executed"` instead of `"OK"` is the failure tell. Note `SELECTIONDATA` is present
  as a table on *every* part, so a Lua-side check must test contents, not presence.
- **Exports are enormous** — 45 MB yielding 16 cues. Channel D is not cheap.
- **`/<prefix>/cmd` is 🔬, not ✅.** Wrong prefix is silently ignored, and
  `Receive Command` must be on in the OSC entry.
- **Deleting a recipe line renumbers the survivors.** Never cache a line index.
- **Show names truncate silently at 31 characters.**
- **`GetVar(UserVars(), n)` works; `UserVars():Get(n)` does not.**
- **A comma inside a `SendOSC` string ends it**, and the console still says `OK`.
  `oscSafe` turns `,` into `;`. `docs/MA3_READ_MODEL.md` § What survives.

## grandMA3 versions

On **2.3.2**, moving to **2.5 within ~6 months of 2026-09-20**. Every desk answer is
version-specific, so `LifeBridge.lua` probes the version first and stamps it onto
every emitted line; re-running it on 2.5 re-answers the whole set. Keep each run's
output, dated and versioned.

Exposure this project has that the Show Creator does not: 2.4 consolidated
**standard-recipe** range properties (`Speed From`/`To` → `Speed`).
`MA3_2.5_COMPAT.md` clears the generator because it writes those as MAtricks/Preset
properties. That exposure left with the cue editor (2026-09-27): nothing here
writes standard recipes now. It returns only if code ever writes them again.

## Prerequisites

Works on macOS and Windows; the dashboard's *target* is Windows on a booth
touchscreen, so a Windows checkout is a first-class case, not a courtesy.

| | |
|---|---|
| **Node** | `^22.20` (see `engines`) |
| **Lua** | any 5.x on PATH. `npm test` runs the 240-check plugin harness through it — `npm run test:lua` now names the prerequisite instead of failing obscurely. macOS `brew install lua` · Windows `winget install DEVCOM.Lua` |
| **MA3 library** | optional. Resolved per-platform by `scripts/ma3-library.mjs`: `~/MALightingTechnology/…` and, on Windows, `%ProgramData%\MALightingTechnology\…`. Absent, or **present but empty** (MA3 installed, exports not copied across: the normal state on a fresh Windows box), and the three export-parse tests skip and say which (`findCorpus`, since 2026-10-03; before, empty failed as `expected a large corpus, got 0`). A folder of exports that parse to nothing still fails |

`scripts/deploy-plugin.sh` is bash and needs Git Bash or WSL on Windows. It is
also **no longer the deployment path** — the plugin ships embedded in its XML
(`npm run build:plugin`), so there is nothing to copy onto a console.

⚠️ **Windows: junctions and symlinks may not traverse on a managed machine.**
Observed 2026-09-21 on the booth-class Windows box. `mklink /J` reports success
and `fsutil reparsepoint query` shows a correct Mount Point with the right
target, but reading *through* the link fails with "The system cannot find the
path specified" while reading the target directly works. That is a filesystem
filter driver, almost certainly endpoint security: machine policy, not a
setting to toggle.

It kills every symlink-based Node version manager, **fnm** and **nvm-windows**
alike, and they fail *silently*, which is the dangerous part: `fnm use 22`
prints "Using Node v22.23.2" and `fnm current` still answers `none`. Same
shape as the rule at the top of this file, a read that failed coming back
looking like an answer. Put Node 22 on PATH directly, or use a shim-based
manager (Volta) that never creates a link. Note `winget` cannot supply 22.x at
all: `OpenJS.NodeJS.LTS` is 24.x, which `engines` rejects.

## Running

```
npm install
npm test       # TS tests against the real library, then the Lua harness
npm run dev    # the kiosk, with the mock desk — keys 1-5 switch failure modes
npm run typecheck
npm run scan   # regenerate export-blacklist.json
```

`npm test` rebuilds `dist/` from the tested layer only, so it clears an app build.
`npm run dev` and `npm start` rebuild what they need; nothing else depends on the order.

Tests read `~/MALightingTechnology/gma3_library/datapools/sequences` and skip if
absent. ~50 s, because five real exports are 45 MB each.

**On the booth PC (Windows)**, from a checkout: `npm start` is proven on that box (and
since 2026-10-03 so is the installer, below). In `scripts/windows/`:
`kiosk.cmd` runs the build already there (building only if there is none), restarts
after a crash, and logs to `%APPDATA%\paua\kiosk.log`;
`install-startup.cmd` makes it start at login; `update.cmd` pulls and rebuilds, by
hand, never before a service. One kiosk per computer: a second launch only focuses
the first. ✅ On the Windows box, 2026-10-03: `kiosk.cmd` built when there was no build,
came back 6 s after a forced kill and stayed shut after a normal close; `update.cmd`
pulled, reinstalled and rebuilt in 43 s. ⚠️ `install-startup.cmd` not run (it writes to
this user's Startup folder; the owner's call), so start at login is unwatched.

**The installer (the way forward).** `npm run dist:win` builds
`release/Paua-Setup-<version>.exe` (107 MB; `LIFE-Lighting-Dashboard-Setup-…` before the rename): per-user, no admin
rights, unsigned (`Get-AuthenticodeSignature`: `NotSigned`), default icon, key built in.
✅ **It installs and runs on the managed booth-class Windows box, 2026-10-03**, built
there too: into `%LOCALAPPDATA%\Programs\life-lighting-dashboard`, opening on finish
and sharing the dev copy's settings (same `%APPDATA%\life-lighting-dashboard`).
SmartScreen **does** show on install (the owner, 2026-10-13: "minor"); unsigned, so expect it
on each new installer run by hand. That gates hosting on `visuals.prodapps.life`,
self-update and start at login, the next steps. Close the installed copy before a dev
run: one kiosk per computer, so the second only focuses the first.

## Next session starts here

**Pick up here (handoff, 2026-10-13, evening; the owner continues at home).**
- **Next: ProPresenter lower thirds**, the owner's to work on at home: the open questions in
  `docs/VISUALS_DASHBOARD.md` § Open questions, and `spikes/propresenter-playlist.mjs` (run it
  where ProPresenter is).
- **On main, not in a build:** the Holding fixes and Show mode. A tag when the owner says; the
  build no longer hits the Actions storage limit (one-day artifacts, the old 57 deleted).
- **1.2.0 is a draft on `paua-releases`** (and here): publishing it there is what offers it to
  the booths today.
- **Noted, not started** (TODO, top two): updates from this repo now it is public (one last
  publish on `paua-releases` as the bridge; rename the repo first if it is to be `paua`), and
  start at login.
- **The field results of 2026-10-13**: touch good in Pāua and the Cue Manager, the console lag
  fixed, the Spout picture good, settings survive a reinstall, SmartScreen shows (minor).
- **The Cue Manager's campus bug** (a device read-only on a one-off service: campuses taken from
  child PCO folders) is with another session on the Print Server: visuals-song-comms `CLAUDE.md`
  § Open: campuses taken from child PCO folders.
- This Mac: no kiosk or Vite running, no passcode set, volunteer, Show mode off.

**Where things stand (2026-10-13, evening, a Mac session).** **Merged into main, not in a
build:** the Holding fixes and **Show mode** (status rows), at the owner's ask; next is a tag for
the booths (`docs/FIELD_TEST.md` § Holding fixes, § Show mode). The owner takes the
**ProPresenter lower thirds** home next. The Holding fixes: the plan and result line, one-off
columns, the refused-load look-again and It's there, place anywhere, the same-code helpers,
and PROMO 1 onwards (status row, the Holding view; `docs/VISUALS_DASHBOARD.md` § The owner's
fixes, 2026-10-13). 364 tests and 256 Lua checks green. Checked in the dev kiosk on this Mac
over CDP against `spikes/arena-stand-in.mjs` and the live lookbook only.
**ProPresenter lower thirds** wait on the owner's answers (`docs/VISUALS_DASHBOARD.md` § Open
questions). Show mode's choices taken without asking are in its commit (`785209e`) and status
row. This Mac was left as found: the Arena
setting and graphics folder restored, the test layout and pins removed, no kiosk, stand-in or
Vite running.

**GitHub Actions storage, cleared 2026-10-13** (it had filled: 58 artifacts, 3.5 GB, against
0.5 GB). The release build now keeps its artifacts **one day** (`retention-days: 1`, on main
since the merge); the release jobs read them within the run and each
tag's release keeps the files. All old artifacts deleted at the owner's yes; every tag's release
still holds its installers. A Run workflow build without a tag must be downloaded within the day.

**The Cue Manager, seen 2026-10-13:** a booth device could not enter cues on a one-off service.
Cause: its campus is taken from a child PCO folder, not the top folder. Noted for a session on the
Print Server in visuals-song-comms `CLAUDE.md` § Open: campuses taken from child PCO folders.

**2026-10-11: v1.2.0 tagged** at the owner's ask, from a Mac session: the bar's alerts put away by
a × (all but the base show's), no countdown box when there is nothing to count, and Settings ›
Holding › **Add a column** (status rows: the plum look, the Timer view, the Holding map). Checked on
the Mac over CDP only (`docs/FIELD_TEST.md` § Alerts, the timer, Add a column). The first release to
reach booths as an update from 1.1.0, and the first whose build should draft its release on
`paua-releases` through `RELEASES_TOKEN`: ✅ **it did** (a v1.2.0 draft there at 07:24 with
`latest.yml`, both installers and the blockmap; checked 2026-10-13). Still a **draft**, so no booth
is offered 1.2.0 until the owner publishes it there.

**2026-10-11: v1.1.0 tagged** at the owner's ask ("I just want all these features in a new
release"), from a Mac session, with PRs #3, #4 and #5 merged: tabs named by a double tap; the reply
listener beside onPC on every address (onPC in session); **updates** (the bar's nudge, Settings ›
This computer); the **Holding map** (Settings › Holding). The public `lifenzrpewh/paua-releases`
repo was made the same day and 1.1.0 copied into it by hand from this Mac (no `RELEASES_TOKEN`
yet, so the build cannot). 1.1.0 is the first build with the updater: booths on 1.0.x install it by
hand once; updates come by themselves after that. All checked on the Mac only
(`docs/FIELD_TEST.md`).
**Published** the same evening, here and on `paua-releases` (its `latest.yml` answers publicly;
the packaged `app-update.yml` points there). The visuals app's PRs #1 and #2 (copy between cue
fields, devices following the current service, the run sheet noticing Planning Center, dragging a
song onto a song) were **deployed 2026-10-13** from the Print Server (visuals-song-comms `8b28488`;
the same day campuses became the top-level PCO folders only, so a booth can edit its own campus's
one-offs, and a whole PCO folder can be followed). The owner set `RELEASES_TOKEN` the same day, so the next
tag drafts its release on `paua-releases` itself (⚠️ not yet seen run). The desk's lag: fine since
(above, row 3).

**2026-10-11, merged:** auto-update (status row above). `lifenzrpewh/paua-releases` exists (made
2026-10-11). Waiting on the owner: a fine-grained token that may write its contents, saved as the
`RELEASES_TOKEN` secret here, so each tag's build drafts its release there itself. Then the
next tag's build drafts its release there too. ⚠️ Whether `--publish never` writes `latest.yml` on
the runner: check the first build's artifacts.

**2026-10-11, on main, not in a build:** tabs are named by a **double tap** (in or out of Edit
layout; the per-tab ✎ gone, the × inside the tab's pill). The **reply listener sits beside onPC
on every address** of this computer, not loopback only: onPC in a session replies to the network
card, which is why the owner's onPC-in-session test said "not answering" with OSC right
(`docs/MA3_READ_MODEL.md` § The link ping, item 4). ⚠️ Not yet against onPC in session. **Open:
the "lags like crazy" on a real MA3 Light**: ✅ **fixed** (the owner, 2026-10-13), with the OSC
row change (§ Status, row 3 must not send where the console hears itself).

**2026-10-11: v1.0.1 tagged** at the owner's ask, from a Mac session: the Spout receiver kept
across a tab switch and the views watching counted (the video status row above), plus what
merged into main since 1.0.0 (the Cue Manager signs in only as a device; the look's values
shared with the Cue Manager). Checked on the Mac against a stand-in sender only; for the booth
whose picture died on a tab change, `docs/FIELD_TEST.md` § The video across a tab switch.

**2026-10-09, branch `life-look`, pushed, not merged:** the look's values (colours, corners,
font) moved to **life-look** (github.com/lifenzrpewh/life-look, private), shared with the Cue
Manager, which took the plum look the same day. `src/renderer/look.css` is a committed copy, not
a dependency, because the release runners and booth computers hold no token; `npm run look:sync`
pulls the latest tag through `gh`, `npm run look:check` says if the copy was edited here or is
behind. `theme.css` maps `booth-*`, `accent*`, `state-*`, `warn`, `overtime`, the radii and the
font onto life-look's roles; nothing on screen changes (checked against the mock in a browser,
every token's computed value as before). To change the look: life-look, tag, sync both apps.

**2026-10-09: v1.0.0 tagged** at the owner's ask, from a Mac session, with `look-plum` merged
into main: the plum look below, nothing else new since 0.2.6. Checked on the Mac only, in the dev
kiosk and against the mock (`docs/FIELD_TEST.md` § The plum look). The build's result is on
`release-build-log`; publishing the draft is the owner's.

**2026-10-09, branch `look-plum` (merged the same day):** the owner asked to "work on changing the
styling of the app and updating anything left to do". The agreed plum look (status row above;
memory `design-from-the-booth-not-style-names`) is in: palette, Archivo, corners, the new bar with
its alert lane and fold handle, the console card gone to Connections' Console row, the Guide a
view, Testing for Mark. 338 tests and 256 Lua checks green, typecheck clean, checked in the dev
kiosk on the Mac over CDP and in a browser against the mock. Not done, not in the agreed list:
the playground's deeper view changes (a clip's name under its picture, Arena's now-playing hero).
Next: the owner's eye on it in the 1.0.0 build (`docs/FIELD_TEST.md` § The plum look). The rest
of the TODO list waits on the owner or a booth.

**2026-10-08, on main, not in a build:** Operator mode is **Admin**, opened by a **passcode**
(keypad or keyboard) with a **timeout setting**; **Connections** is a read-only list and
**Settings** (gear, Admin) holds the fields, plus Admin and **Top bar** (hide items); **one bar at
two heights** (folded keeps everything in place); the **clock no longer hides** behind Admin's
buttons; ProPresenter on **1025**. Checked over CDP in the dev kiosk on the Mac only
(`docs/FIELD_TEST.md` § Admin, Settings and the bar).

**2026-10-08: v0.2.6 tagged** at the owner's ask, from a Mac session: Operator is **Admin**,
opened by a passcode (keypad or keyboard) with a set timeout; Connections a status list and a
**Settings** gear; the bar the same folded or not, its items hideable, the clock never covered;
ProPresenter on 1025; Edit layout from a pencil on each window, for everyone; tabs renamed per
layout; a **Timer** view; one **Video** view for Spout/Syphon, NDI and capture; Restart video and
a no-picture reason after 10 s (the Spout "waiting forever" at one booth: likely two graphics
cards, unconfirmed); Holding's **overflow** into empty clips past the named columns. All checked
on the Mac against the mock only (`docs/FIELD_TEST.md` § 0.2.6). Waiting on the owner:
`spikes/propresenter-playlist.mjs` run at a booth (ProPresenter's announcements: a presentation
playlist, base items then announcements; the plan is a Smart Playlist folder plus a PUT of the
playlist, announcements told by their lookbook code). visuals-song-comms branch `devices-wording`
(Booth devices → Devices) was merged on 2026-10-09.

**2026-10-06: v0.2.5 tagged** at the owner's ask, from a Mac session: operator-only buttons
not drawn in volunteer mode, Layouts as a dropdown over the windows (and in the folded strip),
the normal background filling HOLD BG's gaps in Update all, a PREACH column. Checked in a
browser against the mock desk only; nothing yet in the kiosk on the Windows box or against
Arena (`docs/FIELD_TEST.md` § 0.2.5).

**Where things stand (2026-10-05, about 3 pm).** **v0.2.3 is tagged** at the owner's ask, carrying
everything below plus **NDI sources as views** (status row above; `docs/VISUALS_DASHBOARD.md`
§ NDI sources as views has the route, the numbers and the choices taken without asking). The
kiosk here runs it, with Arena's composition NDI added as a source and its tab in the owner's
right-hand window (put there by a pop-out brought back during testing; remove it if unwanted).
Clear old FGs is still never pressed, and went into 0.2.3 that way. **Capture inputs**
(Blackmagic, ATEM, OBS Virtual Camera, webcams) followed the same afternoon and are **tagged v0.2.4**
(status row above); the owner closed the session after asking for the release.
The kiosk here runs it, volunteer mode, no capture input added.

**Earlier, about 2 pm.** On main since v0.2.2, not in a build: the **video
freeze on Arena's fades is fixed** (Arena's picture carries alpha and a fading layer goes
transparent, so the view drew over the last frame; now each frame is drawn on black; the owner:
"seems good now"); the **Lookbook view** (one look a row, the lookbook's composed picture, Load per
look); **Clear old FGs** (a tick in Update all's confirmation and a header button; never pressed);
the **Creative Guide** behind Guide on the top bar; the A-screen layer found as **A SCREEN BG** (the
owner's rename) as well as PRE & POST; and `[video]` stall lines in the log. The choices taken
without the owner's answer: the Lookbook as its own view beside Holding rather than merged, what
"old" means for a foreground, the guide's address fixed rather than a setting
(`docs/VISUALS_DASHBOARD.md` § The Lookbook view, § Clear old FGs, § The Creative Guide).

**Earlier that afternoon (v0.2.2).** **v0.2.2 is tagged and both builds passed**
(run 37244795777: `Paua-Setup-0.2.2.exe`, `Paua-0.2.2-arm64.dmg`, 289 tests green on the Windows
runner); the release waits as a draft for the owner. New in it, all from the owner's asks that
afternoon: the **Holding view as pictures** (only what needs a look is marked, a dashed "+ place"
tile where an item belongs, a No column tray for **one-offs placed per service**, the inspector's
"Use the lookbook's" / "Arena's is right"); **a clip on screen may be replaced** after a red tick
at the confirmation; the lookbook download is a tick too; the **Media row is one line** opening
Holding; **tabs dragged** in Edit layout; a **slimmer top bar** (60 px) that **folds** to a 36 px
strip; and the **video addon's ring build** (three staging textures and a GPU fence: fades no
longer tear, in theory; 47-48 fps from Arena's 50, was 27). `docs/VISUALS_DASHBOARD.md` § The
Holding view (edge cases), § Windows (tab drag), § The look (bar) and § The video feed (tearing)
have the details. Left: the owner's eye on a full-screen fade and on a live replace, and
everything by finger (`docs/FIELD_TEST.md` § 0.2.2).

**Earlier that afternoon.** The owner loaded an up-to-date **Central
composition** into Arena here, and the media work went from a check to a tool, all on main
since v0.2.1 (not in a build): the media check **follows the run order's service** (the Cue
Manager's `/s/<plan>` against the lookbook's `planningCenterPlanId`); the **Holding view**
shows the holding layers against the run sheet; files are told by **code and size** (the
lookbook's are the drive's byte for byte); **Place** and **Update all** put each run-sheet item
into **its column by Arena's layer-group column names** (PRE, POST, WTL, NSL, BIBLES, WTG,
PROMO); the **lookbook is the backup** when the drive lacks a file, asked at the confirmation;
**nothing is written to Arena without a confirmation**; **Browse** for folders; **Edit layout**
on the top bar. One lesson paid for: a first Place guessed slots per layer and the owner's
Place all put the PM foregrounds in the wrong columns, so the rules now read the names a campus
gives its columns and place nothing while there are none (memory: confirm a booth program's
layout before writing to it). `docs/VISUALS_DASHBOARD.md` § The Holding view and § Fetching
media have it all.

**Earlier that morning:** the UI overhaul was tagged **v0.2.1**. Builds are watched from here
through the `release-build-log` branch (no `gh` or token on this box, and the repo is private,
so the API answers 404); publishing a draft is the owner's. Testers get the installer passed on
or are added as collaborators (the owner's call).

**The UI overhaul (2026-10-05).** The owner asked overnight for a deep UI and UX
clean-up with design options; three directions were mocked (A Pāua, B Console, C Studio)
and **the owner chose A**, with the neutrals moved halfway back towards the original greys,
and had it merged that morning. What changed is in the status row below
(`src/renderer/components/ui.tsx`); nothing about what the app does or guards changed. The
skin is `theme.css` plus `ui.tsx`; the structure (three-zone bar, one Layouts button,
list-and-detail Connections, sheets, drawn edit handles) is separate from it. **Tagged
v0.2.1** the same morning for the field-test builds (the release drafts itself on GitHub
for the owner to publish; `docs/FIELD_TEST.md` § The new look). Not yet tried by a finger
on the booth screen.

**Where things stood before it (2026-10-05, after 1 am).** Since v0.2.0, on main and not in that
build: **anyone drags the edge two windows share** (the owner's ask: the divider's "just adjust
the windows", for volunteers), and **Fetch** in the media check, which copies the lookbook's
file from a graphics folder to a local folder and loads it into Arena's clip (✅ Arena 7.28
takes a file into a clip over REST, by hand; the button's own load not yet watched;
`docs/VISUALS_DASHBOARD.md` § Fetching media). Before that, overnight: the list is done and **v0.2.0**
is tagged and **both builds passed** (run 37199608805: `Paua-Setup-0.2.0.exe`, `Paua-0.2.0-arm64.dmg`,
257 tests green on the Windows runner); the release waits as a draft for the
owner to publish (`docs/FIELD_TEST.md` has what to check). New in it: **embeds** (any web
page as a view, own sign-in each, zoom), **windows on a 12 × 8 grid** with tabs and Edit
layout (replacing the two slots and the divider), **saved layouts**, pop-outs that offer
**Show** and can be **sent behind**, the **pāua icon**, **windowed mode** and **MARK**. All
driven in the kiosk on this box over CDP; none yet by a finger, on a booth, or signed in to
Google. The choices taken without asking are in `docs/VISUALS_DASHBOARD.md` § Windows,
embeds and layouts: read them first and change any the owner disagrees with. Before
0.2.0, on 2026-10-04: against **onPC** here, link LIVE, the showfile chip, Save As and Load
from the app; against **Arena 7.28**, what plays with time left, Clips, the missing-file
notice, the media check and the Video view (16 bpc included). What is left needs a booth:
the real console, and Arena with the show's media.

**This Windows box:** Arena serves on **8090** (moved 2026-10-03 off the MA web remote's
8080); the dashboard's Arena setting is `127.0.0.2:8090`; the VFX layer group runs at 1.795×
speed. The show's VFX media drive (`I:\VFX Media Renamed`) and the NAS are not on this box;
the Sunday graphics are, on `G:\Sunday Media`.
**onPC** here: interface loopback, show "Dashboard Testing" and the `Show 2026-10-04 …` test
saves (2154 loaded last); OSC row 1 on 8003 receiving, row 3 replying to 127.0.0.1:8004 (row 2
a leftover copy, off). onPC also holds 0.0.0.0:8004, and the kiosk's 127.0.0.1:8004 bind still
gets every reply. The web remote ignores pasted text and drops shifted keys; type lowercase
and use MA's on-screen Shift. Driving the kiosk: start it with
`electron . --remote-debugging-port=9223` and send CDP input; a held press can be cancelled
by a real mouse moving over the window, so check the log said "sent".
Left at about 2 pm on 2026-10-05: the kiosk runs c1767d2's build (main from a restart at 13:47,
the page reloaded after the video fix) with the **ring build of the addon** (`vendor/texture-bridge/`,
BUILD.txt names it; a running kiosk locks the `.node`, so stop it before `git checkout
origin/texture-bridge-build -- vendor/texture-bridge`), in volunteer mode, on the owner's own two
windows: the run order, and Arena, Clips, Holding, Video, MA, a dead tab of the removed Creative
Guide embed, the **Marvelous Item Brief** embed (a Google Sheet, the only embed) and Lookbook
(showing). The Video view is on `Arena - MULTIVIEW`. Its bar is expanded (`paua.barCollapsed` unset);
the saved layouts list is empty. **The console link has been unreachable since 13:21**: LifeBridge
stopped answering in onPC (onPC still running; nothing of this session touched the link), so look
at onPC before trusting the showfile chip. No test senders are left running; the 16-bit stand-in
is built at `%TEMP%\spout-16bit-sender.exe` (build it from PowerShell: Git Bash mangles csc's `/`
flags). `npm test` clears the app build, so `npm run build:app` before a spike that imports
`dist/src/main`. It was started detached (PowerShell `Start-Process` on
`node_modules\electron\dist\electron.exe . --remote-debugging-port=9223`), because a kiosk
started as a session's background task is killed at that task's time limit. **The owner uses
this kiosk too**: read the page (Connections open, operator mode) before sending CDP input.
The Cue Manager is a CDP target of its own ("LIFE Visuals"): clicking its `a[href="/s/<plan>"]`
links moves the run order in-page, which is how a session points the check at a service (4 Oct
is `/s/90226424` AM, `/s/90226447` PM). CDP screenshots show only Pāua's own page: the MA,
run order and embeds are native views and come out as their placeholders. To look at a layout
without disturbing the owner's, swap `life.layout` in localStorage, reload, and put it back
after. Publishing an artifact with separate image `files` was refused by a Read permission
rule; inlining the images as data URIs worked.
**Arena** holds the owner's Central composition (deck AM; files in a local OneDrive
`Media\AM` folder). The **HOLDING group's columns are named** PRE 1, POST 2, WTL 5, NSL 6,
BIBLES 7, WTG 8, PROMO 1 to 6 at 11 to 16; **A SCREENS's** PRE and POST; the composition's own
columns all stay `Column #`. HOLD FG was emptied by the owner after the misplaced Place all and
may hold anything since. **CB095 is a test file** (the owner: ignore it; its drive copy is
`-v4`, the lookbook's `-v5`, Arena's an old PNG). The **Arena row**: graphics folder
`G:\Sunday Media\1. Central` (a drive on this box, with `- Copy` duplicates; it lacks
CF464), local folder `D:\Holding` (the five files the Place all copied are there). No "same"
confirmations are kept (`media-same.json` is empty). The lookbook has no service dated after
4 Oct yet, so test against 4 Oct by pointing the Cue Manager at it.
Writes to
Arena from a session need the owner's go-ahead (this box's safety check stopped one); the
owner did the loads through the button themselves. `npm test` clears `dist/`, so a dev kiosk
reloaded after it loses its preload: `npm run build:app` and restart. For edit scripts, a bash
heredoc holding backticks or backslashes breaks, and so does a regex inside a `node -e`
template string (backslashes vanish): write the script with the Write tool, or use Edit.
Watching a GitHub build from here: `git fetch origin <branch>` in a loop, one branch at a time;
naming a branch that does not exist (`texture-bridge-build-log` before any failure) fails the
whole fetch silently, and a watcher written that way never sees the build land.

### Improvements, in order: "work on what is listed in the md"

**When the owner says "work on what is listed in the md" (or similar), this is the
list: work down it in order, unattended.** Commit and push after each piece that
works (`/handoff` § 4's style). Check each piece in the kiosk on this box over the
debugging port (`electron . --remote-debugging-port=9223`, CDP input); mark ⚠️
whatever only a finger or a booth can confirm. Don't stop to ask: where a choice is
open, take the plainest one, say so in the commit, and list it for the owner. Keep
the tests green and the typecheck clean at every commit.

Done overnight, 2026-10-05, each its own commit and status row above: ✅ embeds, the grid
windows with tabs, saved layouts, pop-outs with Show and Send behind, the icon, windowed
mode and MARK, and v0.2.0 tagged. The owner's decisions behind them (2026-10-04) are kept
in the code's headers (`src/shared/layout.ts`, `src/shared/embeds.ts`,
`src/shared/popout.ts`). **The list is empty**: next is the owner's reply to the choices
in `docs/VISUALS_DASHBOARD.md` § Windows, embeds and layouts, then the items below.

For the owner to try first, by finger on the booth screen: Edit layout (drag a window, an
edge, a corner; freeform since 2026-10-05: does the 16 px snap feel right), a Google Sheet
as an embed and its sign-in, and whether an eighth of the screen each way is a sensible
smallest window.

Later, not tonight:
- **Fetch missing media**: built 2026-10-05, with placement by column names and the lookbook
  as the backup; its next step is the top of the TODO below.
- **NDI sources as views**: built 2026-10-05 and in v0.2.3; next, a camera or ProPresenter as
  the source, and another machine's over the network.
- **Capture inputs**: built 2026-10-05, in v0.2.4; next, a real Blackmagic card (and
  whether it opens while Arena holds the same card), OBS with its virtual camera started, then
  a build.
- Start at login. Self-update: built 2026-10-11 (status row, Updates).
- **Show mode**: built and merged 2026-10-13 (status row). Not done: switching the window to
  full screen with it (that stays in Settings › This computer).
- **A service report** (high flag): from the log, LIVE, drops, saves and loads, clips
  fired, on screen or sent to the LD. **Save reminders** for MA3 and Arena. **Help per
  view** ("?"). Then, interested: a big countdown view, connection history (an hour's
  strip per row), a read-only phone view on the booth network.
- Parked: the pre-service check. Declined: stage messages (not this desk's role), clips
  for this service (another role fires clips from a Stream Deck), panic to black, dim
  mode.

### TODO, in order

0. **Updates from this repo, not `paua-releases`** (the owner, 2026-10-13, noted, not started:
   "why not point the updater at the main repo"). `lifenzrpewh/life-lighting-dashboard` is
   **public** now, so the second repo's reason (a private repo) is gone. The change: `publish` in
   `package.json` and `RELEASES_PAGE` in `src/shared/updates.ts` to this repo, the headers of both
   updates files, and the `paua-releases` step in `.github/workflows/release.yml`. **The bridge**:
   booths on 1.1.0/1.2.0 have `paua-releases` baked in, so the first build pointing here must be
   published on `paua-releases` once more; after that, here only (then drop the step and the
   `RELEASES_TOKEN` secret). Do the repo rename to `paua` **before** that build, or the feed bakes
   in the old name. Meanwhile 1.2.0 is a draft on both: publishing it on `paua-releases` is what
   offers it to booths today.
0. **Start at login** (the owner, 2026-10-13: "would be good"; not started). Plan: Electron's
   `app.setLoginItemSettings({ openAtLogin })` from main, packaged builds only (it registers
   Paua.exe, which starts the watchdog, `src/main/entry.ts`); IPC get/set, the set Admin's; a card
   in Settings › This computer (`settings/computer.tsx`) with On/Off. A checkout keeps
   `scripts/windows/install-startup.cmd`. ⚠️ Whether a managed booth box lets the Run key stand.
0. **A build of main** (Holding fixes and Show mode, merged 2026-10-13) when the owner says; at a
   booth, the checks in `docs/FIELD_TEST.md` § Holding fixes and § Show mode, and the next real
   404's `[arena] POST` line.
0. **ProPresenter lower thirds:** the owner's answers first (`docs/VISUALS_DASHBOARD.md`
   § Open questions), and `spikes/propresenter-playlist.mjs` run at a booth.
0. **v0.2.5 on GitHub** (the owner's): check its build on `release-build-log`, then publish the
   draft and delete the older drafts. `docs/FIELD_TEST.md` § Volunteer mode, Layouts,
   backgrounds (0.2.5) is new: operator-only buttons hidden in volunteer mode, Layouts as a
   dropdown (also in the folded strip), the normal background filling HOLD BG's gaps, PREACH.
0. ✅ **Settings survive a reinstall** (the owner, 2026-10-13). By design an
   upgrade or a reinstall keeps everything, since it all lives in `%APPDATA%\paua` (settings,
   DPAPI-sealed MA passwords with their key in the same folder's `Local State`, the Cue Manager's
   and embeds' sessions, saved layouts in Local Storage, `media-same.json`) and the NSIS
   installer keeps the same `appId` and does not delete app data on uninstall. Not yet seen:
   install 0.2.5 over 0.2.4 on the booth box and confirm addresses, MA logins, the Cue Manager
   sign-in and saved layouts all survive. A different Windows user starts empty (and DPAPI
   passwords cannot move between users).
0. **Clear old FGs, pressed once with the owner** (never pressed yet, though shipped in 0.2.3):
   what Arena 7.28 does with `/clips/by-id/<id>/clear`, and that only the listed HOLD FG slots
   empty; then the owner's word on what "old" means (`docs/VISUALS_DASHBOARD.md` § Clear old FGs).
   Also a Lookbook **Load**.
0. **NDI, the owner's word** on the choices in `docs/VISUALS_DASHBOARD.md` § NDI sources as views
   (60 fps at ~60% of the page, sources from the list only), and a camera or ProPresenter tried.
0. **The owner's word** on the Lookbook as its own view (not merged with Holding) and the guide's
   fixed address.
0. **The console link**: unreachable since 13:21 on 2026-10-05 (LifeBridge silent in onPC); look
   at onPC, re-import LifeBridge if it lost it.
0. **A live replace, with the owner**: Update all with a clip on screen, the red tick, and what
   the audience sees as Arena opens a file into a playing clip. Also whether a file loaded over
   another keeps the clip's settings, and the real NAS path at a booth.
0. **The owner's word:** "Copy here" left with the old Media list (bring it back in Holding?);
   tab drag by finger (does the strip scroll instead of the tab dragging?).
0. **The column pattern at every campus** (the owner's, in Arena): name the HOLDING group's
   columns PRE, POST, WTL, NSL, BIBLES, WTG and PROMO (`docs/VISUALS_DASHBOARD.md` § The
   Holding view). A column renamed while Pāua runs may be read only at Arena's next composition
   push: restart Pāua, or subscribe to the group columns' names if it bites.
0. **The owner's word** on the choices taken without an answer: Fetch, Same, Place and Update
   all in both the Media row and Holding (trim one?); a name alike at half its words shared
   (PROMO only now); Update all including different-file codes.
0. **By finger on the booth screen:** the new look (`docs/FIELD_TEST.md` § The new look),
   Layouts › Edit this layout, the shared-edge drag and its snap, a Google Sheet as an embed
   and its sign-in; and the owner's word on the choices in `docs/VISUALS_DASHBOARD.md`
   § Windows, embeds and layouts and § The look.
0. **The media check, by finger** (`docs/VISUALS_DASHBOARD.md` § Answered (owner,
   2026-10-04): the media check): following the run order, "different file" by size, Same and
   Undo, the Holding view's Inspect. Open: whether countdowns (D) belong.
0. **Arena:** see a real missing file in the Clips view and the notice; the multiview
   layout, in Arena (the owner's). The brief slot waits on where a brief's link lives; no
   countdown chip (dropped). QLab is parked (`docs/QLAB.md`).
0. **After the installer:** ✅ SmartScreen shows (minor), ✅ **Windows touch is good** in Pāua
   and the Cue Manager (the owner, 2026-10-13). Self-update built; **start at login** wanted
   (the owner, 2026-10-13).
0. **The GitHub repo rename to `paua`** is the owner's to do on GitHub (no `gh` or token on
   this box); then `git remote set-url origin https://github.com/lifenzrpewh/paua.git`.
0. **Showfile:** does a Load ever freeze onPC again (once, 2026-10-04, after a cancelled
   confirm dialog). Research: a showfile read that stays off the command line. A Load ends
   the watcher, so the new name waits for the next ask, once a quiet minute, two lines each.
   Leads, unverified: whether `CmdIndirect` runs `SendOSC` without the echo, and whether a
   show can start its watcher itself on load. The bare ping cannot carry the name (❌
   variables do not expand in `SendOSC`).
0. **Every booth show needs the OSC rows and LifeBridge** (✅ 2026-10-02: a Load replaces
   OSC settings). The work is the Show Creator's: its `docs/ROADMAP.md` § From the Lighting
   Dashboard.
1. **Sign the booth PC's Cue Manager in** with its own QR, as its own device, so one
   lost PC can be revoked alone. Since 2026-10-09 the pane offers nothing else: the QR when signed
   out, "sign out and pair as a device" when a person is signed in (`docs/FIELD_TEST.md` § The Cue
   Manager as a device).
2. **The MA pane, still to watch firing:** Web Remote off then on, and a console restart.
   `docs/MA3_READ_MODEL.md` § Stuck pages.
3. **For a real console:** the six checks in `docs/MA3_READ_MODEL.md` § Web remote, and
   Save As and Load against a desk (seen on onPC only). Build the volunteer layout view on
   the MA user `Remote`; HOLDING and PRE/POST are its biggest targets.
4. **Housekeeping:** delete the retired run order (`src/backend/`, `src/main/backend/`,
   `src/shared/{backend,service}.ts`, its tests and the mock's schedule) once the Cue
   Manager has run a service.

**Ending a session:** `/handoff` (`.claude/skills/handoff/SKILL.md`) commits, pushes,
brings these docs up to date and clears.

**Decided, not forgotten (2026-09-30):** no start times and no NOW highlight,
because the backend stores neither (no plan or item times are synced, and
`pco_plans.is_live` is set but never cleared). `nowItemId` stays in the type as
the seam. The Cue Manager's own booth mode moves a current item locally, by key
or tap; we declined that here.

**Seen in `visuals-song-comms`, not ours to fix:** `is_live` is never cleared, and
`upcoming_service_cue_status` counts a song twice when it has two notes (both
confirmed on the server 2026-10-01, fixes proposed there, not applied). **Fixed
2026-10-02**, because the booth now is the app: `current_user_context()` has its
visible-campus filter back (`20261002100000`), so a booth lists only its campus, and
"today" is the New Zealand date (`nzDate`, `2675660`). `pco-sync` is locked down now.

### How the pieces work, briefly

**The windows** (`src/shared/layout.ts`, `src/renderer/components/Grid.tsx`) sit on a 12 × 8
grid and hold tabs. The pages main draws (the MA, the run order, each embed) are placed
from the App over the body of the one tab that is their home
(`src/renderer/panePlacement.ts`, one `PanePlacer` per page), so a page changing windows
moves rather than reloads. While Edit layout is on, every page is hidden and a picture of
it stands in (`pane-snapshot.ts`), so the grid's handles can be drawn.

**The run order** is the Cue Manager itself (`src/main/cue-pane.ts`), placed like the
MA pane.
It signs itself in, by emailed code or its own QR, keeps that sign-in and its offline
queue in a persistent session, and is a picture, not a reading: the app shows its own
offline banner. A tab switched away hides it without reloading, so a half-typed note
survives. Input in it counts toward operator mode's idle timer.

**The showfile chip.** LifeBridge's `show` verb makes SaveGuard's verdict on the
console, because the trip mangles names (`docs/MA3_READ_MODEL.md` § The showfile).
- **Deploying LifeBridge:** `npm run build:plugin`, copy `console-plugin/LifeBridge.xml`
  into `gma3_library/datapools/plugins/`, then **delete** the plugin and import.
  Importing over it keeps the old code running.

**Testing against onPC on this Mac.** The dashboard's settings are already right:
console `127.0.0.1`, OSC 8003, replies 8004. In onPC:
- Menu › Network interface **127.0.0.1**. With the booth's `en5` selected and
  absent, onPC opens no OSC sockets at all.
- Web Remote **On**.
- OSC row 3 sends to `127.0.0.1:8004`; a row on 8003 has Receive and Receive
  Command on, Send off.
Then `npm run dev` and press `0` for the real link. `lsof -nP -iUDP` shows onPC's
sockets directly. Keep this Mac off the booth network while testing: it is set
to rejoin the live session. Details in `docs/MA3_READ_MODEL.md` § The link ping.
Admin is a tap on Volunteer and its passcode (none set: a tap).

**Console track — keep it small.** The link and showfile info were all the MA pane
left it, and both are built. The `pool` verb waits until something needs that join.
Keep the probe's guarantees: read-only on the show except an allow-listed Save As,
no generic `cmd` verb in the shipped build, results that fail rather than return a
plausible value.

**Do not** make the shell fall back to plausible data while sources are missing.
`readingOf` returning UNKNOWN with nothing wired is the design working, not a gap
to paper over — see the header of `src/shared/reading.ts`.

## External files that matter

In this repo: `docs/PLAN.md`, `docs/MA3_READ_MODEL.md`, `docs/VISUALS_DASHBOARD.md`,
`docs/QLAB.md` (the video countdown, researched and parked: no Mac), and the raw probe report
at `/Users/Shared/LIFE/LifeBridge-probe.txt` (not in git — regenerate by running
the plugin).

`GrandMA3 Show Creator/docs/` — `BOUNDARIES.md` §3 (object-range map / write
allow-list), `MA3_SYNTAX_REFERENCE.md` (syntax oracle), `LEVEL_STATES.md`
(HOLDING/PRE-POST + the SNAP trap), `MA3_2.5_COMPAT.md`.
`companion-module-grandma3/` — `console-plugin/CompanionFeedback.lua:57` (`SendOSC`
form), `src/osc/{parse,apply}.ts` + `src/state.ts` (MIT; vendor these only if
channel B comes back — the MA pane made it unnecessary for button feedback).
`ma3-mcp/plugin/mcp_server.lua` — **hazard reference only. AGPL-3.0, do not fork.**

`visuals-song-comms` (GitHub, private) is **deployed and in production use** despite
looking dormant. It is the shared Supabase backend: PCO ingest, auth, campuses, and
the existing `lighting_cues` field on `note_values`. Extend with append-only
migrations; don't rebuild it.
