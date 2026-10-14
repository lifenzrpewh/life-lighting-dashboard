import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { PLAYLIST_AM, PLAYLIST_EVENT, PLAYLIST_PM, checkAnnouncements, playlistFor, wantedAnnouncements } from '../dist/src/shared/announcements.js'
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

test('announcements: every T code on the run sheet, in its order, each once', () => {
	assert.deepEqual(
		wantedAnnouncements(RUN_SHEET).map((w) => [w.code, w.title]),
		[
			['CT108', 'Welcome'],
			['CT003', 'Welcome'],
			['CT109', 'Welcome'],
			['CT290', 'Announcement'],
			['CT110', 'EOS Announcements'],
		],
	)
	assert.equal(wantedAnnouncements(RUN_SHEET)[0].file, '/storage/library/C/CT108-x.png')
})

test('announcements: AM or PM by the service\'s name, else EVENT', () => {
	assert.equal(playlistFor({ name: 'Central AM 18th October' }), PLAYLIST_AM)
	assert.equal(playlistFor({ name: 'Central PM 18th October' }), PLAYLIST_PM)
	assert.equal(playlistFor({ name: 'Central Team Night' }), PLAYLIST_EVENT)
})

test('announcements: Central\'s real playlist against its 11 October run sheet: all there, headers left alone', () => {
	const read = decodePlaylist(REAL_AM)
	assert.equal(read.ok, true)
	const r = checkAnnouncements(PLAYLIST_AM, wantedAnnouncements(RUN_SHEET), read.value)
	assert.equal(r.ok, true)
	assert.equal(r.others, 2) // NORMAL NOTICES and PROMOS
	// Not in run-sheet order (Bibles before Ways to Give), and that is not a fault.
	assert.deepEqual(r.rows.map((x) => [x.code, x.at]), [
		['CT108', 1],
		['CT003', 2],
		['CT109', 4],
		['CT290', 6],
		['CT110', 3],
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
