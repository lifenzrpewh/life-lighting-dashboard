// The pieces Settings and the Connections list are built from. Split out of
// ConnectionsPanel.tsx on 2026-10-08, when Connections became a list everyone
// reads and Settings the place Admin changes things.
//
// The layout since 2026-10-15 (the owner: the settings "visually don't feel
// like much has changed"; a grouped list, label-and-field pages, one Save bar,
// help behind a ?): a page is its header (name, state, address, the On/Off
// switch, ?), then rows of a label on the left and its field on the right,
// nothing else. What explains a field is help, shown when ? is tapped; what
// went wrong is always shown, under its field. Typed fields wait for the Save
// bar, which appears only once something on the page has changed; a switch or
// a choice of options takes effect when tapped.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { CircleHelp, FolderOpen, RotateCcw, Save as SaveIcon } from 'lucide-react'

import type { Tone } from '../../../shared/connections.js'
import type { SettingsField, SettingsPatch } from '../../../shared/settings.js'

import { Input } from '../form.js'
import { Button } from '../ui.js'

export type Errors = Partial<Record<SettingsField, string>>
/** Null on success; otherwise what went wrong, per field. */
export type Save = (patch: SettingsPatch) => Promise<Errors | null>
export type Err = (field: SettingsField) => string | undefined

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

/** A group's heading in the list down the left. */
export function NavGroup({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="px-3 pt-3 pb-1 text-xs font-bold tracking-wide text-booth-faint">{title}</span>
			{children}
		</div>
	)
}

/** One line in the list: what it is, and a word or an address on the right. */
export function NavRow({
	selected,
	onClick,
	lead,
	title,
	aside = null,
	dim = false,
}: {
	selected: boolean
	onClick: () => void
	lead?: ReactNode
	title: string
	aside?: ReactNode
	dim?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={selected}
			className={`flex min-h-12 w-full items-center gap-3 rounded-ctl px-3 text-left transition-colors duration-150 ${
				selected ? 'bg-accent text-accent-ink' : 'hover:bg-booth-raise'
			} ${dim && !selected ? 'text-booth-dim' : ''}`}
		>
			{lead !== undefined && <span className="flex w-4 shrink-0 justify-center">{lead}</span>}
			<span className="min-w-0 flex-1 truncate text-base font-bold">{title}</span>
			{aside !== null && <span className={`max-w-44 shrink-0 truncate text-xs ${selected ? 'text-accent-ink/80' : 'text-booth-dim'}`}>{aside}</span>}
		</button>
	)
}

/** A page's own heading, for the pages that are not a connection (Holding). */
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

/** On or off, as one switch. */
export function Switch({ on, onSet, label }: { on: boolean; onSet: (on: boolean) => void; label: string }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			onClick={() => onSet(!on)}
			className="flex h-12 shrink-0 items-center gap-3 rounded-ctl px-2 text-sm font-bold text-booth-dim hover:text-booth-ink"
		>
			{on ? 'On' : 'Off'}
			<span className={`relative h-7 w-12 rounded-full transition-colors duration-150 ${on ? 'bg-accent' : 'bg-booth-raise ring-1 ring-booth-edge ring-inset'}`}>
				<span className={`absolute top-1 size-5 rounded-full bg-booth-ink transition-[left] duration-150 ${on ? 'left-6' : 'left-1'}`} />
			</span>
		</button>
	)
}

const HelpShown = createContext(false)

/** What explains a field or a page: shown only once the page's ? is tapped. */
export function Help({ children }: { children: ReactNode }) {
	return useContext(HelpShown) ? <p className="max-w-prose text-sm leading-relaxed text-booth-dim">{children}</p> : null
}

/** A page: its header, and its rows. `on` puts the On/Off switch in the
 *  header; `help` the ? that shows every <Help> on the page. */
export function Page({
	title,
	status,
	address = null,
	on,
	help = false,
	children,
}: {
	title: string
	status?: { tone: Tone; words: string; detail?: string | null }
	address?: string | null
	on?: { value: boolean; set: (on: boolean) => void }
	help?: boolean
	children: ReactNode
}) {
	const [shown, setShown] = useState(false)
	return (
		<HelpShown.Provider value={shown}>
			<div className="flex flex-1 flex-col gap-6">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<h3 className="text-3xl font-extrabold tracking-tight">{title}</h3>
					{status !== undefined && (
						<span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm ${tonePill[status.tone]}`}>
							{status.words}
							{status.detail != null && <span className="text-booth-dim">· {status.detail}</span>}
						</span>
					)}
					{address !== null && <span className="text-[15px] font-medium text-booth-dim">{address}</span>}
					<span className="ml-auto flex items-center gap-1">
						{help && (
							<button
								type="button"
								aria-pressed={shown}
								aria-label={shown ? 'Hide the help' : 'Show the help'}
								onClick={() => setShown(!shown)}
								className={`grid size-12 place-items-center rounded-ctl transition-colors ${shown ? 'bg-accent text-accent-ink' : 'text-booth-dim hover:bg-booth-raise hover:text-booth-ink'}`}
							>
								<CircleHelp size={22} aria-hidden />
							</button>
						)}
						{on !== undefined && <Switch on={on.value} onSet={on.set} label={`${title} used at this booth`} />}
					</span>
				</div>
				{on !== undefined && !on.value && <p className="text-sm text-booth-dim">Off at this booth: not asked, not in the dot, and its views are hidden.</p>}
				{children}
			</div>
		</HelpShown.Provider>
	)
}

/** One setting: its label on the left, its field on the right, what went
 *  wrong under the field, and its help under that while ? is on. */
export function Row({ label, error, help, children }: { label: string; error?: string | undefined; help?: ReactNode; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-x-6">
			<span className="flex min-h-12 items-center text-base font-medium text-booth-dim">{label}</span>
			<div className="flex min-w-0 flex-col gap-1.5">
				{children}
				{error !== undefined && <span className="text-sm text-state-unreachable">{error}</span>}
				{help !== undefined && <Help>{help}</Help>}
			</div>
		</div>
	)
}

/** A group of rows under a quiet heading, inside one page. */
export function Rows({ title, children }: { title?: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			{title !== undefined && <h4 className="border-b border-booth-edge pb-2 text-sm font-bold tracking-wide text-booth-faint">{title}</h4>}
			{children}
		</section>
	)
}

/** An address and its port on one line. */
export function AddressPort(p: {
	host: string
	port: string
	onHost: (v: string) => void
	onPort: (v: string) => void
	placeholder?: string
	aside?: ReactNode
}) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<span className="min-w-0 flex-1">
				<Input value={p.host} onChange={p.onHost} placeholder={p.placeholder ?? 'not used'} mono />
			</span>
			<span className="text-booth-faint">port</span>
			<span className="w-28 shrink-0">
				<Input value={p.port} onChange={p.onPort} inputMode="numeric" />
			</span>
			{p.aside}
		</span>
	)
}

/** A folder, typed or picked with the system's own folder picker (the owner's
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

/** A page's typed fields as drafts: what they were when the page opened,
 *  what they are now, which differ, and back to how they were. */
export function useDraft<T extends Record<string, string | boolean>>(initial: T) {
	const [start, setStart] = useState(initial)
	const [draft, setDraft] = useState(initial)
	const changed = (Object.keys(start) as (keyof T)[]).filter((k) => draft[k] !== start[k])
	return {
		draft,
		set: <K extends keyof T>(k: K, v: T[K]) => setDraft((d) => ({ ...d, [k]: v })),
		changed,
		revert: () => setDraft(start),
		/** After a Save: what is there now is what the page holds. */
		settle: () => setStart(draft),
	}
}

/** A page's Save: its fields, handed what the last Save said about each, and
 *  the Save bar along the foot once something has changed, naming what. One
 *  page's fields only: saving OnTime never re-sends the console's. */
export function Editor({
	save,
	patch,
	changes,
	onRevert,
	onSaved,
	note,
	children,
}: {
	save: Save
	patch: () => SettingsPatch
	/** What has changed, in the words of its labels. Empty: no bar. */
	changes: readonly string[]
	onRevert: () => void
	/** The page now holds what was saved (`useDraft`'s settle). */
	onSaved?: () => void
	/** Said after a Save, such as what reconnects. */
	note?: string
	children: (err: Err) => ReactNode
}) {
	const [errors, setErrors] = useState<Errors>({})
	const [saved, setSaved] = useState(false)
	const failing = Object.keys(errors).length > 0
	return (
		<>
			{children((field) => errors[field])}
			{(changes.length > 0 || saved || errors.form !== undefined) && (
				<div className="sticky bottom-0 mt-auto -mx-2 flex flex-wrap items-center gap-3 rounded-ctl bg-booth-raise px-4 py-3 ring-1 ring-booth-edge ring-inset">
					<span className="min-w-0 flex-1 text-sm">
						{errors.form !== undefined ? (
							<span className="text-state-unreachable">{errors.form}</span>
						) : changes.length > 0 ? (
							<>
								<span className="font-bold">{changes.length === 1 ? '1 change' : `${changes.length} changes`}</span>
								<span className="text-booth-dim">: {changes.join(', ')}</span>
								{failing && <span className="text-state-unreachable"> · not saved, see above</span>}
							</>
						) : (
							<span className="text-state-live">Saved.{note === undefined ? '' : ` ${note}`}</span>
						)}
					</span>
					{changes.length > 0 && (
						<>
							<Button
								variant="ghost"
								icon={RotateCcw}
								onClick={() => {
									setErrors({})
									onRevert()
								}}
							>
								Revert
							</Button>
							<Button
								variant="primary"
								icon={SaveIcon}
								onClick={() =>
									void save(patch()).then((e) => {
										setErrors(e ?? {})
										setSaved(e === null)
										if (e === null) onSaved?.()
									})
								}
								className="px-7"
							>
								Save
							</Button>
						</>
					)}
				</div>
			)}
		</>
	)
}
