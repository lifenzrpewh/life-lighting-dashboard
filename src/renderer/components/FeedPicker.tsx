// What a Video tab shows, picked from one list (the owner's choice,
// 2026-10-08, item 8: one Video view for every feed). Grouped by kind: this
// computer's Spout (Windows) or Syphon (macOS) senders, the NDI sources added
// in Settings › Video sources, and the capture inputs added there. Each tab
// keeps its own pick in the layout (../../shared/layout.ts, `VideoChoice`), so
// two Video tabs can show two feeds, and a tab named "Stage cam" stays one.
//
// Drawn here, never as a native <select>: the system's dropdown would not take
// a pick on the booth's touchscreen (the owner, 2026-10-03), so every row is a
// finger's height. Anyone may pick: it is the layout, as the old Video view's
// sender pick was everyone's.
//
// What is offered is read from the machine and from Settings, never typed: a
// sender appears while something sends it; an NDI source or capture input
// once Admin has added it.

import { useState } from 'react'
import { Cast, ChevronDown, MonitorPlay, Webcam, type LucideIcon } from 'lucide-react'

import type { CaptureInput } from '../../shared/capture.js'
import type { VideoChoice } from '../../shared/layout.js'
import type { NdiSource } from '../../shared/ndi.js'
import { barButton } from './vocabulary.js'

export type FeedOptions = {
	/** This computer's senders; null while not heard (outside the kiosk). */
	senders: readonly string[] | null
	/** The Video feed's connection is turned off in Settings. */
	videoOff: boolean
	/** Which this computer has: Spout on Windows, Syphon on a Mac. */
	spoutKind: 'spout' | 'syphon'
	/** Every NDI source and capture input added, on or off. */
	ndi: readonly NdiSource[]
	capture: readonly CaptureInput[]
}

/** The kind of sender this computer has, by its platform. */
export const SPOUT_KIND: 'spout' | 'syphon' = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? 'syphon' : 'spout'

const KIND_WORD = { spout: 'Spout', syphon: 'Syphon' } as const

/** A sender's name, short: Arena's own prefix says nothing in a tab. */
export const shortSender = (name: string) => name.replace(/^Arena - /, '')

/** What a Video tab is called without a name of its own: its feed's name. */
export function feedName(feed: VideoChoice | null | undefined, ndi: readonly NdiSource[], capture: readonly CaptureInput[]): string {
	if (feed == null) return 'Video'
	switch (feed.kind) {
		case 'spout':
		case 'syphon':
			return feed.name === null ? 'Video' : shortSender(feed.name)
		case 'ndi':
			return ndi.find((s) => s.id === feed.id)?.name ?? 'NDI'
		case 'capture':
			return capture.find((c) => c.id === feed.id)?.name ?? 'Capture'
	}
}

type Row = { feed: VideoChoice; name: string; detail: string | null; off: boolean }
type Group = { title: string; icon: LucideIcon; rows: Row[]; empty: string }

function groupsOf(o: FeedOptions, current: VideoChoice | null | undefined): Group[] {
	const word = KIND_WORD[o.spoutKind]
	const senders = o.senders ?? []
	// The tab's own sender stays in the list while it is not being sent, so
	// the tab's pick is never silently something else.
	const wanted = current != null && (current.kind === 'spout' || current.kind === 'syphon') && current.name !== null ? current.name : null
	const names = wanted !== null && !senders.includes(wanted) ? [...senders, wanted] : senders
	return [
		{
			title: `${word} · this computer`,
			icon: MonitorPlay,
			rows: o.videoOff
				? []
				: names.map((name) => ({
						feed: { kind: o.spoutKind, name },
						name: shortSender(name),
						detail: senders.includes(name) ? (name === shortSender(name) ? null : name) : 'not being sent now',
						off: !senders.includes(name),
					})),
			empty: o.videoOff
				? 'The Video feed is turned off in Settings.'
				: o.senders === null
					? 'Not heard yet.'
					: `No ${word} sender on this computer. Turn on a ${word} output in Arena (Output › Advanced Output).`,
		},
		{
			title: 'NDI',
			icon: Cast,
			rows: o.ndi.map((s) => ({ feed: { kind: 'ndi', id: s.id }, name: s.name, detail: s.on ? s.source : 'turned off in Settings', off: !s.on })),
			empty: 'None added. Admin adds them in Settings › Video sources.',
		},
		{
			title: 'Capture',
			icon: Webcam,
			rows: o.capture.map((c) => ({
				feed: { kind: 'capture', id: c.id },
				name: c.name,
				detail: c.on ? c.device : 'turned off in Settings',
				off: !c.on,
			})),
			empty: 'None added. Admin adds them in Settings › Video sources.',
		},
	]
}

const same = (a: VideoChoice | null | undefined, b: VideoChoice) => JSON.stringify(a ?? null) === JSON.stringify(b)

/** Every feed, grouped, each a finger's height. */
export function FeedList({
	options,
	current,
	onPick,
}: {
	options: FeedOptions
	current: VideoChoice | null | undefined
	onPick: (feed: VideoChoice) => void
}) {
	return (
		<div className="flex flex-col gap-3">
			{groupsOf(options, current).map((g) => (
				<section key={g.title} className="flex flex-col gap-1">
					<span className="px-3 pt-1 text-xs font-medium text-booth-dim">{g.title}</span>
					{g.rows.length === 0 ? (
						<span className="px-3 pb-1 text-sm text-booth-faint">{g.empty}</span>
					) : (
						g.rows.map((row) => {
							const on = same(current, row.feed)
							return (
								<button
									key={JSON.stringify(row.feed)}
									type="button"
									disabled={row.off && !on}
									onClick={() => onPick(row.feed)}
									aria-pressed={on}
									className={`flex min-h-12 w-full shrink-0 items-center gap-3 rounded-ctl px-3 py-1.5 text-left text-sm hover:bg-booth-hover active:bg-booth-hover disabled:opacity-50 disabled:hover:bg-transparent ${
										on ? 'text-booth-ink ring-1 ring-accent-hi ring-inset' : 'text-booth-dim'
									}`}
								>
									<g.icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden />
									<span className="flex min-w-0 flex-1 flex-col leading-tight">
										<span className={`truncate ${on ? 'font-medium' : ''}`}>{row.name}</span>
										{row.detail !== null && <span className="truncate font-mono text-xs text-booth-faint">{row.detail}</span>}
									</span>
								</button>
							)
						})
					)}
				</section>
			))}
		</div>
	)
}

/** The tab's own pick, in its strip: the feed's name and ▾, opening the list
 *  under it. */
export function FeedMenu({
	options,
	current,
	onPick,
}: {
	options: FeedOptions
	current: VideoChoice | null | undefined
	onPick: (feed: VideoChoice) => void
}) {
	const [open, setOpen] = useState(false)
	return (
		<div className="relative shrink-0">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				aria-label="Which feed this tab shows"
				className={`${barButton} max-w-56 gap-2`}
			>
				<span className="truncate">{feedName(current, options.ndi, options.capture)}</span>
				<ChevronDown size={16} className="shrink-0 text-booth-dim" aria-hidden />
			</button>
			{open && (
				<div className="absolute top-12 right-0 z-20 max-h-[min(32rem,70vh)] w-80 animate-rise overflow-y-auto rounded-win bg-booth-raise p-1.5 shadow-2xl ring-1 ring-booth-edge">
					<FeedList
						options={options}
						current={current}
						onPick={(feed) => {
							setOpen(false)
							onPick(feed)
						}}
					/>
				</div>
			)}
		</div>
	)
}

/** A Video tab with nothing picked yet: the list, in its body. */
export function FeedChooser({ options, onPick }: { options: FeedOptions; onPick: (feed: VideoChoice) => void }) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto p-6">
			<div className="flex w-full max-w-md flex-col gap-4">
				<div className="flex flex-col gap-1 px-3">
					<span className="text-base font-medium">What should this tab show?</span>
					<span className="text-sm text-booth-dim">Each Video tab shows its own feed; the feed button in its strip changes it later.</span>
				</div>
				<FeedList options={options} current={null} onPick={onPick} />
			</div>
		</div>
	)
}
