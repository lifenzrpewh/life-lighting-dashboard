// The MA pane — grandMA3's own web remote, the main area of the screen.
//
// WHY THIS EXISTS: the dashboard was going to draw its own buttons (a trigger
// board, GO THIS ITEM, a bottom rail) and its own cue editor. The web remote
// makes all of it unnecessary. It is a real Display of the console
// (✅ operator-observed 2026-09-27), so volunteers fire from an MA layout view
// and the LD edits in MA's own editor, and MA draws every button's state
// itself. docs/PLAN.md, "The MA pane".
//
// THE RULE THIS FILE ENFORCES: the pane is a picture, not a reading. We cannot
// see into it, so nothing here claims to know whether the console is live. Its
// best state is `showing`, meaning a page from the console loaded, and nothing
// more. The web remote shows its own "disconnected" when it loses the console;
// the dashboard's link is a separate fact, rendered beside the pane.

/** Which MA user the pane is logged in as. Volunteer is the MA user `Remote`
 *  unless settings say otherwise; operator is the LD's own user. The rights
 *  live on the console, in those users, never in this app. */
export type Mode = 'volunteer' | 'operator'

/** The web remote's port on every station (🔬 manual 2.2–2.5). */
export const DEFAULT_WEB_REMOTE_PORT = 8080

/** The user the web remote logs in as by itself when the URL names none
 *  (🔬 manual 2.2–2.5). Every new show file has it. */
export const DEFAULT_REMOTE_USER = 'Remote'

/** How long a failed pane waits before trying again. The console may still be
 *  booting when the kiosk comes up, so a failure retries on its own rather
 *  than waiting for someone to notice. */
export const PANE_RETRY_MS = 5_000

/** How long a load may go unanswered before it counts as failed. A console
 *  with every web remote slot taken accepts the connection and never answers
 *  (✅ onPC 2.3.2.0, 2026-09-30), so without a limit the pane sits on
 *  "connecting" for ever. A console that answers at all answers in milliseconds. */
export const PANE_LOAD_TIMEOUT_MS = 15_000

/** How long the web remote may say something it never recovers from by itself
 *  before the pane reloads it. Long enough for MA's own single reconnect. */
export const PANE_STUCK_MS = 10_000

/** What the web remote's own start overlay says (`#startOverlayText`).
 *
 *  🔬 Read from onPC 2.3.2.0's own source (`web/js/ui/remoteState.js`,
 *  `connectionHandling/interface.js`); docs/MA3_READ_MODEL.md § Web remote has
 *  what was watched. Three of its states never leave by themselves:
 *  - **disconnected**: it retries once, at the instant the socket drops
 *    (`setInterval(OpenConnection(), 2000)` calls it rather than passing it),
 *    so a console that takes longer than that to come back stays
 *    "Disconnected" until reloaded.
 *  - **disabled**: Web Remote turned back on moves it only as far as "Waiting
 *    for video signal", because video is asked for once, on connecting.
 *  - **full**: "Maximum connections count reached", until reloaded.
 *  `unread` is no overlay at all: another version, or not the web remote. */
export type RemoteSays =
	| 'connected'
	| 'starting'
	| 'paused'
	| 'disconnected'
	| 'disabled'
	| 'full'
	| 'refused'
	| 'unread'

export function remoteSays(overlayText: string | null): RemoteSays {
	if (overlayText === null) return 'unread'
	const t = overlayText.trim()
	if (t.startsWith('Connected')) return 'connected'
	if (t.startsWith('Connecting to console') || t.startsWith('Waiting for video signal')) return 'starting'
	if (t.startsWith('Video paused')) return 'paused'
	if (t.startsWith('Disconnected')) return 'disconnected'
	if (t.startsWith('Remotes are disabled')) return 'disabled'
	if (t.startsWith('Maximum connections')) return 'full'
	if (t.startsWith('You are black listed')) return 'refused'
	return 'unread'
}

/** True when a reload is the only way out. `starting` counts: held for
 *  PANE_STUCK_MS it is the half-recovered "Waiting for video signal" above.
 *  `paused` is MA's own debug switch, and `unread` is not ours to judge. */
export function needsReload(says: RemoteSays): boolean {
	return says !== 'connected' && says !== 'paused' && says !== 'unread'
}

export type MaPaneState =
	/** Nothing to connect to: no console address has been set. */
	| { state: 'no-address' }
	| { state: 'idle'; url: string; user: string }
	| { state: 'connecting'; url: string; user: string; since: number }
	/** A page from the console loaded, for `user`. NOT a claim that the
	 *  console is live, nor that MA accepted the login: if it refused, the page
	 *  itself says so. */
	| { state: 'showing'; url: string; user: string; since: number }
	/** `no-answer`: the load timed out, which a console with its slots full
	 *  looks like. `error`: the load failed outright, with a reason. */
	| { state: 'failed'; url: string; user: string; at: number; cause: 'error' | 'no-answer'; detail: string; retryAt: number }

export type MaPaneReport = {
	pane: MaPaneState
	/** The last touch or key inside the pane. Main has to report it because the
	 *  pane is a separate page: its input never reaches the renderer, and an
	 *  operator working in the MA must not look idle. */
	lastInputAt: number | null
	/** Whether settings name an operator user. Without one, operator mode keeps
	 *  the pane on the volunteer user, and the screen has to say so. */
	hasOperatorUser: boolean
}

/** Where the pane sits in the window, in CSS pixels (which are the window's
 *  own units at zoom 1). */
export type PaneRect = { x: number; y: number; width: number; height: number }

/** True for a plain hostname or IPv4 address, and nothing else: no port, path,
 *  userinfo or query can ride in on it. */
export function isConsoleHost(host: string): boolean {
	return /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(host) && !host.includes('..')
}

export function isPort(port: number): boolean {
	return Number.isInteger(port) && port >= 1 && port <= 65535
}

/** The web remote's address, as shown to people: no credentials, ever. */
export function webRemoteUrl(host: string, port: number): string | null {
	if (!isConsoleHost(host) || !isPort(port)) return null
	return `http://${host}:${port}/`
}

/** The address the pane actually loads, logging in as `user`.
 *
 *  `Remote` with no password gets the bare address, which is the documented
 *  way to be Remote. Anyone else is named in the URL, the manual's own form
 *  (`?user=…&password=…`). Only main ever builds this; the renderer is shown
 *  `webRemoteUrl`, so a password never reaches the screen. */
export function webRemoteLogin(base: string, user: string, password: string | null): string {
	if (user === DEFAULT_REMOTE_USER && password === null) return base
	const q = new URLSearchParams({ user })
	if (password !== null) q.set('password', password)
	return `${base}?${q.toString()}`
}

/** True when `url` belongs to the web remote at `target`. The pane may go
 *  nowhere else: a volunteer touchscreen must not end up browsing the web. */
export function isWebRemote(url: string, target: string): boolean {
	try {
		return new URL(url).origin === new URL(target).origin
	} catch {
		return false
	}
}

/** Admin (operator mode in the code) drops back to volunteer after this long
 *  with no input anywhere, including inside the pane, unless Settings › Admin
 *  says otherwise (./admin.ts). docs/PLAN.md, Mode switching. */
export const OPERATOR_IDLE_MS = 15 * 60_000

export function operatorExpired(lastInputAt: number, now: number, idleMs: number = OPERATOR_IDLE_MS): boolean {
	return now - lastInputAt >= idleMs
}
