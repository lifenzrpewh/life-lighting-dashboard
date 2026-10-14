// NDI sources as views (../shared/ndi.ts): main's half. Main starts the worker
// that holds NDI (./ndi-worker.ts), tells it which sources are added, and
// introduces each page that shows one to it over a MessagePort of their own,
// so frames never pass through main.
//
// THE RULES THIS FILE ENFORCES:
// - The worker starts the first time something asks about NDI, so a booth
//   that never adds a source never loads NDI.
// - A worker that dies is started again after 5 s, and every page that was
//   watching is handed a new port, so a crash costs a moment's picture, not
//   the view. Five deaths in two minutes and it is left down, said in the log
//   and in the views.
// - A page's watch ends when it says so, when its port closes, or when the
//   page goes: a reloaded kiosk is not left being sent frames.

import { MessageChannelMain, utilityProcess, type UtilityProcess, type WebContents } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { NdiSource, NdiState } from '../shared/ndi.js'

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ndi-worker.js')
const RESTART_MS = 5_000
const GIVE_UP = { deaths: 5, withinMs: 120_000 }

export type Ndi = {
	/** What NDI has found and how each added source is received. */
	state(): NdiState
	/** The sources as settings have them now. */
	setSources(sources: readonly NdiSource[]): void
	/** `page` shows source `id`, under its own `token`: it is sent a port. */
	watch(page: WebContents, id: string, token: string): void
	unwatch(page: WebContents, token: string): void
	/** Every watch of `page` ends: it is reloading, and its own cleanup does
	 *  not run on a reload. */
	forget(page: WebContents): void
	stop(): void
}

type Watch = { page: WebContents; id: string; token: string }

export function createNdi(): Ndi {
	let worker: UtilityProcess | null = null
	let workerState: NdiState = { runtime: null, found: [], feeds: [] }
	let sources: readonly NdiSource[] = []
	const watches = new Map<string, Watch>()
	/** The pages with a 'destroyed' listener of ours on them. */
	const listening = new WeakSet<WebContents>()
	const deaths: number[] = []
	let stopped = false
	let gaveUp: string | null = null
	let restart: ReturnType<typeof setTimeout> | null = null

	const keyOf = (page: WebContents, token: string) => `${page.id}:${token}`
	const onSources = () => sources.filter((s) => s.on).map((s) => ({ id: s.id, source: s.source }))

	/** Introduce `w`'s page to the worker over a fresh pair of ports. */
	const connect = (w: Watch) => {
		if (worker === null || w.page.isDestroyed()) return
		const { port1, port2 } = new MessageChannelMain()
		worker.postMessage({ type: 'watch', key: keyOf(w.page, w.token), id: w.id }, [port1])
		w.page.postMessage('ndi:port', { token: w.token }, [port2])
	}

	const spawn = () => {
		if (stopped || worker !== null || gaveUp !== null) return
		const child = utilityProcess.fork(WORKER, [], { serviceName: 'Paua NDI', stdio: 'pipe' })
		worker = child
		child.stdout?.on('data', (d: Buffer) => console.log(`[ndi] ${String(d).trimEnd()}`))
		child.stderr?.on('data', (d: Buffer) => console.error(`[ndi] ${String(d).trimEnd()}`))
		child.on('message', (m: unknown) => {
			const msg = m as { type?: unknown; line?: unknown; state?: unknown }
			if (msg.type === 'log' && typeof msg.line === 'string') console.log(`[ndi] ${msg.line}`)
			if (msg.type === 'state' && typeof msg.state === 'object' && msg.state !== null) workerState = msg.state as NdiState
		})
		child.on('exit', (code) => {
			if (worker !== child) return
			worker = null
			workerState = { ...workerState, feeds: [] }
			if (stopped) return
			const now = Date.now()
			deaths.push(now)
			while (deaths.length > 0 && now - deaths[0]! > GIVE_UP.withinMs) deaths.shift()
			if (deaths.length >= GIVE_UP.deaths) {
				gaveUp = `NDI stopped ${deaths.length} times in two minutes and was left off. Restart Pāua to try again.`
				console.error(`[ndi] ${gaveUp}`)
				return
			}
			console.error(`[ndi] the NDI process ended (code ${code}); starting it again in ${RESTART_MS / 1000} s`)
			restart = setTimeout(() => {
				restart = null
				spawn()
				worker?.postMessage({ type: 'sources', sources: onSources() })
				for (const w of watches.values()) connect(w)
			}, RESTART_MS)
		})
		child.postMessage({ type: 'sources', sources: onSources() })
	}

	return {
		state() {
			spawn()
			const runtime: NdiState['runtime'] = gaveUp !== null ? { ok: false, detail: gaveUp } : workerState.runtime
			return {
				runtime,
				found: workerState.found,
				feeds: sources
					.filter((s) => s.on)
					.map((s) => {
						const f = workerState.feeds.find((x) => x.id === s.id && x.source === s.source)
						return f === undefined
							? { id: s.id, name: s.name, source: s.source, watched: false, lastFrame: null, fps: 0, failure: null }
							: { ...f, name: s.name }
					}),
			}
		},
		setSources(next) {
			sources = next
			// Watches of a source removed or turned off end; the page's own view
			// leaves the screen with it.
			for (const [key, w] of watches) {
				if (!sources.some((s) => s.id === w.id && s.on)) {
					watches.delete(key)
					worker?.postMessage({ type: 'unwatch', key })
				}
			}
			worker?.postMessage({ type: 'sources', sources: onSources() })
		},
		watch(page, id, token) {
			if (!sources.some((s) => s.id === id && s.on)) return
			spawn()
			const key = keyOf(page, token)
			const w = { page, id, token }
			watches.set(key, w)
			// Once per page for its life, not once per watch: the kiosk's page
			// lives all day and watches again on every tab switch and pop-out,
			// as the video feed's (./video-feed.ts).
			if (!listening.has(page)) {
				listening.add(page)
				page.once('destroyed', () => {
					listening.delete(page)
					for (const [k, x] of watches) {
						if (x.page !== page) continue
						watches.delete(k)
						worker?.postMessage({ type: 'unwatch', key: k })
					}
				})
			}
			connect(w)
		},
		unwatch(page, token) {
			const key = keyOf(page, token)
			if (!watches.delete(key)) return
			worker?.postMessage({ type: 'unwatch', key })
		},
		forget(page) {
			for (const [key, w] of watches) {
				if (w.page !== page) continue
				watches.delete(key)
				worker?.postMessage({ type: 'unwatch', key })
			}
		},
		stop() {
			stopped = true
			if (restart !== null) clearTimeout(restart)
			worker?.kill()
			worker = null
		},
	}
}
