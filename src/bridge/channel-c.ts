// Channel C — what the console pushes back over `SendOSC`, whether the plugin or
// the console's own command line runs it.
//
// WHY THIS EXISTS: channel C shares a port with channel B (docs/MA3_READ_MODEL.md
// § One Port, both directions), so everything it carries arrives in the same
// stream as the fader traffic and has to be picked out of it by address. Two
// things are read: the link's `ping`, and LifeBridge's `show` (the showfile).
//
// THE RULE THIS FILE ENFORCES: an echo is read exactly as the console writes it,
// or not at all. `pingCommand` in ./ping.ts has the console run
// `SendOSC 3 "/ping,s,<token>"`, and the row prepends its Prefix (✅ 2026-09-21:
// SendOSC prepends it, so `/ping` arrives as `/life/ping`). One string, the token
// and nothing else. Any other shape is refused, because a reply read loosely is
// a reply that can match a ping it does not answer.

import type { Showfile } from '../shared/showfile.js'
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

/** What LifeBridge's `show` verb can say. Each is an answer from the console,
 *  and each lands in the showfile's Channel: a value, or a failure with its
 *  reason. None of them is a guess at a name. */
export type ShowReply =
	| { kind: 'show'; show: Showfile }
	/** The console answered and could not read its own showfile name. */
	| { kind: 'unreadable'; version: string }
	/** The LifeBridge loaded on the console predates `show`: it answered
	 *  `unknown verb show`. Re-importing over it is not enough (❌ 2026-09-21);
	 *  the plugin has to be deleted and imported. */
	| { kind: 'no-verb' }
	/** The LifeBridge loaded predates `watch`, and said `unknown verb watch`.
	 *  Not a failure of the read: the reader asks `show` instead. */
	| { kind: 'no-watch' }

export type ShowReadResult =
	| { ok: true; reply: ShowReply }
	/** Not a show reply: a ping, channel B, another push. Not an error. */
	| { ok: false; reason: 'other-channel'; detail: string }
	| { ok: false; reason: 'bad-args'; detail: string }

/** Read a `show` reply exactly as `showVerb` in console-plugin/LifeBridge.lua
 *  writes it, or refuse it:
 *
 *    /life/show ,s "<version>|base|<from>|<name>|<base>"
 *    /life/show ,s "<version>|other|<from>|<name>|<base>"
 *    /life/show ,s "<version>|unreadable"
 *
 *  Refused rather than read loosely. A misplaced field could put the base
 *  show's name where the loaded show's belongs, or read `other` as a verdict it
 *  is not, and the chip would say it with confidence. The plugin's `|` cannot
 *  occur inside a field (it sends `/` instead), so a count other than 5 or 2 is
 *  a reply this build does not understand. */
export function readShow(message: OscMessage, prefix: string): ShowReadResult {
	const bare = prefix.replace(/^\/+|\/+$/g, '')
	const only = message.args.length === 1 && message.args[0]?.type === 's' ? message.args[0].value : null

	if (message.address === `/${bare}/error`) {
		// Only this verb's refusal is ours; another verb's is someone else's.
		if (only === 'unknown verb show') return { ok: true, reply: { kind: 'no-verb' } }
		if (only === 'unknown verb watch') return { ok: true, reply: { kind: 'no-watch' } }
		return { ok: false, reason: 'other-channel', detail: `${message.address} is not about show` }
	}

	const address = `/${bare}/show`
	if (message.address !== address) {
		return { ok: false, reason: 'other-channel', detail: `${message.address} is not ${address}` }
	}
	if (only === null) {
		const shape = message.args.map((a) => a.type).join('')
		return { ok: false, reason: 'bad-args', detail: `expected s, got ${shape || '(none)'}` }
	}

	const fields = only.split('|')
	const [version, verdict, from, name, base] = fields
	if (fields.length === 2 && version && verdict === 'unreadable') {
		return { ok: true, reply: { kind: 'unreadable', version } }
	}
	if (
		fields.length !== 5 ||
		!version ||
		(verdict !== 'base' && verdict !== 'other') ||
		(from !== 'uservar' && from !== 'default') ||
		!name ||
		!base
	) {
		return { ok: false, reason: 'bad-args', detail: `not a show reply: ${JSON.stringify(only)}` }
	}
	return { ok: true, reply: { kind: 'show', show: { name, base, baseFrom: from, onBase: verdict === 'base', version } } }
}
