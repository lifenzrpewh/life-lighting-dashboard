import test from 'node:test'
import assert from 'node:assert/strict'

import { collectShowList, readShows } from '../dist/src/bridge/show-list.js'
import { LIFEBRIDGE_BUILD as B } from '../dist/src/shared/lifebridge-build.js'

const msg = (address, value) => ({ address, args: [{ type: 's', value }] })
/** As this build of LifeBridge sends it: its stamp first. */
const read = (value, address = '/life/shows') => {
	const r = readShows(msg(address, address === '/life/shows' ? `${B}|${value}` : value), 'life')
	assert.ok(r.ok, r.detail)
	return r.reply
}

test('a part reads as LifeBridge writes it, a changed name marked unloadable', () => {
	assert.deepEqual(read('2.3.2.0|GetPath(Enums.PathType.Showfiles)|1/1|Central 2026-10-04 0915|Mount Eden Base|!P-ua; test'), {
		kind: 'part',
		version: '2.3.2.0',
		way: 'GetPath(Enums.PathType.Showfiles)',
		part: 1,
		parts: 1,
		shows: [
			{ name: 'Central 2026-10-04 0915', loadable: true },
			{ name: 'Mount Eden Base', loadable: true },
			{ name: 'P-ua; test', loadable: false },
		],
	})
	// A console with no shows: a list, empty, not a failure.
	assert.deepEqual(read('2.3.2.0|GetPath(shows)|1/1|').shows, [])
})

test('an unreadable folder and an old plugin are failures with their reasons, never "no shows"', () => {
	const c1 = collectShowList()
	assert.deepEqual(c1.offer(read('2.3.2.0|unreadable|no show folder found')), {
		ok: false,
		detail: 'The console could not list its shows (no show folder found).',
	})
	const c2 = collectShowList()
	const old = c2.offer(read('unknown verb shows', '/life/error'))
	assert.equal(old.ok, false)
	assert.match(old.detail, /an older build, from before build stamps/)
	// Another stamp, or an unstamped reply: another build, nothing read.
	assert.deepEqual(readShows(msg('/life/shows', 'lb-0badc0de|2.3.2.0|w|1/1|A'), 'life').reply, { kind: 'other-build', build: 'lb-0badc0de' })
	assert.deepEqual(readShows(msg('/life/shows', '2.3.2.0|w|1/1|A'), 'life').reply, { kind: 'other-build', build: null })
	// Another verb's error is not ours.
	assert.equal(readShows(msg('/life/error', 'unknown verb pool'), 'life').ok, false)
})

test('parts are gathered in order, and the list is only whole when every part is in', () => {
	const c = collectShowList()
	assert.equal(c.offer(read('2.3.2.0|w|2/3|D|E')), null)
	assert.equal(c.offer(read('2.3.2.0|w|1/3|A|B|C')), null)
	const whole = c.offer(read('2.3.2.0|w|3/3|F'))
	assert.deepEqual(
		whole.shows.map((s) => s.name),
		['A', 'B', 'C', 'D', 'E', 'F'],
	)
})

test('a reply of the wrong shape is refused, not read loosely', () => {
	for (const bad of ['2.3.2.0|w|0/1|A', '2.3.2.0|w|3/2|A', '2.3.2.0|w|x|A', '2.3.2.0']) {
		assert.equal(readShows(msg('/life/shows', `${B}|${bad}`), 'life').ok, false, bad)
	}
	assert.equal(readShows(msg('/life/show', '2.3.2.0|w|1/1|A'), 'life').ok, false)
})
