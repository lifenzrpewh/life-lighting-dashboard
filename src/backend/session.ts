// The booth's backend session: a GoTrue session, as `verify` and `token` return
// it, and when to refresh it.
//
// WHY THIS EXISTS: QR pairing ends in a plain Supabase session for the account
// that approved it (visuals-song-comms `pair-approve`: a magic link for the
// approver's own email). There is no device identity to hold, so the booth
// holds that session: an access token that expires, and a refresh token that
// buys the next one. Lose the refresh token and the booth has to pair again.
//
// Pure, like the rest of src/backend: main owns the clock, the disk and the
// network.

import type { Parsed } from './run-order.js'

export type Session = {
	accessToken: string
	/** Single use: GoTrue rotates it on every refresh, so the new one must be
	 *  kept before the old one is forgotten. */
	refreshToken: string
	/** When the access token expires, epoch ms. */
	expiresAt: number
	userId: string
	email: string | null
}

/** Refresh this long before the access token expires, so a read never goes out
 *  on a token that dies in flight. */
export const REFRESH_AHEAD_MS = 5 * 60_000

export function needsRefresh(session: Session, now: number): boolean {
	return session.expiresAt - now < REFRESH_AHEAD_MS
}

/** A session out of GoTrue's answer to `verify` or `token?grant_type=refresh_token`:
 *  `{ access_token, refresh_token, expires_in, expires_at?, user: { id, email } }`. */
export function sessionFrom(body: unknown, now: number): Parsed<Session> {
	const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
	const user = (typeof b['user'] === 'object' && b['user'] !== null ? b['user'] : {}) as Record<string, unknown>
	const access = b['access_token']
	const refresh = b['refresh_token']
	const id = user['id']
	const email = user['email']
	const expiresAt =
		typeof b['expires_at'] === 'number'
			? b['expires_at'] * 1000
			: typeof b['expires_in'] === 'number'
				? now + b['expires_in'] * 1000
				: Number.NaN
	if (typeof access !== 'string' || access === '' || typeof refresh !== 'string' || refresh === '' || typeof id !== 'string') {
		return { ok: false, detail: 'the sign-in answer carried no session' }
	}
	if (!Number.isFinite(expiresAt)) return { ok: false, detail: 'the sign-in answer did not say when it expires' }
	return {
		ok: true,
		value: { accessToken: access, refreshToken: refresh, expiresAt, userId: id, email: typeof email === 'string' ? email : null },
	}
}

/** A session read back off disk, or refused. */
export function sessionFromDisk(raw: unknown): Session | null {
	if (typeof raw !== 'object' || raw === null) return null
	const r = raw as Record<string, unknown>
	const { accessToken, refreshToken, expiresAt, userId, email } = r
	if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof userId !== 'string') return null
	if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
	if (email !== null && typeof email !== 'string') return null
	return { accessToken, refreshToken, expiresAt, userId, email }
}

/** The role inside a Supabase API key, or null if it is not one.
 *
 *  Main refuses any key but `anon`. The service-role key has the same shape and
 *  bypasses every RLS policy; pasted into a booth by mistake, it would hand a
 *  touchscreen the whole database. */
export function apiKeyRole(key: string): string | null {
	const parts = key.split('.')
	const payload = parts[1]
	if (parts.length !== 3 || payload === undefined) return null
	try {
		const json: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
		const role = (json as Record<string, unknown> | null)?.['role']
		return typeof role === 'string' ? role : null
	} catch {
		return null
	}
}
