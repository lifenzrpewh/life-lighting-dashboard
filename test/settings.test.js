import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_SETTINGS, applyPatch, fromDisk, patchFrom } from '../dist/src/shared/settings.js'

test('first boot has no console address, rather than a guessed one', () => {
	assert.equal(DEFAULT_SETTINGS.consoleHost, null)
	assert.equal(DEFAULT_SETTINGS.webRemotePort, 8080)
	assert.equal(DEFAULT_SETTINGS.volunteerUser, 'Remote')
	assert.equal(DEFAULT_SETTINGS.operatorUser, null)
})

test('a good patch applies, trimmed', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: ' 10.11.60.40 ', webRemotePort: 8080, operatorUser: 'LD' })
	assert.ok(r.ok)
	assert.equal(r.settings.consoleHost, '10.11.60.40')
	assert.equal(r.settings.operatorUser, 'LD')
})

test('one bad field rejects the whole patch, and says which', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: '10.11.60.40', webRemotePort: 0, volunteerUser: '' })
	assert.ok(!r.ok)
	assert.deepEqual(Object.keys(r.errors).sort(), ['volunteerUser', 'webRemotePort'])
})

test('an address with a scheme or port is refused, not half-used', () => {
	for (const host of ['http://10.11.60.40', '10.11.60.40:8080', '10.11.60.40/']) {
		const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: host })
		assert.ok(!r.ok, host)
		assert.ok(r.errors.consoleHost)
	}
})

test('clearing the address or the operator user means unset, not empty', () => {
	const set = { ...DEFAULT_SETTINGS, consoleHost: '10.11.60.40', operatorUser: 'LD' }
	const r = applyPatch(set, { consoleHost: '', operatorUser: '  ' })
	assert.ok(r.ok)
	assert.equal(r.settings.consoleHost, null)
	assert.equal(r.settings.operatorUser, null)
})

test('an empty password is an error, so blank can only ever mean "unchanged"', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { operatorPassword: '' })
	assert.ok(!r.ok)
	assert.ok(r.errors.operatorPassword)
	assert.ok(applyPatch(DEFAULT_SETTINGS, { operatorPassword: null }).ok, 'null removes')
})

test('a corrupt file costs only the bad values', () => {
	const s = fromDisk({ consoleHost: 'http://nope', webRemotePort: 8081, volunteerUser: 42, operatorUser: 'LD' })
	assert.deepEqual(s, { consoleHost: null, webRemotePort: 8081, volunteerUser: 'Remote', operatorUser: 'LD' })
	assert.deepEqual(fromDisk('garbage'), DEFAULT_SETTINGS)
})

test('a patch of the wrong shape off IPC is rejected whole, never dropped quietly', () => {
	assert.equal(patchFrom({ webRemotePort: '8080' }), null)
	assert.equal(patchFrom(null), null)
	assert.deepEqual(patchFrom({ consoleHost: '10.11.60.40', junk: 1 }), { consoleHost: '10.11.60.40' })
})
