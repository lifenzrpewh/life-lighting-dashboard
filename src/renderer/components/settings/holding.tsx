// Settings › Holding: the Holding map (../../../shared/holding-map.ts), the
// owner's "matrix" (2026-10-11). Arena's named HOLDING columns down the side,
// what each takes from the run sheet and what each layer of it holds across;
// the code families above; presets, Reset to defaults, and a file to carry a
// preset to another computer. Nothing here writes to Arena: it changes what
// Holding, Lookbook and Update all suggest, and those still ask first.
//
// ADD A COLUMN (the owner, 2026-10-11): a row for a name Arena does not have
// yet, so something can be assigned to it now. It takes effect once a column
// in the HOLDING group is named the same (by key, so `Alpha 1` is ALPHA1). A
// new row is kept once something in it is set: a column on its defaults says
// nothing the map has to hold. A row not in Arena can be removed, which drops
// what the map says about it.

import { useState, type ReactNode } from 'react'
import { Download, Plus, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react'

import type { ArenaStatus } from '../../../shared/arena.js'
import { columnNamesOf, slotCode, TYPE_LAYER } from '../../../shared/holding.js'
import {
	LAYER_KEYS,
	PRESET_NAME_MAX,
	PRESETS_MAX,
	cellOf,
	columnKey,
	defaultTakesWords,
	isDefault,
	presetFile,
	presetFromFile,
	takesOf,
	withFamily,
	withRule,
	type Cell,
	type CellKind,
	type HoldingMap,
	type LayerKey,
} from '../../../shared/holding-map.js'
import { mediaCodeOf, TYPE_NAMES } from '../../../shared/media-check.js'

import { holdingMapActions, useHoldingMapState } from '../../holdingMapStore.js'
import { Input } from '../form.js'
import { Button, Card, SectionTitle, Segmented } from '../ui.js'
import { DetailHead } from './parts.js'

const LAYER_NAME: Record<LayerKey, string> = { B: 'HOLD BG', F: 'HOLD FG', A: 'A SCREEN' }

/** What the default does in a cell, said short: ../../../shared/holding.ts's
 *  rules as they fall on this column and layer. */
function defaultCellWords(name: string, layer: LayerKey, column: number, lastPromo: number): string {
	const key = columnKey(name)
	if (/VIDEO|BROADCAST/.test(key)) return 'Left alone'
	const takesNothing = /COUNTDOWN/.test(key)
	if (layer === 'B') return column <= lastPromo ? (takesNothing ? 'Normal BG' : 'Item, else normal BG') : takesNothing ? 'Left alone' : 'Item'
	return takesNothing ? 'Left alone' : 'Item'
}

/** What a cell holds, said short, for the matrix. */
function cellWords(cell: Cell, auto: string): string {
	switch (cell.kind) {
		case 'auto':
			return auto
		case 'item':
			return 'Item only'
		case 'normal':
			return 'Normal BG'
		case 'leave':
			return 'Leave alone'
		case 'fixed':
			return cell.code
	}
}

const cellTone: Record<CellKind, string> = {
	auto: 'text-booth-faint hover:bg-booth-raise',
	item: 'bg-state-live/15 text-state-live',
	normal: 'bg-booth-raise text-booth-ink',
	leave: 'bg-warn/20 text-warn',
	fixed: 'bg-accent/30 text-booth-ink font-mono',
}

/** The named columns, each once by key (PROMO ×4 is one row), with their
 *  column numbers, from the layer items are placed by. */
function columnRows(
	status: ArenaStatus | null,
	map: HoldingMap,
	added: readonly string[],
): { rows: { key: string; name: string; numbers: number[]; here: boolean }[]; lastPromo: number } {
	const rows: { key: string; name: string; numbers: number[]; here: boolean }[] = []
	let lastPromo = 0
	if (status !== null) {
		const layerOf = (k: LayerKey) => status.layers.find((l) => TYPE_LAYER[k]?.test(l.name.trim()))
		const home = layerOf('F') ?? layerOf('B') ?? layerOf('A')
		const names = home === undefined ? status.columns.map((c) => c.name) : columnNamesOf(home, status)
		names.forEach((name, i) => {
			const key = columnKey(name)
			if (key === '' || /^COLUMN\d*$/.test(key)) return
			const row = rows.find((r) => r.key === key)
			if (row === undefined) rows.push({ key, name: name.trim(), numbers: [i + 1], here: true })
			else row.numbers.push(i + 1)
			if (key.startsWith('PROMO')) lastPromo = i + 1
		})
	}
	// What the map says about columns this composition does not have: kept, said.
	for (const key of Object.keys(map.columns))
		if (!rows.some((r) => r.key === key)) rows.push({ key, name: added.find((n) => columnKey(n) === key) ?? key, numbers: [], here: false })
	// Added here, nothing set yet: on screen until something is.
	for (const name of added) {
		const key = columnKey(name)
		if (!rows.some((r) => r.key === key)) rows.push({ key, name, numbers: [], here: false })
	}
	return { rows, lastPromo }
}

/** The code families worth a row: those in Arena now and those the map names. */
function familiesOf(status: ArenaStatus | null, map: HoldingMap): string[] {
	const out = new Set(Object.keys(map.families))
	for (const layer of status?.layers ?? []) {
		for (const slot of layer.slots) {
			const code = slotCode(slot)
			const c = code === null ? null : mediaCodeOf(code)
			if (c !== null) out.add(`${c.campus}${c.type}`)
		}
	}
	return [...out].sort()
}

const sameMap = (a: HoldingMap, b: HoldingMap) => JSON.stringify(a) === JSON.stringify(b)

export function HoldingSettings({ status }: { status: ArenaStatus | null }) {
	const { map, preset, presets } = useHoldingMapState()
	const [open, setOpen] = useState<{ key: string; name: string; what: 'takes' | LayerKey } | null>(null)
	/** Columns added here this visit, by name as typed. */
	const [added, setAdded] = useState<string[]>([])
	const { rows, lastPromo } = columnRows(status, map, added)
	const set = holdingMapActions.setMap
	const presetMap = presets.find((p) => p.name === preset)?.map
	const title =
		preset === null || presetMap === undefined
			? isDefault(map)
				? 'Defaults'
				: 'Changed from the defaults'
			: sameMap(map, presetMap)
				? preset
				: `${preset}, changed`

	return (
		<>
			<DetailHead title="Holding" />
			<p className="-mt-2 text-sm text-booth-dim">
				What each of Arena&rsquo;s named columns takes, layer by layer, on this computer. Holding, Lookbook and Update all follow it, and still ask before anything goes into Arena.
			</p>
			<Presets title={title} map={map} preset={preset} />
			<Card>
				<SectionTitle>Columns</SectionTitle>
				{status === null && <p className="text-sm text-booth-dim">Arena isn&rsquo;t answering, so its columns can&rsquo;t be read. What is set is kept.</p>}
				{rows.length === 0 && status !== null && (
					<p className="text-sm text-booth-dim">
						The HOLDING group&rsquo;s columns have no names yet. Name them in Arena (PRE, POST, WTL, NSL, BIBLES, WTG, PROMO) and they show here, or add one below.
					</p>
				)}
				{rows.length > 0 && (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
							<colgroup>
								<col className="w-[20%]" />
								<col className="w-[29%]" />
								<col className="w-[17%]" />
								<col className="w-[17%]" />
								<col className="w-[17%]" />
							</colgroup>
							<thead>
								<tr className="text-left text-xs font-bold text-booth-dim">
									<th className="py-2 pr-2">Arena column</th>
									<th className="py-2 pr-2">Takes from the run sheet</th>
									{LAYER_KEYS.map((k) => (
										<th key={k} className="py-2 pr-2">
											{LAYER_NAME[k]}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => {
									const takes = takesOf(map, r.name)
									const isOpen = (what: 'takes' | LayerKey) => open?.key === r.key && open.what === what
									return (
										<tr key={r.key} className="border-t border-booth-edge">
											<td className="py-1.5 pr-2">
												<span className="flex min-w-0 items-center gap-1">
													<span className="min-w-0 flex-1 truncate">
														<span className="font-bold text-booth-ink">{r.name}</span>
														{r.here ? (
															<span className="ml-1.5 text-xs text-booth-faint">{r.numbers.join(', ')}</span>
														) : map.columns[r.key] === undefined ? (
															<span className="ml-1.5 text-xs text-booth-faint" title="Added here: kept once something in its row is set">
																new
															</span>
														) : (
															<span className="ml-1.5 text-xs text-booth-faint" title="No HOLDING column in Arena has this name now">
																not in Arena
															</span>
														)}
													</span>
													{!r.here && (
														<button
															type="button"
															aria-label={`Remove ${r.name}`}
															title={`Remove ${r.name}`}
															onClick={() => {
																set(withRule(map, r.name, () => ({})))
																setAdded((a) => a.filter((n) => columnKey(n) !== r.key))
																if (open?.key === r.key) setOpen(null)
															}}
															className="grid size-8 shrink-0 place-items-center rounded-ctl text-booth-faint transition-[background-color,color] hover:bg-booth-raise hover:text-booth-ink active:scale-90"
														>
															<X size={16} strokeWidth={2.2} aria-hidden />
														</button>
													)}
												</span>
											</td>
											<td className="py-1.5 pr-2">
												<CellButton pressed={isOpen('takes')} tone={takes === undefined ? 'auto' : 'item'} onClick={() => setOpen(isOpen('takes') ? null : { key: r.key, name: r.name, what: 'takes' })}>
													{takes === undefined ? defaultTakesWords(r.name) : takes.length === 0 ? 'Nothing' : takes.join(', ')}
												</CellButton>
											</td>
											{LAYER_KEYS.map((k) => {
												const cell = cellOf(map, r.name, k)
												return (
													<td key={k} className="py-1.5 pr-2">
														<CellButton pressed={isOpen(k)} tone={cell.kind} onClick={() => setOpen(isOpen(k) ? null : { key: r.key, name: r.name, what: k })}>
															{cellWords(cell, defaultCellWords(r.name, k, r.numbers[0] ?? 0, lastPromo))}
														</CellButton>
													</td>
												)
											})}
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
				{open !== null &&
					(open.what === 'takes' ? (
						<TakesEditor key={`${open.key}:takes`} name={open.name} map={map} onSet={set} onDone={() => setOpen(null)} />
					) : (
						<CellEditor key={`${open.key}:${open.what}`} name={open.name} layer={open.what} map={map} onSet={set} onDone={() => setOpen(null)} />
					))}
				<AddColumn
					taken={rows.map((r) => r.key)}
					onAdd={(name) => {
						setAdded((a) => [...a, name])
						setOpen({ key: columnKey(name), name, what: 'takes' })
					}}
				/>
			</Card>
			<Families status={status} map={map} />
		</>
	)
}

/** A column Arena does not have yet: named here, assigned now, in effect once
 *  a HOLDING column in Arena is named the same. */
function AddColumn({ taken, onAdd }: { taken: readonly string[]; onAdd: (name: string) => void }) {
	const [name, setName] = useState('')
	const trimmed = name.trim()
	const key = columnKey(trimmed)
	const why =
		trimmed === ''
			? null
			: key === ''
				? 'A column name needs a letter or a digit.'
				: key.length > 40
					? 'That name is too long.'
					: /^COLUMN\d*$/.test(key)
						? 'Arena’s own “Column #” names are not read as names.'
						: taken.includes(key)
							? 'That column is in the table already.'
							: null
	const add = () => {
		if (trimmed === '' || why !== null) return
		onAdd(trimmed)
		setName('')
	}
	return (
		<div className="mt-1 flex flex-col gap-1.5 border-t border-booth-edge pt-3">
			{/* A form, so Enter on the keyboard adds it too. */}
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault()
					add()
				}}
			>
				<div className="w-56">
					<Input value={name} onChange={setName} placeholder="ALPHA" />
				</div>
				<Button icon={Plus} disabled={trimmed === '' || why !== null} onClick={add}>
					Add a column
				</Button>
				{why !== null && <span className="text-sm text-state-unreachable">{why}</span>}
			</form>
			<span className="text-xs text-booth-faint">For a column Arena doesn&rsquo;t have yet: it takes effect once a column in the HOLDING group is named the same.</span>
		</div>
	)
}

function CellButton({ children, tone, pressed, onClick }: { children: ReactNode; tone: CellKind; pressed: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={pressed}
			className={`flex h-10 w-full items-center truncate rounded-ctl px-2.5 text-left text-[13px] font-semibold transition-[background-color,transform] active:scale-95 ${cellTone[tone]} ${
				pressed ? 'ring-2 ring-accent-hi' : ''
			}`}
		>
			<span className="truncate">{children}</span>
		</button>
	)
}

function TakesEditor({ name, map, onSet, onDone }: { name: string; map: HoldingMap; onSet: (m: HoldingMap) => void; onDone: () => void }) {
	const now = takesOf(map, name)
	const [text, setText] = useState((now ?? []).join(', '))
	const setTakes = (takes: string[] | undefined) => {
		onSet(
			withRule(map, name, (r) => {
				const { takes: _old, ...rest } = r
				return takes === undefined ? rest : { ...rest, takes }
			}),
		)
		onDone()
	}
	const words = text
		.split(',')
		.map((w) => w.trim())
		.filter((w) => w !== '')
	return (
		<div className="mt-3 flex flex-col gap-3 rounded-win bg-booth-raise p-3">
			<span className="text-sm text-booth-ink">
				<b>{name}</b> takes the run-sheet items whose label is one of these words, or whose title or label has one in it. Several columns with the same words share the items out, as the PROMO columns do.
			</span>
			<div className="flex flex-wrap items-center gap-2">
				<div className="min-w-64 flex-1">
					<Input value={text} onChange={setText} placeholder="Alpha, Next Steps" />
				</div>
				<Button variant="primary" disabled={words.length === 0} onClick={() => setTakes(words)}>
					Use these words
				</Button>
				<Button onClick={() => setTakes([])}>Nothing</Button>
				<Button variant="ghost" onClick={() => setTakes(undefined)}>
					Default: {defaultTakesWords(name)}
				</Button>
			</div>
		</div>
	)
}

function CellEditor({ name, layer, map, onSet, onDone }: { name: string; layer: LayerKey; map: HoldingMap; onSet: (m: HoldingMap) => void; onDone: () => void }) {
	const now = cellOf(map, name, layer)
	const [code, setCode] = useState(now.kind === 'fixed' ? now.code : '')
	const parsed = mediaCodeOf(code.trim())
	const codeOk = parsed !== null && parsed.code === code.trim().toUpperCase()
	const setCell = (cell: Cell) => {
		onSet(withRule(map, name, (r) => ({ ...r, cells: { ...r.cells, [layer]: cell } })))
		onDone()
	}
	const kinds: { kind: Exclude<CellKind, 'fixed'>; label: string; words: string }[] = [
		{ kind: 'auto', label: 'Default', words: 'the rule every campus starts with (shown in grey in the table)' },
		{ kind: 'item', label: 'Item only', words: 'the item’s own code; no normal background' },
		...(layer === 'B' ? [{ kind: 'normal' as const, label: 'Normal BG', words: 'the service’s usual background, whatever the item has' }] : []),
		{ kind: 'leave', label: 'Leave alone', words: 'nothing placed, filled, updated or cleared' },
	]
	return (
		<div className="mt-3 flex flex-col gap-3 rounded-win bg-booth-raise p-3">
			<span className="text-sm text-booth-ink">
				<b>{name}</b> on {LAYER_NAME[layer]}:
			</span>
			<div className="flex flex-wrap gap-2">
				{kinds.map((k) => (
					<Button key={k.kind} pressed={now.kind === k.kind} onClick={() => setCell({ kind: k.kind })} label={`${k.label}: ${k.words}`}>
						{k.label}
					</Button>
				))}
			</div>
			<span className="text-xs text-booth-dim">{kinds.find((k) => k.kind === now.kind)?.words ?? 'always this code, whatever the run sheet says'}</span>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm text-booth-dim">Or always one code:</span>
				<div className="w-36">
					<Input value={code} onChange={setCode} placeholder="NF300" mono />
				</div>
				<Button variant={now.kind === 'fixed' ? 'quiet' : 'primary'} pressed={now.kind === 'fixed'} disabled={!codeOk} onClick={() => parsed !== null && setCell({ kind: 'fixed', code: parsed.code })}>
					Fixed code
				</Button>
				{code.trim() !== '' && !codeOk && <span className="text-sm text-state-unreachable">A code is two letters and three digits.</span>}
			</div>
		</div>
	)
}

function Families({ status, map }: { status: ArenaStatus | null; map: HoldingMap }) {
	const [adding, setAdding] = useState('')
	const families = familiesOf(status, map)
	const add = adding.trim().toUpperCase()
	const addOk = /^[A-Z]{2}$/.test(add) && !families.includes(add)
	return (
		<Card>
			<SectionTitle>Code families</SectionTitle>
			<p className="text-sm text-booth-dim">
				The two letters of a code: its campus, then its type. By default the type decides: B to HOLD BG, F to HOLD FG, A to the A-screen, the rest stay out of Arena. Say otherwise here, say to take another campus&rsquo;s foregrounds, or none of them.
			</p>
			{families.length === 0 && <p className="text-sm text-booth-faint">No codes in Arena yet.</p>}
			<div className="flex flex-col gap-2">
				{families.map((f) => {
					const v = map.families[f] ?? 'default'
					return (
						<div key={f} className="flex flex-wrap items-center gap-3">
							<span className="w-24 font-mono font-bold text-booth-ink">
								{f}
								<span className="ml-2 font-sans text-xs font-normal text-booth-faint">{TYPE_NAMES[f[1] ?? ''] ?? 'other'}</span>
							</span>
							<Segmented
								label={`Where ${f} codes go`}
								value={v}
								onChange={(next) => holdingMapActions.setMap(withFamily(map, f, next === 'default' ? null : next))}
								options={[
									{ value: 'default', label: 'Default' },
									{ value: 'B', label: 'HOLD BG' },
									{ value: 'F', label: 'HOLD FG' },
									{ value: 'A', label: 'A SCREEN' },
									{ value: 'none', label: 'None' },
								]}
							/>
						</div>
					)
				})}
			</div>
			<div className="flex items-center gap-2">
				<div className="w-24">
					<Input value={adding} onChange={(v) => setAdding(v.slice(0, 2))} placeholder="NF" mono />
				</div>
				<Button
					disabled={!addOk}
					onClick={() => {
						holdingMapActions.setMap(withFamily(map, add, 'none'))
						setAdding('')
					}}
				>
					Add a family
				</Button>
			</div>
		</Card>
	)
}

/** The preset in use, Save, the saved ones, Reset, and the file in and out. */
function Presets({ title, map, preset }: { title: string; map: HoldingMap; preset: string | null }) {
	const { presets } = useHoldingMapState()
	const [naming, setNaming] = useState<string | null>(null)
	const [confirm, setConfirm] = useState<string | null>(null)
	const [said, setSaid] = useState<{ words: string; bad: boolean } | null>(null)
	const name = (naming ?? '').trim().slice(0, PRESET_NAME_MAX)
	const full = presets.length >= PRESETS_MAX && !presets.some((p) => p.name === name)
	const twice = (key: string, run: () => void) => {
		if (confirm === key) {
			setConfirm(null)
			run()
		} else {
			setConfirm(key)
			setTimeout(() => setConfirm((c) => (c === key ? null : c)), 4_000)
		}
	}
	const importFile = async () => {
		const text = await window.life?.importHolding()
		if (text === null || text === undefined) return
		if (text === '') return setSaid({ words: 'That file is too big to be a preset.', bad: true })
		const r = presetFromFile(text)
		if (!r.ok) return setSaid({ words: r.detail, bad: true })
		holdingMapActions.take(r.preset)
		setSaid({ words: `“${r.preset.name}” is in use now, and kept with the presets.`, bad: false })
	}
	const exportOne = async (n: string, m: HoldingMap) => {
		const ok = await window.life?.exportHolding(n, presetFile({ name: n, map: m }))
		if (ok === true) setSaid({ words: `“${n}” saved to a file.`, bad: false })
	}
	return (
		<Card>
			<SectionTitle
				aside={
					<span className="flex flex-wrap gap-2">
						<Button size="sm" icon={Upload} onClick={() => void importFile()}>
							Import
						</Button>
						<Button
							size="sm"
							variant={confirm === 'reset' ? 'danger' : 'quiet'}
							icon={RotateCcw}
							disabled={isDefault(map) && preset === null}
							onClick={() => twice('reset', holdingMapActions.reset)}
						>
							{confirm === 'reset' ? 'Tap again to reset' : 'Reset to defaults'}
						</Button>
					</span>
				}
			>
				In use: {title}
			</SectionTitle>
			{naming === null ? (
				<div>
					<Button icon={Save} onClick={() => setNaming(preset ?? '')}>
						Save as a preset
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-2">
					<div className="min-w-56 flex-1">
						<Input value={naming} onChange={setNaming} placeholder="Central" />
					</div>
					<Button
						variant="primary"
						disabled={name === '' || full}
						onClick={() => {
							holdingMapActions.save(name)
							setNaming(null)
							setSaid({ words: `Saved as “${name}”.`, bad: false })
						}}
					>
						{presets.some((p) => p.name === name) ? 'Replace it' : 'Save'}
					</Button>
					<Button variant="ghost" onClick={() => setNaming(null)}>
						Cancel
					</Button>
					{full && <span className="text-sm text-state-unreachable">{PRESETS_MAX} presets at most: delete one first.</span>}
				</div>
			)}
			{presets.length > 0 && (
				<div className="flex flex-col gap-1.5">
					{presets.map((p) => (
						<div key={p.name} className="flex flex-wrap items-center gap-2 rounded-ctl bg-booth-raise px-3 py-2">
							<span className="min-w-0 flex-1 truncate font-bold text-booth-ink">
								{p.name}
								{p.name === preset && <span className="ml-2 text-xs font-normal text-booth-dim">in use</span>}
							</span>
							<Button size="sm" pressed={p.name === preset && sameMap(map, p.map)} onClick={() => holdingMapActions.use(p.name)}>
								Use
							</Button>
							<Button size="sm" variant="ghost" icon={Download} onClick={() => void exportOne(p.name, p.map)}>
								To a file
							</Button>
							<Button size="sm" variant={confirm === `del:${p.name}` ? 'danger' : 'ghost'} icon={Trash2} onClick={() => twice(`del:${p.name}`, () => holdingMapActions.remove(p.name))}>
								{confirm === `del:${p.name}` ? 'Tap again' : 'Delete'}
							</Button>
						</div>
					))}
				</div>
			)}
			{said !== null && <p className={`text-sm ${said.bad ? 'text-state-unreachable' : 'text-booth-dim'}`}>{said.words}</p>}
			{isDefault(map) && preset === null && <p className="text-xs text-booth-faint">Nothing changed: every column follows the default rules.</p>}
		</Card>
	)
}
