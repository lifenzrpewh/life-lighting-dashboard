// Admin's passcode, asked for when Volunteer is tapped (../../shared/admin.ts
// has the rules). Stands in the windows' place like every sheet, since a
// native view cannot be drawn over.
//
// Two ways to type it (the owner, 2026-10-08): a keypad Pāua draws itself,
// with keys a finger cannot miss, because the Windows touch keyboard does not
// come up reliably in a kiosk; and a Keyboard switch for a passcode with
// letters, typed into a field. It opens on the keypad when the passcode is
// all digits, on the field otherwise. A keyboard plugged in works on either.
//
// Main checks the passcode and counts the wrong ones; this page only sends
// what was typed and says what main answered, in words.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Delete, LockOpen } from 'lucide-react'

import { waitWords, wrongWords, type UnlockResult } from '../../shared/admin.js'
import { Button, Segmented, Sheet } from './ui.js'

type Style = 'keypad' | 'keyboard'

/** The keypad or the field, and the button that sends what was typed. Used
 *  to unlock, and in Settings › Admin to set a new passcode. */
export function PasscodeEntry({
	keypadFirst,
	disabled = false,
	submitLabel,
	unlock = false,
	onSubmit,
}: {
	keypadFirst: boolean
	/** The button opens the lock: its icon says so. */
	unlock?: boolean
	disabled?: boolean
	submitLabel: string
	/** What was typed. The entry clears once this has answered. */
	onSubmit: (code: string) => Promise<void> | void
}) {
	const [style, setStyle] = useState<Style>(keypadFirst ? 'keypad' : 'keyboard')
	const [code, setCode] = useState('')
	const [busy, setBusy] = useState(false)
	const field = useRef<HTMLInputElement | null>(null)
	const off = disabled || busy

	const submit = async () => {
		if (off || code === '') return
		setBusy(true)
		try {
			await onSubmit(code)
		} finally {
			setBusy(false)
			setCode('')
		}
	}
	// Read by the key handler below, which is set up once per style.
	const latest = useRef({ submit, off })
	latest.current = { submit, off }

	// The keypad takes a plugged-in keyboard's digits too.
	useEffect(() => {
		if (style !== 'keypad') return
		const onKey = (e: KeyboardEvent) => {
			if (latest.current.off) return
			// Typing into a field elsewhere is not typing the passcode.
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
			if (/^\d$/.test(e.key)) setCode((c) => (c.length < 64 ? c + e.key : c))
			else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1))
			else if (e.key === 'Enter') void latest.current.submit()
			else return
			e.preventDefault()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [style])
	useEffect(() => {
		if (style === 'keyboard') field.current?.focus()
	}, [style])

	const press = (d: string) => !off && setCode((c) => (c.length < 64 ? c + d : c))
	// Round keys, as a phone's (the playground's keypad, 2026-10-08).
	const key = 'mx-auto grid size-[4.5rem] animate-pop place-items-center rounded-full bg-booth-raise text-3xl font-semibold tabular-nums transition-[background-color,transform] duration-150 select-none hover:bg-booth-hover active:scale-90 active:bg-booth-hover disabled:opacity-35'

	return (
		<div className="flex w-full max-w-sm flex-col items-stretch gap-4">
			<div className="flex justify-center">
				<Segmented
					label="How to type it"
					value={style}
					onChange={(v) => {
						setStyle(v)
						setCode('')
					}}
					options={[
						{ value: 'keypad', label: 'Keypad' },
						{ value: 'keyboard', label: 'Keyboard' },
					]}
				/>
			</div>
			{style === 'keypad' ? (
				<>
					{/* What has been typed, as dots: how many, never what. */}
					<div aria-live="polite" className="flex h-14 items-center justify-center gap-3 rounded-win bg-booth-bg ring-2 ring-booth-hover ring-inset">
						{code === '' ? (
							<span className="text-base text-booth-faint">Passcode</span>
						) : (
							<span aria-label={`${code.length} typed`} className="flex max-w-full flex-wrap justify-center gap-2.5 px-4">
								{[...code].map((_, i) => (
									<span key={i} className="size-3.5 rounded-full bg-booth-ink" />
								))}
							</span>
						)}
					</div>
					<div className="grid grid-cols-3 gap-3">
						{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
							<button key={d} type="button" disabled={off} onClick={() => press(d)} className={key}>
								{d}
							</button>
						))}
						<button type="button" disabled={off || code === ''} onClick={() => setCode('')} className={`${key} text-base`}>
							Clear
						</button>
						<button type="button" disabled={off} onClick={() => press('0')} className={key}>
							0
						</button>
						<button type="button" aria-label="Delete the last digit" disabled={off || code === ''} onClick={() => setCode((c) => c.slice(0, -1))} className={key}>
							<Delete size={28} strokeWidth={1.7} aria-hidden />
						</button>
					</div>
				</>
			) : (
				<form
					onSubmit={(e: FormEvent) => {
						e.preventDefault()
						void submit()
					}}
				>
					<input
						ref={field}
						type="password"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						disabled={off}
						autoComplete="off"
						spellCheck={false}
						placeholder="Passcode"
						aria-label="Passcode"
						className="h-14 w-full rounded-win bg-booth-bg px-5 text-lg font-bold ring-2 ring-booth-hover ring-inset outline-none placeholder:font-normal placeholder:text-booth-faint focus:ring-accent-hi disabled:opacity-50"
					/>
				</form>
			)}
			<Button variant="primary" icon={unlock ? LockOpen : undefined} disabled={off || code === ''} onClick={() => void submit()} className="h-14 text-lg">
				{submitLabel}
			</Button>
		</div>
	)
}

export function PasscodeSheet({ now, onUnlocked, onClose }: { now: number; onUnlocked: () => void; onClose: () => void }) {
	// Main's word on how to ask: digits or not, and any wait still running.
	const [numeric, setNumeric] = useState<boolean | null>(null)
	const [said, setSaid] = useState<{ words: string; tone: 'wrong' | 'wait' } | null>(null)
	const [waitUntil, setWaitUntil] = useState(0)
	useEffect(() => {
		void window.life?.adminState().then((s) => {
			if (s === undefined) return
			setNumeric(s.numeric)
			if (s.waitMs > 0) setWaitUntil(Date.now() + s.waitMs)
		})
	}, [])

	const waiting = waitUntil > now
	const answer = (r: UnlockResult | undefined) => {
		if (r === undefined) return setSaid({ words: 'The kiosk did not answer.', tone: 'wrong' })
		if (r.ok) return onUnlocked()
		if (r.why === 'wait') {
			setWaitUntil(Date.now() + r.waitMs)
			setSaid(null)
		} else setSaid({ words: wrongWords(r.triesLeft), tone: 'wrong' })
	}

	return (
		<Sheet title="Admin" description="For changing settings, layouts and the show. Enter the passcode." onClose={onClose}>
			<div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6">
				<div className="flex w-full max-w-sm flex-col items-center gap-6">
					<p
						role="status"
						className={`min-h-6 text-center text-base ${waiting ? 'text-state-stale' : said?.tone === 'wrong' ? 'text-state-unreachable' : 'text-booth-dim'}`}
					>
						{waiting ? waitWords(waitUntil - now) : (said?.words ?? 'Enter the passcode for Admin.')}
					</p>
					{numeric !== null && (
						<PasscodeEntry
							keypadFirst={numeric}
							disabled={waiting}
							submitLabel="Unlock"
							unlock
							onSubmit={async (code) => answer(await window.life?.unlockAdmin(code))}
						/>
					)}
				</div>
			</div>
		</Sheet>
	)
}
