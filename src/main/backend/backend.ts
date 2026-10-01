// The Planning Center backend: the run order, the booth's session, and pairing.
//
// WHY THIS EXISTS: the run order comes from `visuals-song-comms`, read as-is
// (../../backend/run-order.ts has the requests and the rules). This is the
// impure half: the timer, the network, the session's refresh, the disk.
//
// THE RULES THIS FILE ENFORCES:
// - The run order is judged by its own reads, never by the console link. A dead
//   console no longer blanks PCO data the backend still has (docs/PLAN.md, the
//   known wrinkle); a dead backend shows the last good read, with its age.
// - Every read lands in the Channel as what it was: a value, a timeout, or an
//   error with the reason. Not paired, not configured and not allowed are
//   errors a person can act on, and say which.
// - No token leaves main. The renderer gets BackendStatus and the Channel.

import QRCode from 'qrcode'

import { pairUrl, readPairCreated, readPairPoll, PAIR_POLL_MS } from '../../backend/pairing.js'
import { campusOf, localDay, paths, pickPlan, read, toService, type NoteRow, type Parsed } from '../../backend/run-order.js'
import { needsRefresh, sessionFrom, type Session } from '../../backend/session.js'
import { RUN_ORDER_POLL_MS, RUN_ORDER_TIMEOUT_MS, type BackendStatus, type PairingView } from '../../shared/backend.js'
import type { Channel, ReadResult } from '../../shared/reading.js'
import { record, unread } from '../../shared/reading.js'
import type { Schedule } from '../../shared/service.js'
import { backendConfig } from './config.js'
import { call, type Reply } from './http.js'
import { openBackendStore } from './store.js'

const DAY_MS = 24 * 60 * 60_000

export type BackendHandle = {
	status(): BackendStatus
	schedule(): Channel<Schedule>
	/** Operator mode only; kiosk.ts checks. */
	pair(): void
	cancelPairing(): void
	unpair(): Promise<void>
	stop(): void
}

type Failure = Extract<ReadResult<never>, { ok: false }>

/** A read that did not go through, as the Channel records it. */
const failed = (reply: Extract<Reply, { ok: false }>, what: string, at: number): Failure =>
	reply.reason === 'timeout'
		? { ok: false, reason: 'timeout', at }
		: { ok: false, reason: 'error', at, detail: `${what}: ${reply.detail}` }

export function startBackend(options: {
	dataDir: string
	log: (line: string) => void
	error: (line: string) => void
}): BackendHandle {
	const config = backendConfig(options.dataDir)
	const store = openBackendStore(options.dataDir)
	let session: Session | null = store.loadSession()
	let campus: string | null = null
	let warning: string | null = null
	let pairing: PairingView | null = null
	let pairTimer: ReturnType<typeof setInterval> | null = null
	let pairNonce: string | null = null
	let reading = false
	let stopped = false

	// Boot with the last good read as lastOk and nothing as latest: `?` for the
	// moment before the first read, then fresh, or that cache with its age.
	const cached = store.loadSchedule()
	let channel: Channel<Schedule> = cached === null ? unread<Schedule>() : { latest: null, lastOk: cached }
	let lastLogged = ''

	const put = (result: ReadResult<Schedule>) => {
		channel = record(channel, result)
		const line = result.ok
			? `run order: ${result.value.campus}, ${result.value.service === null ? 'no plan ahead' : `${result.value.service.date} ${result.value.service.serviceType}, ${result.value.service.items.length} items`}`
			: `run order: ${result.reason === 'timeout' ? 'backend did not answer' : result.detail}`
		// Once per distinct outcome: a read every 30 s would bury the log.
		if (line !== lastLogged) (result.ok ? options.log : options.error)(line)
		lastLogged = line
	}

	const headers = (token: string | null) => {
		if (!config.ok) throw new Error('unreachable: no config')
		return { apikey: config.anonKey, authorization: `Bearer ${token ?? config.anonKey}` }
	}

	const request = (path: string, token: string | null, body?: unknown) => {
		if (!config.ok) throw new Error('unreachable: no config')
		return call(`${config.url}${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers: headers(token),
			body,
			timeoutMs: RUN_ORDER_TIMEOUT_MS,
		})
	}

	const forget = (why: string) => {
		options.error(`backend: signed out (${why}); pair the booth again in Settings`)
		session = null
		campus = null
		warning = null
		store.clearSession()
	}

	/** A session good for the next few minutes, refreshing it first if needed. */
	async function freshSession(force = false): Promise<{ ok: true; session: Session } | Failure> {
		const now = Date.now()
		if (session === null) return { ok: false, reason: 'error', at: now, detail: 'this booth is not signed in to Planning Center: pair it in Settings' }
		if (!force && !needsRefresh(session, now)) return { ok: true, session }
		const reply = await request('/auth/v1/token?grant_type=refresh_token', null, { refresh_token: session.refreshToken })
		if (!reply.ok) {
			// Refused outright: the session is gone (signed out elsewhere, revoked,
			// or its refresh token already used). Anything else may pass, and the
			// old token may still have minutes left.
			if (reply.reason === 'error' && (reply.status === 400 || reply.status === 401)) {
				forget(reply.detail)
				// A revoked booth device lands here: revoking deletes its account.
				return { ok: false, reason: 'error', at: Date.now(), detail: 'the booth was signed out of Planning Center (revoked?): pair it again in Settings' }
			}
			if (session.expiresAt > Date.now()) return { ok: true, session }
			return failed(reply, 'sign-in refresh', Date.now())
		}
		const next = sessionFrom(reply.body, Date.now())
		if (!next.ok) return { ok: false, reason: 'error', at: Date.now(), detail: next.detail }
		// Kept before it is used: the old refresh token is spent.
		store.saveSession(next.value)
		session = next.value
		return { ok: true, session: next.value }
	}

	/** One request, parsed. A 401 means the token died early: say so, so the
	 *  caller can refresh once and try again. */
	async function get<T>(path: string, s: Session, parse: (b: unknown) => Parsed<T>, what: string, body?: unknown) {
		const reply = await request(path, s.accessToken, body)
		if (!reply.ok) return { ok: false as const, expired: reply.reason === 'error' && reply.status === 401, failure: failed(reply, what, Date.now()) }
		const parsed = parse(reply.body)
		if (!parsed.ok) return { ok: false as const, expired: false, failure: { ok: false, reason: 'error', at: Date.now(), detail: parsed.detail } as Failure }
		return { ok: true as const, value: parsed.value }
	}

	async function readOnce(s: Session): Promise<{ result: ReadResult<Schedule>; expired: boolean }> {
		const fail = (r: { expired: boolean; failure: Failure }) => ({ result: r.failure, expired: r.expired })
		const refuse = (detail: string) => ({ result: { ok: false, reason: 'error', at: Date.now(), detail } as Failure, expired: false })

		const [permissions, roles] = await Promise.all([
			get(paths.permissions, s, read.permissions, 'permissions', {}),
			get(paths.roles(s.userId), s, read.roles, 'roles'),
		])
		if (!permissions.ok) return fail(permissions)
		if (!roles.ok) return fail(roles)
		const scope = campusOf(roles.value, permissions.value)
		if (!scope.ok) return refuse(scope.detail)
		warning = scope.value.canEdit ? 'this account can also edit notes; the booth only needs notes.view' : null

		const now = Date.now()
		const { campusId } = scope.value
		const [campusRows, fields, plans] = await Promise.all([
			get(paths.campus(campusId), s, read.campuses, 'campus'),
			get(paths.fields(campusId), s, read.fields, 'lighting field'),
			get(paths.plans(campusId, localDay(now - DAY_MS)), s, read.plans, 'plans'),
		])
		if (!campusRows.ok) return fail(campusRows)
		if (!fields.ok) return fail(fields)
		if (!plans.ok) return fail(plans)
		const name = campusRows.value[0]?.name
		if (name === undefined) return refuse("this booth's account is scoped to a campus the backend does not list")
		campus = name
		if (fields.value.length === 0) return refuse('the backend has no active Lighting field, so there are no notes to read')

		const plan = pickPlan(plans.value, now)
		if (plan === null) return { result: { ok: true, value: { campus: name, service: null }, at: Date.now() }, expired: false }

		const items = await get(paths.items(plan.id), s, read.items, 'items')
		if (!items.ok) return fail(items)
		let noteRows: NoteRow[] = []
		if (items.value.length > 0) {
			const fieldIds = fields.value.map((f) => f.id)
			const notes = await get(paths.notes(fieldIds, items.value.map((i) => i.id)), s, read.notes, 'notes')
			if (!notes.ok) return fail(notes)
			noteRows = notes.value
		}
		const service = toService(name, plan, items.value, noteRows)
		return { result: { ok: true, value: { campus: name, service }, at: Date.now() }, expired: false }
	}

	async function readSchedule(): Promise<void> {
		if (reading || stopped) return
		reading = true
		try {
			if (!config.ok) return put({ ok: false, reason: 'error', at: Date.now(), detail: config.detail })
			let s = await freshSession()
			if (!s.ok) return put(s)
			let attempt = await readOnce(s.session)
			// The access token died before its time: refresh once and ask again.
			if (attempt.expired) {
				s = await freshSession(true)
				if (!s.ok) return put(s)
				attempt = await readOnce(s.session)
			}
			put(attempt.result)
			if (attempt.result.ok) store.saveSchedule(attempt.result.value, attempt.result.at)
		} catch (e) {
			// A bug here must still land as a failure, never as a silent stall.
			put({ ok: false, reason: 'error', at: Date.now(), detail: `run order: ${String(e)}` })
		} finally {
			reading = false
		}
	}

	// --- pairing ------------------------------------------------------------------

	const stopPairing = () => {
		if (pairTimer !== null) clearInterval(pairTimer)
		pairTimer = null
		pairNonce = null
	}

	async function pollPairing(nonce: string, expiresAt: number): Promise<void> {
		if (pairNonce !== nonce) return
		if (Date.now() > expiresAt) {
			stopPairing()
			pairing = { phase: 'expired' }
			return
		}
		const reply = await request('/functions/v1/pair-poll', null, { nonce })
		if (pairNonce !== nonce) return
		// A blip mid-wait is not a failure: keep asking until the QR expires.
		if (!reply.ok) return
		const poll = readPairPoll(reply.body)
		if (!poll.ok) {
			stopPairing()
			pairing = { phase: 'failed', detail: poll.detail }
			return
		}
		if (poll.value.status === 'pending') return
		stopPairing()
		if (poll.value.status === 'expired') {
			pairing = { phase: 'expired' }
			return
		}
		// Handed over once (pair-poll marks it consumed), so a failure from here
		// on means a fresh QR.
		pairing = { phase: 'verifying' }
		const verified = await request('/auth/v1/verify', null, { type: 'magiclink', token_hash: poll.value.tokenHash })
		if (!verified.ok) {
			pairing = { phase: 'failed', detail: `sign-in: ${verified.detail}` }
			return
		}
		const next = sessionFrom(verified.body, Date.now())
		if (!next.ok) {
			pairing = { phase: 'failed', detail: next.detail }
			return
		}
		store.saveSession(next.value)
		session = next.value
		pairing = null
		options.log(`backend: paired as ${next.value.email ?? next.value.userId}`)
		void readSchedule()
	}

	async function startPairing(): Promise<void> {
		stopPairing()
		if (!config.ok) {
			pairing = { phase: 'failed', detail: config.detail }
			return
		}
		if (!store.canKeepSession) {
			pairing = { phase: 'failed', detail: 'this computer has no OS keystore, so a sign-in cannot be kept' }
			return
		}
		pairing = { phase: 'starting' }
		const reply = await request('/functions/v1/pair-create', null, {})
		if (!reply.ok) {
			pairing = { phase: 'failed', detail: `pairing: ${reply.detail}` }
			return
		}
		const created = readPairCreated(reply.body)
		if (!created.ok) {
			pairing = { phase: 'failed', detail: created.detail }
			return
		}
		const { nonce, expiresAt } = created.value
		const qrSvg = await QRCode.toString(pairUrl(config.url, nonce), {
			type: 'svg',
			margin: 2,
			width: 280,
			color: { dark: '#000000', light: '#ffffff' },
		})
		pairNonce = nonce
		pairing = { phase: 'waiting', qrSvg, expiresAt }
		pairTimer = setInterval(() => void pollPairing(nonce, expiresAt), PAIR_POLL_MS)
	}

	// --- the timer ----------------------------------------------------------------

	void readSchedule()
	const timer = setInterval(() => void readSchedule(), RUN_ORDER_POLL_MS)
	timer.unref?.()

	return {
		status() {
			if (!config.ok) return { state: 'unconfigured', detail: config.detail }
			if (session === null) return { state: 'unpaired', pairing }
			return { state: 'paired', email: session.email, campus, warning }
		},
		schedule: () => channel,
		pair: () => void startPairing(),
		cancelPairing() {
			stopPairing()
			pairing = null
		},
		async unpair() {
			const s = session
			// This session only, never every session on the account. The PWA does
			// the same since 2026-10-01.
			if (s !== null && config.ok) await request('/auth/v1/logout?scope=local', s.accessToken, {})
			session = null
			campus = null
			warning = null
			store.clearSession()
			store.clearSchedule()
			channel = unread<Schedule>()
			options.log('backend: unpaired')
		},
		stop() {
			stopped = true
			clearInterval(timer)
			stopPairing()
		},
	}
}
