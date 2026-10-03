# Pāua

LIFE's booth dashboard (LIFE Lighting Dashboard until 2026-10-04).

A touchscreen dashboard for the booth, beside the grandMA3: the Cue Manager (the
visuals app's run order, notes edited in place) next to the console's own web
remote, which carries every button and every edit. Volunteer-simple, with an
operator mode. Electron, aimed at a Windows booth PC.

It is becoming a **Visuals Dashboard**: any two views side by side, offering only
what is answering, with Arena (Resolume) as the next source after the console.

## Read

- [`CLAUDE.md`](CLAUDE.md) — the operating manual: status of every piece, the rules,
  the hazards already paid for, and where the next session starts.
- [`docs/PLAN.md`](docs/PLAN.md) — the spec: architecture and phasing.
- [`docs/MA3_READ_MODEL.md`](docs/MA3_READ_MODEL.md) — desk-verified grandMA3 facts.
  Read before touching console code.
- [`docs/VISUALS_DASHBOARD.md`](docs/VISUALS_DASHBOARD.md) — the visuals plan, and
  what Arena has been seen to do.

## Running

```
npm install
npm test        # the tested layer, then the LifeBridge Lua harness
npm run dev     # the kiosk with the mock desk; keys 1–5 switch failure modes, 0 the real link
npm start       # the kiosk, built
npm run dist:win
```

Prerequisites (Node 22, Lua, the optional MA3 library) and the Windows traps are in
`CLAUDE.md` § Prerequisites.

## The one rule

A read that failed must never come back looking like an answer. Every source reports
LIVE, STALE, UNKNOWN or UNREACHABLE, and nothing turns a timeout into a value
(`src/shared/reading.ts`).
