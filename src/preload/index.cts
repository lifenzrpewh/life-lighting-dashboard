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

const api = {
	/** The console link as main knows it. Today: always unreachable, because no
	 *  OSC transport is wired (docs/PLAN.md Phase 0 spike 1). */
	linkState: (): Promise<LinkState> => ipcRenderer.invoke('link:state'),
}

export type LifeApi = typeof api

contextBridge.exposeInMainWorld('life', api)
