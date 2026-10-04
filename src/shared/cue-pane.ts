// The Cue Manager pane — the visuals app itself, in the run order's place.
//
// WHY THIS EXISTS: the dashboard drew its own read-only run order from the
// backend. The visuals app (visuals-song-comms, the Cue Manager PWA) already
// has everything an LD wanted beside the MA and the dashboard did not: notes
// edited in place, the songs-only view, hidden songs, section labels, "Changed
// in PCO", PCO's own item notes, live updates as someone edits on a phone, and
// an offline queue that resolves two people editing one note. Copying that
// would make two sets of rules that drift, and a subtly wrong copy of the
// editing could overwrite someone's notes. So the real app is embedded, as the
// MA is: one source of truth for the data and for the rules. Decided with the
// owner, 2026-10-02, with booth devices allowed to edit.
//
// THE RULE THIS FILE ENFORCES: like the MA pane, this is a picture, not a
// reading. A page loaded is all `showing` says; the app shows its own offline
// banner and keeps its own cache, and the dashboard never claims to know more.

/** Where a kiosk runs the app's sign-in, and how a booth device signs in.
 *  The kiosk adds this to the pane's user agent so the app can mark its QR as
 *  a booth's, which only an admin may approve, and only as a booth device. It
 *  marks; it does not secure: the approver's side is where that is enforced. */
export const KIOSK_USER_AGENT_MARK = 'LIFEBoothKiosk/1'

export type CuePaneState =
	/** Not on screen yet. */
	| { state: 'idle'; url: string }
	| { state: 'connecting'; url: string; since: number }
	/** A page from the app loaded. NOT a claim that the app can reach its
	 *  backend: offline, it serves itself from its own cache and says so. */
	| { state: 'showing'; url: string; since: number }
	| { state: 'failed'; url: string; at: number; cause: 'error' | 'no-answer'; detail: string; retryAt: number }

export type CuePaneReport = {
	pane: CuePaneState
	/** The last touch or key inside the pane, which the renderer cannot see:
	 *  an LD writing notes for a quarter of an hour must not look idle. */
	lastInputAt: number | null
	/** The Planning Center plan the app has open, from its address, or null on
	 *  any other page. The media check follows it. */
	plan: string | null
}

/** The plan in one of the app's addresses: `/s/90226425` is PCO plan
 *  90226425 (✅ 2026-10-05: the lookbook's Central AM 4 Oct names plan
 *  90226424, the app's `/s/90226424`), `/s/90226425/booth` too. */
export function planOf(url: string): string | null {
	try {
		return /^\/s\/(\d{1,12})(?:\/|$)/.exec(new URL(url).pathname)?.[1] ?? null
	} catch {
		return null
	}
}
