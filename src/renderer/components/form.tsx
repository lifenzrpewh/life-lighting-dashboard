// The few form pieces the Connections tab is built from. Touch-sized: every
// control is at least 48 px tall, because this is a booth screen, not a desk.

import { useEffect, useState, type ReactNode } from 'react'

/** Not parsed leniently: "80 80" must be an error, not 80. */
export const portOf = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: ReactNode }) {
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

export function Input({
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

export function Select({
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
export function useProPresenterNames(): string[] | null {
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

export function User(p: {
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
