// The Creative Guide (../../shared/guide.ts), opened from the top bar into the
// windows' place, as Connections and Layouts are: read, then closed. Main draws
// the page over the body below once it has loaded; this is the frame around it
// and what is said while it is not showing.

import { RotateCw } from 'lucide-react'

import type { EmbedReport } from '../../shared/embeds.js'
import { GUIDE } from '../../shared/guide.js'
import { Centered } from './MaPane.js'
import { EmbedMessage, ZoomControl } from './EmbedPane.js'
import { IconButton, Sheet } from './ui.js'

export function GuideSheet({
	report,
	now,
	boxRef,
	onClose,
}: {
	report: EmbedReport | null
	now: number
	/** The body the page is placed over. */
	boxRef: (el: HTMLElement | null) => void
	onClose: () => void
}) {
	const showing = report?.pane.state === 'showing'
	return (
		<Sheet
			title={GUIDE.name}
			description="In-service creative guide"
			onClose={onClose}
			actions={
				<>
					{report !== null && <ZoomControl name={GUIDE.name} zoom={report.zoom} onZoom={(by) => window.life?.zoomEmbed(GUIDE.id, by)} />}
					{showing && <IconButton icon={RotateCw} label="Reload the guide" onClick={() => window.life?.retryEmbed(GUIDE.id)} />}
				</>
			}
		>
			<div ref={boxRef} className="relative flex min-h-0 min-w-0 flex-1">
				<Centered>
					<EmbedMessage
						name={GUIDE.name}
						pane={window.life === undefined ? null : (report?.pane ?? { state: 'idle', url: GUIDE.url })}
						now={now}
						onRetry={() => window.life?.retryEmbed(GUIDE.id)}
					/>
				</Centered>
			</div>
		</Sheet>
	)
}
