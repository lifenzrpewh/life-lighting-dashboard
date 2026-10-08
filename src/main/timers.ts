// The countdown chip's sources: OnTime and ProPresenter, asked over HTTP.
//
// WHY MAIN ASKS, NOT THE RENDERER: the renderer is sandboxed and owns no truth;
// main reads every source and the renderer ages what main says, as it does for
// the console. Both programs are on the booth network, so these are plain LAN
// requests, asked the way ./http-poll.ts asks: one at a time, and a failure is
// never a time.

import { decodeOnTimePoll } from '../bridge/ontime.js'
import { decodeProPresenter } from '../bridge/propresenter.js'
import type { Settings } from '../shared/settings.js'
import { getJson, poll } from './http-poll.js'
import {
	ONTIME_POLL_MS,
	PROPRESENTER_POLL_MS,
	TIMER_REQUEST_TIMEOUT_MS,
	type OnTimeNow,
	type ProPresenterNow,
	type TimerSources,
} from '../shared/timer.js'

export type TimersHandle = {
	/** The programs' channels. Which ProPresenter timer to follow is a setting
	 *  the caller adds, so naming one needs no restart and loses no reading. */
	sources(): Pick<TimerSources, 'ontime' | 'propresenter'>
	stop(): void
}

export function startTimers(s: Settings): TimersHandle {
	const ontime =
		s.onTimeHost === null
			? null
			: poll<OnTimeNow>({
					log: 'timers',
					label: 'OnTime',
					every: ONTIME_POLL_MS,
					read: async () => {
						const r = await getJson(`http://${s.onTimeHost}:${s.onTimePort}/api/poll`, TIMER_REQUEST_TIMEOUT_MS)
						return r.ok ? { ok: true, decoded: decodeOnTimePoll(r.body) } : r
					},
				})

	const propresenter =
		s.proPresenterHost === null
			? null
			: poll<ProPresenterNow>({
					log: 'timers',
					label: 'ProPresenter',
					every: PROPRESENTER_POLL_MS,
					read: async () => {
						const base = `http://${s.proPresenterHost}:${s.proPresenterPort}/v1`
						const [timers, message] = await Promise.all([getJson(`${base}/timers/current`, TIMER_REQUEST_TIMEOUT_MS), getJson(`${base}/stage/message`, TIMER_REQUEST_TIMEOUT_MS)])
						if (!timers.ok) return timers
						if (!message.ok) return message
						return { ok: true, decoded: decodeProPresenter(timers.body, message.body) }
					},
				})

	return {
		sources: () => ({ ontime: ontime?.channel() ?? null, propresenter: propresenter?.channel() ?? null }),
		stop() {
			ontime?.stop()
			propresenter?.stop()
		},
	}
}
