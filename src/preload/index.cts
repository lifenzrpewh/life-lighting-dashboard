// The entire surface the renderer gets. Compiled to CommonJS (.cts -> .cjs)
// because a sandboxed preload cannot be an ES module.
//
// THE RULE THIS FILE ENFORCES: this is an allow-list, not a bridge to Node. Every
// export is a named function with a known shape. There is no `invoke(channel,
// ...args)` passthrough and there must never be one — that would hand the
// renderer the whole IPC surface and make this file decorative.

import { contextBridge, ipcRenderer, sharedTexture } from 'electron'

// `resolution-mode` because this file is CommonJS (a sandboxed preload cannot
// be an ES module) while src/shared is ESM. Type-only, so nothing is emitted.
import type { Channel, LinkState } from '../shared/reading.js' with { 'resolution-mode': 'import' }
import type { Showfile } from '../shared/showfile.js' with { 'resolution-mode': 'import' }
import type { TimerSources } from '../shared/timer.js' with { 'resolution-mode': 'import' }
import type { ArenaCommand, ArenaCommandResult, ArenaSource, ArenaStatus } from '../shared/arena.js' with { 'resolution-mode': 'import' }
import type { ShowList, ShowWriteResult } from '../shared/showfile-write.js' with { 'resolution-mode': 'import' }
import type { FileSizes, LookbookItem, LookbookRead, LookbookService, SameMark } from '../shared/media-check.js' with { 'resolution-mode': 'import' }
import type { CuePaneReport } from '../shared/cue-pane.js' with { 'resolution-mode': 'import' }
import type { MaPaneReport, Mode, PaneRect } from '../shared/ma-pane.js' with { 'resolution-mode': 'import' }
import type { Checked, SettingsPatch, SettingsView } from '../shared/settings.js' with { 'resolution-mode': 'import' }
import type { DeskState } from '../shared/desk.js' with { 'resolution-mode': 'import' }
import type { ViewId } from '../shared/layout.js' with { 'resolution-mode': 'import' }
import type { VideoFeedState } from '../shared/video-feed.js' with { 'resolution-mode': 'import' }
import type { About } from '../shared/about.js' with { 'resolution-mode': 'import' }
import type { UpdateState } from '../shared/updates.js' with { 'resolution-mode': 'import' }
import type { AdminState, UnlockResult } from '../shared/admin.js' with { 'resolution-mode': 'import' }
import type { EmbedReport } from '../shared/embeds.js' with { 'resolution-mode': 'import' }
import type { NdiState } from '../shared/ndi.js' with { 'resolution-mode': 'import' }
import type { CaptureInput } from '../shared/capture.js' with { 'resolution-mode': 'import' }
import type { DriveMatches, FetchRequest, FetchRun, FetchStates, MediaSource, RunRequest } from '../shared/media-fetch.js' with { 'resolution-mode': 'import' }

/** Every view on this page showing the video feed, each drawing every frame.
 *  Main is told the page watches while there is one, and stops when the last
 *  goes. (Until 2026-10-11 it was one callback and an on/off per view: the
 *  view mounted last took every frame, and any one closing, a tab switched
 *  away, told main the page had stopped watching while another still showed
 *  the feed.) */
const videoDraws = new Set<(frame: VideoFrame) => void>()

// The video feed's frames arrive here as GPU textures from main
// (src/main/video-feed.ts) and go to the page as VideoFrames, which cross the
// context bridge without a copy of their pixels. Each is closed here once the
// page's callback has drawn it, and the texture released a macrotask later:
// released in the same tick, Electron's tracker can see the release before
// the transfer (the addon's own consumer, and its note, do the same).
// Guarded: the module is experimental, and a preload that threw here would
// take the whole surface below with it. Without it the feed only waits.
// Where a stall comes from, the page's half (src/main/video-feed.ts has
// main's): the longest wait between frames, the longest the page drew nothing
// at all (a frame of the page's own, not the feed's), and the slowest draw.
// Sent every 5 s while the feed is watched, only if one passed 250 ms (40 for
// a draw), and only while the page is on screen, since a hidden page draws
// nothing by design.
let pageHealth = { frameGap: 0, drewNothing: 0, draw: 0, lastFrame: 0, lastPaint: 0 }
setInterval(() => {
	const h = pageHealth
	pageHealth = { ...h, frameGap: 0, drewNothing: 0, draw: 0 }
	if (videoDraws.size === 0 || document.hidden) return
	if (h.frameGap >= 250 || h.drewNothing >= 250 || h.draw >= 40) {
		ipcRenderer.send('video:page-health', { frameGap: h.frameGap, drewNothing: h.drewNothing, draw: h.draw })
	}
}, 5_000)
const paint = (t: number) => {
	if (videoDraws.size > 0 && !document.hidden && pageHealth.lastPaint > 0) pageHealth.drewNothing = Math.max(pageHealth.drewNothing, t - pageHealth.lastPaint)
	pageHealth.lastPaint = document.hidden ? 0 : t
	requestAnimationFrame(paint)
}
if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint)
// Time off screen is not a stall.
document.addEventListener('visibilitychange', () => {
	pageHealth.lastPaint = 0
	pageHealth.lastFrame = 0
})

try {
	sharedTexture.setSharedTextureReceiver(async ({ importedSharedTexture }) => {
		const frame = importedSharedTexture.getVideoFrame()
		const at = performance.now()
		if (pageHealth.lastFrame > 0 && !document.hidden) pageHealth.frameGap = Math.max(pageHealth.frameGap, at - pageHealth.lastFrame)
		pageHealth.lastFrame = at
		try {
			for (const draw of videoDraws) {
				try {
					draw(frame)
				} catch (e) {
					console.error('[video] a view failed to draw a frame:', e)
				}
			}
			pageHealth.draw = Math.max(pageHealth.draw, performance.now() - at)
		} finally {
			frame.close()
			setTimeout(() => importedSharedTexture.release(), 0)
		}
	})
} catch (e) {
	console.error('[video] this page cannot receive shared textures:', e)
}

// NDI sources (src/main/ndi.ts): each view showing one gets a port of its own
// to the worker that receives it, and frames arrive on it as BGRA pixels. A
// VideoFrame is made of each here and handed to the page, which draws it at
// once; then the worker is told, and only then sends the next.
type NdiWatch = { draw: (frame: VideoFrame) => void; port: MessagePort | null; space: { width: number; height: number } | null }
const ndiWatches = new Map<string, NdiWatch>()
let ndiTokens = 0
ipcRenderer.on('ndi:port', (e, msg: { token?: unknown }) => {
	const port = e.ports[0]
	const w = typeof msg?.token === 'string' ? ndiWatches.get(msg.token) : undefined
	if (port === undefined) return
	if (w === undefined) return port.close()
	w.port?.close()
	w.port = port
	port.onmessage = (ev: MessageEvent) => {
		const d = ev.data as { width: number; height: number; format: 'BGRA' | 'BGRX'; data: Uint8Array }
		let frame: VideoFrame | null = null
		try {
			frame = new VideoFrame(d.data, { format: d.format, codedWidth: d.width, codedHeight: d.height, timestamp: 0 })
			w.draw(frame)
		} catch (err) {
			console.error('[ndi] a frame could not be drawn:', err)
		} finally {
			frame?.close()
			port.postMessage({ type: 'drawn' })
		}
	}
	if (w.space !== null) port.postMessage({ type: 'space', space: w.space })
})

const api = {
	/** The console link as main knows it: LIVE only while LifeBridge answers
	 *  the pings main sends, never inferred from channel B traffic. See the
	 *  header of src/main/kiosk.ts. */
	linkState: (): Promise<LinkState> => ipcRenderer.invoke('link:state'),

	/** What the console has said about its loaded showfile (LifeBridge's `show`
	 *  verb), for the renderer to age and render in the four states. Read on
	 *  link-up and once a quiet minute, never guessed. */
	showfile: (): Promise<Channel<Showfile>> => ipcRenderer.invoke('showfile:state'),

	/** What OnTime and ProPresenter last said, for the countdown chip. A source
	 *  is null when settings name no address for it. */
	timers: (): Promise<TimerSources> => ipcRenderer.invoke('timers:state'),

	/** Whether Arena's web server answers, and which Arena. Null when settings
	 *  name no Arena. */
	arena: (): Promise<ArenaSource> => ipcRenderer.invoke('arena:state'),
	/** What Arena is playing, over its websocket, aged by the link above. Null
	 *  when settings name no Arena. Thumbnails come on their own scheme,
	 *  `thumbnailUrl` in src/shared/arena.ts. */
	arenaStatus: (): Promise<Channel<ArenaStatus> | null> => ipcRenderer.invoke('arena:status'),
	/** Fire a clip or column, clear a layer, or move its fader. Sent is not
	 *  done: what plays comes back in `arenaStatus`. */
	arenaCommand: (command: ArenaCommand): Promise<ArenaCommandResult> => ipcRenderer.invoke('arena:command', command),
	/** The media check's reads from the lookbook app, asked on demand: the
	 *  services from today to a week ahead, then one service's run sheet. */
	lookbookServices: (): Promise<LookbookRead<LookbookService[]>> => ipcRenderer.invoke('lookbook:services'),
	/** The lookbook's service for the plan the run order has open, or null
	 *  when the lookbook has none for it. */
	lookbookServiceForPlan: (planId: string): Promise<LookbookRead<LookbookService | null>> => ipcRenderer.invoke('lookbook:for-plan', planId),
	lookbookItems: (serviceId: string): Promise<LookbookRead<LookbookItem[]>> => ipcRenderer.invoke('lookbook:items', serviceId),
	/** Fetch a code the media check found wrong: copy the lookbook's file
	 *  from the graphics folder, and load it into `clipId` unless that is null.
	 *  Operator mode only. Sent is not done: `mediaFetches` says how it goes,
	 *  and the media check says when Arena has it. */
	fetchMedia: (request: FetchRequest): Promise<{ ok: true } | { ok: false; detail: string }> => ipcRenderer.invoke('media:fetch', request),
	mediaFetches: (): Promise<FetchStates> => ipcRenderer.invoke('media:fetch-state'),
	/** A confirmation's fetches as one run, its plan and result in the log:
	 *  operator mode only. `lastMediaRun` is the latest, for the result line. */
	runMedia: (run: RunRequest): Promise<FetchRun | { ok: false; detail: string }> => ipcRenderer.invoke('media:run', run),
	lastMediaRun: (): Promise<FetchRun | null> => ipcRenderer.invoke('media:last-run'),
	/** Every file on the graphics drive carrying a code, and which Fetch would take. */
	mediaDrive: (code: string, lookbookPath: string | null): Promise<DriveMatches> => ipcRenderer.invoke('media:drive', code, lookbookPath),
	/** "It's there": a failed code set aside as in Arena all the same. Admin only. */
	mediaThere: (code: string): Promise<{ ok: true } | { ok: false; detail: string }> => ipcRenderer.invoke('media:there', code),
	/** Where each request's file would come from (the drive, or the lookbook),
	 *  for the confirmation to say and ask about before anything is sent. */
	mediaSources: (requests: FetchRequest[]): Promise<Record<string, MediaSource>> => ipcRenderer.invoke('media:sources', requests),
	/** File sizes, to tell a file by its size rather than its name: Arena's
	 *  (only files the composition names) and the lookbook's library files. */
	mediaSizes: (files: { arena: string[]; lookbook: string[] }): Promise<FileSizes> => ipcRenderer.invoke('media:sizes', files),
	/** The media check's "same" marks, as keys (`sameKey`), and making or
	 *  undoing one: operator mode only. */
	/** Windows' folder picker, starting at `start`: the folder picked, or null
 *  when cancelled. Operator mode only (main answers null otherwise). */
	chooseFolder: (start: string | null): Promise<string | null> => ipcRenderer.invoke('folder:choose', start),
	sameMarks: (): Promise<string[]> => ipcRenderer.invoke('media:same'),
	markSame: (mark: SameMark): Promise<{ ok: true } | { ok: false; detail: string }> =>
		ipcRenderer.invoke('media:mark-same', mark),
	/** The showfile's write half, operator mode only (main refuses otherwise).
	 *  Sent is not done: the new name comes back in `showfile`. */
	listShows: (): Promise<ShowList> => ipcRenderer.invoke('showfile:shows'),
	saveShowAs: (name: string): Promise<ShowWriteResult> => ipcRenderer.invoke('showfile:save-as', name),
	loadShow: (name: string, saveFirst: boolean): Promise<ShowWriteResult> => ipcRenderer.invoke('showfile:load', name, saveFirst),

	/** The Cue Manager pane (src/main/cue-pane.ts): the visuals app itself,
	 *  where the run order used to be. Placed like the MA pane. */
	cuePane: (): Promise<CuePaneReport> => ipcRenderer.invoke('cue-pane:report'),
	/** Want it at `rect`; null keeps the page but hides it (the column folded). */
	placeCuePane: (rect: PaneRect | null): void => ipcRenderer.send('cue-pane:place', rect),
	retryCuePane: (): void => ipcRenderer.send('cue-pane:retry'),
	/** Pictures of every page main draws in the kiosk (the MA, the Cue Manager,
	 *  each embed), by view, each null when it is not on screen. Shown in their
	 *  place while a layout is dragged, because a page reflowing on every step
	 *  trails the finger. */
	snapshotPanes: (): Promise<Record<string, string | null>> => ipcRenderer.invoke('panes:snapshot'),

	/** Embeds (src/main/embeds.ts): each one's page state and zoom. An embed
	 *  that is off has no report. */
	embeds: (): Promise<EmbedReport[]> => ipcRenderer.invoke('embeds:report'),
	placeEmbed: (id: string, rect: PaneRect | null): void => ipcRenderer.send('embed:place', id, rect),
	retryEmbed: (id: string): void => ipcRenderer.send('embed:retry', id),
	/** One step out (-1) or in (1), or back to 100 % (0). Remembered per embed. */
	zoomEmbed: (id: string, by: -1 | 0 | 1): void => ipcRenderer.send('embed:zoom', id, by),
	/** Operator mode only: sign the app out and forget what it kept. */
	resetCuePane: (): Promise<boolean> => ipcRenderer.invoke('cue-pane:reset'),

	/** The MA pane (src/main/ma-pane.ts). The renderer says where it goes and
	 *  which mode the screen is in; what it loads is main's business alone. */
	maPane: (): Promise<MaPaneReport> => ipcRenderer.invoke('ma-pane:report'),
	/** Want the pane at `rect`; null keeps it connected but hidden. */
	placeMaPane: (rect: PaneRect | null): void => ipcRenderer.send('ma-pane:place', rect),
	/** Stop wanting the pane, which closes its connection to the console. */
	releaseMaPane: (): void => ipcRenderer.send('ma-pane:release'),
	retryMaPane: (): void => ipcRenderer.send('ma-pane:retry'),
	/** The screen's mode as the renderer has it. Main takes only a step down
	 *  to volunteer from here; into Admin is `unlockAdmin`. */
	setMaPaneMode: (mode: Mode): void => ipcRenderer.send('ma-pane:mode', mode),
	/** The kiosk's mode, for a pop-out to hide what only Admin may use. */
	mode: (): Promise<Mode> => ipcRenderer.invoke('mode:get'),
	/** Whether Admin asks for a passcode, whether it is digits, and any wait
	 *  still running (src/shared/admin.ts). Never the passcode. */
	adminState: (): Promise<AdminState | undefined> => ipcRenderer.invoke('admin:state'),
	/** Try the passcode (null when none is set). Main checks it and, if it is
	 *  right, the kiosk is in Admin. */
	unlockAdmin: (code: string | null): Promise<UnlockResult | undefined> => ipcRenderer.invoke('admin:unlock', code),

	/** The views popped out of their slots into windows of their own
	 *  (src/main/popout.ts). */
	popouts: (): Promise<ViewId[]> => ipcRenderer.invoke('popout:state'),
	/** The kiosk only: move `view` into a window of its own. */
	popOut: (view: ViewId): void => ipcRenderer.send('popout:open', view),
	/** Size `view`'s pop-out so its picture space takes the picture's shape,
	 *  and keep that shape while the window is resized. */
	fitPopout: (view: ViewId, picture: { width: number; height: number }, space: { width: number; height: number }): void =>
		ipcRenderer.send('popout:fit', view, picture, space),
	/** Bring `view`'s window forward, on top of the kiosk. */
	showPopout: (view: ViewId): void => ipcRenderer.send('popout:show', view),
	/** Let `view`'s window go behind the kiosk, until Show. */
	sendPopoutBehind: (view: ViewId): void => ipcRenderer.send('popout:behind', view),
	/** Close `view`'s window, which puts it back in the kiosk. */
	bringBack: (view: ViewId): void => ipcRenderer.send('popout:close', view),

	/** The video feed: which senders exist, which is shown, when the last
	 *  frame arrived. */
	videoFeed: (): Promise<VideoFeedState | null> => ipcRenderer.invoke('video:state'),
	/** Show the feed: frames go to `draw` until the returned function is
	 *  called. Draw at once; the frame is closed when `draw` returns. */
	watchVideo: (draw: (frame: VideoFrame) => void): (() => void) => {
		// Wrapped, so the same function given twice is two watchers.
		const watcher = (frame: VideoFrame) => draw(frame)
		videoDraws.add(watcher)
		if (videoDraws.size === 1) ipcRenderer.send('video:watch', true)
		return () => {
			if (!videoDraws.delete(watcher)) return
			if (videoDraws.size === 0) ipcRenderer.send('video:watch', false)
		}
	},
	/** Show this sender rather than the first. */
	chooseVideo: (name: string): void => ipcRenderer.send('video:choose', name),
	/** Let every video receiver go and open them again, without restarting
	 *  the app. Anyone may. */
	restartVideo: (): void => ipcRenderer.send('video:restart'),

	/** Capture input `id` as settings have it, for a pop-out, which cannot read
	 *  settings: null when removed. */
	captureInput: (id: string): Promise<CaptureInput | null> => ipcRenderer.invoke('capture:input', id),

	/** What NDI finds on the network, and how each added source is received. */
	ndi: (): Promise<NdiState | null> => ipcRenderer.invoke('ndi:state'),
	/** Show NDI source `id`: frames go to `draw` until `stop`. Draw at once;
	 *  the frame is closed when `draw` returns. `space` says, in device pixels,
	 *  how big it is drawn, so the worker sends no more than that. */
	watchNdi: (id: string, draw: (frame: VideoFrame) => void): { stop: () => void; space: (size: { width: number; height: number }) => void } => {
		ndiTokens += 1
		const token = `${Math.random().toString(36).slice(2, 10)}${ndiTokens.toString(36)}`
		const w: NdiWatch = { draw, port: null, space: null }
		ndiWatches.set(token, w)
		ipcRenderer.send('ndi:watch', id, token)
		return {
			stop: () => {
				ndiWatches.delete(token)
				w.port?.close()
				ipcRenderer.send('ndi:unwatch', token)
			},
			space: (size) => {
				w.space = { width: Math.round(size.width), height: Math.round(size.height) }
				w.port?.postMessage({ type: 'space', space: w.space })
			},
		}
	},

	/** Which build this is, and where its log is. */
	about: (): Promise<About> => ipcRenderer.invoke('app:about'),
	/** Save a Holding preset's file where the person picks. Admin only. */
	exportHolding: (name: string, text: string): Promise<boolean> => ipcRenderer.invoke('holding:export', name, text),
	/** A Holding preset file's text from where the person picks, null if
	 *  cancelled, '' if too big. Admin only. */
	importHolding: (): Promise<string | null> => ipcRenderer.invoke('holding:import'),
	/** What the updater last knew (../shared/updates.ts). */
	updateState: (): Promise<UpdateState | undefined> => ipcRenderer.invoke('updates:state'),
	/** Ask for a new version now. */
	checkUpdates: (): void => ipcRenderer.send('updates:check'),
	/** Download and install the version found: Admin only, and Pāua closes
	 *  and opens again. */
	installUpdate: (): void => ipcRenderer.send('updates:install'),
	/** Clear an old foreground: empty clip `clipId`, which must still hold
	 *  `code`. Operator mode only; main checks it is an old foreground. */
	emptyClip: (clipId: number, code: string): Promise<ArenaCommandResult> => ipcRenderer.invoke('media:empty', clipId, code),
	/** Write a tester's mark in the log, with a few words of what is on
	 *  screen. Answers which mark this is, or null if refused. */
	mark: (context: string): Promise<number | null> => ipcRenderer.invoke('app:mark', context),
	/** Operator mode only: open the log's folder. */
	showLog: (): void => ipcRenderer.send('app:show-log'),

	/** Settings, as the renderer may see them: passwords only as set / not set. */
	settings: (): Promise<SettingsView> => ipcRenderer.invoke('settings:get'),
	/** Operator mode only; main refuses otherwise. */
	saveSettings: (patch: SettingsPatch): Promise<{ ok: true } | Extract<Checked, { ok: false }>> =>
		ipcRenderer.invoke('settings:save', patch),

	/** Live executor levels from channel B, plus when the desk was last heard.
	 *
	 *  Separate from `linkState` on purpose. "We heard the desk 0.3 s ago" is an
	 *  observation; "the link is live" is a verdict, and this app does not let
	 *  the first quietly become the second. */
	deskState: (): Promise<DeskState> => ipcRenderer.invoke('desk:state'),
}

export type LifeApi = typeof api

contextBridge.exposeInMainWorld('life', api)
