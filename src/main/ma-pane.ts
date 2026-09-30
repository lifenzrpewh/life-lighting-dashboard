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
//
// A native view is drawn above the renderer, so no DOM can overlay it. The
// layout therefore gives the pane a rect of its own, and anything that must be
// said about the pane sits beside it, never on top.

import { WebContentsView, session, type BrowserWindow, type Rectangle } from 'electron'

import {
	PANE_RETRY_MS,
	isWebRemote,
	webRemoteLogin,
	webRemoteUrl,
	type MaPaneReport,
	type MaPaneState,
	type Mode,
	type PaneRect,
} from '../shared/ma-pane.js'
import type { SettingsStore } from './settings.js'

/** Chromium's code for a load we cancelled ourselves, as a release does. Not a
 *  failure, and reporting it as one would flash an error at every mode switch. */
const ERR_ABORTED = -3

/** Input that means a person is using the pane. Mouse moves are left out: a
 *  cursor resting on the pane drifts, and that is not someone working. */
const ACTIVITY = new Set(['mouseDown', 'mouseWheel', 'rawKeyDown', 'keyDown', 'touchStart', 'gestureTap'])

export type MaPane = {
	report(): MaPaneReport
	/** Want the pane, at `rect`. Null keeps the connection but hides the pane,
	 *  as the settings panel does when it takes the pane's place. */
	place(rect: PaneRect | null): void
	/** Log the pane in as this mode's user, if it is not already. */
	setMode(mode: Mode): void
	/** Stop wanting the pane, close its connection, and forget the mode. */
	release(): void
	retry(): void
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
		wc.loadURL(login).catch(() => {
			// Reported through did-fail-load, which carries the reason; the
			// rejection here is the same failure a second time.
		})
	}

	/** Log in afresh: clear the session first, so nothing of the last user
	 *  survives into the next one. */
	const reconnect = () => {
		clearRetry()
		void ses.clearStorageData().finally(() => {
			if (wanted) connect()
		})
	}

	const fail = (detail: string) => {
		if (target === null || !wanted) return
		const at = Date.now()
		state = { state: 'failed', url: target.url, user: target.user, at, detail, retryAt: at + PANE_RETRY_MS }
		apply()
		clearRetry()
		retryTimer = setTimeout(connect, PANE_RETRY_MS)
	}

	// A 4xx/5xx still "finishes loading", so the status is caught here, where it
	// is known, and did-finish-load below only promotes a load that got this far.
	let httpFailure: string | null = null
	wc.on('did-navigate', (_e, navigatedTo, code, text) => {
		httpFailure = target !== null && isWebRemote(navigatedTo, target.url) && code >= 400 ? `HTTP ${code} ${text}` : null
	})
	wc.on('did-finish-load', () => {
		if (target === null || !wanted || state.state !== 'connecting') return
		// A release loads about:blank, which also finishes. Only the console counts.
		if (!isWebRemote(wc.getURL(), target.url)) return
		if (httpFailure !== null) return fail(httpFailure)
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
		wc.close()
	})

	target = resolve()
	idle()

	return {
		report: () => ({ pane: state, lastInputAt, hasOperatorUser: settings.current().operatorUser !== null }),

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
			apply()
			target = resolve()
			idle()
			// Leaving the page is what closes its connection to the console.
			wc.loadURL('about:blank').catch(() => {})
			void ses.clearStorageData()
		},

		retry() {
			if (wanted && state.state === 'failed') connect()
		},
	}
}

/** The renderer measures the pane and is not trusted to send a sane rect. This
 *  only keeps the view inside the window; what keeps it where it belongs is
 *  the renderer re-measuring after every render (components/MaPane.tsx). */
function clampToWindow(r: PaneRect, window: BrowserWindow): Rectangle {
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
