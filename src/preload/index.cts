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
import type { LinkState } from '../shared/reading.js' with { 'resolution-mode': 'import' }
import type { MaPaneReport, Mode, PaneRect } from '../shared/ma-pane.js' with { 'resolution-mode': 'import' }
import type { Checked, SettingsPatch, SettingsView } from '../shared/settings.js' with { 'resolution-mode': 'import' }
import type { DeskState } from '../shared/desk.js' with { 'resolution-mode': 'import' }

const api = {
	/** The console link as main knows it.
	 *
	 *  Still always unreachable, and deliberately so: liveness needs a request
	 *  that went unanswered, and channel B is the console speaking unprompted.
	 *  See the header of src/main/kiosk.ts. */
	linkState: (): Promise<LinkState> => ipcRenderer.invoke('link:state'),

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
