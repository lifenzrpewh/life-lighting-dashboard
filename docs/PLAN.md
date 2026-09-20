# LIFE Lighting Dashboard — Plan

## Context

Volunteers run lighting for LIFE services on a grandMA3 console. Everything they need is spread
across console screens, a paper run sheet, and the operator's head. The ask: **one touchscreen next
to the console** carrying the service order, the handful of sequences that actually get fired, and
the small edits made mid-service — simple enough for a volunteer, with enough flex for the LD.

Priority: **PCO → sequence trigger + cue edit → showfile management.** Show Creator integration is
explicitly not a priority ("Not a major for show creator AT ALL").

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
  src/preload/                      contextBridge — no nodeIntegration
  src/renderer/                     React + Vite + TS + Tailwind v4 (@theme tokens)
  console-plugin/                   LifeBridge.lua + XML bundle
  test/                             offline harnesses (mock MA3, mock lying desk)
```

**Electron, not Tauri.** The decoder we're reusing is TypeScript; the bridge stays Node/TS, renderer
and main share types, and the whole stack stays in the language you work in. Tauri would buy a
smaller binary at the cost of a Rust port of the one piece we most want unchanged.

**Data split.** Supabase (shared) holds the PCO cache, campuses, permissions and the existing
`lighting_cues` notes read as-is. The only new tables are the curated board and item pins. Local
Dexie mirrors everything a service needs. **A service must survive the Supabase box, the network, or
the console going away — independently.**

> The payoff of sharing the backend: the LD writes a lighting note against a song in the Visuals App
> during the week, and it appears on the console touchscreen on Sunday next to the button that fires
> it. Neither app had to know about the other.

**Kiosk auth.** Reuse the existing QR device-pairing flow — the booth PC is paired once at
volunteer permission only. Operator mode is a separate elevation, so a permanently-logged-in kiosk
can never be the thing that authorises a destructive write.

---

## The console plugin — `LifeBridge`

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

### Phase 1 — The service screen (PCO + trigger)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ● LIVE 0.4s   Sunday 21 Sep          10:31        VOLUNTEER        Showfile ▸  │
├──────────────────────────┬─────────────────────────────────────────────────────┤
│  RUN ORDER        [PCO●] │  NOW · Worship · "Great Are You" · 4:30              │
│                          │  ┌────────────┐ ┌───────┐┌───────┐┌───────┐         │
│  ▸ Countdown      10:02  │  │ GO THIS    │ │ Warm  ││ Deep  ││ Chase │         │
│  ▸ Welcome        10:05  │  │ ITEM       │ │       ││ Blue  ││  ON   │         │
│ ╔══════════════════════╗ │  └────────────┘ └───────┘└───────┘└───────┘         │
│ ║ NOW · Worship  4:30  ║ ├─────────────────────────────────────────────────────┤
│ ║ "Great Are You"      ║ │  ▌LOOKS▐  GROUPS   PINNED   ALL⚙        [ Find ]    │
│ ║ ♪3  ▣2               ║ ├─────────────────────────────────────────────────────┤
│ ║ "band only,          ║ │  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐          │
│ ║  no movers"          ║ │  │ Warm ││ Cool ││ Full ││Preach││Baptism│          │
│ ╚══════════════════════╝ │  └──────┘└──────┘└──────┘└──────┘└──────┘          │
│  ▸ Message        10:12  │  ┌──────┐┌──────┐┌┈┈┈┈┈┈┐                           │
│  ▸ Response       10:40  │  │Comms ││ Kids ││? Btn7│ ← existence unknown       │
│         [ jump to NOW ]  │  └──────┘└──────┘└┈┈┈┈┈┈┘                           │
├──────────────────┬───────┴──────┬─────────┬─────────┬──────────────────────────┤
│   PRE / POST     │   HOLDING    │  HAZE   │  FADE   │  RECOVER                 │
└──────────────────┴──────────────┴─────────┴─────────┴──────────────────────────┘
```

- **The run order is a permanent left spine**, never covered. It's the only thing a volunteer
  understands without training.
- **HOLDING and PRE/POST are the biggest targets on the screen, bottom-left**, in easiest reach.
  They are the recovery path — **no overlay in the app may ever cover the bottom rail.**
- **Top band is read-only, bottom band is act-only.** Status where you look; actions where your hand
  rests. Nothing destructive lives in the bottom rail.
- **The Sunday path is four controls**: PRE/POST before doors → HOLDING at start → GO THIS ITEM per
  item → PRE/POST at the end.
- **The board self-populates from UserVars + `BOUNDARIES.md` §3** — group count, names, order,
  colours and which aspects exist are all read from the showfile. A show built without Bump has no
  Bump tiles, not a greyed tab. **The app has zero user-facing configuration.** If something needs
  configuring, that's a bug in the derivation.
- **Curation is the residue of browsing**, not a settings page: Pin, Attach to this item, Hide,
  Rename — four verbs performed on tiles. That's the answer to "between curated and browse-all."
- **`ALL` is search-first**, operator-only, capped at 8 results, each badged `CAMPUS` (safe) or
  `ENGINE` (inside a generator-swept range — read-only by default, because the next Show Creator run
  would erase the edit).
- **Item changes never fire anything.** Auto-firing a look because someone advanced PCO during a
  prayer is the worst thing this app could do.
- **No colour picker or position pad.** The console is 30 cm away with better ones.

**State honesty — four states, one vocabulary, used identically everywhere:**

| | Rendering |
|---|---|
| **LIVE** | full contrast, solid border |
| **STALE** | 60% contrast, value shown **with its age** (`78% · 4m ago`), dashed underline |
| **UNKNOWN** | `?` **in place of the value**, dotted border — tile still firable |
| **UNREACHABLE** | full-width bar; every element drops to UNKNOWN at the same instant |

The read layer returns a discriminated union (`{ok,value}` / `{timeout}` / `{error}`) with no default
branch, no `?? 0`, no `|| "off"` — so rendering a timeout as a value is a **type error**, not a
code-review item. This exists because `ma3-mcp/server.py:184` is literally
`send(...) or "No groups found"`, and that one line makes a slow desk look like an empty show.
**Boot state is UNKNOWN, not off.** Writes get a third outcome: `sent · unconfirmed`.
**Unreachable does not disable the buttons** — the desk may still be taking commands, and a
volunteer needs HOLDING to work regardless.

### Phase 2 — Cue editor (operator mode)

Opens as a right-hand sheet that **never covers the run order or the bottom rail.**

- **Timing**: no free text — a detented picker (`0 · 0.5 · 1 · 2 · 3 · 4 · 5 · 8 · 10 · 15 · 20 · 30`),
  with a keypad for the rare exact number. Writes `CueInFade`, leaving `CueOutFade` at `"CueTiming"`
  (setting both makes a split `0/0`).
- **Cooking is not a step the user can forget — it is part of Apply.** The generator already uses
  the targeted form `Cook Sequence <s> Cue <c> Part 0 /Merge` (`ShowfileGenerator.lua:6898`), so a
  recipe edit costs one cheap scoped command, not a show-wide Cook-All. There is no "apply without
  cooking" and the user is never asked. *The hard parts are code decisions, not questions for the
  user.*
- The forgettable step survives only as the **failure** case, and gets the loudest treatment in the
  app: if the cook is unacknowledged, a full-width amber strip appears above the bottom rail —
  not a toast, not dismissible, persists across navigation and mode switches: *"1 recipe edit sent —
  cook NOT confirmed. The rig may not have changed. [VERIFY]"*. It clears only on a confirmed
  read-back, never on a timer.
- After Apply, re-read the part and check **`FAILEDCOOKEDPART`** — if populated, flag the line red:
  *"This line cooked to nothing — the group is empty or the preset has no data."* A recipe against
  an empty preset fails **silently**, and `Preset 21.1/21.2` ship empty on the master.
- **Deleting a recipe line renumbers the survivors** (✅ desk-verified 2026-08-28). After any delete
  the editor discards its line list and re-reads before accepting another action. Never hold an
  index across a delete.
- **The SNAP guard.** On Sequences 100/101, if a fade edit on cue 1 would exceed cue 2's trigger
  time, show the actual numbers inline: *"Fade 6.0 s is longer than the SNAP trigger at 4.0 s. The
  beams will change gobo while the audience can see them."* — with a one-tap fix. This trap fails
  silently on stage and nothing else catches it.
- **Store and Delete** sit in a separate band with 120 px of empty space above them, never adjacent
  to Apply. After any destructive action the panel goes to UNKNOWN and re-reads — optimistic
  rendering is banned app-wide.
- All writes append `/NC`. Cooks are **not** sent with `/NoOops` — a live edit stays undoable from
  the desk's own Oops.

### Phase 3 — Showfile

A **chip in the status bar**, not a panel, opening to a sheet.

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

---

## Mode switching

**Boots into volunteer, always; operator mode is never remembered across a restart.** Switching in
is a **3-second hold** on the mode chip — no PIN, because the risk is an accidental switch, not a
rogue volunteer, and a PIN is a setting (*resist configuration*). Entering operator mode **reveals,
it never acts** — every dangerous thing inside still carries its own guard. Switching out is one
tap: becoming more restricted is always safe. Auto-drops after 15 minutes idle, never while a cook
is unconfirmed. Volunteers keep plain Save — taking it away would train people to leave work unsaved.

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
- **On desk, per phase**: fire every tile and confirm feedback; edit timing and confirm on the
  console; edit a recipe, apply, and confirm output changed; Load and Save As a scratch show.
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

## Open questions

- ~~**Is `visuals-song-comms` actually deployed and in use?**~~ **Answered: yes — deployed and in
  production use**, despite one push on 2026-08-18 and nothing since. It looks dormant and is not.
  **Phase 1 therefore grows no standalone fallback**, and the existing `lighting_cues` field on
  `note_values` is read as-is. Extend it with append-only migrations; don't rebuild it.
- Which PCO service types each campus follows.
- Whether the local-onPC read fallback is ever needed once channel C is proven.
