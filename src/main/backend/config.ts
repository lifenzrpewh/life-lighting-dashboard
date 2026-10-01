// Where the backend is, and the key that lets anyone ask it anything at all.
//
// WHY THIS IS NOT A SETTING: it is the same for every booth. One backend serves
// every campus (`visuals-song-comms`), and the anon key is public by design: the
// PWA ships it to every browser, and RLS is what actually decides what a caller
// may read. So it is not per-booth configuration, and it is not a secret. It is
// kept out of git only because it did not come with this repo.
//
// THE RULE THIS FILE ENFORCES: only an `anon` key is accepted. The service-role
// key looks the same and bypasses RLS entirely.

import fs from 'node:fs'
import path from 'node:path'

import { apiKeyRole } from '../../backend/session.js'

/** The PWA and the Supabase API, same-origin behind Caddy (visuals-song-comms
 *  CLAUDE.md). ✅ 2026-09-30: answers directly, no Cloudflare Access in front;
 *  Kong wants only the `apikey` header. */
export const BACKEND_URL = 'https://visuals.prodapps.life'

export type BackendConfig = { ok: true; url: string; anonKey: string } | { ok: false; detail: string }

/** The key from `LIFE_BACKEND_ANON_KEY`, or else `backend.json` beside the
 *  settings (`{ "anonKey": "eyJ..." }`, optionally `"url"`). */
export function backendConfig(dataDir: string): BackendConfig {
	const file = path.join(dataDir, 'backend.json')
	let fromFile: Record<string, unknown> = {}
	try {
		const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
		if (typeof raw === 'object' && raw !== null) fromFile = raw as Record<string, unknown>
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return { ok: false, detail: `${file} is unreadable: ${String(e)}` }
	}

	const key = process.env['LIFE_BACKEND_ANON_KEY'] ?? fromFile['anonKey']
	const url = typeof fromFile['url'] === 'string' ? fromFile['url'] : BACKEND_URL
	if (typeof key !== 'string' || key.trim() === '') {
		return { ok: false, detail: `no backend key: put {"anonKey": "..."} in ${file}` }
	}
	const role = apiKeyRole(key.trim())
	if (role !== 'anon') {
		return {
			ok: false,
			detail: role === null ? 'the backend key is not a Supabase API key' : `the backend key is a ${role} key; a booth takes only the anon key`,
		}
	}
	try {
		if (new URL(url).protocol !== 'https:') return { ok: false, detail: `the backend URL must be https, got ${url}` }
	} catch {
		return { ok: false, detail: `the backend URL is not a URL: ${url}` }
	}
	return { ok: true, url: url.replace(/\/+$/, ''), anonKey: key.trim() }
}
