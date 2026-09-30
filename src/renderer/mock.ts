// The mock lying desk — the plan's Verification section, made real.
//
// WHY THIS EXISTS: "a mock MA3, and a mock lying desk that can be made slow,
// silent, or wrong, to prove the UI degrades honestly" (docs/PLAN.md). A UI that
// has only ever been looked at while healthy has not been looked at. Every
// scenario below is a failure this app is specifically claimed to survive, so
// each one must be a thing you can put on the screen and stare at.
//
// ⚠️ DEV ONLY, AND LOUDLY LABELLED. Gated behind `import.meta.env.DEV`, so it is
// not in a packaged build at all, and while it is active the screen wears a
// banner across the top. Fixture data that can be mistaken for a real desk is
// exactly the class of lie this codebase exists to refuse.

import type { Channel, LinkState } from '../shared/reading.js'
import { record, unread } from '../shared/reading.js'
import type { Service } from '../shared/service.js'

export type Scenario = 'healthy' | 'stale' | 'silent' | 'unreachable' | 'cold'

export const SCENARIOS: Scenario[] = ['healthy', 'stale', 'silent', 'unreachable', 'cold']

export const SCENARIO_LABEL: Record<Scenario, string> = {
	healthy: 'healthy desk',
	stale: 'slow desk — values ageing',
	silent: 'desk stopped answering (last values held, with age)',
	unreachable: 'desk unreachable',
	cold: 'just booted — nothing read yet',
}

const SERVICE: Service = {
	date: '2026-09-21',
	campus: 'Mount Eden',
	planTitle: 'Sunday Morning',
	nowItemId: 'itm-3',
	items: [
		{ pcoItemId: 'itm-1', title: 'Countdown', kind: 'segment', startsAt: '10:02', lengthSec: 180, lightingNote: null },
		{ pcoItemId: 'itm-2', title: 'Welcome', kind: 'segment', startsAt: '10:05', lengthSec: 420, lightingNote: null },
		{
			pcoItemId: 'itm-3',
			title: 'Great Are You',
			kind: 'song',
			startsAt: '10:07',
			lengthSec: 270,
			lightingNote: 'band only, no movers',
		},
		{ pcoItemId: 'itm-4', title: 'Message', kind: 'teaching', startsAt: '10:12', lengthSec: null, lightingNote: 'flat and bright, hold through' },
		{ pcoItemId: 'itm-5', title: 'Response', kind: 'song', startsAt: '10:40', lengthSec: 360, lightingNote: null },
	],
}

const MINUTE = 60_000

export type MockState = {
	link: LinkState
	service: Channel<Service>
}

/** Build the whole app state for one scenario, at time `now`.
 *
 *  Note what this does NOT do: it never hands the UI a value directly. It builds
 *  `Channel`s and a `LinkState` and lets the real `readingOf` derivation decide
 *  what is LIVE, STALE or UNKNOWN. So looking at these scenarios is looking at
 *  the production code path, not at a parallel one built to look convincing. */
export function mockState(scenario: Scenario, now: number): MockState {
	const live: LinkState = { state: 'live', roundTripMs: 0.4 }
	const dead: LinkState = { state: 'unreachable', since: now - 12_000 }

	switch (scenario) {
		case 'healthy':
			return {
				link: live,
				service: record(unread<Service>(), { ok: true, value: SERVICE, at: now }),
			}

		case 'stale':
			// Read fine, four minutes ago. Values show WITH their age.
			return {
				link: live,
				service: record(unread<Service>(), { ok: true, value: SERVICE, at: now - 4 * MINUTE }),
			}

		case 'silent': {
			// The case the Channel shape exists for: good read, then timeouts. The
			// last known values are held and aged rather than blanked.
			const svc = record(
				record(unread<Service>(), { ok: true, value: SERVICE, at: now - 6 * MINUTE }),
				{ ok: false, reason: 'timeout', at: now },
			)
			return { link: live, service: svc }
		}

		case 'unreachable':
			// Fresh values in hand, and every one of them drops to UNKNOWN anyway,
			// together, because the link outranks the value's own freshness.
			return {
				link: dead,
				service: record(unread<Service>(), { ok: true, value: SERVICE, at: now }),
			}

		case 'cold':
			// Boot. UNKNOWN, not off, not zero, not an empty run order.
			//
			// Link LIVE on purpose: 'unreachable' outranks a value's own freshness,
			// so a dead link masks every other unknown behind it. The only way to
			// see the 'never-read' rendering — the one the plan specifically names
			// ("Boot state is UNKNOWN, not off") — is with the desk answering and
			// the first snapshot still in flight. That is a real moment, every
			// single boot, and it needs to be a moment you can look at.
			return { link: live, service: unread<Service>() }
	}
}
