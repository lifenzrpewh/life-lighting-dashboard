// The run order, from the backend's own rows: which campus, which plan, and the
// items with their lighting notes.
//
// WHY THIS EXISTS: `visuals-song-comms` already ingests PCO and holds the LD's
// notes (docs/PLAN.md, "What already exists"). The booth reads that, as-is, with
// no new tables and no RPC of its own. This file is the pure half: the requests
// it makes, the shapes it accepts, and the rules that turn rows into a Service.
// src/main/backend/backend.ts does the fetching.
//
// THE RULES THIS FILE ENFORCES:
// - A response that is not the shape asked for is refused whole. One odd row
//   read loosely is a note shown against the wrong song.
// - Nothing is configured that the backend can say. The campus is the one the
//   booth device's role is scoped to (visuals-song-comms booth devices); the plan is chosen from the campus's
//   own plans. An account that does not say exactly one campus is a failure
//   to fix on the backend, never a campus to guess.
// - An empty answer is not taken for "no notes" unless the account may read
//   them. RLS answers a read it forbids with `[]`, not an error, so the account's
//   permissions are checked first (`campusOf`).

import type { ItemKind, Service, ServiceItem } from '../shared/service.js'

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string }

// --- the requests --------------------------------------------------------------

/** Ids go into query strings, so each is held to the shape it has: uuids for
 *  the backend's own rows, PCO's numeric ids for the cache. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PCO_ID = /^[A-Za-z0-9_-]+$/

function checked(id: string, shape: RegExp, what: string): string {
	if (!shape.test(id)) throw new Error(`refusing to put ${what} ${JSON.stringify(id)} in a query`)
	return id
}

const rest = (table: string, params: Record<string, string>) => `/rest/v1/${table}?${new URLSearchParams(params)}`

export const PLAN_SELECT = 'id,title,sort_date,starts:raw->attributes->>sort_date,pco_service_types!inner(name,visible)'

/** Every read the run order makes, as paths under the backend's URL. */
export const paths = {
	/** `current_permissions()`: the account's permission keys, all roles. POST. */
	permissions: '/rest/v1/rpc/current_permissions',
	/** The account's own role rows; RLS lets a user read its own. */
	roles: (userId: string) => rest('user_roles', { select: 'campus_id', user_id: `eq.${checked(userId, UUID, 'user id')}` }),
	campus: (campusId: string) => rest('campuses', { select: 'id,name', id: `eq.${checked(campusId, UUID, 'campus id')}` }),
	/** The campus's own Lighting field and any global one (`fieldDefs.ts` in the PWA). */
	fields: (campusId: string) =>
		rest('field_definitions', {
			select: 'id',
			key: 'eq.lighting_cues',
			is_active: 'is.true',
			or: `(campus_id.is.null,campus_id.eq.${checked(campusId, UUID, 'campus id')})`,
		}),
	/** Plans from `fromDay` on, for service types the backend shows. */
	plans: (campusId: string, fromDay: string) =>
		rest('pco_plans', {
			select: PLAN_SELECT,
			campus_id: `eq.${checked(campusId, UUID, 'campus id')}`,
			'pco_service_types.visible': 'is.true',
			sort_date: `gte.${checked(fromDay, /^\d{4}-\d{2}-\d{2}$/, 'day')}`,
			order: 'sort_date.asc',
			limit: '20',
		}),
	items: (planId: string) =>
		rest('pco_items', {
			select: 'id,sequence,item_type,title,length_seconds',
			plan_id: `eq.${checked(planId, PCO_ID, 'plan id')}`,
			order: 'sequence.asc',
		}),
	notes: (fieldIds: string[], itemIds: string[]) =>
		rest('note_values', {
			select: 'pco_item_id,value_text',
			field_definition_id: `in.(${fieldIds.map((id) => checked(id, UUID, 'field id')).join(',')})`,
			pco_item_id: `in.(${itemIds.map((id) => checked(id, PCO_ID, 'item id')).join(',')})`,
			deleted_at: 'is.null',
		}),
}

// --- the shapes accepted -------------------------------------------------------

export type RoleRow = { campus_id: string | null }
export type CampusRow = { id: string; name: string }
export type FieldRow = { id: string }
export type PlanRow = {
	id: string
	title: string | null
	sort_date: string
	/** PCO's own `sort_date`, the whole timestamp, out of `raw`. The column
	 *  keeps only the date. */
	starts: string | null
	pco_service_types: { name: string; visible: boolean }
}
export type ItemRow = { id: string; sequence: number; item_type: string; title: string | null; length_seconds: number | null }
export type NoteRow = { pco_item_id: string; value_text: string | null }

type Row = Record<string, unknown>
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'
const isNumOrNull = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v))

function rowsOf<T>(body: unknown, what: string, accept: (r: Row) => boolean): Parsed<T[]> {
	if (!Array.isArray(body)) return { ok: false, detail: `${what}: expected a list, got ${typeof body}` }
	for (const [i, r] of body.entries()) {
		if (typeof r !== 'object' || r === null || !accept(r as Row)) {
			return { ok: false, detail: `${what}: row ${i} is not the shape asked for: ${JSON.stringify(r).slice(0, 120)}` }
		}
	}
	return { ok: true, value: body as T[] }
}

export const read = {
	permissions(body: unknown): Parsed<string[]> {
		return Array.isArray(body) && body.every(isStr)
			? { ok: true, value: body }
			: { ok: false, detail: `permissions: expected a list of keys, got ${JSON.stringify(body).slice(0, 80)}` }
	},
	roles: (body: unknown) => rowsOf<RoleRow>(body, 'roles', (r) => isStrOrNull(r['campus_id'])),
	campuses: (body: unknown) => rowsOf<CampusRow>(body, 'campus', (r) => isStr(r['id']) && isStr(r['name'])),
	fields: (body: unknown) => rowsOf<FieldRow>(body, 'fields', (r) => isStr(r['id'])),
	plans: (body: unknown) =>
		rowsOf<PlanRow>(body, 'plans', (r) => {
			const type = r['pco_service_types'] as Row | null | undefined
			return (
				isStr(r['id']) &&
				isStrOrNull(r['title']) &&
				isStr(r['sort_date']) &&
				isStrOrNull(r['starts']) &&
				typeof type === 'object' &&
				type !== null &&
				isStr(type['name']) &&
				typeof type['visible'] === 'boolean'
			)
		}),
	items: (body: unknown) =>
		rowsOf<ItemRow>(
			body,
			'items',
			(r) =>
				isStr(r['id']) &&
				typeof r['sequence'] === 'number' &&
				isStr(r['item_type']) &&
				isStrOrNull(r['title']) &&
				isNumOrNull(r['length_seconds']),
		),
	notes: (body: unknown) => rowsOf<NoteRow>(body, 'notes', (r) => isStr(r['pco_item_id']) && isStrOrNull(r['value_text'])),
}

// --- the rules ------------------------------------------------------------------

/** The one campus this booth reads, from the account's own grants.
 *
 *  `notes.view` is required: without it RLS answers the notes read with `[]`,
 *  which would render every item as "no note written". `notes.edit` is allowed
 *  but reported: a booth device's role is read-only, so an account that can
 *  write was approved as a person, and a stolen session could then write. */
export function campusOf(roles: RoleRow[], permissions: string[]): Parsed<{ campusId: string; canEdit: boolean }> {
	if (!permissions.includes('notes.view')) {
		return {
			ok: false,
			detail: "this booth's account cannot read notes: its role needs notes.view (or the account is inactive)",
		}
	}
	if (roles.length === 0) return { ok: false, detail: 'the account this booth signed in as has no role' }
	if (roles.some((r) => r.campus_id === null)) {
		return {
			ok: false,
			// The likely way here: an admin approved the QR as themselves.
			detail: 'this booth signed in with a role for every campus: pair it again, approved As a booth device',
		}
	}
	const campuses = [...new Set(roles.map((r) => r.campus_id as string))]
	const [only] = campuses
	if (campuses.length !== 1 || only === undefined) {
		return { ok: false, detail: `this booth's account covers ${campuses.length} campuses; a booth reads one: pair it as a booth device` }
	}
	return { ok: true, value: { campusId: only, canEdit: permissions.includes('notes.edit') } }
}

/** A moment as this computer's calendar day, "YYYY-MM-DD". */
export function localDay(ms: number): string {
	const d = new Date(ms)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** When a plan starts, from PCO's own `sort_date`.
 *
 *  ⚠️ UNVERIFIED: read as a true instant, so the day and time are this
 *  computer's local ones. Whether PCO writes that timestamp in UTC, or in the
 *  church's local time with a `Z` on the end, has not been checked against a
 *  real plan. If it is the second, a 9:30 service reads as 22:30 the evening
 *  before, and this is the one function to change. */
export function planStart(plan: PlanRow): number | null {
	if (plan.starts === null) return null
	const at = Date.parse(plan.starts)
	return Number.isFinite(at) ? at : null
}

function planDay(plan: PlanRow): string {
	const at = planStart(plan)
	return at === null ? plan.sort_date : localDay(at)
}

/** Today's plan, or else the next one.
 *
 *  A campus can run several plans a day (a morning and an evening service are
 *  separate service types), so of today's the one starting nearest to now: the
 *  morning's until mid-afternoon, then the evening's. With none today, the next
 *  plan, so a booth checked midweek shows Sunday's notes. */
export function pickPlan(plans: PlanRow[], now: number): PlanRow | null {
	const today = localDay(now)
	const distance = (p: PlanRow) => {
		const at = planStart(p)
		return at === null ? Number.POSITIVE_INFINITY : Math.abs(at - now)
	}
	const todays = plans.filter((p) => planDay(p) === today)
	if (todays.length > 0) return todays.reduce((best, p) => (distance(p) < distance(best) ? p : best))
	const later = plans
		.filter((p) => planDay(p) > today)
		.sort((a, b) => planDay(a).localeCompare(planDay(b)) || (planStart(a) ?? 0) - (planStart(b) ?? 0))
	return later[0] ?? null
}

const KINDS: ReadonlySet<string> = new Set(['song', 'header', 'media', 'item'])

function itemOf(row: ItemRow, notes: string[]): ServiceItem {
	return {
		pcoItemId: row.id,
		title: row.title ?? '',
		kind: KINDS.has(row.item_type) ? (row.item_type as ItemKind) : 'other',
		// PCO stores 0 for "no length" (a header always has 0). A real item that
		// lasts no time at all does not exist, so 0 is read as absent, never 0:00.
		lengthSec: row.length_seconds === null || row.length_seconds <= 0 ? null : row.length_seconds,
		// '' is a cleared note, which the PWA writes rather than deleting the row.
		lightingNote: notes.length === 0 ? null : notes.join('\n'),
	}
}

/** The rows, as the screen's Service. Notes that are blank count as none. */
export function toService(campus: string, plan: PlanRow, items: ItemRow[], notes: NoteRow[]): Service {
	const byItem = new Map<string, string[]>()
	for (const n of notes) {
		const text = n.value_text?.trim() ?? ''
		if (text === '') continue
		byItem.set(n.pco_item_id, [...(byItem.get(n.pco_item_id) ?? []), text])
	}
	return {
		date: planDay(plan),
		campus,
		serviceType: plan.pco_service_types.name,
		planTitle: plan.title?.trim() || null,
		items: [...items].sort((a, b) => a.sequence - b.sequence).map((row) => itemOf(row, byItem.get(row.id) ?? [])),
		nowItemId: null,
	}
}
