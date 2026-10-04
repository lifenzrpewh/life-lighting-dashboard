// Saved layouts (../../shared/layout.ts): tap one to switch to it. Everyone
// may switch; saving the layout on screen under a name, and deleting one, is
// operator mode's, because it is arranging. Opens in the grid's place, as
// Connections does, because a native page cannot be drawn over.

import { useEffect, useState } from 'react'

import {
	SAVED_LAYOUTS_MAX,
	deleteLayout,
	layoutNameError,
	sameArrangement,
	saveLayout,
	type Layout,
	type SavedLayout,
} from '../../shared/layout.js'
import { Field, Input } from './form.js'

export function LayoutsPanel({
	layout,
	saved,
	operator,
	onSwitch,
	onSaved,
	onClose,
}: {
	layout: Layout
	saved: readonly SavedLayout[]
	operator: boolean
	onSwitch: (layout: Layout) => void
	onSaved: (saved: SavedLayout[]) => void
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
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-booth-bg">
			<div className="flex items-center border-b border-booth-edge bg-booth-panel px-6 py-2">
				<h2 className="text-xs font-semibold tracking-widest text-booth-dim uppercase">Layouts</h2>
				<button type="button" onClick={onClose} className="ml-auto h-10 rounded border border-booth-edge px-5 text-sm active:scale-[0.98]">
					Back
				</button>
			</div>
			<div className="flex max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-6">
				{saved.length === 0 ? (
					<p className="text-base text-booth-dim">
						No layouts saved on this computer yet.
						{operator ? ' Arrange the windows with Edit layout, then save it here under a name.' : ' Hold the mode chip for operator mode to save one.'}
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-booth-edge rounded-md border border-booth-edge">
						{saved.map((s) => (
							<li key={s.name} className="flex items-center gap-3 px-2">
								<button
									type="button"
									onClick={() => {
										onSwitch(s.layout)
										onClose()
									}}
									className="flex min-h-16 flex-1 items-center gap-3 px-2 text-left text-lg active:bg-booth-edge"
								>
									<span className={`size-2.5 rounded-full ${s.name === current ? 'bg-booth-ink' : 'border border-booth-dim'}`} />
									{s.name}
									<span className="text-sm text-booth-dim">
										{s.layout.windows.length} {s.layout.windows.length === 1 ? 'window' : 'windows'}
										{s.name === current ? ' · on screen' : ''}
									</span>
								</button>
								{operator && (
									<button
										type="button"
										onClick={() => (deleting === s.name ? (onSaved(deleteLayout(saved, s.name)), setDeleting(null)) : setDeleting(s.name))}
										className={`h-11 shrink-0 rounded border px-4 text-sm ${
											deleting === s.name ? 'border-state-unreachable text-state-unreachable' : 'border-booth-edge text-booth-dim'
										}`}
									>
										{deleting === s.name ? 'Tap again to delete' : 'Delete'}
									</button>
								)}
							</li>
						))}
					</ul>
				)}
				{operator && (
					<section className="flex flex-col gap-4 rounded-md border border-booth-edge px-4 py-5">
						<h3 className="text-xs font-semibold tracking-widest text-booth-dim uppercase">Save the layout on screen</h3>
						<Field label="Name" error={error ?? undefined} hint="The same name replaces that layout.">
							<Input value={name} onChange={setName} placeholder="Sunday" />
						</Field>
						<div className="flex items-center gap-4">
							<button
								type="button"
								onClick={save}
								className="h-12 rounded border-2 border-booth-ink bg-booth-ink px-8 text-base font-semibold text-booth-bg active:scale-[0.98]"
							>
								Save
							</button>
							{note !== null && <span className="text-sm text-state-live">{note}</span>}
						</div>
					</section>
				)}
			</div>
		</div>
	)
}
