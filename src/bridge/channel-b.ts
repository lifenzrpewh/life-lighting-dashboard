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
import type { ExecutorUpdate } from '../shared/desk.js'

// The shape lives in src/shared/desk.ts so the renderer can hold it without
// pulling the decoder into the web bundle. Re-exported here because this is
// where it is produced, and callers of the parser should not need to know that.
export type { ExecutorUpdate }

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
