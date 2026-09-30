// Channel C — what the LifeBridge plugin pushes back over `SendOSC`.
//
// WHY THIS EXISTS: channel C shares a port with channel B (docs/MA3_READ_MODEL.md
// § One Port, both directions), so everything the plugin says arrives in the same
// stream as the fader traffic and has to be picked out of it by address. Only
// `ping` is read so far, because the link is the only thing that needs it yet.
//
// THE RULE THIS FILE ENFORCES: an echo is read exactly as the plugin writes it,
// or not at all. `pingVerb` in console-plugin/LifeBridge.lua sends one string,
// `<console version>|<echo>`, to the bare address `/ping`, and the OSC entry
// prepends its Prefix (✅ 2026-09-21: SendOSC prepends it, so `/ping` arrives as
// `/life/ping`). Any other shape is refused, because a reply read loosely is a
// reply that can match a ping it does not answer.

import type { OscMessage } from './osc.js'

export type PingReply = {
	/** What the console says it runs, e.g. `2.3.2.0`. The plugin probes it
	 *  every ping, so a console upgraded mid-run changes it here. */
	version: string
	/** Whatever followed `ping` in the command: the token the request carried. */
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

	const bar = only.value.indexOf('|')
	if (bar === -1) return { ok: false, reason: 'bad-args', detail: `no '|' in ${JSON.stringify(only.value)}` }

	return { ok: true, reply: { version: only.value.slice(0, bar), echo: only.value.slice(bar + 1) } }
}
