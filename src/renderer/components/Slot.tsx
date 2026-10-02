// One of the two slots (../../shared/layout.ts): a strip with the picker and
// the view's own buttons, and a body the view fills.
//
// A native view (the run order, the MA) is drawn by main over the body, so
// the strip above is the only part of a slot that view cannot cover. That is
// why the picker, Reload and the fold live in it.
//
// The body is handed out by `boxRef`, not owned here: the App places the
// native views from a spot that never unmounts (../panePlacement.ts), so moving
// the MA from one slot to the other moves it rather than logging in again.

import type { ReactNode } from 'react'

import { VIEW_LABEL, type ViewId } from '../../shared/layout.js'

const label = 'text-[10px] font-semibold tracking-widest uppercase'

/** The picker: every view on offer, the slot's own highlighted. With only its
 *  own on offer it is a heading, not a button that does nothing. */
function Picker({ view, choices, onPick }: { view: ViewId; choices: readonly ViewId[]; onPick: (v: ViewId) => void }) {
	if (choices.length <= 1) return <h2 className={`${label} px-3 text-booth-dim`}>{VIEW_LABEL[view]}</h2>
	return (
		<div role="tablist" className="flex min-w-0 items-center gap-1">
			{choices.map((c) => (
				<button
					key={c}
					type="button"
					role="tab"
					aria-selected={c === view}
					onClick={() => onPick(c)}
					className={`${label} h-10 shrink-0 rounded-md px-3 active:scale-[0.98] ${
						c === view ? 'bg-booth-ink text-booth-bg' : 'text-booth-dim active:bg-booth-edge'
					}`}
				>
					{VIEW_LABEL[c]}
				</button>
			))}
		</div>
	)
}

export function Slot({
	view,
	choices,
	onPick,
	actions,
	onFold,
	width,
	folded = false,
	boxRef,
	children,
}: {
	view: ViewId
	choices: readonly ViewId[]
	onPick: (v: ViewId) => void
	/** The view's own buttons, at the strip's far end. */
	actions?: ReactNode
	/** The left slot folds; the right one has nowhere to fold to. */
	onFold?: () => void
	/** In pixels, for the left slot (../leftWidth.ts). The right takes the rest. */
	width?: number
	/** Hidden, never unmounted: what is in it keeps its state. */
	folded?: boolean
	/** The body, for a native view to be placed over. */
	boxRef?: (el: HTMLElement | null) => void
	children: ReactNode
}) {
	return (
		<section
			style={width === undefined ? undefined : { width }}
			className={`${width === undefined ? 'min-w-0 flex-1' : 'shrink-0'} ${folded ? 'hidden' : 'flex'} flex-col bg-booth-panel`}
		>
			<div className="flex h-12 shrink-0 items-center gap-2 border-b border-booth-edge px-1">
				<Picker view={view} choices={choices} onPick={onPick} />
				<span className="ml-auto" />
				{actions}
				{onFold !== undefined && (
					<button
						type="button"
						onClick={onFold}
						aria-label={`Fold ${VIEW_LABEL[view]} away`}
						className="h-10 w-12 shrink-0 rounded-md text-lg text-booth-dim active:bg-booth-edge"
					>
						‹
					</button>
				)}
			</div>
			<div ref={boxRef} className="flex min-h-0 min-w-0 flex-1 bg-booth-bg">
				{children}
			</div>
		</section>
	)
}

/** The left slot, folded to a strip that opens it again. */
export function FoldedSlot({ view, onOpen }: { view: ViewId; onOpen: () => void }) {
	return (
		<nav className="flex w-14 shrink-0 flex-col border-r border-booth-edge bg-booth-panel">
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Show ${VIEW_LABEL[view]}`}
				className="flex flex-1 flex-col items-center gap-4 pt-5 text-booth-dim active:bg-booth-edge"
			>
				<span className="text-lg">›</span>
				<span className={`${label} [writing-mode:vertical-rl]`}>{VIEW_LABEL[view]}</span>
			</button>
		</nav>
	)
}

/** A body's message, in the middle of it: what someone sees while a native
 *  view is not drawn over it. */
export function Centered({ children }: { children: ReactNode }) {
	return <div className="flex min-w-0 flex-1 items-center justify-center">{children}</div>
}
