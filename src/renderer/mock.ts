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
import type { Showfile } from '../shared/showfile.js'

export type Scenario = 'healthy' | 'stale' | 'silent' | 'unreachable' | 'cold'

export const SCENARIOS: Scenario[] = ['healthy', 'stale', 'silent', 'unreachable', 'cold']

export const SCENARIO_LABEL: Record<Scenario, string> = {
	healthy: 'healthy desk',
	stale: 'slow desk — values ageing',
	silent: 'desk stopped answering (last values held, with age)',
	unreachable: 'desk unreachable',
	cold: 'just booted — nothing read yet',
}

/** Mount Eden Base names itself as its base (docs/MA3_READ_MODEL.md § UserVars),
 *  so the healthy desk is the one where the chip is amber. */
const ON_BASE: Showfile = {
	name: 'Mount Eden Base',
	base: 'Mount Eden Base',
	baseFrom: 'uservar',
	onBase: true,
	version: '2.3.2.0',
}

const SERVICE_SHOW: Showfile = { ...ON_BASE, name: 'Mount Eden 260921 AM', onBase: false }

const MINUTE = 60_000

export type MockState = {
	link: LinkState
	showfile: Channel<Showfile>
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
				showfile: record(unread<Showfile>(), { ok: true, value: ON_BASE, at: now - MINUTE }),
			}

		case 'stale':
			// Read fine, four minutes ago. Values show WITH their age.
			// The showfile read on its own, slower cadence: nine minutes is past
			// its threshold, as it would be on a console worked nonstop.
			return {
				link: live,
				showfile: record(unread<Showfile>(), { ok: true, value: SERVICE_SHOW, at: now - 9 * MINUTE }),
			}

		case 'silent': {
			// The case the Channel shape exists for: good read, then timeouts. The
			// last known values are held and aged rather than blanked.
			const show = record(
				record(unread<Showfile>(), { ok: true, value: ON_BASE, at: now - 6 * MINUTE }),
				{ ok: false, reason: 'timeout', at: now },
			)
			return { link: live, showfile: show }
		}

		case 'unreachable':
			// Fresh values in hand, and every console reading drops to UNKNOWN
			// anyway, together, because the link outranks the value's own
			// freshness.
			return {
				link: dead,
				showfile: record(unread<Showfile>(), { ok: true, value: ON_BASE, at: now }),
			}

		case 'cold':
			// Boot. UNKNOWN, not off, not zero.
			//
			// Link LIVE on purpose: 'unreachable' outranks a value's own freshness,
			// so a dead link masks every other unknown behind it. The only way to
			// see the 'never-read' rendering — the one the plan specifically names
			// ("Boot state is UNKNOWN, not off") — is with the desk answering and
			// the first snapshot still in flight. That is a real moment, every
			// single boot, and it needs to be a moment you can look at.
			return { link: live, showfile: unread<Showfile>() }
	}
}
