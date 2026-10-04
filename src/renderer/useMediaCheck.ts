// The media check's state, shared by the Arena view's Media row and the Holding
// view (./components/MediaCheck.tsx, ./components/HoldingView.tsx): which
// service is checked, its run sheet, the "same" confirmations, fetches under way,
// and the actions. Both read the same rules, so a fix made in one shows in the
// other at Arena's next push.
//
// Which service: the one the run order (the Cue Manager) has open, by its
// Planning Center plan, unless this machine picks by hand. The lookbook is
// asked when the service changes and on Check again, never polled: it is a
// hosted app beyond the booth, not a feed.

import { useEffect, useRef, useState } from 'react'

import type { ArenaStatus } from '../shared/arena.js'
import { planPlacements, updatePlan, type Placement, type Unplaced, type UpdateStep } from '../shared/holding.js'
import {
	checkMedia,
	nzDate,
	offeredServices,
	type LookbookItem,
	type LookbookRead,
	type LookbookService,
	type MediaCheck,
	type SameMark,
} from '../shared/media-check.js'
import type { FetchRequest, FetchStates } from '../shared/media-fetch.js'

export type Load<T> = { kind: 'idle' } | { kind: 'reading' } | { kind: 'read'; read: LookbookRead<T> }

/** The service last picked on this machine: a convenience, so a re-opened
 *  kiosk checks the same service. Only offered again while the lookbook still
 *  lists it. */
const PICKED_KEY = 'paua.mediaCheck.service'
/** Set when this machine picks the service by hand rather than following the
 *  run order (following is the default). */
const BY_HAND_KEY = 'paua.mediaCheck.byHand'

function stored(key: string): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

function store(key: string, value: string | null): void {
	try {
		if (value === null) localStorage.removeItem(key)
		else localStorage.setItem(key, value)
	} catch {
		// A machine that keeps nothing follows the run order again next time.
	}
}

export type MediaCheckState = ReturnType<typeof useMediaCheck>

/** `watchFetches`: ask main how fetches are going, twice a second, while
 *  someone can see them. */
export function useMediaCheck(status: ArenaStatus, now: number, watchFetches: boolean) {
	const life = window.life
	const [campus, setCampus] = useState<string | null>(null)
	const [services, setServices] = useState<Load<LookbookService[]>>({ kind: 'idle' })
	const [picked, setPicked] = useState<string | null>(() => stored(PICKED_KEY))
	const [items, setItems] = useState<Load<LookbookItem[]>>({ kind: 'idle' })

	// Fetches under way or done, as main holds them; and what main said to a
	// tap it refused, by code.
	const [fetches, setFetches] = useState<FetchStates>({})
	const [refused, setRefused] = useState<Record<string, string>>({})
	useEffect(() => {
		if (!watchFetches || life === undefined) return
		let alive = true
		const poll = () => void life.mediaFetches().then((f) => alive && setFetches(f))
		poll()
		const id = setInterval(poll, 500)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [watchFetches])
	const clearRefusal = (code: string) => setRefused(({ [code]: _, ...rest }) => rest)

	// The "same" confirmations, read once and after each change.
	const [same, setSame] = useState<ReadonlySet<string>>(new Set())
	const readSame = () => void life?.sameMarks().then((m) => setSame(new Set(m)))
	useEffect(readSame, [])
	const markSame = (mark: SameMark) => {
		clearRefusal(mark.code)
		void life?.markSame(mark).then((r) => {
			if (!r.ok) setRefused((x) => ({ ...x, [mark.code]: r.detail }))
			readSame()
		})
	}
	const fetchCode = (req: FetchRequest) => {
		clearRefusal(req.code)
		void life?.fetchMedia(req).then((r) => {
			if (!r.ok) setRefused((x) => ({ ...x, [req.code]: r.detail }))
		})
	}

	const readServices = () => {
		if (life === undefined) return
		setServices({ kind: 'reading' })
		void life.lookbookServices().then((read) => setServices({ kind: 'read', read }))
	}
	// Which service the items are for: a late answer for a service no longer
	// wanted is dropped.
	const [itemsFor, setItemsFor] = useState<string | null>(null)
	const itemsWanted = useRef<string | null>(null)
	const readItems = (id: string) => {
		if (life === undefined) return
		itemsWanted.current = id
		setItemsFor(id)
		setItems({ kind: 'reading' })
		void life.lookbookItems(id).then((read) => {
			if (itemsWanted.current === id) setItems({ kind: 'read', read })
		})
	}

	// Following the run order (the owner's ask, 2026-10-05): the Cue Manager's
	// address names the Planning Center plan it has open, and the lookbook's
	// services carry the same plan id. Picking by hand stops following until
	// Follow the run order is tapped.
	const [byHand, setByHand] = useState(() => stored(BY_HAND_KEY) === '1')
	const [plan, setPlan] = useState<string | null>(null)
	useEffect(() => {
		if (byHand || life === undefined) return
		let alive = true
		const poll = () => void life.cuePane().then((r) => alive && setPlan(r?.plan ?? null))
		poll()
		const id = setInterval(poll, 2_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [byHand])
	const [followed, setFollowed] = useState<{ plan: string; load: Load<LookbookService | null> } | null>(null)
	const readFollowed = (p: string) => {
		if (life === undefined) return
		setFollowed({ plan: p, load: { kind: 'reading' } })
		void life.lookbookServiceForPlan(p).then((read) => setFollowed((f) => (f?.plan === p ? { plan: p, load: { kind: 'read', read } } : f)))
	}
	useEffect(() => {
		if (!byHand && plan !== null && followed?.plan !== plan) readFollowed(plan)
	}, [byHand, plan])
	const follow = (on: boolean) => {
		setByHand(!on)
		store(BY_HAND_KEY, on ? null : '1')
		if (on && plan !== null) readFollowed(plan)
	}

	// The list to pick from is asked only when picking by hand.
	useEffect(() => {
		if (!byHand || services.kind !== 'idle') return
		readServices()
		// The campus orders the list; a pop-out has no settings, and lists all.
		void life?.settings().then((s) => setCampus(s?.campus ?? null))
	}, [byHand])

	const offered = services.kind === 'read' && services.read.ok ? offeredServices(services.read.value, nzDate(new Date(now)), campus) : []
	const followedLoad = !byHand && plan !== null && followed?.plan === plan ? followed.load : null
	const service = byHand
		? (offered.find((s) => s.id === picked) ?? null)
		: followedLoad?.kind === 'read' && followedLoad.read.ok
			? followedLoad.read.value
			: null

	// The service's run sheet is read as it becomes the one checked.
	useEffect(() => {
		if (service !== null && itemsFor !== service.id) readItems(service.id)
	}, [service?.id])

	const pick = (id: string) => {
		setPicked(id)
		store(PICKED_KEY, id)
		readItems(id)
	}

	const runSheet = service !== null && itemsFor === service.id && items.kind === 'read' && items.read.ok ? items.read.value : null
	const check: MediaCheck | null = runSheet === null ? null : checkMedia(runSheet, status, same)
	// Each item's codes into its column, by Arena's column names (../shared/holding.ts).
	const { placements, unplaced }: { placements: Placement[]; unplaced: Unplaced[] } =
		runSheet === null ? { placements: [], unplaced: [] } : planPlacements(runSheet, status)
	const plannedUpdate: { steps: UpdateStep[]; unplaced: Unplaced[] } = runSheet === null ? { steps: [], unplaced: [] } : updatePlan(runSheet, status, same)
	// To look at: an old or missing file, a code not where its item belongs, or
	// one with no place (a code the lookbook has no file for is said apart).
	const trouble =
		check === null ? 0 : check.counts['not-on-disk'] + check.counts['other-version'] + placements.length + unplaced.filter((u) => u.kind !== 'no-file').length

	// Nothing is copied or loaded into Arena without a confirmation first (the
	// owner, 2026-10-05): a Fetch, a Place and Update all each say what they
	// will do, and only Load sends it. Main runs the steps one at a time.
	const [asking, setAsking] = useState<{ title: string; steps: UpdateStep[]; unplaced: Unplaced[] } | null>(null)
	const ask = (title: string, steps: UpdateStep[], unplaced: Unplaced[] = []) => setAsking({ title, steps, unplaced })
	const confirm = () => {
		if (asking === null) return
		for (const step of asking.steps) fetchCode(step.request)
		setAsking(null)
	}
	const askUpdateAll = () => ask(`Update all: ${plannedUpdate.steps.length === 1 ? '1 step' : `${plannedUpdate.steps.length} steps`}`, plannedUpdate.steps, plannedUpdate.unplaced)

	return {
		// Which service, and how it was chosen.
		byHand,
		follow,
		plan,
		followedLoad,
		services,
		offered,
		readServices,
		pick,
		service,
		// Its run sheet and what the check made of it.
		items,
		runSheet,
		readItemsAgain: () => service !== null && readItems(service.id),
		check,
		trouble,
		placements,
		unplaced,
		plannedUpdate,
		same,
		// Actions, and how they are going.
		fetches,
		refused,
		markSame,
		asking,
		ask,
		confirm,
		cancel: () => setAsking(null),
		askUpdateAll,
	}
}
