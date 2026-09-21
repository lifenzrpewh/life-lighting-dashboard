// Channel B — the console's native OSC out, turned into something the app can hold.
//
// WHY THIS EXISTS: channel B is how the dashboard learns that a fader moved
// without asking. ✅ desk-verified 2026-09-21 (docs/MA3_READ_MODEL.md § Channel B):
//
//     /life/14.14.1.6.1005   ,sif   "FaderMaster", 3, 51.294
//
// Prefix, then the pool address `14.14.1.6`, then the object `1005`.
//
// THE RULE THIS FILE ENFORCES: every field here was observed on a desk, and every
// field whose MEANING was not observed says so. The middle integer is the live
// example — it arrived as `3` in all 771 messages of the capture, which tells us
// its value and nothing whatsoever about what it means. It is carried through
// under a name that claims nothing, because inventing `page` or `index` here
// would put a guess into the type system where it would be read as a fact.
//
// ⚠️ Silence on this channel is NOT death. The console speaks only on change, so
// a quiet desk mid-sermon emits nothing for minutes and is perfectly healthy.
// Link health comes from unanswered requests — `linkFromRequests` in
// src/shared/reading.ts — and must never be derived from an empty inbox here.

import type { OscMessage } from './osc.js'

export type ExecutorUpdate = {
	/** The dotted pool address exactly as the console sends it, e.g.
	 *  "14.14.1.6.1005". Kept whole because it is the only stable identity we
	 *  have for the control, and it is what the coalescer keys on. */
	path: string
	/** Trailing component of the path — the executor's object number, e.g. 1005.
	 *  Note this IS the pool number a person sees, unlike a cue's `NO`, which is
	 *  the display number ×1000 (docs/MA3_READ_MODEL.md). No conversion here. */
	object: number
	/** First argument: the control's role as MA3 names it, e.g. "FaderMaster". */
	control: string
	/** Second argument.
	 *
	 *  ⚠️ MEANING UNVERIFIED. Observed constant `3` across every one of the 771
	 *  messages captured 2026-09-21, which is not enough to distinguish a page
	 *  number from an executor index from a control-type enum. Recorded so a
	 *  later desk run can answer it; not interpreted, and nothing should branch
	 *  on it until something does. */
	code: number
	/** Third argument: the level.
	 *
	 *  ⚠️ Observed spanning 0.000 to 54.468 in the capture — i.e. it reads as a
	 *  PERCENT, not a 0..1 fraction. It is carried through unscaled and unclamped:
	 *  normalising a number whose range we have only partly observed would be a
	 *  guess applied to every value on screen. */
	value: number
}

export type ChannelBResult =
	| { ok: true; update: ExecutorUpdate }
	/** Decoded fine, but it is not a channel B executor update — a channel C
	 *  `/life/probe/...` push, say. Not an error: the two channels share one
	 *  port (docs/MA3_READ_MODEL.md § One Port, both directions), so the caller
	 *  routes on this rather than logging a failure. */
	| { ok: false; reason: 'other-channel'; detail: string }
	| { ok: false; reason: 'bad-address'; detail: string }
	| { ok: false; reason: 'bad-args'; detail: string }

/** A pool address: two or more dot-separated integers, e.g. `14.14.1.6.1005`.
 *  Anchored at both ends so `probe/int` and `14.14.1.6.1005.` both fail. */
const POOL_ADDRESS = /^\d+(?:\.\d+)+$/

/** Interpret a decoded OSC message as an executor update.
 *
 *  `prefix` is the OSC entry's Prefix on the console (`life` in the working
 *  config). It is required rather than optional: the entry supplies it on every
 *  address, and checking it is what stops another OSC talker on the same port
 *  from being read as desk state. */
export function readExecutorUpdate(message: OscMessage, prefix: string): ChannelBResult {
	const head = `/${prefix.replace(/^\/+|\/+$/g, '')}/`
	if (!message.address.startsWith(head)) {
		return {
			ok: false,
			reason: 'other-channel',
			detail: `address ${message.address} is not under ${head}`,
		}
	}

	const path = message.address.slice(head.length)
	if (!POOL_ADDRESS.test(path)) {
		// `/life/probe/summary` lands here, and correctly so.
		return { ok: false, reason: 'other-channel', detail: `${path} is not a pool address` }
	}

	const last = path.slice(path.lastIndexOf('.') + 1)
	const object = Number(last)
	if (!Number.isSafeInteger(object)) {
		return { ok: false, reason: 'bad-address', detail: `object ${last} is not an integer` }
	}

	// Exactly `,sif`. Not "at least" — a message with extra arguments is a shape
	// we have never seen on a desk, and reading the first three out of something
	// unrecognised is how you get a confident wrong number.
	const [control, code, value] = message.args
	if (
		message.args.length !== 3 ||
		control?.type !== 's' ||
		code?.type !== 'i' ||
		value?.type !== 'f'
	) {
		const shape = message.args.map((a) => a.type).join('')
		return { ok: false, reason: 'bad-args', detail: `expected sif, got ${shape || '(none)'}` }
	}

	return {
		ok: true,
		update: { path, object, control: control.value, code: code.value, value: value.value },
	}
}
