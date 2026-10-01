// The booth's sign-in to the Planning Center backend, in Settings (operator
// mode only). It acts at once, unlike the fields above it: pairing is not a
// setting to save, it is a sign-in.
//
// The QR is the Cue Manager's own pairing (visuals-song-comms). An admin
// approves it "As a booth device": the booth then signs in as that device, a
// read-only account scoped to one campus (booth devices, 2026-10-01). Approved
// as yourself instead, the booth would hold your account and your rights.

import { useEffect, useState } from 'react'

import type { BackendStatus, PairingView } from '../../shared/backend.js'

/** Who the booth is signed in as, in words a person can check. A booth
 *  device's email is made up (`device-<uuid>@devices.invalid`, device-manage)
 *  and says nothing, so its name stands alone; a person's name comes with
 *  their email, which is how an operator spots the wrong approval. */
function accountName(name: string | null, email: string | null): string {
	const madeUp = email?.endsWith('@devices.invalid') ?? false
	if (name !== null) return madeUp || email === null ? name : `${name} (${email})`
	if (email !== null && !madeUp) return email
	return madeUp ? 'a booth device' : 'an account with no email'
}

function Pairing({ pairing, now }: { pairing: PairingView; now: number }) {
	switch (pairing.phase) {
		case 'starting':
			return <p className="text-sm text-booth-dim">Asking the backend for a pairing code…</p>
		case 'waiting': {
			const left = Math.max(0, Math.round((pairing.expiresAt - now) / 1000))
			return (
				<div className="flex items-start gap-6">
					{/* An image, never markup: the SVG comes over IPC and is not ours to inject. */}
					<img
						src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairing.qrSvg)}`}
						alt="Pairing QR code"
						className="size-64 rounded bg-white"
					/>
					<div className="flex flex-col gap-2 text-sm">
						<p>Scan with a phone signed in to the Cue Manager as an admin, and approve it As a booth device.</p>
						<p className="text-booth-dim">
							Not as yourself: approved that way, the booth holds your account and your rights.
						</p>
						<p className="tabular-nums text-booth-dim">
							{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
						</p>
					</div>
				</div>
			)
		}
		case 'verifying':
			return <p className="text-sm text-booth-dim">Approved. Signing in…</p>
		case 'expired':
			return <p className="text-sm text-booth-dim">That code expired. Start again for a new one.</p>
		case 'failed':
			return <p className="text-sm text-state-unreachable">{pairing.detail}</p>
	}
}

export function PlanningCenter() {
	const [status, setStatus] = useState<BackendStatus | null>(null)
	// Signing out also drops the cached run order, so the spine goes to `?`
	// until someone pairs again with a phone. One tap must not do that.
	const [confirming, setConfirming] = useState(false)
	// Re-rendered by the poll below each second, which is all the countdown needs.
	const now = Date.now()

	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.backendStatus().then((s) => alive && setStatus(s ?? null))
		poll()
		const id = setInterval(poll, 1000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	const button = 'h-12 rounded border-2 px-6 text-base active:scale-[0.98]'

	return (
		<section className="flex flex-col gap-4 border-t border-booth-edge pt-8">
			<h3 className="text-lg">Planning Center</h3>
			{status === null && <p className="text-sm text-booth-dim">No main process: nothing to sign in.</p>}

			{status?.state === 'unconfigured' && <p className="text-sm text-state-unreachable">{status.detail}</p>}

			{status?.state === 'unpaired' && (
				<>
					<p className="text-sm text-booth-dim">
						This booth is not signed in, so it has no run order. It signs in once, by QR, as a booth device:
						create one for this campus in the Cue Manager (Admin › Booth devices) first.
					</p>
					{status.pairing === null || status.pairing.phase === 'expired' || status.pairing.phase === 'failed' ? (
						<>
							{status.pairing !== null && <Pairing pairing={status.pairing} now={now} />}
							<div>
								<button type="button" onClick={() => window.life?.pairBackend()} className={`${button} border-booth-ink`}>
									Pair this booth
								</button>
							</div>
						</>
					) : (
						<>
							<Pairing pairing={status.pairing} now={now} />
							<div>
								<button type="button" onClick={() => window.life?.cancelPairing()} className={`${button} border-booth-edge`}>
									Cancel
								</button>
							</div>
						</>
					)}
				</>
			)}

			{status?.state === 'paired' && (
				<>
					<p className="text-sm">
						Signed in as {accountName(status.name, status.email)}
						{status.campus !== null && `, reading ${status.campus}`}.
					</p>
					{status.warning !== null && <p className="text-sm text-warn">{status.warning}</p>}
					{confirming ? (
						<div className="flex items-center gap-4">
							<span className="text-sm">The run order goes blank until the booth is paired again.</span>
							<button
								type="button"
								onClick={() => {
									setConfirming(false)
									void window.life?.unpairBackend()
								}}
								className={`${button} border-state-unreachable text-state-unreachable`}
							>
								Sign out
							</button>
							<button type="button" onClick={() => setConfirming(false)} className={`${button} border-booth-edge`}>
								Keep
							</button>
						</div>
					) : (
						<div>
							<button
								type="button"
								onClick={() => setConfirming(true)}
								className={`${button} border-booth-edge text-booth-dim`}
							>
								Sign this booth out…
							</button>
						</div>
					)}
				</>
			)}
		</section>
	)
}
