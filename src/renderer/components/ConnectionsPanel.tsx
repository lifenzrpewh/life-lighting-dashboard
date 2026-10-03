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

import type { ConnectionId, ConnectionStatus, Tone } from '../../shared/connections.js'
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
	onClose,
}: {
	rows: readonly ConnectionStatus[]
	operator: boolean
	/** Where the MA pane is pointed, in a few words. */
	paneSummary: string
	desk: DeskState | null
	now: number
	onClose: () => void
}) {
	const [view, setView] = useState<SettingsView | null>(null)
	const [open, setOpen] = useState<ConnectionId | null>(null)
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
		return null
	}

	const address: Record<ConnectionId, string | null> = {
		console: view.consoleHost,
		ontime: view.onTimeHost === null ? null : `${view.onTimeHost}:${view.onTimePort}`,
		propresenter:
			view.proPresenterHost === null ? null : `${view.proPresenterHost}:${view.proPresenterPort ?? '?'}`,
		arena: view.arenaHost === null ? null : `${view.arenaHost}:${view.arenaPort}`,
		cue: null,
	}

	return (
		<Frame onClose={onClose}>
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
							<span className="text-sm whitespace-nowrap text-booth-dim tabular-nums">{address[row.id] ?? ''}</span>
							<span className="text-booth-dim">{open === row.id ? '▾' : '›'}</span>
						</button>
						{open === row.id && (
							<div className="flex flex-col gap-4 border-t border-booth-edge bg-booth-panel px-4 py-5">
								{row.id === 'console' && <ConsoleInfo paneSummary={paneSummary} desk={desk} now={now} />}
								{!operator ? (
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
		</Frame>
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
					Back to the MA
				</button>
			</div>
			<div className="flex max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-6 select-text">{children}</div>
		</div>
	)
}
