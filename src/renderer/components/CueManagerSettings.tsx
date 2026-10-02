// The Cue Manager's sign-out, in its Connections row (operator mode only).
//
// The app signs itself in, in its own column: an emailed code, or its own QR,
// which an admin approves as a booth device. All this panel can do is undo
// that, for when the booth is signed in as the wrong account or the app has
// got itself into a state a reload does not clear.

import { useState } from 'react'

export function CueManagerSettings() {
	// Clearing drops the sign-in and any notes still waiting to send. One tap
	// must not do that.
	const [confirming, setConfirming] = useState(false)
	const [cleared, setCleared] = useState(false)
	const button = 'h-12 rounded border-2 px-6 text-base active:scale-[0.98]'

	return (
		<section className="flex flex-col gap-4">
			{confirming ? (
				<div className="flex flex-wrap items-center gap-4">
					<span className="text-sm">
						This signs the Cue Manager out here and forgets everything it kept, including notes not yet sent.
					</span>
					<button
						type="button"
						onClick={() => {
							setConfirming(false)
							void window.life?.resetCuePane().then((ok) => setCleared(ok === true))
						}}
						className={`${button} border-state-unreachable text-state-unreachable`}
					>
						Sign out and clear
					</button>
					<button type="button" onClick={() => setConfirming(false)} className={`${button} border-booth-edge`}>
						Keep
					</button>
				</div>
			) : (
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => {
							setCleared(false)
							setConfirming(true)
						}}
						className={`${button} border-booth-edge text-booth-dim`}
					>
						Sign the Cue Manager out…
					</button>
					{cleared && <span className="text-sm text-state-live">Cleared. It is ready to sign in again.</span>}
				</div>
			)}
		</section>
	)
}
