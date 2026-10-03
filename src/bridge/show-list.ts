// The console's show files, from LifeBridge's `shows` verb, for the Load list
// (console-plugin/LifeBridge.lua `showsVerb`, docs/PLAN.md Phase 3).
//
// LifeBridge packs the names into a few messages, each one line on the LD's
// command line:
//
//   /life/shows ,s "<version>|<way>|<part>/<parts>|<name>|<name>…"
//   /life/shows ,s "<version>|unreadable|<ways tried>"
//
// THE RULES THIS FILE ENFORCES: a list is whole or it is not a list. Every part
// from 1 to n arrives or the ask fails; a part missing is never a shorter list,
// because a show left off it is a show nobody can load from here, silently.
// And an unreadable folder is a failure with its reason, never "no shows".

import type { OscMessage } from './osc.js'
import { loadProblem, type ShowList } from '../shared/showfile-write.js'

export type ShowsReply =
	| { kind: 'part'; version: string; way: string; part: number; parts: number; shows: { name: string; loadable: boolean }[] }
	| { kind: 'unreadable'; version: string; detail: string }
	/** The LifeBridge on the console predates `shows`: delete it and import
	 *  this build (re-importing over it keeps the old code, ❌ 2026-09-21). */
	| { kind: 'no-verb' }

export type ShowsReadResult =
	| { ok: true; reply: ShowsReply }
	| { ok: false; reason: 'other-channel'; detail: string }
	| { ok: false; reason: 'bad-args'; detail: string }

export function readShows(message: OscMessage, prefix: string): ShowsReadResult {
	const bare = prefix.replace(/^\/+|\/+$/g, '')
	const only = message.args.length === 1 && message.args[0]?.type === 's' ? message.args[0].value : null
	if (message.address === `/${bare}/error`) {
		if (only === 'unknown verb shows') return { ok: true, reply: { kind: 'no-verb' } }
		return { ok: false, reason: 'other-channel', detail: `${message.address} is not about shows` }
	}
	if (message.address !== `/${bare}/shows`) return { ok: false, reason: 'other-channel', detail: `${message.address} is not shows` }
	if (only === null) return { ok: false, reason: 'bad-args', detail: 'expected one string' }

	const fields = only.split('|')
	const [version, way, count] = fields
	if (!version || !way || count === undefined) return { ok: false, reason: 'bad-args', detail: `not a shows reply: ${JSON.stringify(only)}` }
	if (way === 'unreadable') return { ok: true, reply: { kind: 'unreadable', version, detail: fields.slice(2).join('|') || 'no reason given' } }
	const m = /^(\d{1,3})\/(\d{1,3})$/.exec(count)
	const part = Number(m?.[1])
	const parts = Number(m?.[2])
	if (m === null || part < 1 || parts < 1 || part > parts) return { ok: false, reason: 'bad-args', detail: `not a part count: ${JSON.stringify(count)}` }
	const shows = fields
		.slice(3)
		.filter((n) => n !== '')
		.map((n) => {
			// `!`: LifeBridge says the trip changed this name, so the name held
			// here is not the file's and a LoadShow with it would miss.
			const marked = n.startsWith('!')
			const name = marked ? n.slice(1) : n
			return { name, loadable: !marked && loadProblem(name) === null }
		})
	return { ok: true, reply: { kind: 'part', version, way, part, parts, shows } }
}

/** Gathers one ask's parts into a list. Time-free: the caller owns the
 *  timeout and says when the ask began. */
export type ShowListCollector = {
	/** A reply off the wire; the finished list once it is whole or failed. */
	offer(reply: ShowsReply): ShowList | null
}

export function collectShowList(): ShowListCollector {
	const got = new Map<number, ShowsReply & { kind: 'part' }>()
	let expected: number | null = null
	return {
		offer(reply) {
			if (reply.kind === 'no-verb') {
				return { ok: false, detail: 'LifeBridge on the console is older than the show list: delete it there and import this build.' }
			}
			if (reply.kind === 'unreadable') return { ok: false, detail: `The console could not list its shows (${reply.detail}).` }
			if (expected !== null && reply.parts !== expected) return { ok: false, detail: 'The show list came in two different shapes; ask again.' }
			expected = reply.parts
			got.set(reply.part, reply)
			if (got.size < expected) return null
			const shows = [...got.entries()].sort(([a], [b]) => a - b).flatMap(([, p]) => p.shows)
			return { ok: true, way: reply.way, shows }
		},
	}
}
