// Settings, operator mode only. Opens in the MA pane's place, because a native
// view cannot be drawn over, and closes back to it.
//
// Only what no show knows lives here (src/shared/settings.ts). Passwords are
// write-only: the panel is told whether one is set, never what it is, so a
// blank password box means "leave it as it is", and Remove is its own button.

import { useEffect, useState, type ReactNode } from 'react'

import { webRemoteUrl } from '../../shared/ma-pane.js'
import { replyPortOf, type SettingsField, type SettingsPatch, type SettingsView } from '../../shared/settings.js'
import { CueManagerSettings } from './CueManagerSettings.js'

type Draft = {
	consoleHost: string
	webRemotePort: string
	oscPort: string
	/** Blank means the same port as the console's. */
	replyPort: string
	onTimeHost: string
	onTimePort: string
	proPresenterHost: string
	proPresenterPort: string
	/** Blank means whichever timer is running first. */
	proPresenterTimer: string
	volunteerUser: string
	operatorUser: string
	volunteerPassword: string
	operatorPassword: string
	removeVolunteerPassword: boolean
	removeOperatorPassword: boolean
}

const draftOf = (v: SettingsView): Draft => ({
	consoleHost: v.consoleHost ?? '',
	webRemotePort: String(v.webRemotePort),
	oscPort: String(v.oscPort),
	replyPort: v.replyPort === null ? '' : String(v.replyPort),
	onTimeHost: v.onTimeHost ?? '',
	onTimePort: String(v.onTimePort),
	proPresenterHost: v.proPresenterHost ?? '',
	proPresenterPort: v.proPresenterPort === null ? '' : String(v.proPresenterPort),
	proPresenterTimer: v.proPresenterTimer ?? '',
	volunteerUser: v.volunteerUser,
	operatorUser: v.operatorUser ?? '',
	volunteerPassword: '',
	operatorPassword: '',
	removeVolunteerPassword: false,
	removeOperatorPassword: false,
})

/** Not parsed leniently: "80 80" must be an error, not 80. */
const portOf = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

function patchOf(d: Draft): SettingsPatch {
	const patch: SettingsPatch = {
		consoleHost: d.consoleHost,
		webRemotePort: portOf(d.webRemotePort),
		oscPort: portOf(d.oscPort),
		replyPort: d.replyPort.trim() === '' ? null : portOf(d.replyPort),
		onTimeHost: d.onTimeHost,
		onTimePort: portOf(d.onTimePort),
		proPresenterHost: d.proPresenterHost,
		proPresenterPort: d.proPresenterPort.trim() === '' ? null : portOf(d.proPresenterPort),
		proPresenterTimer: d.proPresenterTimer === '' ? null : d.proPresenterTimer,
		volunteerUser: d.volunteerUser,
		operatorUser: d.operatorUser === '' ? null : d.operatorUser,
	}
	if (d.removeVolunteerPassword) patch.volunteerPassword = null
	else if (d.volunteerPassword !== '') patch.volunteerPassword = d.volunteerPassword
	if (d.removeOperatorPassword) patch.operatorPassword = null
	else if (d.operatorPassword !== '') patch.operatorPassword = d.operatorPassword
	return patch
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
	const [view, setView] = useState<SettingsView | null>(null)
	const [draft, setDraft] = useState<Draft | null>(null)
	const [errors, setErrors] = useState<Partial<Record<SettingsField, string>>>({})
	const [saved, setSaved] = useState(false)

	const load = () =>
		window.life?.settings().then((v) => {
			setView(v)
			setDraft(draftOf(v))
		})
	useEffect(() => void load(), [])
	const proPresenterNames = useProPresenterNames()

	if (window.life === undefined) return <Frame onClose={onClose}>Settings exist only inside the kiosk.</Frame>
	if (view === null || draft === null) return <Frame onClose={onClose}>Reading settings…</Frame>

	const set = (patch: Partial<Draft>) => {
		setDraft({ ...draft, ...patch })
		setSaved(false)
	}

	const save = async () => {
		const result = await window.life?.saveSettings(patchOf(draft))
		if (result === undefined) return
		if (!result.ok) {
			setErrors(result.errors)
			setSaved(false)
			return
		}
		setErrors({})
		setSaved(true)
		await load()
	}

	const port = Number(draft.webRemotePort)
	const preview = webRemoteUrl(draft.consoleHost.trim(), port)

	return (
		<Frame onClose={onClose}>
			<Section title="Console">
				<Field label="Console address" error={errors.consoleHost}>
					<Input value={draft.consoleHost} onChange={(v) => set({ consoleHost: v })} placeholder="10.11.60.40" />
				</Field>
				<Field label="Web remote port" error={errors.webRemotePort} hint="8080 unless the console says otherwise.">
					<Input value={draft.webRemotePort} onChange={(v) => set({ webRemotePort: v })} inputMode="numeric" />
				</Field>
				<p className="text-sm text-booth-dim">
					{preview === null ? 'No address yet: the MA pane has nowhere to connect.' : `The MA pane loads ${preview}`}
				</p>
			</Section>

			<Section title="OSC">
				<p className="text-sm text-booth-dim">
					How the dashboard checks the console is there: after 15 s of quiet it asks the console to echo a
					message back, which puts one SendOSC line on the console's command line.
					These must match the console's OSC entry, prefix <code>life</code>.
				</p>
				<div className="grid grid-cols-2 gap-4">
					<Field label="OSC port on the console" error={errors.oscPort} hint="The Port of the console's OSC entry.">
						<Input value={draft.oscPort} onChange={(v) => set({ oscPort: v })} inputMode="numeric" />
					</Field>
					<Field
						label="Replies come back on"
						error={errors.replyPort}
						hint="Blank for the same port. Only grandMA3 onPC on this computer needs another."
					>
						<Input
							value={draft.replyPort}
							onChange={(v) => set({ replyPort: v })}
							inputMode="numeric"
							placeholder={`same (${draft.oscPort.trim() || view.oscPort})`}
						/>
					</Field>
				</div>
				<p className="text-sm text-booth-dim">
					Listening on {replyPortOf(view)} now. For onPC on this computer, set the console address to 127.0.0.1: onPC
					holds its own OSC ports, so replies need a port and an OSC row of their own, row 3, sending to 127.0.0.1.
				</p>
			</Section>

			<Section title="Countdown">
				<p className="text-sm text-booth-dim">
					The timer beside the clock. OnTime is shown whenever an event is running there; otherwise ProPresenter’s
					timer and stage message. Leave an address blank to not use that program.
				</p>
				<div className="grid grid-cols-2 gap-4">
					<Field label="OnTime address" error={errors.onTimeHost}>
						<Input value={draft.onTimeHost} onChange={(v) => set({ onTimeHost: v })} placeholder="not used" />
					</Field>
					<Field label="OnTime port" error={errors.onTimePort} hint="4001 unless OnTime says otherwise.">
						<Input value={draft.onTimePort} onChange={(v) => set({ onTimePort: v })} inputMode="numeric" />
					</Field>
					<Field label="ProPresenter address" error={errors.proPresenterHost}>
						<Input value={draft.proPresenterHost} onChange={(v) => set({ proPresenterHost: v })} placeholder="not used" />
					</Field>
					<Field
						label="ProPresenter port"
						error={errors.proPresenterPort}
						hint="ProPresenter › Settings › Network, with Enable Network on."
					>
						<Input value={draft.proPresenterPort} onChange={(v) => set({ proPresenterPort: v })} inputMode="numeric" />
					</Field>
				</div>
				<Field
					label="ProPresenter timer"
					error={errors.proPresenterTimer}
					hint={
						proPresenterNames === null
							? 'ProPresenter’s timers are listed here once it is answering.'
							: 'When more than one runs at once, the chip follows this one.'
					}
				>
					<Select
						value={draft.proPresenterTimer}
						onChange={(v) => set({ proPresenterTimer: v })}
						options={[
							{ value: '', label: 'Whichever is running' },
							...(proPresenterNames ?? []).map((name) => ({ value: name, label: name })),
							// The saved choice stays offered when ProPresenter does not list it,
							// so opening settings never changes it quietly.
							...(draft.proPresenterTimer !== '' && !(proPresenterNames ?? []).includes(draft.proPresenterTimer)
								? [{ value: draft.proPresenterTimer, label: `${draft.proPresenterTimer} (not in ProPresenter now)` }]
								: []),
						]}
					/>
				</Field>
			</Section>

			<Section title="MA users">
				<p className="text-sm text-booth-dim">
					What each mode may do is set on the console, in these users' rights. Admin, Guest and 3D users cannot
					log in to a web remote.
				</p>
				<User
					label="Volunteer"
					hint="Remote, with no password, is the web remote's own default."
					user={draft.volunteerUser}
					onUser={(v) => set({ volunteerUser: v })}
					password={draft.volunteerPassword}
					onPassword={(v) => set({ volunteerPassword: v, removeVolunteerPassword: false })}
					hasPassword={view.volunteerHasPassword}
					removing={draft.removeVolunteerPassword}
					onRemove={() => set({ removeVolunteerPassword: !draft.removeVolunteerPassword, volunteerPassword: '' })}
					canStore={view.canStorePasswords}
					errors={[errors.volunteerUser, errors.volunteerPassword]}
				/>
				<User
					label="Operator"
					hint="Leave blank and operator mode keeps the volunteer user."
					user={draft.operatorUser}
					onUser={(v) => set({ operatorUser: v })}
					password={draft.operatorPassword}
					onPassword={(v) => set({ operatorPassword: v, removeOperatorPassword: false })}
					hasPassword={view.operatorHasPassword}
					removing={draft.removeOperatorPassword}
					onRemove={() => set({ removeOperatorPassword: !draft.removeOperatorPassword, operatorPassword: '' })}
					canStore={view.canStorePasswords}
					errors={[errors.operatorUser, errors.operatorPassword]}
				/>
			</Section>

			{errors.form !== undefined && <p className="text-sm text-state-unreachable">{errors.form}</p>}
			<div className="flex items-center gap-4">
				<button
					type="button"
					onClick={() => void save()}
					className="h-14 rounded border-2 border-booth-ink bg-booth-ink px-10 text-lg font-semibold text-booth-bg active:scale-[0.98]"
				>
					Save
				</button>
				{saved && <span className="text-sm text-state-live">Saved. The MA pane reconnects with these.</span>}
			</div>

			{/* Below Save and apart from it: this acts at once and is not saved. */}
			<CueManagerSettings />
		</Frame>
	)
}

function Frame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-booth-bg">
			<div className="flex items-center border-b border-booth-edge bg-booth-panel px-6 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-widest text-booth-dim">Settings</h2>
				<button
					type="button"
					onClick={onClose}
					className="ml-auto h-10 rounded border border-booth-edge px-5 text-sm active:scale-[0.98]"
				>
					Back to the MA
				</button>
			</div>
			<div className="flex max-w-2xl flex-col gap-8 overflow-y-auto px-6 py-6 select-text">{children}</div>
		</div>
	)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<h3 className="text-lg">{title}</h3>
			{children}
		</section>
	)
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: ReactNode }) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-sm text-booth-dim">{label}</span>
			{children}
			{error !== undefined ? (
				<span className="text-sm text-state-unreachable">{error}</span>
			) : (
				hint !== undefined && <span className="text-xs text-booth-dim">{hint}</span>
			)}
		</label>
	)
}

function Input({
	value,
	onChange,
	placeholder,
	type = 'text',
	inputMode,
	disabled = false,
}: {
	value: string
	onChange: (v: string) => void
	placeholder?: string
	type?: 'text' | 'password'
	inputMode?: 'numeric'
	disabled?: boolean
}) {
	return (
		<input
			type={type}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			inputMode={inputMode}
			disabled={disabled}
			autoComplete={type === 'password' ? 'new-password' : 'off'}
			spellCheck={false}
			className="h-12 rounded border border-booth-edge bg-booth-panel px-4 text-lg outline-none focus:border-booth-ink disabled:opacity-50"
		/>
	)
}

function Select({
	value,
	onChange,
	options,
}: {
	value: string
	onChange: (v: string) => void
	options: Array<{ value: string; label: string }>
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="h-12 rounded border border-booth-edge bg-booth-panel px-4 text-lg outline-none focus:border-booth-ink"
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	)
}

/** The timer names ProPresenter last listed, or null when it has not answered.
 *  Asked of main, which already polls ProPresenter: the panel opens no
 *  connection of its own. */
function useProPresenterNames(): string[] | null {
	const [names, setNames] = useState<string[] | null>(null)
	useEffect(() => {
		let alive = true
		const ask = () =>
			void window.life?.timers().then((t) => {
				const last = t.propresenter?.lastOk?.value.timers
				if (alive) setNames(last === undefined ? null : [...new Set(last.map((x) => x.name))])
			})
		ask()
		const id = setInterval(ask, 2_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])
	return names
}

function User(p: {
	label: string
	hint: string
	user: string
	onUser: (v: string) => void
	password: string
	onPassword: (v: string) => void
	hasPassword: boolean
	removing: boolean
	onRemove: () => void
	canStore: boolean
	errors: [string | undefined, string | undefined]
}) {
	const status = p.removing ? 'will be removed on Save' : p.hasPassword ? 'set' : 'none'
	return (
		<div className="grid grid-cols-2 gap-4 rounded border border-booth-edge p-4">
			<Field label={`${p.label} user`} hint={p.hint} error={p.errors[0]}>
				<Input value={p.user} onChange={p.onUser} />
			</Field>
			<Field
				label={`Password · ${status}`}
				hint={p.canStore ? 'Blank keeps the current one.' : 'This computer cannot protect a password, so none can be saved.'}
				error={p.errors[1]}
			>
				<div className="flex gap-2">
					<div className="flex min-w-0 flex-1 flex-col">
						<Input
							type="password"
							value={p.password}
							onChange={p.onPassword}
							disabled={!p.canStore || p.removing}
							placeholder={p.hasPassword ? '••••••' : ''}
						/>
					</div>
					{p.hasPassword && (
						<button
							type="button"
							onClick={p.onRemove}
							className="h-12 shrink-0 rounded border border-booth-edge px-4 text-sm text-booth-dim active:scale-[0.98]"
						>
							{p.removing ? 'Keep' : 'Remove'}
						</button>
					)}
				</div>
			</Field>
		</div>
	)
}
