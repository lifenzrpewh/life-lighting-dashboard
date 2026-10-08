import test from 'node:test'
import assert from 'node:assert/strict'

import {
	ADMIN_TIMEOUTS_MIN,
	DEFAULT_ADMIN_TIMEOUT_MIN,
	NO_LOCKOUT,
	TRIES_BEFORE_WAIT,
	WRONG_WAIT_MS,
	isNumericPasscode,
	passcodeError,
	tryUnlock,
	waitWords,
	wrongWords,
} from '../dist/src/shared/admin.js'
import { checkPasscode, hashPasscode, storedPasscodeFrom } from '../dist/src/bridge/passcode.js'
import { DEFAULT_SETTINGS, applyPatch, fromDisk, patchFrom } from '../dist/src/shared/settings.js'

test('the timeout is 15 minutes unless a booth picks one of the others', () => {
	assert.equal(DEFAULT_ADMIN_TIMEOUT_MIN, 15)
	assert.equal(DEFAULT_SETTINGS.adminTimeoutMin, 15)
	assert.deepEqual([...ADMIN_TIMEOUTS_MIN], [2, 5, 10, 15, 30, 60])
	const ok = applyPatch(DEFAULT_SETTINGS, { adminTimeoutMin: 5 })
	assert.ok(ok.ok)
	assert.equal(ok.settings.adminTimeoutMin, 5)
	assert.equal(applyPatch(DEFAULT_SETTINGS, { adminTimeoutMin: 7 }).ok, false, 'not one of the choices')
	assert.equal(fromDisk({ adminTimeoutMin: 7 }).adminTimeoutMin, 15, 'a hand-edited odd value falls back')
	assert.equal(fromDisk({ adminTimeoutMin: 60 }).adminTimeoutMin, 60)
})

test('a new passcode: four or more, no control characters, nothing invisible at its ends', () => {
	assert.equal(passcodeError('1234'), null)
	assert.equal(passcodeError('lighting desk'), null)
	assert.ok(passcodeError('123'))
	assert.ok(passcodeError('1234 '))
	assert.ok(passcodeError('12\n34'))
	assert.ok(passcodeError('x'.repeat(65)))
	assert.equal(applyPatch(DEFAULT_SETTINGS, { adminPasscode: '12' }).ok, false)
	assert.ok(applyPatch(DEFAULT_SETTINGS, { adminPasscode: '2468' }).ok)
	assert.ok(applyPatch(DEFAULT_SETTINGS, { adminPasscode: null }).ok, 'null removes it')
	assert.deepEqual(patchFrom({ adminPasscode: null }), { adminPasscode: null })
	assert.equal(patchFrom({ adminPasscode: 1234 }), null, 'a number is not a passcode off IPC')
	assert.ok(isNumericPasscode('0042'))
	assert.ok(!isNumericPasscode('42ab'))
})

test('the passcode is kept only as a salted hash, and checked against it', () => {
	const stored = hashPasscode('2468')
	assert.equal(stored.kdf, 'scrypt')
	assert.ok(!JSON.stringify(stored).includes('2468'), 'the passcode is nowhere in what is written')
	assert.equal(stored.numeric, true)
	assert.ok(checkPasscode(stored, '2468'))
	assert.ok(!checkPasscode(stored, '2469'))
	assert.ok(!checkPasscode(stored, ''))
	assert.notEqual(hashPasscode('2468').hash, stored.hash, 'a fresh salt each time')
	assert.equal(hashPasscode('desk lamp').numeric, false)
	// Off disk: a damaged entry is no passcode, as a deleted one is.
	assert.deepEqual(storedPasscodeFrom(JSON.parse(JSON.stringify(stored))), stored)
	assert.equal(storedPasscodeFrom({ ...stored, hash: 'zz' }), null)
	assert.equal(storedPasscodeFrom(null), null)
})

test('five wrong tries, then a 30 s wait, then five more', () => {
	let l = NO_LOCKOUT
	const t = 1_000_000
	for (let i = 1; i < TRIES_BEFORE_WAIT; i++) {
		const r = tryUnlock(l, t, true, () => false)
		assert.deepEqual(r.result, { ok: false, why: 'wrong', triesLeft: TRIES_BEFORE_WAIT - i })
		l = r.lockout
	}
	const fifth = tryUnlock(l, t, true, () => false)
	assert.deepEqual(fifth.result, { ok: false, why: 'wait', waitMs: WRONG_WAIT_MS })
	l = fifth.lockout
	let asked = false
	const during = tryUnlock(l, t + 10_000, true, () => ((asked = true), true))
	assert.deepEqual(during.result, { ok: false, why: 'wait', waitMs: 20_000 }, 'even the right one waits')
	assert.equal(asked, false, 'the hash is not even checked during a wait')
	const after = tryUnlock(l, t + WRONG_WAIT_MS, true, () => false)
	assert.deepEqual(after.result, { ok: false, why: 'wrong', triesLeft: TRIES_BEFORE_WAIT - 1 })
	const right = tryUnlock(after.lockout, t + WRONG_WAIT_MS, true, () => true)
	assert.deepEqual(right.result, { ok: true })
	assert.deepEqual(right.lockout, NO_LOCKOUT, 'a right one clears the count')
})

test('no passcode set: a tap goes straight in', () => {
	assert.deepEqual(tryUnlock(NO_LOCKOUT, 0, false, () => false).result, { ok: true })
})

test('the waits and wrong tries are said in words', () => {
	assert.equal(waitWords(29_100), 'Too many wrong tries. Try again in 30 seconds.')
	assert.equal(waitWords(1), 'Too many wrong tries. Try again in 1 second.')
	assert.equal(wrongWords(1), 'Not the passcode. 1 try before a 30-second wait.')
})
