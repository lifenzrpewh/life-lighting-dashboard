// What main knows about the desk from channel B, in a shape the renderer can hold.
//
// WHY THIS EXISTS: the executor shape is produced in `src/bridge/` (main-side
// parsing) and consumed in `src/renderer/` (which never sees a packet). The web
// build does not compile `src/bridge/`, so the type cannot live there without
// dragging the decoder into the bundle. It lives here, and the bridge imports it
// — types point inwards to shared, never the other way round.
//
// THE RULE THIS FILE ENFORCES: every field is something the desk said, plus the
// moment it said it. There is no "current level" without an `at` beside it,
// because a number with no age cannot be rendered honestly — `readingOf` needs
// the timestamp to decide between LIVE and STALE, and a value that arrives
// without one can only be shown as if it were fresh.

/** One control, as channel B reports it.
 *
 *  ✅ desk-verified 2026-09-21: `/life/14.14.1.6.1005` `,sif` "FaderMaster", 3,
 *  51.294. Full format and the observed ranges in docs/MA3_READ_MODEL.md. */
export type ExecutorUpdate = {
	/** The dotted pool address exactly as the console sends it, e.g.
	 *  "14.14.1.6.1005". Kept whole because it is the only stable identity we
	 *  have for the control, and it is what the coalescer keys on. */
	path: string
	/** Trailing component of the path — the executor's object number, e.g. 1005.
	 *
	 *  ⚠️ This is NOT known to be the sequence pool number a tile carries. The
	 *  pool prefix `14.14.1.6` has not been resolved to a pool, so whether
	 *  executor 1005 is sequence 1005 is unobserved. Nothing may join them until
	 *  a desk run says so. */
	object: number
	/** First argument: the control's role as MA3 names it, e.g. "FaderMaster". */
	control: string
	/** Second argument.
	 *
	 *  ⚠️ MEANING UNVERIFIED. Observed constant `3` across all 771 messages of
	 *  the first capture, which is not enough to distinguish a page number from
	 *  an executor index from a control-type enum. Recorded so a later desk run
	 *  can answer it; nothing should branch on it until one does. */
	code: number
	/** Third argument: the level.
	 *
	 *  ⚠️ Carried unscaled and unclamped. It reads as a percent — values have
	 *  been seen from 0.0 to 76.8 — but neither end of the range has actually
	 *  been observed, so normalising to 0..1 would apply a guess to every number
	 *  on screen. */
	value: number
}

/** An executor update with the moment main received it. The timestamp is what
 *  lets `readingOf` age it to STALE on its own, which is how a desk that goes
 *  quiet stops looking live without anyone having to declare it dead. */
export type ExecutorLevel = ExecutorUpdate & { at: number }

/** Everything main will tell the renderer about channel B.
 *
 *  Note what is absent: any field called `connected`, `online` or `ok`. Channel
 *  B speaks only on change, so this module cannot distinguish a desk that is
 *  gone from one that is simply still. `lastHeardAt` is the raw observation;
 *  turning it into a verdict is somebody else's job and needs a request/response
 *  loop to do it honestly — see `linkFromRequests` in ./reading.ts. */
export type DeskState = {
	/** Newest known value per control, in the order each was first seen. */
	executors: ExecutorLevel[]
	/** When the socket last heard ANYTHING from the desk, or null if never.
	 *  Evidence of life; its absence is NOT evidence of death. */
	lastHeardAt: number | null
	/** Packets seen, and packets that did not decode or had a shape we do not
	 *  recognise. `rejected` climbing is the signal that the desk is saying
	 *  something we are getting wrong — it should sit at 0 forever. */
	packets: number
	rejected: number
	/** False when the OSC port could not be bound at all, which is a different
	 *  fact from a quiet desk and must never be rendered as one. Almost always
	 *  means grandMA3 onPC is running on this machine and owns the port. */
	listening: boolean
}
