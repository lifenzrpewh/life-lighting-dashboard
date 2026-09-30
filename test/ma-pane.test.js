import test from 'node:test'
import assert from 'node:assert/strict'

import {
	webRemoteUrl,
	webRemoteLogin,
	isWebRemote,
	operatorExpired,
	OPERATOR_IDLE_MS,
} from '../dist/src/shared/ma-pane.js'

test('a console address becomes its web remote, with no credentials', () => {
	assert.equal(webRemoteUrl('10.11.60.40', 8080), 'http://10.11.60.40:8080/')
	assert.equal(webRemoteUrl('ma3-foh.local', 8081), 'http://ma3-foh.local:8081/')
})

test('an address cannot smuggle in a port, path, userinfo or query', () => {
	// The pane must only ever load the console. Each of these would let the
	// address pick where the kiosk browses instead.
	for (const bad of [
		'10.11.60.40:9000',
		'10.11.60.40/admin',
		'user@10.11.60.40',
		'10.11.60.40?user=Admin',
		'evil.com#10.11.60.40',
		'http://10.11.60.40',
		' 10.11.60.40',
		'',
		'-host',
		'a..b',
	]) {
		assert.equal(webRemoteUrl(bad, 8080), null, bad)
	}
	for (const port of [0, 65536, 80.5, Number.NaN]) assert.equal(webRemoteUrl('10.11.60.40', port), null, String(port))
})

test('Remote with no password is the bare address, the documented default', () => {
	const base = 'http://10.11.60.40:8080/'
	assert.equal(webRemoteLogin(base, 'Remote', null), base)
})

test('anyone else logs in by name, in the manual\'s own URL form', () => {
	const base = 'http://10.11.60.40:8080/'
	assert.equal(webRemoteLogin(base, 'LD', null), `${base}?user=LD`)
	assert.equal(webRemoteLogin(base, 'LD', 'pw'), `${base}?user=LD&password=pw`)
	assert.equal(webRemoteLogin(base, 'Remote', 'pw'), `${base}?user=Remote&password=pw`)
})

test('a password cannot add parameters of its own', () => {
	const url = new URL(webRemoteLogin('http://10.11.60.40:8080/', 'LD Name', 'a&user=Admin#x'))
	assert.deepEqual([...url.searchParams], [
		['user', 'LD Name'],
		['password', 'a&user=Admin#x'],
	])
	assert.equal(url.hash, '')
})

test('the pane may navigate within the console and nowhere else', () => {
	const home = 'http://10.11.60.40:8080/'
	assert.ok(isWebRemote('http://10.11.60.40:8080/some/view?x=1', home))
	assert.ok(!isWebRemote('http://10.11.60.40:8081/', home), 'another port is another origin')
	assert.ok(!isWebRemote('https://10.11.60.40:8080/', home), 'another scheme is another origin')
	assert.ok(!isWebRemote('https://example.com/', home))
	assert.ok(!isWebRemote('not a url', home))
	assert.ok(!isWebRemote(home, ''), 'no target means nowhere is home')
})

test('operator mode lasts 15 idle minutes, not one moment less', () => {
	const t = 1_000_000
	assert.ok(!operatorExpired(t, t + OPERATOR_IDLE_MS - 1))
	assert.ok(operatorExpired(t, t + OPERATOR_IDLE_MS))
})
