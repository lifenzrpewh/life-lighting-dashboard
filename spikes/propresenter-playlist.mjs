// Can Pāua keep ProPresenter's announcement playlist up to date? (2026-10-08)
//
// ProPresenter's API cannot import a file (openapi.propresenter.com, read in
// full): it can list playlists and media playlists, and PUT a playlist's whole
// item list, by UUIDs ProPresenter already knows. So the route under test is:
// Pāua copies the week's announcement files into a folder that a Media Bin
// Smart Playlist follows (ProPresenter gives each a UUID), then PUTs the
// presentation playlist as its own non-announcement items, untouched and in
// place, followed by those media items in run-sheet order.
//
// Read-only unless --write is given. Run on the booth box:
//   node spikes/propresenter-playlist.mjs                      list playlists and media playlists
//   node spikes/propresenter-playlist.mjs show "Announcements" one playlist's items, raw
//   node spikes/propresenter-playlist.mjs media "Smart"        one media playlist's items (uuid, name)
//   node spikes/propresenter-playlist.mjs append "Announcements" <media-uuid> --write
//       PUT the playlist back as it is plus one media item, then GET it again
// Options: --host 127.0.0.1 --port 1025

const args = process.argv.slice(2)
const opt = (name, dflt) => {
	const i = args.indexOf(`--${name}`)
	if (i < 0) return dflt
	const v = args[i + 1]
	args.splice(i, 2)
	return v
}
const host = opt('host', '127.0.0.1')
const port = opt('port', '1025')
const write = args.includes('--write')
const [verb = 'list', target, extra] = args.filter((a) => a !== '--write')
const base = `http://${host}:${port}`

async function api(method, path, body) {
	const res = await fetch(base + path, {
		method,
		headers: body === undefined ? {} : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(5000),
	})
	const text = await res.text()
	if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`)
	return text === '' ? null : JSON.parse(text)
}

const enc = (s) => encodeURIComponent(s)

function walk(nodes, depth = 0) {
	for (const n of nodes ?? []) {
		console.log(`${'  '.repeat(depth)}${n.field_type ?? n.type ?? ''}  ${n.id?.name}  ${n.id?.uuid}`)
		walk(n.children, depth + 1)
	}
}

try {
	if (verb === 'list') {
		console.log('— presentation playlists —')
		walk(await api('GET', '/v1/playlists'))
		console.log('\n— media playlists —')
		walk(await api('GET', '/v1/media/playlists'))
	} else if (verb === 'show') {
		console.log(JSON.stringify(await api('GET', `/v1/playlist/${enc(target)}`), null, 2))
	} else if (verb === 'media') {
		const r = await api('GET', `/v1/media/playlist/${enc(target)}`)
		for (const it of r?.items ?? []) console.log(`${it.type}  ${it.id?.name}  ${it.id?.uuid}  ${it.duration ?? ''}`)
		if (!r?.items) console.log(JSON.stringify(r, null, 2))
	} else if (verb === 'append') {
		if (!target || !extra) throw new Error('append <playlist> <media-uuid> --write')
		const before = await api('GET', `/v1/playlist/${enc(target)}`)
		const items = before.items.map(({ id, type, is_hidden, is_pco, header_color }) =>
			header_color === undefined ? { id, type, is_hidden, is_pco } : { id, type, is_hidden, is_pco, header_color },
		)
		items.push({ id: { uuid: extra, name: '', index: items.length }, type: 'media', is_hidden: false, is_pco: false })
		console.log(`PUT /v1/playlist/${target}: ${before.items.length} items + 1`)
		if (!write) {
			console.log(JSON.stringify(items, null, 2))
			console.log('\nNothing sent: add --write to send it.')
		} else {
			await api('PUT', `/v1/playlist/${enc(target)}`, items)
			const after = await api('GET', `/v1/playlist/${enc(target)}`)
			console.log(`Read back: ${after.items.length} items`)
			for (const it of after.items) console.log(`  ${it.type}  ${it.id?.name}  ${it.id?.uuid}`)
		}
	} else {
		throw new Error(`unknown verb ${verb}`)
	}
} catch (e) {
	console.error(String(e?.message ?? e))
	process.exit(1)
}
