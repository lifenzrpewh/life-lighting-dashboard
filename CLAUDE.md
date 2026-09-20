# LIFE Lighting Dashboard — operating manual

Touchscreen operator dashboard for grandMA3, beside the console: the Planning
Center run order, the sequences fired on a Sunday, and the small edits made
mid-service. Volunteer-simple, with an operator mode. Electron on Windows.

**The plan is the spec:** `~/.claude/plans/mighty-munching-nautilus.md`. Read it
before changing architecture. This file is the operating manual; a fact lives in
one place — link, don't copy.

## Status — Phase 0

**Nothing here has been verified on a desk.** Use the project's badge convention:
✅ VERIFIED (dated on-console observation) · ⚠️ UNVERIFIED · 🔬 RESEARCHED · ❌ FAILED.
Harness-green alone is ⚠️. onPC counts as on-console.

| | |
|---|---|
| ✅ `src/bridge/export-parse.ts` | Export XML parser. Verified against the operator's real 856-file, 431 MB library. |
| ✅ `spikes/scan-exports.mjs` | Derives `export-blacklist.json`. No desk needed. |
| ⚠️ `console-plugin/LifeBridge.lua` | Console bridge, written as a probe. Harness-green, never run on a console. |
| ⚠️ `spikes/osc-probe.mjs` | Write path + listen port. Needs a desk. |

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

- **`Export Sequence` hard-crashes the console** on a cue Part holding
  `SelectionData` (`MA3_SYNTAX_REFERENCE.md:568`, ❌ 2026-08-27). Two truncated
  artifacts survive in the library. Honour `export-blacklist.json`; `"Command
  executed"` instead of `"OK"` is the failure tell.
- **Exports are enormous** — 45 MB yielding 16 cues, because MA3 inlines every
  dependency. Channel D is not cheap.
- **`ObjectList` returns `{}`, not nil, for a missing object.** An empty table is
  truthy; treating it as a hit reports every sequence as present. Cost us a bug
  the harness caught before it reached a desk.
- **`/<prefix>/cmd` is 🔬, not ✅.** A bare `/cmd` with the wrong prefix is silently
  ignored, and `Receive Command` must be on in the OSC entry.
- **Deleting a recipe line renumbers the survivors.** Never cache a line index.
- **Show names truncate silently at 31 characters.**

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

## Next: run the probe on a desk

1. Copy `console-plugin/LifeBridge.lua` and `.xml` into
   `…/gma3_<ver>/shared/resource/lib_plugins/LifeBridge/`, import the XML.
2. Set `OSC_ENTRY` to an OSC entry with **Send** enabled, pointing at your machine.
3. `node spikes/osc-probe.mjs --listen 8000`, then call the plugin.

If `/life/probe/string` arrives, channel C is viable and the real bridge gets built
on it. If not, fall to console FTP, then `app_terminal CMDLINE <ip>`.

## External files that matter

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
