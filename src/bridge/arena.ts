// Arena's product reply, off its REST API: `GET /api/v1/product`.
//
// ✅ 2026-10-02 against Arena 7.28.0 on Windows:
// `{"name":"Arena","major":7,"minor":28,"micro":0,"revision":24303}`.
//
// THE RULE THIS FILE ENFORCES: as in ./ontime.ts, a reply of the wrong shape
// fails whole. Something else answering on 8080 (the MA web remote's own
// default port) must read as an error, never as an Arena of no version.

import type { ArenaProduct } from '../shared/arena.js'
import type { Decoded } from './ontime.js'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

export function decodeArenaProduct(body: unknown): Decoded<ArenaProduct> {
	if (!isObject(body)) return { ok: false, detail: 'not an Arena product reply' }
	const { name, major, minor, micro } = body
	if (typeof name !== 'string' || name.trim() === '') return { ok: false, detail: 'the reply names no product' }
	if (!whole(major) || !whole(minor) || !whole(micro)) return { ok: false, detail: `${name.trim()} gives no version` }
	return { ok: true, value: { name: name.trim(), major, minor, micro } }
}
