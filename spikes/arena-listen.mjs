// Listen to Arena's websocket and report what it says unasked, and what it says
// once asked. Read-only: the only thing it ever sends is `subscribe`.
//
//   node spikes/arena-listen.mjs [host] [seconds] [--no-subscribe]
//
// On connect Arena sends the whole composition (~1.3 MB). From it this takes the
// parameters piece 2 needs, every clip's `connected`, every layer's master and
// bypass, the composition master, and subscribes to each, unless --no-subscribe,
// which shows only what Arena pushes of its own accord. Every message after the
// first is logged by kind, with parameter updates folded per id so a playing clip's
// ~50/s position does not bury a clip connecting.

const args = process.argv.slice(2)
const subscribe = !args.includes('--no-subscribe')
const [host = '127.0.0.1', seconds = '60'] = args.filter((a) => !a.startsWith('--'))
const url = `ws://${host}:8080/api/v1`

const t0 = Date.now()
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`

const names = new Map() // parameter id → what it is, for the log
const counts = new Map() // message kind → how many
const lastSeen = new Map() // parameter id → last value logged

const ws = new WebSocket(url)
ws.addEventListener('open', () => console.log(`${at()} open ${url}`))
ws.addEventListener('error', (e) => console.log(`${at()} error ${e.message ?? e.type}`))
ws.addEventListener('close', (e) => {
	console.log(`${at()} closed ${e.code}`)
	report()
})

let first = true
ws.addEventListener('message', (e) => {
	const text = typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString()
	let msg
	try {
		msg = JSON.parse(text)
	} catch {
		console.log(`${at()} not JSON, ${text.length} bytes`)
		return
	}
	const kind = msg.type ?? msg.action ?? (msg.layers ? 'composition' : 'unknown')
	counts.set(kind, (counts.get(kind) ?? 0) + 1)

	if (msg.layers) {
		console.log(`${at()} composition, ${text.length} bytes, ${msg.layers.length} layers${first ? '' : '  ← PUSHED AGAIN'}`)
		if (first) {
			first = false
			learn(msg)
			if (subscribe) for (const id of names.keys()) ws.send(JSON.stringify({ action: 'subscribe', parameter: `/parameter/by-id/${id}` }))
			if (subscribe) console.log(`${at()} subscribed to ${names.size} parameters`)
		} else {
			diffClips(msg)
		}
		return
	}
	if (kind === 'parameter_update' || kind === 'parameter_subscribed') {
		const id = msg.id ?? Number(String(msg.path ?? '').split('/').pop())
		const value = JSON.stringify(msg.value)
		if (lastSeen.get(id) === value && kind === 'parameter_update') return
		lastSeen.set(id, value)
		console.log(`${at()} ${kind} ${names.get(id) ?? id} = ${value}`)
		return
	}
	console.log(`${at()} ${kind} ${text.length} bytes ${text.slice(0, 200)}`)
})

const clipStates = new Map()
function learn(comp) {
	const add = (param, label) => param?.id !== undefined && names.set(param.id, label)
	add(comp.master, 'composition master')
	for (const layer of comp.layers) {
		const ln = layer.name?.value ?? layer.id
		add(layer.master, `${ln} master`)
		add(layer.bypassed, `${ln} bypassed`)
		layer.clips.forEach((clip, i) => {
			if (!clip.connected) return
			clipStates.set(clip.id, clip.connected.value)
			add(clip.connected, `${ln} clip ${i + 1} (${clip.name?.value ?? ''}) connected`)
		})
	}
	for (const deck of comp.decks ?? []) add(deck.selected, `deck ${deck.name?.value} selected`)
}

function diffClips(comp) {
	for (const layer of comp.layers)
		for (const clip of layer.clips) {
			const was = clipStates.get(clip.id)
			const now = clip.connected?.value
			if (was !== now) console.log(`         ${layer.name?.value} ${clip.name?.value}: ${was} → ${now}`)
			clipStates.set(clip.id, now)
		}
}

function report() {
	console.log('\nmessages by kind:')
	for (const [k, n] of counts) console.log(`  ${k}: ${n}`)
	process.exit(0)
}

setTimeout(() => ws.close(), Number(seconds) * 1000)
