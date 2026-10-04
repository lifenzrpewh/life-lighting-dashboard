// Embeds' native half: one WebContentsView per embed, each in a session of its
// own. The owner's decisions and the shared rules are in ../shared/embeds.ts.
//
// THE RULES THIS FILE ENFORCES:
// - Its own sign-in per embed: a persistent partition named by the embed's id,
//   so a Google login in one embed is not a login in another. Removing an
//   embed clears its partition: a removed sheet leaves no account signed in.
// - It goes anywhere inside itself over http(s), because sign-in hops domains.
//   A new window (a link with target=_blank, a popup) opens in the computer's
//   own browser and never inside Pāua: a kiosk that opens windows of its own
//   has become a browser, with nothing on screen to close them.
// - No permissions (camera, microphone, location, notifications) except
//   writing to the clipboard, so copying a cell works.
// - Shown only once a page has loaded, like the MA and the Cue Manager; a load
//   that never answers fails after PANE_LOAD_TIMEOUT_MS and tries again.
// - The user agent drops Electron's and Pāua's names. Google refuses to sign
//   in "embedded browsers" it recognises by them, and the page is the
//   ordinary Chrome it otherwise is.
// - Its zoom is remembered per embed, in the data folder.

import { WebContentsView, session, shell, type BrowserWindow, type Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { isZoom, zoomStep, type Embed, type EmbedPaneState, type EmbedReport } from '../shared/embeds.js'
import { PANE_LOAD_TIMEOUT_MS, PANE_RETRY_MS, type PaneRect } from '../shared/ma-pane.js'
import { clampToWindow } from './ma-pane.js'
import { snapshotOf } from './pane-snapshot.js'

const ERR_ABORTED = -3
const ACTIVITY = new Set(['mouseDown', 'mouseWheel', 'rawKeyDown', 'keyDown', 'touchStart', 'gestureTap'])

const partitionOf = (id: string) => `persist:embed-${id}`

const isWeb = (url: string) => {
	try {
		const p = new URL(url).protocol
		return p === 'https:' || p === 'http:'
	} catch {
		return false
	}
}

/** Chrome's own user agent: this session's, without Electron or the app. */
export function plainUserAgent(ua: string): string {
	return ua
		.replace(/\s(?:Electron|paua|Paua|life-lighting-dashboard)\/\S+/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim()
}

export type EmbedPane = {
	report(): EmbedReport
	place(rect: PaneRect | null): void
	retry(): void
	zoom(by: -1 | 0 | 1): void
	snapshot(): Promise<string | null>
	host(): BrowserWindow
	moveTo(win: BrowserWindow): void
	/** Connections changed its name or address: a new address loads. */
	update(embed: Embed): void
	close(): void
}

function createEmbedPane(window: BrowserWindow, embed: Embed, zoom: number, onZoom: (z: number) => void): EmbedPane {
	const ses = session.fromPartition(partitionOf(embed.id))
	ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'))
	ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')
	ses.setUserAgent(plainUserAgent(ses.getUserAgent()))

	const view = new WebContentsView({
		webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
	})
	view.setBackgroundColor('#0a0a0b')
	view.setVisible(false)
	window.contentView.addChildView(view)
	const wc = view.webContents
	let label = embed.name
	const name = () => `embed "${label}"`

	let host = window
	let home = embed.url
	let state: EmbedPaneState = { state: 'idle', url: home }
	let wanted = false
	let rect: Rectangle | null = null
	let lastInputAt: number | null = null
	let factor = zoom
	let retryTimer: ReturnType<typeof setTimeout> | null = null
	let loadTimer: ReturnType<typeof setTimeout> | null = null
	let closed = false

	const clearTimers = () => {
		if (retryTimer !== null) clearTimeout(retryTimer)
		if (loadTimer !== null) clearTimeout(loadTimer)
		retryTimer = null
		loadTimer = null
	}

	const apply = () => {
		if (closed) return
		const visible = wanted && rect !== null && state.state === 'showing'
		if (visible && rect !== null) view.setBounds(rect)
		view.setVisible(visible)
	}

	function fail(detail: string, cause: 'error' | 'no-answer' = 'error') {
		clearTimers()
		const now = Date.now()
		if (state.state !== 'failed') console.error(`[kiosk] ${name()}: ${detail}; trying again every ${PANE_RETRY_MS / 1000} s`)
		state = { state: 'failed', url: state.url, at: now, cause, detail, retryAt: now + PANE_RETRY_MS }
		apply()
		retryTimer = setTimeout(() => connect(home), PANE_RETRY_MS)
	}

	const watchLoad = () => {
		loadTimer = setTimeout(() => {
			loadTimer = null
			wc.stop()
			fail(`no answer in ${PANE_LOAD_TIMEOUT_MS / 1000} s`, 'no-answer')
		}, PANE_LOAD_TIMEOUT_MS)
	}

	function connect(url: string) {
		if (closed) return
		clearTimers()
		state = { state: 'connecting', url, since: Date.now() }
		apply()
		watchLoad()
		wc.loadURL(url).catch(() => {
			// Reported through did-fail-load, with the reason.
		})
	}

	let httpFailure: string | null = null
	wc.on('did-navigate', (_e, url, code, text) => {
		httpFailure = code >= 400 ? `HTTP ${code} ${text}` : null
		if (state.state !== 'failed') state = { ...state, url }
	})
	wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
		if (isMainFrame && state.state !== 'failed') state = { ...state, url }
	})
	wc.on('did-finish-load', () => {
		clearTimers()
		wc.setZoomFactor(factor)
		if (httpFailure !== null) return fail(httpFailure)
		if (state.state === 'showing') return
		console.log(`[kiosk] ${name()}: showing ${new URL(wc.getURL()).host}`)
		state = { state: 'showing', url: wc.getURL(), since: Date.now() }
		apply()
	})
	wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
		if (!isMainFrame || code === ERR_ABORTED) return
		fail(description)
	})
	wc.on('render-process-gone', (_e, details) => fail(`the page crashed (${details.reason})`))
	wc.on('input-event', (_e, input) => {
		if (ACTIVITY.has(input.type)) lastInputAt = Date.now()
	})

	wc.setWindowOpenHandler(({ url }) => {
		if (isWeb(url)) {
			console.log(`[kiosk] ${name()}: opened ${new URL(url).host} in the computer's browser`)
			void shell.openExternal(url)
		}
		return { action: 'deny' }
	})
	const webOnly = (e: { preventDefault(): void; url: string }) => {
		if (!isWeb(e.url)) e.preventDefault()
	}
	wc.on('will-navigate', webOnly)
	wc.on('will-redirect', webOnly)

	return {
		report: () => ({ id: embed.id, name: label, pane: state, zoom: factor, lastInputAt }),

		snapshot: () => snapshotOf(view, wanted && rect !== null && state.state === 'showing'),

		host: () => host,

		moveTo(win) {
			if (win === host || closed) return
			if (!host.isDestroyed()) host.contentView.removeChildView(view)
			win.contentView.addChildView(view)
			host = win
			rect = null
			apply()
		},

		place(next) {
			if (closed) return
			wanted = true
			rect = next === null ? null : clampToWindow(next, host)
			// Opened the first time it has somewhere to be: an embed in no slot
			// costs nothing, however many a booth adds.
			if (state.state === 'idle' && rect !== null) connect(home)
			else apply()
		},

		retry() {
			if (state.state === 'failed' || state.state === 'idle') return connect(home)
			clearTimers()
			watchLoad()
			wc.reload()
		},

		zoom(by) {
			factor = zoomStep(factor, by)
			if (state.state === 'showing') wc.setZoomFactor(factor)
			onZoom(factor)
		},

		update(next) {
			label = next.name
			if (next.url === home) return
			home = next.url
			if (state.state !== 'idle') connect(home)
			else state = { state: 'idle', url: home }
		},

		close() {
			if (closed) return
			closed = true
			clearTimers()
			if (!host.isDestroyed()) host.contentView.removeChildView(view)
			wc.close()
		},
	}
}

export type Embeds = {
	reports(): EmbedReport[]
	pane(id: string): EmbedPane | undefined
	/** Every embed's pane that exists, to picture or move. */
	panes(): EmbedPane[]
	/** Settings changed: open, update and close panes to match. */
	sync(embeds: readonly Embed[]): void
}

/** The panes for every embed that is on, created as settings name them. A
 *  pane opens its page only once something places it. */
export function createEmbeds(window: BrowserWindow, dataDir: string): Embeds {
	const zoomFile = path.join(dataDir, 'embed-zoom.json')
	const panes = new Map<string, EmbedPane>()
	let known = new Set<string>()
	let first = true

	/** Folders of embeds removed in an earlier run, whose session never
	 *  opened this run, so nothing holds them. A removal while running clears
	 *  the session; its empty folder goes at the next start. */
	const sweep = (ids: ReadonlySet<string>) => {
		const dir = path.join(dataDir, 'Partitions')
		let names: string[] = []
		try {
			names = fs.readdirSync(dir)
		} catch {
			return
		}
		for (const name of names) {
			const id = /^embed-([a-z0-9]+)$/.exec(name)?.[1]
			if (id === undefined || ids.has(id)) continue
			try {
				fs.rmSync(path.join(dir, name), { recursive: true, force: true })
				console.log(`[kiosk] removed what embed ${id} left on this computer`)
			} catch (e) {
				console.error(`[kiosk] could not remove what embed ${id} left: ${(e as Error).message}`)
			}
		}
	}

	const readZooms = (): Record<string, number> => {
		try {
			const raw: unknown = JSON.parse(fs.readFileSync(zoomFile, 'utf8'))
			if (typeof raw !== 'object' || raw === null) return {}
			return Object.fromEntries(Object.entries(raw).filter(([, z]) => isZoom(z))) as Record<string, number>
		} catch {
			return {}
		}
	}
	const writeZooms = (zooms: Record<string, number>) => {
		try {
			fs.mkdirSync(path.dirname(zoomFile), { recursive: true })
			fs.writeFileSync(zoomFile, JSON.stringify(zooms))
		} catch (e) {
			console.error(`[kiosk] could not remember an embed's zoom: ${(e as Error).message}`)
		}
	}
	const remember = (id: string, z: number) => writeZooms({ ...readZooms(), [id]: z })

	const sync = (embeds: readonly Embed[]) => {
		const zooms = readZooms()
		const ids = new Set(embeds.map((e) => e.id))
		if (first) {
			first = false
			sweep(ids)
		}
		for (const embed of embeds) {
			const pane = panes.get(embed.id)
			if (!embed.on) {
				// Off: the page closes, its sign-in stays for when it is back on.
				pane?.close()
				panes.delete(embed.id)
				continue
			}
			if (pane === undefined) panes.set(embed.id, createEmbedPane(window, embed, zooms[embed.id] ?? 1, (z) => remember(embed.id, z)))
			else pane.update(embed)
		}
		for (const id of known) {
			if (ids.has(id)) continue
			// Removed: its page, its zoom and its sign-in all go.
			panes.get(id)?.close()
			panes.delete(id)
			const { [id]: _gone, ...rest } = zooms
			writeZooms(rest)
			const ses = session.fromPartition(partitionOf(id))
			void Promise.all([ses.clearStorageData(), ses.clearCache()])
				.then(() => console.log(`[kiosk] embed ${id} removed, and its sign-in forgotten`))
				.catch((e: unknown) => console.error(`[kiosk] embed ${id}: could not forget its sign-in: ${String(e)}`))
		}
		known = ids
	}

	window.on('closed', () => {
		for (const p of panes.values()) p.close()
		panes.clear()
	})

	return {
		reports: () => [...panes.values()].map((p) => p.report()),
		pane: (id) => panes.get(id),
		panes: () => [...panes.values()],
		sync,
	}
}
