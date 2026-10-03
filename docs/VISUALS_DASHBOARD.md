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
  `node-syphon` (Mac only). Chosen and working on Windows since 2026-10-03: § The video
  feed, below.
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
   stops. Seen in the kiosk on a looping generator, then (2026-10-03) on VFX 1's 39.27 s
   video at the VFX group's 1.795×: `0:21` two seconds after connecting, down a second a
   second to `0:01`, then `0:00 held` under Play Once & Hold, and the row empty once Play
   Once & Clear cleared it at ~22 s. A video Arena has not drawn a thumbnail for has
   `is_default: true` and a blank dummy image; that reads as no thumbnail. The status-bar chip is not built: undecided whether it is wanted.
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
5. **The video feed** (2026-10-03, § The video feed below). A **Video** view in either
   slot or popped out, seen showing Arena's Spout output at 8 bits. Arena at 16 bits
   (High Detail) needs a converter first; the multiview layout itself is Arena's to build.
6. **Brief slot.** Waits on where a brief's link lives.
7. Later: the trigger screen, and the rename.

## The video feed (2026-10-03, Windows box)

A **Video** view, offered in the pickers once a Spout (Windows) or Syphon (macOS)
sender is publishing on the machine, the way Arena is offered once its web server
answers. With several senders a picker in the slot's strip chooses; with one, it is
shown. `src/main/video-feed.ts` receives, `src/renderer/components/VideoView.tsx` draws,
`src/shared/video-feed.ts` says what a stopped picture looks like.

**The route, all on the GPU.** `@napolab/texture-bridge` 0.15.0 (MIT, one maintainer,
prebuilt Node-API binary, no install script; pinned exactly) opens the sender's texture
in main and mints a handle per frame. Electron 44's `sharedTexture` (experimental)
imports it and sends it to the page, where the preload gets a `VideoFrame` and hands it
across the context bridge (which carries `VideoFrame` without copying it) to a canvas.
The pages keep `sandbox`, `contextIsolation` and no Node: the addon's own high-level
receiver wants a page with Node and no isolation, so its low-level calls are used
instead. The installer unpacks the addon (`asarUnpack`), since a `.node` cannot load
from inside the app archive.

✅ **Seen, against a stand-in** (`spikes/spout-test-sender.cjs`, a hidden Electron page
publishing a moving counter and clock; the addon cannot publish raw pixels on Windows):
the picture live in the right slot, popped out, and back, 24-26 fps from a ~28 fps
sender.

**What the addon does that the code allows for:**
- `receiveSharedTexture()` **throws** while no sender is connected, rather than
  returning null.
- Its new-frame check said yes **162 times a second** for a 30 fps sender, so the feed
  is capped (`MIN_FRAME_MS`) or the page redraws repeats as fast as the loop turns.

**What it costs (per process, GPU Engine counters, 10 s each).** This laptop renders on
its NVIDIA RTX 4070 while its screen hangs off the Intel chip, so every redraw of the
2560×1600 kiosk is copied across on the NVIDIA's copy engine:

| Kiosk showing | Kiosk GPU (copy engine) |
|---|---|
| nothing moving (feed hidden) | 0 – 0.6% |
| the feed, 26-49 fps | 9 – 21% |
| an 8 px square moving at 60 fps, feed hidden | 39% |

So the cost is the rate the window redraws, not the feed, and the feed is capped at
**30 fps**, enough to watch a multiview by. Arena held 15-18% of the same GPU throughout.
⚠️ A desktop with its screens on the graphics card should not pay the copy at all, not
measured. Arena's own output frame rate with the feed on is **the number still missing**.

### From Arena (2026-10-03, Arena 7.28, show OH2026)

✅ The owner turned on a Spout screen in Advanced Output; Arena published it as
**`Arena - <screen name>`** (`Arena - OH YEAh`, then `Arena - Composition` too), 1920×1080.

- **High Detail decides whether it shows.** The composition's `highdetail` (Arena's 16
  bits a channel; the OH2026 title bar reads "3840 x 2160, 16bpc") makes the Spout
  texture DXGI format 11, `R16G16B16A16_UNORM`. The addon refuses it ("Unsupported
  DXGI_FORMAT for shared texture: 11"), and Electron's import takes only `bgra`, `rgba`
  and `rgbaf16` anyway. The view says so in words (`plainVideoFailure`). With the owner's
  go-ahead, High Detail was switched off over the API (`PUT /composition`
  `{"highdetail":{"value":false}}`) for the test and back on after: at 8 bits the texture
  is `bgra` and the **picture showed in the Video view, ~27 fps**, pixel for pixel what
  Arena sent (185,515 lit pixels in both; Arena's dim logo, the composition's video
  opacity being 0).
- **The owner's call: 8-bit is fine for now, 16-bit preferred.** So the route stays, and
  16-bit needs a converter: the addon's own CPU readback does take format 11 (it hands
  back 8-bit RGBA) but took **41 ms a frame** at 1080p, too slow for main; the real fix is
  a GPU conversion in the addon's Windows receiver (C++ behind Rust; no toolchain on
  this box).
- **Arena never marks a frame new**: the new-frame check said yes 1250 times in 3 s. The
  30 fps cap is what holds the load, and Arena's frame rate cannot be counted through
  Spout.
- **What receiving costs Arena** (two rounds, 10 s each, the view on then off): about
  **+5 to 6 points on its GPU copy engine and +1 to 2 on its 3D engine**; its CPU readings
  swung too much to read. Its output frame rate is not visible from outside Arena and
  is still to watch, in Arena, with the view on and off.
- **A covered window costs nothing.** With Arena in front, the kiosk's own GPU use read
  0% while receiving: Chromium does not redraw a window nobody can see.

### Picking a source, and sizing the picture (2026-10-03, the owner's asks)

- **The source list is the dashboard's own.** A native `<select>` would not take a pick
  on the booth's touchscreen (the owner); it is now a button opening big rows, like
  every other control here. ✅ Picked between Arena's sender and the stand-in.
- **The strip says how the picture fits:** `1282×722 → 1970×1460 · 154%` is the sender's
  size, the space it is drawn in (screen pixels, so what Arena's screen would need to
  fill it exactly), and the scale it is drawn at. The whole picture always shows.
- **Fit gives the space the picture's shape**, rather than Arena a new resolution. In a
  slot it moves the divider, within the slots' limits (the left slot's 320 px minimum
  stopped a 16:9 picture filling a tall right slot on this 16:10 screen). In a pop-out it
  sizes the window to the picture's shape and holds it while resized. ✅ Pop-out
  1263×784 → 1393×784 for a 1282×722 picture.

**The advice on resolution** (to the owner, 2026-10-03): set Arena's multiview screen
once, to the space where it is watched most, read off the strip; then let Fit bring the
dashboard to the picture rather than changing Arena. Bigger than the space costs GPU and
is scaled down; smaller is scaled up and soft. A popped-out window on a second monitor
gives the most room, so that monitor's size is the natural choice.

### 16-bit: LIFE's build of the addon (2026-10-03)

`native/texture-bridge/life-16bit.patch` makes the addon's Windows receiver draw a
texture Electron cannot import into a BGRA8 one with a one-texel shader pass (the GPU
converts as it writes), instead of copying it and having the format refused. 8-bit and
half-float senders are copied as before. With no build tools on the booth box (no admin),
`.github/workflows/texture-bridge.yml` builds it on GitHub's Windows runners, upstream and
Spout2 pinned, and commits the binary to the `texture-bridge-build` branch; the kiosk
loads `vendor/texture-bridge/` when present. `native/texture-bridge/README.md` has the
steps. Also seen in the code: the addon's CPU readback copies a 16-bit texture's rows as
if 8-bit, so its pixels for High Detail were never right either; the patch leaves that
path alone.

✅ **Proven against a 16-bit stand-in, 2026-10-03** (Arena's High Detail was off and
left alone). `spikes/spout-16bit-sender.cs` publishes an `R16G16B16A16_UNORM` texture
the way Spout2 does, built with the C# compiler Windows already has (no SDK, no admin).
Its picture is chosen so every 8-bit value is known: a 16-bit `v×257` converts to
exactly `v`.
- **The control:** npm's addon refuses it with Arena's own words, "Unsupported
  DXGI_FORMAT for shared texture: 11". LIFE's build hands back `bgra`.
- **In the kiosk**, read off the Video view's canvas: the four patches came back
  `(255,0,0) (0,128,0) (0,0,64) (200,200,200)`, exactly, so no channel is swapped, and
  the ramp read 0, 64, 128, 191, 255 at its quarters. 27-28 fps under the 30 cap.
- **A sender changing size** (killed at 1280×720, back at 1920×1080) was picked up and
  converted, every patch still exact: the staging texture and its render target are
  rebuilt.
- **The packaged app carries it too**: built with `electron-builder --win --dir` (the
  installer's contents, nothing installed), it loaded the binary from
  `app.asar.unpacked/vendor/texture-bridge/` and read the same four patches exactly.
- While the picked sender was gone the view showed Arena's (the first by name), and
  went back to the picked one when it returned. That is the rule as written in
  `src/main/video-feed.ts`; whether a booth would rather see "gone" is a question.

**Why the new-frame check always says yes** (it said so 1250 times in 3 s from Arena):
Spout's frame counting is a per-user setting, `HKCUSoftwareLeading EdgeSpout`
`Framecount`, off unless set (SpoutSettings sets it), and this box has no such key. With
it off, `GetNewFrame` answers yes every time (`SpoutFrameCount.cpp`), whatever the
sender does. So it is not Arena failing to mark frames; the 30 fps cap is what holds the
load either way. Turning it on is a machine setting for Arena and the kiosk both, not
tried.

**Arena's frame rate cannot be read from outside it either** (2026-10-03). The
composition's `framerate` (0-1000) is the **target**, not a measurement: subscribed for
8 s it pushed once, 50, and every GET reads 50. With Spout's frame counting off too, the
output rate with the Video view on is read in Arena's own window or not at all.

**Still to do:** watch Arena's own output for dropped frames with the Video view on; lay
out the real multiview in Arena (slices taking Layer / Group / Composition); then macOS
(Syphon needs `Syphon.framework` bundled and signed, per the addon's docs).

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

## Pop a view out (owner's idea and answers, 2026-10-03; built the same day)

Any slot's view can pop out into a floating window of its own: **Pop out** in the
slot's strip. Closing that window, by its **Back to the dashboard** button or the
system's own close, puts the view back. `src/shared/popout.ts` has the rules,
`src/main/popout.ts` the windows.

**The owner's answers:**
- **The slot keeps the view's place** and says "popped out", with **Bring back**. The
  layout never changes by itself.
- **Anywhere, always on top**: one screen or two. On one, it floats over the kiosk; with
  a second display it opens there.
- **All three views.** The MA and the run order move into the window page and all (the
  MA stays logged in, a half-typed note survives); Arena is drawn again in the window.

**Decided in building, for the owner to overrule:**
- **Mode** stays the kiosk's: the MA in a pop-out follows the mode chip and the idle drop.
- **A kiosk reload or crash brings every view home**, as it drops to volunteer mode.
- **A restart starts with every view in its slot.** Each window's place and size is
  remembered per machine (`popouts.json` in the app's data folder) for the next pop-out,
  and only while its top edge is still on a display; otherwise it opens centred on a
  display other than the kiosk's, or on the kiosk's when there is one.
- **A pane takes its place only from the window it is in**, so the kiosk and a pop-out
  never fight over the MA.

✅ Seen in the kiosk on the Windows box, 2026-10-03, driven over the debugging port:
each of the three popped out and came back; the run order kept its page and the MA its
login across the move (no new `since`, no second load); a kiosk reload closed an open
pop-out and the view came home. A page that closes its own window skips Electron's
`close` event, so the view going home is also done on `closed` (it had stayed listed
as out). ⚠️ Not yet tried by a finger on the touchscreen, nor on a second display, nor
on macOS (where on-top over a full-screen space is set but unseen).

## Open questions

- **Briefs:** where should a brief's link live? The candidates were the item in the
  Cue Manager, PCO, sent from a phone on the day, or pasted at the booth. The owner is
  undecided. Until then, a plain web-page slot covers it.
- **The rename:** the new name, and what a lighting-only station keeps.

## The first spike

On an Arena machine: turn on the web server, build a multiview Screen in Advanced
Output sent over Syphon or Spout, receive it in a bare Electron window with a texture
addon, and measure Arena's frame rate. Then do the same on the other OS. Receiving is
done (§ The video feed); Arena's side and its frame rate are what is left.

Related: [LOOKBOOK_CHECK.md](LOOKBOOK_CHECK.md), the parked foregrounds check.
