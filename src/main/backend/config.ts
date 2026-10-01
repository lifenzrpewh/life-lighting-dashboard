// The backend this booth reads, and the key it asks with.
//
// Built in (../../backend/endpoint.ts): the same for every booth, and public.
// `LIFE_BACKEND_ANON_KEY`, or `backend.json` beside the settings
// (`{ "anonKey": "eyJ...", "url": "https://..." }`), points one computer at
// another backend, for testing. A booth never needs either.
//
// THE RULE THIS FILE ENFORCES: only an `anon` key is accepted, wherever it came
// from. The service-role key looks the same and bypasses RLS entirely.

import fs from 'node:fs'
import path from 'node:path'

import { BACKEND_ANON_KEY, BACKEND_URL } from '../../backend/endpoint.js'
import { apiKeyRole } from '../../backend/session.js'

export type BackendConfig = { ok: true; url: string; anonKey: string } | { ok: false; detail: string }

/** The built-in backend, unless this computer has been pointed elsewhere. */
export function backendConfig(dataDir: string): BackendConfig {
	const file = path.join(dataDir, 'backend.json')
	let fromFile: Record<string, unknown> = {}
	try {
		const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
		if (typeof raw === 'object' && raw !== null) fromFile = raw as Record<string, unknown>
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return { ok: false, detail: `${file} is unreadable: ${String(e)}` }
	}

	const key = process.env['LIFE_BACKEND_ANON_KEY'] ?? fromFile['anonKey'] ?? BACKEND_ANON_KEY
	const url = typeof fromFile['url'] === 'string' ? fromFile['url'] : BACKEND_URL
	if (typeof key !== 'string' || key.trim() === '') {
		return { ok: false, detail: `the backend key in ${file} is empty` }
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
