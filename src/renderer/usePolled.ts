// What main last said, asked every `ms`: the one way the kiosk and pop-outs
// follow what main owns (the link, the panes, Arena, the timers, the video).
//
// An answer equal to the last one is not set: every IPC answer is a fresh
// copy, so without this each of a dozen polls re-rendered the whole kiosk on
// every answer (about 20 a second with nothing changing), every view and its
// derivations with it. Equal is by value, so a changed answer always lands.

import { useEffect, useState } from 'react'

type Api = NonNullable<Window['life']>

/** Undefined until main has answered once: a page that has not asked yet is
 *  not a source that is not set up. `ask` null asks nothing, and keeps the
 *  last answer. `ask` is chosen once per caller (by its view, or by whether a
 *  source is added), so only whether it is null is a dependency. */
export function usePolled<T>(ask: ((api: Api) => Promise<T>) | null, ms: number): T | undefined {
	const [value, setValue] = useState<T | undefined>(undefined)
	const asking = ask !== null
	useEffect(() => {
		const api = window.life
		if (api === undefined || ask === null) return
		let alive = true
		const poll = () =>
			void ask(api).then((v) => {
				if (alive) setValue((old) => (old !== undefined && sameValue(old, v) ? old : v))
			})
		poll()
		const id = setInterval(poll, ms)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [ms, asking])
	return value
}

/** Structural equality for IPC answers (plain data: no Maps, Dates or cycles). */
export function sameValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false
		return true
	}
	if (Array.isArray(b)) return false
	const ka = Object.keys(a)
	if (ka.length !== Object.keys(b).length) return false
	for (const k of ka) {
		if (!Object.prototype.hasOwnProperty.call(b, k)) return false
		if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
	}
	return true
}
