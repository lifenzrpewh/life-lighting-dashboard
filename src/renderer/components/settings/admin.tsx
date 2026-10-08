// Settings › Admin: the passcode Admin asks for, and how long Admin lasts
// with nobody touching anything (../../../shared/admin.ts has the rules).
// Only Admin reaches Settings, so changing the passcode needs Admin already;
// the old passcode is not asked again.

import { useEffect, useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'

import { ADMIN_TIMEOUTS_MIN, passcodeError } from '../../../shared/admin.js'
import type { SettingsView } from '../../../shared/settings.js'

import { PasscodeEntry } from '../PasscodeSheet.js'
import { Button, Card, SectionTitle, Segmented } from '../ui.js'
import { DetailHead, type Save } from './parts.js'

export function AdminSettings({ view, save }: { view: SettingsView; save: Save }) {
	return (
		<>
			<DetailHead title="Admin" />
			<Passcode has={view.hasAdminPasscode} save={save} />
			<Timeout minutes={view.adminTimeoutMin} save={save} />
		</>
	)
}

/** Set, change or remove. A new one is typed twice, on the keypad or the
 *  keyboard, so a slip is caught here and not at the next unlock. */
function Passcode({ has, save }: { has: boolean; save: Save }) {
	// null: not setting one. 'new': typing it. A string: typed once, to repeat.
	const [step, setStep] = useState<null | 'new' | { first: string }>(null)
	const [said, setSaid] = useState<{ words: string; bad: boolean } | null>(null)
	const [removing, setRemoving] = useState(false)
	const [keypad, setKeypad] = useState(true)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])

	const typed = async (code: string) => {
		if (step === 'new') {
			const e = passcodeError(code)
			if (e !== null) return setSaid({ words: e, bad: true })
			setKeypad(/^\d+$/.test(code))
			setSaid(null)
			return setStep({ first: code })
		}
		if (step === null) return
		if (code !== step.first) {
			setStep('new')
			return setSaid({ words: 'The two did not match. Type the new passcode again.', bad: true })
		}
		const errors = await save({ adminPasscode: code })
		if (errors !== null) return setSaid({ words: errors.adminPasscode ?? errors.form ?? 'Not saved.', bad: true })
		setStep(null)
		setSaid({ words: 'Saved. Admin asks for it from now on.', bad: false })
	}

	return (
		<Card>
			<SectionTitle aside={has ? 'Set' : undefined}>Passcode</SectionTitle>
			<p className={`text-sm ${has ? 'text-booth-dim' : 'text-booth-ink'}`}>
				{has ? 'Tapping Volunteer asks for it before Admin opens.' : 'No passcode: anyone can tap into Admin.'}
			</p>
			{step === null ? (
				<div className="flex flex-wrap items-center gap-3">
					<Button icon={KeyRound} onClick={() => (setSaid(null), setStep('new'))}>
						{has ? 'Change the passcode' : 'Set a passcode'}
					</Button>
					{has && (
						<Button
							variant={removing ? 'danger' : 'quiet'}
							icon={Trash2}
							onClick={() => {
								if (!removing) return setRemoving(true)
								setRemoving(false)
								void save({ adminPasscode: null }).then((e) =>
									setSaid(e === null ? { words: 'Removed. Anyone can tap into Admin.', bad: false } : { words: e.form ?? 'Not removed.', bad: true }),
								)
							}}
						>
							{removing ? 'Tap again to remove' : 'Remove the passcode'}
						</Button>
					)}
				</div>
			) : (
				<div className="flex flex-col items-start gap-4">
					<p className="text-base">{step === 'new' ? 'Type the new passcode: digits for the keypad, or letters on the keyboard.' : 'Once more, to be sure.'}</p>
					{/* Remounted per step, so the second asks the way the first was typed. */}
					<PasscodeEntry key={step === 'new' ? 'new' : 'again'} keypadFirst={step === 'new' ? true : keypad} submitLabel={step === 'new' ? 'Next' : 'Save'} onSubmit={typed} />
					<Button variant="ghost" onClick={() => (setStep(null), setSaid(null))}>
						Cancel
					</Button>
				</div>
			)}
			{said !== null && <p className={`text-sm ${said.bad ? 'text-state-unreachable' : 'text-state-live'}`}>{said.words}</p>}
			<p className="text-xs leading-relaxed text-booth-faint">
				Forgotten? Close Pāua, open settings.json in its data folder (beside the log), delete the “adminPasscode” entry, and start it
				again: Admin then opens with a tap. Five wrong tries make the screen wait 30 seconds.
			</p>
		</Card>
	)
}

function Timeout({ minutes, save }: { minutes: number; save: Save }) {
	const [error, setError] = useState<string | null>(null)
	return (
		<Card>
			<SectionTitle>Back to volunteer after</SectionTitle>
			<div>
				<Segmented
					label="Back to volunteer after"
					value={String(minutes)}
					onChange={(v) => void save({ adminTimeoutMin: Number(v) }).then((e) => setError(e === null ? null : (e.adminTimeoutMin ?? e.form ?? 'Not saved.')))}
					options={ADMIN_TIMEOUTS_MIN.map((m) => ({ value: String(m), label: `${m} min` }))}
				/>
			</div>
			<p className="text-sm text-booth-dim">
				With no touch or key anywhere, the MA and the run order included, Admin goes back to volunteer by itself. On this computer only.
			</p>
			{error !== null && <p className="text-sm text-state-unreachable">{error}</p>}
		</Card>
	)
}
