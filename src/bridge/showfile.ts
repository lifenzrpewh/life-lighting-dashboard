// The showfile read: when to ask LifeBridge which show is loaded, and what the
// answers add up to.
//
// WHY IT ASKS SO RARELY: every ask is two lines on the console's command line,
// `call Plugin "LifeBridge" "show"` and the `SendOSC` it runs, and the lines push
// the LD's own history out of view (❌ 2026-09-30, the one-a-second ping). So it
// asks when the link comes up, and after that at most once every
// SHOW_REFRESH_MS, only in a quiet gap: when a ping is going out anyway because
// the console has said nothing for 15 s. A console the LD is working is never
// asked (agreed with the operator, 2026-09-30). About 0.4 lines a minute on a
// quiet console, none on a busy one.
//
// WHY IT ASKS AGAIN AT ALL: a Load or a Save As at the console changes the name
// and need not drop the link. Link-up alone could hold the old name for a whole
// service. Five minutes is the most it can be behind on a quiet console; on a
// busy one it ages, and says so (SHOW_STALE_AFTER_MS, in src/shared/showfile.ts
// with the other timings, because the renderer needs it).
//
// THE RULE THIS FILE ENFORCES: the Channel holds only what the console said.
// An ask with no answer becomes a timeout, never a name; a failed read keeps
// the last good name only as `lastOk`, which readingOf shows with its age.
//
// Deliberately time-free, like ping.ts: the caller passes a monotonic `now`.

import type { Channel, ReadResult } from '../shared/reading.js'
import { record, unread } from '../shared/reading.js'
import { SHOW_REFRESH_MS, SHOW_TIMEOUT_MS, type Showfile } from '../shared/showfile.js'
import type { ShowReply } from './channel-c.js'

/** The command that asks. `Call Plugin` passes the verb (✅ 2026-09-30, onPC
 *  2.3.2.0: `Call Plugin "LifeBridge" "ping <t>"` arrived exact). */
export function showCommand(): string {
	return 'Call Plugin "LifeBridge" "show"'
}

/** Why the chance to ask came up. */
export type AskMoment =
	/** The link has just gone live. Always worth a read: the show may have been
	 *  loaded while it was down, and a load is a likely reason it went down. */
	| 'link-up'
	/** A ping is going out on a live link: the console has been quiet. */
	| 'quiet-gap'

export type ShowfileReader = {
	/** Should an ask go out now? Never while one is in flight. */
	due(now: number, moment: AskMoment): boolean
	/** An ask went out. */
	asked(now: number): void
	/** A reply came back, from readShow in ./channel-c.ts. */
	reply(reply: ShowReply, now: number): void
	/** Everything the console has said about its showfile. The same object until
	 *  something new is recorded, so a caller can tell when it changed. */
	channel(now: number): Channel<Showfile>
}

export function createShowfileReader(): ShowfileReader {
	let channel = unread<Showfile>()
	let askedAt: number | null = null
	let lastAskAt: number | null = null

	const put = (result: ReadResult<Showfile>) => {
		channel = record(channel, result)
	}

	const expire = (now: number) => {
		if (askedAt === null || now - askedAt < SHOW_TIMEOUT_MS) return
		put({ ok: false, reason: 'timeout', at: askedAt + SHOW_TIMEOUT_MS })
		askedAt = null
	}

	return {
		due(now, moment) {
			expire(now)
			if (askedAt !== null) return false
			if (moment === 'link-up') return true
			// Timed from the last ASK, not the last good read. A console without
			// the verb, or without the plugin, would otherwise be asked in every
			// quiet gap, two lines each, for as long as it stayed broken.
			return lastAskAt === null || now - lastAskAt >= SHOW_REFRESH_MS
		},

		asked(now) {
			expire(now)
			askedAt = now
			lastAskAt = now
		},

		reply(reply, now) {
			expire(now)
			// Recorded whether or not an ask is in flight: a late answer, or one to
			// someone else's ask, is still what the console said when it said it.
			askedAt = null
			switch (reply.kind) {
				case 'show':
					return put({ ok: true, value: reply.show, at: now })
				case 'unreadable':
					return put({ ok: false, reason: 'error', at: now, detail: 'the console could not read its own showfile name' })
				case 'no-verb':
					return put({
						ok: false,
						reason: 'error',
						at: now,
						detail: 'LifeBridge on the console is older than the show verb: delete it, then import it again',
					})
			}
		},

		channel(now) {
			expire(now)
			return channel
		},
	}
}
