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
// A list and a detail since 2026-10-05: the list always all in view with its
// status, and the one tapped on the right. Only what no show knows is
// configured here (src/shared/settings.ts).

import { useEffect, useState } from 'react'
import { Lock, Monitor, MonitorPlay, PanelTop, Plus } from 'lucide-react'

import type { ConnectionId, ConnectionStatus, RowId } from '../../shared/connections.js'
import { embedIdOf } from '../../shared/embeds.js'
import { ndiIdOf, ndiMachine } from '../../shared/ndi.js'
import { captureIdOf } from '../../shared/capture.js'
import type { DeskState } from '../../shared/desk.js'
import type { SettingsView } from '../../shared/settings.js'

import { ArenaEditor, ConsoleEditor, ConsoleInfo, CueInfo, OnTimeEditor, ProPresenterEditor, VideoInfo } from './settings/connection-editors.js'
import { AdminSettings } from './settings/admin.js'
import { AboutFoot, ThisScreen } from './settings/computer.js'
import { TopBarSettings } from './settings/top-bar.js'
import type { BarItem } from '../barItems.js'
import { DetailHead, Empty, ListRow, OnOff, tonePill, toneText, type Save } from './settings/parts.js'
import { AddCapture, AddEmbed, AddNdi, CaptureEditor, EmbedEditor, NdiEditor } from './settings/views.js'
import { Dot, Sheet } from './ui.js'
import { sentence } from './vocabulary.js'

/** What the right side shows: a connection, or one of the pages after them. */
export type SettingsPage = RowId | 'add' | 'sources' | 'admin' | 'bar' | 'computer'

const PAGES: readonly string[] = ['add', 'sources', 'admin', 'bar', 'computer']

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
}) {
	const [view, setView] = useState<SettingsView | null>(null)
	const [picked, setPicked] = useState<SettingsPage | null>(start)
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
	const fallback = rows.find((r) => r.tone === 'down')?.id ?? rows[0]?.id ?? 'computer'
	const known = (p: SettingsPage) => PAGES.includes(p) || rows.some((r) => r.id === p)
	const selected: SettingsPage = picked === null || !known(picked) ? fallback : picked
	const row = rows.find((r) => r.id === selected) ?? null

	return (
		<Sheet title="Settings" description={description} onClose={onClose}>
			<div className="grid min-h-0 flex-1 grid-cols-[minmax(22rem,28rem)_1fr]">
				<nav className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-booth-edge bg-booth-panel p-3">
					{rows.every((r) => r.tone === 'off') && (
						// A fresh install: every row off, which reads as a broken screen
						// unless something says it is only empty.
						<p className="mb-2 rounded-lg bg-booth-raise px-4 py-3 text-sm">
							Nothing is set up yet. Tap a connection to give it an address; start with the Console.
						</p>
					)}
					{rows.map((r) => (
						<ListRow
							key={r.id}
							selected={selected === r.id}
							onClick={() => setPicked(r.id)}
							lead={<Dot tone={r.tone} />}
							title={r.name}
							sub={<span className={toneText[r.tone]}>{sentence(r.status)}</span>}
							aside={addressOf(view, r.id)}
							struck={isOff(view, r.id)}
						/>
					))}
					<span className="mx-3 my-2 h-px bg-booth-edge" />
					<ListRow
						selected={selected === 'add'}
						onClick={() => setPicked('add')}
						lead={<Plus size={18} className="text-booth-dim" aria-hidden />}
						title="Add a web page"
						sub={<span className="text-booth-dim">A Google Sheet or any page, as a view</span>}
					/>
					<ListRow
						selected={selected === 'sources'}
						onClick={() => setPicked('sources')}
						lead={<MonitorPlay size={18} className="text-booth-dim" aria-hidden />}
						title="Video sources"
						sub={<span className="text-booth-dim">NDI sources and capture inputs, for the Video view</span>}
					/>
					<span className="mx-3 my-2 h-px bg-booth-edge" />
					<ListRow
						selected={selected === 'admin'}
						onClick={() => setPicked('admin')}
						lead={<Lock size={18} className="text-booth-dim" aria-hidden />}
						title="Admin"
						sub={
							<span className='text-booth-dim'>
								{view.hasAdminPasscode ? 'Passcode set' : 'No passcode'} · back to volunteer after {view.adminTimeoutMin} min
							</span>
						}
					/>
					<ListRow
						selected={selected === 'bar'}
						onClick={() => setPicked('bar')}
						lead={<PanelTop size={18} className="text-booth-dim" aria-hidden />}
						title="Top bar"
						sub={<span className="text-booth-dim">{barHidden.size === 0 ? 'Everything shown' : `${barHidden.size} hidden`}</span>}
					/>
					<ListRow
						selected={selected === 'computer'}
						onClick={() => setPicked('computer')}
						lead={<Monitor size={18} className="text-booth-dim" aria-hidden />}
						title="This computer"
						sub={<span className="text-booth-dim">Full screen or window</span>}
					/>
					<AboutFoot />
				</nav>

				<div className="min-h-0 overflow-y-auto">
					<div key={selected} className="flex max-w-4xl animate-rise flex-col gap-6 px-10 py-8 select-text">
						{selected === 'add' ? (
							<AddEmbed all={view.embeds} save={save} />
						) : selected === 'sources' ? (
							<>
								<DetailHead title="Video sources" />
								<p className="max-w-prose text-sm text-booth-dim">
									What a Video tab can show besides this computer’s own Spout or Syphon senders, which need no adding. Each added
									source is offered by every Video tab’s feed button and gets a row in Connections.
								</p>
								<AddNdi all={view.ndiSources} save={save} />
								<span className="h-px bg-booth-edge" />
								<AddCapture all={view.captureInputs} save={save} />
							</>
						) : selected === 'admin' ? (
							<AdminSettings view={view} save={save} />
						) : selected === 'bar' ? (
							<TopBarSettings hidden={barHidden} onSet={onBarHidden} />
						) : selected === 'computer' ? (
							<>
								<DetailHead title="This computer" />
								<ThisScreen windowed={view.windowed} save={save} />
							</>
						) : row === null ? null : (
							<>
								<DetailHead
									title={row.name}
									status={
										<span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm ${tonePill[row.tone]}`}>
											<Dot tone={row.tone} size="sm" />
											{sentence(row.status)}
											{row.detail !== null && <span className="text-booth-dim">· {row.detail}</span>}
										</span>
									}
									address={addressOf(view, row.id)}
								/>
								<OnOff on={!isOff(view, row.id)} onSet={(on) => void setOn(row.id, on)} />
								{row.id === 'video' && (
									<p className="max-w-prose text-sm text-booth-dim">
										A picture another program on this computer sends over Spout (Windows) or Syphon (Mac), such as Arena’s
										multiview. Separate from Arena: it works with Arena’s web server off.
									</p>
								)}
								{row.id === 'video' && <VideoInfo />}
								{row.id === 'console' && <ConsoleInfo paneSummary={paneSummary} desk={desk} now={now} />}
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
							</>
						)}
					</div>
				</div>
			</div>
		</Sheet>
	)
}
