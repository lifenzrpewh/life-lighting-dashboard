// The edge between the two slots, which a finger can drag.
//
// Drag to resize the left slot; drag nearly shut and let go to fold it away;
// tap twice to put it back to a phone's width. The fold and open buttons stay:
// this is a second way, never the only one.
//
// THE CATCH, AND WHY IT HOLDS: either slot may hold a native view main draws over
// the window, and a pointer that wanders over one would normally be that view's.
// A press keeps every move until it lifts (pointer capture, and the platform's
// own capture of a held button or a touch), so a drag that overshoots into
// either pane still reaches this.

import { useRef, useState } from 'react'

import { FOLD_BELOW_PX } from '../leftWidth.js'

export function Divider({
	width,
	onStart,
	onDrag,
	onDone,
	onFold,
	onReset,
}: {
	width: number
	/** A finger went down: a drag may follow. It ends in `onDone` or `onFold`. */
	onStart: () => void
	/** Every step of a drag, with the width the finger is asking for. */
	onDrag: (px: number) => void
	/** The drag ended here. */
	onDone: (px: number) => void
	onFold: () => void
	onReset: () => void
}) {
	const start = useRef<{ x: number; width: number } | null>(null)
	const [dragging, setDragging] = useState(false)
	const [folding, setFolding] = useState(false)

	const wantedAt = (clientX: number) => (start.current === null ? width : start.current.width + clientX - start.current.x)

	const end = (clientX: number) => {
		if (start.current === null) return
		const px = wantedAt(clientX)
		start.current = null
		setDragging(false)
		setFolding(false)
		if (px < FOLD_BELOW_PX) onFold()
		else onDone(px)
	}

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Drag to resize the left slot"
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId)
				start.current = { x: e.clientX, width }
				setDragging(true)
				onStart()
			}}
			onPointerMove={(e) => {
				if (start.current === null) return
				const px = wantedAt(e.clientX)
				setFolding(px < FOLD_BELOW_PX)
				onDrag(px)
			}}
			onPointerUp={(e) => end(e.clientX)}
			onPointerCancel={(e) => end(e.clientX)}
			onDoubleClick={onReset}
			onContextMenu={(e) => e.preventDefault()}
			className="group relative flex w-4 shrink-0 cursor-col-resize touch-none items-center justify-center bg-booth-panel"
		>
			{/* The line, and a grip in its middle a finger can find. */}
			<span
				className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${
					folding ? 'bg-booth-dim/40' : dragging ? 'bg-booth-ink' : 'bg-booth-edge group-hover:bg-booth-dim'
				}`}
			/>
			<span
				className={`relative h-12 w-1.5 rounded-full ${
					folding ? 'bg-booth-dim/40' : dragging ? 'bg-booth-ink' : 'bg-booth-edge group-hover:bg-booth-dim'
				}`}
			/>
		</div>
	)
}
