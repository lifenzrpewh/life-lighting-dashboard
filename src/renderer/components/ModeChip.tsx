// The mode button. A closed lock while volunteer, an open one in nacre in
// Admin. Tap it as volunteer and Admin asks for its passcode
// (./PasscodeSheet.tsx), or opens at once when none is set; tap it in Admin
// to go back to volunteer. A 3-second hold until 2026-10-08 (the owner: a
// passcode, since a hold kept out a palm and never a person).
//
// Entering Admin reveals, it never acts: tapping this changes what is on
// screen and sends nothing to the console.

import { Lock, LockOpen } from 'lucide-react'

import type { Mode } from '../mode.js'

export function ModeChip({
	mode,
	onEnter,
	onLeave,
	compact = false,
	bare = false,
	asking = false,
}: {
	mode: Mode
	/** Volunteer tapped: ask for the passcode, or go in when none is set. */
	onEnter: () => void
	onLeave: () => void
	/** The folded bar's size: the same button, smaller. */
	compact?: boolean
	/** The bar is short of room: the lock alone, no word. */
	bare?: boolean
	/** The passcode sheet is open. */
	asking?: boolean
}) {
	const admin = mode === 'operator'
	return (
		<button
			type="button"
			onClick={() => (admin ? onLeave() : onEnter())}
			aria-label={admin ? 'Admin. Tap to go back to volunteer.' : 'Volunteer mode. Tap for Admin.'}
			aria-pressed={asking || undefined}
			title={admin ? 'Tap to go back to volunteer' : 'Tap for Admin'}
			className={`relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg font-medium transition-colors active:scale-[0.97] ${
				compact ? (bare ? 'size-8' : 'h-8 w-28 text-xs') : bare ? 'size-12' : 'h-12 w-36 text-sm'
			} ${admin ? 'nacre-tint nacre-ring text-booth-ink' : asking ? 'bg-booth-hover text-booth-ink ring-1 ring-booth-dim/40 ring-inset' : 'bg-booth-raise text-booth-dim hover:text-booth-ink'}`}
		>
			{admin ? <LockOpen size={compact ? 15 : 18} strokeWidth={1.9} aria-hidden /> : <Lock size={compact ? 15 : 18} strokeWidth={1.9} aria-hidden />}
			{!bare && (admin ? 'Admin' : 'Volunteer')}
		</button>
	)
}
