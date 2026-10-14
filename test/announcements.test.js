import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { PLAYLIST_AM, PLAYLIST_EVENT, PLAYLIST_PM, checkAnnouncements, inFolder, isTCode, outputName, pictureOf, playlistBody, playlistFor, sameOrder, sessionOf, wantedAnnouncements } from '../dist/src/shared/announcements.js'
import { DEFAULT_SETTINGS, applyPatch, fromDisk, patchFrom } from '../dist/src/shared/settings.js'
import { viewIsOn } from '../dist/src/shared/connections.js'
/** Central's "-Announcements AM", read from its ProPresenter on 2026-10-14. */
const REAL_AM = JSON.parse(readFileSync(new URL('./fixtures/propresenter-announcements-am.json', import.meta.url), 'utf8'))

const item = (title, codes, label = null) => ({ title, label, codes, files: Object.fromEntries(codes.map((c) => [c, `/storage/library/C/${c}-x.png`])), missingCodes: [] })
const media = (name, uuid = name) => ({ uuid, name, type: 'media', hidden: false })

// Central AM, 11 October 2026, as the lookbook had it (codes only).
const RUN_SHEET = [
	item('Doors Open // 9am', ['CB100', 'CA301'], 'Walk In'),
	item('Welcome', ['CB101', 'CF445', 'CT108'], 'WTL'),
	item('Welcome', ['CB101', 'CF464', 'CT003'], 'NSL'),
	item('Welcome', ['CB101', 'CF546', 'CT109'], 'WTG'),
	item('Announcement', ['CB101', 'CF593', 'CT290'], 'Prayer & Fasting'),
	item('EOS Announcements', ['CB101', 'CF449', 'CT110', 'CT108'], 'Bibles'),
	item('End', ['CB100', 'CA302'], 'Walk Out'),
]

test('announcements: every T code once, the standing notices first in their order (WTL, NSL, Bibles, WTG), then the rest in run-sheet order', () => {
	assert.deepEqual(
		wantedAnnouncements(RUN_SHEET).map((w) => [w.code, w.section]),
		[
			['CT108', 'notices'],
			['CT003', 'notices'],
			['CT110', 'notices'],
			['CT109', 'notices'],
			['CT290', 'promos'],
		],
	)
	assert.equal(wantedAnnouncements(RUN_SHEET)[0].file, '/storage/library/C/CT108-x.png')
})

test('announcements: AM or PM by the service\'s name, else EVENT', () => {
	assert.equal(playlistFor({ name: 'Central AM 18th October' }), PLAYLIST_AM)
	assert.equal(playlistFor({ name: 'Central PM 18th October' }), PLAYLIST_PM)
	assert.equal(playlistFor({ name: 'Central Team Night' }), PLAYLIST_EVENT)
	assert.equal(sessionOf({ name: 'Central PM 18th October' }), 'PM')
	assert.equal(outputName('Notices ', 'AM'), 'Notices AM')
})

test('announcements: Central\'s real playlist against its 11 October run sheet: all there, headers left alone', () => {
	const read = decodePlaylist(REAL_AM)
	assert.equal(read.ok, true)
	const r = checkAnnouncements(PLAYLIST_AM, wantedAnnouncements(RUN_SHEET), read.value)
	assert.equal(r.ok, true)
	assert.equal(r.others, 2) // NORMAL NOTICES and PROMOS
	// Not in run-sheet order (Bibles before Ways to Give), and that is not a fault.
	// Rows in the order the playlist takes them, which is the real playlist's order.
	assert.deepEqual(r.rows.map((x) => [x.code, x.at]), [
		['CT108', 1],
		['CT003', 2],
		['CT110', 3],
		['CT109', 4],
		['CT290', 6],
	])
})

test('announcements: the next week against last week\'s playlist: the new promo missing, the old one extra', () => {
	const next = RUN_SHEET.filter((i) => i.label !== 'Prayer & Fasting').concat([item('EOS Announcements', ['CB101', 'CF603', 'CT299'], 'Value Your Vote')])
	const r = checkAnnouncements(PLAYLIST_AM, wantedAnnouncements(next), decodePlaylist(REAL_AM).value)
	assert.equal(r.ok, false)
	assert.deepEqual(r.rows.filter((x) => x.state === 'missing').map((x) => x.code), ['CT299'])
	assert.deepEqual(r.extras.map((e) => [e.code, e.name]), [['CT290', 'CT290-Sunday-Prayer&Fasting-Oct']])
})

test('announcements: a second copy is extra; a run sheet with no T codes is never ok', () => {
	const r = checkAnnouncements(PLAYLIST_AM, wantedAnnouncements(RUN_SHEET), [...decodePlaylist(REAL_AM).value, media('CT108-Sunday-ConnectWithUs', 'dup')])
	assert.deepEqual(r.extras.map((e) => e.code), ['CT108'])
	assert.equal(checkAnnouncements(PLAYLIST_AM, [], [media('CT100 Welcome')]).ok, false)
})

// --- ProPresenter's replies ---

import { decodePlaylist, decodePlaylistTree, findPlaylist } from '../dist/src/bridge/propresenter-playlist.js'

const id = (name, uuid = `u-${name}`) => ({ uuid, name, index: 0 })

test('ProPresenter: playlists in groups are found by name, case and spaces aside', () => {
	const tree = [
		{ id: id('Sunday'), field_type: 'group', children: [{ id: id('-Announcements AM'), field_type: 'playlist' }, { id: id('Announcements  pm'), field_type: 'playlist' }] },
		{ id: id('Songs'), field_type: 'playlist' },
	]
	const all = decodePlaylistTree(tree)
	assert.equal(all.ok, true)
	assert.deepEqual(all.value.map((p) => p.name), ['-Announcements AM', 'Announcements  pm', 'Songs'])
	assert.equal(findPlaylist(all.value, 'Announcements AM').value.uuid, 'u--Announcements AM')
	assert.equal(findPlaylist(all.value, 'Announcements PM').value.uuid, 'u-Announcements  pm')
	assert.equal(findPlaylist(all.value, 'Announcements X').ok, false)
	assert.match(findPlaylist([...all.value, { uuid: 'z', name: 'Songs' }], 'Songs').detail, /2 playlists/)
})

test('ProPresenter: a playlist\'s items in order; a wrong shape fails whole', () => {
	const r = decodePlaylist({ id: id('Announcements AM'), items: [{ id: id('CT100 Welcome.png', 'a'), type: 'media', is_hidden: false, is_pco: false }, { id: id('Before', 'b'), type: 'header' }] })
	assert.deepEqual(r, { ok: true, value: [{ uuid: 'a', name: 'CT100 Welcome.png', type: 'media', hidden: false }, { uuid: 'b', name: 'Before', type: 'header', hidden: false }] })
	assert.equal(decodePlaylist({ items: [{ id: id('x'), type: 'media' }, { type: 'media' }] }).ok, false)
	assert.equal(decodePlaylist([]).ok, false)
	assert.equal(decodePlaylistTree({}).ok, false)
})

// --- Writing the output playlist ---

const PAUA = [media('01 CT108-Sunday-ConnectWithUs', 'm108'), media('02 CT003-Sunday-NextStepsLounge', 'm003'), media('04 CT110-Sunday-Bibles', 'm110'), media('03 CT109-Sunday-WaystoGive', 'old109'), media('03 CT109-Sunday-WaystoGive', 'm109'), media('05 CT290-Sunday-Prayer&Fasting-Oct', 'm290')]

test('announcements: the write sends each section\'s header and its pictures by their Media Bin ids, in order', () => {
	const current = decodePlaylist(REAL_AM).value
	const folder = ['01 CT108-Sunday-ConnectWithUs', '02 CT003-Sunday-NextStepsLounge', '04 CT110-Sunday-Bibles', '03 CT109-Sunday-WaystoGive', '05 CT290-Sunday-Prayer&Fasting-Oct']
	const body = playlistBody(wantedAnnouncements(RUN_SHEET), PAUA, current, folder)
	assert.equal(body.ok, true)
	assert.deepEqual(body.leftOut, [])
	assert.deepEqual(
		body.items.map((i) => [i.type, i.id.uuid, i.id.name]),
		[
			['header', null, 'NORMAL NOTICES'],
			['media', 'm108', '01 CT108-Sunday-ConnectWithUs'],
			['media', 'm003', '02 CT003-Sunday-NextStepsLounge'],
			['media', 'm110', '04 CT110-Sunday-Bibles'],
			['media', 'm109', '03 CT109-Sunday-WaystoGive'], // the newest of two
			['header', null, 'PROMOS'],
			['media', 'm290', '05 CT290-Sunday-Prayer&Fasting-Oct'],
		],
	)
	// The header keeps the playlist's own colour; indices run 0, 1, 2…
	assert.deepEqual(body.items[0].header_color, { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 })
	assert.deepEqual(body.items.map((i) => i.id.index), [0, 1, 2, 3, 4, 5, 6])
	// Read back with ProPresenter's own entry ids, the same order is the same.
	const back = body.items.map((i, n) => ({ uuid: `e${n}`, name: i.id.name.replace(/^\d\d /, ''), type: i.type, hidden: false }))
	assert.equal(sameOrder(body.items, back), true)
	assert.equal(sameOrder(body.items, [back[0], back[2], back[1], ...back.slice(3)]), false)
})

test('announcements: nothing is written while one is missing from the media playlist, or with nothing wanted', () => {
	const folder = ['01 CT108-Sunday-ConnectWithUs', '02 CT003-Sunday-NextStepsLounge', '04 CT110-Sunday-Bibles', '03 CT109-Sunday-WaystoGive', '05 CT290-Sunday-Prayer&Fasting-Oct']
	const r = playlistBody(wantedAnnouncements(RUN_SHEET), PAUA.slice(0, 3), [], folder)
	assert.deepEqual(r, { ok: false, missing: ['CT109', 'CT290'] })
	assert.deepEqual(playlistBody([], PAUA, [], folder), { ok: false, missing: [] })
	// An empty folder: nothing to write, nothing said missing from the media playlist.
	assert.deepEqual(playlistBody(wantedAnnouncements(RUN_SHEET), PAUA, [], []), { ok: false, missing: [] })
	assert.equal(isTCode('CT108'), true)
	assert.equal(isTCode('CF108'), false)
	assert.equal(isTCode('ct108'), false)
})

test('announcements: a lower third with no file in the folder (not made yet) is left out of the write and named', () => {
	// Central, 18 October: CT290 not made yet, so Copy found no file for it.
	const folder = ['01 CT108-Sunday-ConnectWithUs', '02 CT003-Sunday-NextStepsLounge', '04 CT110-Sunday-Bibles', '03 CT109-Sunday-WaystoGive']
	const body = playlistBody(wantedAnnouncements(RUN_SHEET), PAUA, [], folder)
	assert.equal(body.ok, true)
	assert.deepEqual(body.leftOut, ['CT290'])
	// No PROMOS header with nothing under it.
	assert.deepEqual(body.items.map((i) => i.id.name), ['NORMAL NOTICES', '01 CT108-Sunday-ConnectWithUs', '02 CT003-Sunday-NextStepsLounge', '04 CT110-Sunday-Bibles', '03 CT109-Sunday-WaystoGive'])
	assert.equal(inFolder(folder, 'CT290'), false)
	assert.equal(inFolder(folder, 'CT110'), true)
})

test('announcements: last week\'s entry in the media playlist, its file set aside, is not this week\'s picture', () => {
	// Central, the first test run: Paua held "03 CT109…" and "04 CT110…" from the week
	// before; Copy renumbered them "03 CT110…" and "04 CT109…" and set the old aside.
	const stale = [media('03 CT109-Sunday-WaystoGive', 'old109'), media('04 CT110-Sunday-Bibles', 'old110')]
	const folder = ['03 CT110-Sunday-Bibles', '04 CT109-Sunday-WaystoGive']
	assert.equal(pictureOf(stale, 'CT109', folder), null)
	assert.equal(pictureOf(stale, 'CT110', folder), null)
	const dragged = [...stale, media('03 CT110-Sunday-Bibles', 'new110'), media('04 CT109-Sunday-WaystoGive', 'new109')]
	assert.equal(pictureOf(dragged, 'CT109', folder)?.uuid, 'new109')
	assert.equal(pictureOf(dragged, 'CT110', folder)?.uuid, 'new110')
})

test('announcements: the settings, on by default, named as Central named them, and off hides the view', () => {
	assert.equal(DEFAULT_SETTINGS.announcementsOn, true)
	assert.equal(DEFAULT_SETTINGS.announcementsMediaPlaylist, 'Paua')
	const r = applyPatch(DEFAULT_SETTINGS, { announcementsOn: false, announcementsPlaylist: ' Notices ', announcementsFolder: '/Volumes/graphics/Other Media/Paua Smart Folder' })
	assert.equal(r.ok, true)
	assert.equal(r.settings.announcementsPlaylist, 'Notices')
	assert.equal(applyPatch(DEFAULT_SETTINGS, { announcementsMediaPlaylist: '  ' }).ok, false)
	assert.equal(fromDisk({ announcementsOn: false, announcementsMediaPlaylist: 'Bin' }).announcementsMediaPlaylist, 'Bin')
	assert.equal(patchFrom({ announcementsOn: 'yes' }), null)
	assert.equal(viewIsOn('announcements', [], [], [], [], false), false)
	assert.equal(viewIsOn('announcements', [], [], [], [], true), true)
	assert.equal(viewIsOn('announcements', ['propresenter'], [], [], [], true), false)
})
