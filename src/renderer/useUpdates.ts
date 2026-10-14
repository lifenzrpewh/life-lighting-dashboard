// What main's updater last knew (../shared/updates.ts), polled like the link,
// because main owns it. Null outside the kiosk (the mock in a browser).

import type { UpdateState } from '../shared/updates.js'
import { usePolled } from './usePolled.js'

export function useUpdates(): UpdateState | null {
	// 1 Hz: a download's progress reads as moving; the rest changes hourly.
	return usePolled((api) => api.updateState(), 1_000) ?? null
}
