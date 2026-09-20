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

## UserVars

`GetVar(UserVars(), "SGV2_BaseShow")` ✅ — the form `BaseFileSaver.lua` uses.
`UserVars():Get(name)` ❌ returns empty.

On "Mount Eden Base", `SGV2_BaseShow` = `Mount Eden Base` — the campus show names
*itself* as its base, so SaveGuard would refuse an in-place save there. Worth
knowing before building the showfile panel.

Showfile name: `Root().manetsocket.showfile` ✅.
