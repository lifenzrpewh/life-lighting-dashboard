# LIFE Lighting Dashboard — operating manual

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
| ✅ `src/main` · `src/preload` · `src/renderer` | Electron kiosk: run order + MA pane + settings. Builds, runs, renders all four states. Channel B is wired (the "desk heard" pill); the link still reports UNREACHABLE because nothing round-trips yet. |
| ⚠️ `src/main/ma-pane.ts` | The web remote as a `WebContentsView`. Real web remote on onPC 2.3.2.0, **not a desk**. Never stuck for good (2026-10-01): a 15 s load timeout, and a fresh login after 10 s of MA's own overlay saying something it never recovers from (✅ the read works in the sandbox; the fresh login is unit-tested, not watched firing). **Reload MA** beside it. The six desk checks are in `docs/MA3_READ_MODEL.md` § Web remote. |
| ⚠️ `src/main/settings.ts` | Console address, port, MA users; passwords via the OS keystore. Verified locally on macOS Keychain; DPAPI on Windows unexercised. |
| ✅ `src/renderer/mock.ts` | The mock lying desk: healthy / stale / silent / unreachable / cold, keys `1`–`5` in dev. Drives the real derivation, not a parallel one. |
| ✅ `src/bridge/osc.ts` | OSC 1.0 decoder. An unknown type tag fails the **whole message**, not just that argument — OSC args are positional, so skipping one reads every later value at the wrong offset and a fader level becomes whatever four bytes sit there. |
| ✅ `src/bridge/channel-b.ts` | Executor updates off the wire. A channel C push is `other-channel`, not an error: one port carries both. The middle `,sif` integer is carried un-named because its meaning is still unobserved. |
| ✅ `src/bridge/coalesce.ts` | Newest-wins per object, time-free so the caller owns the frame rate. Drops superseded values, never unseen ones. |
| ✅ `spikes/channel-b-live.mjs` | Points the **shipped** decoder at the desk, so the unit tests are not the only evidence. Sends nothing. |
| ✅ `src/bridge/showfile.ts` · LifeBridge `show` · `watch` | The showfile chip. **LIVE against onPC 2.3.2.0, 2026-09-30**: `ON BASE SHOW Mount Eden Base`, read on link-up and again 5:04 later in a quiet gap. **Watched since 2026-10-02**: the ask is `watch`, and LifeBridge then pushes any change within a second (the chip went amber 1.8 s after a base change, in the kiosk). A Load ends the watcher, so a Load still waits for the next link-up or ask. An older plugin's `unknown verb watch` falls back to `show`. `docs/MA3_READ_MODEL.md` § The showfile, watched. |
| ✅ `src/main/cue-pane.ts` | The Cue Manager (`visuals.prodapps.life`) as a `WebContentsView` in the run order's column. Persistent session (sign-in, service worker, offline queue survive a restart), locked to its origin, 15 s load timeout, Reload beside it, Settings can clear it. **Working on this Mac, 2026-10-02 (owner-observed):** signed in by the app's own QR as a booth device, songs-only and note editing both work. Server side: `visuals-song-comms` `2675660` (booth devices edit), migrations `20261002090000_pairing_kind` and `20261002100000_booth_device_edit`. Not yet on Windows. |
| ✅ `src/bridge/ontime.ts` · `src/bridge/propresenter.ts` · `src/main/timers.ts` | The countdown chip beside the clock: OnTime (`GET /api/poll`) whenever an event is running there, ProPresenter's timer and stage message (`/v1/timers/current`, `/v1/stage/message`) otherwise, one at a time. The rule is `chooseTimer` in `src/shared/timer.ts`. **Both shown correctly against the real programs, 2026-10-02, on the Windows box:** ProPresenter 18.2, and OnTime as LIFE runs it, **our own fork** (`lifenz-prod/ontime` v4.0.1, not upstream; its events carry extra `cue` and `custom` fields the decoder ignores). A ProPresenter countdown that may not overrun ends `00:00:00` `complete`; overrun states are still unseen. Which ProPresenter timer to follow is Settings › Countdown, by name, because a booth runs several at once; a named timer it does not have is said, never swapped for another. Past zero, either countdown goes red. |
| ⏸ `src/backend/` · `src/main/backend/` | The dashboard's own run order, **retired from the screen 2026-10-02** and not started. ✅ It did read the live backend first (pairing as a Central booth device, the plan shown). Delete once the Cue Manager has run a service. |
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
| **MA3 library** | optional. Resolved per-platform by `scripts/ma3-library.mjs`: `~/MALightingTechnology/…` and, on Windows, `%ProgramData%\MALightingTechnology\…`. Absent → the export-parse tests skip and say so. **Present but empty** (MA3 installed, exports not copied across: the normal state on a fresh Windows box) makes three tests *fail* rather than skip (`expected a large corpus, got 0`), because `findLibrary` only asks whether the directory exists, not whether it holds anything |

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

**On the booth PC (Windows)**, from a checkout, not an installer: `npm start` is proven
on that box, an unsigned installer on a managed machine is not. In `scripts/windows/`:
`kiosk.cmd` runs the build already there (building only if there is none), restarts
after a crash, and logs to `%APPDATA%\life-lighting-dashboard\kiosk.log`;
`install-startup.cmd` makes it start at login; `update.cmd` pulls and rebuilds, by
hand, never before a service. One kiosk per computer: a second launch only focuses
the first. ⚠️ None of the three has run on Windows yet.

**The installer (the way forward).** `npm run dist:win` builds
`release/LIFE-Lighting-Dashboard-Setup-<version>.exe` on this Mac: per-user, no admin
rights, unsigned, default icon, key built in. The same build packaged for macOS
(`npx electron-builder --mac --dir`) ran here 2026-10-02: renderer, preload and MA
pane all load from the asar. ⚠️ **Whether the managed booth PC will run an unsigned
installer is the open question**; it decides everything after it (hosting on
`visuals.prodapps.life`, self-update, start at login).

## Next session starts here

**Where things stand (2026-10-02).** The whole service screen works against onPC on
this Mac, logged in one run: console link LIVE (70 ms), the showfile chip `ON BASE
SHOW Mount Eden Base`, the MA pane on the real web remote as `Remote`, and the Cue
Manager signed in as a booth device with notes edited in place. onPC needs its
network interface on 127.0.0.1 for the link (on 2026-10-01 it held no OSC socket
until that was set). What is left is Windows and a real console. onPC counts as
on-console.

### TODO, in order

0. **Arena.** Being broken into pieces: `docs/VISUALS_DASHBOARD.md`. Arena 7.28
   answers on the Windows box (Preferences › Web Server, `:8080`).
0. **A showfile read that stays off the command line (research).** The watcher
   pushes a Save As or base change within a second, but a Load ends it, so the new
   name waits for the next ask: once a quiet minute now (was 5 min, the owner's
   call 2026-10-02), two lines each. Two leads, both unverified: whether
   `CmdIndirect` runs `SendOSC` without the echo, and whether a show can start its
   watcher itself on load. The bare ping cannot carry the name (❌ variables do
   not expand in `SendOSC`). Also still to see: whether each push is a line.
0. **Every booth show needs the OSC row and LifeBridge** (✅ 2026-10-02: a Load
   replaces OSC settings; "Mount Eden Base" as saved has no 8003 row). The work
   is the Show Creator's: its `docs/ROADMAP.md` § From the Lighting Dashboard.
1. **The test installer on the booth PC** (`npm run dist:win`). Whether a managed
   machine runs it unsigned decides hosting, self-update and start at login. On the
   booth screen, also check the Windows touch keyboard comes up for a note.
2. **Sign the booth PC's Cue Manager in** with its own QR, as its own booth device,
   so one lost PC can be revoked alone.
3. **The MA pane, still to watch firing:** Web Remote off then on, and a console
   restart. `docs/MA3_READ_MODEL.md` § Stuck pages.
4. **For a real console:** the six checks in `docs/MA3_READ_MODEL.md` § Web remote,
   and whether listening beside onPC works on Windows. Build the volunteer layout
   view on the MA user `Remote`; HOLDING and PRE/POST are its biggest targets.
5. **Showfile, the write half:** Save As and Load (`docs/PLAN.md` Phase 3). Decide
   first whether MA's own dialog plus SaveGuard is enough. The chip gets its `▸`
   only when there is something for it to open.
6. **Housekeeping:** delete the retired run order (`src/backend/`, `src/main/backend/`,
   `src/shared/{backend,service}.ts`, its tests and the mock's schedule) once the
   Cue Manager has run a service. `README.md` is stale; bring it in line by linking.

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

**The run order** is the Cue Manager itself (`src/main/cue-pane.ts`), placed like the
MA pane (`src/renderer/panePlacement.ts` keeps both native views over their boxes).
It signs itself in, by emailed code or its own QR, keeps that sign-in and its offline
queue in a persistent session, and is a picture, not a reading: the app shows its own
offline banner. Folding the column hides it without reloading, so a half-typed note
survives. Its edge drags to resize (`src/renderer/cueWidth.ts` has the limits), and
dragged nearly shut it folds; double-tap puts it back to a phone's width. Input in it counts toward operator mode's idle timer.

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
