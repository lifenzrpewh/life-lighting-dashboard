/**
 * Pāua's own pages (the kiosk and its pop-outs) never navigate away.
 *
 * Electron's default is that a file or link dropped on a window opens in it.
 * Announcements Load has a person dragging pictures from Explorer or Finder
 * into ProPresenter on this same computer, and a drop that missed would put
 * the picture where the kiosk was: the MA logged out, the pop-outs closed,
 * and a full-screen window with no menu whose only way out is a quit the
 * watchdog leaves alone. A dropped .html would also run with the preload.
 *
 * Main's own loads (`loadFile`, `loadURL`, `reload`) are not navigations the
 * page starts, so they pass; anything the page starts towards another
 * document is refused.
 */

import { shell, type WebContents } from 'electron'

/** Same document: the page's own address, its query and hash aside. */
function samePage(current: string, next: string): boolean {
	try {
		const a = new URL(current)
		const b = new URL(next)
		return a.origin === b.origin && a.pathname === b.pathname
	} catch {
		return false
	}
}

/** Only web links leave for the computer's browser; never `file:` or another
 *  program's scheme, which Windows would hand to whatever claims it. */
export function openInBrowser(url: string): void {
	let protocol: string
	try {
		protocol = new URL(url).protocol
	} catch {
		return
	}
	if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
	else console.warn(`[kiosk] not opened in the browser: ${url.slice(0, 80)}`)
}

/** Refuse any navigation the page starts away from itself. */
export function lockPage(wc: WebContents, name: string): void {
	const refuse = (e: { preventDefault(): void }, url: string) => {
		if (samePage(wc.getURL(), url)) return
		e.preventDefault()
		console.warn(`[kiosk] ${name} kept from opening ${url.slice(0, 80)}`)
	}
	wc.on('will-navigate', (e) => refuse(e, e.url))
	wc.on('will-redirect', (e) => refuse(e, e.url))
}

/** How long to wait before the nth reload in a row: at once the first time,
 *  then longer, so a page that dies on load (out of memory, a GPU that keeps
 *  falling over) is not reloaded in a tight loop that starves main. */
const RELOAD_DELAYS_MS = [0, 1_000, 5_000, 30_000]
/** A page up this long since its last crash starts the count again. */
const CALM_MS = 2 * 60_000

/** Reload a crashed page, backing off while it keeps crashing. */
export function reloadOnCrash(wc: WebContents, name: string, reload: () => void): void {
	let crashes = 0
	let lastAt = 0
	let timer: NodeJS.Timeout | null = null
	wc.on('render-process-gone', (_e, details) => {
		const now = Date.now()
		crashes = now - lastAt > CALM_MS ? 1 : crashes + 1
		lastAt = now
		const wait = RELOAD_DELAYS_MS[Math.min(crashes - 1, RELOAD_DELAYS_MS.length - 1)]!
		console.error(`[kiosk] ${name}'s page gone: ${details.reason}. Reloading${wait > 0 ? ` in ${wait / 1000} s (crash ${crashes} in a row)` : ''}.`)
		if (timer !== null) clearTimeout(timer)
		timer = setTimeout(() => {
			timer = null
			if (!wc.isDestroyed()) reload()
		}, wait)
	})
}
