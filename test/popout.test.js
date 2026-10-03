import test from 'node:test'
import assert from 'node:assert/strict'

import { POPOUT_SIZE, popoutBounds, popoutPlacesFrom, popoutViewOf } from '../dist/src/shared/popout.js'

const kiosk = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
const second = { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1040 } }

test('a pop-out with nowhere remembered opens on the other display, centred', () => {
	const b = popoutBounds(null, [kiosk, second], 1)
	assert.deepEqual(b, { x: 1920 + (1920 - POPOUT_SIZE.width) / 2, y: (1040 - POPOUT_SIZE.height) / 2, ...POPOUT_SIZE })
})

test("with one display it opens on the kiosk's, and never larger than it", () => {
	assert.equal(popoutBounds(null, [kiosk], 1).x, (1920 - POPOUT_SIZE.width) / 2)
	const small = { id: 1, workArea: { x: 0, y: 0, width: 800, height: 600 } }
	assert.deepEqual(popoutBounds(null, [small], 1), { x: 0, y: 0, width: 800, height: 600 })
})

test('a remembered place is kept while its top edge is on a display', () => {
	const saved = { x: 2000, y: 100, width: 900, height: 600 }
	assert.deepEqual(popoutBounds(saved, [kiosk, second], 1), saved)
	// Dragged mostly off the kiosk's screen, but its title bar is still on it.
	const edge = { x: -400, y: 900, width: 900, height: 600 }
	assert.deepEqual(popoutBounds(edge, [kiosk], 1), edge)
})

test('a remembered place on a display that has gone is not used', () => {
	// The second monitor unplugged: the window would open where no one can see it.
	const saved = { x: 2000, y: 100, width: 900, height: 600 }
	assert.equal(popoutBounds(saved, [kiosk], 1).x, (1920 - POPOUT_SIZE.width) / 2)
	// Its title bar above the top of the screen: it could not be dragged back.
	const above = { x: 100, y: -300, width: 900, height: 600 }
	assert.notDeepEqual(popoutBounds(above, [kiosk], 1), above)
})

test('remembered places off storage: only sane rectangles, only known views', () => {
	const good = { x: 10, y: 20, width: 900, height: 600 }
	assert.deepEqual(popoutPlacesFrom(JSON.stringify({ ma: good, arena: { x: 1 }, cue: { ...good, width: 10 }, vfx: good })), { ma: good })
	assert.deepEqual(popoutPlacesFrom(JSON.stringify({ ma: { ...good, x: 'left' } })), {})
	assert.deepEqual(popoutPlacesFrom('{'), {})
	assert.deepEqual(popoutPlacesFrom(null), {})
	assert.deepEqual(popoutPlacesFrom('[]'), {})
})

test("a pop-out page knows its view from its address; the kiosk's has none", () => {
	assert.equal(popoutViewOf('?popout=ma'), 'ma')
	assert.equal(popoutViewOf('?popout=arena'), 'arena')
	assert.equal(popoutViewOf(''), null)
	assert.equal(popoutViewOf('?popout=settings'), null)
})
