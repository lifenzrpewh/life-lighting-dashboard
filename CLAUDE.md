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
| ✅ `src/main/settings.ts` | Console address, port, MA users; passwords via the OS keystore. macOS Keychain, and **Windows DPAPI on the Windows box, 2026-10-04**: an operator password saved sealed (no plaintext on disk), still opened after the data folder was moved for the rename, then removed. |
| ✅ `src/renderer/mock.ts` | The mock lying desk: healthy / stale / silent / unreachable / cold, keys `1`–`5` in dev. Drives the real derivation, not a parallel one. |
| ✅ `src/bridge/osc.ts` | OSC 1.0 decoder. An unknown type tag fails the **whole message**, not just that argument — OSC args are positional, so skipping one reads every later value at the wrong offset and a fader level becomes whatever four bytes sit there. |
| ✅ `src/bridge/channel-b.ts` | Executor updates off the wire. A channel C push is `other-channel`, not an error: one port carries both. The middle `,sif` integer is carried un-named because its meaning is still unobserved. |
| ✅ `src/bridge/coalesce.ts` | Newest-wins per object, time-free so the caller owns the frame rate. Drops superseded values, never unseen ones. |
| ✅ `spikes/channel-b-live.mjs` | Points the **shipped** decoder at the desk, so the unit tests are not the only evidence. Sends nothing. |
| ✅ `src/renderer/components/ShowfileSheet.tsx` · `src/shared/showfile-write.ts` · LifeBridge `shows` | **Save As and Load** from the showfile chip's ▸ (2026-10-04; the console card since the 2026-10-05 look): offered names (campus + NZ date and time, 31-char meter), read back before "saved"; Load from the console's own list, operator mode, live link, save-first ticked, 3 s hold. **On onPC 2.3.2.0 on the Windows box, 2026-10-04:** Save As read back in ~2 s once it sent `/NoConfirmation` (a bare `SaveShow` left a confirm dialog on the console and saved nothing); Loads read back in 22 s and in over 60 s. One Load froze onPC on its progress bar, in the session where that dialog had been cancelled; the same Load on a fresh onPC worked. "Save first" saves a changed show (its file rewritten the moment the Load went) and leaves an unchanged one alone. `docs/PLAN.md` Phase 3. |
| ✅ `src/bridge/showfile.ts` · LifeBridge `show` · `watch` | The showfile chip. **LIVE against onPC 2.3.2.0, 2026-09-30**: `ON BASE SHOW Mount Eden Base`, read on link-up and again 5:04 later in a quiet gap. **Watched since 2026-10-02**: the ask is `watch`, and LifeBridge then pushes any change within a second (the chip went amber 1.8 s after a base change, in the kiosk). A Load ends the watcher, so a Load still waits for the next link-up or ask. An older plugin's `unknown verb watch` falls back to `show`. `docs/MA3_READ_MODEL.md` § The showfile, watched. |
| ✅ `src/main/cue-pane.ts` | The Cue Manager (`visuals.prodapps.life`) as a `WebContentsView` in the run order's column. Persistent session (sign-in, service worker, offline queue survive a restart), locked to its origin, 15 s load timeout, Reload beside it, its Connections row can clear it. **Working on this Mac, 2026-10-02 (owner-observed):** signed in by the app's own QR as a booth device, songs-only and note editing both work. Server side: `visuals-song-comms` `2675660` (booth devices edit), migrations `20261002090000_pairing_kind` and `20261002100000_booth_device_edit`. Not yet on Windows. |
| ✅ `src/renderer/components/ConnectionsPanel.tsx` · `src/shared/connections.ts` | **Connections**: one row per connection (Console, OnTime, ProPresenter, Arena, Cue Manager), status in a word, tap to open its fields with its own Save. Replaced the Settings form 2026-10-02; the status bar keeps LIVE, show, countdown, clock and a Connections button whose dot is the worst connection that is set up. Everyone sees it, operator mode edits. A connection not set up is `off`, never `down`. Owner-checked on the Windows box, 2026-10-02: "functionally works". |
| ✅ `src/bridge/arena.ts` · `src/main/arena.ts` | Arena's link: `GET /api/v1/product` every 2 s, its row in Connections. Against Arena 7.28 on the Windows box, 2026-10-02. |
| ✅ `src/bridge/arena-live.ts` · `src/main/arena.ts` | What Arena plays, over its websocket: each composition push gives which clip is connected on each layer, subscriptions keep the faders current, and the link poll keeps it from going stale. Read against Arena 7.28 on the Windows box, 2026-10-03, in the kiosk. Shown as the Arena view in a slot, thumbnails through main on an `arena:` scheme; the kiosk log names what plays. Each playing clip shows its time left, at the clip × group × composition speed (LIFE's VFX group runs at 1.795), watched counting a video down to `0:00 held` on 2026-10-03. `docs/VISUALS_DASHBOARD.md` § Seen on Arena (2026-10-03). |
| ⚠️ `src/shared/layout.ts` · `src/renderer/components/Grid.tsx` · `src/renderer/layoutStore.ts` | **Windows, freeform, MA3-style** (2026-10-05, the owner's decisions of 2026-10-04; replaced the two slots of 2026-10-03 and their divider). **No grid since the night of 2026-10-05** (the owner: freeform, but never overlapping): places in units of a 1200 × 800 screen, a drag that follows the finger, edges snapping within 16 px onto the screen's or another window's, a resized edge stopping flush against a window in its way; a grid layout and the saved layouts come across × 100. Owner-driven by mouse in the kiosk that night (a run order 517 units wide, a window added under the MA, the edge between them moved). Never overlapping; each with tabs, tapped by anyone. **Edit layout** (operator mode, in Layouts): pages become pictures, drag a window to move it, an edge or corner to resize; a move over another window shows red and is not taken; + and × for tabs, a tab dragged to reorder or into another window (2026-10-05), Add window, Remove window. A page (MA, run order, embed) shows in one tab at a time; another tab of it says so and offers **Move it here**, which moves the page without logging in again. **For everyone, out of Edit layout:** the edge two windows share drags (a grip in the 12 px gap, the one place a page cannot cover), the windows on one side growing as the other side's shrink, pages as pictures while dragged (2026-10-05, the owner's ask: the old divider's "just adjust the windows"; dragged both ways as a volunteer over CDP). A turned-off connection's tabs leave and come back. Default: run order on the left third, MA on the rest; a machine's old slots come back as its two windows. In the kiosk on the Windows box over CDP, 2026-10-05: resized, moved, refused a move onto the MA, added a window with Arena and a second MA tab, moved the MA into it (1359×403, no new login). ⚠️ Not yet by a finger. Video's Fit is a pop-out's only now. |
| ⚠️ `src/renderer/components/LayoutsPanel.tsx` · `src/shared/layout.ts` (saved layouts) | **Saved layouts** (2026-10-05): Layouts in the top bar opens the list in the windows' place, each layout drawn as a picture of its windows (2026-10-05 look); anyone taps one to switch, and the button names the layout on screen (same windows and tabs, whichever tab shows). Operator mode saves the layout on screen under a name (the same name replaces it) and deletes with a second tap. Up to 12, in this computer's storage (`paua.layouts`). In the kiosk over CDP, 2026-10-05: two saved, switched as a volunteer, the MA back in its saved window. |
| ⚠️ `src/renderer/theme.css` · `src/renderer/components/ui.tsx` · every component | **The overhaul, direction A "Pāua"** (2026-10-05, overnight, the owner's ask; **the owner chose A**, with the neutrals moved halfway back towards the original greys, and merged it the same morning). Cool slate neutrals and one iridescent accent, nacre, only on the tab showing, operator mode and editing; IBM Plex Sans and Mono and lucide icons, all bundled (no fetch). Shared pieces in `ui.tsx` (Button, IconButton, Segmented, Sheet, Card, Placeholder, Dot, view icons). The bar in three zones (60 px since the afternoon of 2026-10-05, and a chevron folds it to a 36 px strip): a console card (link and show; tap for the showfile sheet) left, countdown and clock centred, Layouts · Connections · Mark flag · mode (a lock) right; operator mode lays the nacre line under the bar. One Layouts button: layouts as pictures of their windows, Edit this layout and Save inside (operator). Connections as a list and a detail; Showfile as two cards a screen apart; windows with edges, icon tabs and icon tools; Edit layout draws its handles; Add window opens its view menu. In the kiosk on the Windows box over CDP: every screen, volunteer and operator, a pop-out and back, Add window. ⚠️ Not by a finger. |
| ✅ `src/main/pane-snapshot.ts` · `src/renderer/components/Still.tsx` | **Pages as pictures**: each page stands in as a picture of itself while the layout is edited, since nothing can be drawn over a live page (first for the divider, 2026-10-03, owner: "feels good"; for Edit layout, 2026-10-05, taken before the pages are hidden). |
| ⚠️ `src/main/popout.ts` · `src/shared/popout.ts` · `src/renderer/PopOut.tsx` | **Pop out**: any tab's view (embeds too) into a window of its own, on top of the kiosk; every tab of that view says so and offers **Show** (forward, on top) and **Bring back**; the pop-out's **Send behind** lets the kiosk over it (2026-10-05: sent behind, Show focused it, Bring back closed it home, over CDP; the stacking itself not watched by eye); closing the window brings the view home, as does a kiosk reload. The MA and run order move page and all. Seen working in the kiosk on the Windows box, 2026-10-03, driven over the debugging port; not yet by a finger or on a second display. `docs/VISUALS_DASHBOARD.md` § Pop a view out. |
| ✅ `src/renderer/components/ClipsView.tsx` · `src/bridge/arena-control.ts` | **Clips**, the trigger screen (2026-10-04): Arena's grid in a slot or popped out; tap a clip, fire a column, Clear a layer, drag a fader; everyone may. The only writer to Arena: four templated requests, ids checked against the composition, never `/clips/…/clear` or `/clearclips` (tested). A tap is one bodiless POST: `true`/`false` only selected the clip. Fired by clicks in the kiosk on the Windows box. Above it and the Arena view, clips whose file is missing (⚠️ not yet seen with a real one). `docs/VISUALS_DASHBOARD.md` § The pieces. |
| ✅ `src/shared/media-check.ts` · `src/bridge/lookbook.ts` · `src/main/lookbook.ts` · `src/renderer/components/MediaCheck.tsx` | **The media check** (2026-10-04), a Media row in the Arena view: the service the run order has open (by its Planning Center plan, since 2026-10-05), or one picked from the lookbook app (lookbooks-lifenz.replit.app, which already parses PCO's `Media No.` into codes like `CF588`), and each B, F and A code reads ✓, not in Arena, file missing, another version, or the lookbook has no file. The lookbook is the truth for the version. ✅ **Against the owner's up-to-date Central composition, 2026-10-05**, on the Windows box: ✓ on seven codes, three not loaded, and "may differ" on CB095 (an operator can confirm it **Same** by hand since 2026-10-05; kept per computer, for that pair of names only): the same picture, but the lookbook's file is named `…-v5` and Arena's is not (the extension is ignored; a format change alone passes, the owner's rule, 2026-10-05). Stills carry their file path. ⚠️ Not yet at a booth or from the NAS. `docs/VISUALS_DASHBOARD.md` § the media check. |
| ⚠️ `src/main/video-feed.ts` · `src/renderer/components/VideoView.tsx` | **The video feed**: a Spout/Syphon sender (Arena's multiview, to be) as a **Video** view, GPU to GPU through `@napolab/texture-bridge` and Electron's `sharedTexture`, the pages still sandboxed. Seen live from a stand-in sender (`spikes/spout-test-sender.cjs`) and from **Arena 7.28's Spout output** on the Windows box, 2026-10-03, in a slot and popped out; capped at 30 fps (60 since 2026-10-05 with the ring build: three staging textures and a GPU fence against tearing on fades; 47-48 fps read from Arena's 50). A touch-sized source picker, and **Fit** to give the space the picture's shape. 16-bit (Arena's High Detail) goes through **LIFE's build of the addon** (`native/texture-bridge/`, built by GitHub Actions), converted to 8-bit on the GPU: ✅ exact against a 16-bit stand-in (`spikes/spout-16bit-sender.cs`), 2026-10-03, and ✅ **from Arena at 16 bpc**, 2026-10-04 (owner-set and owner-watched; the kiosk read 1920×1080 at 27 fps, no failure; the stock addon refuses 16-bit, and the sender's own format is not logged). `docs/VISUALS_DASHBOARD.md` § The video feed. |
| ✅ `src/bridge/ontime.ts` · `src/bridge/propresenter.ts` · `src/main/timers.ts` | The countdown chip beside the clock: OnTime (`GET /api/poll`) whenever an event is running there, ProPresenter's timer, labelled by its stage message (`Wrap up: 3:38`, `/v1/timers/current`, `/v1/stage/message`), otherwise, one at a time. The rule is `chooseTimer` in `src/shared/timer.ts`. **Both shown correctly against the real programs, 2026-10-02, on the Windows box:** ProPresenter 18.2, and OnTime as LIFE runs it, **our own fork** (`lifenz-prod/ontime` v4.0.1, not upstream; its events carry extra `cue` and `custom` fields the decoder ignores). A ProPresenter countdown that may not overrun ends `00:00:00` `complete`; overrun states are still unseen. Which ProPresenter timer to follow is the ProPresenter row in Connections, by name, because a booth runs several at once; a named timer it does not have is said, never swapped for another. Past zero, either countdown goes red. |
| ⏸ `src/backend/` · `src/main/backend/` | The dashboard's own run order, **retired from the screen 2026-10-02** and not started. ✅ It did read the live backend first (pairing as a Central booth device, the plan shown). Delete once the Cue Manager has run a service. |
| ⚠️ `src/shared/embeds.ts` · `src/main/embeds.ts` · `src/renderer/components/EmbedPane.tsx` | **Embeds** (2026-10-05): any web page, added by name and address in Connections (operator mode), is a view of its own with its own sign-in (a partition per embed), − / + zoom remembered per embed, Reload, Pop out, and a row saying loaded / loading / not loading that can be turned off. New windows open in the computer's browser; the user agent drops Electron's name, for Google. Removing one clears its session, and its folder at the next start. In the kiosk on the Windows box over CDP, 2026-10-05: added, placed over its slot, zoomed (saved, re-applied after a reload), popped out and back, off and on, renamed, removed. ⚠️ Not signed in to Google (its sign-in raised a Windows passkey dialog, cancelled); a new-window link not tried. |
| ⚠️ `build/icon.svg` · `scripts/render-icon.cjs` · `src/main/kiosk.ts` (mark, windowed) | **The pāua icon, windowed mode, MARK** (2026-10-05). The icon is a drawn shell (`build/icon.svg`, rendered to `build/icon.png` and `assets/icon.png` by `npx electron scripts/render-icon.cjs`), for the installer, taskbar and Dock; ⚠️ not yet seen in an installed build. **This screen** in Connections (operator mode): Full screen or Window, at once, no restart (watched both ways in the kiosk). **MARK** in the status bar (a flag since the 2026-10-05 look), for anyone: a `[mark] ===== tester's mark N =====` line in the log with the mode, layout and views on screen, and the button says which number (watched). |
| ⚠️ `src/shared/holding.ts` · `src/renderer/components/HoldingView.tsx` · `src/renderer/useMediaCheck.ts` | **The Holding view** (2026-10-05, the owner's idea): the holding layers as rows of thumbnails, each clip marked against the run sheet the media check follows; inspect only. **Pictures over words since the afternoon of 2026-10-05**: only what needs a look is marked, what belongs in a column stands there as a dashed "+ place" tile, one-offs wait in a No column tray and are placed per service, a clip on screen may be replaced after a red tick at the confirmation, and the Arena view's Media row is one line that opens Holding. **A column is one moment of the service across every layer, found by Arena's column names**: PRE, POST, WTL, NSL, BIBLES, WTG and PROMO (the owner's pattern for every campus, after a first version that guessed per layer placed the PM foregrounds wrongly, 2026-10-05); each item's codes into its column, announcements into PROMO, nothing placed while columns are unnamed. To place, Place or Choose; Update all; every write to Arena confirmed first; operator mode. Names are the layer group's columns. **Files by code and size** (the lookbook's are the drive's byte for byte): the check says "different file" by size; the drive is searched by code; the lookbook's file is the backup, downloaded only when the confirmation's question gets a yes. ✅ Dry runs against the live composition, the drive and the lookbook; ✅ loads through the button (the owner's Place all), ✅ lookbook downloads through it (the owner's Update all, 11:12). ⚠️ Not by finger; the live tick not yet seen. `docs/VISUALS_DASHBOARD.md` § The Holding view. |
| ⚠️ `src/shared/media-fetch.ts` · `src/bridge/media-files.ts` · `src/main/media-fetch.ts` | **Fetching media** (2026-10-05): Fetch, Place and Update all copy a code's file into the **local folder** and load it into every clip with the old one, or the column it belongs in. The file is found on the **graphics drive by code and size**, else downloaded from the **lookbook**, only after the confirmation asks (the owner's safeguard). **Browse** for both folders. ✅ Loads through the button: the owner's Place all, 10:21, put five files from `G:` into Arena (in the wrong columns, since fixed: § The Holding view). ✅ **A lookbook download through the button**: the owner's Update all, 2026-10-05 11:12, downloaded CF464 and CB105 and loaded them (paua.log). **A clip on screen** is replaced only after the confirmation's red tick, the yes naming the clips (`allowLive`). ⚠️ Whether a file loaded over another keeps the clip's settings, and what the audience sees on a live replace, not yet watched. `docs/VISUALS_DASHBOARD.md` § Fetching media. |
| ✅ `src/bridge/log-file.ts` · `src/main/log.ts` | **The app's own log**, `paua.log` in the data folder, timed, two 5 MB files at most; the kiosk page's errors and a crashed GPU or page process go in too. Version and path at the foot of Connections. Watched writing on the Windows box, 2026-10-04. |
| ✅ `src/main/entry.ts` · `src/main/supervisor.ts` · `src/bridge/supervise.ts` | **The installed app's watchdog**: Paua.exe in Node mode runs the app and restarts it 5 s after a crash, gives up after 5 in 2 minutes, leaves a clean quit alone. A checkout is left to kiosk.cmd. Watched on the packaged build on the Windows box, 2026-10-04. |
| ✅ `.github/workflows/release.yml` · `docs/FIELD_TEST.md` | **Field-test builds**: a tag `v<version>` builds `Paua-Setup-<v>.exe` and `Paua-<v>-arm64.dmg` (ad-hoc signed, Syphon.framework left as upstream signed it) and drafts a release; logs pushed to `release-build-log`. v0.1.0 built green 2026-10-04. ⚠️ Neither file installed anywhere yet; the Mac build never opened on a Mac. |
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
⚠️ What SmartScreen showed on the way is not recorded; ask before relying on volunteers
installing an update themselves. That gates hosting on `visuals.prodapps.life`,
self-update and start at login, the next steps. Close the installed copy before a dev
run: one kiosk per computer, so the second only focuses the first.

## Next session starts here

**Where things stand (2026-10-05, late afternoon).** **v0.2.2 is tagged and both builds passed**
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
Left on the late afternoon of 2026-10-05: the kiosk runs e900e26's build with the **ring build
of the addon** (`vendor/texture-bridge/`, BUILD.txt names it; a running kiosk locks the `.node`,
so stop it before `git checkout origin/texture-bridge-build -- vendor/texture-bridge`), in
volunteer mode, on the owner's own three windows (run order | MA | Arena, Clips, Holding, Video,
MA), the Video view on `Arena - MULTIVIEW`. Its bar is expanded (`paua.barCollapsed` unset); the
saved layouts list is empty (`paua.layouts` is `[]`: the two test layouts are gone). It was started detached (PowerShell `Start-Process` on
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
Also on this box: two test saved layouts, "Three windows" (its run order sits a column in from
the left: an empty strip, to fix or delete) and "Two windows". No embed is set up. Writes to
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
- Start at login; self-update once hosting is decided.
- **A service report** (high flag): from the log, LIVE, drops, saves and loads, clips
  fired, on screen or sent to the LD. **Save reminders** for MA3 and Arena. **Help per
  view** ("?"). Then, interested: a big countdown view, connection history (an hour's
  strip per row), a read-only phone view on the booth network.
- Parked: the pre-service check. Declined: stage messages (not this desk's role), clips
  for this service (another role fires clips from a Stream Deck), panic to black, dim
  mode.

### TODO, in order

0. **v0.2.2 on GitHub** (the owner's): publish the draft (both builds passed, run
   37244795777), delete the older drafts. `docs/FIELD_TEST.md` § 0.2.2 is what testers check.
0. **The Video view during a full-screen fade**, by the owner's eye: no tearing or flicker
   (`docs/VISUALS_DASHBOARD.md` § The video feed, tearing on fades); and Arena's own frame rate
   with the view at ~48 fps (read in Arena). If "takes a second to update" comes back, the log
   now has `[video] a frame took N ms to reach the page`.
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
0. **After the installer:** run `Paua-Setup` on a booth machine and record what SmartScreen
   shows, then decide hosting, self-update and start at login (above, § The installer). On
   the booth screen, check the Windows touch keyboard comes up for a Cue Manager note.
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
1. **Sign the booth PC's Cue Manager in** with its own QR, as its own booth device, so one
   lost PC can be revoked alone.
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
Operator mode is a 3 s hold on the mode chip.

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
