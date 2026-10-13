import test from 'node:test'
import assert from 'node:assert/strict'

import { sameKey, thereKey, sameMarkFrom, sameMarksFrom } from '../dist/src/shared/media-check.js'
import {
	backgroundGaps,
	clipsToUpdate,
	codesOn,
	explainPlan,
	holdingLayers,
	likeness,
	lookSteps,
	looksOf,
	nameWords,
	normalBackground,
	pinTargets,
	pinsFrom,
	oldForegrounds,
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

test('the A-screen layer by its new name, A SCREEN BG (the owner, 2026-10-05), as by its old', () => {
	const s = composition()
	s.layers[0] = { ...s.layers[0], name: 'A SCREEN BG' }
	assert.deepEqual(holdingLayers(s).map((l) => l.name), ['HOLD FG', 'HOLD BG', 'A SCREEN BG', 'PLAYBACK'])
	const end636 = at(planPlacements(ITEMS, s).placements, 'Walk Out', 'CA636')
	assert.equal(end636.layer, 'A SCREEN BG')
	assert.equal(end636.column, 2)
	// Without it, an A code has nowhere to go, and says which layer it wants.
	s.layers[0] = { ...s.layers[0], name: 'SCREENS' }
	const lost = planPlacements(ITEMS, s).unplaced.find((u) => u.code === 'CA636')
	assert.match(lost.detail, /no A SCREEN BG layer/)
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

/** The fixture without CB105 on HOLD BG, so Preach BG is a one-off not yet placed. */
const withoutPreach = () => {
	const s = composition()
	s.layers[1].slots[2] = empty()
	return s
}

test('what has no place is said, never guessed', () => {
	const { unplaced } = planPlacements(ITEMS, withoutPreach())
	const preach = unplaced.find((u) => u.code === 'CB105')
	assert.equal(preach.kind, 'no-column')
	assert.match(preach.detail, /no column named Preach BG/)

	const plain = composition(NAMES.map(() => 'Column #'))
	const r = planPlacements(ITEMS, plain)
	assert.deepEqual(r.placements, [])
	assert.ok(r.unplaced.every((u) => u.kind === 'unnamed'))
	assert.match(r.unplaced[0].detail, /name them PRE, POST, WTL, NSL, BIBLES, WTG and PROMO/)

	// No PROMO columns: the announcements overflow into HOLD FG's empty clips
	// past WTG (the owner, 2026-10-08), and, with none empty, are said.
	const noPromo = composition(NAMES.map((n) => (n === 'PROMO' ? 'Column #' : n)))
	assert.deepEqual(
		planPlacements(ITEMS, noPromo).placements.filter((x) => x.why === 'overflow').map((x) => [x.layer, x.code, x.column]),
		// Each one's background follows into its column (the owner, 2026-10-13);
		// column 11's HOLD BG holds CB095 already.
		[['HOLD FG', 'CF594', 11], ['HOLD FG', 'CF562', 12], ['HOLD BG', 'CB095', 12]],
	)
	noPromo.layers[3].slots[10] = clip('CF001-Other.png')
	noPromo.layers[3].slots[11] = clip('CF002-Other.png')
	const full = planPlacements(ITEMS, noPromo).unplaced.find((u) => u.code === 'CF594')
	assert.equal(full.kind, 'no-promo')
	assert.equal(full.didntFit, true)

	const playing = composition()
	const fg = playing.layers[3]
	fg.slots[1] = { ...fg.slots[1], state: 'playing', name: 'x', file: 'C:\\x.png' }
	// On screen is not refused here: the placement is marked live, and the
	// confirmation asks about it apart (the owner, 2026-10-05).
	const p = planPlacements(ITEMS, playing).placements.find((x) => x.code === 'CF588' && x.column === 2)
	assert.equal(p.live, true)
	assert.equal(at(planPlacements(ITEMS, composition()).placements, 'Walk Out', 'CF588').live, false)
})

test('a one-off is placed by hand: once its code is on its layer, anywhere, it is done', () => {
	// The fixture has an older CB105 in HOLD BG column 3: placed (Update's to freshen).
	assert.equal(planPlacements(ITEMS, composition()).unplaced.some((u) => u.code === 'CB105'), false)
	const s = withoutPreach()
	assert.ok(planPlacements(ITEMS, s).unplaced.some((u) => u.code === 'CB105'))
	const bg = s.layers[1]
	bg.slots[11] = clip('CB105-Sunday-ReloSeries-PreachV2.jpg')
	assert.equal(planPlacements(ITEMS, s).unplaced.some((u) => u.code === 'CB105'), false)
	// On another layer it is not placed.
	bg.slots[11] = empty()
	s.layers[3].slots[11] = clip('CB105-Sunday-ReloSeries-PreachV2.jpg')
	assert.ok(planPlacements(ITEMS, s).unplaced.some((u) => u.code === 'CB105'))
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
	s.layers[1].slots[2] = empty()
	const { steps, unplaced } = updatePlan(ITEMS, s, marks)
	const by = Object.fromEntries(steps.map((x) => [x.request.code, x]))
	// CB095 is confirmed, so only the columns missing it: BIBLES and WTG, and
	// as the normal background the empty COUNTDOWN and the last PROMO.
	assert.equal(by.CB095.request.clipIds.length, 4)
	assert.match(by.CB095.what, /the gaps in HOLD BG as the normal background \(COUNTDOWN, PROMO\)$/)
	assert.match(by.CF588.what, /HOLD FG · POST \(column 2\)/)
	// Each step names the lookbook's file, and never downloads unless asked at the confirmation.
	assert.equal(by.CF588.request.lookbookPath, F.CF588)
	assert.ok(steps.every((x) => x.request.allowLookbook === false))
	assert.equal(by.CF445, undefined)
	assert.ok(unplaced.some((u) => u.code === 'CB105'))
	assert.equal(new Set(steps.map((x) => x.request.code)).size, steps.length)
})

test('each moment as a look: what each of its codes is in Arena, its column, and whether it is all there', () => {
	const s = composition()
	const marks = new Set([sameKey('CB095', s.layers[1].slots[0].file, 'CB095-Sunday-RelationshipSeries-v5')])
	const looks = looksOf(ITEMS, s, marks)
	const state = (i) => Object.fromEntries(looks[i].codes.map((c) => [c.code, c.state]))
	// Doors Open: all in PRE, the background confirmed the same; the lower third is not Arena's.
	assert.deepEqual(looks[0].column, { number: 1, name: 'PRE' })
	assert.deepEqual(state(0), { CB095: 'ready', CF588: 'ready', CA635: 'ready' })
	assert.equal(looks[0].ready, true)
	assert.equal(state(1).CT108, 'not-arena')
	assert.equal(looks[1].ready, true)
	// NSL: its foreground is not in its column yet.
	assert.equal(state(2).CF465, 'place')
	assert.equal(looks[2].ready, false)
	// Without the confirmation, CB095 needs a look wherever it is used.
	assert.equal(Object.fromEntries(looksOf(ITEMS, s, new Set())[0].codes.map((c) => [c.code, c.state])).CB095, 'look')
	// A one-off with no column is said, and the look is not ready.
	const w = withoutPreach()
	const preach = looksOf(ITEMS, w, marks).find((l) => ITEMS[l.item].label === 'Preach BG')
	assert.deepEqual(preach.codes, [{ code: 'CB105', type: 'B', state: 'no-place' }])
	assert.equal(preach.column, null)
	assert.equal(preach.ready, false)
	// A clip of its own playing in its column is the look on screen.
	assert.equal(looks[0].live, false)
	s.layers[3].slots[0] = { ...s.layers[3].slots[0], state: 'playing' }
	assert.equal(looksOf(ITEMS, s, marks)[0].live, true)
	assert.equal(looksOf(ITEMS, s, marks)[8].live, false)
})

test("loading one look: its codes into its column, a shared code's old files everywhere", () => {
	const s = composition()
	const steps = lookSteps(2, ITEMS, s, new Set())
	const by = Object.fromEntries(steps.map((x) => [x.request.code, x]))
	// NSL: CF465 into NSL, replacing CF446; CB095's seven old clips, NSL's included.
	assert.match(by.CF465.what, /HOLD FG · NSL \(column 6\), replacing CF446/)
	assert.equal(by.CB095.request.clipIds.length, 7)
	assert.ok(steps.every((x) => x.request.allowLookbook === false && x.request.allowLive.length === 0))
	// Not another item's columns: End's CF588 into POST is End's, not NSL's.
	assert.equal(by.CF588, undefined)
	// Doors Open is all there, with CB095 confirmed: nothing to do.
	const marks = new Set([sameKey('CB095', s.layers[1].slots[0].file, 'CB095-Sunday-RelationshipSeries-v5')])
	assert.deepEqual(lookSteps(0, ITEMS, s, marks), [])
	assert.deepEqual(lookSteps(99, ITEMS, s, marks), [])
})

test('old foregrounds: HOLD FG clips this run sheet does not use, never on screen, reserved or about to be loaded', () => {
	const s = composition()
	const fg = s.layers[3]
	// CF446 (NSL), CF561 and CF593 (PROMO) are last week's; CF588 and CF445 are today's.
	assert.deepEqual(
		oldForegrounds(ITEMS, s).map((c) => [c.code, c.columnName]),
		[['CF446', 'NSL'], ['CF561', 'PROMO'], ['CF593', 'PROMO']],
	)
	fg.slots[8] = { ...fg.slots[8], state: 'playing' }
	fg.slots[2] = clip('CF100-Old-Countdown.png') // COUNTDOWN: reserved
	assert.deepEqual(oldForegrounds(ITEMS, s, new Set([fg.slots[5].id])).map((c) => c.code), ['CF593'])
	assert.deepEqual(oldForegrounds([], s), [])
})

test('the normal background: what the rest of the service uses, not Doors Open, Pre & Post, Preach or announcements', () => {
	assert.equal(normalBackground(ITEMS).code, 'CB095')
	// Another background on Doors Open, End, the message and an announcement changes nothing.
	const own = (it, code) => ({ ...it, codes: [code, ...it.codes.slice(1)], files: { ...it.files, [code]: L(`${code}-Own`) } })
	const varied = ITEMS.map((it) =>
		it.title === 'Doors Open' || it.title === 'End' || it.label === 'Prayer & Fasting' ? own(it, 'CB777') : it.label === 'Preach BG' ? own(it, 'CB888') : it,
	)
	assert.equal(normalBackground(varied).code, 'CB095')
	assert.equal(normalBackground([...varied, item('Pre & Post', null, ['CB777'], { CB777: L('CB777-Own') })]).code, 'CB095')
	// None of the rest has a background: none, not a guess.
	assert.equal(normalBackground(ITEMS.filter((it) => !['WTL', 'NSL', 'WTG'].includes(it.label))), null)
})

test('the gaps in HOLD BG up to the last PROMO take the normal background (the owner, 2026-10-06)', () => {
	const s = composition([...NAMES, 'EXTRA'])
	for (const l of s.layers) if (l.slots.length === NAMES.length) l.slots.push(empty())
	const bg = s.layers[1]
	bg.slots[11] = clip('CB050-Sunday-OldSeries.png') // last week's, in the last PROMO
	bg.slots[10] = clip('Vignette.png') // no code: left alone
	const gaps = backgroundGaps(ITEMS, s)
	// Not VIDEO BG, not BIBLES or the PROMOs the announcements took (their own
	// backgrounds are placed there), not past the last PROMO. COUNTDOWN holds
	// CB105, today's: left.
	assert.deepEqual(gaps.map((g) => [g.column, g.code, g.why, g.replaces?.code ?? null]), [[12, 'CB095', 'fill', 'CB050']])
	// Central's columns 3 and 4 unnamed (the owner, 2026-10-06: "yes they should"); a VIDEO BG never.
	const plain34 = composition(NAMES.map((n, i) => (i === 2 || i === 3 ? 'Column #' : n)))
	plain34.layers[1].slots[2] = empty()
	assert.deepEqual(backgroundGaps(ITEMS, plain34).map((g) => g.column), [3, 4, 12])
	const video = composition()
	video.layers[1].slots[2] = empty()
	assert.deepEqual(backgroundGaps(ITEMS, video).map((g) => g.columnName), ['COUNTDOWN', 'PROMO'])
	bg.slots[11] = { ...bg.slots[11], state: 'playing' }
	assert.deepEqual(backgroundGaps(ITEMS, s), [])
	// No PROMO column: where to stop is not known, so nothing.
	assert.deepEqual(backgroundGaps(ITEMS, composition(NAMES.map((n) => (n === 'PROMO' ? 'Column #' : n)))), [])
	// An item with no background of its own leaves its column a gap.
	const fgOnly = ITEMS.map((it) => (it.label === 'Alpha' ? { ...it, codes: ['CF562'] } : it))
	const t = composition()
	t.layers[1].slots[8] = empty()
	assert.deepEqual(backgroundGaps(fgOnly, t).map((g) => g.column).sort((a, b) => a - b), [9, 12])
})

test('a column named PREACH is the message background\'s home', () => {
	const s = withoutPreach()
	const names = NAMES.map((n, i) => (i === 3 ? 'PREACH' : n))
	s.columns = names.map((name, i) => ({ id: 900 + i, name, state: 'loaded' }))
	const p = at(planPlacements(ITEMS, s).placements, 'Preach BG', 'CB105')
	assert.equal(p.columnName, 'PREACH')
	assert.equal(p.layer, 'HOLD BG')
	assert.equal(p.why, 'named')
})

// More than the named columns take (the owner, 2026-10-08): a one-off event's
// run sheet, with spare columns past the last PROMO.
/** The fixture with `n` more columns, Arena's `Column #`, empty on every layer. */
const wide = (n) => {
	const s = composition([...NAMES, ...Array(n).fill('Column #')])
	for (const l of s.layers) if (l.slots.length === NAMES.length) for (let i = 0; i < n; i++) l.slots.push(empty())
	return s
}
const oneOff = (label, ...codes) => item('Conference', label, codes, Object.fromEntries(codes.map((c) => [c, L(`${c}-Conf-${label.replace(/\W/g, '')}`)])))
const EVENT = [
	...ITEMS,
	oneOff('Speaker Intro', 'CF701'),
	oneOff('Worship Night', 'CF702', 'CB702'),
	oneOff('Offering Story', 'CF703'),
	oneOff('Baptisms', 'CF704'),
]
const overflow = (r) => r.placements.filter((p) => p.why === 'overflow').map((p) => [p.layer, p.code, p.column])

test('overflow: a normal service that fits its named columns overflows nothing', () => {
	assert.deepEqual(overflow(planPlacements(ITEMS, wide(4))), [])
	// The one-off Preach BG already sits in HOLD BG column 3: placed by hand, left.
	assert.equal(planPlacements(ITEMS, wide(4)).unplaced.length, 0)
})

test('overflow: the extras go in run-sheet order into the empty clips past the last named column', () => {
	const r = planPlacements(EVENT, wide(5))
	// One column per one-off, across its layers (the owner, 2026-10-13): its own
	// background, or the normal background when it has none.
	assert.deepEqual(overflow(r), [
		['HOLD FG', 'CF701', 13],
		['HOLD BG', 'CB095', 13],
		['HOLD FG', 'CF702', 14],
		['HOLD BG', 'CB702', 14],
		['HOLD FG', 'CF703', 15],
		['HOLD BG', 'CB095', 15],
		['HOLD FG', 'CF704', 16],
		['HOLD BG', 'CB095', 16],
	])
	assert.ok(r.placements.filter((p) => p.why === 'overflow').every((p) => p.replaces === null && p.live === false))
	assert.equal(r.unplaced.length, 0)
	// The confirmation names each clip.
	const { steps } = updatePlan(EVENT, wide(5), new Set())
	const cf703 = steps.find((x) => x.request.code === 'CF703')
	assert.equal(cf703.what, 'CF703 into HOLD FG · column 15, an empty clip past the named columns')
	assert.equal(cf703.request.clipIds.length, 1)
})

test('overflow: never a loaded clip, never one on screen, never before the last named column', () => {
	const s = wide(5)
	const fg = s.layers[3]
	fg.slots[12] = clip('Logo.png') // loaded, no code
	fg.slots[13] = { ...clip('CF500-LastEvent.png'), state: 'playing' }
	const r = planPlacements(EVENT, s)
	assert.deepEqual(overflow(r).filter((x) => x[0] === 'HOLD FG').map((x) => x[2]), [15, 16, 17])
	assert.ok(!r.placements.some((p) => p.clipId === fg.slots[12].id || p.clipId === fg.slots[13].id))
	// A COUNTDOWN past the PROMOs is a named column: overflow starts after it.
	const t = composition([...NAMES, 'COUNTDOWN', 'Column #'])
	for (const l of t.layers) if (l.slots.length === NAMES.length) l.slots.push(empty(), empty())
	assert.deepEqual(overflow(planPlacements(EVENT, t)).map((x) => [x[0], x[2]]), [['HOLD FG', 14], ['HOLD BG', 14]])
})

test("overflow: what still doesn't fit is said and waits in the tray, never dropped", () => {
	const r = planPlacements(EVENT, wide(2))
	assert.deepEqual(overflow(r), [
		['HOLD FG', 'CF701', 13],
		['HOLD BG', 'CB095', 13],
		['HOLD FG', 'CF702', 14],
		['HOLD BG', 'CB702', 14],
	])
	const left = r.unplaced.filter((u) => u.didntFit)
	assert.deepEqual(left.map((u) => u.code), ['CF703', 'CF704'])
	assert.ok(left.every((u) => u.kind === 'no-column'))
	assert.match(left[0].detail, /no column named Offering Story, and no empty clip left on HOLD FG after PROMO \(column 12\)/)
	// Every one-off is somewhere: placed or said.
	const said = new Set([...r.placements.map((p) => p.code), ...r.unplaced.map((u) => u.code)])
	for (const c of ['CF701', 'CF702', 'CB702', 'CF703', 'CF704']) assert.ok(said.has(c), c)
	// Not with unnamed columns: nothing placed, nothing overflowed.
	const plain = composition(NAMES.map(() => 'Column #'))
	assert.deepEqual(overflow(planPlacements(EVENT, plain)), [])
})

test('overflow: a code two one-offs share takes one clip, said once', () => {
	const shared = [...ITEMS, oneOff('Session 1', 'CF801'), oneOff('Session 2', 'CF801')]
	const r = planPlacements(shared, wide(3))
	assert.deepEqual(r.placements.filter((p) => p.code === 'CF801').map((p) => [p.item, p.column]), [[9, 13], [10, 13]])
	const step = updatePlan(shared, wide(3), new Set()).steps.find((x) => x.request.code === 'CF801')
	assert.equal(step.what, 'CF801 into HOLD FG · column 13, an empty clip past the named columns')
	// The Lookbook view: both moments need loading.
	const looks = looksOf(shared, wide(3), new Set())
	assert.equal(looks[9].codes[0].state, 'place')
	assert.equal(looks[10].codes[0].state, 'place')
})

test('overflow backgrounds and the normal background never meet', () => {
	const s = wide(3)
	s.layers[1].slots[11] = empty() // the last PROMO's background: a gap
	const r = planPlacements(EVENT, s)
	const gaps = backgroundGaps(EVENT, s)
	assert.deepEqual(gaps.map((g) => g.column), [12])
	const cb702 = r.placements.find((p) => p.code === 'CB702')
	assert.equal(cb702.column, 14)
	assert.ok(!gaps.some((g) => g.clipId === cb702.clipId))
	// Update all: the normal background's step does not reach past the last PROMO.
	const { steps } = updatePlan(EVENT, s, new Set())
	const cb095 = steps.find((x) => x.request.code === 'CB095')
	assert.ok(!cb095.request.clipIds.includes(cb702.clipId))
	assert.ok(steps.find((x) => x.request.code === 'CB702').request.clipIds.includes(cb702.clipId))
})

test('Clear old FGs: an overflow clip is this run sheet’s, never old; the last event’s leftovers are', () => {
	const s = wide(3)
	const fg = s.layers[3]
	fg.slots[12] = clip('CF701-Conf-SpeakerIntro.png') // loaded by an earlier Update all
	fg.slots[13] = clip('CF599-LastEvent-Old.png') // the last event's
	const old = oldForegrounds(EVENT, s).map((c) => c.code)
	assert.ok(!old.includes('CF701'))
	assert.ok(old.includes('CF599'))
	// CF701 counts as placed, so it is not overflowed again; the rest take what is still empty.
	assert.deepEqual(overflow(planPlacements(EVENT, s)).filter((x) => x[0] === 'HOLD FG').map((x) => [x[1], x[2]]), [['CF702', 15]])
	assert.deepEqual(planPlacements(EVENT, s).unplaced.filter((u) => u.didntFit).map((u) => u.code), ['CF703', 'CF704'])
	// Before it is loaded, an overflow slot is empty: nothing to clear there either.
	assert.ok(!oldForegrounds(EVENT, wide(3)).some((c) => c.column > 12))
})

// The plan in words (the owner, 2026-10-13: "we don't really know what it's doing").
const noteOf = (lines, label, code) => lines.find((l) => (l.label ?? l.title) === label)?.notes.find((n) => n.code === code)

test('the plan says, for every code, what Update all does with it or why it does nothing', () => {
	const s = composition()
	const lines = explainPlan(ITEMS, s, new Set())
	assert.equal(lines.filter((l) => l.item >= 0).length, ITEMS.length)
	// In its column already: said where.
	const welcome = noteOf(lines, 'WTL', 'CF445')
	assert.equal(welcome.tone, 'ok')
	assert.equal(welcome.words, 'in HOLD FG · WTL (column 5)')
	assert.equal(welcome.clipId, s.layers[3].slots[4].id)
	// To place: where, and what it replaces.
	const nsl = noteOf(lines, 'NSL', 'CF465')
	assert.equal(nsl.tone, 'do')
	assert.match(nsl.words, /^into HOLD FG · NSL \(column 6\), replacing CF446$/)
	// In its column, but another file: Update all freshens it.
	const bg = noteOf(lines, 'Walk In', 'CB095')
	assert.equal(bg.tone, 'do')
	assert.match(bg.words, /^in HOLD BG · PRE \(column 1\); its 7 clips with another file get the lookbook’s$/)
	// Confirmed the same: said so, nothing to do.
	const marks = new Set([sameKey('CB095', s.layers[1].slots[0].file, 'CB095-Sunday-RelationshipSeries-v5')])
	const sure = noteOf(explainPlan(ITEMS, s, marks), 'Walk In', 'CB095')
	assert.equal(sure.tone, 'ok')
	assert.match(sure.words, /confirmed the same by hand$/)
	// A lower third is not Arena's.
	assert.deepEqual(noteOf(lines, 'WTL', 'CT108'), { code: 'CT108', tone: 'quiet', words: 'not Arena’s (lower third)', clipId: null })
	// A one-off already on its layer: no column of its own, and where it is.
	assert.match(noteOf(lines, 'Preach BG', 'CB105').words, /^no column of its own; already in HOLD BG · COUNTDOWN \(column 3\)/)
	// With nowhere to go: said, amber.
	const lost = noteOf(explainPlan(ITEMS, withoutPreach(), new Set()), 'Preach BG', 'CB105')
	assert.equal(lost.tone, 'warn')
	assert.match(lost.words, /no column named Preach BG/)
	// The normal background's gaps are a line of their own.
	const gaps = explainPlan(ITEMS, withoutPreach(), marks).find((l) => l.item === -1)
	assert.equal(gaps.title, 'The normal background')
	assert.match(gaps.notes[0].words, /^into the gaps in HOLD BG: COUNTDOWN, PROMO$/)
})

// A one-off is one column across its layers (the owner, 2026-10-13: "their
// backgrounds didn't follow").
test('a one-off: its background goes into its foreground\'s column, wherever else its code is', () => {
	// CB095 sits in many HOLD BG columns; it still goes into CF702's.
	const oneOffs = [...ITEMS, oneOff('Worship Night', 'CF702'), item('Story', 'Story', ['CB095', 'CF705'], { CB095: F.CB095, CF705: L('CF705-Story') })]
	const r = planPlacements(oneOffs, wide(3))
	const at13 = r.placements.filter((p) => p.column === 13).map((p) => [p.layer, p.code])
	const at14 = r.placements.filter((p) => p.column === 14).map((p) => [p.layer, p.code])
	assert.deepEqual(at13, [['HOLD FG', 'CF702'], ['HOLD BG', 'CB095']])
	assert.deepEqual(at14, [['HOLD FG', 'CF705'], ['HOLD BG', 'CB095']])
	// The plan says the normal background went with the one that has none.
	const lines = explainPlan(oneOffs, wide(3), new Set())
	assert.match(noteOf(lines, 'Worship Night', 'CB095').words, /^the normal background, into HOLD BG · column 13/)
})

test('a one-off: a HOLD BG clip this service does not use is replaced; one it uses, or on screen, is not', () => {
	const s = wide(3)
	const bg = s.layers[1]
	bg.slots[12] = clip('CB050-LastEvent.png') // last event's: replaced
	bg.slots[13] = clip('CB105-Sunday-ReloSeries-Preach.png') // this service's (Preach BG)
	const events = [...ITEMS, oneOff('Speaker Intro', 'CF701', 'CB701'), oneOff('Worship Night', 'CF702', 'CB702')]
	const r = planPlacements(events, s)
	const cb701 = r.placements.find((p) => p.code === 'CB701')
	assert.equal(cb701.column, 13)
	assert.equal(cb701.replaces.code, 'CB050')
	assert.match(placementWords(cb701), /column 13, past the named columns, replacing CB050$/)
	// Column 14's background is this service's: CF702 goes on to 15, where both fit.
	assert.deepEqual(r.placements.filter((p) => p.item === events.length - 1).map((p) => [p.layer, p.column]), [['HOLD FG', 15], ['HOLD BG', 15]])
	// On screen: never.
	bg.slots[12] = { ...clip('CB050-LastEvent.png'), state: 'playing' }
	assert.notEqual(planPlacements(events, s).placements.find((p) => p.code === 'CB701').column, 13)
})

test('a one-off placed by hand: its background follows to where its foreground is', () => {
	const s = wide(3)
	s.layers[3].slots[13] = clip('CF702-Conf-WorshipNight.png') // CF702 put in column 14 by hand
	const r = planPlacements([...ITEMS, oneOff('Worship Night', 'CF702', 'CB702')], s)
	const cb702 = r.placements.find((p) => p.code === 'CB702')
	assert.equal(cb702.column, 14)
	assert.ok(r.settled.some((x) => x.code === 'CF702' && x.why === 'on-layer' && x.column === 14))
	// With its background there already: nothing to do.
	s.layers[1].slots[13] = clip('CB702-Conf-WorshipNight.png')
	assert.equal(planPlacements([...ITEMS, oneOff('Worship Night', 'CF702', 'CB702')], s).placements.some((p) => p.code === 'CB702'), false)
})

test('a one-off whose column\'s background cannot be taken says why, and its foreground still goes', () => {
	const s = composition([...NAMES, 'Column #'])
	for (const l of s.layers) if (l.slots.length === NAMES.length) l.slots.push(empty())
	s.layers[1].slots[12] = { ...clip('CB050-LastEvent.png'), state: 'playing' }
	const r = planPlacements([...ITEMS, oneOff('Worship Night', 'CF702', 'CB702')], s)
	assert.equal(r.placements.find((p) => p.code === 'CF702').column, 13)
	const lost = r.unplaced.find((u) => u.code === 'CB702')
	assert.match(lost.detail, /CF702 is in column 13, but HOLD BG there can't take its background: that clip is on screen/)
})

// "It's there" (the owner, 2026-10-13: Arena 404ing on a clip that was there).
test("It's there: a file Arena calls missing, said to be there, is right by hand; a same mark is not enough", () => {
	const s = composition()
	const fg = s.layers[3]
	fg.slots[0] = clip('CF588-Sunday-ReloSeries-WalkInV2.png', 'loaded', true) // Arena calls it missing
	const today = codesOn(ITEMS)
	const want = 'CF588-Sunday-ReloSeries-WalkInV2'
	assert.equal(slotMark(fg.slots[0], ITEMS, today, new Set()), 'missing')
	assert.equal(slotMark(fg.slots[0], ITEMS, today, new Set([sameKey('CF588', fg.slots[0].missingFile, want)])), 'missing')
	const there = new Set([thereKey('CF588', fg.slots[0].missingFile, want)])
	assert.equal(slotMark(fg.slots[0], ITEMS, today, there), 'confirmed')
	// Update all leaves it.
	assert.ok(clipsToUpdate('CF588', want, F.CF588, s, new Set()).includes(fg.slots[0].id))
	assert.ok(!clipsToUpdate('CF588', want, F.CF588, s, there).includes(fg.slots[0].id))
	// Kept as a key of its own, read back from storage and from the page.
	assert.deepEqual(sameMarksFrom([[...there][0], 'junk']), [...there])
	assert.deepEqual(sameMarkFrom({ code: 'CF588', file: 'x.png', want, same: true, there: true }), { code: 'CF588', file: 'x.png', want, same: true, there: true })
	assert.equal(sameMarkFrom({ code: 'CF588', file: 'x.png', want, same: true, there: 'yes' }), null)
})

// Placed by hand, anywhere on its layer, for this service (the owner, 2026-10-13).
test('a pin: the whole moment goes into the chosen column, its background following, and stays there', () => {
	const events = [...ITEMS, oneOff('Speaker Intro', 'CF701', 'CB701'), oneOff('Worship Night', 'CF702')]
	const s = wide(4)
	const pins = [{ item: ITEMS.length, code: 'CF701', column: 15 }]
	const r = planPlacements(events, s, undefined, pins)
	assert.deepEqual(r.placements.filter((p) => p.item === ITEMS.length).map((p) => [p.layer, p.code, p.column, p.why]), [
		['HOLD FG', 'CF701', 15, 'chosen'],
		['HOLD BG', 'CB701', 15, 'chosen'],
	])
	assert.match(placementWords(r.placements.find((p) => p.code === 'CF701')), /column 15, placed by hand$/)
	// The other one-off overflows around it: 13, never 15.
	assert.equal(r.placements.find((p) => p.code === 'CF702').column, 13)
	// A foreground-only moment placed by hand takes the normal background with it.
	const r2 = planPlacements(events, s, undefined, [{ item: ITEMS.length + 1, code: 'CF702', column: 16 }])
	assert.deepEqual(r2.placements.filter((p) => p.item === ITEMS.length + 1).map((p) => [p.layer, p.code, p.column]), [
		['HOLD FG', 'CF702', 16],
		['HOLD BG', 'CB095', 16],
	])
	// Once loaded, it is in its column: the plan says by hand.
	s.layers[3].slots[14] = clip('CF701-Conf-SpeakerIntro.png')
	s.layers[1].slots[14] = clip('CB701-Conf-SpeakerIntro.png')
	assert.equal(planPlacements(events, s, undefined, pins).placements.filter((p) => p.item === ITEMS.length).length, 0)
	assert.match(noteOf(explainPlan(events, s, new Set(), undefined, undefined, pins), 'Speaker Intro', 'CF701').words, /^in HOLD FG · column 15, placed by hand$/)
	// A pin whose run sheet changed under it (another code there now) is dropped.
	assert.equal(planPlacements(events, wide(4), undefined, [{ item: ITEMS.length, code: 'CF999', column: 15 }]).placements.find((p) => p.code === 'CF701').column, 13)
})

test('a pin moves a moment with a column of its own, and no PROMO takes its column', () => {
	const pins = [{ item: 2, code: 'CF465', column: 11 }] // NSL into a PROMO column
	const r = planPlacements(ITEMS, composition(), undefined, pins)
	assert.equal(at(r.placements, 'NSL', 'CF465').column, 11)
	assert.ok(r.placements.filter((p) => p.item !== 2 && p.layer === 'HOLD FG').every((p) => p.column !== 11))
})

test('where a moment may be put by hand: its layer, not a reserved column, not a column another moment has', () => {
	const s = wide(3)
	const fg = s.layers[3]
	const targets = pinTargets(ITEMS, s, { item: ITEMS.length - 1, code: 'CF588' }) // End's foreground
	const cols = fg.slots.flatMap((slot, i) => (targets.has(slot.id) ? [i + 1] : []))
	// Not COUNTDOWN (3) or VIDEO BG (4); not PRE, WTL, NSL, BIBLES, WTG or the PROMOs the
	// announcements take; POST is End's own; 11 and 12 are PROMO columns no one took; past them, free.
	assert.deepEqual(cols, [2, 11, 12, 13, 14, 15])
	// Only its own layer.
	assert.ok(!s.layers[1].slots.some((slot) => targets.has(slot.id)))
	// Storage: anything not a pin is dropped.
	assert.deepEqual(pinsFrom([{ item: 1, code: 'CF465', column: 11, extra: 1 }, { item: -1, code: 'CF465', column: 2 }, 'x']), [{ item: 1, code: 'CF465', column: 11 }])
})
