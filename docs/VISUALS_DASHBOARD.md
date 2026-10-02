# Visuals Dashboard — planning notes (started 2026-10-02)

**Status: pieces 1 and 2 built (2 as data only), the rest planned.** From a conversation with the owner. The idea: the
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
  null. Its `position` advances only while connected.
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

So piece 2 takes structure (which clip is where, its name and thumbnail) from each
composition push, and levels from subscriptions. Each push is 1.3 MB to parse, so it
belongs in main, never the renderer, and only the summary crosses.

## The pieces, in order (agreed 2026-10-02)

1. ✅ **Arena link.** A row in Connections, `Arena 7.28`, offered only when set up.
2. ✅ **Live status, the data** (2026-10-03). What plays on each layer (name, thumbnail
   path, a missing file), layer and group faders and bypass, composition master, deck,
   over the websocket: `src/bridge/arena-live.ts` (decoder, tested against the real
   composition) and `src/main/arena.ts` (the socket, resubscribing on every reconnect).
   Read against Arena 7.28 on the Windows box, in Node, not yet inside the kiosk.
   **Nothing on screen yet, by the owner's choice:** it waits for piece 4's slots. Until
   then the kiosk log says what plays, once per change (`[arena] playing: PLAYBACK Solid
   Color`). Still unseen: a fader update while a clip connects, a deck switch, and a
   layer during a transition (the first connected clip is taken).
3. **Clip countdown.** Time left on the clip playing in PLAYBACK, in the countdown chip,
   hidden when nothing plays, red past zero. Needs a video file seen in `transport` first:
   what a Loop reports is not a countdown.
4. **Two-slot layout.** Any two views side by side, offering only what answers.
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
