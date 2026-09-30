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

export type MaPaneState =
	/** Nothing to connect to: no console address has been set. */
	| { state: 'no-address' }
	| { state: 'idle'; url: string; user: string }
	| { state: 'connecting'; url: string; user: string; since: number }
	/** A page from the console loaded, for `user`. NOT a claim that the
	 *  console is live, nor that MA accepted the login: if it refused, the page
	 *  itself says so. */
	| { state: 'showing'; url: string; user: string; since: number }
	| { state: 'failed'; url: string; user: string; at: number; detail: string; retryAt: number }

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

/** Operator mode drops back to volunteer after this long with no input
 *  anywhere, including inside the pane. docs/PLAN.md, Mode switching. */
export const OPERATOR_IDLE_MS = 15 * 60_000

export function operatorExpired(lastInputAt: number, now: number): boolean {
	return now - lastInputAt >= OPERATOR_IDLE_MS
}
