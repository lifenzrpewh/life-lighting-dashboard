// The trigger board — derived from the showfile, never configured.
//
// WHY THIS EXISTS: docs/PLAN.md is explicit that this app has zero user-facing
// configuration. The board self-populates from the `SGV2_*` UserVars every
// showfile already carries (`SGV2_N`, `SGV2_Name<g>`, `SGV2_GroupOrder`,
// `SGV2_Color<n>` as "Name|RRGGBB") plus the object-numbering map in
// BOUNDARIES.md §3. A show built without Bump has no Bump tiles — not a greyed
// tab, not a setting. If something here needs configuring, that is a bug in the
// derivation, not a missing preferences pane.
//
// ⚠️ UNVERIFIED END-TO-END. Reading these UserVars from the desk requires
// channel C, and as of 2026-09-20 nothing has yet observed an OSC packet arrive
// (docs/PLAN.md Phase 0 spike 1). `GetVar(UserVars(), n)` itself is ✅ desk-
// verified — it is the transport underneath that is not. Until a packet is seen
// landing, the board is legitimately UNKNOWN, and the UI says so.

import type { Reading } from './reading.js'

/** A tile the operator can fire. `sequence` is the real pool number, so the
 *  numbering rules apply to it directly — see `isEngineOwned`. */
export type Tile = {
	sequence: number
	label: string
	/** "RRGGBB" from SGV2_Color<n>, or null when the show names no colour. */
	colour: string | null
	/** False when the numbering map says this tile should exist but the showfile
	 *  read has not confirmed it does. Such a tile is drawn dotted and labelled
	 *  as unconfirmed — and stays firable, because the desk may well have it and
	 *  a volunteer reaching for a look must not be told "no" by our uncertainty. */
	confirmed: boolean
}

/** Where a sequence sits in the numbering map, which decides whether the board
 *  may write to it at all.
 *
 *  - `basefile`  — 1..1000. Basefile territory. READ-ONLY, full stop.
 *  - `engine`    — inside a generator-swept range. Editable in principle, but the
 *                  next Show Creator run erases the edit, so the board badges it
 *                  ENGINE and defaults to read-only.
 *  - `campus`    — safe to write.
 */
export type Ownership = 'basefile' | 'engine' | 'campus'

/** The one hard line, enforced here and again plugin-side. Writing below 1001 is
 *  writing into the basefile (CLAUDE.md, BOUNDARIES.md §3). Client-side checks
 *  are a courtesy; the plugin's allow-list is the actual guard, because a buggy
 *  client must not be able to reach past it. */
export const FIRST_WRITABLE_OBJECT = 1001

export function isBasefileOwned(sequence: number): boolean {
	return sequence < FIRST_WRITABLE_OBJECT
}

export type Board = {
	/** Aspect groups in `SGV2_GroupOrder`, each with the tiles that exist. */
	looks: Tile[]
	groups: Tile[]
}

export type BoardView = {
	board: Reading<Board>
}
