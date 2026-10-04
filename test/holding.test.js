import test from 'node:test'
import assert from 'node:assert/strict'

import { checkMedia, sameKey } from '../dist/src/shared/media-check.js'
import { clipsToUpdate, holdingLayers, likeness, nameWords, reserved, slotMark, suggestHomes, updatePlan, codesOn } from '../dist/src/shared/holding.js'

// The owner's Central composition, 2026-10-05, cut down: files under Media\AM.
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
const layer = (id, name, group, slots) => ({ id, name, group, master: 1, bypassed: false, playing: null, slots })
// Arena's composition order: bottom layer first.
const composition = () => ({
	master: 1,
	deck: 'AM',
	groups: [],
	columns: [],
	layers: [
		layer(1, 'PRE & POST', 'A SCREENS', [clip('CA635-Sunday-Relationship-WalkIn.jpg'), clip('CA600-Old-WalkOut.jpg'), empty(), empty()]),
		layer(2, 'HOLD BG', 'HOLDING', [
			clip('CB095-Sunday-RelationshipSeries.png'),
			clip('CB095-Sunday-RelationshipSeries.png'),
			clip('CB105-Sunday-ReloSeries-Preach.png'),
			empty(),
			clip('CB095-Sunday-RelationshipSeries.png'),
			empty(),
		]),
		layer(3, 'PLAYBACK', 'HOLDING', [empty(), clip('CF447-Sunday-NextStepsLounge.png'), empty()]),
		layer(4, 'HOLD FG', 'HOLDING', [
			clip('CF588-Sunday-ReloSeries-WalkInV2.png'),
			clip('CF446-Sunday-NextStepsUpstairs.png'),
			clip('CF593-Sunday-Prayer&Fasting-Oct.png'),
			empty(),
			clip('Generic Logo.png'),
		]),
		layer(5, 'VFX 1', 'VFX', [empty()]),
	],
})

const item = (title, label, codes, files) => ({ title, label, codes, files, missingCodes: [] })
const L = (name) => `/storage/library/C/${name}_1789627559514.png`
const ITEMS = [
	item('Doors Open', 'Walk In', ['CB095', 'CF588', 'CA635'], {
		CB095: L('CB095-Sunday-RelationshipSeries-v5'),
		CF588: L('CF588-Sunday-ReloSeries-WalkInV2'),
		CA635: L('CA635-Sunday-Relationship-WalkIn'),
	}),
	item('Welcome', 'NSL', ['CB095', 'CF464', 'CT003'], { CB095: L('CB095-Sunday-RelationshipSeries-v5'), CF464: L('CF464-Sunday-EXP-NextStepsLounge') }),
	item('Announcement', 'Prayer & Fasting', ['CF594'], { CF594: L('CF594-Sunday-AllCampus-Prayer-Fasting-Oct-1') }),
	item('Announcement', 'Alpha', ['CF562'], { CF562: L('CF562-Sunday-Alpha') }),
	item('End', 'Walk Out', ['CA636'], { CA636: L('CA636-Sunday-Relationship-WalkOut') }),
]

test('the words of a name leave out the code, Sunday, versions, months and campuses', () => {
	assert.deepEqual([...nameWords('CF464-Sunday-EXP-NextStepsLounge')], ['next', 'steps', 'lounge'])
	assert.deepEqual([...nameWords('CF594-Sunday-AllCampus-Prayer-Fasting-Oct-1.png')], ['prayer', 'fasting'])
	assert.equal(likeness('CF594-Sunday-AllCampus-Prayer-Fasting-Oct-1', 'CF593-Sunday-Prayer&Fasting-Oct'), 1)
	assert.equal(likeness('CF464-Sunday-EXP-NextStepsLounge', 'CF446-Sunday-NextStepsUpstairs'), 0.5)
	assert.equal(likeness('CF562-Sunday-Alpha', 'CF446-Sunday-NextStepsUpstairs'), 0)
	assert.equal(likeness('CB095', 'CB096'), 0)
})

test('the holding layers, top first, PLAYBACK last; columns 3 and 4 kept only on HOLD BG', () => {
	const s = composition()
	assert.deepEqual(holdingLayers(s).map((l) => l.name), ['HOLD FG', 'HOLD BG', 'PRE & POST', 'PLAYBACK'])
	const bg = s.layers[1]
	const fg = s.layers[3]
	assert.equal(reserved(bg, 3), true)
	assert.equal(reserved(bg, 4), true)
	assert.equal(reserved(bg, 5), false)
	assert.equal(reserved(fg, 3), false)
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
	assert.equal(mark(bg.slots[2]), 'not-today')
	assert.equal(mark(fg.slots[4]), 'no-code')
	const gone = { ...fg.slots[0], missingFile: fg.slots[0].file }
	assert.equal(mark(gone), 'missing')
})

test('homes: Post in column 2, a newer version where its old one is, then last week, then empty; never twice', () => {
	const s = composition()
	const homes = Object.fromEntries(suggestHomes(ITEMS, checkMedia(ITEMS, s), s).map((h) => [h.code, h]))
	// Walk Out replaces the old A-screen in column 2.
	assert.equal(homes.CA636.home.why, 'post')
	assert.equal(homes.CA636.home.column, 2)
	assert.equal(homes.CA636.home.replaces.code, 'CA600')
	// The lounge goes where upstairs is (alike enough), never on PLAYBACK.
	assert.equal(homes.CF464.home.layer, 'HOLD FG')
	assert.equal(homes.CF464.home.why, 'looks-like')
	assert.equal(homes.CF464.home.column, 2)
	// Prayer and fasting replaces last month's.
	assert.equal(homes.CF594.home.why, 'looks-like')
	assert.equal(homes.CF594.home.column, 3)
	// Alpha looks like nothing: no stale clip left, so the empty column.
	assert.equal(homes.CF562.home.why, 'empty')
	assert.equal(homes.CF562.home.column, 4)
	assert.equal(homes.CF562.home.replaces, null)
	// Never a clip the run sheet uses (CF588) or one with no code (the logo).
	const used = Object.values(homes).map((h) => h.home.clipId)
	assert.equal(new Set(used).size, used.length)
})

test('no home is said, never guessed: no layer, or no free column', () => {
	const s = composition()
	s.layers = s.layers.filter((l) => l.name !== 'PRE & POST')
	const homes = suggestHomes(ITEMS, checkMedia(ITEMS, s), s)
	const a = homes.find((h) => h.code === 'CA636')
	assert.equal(a.home, null)
	assert.match(a.detail, /no PRE & POST layer/)

	const full = composition()
	full.layers[3].slots = [full.layers[3].slots[0], { ...full.layers[3].slots[1], state: 'playing' }]
	const f = suggestHomes(ITEMS, checkMedia(ITEMS, full), full).filter((h) => h.code.startsWith('CF'))
	assert.ok(f.every((h) => h.home === null && /no free column on HOLD FG/.test(h.detail)))
})

test('a background never goes into HOLD BG columns 3 or 4', () => {
	const s = composition()
	const bg = s.layers[1]
	bg.slots = [clip('CB095-Sunday-RelationshipSeries.png'), empty(), empty(), empty(), empty()]
	bg.slots[1] = clip('CB095-Sunday-RelationshipSeries.png')
	const items = [item('Message', 'Preach BG', ['CB200'], { CB200: L('CB200-Sunday-Preach') }), ...ITEMS]
	const h = suggestHomes(items, checkMedia(items, s), s).find((x) => x.code === 'CB200')
	assert.equal(h.home.column, 5)
})

test('an update goes into every clip with the old file, not the confirmed or the right ones', () => {
	const s = composition()
	const bg = s.layers[1]
	const want = 'CB095-Sunday-RelationshipSeries-v5'
	const all = clipsToUpdate('CB095', want, s, new Set())
	assert.deepEqual(all, [bg.slots[0].id, bg.slots[1].id, bg.slots[4].id])
	assert.deepEqual(clipsToUpdate('CB095', want, s, new Set([sameKey('CB095', bg.slots[0].file, want)])), [])
	bg.slots[1] = { ...bg.slots[1], file: `C:\\x\\${want}.jpg`, name: want }
	assert.deepEqual(clipsToUpdate('CB095', want, s, new Set()), [bg.slots[0].id, bg.slots[4].id])
})

test('Update all: every may-differ code into all its clips, then each placed code; the homeless apart', () => {
	const s = composition()
	const { steps, homeless } = updatePlan(ITEMS, checkMedia(ITEMS, s), s, new Set())
	assert.deepEqual(
		steps.map((x) => x.request.code),
		['CB095', 'CF464', 'CF594', 'CF562', 'CA636'],
	)
	assert.equal(steps[0].request.clipIds.length, 3)
	assert.match(steps[0].what, /into its 3 clips/)
	assert.match(steps[1].what, /place .* in HOLD FG · column 2, replacing CF446/)
	assert.deepEqual(homeless, [])
	// Confirmed the same: nothing to load for CB095.
	const bg = s.layers[1]
	const marks = new Set([sameKey('CB095', bg.slots[0].file, 'CB095-Sunday-RelationshipSeries-v5')])
	const check = checkMedia(ITEMS, s, marks)
	assert.equal(updatePlan(ITEMS, check, s, marks).steps[0].request.code, 'CF464')
})
