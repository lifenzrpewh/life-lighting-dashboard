# Visuals Dashboard — planning notes (started 2026-10-02)

**Status: planning, nothing built.** From a conversation with the owner. The idea: the
Lighting Dashboard becomes a Visuals Dashboard, where any two views sit side by side
depending on what is running. Lighting is one layout among several.

## Decided so far

- **The slots offer only what is answering.** No layout setting to keep true: a view
  is offered when its source responds (the console link for the MA, Arena's web server
  for Arena, the Cue Manager always). This is the existing "resist configuration" rule.
- **The visuals version runs on the Arena machine itself.** That machine may be a Mac
  or a Windows PC, varying by campus or backup, so every route has to work on both.
- **The Resolume operator's main need is a multiview:** Arena's layers, groups and
  composition, each visible, scaled into a pane.
- **Arena builds the multiview, the dashboard shows one picture.** The MA-native rule
  again: in Arena's Advanced Output, one extra Screen whose slices take Layer / Group
  / Composition as their input source, sent out as a virtual output (Syphon on Mac,
  Spout on Windows). Arena composites on its own GPU; the dashboard receives a single
  feed and scales it, rather than decoding one stream per layer.
- **Google Sheets are for item briefs**, shared around ad hoc today, so nothing yet
  says which brief belongs to which item.

## Researched, not tried

🔬 2026-10-02, from vendor docs and package listings. Nothing here has run.

- **Arena's web server**: Preferences › Web Server, port 8080, all interfaces, API at
  `/api/v1`, a websocket for changes, and a built-in remote page. Off by default, so
  each Arena machine needs it switched on (as each show needs its OSC row). Arena 7.x
  is in use.
- **The API gives status, not pictures of the output**: what is loaded and connected,
  deck and layer names, clip thumbnails, file paths. The video has to come through
  Syphon/Spout (or NDI).
- **Receiving Syphon/Spout in Electron needs a native addon.** Candidates:
  `@napolab/texture-bridge` (Spout and Syphon Metal, one API, actively published),
  `node-syphon` (Mac only). Unproven here; maintenance and packaging into the Windows
  installer are both open.
- **NDI is the fallback** if texture sharing proves fragile: one route on both OSes and
  across machines, but it encodes and decodes on the CPU.

## The risk to measure first

The dashboard would share a GPU with the machine playing the show. Before any feature
depends on the multiview, measure Arena's output frame rate with and without the
dashboard receiving the feed. A dropped frame on the LED wall costs more than anything
the dashboard adds.

## Open questions

- **Briefs:** where should a brief's link live? The candidates were the item in the
  Cue Manager, PCO, sent from a phone on the day, or pasted at the booth. The owner is
  undecided. Until then, a plain web-page slot covers it.
- **Labels on the multiview:** Arena composites the tiles, so the dashboard does not
  know which tile is which layer. Label inside Arena, or read it from somewhere?
- **Firing clips:** is Arena's own remote page wanted as a slot too, or is Arena's own
  UI on the same machine enough?
- **Google sign-in** in an embedded view is often blocked; a brief shared as "anyone
  with the link" avoids it. Do briefs need editing from the booth?
- **The name:** renaming the app and repo, and what a lighting-only station keeps.

## The first spike

On an Arena machine: turn on the web server, build a multiview Screen in Advanced
Output sent over Syphon or Spout, receive it in a bare Electron window with a texture
addon, and measure Arena's frame rate. Then do the same on the other OS.

Related: [LOOKBOOK_CHECK.md](LOOKBOOK_CHECK.md), the parked foregrounds check.
