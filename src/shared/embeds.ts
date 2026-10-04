// Embeds: any web page, by name and address, as a view of its own (the owner,
// 2026-10-04). Google Sheets first; anything a booth keeps open beside the MA.
//
// The owner's decisions:
// - Added and removed in Connections, operator mode only. Each embed is a
//   view, in any slot or window, and a row in Connections that says loaded,
//   loading or not loading, and can be turned off like any connection.
// - Its own sign-in per embed: a persistent session each (src/main/embeds.ts),
//   so one Google login does not cover another embed. Removing an embed
//   forgets its sign-in.
// - It may go anywhere inside itself, because Google's sign-in hops domains.
//   A link that would open a new window opens in the computer's own browser,
//   never inside Pāua.
// - A − / + zoom on its strip, remembered per embed, and Reload like the others.
//
// THE RULE THIS FILE ENFORCES: like the MA and the Cue Manager, an embed is a
// picture, not a reading. `showing` means a page loaded, and nothing more.

import type { CuePaneState } from './cue-pane.js'

export type Embed = {
	/** Fixed when added, and the name of its session: never reused. */
	id: string
	/** What its tab and its Connections row say. */
	name: string
	url: string
	/** False when turned off in Connections: its tabs leave the screen and its
	 *  page is closed, but it keeps its address and its sign-in. */
	on: boolean
}

/** Same states as the Cue Manager's page: a load, its timeout, its retry. */
export type EmbedPaneState = CuePaneState

export type EmbedReport = {
	id: string
	/** As Connections last named it, for a pop-out's title, which cannot read settings. */
	name: string
	pane: EmbedPaneState
	/** The page's zoom factor, 1 for 100 %. */
	zoom: number
	/** The last touch or key inside it: someone working in an embed is not idle. */
	lastInputAt: number | null
}

export const EMBED_NAME_MAX = 32
export const EMBEDS_MAX = 12

/** The zoom steps − and + move between. */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const

/** One step in or out from `zoom`, or back to 100 % for 0. A zoom between steps
 *  (an old file, a hand edit) moves to the next step in that direction. */
export function zoomStep(zoom: number, by: -1 | 0 | 1): number {
	if (by === 0) return 1
	if (by === 1) return ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!
	return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001) ?? ZOOM_STEPS[0]!
}

export function isZoom(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v) && v >= ZOOM_STEPS[0] && v <= ZOOM_STEPS[ZOOM_STEPS.length - 1]!
}

const ID = /^[a-z0-9]{1,24}$/

export const isEmbedId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

/** A new embed's id: short, lower case, unlikely to repeat on one machine. */
export function newEmbedId(now: number, random: number): string {
	return `${now.toString(36)}${Math.floor(random * 36 ** 4).toString(36)}`.slice(0, 24)
}

/** Why `name` will not do, or null. */
export function embedNameError(name: string): string | null {
	if (name.trim() === '') return 'A name is needed.'
	if (name.length > EMBED_NAME_MAX) return `At most ${EMBED_NAME_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

/** The address as it will be loaded, or null if it is not a web page's. A bare
 *  `docs.google.com/…` gets https:// in front, as a browser's address bar does. */
export function embedUrlOf(text: string): string | null {
	const t = text.trim()
	if (t === '' || /\s/.test(t)) return null
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
	try {
		const u = new URL(withScheme)
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
		if (u.hostname === '') return null
		return u.href
	} catch {
		return null
	}
}

/** A list of embeds off disk or IPC, or null if any one is not an embed or two
 *  share an id. Names are trimmed; addresses must already be whole. */
export function embedsFrom(v: unknown): Embed[] | null {
	if (!Array.isArray(v) || v.length > EMBEDS_MAX) return null
	const out: Embed[] = []
	for (const e of v) {
		if (typeof e !== 'object' || e === null) return null
		const { id, name, url, on } = e as Record<string, unknown>
		if (!isEmbedId(id) || typeof name !== 'string' || typeof url !== 'string' || typeof on !== 'boolean') return null
		if (embedNameError(name.trim()) !== null || embedUrlOf(url) !== url) return null
		if (out.some((o) => o.id === id)) return null
		out.push({ id, name: name.trim(), url, on })
	}
	return out
}

/** The view an embed is, in a slot's picker or a window's tabs. */
export type EmbedView = `embed:${string}`

export const embedView = (id: string): EmbedView => `embed:${id}`

/** The embed a view is, or null for one of the built-in views. */
export function embedIdOf(view: string): string | null {
	if (!view.startsWith('embed:')) return null
	const id = view.slice('embed:'.length)
	return isEmbedId(id) ? id : null
}
