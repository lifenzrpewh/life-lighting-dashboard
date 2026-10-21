// The showfile read: when to ask LifeBridge which show is loaded, and what the
// answers add up to.
//
// WHY IT ASKS SO RARELY: every ask is two lines on the console's command line,
// `call Plugin "LifeBridge" "watch"` and the `SendOSC` it runs, and the lines push
// the LD's own history out of view (❌ 2026-09-30, the one-a-second ping). So it
// asks when the link comes up, and after that only in a quiet gap: when a ping
// is going out anyway because the console has said nothing for 15 s. A console
// the LD is working is never asked (agreed with the operator, 2026-09-30).
//
// WATCHED, NOT ONLY ASKED (✅ onPC 2.3.2.0, 2026-10-02). Each ask is `watch`:
// LifeBridge answers as `show` does, then keeps a loop on the console that reads
// the name each second and pushes it only when it changes. So a Save As reaches
// the chip in about a second. A push needs no ask in flight: `reply` records
// whatever the console says (docs/MA3_READ_MODEL.md § The showfile, watched).
//
// THE WATCHER SETS THE CADENCE (2026-10-21). It says `started` or `already`
// when asked, and `expired` when its lifetime (thirty minutes) runs out, or
// `stopped`. While it runs, a quiet gap asks only every SHOW_WATCHED_REFRESH_MS,
// a check that it is still there; once it has ended, or before it has said
// anything, every SHOW_REFRESH_MS. `expired` is asked again at once, quiet or
// not, so the console is never long without one: one line every half hour. A
// link-up always asks, because a Load (which ends the watcher) drops the link.
//
// THE RULE THIS FILE ENFORCES: the Channel holds only what the console said.
// An ask with no answer becomes a timeout, never a name; a failed read keeps
// the last good name only as `lastOk`, which readingOf shows with its age.
//
// ONE BUILD, OR NO ASKS (2026-10-21). Central's console crashed twice running a
// month-old LifeBridge that ran its whole probe, `HookObjectChange` included, on
// every ask (docs/MA3_READ_MODEL.md § Suspected in a console crash). A console
// keeps running whatever plugin it loaded last, so this Pāua works only with the
// LifeBridge built beside it (LIFEBRIDGE_BUILD). A reply from any other build,
// or the old probe answering an ask, ends every plugin call from this link, for
// good: not at the next link-up, which a flapping link could make often. The
// chip says what to do. A new link (a restart of Pāua, or the console's settings
// saved) asks again.
//
// Deliberately time-free, like ping.ts: the caller passes a monotonic `now`.

import { LIFEBRIDGE_BUILD } from '../shared/lifebridge-build.js'
import type { Channel, ReadResult } from '../shared/reading.js'
import { record, unread } from '../shared/reading.js'
import { SHOW_REFRESH_MS, SHOW_TIMEOUT_MS, SHOW_WATCHED_REFRESH_MS, type Showfile } from '../shared/showfile.js'
import type { ShowReply } from './channel-c.js'

/** The command that asks. `Call Plugin` passes the verb (✅ 2026-09-30, onPC
 *  2.3.2.0: `Call Plugin "LifeBridge" "ping <t>"` arrived exact). */
export function showCommand(): string {
	return 'Call Plugin "LifeBridge" "watch"'
}

/** What the chip and the show list say once the old probe has answered. */
export const OLD_PROBE_DETAIL =
	'LifeBridge on the console is the September test build, which runs its whole probe on every ask, so Pāua has stopped asking. Delete it on the console, import the LifeBridge.xml from this version of Pāua, then restart Pāua.'

/** What they say once a LifeBridge of another build has answered. */
export function otherBuildDetail(build: string | null): string {
	const which = build === null ? 'an older build, from before build stamps' : `build ${build}`
	return `LifeBridge on the console is ${which}, and this Pāua works only with ${LIFEBRIDGE_BUILD}, so it has stopped asking. Delete it on the console, import the LifeBridge.xml from this version of Pāua, then restart Pāua.`
}

/** Why the chance to ask came up. */
export type AskMoment =
	/** The link has just gone live. Always worth a read: the show may have been
	 *  loaded while it was down, and a load is a likely reason it went down. */
	| 'link-up'
	/** A ping is going out on a live link: the console has been quiet. */
	| 'quiet-gap'
	/** The watcher said `expired`: start a fresh one now, quiet or not. */
	| 'watch-ended'

export type ShowfileReader = {
	/** Should an ask go out now? Never while one is in flight. */
	due(now: number, moment: AskMoment): boolean
	/** The command for the ask that is due. */
	command(): string
	/** An ask went out. */
	asked(now: number): void
	/** A reply came back, from readShow in ./channel-c.ts. */
	reply(reply: ShowReply, now: number): void
	/** Everything the console has said about its showfile. The same object until
	 *  something new is recorded, so a caller can tell when it changed. */
	channel(now: number): Channel<Showfile>
	/** The console answered another plugin call (the show list) with something
	 *  that is not this build: no plugin call may go to it again from this link. */
	refuse(now: number, detail: string): void
	/** Why no plugin call may go to this console, or null. */
	refused(): string | null
}

export function createShowfileReader(): ShowfileReader {
	let channel = unread<Showfile>()
	let askedAt: number | null = null
	let lastAskAt: number | null = null
	/** Whether a watcher has said it is running, and has not said it ended. */
	let watching = false
	let refusal: string | null = null

	const put = (result: ReadResult<Showfile>) => {
		channel = record(channel, result)
	}

	const expire = (now: number) => {
		if (askedAt === null || now - askedAt < SHOW_TIMEOUT_MS) return
		put({ ok: false, reason: 'timeout', at: askedAt + SHOW_TIMEOUT_MS })
		askedAt = null
		// An unanswered ask is no evidence of a watcher.
		watching = false
	}

	const refuse = (now: number, detail: string) => {
		askedAt = null
		watching = false
		if (refusal !== null) return
		refusal = detail
		put({ ok: false, reason: 'error', at: now, detail })
	}

	return {
		due(now, moment) {
			expire(now)
			if (refusal !== null || askedAt !== null) return false
			if (moment === 'link-up') {
				// A Load ends the watcher and drops the link: assume none.
				watching = false
				return true
			}
			if (moment === 'watch-ended') return true
			// Timed from the last ASK, not the last good read. A console without
			// the plugin would otherwise be asked in every quiet gap, two lines
			// each, for as long as it stayed broken.
			const every = watching ? SHOW_WATCHED_REFRESH_MS : SHOW_REFRESH_MS
			return lastAskAt === null || now - lastAskAt >= every
		},

		command: showCommand,

		asked(now) {
			expire(now)
			askedAt = now
			lastAskAt = now
		},

		reply(reply, now) {
			switch (reply.kind) {
				case 'probe':
					// Only an answer to our ask counts: someone running the probe by
					// hand is not a reason to stop. Timed from the ask itself, so an
					// answer that lands after the timeout still counts.
					if (lastAskAt !== null && now - lastAskAt < SHOW_TIMEOUT_MS * 2) refuse(now, OLD_PROBE_DETAIL)
					return
				case 'other-build':
					// Unambiguous, asked or pushed: whatever runs there is not ours.
					return refuse(now, otherBuildDetail(reply.build))
				case 'watch':
					expire(now)
					if (reply.state === 'started' || reply.state === 'already') {
						watching = true
					} else {
						// Ended: the next quiet gap asks (and link.ts asks at once
						// for `expired`).
						watching = false
						lastAskAt = null
					}
					return
			}
			expire(now)
			// Recorded whether or not an ask is in flight: a late answer, or one to
			// someone else's ask, is still what the console said when it said it.
			askedAt = null
			switch (reply.kind) {
				case 'show':
					return put({ ok: true, value: reply.show, at: now })
				case 'unreadable':
					return put({ ok: false, reason: 'error', at: now, detail: 'the console could not read its own showfile name' })
			}
		},

		channel(now) {
			expire(now)
			return channel
		},

		refuse,

		refused: () => refusal,
	}
}
