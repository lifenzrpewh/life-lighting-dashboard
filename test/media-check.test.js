import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeItems, decodeServices, decodeWeeks } from '../dist/src/bridge/lookbook.js'
import { checkMedia, fileStem, lookbookStem, mediaCodeOf, nzDate, offeredServices } from '../dist/src/shared/media-check.js'

// Two items as the lookbook sent them for Central AM, 2026-10-04.
const ITEMS = [
	{
		id: '01be1da9-9590-448e-8431-af5a5d25687d',
		orderIndex: 0,
		title: 'Doors Open // 9am',
		mediaLabel: 'Walk In',
		codes: ['CB095', 'CF588', 'CA635'],
		rawMediaNo: 'CB095/CF588/CA635 (Walk In)',
		resolvedAssetPaths: {
			mask: 'applied',
			aScreen: '/storage/library/C/CA635-Sunday-Relationship-WalkIn_1789612089995.jpg',
			background: '/storage/library/C/CB095-Sunday-RelationshipSeries-v5_1789627559514.jpg',
			foreground: '/storage/library/C/CF588-Sunday-ReloSeries-WalkInV2_1789857226772.png',
		},
		missingCodes: [],
	},
	{
		id: '942ba293-0682-46e3-b6d1-6203d1715ecb',
		orderIndex: 1,
		title: 'Welcome',
		mediaLabel: 'WTL',
		codes: ['CB095', 'CF445', 'CT108'],
		rawMediaNo: 'Ps Erin Manner, Campus Pastor • CB095/CF445/CT108 (WTL) • ',
		resolvedAssetPaths: {
			mask: 'applied',
			background: '/storage/library/C/CB095-Sunday-RelationshipSeries-v5_1789627559514.jpg',
			foreground: '/storage/library/C/CF445-Sunday-WelcometoLIFE_1785297951684.png',
			lowerThird: '/storage/library/C/CT108-Sunday-ConnectWithUs_1788998311752.png',
		},
		missingCodes: [],
	},
]

const slot = (name, file, missing = false) => ({
	id: 1,
	name,
	state: 'loaded',
	thumbnail: null,
	file,
	missingFile: missing ? file : null,
})
const empty = { id: 0, name: '', state: 'empty', thumbnail: null, file: null, missingFile: null }
const status = (layers) => ({
	master: 1,
	deck: null,
	groups: [],
	columns: [],
	layers: layers.map(([name, slots], i) => ({ id: i + 1, name, group: 'HOLDING', master: 1, bypassed: false, playing: null, slots })),
})

test('a code is found anywhere in a name, upper-cased, never inside a longer run', () => {
	assert.deepEqual(mediaCodeOf('CF588-Sunday-ReloSeries-WalkInV2'), { code: 'CF588', campus: 'C', type: 'F' })
	assert.equal(mediaCodeOf('Sunday cb095 wash')?.code, 'CB095')
	assert.equal(mediaCodeOf('Walk In')?.code, undefined)
	assert.equal(mediaCodeOf('ABCF588'), null)
	assert.equal(mediaCodeOf('CF5881'), null)
	assert.equal(mediaCodeOf('NF012_x')?.code, 'NF012')
})

test("a lookbook file's NAS name drops the upload stamp; Arena's keeps its own", () => {
	assert.equal(lookbookStem('/storage/library/C/CF588-Sunday-ReloSeries-WalkInV2_1789857226772.png'), 'CF588-Sunday-ReloSeries-WalkInV2')
	assert.equal(fileStem('I:\\Holding\\CF588-Sunday-ReloSeries-WalkInV2.png'), 'CF588-Sunday-ReloSeries-WalkInV2')
	assert.equal(lookbookStem('/x/CB095-Sunday-v5_2.jpg'), 'CB095-Sunday-v5_2')
})

test('the lookbook items decode, in order, each file under its code, the mask ignored', () => {
	const r = decodeItems([ITEMS[1], ITEMS[0]])
	assert.ok(r.ok)
	assert.deepEqual(
		r.value.map((i) => i.title),
		['Doors Open // 9am', 'Welcome'],
	)
	assert.equal(r.value[0].label, 'Walk In')
	assert.deepEqual(Object.keys(r.value[0].files).sort(), ['CA635', 'CB095', 'CF588'])
	assert.equal(r.value[1].files.CT108, '/storage/library/C/CT108-Sunday-ConnectWithUs_1788998311752.png')
})

test('a run sheet of the wrong shape fails whole', () => {
	assert.equal(decodeItems({ items: [] }).ok, false)
	assert.equal(decodeItems([{ ...ITEMS[0], codes: 'CB095' }]).ok, false)
	assert.equal(decodeItems([{ ...ITEMS[0], orderIndex: undefined }]).ok, false)
	assert.equal(decodeItems([ITEMS[0], null]).ok, false)
	assert.equal(decodeItems([]).ok, true)
})

test('services and their campus decode; an id that is not a UUID never reaches a URL', () => {
	const weeks = decodeWeeks([{ id: '37e938b1-2b0f-45a0-b67e-a5fb06d44ed2', date: '2026-10-04', name: 'Central AM 4th October', serviceTime: '09:00' }])
	assert.ok(weeks.ok)
	assert.equal(weeks.value[0].time, '09:00')
	assert.equal(decodeWeeks([{ id: '../admin', date: '2026-10-04', name: 'x' }]).ok, false)
	const svc = decodeServices([{ id: 'bf2f560a-4027-4658-ac53-c1282cde5618', name: 'Central AM 4th October', campusKey: 'central' }], weeks.value[0])
	assert.ok(svc.ok)
	assert.deepEqual(svc.value[0], {
		id: 'bf2f560a-4027-4658-ac53-c1282cde5618',
		name: 'Central AM 4th October',
		date: '2026-10-04',
		time: '09:00',
		campus: 'central',
	})
	assert.equal(decodeServices([{ id: 'bf2f560a-4027-4658-ac53-c1282cde5618' }], weeks.value[0]).ok, false)
})

test('every state: loaded, not in Arena, missing on disk, another version; T is not looked for', () => {
	const items = decodeItems(ITEMS).value
	const check = checkMedia(
		items,
		status([
			['Holding BG', [slot('bg', 'D:\\Media\\CB095-Sunday-RelationshipSeries-v5.jpg'), empty]],
			['Holding FG', [slot('walk in', 'D:\\Media\\CF588-Sunday-ReloSeries-WalkIn.png'), slot('welcome', 'D:\\Media\\CF445-Sunday-WelcometoLIFE.png', true)]],
		]),
	)
	const byCode = Object.fromEntries(check.items.flatMap((i) => i.codes).map((c) => [c.code, c]))
	assert.equal(byCode.CB095.state, 'ok')
	assert.deepEqual(byCode.CB095.at, { layer: 'Holding BG', column: 1, clipId: 1, file: 'D:\\Media\\CB095-Sunday-RelationshipSeries-v5.jpg' })
	// What the media fetch needs: the clip, and the lookbook's name.
	assert.equal(byCode.CF588.at.clipId, 1)
	assert.equal(byCode.CA635.want, 'CA635-Sunday-Relationship-WalkIn')
	assert.equal(byCode.CF445.want, 'CF445-Sunday-WelcometoLIFE')
	assert.equal(byCode.CF588.state, 'other-version')
	assert.equal(byCode.CF588.want, 'CF588-Sunday-ReloSeries-WalkInV2')
	assert.equal(byCode.CA635.state, 'not-loaded')
	assert.equal(byCode.CF445.state, 'not-on-disk')
	assert.equal(byCode.CT108, undefined)
	// CB095 is on both items but counted once.
	assert.deepEqual(check.counts, { ok: 1, 'not-loaded': 1, 'not-on-disk': 1, 'other-version': 1, 'no-lookbook-file': 0 })
})

test('a right copy anywhere wins over a wrong one; the name is matched without case', () => {
	const items = decodeItems([ITEMS[0]]).value
	const check = checkMedia(
		items,
		status([
			['Holding BG', [slot('old', 'D:\\CB095-Sunday-RelationshipSeries-v4.jpg'), slot('new', 'D:\\cb095-sunday-relationshipseries-V5.jpg')]],
		]),
	)
	const cb = check.items[0].codes.find((c) => c.code === 'CB095')
	assert.equal(cb.state, 'ok')
	assert.equal(cb.at.column, 2)
})

test('a code the lookbook has no file for is never ok', () => {
	const items = decodeItems([{ ...ITEMS[0], resolvedAssetPaths: { mask: 'applied' }, missingCodes: ['CB095', 'CF588', 'CA635'] }]).value
	const loaded = checkMedia(items, status([['Holding BG', [slot('bg', 'D:\\CB095-Sunday-RelationshipSeries-v5.jpg')]]]))
	const cb = loaded.items[0].codes.find((c) => c.code === 'CB095')
	assert.equal(cb.state, 'no-lookbook-file')
	assert.equal(cb.at.layer, 'Holding BG')
	assert.equal(loaded.counts.ok, 0)
	assert.equal(loaded.items[0].codes.find((c) => c.code === 'CF588').at, null)
})

test('a generator or a clip with no code is not media; a clip named by code counts', () => {
	const items = decodeItems([ITEMS[0]]).value
	const check = checkMedia(
		items,
		status([['Holding BG', [slot('Solid Color', null), slot('CA635-Sunday-Relationship-WalkIn', null)]]]),
	)
	// No file Arena names, so its name stands in: Arena names a clip after its
	// file, and this one is the lookbook's version, word for word.
	assert.equal(check.items[0].codes.find((c) => c.code === 'CA635').state, 'ok')
	// The generator carries no code and is nobody's media.
	assert.equal(check.items[0].codes.find((c) => c.code === 'CB095').state, 'not-loaded')
})

test("services: the booth's campus first, then soonest; past days left out", () => {
	const s = (name, date, time, campus) => ({ id: name, name, date, time, campus })
	const all = [
		s('North AM', '2026-10-04', '09:30', 'north'),
		s('Central PM', '2026-10-04', '18:00', 'central'),
		s('Central AM', '2026-10-04', '09:00', 'central'),
		s('Central AM last week', '2026-09-27', '09:00', 'central'),
	]
	assert.deepEqual(
		offeredServices(all, '2026-10-04', 'Central').map((x) => x.name),
		['Central AM', 'Central PM', 'North AM'],
	)
	assert.deepEqual(
		offeredServices(all, '2026-10-04', null).map((x) => x.name),
		['Central AM', 'North AM', 'Central PM'],
	)
})

test('the New Zealand date, and days ahead across a month', () => {
	// 2026-10-03 20:00 UTC is Sunday morning in Auckland (NZDT, +13).
	assert.equal(nzDate(new Date('2026-10-03T20:00:00Z')), '2026-10-04')
	assert.equal(nzDate(new Date('2026-10-03T20:00:00Z'), 30), '2026-11-03')
})
