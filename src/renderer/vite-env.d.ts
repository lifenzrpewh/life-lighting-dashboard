/// <reference types="vite/client" />

import type { LifeApi } from '../preload/index.cjs'

declare global {
	interface Window {
		/** Exposed by the preload via contextBridge. Absent when the renderer is
		 *  opened in a plain browser (which is how the UI is inspected during
		 *  development), so every use must handle it being undefined. */
		life?: LifeApi
	}
}
