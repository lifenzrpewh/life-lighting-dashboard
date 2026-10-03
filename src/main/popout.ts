// A view popped out of its slot into a window of its own. The owner's answers
// and the rules for where it opens are in ../shared/popout.ts.
//
// THE RULES THIS FILE ENFORCES:
// - One window per view, and the view's own: the MA and the run order move
//   into it page and all (./ma-pane.ts `moveTo`), so the MA stays logged in and
//   a half-typed note survives. Arena is drawn again by the window's own page.
// - Closing the window, however it closes, puts the view back in the kiosk.
//   The view is moved home on `close`, before the window is torn down, so a
//   page is never destroyed along with the window it happened to be in.
// - On top. The kiosk is full-screen; a window that fell behind it would be lost
//   to a volunteer with no taskbar.
// - The kiosk going away takes its pop-outs with it: a reloaded kiosk starts
//   with every view in its slot, and a closed one must not leave a window
//   holding the app open.
// - Each window's place is remembered on this computer, as the layout is.

import { screen, BrowserWindow, type WebContents } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { VIEW_LABEL, type ViewId } from '../shared/layout.js'
import { POPOUT_MIN, popoutBounds, popoutPlacesFrom, type Box } from '../shared/popout.js'
import { fitWindow, type Size } from '../shared/video-feed.js'

/** A pane main draws: the MA or the run order. */
type Movable = { host(): BrowserWindow; moveTo(win: BrowserWindow): void }

export type Popouts = {
	/** The views out of their slots right now. */
	popped(): ViewId[]
	open(view: ViewId): void
	close(view: ViewId): void
	closeAll(): void
	/** Size `view`'s window so its picture space takes the picture's shape, and
	 *  hold that shape while it is resized. */
	fit(view: ViewId, picture: Size, space: Size): void
	/** Whether this page is the one in `view`'s pop-out, or any pop-out's. */
	isPopout(sender: WebContents, view?: ViewId): boolean
}

export function createPopouts(opts: {
	kiosk: BrowserWindow
	panes: Partial<Record<ViewId, Movable>>
	/** Load the renderer's page for `view` into `win`. */
	load(win: BrowserWindow, view: ViewId): void
	preload: string
	/** Where each window's place is kept, in the app's own data folder. */
	placesFile: string
}): Popouts {
	const { kiosk, panes } = opts
	const windows = new Map<ViewId, BrowserWindow>()

	const readPlaces = () => {
		try {
			return popoutPlacesFrom(fs.readFileSync(opts.placesFile, 'utf8'))
		} catch {
			return {}
		}
	}
	const remember = (view: ViewId, box: Box) => {
		try {
			fs.mkdirSync(path.dirname(opts.placesFile), { recursive: true })
			fs.writeFileSync(opts.placesFile, JSON.stringify({ ...readPlaces(), [view]: box }))
		} catch (e) {
			// Not remembered; it opens in the default place next time.
			console.error(`[kiosk] could not remember where the ${VIEW_LABEL[view]} pop-out was: ${(e as Error).message}`)
		}
	}

	const where = (view: ViewId): Box => {
		const displays = screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea }))
		const kioskDisplay = screen.getDisplayMatching(kiosk.getBounds()).id
		return popoutBounds(readPlaces()[view] ?? null, displays, kioskDisplay)
	}

	const open = (view: ViewId) => {
		const existing = windows.get(view)
		if (existing !== undefined) {
			existing.focus()
			return
		}
		const win = new BrowserWindow({
			...where(view),
			minWidth: POPOUT_MIN.width,
			minHeight: POPOUT_MIN.height,
			title: `Pāua — ${VIEW_LABEL[view]}`,
			backgroundColor: '#0a0a0b',
			show: false,
			autoHideMenuBar: true,
			fullscreenable: false,
			alwaysOnTop: true,
			webPreferences: { preload: opts.preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
		})
		// Above a full-screen kiosk on macOS too, where full screen is a space
		// of its own that an ordinary on-top window does not join.
		if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
		windows.set(view, win)
		win.once('ready-to-show', () => win.show())
		win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
		win.webContents.on('render-process-gone', (_e, details) => {
			console.error(`[kiosk] ${VIEW_LABEL[view]} pop-out's page gone: ${details.reason}. Reloading.`)
			if (!win.isDestroyed()) win.reload()
		})
		// Home on `close`, while the window still stands. A page that closes its
		// own window skips `close` (✅ Electron 44, 2026-10-03: the window went and
		// the view stayed listed as out), so `closed` does it too, once.
		let home = false
		const goHome = () => {
			if (home) return
			home = true
			if (!win.isDestroyed()) remember(view, win.getNormalBounds())
			if (windows.get(view) === win) windows.delete(view)
			const pane = panes[view]
			if (pane !== undefined && pane.host() === win && !kiosk.isDestroyed()) pane.moveTo(kiosk)
			console.log(`[kiosk] ${VIEW_LABEL[view]} back in the kiosk`)
		}
		win.on('close', goHome)
		win.on('closed', goHome)
		panes[view]?.moveTo(win)
		opts.load(win, view)
		console.log(`[kiosk] ${VIEW_LABEL[view]} popped out`)
	}

	const close = (view: ViewId) => {
		const win = windows.get(view)
		if (win !== undefined && !win.isDestroyed()) win.close()
	}

	const closeAll = () => {
		for (const view of [...windows.keys()]) close(view)
	}

	const fit = (view: ViewId, picture: Size, space: Size) => {
		const win = windows.get(view)
		if (win === undefined || win.isDestroyed()) return
		const [cw = 0, ch = 0] = win.getContentSize()
		const content = { width: cw, height: ch }
		// The room is the display's, less the window's own frame.
		const outer = win.getBounds()
		const frame = { width: outer.width - cw, height: outer.height - ch }
		const area = screen.getDisplayMatching(outer).workArea
		const size = fitWindow({ picture, space, content, room: { width: area.width - frame.width, height: area.height - frame.height } })
		win.setAspectRatio(picture.width / picture.height, { width: content.width - space.width, height: content.height - space.height })
		win.setContentSize(size.width, size.height)
		// Kept on its display: a window grown past the edge is moved back in.
		const b = win.getBounds()
		win.setBounds({
			...b,
			x: Math.min(Math.max(b.x, area.x), area.x + area.width - b.width),
			y: Math.min(Math.max(b.y, area.y), area.y + area.height - b.height),
		})
	}

	kiosk.on('close', closeAll)

	return {
		popped: () => [...windows.keys()],
		open,
		close,
		closeAll,
		fit,
		isPopout: (sender, view) =>
			[...windows.entries()].some(([v, w]) => (view === undefined || v === view) && !w.isDestroyed() && w.webContents === sender),
	}
}
