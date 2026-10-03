// The entire surface the renderer gets. Compiled to CommonJS (.cts -> .cjs)
// because a sandboxed preload cannot be an ES module.
//
// THE RULE THIS FILE ENFORCES: this is an allow-list, not a bridge to Node. Every
// export is a named function with a known shape. There is no `invoke(channel,
// ...args)` passthrough and there must never be one — that would hand the
// renderer the whole IPC surface and make this file decorative.

import { contextBridge, ipcRenderer } from 'electron'

// `resolution-mode` because this file is CommonJS (a sandboxed preload cannot
// be an ES module) while src/shared is ESM. Type-only, so nothing is emitted.
import type { Channel, LinkState } from '../shared/reading.js' with { 'resolution-mode': 'import' }
import type { Showfile } from '../shared/showfile.js' with { 'resolution-mode': 'import' }
import type { TimerSources } from '../shared/timer.js' with { 'resolution-mode': 'import' }
import type { ArenaSource, ArenaStatus } from '../shared/arena.js' with { 'resolution-mode': 'import' }
import type { CuePaneReport } from '../shared/cue-pane.js' with { 'resolution-mode': 'import' }
import type { MaPaneReport, Mode, PaneRect } from '../shared/ma-pane.js' with { 'resolution-mode': 'import' }
import type { Checked, SettingsPatch, SettingsView } from '../shared/settings.js' with { 'resolution-mode': 'import' }
import type { DeskState } from '../shared/desk.js' with { 'resolution-mode': 'import' }
import type { ViewId } from '../shared/layout.js' with { 'resolution-mode': 'import' }

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

	/** The Cue Manager pane (src/main/cue-pane.ts): the visuals app itself,
	 *  where the run order used to be. Placed like the MA pane. */
	cuePane: (): Promise<CuePaneReport> => ipcRenderer.invoke('cue-pane:report'),
	/** Want it at `rect`; null keeps the page but hides it (the column folded). */
	placeCuePane: (rect: PaneRect | null): void => ipcRenderer.send('cue-pane:place', rect),
	retryCuePane: (): void => ipcRenderer.send('cue-pane:retry'),
	/** Pictures of the MA and the Cue Manager as they are now, each null when
	 *  it is not on screen. Shown in their place while the divider is dragged,
	 *  because a page reflowing on every step trails the finger. */
	snapshotPanes: (): Promise<{ ma: string | null; cue: string | null }> => ipcRenderer.invoke('panes:snapshot'),
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
	/** Which MA user the pane should be: volunteer or operator. */
	setMaPaneMode: (mode: Mode): void => ipcRenderer.send('ma-pane:mode', mode),

	/** The views popped out of their slots into windows of their own
	 *  (src/main/popout.ts). */
	popouts: (): Promise<ViewId[]> => ipcRenderer.invoke('popout:state'),
	/** The kiosk only: move `view` into a window of its own. */
	popOut: (view: ViewId): void => ipcRenderer.send('popout:open', view),
	/** Close `view`'s window, which puts it back in the kiosk. */
	bringBack: (view: ViewId): void => ipcRenderer.send('popout:close', view),

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
