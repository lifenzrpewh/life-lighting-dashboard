// QR pairing, as the backend's `pair-create` and `pair-poll` functions speak it.
//
// WHY THIS EXISTS: the booth signs in once, by QR, the way the Cue Manager PWA
// does (visuals-song-comms `QrSignIn.tsx`): it asks for a nonce, shows a QR of
// `<backend>/pair?nonce=<nonce>`, and polls until a phone signed in as the booth
// account approves it. The answer is a magic-link token hash, handed over once,
// which `verify` turns into a session (./session.ts).

import type { Parsed } from './run-order.js'

/** The PWA's cadence (QrSignIn.tsx), so the backend sees the load it expects. */
export const PAIR_POLL_MS = 2_500

export type PairCreated = { nonce: string; expiresAt: number }

export type PairPoll = { status: 'pending' } | { status: 'approved'; tokenHash: string } | { status: 'expired' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readPairCreated(body: unknown): Parsed<PairCreated> {
	const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
	const nonce = b['nonce']
	const expiresAt = typeof b['expires_at'] === 'string' ? Date.parse(b['expires_at']) : Number.NaN
	if (typeof nonce !== 'string' || !UUID.test(nonce)) return { ok: false, detail: 'pairing: no nonce in the answer' }
	if (!Number.isFinite(expiresAt)) return { ok: false, detail: 'pairing: the answer did not say when it expires' }
	return { ok: true, value: { nonce, expiresAt } }
}

export function readPairPoll(body: unknown): Parsed<PairPoll> {
	const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
	switch (b['status']) {
		case 'pending':
			return { ok: true, value: { status: 'pending' } }
		case 'expired':
			return { ok: true, value: { status: 'expired' } }
		case 'approved': {
			const hash = b['token_hash']
			return typeof hash === 'string' && hash !== ''
				? { ok: true, value: { status: 'approved', tokenHash: hash } }
				: { ok: false, detail: 'pairing: approved, but no token came with it' }
		}
		default:
			return { ok: false, detail: `pairing: unexpected answer ${JSON.stringify(body).slice(0, 80)}` }
	}
}

/** What the QR says: the PWA's approve page, on the backend's own origin. The
 *  PWA builds it from `window.location.origin`, which inside Electron would be
 *  the kiosk's, so it is built from the backend URL here. */
export function pairUrl(backendUrl: string, nonce: string): string {
	return `${new URL(backendUrl).origin}/pair?nonce=${encodeURIComponent(nonce)}`
}
