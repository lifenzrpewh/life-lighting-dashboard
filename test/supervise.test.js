import test from 'node:test'
import assert from 'node:assert/strict'

import { CRASH_LIMIT, RESTART_DELAY_MS, exitWords, nextStep } from '../dist/src/bridge/supervise.js'

const now = 1_000_000

test('a clean quit stays quit', () => {
	assert.equal(nextStep({ code: 0, signal: null }, [], now).kind, 'stop')
})

test('a crash comes back after the delay, however it died', () => {
	assert.deepEqual(nextStep({ code: 1, signal: null }, [], now), { kind: 'restart', afterMs: RESTART_DELAY_MS })
	// A Windows crash code is negative; a Mac crash is a signal with no code.
	assert.equal(nextStep({ code: -1073741819, signal: null }, [], now).kind, 'restart')
	assert.equal(nextStep({ code: null, signal: 'SIGSEGV' }, [], now).kind, 'restart')
})

test('too many crashes close together and it gives up, saying why', () => {
	const crashes = Array.from({ length: CRASH_LIMIT - 1 }, (_, i) => now - i * 10_000)
	const step = nextStep({ code: 1, signal: null }, crashes, now)
	assert.equal(step.kind, 'give-up')
	assert.match(step.why, /5 crashes in 120 s/)
})

test('crashes long ago do not count against it', () => {
	const old = Array.from({ length: 10 }, (_, i) => now - 10 * 60_000 - i)
	assert.equal(nextStep({ code: 1, signal: null }, old, now).kind, 'restart')
})

test('an exit in words', () => {
	assert.equal(exitWords({ code: 3, signal: null }), 'exit code 3')
	assert.equal(exitWords({ code: null, signal: 'SIGKILL' }), 'killed by SIGKILL')
})
