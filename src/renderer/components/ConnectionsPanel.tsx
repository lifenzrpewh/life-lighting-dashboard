// Connections: every program the dashboard talks to, one row each, status
// beside the settings that fix it. Opens in the windows' place, because a
// native view cannot be drawn over, and closes back to them.
//
// A list and a detail since 2026-10-05: the connections down the left, always
// all in view with their status, and the one tapped on the right. It was one
// long accordion, where opening the Console pushed every other row off the
// screen.
//
// Everyone sees it; only operator mode can change it (the owner's call,
// 2026-10-02). A volunteer can see what is down and tell someone, and cannot
// move an address by accident. The statuses come from src/shared/connections.ts,
// the same rows the status bar's dot is the worst of.
//
// Only what no show knows is configured here (src/shared/settings.ts). Passwords
// are write-only: a row is told whether one is set, never what it is, so a blank
// password box means "leave it as it is", and Remove is its own button.

import { useEffect, useState, type ReactNode } from 'react'

import type { About } from '../../shared/about.js'
import type { ConnectionId, ConnectionStatus, RowId, Tone } from '../../shared/connections.js'
import { EMBEDS_MAX, embedIdOf, embedNameError, embedUrlOf, newEmbedId, type Embed } from '../../shared/embeds.js'
import { NDI_SOURCES_MAX, ndiIdOf, ndiMachine, ndiNameError, ndiShortName, type NdiSource, type NdiState } from '../../shared/ndi.js'
import type { DeskState } from '../../shared/desk.js'
import { replyPortOf, type SettingsField, type SettingsPatch, type SettingsView } from '../../shared/settings.js'
import { Cast, FolderOpen, Monitor, Plus, Save, Trash2, Webcam } from 'lucide-react'
import { CAPTURE_INPUTS_MAX, captureIdOf, captureNameError, captureShortName, type CaptureInput } from '../../shared/capture.js'
import { useCameras } from '../capture.js'

import { CueManagerSettings } from './CueManagerSettings.js'
import { Field, Input, Select, User, portOf, useProPresenterNames } from './form.js'
import { Button, Card, Dot, SectionTitle, Segmented, Sheet } from './ui.js'
import { formatAge, sentence } from './vocabulary.js'

export { Dot }

type Errors = Partial<Record<SettingsField, string>>
type Save = (patch: SettingsPatch) => Promise<Errors | null>

/** What the right side shows: a connection, or one of the two extras. */
type Selected = RowId | 'add' | 'add-ndi' | 'add-capture' | 'computer'

export function ConnectionsPanel({
	rows,
	operator,
	paneSummary,
	desk,
	now,
	onChanged,
	onClose,
}: {
	rows: readonly ConnectionStatus[]
	operator: boolean
	/** Where the MA pane is pointed, in a few words. */
	paneSummary: string
	desk: DeskState | null
	now: number
	/** Settings were saved: the screen re-reads what is turned off. */
	onChanged: () => void
	onClose: () => void
}) {
	const [view, setView] = useState<SettingsView | null>(null)
	// Opens on the first connection that is down, since that is usually why
	// someone came; otherwise on the first.
	const [picked, setPicked] = useState<Selected | null>(null)
	const load = () => window.life?.settings().then(setView)
	useEffect(() => void load(), [])

	const description = operator ? 'What Pāua talks to. Tap one to see it or change it.' : 'What Pāua talks to. Tap one to see it.'
	if (window.life === undefined) {
		return (
			<Sheet title="Connections" description={description} onClose={onClose}>
				<Empty>Connections exist only inside the kiosk.</Empty>
			</Sheet>
		)
	}
	if (view === null) {
		return (
			<Sheet title="Connections" description={description} onClose={onClose}>
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
	const isOff = (id: RowId) => {
		const embed = embedOf(id)
		const ndi = ndiOf(id)
		const capture = captureOf(id)
		if (capture !== null) return !capture.on
		return embed !== null ? !embed.on : ndi !== null ? !ndi.on : view.off.includes(id as ConnectionId)
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
	const addressOf = (id: RowId): string | null => {
		const ndi = ndiOf(id)
		// The machine it is on: NDI names are `MACHINE (Source)`.
		if (ndi !== null) return ndiMachine(ndi.source)
		const embed = embedOf(id)
		if (embed !== null) return new URL(embed.url).host
		return address[id as ConnectionId]
	}

	const address: Record<ConnectionId, string | null> = {
		console: view.consoleHost,
		ontime: view.onTimeHost === null ? null : `${view.onTimeHost}:${view.onTimePort}`,
		propresenter:
			view.proPresenterHost === null ? null : `${view.proPresenterHost}:${view.proPresenterPort ?? '?'}`,
		arena: view.arenaHost === null ? null : `${view.arenaHost}:${view.arenaPort}`,
		cue: null,
		video: null,
	}

	const fallback = rows.find((r) => r.tone === 'down')?.id ?? rows[0]?.id ?? 'computer'
	const selected: Selected =
		picked === null || (picked !== 'add' && picked !== 'add-ndi' && picked !== 'add-capture' && picked !== 'computer' && !rows.some((r) => r.id === picked)) ? fallback : picked
	const row = rows.find((r) => r.id === selected) ?? null
	const notOperator = 'Hold Volunteer (top right) for 3 seconds for operator mode to change these.'

	return (
		<Sheet title="Connections" description={description} onClose={onClose}>
			<div className="grid min-h-0 flex-1 grid-cols-[minmax(22rem,28rem)_1fr]">
				<nav className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-booth-edge bg-booth-panel p-3">
					{rows.every((r) => r.tone === 'off') && (
						// A fresh install: every row off, which reads as a broken screen
						// unless something says it is only empty.
						<p className="mb-2 rounded-lg bg-booth-raise px-4 py-3 text-sm">
							Nothing is set up yet.{' '}
							{operator ? 'Tap a connection to give it an address; start with the Console.' : 'Operator mode sets them up.'}
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
							aside={addressOf(r.id)}
							struck={isOff(r.id)}
						/>
					))}
					<span className="mx-3 my-2 h-px bg-booth-edge" />
					{operator && (
						<ListRow
							selected={selected === 'add'}
							onClick={() => setPicked('add')}
							lead={<Plus size={18} className="text-booth-dim" aria-hidden />}
							title="Add a web page"
							sub={<span className="text-booth-dim">A Google Sheet or any page, as a view</span>}
						/>
					)}
					{operator && (
						<ListRow
							selected={selected === 'add-ndi'}
							onClick={() => setPicked('add-ndi')}
							lead={<Cast size={18} className="text-booth-dim" aria-hidden />}
							title="Add an NDI source"
							sub={<span className="text-booth-dim">A camera or another program's output, as a view</span>}
						/>
					)}
					{operator && (
						<ListRow
							selected={selected === 'add-capture'}
							onClick={() => setPicked('add-capture')}
							lead={<Webcam size={18} className="text-booth-dim" aria-hidden />}
							title="Add a capture input"
							sub={<span className="text-booth-dim">A Blackmagic card, ATEM, OBS Virtual Camera or webcam</span>}
						/>
					)}
					<ListRow
						selected={selected === 'computer'}
						onClick={() => setPicked('computer')}
						lead={<Monitor size={18} className="text-booth-dim" aria-hidden />}
						title="This computer"
						sub={<span className="text-booth-dim">Full screen or window, version, log</span>}
					/>
				</nav>

				<div className="min-h-0 overflow-y-auto">
					<div key={selected} className="flex max-w-4xl animate-rise flex-col gap-6 px-10 py-8 select-text">
						{selected === 'add' ? (
							<AddEmbed all={view.embeds} save={save} />
						) : selected === 'add-ndi' ? (
							<AddNdi all={view.ndiSources} save={save} />
						) : selected === 'add-capture' ? (
							<AddCapture all={view.captureInputs} save={save} />
						) : selected === 'computer' ? (
							<>
								<DetailHead title="This computer" />
								<ThisScreen windowed={view.windowed} operator={operator} save={save} />
								<AboutLine operator={operator} />
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
									address={addressOf(row.id)}
								/>
								{operator && <OnOff on={!isOff(row.id)} onSet={(on) => void setOn(row.id, on)} />}
								{row.id === 'video' && (
									<p className="max-w-prose text-sm text-booth-dim">
										A picture another program on this computer sends over Spout (Windows) or Syphon (Mac), such as Arena’s
										multiview. Separate from Arena: it works with Arena’s web server off.
									</p>
								)}
								{row.id === 'console' && <ConsoleInfo paneSummary={paneSummary} desk={desk} now={now} />}
								{captureOf(row.id) !== null ? (
									operator ? (
										<CaptureEditor key={row.id} input={captureOf(row.id)!} all={view.captureInputs} save={save} onRemoved={() => setPicked(null)} />
									) : (
										<p className="text-sm text-booth-dim">
											<span className="font-mono text-booth-ink">{captureOf(row.id)!.device}</span>. {notOperator}
										</p>
									)
								) : ndiOf(row.id) !== null ? (
									operator ? (
										<NdiEditor key={row.id} source={ndiOf(row.id)!} all={view.ndiSources} save={save} onRemoved={() => setPicked(null)} />
									) : (
										<p className="text-sm text-booth-dim">
											<span className="font-mono text-booth-ink">{ndiOf(row.id)!.source}</span>. {notOperator}
										</p>
									)
								) : embedOf(row.id) !== null ? (
									operator ? (
										<EmbedEditor
											key={row.id}
											embed={embedOf(row.id)!}
											all={view.embeds}
											save={save}
											onRemoved={() => setPicked(null)}
										/>
									) : (
										<p className="text-sm text-booth-dim">
											<span className="font-mono text-booth-ink">{embedOf(row.id)!.url}</span>. {notOperator}
										</p>
									)
								) : !operator ? (
									row.id !== 'cue' && <p className="text-sm text-booth-dim">{notOperator}</p>
								) : row.id === 'console' ? (
									<ConsoleEditor view={view} save={save} />
								) : row.id === 'ontime' ? (
									<OnTimeEditor view={view} save={save} />
								) : row.id === 'propresenter' ? (
									<ProPresenterEditor view={view} save={save} />
								) : row.id === 'arena' ? (
									<ArenaEditor view={view} save={save} />
								) : null}
								{row.id === 'cue' && <CueInfo operator={operator} />}
							</>
						)}
					</div>
				</div>
			</div>
		</Sheet>
	)
}

/** One line in the list: what it is, its state in a word, its address. */
function ListRow({
	selected,
	onClick,
	lead,
	title,
	sub,
	aside = null,
	struck = false,
}: {
	selected: boolean
	onClick: () => void
	lead: ReactNode
	title: string
	sub: ReactNode
	aside?: string | null
	struck?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={selected}
			className={`relative grid min-h-16 w-full grid-cols-[1.25rem_1fr_auto] items-center gap-3.5 rounded-xl px-4 py-2 text-left transition-colors ${
				selected ? 'bg-booth-raise' : 'hover:bg-booth-strip'
			}`}
		>
			{selected && <span aria-hidden className="nacre-line absolute inset-y-3 left-0 w-[3px] rounded-r-full" />}
			<span className="flex justify-center">{lead}</span>
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate text-base font-medium">{title}</span>
				<span className="mt-0.5 truncate text-sm">{sub}</span>
			</span>
			{aside !== null && (
				<span className={`max-w-40 truncate font-mono text-xs text-booth-dim ${struck ? 'line-through opacity-60' : ''}`}>{aside}</span>
			)}
		</button>
	)
}

function DetailHead({ title, status, address = null }: { title: string; status?: ReactNode; address?: string | null }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h3 className="text-2xl font-medium">{title}</h3>
			{status}
			{address !== null && <span className="font-mono text-sm text-booth-dim">{address}</span>}
		</div>
	)
}

function Empty({ children }: { children: ReactNode }) {
	return <div className="flex flex-1 items-center justify-center text-booth-dim">{children}</div>
}

/** An embed's name and address, and Remove. Removing forgets its sign-in, so
 *  it takes a second tap. */
function EmbedEditor({ embed, all, save, onRemoved }: { embed: Embed; all: readonly Embed[]; save: Save; onRemoved: () => void }) {
	const [name, setName] = useState(embed.name)
	const [url, setUrl] = useState(embed.url)
	const [local, setLocal] = useState<Errors>({})
	const [removing, setRemoving] = useState(false)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])
	return (
		<>
			<Editor
				save={async (patch) => {
					const errors = embedErrors(name, url)
					setLocal(errors)
					if (Object.keys(errors).length > 0) return {}
					return save(patch)
				}}
				patch={() => ({
					embeds: all.map((e) => (e.id === embed.id ? { ...e, name: name.trim(), url: embedUrlOf(url) ?? url } : e)),
				})}
				note="Its page loads the new address."
			>
				{(err) => (
					<EmbedFields name={name} url={url} onName={setName} onUrl={setUrl} errors={{ ...local, form: err('embeds') }} />
				)}
			</Editor>
			<div className="flex items-center gap-4 border-t border-booth-edge pt-5">
				<Button
					variant={removing ? 'danger' : 'quiet'}
					icon={Trash2}
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ embeds: all.filter((e) => e.id !== embed.id) }).then((e) => e === null && onRemoved())
					}}
				>
					{removing ? 'Tap again to remove' : 'Remove this page'}
				</Button>
				<span className="text-sm text-booth-dim">Removing it also signs it out and forgets what it kept on this computer.</span>
			</div>
		</>
	)
}

type EmbedErrors = { name?: string; url?: string; form?: string | undefined }

function embedErrors(name: string, url: string): EmbedErrors {
	const out: EmbedErrors = {}
	const n = embedNameError(name.trim())
	if (n !== null) out.name = n
	if (embedUrlOf(url) === null) out.url = 'A web address, such as docs.google.com/spreadsheets/…'
	return out
}

function EmbedFields(p: { name: string; url: string; onName: (v: string) => void; onUrl: (v: string) => void; errors: EmbedErrors }) {
	return (
		<>
			<div className="grid grid-cols-[1fr_2fr] gap-4">
				<Field label="Name" error={p.errors.name} hint="What its tab says.">
					<Input value={p.name} onChange={p.onName} placeholder="Run sheet" />
				</Field>
				<Field label="Web address" error={p.errors.url} hint="Copied from the browser's address bar.">
					<Input value={p.url} onChange={p.onUrl} placeholder="https://docs.google.com/spreadsheets/…" />
				</Field>
			</div>
			{p.errors.form !== undefined && <p className="text-sm text-state-unreachable">{p.errors.form}</p>}
		</>
	)
}

/** Add a web page as a view of its own (../../shared/embeds.ts). */
function AddEmbed({ all, save }: { all: readonly Embed[]; save: Save }) {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [errors, setErrors] = useState<EmbedErrors>({})
	const [added, setAdded] = useState<string | null>(null)
	const full = all.length >= EMBEDS_MAX
	const add = async () => {
		const e = embedErrors(name, url)
		setErrors(e)
		setAdded(null)
		if (Object.keys(e).length > 0) return
		const embed: Embed = { id: newEmbedId(Date.now(), Math.random()), name: name.trim(), url: embedUrlOf(url)!, on: true }
		const result = await save({ embeds: [...all, embed] })
		if (result !== null) return setErrors({ form: result.embeds ?? result.form ?? 'Not added.' })
		setAdded(embed.name)
		setName('')
		setUrl('')
	}
	return (
		<section className="flex flex-col gap-5">
			<DetailHead title="Add a web page" />
			<p className="max-w-prose text-sm text-booth-dim">
				Any page, such as a Google Sheet, becomes a view of its own, with its own sign-in. Links that open a new window
				open in this computer's browser.
			</p>
			{full ? (
				<p className="text-sm text-booth-dim">That is {EMBEDS_MAX}, the most there can be. Remove one to add another.</p>
			) : (
				<>
					<EmbedFields name={name} url={url} onName={setName} onUrl={setUrl} errors={errors} />
					<div className="flex items-center gap-4">
						<Button variant="primary" icon={Plus} onClick={() => void add()}>
							Add
						</Button>
						{added !== null && (
							<span className="text-sm text-state-live">Added {added}. Layouts › Edit this layout, then a window's +, puts it on screen.</span>
						)}
					</div>
				</>
			)}
		</section>
	)
}

/** What NDI finds on the network, asked while this is open. Asking starts NDI
 *  (src/main/ndi.ts), which is why nothing asks before a source is added. */
function useNdi(): NdiState | null {
	const [ndi, setNdi] = useState<NdiState | null>(null)
	useEffect(() => {
		let alive = true
		const poll = () => void window.life?.ndi().then((v) => alive && setNdi(v))
		poll()
		const id = setInterval(poll, 1_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])
	return ndi
}

/** NDI's trademark notice, which its licence asks for wherever NDI is used. */
function NdiNotice() {
	return <p className="text-xs text-booth-dim">NDI® is a registered trademark of Vizrt NDI AB. ndi.video</p>
}

/** Add an NDI source as a view of its own (../../shared/ndi.ts): picked from
 *  what NDI finds on the network, never typed. */
function AddNdi({ all, save }: { all: readonly NdiSource[]; save: Save }) {
	const ndi = useNdi()
	const [added, setAdded] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const full = all.length >= NDI_SOURCES_MAX
	const add = async (source: string) => {
		setAdded(null)
		setError(null)
		const name = ndiShortName(source)
		const entry: NdiSource = { id: newEmbedId(Date.now(), Math.random()), name, source, on: true }
		const result = await save({ ndiSources: [...all, entry] })
		if (result !== null) return setError(result.ndiSources ?? result.form ?? 'Not added.')
		setAdded(name)
	}
	const body = (() => {
		if (ndi === null || ndi.runtime === null) return <p className="text-sm text-booth-dim">Looking for NDI sources…</p>
		if (!ndi.runtime.ok) return <p className="text-sm text-state-unreachable">{ndi.runtime.detail}</p>
		if (ndi.found.length === 0) {
			return (
				<p className="text-sm text-booth-dim">
					No NDI sources on the network yet. Turn on NDI output in the program that sends it (in Arena, Output › Advanced
					Output, a screen sent to NDI); it appears here within a few seconds.
				</p>
			)
		}
		return (
			<ul className="flex flex-col gap-1.5">
				{ndi.found.map((source) => {
					const have = all.some((s) => s.source === source)
					return (
						<li key={source} className="flex min-h-14 items-center gap-4 rounded-xl bg-booth-raise px-4 py-2">
							<Cast size={18} className="shrink-0 text-booth-dim" aria-hidden />
							<span className="flex min-w-0 flex-1 flex-col leading-tight">
								<span className="truncate text-base">{ndiShortName(source)}</span>
								<span className="truncate font-mono text-xs text-booth-dim">{source}</span>
							</span>
							{have ? (
								<span className="text-sm text-booth-dim">Added</span>
							) : (
								<Button icon={Plus} disabled={full} onClick={() => void add(source)}>
									Add
								</Button>
							)}
						</li>
					)
				})}
			</ul>
		)
	})()
	return (
		<section className="flex flex-col gap-5">
			<DetailHead title="Add an NDI source" />
			<p className="max-w-prose text-sm text-booth-dim">
				A camera, ProPresenter’s output, Arena’s or another computer’s screen: any NDI source on this network becomes a view
				of its own.
			</p>
			{full && <p className="text-sm text-booth-dim">That is {NDI_SOURCES_MAX}, the most there can be. Remove one to add another.</p>}
			{body}
			{added !== null && <span className="text-sm text-state-live">Added {added}. Layouts › Edit this layout, then a window's +, puts it on screen.</span>}
			{error !== null && <p className="text-sm text-state-unreachable">{error}</p>}
			<NdiNotice />
		</section>
	)
}

/** An NDI source's name, and Remove. */
function NdiEditor({ source, all, save, onRemoved }: { source: NdiSource; all: readonly NdiSource[]; save: Save; onRemoved: () => void }) {
	const [name, setName] = useState(source.name)
	const [local, setLocal] = useState<string | undefined>(undefined)
	const [removing, setRemoving] = useState(false)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])
	return (
		<>
			<p className="text-sm text-booth-dim">
				<span className="font-mono text-booth-ink">{source.source}</span>, as NDI names it.
			</p>
			<Editor
				save={async (patch) => {
					const e = ndiNameError(name.trim())
					setLocal(e ?? undefined)
					if (e !== null) return {}
					return save(patch)
				}}
				patch={() => ({ ndiSources: all.map((s) => (s.id === source.id ? { ...s, name: name.trim() } : s)) })}
			>
				{(err) => (
					<Field label="Name" error={local ?? err('ndiSources')} hint="What its tab says.">
						<Input value={name} onChange={setName} placeholder={ndiShortName(source.source)} />
					</Field>
				)}
			</Editor>
			<div className="flex items-center gap-4 border-t border-booth-edge pt-5">
				<Button
					variant={removing ? 'danger' : 'quiet'}
					icon={Trash2}
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ ndiSources: all.filter((s) => s.id !== source.id) }).then((e) => e === null && onRemoved())
					}}
				>
					{removing ? 'Tap again to remove' : 'Remove this source'}
				</Button>
				<span className="text-sm text-booth-dim">Its tabs leave the screen. It can be added again from the list.</span>
			</div>
			<NdiNotice />
		</>
	)
}

/** Add a capture input as a view of its own (../../shared/capture.ts):
 *  picked from the cameras this computer lists, never typed. */
function AddCapture({ all, save }: { all: readonly CaptureInput[]; save: Save }) {
	const cameras = useCameras(true)
	const [added, setAdded] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const full = all.length >= CAPTURE_INPUTS_MAX
	const add = async (device: string) => {
		setAdded(null)
		setError(null)
		const name = captureShortName(device)
		const entry: CaptureInput = { id: newEmbedId(Date.now(), Math.random()), name, device, on: true }
		const result = await save({ captureInputs: [...all, entry] })
		if (result !== null) return setError(result.captureInputs ?? result.form ?? 'Not added.')
		setAdded(name)
	}
	return (
		<section className="flex flex-col gap-5">
			<DetailHead title="Add a capture input" />
			<p className="max-w-prose text-sm text-booth-dim">
				Anything this computer sees as a camera becomes a view of its own: a Blackmagic card’s input (with Desktop Video
				installed), an ATEM Mini’s USB output, OBS’s Virtual Camera (Start Virtual Camera in OBS), or a webcam.
			</p>
			{full && <p className="text-sm text-booth-dim">That is {CAPTURE_INPUTS_MAX}, the most there can be. Remove one to add another.</p>}
			{cameras === null ? (
				<p className="text-sm text-booth-dim">Looking for cameras…</p>
			) : cameras.length === 0 ? (
				<p className="text-sm text-booth-dim">This computer lists no cameras.</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{cameras.map((device) => (
						<li key={device} className="flex min-h-14 items-center gap-4 rounded-xl bg-booth-raise px-4 py-2">
							<Webcam size={18} className="shrink-0 text-booth-dim" aria-hidden />
							<span className="flex min-w-0 flex-1 flex-col leading-tight">
								<span className="truncate text-base">{captureShortName(device)}</span>
								<span className="truncate font-mono text-xs text-booth-dim">{device}</span>
							</span>
							{all.some((c) => c.device === device) ? (
								<span className="text-sm text-booth-dim">Added</span>
							) : (
								<Button icon={Plus} disabled={full} onClick={() => void add(device)}>
									Add
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			{added !== null && <span className="text-sm text-state-live">Added {added}. Layouts › Edit this layout, then a window's +, puts it on screen.</span>}
			{error !== null && <p className="text-sm text-state-unreachable">{error}</p>}
		</section>
	)
}

/** A capture input's name, and Remove. */
function CaptureEditor({ input, all, save, onRemoved }: { input: CaptureInput; all: readonly CaptureInput[]; save: Save; onRemoved: () => void }) {
	const [name, setName] = useState(input.name)
	const [local, setLocal] = useState<string | undefined>(undefined)
	const [removing, setRemoving] = useState(false)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])
	return (
		<>
			<p className="text-sm text-booth-dim">
				<span className="font-mono text-booth-ink">{input.device}</span>, as this computer names it. A card input shows a
				picture once its signal matches the format set in Desktop Video Setup.
			</p>
			<Editor
				save={async (patch) => {
					const e = captureNameError(name.trim())
					setLocal(e ?? undefined)
					if (e !== null) return {}
					return save(patch)
				}}
				patch={() => ({ captureInputs: all.map((c) => (c.id === input.id ? { ...c, name: name.trim() } : c)) })}
			>
				{(err) => (
					<Field label="Name" error={local ?? err('captureInputs')} hint="What its tab says.">
						<Input value={name} onChange={setName} placeholder={captureShortName(input.device)} />
					</Field>
				)}
			</Editor>
			<div className="flex items-center gap-4 border-t border-booth-edge pt-5">
				<Button
					variant={removing ? 'danger' : 'quiet'}
					icon={Trash2}
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ captureInputs: all.filter((c) => c.id !== input.id) }).then((e) => e === null && onRemoved())
					}}
				>
					{removing ? 'Tap again to remove' : 'Remove this input'}
				</Button>
				<span className="text-sm text-booth-dim">Its tabs leave the screen. It can be added again from the list.</span>
			</div>
		</>
	)
}

/** Full screen or a window: for testers on a laptop; the booth stays full
 *  screen. Changes at once, no restart. */
function ThisScreen({ windowed, operator, save }: { windowed: boolean; operator: boolean; save: Save }) {
	return (
		<Card>
			<SectionTitle>This screen</SectionTitle>
			<div className="flex flex-wrap items-center gap-4">
				<Segmented
					label="This screen"
					disabled={!operator}
					value={windowed}
					onChange={(v) => void save({ windowed: v })}
					options={[
						{ value: false, label: 'Full screen' },
						{ value: true, label: 'Window' },
					]}
				/>
				<span className="text-sm text-booth-dim">
					{operator ? 'A window is for testing on a laptop; the booth stays full screen.' : 'Operator mode changes it.'}
				</span>
			</div>
		</Card>
	)
}

/** Which build this is and where it logs: what a field tester's report needs. */
function AboutLine({ operator }: { operator: boolean }) {
	const [about, setAbout] = useState<About | null>(null)
	useEffect(() => void window.life?.about().then((a) => setAbout(a ?? null)), [])
	if (about === null) return null
	return (
		<Card>
			<SectionTitle aside={`Version ${about.version}`}>Pāua</SectionTitle>
			<div className="flex items-center gap-4 text-sm text-booth-dim">
				<span className="min-w-0">
					The log is at <span className="font-mono break-all text-booth-ink">{about.logPath}</span>
				</span>
				{operator && (
					<Button size="sm" onClick={() => window.life?.showLog()}>
						Show the log
					</Button>
				)}
			</div>
		</Card>
	)
}

const toneText: Record<Tone, string> = {
	live: 'text-state-live',
	stale: 'text-state-stale',
	down: 'text-state-unreachable',
	off: 'text-booth-dim',
}

const tonePill: Record<Tone, string> = {
	live: 'bg-state-live/12 text-state-live',
	stale: 'bg-state-stale/12 text-state-stale',
	down: 'bg-state-unreachable/12 text-state-unreachable',
	off: 'bg-booth-raise text-booth-dim',
}

/** Whether this booth uses a connection. Off keeps the address but stops
 *  asking, leaves the dot alone, and takes its views and chips off the screen. */
function OnOff({ on, onSet }: { on: boolean; onSet: (on: boolean) => void }) {
	return (
		<div className="flex items-center gap-4">
			<Segmented
				label="Used at this booth"
				value={on}
				onChange={onSet}
				options={[
					{ value: true, label: 'On' },
					{ value: false, label: 'Off' },
				]}
			/>
			<span className="text-sm text-booth-dim">
				{on ? 'Used at this booth.' : 'Not used here: not asked, not in the dot, and its views and chips are hidden.'}
			</span>
		</div>
	)
}

/** A row's own Save, with what went wrong under it. One row's fields only:
 *  saving OnTime never re-sends the console's. */
function Editor({
	save,
	patch,
	note,
	children,
}: {
	save: Save
	patch: () => SettingsPatch
	note?: string
	/** The fields, handed what the last Save said about each. */
	children: (err: Err) => ReactNode
}) {
	const [errors, setErrors] = useState<Errors>({})
	const [saved, setSaved] = useState(false)
	return (
		<>
			{children((field) => errors[field])}
			{errors.form !== undefined && <p className="text-sm text-state-unreachable">{errors.form}</p>}
			<div className="flex items-center gap-4">
				<Button
					variant="primary"
					icon={Save}
					onClick={() =>
						void save(patch()).then((e) => {
							setErrors(e ?? {})
							setSaved(e === null)
						})
					}
					className="px-7"
				>
					Save
				</Button>
				{saved && <span className="text-sm text-state-live">Saved.{note === undefined ? '' : ` ${note}`}</span>}
			</div>
		</>
	)
}

type Err = (field: SettingsField) => string | undefined

function HostPort(p: {
	err: Err
	host: string
	port: string
	onHost: (v: string) => void
	onPort: (v: string) => void
	hostField: SettingsField
	portField: SettingsField
	hostLabel: string
	portHint: string
	placeholder?: string
}) {
	return (
		<div className="grid grid-cols-2 gap-4">
			<Field label={p.hostLabel} error={p.err(p.hostField)}>
				<Input value={p.host} onChange={p.onHost} placeholder={p.placeholder ?? 'not used'} mono />
			</Field>
			<Field label="Port" error={p.err(p.portField)} hint={p.portHint}>
				<Input value={p.port} onChange={p.onPort} inputMode="numeric" />
			</Field>
		</div>
	)
}

function OnTimeEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.onTimeHost ?? '')
	const [port, setPort] = useState(String(view.onTimePort))
	return (
		<Editor save={save} patch={() => ({ onTimeHost: host, onTimePort: portOf(port) })}>
			{(err) => (
				<>
					<p className="text-sm text-booth-dim">Shown beside the clock whenever an event is running in OnTime.</p>
					<HostPort
						err={err}
						host={host}
						port={port}
						onHost={setHost}
						onPort={setPort}
						hostField="onTimeHost"
						portField="onTimePort"
						hostLabel="OnTime address"
						portHint="4001 unless OnTime says otherwise."
					/>
				</>
			)}
		</Editor>
	)
}

function ProPresenterEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.proPresenterHost ?? '')
	const [port, setPort] = useState(view.proPresenterPort === null ? '' : String(view.proPresenterPort))
	const [timer, setTimer] = useState(view.proPresenterTimer ?? '')
	const names = useProPresenterNames()
	return (
		<Editor
			save={save}
			patch={() => ({
				proPresenterHost: host,
				proPresenterPort: port.trim() === '' ? null : portOf(port),
				proPresenterTimer: timer === '' ? null : timer,
			})}
		>
			{(err) => (
				<>
					<p className="text-sm text-booth-dim">
						Shown beside the clock when OnTime has no event running: the timer, labelled by the stage message.
					</p>
					<HostPort
						err={err}
						host={host}
						port={port}
						onHost={setHost}
						onPort={setPort}
						hostField="proPresenterHost"
						portField="proPresenterPort"
						hostLabel="ProPresenter address"
						portHint="ProPresenter › Settings › Network, with Enable Network on."
					/>
					<Field
						label="Timer"
						error={err('proPresenterTimer')}
						hint={
							names === null
								? 'ProPresenter’s timers are listed here once it is answering.'
								: 'When more than one runs at once, the countdown follows this one.'
						}
					>
						<Select
							value={timer}
							onChange={setTimer}
							options={[
								{ value: '', label: 'Whichever is running' },
								...(names ?? []).map((name) => ({ value: name, label: name })),
								// The saved choice stays offered when ProPresenter does not list
								// it, so opening this row never changes it quietly.
								...(timer !== '' && !(names ?? []).includes(timer)
									? [{ value: timer, label: `${timer} (not in ProPresenter now)` }]
									: []),
							]}
						/>
					</Field>
				</>
			)}
		</Editor>
	)
}

function ArenaEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.arenaHost ?? '')
	const [port, setPort] = useState(String(view.arenaPort))
	const [graphics, setGraphics] = useState(view.graphicsFolder ?? '')
	const [local, setLocal] = useState(view.localMediaFolder ?? '')
	return (
		<Editor
			save={save}
			patch={() => ({
				arenaHost: host,
				arenaPort: portOf(port),
				graphicsFolder: graphics.trim() === '' ? null : graphics,
				localMediaFolder: local.trim() === '' ? null : local,
			})}
		>
			{(err) => (
				<>
					<p className="text-sm text-booth-dim">
						Arena › Preferences › Web Server, with Enable Webserver &amp; REST API on. 127.0.0.1 when Arena runs on this
						computer.
					</p>
					<HostPort
						err={err}
						host={host}
						port={port}
						onHost={setHost}
						onPort={setPort}
						hostField="arenaHost"
						portField="arenaPort"
						hostLabel="Arena address"
						portHint="8080 unless Arena says otherwise."
					/>
					<p className="text-sm text-booth-dim">
						For the media check's Fetch: the lookbook's file is found by name in the graphics folder (only ever read),
						copied into the local folder, and loaded into Arena's clip. Never into a clip that is playing, and nothing is
						overwritten.
					</p>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Graphics folder" error={err('graphicsFolder')} hint="The NAS or drive the media comes from.">
							<FolderInput value={graphics} onChange={setGraphics} placeholder="\\LC-NAS-01\Graphics\Sunday Media" />
						</Field>
						<Field label="Local folder" error={err('localMediaFolder')} hint="On this computer, for Arena to play from.">
							<FolderInput value={local} onChange={setLocal} placeholder="D:\VFX Media" />
						</Field>
					</div>
				</>
			)}
		</Editor>
	)
}

/** A folder, typed or picked with Windows' own folder picker (the owner's
 *  ask, 2026-10-05). Picking only fills the field; Save keeps it. */
function FolderInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
	const browse = () => void window.life?.chooseFolder(value.trim() === '' ? null : value).then((f) => f !== null && onChange(f))
	return (
		<span className="flex min-w-0 gap-2">
			<span className="min-w-0 flex-1">
				<Input value={value} onChange={onChange} placeholder={placeholder} mono />
			</span>
			<Button icon={FolderOpen} onClick={browse}>
				Browse
			</Button>
		</span>
	)
}

function ConsoleEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.consoleHost ?? '')
	const [webPort, setWebPort] = useState(String(view.webRemotePort))
	const [oscPort, setOscPort] = useState(String(view.oscPort))
	const [replyPort, setReplyPort] = useState(view.replyPort === null ? '' : String(view.replyPort))
	const [volunteerUser, setVolunteerUser] = useState(view.volunteerUser)
	const [operatorUser, setOperatorUser] = useState(view.operatorUser ?? '')
	const [volunteerPassword, setVolunteerPassword] = useState('')
	const [operatorPassword, setOperatorPassword] = useState('')
	const [removeVolunteer, setRemoveVolunteer] = useState(false)
	const [removeOperator, setRemoveOperator] = useState(false)
	const [campus, setCampus] = useState(view.campus ?? '')

	const patch = (): SettingsPatch => {
		const p: SettingsPatch = {
			consoleHost: host,
			campus: campus.trim() === '' ? null : campus,
			webRemotePort: portOf(webPort),
			oscPort: portOf(oscPort),
			replyPort: replyPort.trim() === '' ? null : portOf(replyPort),
			volunteerUser,
			operatorUser: operatorUser === '' ? null : operatorUser,
		}
		if (removeVolunteer) p.volunteerPassword = null
		else if (volunteerPassword !== '') p.volunteerPassword = volunteerPassword
		if (removeOperator) p.operatorPassword = null
		else if (operatorPassword !== '') p.operatorPassword = operatorPassword
		return p
	}

	return (
		<Editor save={save} patch={patch} note="The MA pane reconnects with these.">
			{(err) => (
				<>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Console address" error={err('consoleHost')}>
							<Input value={host} onChange={setHost} placeholder="10.11.60.40" mono />
						</Field>
						<Field label="Web remote port" error={err('webRemotePort')} hint="8080 unless the console says otherwise.">
							<Input value={webPort} onChange={setWebPort} inputMode="numeric" />
						</Field>
						<Field label="OSC port on the console" error={err('oscPort')} hint="The Port of the console's OSC entry, prefix life.">
							<Input value={oscPort} onChange={setOscPort} inputMode="numeric" />
						</Field>
						<Field
							label="Replies come back on"
							error={err('replyPort')}
							hint="Blank for the same port. Only grandMA3 onPC on this computer needs another."
						>
							<Input
								value={replyPort}
								onChange={setReplyPort}
								inputMode="numeric"
								placeholder={`same (${oscPort.trim() || view.oscPort})`}
							/>
						</Field>
						<Field label="Campus" error={err('campus')} hint="Save As names begin with it, then the date and time.">
							<Input value={campus} onChange={setCampus} placeholder="Central" />
						</Field>
					</div>
					<p className="text-sm text-booth-dim">
						Listening on {replyPortOf(view)} now. The link is checked by asking the console to echo a message after 15 s of
						quiet, which puts one SendOSC line on its command line.
					</p>
					<p className="text-sm text-booth-dim">
						What each mode may do is set on the console, in these users’ rights. Admin, Guest and 3D users cannot log in
						to a web remote.
					</p>
					<User
						label="Volunteer"
						hint="Remote, with no password, is the web remote's own default."
						user={volunteerUser}
						onUser={setVolunteerUser}
						password={volunteerPassword}
						onPassword={(v) => {
							setVolunteerPassword(v)
							setRemoveVolunteer(false)
						}}
						hasPassword={view.volunteerHasPassword}
						removing={removeVolunteer}
						onRemove={() => {
							setRemoveVolunteer(!removeVolunteer)
							setVolunteerPassword('')
						}}
						canStore={view.canStorePasswords}
						errors={[err('volunteerUser'), err('volunteerPassword')]}
					/>
					<User
						label="Operator"
						hint="Leave blank and operator mode keeps the volunteer user."
						user={operatorUser}
						onUser={setOperatorUser}
						password={operatorPassword}
						onPassword={(v) => {
							setOperatorPassword(v)
							setRemoveOperator(false)
						}}
						hasPassword={view.operatorHasPassword}
						removing={removeOperator}
						onRemove={() => {
							setRemoveOperator(!removeOperator)
							setOperatorPassword('')
						}}
						canStore={view.canStorePasswords}
						errors={[err('operatorUser'), err('operatorPassword')]}
					/>
				</>
			)}
		</Editor>
	)
}

/** Where the MA pane is pointed, and what the wire has heard. Channel B is an
 *  OBSERVATION beside the link's verdict, never folded into it: the link can be
 *  down while fader levels arrive, and one green dot for both is how "we heard
 *  something" becomes "everything is fine". */
function ConsoleInfo({ paneSummary, desk, now }: { paneSummary: string; desk: DeskState | null; now: number }) {
	return (
		<div className="flex flex-col gap-1 text-sm">
			<span>
				<span className="text-booth-dim">MA pane · </span>
				{paneSummary}
			</span>
			{desk !== null && (
				<span>
					<span className="text-booth-dim">Desk · </span>
					{!desk.listening ? (
						// A port that would not bind is a fault to act on. Amber is reserved for this.
						<span className="text-warn">OSC port {desk.port} not bound</span>
					) : desk.lastHeardAt === null ? (
						'not heard yet'
					) : (
						<>
							heard {formatAge(now - desk.lastHeardAt)} · {desk.executors.length}{' '}
							{desk.executors.length === 1 ? 'control' : 'controls'}
							{/* Should sit at zero forever: a number here means the desk says
							    something we read wrong. */}
							{desk.rejected > 0 && <span className="text-warn"> · {desk.rejected} rejected</span>}
						</>
					)}
				</span>
			)}
		</div>
	)
}

function CueInfo({ operator }: { operator: boolean }) {
	return (
		<>
			<p className="text-sm text-booth-dim">
				The run order is the Cue Manager itself. To sign this booth in, use “Sign in with a QR code” in its column; an
				admin scans it and approves it as this campus’s booth device.
			</p>
			{operator && <CueManagerSettings />}
		</>
	)
}
