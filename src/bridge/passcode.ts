// The Admin passcode at rest: a salted scrypt hash, never the passcode
// (src/shared/admin.ts has the why). Main alone holds it; the renderer is told
// only whether one is set and whether it is all digits.
//
// scrypt because Node has it built in and it is slow on purpose: a copied
// settings file does not hand over a four-digit code in a blink. With only
// 10,000 four-digit codes, nothing makes a short code strong offline; the
// wait after five wrong tries is what guards the screen.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { isNumericPasscode } from '../shared/admin.js'

/** As written in settings.json under `adminPasscode`. */
export type StoredPasscode = {
	kdf: 'scrypt'
	/** Hex. */
	salt: string
	/** Hex, KEY_BYTES long. */
	hash: string
	/** All digits: the unlock sheet opens on its keypad. */
	numeric: boolean
}

const KEY_BYTES = 32
// Node's defaults, named so a change is deliberate: ~50 ms a try.
const COST = { N: 16_384, r: 8, p: 1 }

export function hashPasscode(code: string, salt: Buffer = randomBytes(16)): StoredPasscode {
	return {
		kdf: 'scrypt',
		salt: salt.toString('hex'),
		hash: scryptSync(code, salt, KEY_BYTES, COST).toString('hex'),
		numeric: isNumericPasscode(code),
	}
}

/** Constant-time, so how much of a guess was right is not in how long it took. */
export function checkPasscode(stored: StoredPasscode, code: string): boolean {
	const want = Buffer.from(stored.hash, 'hex')
	const got = scryptSync(code, Buffer.from(stored.salt, 'hex'), KEY_BYTES, COST)
	return want.length === got.length && timingSafeEqual(want, got)
}

/** The stored passcode off disk, or null. A damaged entry is null, which
 *  opens Admin with a tap: the same as deleting the entry, the documented way
 *  back in, and visible in Settings › Admin as "No passcode". */
export function storedPasscodeFrom(raw: unknown): StoredPasscode | null {
	if (typeof raw !== 'object' || raw === null) return null
	const r = raw as Record<string, unknown>
	const hex = (v: unknown, bytes: number) => typeof v === 'string' && v.length === bytes * 2 && /^[0-9a-f]+$/.test(v)
	if (r['kdf'] !== 'scrypt' || !hex(r['salt'], 16) || !hex(r['hash'], KEY_BYTES)) return null
	return { kdf: 'scrypt', salt: r['salt'] as string, hash: r['hash'] as string, numeric: r['numeric'] === true }
}
