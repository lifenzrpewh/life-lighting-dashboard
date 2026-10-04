// Connections: every program the dashboard talks to, one row each, status
// beside the settings that fix it. Opens in the MA pane's place, because a
// native view cannot be drawn over, and closes back to it.
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
import type { DeskState } from '../../shared/desk.js'
import { replyPortOf, type SettingsField, type SettingsPatch, type SettingsView } from '../../shared/settings.js'
import { CueManagerSettings } from './CueManagerSettings.js'
import { Field, Input, Select, User, portOf, useProPresenterNames } from './form.js'
import { formatAge } from './vocabulary.js'

type Errors = Partial<Record<SettingsField, string>>
type Save = (patch: SettingsPatch) => Promise<Errors | null>

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
	const [open, setOpen] = useState<RowId | null>(null)
	const load = () => window.life?.settings().then(setView)
	useEffect(() => void load(), [])

	if (window.life === undefined) return <Frame onClose={onClose}>Connections exist only inside the kiosk.</Frame>
	if (view === null) return <Frame onClose={onClose}>Reading settings…</Frame>

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
	const isOff = (id: RowId) => {
		const embed = embedOf(id)
		return embed !== null ? !embed.on : view.off.includes(id as ConnectionId)
	}
	const setOn = (id: RowId, on: boolean) => {
		const embed = embedOf(id)
		if (embed !== null) return save({ embeds: view.embeds.map((e) => (e.id === embed.id ? { ...e, on } : e)) })
		return save({ off: on ? view.off.filter((x) => x !== id) : [...view.off, id as ConnectionId] })
	}
	const addressOf = (id: RowId): string | null => {
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

	return (
		<Frame onClose={onClose}>
			{rows.every((row) => row.tone === 'off') && (
				// A fresh install: every row off, which reads as a broken screen
				// unless something says it is only empty.
				<p className="rounded-md border border-booth-edge bg-booth-panel px-4 py-3 text-base">
					Nothing is set up yet.{' '}
					{operator
						? 'Tap a row to give it an address; start with the Console.'
						: 'Hold the mode chip for operator mode, then tap a row to give it an address.'}
				</p>
			)}
			<ul className="flex flex-col divide-y divide-booth-edge rounded-md border border-booth-edge">
				{rows.map((row) => (
					<li key={row.id}>
						<button
							type="button"
							onClick={() => setOpen(open === row.id ? null : row.id)}
							className="grid min-h-16 w-full grid-cols-[1.5rem_9rem_1fr_auto_1.5rem] items-center gap-3 px-4 text-left active:bg-booth-edge"
						>
							<Dot tone={row.tone} />
							<span className="text-base">{row.name}</span>
							<span className="flex min-w-0 items-baseline gap-2">
								<span className={`whitespace-nowrap text-sm ${toneText[row.tone]}`}>{row.status}</span>
								{row.detail !== null && <span className="truncate text-sm text-booth-dim">{row.detail}</span>}
							</span>
							<span className={`text-sm whitespace-nowrap text-booth-dim tabular-nums ${isOff(row.id) ? 'line-through opacity-60' : ''}`}>
								{addressOf(row.id) ?? ''}
							</span>
							<span className="text-booth-dim">{open === row.id ? '▾' : '›'}</span>
						</button>
						{open === row.id && (
							<div className="flex flex-col gap-4 border-t border-booth-edge bg-booth-panel px-4 py-5">
								{operator && <OnOff on={!isOff(row.id)} onSet={(on) => void setOn(row.id, on)} />}
								{row.id === 'video' && (
									<p className="text-sm text-booth-dim">
										A picture another program on this computer sends over Spout (Windows) or Syphon (Mac), such as Arena’s
										multiview. Separate from Arena: it works with Arena’s web server off.
									</p>
								)}
								{row.id === 'console' && <ConsoleInfo paneSummary={paneSummary} desk={desk} now={now} />}
								{embedOf(row.id) !== null ? (
									operator ? (
										<EmbedEditor key={row.id} embed={embedOf(row.id)!} all={view.embeds} save={save} onRemoved={() => setOpen(null)} />
									) : (
										<p className="text-sm text-booth-dim">
											{embedOf(row.id)!.url}. Hold the mode chip for operator mode to change or remove it.
										</p>
									)
								) : !operator ? (
									row.id !== 'cue' && (
										<p className="text-sm text-booth-dim">Hold the mode chip for operator mode to change these.</p>
									)
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
							</div>
						)}
					</li>
				))}
			</ul>
			{operator && <AddEmbed all={view.embeds} save={save} />}
			<AboutLine operator={operator} />
		</Frame>
	)
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
			<div className="flex items-center gap-4 border-t border-booth-edge pt-4">
				<button
					type="button"
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ embeds: all.filter((e) => e.id !== embed.id) }).then((e) => e === null && onRemoved())
					}}
					className={`h-12 rounded border px-6 text-sm active:scale-[0.98] ${removing ? 'border-state-unreachable text-state-unreachable' : 'border-booth-edge text-booth-dim'}`}
				>
					{removing ? 'Tap again to remove' : 'Remove this embed'}
				</button>
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
		<section className="flex flex-col gap-4 rounded-md border border-booth-edge px-4 py-5">
			<h3 className="text-xs font-semibold tracking-widest text-booth-dim uppercase">Add a web page</h3>
			<p className="text-sm text-booth-dim">
				Any page, such as a Google Sheet, becomes a view of its own, with its own sign-in. Links that open a new window
				open in this computer's browser.
			</p>
			{full ? (
				<p className="text-sm text-booth-dim">That is {EMBEDS_MAX}, the most there can be. Remove one to add another.</p>
			) : (
				<>
					<EmbedFields name={name} url={url} onName={setName} onUrl={setUrl} errors={errors} />
					<div className="flex items-center gap-4">
						<button
							type="button"
							onClick={() => void add()}
							className="h-12 rounded border-2 border-booth-ink bg-booth-ink px-8 text-base font-semibold text-booth-bg active:scale-[0.98]"
						>
							Add
						</button>
						{added !== null && <span className="text-sm text-state-live">Added {added}. In Edit layout, a window's + puts it on screen.</span>}
					</div>
				</>
			)}
		</section>
	)
}

/** Which build this is and where it logs: what a field tester's report needs. */
function AboutLine({ operator }: { operator: boolean }) {
	const [about, setAbout] = useState<About | null>(null)
	useEffect(() => void window.life?.about().then((a) => setAbout(a ?? null)), [])
	if (about === null) return null
	return (
		<div className="flex items-center gap-4 text-sm text-booth-dim">
			<span className="min-w-0">
				Pāua {about.version} · Log <span className="break-all">{about.logPath}</span>
			</span>
			{operator && (
				<button
					type="button"
					onClick={() => window.life?.showLog()}
					className="h-10 shrink-0 rounded border border-booth-edge px-4 text-booth-ink active:scale-[0.98]"
				>
					Show the log
				</button>
			)}
		</div>
	)
}

const toneText: Record<Tone, string> = {
	live: 'text-state-live',
	stale: 'text-state-stale',
	down: 'text-state-unreachable',
	off: 'text-booth-dim',
}

/** Filled in the state's colour; hollow when the connection is not set up. */
export function Dot({ tone }: { tone: Tone }) {
	const fill: Record<Tone, string> = {
		live: 'bg-state-live',
		stale: 'bg-state-stale',
		down: 'bg-state-unreachable',
		off: 'border border-booth-dim',
	}
	return <span className={`size-2.5 rounded-full ${fill[tone]}`} />
}

/** Whether this booth uses a connection. Off keeps the address but stops
 *  asking, leaves the dot alone, and takes its views and chips off the screen. */
function OnOff({ on, onSet }: { on: boolean; onSet: (on: boolean) => void }) {
	const option = (value: boolean, label: string) => (
		<button
			type="button"
			onClick={() => value !== on && onSet(value)}
			aria-pressed={value === on}
			className={`h-10 px-5 text-sm ${value === on ? 'bg-booth-ink text-booth-bg' : 'text-booth-dim'}`}
		>
			{label}
		</button>
	)
	return (
		<div className="flex items-center gap-4">
			<span className="flex overflow-hidden rounded border border-booth-edge">
				{option(true, 'On')}
				{option(false, 'Off')}
			</span>
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
				<button
					type="button"
					onClick={() =>
						void save(patch()).then((e) => {
							setErrors(e ?? {})
							setSaved(e === null)
						})
					}
					className="h-12 rounded border-2 border-booth-ink bg-booth-ink px-8 text-base font-semibold text-booth-bg active:scale-[0.98]"
				>
					Save
				</button>
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
				<Input value={p.host} onChange={p.onHost} placeholder={p.placeholder ?? 'not used'} />
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
	return (
		<Editor save={save} patch={() => ({ arenaHost: host, arenaPort: portOf(port) })}>
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
				</>
			)}
		</Editor>
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
							<Input value={host} onChange={setHost} placeholder="10.11.60.40" />
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

function Frame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-booth-bg">
			<div className="flex items-center border-b border-booth-edge bg-booth-panel px-6 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-widest text-booth-dim">Connections</h2>
				<button
					type="button"
					onClick={onClose}
					className="ml-auto h-10 rounded border border-booth-edge px-5 text-sm active:scale-[0.98]"
				>
					Back
				</button>
			</div>
			<div className="flex max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-6 select-text">{children}</div>
		</div>
	)
}
