# Visuals Dashboard — planning notes (started 2026-10-02)

**Status: pieces 1, 2 and 4 built, the rest planned.** From a conversation with the owner. The idea: the
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

## Seen on Arena (2026-10-02, Arena 7.28.0, Windows)

✅ observed with `curl` and a websocket listener on the Windows box. The shipped code
reads only `/api/v1/product` so far.

- **`GET /api/v1/product`** → `{"name":"Arena","major":7,"minor":28,"micro":0,"revision":24303}`.
  The link check (`src/bridge/arena.ts`, `src/main/arena.ts`), every 2 s.
- **`GET /api/v1/composition` is 1.27 MB.** 10 layers, 9 columns, 2 decks, 3 layer groups.
  Far too heavy to poll; fetched once at most.
- **LIFE's layers mirror the lighting vocabulary:** PRE & POST, HOLD BG, PLAYBACK, HOLD FG,
  VFX 1–6 (show "OH2026", deck "TILL THE WALLS").
- **A clip** carries `connected` (`Empty` · `Disconnected` · `Previewing` · `Connected` ·
  `Connected & previewing`), a `thumbnail` path (`/api/v1/composition/clips/by-id/<id>/thumbnail`),
  and, once connected, `transport`: `position` in **milliseconds** (`max` = duration × 1000),
  `controls.duration` in **seconds**, `playmode` (`Loop` · `Bounce` · `Random` ·
  `Play Once & Clear` · `Play Once & Hold`), `playdirection`, `speed`. An empty clip's
  `transport` is null. Only a generator (Solid Color) was seen connected, not a video file.
- **The websocket, `ws://<host>:8080/api/v1`:** on connect it sends the whole composition
  once (the same 1.27 MB), then `sources_update` and `effects_update`, then **nothing** while
  idle, even with a clip playing.
- **Values come by subscription:** `{"action":"subscribe","parameter":"/parameter/by-id/<id>"}`
  → one `parameter_subscribed`, then `parameter_update` at the composition frame rate,
  **~50/s** for a clip's position. Coalesce before the renderer, as channel B does.
## Seen on Arena (2026-10-03, same box, show OH2026)

✅ `spikes/arena-listen.mjs`, two listeners at once (one subscribed, one not), while
the owner's go-ahead let the REST API connect and clear a clip on VFX 4 with its fader
at 0, and move that fader to 0.5 and back. Everything was put back as found.

- **A clip connecting or clearing is pushed unasked, as the whole composition.** About
  0.3 s after the change, every listener gets the full ~1.3 MB again, subscribed or not.
  A clear pushes it even when nothing visible changed, and so does a change of which clip
  is previewed (selected).
- **A fader is not pushed unasked.** A layer master moving 0 → 0.5 → 0 produced no
  composition and nothing else for the unsubscribed listener; the subscribed one got one
  `parameter_update` per move.
- **A clip's `connected` is a parameter like any other.** Subscribing to its id gives a
  small `parameter_update` (`"Connected"`, `"Disconnected"`, …) ~0.1 s before the
  composition push. Subscribing to `connected`, every layer's `master` and `bypassed`,
  the composition master and each deck's `selected` took 112 subscriptions, all answered
  at once with their current values.
- **`connected` mixes two facts:** what plays and what is in Arena's preview monitor.
  Selecting another clip turned PLAYBACK's `Connected & previewing` into `Connected`.
  Read `Connected` and `Connected & previewing` alike as playing.
- **A loaded clip carries `transport` even when disconnected**; only an empty slot's is
  null. Its `position` can move while disconnected (next section), so a countdown reads
  it only for a connected clip.
- **A missing file is said:** `video.fileinfo.exists: false` (VFX 4's
  `I:\VFX Media Renamed\…` is not on this box), with `duration_ms: 0`. Connecting such a
  clip returns `204` and does nothing; it only selects it.
- **Connecting by REST needs a press and a release:** `POST
  /composition/clips/by-id/<id>/connect` with body `true`, then `false`. With no body it
  only selected the clip. `POST /composition/layers/by-id/<id>/clear` disconnects a layer;
  `POST /composition/clips/by-id/<id>/select` puts a clip back in the preview.
- **Parameter ids held across the pushes**, so a subscription made from one composition
  still means the same thing after the next. Not yet tried: whether they survive Arena
  reopening the composition. Assume not, and resubscribe on every reconnect.

## Seen on Arena: a video clip's transport (2026-10-03, port 8090)

✅ `spikes/arena-transport.mjs`, read-only, while the owner played
`MicrosoftTeams-video.mp4` (39.27 s, 30 fps) on VFX 1, column 1, through Loop, Play
Once & Hold and Play Once & Clear. Arena's web server had moved to **8090**, off the MA
web remote's 8080.

- **`position` is in milliseconds of the clip**, `max` 39270 = `duration` 39.27 s ×
  1000. The file's own `duration_ms` is 39318: the transport's duration, not the
  file's, is the one that ends.
- **It is pushed ~100 times a second** to a subscriber (the composition `framerate` reads
  50), so it is coalesced before anything reaches the renderer, as channel B is.
- **It runs at the group's speed, not the clock's.** Connected on VFX 1 it advanced
  1.795 s per second, and a Loop pass took 21.9 s, not 39.27. The layer group VFX has
  `speed` 1.795 (A SCREENS 0.578, HOLDING 1, composition 1, the clip's own 1). So time
  left is `(max − position) ÷ (clip × group × composition speed)`, never `max − position`.
- **Connecting restarts it** (`playmodeaway` `Restart`): position to 0 within the same
  0.1 s as `connected` changed.
- **Loop** wraps to ~0 at the end and carries on, with no other message.
- **Play Once & Hold** stops at the end (38.15 s seen 0.5 s before) and position stops
  being pushed: nothing changes, so nothing is sent. The clip stays `Connected`.
- **Play Once & Clear** disconnects at the end: `connected` → `Disconnected`, then a
  composition push 0.4 s later. Position stayed at the end for 4.6 s, then went to 0.
- **A disconnected clip's position moved at 1×** before it was first connected, and
  looped (the clip was likely in Arena's preview). Not understood; the countdown ignores
  position on any clip that is not connected.
- **`transporttype` is `Timeline`.** A BPM-synced clip would report otherwise and is
  not seen yet.

So piece 2 takes structure (which clip is where, its name and thumbnail) from each
composition push, and levels from subscriptions. Each push is 1.3 MB to parse, so it
belongs in main, never the renderer, and only the summary crosses.

## The pieces, in order (agreed 2026-10-02)

1. ✅ **Arena link.** A row in Connections, `Arena 7.28`, offered only when set up.
2. ✅ **Live status, the data** (2026-10-03). What plays on each layer (name, thumbnail
   path, a missing file), layer and group faders and bypass, composition master, deck,
   over the websocket: `src/bridge/arena-live.ts` (decoder, tested against the real
   composition) and `src/main/arena.ts` (the socket, resubscribing on every reconnect).
   Read against Arena 7.28 on the Windows box, in the kiosk too (2026-10-03). On screen
   since piece 4 as the Arena view (`src/renderer/components/ArenaView.tsx`): layers top
   of the stack first as in Arena's own panel, under their groups, thumbnails through
   main on an `arena:` scheme (`src/main/arena-thumbnails.ts`), because the page allows
   no remote origins. The kiosk log also says what plays, once per change. Still unseen: a fader update while a clip connects, a deck switch, and a
   layer during a transition (the first connected clip is taken).
3. ✅ **Time left, on every layer** (2026-10-03). Changed from the plan's one chip for
   PLAYBACK by the owner: the Arena view (and later the single-screen trigger screen)
   needs one per layer. Each connected clip's row shows its time left in real time,
   `(length − position) ÷ (clip × group × composition speed)` (`clipTime` in
   `src/shared/arena.ts`): a loop counts to its loop point, marked ↻; Play Once & Hold
   at its end reads `0:00 held`; paused says so; Random and a clip off the timeline show
   none. Main subscribes to a clip's transport while it plays and unsubscribes when it
   stops. Seen in the kiosk on a looping generator; the owner's video counting down is
   still to watch. The status-bar chip is not built: undecided whether it is wanted.
4. ✅ **Two slots** (2026-10-03). Left and right each pick Run order, MA or Arena
   (`src/shared/layout.ts` has the rules, the owner's answers below). The MA counts as
   answering when the link is live or its web remote has loaded. The native views are
   placed from a spot that never unmounts, so moving the MA between slots moves it
   without logging in again (watched: no reconnect in the log). Reload sits in each
   view's strip; ↻ MA left the status bar for it. The console banner shows only while a
   slot holds the MA. Seen in the kiosk on the Windows box, driven over the debugging
   port while the owner was away: the pickers, Arena with its thumbnail, MA moved left,
   the fold, and the layout remembered. Then the owner on the touchscreen, the same
   day: "seems good". Dragging the divider trailed the finger, so it now drags pictures
   of the pages (`src/main/pane-snapshot.ts`), pinned to the window edge with the page's
   edge colour filling the room a growing slot opens: "feels good".
5. **Multiview spike** (below). Riskiest; independent of 1–4.
6. **Brief slot.** Waits on where a brief's link lives.
7. Later: the trigger screen, and the rename.

## The risk to measure first

The dashboard would share a GPU with the machine playing the show. Before any feature
depends on the multiview, measure Arena's output frame rate with and without the
dashboard receiving the feed. A dropped frame on the LED wall costs more than anything
the dashboard adds.

## Answered (owner, 2026-10-02)

- **Labels on the multiview:** not needed; if wanted, they are done in Arena.
- **Firing clips:** not normally, because the Arena op runs two monitors. Later, an
  optional trigger screen that mimics a basic Arena interface, for single-screen
  operation.
- **Briefs are view-only at the booth.** Editing happens on a laptop, so no Google
  sign-in in the kiosk; a brief shared as "anyone with the link" is enough.
- **Rename the app and repo**: yes. Not done yet.

## Answered (owner, 2026-10-03): the two slots

- **Both slots pick.** Left and right each have a picker: Run order, MA, Arena, and
  later others. A view is in one slot at a time; picking the one the other slot holds
  swaps them.
- **A view that stops answering stays, and says so.** The screen never rearranges
  itself under a volunteer. "Only what answers" is what the picker offers, not what a
  slot keeps.
- **Everyone picks**, not only operator mode: an Arena op and a lighting op can each get
  their view.
- **Each machine remembers its layout** across a restart, as it does the run order's
  width.

## Proposed, not built: pop a view out (owner, 2026-10-03)

The owner's ask: pop a slot's view out into a floating window of its own; closing
that window puts the view back in the slots. Noted for discussion before building.

**What makes it feasible.** The MA and the Run order are `WebContentsView`s, and a
view can be moved to another window's `contentView` without reloading, so the MA
would stay logged in and a half-typed note would survive, as they already do when a
view changes slots. The Arena view is React, so a pop-out would be a second renderer
window showing only that view, polling main as the kiosk does.

**To decide first:**
- **What the slot does meanwhile.** Show "Popped out" with a Bring back button (the
  layout unchanged), or let the slot take another view, and on close send the view to
  where it came from or to whichever slot is free?
- **Covering the kiosk.** On a single touchscreen a floating window sits over the
  kiosk, against the rule that nothing covers the MA. On a second monitor (the Arena
  op's two-screen setup) it is the real use. Allow pop-out only with a second display,
  or anywhere?
- **Always on top, and full-screen.** The kiosk is full-screen; a window that falls
  behind it is lost to a volunteer with no taskbar. Probably always-on-top, with its own
  close button big enough for a finger.
- **Mode.** The MA in a pop-out must still follow operator mode and the idle drop back to
  volunteer, from the kiosk's mode chip.
- **Restarts.** Remember a pop-out's display and size per machine, as the layout is, and
  reopen it popped out? And a renderer crash or reload of the kiosk: does the pop-out
  close (its view returning) or stay?
- **Which views.** All three, or the MA only?

## Open questions

- **Briefs:** where should a brief's link live? The candidates were the item in the
  Cue Manager, PCO, sent from a phone on the day, or pasted at the booth. The owner is
  undecided. Until then, a plain web-page slot covers it.
- **The rename:** the new name, and what a lighting-only station keeps.

## The first spike

On an Arena machine: turn on the web server, build a multiview Screen in Advanced
Output sent over Syphon or Spout, receive it in a bare Electron window with a texture
addon, and measure Arena's frame rate. Then do the same on the other OS.

Related: [LOOKBOOK_CHECK.md](LOOKBOOK_CHECK.md), the parked foregrounds check.
