// Settings: everything Admin may change on this computer, one list down the
// left and the page tapped on the right. Opens in the windows' place, because
// a native view cannot be drawn over, and closes back to them.
//
// Split from Connections on 2026-10-08 (the owner's choice): Connections is
// now a list everyone reads, what is up and what is down, and this is where
// each connection's fields live, with the views a booth adds itself (web
// pages, NDI sources, capture inputs) and this computer's own choices.
//
// Video sources (2026-10-08, the owner's choice of one Video view for every
// feed): NDI sources and capture inputs are added on one page, and a Video
// tab's ▾ picks among them and this computer's Spout or Syphon senders. Admin
// only: its button is not drawn in volunteer mode, main refuses a save outside
// Admin, and the App closes it when the mode drops.
//
// A list and a detail since 2026-10-05; since 2026-10-15 (the owner) the list
// in three groups, Programs, Views you added and This booth, and each page
// rows of a label and its field, with one Save bar and its help behind a ?
// (./settings/parts.tsx). Only what no show knows is configured here
// (src/shared/settings.ts).

import { useEffect, useState } from 'react'
import { Cast, FolderOpen, Globe, Grid3x3, Lock, Monitor, Plus, Webcam } from 'lucide-react'

import type { ConnectionId, ConnectionStatus, RowId } from '../../shared/connections.js'
import { embedIdOf } from '../../shared/embeds.js'
import { ndiIdOf, ndiMachine } from '../../shared/ndi.js'
import { captureIdOf } from '../../shared/capture.js'
import type { DeskState } from '../../shared/desk.js'
import type { SettingsView } from '../../shared/settings.js'

import { ArenaEditor, ConsoleEditor, ConsoleInfo, CueInfo, MediaEditor, OnTimeEditor, ProPresenterEditor, VideoInfo } from './settings/connection-editors.js'
import { AdminSettings } from './settings/admin.js'
import { ComputerSettings } from './settings/computer.js'
import { HoldingSettings } from './settings/holding.js'
import type { ArenaStatus } from '../../shared/arena.js'
import { isDefault } from '../../shared/holding-map.js'
import { useHoldingMapState } from '../holdingMapStore.js'
import type { UpdateState } from '../../shared/updates.js'
import type { BarItem } from '../barItems.js'
import { Empty, NavGroup, NavRow, Page, type Save } from './settings/parts.js'
import { AddView, CaptureEditor, EmbedEditor, NdiEditor } from './settings/views.js'
import { Dot, Sheet } from './ui.js'
import { sentence } from './vocabulary.js'

/** What the right side shows: a connection, or one of the pages after them. */
export type SettingsPage = RowId | 'add' | 'media' | 'admin' | 'computer' | 'holding'

const PAGES: readonly string[] = ['add', 'media', 'admin', 'computer', 'holding']

/** Every connection's address as the list shows it, from the stored settings. */
export function addressOf(view: SettingsView, id: RowId): string | null {
	const n = ndiIdOf(id)
	const ndi = n === null ? null : (view.ndiSources.find((x) => x.id === n) ?? null)
	// The machine it is on: NDI names are `MACHINE (Source)`.
	if (ndi !== null) return ndiMachine(ndi.source)
	const e = embedIdOf(id)
	const embed = e === null ? null : (view.embeds.find((x) => x.id === e) ?? null)
	if (embed !== null) return new URL(embed.url).host
	const address: Record<ConnectionId, string | null> = {
		console: view.consoleHost,
		ontime: view.onTimeHost === null ? null : `${view.onTimeHost}:${view.onTimePort}`,
		propresenter: view.proPresenterHost === null ? null : `${view.proPresenterHost}:${view.proPresenterPort}`,
		arena: view.arenaHost === null ? null : `${view.arenaHost}:${view.arenaPort}`,
		cue: null,
		video: null,
	}
	return address[id as ConnectionId] ?? null
}

/** Whether a row is turned off in the stored settings. */
export function isOff(view: SettingsView, id: RowId): boolean {
	const c = captureIdOf(id)
	const capture = c === null ? undefined : view.captureInputs.find((x) => x.id === c)
	if (capture !== undefined) return !capture.on
	const n = ndiIdOf(id)
	const ndi = n === null ? undefined : view.ndiSources.find((x) => x.id === n)
	if (ndi !== undefined) return !ndi.on
	const e = embedIdOf(id)
	const embed = e === null ? undefined : view.embeds.find((x) => x.id === e)
	if (embed !== undefined) return !embed.on
	return view.off.includes(id as ConnectionId)
}

export function SettingsPanel({
	rows,
	start,
	paneSummary,
	desk,
	now,
	onChanged,
	onClose,
	barHidden,
	onBarHidden,
	testing,
	onTesting,
	updates,
	arena,
}: {
	rows: readonly ConnectionStatus[]
	/** The page to open on: a connection tapped in Connections, or null for
	 *  the first that is down. */
	start: SettingsPage | null
	/** Where the MA pane is pointed, in a few words. */
	paneSummary: string
	desk: DeskState | null
	now: number
	/** Settings were saved: the screen re-reads what is turned off. */
	onChanged: () => void
	onClose: () => void
	/** The top bar's hidden items, on this computer (../barItems.ts). */
	barHidden: ReadonlySet<BarItem>
	onBarHidden: (item: BarItem, hidden: boolean) => void
	/** Testing: Mark on the bar, on this computer (../barItems.ts). */
	testing: boolean
	onTesting: (on: boolean) => void
	/** What the updater last knew, for This computer. */
	updates: UpdateState | null
	/** Arena's composition, for Holding's columns, when it is answering. */
	arena: ArenaStatus | null
}) {
	const [view, setView] = useState<SettingsView | null>(null)
	const [picked, setPicked] = useState<SettingsPage | null>(start)
	const holding = useHoldingMapState()
	const load = () => window.life?.settings().then(setView)
	useEffect(() => void load(), [])

	const description = 'What Pāua talks to and how this computer is set up. Admin only.'
	if (window.life === undefined) {
		return (
			<Sheet title="Settings" description={description} onClose={onClose}>
				<Empty>Settings exist only inside the kiosk.</Empty>
			</Sheet>
		)
	}
	if (view === null) {
		return (
			<Sheet title="Settings" description={description} onClose={onClose}>
				<Empty>Reading settings…</Empty>
			</Sheet>
		)
	}

	/** Null on success. The row keeps its draft on failure, so nothing typed is lost. */
	const save: Save = async (patch) => {
		const result = await window.life?.saveSettings(patch)
		if (result === undefined) return { form: 'The kiosk did not answer.' }
		if (!result.ok) return result.errors
		await load()
		onChanged()
		return null
	}
	const embedOf = (id: RowId) => {
		const e = embedIdOf(id)
		return e === null ? null : (view.embeds.find((x) => x.id === e) ?? null)
	}
	const ndiOf = (id: RowId) => {
		const n = ndiIdOf(id)
		return n === null ? null : (view.ndiSources.find((x) => x.id === n) ?? null)
	}
	const captureOf = (id: RowId) => {
		const c = captureIdOf(id)
		return c === null ? null : (view.captureInputs.find((x) => x.id === c) ?? null)
	}
	const setOn = (id: RowId, on: boolean) => {
		const capture = captureOf(id)
		if (capture !== null) return save({ captureInputs: view.captureInputs.map((c) => (c.id === capture.id ? { ...c, on } : c)) })
		const ndi = ndiOf(id)
		if (ndi !== null) return save({ ndiSources: view.ndiSources.map((n) => (n.id === ndi.id ? { ...n, on } : n)) })
		const embed = embedOf(id)
		if (embed !== null) return save({ embeds: view.embeds.map((e) => (e.id === embed.id ? { ...e, on } : e)) })
		return save({ off: on ? view.off.filter((x) => x !== id) : [...view.off, id as ConnectionId] })
	}

	// Opens on the first connection that is down, since that is usually why
	// someone came; otherwise on the first.
	const holdingSub = holding.preset !== null ? `Preset: ${holding.preset}` : isDefault(holding.map) ? 'The default rules' : 'Changed from the defaults'
	const fallback = rows.find((r) => r.tone === 'down')?.id ?? rows[0]?.id ?? 'computer'
	const known = (p: SettingsPage) => PAGES.includes(p) || rows.some((r) => r.id === p)
	const selected: SettingsPage = picked === null || !known(picked) ? fallback : picked
	const row = rows.find((r) => r.id === selected) ?? null

	// The list's groups: the programs Pāua talks to, then what the booth added.
	const added = (id: RowId) => embedIdOf(id) !== null || ndiIdOf(id) !== null || captureIdOf(id) !== null
	const programs = rows.filter((r) => !added(r.id))
	const views = rows.filter((r) => added(r.id))
	const addedIcon = (id: RowId) => (embedIdOf(id) !== null ? Globe : ndiIdOf(id) !== null ? Cast : Webcam)
	const go = (p: SettingsPage) => setPicked(p)

	return (
		<Sheet title="Settings" description={description} onClose={onClose}>
			<div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,22rem)_1fr]">
				<nav className="flex min-h-0 flex-col gap-2 overflow-y-auto border-r border-booth-edge bg-booth-panel p-3">
					{rows.every((r) => r.tone === 'off') && (
						// A fresh install: every row off, which reads as a broken screen
						// unless something says it is only empty.
						<p className="rounded-ctl bg-booth-raise px-4 py-3 text-sm">
							Nothing is set up yet. Start with the Console, or set this computer up from a file (Updates and setup file).
						</p>
					)}
					<NavGroup title="Programs">
						{programs.map((r) => (
							<NavRow
								key={r.id}
								selected={selected === r.id}
								onClick={() => go(r.id)}
								lead={<Dot tone={r.tone} size="sm" />}
								title={r.name}
								aside={isOff(view, r.id) ? 'off' : addressOf(view, r.id)}
								dim={isOff(view, r.id)}
							/>
						))}
					</NavGroup>
					<NavGroup title="Views you added">
						{views.map((r) => {
							const IconC = addedIcon(r.id)
							return (
								<NavRow
									key={r.id}
									selected={selected === r.id}
									onClick={() => go(r.id)}
									lead={<IconC size={16} className={r.tone === 'down' ? 'text-state-unreachable' : 'text-booth-dim'} aria-hidden />}
									title={r.name}
									aside={isOff(view, r.id) ? 'off' : addressOf(view, r.id)}
									dim={isOff(view, r.id)}
								/>
							)
						})}
						<NavRow selected={selected === 'add'} onClick={() => go('add')} lead={<Plus size={16} className="text-booth-dim" aria-hidden />} title="Add a view" />
					</NavGroup>
					<NavGroup title="This booth">
						<NavRow selected={selected === 'media'} onClick={() => go('media')} lead={<FolderOpen size={16} className="text-booth-dim" aria-hidden />} title="Media and folders" />
						<NavRow selected={selected === 'holding'} onClick={() => go('holding')} lead={<Grid3x3 size={16} className="text-booth-dim" aria-hidden />} title="Holding map" aside={holdingSub} />
						<NavRow
							selected={selected === 'admin'}
							onClick={() => go('admin')}
							lead={<Lock size={16} className="text-booth-dim" aria-hidden />}
							title="Screen and Admin"
							aside={view.hasAdminPasscode ? 'passcode set' : 'no passcode'}
						/>
						<NavRow
							selected={selected === 'computer'}
							onClick={() => go('computer')}
							lead={<Monitor size={16} className="text-booth-dim" aria-hidden />}
							title="Updates and setup file"
							aside={updates?.state === 'available' ? <span className="font-bold text-booth-ink">{updates.version} is out</span> : null}
						/>
					</NavGroup>
				</nav>

				<div className="min-h-0 overflow-y-auto">
					<div key={selected} className="flex min-h-full max-w-4xl animate-rise flex-col px-10 py-8 select-text">
						{selected === 'add' ? (
							<AddView embeds={view.embeds} ndiSources={view.ndiSources} captureInputs={view.captureInputs} save={save} />
						) : selected === 'media' ? (
							<Page title="Media and folders" help>
								<MediaEditor view={view} save={save} />
							</Page>
						) : selected === 'admin' ? (
							<AdminSettings view={view} save={save} barHidden={barHidden} onBarHidden={onBarHidden} testing={testing} onTesting={onTesting} />
						) : selected === 'holding' ? (
							<HoldingSettings status={arena} />
						) : selected === 'computer' ? (
							<ComputerSettings updates={updates} />
						) : row === null ? null : (
							<Page
								title={row.name}
								status={{ tone: row.tone, words: sentence(row.status), detail: row.detail }}
								address={addressOf(view, row.id)}
								on={{ value: !isOff(view, row.id), set: (on) => void setOn(row.id, on) }}
								help
							>
								{row.id === 'console' && <ConsoleInfo paneSummary={paneSummary} desk={desk} now={now} />}
								{row.id === 'video' && <VideoInfo />}
								{captureOf(row.id) !== null ? (
									<CaptureEditor key={row.id} input={captureOf(row.id)!} all={view.captureInputs} save={save} onRemoved={() => setPicked(null)} />
								) : ndiOf(row.id) !== null ? (
									<NdiEditor key={row.id} source={ndiOf(row.id)!} all={view.ndiSources} save={save} onRemoved={() => setPicked(null)} />
								) : embedOf(row.id) !== null ? (
									<EmbedEditor key={row.id} embed={embedOf(row.id)!} all={view.embeds} save={save} onRemoved={() => setPicked(null)} />
								) : row.id === 'console' ? (
									<ConsoleEditor view={view} save={save} />
								) : row.id === 'ontime' ? (
									<OnTimeEditor view={view} save={save} />
								) : row.id === 'propresenter' ? (
									<ProPresenterEditor view={view} save={save} />
								) : row.id === 'arena' ? (
									<ArenaEditor view={view} save={save} />
								) : null}
								{row.id === 'cue' && <CueInfo />}
							</Page>
						)}
					</div>
				</div>
			</div>
		</Sheet>
	)
}
