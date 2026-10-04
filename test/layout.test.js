import test from 'node:test'
import assert from 'node:assert/strict'

import {
	DEFAULT_LAYOUT,
	HEIGHT,
	MOVE,
	WIDTH,
	addTab,
	addWindow,
	deleteLayout,
	dragBox,
	fits,
	freeBox,
	freshId,
	homeOf,
	layoutFrom,
	layoutNameError,
	makeHome,
	moveSeam,
	placeWindow,
	removeTab,
	moveTab,
	removeWindow,
	sameArrangement,
	saveLayout,
	savedLayoutsFrom,
	seamRange,
	seams,
	selectTab,
	shownTab,
	viewsShown,
} from '../dist/src/shared/layout.js'

const all = () => true

test('the default is the screen before windows: run order on the left third, MA on the rest', () => {
	const [left, right] = DEFAULT_LAYOUT.windows
	assert.deepEqual([left.x, left.w, left.h, left.tabs[0].view], [0, WIDTH / 3, HEIGHT, 'cue'])
	assert.deepEqual([right.x, right.w, right.h, right.tabs[0].view], [WIDTH / 3, (WIDTH * 2) / 3, HEIGHT, 'ma'])
	assert.deepEqual(viewsShown(DEFAULT_LAYOUT, all), ['cue', 'ma'])
})

test('a window fits on the screen, at least the smallest, over no other', () => {
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0, y: 0, w: 400, h: 800 }, 'w1'), true)
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0, y: 0, w: 401, h: 800 }, 'w1'), false) // over the MA, by a unit
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0, y: 0, w: 149, h: 800 }, 'w1'), false) // too thin
	assert.equal(fits(DEFAULT_LAYOUT, { x: 1100, y: 0, w: 200, h: 200 }, 'w2'), false) // off the edge
	assert.equal(fits(DEFAULT_LAYOUT, { x: 37, y: 0, w: 213, h: 200 }, 'w1'), true) // anywhere, any size
	assert.equal(fits(DEFAULT_LAYOUT, { x: 0.5, y: 0, w: 200, h: 200 }, 'w1'), false) // whole units only
})

test('a drag follows the finger, and an edge near another snaps onto it', () => {
	const run = DEFAULT_LAYOUT.windows[0]
	const tol = { x: 10, y: 10 }
	// The run order's right edge pulled in by 37 units: exactly that.
	assert.deepEqual(dragBox(DEFAULT_LAYOUT, 'w1', run, { l: false, r: true, t: false, b: false }, -37, 0, tol), { x: 0, y: 0, w: 363, h: 800 })
	// A short window beside a tall one: its bottom 6 units off the screen's edge snaps to it.
	let l = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 400, h: 500 })
	const short = l.windows[0]
	assert.deepEqual(dragBox(l, 'w1', short, { l: false, r: false, t: false, b: true }, 0, 294, tol), { x: 0, y: 0, w: 400, h: 800 })
	assert.deepEqual(dragBox(l, 'w1', short, { l: false, r: false, t: false, b: true }, 0, 200, tol), { x: 0, y: 0, w: 400, h: 700 })
	// A moved window lines its nearer edge up: right edge 4 units short of the MA's left.
	l = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 200, h: 400 })
	assert.deepEqual(dragBox(l, 'w1', l.windows[0], MOVE, 196, 7, tol), { x: 200, y: 0, w: 200, h: 400 })
})

test('a resized edge stops flush against a window in its way; a move over one is refused', () => {
	const run = DEFAULT_LAYOUT.windows[0]
	const right = { l: false, r: true, t: false, b: false }
	const box = dragBox(DEFAULT_LAYOUT, 'w1', run, right, 300, 0, { x: 10, y: 10 })
	assert.deepEqual(box, { x: 0, y: 0, w: 400, h: 800 })
	// Room made, then a corner dragged down and right into the MA.
	const l = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 300, h: 400 })
	const corner = dragBox(l, 'w1', l.windows[0], { l: false, r: true, t: false, b: true }, 250, 250, { x: 0, y: 0 })
	assert.deepEqual(corner, { x: 0, y: 0, w: 400, h: 650 })
	assert.equal(fits(l, corner, 'w1'), true)
	const moved = dragBox(l, 'w1', l.windows[0], MOVE, 200, 0, { x: 0, y: 0 })
	assert.equal(fits(l, moved, 'w1'), false)
})

test('moving or resizing onto another window does nothing', () => {
	assert.equal(placeWindow(DEFAULT_LAYOUT, 'w1', { x: 200, y: 0, w: 400, h: 800 }), DEFAULT_LAYOUT)
	const narrower = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 300, h: 800 })
	assert.deepEqual(narrower.windows[0], { ...DEFAULT_LAYOUT.windows[0], w: 300 })
	const moved = placeWindow(narrower, 'w1', { x: 100, y: 0, w: 300, h: 800 })
	assert.equal(moved.windows[0].x, 100)
	assert.equal(placeWindow(DEFAULT_LAYOUT, 'nope', { x: 0, y: 0, w: 200, h: 200 }), DEFAULT_LAYOUT)
})

test('a new window takes the biggest free place, or none when the screen is full', () => {
	assert.equal(freeBox(DEFAULT_LAYOUT), null)
	assert.equal(addWindow(DEFAULT_LAYOUT, 'arena', { window: 'w3', tab: 't3' }), DEFAULT_LAYOUT)
	const room = placeWindow(DEFAULT_LAYOUT, 'w2', { x: 400, y: 0, w: 800, h: 500 })
	assert.deepEqual(freeBox(room), { x: 400, y: 500, w: 800, h: 300 })
	const three = addWindow(room, 'arena', { window: 'w3', tab: 't3' })
	assert.deepEqual(three.windows[2], { x: 400, y: 500, w: 800, h: 300, id: 'w3', tabs: [{ id: 't3', view: 'arena' }], active: 't3' })
	assert.equal(removeWindow(three, 'w3').windows.length, 2)
	// Free places are found between edges anywhere, not on cells.
	const odd = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 237, h: 613 })
	assert.deepEqual(freeBox(odd), { x: 237, y: 0, w: 163, h: 800 }) // 163 × 800 beats 400 × 187 below
	assert.deepEqual(freeBox(placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 260, h: 800 })), null) // 140 wide: too thin
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
	let l = placeWindow(DEFAULT_LAYOUT, 'w2', { x: 400, y: 0, w: 800, h: 400 })
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
	const overlapping = { windows: [DEFAULT_LAYOUT.windows[0], { ...DEFAULT_LAYOUT.windows[1], x: 300 }], v: 2 }
	const twice = { windows: [DEFAULT_LAYOUT.windows[0], { ...DEFAULT_LAYOUT.windows[1], id: 'w1' }], v: 2 }
	const badView = { windows: [{ ...DEFAULT_LAYOUT.windows[0], tabs: [{ id: 't1', view: 'brief' }] }], v: 2 }
	for (const bad of [null, 'not json', '[]', '{"windows":3}', overlapping, twice, badView]) {
		assert.deepEqual(layoutFrom(typeof bad === 'string' || bad === null ? bad : JSON.stringify(bad)), DEFAULT_LAYOUT, JSON.stringify(bad))
	}
	// A home naming a tab that is not there is dropped, not trusted.
	assert.deepEqual(layoutFrom({ ...DEFAULT_LAYOUT, homes: { ma: 'gone', cue: 't1' } }).homes, { cue: 't1' })
	// An active tab that is not there falls to the first.
	assert.equal(layoutFrom({ windows: [{ ...DEFAULT_LAYOUT.windows[0], active: 'zz' }], v: 2 }).windows[0].active, 't1')
})

test('a grid layout (cells, no v) comes back in units, each window where it was', () => {
	const grid = {
		windows: [
			{ id: 'w1', x: 0, y: 0, w: 3, h: 8, tabs: [{ id: 't1', view: 'cue' }], active: 't1' },
			{ id: 'w2', x: 3, y: 0, w: 9, h: 5, tabs: [{ id: 't2', view: 'ma' }], active: 't2' },
			{ id: 'w3', x: 3, y: 5, w: 9, h: 3, tabs: [{ id: 't3', view: 'arena' }], active: 't3' },
		],
		homes: { ma: 't2' },
	}
	const l = layoutFrom(JSON.stringify(grid))
	assert.deepEqual(l.windows.map((w) => [w.x, w.y, w.w, w.h]), [
		[0, 0, 300, 800],
		[300, 0, 900, 500],
		[300, 500, 900, 300],
	])
	assert.deepEqual([l.homes, l.v], [{ ma: 't2' }, 2])
	// A grid layout's place was whole cells.
	assert.deepEqual(layoutFrom({ windows: [{ ...grid.windows[0], w: 2.5 }] }), DEFAULT_LAYOUT)
	// And saved layouts come across the same way.
	assert.deepEqual(savedLayoutsFrom(JSON.stringify([{ name: 'Old', layout: grid }]))[0].layout, l)
})

test('the slots layout from before the grid becomes two windows holding the same', () => {
	const l = layoutFrom('{"left":"arena","right":"ma"}')
	assert.deepEqual(
		l.windows.map((w) => [w.x, w.w, w.tabs[0].view]),
		[
			[0, 400, 'arena'],
			[400, 800, 'ma'],
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
	const wide = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 300, h: 800 })
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
	assert.equal(sameArrangement(DEFAULT_LAYOUT, placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 300, h: 800 })), false)
})

test('saved layouts off storage: a broken one is dropped, the rest kept', () => {
	const good = { name: 'Sunday', layout: DEFAULT_LAYOUT }
	const broken = { name: 'Broken', layout: { windows: [{ id: 'w1', x: 0, y: 0, w: 99, h: 8, tabs: [], active: null }] } }
	assert.deepEqual(savedLayoutsFrom(JSON.stringify([good, broken, { name: '', layout: DEFAULT_LAYOUT }, good])), [good])
	for (const bad of [null, 'x', '{}']) assert.deepEqual(savedLayoutsFrom(bad), [])
})

test('the seam between the default windows drags both, and stops at the smallest', () => {
	const [seam] = seams(DEFAULT_LAYOUT)
	assert.deepEqual(seam, { axis: 'x', at: 400, from: 0, to: 800, before: ['w1'], after: ['w2'] })
	const wider = moveSeam(DEFAULT_LAYOUT, seam, 613.4)
	assert.deepEqual(wider.windows.map((w) => [w.x, w.w]), [
		[0, 613],
		[613, 587],
	])
	assert.deepEqual(seamRange(DEFAULT_LAYOUT, seam), { lo: 150, hi: 1050 })
	// A fast drag past the limit lands on it.
	assert.deepEqual(moveSeam(DEFAULT_LAYOUT, seam, 20).windows.map((w) => w.w), [150, 1050])
	assert.deepEqual(moveSeam(DEFAULT_LAYOUT, seam, 1190).windows.map((w) => w.w), [1050, 150])
	assert.equal(moveSeam(DEFAULT_LAYOUT, seam, 400), DEFAULT_LAYOUT)
})

test('windows on one line move together; a stacked pair has a seam of its own', () => {
	let l = placeWindow(DEFAULT_LAYOUT, 'w2', { x: 400, y: 0, w: 800, h: 500 })
	l = addWindow(l, 'arena', { window: 'w3', tab: 't3' }) // 400,500 800×300, under the MA
	const all = seams(l)
	const upright = all.find((s) => s.axis === 'x')
	assert.deepEqual([upright.before, upright.after.sort()], [['w1'], ['w2', 'w3']])
	const level = all.find((s) => s.axis === 'y')
	assert.deepEqual([level.at, level.from, level.to, level.before, level.after], [500, 400, 1200, ['w2'], ['w3']])
	const moved = moveSeam(l, upright, 300)
	assert.deepEqual(moved.windows.map((w) => [w.x, w.w]), [
		[0, 300],
		[300, 900],
		[300, 900],
	])
	assert.deepEqual(moveSeam(l, level, 600).windows.map((w) => [w.y, w.h]), [
		[0, 800],
		[0, 600],
		[600, 200],
	])
	assert.deepEqual(moveSeam(l, level, 790).windows.map((w) => w.h), [800, 700, 100]) // Arena at its smallest
})

test('a seam never runs a window into one that is not on it', () => {
	// Run order 0–300, a gap, MA 400–1200: no seam at 300 or 400.
	const gap = placeWindow(DEFAULT_LAYOUT, 'w1', { x: 0, y: 0, w: 300, h: 800 })
	assert.deepEqual(seams(gap), [])
	// The MA above Arena, which starts 200 in from the MA's left: the run
	// order grows into the MA only as far as Arena's left edge.
	let l = placeWindow(DEFAULT_LAYOUT, 'w2', { x: 400, y: 0, w: 800, h: 500 })
	l = { ...l, windows: [...l.windows, { id: 'w3', x: 600, y: 500, w: 600, h: 300, tabs: [], active: null }] }
	const [upright] = seams(l).filter((s) => s.axis === 'x' && s.at === 400)
	assert.deepEqual([upright.before, upright.after], [['w1'], ['w2']])
	assert.deepEqual(seamRange(l, upright), { lo: 150, hi: 600 }) // stops at Arena's left
	assert.deepEqual(moveSeam(l, upright, 900).windows.map((w) => [w.x, w.w]), [
		[0, 600],
		[600, 600],
		[600, 600],
	])
})

test('a tab is dragged within its window or to another, keeping its id, shown where it lands', () => {
	let l = addTab(DEFAULT_LAYOUT, 'w2', 'arena', 't3')
	l = addTab(l, 'w2', 'clips', 't4')
	const ids = (w) => l.windows.find((x) => x.id === w).tabs.map((t) => t.id)
	const before = ids('w2')
	l = moveTab(l, 'w2', 't4', 'w2', before[0])
	assert.deepEqual(ids('w2'), ['t4', ...before.filter((t) => t !== 't4')])
	l = moveTab(l, 'w2', 't4', 'w1', null)
	assert.equal(ids('w1').at(-1), 't4')
	assert.equal(l.windows.find((w) => w.id === 'w1').active, 't4')
	assert.ok(!ids('w2').includes('t4'))
	assert.notEqual(l.windows.find((w) => w.id === 'w2').active, 't4')
	// Nowhere real: nothing changes.
	assert.equal(moveTab(l, 'w2', 'nope', 'w1', null), l)
	assert.equal(moveTab(l, 'w1', 't4', 'w9', null), l)
	assert.equal(moveTab(l, 'w1', 't4', 'w1', 't4'), l)
	assert.equal(moveTab(l, 'w1', 't4', 'w1', null), l)
})
