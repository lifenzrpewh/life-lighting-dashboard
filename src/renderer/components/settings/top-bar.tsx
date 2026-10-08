// Settings › Top bar: show or hide each item on the bar, on this computer
// (../../barItems.ts). Changes at once; nothing to save.

import { BAR_ITEMS, BAR_ITEM_LABEL, type BarItem } from '../../barItems.js'

import { Segmented } from '../ui.js'
import { DetailHead } from './parts.js'

export function TopBarSettings({ hidden, onSet }: { hidden: ReadonlySet<BarItem>; onSet: (item: BarItem, hidden: boolean) => void }) {
	return (
		<>
			<DetailHead title="Top bar" />
			<p className="max-w-prose text-sm text-booth-dim">
				What the bar shows on this computer. A hidden item takes what it opens with it: with the console hidden, Save As
				and Load are out of reach too. The mode lock, Settings and the fold are always there.
			</p>
			<ul className="flex flex-col gap-1.5">
				{BAR_ITEMS.map((item) => (
					<li key={item} className="flex min-h-16 items-center gap-4 rounded-xl bg-booth-panel px-5 py-2 ring-1 ring-booth-edge ring-inset">
						<span className="flex min-w-0 flex-1 flex-col leading-tight">
							<span className={`text-base font-medium ${hidden.has(item) ? 'text-booth-dim' : ''}`}>{BAR_ITEM_LABEL[item].name}</span>
							<span className="mt-0.5 truncate text-sm text-booth-dim">{BAR_ITEM_LABEL[item].what}</span>
						</span>
						<Segmented
							label={BAR_ITEM_LABEL[item].name}
							value={!hidden.has(item)}
							onChange={(shown) => onSet(item, !shown)}
							options={[
								{ value: true, label: 'Shown' },
								{ value: false, label: 'Hidden' },
							]}
						/>
					</li>
				))}
			</ul>
		</>
	)
}
