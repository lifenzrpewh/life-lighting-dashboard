import test from 'node:test'
import assert from 'node:assert/strict'

import {
	SHOW_NAME_MAX,
	campusPart,
	loadCommand,
	loadProblem,
	nzStamp,
	offeredName,
	saveAsCommand,
	saveAsProblem,
} from '../dist/src/shared/showfile-write.js'

// 2026-10-03 20:15 UTC is Sunday 2026-10-04 09:15 in New Zealand (NZDT, +13).
const SUNDAY_0915 = new Date(Date.UTC(2026, 9, 3, 20, 15, 30))

test('the stamp is the New Zealand date and time, whatever the computer thinks', () => {
	assert.equal(nzStamp(SUNDAY_0915), '2026-10-04 0915')
	// Midnight is 00, not 24.
	assert.equal(nzStamp(new Date(Date.UTC(2026, 9, 3, 11, 0))), '2026-10-04 0000')
})

test('the offered name is campus then stamp, within 31, the campus cut first', () => {
	assert.equal(offeredName('Central', SUNDAY_0915), 'Central 2026-10-04 0915')
	const long = offeredName('LIFE Central Auckland Campus', SUNDAY_0915)
	assert.equal(long.length, SHOW_NAME_MAX)
	assert.ok(long.endsWith(' 2026-10-04 0915'), long)
	assert.equal(long, 'LIFE Central Au 2026-10-04 0915')
	// No campus set: a plain word, still unique by the minute.
	assert.equal(offeredName(null, SUNDAY_0915), 'Show 2026-10-04 0915')
	// What the link cannot carry is dropped, not mangled into the name.
	assert.equal(campusPart('Pāua, North'), 'Paua North')
	for (const c of [null, 'Central', 'LIFE Central Auckland Campus', 'Pāua, North', '   ']) {
		assert.equal(saveAsProblem(offeredName(c, SUNDAY_0915), 'Mount Eden Base'), null, String(c))
	}
})

test('a Save As name is refused if MA would cut it, the link would change it, or it is the base', () => {
	assert.match(saveAsProblem('x'.repeat(32), null), /31/)
	assert.match(saveAsProblem('Sunday "late"', null), /letters, numbers/)
	assert.match(saveAsProblem('Pāua 2026', null), /letters, numbers/)
	assert.match(saveAsProblem('mount eden base', 'Mount Eden Base'), /base show/)
	assert.equal(saveAsProblem('Central 2026-10-04 0915', 'Mount Eden Base'), null)
})

test('the commands are exactly what is sent, and a Load always says what happens to the old show', () => {
	assert.equal(saveAsCommand('Central 2026-10-04 0915'), 'SaveShow "Central 2026-10-04 0915"')
	assert.equal(loadCommand('Mount Eden Base', true), 'LoadShow "Mount Eden Base" /NoConfirmation /Save')
	assert.equal(loadCommand('Mount Eden Base', false), 'LoadShow "Mount Eden Base" /NoConfirmation /NoSave')
	assert.equal(loadProblem("Lee's show & more"), null)
	assert.match(loadProblem('A "quoted" show'), /cannot carry/)
	assert.match(loadProblem('Pāua'), /cannot carry/)
})
