// The Creative Guide (the owner, 2026-10-05): LIFE's in-service creative guide,
// a public Notion page, to be read at the booth. A button on the top bar, not
// a window: it is read through now and then, not kept beside the MA. The owner
// first tried it as an embed in a window and took it out again.
//
// Fixed, not a setting: every campus reads the same guide, and a page no show
// can describe is still one address for all of LIFE. It is an embed of main's
// own (../main/embeds.ts): its own session, links that leave it open in the
// computer's browser, zoom remembered, never in Connections.

import type { Embed } from './embeds.js'

export const GUIDE: Embed = {
	id: 'guide',
	name: 'Creative Guide',
	url: 'https://lifenz.notion.site/IN-SERVICE-CREATIVE-GUIDE-2f989cd50f3080129783ef46d5d5687a',
	on: true,
}
