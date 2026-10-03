// The MA pane's native half: a WebContentsView holding the console's web remote.
//
// WHY THIS EXISTS: see src/shared/ma-pane.ts. This file is the part that
// actually touches a network page, so it is where the guarantees are enforced.
//
// THE RULES THIS FILE ENFORCES:
// - Main owns the target. The renderer says where the pane goes and which mode
//   the screen is in, never what it loads. The address and logins come from
//   settings, and a password never goes back across IPC.
// - The page is shown only once it has loaded. Until then the view is hidden
//   and the renderer's own placeholder, underneath it, says why. Chromium's
//   error page must never be what someone sees where the MA should be.
// - A change of user is a fresh session. Switching mode clears the pane's
//   storage before it logs in again, so operator rights cannot linger in a
//   cookie after the screen has dropped back to volunteer.
// - Nothing gets out: no preload, sandboxed, locked to the console's origin, no
//   popups, no permissions, and an in-memory session so nothing is kept on disk.
// - Nothing is stuck for good. A load that never answers fails after
//   PANE_LOAD_TIMEOUT_MS, and a page that says something MA never recovers
//   from by itself (src/shared/ma-pane.ts, RemoteSays) is logged in afresh.
//   The page is read for that and nothing else: what it says is never shown
//   as ours, and never taken as proof the console is live.
//
// A native view is drawn above the renderer, so no DOM can overlay it. The
// layout therefore gives the pane a rect of its own, and anything that must be
// said about the pane sits beside it, never on top.

import { WebContentsView, session, type BrowserWindow, type Rectangle } from 'electron'

import {
	PANE_LOAD_TIMEOUT_MS,
	PANE_RETRY_MS,
	PANE_STUCK_MS,
	isWebRemote,
	needsReload,
	remoteSays,
	webRemoteLogin,
	webRemoteUrl,
	type MaPaneReport,
	type MaPaneState,
	type Mode,
	type RemoteSays,
	type PaneRect,
} from '../shared/ma-pane.js'
import type { SettingsStore } from './settings.js'
import { snapshotOf } from './pane-snapshot.js'

/** Chromium's code for a load we cancelled ourselves, as a release does. Not a
 *  failure, and reporting it as one would flash an error at every mode switch. */
const ERR_ABORTED = -3

/** Input that means a person is using the pane. Mouse moves are left out: a
 *  cursor resting on the pane drifts, and that is not someone working. */
const ACTIVITY = new Set(['mouseDown', 'mouseWheel', 'rawKeyDown', 'keyDown', 'touchStart', 'gestureTap'])

/** A world of our own inside the page, so reading its overlay runs none of the
 *  page's code and the page cannot reach ours. */
const READ_WORLD = 1001
const READ_OVERLAY = `(() => { const t = document.getElementById('startOverlayText'); return t === null ? null : t.innerText })()`
const WATCH_MS = 2_000

export type MaPane = {
	report(): MaPaneReport
	/** Want the pane, at `rect`. Null keeps the connection but hides the pane,
	 *  as the settings panel does when it takes the pane's place. */
	place(rect: PaneRect | null): void
	/** Log the pane in as this mode's user, if it is not already. */
	setMode(mode: Mode): void
	/** Stop wanting the pane, close its connection, and forget the mode. */
	release(): void
	/** Try now, when it failed; Reload MA, a fresh login, otherwise. */
	retry(): void
	/** A picture of the page as it is, while it is on screen (./pane-snapshot.ts). */
	snapshot(): Promise<string | null>
}

type Target = { url: string; login: string; user: string }

export function createMaPane(window: BrowserWindow, settings: SettingsStore): MaPane {
	const ses = session.fromPartition('ma-remote')
	ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
	ses.setPermissionCheckHandler(() => false)

	const view = new WebContentsView({
		webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
	})
	view.setBackgroundColor('#0a0a0b')
	view.setVisible(false)
	window.contentView.addChildView(view)
	const wc = view.webContents

	let mode: Mode = 'volunteer'
	let target: Target | null = null
	let state: MaPaneState = { state: 'no-address' }
	let wanted = false
	let rect: Rectangle | null = null
	let lastInputAt: number | null = null
	let retryTimer: ReturnType<typeof setTimeout> | null = null
	let loadTimer: ReturnType<typeof setTimeout> | null = null
	/** Since when the page has said something it will not leave by itself. */
	let stuckSince: number | null = null
	/** Counts loads, so an overlay read cannot land on the page after it. */
	let loads = 0
	let lastSays: RemoteSays | null = null

	/** Where this mode's user logs in, from settings as they are right now. With
	 *  no operator user set, operator mode stays on the volunteer user: the view
	 *  bar says so, rather than the pane inventing a login. */
	const resolve = (): Target | null => {
		const s = settings.current()
		const url = s.consoleHost === null ? null : webRemoteUrl(s.consoleHost, s.webRemotePort)
		if (url === null) return null
		const asOperator = mode === 'operator' && s.operatorUser !== null
		const user = asOperator && s.operatorUser !== null ? s.operatorUser : s.volunteerUser
		return { url, user, login: webRemoteLogin(url, user, settings.password(asOperator ? 'operator' : 'volunteer')) }
	}

	const clearRetry = () => {
		if (retryTimer !== null) clearTimeout(retryTimer)
		retryTimer = null
	}

	const clearLoadTimer = () => {
		if (loadTimer !== null) clearTimeout(loadTimer)
		loadTimer = null
	}

	/** Load the login, giving up after PANE_LOAD_TIMEOUT_MS. */
	const load = (login: string) => {
		clearLoadTimer()
		stuckSince = null
		loadTimer = setTimeout(() => {
			loadTimer = null
			wc.stop()
			fail(`no answer in ${PANE_LOAD_TIMEOUT_MS / 1000} s`, 'no-answer')
		}, PANE_LOAD_TIMEOUT_MS)
		wc.loadURL(login).catch(() => {
			// Reported through did-fail-load, which carries the reason; the
			// rejection here is the same failure a second time.
		})
	}

	/** Visible only when wanted, placed, and actually showing the console. */
	const apply = () => {
		const visible = wanted && rect !== null && state.state === 'showing'
		if (visible && rect !== null) view.setBounds(rect)
		view.setVisible(visible)
	}

	const idle = () => {
		state = target === null ? { state: 'no-address' } : { state: 'idle', url: target.url, user: target.user }
	}

	const connect = () => {
		clearRetry()
		target = resolve()
		if (target === null) {
			idle()
			apply()
			return
		}
		const { url, user, login } = target
		state = { state: 'connecting', url, user, since: Date.now() }
		apply()
		load(login)
	}

	/** Log in afresh: clear the session first, so nothing of the last user
	 *  survives into the next one. */
	const reconnect = () => {
		clearRetry()
		void ses.clearStorageData().finally(() => {
			if (wanted) connect()
		})
	}

	function fail(detail: string, cause: 'error' | 'no-answer' = 'error') {
		clearLoadTimer()
		if (target === null || !wanted) return
		const at = Date.now()
		state = { state: 'failed', url: target.url, user: target.user, at, cause, detail, retryAt: at + PANE_RETRY_MS }
		apply()
		clearRetry()
		retryTimer = setTimeout(connect, PANE_RETRY_MS)
	}

	/** While the pane is on screen, ask the page what it says, and log in
	 *  afresh once it has said something unrecoverable for PANE_STUCK_MS.
	 *  Afresh, not a reload: ✅ onPC 2.3.2.0, 2026-10-01, a browser stuck on
	 *  "Disconnected" stayed locked out through its own reload for 5+ minutes
	 *  with nothing else connected, while a clean client got in at once. */
	const watch = setInterval(() => {
		if (!wanted || rect === null || state.state !== 'showing' || target === null || loadTimer !== null) {
			stuckSince = null
			return
		}
		const asked = loads
		wc.executeJavaScriptInIsolatedWorld(READ_WORLD, [{ code: READ_OVERLAY }])
			.then((text: unknown) => {
				if (asked !== loads || state.state !== 'showing') return
				const says = remoteSays(typeof text === 'string' ? text : null)
				if (says !== lastSays) console.log(`[kiosk] MA pane: the web remote says "${says}"`)
				lastSays = says
				if (!needsReload(says)) {
					stuckSince = null
					return
				}
				const now = Date.now()
				if (stuckSince === null) stuckSince = now
				if (now - stuckSince < PANE_STUCK_MS) return
				console.log(`[kiosk] MA pane: the web remote has said "${says}" for ${Math.round((now - stuckSince) / 1000)} s; logging in afresh`)
				stuckSince = null
				reconnect()
			})
			.catch(() => {
				// A page mid-navigation cannot be read. The next tick asks again.
			})
	}, WATCH_MS)

	// A 4xx/5xx still "finishes loading", so the status is caught here, where it
	// is known, and did-finish-load below only promotes a load that got this far.
	let httpFailure: string | null = null
	wc.on('did-navigate', (_e, navigatedTo, code, text) => {
		httpFailure = target !== null && isWebRemote(navigatedTo, target.url) && code >= 400 ? `HTTP ${code} ${text}` : null
	})
	wc.on('did-finish-load', () => {
		loads += 1
		stuckSince = null
		if (target === null || !wanted) return
		// A release loads about:blank, which also finishes. Only the console counts.
		if (!isWebRemote(wc.getURL(), target.url)) return
		clearLoadTimer()
		if (httpFailure !== null) return fail(httpFailure)
		if (state.state !== 'connecting') return
		state = { state: 'showing', url: target.url, user: target.user, since: Date.now() }
		apply()
	})
	wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
		if (!isMainFrame || code === ERR_ABORTED) return
		fail(description)
	})
	wc.on('render-process-gone', (_e, details) => fail(`web remote page crashed (${details.reason})`))

	wc.on('input-event', (_e, input) => {
		if (ACTIVITY.has(input.type)) lastInputAt = Date.now()
	})

	// Locked to the console. The web remote has no reason to leave its origin or
	// open a window, and a kiosk that follows a link out has become a browser.
	wc.setWindowOpenHandler(() => ({ action: 'deny' }))
	const stayHome = (e: { preventDefault(): void }, to: string) => {
		if (to !== 'about:blank' && (target === null || !isWebRemote(to, target.url))) e.preventDefault()
	}
	wc.on('will-navigate', (e) => stayHome(e, e.url))
	wc.on('will-redirect', (e) => stayHome(e, e.url))

	// New address or new logins: the next load uses them. Idle stays idle.
	settings.onChange(() => {
		if (wanted) reconnect()
		else {
			target = resolve()
			idle()
		}
	})

	window.on('closed', () => {
		clearRetry()
		clearLoadTimer()
		clearInterval(watch)
		wc.close()
	})

	target = resolve()
	idle()

	return {
		report: () => ({ pane: state, lastInputAt, hasOperatorUser: settings.current().operatorUser !== null }),

		snapshot: () => snapshotOf(view, wanted && rect !== null && state.state === 'showing'),

		place(next) {
			const first = !wanted
			wanted = true
			rect = next === null ? null : clampToWindow(next, window)
			if (first && (state.state === 'idle' || state.state === 'no-address')) connect()
			else apply()
		},

		setMode(next) {
			if (next === mode) return
			mode = next
			// No operator user set means the same login either way; reloading the
			// MA under someone's finger for no change would be all cost.
			if (wanted && resolve()?.login !== target?.login) reconnect()
			else if (!wanted) {
				target = resolve()
				idle()
			}
		},

		release() {
			if (!wanted) return
			wanted = false
			rect = null
			mode = 'volunteer'
			clearRetry()
			clearLoadTimer()
			apply()
			target = resolve()
			idle()
			// Leaving the page is what closes its connection to the console.
			wc.loadURL('about:blank').catch(() => {})
			void ses.clearStorageData()
		},

		retry() {
			if (!wanted || state.state === 'no-address') return
			// Try now retries the same load. Reload MA logs in afresh, for the
			// reason above the watch: a reload is not a way out of a stuck page.
			if (state.state === 'failed') connect()
			else reconnect()
		},
	}
}

/** The renderer measures the pane and is not trusted to send a sane rect. This
 *  only keeps the view inside the window; what keeps it where it belongs is
 *  the renderer re-measuring after every render (components/MaPane.tsx). */
export function clampToWindow(r: PaneRect, window: BrowserWindow): Rectangle {
	const bounds = window.getContentBounds()
	const x = Math.max(0, Math.round(r.x))
	const y = Math.max(0, Math.round(r.y))
	return {
		x,
		y,
		width: Math.max(0, Math.min(Math.round(r.width), bounds.width - x)),
		height: Math.max(0, Math.min(Math.round(r.height), bounds.height - y)),
	}
}
