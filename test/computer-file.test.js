import test from 'node:test'
import assert from 'node:assert/strict'

import { computerFile, computerFileFrom, computerLocalFrom } from '../dist/src/shared/computer-file.js'

test('a setup file round-trips, and never carries a secret', () => {
	const file = computerFile('1.6.0', { consoleHost: '10.11.60.40', secrets: { volunteer: 'x' }, adminPasscode: { hash: 'h' } }, { 'paua.layouts': '[]' }, new Date('2026-10-14T09:00:00Z'))
	assert.equal('secrets' in file.settings, false)
	assert.equal('adminPasscode' in file.settings, false)
	const read = computerFileFrom(JSON.stringify(file))
	assert.ok(read.ok)
	assert.equal(read.file.settings.consoleHost, '10.11.60.40')
	assert.deepEqual(read.file.local, { 'paua.layouts': '[]' })
})

test('a file that is not one, is newer, or carries a password or a stray item is refused whole', () => {
	const good = computerFile('1.6.0', {}, {}, new Date())
	assert.equal(computerFileFrom('not json').ok, false)
	assert.equal(computerFileFrom(JSON.stringify({ ...good, kind: 'other' })).ok, false)
	assert.equal(computerFileFrom(JSON.stringify({ ...good, version: 2 })).ok, false)
	assert.equal(computerFileFrom(JSON.stringify({ ...good, settings: { secrets: {} } })).ok, false)
	assert.equal(computerFileFrom(JSON.stringify({ ...good, local: { 'paua.showMode': '1' } })).ok, false, 'the moment is not setup')
	assert.equal(computerLocalFrom({ 'paua.holdingMap': 3 }), null)
})
