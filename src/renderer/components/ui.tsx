// The pieces every screen is built from, so the whole kiosk reads as one
// instrument: one kind of button, one kind of sheet, one way of saying why
// something is not there. Before these, each screen styled its own, and the
// screen had grown by addition (the owner, 2026-10-05: "starting to feel a bit
// messy").
//
// Touch-sized throughout: nothing tappable is under 40 px, and the main
// controls are 48.
//
// The look since 2026-10-08 (../theme.css): 4 px corners on what is tapped,
// 2 px on what holds things; semibold words on a button, extrabold titles; a
// pressed button and a chosen option take the selected blue, and the one
// thing a sheet is for is the light fill.

import type { ComponentType, ReactNode, SVGProps } from 'react'
import { BookImage, BookOpen, Cast, Webcam, Globe, Layers, LayoutGrid, ListChecks, Megaphone, MonitorPlay, SlidersHorizontal, Timer, X } from 'lucide-react'

import type { Tone } from '../../shared/connections.js'
import { embedIdOf } from '../../shared/embeds.js'
import { ndiIdOf } from '../../shared/ndi.js'
import { captureIdOf } from '../../shared/capture.js'
import type { ViewId } from '../../shared/layout.js'

export type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>

type Variant = 'quiet' | 'primary' | 'ghost' | 'danger' | 'warn'

const variants: Record<Variant, string> = {
	// The default: a raised surface, no border. Most buttons are this.
	quiet: 'bg-booth-raise text-booth-ink hover:bg-booth-hover active:bg-booth-hover',
	// The one thing a sheet is for: Save, Done, Add. Light on dark.
	primary: 'bg-booth-ink text-booth-bg font-bold hover:bg-white active:bg-white',
	// In a strip or a list, where a surface would be one too many.
	ghost: 'text-booth-ink hover:bg-booth-raise active:bg-booth-raise',
	// Takes something away (a second tap confirms, by the caller).
	danger: 'text-state-unreachable ring-2 ring-inset ring-state-unreachable/70 hover:bg-state-unreachable/10',
	// Amber, solid: a write that needs a look. Only for what the theme
	// reserves it for.
	warn: 'bg-warn text-black font-bold hover:brightness-110',
}

/** A toggle that is on: the selected blue, whatever the variant. */
const pressedClass = 'aria-pressed:bg-accent aria-pressed:text-accent-ink aria-pressed:ring-0'

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
			className={`inline-flex shrink-0 items-center justify-center rounded-ctl font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-150 select-none active:scale-95 disabled:pointer-events-none disabled:opacity-35 ${sizes[size]} ${variants[variant]} ${pressedClass} ${className}`}
		>
			{IconC !== undefined && <IconC size={size === 'md' ? 20 : 18} strokeWidth={2} aria-hidden />}
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
			className={`inline-flex shrink-0 items-center justify-center rounded-ctl transition-[background-color,color,transform] duration-150 active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
				size === 'md' ? 'size-12' : 'size-10'
			} ${variants[variant]} ${pressedClass}`}
		>
			<IconC size={size === 'md' ? 20 : 18} strokeWidth={2} aria-hidden />
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
		<span role="radiogroup" aria-label={label} className={`inline-flex rounded-ctl bg-booth-raise p-1 ${disabled ? 'opacity-50' : ''}`}>
			{options.map((o) => (
				<button
					key={String(o.value)}
					type="button"
					role="radio"
					aria-checked={o.value === value}
					disabled={disabled}
					onClick={() => o.value !== value && onChange(o.value)}
					className={`h-10 rounded-[3px] px-5 text-sm font-bold transition-colors duration-150 active:scale-95 ${
						o.value === value ? 'bg-accent text-accent-ink' : 'text-booth-dim hover:text-booth-ink'
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
			{/* A big title top left, the line under it grey: the empty and
			    settings screens of the owner's references. */}
			<div className="flex shrink-0 items-end gap-4 pt-6 pr-3 pb-4 pl-7">
				<h2 className="text-4xl leading-none font-extrabold tracking-tight whitespace-nowrap">{title}</h2>
				{description !== undefined && <p className="min-w-0 truncate pb-0.5 text-[15px] text-booth-dim">{description}</p>}
				<span className="ml-auto flex shrink-0 items-center gap-2 self-start">
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
			<h3 className="text-xl font-extrabold tracking-tight">{children}</h3>
			{aside !== undefined && <span className="text-sm text-booth-dim">{aside}</span>}
		</div>
	)
}

/** A surface that groups things in a sheet. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
	return <section className={`flex flex-col gap-4 rounded-win bg-booth-panel p-6 ${className}`}>{children}</section>
}

/** What a view says when its page or picture is not there: what it is, why,
 *  and what can be done. Always centred in the space the view would fill. */
export function Placeholder({ icon: IconC, head, body, children }: { icon?: Icon; head: string; body?: string; children?: ReactNode }) {
	return (
		<div className="flex max-w-md flex-col items-center px-6 text-center">
			{IconC !== undefined && (
				<span className="mb-5 text-booth-ink">
					<IconC size={52} strokeWidth={1.3} aria-hidden />
				</span>
			)}
			<p className="text-[22px] leading-tight font-extrabold tracking-tight text-balance">{head}</p>
			{body !== undefined && <p className="mt-2 text-[15px] break-words text-booth-dim">{body}</p>}
			{children}
		</div>
	)
}

/** Filled in the state's colour; hollow when the connection is not set up.
 *  It pops as its state changes (keyed on the tone), so a change is seen. */
export function Dot({ tone, size = 'md' }: { tone: Tone; size?: 'sm' | 'md' | 'lg' }) {
	const fill: Record<Tone, string> = {
		live: 'bg-state-live',
		stale: 'bg-state-stale',
		down: 'bg-state-unreachable',
		off: 'ring-2 ring-booth-faint ring-inset',
	}
	return (
		<span
			key={tone}
			aria-hidden
			className={`shrink-0 animate-pop rounded-full ${size === 'lg' ? 'size-3.5' : size === 'md' ? 'size-2.5' : 'size-2'} ${fill[tone]}`}
		/>
	)
}

/** Each view's icon, beside its name on its tab and in the + menu. */
export function viewIcon(view: ViewId): Icon {
	if (embedIdOf(view) !== null) return Globe
	if (ndiIdOf(view) !== null) return Cast
	if (captureIdOf(view) !== null) return Webcam
	switch (view) {
		case 'cue':
			return ListChecks
		case 'ma':
			return SlidersHorizontal
		case 'arena':
			return Layers
		case 'clips':
			return LayoutGrid
		case 'lookbook':
			return BookImage
		case 'announcements':
			return Megaphone
		case 'video':
			return MonitorPlay
		case 'timer':
			return Timer
		case 'guide':
			return BookOpen
		default:
			return Globe
	}
}
