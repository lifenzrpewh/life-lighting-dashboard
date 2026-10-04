// The lookbook, asked when someone checks media: never polled. A check is a
// question asked before a service, and the lookbook is a hosted app beyond the
// booth, so it is asked only when the Arena view's media check wants it.
//
// The decoders and their evidence are ../bridge/lookbook.ts; the comparison
// is ../shared/media-check.ts.

import { decodeItems, decodeServices, decodeWeeks, LOOKBOOK_ID, PLAN_ID } from '../bridge/lookbook.js'
import {
	LOOKBOOK_DAYS_AHEAD,
	LOOKBOOK_TIMEOUT_MS,
	LOOKBOOK_URL,
	nzDate,
	PLAN_DAYS_AHEAD,
	PLAN_DAYS_BACK,
	type LookbookItem,
	type LookbookRead,
	type LookbookService,
} from '../shared/media-check.js'
import { LIBRARY_FILE } from '../shared/media-fetch.js'
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

/** A week's services change only when the lookbook links a new plan, so a
 *  run order flicking between services asks each week once in a while. */
const WEEK_CACHE_MS = 5 * 60_000
const weekCache = new Map<string, { at: number; services: LookbookService[] }>()

/** The lookbook's service for one Planning Center plan, the one the run order
 *  has open; null when the lookbook has none for it (yet). Looked for from
 *  PLAN_DAYS_BACK before today to PLAN_DAYS_AHEAD after. */
export async function lookbookServiceForPlan(planId: unknown): Promise<LookbookRead<LookbookService | null>> {
	if (typeof planId !== 'string' || !PLAN_ID.test(planId)) return fail('not a plan')
	const weeks = await get('/api/weeks')
	if (!weeks.ok) return fail(weeks.detail)
	const decoded = decodeWeeks(weeks.body)
	if (!decoded.ok) return fail(decoded.detail)
	const now = new Date()
	const from = nzDate(now, -PLAN_DAYS_BACK)
	const to = nzDate(now, PLAN_DAYS_AHEAD)
	const near = decoded.value.filter((w) => w.date >= from && w.date <= to)
	const reads = await Promise.all(
		near.map(async (week): Promise<LookbookRead<LookbookService[]>> => {
			const hit = weekCache.get(week.id)
			if (hit !== undefined && Date.now() - hit.at < WEEK_CACHE_MS) return { ok: true, value: hit.services, at: hit.at }
			const r = await get(`/api/weeks/${week.id}/services`)
			if (!r.ok) return { ok: false, detail: r.detail, at: Date.now() }
			const s = decodeServices(r.body, week)
			if (!s.ok) return { ok: false, detail: s.detail, at: Date.now() }
			weekCache.set(week.id, { at: Date.now(), services: s.value })
			return { ok: true, value: s.value, at: Date.now() }
		}),
	)
	for (const r of reads) {
		if (!r.ok) return fail(r.detail)
		const found = r.value.find((s) => s.planId === planId)
		if (found !== undefined) return { ok: true, value: found, at: Date.now() }
	}
	return { ok: true, value: null, at: Date.now() }
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

/** A library file's size, by asking the lookbook for its head: what a drive's
 *  file must match to be the lookbook's (../shared/media-check.ts, `sameFile`).
 *  Kept, since a library file's name carries its upload time: a new upload is a
 *  new path. Null when the lookbook did not say. */
const sizeKept = new Map<string, number>()

export async function lookbookFileSize(libraryPath: string): Promise<number | null> {
	if (!LIBRARY_FILE.test(libraryPath)) return null
	const kept = sizeKept.get(libraryPath)
	if (kept !== undefined) return kept
	try {
		const r = await fetch(LOOKBOOK_URL + libraryPath, { method: 'HEAD', signal: AbortSignal.timeout(LOOKBOOK_TIMEOUT_MS) })
		const size = Number(r.headers.get('content-length'))
		if (!r.ok || !Number.isSafeInteger(size) || size <= 0) return null
		sizeKept.set(libraryPath, size)
		return size
	} catch {
		return null
	}
}

/** Where a library file is downloaded from: the lookbook, and nowhere else. */
export function lookbookFileUrl(libraryPath: string): string | null {
	return LIBRARY_FILE.test(libraryPath) ? LOOKBOOK_URL + libraryPath : null
}
