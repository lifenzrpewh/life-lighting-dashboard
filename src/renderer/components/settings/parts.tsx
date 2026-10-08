// The pieces Settings and the Connections list are built from: a row in a
// list, a detail's heading, a row's own Save, and the tones a status is drawn in.
// Split out of ConnectionsPanel.tsx on 2026-10-08, when Connections became a
// list everyone reads and Settings the place Admin changes things.

import { useState, type ReactNode } from 'react'
import { FolderOpen, Save as SaveIcon } from 'lucide-react'

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
