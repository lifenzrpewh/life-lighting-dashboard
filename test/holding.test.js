import test from 'node:test'
import assert from 'node:assert/strict'

import { sameKey } from '../dist/src/shared/media-check.js'
import {
	clipsToUpdate,
	codesOn,
	holdingLayers,
	likeness,
	nameWords,
	placementWords,
	planPlacements,
	reserved,
	slotMark,
	updatePlan,
} from '../dist/src/shared/holding.js'

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

test('the words of a name leave out the code, Sunday, versions, months and campuses', () => {
	assert.deepEqual([...nameWords('CF464-Sunday-EXP-NextStepsLounge')], ['next', 'steps', 'lounge'])
	assert.deepEqual([...nameWords('CF594-Sunday-AllCampus-Prayer-Fasting-Oct-1.png')], ['prayer', 'fasting'])
	assert.equal(likeness('CF594-Sunday-AllCampus-Prayer-Fasting-Oct-1', 'CF593-Sunday-Prayer&Fasting-Oct'), 1)
	assert.equal(likeness('CF562-Sunday-Alpha', 'CF446-Sunday-NextStepsUpstairs'), 0)
})

test('the holding layers, top first, PLAYBACK last; a column named for something else is never placed into', () => {
	const s = composition()
	assert.deepEqual(holdingLayers(s).map((l) => l.name), ['HOLD FG', 'HOLD BG', 'PRE & POST', 'PLAYBACK'])
	const [, bg, , fg] = s.layers
	assert.equal(reserved(fg, 3, s), true) // COUNTDOWN, on every layer
	assert.equal(reserved(bg, 4, s), true) // VIDEO BG
	assert.equal(reserved(fg, 5, s), false)
	const plain = composition(NAMES.map(() => 'Column #'))
	assert.equal(reserved(plain.layers[1], 3, plain), true)
	assert.equal(reserved(plain.layers[3], 3, plain), false)
})

test("each clip's mark against today's run sheet", () => {
	const s = composition()
	const today = codesOn(ITEMS)
	const [pre, bg, , fg] = s.layers
	const mark = (slot, marks = new Set()) => slotMark(slot, ITEMS, today, marks)
	assert.equal(mark(pre.slots[0]), 'today')
	assert.equal(mark(pre.slots[1]), 'not-today')
	assert.equal(mark(pre.slots[2]), 'empty')
	assert.equal(mark(bg.slots[0]), 'may-differ')
	assert.equal(mark(bg.slots[0], new Set([sameKey('CB095', bg.slots[0].file, 'CB095-Sunday-RelationshipSeries-v5')])), 'confirmed')
	assert.equal(mark(fg.slots[9]), 'not-today')
})

test('Doors Open goes in PRE and End in POST, on every layer; a code both use goes in both', () => {
	const s = composition()
	const { placements } = planPlacements(ITEMS, s)
	// Doors Open is all in PRE already: nothing to place.
	assert.equal(placements.filter((p) => p.label === 'Walk In').length, 0)
	// End: CF588 into HOLD FG · POST although it is in PRE; CA636 replaces the old Post A-screen.
	const end588 = at(placements, 'Walk Out', 'CF588')
	assert.equal(end588.layer, 'HOLD FG')
	assert.equal(end588.columnName, 'POST')
	assert.equal(end588.column, 2)
	const end636 = at(placements, 'Walk Out', 'CA636')
	assert.equal(end636.layer, 'PRE & POST')
	assert.equal(end636.column, 2)
	assert.equal(end636.replaces.code, 'CA600')
	assert.match(placementWords(end636), /^PRE & POST · POST \(column 2\), replacing CA600/)
	// CB095 is in POST's background already.
	assert.equal(at(placements, 'Walk Out', 'CB095'), undefined)
})

test('WTL, NSL, BIBLES and WTG go in their own columns by label, replacing what is there', () => {
	const { placements } = planPlacements(ITEMS, composition())
	assert.equal(at(placements, 'WTL', 'CF445'), undefined) // already in WTL
	const nsl = at(placements, 'NSL', 'CF465')
	assert.equal(nsl.columnName, 'NSL')
	assert.equal(nsl.replaces.code, 'CF446')
	assert.equal(at(placements, 'WTG', 'CF546').columnName, 'WTG')
	const bibles = at(placements, 'Bibles', 'CF449')
	assert.equal(bibles.columnName, 'BIBLES')
	assert.equal(bibles.replaces, null)
	// The BIBLES and WTG columns have no background yet: CB095 goes in too.
	assert.equal(at(placements, 'Bibles', 'CB095').layer, 'HOLD BG')
})

test('announcements go in PROMO columns: an older version first, then last week, then empty; never two in one', () => {
	const { placements } = planPlacements(ITEMS, composition())
	const prayer = at(placements, 'Prayer & Fasting', 'CF594')
	assert.equal(prayer.why, 'promo-alike')
	assert.equal(prayer.column, 10)
	assert.equal(prayer.replaces.code, 'CF593')
	const alpha = at(placements, 'Alpha', 'CF562')
	assert.equal(alpha.why, 'promo-free')
	assert.equal(alpha.column, 9)
	assert.equal(alpha.replaces.code, 'CF561')
	assert.notEqual(prayer.column, alpha.column)
})

test("the names are read from the layer group's columns, the composition's only as a fallback", () => {
	// As Arena had it, 2026-10-05: the composition's columns `Column #`, HOLDING's named.
	const s = composition(NAMES.map(() => 'Column #'))
	s.groups = [
		{ name: 'HOLDING', master: 1, bypassed: false, columns: NAMES.map((n, i) => (n === 'PROMO' ? `PROMO ${i - 7}` : n)) },
		{ name: 'A SCREENS', master: 1, bypassed: false, columns: ['PRE', 'POST', '', 'Column #'] },
	]
	const { placements } = planPlacements(ITEMS, s)
	assert.equal(at(placements, 'Walk Out', 'CF588').columnName, 'POST')
	assert.equal(at(placements, 'Walk Out', 'CA636').columnName, 'POST')
	assert.equal(at(placements, 'Prayer & Fasting', 'CF594').columnName, 'PROMO 2')
	assert.equal(reserved(s.layers[3], 3, s), true)
})

test('what has no place is said, never guessed', () => {
	const { unplaced } = planPlacements(ITEMS, composition())
	const preach = unplaced.find((u) => u.code === 'CB105')
	assert.equal(preach.kind, 'no-column')
	assert.match(preach.detail, /no column named Preach BG/)

	const plain = composition(NAMES.map(() => 'Column #'))
	const r = planPlacements(ITEMS, plain)
	assert.deepEqual(r.placements, [])
	assert.ok(r.unplaced.every((u) => u.kind === 'unnamed'))
	assert.match(r.unplaced[0].detail, /name them PRE, POST, WTL, NSL, BIBLES, WTG and PROMO/)

	const noPromo = composition(NAMES.map((n) => (n === 'PROMO' ? 'Column #' : n)))
	assert.equal(planPlacements(ITEMS, noPromo).unplaced.find((u) => u.code === 'CF594').kind, 'no-promo')

	const playing = composition()
	const fg = playing.layers[3]
	fg.slots[1] = { ...fg.slots[1], state: 'playing', name: 'x', file: 'C:\\x.png' }
	const p = planPlacements(ITEMS, playing).unplaced.find((u) => u.code === 'CF588')
	assert.equal(p.kind, 'playing')
})

test('an update goes into every clip with the old file, not the confirmed or the right ones', () => {
	const s = composition()
	const bg = s.layers[1]
	const want = 'CB095-Sunday-RelationshipSeries-v5'
	assert.equal(clipsToUpdate('CB095', want, F.CB095, s, new Set()).length, 7)
	assert.deepEqual(clipsToUpdate('CB095', want, F.CB095, s, new Set([sameKey('CB095', bg.slots[0].file, want)])), [])
	// With sizes: the same bytes need nothing, whatever they are called.
	const arena = Object.fromEntries(bg.slots.filter((x) => x.file !== null).map((x) => [x.file, 42]))
	assert.deepEqual(clipsToUpdate('CB095', want, F.CB095, s, new Set(), { arena, lookbook: { [F.CB095]: 42 } }), [])
})

test('Update all: one step per code, its old clips and its missing columns together', () => {
	const s = composition()
	const marks = new Set([sameKey('CB095', s.layers[1].slots[0].file, 'CB095-Sunday-RelationshipSeries-v5')])
	const { steps, unplaced } = updatePlan(ITEMS, s, marks)
	const by = Object.fromEntries(steps.map((x) => [x.request.code, x]))
	// CB095 is confirmed, so only the columns missing it: BIBLES and WTG.
	assert.equal(by.CB095.request.clipIds.length, 2)
	assert.match(by.CF588.what, /HOLD FG · POST \(column 2\)/)
	// Each step names the lookbook's file, and never downloads unless asked at the confirmation.
	assert.equal(by.CF588.request.lookbookPath, F.CF588)
	assert.ok(steps.every((x) => x.request.allowLookbook === false))
	assert.equal(by.CF445, undefined)
	assert.ok(unplaced.some((u) => u.code === 'CB105'))
	assert.equal(new Set(steps.map((x) => x.request.code)).size, steps.length)
})
