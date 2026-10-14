import test from 'node:test'
import assert from 'node:assert/strict'

import { PLAYLIST_AM, PLAYLIST_PM, checkAnnouncements, playlistFor, wantedAnnouncements } from '../dist/src/shared/announcements.js'

const item = (title, codes, label = null) => ({ title, label, codes, files: Object.fromEntries(codes.map((c) => [c, `/storage/library/C/${c}-x.png`])), missingCodes: [] })
const media = (name, uuid = name) => ({ uuid, name, type: 'media', hidden: false })

const RUN_SHEET = [
	item('Walk In', ['CB001', 'CT900'], 'Walk In'),
	item('Announcements', ['CF100', 'CT100', 'CT101'], 'Announcements'),
	item('Worship', ['CB002']),
	item('Youth Camp promo', ['CF102', 'CT102']),
	item('Announcements', ['CT100']),
]

test('announcements: the T codes of announcement items, in run-sheet order, each once', () => {
	assert.deepEqual(
		wantedAnnouncements(RUN_SHEET).map((w) => [w.code, w.title]),
		[
			['CT100', 'Announcements'],
			['CT101', 'Announcements'],
			['CT102', 'Youth Camp promo'],
		],
	)
	// A walk-in's lower third is not an announcement; nor is an F code.
	assert.equal(wantedAnnouncements(RUN_SHEET)[0].file, '/storage/library/C/CT100-x.png')
})

test('announcements: AM or PM from the name, else the start time', () => {
	assert.equal(playlistFor({ name: 'Central AM 4th October', time: '18:00' }), PLAYLIST_AM)
	assert.equal(playlistFor({ name: 'Central PM 4th October', time: '09:00' }), PLAYLIST_PM)
	assert.equal(playlistFor({ name: 'Central 4th October', time: '09:30' }), PLAYLIST_AM)
	assert.equal(playlistFor({ name: 'Central 4th October', time: '18:30' }), PLAYLIST_PM)
	assert.equal(playlistFor({ name: 'Central 4th October', time: null }), null)
	assert.equal(playlistFor({ name: 'Camp', time: 'soon' }), null)
})

test('announcements: everything there, in order, is ok; headers and others are left alone', () => {
	const want = wantedAnnouncements(RUN_SHEET)
	const items = [{ uuid: 'h', name: 'Before service', type: 'header', hidden: false }, media('CT100 Welcome.png'), media('CT101 Baptisms.jpg'), media('Countdown.mov'), media('CT102 Youth Camp.png')]
	const r = checkAnnouncements(PLAYLIST_AM, want, items)
	assert.equal(r.ok, true)
	assert.equal(r.others, 2)
	assert.deepEqual(r.rows.map((x) => [x.code, x.state, x.at]), [
		['CT100', 'there', 1],
		['CT101', 'there', 2],
		['CT102', 'there', 4],
	])
})

test('announcements: missing, last week\'s, a second copy and out of order are each said', () => {
	const want = wantedAnnouncements(RUN_SHEET)
	const r = checkAnnouncements(PLAYLIST_AM, want, [media('CT101 Baptisms.jpg'), media('CT100 Welcome.png'), media('CT099 Last week.png'), media('CT100 Welcome copy.png', 'u2')])
	assert.equal(r.ok, false)
	assert.equal(r.ordered, false)
	assert.deepEqual(r.rows.find((x) => x.code === 'CT102'), { code: 'CT102', title: 'Youth Camp promo', state: 'missing', file: '/storage/library/C/CT102-x.png' })
	assert.deepEqual(r.extras.map((e) => e.code), ['CT099', 'CT100'])
})

test('announcements: a run sheet with no announcement T codes is never ok', () => {
	const r = checkAnnouncements(PLAYLIST_AM, [], [media('CT100 Welcome.png')])
	assert.equal(r.ok, false)
	assert.deepEqual(r.extras.map((e) => e.code), ['CT100'])
})

// --- ProPresenter's replies (openapi.propresenter.com's shapes; ⚠️ not yet seen live) ---

import { decodePlaylist, decodePlaylistTree, findPlaylist } from '../dist/src/bridge/propresenter-playlist.js'

const id = (name, uuid = `u-${name}`) => ({ uuid, name, index: 0 })

test('ProPresenter: playlists in groups are found by name, case and spaces aside', () => {
	const tree = [
		{ id: id('Sunday'), field_type: 'group', children: [{ id: id('Announcements AM'), field_type: 'playlist' }, { id: id('Announcements  pm'), field_type: 'playlist' }] },
		{ id: id('Songs'), field_type: 'playlist' },
	]
	const all = decodePlaylistTree(tree)
	assert.equal(all.ok, true)
	assert.deepEqual(all.value.map((p) => p.name), ['Announcements AM', 'Announcements  pm', 'Songs'])
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
