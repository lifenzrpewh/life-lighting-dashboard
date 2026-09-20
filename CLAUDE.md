# LIFE Lighting Dashboard — operating manual

Touchscreen operator dashboard for grandMA3, beside the console: the Planning
Center run order, the sequences fired on a Sunday, and the small edits made
mid-service. Volunteer-simple, with an operator mode. Electron on Windows.

**Read in this order:** `docs/PLAN.md` (the spec — architecture and phasing),
`docs/MA3_READ_MODEL.md` (✅ desk-verified API facts, read before touching console
code). This file is the operating manual. A fact lives in one place — link, don't
copy.

## Status — Phase 0, transport proven

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
| ✅ `console-plugin/LifeBridge.lua` | Probe v1. Run on a desk; findings recorded. Read-only on the show. |
| ✅ `console-plugin/_test_lifebridge.lua` | Offline harness, 106 checks. |
| ⚠️ `spikes/osc-probe.mjs` | Listener side never exercised — no OSC entry was configured, so **delivery** is still unconfirmed. |

**Still open:** nothing has confirmed an OSC packet actually *arrives*. The console
returned `OK:` for `SendOSC`, which proves the syntax and the command, not the
delivery. Configure an OSC entry with Send enabled, run
`node spikes/osc-probe.mjs --host <ip> --listen <port>`, and call the plugin.

## The four channels

| | Carries | Mechanism |
|---|---|---|
| **A** Command out | every write | OSC/UDP → `/<prefix>/cmd`, fire-and-forget |
| **B** Live state in | active flags, fader levels | console's native OSC out |
| **C** Structure in | cue lists, timing, recipe lines | console plugin → `SendOSC` push |
| **D** Bulk fallback | same, offline | `Export Sequence` → parse XML, **never during a service** |

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
- **Resist configuration.** The board self-populates from `SGV2_*` UserVars and the
  numbering map. If something needs configuring, that's a bug in the derivation.

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

## grandMA3 versions

On **2.3.2**, moving to **2.5 within ~6 months of 2026-09-20**. Every desk answer is
version-specific, so `LifeBridge.lua` probes the version first and stamps it onto
every emitted line; re-running it on 2.5 re-answers the whole set. Keep each run's
output, dated and versioned.

Exposure this project has that the Show Creator does not: 2.4 consolidated
**standard-recipe** range properties (`Speed From`/`To` → `Speed`).
`MA3_2.5_COMPAT.md` clears the generator because it writes those as MAtricks/Preset
properties; the cue editor here touches standard recipes directly.

## Running

```
npm install
npm test     # TS tests against the real library, then the Lua harness
npm run scan # regenerate export-blacklist.json
```

Tests read `~/MALightingTechnology/gma3_library/datapools/sequences` and skip if
absent. ~50 s, because five real exports are 45 MB each.

## Next session starts here

The probe has done its job and the seam is clean — nothing is half-built.

**Build the real `LifeBridge`**, replacing the probe: a batched `snapshot` verb
that reads N sequences via the property names in `docs/MA3_READ_MODEL.md` and
pushes NDJSON back over `SendOSC`, inside an 8 ms slice budget with `busy` acks
between slices. Design is in `docs/PLAN.md` under "The console plugin". Keep the
probe's guarantees: read-only on the show, no generic `cmd` verb in the shipped
build, write allow-list keyed to `BOUNDARIES.md` §3, and results that fail rather
than return a plausible value.

Two things worth doing first, both cheap:
1. Confirm OSC **delivery** with the listener (see Status above). Everything
   downstream assumes packets arrive.
2. Decide whether the Electron shell and the PCO service screen (Phase 1) should
   go ahead in parallel — it depends on none of the console work.

## External files that matter

In this repo: `docs/PLAN.md`, `docs/MA3_READ_MODEL.md`, and the raw probe report
at `/Users/Shared/LIFE/LifeBridge-probe.txt` (not in git — regenerate by running
the plugin).

`GrandMA3 Show Creator/docs/` — `BOUNDARIES.md` §3 (object-range map / write
allow-list), `MA3_SYNTAX_REFERENCE.md` (syntax oracle), `LEVEL_STATES.md`
(HOLDING/PRE-POST + the SNAP trap), `MA3_2.5_COMPAT.md`.
`companion-module-grandma3/` — `console-plugin/CompanionFeedback.lua:57` (`SendOSC`
form), `src/osc/{parse,apply}.ts` + `src/state.ts` (MIT, vendor these for channel B).
`ma3-mcp/plugin/mcp_server.lua` — **hazard reference only. AGPL-3.0, do not fork.**

`visuals-song-comms` (GitHub, private) is **deployed and in production use** despite
looking dormant. It is the shared Supabase backend: PCO ingest, auth, campuses, and
the existing `lighting_cues` field on `note_values`. Extend with append-only
migrations; don't rebuild it.
