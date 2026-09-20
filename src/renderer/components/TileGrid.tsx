import { useState } from 'react'

import type { Reading } from '../../shared/reading.js'
import { matchReading } from '../../shared/reading.js'
import type { Board, Tile } from '../../shared/board.js'
import { isBasefileOwned } from '../../shared/board.js'
import { Unknown, formatAge, staleContent } from './vocabulary.js'

type Tab = 'looks' | 'groups'

function TileButton({ tile, onFire }: { tile: Tile; onFire: (t: Tile) => void }) {
	const swatch = tile.colour === null ? undefined : { borderColor: `#${tile.colour}` }
	return (
		<button
			type="button"
			onClick={() => onFire(tile)}
			style={swatch}
			// Never disabled — not when unconfirmed, not when the desk is
			// unreachable. The desk may still be taking commands, and a volunteer
			// reaching for a look must not be refused by our uncertainty.
			className={`h-24 rounded border-2 bg-booth-panel px-3 text-left transition active:scale-[0.97] ${
				tile.confirmed ? 'border-booth-edge' : 'border-dotted border-state-unknown'
			}`}
		>
			<span className="block truncate text-lg">{tile.label}</span>
			<span className="mt-1 block text-[10px] uppercase tracking-wider text-booth-dim">
				{tile.confirmed ? `seq ${tile.sequence}` : 'existence unknown'}
				{isBasefileOwned(tile.sequence) && ' · read-only'}
			</span>
		</button>
	)
}

function Grid({ tiles, onFire, ageMs }: { tiles: Tile[]; onFire: (t: Tile) => void; ageMs: number | null }) {
	return (
		<>
			{ageMs !== null && <p className="px-4 pb-2 text-xs text-state-stale">board {formatAge(ageMs)}</p>}
			<div className={`grid grid-cols-5 gap-3 overflow-y-auto px-4 pb-4 ${ageMs === null ? '' : staleContent}`}>
				{tiles.map((t) => (
					<TileButton key={t.sequence} tile={t} onFire={onFire} />
				))}
			</div>
		</>
	)
}

export function TileGrid({ board, onFire }: { board: Reading<Board>; onFire: (t: Tile) => void }) {
	const [tab, setTab] = useState<Tab>('looks')

	return (
		<section className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-1 border-y border-booth-edge px-4 py-2">
				{(['looks', 'groups'] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						className={`rounded px-4 py-2 text-xs font-semibold uppercase tracking-widest ${
							tab === t ? 'bg-booth-ink text-booth-bg' : 'text-booth-dim'
						}`}
					>
						{t}
					</button>
				))}
			</div>

			{matchReading(board, {
				live: (b) => <Grid tiles={b[tab]} onFire={onFire} ageMs={null} />,
				stale: (b, ageMs) => <Grid tiles={b[tab]} onFire={onFire} ageMs={ageMs} />,
				// No tiles rather than fake tiles. The board is derived from the
				// showfile's own UserVars; if we have not read them we do not know
				// what this show has, and guessing would put buttons on screen that
				// fire nothing.
				unknown: (why) => (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
						<Unknown why={why} />
						<p className="max-w-sm text-xs text-booth-dim">
							The board is read from the showfile. Until the desk answers, we do not know which
							looks this show has.
						</p>
					</div>
				),
			})}
		</section>
	)
}
