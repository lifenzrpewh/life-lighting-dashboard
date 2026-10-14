// The Cue Manager pane's native half: a WebContentsView holding the visuals app.
//
// WHY THIS EXISTS: see src/shared/cue-pane.ts. This is the part that touches
// the network page, so it is where the guarantees are enforced.
//
// THE RULES THIS FILE ENFORCES:
// - Shown only once a page has loaded, as the MA pane is (./ma-pane.ts). Until
//   then the renderer's placeholder, underneath, says why.
// - Kept, not forgotten. Unlike the MA pane's in-memory session, this one is
//   persistent: the app's sign-in, its service worker and its offline queue of
//   unsent notes live in it, and a restart that dropped them would sign the
//   booth out and lose edits made while the network was down. Operator
//   Settings can clear it.
// - Locked to the app's own origin: no popups, no permissions, no leaving.
//   Sign-in stays inside it (an emailed code, or the app's own QR), so nothing
//   needs to go anywhere else, and a kiosk that follows a link out has become a
//   browser.
// - Nothing is stuck for good: a load that never answers fails after
//   PANE_LOAD_TIMEOUT_MS and tries again, like the MA pane's.

import { WebContentsView, session, type BrowserWindow, type Rectangle } from 'electron'

import { KIOSK_USER_AGENT_MARK, planOf, type CuePaneReport, type CuePaneState } from '../shared/cue-pane.js'
import { PANE_LOAD_TIMEOUT_MS, PANE_RETRY_MS, isWebRemote as sameOrigin, type PaneRect } from '../shared/ma-pane.js'
import { clampToWindow } from './ma-pane.js'
import { snapshotOf } from './pane-snapshot.js'

/** The Cue Manager (visuals-song-comms), same-origin with its API behind Caddy. */
const CUE_MANAGER_URL = 'https://visuals.prodapps.life'

const ERR_ABORTED = -3
const ACTIVITY = new Set(['mouseDown', 'mouseWheel', 'rawKeyDown', 'keyDown', 'touchStart', 'gestureTap'])

export type CuePane = {
	report(): CuePaneReport
	/** Want the pane at `rect`; null hides it and keeps the page, as folding
	 *  the column does. */
	place(rect: PaneRect | null): void
	/** Try now when it failed; reload the page it is on otherwise. */
	retry(): void
	/** Operator Settings: sign the app out and forget everything it kept here. */
	reset(): Promise<void>
	/** A picture of the page as it is, while it is on screen (./pane-snapshot.ts). */
	snapshot(): Promise<string | null>
	/** The window the pane is in: the kiosk, or its pop-out (./popout.ts). */
	host(): BrowserWindow
	/** Move the pane, page and all, into `win`. It stays hidden there until
	 *  that window's page places it. */
	moveTo(win: BrowserWindow): void
}

export function createCuePane(window: BrowserWindow): CuePane {
	const home = `${CUE_MANAGER_URL}/`
	const ses = session.fromPartition('persist:cue-manager')
	ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
	ses.setPermissionCheckHandler(() => false)
	ses.setUserAgent(`${ses.getUserAgent()} ${KIOSK_USER_AGENT_MARK}`)

	const view = new WebContentsView({
		webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
	})
	view.setBackgroundColor('#0a0a0b')
	view.setVisible(false)
	window.contentView.addChildView(view)
	const wc = view.webContents

	/** Where the pane is drawn. The kiosk, unless it has been popped out. */
	let host = window

	/** Where the app is, so a reload or a retry comes back to the same run
	 *  sheet rather than to the list of services. */
	let at = home
	let state: CuePaneState = { state: 'idle', url: home }
	let wanted = false
	let rect: Rectangle | null = null
	let lastInputAt: number | null = null
	let retryTimer: ReturnType<typeof setTimeout> | null = null
	let loadTimer: ReturnType<typeof setTimeout> | null = null

	const clearTimers = () => {
		if (retryTimer !== null) clearTimeout(retryTimer)
		if (loadTimer !== null) clearTimeout(loadTimer)
		retryTimer = null
		loadTimer = null
	}

	const apply = () => {
		const visible = wanted && rect !== null && state.state === 'showing'
		if (visible && rect !== null) view.setBounds(rect)
		view.setVisible(visible)
	}

	function fail(detail: string, cause: 'error' | 'no-answer' = 'error') {
		clearTimers()
		const now = Date.now()
		if (state.state !== 'failed') console.error(`[kiosk] Cue Manager: ${detail}; trying again every ${PANE_RETRY_MS / 1000} s`)
		state = { state: 'failed', url: at, at: now, cause, detail, retryAt: now + PANE_RETRY_MS }
		apply()
		retryTimer = setTimeout(connect, PANE_RETRY_MS)
	}

	/** Give up on a load that has not finished in PANE_LOAD_TIMEOUT_MS. */
	const watchLoad = () => {
		loadTimer = setTimeout(() => {
			loadTimer = null
			wc.stop()
			fail(`no answer in ${PANE_LOAD_TIMEOUT_MS / 1000} s`, 'no-answer')
		}, PANE_LOAD_TIMEOUT_MS)
	}

	function connect() {
		clearTimers()
		state = { state: 'connecting', url: at, since: Date.now() }
		apply()
		watchLoad()
		wc.loadURL(at).catch(() => {
			// Reported through did-fail-load, with the reason.
		})
	}

	// A 4xx/5xx still finishes loading; catch it where the status is known.
	let httpFailure: string | null = null
	wc.on('did-navigate', (_e, url, code, text) => {
		httpFailure = sameOrigin(url, home) && code >= 400 ? `HTTP ${code} ${text}` : null
		if (sameOrigin(url, home)) at = url
	})
	// The app moves between pages without loading (a single-page app), so this
	// is where it is most of the time.
	wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
		if (isMainFrame && sameOrigin(url, home)) at = url
	})
	wc.on('did-finish-load', () => {
		if (!sameOrigin(wc.getURL(), home)) return
		clearTimers()
		if (httpFailure !== null) return fail(httpFailure)
		if (state.state === 'showing') return
		console.log(`[kiosk] Cue Manager: showing ${at}`)
		state = { state: 'showing', url: at, since: Date.now() }
		apply()
	})
	wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
		if (!isMainFrame || code === ERR_ABORTED) return
		fail(description)
	})
	wc.on('render-process-gone', (_e, details) => fail(`the Cue Manager page crashed (${details.reason})`))
	wc.on('input-event', (_e, input) => {
		if (ACTIVITY.has(input.type)) lastInputAt = Date.now()
	})

	wc.setWindowOpenHandler(() => ({ action: 'deny' }))
	const stayHome = (e: { preventDefault(): void }, to: string) => {
		if (!sameOrigin(to, home)) e.preventDefault()
	}
	wc.on('will-navigate', (e) => stayHome(e, e.url))
	wc.on('will-redirect', (e) => stayHome(e, e.url))

	window.on('closed', () => {
		clearTimers()
		wc.close()
	})

	return {
		// `at`, not the state's url: the app moves between services in-page.
		report: () => ({ pane: state, lastInputAt, plan: planOf(at) }),

		snapshot: () => snapshotOf(view, wanted && rect !== null && state.state === 'showing'),

			host: () => host,

			moveTo(win) {
				if (win === host) return
				if (!host.isDestroyed()) host.contentView.removeChildView(view)
				win.contentView.addChildView(view)
				host = win
				rect = null
				apply()
			},

		place(next) {
			wanted = true
			rect = next === null ? null : clampToWindow(next, host)
			if (state.state === 'idle') connect()
			else apply()
		},

		retry() {
			if (state.state === 'failed' || state.state === 'idle') return connect()
			// A reload keeps the picture up until the new one paints, and comes
			// back to the same page. The app keeps unsent notes across it.
			clearTimers()
			watchLoad()
			wc.reload()
		},

		async reset() {
			clearTimers()
			await ses.clearStorageData()
			await ses.clearCache()
			at = home
			connect()
		},
	}
}
