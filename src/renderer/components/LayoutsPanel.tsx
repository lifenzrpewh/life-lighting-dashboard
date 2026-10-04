// Layouts (../../shared/layout.ts): the saved arrangements, each drawn as a
// picture of its windows, so one is known at a glance rather than by "3
// windows". Tap one to switch to it. Everyone may switch; editing the layout
// on screen, saving it under a name and deleting one are operator mode's,
// because they are arranging. Opens in the windows' place, as Connections
// does, because a native page cannot be drawn over.
//
// Edit this layout lives here since 2026-10-05: one Layouts button on the bar
// rather than LAYOUT and EDIT LAYOUT side by side.

import { useEffect, useState } from 'react'
import { Pencil, Save, Trash2 } from 'lucide-react'

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
import { Button, Placeholder, Sheet, viewIcon } from './ui.js'

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
		<Sheet
			title="Layouts"
			description={operator ? 'Tap one to switch to it. Edit or save the one on screen.' : 'Tap one to switch to it.'}
			actions={
				operator && (
					<Button icon={Pencil} onClick={onEdit}>
						Edit this layout
					</Button>
				)
			}
			onClose={onClose}
		>
			<div className="min-h-0 flex-1 overflow-y-auto p-6">
				{saved.length === 0 && !operator ? (
					<div className="flex h-full items-center justify-center">
						<Placeholder
							head="No layouts saved on this computer yet"
							body="Hold Volunteer (top right) for 3 seconds for operator mode, then arrange the windows and save them here."
						/>
					</div>
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] items-start gap-5">
						{saved.map((s) => {
							const on = s.name === current
							return (
								<div
									key={s.name}
									className={`group relative flex flex-col gap-3 rounded-2xl bg-booth-panel p-3.5 transition-colors hover:bg-booth-strip ${
										on ? 'nacre-ring' : 'ring-1 ring-booth-edge ring-inset'
									}`}
								>
									<button
										type="button"
										onClick={() => {
											onSwitch(s.layout)
											onClose()
										}}
										className="flex flex-col gap-3 text-left"
										aria-label={`Switch to ${s.name}`}
									>
										<Miniature layout={s.layout} labelOf={labelOf} />
										<span className={`flex items-baseline justify-between gap-3 px-0.5 ${operator ? 'pr-12' : ''}`}>
											<span className="truncate text-lg font-medium">{s.name}</span>
											<span className={`shrink-0 text-sm ${on ? 'text-booth-ink' : 'text-booth-dim'}`}>
												{on ? 'On screen' : `${s.layout.windows.length} ${s.layout.windows.length === 1 ? 'window' : 'windows'}`}
											</span>
										</span>
									</button>
									{operator && (
										<span className="absolute right-2.5 bottom-2.5">
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
							<div className="flex flex-col gap-3 rounded-2xl p-3.5 ring-1 ring-booth-edge ring-inset [border-style:dashed]">
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
		</Sheet>
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
