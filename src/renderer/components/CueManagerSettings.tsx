// The Cue Manager's sign-out, in its Connections row (operator mode only).
//
// The app signs itself in, in its own column: an emailed code, or its own QR,
// which an admin approves as a booth device. All this panel can do is undo
// that, for when the booth is signed in as the wrong account or the app has
// got itself into a state a reload does not clear.

import { useState } from 'react'
import { LogOut } from 'lucide-react'

import { Button } from './ui.js'

export function CueManagerSettings() {
	// Clearing drops the sign-in and any notes still waiting to send. One tap
	// must not do that.
	const [confirming, setConfirming] = useState(false)
	const [cleared, setCleared] = useState(false)

	return (
		<section className="flex flex-col gap-4">
			{confirming ? (
				<div className="flex flex-wrap items-center gap-4">
					<span className="text-sm">
						This signs the Cue Manager out here and forgets everything it kept, including notes not yet sent.
					</span>
					<Button
						variant="danger"
						icon={LogOut}
						onClick={() => {
							setConfirming(false)
							void window.life?.resetCuePane().then((ok) => setCleared(ok === true))
						}}
					>
						Sign out and clear
					</Button>
					<Button onClick={() => setConfirming(false)}>Keep</Button>
				</div>
			) : (
				<div className="flex items-center gap-4">
					<Button
						icon={LogOut}
						onClick={() => {
							setCleared(false)
							setConfirming(true)
						}}
					>
						Sign the Cue Manager out…
					</Button>
					{cleared && <span className="text-sm text-state-live">Cleared. It is ready to sign in again.</span>}
				</div>
			)}
		</section>
	)
}
