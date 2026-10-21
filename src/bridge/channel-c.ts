// Channel C — what the console pushes back over `SendOSC`, whether the plugin or
// the console's own command line runs it.
//
// WHY THIS EXISTS: channel C shares a port with channel B (docs/MA3_READ_MODEL.md
// § One Port, both directions), so everything it carries arrives in the same
// stream as the fader traffic and has to be picked out of it by address. Two
// things are read: the link's `ping`, and LifeBridge's `show` and `watch` (the
// showfile), which carry the plugin's build first (LIFEBRIDGE_BUILD).
//
// THE RULE THIS FILE ENFORCES: an echo is read exactly as the console writes it,
// or not at all. `pingCommand` in ./ping.ts has the console run
// `SendOSC 3 "/ping,s,<token>"`, and the row prepends its Prefix (✅ 2026-09-21:
// SendOSC prepends it, so `/ping` arrives as `/life/ping`). One string, the token
// and nothing else. Any other shape is refused, because a reply read loosely is
// a reply that can match a ping it does not answer.

import { LIFEBRIDGE_BUILD } from '../shared/lifebridge-build.js'
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

/** What LifeBridge's `show` and `watch` can say. Each is an answer from the
 *  console, and each lands in the showfile's Channel: a value, or a failure
 *  with its reason. None of them is a guess at a name. */
export type ShowReply =
	| { kind: 'show'; show: Showfile }
	/** The console answered and could not read its own showfile name. */
	| { kind: 'unreadable'; version: string }
	/** What the watcher on the console says it did. */
	| { kind: 'watch'; state: WatchState }
	/** A LifeBridge that is not the build this Pāua carries (LIFEBRIDGE_BUILD):
	 *  another stamp, or none, which is every build before 2026-10-21. Nothing
	 *  it says is read as a name. Re-importing over it is not enough (❌
	 *  2026-09-21); it has to be deleted and imported. */
	| { kind: 'other-build'; build: string | null }
	/** A `/probe/…` push. Pāua never asks for the probe, so one that answers an
	 *  ask is a LifeBridge from before verbs (2026-09-20/21), which runs its
	 *  whole probe, `HookObjectChange` included, on every call: suspected in
	 *  Central's console crash of 2026-10-19/20 (docs/MA3_READ_MODEL.md
	 *  § Suspected in a console crash). The reader decides whether it answered
	 *  an ask; someone running the probe by hand is not one. */
	| { kind: 'probe' }

/** `started` and `already` say a watcher is running; `expired` (its lifetime
 *  ran out) and `stopped` (after `unwatch`) say it has ended. */
export type WatchState = 'started' | 'already' | 'expired' | 'stopped'
const WATCH_STATES: readonly string[] = ['started', 'already', 'expired', 'stopped']

/** What a build stamp looks like (scripts/lifebridge-stamp.mjs). */
const STAMP = /^lb-[0-9a-f]{8}$/

export type ShowReadResult =
	| { ok: true; reply: ShowReply }
	/** Not a show reply: a ping, channel B, another push. Not an error. */
	| { ok: false; reason: 'other-channel'; detail: string }
	| { ok: false; reason: 'bad-args'; detail: string }

/** Read a `show` or `watch` reply exactly as console-plugin/LifeBridge.lua
 *  writes it, or refuse it. Every reply starts with the plugin's build:
 *
 *    /life/show  ,s "<build>|<version>|base|<from>|<name>|<base>"
 *    /life/show  ,s "<build>|<version>|other|<from>|<name>|<base>"
 *    /life/show  ,s "<build>|<version>|unreadable"
 *    /life/watch ,s "<build>|started"   (or already, expired, stopped)
 *
 *  A build other than LIFEBRIDGE_BUILD is `other-build`, and nothing else in
 *  it is read: an older plugin's fields are not this one's, and a name read
 *  from it could be read wrongly with confidence. The same for the unstamped
 *  replies of every build before stamps, `unknown verb watch` included.
 *
 *  Refused rather than read loosely. A misplaced field could put the base
 *  show's name where the loaded show's belongs, or read `other` as a verdict it
 *  is not, and the chip would say it with confidence. The plugin's `|` cannot
 *  occur inside a field (it sends `/` instead), so a count other than 5 or 2
 *  after the build is a reply this build does not understand. */
export function readShow(message: OscMessage, prefix: string): ShowReadResult {
	const bare = prefix.replace(/^\/+|\/+$/g, '')
	if (message.address.startsWith(`/${bare}/probe/`)) return { ok: true, reply: { kind: 'probe' } }

	const [address, error, watch] = [`/${bare}/show`, `/${bare}/error`, `/${bare}/watch`]
	if (message.address !== address && message.address !== error && message.address !== watch) {
		return { ok: false, reason: 'other-channel', detail: `${message.address} is not ${address}` }
	}
	const only = message.args.length === 1 && message.args[0]?.type === 's' ? message.args[0].value : null
	if (only === null) {
		const shape = message.args.map((a) => a.type).join('')
		return { ok: false, reason: 'bad-args', detail: `expected s, got ${shape || '(none)'}` }
	}

	const [build, ...fields] = only.split('|')
	if (message.address === error) {
		// Only a refusal of the verbs Pāua asks is ours; this build never
		// refuses them, so any refusal of them is another build's.
		if (only === 'unknown verb show' || only === 'unknown verb watch') return { ok: true, reply: { kind: 'other-build', build: null } }
		if (build !== undefined && STAMP.test(build) && build !== LIFEBRIDGE_BUILD && /^unknown verb (show|watch)$/.test(fields.join('|'))) {
			return { ok: true, reply: { kind: 'other-build', build } }
		}
		return { ok: false, reason: 'other-channel', detail: `${message.address} is not about show` }
	}
	if (build !== LIFEBRIDGE_BUILD) {
		return { ok: true, reply: { kind: 'other-build', build: build !== undefined && STAMP.test(build) ? build : null } }
	}

	if (message.address === watch) {
		const [state] = fields
		if (fields.length !== 1 || state === undefined || !WATCH_STATES.includes(state)) {
			return { ok: false, reason: 'bad-args', detail: `not a watch reply: ${JSON.stringify(only)}` }
		}
		return { ok: true, reply: { kind: 'watch', state: state as WatchState } }
	}

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
