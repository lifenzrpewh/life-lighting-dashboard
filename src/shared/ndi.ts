// NDI sources as views (the owner, 2026-10-05): a camera, ProPresenter's
// output, Arena's composition or another machine's screen, each a view a
// window can hold or pop out, "similar to the embeds".
//
// The owner's shape, and the choices taken without an answer:
// - Added in Connections, operator mode only, by picking from the sources NDI
//   finds on the network: never typed, as the Video view lists Spout senders.
//   Each is a view and a row there, turned off like any connection.
// - A source saved here and not on the network is said ("not found"), never
//   swapped for another.
// - The picture is the Video view's: drawn on black (a source's alpha would
//   otherwise leave the last picture under a fade), dimmed with words when
//   it stops, a picture and not a reading.
//
// THE RULE THIS FILE ENFORCES: like the video feed, a frozen frame looks
// exactly like a quiet one, so a picture that stops is said to have stopped.
//
// How it is received is ../main/ndi.ts and ../main/ndi-worker.ts: NDI's own
// runtime, called through koffi in a process of its own.

import type { Size } from './video-feed.js'

export type NdiSource = {
	/** Fixed when added: never reused. */
	id: string
	/** What its tab and its Connections row say. */
	name: string
	/** NDI's own name for it, `MACHINE (Source)`, exactly as found. */
	source: string
	/** False when turned off in Connections: its tabs leave the screen and
	 *  nothing is received. */
	on: boolean
}

export const NDI_SOURCES_MAX = 12
export const NDI_NAME_MAX = 32
/** NDI names are `MACHINE (Source)`; the SDK allows a little over 250. */
const SOURCE_MAX = 256

const ID = /^[a-z0-9]{1,24}$/
/** The machine an NDI name says the source is on. */
export function ndiMachine(source: string): string {
	return source.replace(/\s*\(.*\)\s*$/, '')
}

export const isNdiId =(v: unknown): v is string => typeof v === 'string' && ID.test(v)

/** Why `name` will not do as a tab's name, or null. */
export function ndiNameError(name: string): string | null {
	if (name.trim() === '') return 'A name is needed.'
	if (name.length > NDI_NAME_MAX) return `At most ${NDI_NAME_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

const isSourceName = (v: unknown): v is string =>
	typeof v === 'string' && v.trim() !== '' && v.length <= SOURCE_MAX && !/[\u0000-\u001f\u007f]/.test(v)

/** The part of an NDI name a person calls it by: `Arena - Composition` from
 *  `2413-RUAP (Arena - Composition)`, cut to fit a tab. A machine's name has
 *  no brackets and a source's may, so it is everything inside the first. */
export function ndiShortName(source: string): string {
	const m = /^[^(]*\((.*)\)\s*$/.exec(source)
	const short = (m?.[1] ?? source).trim() || source.trim()
	return short.length > NDI_NAME_MAX ? short.slice(0, NDI_NAME_MAX).trimEnd() : short
}

/** A list of NDI sources off disk or IPC, or null if any one is not one or
 *  two share an id or a source. Names are trimmed. */
export function ndiSourcesFrom(v: unknown): NdiSource[] | null {
	if (!Array.isArray(v) || v.length > NDI_SOURCES_MAX) return null
	const out: NdiSource[] = []
	for (const e of v) {
		if (typeof e !== 'object' || e === null) return null
		const { id, name, source, on } = e as Record<string, unknown>
		if (!isNdiId(id) || typeof name !== 'string' || !isSourceName(source) || typeof on !== 'boolean') return null
		if (ndiNameError(name.trim()) !== null) return null
		if (out.some((o) => o.id === id || o.source === source)) return null
		out.push({ id, name: name.trim(), source, on })
	}
	return out
}

/** The view an NDI source is, in a window's tabs. */
export type NdiView = `ndi:${string}`

export const ndiView = (id: string): NdiView => `ndi:${id}`

/** The source a view is, or null for any other view. */
export function ndiIdOf(view: string): string | null {
	if (!view.startsWith('ndi:')) return null
	const id = view.slice('ndi:'.length)
	return isNdiId(id) ? id : null
}

/** One added source, as the worker receives it. */
export type NdiFeedState = {
	id: string
	name: string
	source: string
	/** A page is showing it, so it is being received. */
	watched: boolean
	/** The last frame sent to a page: its size as sent, the source's own size,
	 *  and when. */
	lastFrame: { at: number; width: number; height: number; full: Size } | null
	/** Frames sent in the last whole second. */
	fps: number
	/** The newest thing that went wrong, until a frame gets through again. */
	failure: string | null
}

export type NdiState = {
	/** Whether NDI's runtime loaded on this computer, and which. Null while the
	 *  worker starts. */
	runtime: { ok: true; version: string } | { ok: false; detail: string } | null
	/** Every source NDI finds on the network now, by its NDI name, sorted. */
	found: string[]
	/** Each added source that is on. */
	feeds: NdiFeedState[]
}

/** A picture this long without a new frame is said to have stopped (as the
 *  video feed's). */
export const NDI_STALLED_AFTER_MS = 2_000

export type NdiPicture =
	| { state: 'no-runtime'; detail: string }
	| { state: 'not-found'; source: string }
	| { state: 'waiting'; failure: string | null }
	| { state: 'showing' }
	| { state: 'stalled'; sinceMs: number; failure: string | null }

export function ndiPicture(ndi: NdiState, feed: NdiFeedState, now: number): NdiPicture {
	if (ndi.runtime !== null && !ndi.runtime.ok) return { state: 'no-runtime', detail: ndi.runtime.detail }
	const frame = feed.lastFrame
	if (frame === null) {
		// Discovery takes a moment after the worker starts: not found is said
		// only once NDI has been asked.
		if (ndi.runtime !== null && !ndi.found.includes(feed.source)) return { state: 'not-found', source: feed.source }
		return { state: 'waiting', failure: feed.failure }
	}
	const sinceMs = now - frame.at
	if (sinceMs <= NDI_STALLED_AFTER_MS) return { state: 'showing' }
	return { state: 'stalled', sinceMs, failure: feed.failure ?? (ndi.found.includes(feed.source) ? null : 'The source has left the network.') }
}

/** By how much a frame is thinned before it goes to the page: the whole step
 *  nearest the scale it is drawn at, so it is sent within a third of the size
 *  it is drawn. The whole picture shows in the space, so it is drawn at the
 *  size its longer side fits, not the space's. Arena's composition here is
 *  5800×2036 (✅ 2026-10-05), 47 MB a frame; in a window 2016×1490 it is drawn
 *  2016×708. Sent 2900×1018 (rounding down, never enlarged) it ran at 19 fps;
 *  every byte is copied, sent and uploaded, so it is sent 1933×678, enlarged
 *  4% where it is drawn. */
export function ndiStep(full: Size, space: Size | null): number {
	if (space === null || space.width <= 0 || space.height <= 0) return 1
	const step = Math.round(Math.max(full.width / space.width, full.height / space.height))
	return Math.max(1, Math.min(step, 16))
}
