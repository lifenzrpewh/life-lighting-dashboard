// Settings › Top bar: show or hide each item on the bar, and Testing, on this
// computer (../../barItems.ts). Changes at once; nothing to save.

import type { ReactNode } from 'react'

import { BAR_ITEMS, BAR_ITEM_LABEL, type BarItem } from '../../barItems.js'

import { Segmented } from '../ui.js'
import { DetailHead } from './parts.js'

export function TopBarSettings({
	hidden,
	onSet,
	testing,
	onTesting,
}: {
	hidden: ReadonlySet<BarItem>
	onSet: (item: BarItem, hidden: boolean) => void
	testing: boolean
	onTesting: (on: boolean) => void
}) {
	return (
		<>
			<DetailHead title="Top bar" />
			<p className="max-w-prose text-[15px] text-booth-dim">
				What the bar shows on this computer. The lock, the fold handle and, in Admin, Settings are always there. The Guide is a
				view now: add it to a window. The show is on the console itself, and on the Console row in Connections.
			</p>
			<ul className="flex flex-col">
				{BAR_ITEMS.map((item) => (
					<Row key={item} name={BAR_ITEM_LABEL[item].name} what={BAR_ITEM_LABEL[item].what} dim={hidden.has(item)}>
						<Segmented
							label={BAR_ITEM_LABEL[item].name}
							value={!hidden.has(item)}
							onChange={(shown) => onSet(item, !shown)}
							options={[
								{ value: true, label: 'Shown' },
								{ value: false, label: 'Hidden' },
							]}
						/>
					</Row>
				))}
			</ul>
			<DetailHead title="Testing" />
			<ul className="flex flex-col">
				<Row name="Mark" what="While a field test is on, a flag on the bar: one tap writes a numbered line to the log at that moment." dim={!testing}>
					<Segmented
						label="Testing"
						value={testing}
						onChange={onTesting}
						options={[
							{ value: true, label: 'On' },
							{ value: false, label: 'Off' },
						]}
					/>
				</Row>
			</ul>
		</>
	)
}

function Row({ name, what, dim, children }: { name: string; what: string; dim: boolean; children: ReactNode }) {
	return (
		<li className="flex min-h-16 items-center gap-4 py-2">
			<span className="flex min-w-0 flex-1 flex-col leading-tight">
				<span className={`text-base font-bold ${dim ? 'text-booth-dim' : ''}`}>{name}</span>
				<span className="mt-0.5 text-sm text-booth-dim">{what}</span>
			</span>
			{children}
		</li>
	)
}
