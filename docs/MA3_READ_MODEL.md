# The MA3 read model — what the dashboard reads, and how

**✅ VERIFIED on a desk: grandMA3 onPC 2.3.2.0, show "Mount Eden Base", 2026-09-20.**
Captured by `console-plugin/LifeBridge.lua` v1; raw report in `/Users/Shared/LIFE/LifeBridge-probe.txt`.

Every fact here is version-specific. Re-run the probe on 2.5 and produce a second
report rather than editing this one.

## How properties are read

Not as Lua fields. `line.Object` silently returns `nil`, which is how probe v0
reported a recipe line with no group as a PASS.

```lua
obj:Get("SELECTION")        -- read one property
obj:PropertyCount()         -- how many
obj:PropertyName(i)         -- 0-BASED
```

`ObjectList("Sequence 100")` resolves and returns a **list**; an empty list means
no such object. Reads cost **~0.01 ms** per sequence resolve.

## ⚠️ Cue numbers are stored ×1000

A cue's `NO` is the display number multiplied by 1000. Sequence 100 reads:

| pos | `NO` | `NAME` | displayed |
|---|---|---|---|
| 1 | `nil` | OffCue | — |
| 2 | `0` | CueZero | 0 |
| 3 | `1000` | [Holding] | **1** |
| 4 | `2000` | SNAP | **2** |
| 5 | `3000` | Q + S FADE UP | **3** |
| 6 | `4000` | Buffer | **4** |

Cross-checked against `LEVEL_STATES.md`, which documents SNAP as cue 2 — and SNAP
reads `NO=2000`. So decimal cue numbers are representable: cue 1.5 is `1500`.

**Two separate traps.** `seq:Ptr(i)` is **positional** — position 1 is OffCue, not
cue 1 — so index is never cue number. And `NO` is never the displayed number
either. Convert explicitly at the boundary; never let a raw `NO` reach the UI or a
command string.

Confusingly, the **sequence** reports its current cue as a *display* number:
`CUENO = 4` while that cue's own `NO = 4000`.

## Live cue tracking is free

The sequence object carries it directly, so a poll is enough:

| Property | Example |
|---|---|
| `CURRENTCUE` | handle:Buffer |
| `CUENO` | 4 |
| `CUENAME` | Buffer |

This matters because **`HookObjectChange` does not work** (below). Losing push costs
almost nothing: at 0.01 ms a read, polling forty sequences is well inside one 8 ms
slice.

## Recipe line — `Sequence S Cue C Part P`, child index N

147 properties; these are the ones the cue editor needs.

| Property | Read | Meaning |
|---|---|---|
| `SELECTION` | handle:Auras | **the group.** Not `Object` |
| `PRESET` | handle:Holding | the value source |
| `VALUES` | handle:Holding | mirrors `PRESET` |
| `SELECTIONMODE` | Strict | matches `CFG.RECIPE_SELECTION_MODE` |
| `MATRICKS` | nil | optional third element of a recipe line |
| `ENABLED` | true | per-line enable |
| `NAME` | Recipe 1 | |
| `FAILEDCOOKEDPART` | None | **cook-failure signal** |
| `EMPTYLASTCOOKING` | false | **second cook-failure signal** |

`SELECTION` and `PRESET` come back as **handles**, not strings — take `.name`.
Seq 100 Cue[3] Part[1] returned 5 lines, the first `Auras` → `Holding`, which is
exactly what `LEVEL_STATES.md` documents for HOLDING. The read model is correct.

**Both cook-failure signals are real properties, not something we have to infer.**
The plan's "this line cooked to nothing" warning can be driven off them directly.

## Cue part — timing lives here, not on the cue

193 properties; the relevant ones:

| Property | Read |
|---|---|
| `CUEINFADE` | 7.5 |
| `CUEINDELAY` | 0.0 |
| `CUEOUTFADE` | **`CueTiming`** |
| `CUEOUTDELAY` | **`CueTiming`** |
| `SNAPDELAY` | 0.0 |
| `TRANSITION` | Linear |
| `DURATION` | 7.5 |
| `COMMAND` | (empty) |
| `OWNDATAPRESENT` | false |

✅ **Confirms the split-timing warning.** `CUEOUTFADE` defaults to the literal
string `"CueTiming"` — it *follows*. Writing it explicitly is what turns a single
fade box into a split `0/0`. Set `CUEINFADE` only.

`OWNDATAPRESENT = false` also confirms `LEVEL_STATES.md`: these cues carry no light
data of their own; the recipes and macros do the work.

## Cue

| Property | Read |
|---|---|
| `NO` | 0 (×1000 — see above) |
| `NAME` | CueZero |
| `TRIGTYPE` / `TRIGTIME` | nil when default |
| `BREAK`, `RELEASE`, `ASSERT`, `ALLOWDUPLICATES` | nil when default |

A `nil` here means "default", not zero. Do not coalesce.

## ❌ `HookObjectChange` does not install

It exists in the environment, but neither `(cb, obj)` nor `(cb, obj, pluginHandle)`
returned a hook id. **Treat push as unavailable and poll.** Re-test on 2.5; the
symbol table suggests a 4-arg form with a target that we have not found.

## ⚠️ `SELECTIONDATA` is always present

It appears as a Lua table on **every** cue part, including ones that export fine.
So its mere presence is *not* the `Export Sequence` crash marker — only a
**non-empty** one is. Any Lua-side crash check must inspect the contents, not the
property. The XML-side check in `src/bridge/export-parse.ts` is unaffected: the
console only writes a `<SelectionData>` element when there is data.

## OSC transport — ✅ VERIFIED 2026-09-21, onPC/console 2.3.2.0

**A console executes a command that arrived over OSC/UDP.** Channel A is real. The
working shape, observed on desk `10.11.60.40`:

| | |
|---|---|
| Address | `/life/cmd` — i.e. `/<prefix>/cmd` |
| Type tag | `,s`, one string argument |
| Payload | the command line, e.g. `Help` |
| Entry | In & Out -> OSC, row 3 `OSCData 3` |
| Port | `8003` |
| Prefix | `life` (no slashes) |
| Destination IP | `10.11.60.182` |
| Toggles | `Receive`, `Send`, `Receive Command`, `Send Command` = Yes; global `Enable Input`/`Enable Output` on |

### ⚠️ Editing an entry's Port does NOT move the live socket

**This is the expensive one.** MA3 binds an entry's socket when the entry is
activated and keeps it. Editing the `Port` field changes *the table* and nothing
else — the entry goes on listening on its old port, and the UI gives no hint that
the two have diverged.

Observed directly: row 3 displayed `8000`, then `8003`, while its live socket
stayed on `8010` throughout. Commands sent to the displayed port did nothing;
commands sent to `8010` — a port that appears **nowhere** in the configuration —
executed normally.

**Fix: toggle `Enable Input` off and on.** The stale socket is released and the
configured port is bound. Confirmed by scan: before, `8010` BOUND / `8003`
refused; after, `8010` refused / `8003` BOUND.

**Diagnosing it from outside the desk**: a connected UDP socket surfaces ICMP
port-unreachable as `ECONNREFUSED`, so an unbound port errors and a bound one
stays silent. Probe the candidate ports *and two controls* — the controls prove
ICMP is not simply being filtered. This is the only way found to see the real
socket, because the console will not show it.

### Two entries may claim one port; first bound wins

Rows 1 and 3 both displayed `8000`. Row 1 (`RemoteApp`, prefix `test`) held the
socket, so `/life/cmd` arrived there, failed the prefix check, and was dropped
**silently** — no error, no log, no System Monitor line. Give every entry its own
port; do not rely on the prefix to separate entries that share one.

**Port selects the entry; prefix then validates within it.** Both, in that order.

### `Destination IP` is output-only — input is not source-filtered

The console accepts OSC on a bound port from **any** sender. `Destination IP` only
says where feedback is sent. So an entry pointing at a completely different
machine will still receive, and silently drop, packets from this one — which is
what made "which row is ours" so hard to pin down: the row that answered us and
the row that pointed at us were different rows.

Consequence, now measured rather than assumed: anything on the network can command
this desk. That is the threat model `docs/PLAN.md` already accepts — accident and
bug, not adversary — but it is literally true.

### `Echo Input` defaults to `No`

System Monitor shows nothing about arriving OSC until `Echo Input` is `Yes` on that
row. An empty System Monitor is therefore **not** evidence that packets are not
arriving, and reading it that way costs an afternoon.

### Channel B — the console pushes on change ✅

Moving one executor fader produced **269 messages** in a single ~30 s window:

```
/life/14.14.1.6.1005   ,sif   "FaderMaster", 3, <float>
```

Prefix, then pool `14.14.1.6`, object `1005` — the pool-address shape
`companion-module-grandma3/docs/OSC_PROTOCOL.md` predicts. `,sif` is name, int,
value. This is what the vendored `parse.ts`/`state.ts` decoder consumes.

**It is chatty.** 269 packets for one fader sweep is ~9/second sustained, per
control. The dashboard must coalesce these per object before they reach React —
one state update per frame, not per packet — or a busy desk will drive the
renderer flat out for no visible gain.

✅ **Second capture, 2026-09-21, dashboard on 10.11.60.215:** 1221 packets in
90 s, all of them channel B, decoded 1221/1221 by `src/bridge/osc.ts`. Coalesced
at 10 Hz that is **267 frames**, a 4.6x reduction. The rate holds: ~13/s here
against ~26/s before, the difference being how hard the faders were worked.

⚠️ **The executor set is open.** Four were live this time — `1002`, `1003`,
`1004`, `1005` — where the first capture saw two. Nothing may assume a known
pair, or a fixed count.

⚠️ **The level range is still only partly observed.** Values reached **76.8**,
past the 54.5 maximum of the first capture. It reads as a percent, but neither
end has been seen: no capture has run a fader to its stop and read the number.
So `value` is carried unscaled and unclamped in `src/bridge/channel-b.ts`, and
nothing normalises it to 0..1 on an assumption.

**Silence is still not death.** Channel B speaks only on change; a quiet desk
mid-sermon emits nothing for minutes and is perfectly healthy. Link health must
come from unanswered *requests*, never from an empty inbox — which is what
`src/shared/reading.ts` `linkFromRequests` already enforces.

### Channel C — the plugin's `SendOSC` push ✅

`Call Plugin "LifeBridge"` sent over channel A produced **14 messages** back over
channel C, carrying the whole probe report. All three channels now work, and the
console-direct architecture holds end to end: command in over A, structure out
over C, no shared filesystem.

**⚠️ `SendOSC` prepends the entry's Prefix. Addresses in the plugin must be BARE.**
The plugin sent `/life/probe/int` and it arrived as **`/life/life/probe/int`**.
Use `/probe/int`; the entry supplies `life`.

**⚠️ `SendOSC` does not carry UTF-8.** An em-dash in a probe string arrived as the
bytes `b \0 \20`. Payloads must be ASCII — `oscSafe` now strips high bytes, for the
same reason it strips quotes rather than escaping them: the corruption is silent
and the command still returns `OK`.

**Both fixes ✅ re-verified on the desk the same day**: addresses arrive as
`/life/probe/int` with one prefix, and text as `listener - a send`, clean ASCII.
`Call Plugin 7` and `Call Plugin "LifeBridge"` both work over channel A.

⚠️ **The probe accumulates results across calls.** A second `Call Plugin` in the
same session reported `18/20 passed` — two runs of 9/10, not a changed verdict.
The `results` table is not reset in `main()`. Harmless for a probe; the real
bridge must not inherit it.

### The plugin XML must be the EMBEDDED form, with a BOM

Two hard importer requirements, both of which fail quietly:

1. **UTF-8 BOM required.** A BOM-less XML will not import. Every working plugin in
   the operator's library starts `EF BB BF`. Guarded by a test.
2. **External-file form does not travel.** `<ComponentLua FileName="...">` stores an
   absolute path from the machine that built it; on any other console the plugin
   pool shows the row red with `File Exists: No` and `Call Plugin` does nothing at
   all — no error, no log. Use `<FileContent><Block Base64=.../></FileContent>`,
   1024-byte stride, `Size` = block count. `npm run build:plugin` emits it and
   round-trip verifies before the file lands.

### ❌ Re-importing does NOT reload a plugin already in memory

❌ 2026-09-21. A rebuilt `LifeBridge.xml` was imported over plugin 7 and
called again. It ran the OLD code.

The proof is the probe's own accumulation bug, used as an instrument: the
tally came back `36/40`, then `45/50`. Five runs of ten probes, every one
appending to a single `results` table — a table that can only exist inside a
chunk that was never re-read. The new build has eleven probes and resets that
table per call, so it can only ever report `N/11`. `Call Plugin 7` and
`Call Plugin "LifeBridge"` both hit the stale one.

⚠️ **Nothing says so.** `Call Plugin` succeeds, the plugin pool shows the
newly imported file, and the output is the old program. This is the same shape
as the external-file trap above: the failure is silent and the thing you are
looking at says you succeeded.

To actually load new code, the loaded chunk has to go: delete the plugin object
and re-import, or restart the console. Import alone is not enough — which
means "the XML is self-contained" solves DISTRIBUTION, not DEPLOYMENT.

⚠️ It also means module state survives between calls, which is why the
probe accumulated in the first place. Anything shipped must assume the chunk
outlives the call and reset what it owns.

### One `Port`, both directions

There is no separate input/destination port — one field, used each way. Matches the
2.3 manual's column list.

## UserVars

`GetVar(UserVars(), "SGV2_BaseShow")` ✅ — the form `BaseFileSaver.lua` uses.
`UserVars():Get(name)` ❌ returns empty.

On "Mount Eden Base", `SGV2_BaseShow` = `Mount Eden Base` — the campus show names
*itself* as its base, so SaveGuard would refuse an in-place save there. Worth
knowing before building the showfile panel.

Showfile name: `Root().manetsocket.showfile` ✅.
