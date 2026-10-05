// The pieces every screen is built from, so the whole kiosk reads as one
// instrument: one kind of button, one kind of sheet, one way of saying why
// something is not there. Before these, each screen styled its own, and the
// screen had grown by addition (the owner, 2026-10-05: "starting to feel a bit
// messy").
//
// Touch-sized throughout: nothing tappable is under 40 px, and the main
// controls are 48.

import type { ComponentType, ReactNode, SVGProps } from 'react'
import { BookImage, Cast, GalleryHorizontalEnd, Globe, Layers, LayoutGrid, ListChecks, MonitorPlay, SlidersHorizontal, X } from 'lucide-react'

import type { Tone } from '../../shared/connections.js'
import { embedIdOf } from '../../shared/embeds.js'
import { ndiIdOf } from '../../shared/ndi.js'
import type { ViewId } from '../../shared/layout.js'

export type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>

type Variant = 'quiet' | 'primary' | 'ghost' | 'danger' | 'warn'

const variants: Record<Variant, string> = {
	// The default: a raised surface, no border. Most buttons are this.
	quiet: 'bg-booth-raise text-booth-ink hover:bg-booth-hover active:bg-booth-hover',
	// The one thing a sheet is for: Save, Done, Add. Light on dark.
	primary: 'bg-booth-ink text-booth-bg font-semibold hover:bg-white active:bg-white',
	// In a strip or a list, where a surface would be one too many.
	ghost: 'text-booth-dim hover:bg-booth-raise hover:text-booth-ink active:bg-booth-raise',
	// Takes something away (a second tap confirms, by the caller).
	danger: 'text-state-unreachable ring-1 ring-inset ring-state-unreachable/60 hover:bg-state-unreachable/10',
	// Amber: only for what the theme reserves it for.
	warn: 'text-warn ring-1 ring-inset ring-warn/70 hover:bg-warn/10',
}

const sizes = { md: 'h-12 px-5 text-base gap-2.5', sm: 'h-10 px-4 text-sm gap-2' }

export function Button({
	children,
	onClick,
	variant = 'quiet',
	size = 'md',
	icon: IconC,
	disabled = false,
	pressed,
	label,
	className = '',
	type = 'button',
}: {
	children?: ReactNode
	onClick?: () => void
	variant?: Variant
	size?: 'md' | 'sm'
	icon?: Icon
	disabled?: boolean
	/** A toggle's state, for a button that stays on. */
	pressed?: boolean
	/** Said to a screen reader in place of the words, when they are short. */
	label?: string
	className?: string
	type?: 'button' | 'submit'
}) {
	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			aria-pressed={pressed}
			aria-label={label}
			className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35 ${sizes[size]} ${variants[variant]} ${className}`}
		>
			{IconC !== undefined && <IconC size={size === 'md' ? 20 : 18} strokeWidth={1.8} aria-hidden />}
			{children}
		</button>
	)
}

/** A button that is only an icon: always labelled, for a screen reader and
 *  for a tooltip under a mouse. */
export function IconButton({
	icon: IconC,
	label,
	onClick,
	size = 'md',
	variant = 'ghost',
	pressed,
	disabled = false,
}: {
	icon: Icon
	label: string
	onClick: () => void
	size?: 'md' | 'sm'
	variant?: Variant
	pressed?: boolean
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			disabled={disabled}
			className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35 ${
				size === 'md' ? 'size-12' : 'size-10'
			} ${variants[variant]}`}
		>
			<IconC size={size === 'md' ? 20 : 18} strokeWidth={1.8} aria-hidden />
		</button>
	)
}

/** One of a few, side by side: On / Off, Full screen / Window. */
export function Segmented<T extends string | boolean>({
	options,
	value,
	onChange,
	disabled = false,
	label,
}: {
	options: ReadonlyArray<{ value: T; label: string }>
	value: T
	onChange: (v: T) => void
	disabled?: boolean
	label: string
}) {
	return (
		<span role="radiogroup" aria-label={label} className={`inline-flex rounded-lg bg-booth-bg p-1 ring-1 ring-booth-edge ring-inset ${disabled ? 'opacity-50' : ''}`}>
			{options.map((o) => (
				<button
					key={String(o.value)}
					type="button"
					role="radio"
					aria-checked={o.value === value}
					disabled={disabled}
					onClick={() => o.value !== value && onChange(o.value)}
					className={`h-10 rounded-md px-5 text-sm font-medium transition-colors ${
						o.value === value ? 'bg-booth-raise text-booth-ink shadow-sm' : 'text-booth-dim hover:text-booth-ink'
					}`}
				>
					{o.label}
				</button>
			))}
		</span>
	)
}

/** Every screen that stands in the windows' place (Connections, Layouts, the
 *  showfile) has this frame: a title, one line of what it is for, its own
 *  actions, and ✕ always in the same corner. */
export function Sheet({
	title,
	description,
	actions,
	onClose,
	children,
}: {
	title: ReactNode
	description?: ReactNode
	actions?: ReactNode
	onClose: () => void
	children: ReactNode
}) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 animate-rise flex-col bg-booth-bg">
			<div className="flex h-16 shrink-0 items-center gap-4 border-b border-booth-edge bg-booth-panel pr-2 pl-6">
				<h2 className="text-xl font-medium whitespace-nowrap">{title}</h2>
				{description !== undefined && <p className="min-w-0 truncate text-sm text-booth-dim">{description}</p>}
				<span className="ml-auto flex shrink-0 items-center gap-2">
					{actions}
					<IconButton icon={X} label="Close" onClick={onClose} />
				</span>
			</div>
			{children}
		</div>
	)
}

/** A heading inside a sheet or card. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
	return (
		<div className="flex items-baseline gap-3">
			<h3 className="text-base font-medium">{children}</h3>
			{aside !== undefined && <span className="text-sm text-booth-dim">{aside}</span>}
		</div>
	)
}

/** A surface that groups things in a sheet. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
	return <section className={`flex flex-col gap-4 rounded-xl bg-booth-panel p-5 ring-1 ring-booth-edge ring-inset ${className}`}>{children}</section>
}

/** What a view says when its page or picture is not there: what it is, why,
 *  and what can be done. Always centred in the space the view would fill. */
export function Placeholder({ icon: IconC, head, body, children }: { icon?: Icon; head: string; body?: string; children?: ReactNode }) {
	return (
		<div className="flex max-w-md flex-col items-center px-6 text-center">
			{IconC !== undefined && (
				<span className="mb-4 grid size-14 place-items-center rounded-2xl bg-booth-raise text-booth-dim">
					<IconC size={26} strokeWidth={1.6} aria-hidden />
				</span>
			)}
			<p className="text-lg font-medium text-balance">{head}</p>
			{body !== undefined && <p className="mt-2 text-sm break-words text-booth-dim">{body}</p>}
			{children}
		</div>
	)
}

/** Filled in the state's colour; hollow when the connection is not set up. A
 *  soft halo on the live and the down, so the dot reads at arm's length. */
export function Dot({ tone, size = 'md' }: { tone: Tone; size?: 'sm' | 'md' }) {
	const fill: Record<Tone, string> = {
		live: 'bg-state-live shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-state-live)_18%,transparent)]',
		stale: 'bg-state-stale',
		down: 'bg-state-unreachable shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-state-unreachable)_20%,transparent)]',
		off: 'ring-[1.5px] ring-booth-dim ring-inset',
	}
	return <span aria-hidden className={`shrink-0 rounded-full ${size === 'md' ? 'size-2.5' : 'size-2'} ${fill[tone]}`} />
}

/** Each view's icon, beside its name on its tab and in the + menu. */
export function viewIcon(view: ViewId): Icon {
	if (embedIdOf(view) !== null) return Globe
	if (ndiIdOf(view) !== null) return Cast
	switch (view) {
		case 'cue':
			return ListChecks
		case 'ma':
			return SlidersHorizontal
		case 'arena':
			return Layers
		case 'clips':
			return LayoutGrid
		case 'holding':
			return GalleryHorizontalEnd
		case 'lookbook':
			return BookImage
		case 'video':
			return MonitorPlay
		default:
			return Globe
	}
}
