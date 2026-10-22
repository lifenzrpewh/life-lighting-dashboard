// The media check's state, shared by the Arena view's Media row and the
// Lookbook view (./components/MediaCheck.tsx, ./components/LookbookView.tsx): which
// service is checked, its run sheet, the "same" confirmations, fetches under way,
// and the actions. Both read the same rules, and the pins and "same" marks are
// shared: one made in either (or in a pop-out) shows in the others at once.
//
// Which service: the one the run order (the Cue Manager) has open, by its
// Planning Center plan, unless this machine picks by hand. The lookbook is
// asked when the service changes and on Check again, never polled: it is a
// hosted app beyond the booth, not a feed.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { ArenaStatus } from '../shared/arena.js'
import { useHoldingMap } from './holdingMapStore.js'
import { layerOfCode } from '../shared/holding-map.js'
import { backgroundGaps, codesOn, explainPlan, moveTargets, movePins, oldForegrounds, pinsFrom, placementStep, planPlacements, slotCode, slotMark, updatePlan, type OldClip, type Pin, type PlanLine, type Placement, type Unplaced, type UpdateStep } from '../shared/holding.js'
import {
	checkMedia,
	lookbookStem,
	nzDate,
	offeredServices,
	type FileSizes,
	type LookbookItem,
	type LookbookRead,
	type LookbookService,
	type MediaCheck,
	type SameMark,
} from '../shared/media-check.js'
import type { FetchRequest, FetchRun, FetchStates, MediaSource } from '../shared/media-fetch.js'

export type Load<T> = { kind: 'idle' } | { kind: 'reading' } | { kind: 'read'; read: LookbookRead<T> }

/** The service last picked on this machine: a convenience, so a re-opened
 *  kiosk checks the same service. Only offered again while the lookbook still
 *  lists it. */
const PICKED_KEY = 'paua.mediaCheck.service'
/** Set when this machine picks the service by hand rather than following the
 *  run order (following is the default). */
const BY_HAND_KEY = 'paua.mediaCheck.byHand'
/** Moments placed by hand, per service (`Pin`, ../shared/holding.ts): on this
 *  computer, the last few services kept. Arena holds what was loaded; this
 *  keeps Update all from moving it back. */
const PINS_KEY = 'paua.holding.pins'
const PINS_SERVICES = 12

function storedPins(): Record<string, Pin[]> {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(PINS_KEY) ?? '{}')
		if (typeof raw !== 'object' || raw === null) return {}
		return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, pinsFrom(v)]))
	} catch {
		return {}
	}
}

/** Bumped (in this page's storage) when a "same" mark changes, so another
 *  page (a pop-out) reads the marks again from main. */
const SAME_CHANGED_KEY = 'paua.mediaCheck.sameChanged'

// One copy of the pins for every check on this page, and kept in step with
// other pages (a pop-out) by the storage event. Before, each view held its own
// copy from when it mounted, and a stale one's Update all moved a moment back
// that another had placed by hand, then saved over its pin.
let pinsNow: Record<string, Pin[]> = storedPins()
let sameTick = 0
const listeners = new Set<() => void>()
const tell = () => {
	for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
	listeners.add(l)
	return () => void listeners.delete(l)
}
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (e) => {
		if (e.key === PINS_KEY) pinsNow = storedPins()
		else if (e.key === SAME_CHANGED_KEY) sameTick++
		else return
		tell()
	})
}
function writePins(all: Record<string, Pin[]>): void {
	pinsNow = all
	store(PINS_KEY, JSON.stringify(all))
	tell()
}
function sameChanged(): void {
	sameTick++
	store(SAME_CHANGED_KEY, String(Date.now()))
	tell()
}
const NO_PINS: Pin[] = []

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
	// The latest run (a confirmation's fetches together), as main keeps it.
	const [lastRun, setLastRun] = useState<FetchRun | null>(null)
	useEffect(() => {
		if (!watchFetches || life === undefined) return
		let alive = true
		const poll = () => {
			void life.mediaFetches().then((f) => alive && setFetches(f))
			void life.lastMediaRun().then((r) => alive && setLastRun(r))
		}
		poll()
		const id = setInterval(poll, 500)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [watchFetches])
	const clearRefusal = (code: string) => setRefused(({ [code]: _, ...rest }) => rest)

	// The "same" confirmations, read once and after each change, made here or
	// in any other check (`sameChanged`).
	const [same, setSame] = useState<ReadonlySet<string>>(new Set())
	const sameAt = useSyncExternalStore(subscribe, () => sameTick)
	useEffect(() => {
		let alive = true
		void life?.sameMarks().then((m) => alive && setSame(new Set(m)))
		return () => {
			alive = false
		}
	}, [sameAt])
	const markSame = (mark: SameMark) => {
		clearRefusal(mark.code)
		void life?.markSame(mark).then((r) => {
			if (!r.ok) setRefused((x) => ({ ...x, [mark.code]: r.detail }))
			sameChanged()
		})
	}
	/** "It's there" (the owner, 2026-10-13: "an override to say it's there and
	 *  note it"): each clip of `code` that needs a look is marked right by hand,
	 *  kept until a new file turns up on either side, and a failed fetch of it is
	 *  set aside. Shown in orange from then on, never as plain green. */
	const itsThere = (code: string) => {
		const file = (runSheet ?? []).map((i) => i.files[code]).find((f) => f !== undefined)
		if (file !== undefined && runSheet !== null && today !== null) {
			for (const layer of status.layers) {
				for (const slot of layer.slots) {
					const arenaFile = slot.file ?? slot.missingFile
					if (slotCode(slot) !== code || arenaFile === null) continue
					const mark = slotMark(slot, runSheet, today, same, sizes)
					if (mark === 'missing' || mark === 'different' || mark === 'may-differ') markSame({ code, file: arenaFile, want: lookbookStem(file), same: true, there: true })
				}
			}
		}
		if (fetches[code]?.state === 'failed') {
			void life?.mediaThere(code).then((r) => {
				if (!r.ok) setRefused((x) => ({ ...x, [code]: r.detail }))
			})
		}
	}

	/** Replace the local file (the owner, 2026-10-18): a fetch that found a
	 *  different file of its name in the local folder, again, the old one moved
	 *  to Replaced there. */
	const replaceLocal = (code: string) => {
		clearRefusal(code)
		void life?.mediaReplace(code).then((r) => {
			if (!r.ok) setRefused((x) => ({ ...x, [code]: r.detail }))
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
	// Placed by hand, for this service: one copy for every check (above).
	const pinsBy = useSyncExternalStore(subscribe, () => pinsNow)
	const pins: Pin[] = service === null ? NO_PINS : (pinsBy[service.id] ?? NO_PINS)
	const savePins = (next: Pin[]) => {
		if (service === null) return
		const { [service.id]: _, ...rest } = pinsNow
		writePins(Object.fromEntries([...Object.entries(rest).slice(-(PINS_SERVICES - 1)), ...(next.length === 0 ? [] : [[service.id, next]])]))
	}
	// File sizes, so a file is told by its size, not its name (../shared/media-check.ts,
	// `sameFile`): asked when the run sheet or the clips carrying its codes change.
	const [sizes, setSizes] = useState<FileSizes | undefined>(undefined)
	const today = runSheet === null ? null : codesOn(runSheet)
	const arenaFiles =
		today === null
			? []
			: [...new Set(status.layers.flatMap((l) => l.slots.filter((x) => x.file !== null && today.has(slotCode(x) ?? '')).map((x) => x.file as string)))].sort()
	const libraryFiles = runSheet === null ? [] : [...new Set(runSheet.flatMap((i) => Object.values(i.files)))].sort()
	const sizeKey = JSON.stringify([arenaFiles, libraryFiles])
	useEffect(() => {
		if (runSheet === null || life === undefined) return
		let alive = true
		void life.mediaSizes({ arena: arenaFiles, lookbook: libraryFiles }).then((s) => alive && setSizes(s))
		return () => {
			alive = false
		}
	}, [sizeKey])
	// The Holding map on this computer (Settings › Holding): what each column takes.
	const map = useHoldingMap()
	// The plan, worked out once per change of what it is planned from, not on
	// every render of every view that shows it.
	const derived = useMemo(() => {
		const check: MediaCheck | null = runSheet === null ? null : checkMedia(runSheet, status, same, sizes, (code) => layerOfCode(map, code) !== null)
		// Each item's codes into its column, by Arena's column names (../shared/holding.ts).
		const { placements, unplaced }: { placements: Placement[]; unplaced: Unplaced[] } =
			runSheet === null ? { placements: [], unplaced: [] } : planPlacements(runSheet, status, map, pins)
		const plannedUpdate: { steps: UpdateStep[]; unplaced: Unplaced[] } = runSheet === null ? { steps: [], unplaced: [] } : updatePlan(runSheet, status, same, sizes, map, pins)
		// HOLD BG's gaps, for the normal background (the owner, 2026-10-06): in
		// Update all, and drawn where they go. Not counted as something to look at.
		const fills: Placement[] = runSheet === null ? [] : backgroundGaps(runSheet, status, map, pins)
		// The plan in words: every moment's codes and what Update all does with each, or why not.
		const planLines: PlanLine[] = runSheet === null ? [] : explainPlan(runSheet, status, same, sizes, map, pins)
		// To look at, by code, as the Holding view marks them: a code with any clip
		// whose file may differ, differs or is missing (one of CB095's eighteen is
		// enough), one not where its item belongs, or one with no place (a code the
		// lookbook has no file for is said apart).
		const look = new Set<string>()
		if (runSheet !== null && today !== null) {
			for (const layer of status.layers) {
				for (const slot of layer.slots) {
					const mark = slotMark(slot, runSheet, today, same, sizes)
					if (mark === 'may-differ' || mark === 'different' || mark === 'missing') look.add(slotCode(slot) ?? '')
				}
			}
			for (const p of placements) look.add(p.code)
			for (const u of unplaced) if (u.kind !== 'no-file') look.add(u.code)
		}
		// Old foregrounds (../shared/holding.ts): never one Update all is about to load into.
		const loading = new Set(plannedUpdate.steps.flatMap((s) => s.request.clipIds))
		const oldFgs: OldClip[] = runSheet === null ? [] : oldForegrounds(runSheet, status, loading, map)
		const allOld: OldClip[] = runSheet === null ? [] : oldForegrounds(runSheet, status, new Set(), map)
		return { check, placements, unplaced, plannedUpdate, fills, planLines, look, oldFgs, allOld }
		// `today` follows `runSheet`.
	}, [runSheet, status, same, sizes, map, pins])
	const { check, placements, unplaced, plannedUpdate, fills, planLines, look, oldFgs, allOld } = derived
	const trouble = check === null ? 0 : look.size

	// Nothing is copied or loaded into Arena without a confirmation first (the
	// owner, 2026-10-05): a Fetch, a Place and Update all each say what they
	// will do, and only Load sends it. Main runs the steps one at a time.
	// Before it says anything, main says where each file would come from: a
	// file that is not on the drive, or only in another version there, would be
	// downloaded from the lookbook, and the operator is asked about that apart.
	const [asking, setAsking] = useState<{
		id: number
		title: string
		steps: UpdateStep[]
		unplaced: Unplaced[]
		/** Old foregrounds to offer clearing, off until ticked (`oldForegrounds`). */
		clears: OldClip[]
		sources: Record<string, MediaSource> | null
		/** Done once Load is pressed: a hand placement's pin is kept only then. */
		after?: () => void
	} | null>(null)
	const askId = useRef(0)
	const ask = (title: string, steps: UpdateStep[], unplaced: Unplaced[] = [], clears: OldClip[] = [], after?: () => void) => {
		const id = ++askId.current
		setAsking({ id, title, steps, unplaced, clears, sources: null, ...(after === undefined ? {} : { after }) })
		void life?.mediaSources(steps.map((s) => s.request)).then((sources) => setAsking((a) => (a?.id === id ? { ...a, sources } : a)))
	}
	/** The clips of a step that are on screen now, by where they are. */
	const onScreen = (step: UpdateStep): { id: number; where: string }[] =>
		status.layers.flatMap((layer) =>
			layer.slots.flatMap((slot, i) =>
				slot.state === 'playing' && step.request.clipIds.includes(slot.id) ? [{ id: slot.id, where: `${layer.name} · column ${i + 1}` }] : [],
			),
		)
	/** Which steps Load would send, as it would send them: a file only in the
	 *  lookbook only when `lookbook`, a clip on screen only when it is one of
	 *  `live`, the clips the operator agreed to replace (the owner, 2026-10-05:
	 *  "happy to have it override the live clip, with an extra warning"). A
	 *  clip that went on screen since is left alone. A step left with no clip
	 *  to load is not sent; a file with nowhere to come from is left out. */
	const toSend = (answers: { lookbook: boolean; live: readonly number[] }): FetchRequest[] => {
		if (asking === null || asking.sources === null) return []
		const out: FetchRequest[] = []
		for (const step of asking.steps) {
			const from = asking.sources[step.request.code]?.from
			if (!(from === 'drive' || (from === 'lookbook' && answers.lookbook))) continue
			const live = onScreen(step).map((c) => c.id)
			const replace = live.filter((id) => answers.live.includes(id))
			const clipIds = step.request.clipIds.filter((id) => !live.includes(id) || replace.includes(id))
			if (step.request.clipIds.length > 0 && clipIds.length === 0) continue
			out.push({ ...step.request, clipIds, allowLookbook: from === 'lookbook', allowLive: replace })
		}
		return out
	}
	const confirm = (answers: { lookbook: boolean; live: readonly number[]; clear: boolean }) => {
		asking?.after?.()
		const requests = toSend(answers)
		if (requests.length > 0 && asking !== null && life !== undefined) {
			const sent = new Set(requests.map((r) => r.code))
			// The log gets what was sent, each with where it goes, and the codes that needed nothing.
			const lines = asking.steps.filter((s) => sent.has(s.request.code)).map((s) => s.what)
			const settled = planLines.flatMap((l) => l.notes.filter((n) => n.tone === 'ok').map((n) => n.code))
			const already = asking.title.startsWith('Update all') ? new Set(settled).size : 0
			for (const r of requests) clearRefusal(r.code)
			void life.runMedia({ label: asking.title, requests, plan: lines, already }).then((r) => {
				if ('ok' in r) for (const req of requests) setRefused((x) => ({ ...x, [req.code]: r.detail }))
				else setLastRun(r)
			})
		}
		if (answers.clear) {
			for (const c of asking?.clears ?? []) {
				clearRefusal(c.code)
				void life?.emptyClip(c.clipId, c.code).then((r) => {
					if (!r.ok) setRefused((x) => ({ ...x, [c.code]: r.detail }))
				})
			}
		}
		setAsking(null)
	}
	const askUpdateAll = () =>
		ask(`Update all: ${plannedUpdate.steps.length === 1 ? '1 step' : `${plannedUpdate.steps.length} steps`}`, plannedUpdate.steps, plannedUpdate.unplaced, oldFgs)
	const askClearOld = () => ask(`Clear old foregrounds: ${allOld.length}`, [], [], allOld)

	return {
		/** The Holding map these were planned by. */
		map,
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
		/** Check again: the run sheet, or, when the service itself did not
		 *  read (the lookbook had not listed it yet, or did not answer), the
		 *  service first. */
		readItemsAgain: () => {
			if (service !== null) return readItems(service.id)
			if (!byHand && plan !== null) return readFollowed(plan)
			if (byHand) readServices()
		},
		check,
		trouble,
		placements,
		unplaced,
		fills,
		/** The plan in words (`explainPlan`). */
		planLines,
		plannedUpdate,
		same,
		sizes,
		// Actions, and how they are going.
		fetches,
		refused,
		lastRun,
		markSame,
		itsThere,
		replaceLocal,
		/** Moved for this service, and the actions on them. */
		pins,
		unpin: (item: number) => savePins(pins.filter((p) => p.item !== item)),
		/** Where a moment may be moved, by clip id, and whom each swaps with. */
		moveTargets: (what: { item: number; code: string }) => (runSheet === null ? new Map<number, { column: number; swap: number | null }>() : moveTargets(runSheet, status, what, map, pins)),
		/** Move a moment to `column` (from 1) for this service, swapping with
		 *  the moment there: asks first when it loads anything, and keeps the
		 *  move once Load is pressed. */
		askMoveTo: (what: { item: number; code: string }, column: number) => {
			if (runSheet === null) return
			const next = movePins(runSheet, status, what, column, map, pins)
			const moved = new Set(next.filter((p) => !pins.some((q) => q.item === p.item && q.column === p.column && q.code === p.code)).map((p) => p.item))
			const steps = planPlacements(runSheet, status, map, next).placements.filter((p) => moved.has(p.item)).map(placementStep)
			const titles = [what.item, ...[...moved].filter((i) => i !== what.item)].map((i) => runSheet[i]?.label ?? runSheet[i]?.title ?? '')
			if (steps.length === 0) savePins(next)
			else ask(titles.length > 1 ? `Swap ${titles[0]} and ${titles[1]}` : `Move ${titles[0]}`, steps, [], [], () => savePins(next))
		},
		asking,
		ask,
		onScreen,
		toSend,
		confirm,
		cancel: () => setAsking(null),
		askUpdateAll,
		/** HOLD FG clips this run sheet does not use, and the confirmation to clear them. */
		oldFgs: allOld,
		askClearOld,
	}
}
