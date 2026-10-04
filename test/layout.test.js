import test from 'node:test'
import assert from 'node:assert/strict'

import {
	COLS,
	DEFAULT_LAYOUT,
	ROWS,
	addTab,
	addWindow,
	deleteLayout,
	fits,
	freeBox,
	freshId,
	homeOf,
	layoutFrom,
	layoutNameError,
	makeHome,
	placeWindow,
	removeTab,
	removeWindow,
	sameArrangement,
	saveLayout,
	savedLayoutsFrom,
	selectTab,
	shownTab,
	viewsShown,
} from '../dist/src/shared/layout.js'

const all = () => true

test('the default is the screen before windows: run order on the left third, MA on the rest', () => {
	const [left, right] = DEFAULT_LAYOUT.windows
	assert.deepEqual([left.x, left.w, left.h, left.tabs[0].view], [0, COLS / 3, ROWS, 'cue'])
	assert.deepEqual([right.x, right.w, right.h, right.tabs[0].view], [COLS / 3, (COLS * 2) / 3, ROWS, 'ma'])
	assert.deepEqual(viewsShown(DEFAULT_LAYOUT, all), ['cue', 'ma'])
})

test('a window fits inside the grid, at least 2 × 2, over no other', () => {
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0, y: 0, w: 4, h: 8 }, 'w1'), true)
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0, y: 0, w: 5, h: 8 }, 'w1'), false) // over the MA
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0, y: 0, w: 1, h: 8 }, 'w1'), false) // too thin
	assert.equal(fits(DEFAULT_LAYOUT, { x: 11, y: 0, w: 2, h: 2 }, 'w2'), false) // off the edge
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0.5, y: 0, w: 2, h: 2 }, 'w1'), false) // not on a cell
})

test('moving or resizing onto another window does nothing', () => {
	assert.equal(placeWindow(DEFAULT_LAYOUT, 'w1', { x: 2, y: 0, w: 4, h: 8 }), DEFAULT_LAYOUT)
	const narrower = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 3, h: 8 })
	assert.deepEqual(narrower.windows[0], { ...DEFAULT_LAYOUT.windows[0], w: 3 })
	const moved = placeWindow(narrower, 'w1', { x: 1, y: 0, w: 3, h: 8 })
	assert.equal(moved.windows[0].x, 1)
	assert.equal(placeWindow(DEFAULT_LAYOUT, 'nope', { x: 0, y: 0, w: 2, h: 2 }), DEFAULT_LAYOUT)
})

test('a new window takes the biggest free place, or none when the grid is full', () => {
	assert.equal(freeBox(DEFAULT_LAYOUT), null)
	assert.equal(addWindow(DEFAULT_LAYOUT, 'arena', { window: 'w3', tab: 't3' }), DEFAULT_LAYOUT)
	const room = placeWindow(DEFAULT_LAYOUT, 'w2', { x: 4, y: 0, w: 8, h: 5 })
	assert.deepEqual(freeBox(room), { x: 4, y: 5, w: 8, h: 3 })
	const three = addWindow(room, 'arena', { window: 'w3', tab: 't3' })
	assert.deepEqual(three.windows[2], { x: 4, y: 5, w: 8, h: 3, id: 'w3', tabs: [{ id: 't3', view: 'arena' }], active: 't3' })
	assert.equal(removeWindow(three, 'w3').windows.length, 2)
})

test('tabs: add shows it, select switches, remove shows the neighbour', () => {
	let l = addTab(DEFAULT_LAYOUT, 'w2', 'arena', 't3')
	assert.equal(l.windows[1].active, 't3')
	l = addTab(l, 'w2', 'clips', 't4')
	l = selectTab(l, 'w2', 't3')
	assert.equal(l.windows[1].active, 't3')
	l = removeTab(l, 'w2', 't3')
	assert.equal(l.windows[1].active, 't4')
	l = removeTab(l, 'w2', 't4')
	l = removeTab(l, 'w2', 't2')
	assert.deepEqual([l.windows[1].tabs, l.windows[1].active], [[], null])
	assert.equal(selectTab(DEFAULT_LAYOUT, 'w2', 'missing'), DEFAULT_LAYOUT)
})

test('a tab turned off is passed over, and comes back when it is on', () => {
	const l = selectTab(addTab(DEFAULT_LAYOUT, 'w2', 'arena', 't3'), 'w2', 't3')
	const arenaOff = (v) => v !== 'arena'
	assert.equal(shownTab(l.windows[1], arenaOff).view, 'ma')
	assert.equal(l.windows[1].active, 't3') // still remembered
	assert.equal(shownTab(l.windows[1], all).view, 'arena')
	assert.equal(shownTab(l.windows[1], () => false), null)
})

test('the MA is drawn in one tab: the first showing it, unless moved', () => {
	let l = placeWindow(DEFAULT_LAYOUT, 'w2', { x: 4, y: 0, w: 8, h: 4 })
	l = addWindow(l, 'ma', { window: 'w3', tab: 't3' })
	assert.equal(homeOf(l, 'ma', all), 't2')
	l = makeHome(l, 'ma', 't3')
	assert.equal(homeOf(l, 'ma', all), 't3')
	// The chosen tab not showing: the MA goes back to the one that is.
	l = selectTab(addTab(l, 'w3', 'arena', 't4'), 'w3', 't4')
	assert.equal(homeOf(l, 'ma', all), 't2')
	assert.equal(homeOf(l, 'cue', (v) => v !== 'cue'), null)
})

test('a stored layout holds, or is the default', () => {
	const l = addTab(DEFAULT_LAYOUT, 'w1', 'embed:abc123', 't9')
	assert.deepEqual(layoutFrom(JSON.stringify(l)), l)
	assert.deepEqual(layoutFrom(l), l)
	const overlapping = { windows: [DEFAULT_LAYOUT.windows[0], { ...DEFAULT_LAYOUT.windows[1], x: 3 }] }
	const twice = { windows: [DEFAULT_LAYOUT.windows[0], { ...DEFAULT_LAYOUT.windows[1], id: 'w1' }] }
	const badView = { windows: [{ ...DEFAULT_LAYOUT.windows[0], tabs: [{ id: 't1', view: 'brief' }] }] }
	for (const bad of [null, 'not json', '[]', '{"windows":3}', overlapping, twice, badView]) {
		assert.deepEqual(layoutFrom(typeof bad === 'string' || bad === null ? bad : JSON.stringify(bad)), DEFAULT_LAYOUT, JSON.stringify(bad))
	}
	// A home naming a tab that is not there is dropped, not trusted.
	assert.deepEqual(layoutFrom({ ...DEFAULT_LAYOUT, homes: { ma: 'gone', cue: 't1' } }).homes, { cue: 't1' })
	// An active tab that is not there falls to the first.
	assert.equal(layoutFrom({ windows: [{ ...DEFAULT_LAYOUT.windows[0], active: 'zz' }] }).windows[0].active, 't1')
})

test('the slots layout from before the grid becomes two windows holding the same', () => {
	const l = layoutFrom('{"left":"arena","right":"ma"}')
	assert.deepEqual(
		l.windows.map((w) => [w.x, w.w, w.tabs[0].view]),
		[
			[0, 4, 'arena'],
			[4, 8, 'ma'],
		],
	)
	assert.deepEqual(layoutFrom('{"left":"ma","right":"ma"}'), DEFAULT_LAYOUT)
})

test('fresh ids are unused', () => {
	let n = 0
	const seq = [0.5, 0.5, 0.25]
	const id = freshId(DEFAULT_LAYOUT, 't', () => seq[n++])
	assert.match(id, /^t[a-z0-9]+$/)
	const taken = addTab(DEFAULT_LAYOUT, 'w1', 'arena', id)
	n = 0
	assert.notEqual(freshId(taken, 't', () => seq[n++]), id)
})

test('saved layouts: save, replace by name, delete, and a full list', () => {
	const wide = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 3, h: 8 })
	let saved = saveLayout([], ' Sunday ', DEFAULT_LAYOUT)
	assert.deepEqual(saved.map((s) => s.name), ['Sunday'])
	saved = saveLayout(saved, 'sunday', wide)
	assert.deepEqual(saved, [{ name: 'sunday', layout: wide }])
	saved = deleteLayout(saved, 'sunday')
	assert.deepEqual(saved, [])
	let full = []
	for (let i = 0; i < 12; i++) full = saveLayout(full, `L${i}`, DEFAULT_LAYOUT)
	assert.equal(saveLayout(full, 'one more', DEFAULT_LAYOUT), null)
	assert.equal(saveLayout(full, 'L3', wide)[3].layout, wide)
	assert.equal(layoutNameError(''), 'A name is needed.')
	assert.equal(layoutNameError('x'.repeat(25)), 'At most 24 characters.')
})

test('the same arrangement, whichever tab shows', () => {
	const two = addTab(DEFAULT_LAYOUT, 'w2', 'arena', 't3')
	assert.equal(sameArrangement(two, selectTab(two, 'w2', 't2')), true)
	assert.equal(sameArrangement(two, DEFAULT_LAYOUT), false)
	assert.equal(sameArrangement(DEFAULT_LAYOUT, placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 3, h: 8 })), false)
})

test('saved layouts off storage: a broken one is dropped, the rest kept', () => {
	const good = { name: 'Sunday', layout: DEFAULT_LAYOUT }
	const broken = { name: 'Broken', layout: { windows: [{ id: 'w1', x: 0, y: 0, w: 99, h: 8, tabs: [], active: null }] } }
	assert.deepEqual(savedLayoutsFrom(JSON.stringify([good, broken, { name: '', layout: DEFAULT_LAYOUT }, good])), [good])
	for (const bad of [null, 'x', '{}']) assert.deepEqual(savedLayoutsFrom(bad), [])
})
