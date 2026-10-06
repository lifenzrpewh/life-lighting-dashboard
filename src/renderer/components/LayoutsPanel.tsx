// Layouts (../../shared/layout.ts): the saved arrangements, each drawn as a
// picture of its windows, so one is known at a glance rather than by "3
// windows". Tap one to switch to it. Everyone may switch; editing the layout
// on screen, saving it under a name and deleting one are operator mode's,
// because they are arranging, and are not drawn in volunteer mode.
//
// A dropdown over the windows since 2026-10-06 (the owner: "appear as a
// dropdown on top of the screen, not take you to a whole different screen"),
// from the bar and from the folded strip alike. A native page cannot be drawn
// over, so while it is open every page stands in as a picture of itself, as
// in Edit layout (../App.tsx). A tap outside closes it.
//
// Edit this layout lives here since 2026-10-05: one Layouts button on the bar
// rather than LAYOUT and EDIT LAYOUT side by side.

import { useEffect, useState } from 'react'
import { Pencil, Save, Trash2, X } from 'lucide-react'

import {
	HEIGHT,
	SAVED_LAYOUTS_MAX,
	WIDTH,
	deleteLayout,
	layoutNameError,
	sameArrangement,
	saveLayout,
	type Layout,
	type SavedLayout,
	type ViewId,
} from '../../shared/layout.js'
import { Field, Input } from './form.js'
import { Button, IconButton, viewIcon } from './ui.js'

export function LayoutsPanel({
	layout,
	saved,
	operator,
	labelOf,
	onSwitch,
	onSaved,
	onEdit,
	onClose,
}: {
	layout: Layout
	saved: readonly SavedLayout[]
	operator: boolean
	labelOf: (view: ViewId) => string
	onSwitch: (layout: Layout) => void
	onSaved: (saved: SavedLayout[]) => void
	/** Start arranging the layout on screen. */
	onEdit: () => void
	onClose: () => void
}) {
	const current = saved.find((s) => sameArrangement(s.layout, layout))?.name ?? null
	const [name, setName] = useState(current ?? '')
	const [error, setError] = useState<string | null>(null)
	const [note, setNote] = useState<string | null>(null)
	const [deleting, setDeleting] = useState<string | null>(null)
	useEffect(() => {
		if (deleting === null) return
		const t = setTimeout(() => setDeleting(null), 4_000)
		return () => clearTimeout(t)
	}, [deleting])

	const save = () => {
		const e = layoutNameError(name)
		setNote(null)
		if (e !== null) return setError(e)
		const next = saveLayout(saved, name, layout)
		if (next === null) return setError(`That is ${SAVED_LAYOUTS_MAX}, the most there can be. Delete one first.`)
		setError(null)
		onSaved(next)
		setNote(`Saved as “${name.trim()}”.`)
	}

	return (
		<div
			role="dialog"
			aria-label="Layouts"
			className="absolute top-2 right-4 z-30 flex max-h-[calc(100%-1rem)] w-[min(44rem,calc(100%-2rem))] animate-rise flex-col overflow-hidden rounded-2xl bg-booth-panel shadow-2xl ring-1 ring-booth-edge"
		>
			<div className="flex h-14 shrink-0 items-center gap-3 border-b border-booth-edge pr-2 pl-5">
				<h2 className="text-lg font-medium">Layouts</h2>
				<p className="min-w-0 truncate text-sm text-booth-dim">Tap one to switch to it.</p>
				<span className="ml-auto flex shrink-0 items-center gap-2">
					{operator && (
						<Button size="sm" icon={Pencil} onClick={onEdit}>
							Edit this layout
						</Button>
					)}
					<IconButton icon={X} label="Close" onClick={onClose} />
				</span>
			</div>
			<div className="min-h-0 overflow-y-auto p-4">
				{saved.length === 0 && !operator ? (
					<p className="px-1 py-6 text-center text-sm text-booth-dim">
						No layouts saved on this computer yet. Operator mode arranges the windows and saves them here.
					</p>
				) : (
					<div className="grid grid-cols-2 items-start gap-3">
						{saved.map((s) => {
							const on = s.name === current
							return (
								<div
									key={s.name}
									className={`group relative flex flex-col gap-2 rounded-xl bg-booth-bg p-2.5 transition-colors hover:bg-booth-strip ${
										on ? 'nacre-ring' : 'ring-1 ring-booth-edge ring-inset'
									}`}
								>
									<button
										type="button"
										onClick={() => {
											onSwitch(s.layout)
											onClose()
										}}
										className="flex flex-col gap-2 text-left"
										aria-label={`Switch to ${s.name}`}
									>
										<Miniature layout={s.layout} labelOf={labelOf} />
										<span className={`flex items-baseline justify-between gap-3 px-0.5 ${operator ? 'pr-11' : ''}`}>
											<span className="truncate font-medium">{s.name}</span>
											<span className={`shrink-0 text-xs ${on ? 'text-booth-ink' : 'text-booth-dim'}`}>
												{on ? 'On screen' : `${s.layout.windows.length} ${s.layout.windows.length === 1 ? 'window' : 'windows'}`}
											</span>
										</span>
									</button>
									{operator && (
										<span className="absolute right-2 bottom-1.5">
											<Button
												size="sm"
												variant={deleting === s.name ? 'danger' : 'quiet'}
												icon={Trash2}
												label={deleting === s.name ? undefined : `Delete ${s.name}`}
												onClick={() =>
													deleting === s.name ? (onSaved(deleteLayout(saved, s.name)), setDeleting(null)) : setDeleting(s.name)
												}
												className={deleting === s.name ? 'bg-booth-panel' : 'opacity-80 group-hover:opacity-100'}
											>
												{deleting === s.name ? 'Tap again to delete' : undefined}
											</Button>
										</span>
									)}
								</div>
							)
						})}
						{operator && (
							<div className="flex flex-col gap-2 rounded-xl p-2.5 ring-1 ring-booth-edge ring-inset [border-style:dashed]">
								<Miniature layout={layout} labelOf={labelOf} />
								<Field label="Save the layout on screen as" error={error ?? undefined} hint={note ?? 'The same name replaces that layout.'}>
									<Input value={name} onChange={setName} placeholder="Sunday" />
								</Field>
								<Button variant="primary" icon={Save} onClick={save} className="self-start">
									Save
								</Button>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

/** A layout as a small picture: each window where it is, named by the view it
 *  shows. */
function Miniature({ layout, labelOf }: { layout: Layout; labelOf: (view: ViewId) => string }) {
	return (
		<div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-booth-bg" aria-hidden>
			{layout.windows.map((w) => {
				const tab = w.tabs.find((t) => t.id === w.active) ?? w.tabs[0] ?? null
				const ViewIcon = tab === null ? null : viewIcon(tab.view)
				return (
					<span
						key={w.id}
						className="absolute flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-booth-raise px-1 text-xs text-booth-dim"
						style={{
							left: `calc(${(w.x / WIDTH) * 100}% + 3px)`,
							top: `calc(${(w.y / HEIGHT) * 100}% + 3px)`,
							width: `calc(${(w.w / WIDTH) * 100}% - 6px)`,
							height: `calc(${(w.h / HEIGHT) * 100}% - 6px)`,
						}}
					>
						{ViewIcon !== null && <ViewIcon size={16} strokeWidth={1.8} />}
						<span className="max-w-full truncate">{tab === null ? 'Empty' : labelOf(tab.view)}</span>
						{w.tabs.length > 1 && <span className="text-[10px] text-booth-faint">+{w.tabs.length - 1}</span>}
					</span>
				)
			})}
		</div>
	)
}
