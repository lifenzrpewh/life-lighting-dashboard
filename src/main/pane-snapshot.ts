// A picture of a native pane, for the renderer to show in its place while the
// divider is dragged.
//
// WHY: resizing a page reflows it, and the MA web remote and the Cue Manager
// each take longer to reflow than a finger takes to move, so a live drag
// trailed behind the finger (the owner, 2026-10-03). While a drag is on, the
// renderer hides the panes and shows these instead, which move as fast as the
// DOM; the live pages come back at their new size on release.
//
// A picture, so it can never be mistaken for the page working: nothing in it
// can be tapped, and it is gone as soon as the finger lifts.

import type { WebContentsView } from 'electron'

/** A JPEG data URL of what the view shows, or null when it shows nothing or
 *  the capture fails: the renderer then leaves that pane live. */
export async function snapshotOf(view: WebContentsView, showing: boolean): Promise<string | null> {
	if (!showing) return null
	try {
		const image = await view.webContents.capturePage()
		return image.isEmpty() ? null : `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`
	} catch {
		return null
	}
}
