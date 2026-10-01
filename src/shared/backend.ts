// The Planning Center backend (`visuals-song-comms`), as the screen may see it.
//
// WHY THIS EXISTS: main talks to the backend and holds the booth's session; the
// renderer needs to show whether the booth is signed in, as whom, for which
// campus, and the pairing QR. This is that view, and nothing that could sign in.
//
// THE RULE THIS FILE ENFORCES: no token crosses to the renderer. The session
// stays in main, encrypted at rest, like the MA passwords. The QR carries only
// a pairing nonce, which is useless once used or three minutes old.

/** How often main reads the run order. Notes are written during the week and
 *  a run order changes rarely on the day, so this is about noticing a dead
 *  backend, not about speed. Small requests, a handful per read. */
export const RUN_ORDER_POLL_MS = 30_000

/** How long one read may take before it counts as unanswered. */
export const RUN_ORDER_TIMEOUT_MS = 10_000

/** A run order older than this is STALE. Derived, not configured: two missed
 *  reads and the time the third may take. One slow read does not dim the
 *  spine; a backend that has stopped answering does, while still showing what
 *  it last said, with its age. */
export const RUN_ORDER_STALE_AFTER_MS = 2 * RUN_ORDER_POLL_MS + RUN_ORDER_TIMEOUT_MS

/** The QR pairing, as the Settings panel shows it. */
export type PairingView =
	| { phase: 'starting' }
	/** `qrSvg` is an SVG document, rendered as an image and never as markup. */
	| { phase: 'waiting'; qrSvg: string; expiresAt: number }
	| { phase: 'verifying' }
	| { phase: 'expired' }
	| { phase: 'failed'; detail: string }

export type BackendStatus =
	/** No backend key on this computer, so nothing can be asked. */
	| { state: 'unconfigured'; detail: string }
	| { state: 'unpaired'; pairing: PairingView | null }
	| {
			state: 'paired'
			/** The account the booth signed in as. */
			email: string | null
			/** Its display name, once a read has said: for a booth device, the
			 *  name it was created with. */
			name: string | null
			/** The campus the account is scoped to, once a read has said. */
			campus: string | null
			/** Something about the account worth fixing, e.g. that it can also
			 *  edit notes. Not a failure: the run order still reads. */
			warning: string | null
	  }
