// Watch one clip's transport over Arena's websocket, for the clip countdown
// (docs/VISUALS_DASHBOARD.md, piece 3). Read-only: it only ever subscribes.
//
//   node spikes/arena-transport.mjs [host:port] [layer] [clip] [seconds]
//
// Layer and clip count from 1 as Arena numbers them (layer 1 is the bottom).
// Subscribes to the clip's `connected`, its transport `position`, and the
// controls (playmode, direction, speed, duration). Position arrives at the
// composition frame rate, so it is logged once a second, with how far it moved
// in that second; everything else is logged as it changes.

const [at = '127.0.0.1:8080', layerNo = '1', clipNo = '1', seconds = '120'] = process.argv.slice(2)
const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`

const ws = new WebSocket(`ws://${at}/api/v1`)
const names = new Map()
let lastPos = null
let lastPosLogged = { at: 0, value: null }
let updates = 0

const subscribe = (param, label) => {
	if (param?.id === undefined) return console.log(`${stamp()} no ${label} on this clip`)
	names.set(param.id, label)
	ws.send(JSON.stringify({ action: 'subscribe', parameter: `/parameter/by-id/${param.id}` }))
}

let first = true
ws.addEventListener('message', (e) => {
	const msg = JSON.parse(String(e.data))
	if (Array.isArray(msg.layers)) {
		const clip = msg.layers[Number(layerNo) - 1]?.clips?.[Number(clipNo) - 1]
		if (!clip) return console.log(`${stamp()} no clip at layer ${layerNo} clip ${clipNo}`)
		if (!first) return console.log(`${stamp()} composition pushed, clip is ${clip.connected?.value}`)
		first = false
		const c = clip.transport?.controls ?? {}
		console.log(`${stamp()} watching "${clip.name?.value}" on ${msg.layers[Number(layerNo) - 1].name?.value}, file ${clip.video?.fileinfo?.duration_ms} ms`)
		console.log(`         transporttype ${JSON.stringify(clip.transporttype?.value)}, position max ${clip.transport?.position?.max}`)
		subscribe(clip.connected, 'connected')
		subscribe(clip.transport?.position, 'position')
		for (const k of Object.keys(c)) subscribe(c[k], k)
		return
	}
	if (msg.type !== 'parameter_update' && msg.type !== 'parameter_subscribed') return
	const label = names.get(msg.id) ?? msg.id
	if (label === 'position') {
		updates++
		const now = Date.now()
		if (lastPosLogged.value === null || now - lastPosLogged.at >= 1000 || msg.type === 'parameter_subscribed') {
			const moved = lastPosLogged.value === null ? '' : `  (+${(msg.value - lastPosLogged.value).toFixed(0)} ms in ${now - lastPosLogged.at} ms, ${updates} updates)`
			console.log(`${stamp()} position ${msg.value.toFixed(0)} / ${msg.max ?? '?'}${moved}`)
			lastPosLogged = { at: now, value: msg.value }
			updates = 0
		} else if (lastPos !== null && msg.value < lastPos - 100) {
			console.log(`${stamp()} position jumped back ${lastPos.toFixed(0)} → ${msg.value.toFixed(0)}`)
		}
		lastPos = msg.value
		return
	}
	console.log(`${stamp()} ${msg.type === 'parameter_subscribed' ? 'now' : 'CHANGED'} ${label} = ${JSON.stringify(msg.value)}`)
})
ws.addEventListener('close', () => process.exit(0))
setTimeout(() => ws.close(), Number(seconds) * 1000)
