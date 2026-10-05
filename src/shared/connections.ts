// The Connections tab: every program the dashboard talks to, its health in one
// word, and the one detail that matters. The tab's rows and the status bar's
// Connections dot both read from here, so they cannot disagree.
//
// WHY ONE PLACE: each connection used to report itself somewhere different (a
// pill, a chip, a log line), and its settings lived in a long form elsewhere.
// One list, status beside the fields that fix it, is the owner's call
// (2026-10-02): "the cleaner and more simple the UI the better".
//
// THE RULE THIS FILE ENFORCES: a connection that is not set up is `off`, and
// `off` is never `down`. A lighting-only booth has no Arena, and a red dot for
// it would teach people to ignore the dot. A connection that is set up and not
// answering is `down`, whatever it last said.

import type { CuePaneState } from './cue-pane.js'
import { embedIdOf, type Embed, type EmbedPaneState, type EmbedView } from './embeds.js'
import type { BuiltInView, ViewId } from './layout.js'
import type { MaPaneState } from './ma-pane.js'
import type { Channel, LinkState } from './reading.js'
import { readingOf } from './reading.js'
import { NDI_STALLED_AFTER_MS, ndiIdOf, ndiView, type NdiSource, type NdiState, type NdiView } from './ndi.js'
import { currentFrame, type VideoFeedState } from './video-feed.js'

/** LIVE, STALE, down, or not set up. Down covers UNKNOWN and UNREACHABLE: in a
 *  list of connections, both mean "not answering now". */
export type Tone = 'live' | 'stale' | 'down' | 'off'

export type ConnectionId = 'console' | 'ontime' | 'propresenter' | 'arena' | 'cue' | 'video'

/** Every connection, in the tab's order. */
export const CONNECTIONS: readonly ConnectionId[] = ['console', 'ontime', 'propresenter', 'arena', 'cue', 'video']

/** Which connection each view shows. A view whose connection is turned off
 *  leaves the slot pickers (the owner, 2026-10-04). The video feed is its own
 *  connection, not Arena's: it reads a Spout or Syphon sender on this computer,
 *  which works with Arena's web server off, or with no Arena at all. */
export const CONNECTION_OF_VIEW: Record<BuiltInView, ConnectionId> = {
	cue: 'cue',
	ma: 'console',
	arena: 'arena',
	clips: 'arena',
	holding: 'arena',
	lookbook: 'arena',
	video: 'video',
}

/** Whether a view may be on screen: its connection is on, or for an embed or
 *  an NDI source, it still exists and is on. */
export function viewIsOn(view: ViewId, off: readonly ConnectionId[], embeds: readonly Embed[], ndi: readonly NdiSource[] = []): boolean {
	const ndiId = ndiIdOf(view)
	if (ndiId !== null) return ndi.some((s) => s.id === ndiId && s.on)
	const id = embedIdOf(view)
	if (id !== null) return embeds.some((e) => e.id === id && e.on)
	return !off.includes(CONNECTION_OF_VIEW[view as BuiltInView])
}

/** An NDI source's row. Found on the network and not on screen is live: it is
 *  there to be shown. Added, on and not found is down: someone added it to
 *  see it, as the video feed with no sender is. */
export function ndiStatus(source: NdiSource, ndi: NdiState | null, now: number): ConnectionStatus {
	const base = { id: ndiView(source.id), name: source.name }
	if (!source.on) return { ...base, tone: 'off', status: 'turned off', detail: null }
	if (ndi === null || ndi.runtime === null) return { ...base, tone: 'off', status: 'not heard yet', detail: null }
	if (!ndi.runtime.ok) return { ...base, tone: 'down', status: 'NDI not installed', detail: ndi.runtime.detail }
	const feed = ndi.feeds.find((f) => f.id === source.id)
	const found = ndi.found.includes(source.source)
	const frame = feed?.lastFrame ?? null
	if (feed !== undefined && feed.watched && frame !== null && now - frame.at <= NDI_STALLED_AFTER_MS) {
		return { ...base, tone: 'live', status: 'LIVE', detail: `${frame.full.width}×${frame.full.height}, ${feed.fps} fps` }
	}
	if (!found) return { ...base, tone: 'down', status: 'not found', detail: feed?.failure ?? null }
	if (feed !== undefined && feed.watched) return { ...base, tone: 'stale', status: 'no picture', detail: feed.failure }
	return { ...base, tone: 'live', status: 'found', detail: null }
}

/** An embed's row: whether its page loaded. Not opened yet is not down: an
 *  embed on no screen has nothing to say. */
export function embedStatus(embed: Embed, pane: EmbedPaneState | null): ConnectionStatus {
	const base = { id: `embed:${embed.id}` as const, name: embed.name }
	if (!embed.on) return { ...base, tone: 'off', status: 'turned off', detail: null }
	if (pane === null || pane.state === 'idle') return { ...base, tone: 'off', status: 'not on screen', detail: null }
	switch (pane.state) {
		case 'showing':
			return { ...base, tone: 'live', status: 'loaded', detail: null }
		case 'connecting':
			return { ...base, tone: 'stale', status: 'loading', detail: null }
		case 'failed':
			return { ...base, tone: 'down', status: pane.cause === 'no-answer' ? 'no answer' : 'not loading', detail: pane.detail }
	}
}


/** A connection someone turned off in Connections: `off`, like one not set
 *  up, so it never touches the dot, and said in its own words. Its address
 *  stays, for turning it back on. */
export function turnedOff(id: RowId, name: string): ConnectionStatus {
	return { id, name, tone: 'off', status: 'turned off', detail: null }
}

/** A connection's row: a built-in connection, or an embed's or NDI source's
 *  own row. */
export type RowId = ConnectionId | EmbedView | NdiView

export type ConnectionStatus = {
	id: RowId
	name: string
	tone: Tone
	/** The state in a word or two: `LIVE`, `4s ago`, `no answer`, `not set up`. */
	status: string
	/** The one thing worth knowing beside it, or null. */
	detail: string | null
}

/** The worst tone among connections that are set up: what the status bar's dot
 *  shows. `off` only when nothing is set up at all. */
export function worstTone(rows: readonly ConnectionStatus[]): Tone {
	const tones = rows.map((r) => r.tone).filter((t) => t !== 'off')
	if (tones.includes('down')) return 'down'
	if (tones.includes('stale')) return 'stale'
	if (tones.includes('live')) return 'live'
	return 'off'
}

/** The console: the link's verdict, unless no address is set. The MA pane's own
 *  state is detail, not tone: the link is what says the console is there. */
export function consoleStatus(link: LinkState, pane: MaPaneState | null): ConnectionStatus {
	const base = { id: 'console' as const, name: 'Console' }
	if (pane?.state === 'no-address') return { ...base, tone: 'off', status: 'not set up', detail: null }
	if (link.state === 'live') {
		const ms = link.roundTripMs
		return { ...base, tone: 'live', status: 'LIVE', detail: ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms` }
	}
	return { ...base, tone: 'down', status: 'unreachable', detail: null }
}

/** A polled source (OnTime, ProPresenter, Arena): null means not set up. */
export function polledStatus<T>(
	id: ConnectionId,
	name: string,
	channel: Channel<T> | null,
	now: number,
	staleAfterMs: number,
	detailOf: (value: T) => string | null,
): ConnectionStatus {
	if (channel === null) return { id, name, tone: 'off', status: 'not set up', detail: null }
	const reading = readingOf(channel, now, null, staleAfterMs)
	// Why the last read failed, in the program's or the network's words: "nothing
	// is listening there" is a fix, "read failed" is not.
	const failure = channel.latest !== null && !channel.latest.ok && channel.latest.reason === 'error' ? channel.latest.detail : null
	switch (reading.state) {
		case 'live':
			return { id, name, tone: 'live', status: 'LIVE', detail: detailOf(reading.value) }
		case 'stale':
			return { id, name, tone: 'stale', status: ageWords(reading.ageMs), detail: failure ?? detailOf(reading.value) }
		case 'unknown':
			return {
				id,
				name,
				tone: 'down',
				status: reading.why === 'never-read' ? 'not heard yet' : reading.why === 'timeout' ? 'no answer' : 'not answering',
				detail: failure,
			}
	}
}

/** The Cue Manager: whether its page loaded. Not whether the app can reach its
 *  backend: offline, it serves itself from cache and shows its own banner. */
export function cueStatus(pane: CuePaneState | null): ConnectionStatus {
	const base = { id: 'cue' as const, name: 'Cue Manager' }
	if (pane === null) return { ...base, tone: 'off', status: 'kiosk only', detail: null }
	switch (pane.state) {
		case 'showing':
			return { ...base, tone: 'live', status: 'LIVE', detail: null }
		case 'connecting':
		case 'idle':
			return { ...base, tone: 'stale', status: 'loading', detail: null }
		case 'failed':
			return { ...base, tone: 'down', status: pane.cause === 'no-answer' ? 'no answer' : 'not loading', detail: pane.detail }
	}
}

/** The video feed: a sender on this computer, and frames from it while a
 *  page watches. On with no sender is down: someone turned it on to see one. */
export function videoStatus(feed: VideoFeedState | null): ConnectionStatus {
	const base = { id: 'video' as const, name: 'Video feed' }
	if (feed === null) return { ...base, tone: 'off', status: 'kiosk only', detail: null }
	if (feed.showing === null) return { ...base, tone: 'down', status: 'no sender', detail: feed.failure }
	const frame = currentFrame(feed)
	const size = frame === null ? '' : `, ${frame.width}×${frame.height}`
	return { ...base, tone: 'live', status: 'LIVE', detail: `${feed.showing}${size}` }
}

function ageWords(ms: number): string {
	const s = Math.round(ms / 1000)
	return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`
}
