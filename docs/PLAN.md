# Pāua (was LIFE Lighting Dashboard) — Plan

## Context

Volunteers run lighting for LIFE services on a grandMA3 console. Everything they need is spread
across console screens, a paper run sheet, and the operator's head. The ask: **one touchscreen next
to the console** carrying the service order, the handful of sequences that actually get fired, and
the small edits made mid-service — simple enough for a volunteer, with enough flex for the LD.

Priority: **PCO → sequence trigger + cue edit → showfile management.** Show Creator integration is
explicitly not a priority ("Not a major for show creator AT ALL").

> **Pivot, 2026-09-27: the MA draws the buttons.** grandMA3's web remote is a real Display of the
> console (✅ operator-observed), so the screen is now the PCO run order beside an embedded web
> remote. Volunteers fire from an MA layout view; the LD edits in MA's own editor. Our trigger
> board, bottom rail and cue editor are retired. Details under Phase 1 and "Mode switching".

**Target:** Electron app on Windows, full-screen on a touchscreen, at a campus running a console
with a backup PC (ideal) or onPC alone.

---

## What already exists — and what we therefore do not build

| Need | Already exists | Where |
|---|---|---|
| PCO Services ingest | **Complete.** Rate-limit-aware client, 429/5xx backoff honouring `Retry-After`, pagination, JSON:API include-stitching, HMAC webhooks, pg_cron reconcile, campus auto-mapping | `visuals-song-comms`: `supabase/functions/_shared/pco.ts`, `pco-sync`, `pco-webhook`, `_shared/sync.ts` |
| **Lighting cues per service item** | **Complete.** `field_definitions` already carries `key = 'lighting_cues'` (label "Lighting") beside `vfx_led_cues`. Cues key on `(field_definition_id, pco_item_id)`. **No new cue tables needed** | same repo, `note_values` |
| Client bootstrap | `current_user_context()` returns permissions, roles, campuses, config in one call | `20260613094000_cueable_item_types.sql` |
| Auth, RLS, realtime, offline outbox | Magic-link + OTP, QR device pairing, `app_private.has_perm()`, Dexie outbox → debounce → `upsert_note_value` | same repo |
| MA3 live playback decode | **Reusable, zero-dependency TypeScript**, 527 lines, only two local imports — verified | `companion-module-grandma3`: `src/osc/parse.ts`, `src/state.ts`, `src/osc/apply.ts` |
| Console → network push | **`SendOSC <entry> "<addr>,<type>,<value>"`** — the mechanism this whole design turns on | `companion-module-grandma3/console-plugin/CompanionFeedback.lua:57` (MIT, ours) |
| Showfile save/load safety | SaveGuard refuses to save over the base show and forces Save As; BaseFileSaver does dated-archive-then-overwrite; LoadBaseFile | Show Creator `deploy/` |
| **The show describes itself** | `SGV2_N`, `SGV2_Name<g>`, `SGV2_GroupOrder`, `SGV2_Color<n>` (`"Name\|RRGGBB"`), `SGV2_BaseShow`, one flag per aspect — a complete manifest, already in every showfile | `ShowfileGenerator.lua` UserVars |
| Object numbering map | Lets the trigger board self-populate | `docs/BOUNDARIES.md` §3 |

**Consequence: no PCO client, no auth system, no cue schema, no showfile-save logic, no OSC decoder,
and no configuration screen.** The new work is the console bridge, the touchscreen UI, and glue.

---

## The central problem: reads

Writes are easy. Reads are the whole problem.

- **OSC in** gives a thin live feed (per-sequence active flag, fader level, key state) — no cue
  numbers, names, timing or recipes.
- **File-IPC** (the `ma3-mcp` pattern) reads everything but swaps text files on the MA3 machine's
  own filesystem — unreachable from a separate PC. It is also serial with a 5 s timeout that returns
  *plausible-looking fallback strings* rather than errors, so a slow desk looks like an empty show.

### Where the app runs, and what it connects to

The dashboard runs on the backup PC but **talks to the console, not to the PC it sits on.** The PC's
backup role is incidental — a convenient box, not a data source.

This is deliberate and it is the correction that matters most. Reading the show from the local
onPC's synced copy would make session health load-bearing: **a station that falls out of session
keeps answering, confidently and wrongly.** Nothing else in this system fails that badly.

So the console-side plugin runs **on the console**, where the data is authoritative by definition,
and pushes answers back over the network. Sync stops being a question.

### Four channels

| Channel | Carries | Mechanism |
|---|---|---|
| **A — Command out** | Every write: fire, timing, recipe, store/delete, SaveShow | OSC/UDP → `/<prefix>/cmd`, one string arg, fire-and-forget |
| **B — Live state in** | Active flags, fader levels, key state | Console's native OSC out, decoded by the existing `parse.ts`/`state.ts`/`apply.ts` |
| **C — Structure in** | Cue lists, names, `CueInFade`, `TrigType`, recipe lines (group + preset), showfile name, current cue | **Console-side Lua plugin → `SendOSC` push** |
| **D — Bulk fallback** | Same structural data, offline | `Export Sequence N "dash_N"` → parse XML. **Never during a service** (see below) |

> **The MA pane shrinks this (2026-09-27).** Firing and editing now happen in the web remote, so A
> carries only showfile writes (Phase 3), B is no longer needed for button feedback because MA
> draws it, and C is needed only for showfile info and a heartbeat. Nothing is deleted yet; the
> console track decides what survives when it resumes.

> ⚠️ **Correction to an assumption I made earlier.** OSC `/<prefix>/cmd` executing arbitrary commands
> is **🔬 RESEARCHED, not ✅ verified** — `companion-module-grandma3/docs/OSC_PROTOCOL.md` says
> plainly *"Not yet verified on the operator's console."* It also records that **`Receive Command`
> must be On** in the console's OSC entry or `/cmd` is silently ignored. The entire write path rests
> on this, so it is spike #1.

**Channel C is the new design.** A plugin on the console reads the object model in-process
(`GetObject`, never `Cmd()`) and pushes NDJSON-over-OSC back to the dashboard's IP and port. No
shared filesystem, no session dependency, no polling of a mailbox. It also gives current-cue and
showfile-name readback for free, which the file-IPC design could not do console-direct.

**Channel D stays as the offline fallback**, and is now built and verified — but it is
**expensive**, which the plan originally understated. The operator's sequence library is **431 MB
across 856 files**, and a single colour sequence exports to **45 MB that yields 16 cues and 280
recipe lines** — MA3 inlines every referenced group, preset and appearance for every recipe line.
A full structure sync is therefore minutes of console write time, not seconds.

> **New spike:** does `Export … /NoDependencies` shrink this to something routine? The catch is
> that group *pool numbers* are recovered from the `DependencyExport` blocks, so dropping them
> costs the numbers. Likely fix: export without dependencies, and resolve group names to numbers
> once from the much smaller `datapools/groups` export (87 files).

Exported XML carries exactly the read model — `<Cue No Name TrigType>` → `<Part CueInFade>` → `<Recipe Selection="…Groups.Blinders"
Preset="…">`, with numeric addresses in `DependencyExport`. Verified against the 858 real sequence
XMLs already on this machine. Because *we choose the filename* (`Export Sequence 1001 "dash_1001"`),
the "exports carry no pool numbers" trap in `BOUNDARIES.md` doesn't apply.

> ⚠️ **❌ VERIFIED on a desk, 2026-08-27** (`MA3_SYNTAX_REFERENCE.md:568`): `Export Sequence`
> **hard-crashes the console** when a cue Part carries stored `SelectionData`. Reproduced twice,
> truncating at a byte-identical point. **Channel D is therefore operator-mode only, gated on "no
> service in progress", one sequence per file, with a persisted blacklist** — and `"Command
> executed"` instead of `"OK"` is the failure tell, not success.
>
> **Now mitigated mechanically.** `spikes/scan-exports.mjs` derives the blacklist from exports that
> already exist: **8 sequences carry `SelectionData`** — Band LEDs, FRONT, HOUSE WHITE and five haze
> sequences. All eight are **basefile-band (1–1000) service content the dashboard is already
> read-only on**, so the crash risk sits entirely outside its write scope. The two truncated
> artifacts from the 2026-08-27 crash (`INV_seqs_operator.xml`, `INV_seqs_operator2.xml`) are still
> on disk and both stop at exactly `<SelectionData Size="9">` → `<Item`, confirming the documented
> signature.

### If the spikes go badly

If `SendOSC` from a plugin doesn't work, in order: **console FTP** (the `EnablesFTP` symbol suggests
a network file path into the console), then **`app_terminal CMDLINE <ip>`** (a real encrypted TCP
remote command line with a return path, reads plain stdin so it is pipeable). Reading the local
onPC becomes the *last* fallback, and only with a hard session-health gate that refuses structural
reads unless the station reports in-session — never the default.

---

## Architecture

```
life-lighting-dashboard/            ← new repo
  src/main/                         Electron main (Node 22, TS strict) — owns all state truth
    bridge/
      osc-out.ts                    channel A
      osc-in.ts                     channels B + C (wraps the vendored decoder)
      export-sync.ts                channel D — offline only, blacklist, crash guard
      vendor/gma3-osc/              parse.ts · state.ts · apply.ts (MIT, ours, copied)
      bridge-client.ts              one interface; typed errors; never a fallback value
    kiosk.ts                        full-screen, no menu, crash-restart
    ma-pane.ts                      the MA web remote, as a WebContentsView main owns
    settings.ts                     console address + MA users, passwords via the OS keystore
  src/preload/                      contextBridge — no nodeIntegration
  src/renderer/                     React + Vite + TS + Tailwind v4 (@theme tokens)
  console-plugin/                   LifeBridge.lua + XML bundle
  test/                             offline harnesses (mock MA3, mock lying desk)
```

**Electron, not Tauri.** The decoder we're reusing is TypeScript; the bridge stays Node/TS, renderer
and main share types, and the whole stack stays in the language you work in. Tauri would buy a
smaller binary at the cost of a Rust port of the one piece we most want unchanged.

**Data split.** Supabase (shared) holds the PCO cache, campuses, permissions and the existing
`lighting_cues` notes read as-is. No new tables: the curated board and item pins went with the
trigger board (MA layout views hold the buttons now). Local
Dexie mirrors everything a service needs. **A service must survive the Supabase box, the network, or
the console going away — independently.**

> The payoff of sharing the backend: the LD writes a lighting note against a song in the Visuals App
> during the week, and it appears on the console touchscreen on Sunday next to the MA screen that
> fires it. Neither app had to know about the other.

**Kiosk auth.** Reuse the existing QR device-pairing flow — the booth PC is paired once at
volunteer permission only. Operator mode is a separate elevation, so a permanently-logged-in kiosk
can never be the thing that authorises a destructive write.

> ✅ **Booth devices (visuals-song-comms, 2026-10-01).** Pairing used to sign the booth in as
> *whoever approved the QR*, with their rights. Now an admin creates a booth device (Admin › Booth
> devices: a read-only `device` role, `notes.view` + `embeds.view`, scoped to one campus) and
> approves the QR "As a booth device". The kiosk side is unchanged; the booth reads its campus from
> the device's role, and revoking the device signs it out. Sign-out in the PWA is per-device now.

---

## The console plugin — `LifeBridge`

> ⚠️ **Scope shrinks with the MA pane (2026-09-27).** With no trigger board and no cue editor, the
> plugin needs only the showfile name, `SGV2_BaseShow`, a heartbeat, and (Phase 3) Save As. The
> batched sequence snapshot and the timing/recipe write verbs below are no longer needed. The
> guarantees stand for whatever survives.

Written fresh. Not forked from `mcp_server.lua`: that file is **AGPL-3.0**, and independently its
architecture *is* the hangs we're escaping. Its loop does unbounded work inside one coroutine step,
which is why a pool-level `children:` hangs the console — a budget bug, not a `children:` bug.

- **8 ms slice budget per resume.** No single step exceeds it. This is the fix for the hang.
- **Never `:Children()` on a pool.** Address by number. Read `Count()` first and refuse above a cap.
- **Never `Printf` on the request path** (the likely cause of the other observed stall).
- **Never `Cmd()` for a read** — the object model is in-process and side-effect-free.
- **Eight verbs, not forty**, and **no generic `raw`/`cmd` verb in the shipped build** — compiled out
  behind a build flag, so eroding it requires a rebuild. A volunteer touchscreen that can send
  arbitrary command strings is one malformed template literal from `Delete Sequence 1 Thru 9999`.
- **Write allow-list enforced plugin-side, keyed to `BOUNDARIES.md` §3.** Sequences and macros
  1–1000 are basefile-owned and **read-only to this bridge, full stop**. Enforcing in the plugin
  means a buggy client cannot reach past it.
- **`LoadShow` is not a verb.** Load stages a request and routes through the existing `LoadBaseFile`
  plugin. `show.saveas` exists; `show.save` does not; and `saveas` refuses any name equal to
  `SGV2_BaseShow`.
- **Nonce on destructive verbs**, single-use, ~10 s TTL.
- **Kill switch**: presence of a `bridge.disable` file makes the plugin refuse every write while
  still serving reads. The LD can neuter the dashboard from the console in ten seconds, mid-service.
- **Append-only audit log** of every accepted write. When something goes wrong at 9:40 on a Sunday,
  this is the only artifact that says what the dashboard actually did.
- **Every write is unconfirmed until a read-back shows it.** `Cmd()`'s return is discarded, so a
  failed command is structurally indistinguishable from a successful one.

There is **no authentication on any of these channels and there will not be** — not OSC, not `/cmd`.
The threat model is accident and bug, not adversary. The guards above are what matter.

---

## Scope by phase

### Phase 0 — Spikes
Nothing is ✅ without a dated on-desk observation. Ordered by *what dies if the answer is no*, with
the cheap ones pulled forward because one of them may save the architecture.

1. ⚠️ **Does an OSC packet actually arrive** — in either direction? Blocks every write *and*
   channel C. The desk returned `OK:` for `SendOSC`, which proves the syntax and the command,
   **not delivery**: no OSC entry was configured and the listener side was never exercised. Until
   a packet is observed arriving, both 1 and 2 rest on this. Run `spikes/osc-probe.mjs` against a
   configured entry, `Receive Command` On, prefix matching.
2. ✅ **Does `SendOSC <entry> "<addr>,<type>,<value>"` work from a console plugin**, including the
   string form? **Yes — 2026-09-20, onPC 2.3.2.0.** The string form carries, so channel C is viable
   and the console-direct architecture holds. FTP and `app_terminal` stay unneeded fallbacks.
   Subject to 1: the console accepted the command; nothing has yet seen the packet land.
3. **Can the console hold a second OSC entry** so the dashboard gets its own port without fighting
   Companion — and does the local onPC steal that port if OSC config syncs across the session?
4. `app_terminal CMDLINE <console-ip>` — five minutes, no show risk. Pass → a console-direct channel
   with a return path, and a genuine alternative to #2.
5. Console FTP (`EnablesFTP`) — ten minutes. Pass with write → file IPC works console-direct.
6. **Bounded-slice loop under load**: a snapshot over 40 sequences while the LD works the console.
   Pass = no perceptible lag.
7. Round-trip one write of each kind on a **scratch** sequence; confirm read-back reflects it.
8. `Export` bulk read — **last, on a scratch show, never near a service.**

### Phase 1 — The service screen: run order + MA pane

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ● LIVE  Sunday 21 Sep  MA · 10.11.60.40 · Remote    10:31  VOLUNTEER Showfile ▸ │
├───────────────────────┬────────────────────────────────────────────────────────┤
│ RUN ORDER      PCO  ‹ │                                                        │
│ ▸ Countdown     10:02 │                                                        │
│ ▸ Welcome       10:05 │          grandMA3 web remote: a real Display           │
│ ╔═══════════════════╗ │                                                        │
│ ║ NOW · song   4:30 ║ │   volunteer: a layout view built for the MA user       │
│ ║ Great Are You     ║ │   Remote. Big buttons, and MA draws their state.       │
│ ║ "band only,       ║ │                                                        │
│ ║  no movers"       ║ │   operator: the LD's own MA user and screens.          │
│ ╚═══════════════════╝ │                                                        │
│ ▸ Message       10:12 │                                                        │
│ ▸ Response      10:40 │                                                        │
└───────────────────────┴────────────────────────────────────────────────────────┘
```

> **Superseded 2026-10-02: the left spine is the Cue Manager itself**, embedded like the
> MA pane (`src/main/cue-pane.ts`), so notes are edited in place and the app's own rules
> (songs-only, hidden songs, "Changed in PCO") hold. The reasons are in
> `src/shared/cue-pane.ts`. What follows still holds for the column.

- **The run order is the left spine**, a sibling of the pane and never under it. It is the one thing
  beside the MA that the MA cannot show. It folds to a strip, one tap each way, to give the MA the
  full width; folded is not hidden, so the way back stays on screen.
- **The buttons are MA's.** Volunteers fire from a layout view the LD builds for the volunteer user,
  and MA draws each button's state itself, so feedback cannot go stale behind our back. What the
  old rail stood for moves into that view: **HOLDING and PRE/POST are its biggest targets**, in
  easiest reach. That is now a rule for the layout view, not for our code.
- **Nothing in the app fires anything.** Advancing PCO moves the highlight and nothing else.
- **The status bar is read-only** and keeps only what a volunteer acts on: link, Showfile, the
  countdown, clock, the mode chip, and **Connections**, whose dot is the worst of every connection
  that is set up. The pane's status (`MA · <host> · <user>`, never "live") and channel B's traffic
  moved into the Console row there (2026-10-02).

**The MA pane** (`src/main/ma-pane.ts`, `src/renderer/components/MaPane.tsx`):

- **Main owns the target.** The renderer says where the pane sits and which mode the screen is in;
  the address and logins come from settings, and a password never crosses back over IPC.
- **Shown only once a page has loaded.** Until then our placeholder, underneath the native view,
  says why: no address set, connecting, or not reachable (retrying every 5 s, with Try now).
- **`showing` means a page loaded, never that the console is live.** The web remote shows its own
  "disconnected" (✅ operator-observed). Our link state is a bar above the pane, never over it: a
  native view cannot be overlaid, so the layout gives the pane a rect of its own and re-measures it
  after every render.
- **Locked down:** its origin only, no popups, no permissions, an in-memory session that is
  cleared on every change of user.
- **It holds one of the console's two web remote slots all service** (🔬 manual 2.2–2.5). That
  leaves one for anyone else.

**State honesty — four states, one vocabulary, used identically everywhere.** It now covers the
run order and the showfile chip; the pane renders MA's truth, not ours.

| | Rendering |
|---|---|
| **LIVE** | full contrast, solid border |
| **STALE** | 60% contrast, value shown **with its age** (`78% · 4m ago`), dashed underline |
| **UNKNOWN** | `?` **in place of the value**, dotted border |
| **UNREACHABLE** | full-width bar; every element drops to UNKNOWN at the same instant |

The read layer returns a discriminated union (`{ok,value}` / `{timeout}` / `{error}`) with no default
branch, no `?? 0`, no `|| "off"` — so rendering a timeout as a value is a **type error**, not a
code-review item. This exists because `ma3-mcp/server.py:184` is literally
`send(...) or "No groups found"`, and that one line makes a slow desk look like an empty show.
**Boot state is UNKNOWN, not off.**

> ✅ **Known wrinkle, fixed 2026-09-30.** The run order was derived against the *console* link, so a
> dead console blanked PCO data the backend still had. It is now judged by its own reads: a failing
> backend ages it to STALE with the last good read (kept on disk across a restart), and a dead
> console leaves it alone.

### Connections — the facts no show knows, beside their status

*Resist configuration* still holds: anything the show can describe about itself is read from the
show. Settings hold only what no show knows: the **console address**, the **web remote port**
(8080), the **volunteer MA user** (`Remote` by default, which needs no password) and the **operator
MA user**, each with an optional password. The panel stands in the pane's place.

Since 2026-10-02 these live in the **Connections** tab (`src/renderer/components/ConnectionsPanel.tsx`),
not a Settings form: one row per connection (Console, OnTime, ProPresenter, Arena, Cue Manager),
each with its status in one word (`src/shared/connections.ts`), tapping open to its few fields and
its own Save. **Everyone sees it; only operator mode edits**, so a volunteer can say what is down
and cannot move an address by accident. A connection not set up is `off`, never `down`: a
lighting-only booth has no Arena, and a red dot for it would teach people to ignore the dot.

Passwords are write-only from the screen, encrypted at rest with the OS keystore (DPAPI on Windows),
and never saved in the clear: with no keystore, none can be saved at all. A save is all-or-nothing
and lands by rename. With the link ping (2026-09-30) come the **console's OSC port** (8003) and a
**reply port**, blank meaning the same port, which is MA's own one-port model. It differs only when onPC
runs on the dashboard's computer and holds the OSC port itself. The prefix stays fixed at `life`.

### Phase 2 — ~~Cue editor~~ retired: MA's own editor, in the pane

Replaced by the MA pane on 2026-09-27. The LD edits in MA's own editor, with MA's own cooking and
Oops. The design that was here (detented timing picker, cook as part of Apply, the
`FAILEDCOOKEDPART` check, the SNAP guard, the Store/Delete band) is in git history at `49ca006`.

What not building it gave up, and who owns each now:

- **The SNAP guard**: the LD, as at the console today. `LEVEL_STATES.md` still describes the trap.
- **The unconfirmed-cook strip**: MA shows its own cook state.
- The write hazards in `MA3_READ_MODEL.md` (`CUEOUTFADE`, recipe renumbering) stop being ours to
  guard. They stay true for anything that writes to the console from code.

### Phase 3 — Showfile

A **chip in the status bar**, not a panel, opening to a sheet.

> ✅ **The read half is built** (2026-09-30, LIVE against onPC 2.3.2.0). LifeBridge's `show` verb
> makes the base-show verdict on the console, with SaveGuard's own rules, because the names are
> mangled in transit and the chip must agree with the guard. It asks on link-up, then at most every
> 5 minutes, only in a quiet gap: about 0.4 command lines a minute, none while the LD works (the
> operator's choice). A name unrefreshed past that renders STALE with its age. The sheet below is
> not built, so the chip opens nothing yet.

- Base-show detection compares the loaded name against `SGV2_BaseShow`, normalised exactly as
  `SaveGuard.lua` does. On a match the chip turns amber and reads `ON BASE SHOW` **permanently** —
  a state, not a dialog you dismiss and forget — and Save is replaced by Save As.
- **Overwriting the base is not in this app at all.** Base File Saver stays a console plugin.
- **Save As**: names are *offered* (generated from the PCO plan), not typed, with a live
  **31-character budget meter** showing the exact string that will be sent.

  > ⚠️ ✅ **A show name truncates silently at 31 chars**, and it has already cost real archives:
  > `SaveShow "LIFE Basefile Master 260827_013143"` landed as `LIFE Basefile Master 260827_013`,
  > collapsing dated-archive resolution to ten minutes so two saves in a window overwrote each
  > other. Budget the fixed part first and trim the tail — a timestamp appended last is both what
  > gets eaten and what carries the uniqueness.

- **Load**, four layered guards: operator mode; **disabled unless the console link is confirmed
  live**; `Save it first` checked by default, sending `LoadShow "<name>" /NoConfirmation /Save` so
  save-then-load is atomic; and a **3-second hold**, not a tap. If PCO says a service is underway, a
  second confirm names it — prompting rather than refusing, as `LoadBaseFile.lua` argues.
- Save As sits at the top of the sheet; Load at the bottom behind deliberate emptiness. They never
  share a neighbourhood.

> ⚠️ **The write half is built, not yet seen on a console** (2026-10-04). The chip's ▸ opens
> `src/renderer/components/ShowfileSheet.tsx` in the grid's place. Save As offers **campus + New
> Zealand date and time** (`Central 2026-10-04 0915`, the owner's choice: no PCO lookup; campus is a
> setting on the Console row), timestamp budgeted first, only characters every leg carries
> unchanged, never the base show's name; it sends `SaveShow "<name>"` and says saved only when
> LifeBridge reads the new name back. Load lists the console's shows through a new read-only
> LifeBridge verb, `shows` (newest first, at most 40, a few messages; a name the trip changes is
> marked and not offered), then needs operator mode, a live link, "save the current show first"
> (ticked: `/Save`, else `/NoSave`, always `/NoConfirmation`) and a 3 s hold. The loaded show is
> not offered. The rules are `src/shared/showfile-write.ts`; main checks the link is live and the
> mode is operator before sending, and logs each. **Not built:** an in-place Save (MA's own does
> it, and SaveGuard guards it) and the "a service is underway" second confirm (nothing here knows
> PCO's times).
>
> ✅ **Both, on onPC 2.3.2.0 on the Windows box, 2026-10-04,** from the app over OSC, each
> confirmed by LifeBridge reading the name back. **Save As needs `/NoConfirmation`:** a bare
> `SaveShow "<new name>"` left MA's confirm dialog on the console and saved nothing (the
> 2026-08-27 save that proved the 31-character cut was typed at the console, where the
> dialog was answered by hand). With it, the file was written and read back in ~2 s. **Load**
> read back in 22 s once and over 60 s once, so the sheet waits 120 s before it says "look at
> the console". One Load froze onPC on its progress bar (idle, not working) in the session
> where the bare SaveShow's dialog had been cancelled; the same Load on a fresh onPC worked.
> ✅ **"Save it first" saves a changed show:** with a macro added, the current show's file was
> rewritten the moment the Load went (22:36:32), then the Load read back in 46 s. An unchanged
> show's file is left as it was, which is why two earlier Loads looked as if it did nothing.
>
> ✅ **`shows` on onPC 2.3.2.0, Windows, 2026-10-04:** called from the web remote's command line,
> it found the folder by `GetPath(Enums.PathType.Showfiles)` (the first way it tries) and packed
> the list into 2 messages. Their `SendOSC 3` failed `Illegal object` because that onPC had no
> row 3, which is how a missing reply row looks: the plugin runs, the console says so, nothing
> arrives.

---

## Mode switching

**The mode is which MA user the pane logs in as.** Volunteer mode is the volunteer user (`Remote` by
default: the web remote's own auto-login). Operator mode is the LD's user, by the manual's URL login
(`?user=…&password=…`). What each may do is set on the console, in those users' rights; the app
enforces nothing about the show. Admin, Guest and 3D users cannot log in to a web remote.

**Boots into volunteer, always; operator mode is never remembered across a restart.** Switching in
is a **3-second hold** on the mode chip, counted at release too, so a late timer cannot lose a
completed hold. No PIN, because the risk is an accidental switch, not a rogue volunteer, and a PIN
is a setting (*resist configuration*). Entering operator mode **reveals, it never acts**. Switching
out is one tap: becoming more restricted is always safe. **Auto-drops after 15 minutes idle**,
counting touches inside the pane, which main reports because the renderer cannot see them.

Every change of user clears the pane's session first, so operator rights cannot linger in a cookie.
A renderer crash-reload logs the pane back to the volunteer user before the new screen draws. With
no operator user set, operator mode keeps the volunteer user and the status bar says so.
Volunteers keep plain Save (Phase 3); taking it away would train people to leave work unsaved.

---

## Critical files

**Read before starting:** `Show Creator/docs/BOUNDARIES.md` §3 (the write allow-list and board
manifest) · `docs/MA3_SYNTAX_REFERENCE.md` (syntax oracle; §568 export crash, §8 the 31-char cap,
§9 recipe-delete-renumbers) · `docs/LEVEL_STATES.md` (HOLDING/PRE-POST and the SNAP trap) ·
`plugin/ShowfileGenerator.lua` (the `CFG` block and the `SGV2_*` UserVars) ·
`plugin/SaveGuard.lua`, `plugin/LoadBaseFile.lua` (the guard philosophy to mirror) ·
`companion-module-grandma3/console-plugin/CompanionFeedback.lua:57` (`SendOSC`) ·
`companion-module-grandma3/src/osc/{parse,apply}.ts`, `src/state.ts` (vendor these) ·
`visuals-song-comms` `supabase/migrations/`, `_shared/pco.ts`.

**Read as a hazard reference only:** `ma3-mcp/plugin/mcp_server.lua:2302-2378` — the unbounded poll
loop the new plugin is designed to avoid. **AGPL-3.0; must not be forked.**

**Create:** the new repo. **Modify:** nothing existing, except two migrations in `visuals-song-comms`.

---

## Verification

- **Offline harnesses**, matching the house convention: a mock MA3, and a **mock lying desk** that
  can be made slow, silent, or wrong, to prove the UI degrades honestly.
- **Real UDP integration test** in the style of `companion-module-grandma3/test/integration.test.js`
  — that layer caught a live bug every unit test below it passed.
- **Export parser** tested against the 858 real sequence XMLs already on disk.
- **On desk, per phase**: the MA pane checks in `docs/MA3_READ_MODEL.md` § Web remote; Load and Save
  As a scratch show.
- **A full service in shadow mode** — dashboard live, volunteer driving, operator ready to take
  over — before it is trusted alone.

---

## Built so far

- **`src/bridge/export-parse.ts`** — channel D parser. `ParseResult` is a discriminated union
  (`ok` / `truncated` / `malformed` / `empty`) so a failed read cannot be rendered as data.
- **`test/export-parse.test.js`** — 6 tests, green, run against the real 856-file library. The
  corpus caught two wrong assumptions immediately: that recipe lines are always group+preset pairs
  (**~19% are half-populated** — 386 selection-only, 346 preset-only, so a required pair would have
  dropped them), and that exports are small.
- **`spikes/scan-exports.mjs`** — derives `export-blacklist.json`. No desk needed.
- **`spikes/osc-probe.mjs`** — spikes 1 and 3, ready to run at a desk on a scratch show. The send
  side has never been paired with a listening entry, so **delivery remains unobserved.**
- **`console-plugin/LifeBridge.lua`** — probe v1, read-only on the show, `SendOSC` its only command.
  Scored 9/10 on the desk. Its findings are the read model; it is meant to be *replaced* by the real
  bridge, not extended.
- **`console-plugin/_test_lifebridge.lua`** — offline harness, 106 checks, including the assertion
  that no command but `SendOSC` ever appears in the plugin.
- **`docs/MA3_READ_MODEL.md`** — the desk-verified property names, the ×1000 cue-number trap, and
  the `HookObjectChange` failure that makes polling the design rather than a compromise.
- **The service screen** — run order + MA pane + settings (`src/main/ma-pane.ts`,
  `src/main/settings.ts`, `src/renderer`). Exercised end to end on 2026-09-27 against a local
  stand-in page on `:8080`, **not yet against a desk**: placement tracks every layout change, the
  pane recovers by itself when the page appears, links and popups go nowhere, a mode switch logs
  in as the other user, a crash-reload comes back as Remote, and passwords land encrypted.

## Open questions

- ~~**Is `visuals-song-comms` actually deployed and in use?**~~ **Answered: yes — deployed and in
  production use**, despite one push on 2026-08-18 and nothing since. It looks dormant and is not.
  **Phase 1 therefore grows no standalone fallback**, and the existing `lighting_cues` field on
  `note_values` is read as-is. Extend it with append-only migrations; don't rebuild it.
- Which PCO service types each campus follows.
- Whether the local-onPC read fallback is ever needed once channel C is proven.
