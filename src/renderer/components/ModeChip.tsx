// The mode button. Hold 3 seconds to become the operator; tap once to stop.
// A closed lock while volunteer, an open one in nacre while operator.
//
// Entering operator mode reveals, it never acts: holding this changes what is
// on screen and sends nothing to the console.

import { useRef, useState } from 'react'

import { Lock, LockOpen } from 'lucide-react'

import { HOLD_MS, type Mode } from '../mode.js'

export function ModeChip({ mode, onEnter, onLeave }: { mode: Mode; onEnter: () => void; onLeave: () => void }) {
	const [holding, setHolding] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	// The mode the press began in. A hold that completes flips the chip to
	// OPERATOR under the finger, and the release that follows is a click on it:
	// without this, finishing the hold would immediately undo it.
	const pressedIn = useRef<Mode>(mode)
	const pressedAt = useRef(0)

	const cancel = () => {
		if (timer.current !== null) clearTimeout(timer.current)
		timer.current = null
		setHolding(false)
	}

	return (
		<button
			type="button"
			onPointerDown={() => {
				pressedIn.current = mode
				pressedAt.current = Date.now()
				if (mode !== 'volunteer') return
				setHolding(true)
				timer.current = setTimeout(() => {
					cancel()
					onEnter()
				}, HOLD_MS)
			}}
			// The timer normally elevates while the finger is still down. But a
			// timer can run late (Chromium throttles a window it thinks is hidden),
			// so a release after a full hold counts too: a completed hold must
			// never be silently lost.
			onPointerUp={() => {
				const held = timer.current !== null && Date.now() - pressedAt.current >= HOLD_MS
				cancel()
				if (held) onEnter()
			}}
			onPointerLeave={cancel}
			onPointerCancel={cancel}
			onClick={() => pressedIn.current === 'operator' && onLeave()}
			// A long press on a touchscreen opens a context menu. Not here.
			onContextMenu={(e) => e.preventDefault()}
			aria-label={mode === 'operator' ? 'Operator mode. Tap to go back to volunteer.' : 'Volunteer mode. Hold for 3 seconds for operator mode.'}
			title={mode === 'operator' ? 'Tap to go back to volunteer' : 'Hold for 3 seconds for operator mode'}
			className={`relative inline-flex h-12 w-36 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg text-sm font-medium transition-colors ${
				mode === 'operator' ? 'nacre-tint nacre-ring text-booth-ink' : 'bg-booth-raise text-booth-dim hover:text-booth-ink'
			}`}
		>
			{holding && (
				<span
					aria-hidden
					className="nacre-line absolute inset-0 origin-left opacity-35"
					style={{ animation: `hold-fill ${HOLD_MS}ms linear forwards` }}
				/>
			)}
			<span className="relative flex items-center gap-2">
				{mode === 'operator' ? <LockOpen size={18} strokeWidth={1.9} aria-hidden /> : <Lock size={18} strokeWidth={1.9} aria-hidden />}
				{mode === 'operator' ? 'Operator' : holding ? 'Keep holding…' : 'Volunteer'}
			</span>
		</button>
	)
}
