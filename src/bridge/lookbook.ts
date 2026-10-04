// The lookbook app's reads, for the media check (../shared/media-check.ts).
//
// ✅ Seen 2026-10-04 at lookbooks-lifenz.replit.app, without signing in:
// - `GET /api/weeks`: every service the lookbook has, ~300, each
//   `{ id, date: "2026-10-04", name: "Central AM 4th October", serviceTime: "09:00" }`.
//   Despite the name, one "week" is one campus's service.
// - `GET /api/weeks/<id>/services`: `[{ id, name, campusKey: "central", … }]`,
//   the service whose items the next read takes.
// - `GET /api/services/<id>/items`: the run sheet's items with media, each
//   `{ orderIndex, title, mediaLabel, codes: ["CB095", …], rawMediaNo,
//   resolvedAssetPaths: { background, foreground, aScreen, lowerThird, mask },
//   missingCodes }`. A resolved path is `/storage/library/C/CF588-…_<ms>.png`;
//   `mask` is `"applied"`, not a path.
//
// THE RULE THIS FILE ENFORCES: as everywhere, a reply of the wrong shape fails
// whole, with what was wrong. An item list that half-decoded would check half
// the run sheet and say the rest was fine.

import { mediaCodeOf, type LookbookItem, type LookbookService } from '../shared/media-check.js'
import type { Decoded } from './ontime.js'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isStr = (v: unknown): v is string => typeof v === 'string'

/** The lookbook's ids are UUIDs. Anything else is never put in a URL. */
export const LOOKBOOK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A Planning Center plan id: digits only, so it can sit in a URL. */
export const PLAN_ID = /^\d{1,12}$/

export type LookbookWeek = { id: string; date: string; name: string; time: string | null }

export function decodeWeeks(body: unknown): Decoded<LookbookWeek[]> {
	if (!Array.isArray(body)) return { ok: false, detail: 'the lookbook did not send a list of services' }
	const weeks: LookbookWeek[] = []
	for (const [i, w] of body.entries()) {
		if (!isObject(w) || !isStr(w['id']) || !LOOKBOOK_ID.test(w['id'])) return { ok: false, detail: `service ${i + 1} has no id` }
		if (!isStr(w['date']) || !/^\d{4}-\d{2}-\d{2}$/.test(w['date'])) return { ok: false, detail: `service ${i + 1} has no date` }
		if (!isStr(w['name'])) return { ok: false, detail: `service ${i + 1} has no name` }
		const time = w['serviceTime']
		if (time !== null && time !== undefined && !isStr(time)) return { ok: false, detail: `${w['name']} has a time that is not one` }
		weeks.push({ id: w['id'], date: w['date'], name: w['name'].trim(), time: isStr(time) && time !== '' ? time : null })
	}
	return { ok: true, value: weeks }
}

/** A week's services, as list entries carrying the week's date and time. */
export function decodeServices(body: unknown, week: LookbookWeek): Decoded<LookbookService[]> {
	if (!Array.isArray(body)) return { ok: false, detail: `${week.name}: the lookbook did not send its services` }
	const out: LookbookService[] = []
	for (const [i, s] of body.entries()) {
		if (!isObject(s) || !isStr(s['id']) || !LOOKBOOK_ID.test(s['id'])) return { ok: false, detail: `${week.name}: service ${i + 1} has no id` }
		if (!isStr(s['campusKey'])) return { ok: false, detail: `${week.name}: service ${i + 1} has no campus` }
		const plan = s['planningCenterPlanId']
		out.push({
			id: s['id'],
			name: isStr(s['name']) && s['name'].trim() !== '' ? s['name'].trim() : week.name,
			date: week.date,
			time: week.time,
			campus: s['campusKey'],
			planId: isStr(plan) && PLAN_ID.test(plan) ? plan : null,
		})
	}
	return { ok: true, value: out }
}

function strings(v: unknown): string[] | null {
	return Array.isArray(v) && v.every(isStr) ? v : null
}

/** The run sheet's items, in the lookbook's order. Each resolved file is filed
 *  under the code its name carries: the lookbook keys them by role, and an item
 *  has at most one of each. */
export function decodeItems(body: unknown): Decoded<LookbookItem[]> {
	if (!Array.isArray(body)) return { ok: false, detail: 'the lookbook did not send the run sheet' }
	const items: (LookbookItem & { order: number })[] = []
	for (const [i, it] of body.entries()) {
		const what = `item ${i + 1}`
		if (!isObject(it)) return { ok: false, detail: `${what} is not an item` }
		const codes = strings(it['codes'])
		if (codes === null) return { ok: false, detail: `${what} has no codes` }
		const missing = strings(it['missingCodes'] ?? [])
		if (missing === null) return { ok: false, detail: `${what}'s missing codes are not a list` }
		const order = it['orderIndex']
		if (typeof order !== 'number' || !Number.isFinite(order)) return { ok: false, detail: `${what} has no place in the run sheet` }
		const paths = it['resolvedAssetPaths'] ?? {}
		if (!isObject(paths)) return { ok: false, detail: `${what}'s files are not a list` }
		const files: Record<string, string> = {}
		for (const path of Object.values(paths)) {
			// `mask: "applied"` and anything else without a code is not a file.
			if (!isStr(path)) continue
			const code = mediaCodeOf(path.split('/').at(-1) ?? '')
			if (code !== null && files[code.code] === undefined) files[code.code] = path
		}
		const label = it['mediaLabel']
		items.push({
			order,
			title: isStr(it['title']) && it['title'].trim() !== '' ? it['title'].trim() : `Item ${i + 1}`,
			label: isStr(label) && label.trim() !== '' ? label.trim() : null,
			codes: codes.map((c) => c.trim().toUpperCase()),
			files,
			missingCodes: missing.map((c) => c.trim().toUpperCase()),
		})
	}
	return { ok: true, value: items.sort((a, b) => a.order - b.order).map(({ order: _, ...item }) => item) }
}
