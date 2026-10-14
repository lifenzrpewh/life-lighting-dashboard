import test from 'node:test'
import assert from 'node:assert/strict'

import {
	backgroundGaps,
	clipsToUpdate,
	fillColumns,
	fixedPlacements,
	oldForegrounds,
	planPlacements,
	reserved,
	updatePlan,
} from '../dist/src/shared/holding.js'
import {
	DEFAULT_MAP,
	defaultTakesWords,
	holdingMapFrom,
	layerOfCode,
	presetFile,
	presetFromFile,
	takesItem,
	withFamily,
	withRule,
} from '../dist/src/shared/holding-map.js'

// The owner's Central composition, 2026-10-05, with its columns named by the
// pattern (the owner: "happy to make all campuses conform"). Files under Media\AM.
const NAMES = ['PRE', 'POST', 'COUNTDOWN', 'VIDEO BG', 'WTL', 'NSL', 'BIBLES', 'WTG', 'PROMO', 'PROMO', 'PROMO', 'PROMO']
let nextId = 100
const clip = (file, state = 'loaded', missing = false) => ({
	id: nextId++,
	name: file.replace(/\.\w+$/, ''),
	state,
	thumbnail: null,
	file: `C:\\Media\\AM\\${file}`,
	missingFile: missing ? `C:\\Media\\AM\\${file}` : null,
})
const empty = () => ({ id: nextId++, name: '', state: 'empty', thumbnail: null, file: null, missingFile: null })
const row = (cells) => NAMES.map((_, i) => (cells[i] === undefined ? empty() : clip(cells[i])))
const layer = (id, name, group, slots) => ({ id, name, group, master: 1, bypassed: false, playing: null, slots })
const BG = 'CB095-Sunday-RelationshipSeries.png'
// Arena's composition order: bottom layer first.
const composition = (names = NAMES) => ({
	master: 1,
	deck: 'AM',
	groups: [],
	columns: names.map((name, i) => ({ id: 900 + i, name, state: 'loaded' })),
	layers: [
		layer(1, 'PRE & POST', 'A SCREENS', row({ 0: 'CA635-Sunday-Relationship-WalkIn.jpg', 1: 'CA600-Old-WalkOut.jpg' })),
		layer(2, 'HOLD BG', 'HOLDING', row({ 0: BG, 1: BG, 2: 'CB105-Sunday-ReloSeries-Preach.png', 4: BG, 5: BG, 8: BG, 9: BG, 10: BG })),
		layer(3, 'PLAYBACK', 'HOLDING', row({ 5: 'CF447-Sunday-NextStepsLounge.png' })),
		layer(4, 'HOLD FG', 'HOLDING', row({
			0: 'CF588-Sunday-ReloSeries-WalkInV2.png',
			4: 'CF445-Sunday-WelcometoLIFE.png',
			5: 'CF446-Sunday-NextStepsUpstairs.png',
			8: 'CF561-Sunday-UpdateDetails.png',
			9: 'CF593-Sunday-Prayer&Fasting-Oct.png',
		})),
		layer(5, 'VFX 1', 'VFX', [empty()]),
	],
})

const item = (title, label, codes, files) => ({ title, label, codes, files, missingCodes: [] })
const L = (name) => `/storage/library/C/${name}_1789627559514.png`
const F = {
	CB095: L('CB095-Sunday-RelationshipSeries-v5'),
	CF588: L('CF588-Sunday-ReloSeries-WalkInV2'),
	CA635: L('CA635-Sunday-Relationship-WalkIn'),
	CA636: L('CA636-Sunday-Relationship-WalkOut'),
	CF445: L('CF445-Sunday-WelcometoLIFE'),
	CF465: L('CF465-Sunday-EXP-NextStepsUpstairs'),
	CF546: L('CF546-Sunday-WaystoGive-Updated'),
	CF594: L('CF594-Sunday-AllCampus-Prayer-Fasting-Oct-1'),
	CF562: L('CF562-Sunday-Alpha'),
	CF449: L('CF449-Sunday-Bibles'),
	CB105: L('CB105-Sunday-ReloSeries-Preach'),
}
const pick = (...codes) => Object.fromEntries(codes.filter((c) => F[c]).map((c) => [c, F[c]]))
// Central PM, 4 October, as the lookbook gave it (plus Alpha and the preach BG).
const ITEMS = [
	item('Doors Open', 'Walk In', ['CB095', 'CF588', 'CA635'], pick('CB095', 'CF588', 'CA635')),
	item('Welcome', 'WTL', ['CB095', 'CF445', 'CT108'], pick('CB095', 'CF445')),
	item('Welcome', 'NSL', ['CB095', 'CF465', 'CT003'], pick('CB095', 'CF465')),
	item('Welcome', 'WTG', ['CB095', 'CF546', 'CT109'], pick('CB095', 'CF546')),
	item('Announcement', 'Prayer & Fasting', ['CB095', 'CF594', 'CT290'], pick('CB095', 'CF594')),
	item('EOS Announcements', 'Alpha', ['CB095', 'CF562'], pick('CB095', 'CF562')),
	item('EOS Announcements', 'Bibles', ['CB095', 'CF449', 'CT110'], pick('CB095', 'CF449')),
	item('Message (Incl. Altar Call)', 'Preach BG', ['CB105'], pick('CB105')),
	item('End', 'Walk Out', ['CB095', 'CF588', 'CA636'], pick('CB095', 'CF588', 'CA636')),
]
const at = (placements, label, code) => placements.find((p) => (p.label ?? p.title) === label && p.code === code)
const cells = (cells) => (rule) => ({ ...rule, cells: { ...rule.cells, ...cells } })

test('an empty map is the default rules, exactly', () => {
	const s = composition()
	assert.deepEqual(planPlacements(ITEMS, s, DEFAULT_MAP), planPlacements(ITEMS, s))
	assert.deepEqual(updatePlan(ITEMS, s, new Set(), undefined, DEFAULT_MAP), updatePlan(ITEMS, s, new Set()))
	assert.deepEqual(oldForegrounds(ITEMS, s, new Set(), DEFAULT_MAP), oldForegrounds(ITEMS, s))
})

test("a column's own words take the items they name, and its default stops", () => {
	const s = composition()
	const map = withRule(DEFAULT_MAP, 'WTG', (r) => ({ ...r, takes: ['Alpha'] }))
	const { placements, unplaced } = planPlacements(ITEMS, s, map)
	const alpha = at(placements, 'Alpha', 'CF562')
	assert.equal(alpha.columnName, 'WTG')
	assert.equal(alpha.column, 8)
	// The item labelled WTG no longer has WTG: it is a one-off now, and queues
	// from PROMO 1 with the announcements (the owner, 2026-10-13).
	assert.equal(at(placements, 'WTG', 'CF546')?.columnName === 'WTG', false)
	assert.equal(at(placements, 'WTG', 'CF546').why, 'promo')
	assert.equal(unplaced.some((u) => u.label === 'WTG'), false)
})

test('words match the whole label, or as whole words anywhere in the title and label', () => {
	assert.equal(takesItem(['walk in'], { title: 'Doors Open', label: 'Walk In' }), true)
	assert.equal(takesItem(['WTL'], { title: 'Welcome', label: 'wtl' }), true)
	assert.equal(takesItem(['Alpha'], { title: 'EOS Announcements', label: 'Alpha Course' }), true)
	assert.equal(takesItem(['Alpha'], { title: 'Welcome', label: 'WTL' }), false)
	assert.equal(takesItem([], { title: 'Welcome', label: 'WTL' }), false)
	// Whole words: Pre is not in Preach, nor End in Weekend.
	assert.equal(takesItem(['Pre'], { title: 'Message', label: 'Preach BG' }), false)
	assert.equal(takesItem(['End'], { title: 'Weekend Away', label: null }), false)
	assert.equal(takesItem(['End'], { title: 'End', label: 'Walk Out' }), true)
	assert.equal(takesItem(['prayer & fasting'], { title: 'Announcement', label: 'Prayer & Fasting' }), true)
	assert.equal(takesItem(['(x'], { title: 'a (x b', label: null }), true)
})

test("a column's default, said: a video column is never a PROMO's", () => {
	assert.equal(defaultTakesWords('Promo 3'), 'Announcements, promos')
	assert.equal(defaultTakesWords('PROMO VIDEO'), 'Nothing')
	assert.equal(defaultTakesWords('Countdown'), 'Nothing')
	assert.equal(defaultTakesWords('WTL'), 'The item labelled WTL')
})

test('left alone: nothing placed, updated or cleared there', () => {
	const s = composition()
	const map = withRule(DEFAULT_MAP, 'PROMO', cells({ F: { kind: 'leave' } }))
	const fg = s.layers[3]
	const { placements } = planPlacements(ITEMS, s, map)
	assert.equal(placements.some((p) => p.layer === 'HOLD FG' && p.columnName === 'PROMO'), false)
	assert.equal(reserved(fg, 9, s, map), true)
	// CF593 in PROMO (column 10) is not this run sheet's: by default it is an old foreground.
	assert.ok(oldForegrounds(ITEMS, s).some((o) => o.column === 10))
	assert.equal(oldForegrounds(ITEMS, s, new Set(), map).some((o) => o.column === 10), false)
	// An older CF561 in a left-alone PROMO is not updated either.
	assert.ok(clipsToUpdate('CF561', 'CF561-new', '/storage/library/C/CF561-new_1.png', s, new Set()).length > 0)
	assert.equal(clipsToUpdate('CF561', 'CF561-new', '/storage/library/C/CF561-new_1.png', s, new Set(), undefined, map).length, 0)
})

test('the normal background where the map says, even over an item; none where it says the item only', () => {
	const s = composition()
	assert.equal(fillColumns(ITEMS, s).includes(5), false) // WTL's item has its own background
	const normal = withRule(DEFAULT_MAP, 'WTL', cells({ B: { kind: 'normal' } }))
	assert.equal(fillColumns(ITEMS, s, normal).includes(5), true)
	assert.equal(planPlacements(ITEMS, s, normal).placements.some((p) => p.layer === 'HOLD BG' && p.column === 5 && p.why !== 'fill'), false)
	const only = withRule(DEFAULT_MAP, 'PROMO', cells({ B: { kind: 'item' } }))
	assert.ok(fillColumns(ITEMS, s).some((c) => c >= 9))
	assert.equal(fillColumns(ITEMS, s, only).some((c) => c >= 9), false)
	assert.equal(backgroundGaps(ITEMS, s, only).some((p) => p.column >= 9), false)
})

test('a fixed code goes where the map puts it, is never an old foreground, and has its own step', () => {
	const s = composition()
	const map = withRule(DEFAULT_MAP, 'NSL', cells({ F: { kind: 'fixed', code: 'NF300' } }))
	const fixed = fixedPlacements(ITEMS, s, map)
	assert.equal(fixed.length, 1)
	assert.equal(fixed[0].column, 6)
	assert.equal(fixed[0].layer, 'HOLD FG')
	assert.equal(fixed[0].why, 'fixed')
	assert.equal(fixed[0].want, 'NF300')
	assert.equal(fixed[0].replaces.code, 'CF446')
	// The NSL item's own foreground does not go there now.
	assert.equal(planPlacements(ITEMS, s, map).placements.some((p) => p.code === 'CF465' && p.column === 6), false)
	const steps = updatePlan(ITEMS, s, new Set(), undefined, map).steps
	const step = steps.find((st) => st.request.code === 'NF300')
	assert.ok(step)
	assert.equal(step.request.lookbookPath, null)
	assert.match(step.what, /its fixed code/)
	// Once it is there, nothing to place, and it is not cleared as old.
	const placed = composition()
	placed.layers[3].slots[5] = clip('NF300-North-Welcome.png')
	assert.equal(fixedPlacements(ITEMS, placed, map).length, 0)
	assert.equal(oldForegrounds(ITEMS, placed, new Set(), map).some((o) => o.code === 'NF300'), false)
})

test('a code family goes to the layer the map names, or nowhere', () => {
	assert.equal(layerOfCode(DEFAULT_MAP, 'CF588'), 'F')
	assert.equal(layerOfCode(DEFAULT_MAP, 'CT108'), null)
	const noCentralFg = withFamily(DEFAULT_MAP, 'CF', 'none')
	assert.equal(layerOfCode(noCentralFg, 'CF588'), null)
	assert.equal(layerOfCode(noCentralFg, 'NF588'), 'F')
	const s = composition()
	assert.equal(planPlacements(ITEMS, s, noCentralFg).placements.some((p) => p.layer === 'HOLD FG'), false)
	assert.equal(withFamily(noCentralFg, 'CF', null).families.CF, undefined)
})

test('a map from a file is taken whole or not at all', () => {
	const map = withRule(withFamily(DEFAULT_MAP, 'NB', 'B'), 'Promo 1', (r) => ({ ...r, takes: ['Alpha'], cells: { F: { kind: 'fixed', code: 'cf300' } } }))
	// A code typed in lower case is the same code; anything not a code is refused.
	assert.equal(holdingMapFrom(JSON.parse(JSON.stringify(map))).columns.PROMO1.cells.F.code, 'CF300')
	assert.equal(holdingMapFrom({ families: {}, columns: { PROMO1: { cells: { F: { kind: 'fixed', code: 'CF30' } } } } }), null)
	assert.equal(holdingMapFrom({ families: {}, columns: { PROMO1: { cells: { F: { kind: 'fixed', code: 'CF300 and more' } } } } }), null)
	const good = withRule(DEFAULT_MAP, 'Promo 1', (r) => ({ ...r, takes: ['Alpha'], cells: { F: { kind: 'fixed', code: 'CF300' } } }))
	assert.deepEqual(holdingMapFrom(JSON.parse(JSON.stringify(good))), good)
	assert.equal(holdingMapFrom({ families: { CB: 'Q' }, columns: {} }), null)
	assert.equal(holdingMapFrom({ families: {}, columns: { PROMO1: { cells: { X: { kind: 'leave' } } } } }), null)
	const back = presetFromFile(presetFile({ name: 'North', map: good }))
	assert.equal(back.ok, true)
	assert.deepEqual(back.preset, { name: 'North', map: good })
	assert.equal(presetFromFile('{"kind":"something else"}').ok, false)
	assert.equal(presetFromFile('not json').ok, false)
})

test('a rule set back to its defaults leaves nothing behind', () => {
	const set = withRule(DEFAULT_MAP, 'PRE', cells({ B: { kind: 'leave' } }))
	assert.ok(set.columns.PRE)
	const back = withRule(set, 'PRE', cells({ B: { kind: 'auto' } }))
	assert.deepEqual(back, DEFAULT_MAP)
})
