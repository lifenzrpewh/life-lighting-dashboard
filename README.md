# LIFE Lighting Dashboard

A touchscreen operator dashboard for grandMA3, sitting next to the console: the
Planning Center run order, the sequences that actually get fired on a Sunday, and
the small edits made mid-service. Volunteer-simple, with an operator mode.

Plan: `~/.claude/plans/mighty-munching-nautilus.md`

## Status

⚠️ **Phase 0 — nothing here has been verified on a desk.** The transport spikes
gate everything else. What exists today is the one piece that could be proven
offline against real data.

| | |
|---|---|
| ✅ `src/bridge/export-parse.ts` | Parser for `Export Sequence` XML. Verified against the operator's 856-file, 431 MB library. |
| ✅ `spikes/scan-exports.mjs` | Derives the export blacklist from that library. No desk needed. |
| ⚠️ `spikes/osc-probe.mjs` | Tests the write path and listen port. **Needs a desk.** |
| ⚠️ `console-plugin/LifeBridge.lua` | The console-side bridge, written as a probe. **Read-only on the show** — safe on a live showfile. Harness-green, desk-unverified. |
| ✅ `console-plugin/_test_lifebridge.lua` | Offline harness, 84 checks. Mocks the MA3 API across rich / bare / hostile consoles. |

## Running

```
npm install
npm test                      # builds, then runs against the real library if present
npm run scan                  # writes export-blacklist.json
./scripts/deploy-plugin.sh    # dry run; --write to copy the plugin to the console
lua console-plugin/_test_lifebridge.lua
```

The tests read `~/MALightingTechnology/gma3_library/datapools/sequences` and skip
cleanly if it isn't there. They take ~50 s, because five real exports are 45 MB each.

## grandMA3 versions

Built on **2.3.2**, moving to **2.5 within ~6 months**. Every desk answer is
version-specific, so `LifeBridge.lua` reports the console version first and stamps
it onto every result it emits — re-running it on 2.5 re-answers the whole set.
Keep each run's captured output, dated and versioned.

One exposure this project has that the Show Creator does not: 2.4 consolidated
standard-recipe range properties (`Speed From`/`To` → `Speed`). `MA3_2.5_COMPAT.md`
clears the generator because it writes those as MAtricks/Preset properties — but
the cue editor here touches standard recipe properties directly.

## The one rule

A read that failed must never come back looking like an answer. `parseSequenceExport`
returns a discriminated union, so a truncated export cannot be rendered as a short
sequence. This exists because the prior tooling does `send(...) or "No groups found"`,
which makes a slow desk look like an empty show.

## Hazards, all paid for already

- **`Export Sequence` hard-crashes the console** on a cue Part holding `SelectionData`
  (`MA3_SYNTAX_REFERENCE.md:568`, ❌ 2026-08-27). Two truncated artifacts from that
  crash are still in the library. Run `scan-exports.mjs` and honour the blacklist.
- **Exports are enormous** — 45 MB for 16 cues, because MA3 inlines every dependency.
  A full structure sync is not cheap.
- **`/<prefix>/cmd` over OSC is unverified**, and a bare `/cmd` with the wrong prefix
  is silently ignored. `Receive Command` must be on in the console's OSC entry.
- **Deleting a recipe line renumbers the survivors.** Never cache a line index.
- **Show names truncate silently at 31 characters.**
