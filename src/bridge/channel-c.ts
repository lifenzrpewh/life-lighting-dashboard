// Channel C — what the console pushes back over `SendOSC`, whether the plugin or
// the console's own command line runs it.
//
// WHY THIS EXISTS: channel C shares a port with channel B (docs/MA3_READ_MODEL.md
// § One Port, both directions), so everything it carries arrives in the same
// stream as the fader traffic and has to be picked out of it by address. Only
// `ping` is read so far, because the link is the only thing that needs it yet.
//
// THE RULE THIS FILE ENFORCES: an echo is read exactly as the console writes it,
// or not at all. `pingCommand` in ./ping.ts has the console run
// `SendOSC 3 "/ping,s,<token>"`, and the row prepends its Prefix (✅ 2026-09-21:
// SendOSC prepends it, so `/ping` arrives as `/life/ping`). One string, the token
// and nothing else. Any other shape is refused, because a reply read loosely is
// a reply that can match a ping it does not answer.

import type { OscMessage } from './osc.js'

export type PingReply = {
	/** The token the ping carried, as the console sent it back. */
	echo: string
}

export type PingReadResult =
	| { ok: true; reply: PingReply }
	/** Not a ping: channel B, or another channel C push. Not an error. */
	| { ok: false; reason: 'other-channel'; detail: string }
	| { ok: false; reason: 'bad-args'; detail: string }

export function readPing(message: OscMessage, prefix: string): PingReadResult {
	const address = `/${prefix.replace(/^\/+|\/+$/g, '')}/ping`
	if (message.address !== address) {
		return { ok: false, reason: 'other-channel', detail: `${message.address} is not ${address}` }
	}

	const [only] = message.args
	if (message.args.length !== 1 || only?.type !== 's') {
		const shape = message.args.map((a) => a.type).join('')
		return { ok: false, reason: 'bad-args', detail: `expected s, got ${shape || '(none)'}` }
	}

	return { ok: true, reply: { echo: only.value } }
}
