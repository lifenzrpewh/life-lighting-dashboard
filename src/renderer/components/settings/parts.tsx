// The pieces Settings and the Connections list are built from: a row in a
// list, a detail's heading, a row's own Save, and the tones a status is drawn in.
// Split out of ConnectionsPanel.tsx on 2026-10-08, when Connections became a
// list everyone reads and Settings the place Admin changes things.

import { useState, type ReactNode } from 'react'
import { ChevronRight, FolderOpen, Save as SaveIcon } from 'lucide-react'

import type { Tone } from '../../../shared/connections.js'
import type { SettingsField, SettingsPatch } from '../../../shared/settings.js'

import { Field, Input } from '../form.js'
import { Button, Segmented } from '../ui.js'

export type Errors = Partial<Record<SettingsField, string>>
/** Null on success; otherwise what went wrong, per field. */
export type Save = (patch: SettingsPatch) => Promise<Errors | null>

/** One line in the list: what it is, its state in a word, its address. */
export function ListRow({
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
			className={`group relative grid min-h-16 w-full grid-cols-[1.25rem_1fr_auto] items-center gap-3.5 rounded-ctl px-4 py-2 text-left transition-[background-color,transform] duration-150 active:scale-[0.99] ${
				selected ? 'bg-accent text-accent-ink' : 'hover:bg-booth-raise'
			}`}
		>
			<span className="flex justify-center">{lead}</span>
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate text-base font-bold">{title}</span>
				<span className={`mt-0.5 truncate text-sm ${selected ? '[&_*]:!text-accent-ink/80' : ''}`}>{sub}</span>
			</span>
			{aside !== null && (
				<span className={`max-w-40 truncate text-xs ${selected ? 'text-accent-ink/80' : 'text-booth-dim'} ${struck ? 'line-through opacity-60' : ''}`}>{aside}</span>
			)}
		</button>
	)
}

export function DetailHead({ title, status, address = null }: { title: string; status?: ReactNode; address?: string | null }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h3 className="text-3xl font-extrabold tracking-tight">{title}</h3>
			{status}
			{address !== null && <span className="text-[15px] font-medium text-booth-dim">{address}</span>}
		</div>
	)
}

export function Empty({ children }: { children: ReactNode }) {
	return <div className="flex flex-1 items-center justify-center text-booth-dim">{children}</div>
}

export const toneText: Record<Tone, string> = {
	live: 'text-state-live',
	stale: 'text-state-stale',
	down: 'text-state-unreachable',
	off: 'text-booth-dim',
}

export const tonePill: Record<Tone, string> = {
	live: 'bg-state-live/12 text-state-live',
	stale: 'bg-state-stale/12 text-state-stale',
	down: 'bg-state-unreachable/12 text-state-unreachable',
	off: 'bg-booth-raise text-booth-dim',
}

/** Whether this booth uses a connection. Off keeps the address but stops
 *  asking, leaves the dot alone, and takes its views and chips off the screen. */
export function OnOff({ on, onSet }: { on: boolean; onSet: (on: boolean) => void }) {
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
export function Editor({
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
					icon={SaveIcon}
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

export type Err = (field: SettingsField) => string | undefined

/** The fields a booth rarely changes (ports, MA's own names), folded away
 *  under one line that says what they hold. Opens by itself when one of them
 *  is not the usual, or the last Save found fault with one, so nothing set
 *  differently is ever out of sight. */
export function Advanced({
	summary,
	changed,
	errors,
	children,
}: {
	/** What the fields hold now, in a few words: shown folded. */
	summary: string
	/** One of them is not its usual value. */
	changed: boolean
	errors: ReadonlyArray<string | undefined>
	children: ReactNode
}) {
	const [open, setOpen] = useState(changed)
	const shown = open || errors.some((e) => e !== undefined)
	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				onClick={() => setOpen(!shown)}
				aria-expanded={shown}
				className="flex min-h-10 items-center gap-2 self-start text-sm font-bold text-booth-dim hover:text-booth-ink"
			>
				<ChevronRight size={16} aria-hidden className={`transition-transform ${shown ? 'rotate-90' : ''}`} />
				Advanced
				<span className="font-normal">{summary}</span>
			</button>
			{shown && <div className="flex flex-col gap-4 border-l-2 border-booth-edge pl-4">{children}</div>}
		</div>
	)
}

/** An address, and its port folded under Advanced: the port is the program's
 *  own default nearly everywhere. */
export function HostPort(p: {
	err: Err
	host: string
	port: string
	onHost: (v: string) => void
	onPort: (v: string) => void
	hostField: SettingsField
	portField: SettingsField
	hostLabel: string
	portHint: string
	defaultPort: number
	placeholder?: string
	/** Beside the address: a Find, say. */
	aside?: ReactNode
}) {
	return (
		<>
			<Field label={p.hostLabel} error={p.err(p.hostField)}>
				<span className="flex min-w-0 gap-2">
					<span className="min-w-0 flex-1">
						<Input value={p.host} onChange={p.onHost} placeholder={p.placeholder ?? 'not used'} mono />
					</span>
					{p.aside}
				</span>
			</Field>
			<Advanced summary={`port ${p.port.trim() || p.defaultPort}`} changed={p.port.trim() !== String(p.defaultPort)} errors={[p.err(p.portField)]}>
				<Field label="Port" error={p.err(p.portField)} hint={p.portHint}>
					<Input value={p.port} onChange={p.onPort} inputMode="numeric" />
				</Field>
			</Advanced>
		</>
	)
}

/** A folder, typed or picked with Windows' own folder picker (the owner's
 *  ask, 2026-10-05). Picking only fills the field; Save keeps it. */
export function FolderInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
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
