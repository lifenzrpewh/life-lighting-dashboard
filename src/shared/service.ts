// The service, as the screen needs it — and the seam to where it really lives.
//
// WHY THIS EXISTS: PCO ingest is already built and in production in
// `visuals-song-comms` (rate-limit-aware client, HMAC webhooks, pg_cron
// reconcile, campus mapping). We do not re-fetch from PCO and we do not invent a
// cue schema: lighting notes already exist as `note_values` rows against
// `field_definitions.key = 'lighting_cues'`, keyed on (field_definition_id,
// pco_item_id). This file is the shape those rows arrive in, nothing more.
//
// THE RULE THIS FILE ENFORCES: the run order is a `Reading`, not an array. A
// Supabase box that is down, slow, or returning an empty page must not render as
// "this service has no items" — that is the same lie as a slow desk rendering as
// an empty show, wearing different clothes. See src/shared/reading.ts.

import type { Reading } from './reading.js'

/** PCO's own item types, as `pco_items.item_type` stores them. A `header` is a
 *  section divider ("Worship", "Message"), not an item. `other` is the honest
 *  bucket: a type we have not taught the board about is not an error and must
 *  not be dropped from the run order. Nothing here is invented: PCO has no
 *  "teaching", so the board does not either. */
export type ItemKind = 'song' | 'header' | 'media' | 'item' | 'other'

export type ServiceItem = {
	/** PCO's own id. The join key for lighting notes — never a local index. */
	pcoItemId: string
	title: string
	kind: ItemKind
	/** No start time. The backend syncs no plan or item times, only lengths
	 *  (2026-09-30), and a time summed from lengths would be a guess shown as a
	 *  fact. Lengths only, by the operator's choice, until the sync carries times. */
	/** null means PCO carries no length for this item, which is common for
	 *  segments. It is NOT zero, and must not render as 0:00. */
	lengthSec: number | null
	/** The LD's note, written in the Visuals App during the week and read here on
	 *  Sunday. null means no note was written — not an empty note. */
	lightingNote: string | null
}

export type Service = {
	/** ISO date of the service, e.g. "2026-09-21". */
	date: string
	campus: string
	/** The PCO service type, e.g. "Mount Eden 9:30am": what tells two plans on
	 *  one day apart. */
	serviceType: string
	/** PCO plan title, e.g. "Sunday Morning". Often unset in PCO, and then null
	 *  rather than an empty string. */
	planTitle: string | null
	items: ServiceItem[]
	/** The item PCO says is current. May be null before the plan starts.
	 *
	 *  ⚠️ NO SOURCE YET: always null from the backend. It stores no current item
	 *  (`pco_plans.is_live` is set and never cleared), so there is no highlight
	 *  until one is chosen (2026-09-30). Kept as the seam for it.
	 *
	 *  ⚠️ ADVANCING THIS FIRES NOTHING. Auto-firing a look because someone
	 *  advanced PCO during a prayer is the worst thing this app could do
	 *  (docs/PLAN.md, Phase 1). It moves the highlight and nothing else. */
	nowItemId: string | null
}

/** What the backend says a campus has next: the run order's reading.
 *  `service` null means no plan in the sync window (90 days). That is an
 *  answer, not a failure, and not an empty run order either: the spine says
 *  there is no plan, rather than listing nothing. */
export type Schedule = { campus: string; service: Service | null }

/** What the screen actually consumes. Every field is separately honest about
 *  whether it is known, because they fail independently: Supabase can be
 *  reachable while the console is not, and vice versa. */
export type ServiceView = {
	service: Reading<Service>
}

export function formatLength(lengthSec: number | null): string | null {
	// null in, null out. A missing length renders as nothing at all, never 0:00 —
	// "0:00" would read as an item with no time rather than an unknown one.
	if (lengthSec === null) return null
	const m = Math.floor(lengthSec / 60)
	const s = lengthSec % 60
	return `${m}:${String(s).padStart(2, '0')}`
}

/** Find the current item. Returns null rather than falling back to the first
 *  item — "the service has not started" and "we are on item 1" are different
 *  facts and the spine renders them differently. */
export function currentItem(service: Service): ServiceItem | null {
	if (service.nowItemId === null) return null
	return service.items.find((i) => i.pcoItemId === service.nowItemId) ?? null
}
