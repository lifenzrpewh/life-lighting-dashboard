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
import type { DeskState } from '../shared/desk.js' with { 'resolution-mode': 'import' }

const api = {
	/** The console link as main knows it.
	 *
	 *  Still always unreachable, and deliberately so: liveness needs a request
	 *  that went unanswered, and channel B is the console speaking unprompted.
	 *  See the header of src/main/kiosk.ts. */
	linkState: (): Promise<LinkState> => ipcRenderer.invoke('link:state'),

	/** Live executor levels from channel B, plus when the desk was last heard.
	 *
	 *  Separate from `linkState` on purpose. "We heard the desk 0.3 s ago" is an
	 *  observation; "the link is live" is a verdict, and this app does not let
	 *  the first quietly become the second. */
	deskState: (): Promise<DeskState> => ipcRenderer.invoke('desk:state'),
}

export type LifeApi = typeof api

contextBridge.exposeInMainWorld('life', api)
