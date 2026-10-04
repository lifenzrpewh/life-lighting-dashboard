// The lookbook, asked when someone checks media: never polled. A check is a
// question asked before a service, and the lookbook is a hosted app beyond the
// booth, so it is asked only when the Arena view's media check wants it.
//
// The decoders and their evidence are ../bridge/lookbook.ts; the comparison
// is ../shared/media-check.ts.

import { decodeItems, decodeServices, decodeWeeks, LOOKBOOK_ID } from '../bridge/lookbook.js'
import {
	LOOKBOOK_DAYS_AHEAD,
	LOOKBOOK_TIMEOUT_MS,
	LOOKBOOK_URL,
	nzDate,
	type LookbookItem,
	type LookbookRead,
	type LookbookService,
} from '../shared/media-check.js'
import { getJson } from './http-poll.js'

const fail = <T>(detail: string): LookbookRead<T> => {
	console.log(`[lookbook] ${detail}`)
	return { ok: false, detail, at: Date.now() }
}

async function get(path: string): Promise<{ ok: true; body: unknown } | { ok: false; detail: string }> {
	const r = await getJson(LOOKBOOK_URL + path, LOOKBOOK_TIMEOUT_MS)
	return r.ok ? r : { ok: false, detail: r.timeout ? 'the lookbook did not answer' : `the lookbook: ${r.detail}` }
}

/** The services from today to a week ahead, each with its campus. */
export async function lookbookServices(): Promise<LookbookRead<LookbookService[]>> {
	const weeks = await get('/api/weeks')
	if (!weeks.ok) return fail(weeks.detail)
	const decoded = decodeWeeks(weeks.body)
	if (!decoded.ok) return fail(decoded.detail)
	const now = new Date()
	const from = nzDate(now)
	const to = nzDate(now, LOOKBOOK_DAYS_AHEAD)
	const soon = decoded.value.filter((w) => w.date >= from && w.date <= to)
	// A week's worth is a dozen or so, asked together.
	const reads = await Promise.all(soon.map(async (week) => ({ week, r: await get(`/api/weeks/${week.id}/services`) })))
	const services: LookbookService[] = []
	for (const { week, r } of reads) {
		if (!r.ok) return fail(r.detail)
		const s = decodeServices(r.body, week)
		if (!s.ok) return fail(s.detail)
		services.push(...s.value)
	}
	return { ok: true, value: services, at: Date.now() }
}

/** One service's run sheet, resolved to codes and files. */
export async function lookbookItems(serviceId: unknown): Promise<LookbookRead<LookbookItem[]>> {
	if (typeof serviceId !== 'string' || !LOOKBOOK_ID.test(serviceId)) return fail('not a lookbook service')
	const r = await get(`/api/services/${serviceId}/items`)
	if (!r.ok) return fail(r.detail)
	const items = decodeItems(r.body)
	if (!items.ok) return fail(items.detail)
	console.log(`[lookbook] read ${items.value.length} items`)
	return { ok: true, value: items.value, at: Date.now() }
}
