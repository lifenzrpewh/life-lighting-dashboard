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
- **Connecting by REST is one POST with no body** (corrected 2026-10-04): `POST
  /composition/clips/by-id/<id>/connect`, Arena's "short click". It connected 66 of 66
  VFX clips, selected or not, and the same on a column. Body `true` then `false` only
  selected an unselected clip and left a selected one previewing; this note said the
  opposite on 2026-10-03, from a test that did not let Arena settle between steps. `POST /composition/layers/by-id/<id>/clear` disconnects a layer;
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
7. ✅ **The trigger screen: the Clips view** (2026-10-04). Arena's grid, highest layer
   first: tap a clip, fire a column, Clear a layer, drag its fader; everyone may.
   `src/renderer/components/ClipsView.tsx` draws it, `src/bridge/arena-control.ts` is
   the only thing that writes to Arena: four requests built from templates, every id
   checked against the composition main holds, never the endpoints that empty a slot
   (`/clips/…/clear`) or a layer (`/clearclips`), which a test enforces. What plays is
   read back from Arena's next push, never drawn because it was tapped. An empty
   column is not offered (Arena fires a column by stopping every layer empty in it,
   so an empty one is a blackout), and nothing fires while Arena is stale. Each fire
   is in the kiosk log (`[arena] fired: Solid Color on VFX 3`). ✅ In the kiosk on the
   Windows box, by clicks: the first tap on each of four layers played, Clear stopped
   it, VFX 4's fader went to 62% and back to 0; Arena left as found.
   ✅ **The missing-media check**: every clip whose file Arena cannot find, in amber
   above the Arena and Clips views, with layer, column and path, and `FILE MISSING` on
   its cell. ⚠️ Unit-tested only: this composition has no missing file to show.
8. ✅ **The rename to Pāua** (2026-10-04). ASCII `paua` wherever it becomes a path
   (package, data folder, exe, installer), "Pāua" where people read it. The data
   folder moves whole on the first run, so the Cue Manager sign-in and sealed
   passwords survive: ✅ on the Windows box, the real profile moved (23 entries), the
   Cue Manager still signed in, and a throwaway operator password still opened after
   a second move. A copy of the old folder dated 2026-10-03 4:38 pm appeared beside
   it after the first move, origin unknown (perhaps the installed copy's); nothing
   reads it, and it was left. The GitHub repo rename is the owner's to approve.

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

✅ **From Arena at 16 bpc, 2026-10-04** (High Detail on, set and watched by the owner): the
Video view showed Arena's Spout output, 1920×1080 at 27 fps, no failure, through LIFE's
build. The stock addon refuses a 16-bit texture outright, so a picture at all is the
conversion working. The sender's own format is not logged, so that it arrived 16-bit rests
on Arena's setting.

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

✅ **Arena keeps its rate with the view on, 2026-10-04** (same box, 16 bpc, owner reading
Arena's own display): 50 fps, its target, with the Video view off, and still 50 with it on
and pulling 1920×1080 at 26 fps. Arena and the kiosk share this machine's GPU, so this is
the case the booth will have.

**Tearing on fades, and 60 fps (2026-10-05).** The owner: the view "freaks out when fading
down full screen things and takes a second to update". The addon copied every frame into one
staging texture and handed it on after a plain `Flush`: the next copy could land while the
page still drew the last, and the page could open a frame not yet copied. `life-ring.patch`
(`native/texture-bridge/README.md`) keeps three in turn with a GPU fence, waited on after
Arena's texture is let go; the kiosk allows 60 fps only with that build. ✅ Built by the
workflow (run 37242740953) and loaded on this box against Arena's `MULTIVIEW` (1920×1080, 16
bpc): **47-48 fps, up from 27**, Arena's own target being 50; no frame slower than 250 ms to
reach the page (the log now says when one is). ⚠️ Not yet watched by the owner during a
full-screen fade, nor Arena's own frame rate with the view at this rate.

**Still freezing on Arena's fades to black (the owner, 2026-10-05, afternoon):** "holding
frames and taking ages to update". Not reproduced without Arena: `spikes/video-lag/` is a
stand-in sender fading the whole 1920×1080 picture white to black at 50 fps with its clock in
the corner, and a receiver through the shipped feed. ✅ Standalone: 47 fps at the page, ~65 ms
late, no gap over 30 ms. ✅ In the kiosk (the sender picked over CDP, the canvas read back): 41
picture changes a second, ~55 ms late. ✅ Arena's `MULTIVIEW` idle through the receiver: 47 fps,
no gap over 23 ms. So the feed keeps up with a full-screen fade; what differs during Arena's is
Arena. **Each 5 s with a stall now says where, in `paua.log`:** `[video] in the last 5 s:` the
kiosk's main process busy, the sender sending nothing, or a slow take (main's half), and `[video]
the page, in the last 5 s:` the longest wait between frames, without drawing, and the slowest
draw (the page's, only while it is on screen). Next: the owner fades to black, taps MARK, and the
lines around the mark name the half that stalls.

Marks 1 (a BG fade) and 2 (an FG fade), 13:28: **no stall line by either**, so frames kept
arriving and being drawn. The owner: Arena's own output and its built-in multiview stay clear.
A 16-bit stand-in (Arena's High Detail format) came through the ring build's conversion with
47.6 of 48 frames a second new pictures. A 3-minute watch of Arena's `MULTIVIEW` at 13:44
read it two ways, the shipped GPU path and the addon's CPU copy (`--cpu`, which bypasses it):
in each of the three changes Arena made (13:44:53, 13:45:53, 13:46:55) **both saw the picture
change in the same seconds**. The CPU copy slows the receiver it shares (about 20 fps, the
kiosk meanwhile 48), so its rates are not the kiosk's.

**Found and fixed, 2026-10-05, 14:00: Arena's picture carries alpha.** The owner's video: the
fade starts in Pāua, then holds, a pink strip of the old picture left under the new one, while
Arena's own multiview is clean. A layer fading out goes **transparent**, not black, and the Video
view drew each frame over the last on its canvas, where a transparent pixel draws nothing. Every
stand-in until then was opaque. ✅ Reproduced with `spikes/video-lag/sender.cjs --alpha` (a colour
whose alpha fades): frame alpha 251 to 4, canvas held at 220. ✅ Fixed by drawing each frame on
black (`VideoView.tsx`), as Arena's multiview shows it: canvas 215 to 1 in the spike, and in the
kiosk 211, 188, … 25, 1, 23, … 212 at 100 ms steps. The ring build (tearing) and the stall lines
stay; the stall was never the feed. ✅ The owner, watching Arena's own fades in the kiosk
afterwards: "Seems good now."

**Listed but waiting for ever, and Restart video (2026-10-08, branch `video-restart`).** The
owner, from another Windows booth machine: the picker listed the Spout senders, a pick only
ever said it was waiting, through app restarts, a machine restart and a reinstall; other
machines work. Nothing was in the log. Read from the addon's source (upstream `7f7d589`,
`spout_bridge.cpp`; ⚠️ not seen on that machine, nothing tried there):
- **The likeliest cause: two graphics cards.** Each receiver makes its own D3D11 device on
  the *default* adapter and opens the sender's texture on it. Spout's handle is a legacy
  shared handle, which opens only on the card that made it, so with Arena on the discrete
  card and Pāua on the other every open fails, and the addon says only "not connected
  (sender disconnected or never appeared)" while the sender is still listed. That went into
  the view's small print and nowhere else. **The fix is Windows' own:** Settings › System ›
  Display › Graphics › Pāua (and Arena): High performance, then restart both. It moves the
  addon's default adapter and Chromium's together. Chromium's `force_high_performance_gpu`
  switch was **not** added: it moves Chromium only, so the page would be on one card and
  the addon's textures on the other, which would break a machine that works.
- **A freeze where Spout's frame counting is on** (`HKCU\Software\Leading Edge\Spout`
  `Framecount` = 1, SpoutSettings): the kiosk asked `hasNewFrame()` before each receive, a
  flag only a receive updates, so one poll with nothing new left it false for good. Off (as
  on the Windows box here) it always says yes, so it was dropped on Windows (Syphon's kept).
- **Now:** a sender tried for 10 s with no frame reaching the page is said in the view
  ("No picture from …") and in one `[video] no picture from …` line with the counts (how
  often "not connected", frames taken, frames that reached the page, a send the page never
  took). Every new failure is a `[video]` line. `[video] graphics:` logs the cards Chromium
  sees and which it draws with (`app.getGPUInfo('basic')`), 5 s after start and at each
  restart. The Connections row no longer says LIVE for a sender listed without a picture.
  **Restart video** (↻ in the view's strip, a button over the waiting message,
  beside the Video feed in Connections, and in Settings › Video feed; since the 2026-10-08
  merge, Connections is the read-only list and Settings holds the two-card advice), for
  anyone: lets every receiver go and opens them again,
  keeping the pick and the watchers, no app restart. ✅ On this Mac with a Syphon stand-in:
  frames, Restart while watched, frames again, the lines in the log. ⚠️ Not on Windows,
  not on a two-card machine; the addon's own `[SpoutBridge]` lines go to stderr
  (kiosk.log), not paua.log.

**Still to do:** lay out the real multiview in Arena (slices taking Layer / Group / Composition); then macOS
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

> Replaced on 2026-10-05 by windows on a grid (§ Windows, embeds and layouts,
> below). What carried over: a view that stops answering keeps its tab and says
> so, everyone switches tabs, and each machine remembers its layout.

- **Both slots pick.** Left and right each have a picker: Run order, MA, Arena, and
  later others. A view is in one slot at a time; picking the one the other slot holds
  swaps them.
- **A view that stops answering stays, and says so.** The screen never rearranges
  itself under a volunteer. "Only what answers" is what the picker offers, not what a
  slot keeps.
- **Everyone picks**, not only Admin: an Arena op and a lighting op can each get
  their view.
- **Each machine remembers its layout** across a restart, as it does the run order's
  width.

## Answered (owner, 2026-10-03, evening): triggers, media, the name

- **The trigger screen is wanted now**, not later: tap a clip to play it, fire a column,
  clear a layer, drag a layer's fader. **Everyone may fire**, as everyone picks views:
  it is for a single-screen volunteer op, so no Admin guard.
- **"Keeping Arena in sync" means a missing-media check**: every clip in the composition
  whose file is not on this machine, said before a service. Not comparing compositions
  between booths, not numbering, not pushing media.
- **The rename: Pāua.** No clip countdown chip beside the clock (dropped).

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

## Answered (owner, 2026-10-04): the media check

Started as "announcements against Arena's designated columns"; the answers widened it.
It takes in the parked foregrounds idea, `docs/LOOKBOOK_CHECK.md`.

**Built the same day, inside the Arena view** (`src/renderer/components/MediaCheck.tsx`;
rules `src/shared/media-check.ts`; reads `src/bridge/lookbook.ts`, `src/main/lookbook.ts`).
A **Media** row under the missing-file notice: pick one of the lookbook's services from
today to a week ahead (the booth's campus first, the last pick remembered per machine),
and each B, F and A code on its run sheet reads ✓ with where it is, **not in Arena**,
**file missing on this computer**, **another version** (Arena's file against the
lookbook's), or **? the lookbook has no file**. Lower thirds (T) are not looked for
(they are not in Arena), nor countdowns (D, not asked). It re-compares on every Arena
update; the lookbook is asked only on a pick or **Check again**. The code is found
anywhere in Arena's file name (the clip's name when Arena names no file), and a version
matches when the file's name is the lookbook's without its upload stamp, case aside.
✅ In the kiosk on this box, 2026-10-04: today's seven services listed from the live
lookbook, Central AM's run sheet read, its 9 codes all "not in Arena" (right: this box's
Arena has none of the show's media), and a real clip's file path read from Arena.
⚠️ Not yet against the booth's Arena with the media loaded, so ✓ and "another version"
are seen only in the tests; and a PNG still is assumed to carry `video.fileinfo` as a
video clip does.

**The lookbook** (✅ read 2026-10-04, no sign-in): `GET /api/weeks` (one per campus
service, ~300), `/api/weeks/<id>/services` (the campus), `/api/services/<id>/items` (each
item's `codes`, its files by role, `missingCodes`). Type letters seen: B background,
F foreground, A A-screen, T lower third. Files are `/storage/library/C/<CODE>-<name>_<ms>.<ext>`.

- **The link is LIFE's media code**, which PCO's item names were missing: `CB102` is
  Central Background 102, `CF455` a Central foreground, `CD…` a countdown track. The
  first letter is the campus (`C` Central, `N` North, `W` West, …), the second the type.
- **The run sheet lists codes in PCO's `Media No.` column** (an item-note category),
  placed ad hoc against whichever item, not on announcement items of their own. It is
  usually the source of truth, but a service sometimes deviates.
  The shared backend does not sync PCO's item notes (it keeps an item's `html_details`
  and its own `note_values`), and need not: the lookbook app already reads `Media No.`
  (below).
- **Every coded item, one check** (the owner's pick): backgrounds, foregrounds,
  countdowns and announcements together.
- **Announcements are transparent PNGs, not videos**, usually `F`-coded, rarely `B`.
- **The code sits somewhere in the file name**, not always first, so matching means
  finding a code anywhere in the name.
- **Arena:** announcements sit in fixed columns (fixed, but they may move) across up to
  three layers of the **Holding** group (Holding BG, Holding FG, Holding Playback),
  usually one. The columns are **named, with slot labels** (like "ANNOUNCE 1"), not the
  code or the title, so a column's name finds the slot but not what belongs in it.
- **"Up to date" means all three:** a listed code has a clip loaded; that clip's file is
  on this machine (the missing-file check already built); and it is the newest version on
  the network drive, by modified date, but the name matters too.
- **The network drive** is a few stacked folders; the owner needs to look before
  describing it.

**Answered after:** `Media No.` reads like `CB095/CF588/CA635 (Walk In)`, and the
lookbook (lookbooks-lifenz.replit.app) already parses it, so the backend needs no new
sync. The booth's Arena files carry the NAS names (`LC-NAS-01 › Graphics › Sunday Media ›
1. Central`, a Synology). The lookbook is the truth for the current version. **Still
open:** whether countdowns (D) belong in it.

**Against an up-to-date Central composition, 2026-10-05** (the owner's, loaded in Arena on
this box; files in a local `Media\AM` folder, not the NAS; deck AM). The shipped check, run
over the composition and the live lookbook for 4 October's Central AM and PM:

- ✅ **✓ seen for real**: CF588, CA635, CF445, CF546, CF593, CF449, CA636, each with its layer
  and column. ✅ **A PNG or JPG still carries `video.fileinfo`** with its path, as a video
  clip does (all of this composition's clips are stills). No file missing.
- ✅ **"Another version" seen for real, and it is a naming difference only**: CB095 in Arena
  is `CB095-Sunday-RelationshipSeries.png` (16 MB, 17 Sep), the lookbook's is
  `…-RelationshipSeries-v5.jpg` (6.6 MB, uploaded the same evening). Same picture, same
  5800 × 2037 by eye. What differs is the name's `-v5`, which is how the file was uploaded
  to the lookbook; the rule compares names without the extension, so the PNG / JPG
  difference plays no part. **A format change alone passes** (the owner, 2026-10-05; the
  rule already did, now a test says so).
- **"May differ", and Same by hand** (the owner's ask, 2026-10-05, built the same day): a
  name that differs reads **may differ**, not "another version", since a name is only a
  guess at the file. Beside it, **Same** (Admin) confirms it the same file: it then
  reads "✓ … confirmed the same by hand", never a plain ✓, with **Undo**; the summary
  counts them. (The screen avoids the word "mark", which is the testers' MARK flag.) A
  confirmation holds for that pair of names only (code, Arena's file name and the
  lookbook's, without folder, extension or case), so a new file on either side asks again;
  a confirmed file missing from this computer still says so. Main keeps them in
  `media-same.json` in the data folder and logs each. ✅ In the kiosk over CDP, 2026-10-05:
  refused in volunteer mode; in Admin, Same on CB095 turned all seven of its rows to
  "confirmed the same by hand" and the summary from 2 to 1 to look at; Undo put it back.
- **Following the run order** (the owner's ask, 2026-10-05, built the same day): the check
  takes the service the Cue Manager has open. Its address carries the Planning Center plan
  (`/s/90226425`), and each lookbook service names its `planningCenterPlanId` (✅ Central AM
  4 Oct is plan 90226424, the Cue Manager's `/s/90226424`), so the match is exact, never by
  name or date. Main looks for the plan from 21 days back to 42 ahead (each week's services
  kept 5 minutes), so last week's service can be checked too. It says when the run order has
  no service open, and when the lookbook has none for it yet ("isn't in the lookbook yet"),
  never falling back to another. **Pick by hand** opens the old list and stops following
  (remembered per machine) until **Follow the run order**. ✅ In the kiosk over CDP: the
  Cue Manager's home read "no service open"; Central AM 11 Oct read "isn't in the lookbook
  yet"; Central AM 4 Oct was followed and checked. The run order must be loaded (on screen
  once since the start) for its plan to be known.
- **Not loaded**: AM wants CF464 (`EXP-NextStepsLounge`) where Arena has CF447
  (`NextStepsLounge`, PLAYBACK 6); PM wants CF465 (`EXP-NextStepsUpstairs`) where Arena has
  CF446, and CF594 (`AllCampus-Prayer-Fasting-Oct-1`) where Arena has CF593. Arena also
  holds CB105 (`ReloSeries-Preach`, HOLD BG 3), on neither run sheet.
- **Slots have no names in Arena**: every column is Arena's default `Column #`, so a slot is
  its position. The owner, 2026-10-05: columns 3 and 4 are used, less often: **3 is the
  Countdown**, **4 the Video / Broadcast Background** (a vignetted black behind videos, so
  they sit nicely; at the other campuses only for now, not Central). In this composition
  only HOLD BG has clips there (CB105, CB095). **A-screens** (the owner, 2026-10-05) live in
  the first layer, PRE & POST: column 1 is Pre, column 2 Post (CA635 Walk In and CA636
  Walk Out in this composition). The run sheet's labels say which: `Walk In`, `Walk Out`.
- **The run sheet's labels are steady week to week** (Central AM, 20 Sep to 4 Oct): Walk In,
  WTL, NSL, WTG, Bibles, Walk Out recur with the same codes; one-off announcements come and
  go (Help & Hope Week, Update Details, Alpha, Prayer & Fasting).

## Windows, embeds and layouts (owner, 2026-10-04; built 2026-10-05)

The owner's decisions are in CLAUDE.md § Improvements; the rules are in the code's
headers: `src/shared/layout.ts` (the windows, tabs, saved layouts) and
`src/shared/embeds.ts` (embeds). Built overnight on the Windows box and driven over
CDP, not yet by a finger.

**Choices made without asking** (the plainest that works; the owner may change any):

- **Every page shows once, not only the MA.** The run order and each embed are
  native pages too, and a page can be in one place at a time. A second tab of any of
  them says "Only one … window at a time" with **Move it here**. For the Cue Manager
  this also settles the offline-queue question: there is never a second page to sync
  twice. A second live copy of an embed would need a second page in the same session;
  not built.
- **Adding and removing tabs is arranging**, so it is in Edit layout (Admin).
  Switching tabs and **Move it here** are everyone's. **Since 2026-10-05 a tab is dragged**
  in Edit layout (the owner: "don't have to delete them to allow them to be reorganised"):
  along its strip to reorder, onto another window to move it there; a nacre bar shows where
  it lands, the window it goes to is ringed, and it keeps its id, so a page whose home it is
  goes with it (`moveTab`). ✅ Over CDP: Clips dragged in front of Holding, Arena dragged
  into the run order's window.
- **While editing, every page is a picture** for the whole edit, not only while
  dragging: the handles are drawn over the windows, and nothing can be drawn over a
  live page. The pictures are taken as Edit layout is tapped.
- **No grid since 2026-10-05, the owner's ask** ("freeform with no grid, but keep the
  logic of the grid so they don't overlap"; the cells made a drag jump a twelfth of the
  screen at a time). A window's place is in units of a 1200 × 800 screen, whole numbers
  so edges that meet are equal; a drag follows the finger and an edge within 16 px of
  the screen's edge or another window's snaps onto it. A resized edge stops flush
  against a window in its way; a move onto one is red and not taken; a shared edge
  dragged past its limit lands on the limit. A grid layout's cells, and saved
  layouts, come across × 100, each window where it was.
- **The smallest window is an eighth of the screen each way** (150 × 100 units, about
  240 × 125 px on the booth's 1920 × 1080; it was 2 × 2 cells). A share of the screen
  rather than pixels, so a layout means the same on any screen. A window with all its
  tabs removed stays, empty, until it is removed or given a tab. Add window takes the
  biggest free place; with no room, it says so.
- **Video's Fit is a pop-out's only.** Built when windows snapped to cells; with free
  windows, a Fit in a window is possible again but not built.
- **Saved layouts open as a dropdown over the windows** (the owner, 2026-10-06: "on top
  of the screen, not take you to a whole different screen"; until then they opened in
  the windows' place), from Layouts in the top bar **and in the folded strip**. A menu
  over a live page cannot be drawn, so while it is open each page stands in as a
  picture of itself, as in Edit layout; a tap outside closes it, a layout tapped
  switches and closes it. The button names the layout on screen; switching a tab still
  counts as that layout. Up to 12. ✅ In a browser against the mock desk, 2026-10-06:
  opened from the bar and the strip, switched, closed by a tap outside. ⚠️ Not yet in
  the kiosk over live pages, nor by finger.
- **Admin-only buttons (called operator mode until 2026-10-08) are not drawn in volunteer mode** (the owner, 2026-10-06:
  Update all and the like should "not even show up"): Update all, Load all, Load,
  Clear old FGs, a ghost's Place, the No column tray's choosing, an inspected clip's
  answers, Save As and Load in the showfile sheet, and the This screen switch. What
  goes where still shows ("goes here"). Main still refuses them outside Admin;
  that is the guard, this is only what a volunteer sees. A pop-out asks main for the
  mode (`mode:get`) each second.
- **Embeds open only once a window shows them**, so a booth can add many without each
  loading in the background. Off closes the page and keeps its sign-in; removing one
  clears its session, and its folder at the next start. The Google sign-in page on
  Windows raised a **passkey dialog** naming electron.exe as an "untrusted app": that
  is Google offering a passkey, and Cancel or another way in both work.
- **MARK** is for everyone and writes the mode, the layout and the views on screen
  beside the mark's number. **This screen** (Full screen / Window) is in Connections,
  Admin.

## The look (owner, 2026-10-05)

The owner asked overnight for a deep UI and UX clean-up ("starting to feel a bit messy",
"the more intuitive the better, even if this means more actions", "move away from the
'claude' like design"). Three directions were mocked on a review page
(https://claude.ai/artifact/X8nXYSif8rgrES2PqeWM3i, private to the owner: A Pāua, B
Console, C Studio). **The owner chose A**, and asked for the neutrals to sit "somewhere
between" A's sea-green and the original greys; they are the midpoint of the two. The
tokens and their reasons are in `src/renderer/theme.css`; the shared pieces in
`src/renderer/components/ui.tsx`.

**Choices made without asking** (kept by the owner so far):

- **Edit layout lives in Layouts** (Admin), not on the bar: one Layouts button
  instead of LAYOUT and EDIT LAYOUT side by side. One more tap to arrange.
- **MARK is a flag icon**, for testers; it says "Mark N" for 3 s when tapped.
- **The mode button is a lock**: Volunteer, closed and quiet; Admin (Operator until 2026-10-08), open, with the
  nacre line under the bar. The words "hold the mode chip" became "hold Volunteer (top
  right)" everywhere.
- **The countdown has no surface while live**, so it reads as a reading, not a button;
  stale and unknown keep their dashed and dotted outlines.
- **Connections is a list and a detail**; Add a web page and This computer are rows of
  their own. It opens on the first connection that is down.
- **Showfile's Save As and Load are two cards a screen apart**, which is how "Load never
  shares a neighbourhood with Save As" is kept now (it was a gap down the page).
- **Add window opens its view menu** at once.
- **The bar is slimmer and folds away** (the owner, 2026-10-05: "seems to take A LOT of
  screen space"): 60 px instead of 76, the countdown's caption beside its number rather than
  above it, the clock smaller; the chevron at the right folds it to a 36 px strip of the same
  readings (link, show, countdown, clock, the connections' dot, the mode), whose only control is
  the chevron back. Remembered on this computer (`paua.barCollapsed`). ✅ Over CDP, both ways.
- **Status words are sentence case on screen** ("Live", not "LIVE"); the shared code
  still says them in capitals (`sentence()` in `vocabulary.tsx`).

## Fetching media (owner's ask, 2026-10-05; built the same day)

The media check finds a code missing or an old version; **Fetch** beside it puts the
lookbook's file right. Two settings on the Arena row in Connections: the **graphics folder**
(the NAS or its drive, only ever read) and the **local folder** (copies go there, for Arena to
play from). Rules and states: `src/shared/media-fetch.ts`.

- **Arena can load a file into a clip.** ✅ Arena 7.28, 2026-10-05, on this box:
  `POST /api/v1/composition/clips/by-id/<id>/open`, body `text/plain`
  `file:///C:/…/local%20media/ZZ999%20Paua%20test.png`, answered **204**; the clip read back
  with that file, named after it, `Disconnected` (not playing). Arena's own API description
  (served at `/api/docs/rest/`, `swagger.yaml`) says `open` "will retain settings as much as
  possible", and lists `/composition/clips/open` for several at once.
- **Another version or a missing file**: found by name (any case, any media extension, newest
  if several; Synology's `@eaDir` and recycle bins skipped) under the graphics folder, copied
  with progress (`.partial` then renamed), loaded into **every** clip that has the old one
  (CB095 sits in 18 columns of HOLD BG; since 2026-10-05, before only the first), and
  confirmed by the check's own next reading. **Not in Arena**: **Place** into its suggested
  home (§ The Holding view), or copied only ("Copy here") when no home is found.
- **Nothing goes into Arena without a confirmation** (the owner, 2026-10-05): Fetch, Place,
  Update all and the Holding view's Update each list what they will copy and load, and only
  **Load** sends it. Same and Undo touch only Pāua's own record, so they stay one tap.
- **Guards**: never into a playing clip (checked at sending), nothing overwritten (a same-size
  file of that name is reused, a different one left alone and said), the page sends a code, a
  file name and clip ids (at most 100) and main builds every path, Admin only.
- ✅ Copy, 2026-10-05, in the kiosk: a 60 MB file found two folders down, progress shown,
  copied, and reused on a second fetch; the folders-not-set message. 260+ tests cover finding,
  copying, no overwrite, a cut-off copy, the `file:///` address and the open request's guards.
- ⚠️ **Not yet watched**: a load through the Fetch button (the live load above was by hand);
  a second file into a clip that already has one (whether its settings stay); what Arena says
  for a path that is not there; copying from the real NAS (speed, the share's path). The
  check's ask to repeat the load test was stopped by this box's safety check. (The ZZ999
  test clip left in PRE & POST, column 9 went with that composition: the Central one
  loaded on 2026-10-05 has nothing there.)
- **By code and size, with the lookbook as the backup** (the owner, 2026-10-05: "the rest of
  the name is more for the comms team"; download from the lookbook "as a backup if it's not
  on the drive", with a safeguard). ✅ Measured that day: **the lookbook's files are the
  drive's, byte for byte** (CF588, CF445, CF449, CF546, CF593 and CA635 the same size to the
  byte on `G:\Sunday Media\1. Central` and in the lookbook). So:
  - **The check tells a file by its size.** Main reads the size of Arena's files (only ones
    the composition names) and of the lookbook's (a HEAD, kept: a library path carries its
    upload time); same size is ✓ whatever the name, another size is **different file**. Only
    while sizes are unread does a name decide (**may differ**). A missing file is **file
    missing**, whatever its name.
  - **The drive is searched by code**: a file whose name carries the code (`CF449` in `CF449
    Bibles - Copy.png`), of the lookbook's size, a plain name before a `- Copy`, newest first.
  - **Else the lookbook's own file is downloaded** into the local folder, named as the lookbook
    names it without the upload stamp, whole or not at all (`.partial`, renamed at the right
    size), never over another file, only from the lookbook's library.
  - **The safeguard: the confirmation asks.** Before anything is sent, main says where each
    file would come from ("From the drive: …", "Only in the lookbook: CF464 is not on the
    drive", "…: the drive's CB095 is another version"); when any are lookbook-only it asks:
    **Load, downloading N from the lookbook** or **Load only what's on the drive**. A request
    never downloads unless that yes came with it (`allowLookbook`, checked in main). The log
    says which, and a fetch's words say "(from the lookbook)".
  - ✅ Dry run against the drive, the lookbook and the live composition for Central AM and PM
    4 Oct: CF594 now found on the drive (`…Prayer&Fasting-Oct.png` where the lookbook says
    `…Prayer-Fasting-Oct-1`, the same size; it failed by name that morning); CF464 not on the
    drive, so the lookbook, asked; CB095's drive copy another version (`-v4` against `-v5`),
    so the lookbook, asked; the check said CB095 "different file" by size. 287 tests.
    ✅ **Through the button, 2026-10-05 11:12** (the owner's Update all, in paua.log): CF464
    "not on the drive" and CB105 "another version" downloaded from the lookbook into `D:\Holding`
    and loaded, into HOLD FG column 6 and HOLD BG column 3.
- **Browse** (the owner's ask, 2026-10-05): beside each folder on the Arena row, Windows' own
  folder picker over the window that asked; the pick fills the field, Save keeps it. Admin
  only. ⚠️ Not opened from a session (it would raise a dialog on the owner's screen).

## The Holding view (owner's idea, 2026-10-05; built the same day)

A view of its own (Holding, in the + menu), run off the Arena reading: the holding layers
(HOLD FG, HOLD BG), then PRE & POST where a composition has it, then PLAYBACK only when it
holds something ("rarely used"), each a row of its clips' thumbnails, every clip marked against
the run sheet the media check follows: ✓ on it, **may differ**, **file missing**, faded when
not on this run sheet (free to replace) or carrying no code (left alone), green when playing
as in Clips. The column headers carry Arena's column names. The rules
are `src/shared/holding.ts`; the state is shared with the Media row (`src/renderer/useMediaCheck.ts`).

The owner's answers (2026-10-05): **inspect only** (a tap never fires; Clips is for playing);
Admin for every change; the lookbook's own pictures for media not yet in Arena;
nothing from the lookbook on PLAYBACK ("normally we wouldn't have anything in the lookbook for
it"); HOLD BG's columns 3 and 4 kept, no other layer's; each service has its own deck, so a
clip not on this run sheet may be replaced. Keep the Fetch, Same, Place and Update all buttons
in both the Media row and here (taken without an answer: the owner can trim one).

- **A column is one moment of the service, across every layer** (the owner, 2026-10-05).
  The first version (built that morning) treated each layer apart and filled HOLD FG from
  column 1 in run-sheet order; the owner's Place all on the PM run sheet put CF588, CF445,
  CF465, CF546 and CF449 in HOLD FG columns 1, 2, 3, 4 and 6: Welcome in Post, two in the
  Countdown and Video columns (✅ the loads themselves, the first through the button, all
  landed; nothing was overwritten, HOLD FG had been emptied). Rebuilt the same day on the
  owner's pattern, which every campus will follow ("happy to make all campuses conform"):
  **Arena's columns are named** `PRE` (Doors Open / Walk In), `POST` (End / Walk Out),
  `WTL`, `NSL`, `BIBLES`, `WTG` (always the same columns), and `PROMO` (as many as the
  campus has: Central 6) for every announcement and promo; any other name (`COUNTDOWN`, a
  video background) is never placed into. Each run-sheet item's codes go into its column on
  their layers (B on HOLD BG, F on HOLD FG, A on PRE & POST); a code two items use goes into
  both (CF588 in PRE and POST). A label with no column of its own goes to a PROMO column if it
  is an announcement or promo (its title or label says so): the one already holding it, then
  an older version of it, then one not on this run sheet, then an empty one, never two in one;
  otherwise it is said ("no column named Preach BG"), and a campus can name a column after the
  label. Columns still named Arena's `Column #` mean nothing is placed, and the view says
  which names to use. ✅ Dry run against the live composition and the real Central PM 4 Oct
  run sheet, columns named on a copy: CF588 back into POST (replacing the misplaced CF445),
  CF445 into WTL, CF465 into NSL (replacing the misplaced CF449), CF449 into BIBLES, CF546 into
  WTG, CF594 into a PROMO column; unnamed, nothing placed. **The names are the layer
  group's columns**, not the composition's: the owner named HOLDING's (PRE, POST, WTL, NSL,
  BIBLES, WTG, PROMO 1 to 6 in columns 1, 2, 5 to 8 and 11 to 16) and A SCREENS's (PRE, POST),
  and the composition's stayed `Column #` (✅ read over the REST API, 2026-10-05; a first build
  read only the composition's and said the columns did not exist). Each layer takes its
  group's names, the composition's only when its group names none. ✅ Dry run against the live,
  named composition: Central AM and PM 4 Oct each place CF588 in PRE and POST, then WTL, NSL,
  BIBLES, WTG, and the promo in PROMO 1. ⚠️ A column renamed while Pāua runs may be read only
  at Arena's next composition push (a rename is a parameter Pāua does not subscribe to).
- **To place** (was Needs a home): each code not where its item belongs, with the lookbook's
  picture (main shrinks it to 480 px on a `lookbook:` scheme, only library stills) and its
  column; **Place** puts it there, **Choose** makes the next tap on a free slot of its layer
  the place instead (only free slots light up). What has no place is listed with why. The
  Media row says the same per item: "not in POST" for End's CF588 while it sits in PRE.
- **Tap a clip** to inspect it: what it is, Arena's picture beside the lookbook's for one that
  may differ, **Same** / **Undo** and **Update** (every clip with the old file).
- **Update all** (here and in the Media row): one step per code, its file into every clip with
  an old or missing version and into every column it is missing from; what has no place listed
  apart, never guessed.
- ✅ In the kiosk over CDP, 2026-10-05, against the owner's Central composition with the run
  order on Central PM 4 Oct and HOLD FG emptied in Arena: six PM foregrounds in Needs a home
  with their lookbook pictures and HOLD FG columns 1 to 6 suggested; HOLD BG's CB095 clips may
  differ, CB105 faded, CA635 and CA636 ✓, PLAYBACK's CF447 shown as rarely used.
  ⚠️ Not yet: Choose, Inspect and the confirmation driven (the owner was at the kiosk), a
  Load into Arena (needs the owner's go-ahead), and anything by finger.

- **Edge cases and the clutter** (the owner, 2026-10-05: "a few edge cases decently often…
  any good catch-all", and "feels very wall of texty"). Seen in the morning's log and on screen:
  Update all skipping CB095 three times because its clip was on screen; CB105 "Preach BG" loaded
  into a slot but still listed "no column named Preach BG"; CF588 named `WalkInV2` against the
  lookbook's `WalkInV2-Demo`. The owner's answers, built the same day:
  - **A clip on screen may be replaced**, "with an extra warning": a placement or update into a
    playing clip is no longer refused in the rules; the confirmation asks apart, a red tick "Replace
    N on screen now (… in HOLD BG · column 1): the audience sees it change", off until ticked, and
    Load turns red, "Load, replacing N on screen". The yes names the clips (`allowLive`, clip ids);
    main still refuses a clip that went on screen after it. ⚠️ Not yet watched: what the audience
    sees when Arena opens a file into a playing clip.
  - **One-offs, per service** (the owner's idea over a remembered label: "things it doesn't KNOW
    you can decide where they go for that service, F in foregrounds and B in backgrounds"): an item
    with no named column waits in the **No column** tray; tap it, then a lit slot on its layer.
    Once its code is anywhere on its layer it counts as placed, so Arena is the record and the next
    service's deck asks again. A label that comes back every week is the sign to name a column.
  - **The lookbook question is a tick too**, off until ticked, beside the live one; Load says how
    many it will send.
  - **Less text, more picture** (direction mocked in chat, the owner happy): a right clip shows only
    its code; amber ring and dot for may differ or another file, a file-missing icon, faded for not
    this service, green for on screen, one legend under the grid. What belongs in a column and is
    not there stands in it as a **dashed tile with the lookbook's picture, "+ place"** (To place's
    list is gone). The header is one line: service (tap for following / pick by hand and when the
    run sheet was read), what to look at, fetches as small chips (tap one for its detail), Update
    all, a refresh icon. A clip opened: Arena's picture beside the lookbook's, "Use the lookbook's"
    and "Arena's is right" (was Update and Same).
  - **The Media row is one line** that opens the Holding view in the Arena view's place, with ←
    Arena (the per-code list is gone; Copy here went with it). "To look at" counts codes as the
    Holding view marks them, so it matches the amber tiles.
  - ✅ In the kiosk over CDP, 2026-10-05: Central PM 20 Sep (CB105 no longer listed; CF588 and
    CB095 amber) and 4 Oct (CF465 and CF594 as dashed tiles in NSL and PROMO 1); a ghost's Place and
    Update all opened their confirmations and sent nothing until Load (checked by trapping the
    send); the Media line opened Holding and came back. ⚠️ The live tick not seen (nothing was on
    screen); nothing by finger.
- **A SCREEN BG** (the owner, 2026-10-05): the A-screen layer's new name. PRE & POST is still
  read as it, for a campus not yet renamed.
- **The normal background fills HOLD BG's gaps** (the owner, 2026-10-06: "update all the
  backgrounds in the bg layer up to promo 6 (including the blank ones) to use whatever the
  normal bg is … whatever everything else (besides Doors Open, Pre & Post, Preach and
  announcements) is using"). `normalBackground`: the commonest B code among the other items
  (WTL, NSL, WTG: CB095 at Central), none if they have none. `backgroundGaps`: every HOLD BG
  slot from column 1 to the last PROMO that no item's own background claims, empty or
  holding a code this service does not use. Part of Update all's step for that code ("the
  gaps in HOLD BG as the normal background (9, 10, PROMO 6)"), drawn as dashed tiles in
  Holding. **Central's columns 3 and 4 are filled too** (the owner, 2026-10-06: "yes they
  should"), and so is a column named COUNTDOWN; only a column named VIDEO or BROADCAST (the
  vignetted black behind videos at the other campuses) is left, with a clip on screen and one
  with no code. A one-off background (Preach BG) may still be chosen into a gap that holds the
  normal background (the owner: "ok good"). ⚠️ Not yet run against Arena.
- **PREACH** (2026-10-06): a column named PREACH takes the message's background (an item
  titled Message, or labelled Preach or Sermon). Without one, Preach BG stays a one-off, as
  before. Central has no PREACH column yet: its CB105 sat in HOLD BG column 3.
- **Overflow, for one-off events** (the owner's rule, agreed 2026-10-08; built the same day): the
  four or five events a year whose lookbook has far more foregrounds or backgrounds than the
  named columns take, loaded by hand until now. A code on HOLD FG or HOLD BG with no column of
  its own (a one-off, or an announcement past the last free PROMO) goes, **in run-sheet order,
  into that layer's empty clips after its last named column** (`overflowSlots`, `why:
  'overflow'`): never a loaded clip, never one on screen, nothing while the columns are unnamed,
  capacity whatever Arena reports. A code two one-offs share takes one clip. What still does not
  fit is said, "**N didn't fit**", in the No column tray and the confirmation, and waits there to
  be placed by hand; nothing is dropped. The confirmation names each clip ("CF703 into HOLD FG ·
  column 15, an empty clip past the named columns"); same confirmation and Admin rules as any
  placement. Normal services are unchanged: a named column always wins. Taken without asking:
  a one-off on a normal service (Preach BG at a campus with no PREACH column) is now offered an
  empty clip past the named columns too, instead of only the tray (once its code is anywhere on
  its layer it is done, as before); an item's FG and BG overflow on each layer separately, so
  they need not share a column (**superseded 2026-10-13**: one column across its layers, below);
  A SCREEN BG does not overflow (the rule names FG and BG). **The
  normal background's gaps** stop at the last PROMO and overflow starts after the last named
  column, so they never meet (and `backgroundGaps` leaves any clip a placement takes).
  **Clear old FGs**: an overflow clip, once loaded, carries a code this run sheet uses, so it is
  never old; the last event's leftovers past the named columns are, and clearing them frees
  room for the next Update all. HOLD BG has no clear, so its leftovers stay and take room.
  ✅ Unit tests (`test/holding.test.js`, overflow). ⚠️ Not yet run against Arena or seen in the
  kiosk: no Arena or lookbook mock on the Mac.

### The owner's fixes, 2026-10-13 (branch `holding-fixes`, not merged)

The owner, after a service: one-off foregrounds' backgrounds did not follow; one code "failed"
with Arena 404ing though it was there; "I think we don't really know what it's doing sometimes
when things are wrong"; a way to place a clip anywhere; ways through "same code but different
filename". Then: announcements and other foregrounds from PROMO 1 onwards. Their answers, asked
in this order, are in brackets. Each in the dev kiosk on the Mac over CDP, against
`spikes/arena-stand-in.mjs` (a made-up composition for the mismatches) and the live lookbook
(Central Team Night, 13 Oct, a run sheet of one-offs). ⚠️ None against a real Arena or by finger.

- **The plan and the result** (a panel in Holding; a line that stays). `explainPlan`: every
  code of every moment, what Update all does with it or why not (in its column, a one-off
  already on its layer, a cell the map gives elsewhere, confirmed by hand, no file, not
  Arena's). The **Plan** panel sits beside the grid, open unless closed on this computer
  (`paua.holding.planClosed`); a tap opens the clip. A confirmation's loads go to main as one
  **run** (`media:run`): its plan and result in `paua.log` as `[holding]` lines, each failure
  with why; the latest kept for a result line under the header ("7 loaded · 1 failed · 2
  already there", a tap lists each code) until the next run.
- **A one-off is one column across its layers** (yes, the column is fired; replace old BGs; the
  normal background when it has none). `placeOneOff`: the foreground finds the column (where it
  is on HOLD FG already, where a one-off sharing it went, else the first empty clip past the
  last named column whose HOLD BG clip can take the background too); the background goes there
  wherever else its code sits. HOLD BG clips this service does not use are replaced; never one
  on screen, an item's own column or a clip with no code. A background that cannot go is said,
  and the foreground still goes. Inside the named columns it is said "beside its foreground"
  (`why: 'follows'`). Taken without asking: HOLD FG still overflows into empty clips only (the
  2026-10-08 rule).
- **A refused load** (an override, orange, "All in Arena"; kept until the file changes). Main
  keeps Arena's own words for a refusal and logs the `file:///` address it sent; 1.5 s after a
  refused load it looks at the clip again, and a clip holding the file counts as loaded, in
  orange ("sent, though Arena said no"). **It's there** (Admin; on a failed code, and in Inspect
  for a clip Arena calls missing) marks the code's clips right by hand under `thereKey`, which
  unlike a "same" mark also covers a missing file (a same mark still never hides a file gone
  missing since). Marked clips carry an orange hand; the summary reads "All in Arena (n by hand)"
  in orange. ⚠️ A real 404 and the look-again never seen: the stand-in cannot refuse a load. The
  cause is unknown; `paua.log`'s `[arena] POST …` line now says what Arena answered, and a
  `file:///` address with `&`, `#` or a macron is the first suspect.
- **Place anywhere** (its own layer only; remembered for the service, its other layers
  following). A hand placement is a pin `{item, code, column}` per service on this computer
  (`paua.holding.pins`, 12 services). The planner puts every code of a pinned moment into that
  column first; no PROMO, one-off or overflow takes it; with no background of its own the normal
  background follows. `pinTargets` lights every clip of the layer but reserved columns, cells
  the map gives elsewhere and columns another moment has. Ways in: **Place…** on a code in the
  plan, the No column tray, and **Place … elsewhere…** in Inspect. The pin is kept only when
  Load is pressed; the plan says "by hand" with an Undo.
- **Same code, different file** (all four helpers). Side by side, with name, size and date
  (Arena's file time from main, the lookbook's upload time from its name), the newer side
  marked; versions read from names (`-v5`, `_V2`, `WalkInV2`, past copy marks: `fileVerdict`,
  "Arena has v1; the lookbook has v5, newer"); the graphics drive's files for the code
  (`media:drive`: the lookbook's by size, a copy, the name Arena has, the one Fetch takes), and
  Admin may load another (`drivePick`, used only if main's own search finds it); **Files to
  check**, every mismatch on one screen in the grid's place. The owner's "what actually went
  wrong" was not answered (the question was unclear to them).
- **PROMO 1 onwards** (strict run-sheet order; one queue for announcements and one-offs).
  Announcements and foregrounds with no column of their own take PROMO 1, 2, 3… in run-sheet
  order, whatever is there (one on screen marked live); a column placed by hand is skipped.
  Past the last PROMO they carry on as one-offs (above). A one-off sitting elsewhere on HOLD FG
  is moved to its queue column: a pin is how to keep one. The old "older version first, then
  last week's, then empty" choice now serves only columns the Holding map shares.

## The Lookbook view (owner's ask, 2026-10-05; built the same day)

The owner: another holding view that "mimics the lookbook idea, have the images BIG and
obvious", keeping Holding, and not the lookbook embedded, so the looks can still be loaded;
merge them if that is better. **Taken (the owner's to change): a view of its own, on the same
rules.** Holding is Arena's shape (layers by columns, every clip) and is for fixing; the
Lookbook is the service's (moments in order) and is for seeing. One screen doing both is the
clutter the owner dislikes. Both read `looksOf` and the same check, so they never disagree, and
both load through the same confirmation.

- One look a row, as wide as the view, snapping as it scrolls (the owner, the same afternoon:
  "single announcement/look per that fills the screen", the A-screens and lower thirds were too
  small): **the lookbook's own
  picture of the moment** (`previewPath`, background and foreground composed, 5800×2037, served
  1600 wide on `lookbook://large/…`; a preview is not kept, since the lookbook redraws it at the
  same address) across the top; under it the A-screen or lower third at about 40 % of the
  width (a lower third on grey), beside its name, column and codes.
- Quiet when right: a tick. **Amber ring and Load** when Arena lacks any of it; **green ring and
  On screen** when a clip of its own plays in its column. A code chip: plain (in Arena), dashed +
  (not in its column), amber (another file, or missing), struck (no file in the lookbook), faint
  (not Arena's: a lower third). A one-off with no column says to choose its slot in Holding.
- **Load** is that moment only (`lookSteps`): its codes into its column, a code it shares (the
  background) freshened wherever it is old. **Load all** is Holding's Update all.
- ✅ In the kiosk over CDP, against the live composition and Central PM 4 Oct: seven cards with
  their pictures, six ticked, End amber with +CB095 for POST. Load not pressed. ⚠️ Nothing by finger.

## The Holding map (owner's ask, 2026-10-11)

Settings › Holding: the owner wanted each campus able to tweak the Holding rules, "powerful and
flexible and as agnostic as possible", as a matrix with presets and a reset. The rules in
`src/shared/holding.ts` became the **default**; `src/shared/holding-map.ts` holds what a campus
says otherwise, and an empty map is the old behaviour exactly (a test holds it to that).

- **Rows** are Arena's named HOLDING columns, read live (unnamed ones left out; PROMO ×4 one row).
- **Takes from the run sheet**: words; an item answers when one is its whole label or appears in
  its title or label. Unset is the column's default; empty takes nothing. Columns with the same
  words share the items out, as PROMO always did.
- **Each layer's cell**: Default, Item only (no normal background), Normal BG (HOLD BG only, over
  the item), Leave alone (nothing placed, filled, updated or cleared), or a Fixed code (placed even
  when the run sheet does not name it; never an old foreground; its file is the run sheet's when it
  has one, else the drive's newest file for that code).
- **Code families**, the two letters (campus, type): to a layer or none. The owner confirmed the
  reading (CF Central foregrounds, NB North backgrounds). Default: the type letter decides.
- **Presets**: up to 12 per computer (`paua.holdingPresets`), Use, Delete, Reset to defaults;
  **To a file** and **Import** carry one to another computer (the owner: "sure, not a bad idea").
  The file is checked whole before anything is taken.

Kept in this computer's storage (`paua.holdingMap`), shared with pop-outs. Checked on the Mac in the
kiosk over CDP against `spikes/arena-stand-in.mjs` (the OH2026 composition with Central's names on
HOLDING): edits, a fixed code typed in lower case, Save, Reset, Use. ⚠️ Not yet against a real
composition, by finger, or with a fixed code fetched from a drive.

## Clear old FGs (owner's ask, 2026-10-05)

"A clear old FGs button when updating all, and note when an old FG is in and ask if they
want to be cleared." **Old** (taken, the owner's to change): a clip on HOLD FG whose code this
run sheet does not use, not on screen, not in a column named for something else (COUNTDOWN),
not without a code, and not one Update all is about to load into (`oldForegrounds`).

- **Update all's confirmation** names them and asks, a tick off until ticked: "Also clear N old
  foregrounds this service does not use (CF561 in PROMO 1, …)".
- **Clear old FGs (N)** in Holding's and the Lookbook's header when there are any: a
  confirmation that is only that question, and **Clear N**.
- Main's guard (`emptyWire`, Admin only): the clip must be on HOLD FG, still hold the code
  the operator was shown, and not be on screen. This is Arena's `/clips/by-id/<id>/clear`, which
  empties a slot of its file and settings; the Clips view still cannot reach it (tested).
  ⚠️ Not yet pressed: what Arena 7.28 does with it is its API's word, not yet watched.

## The Creative Guide (owner's ask, 2026-10-05)

LIFE's in-service creative guide (Notion, public) behind **Guide** on the top bar, in the
windows' place like Connections, with zoom and reload: read, then closed. The owner had tried it
as an embed in a window and taken it out. Fixed in `src/shared/guide.ts`, not a setting: one
guide for every campus. An embed of main's own (own session, links out to the browser, zoom
remembered), never listed in Connections. ✅ In the kiosk: opened, Notion loaded in ~8 s and
filled the sheet, closed. ⚠️ Not by finger; a pop-out of it not offered.

## NDI sources as views (owner's ask, 2026-10-05; built the same afternoon)

The owner: add NDI sources as views, "similar to the embeds": a camera, ProPresenter's output,
another machine's screen, each a view a window can hold or pop out.

**The shape.** Connections › **Add an NDI source** (Admin) lists what NDI finds on the
network, and Add makes one a view (`ndi:<id>`) and a row, named by the part of NDI's name in
brackets (`2413-RUAP (Arena - Composition)` is "Arena - Composition"), renamed and removed in its
row, turned off like any connection. Never typed: a saved source missing is "not found", never
swapped. The row: found (live, there to show), LIVE with size and rate while shown, no picture,
not found (down), NDI not installed (down). The view follows the Video view's rules: drawn on
black, dimmed with words after 2 s without a frame. Its strip says the source's size and fps.
`src/shared/ndi.ts` holds the rules; `src/renderer/components/NdiView.tsx` draws.

**The route: neither of the two noted, a third.** NDI's own runtime is called through **koffi**
(MIT, prebuilt for every platform, pinned 3.3.2), so there is no addon to build and no NDI Tools
to install: the runtime is already on a box with ProPresenter (`NDI 5 Runtime`, 5.6.0 here). It
runs in a **utilityProcess** (`src/main/ndi-worker.ts`, started by `src/main/ndi.ts` the first
time anything asks about NDI, restarted 5 s after a crash, left off after five in two minutes),
and each page showing a source gets a **MessagePort of its own** to it, so frames never pass
through main. Each frame is waited for on koffi's thread, copied out with the C runtime's
`memcpy`, **thinned** to the size it is drawn at (`ndiStep`, the nearest whole step), and made a
`VideoFrame` in the preload. At most two frames in flight per page; up to 60 fps.

✅ **Seen on the Windows box, 2026-10-05**, in the kiosk over CDP:
- Arena 7.28's NDI output of its composition, `2413-RUAP (Arena - Composition)`, 5800×2036 BGRA:
  every frame NDI delivered, **42 fps** (of its 50), sent 1933×678 into a window drawing it
  2016×708. Arena was playing nothing, so the picture was black; its pixels read 0.
- `spikes/ndi-test-sender.cjs`, a stand-in of known colours: 50 fps at 1280×720; read off the
  canvas within 1 of what was sent, (255,0,0) (1,127,1) (1,0,65) (201,200,200), and a white
  patch at half alpha read 128 on black. Added through Connections, popped out, brought back,
  removed.
- **What it costs:** the kiosk page **~60% busy** at 42 fps of 1933×678 (28% at 21 fps); the
  worker copies a frame in 5-7 ms. More than the Video view, which never leaves the GPU. Every
  30 s shown, `[ndi] "<source>": N fps sent at W×H, copying X ms a frame; of N from NDI, N not
  due, N while the page drew` in `paua.log` says where a slow picture is slow.

**Paid for on the way:** `koffi.view` (a buffer over NDI's memory, fine in plain Node) **kills
the process inside Electron**, whose V8 refuses an ArrayBuffer it did not allocate: hence
`memcpy`. A poll every 5 ms held the view near 20 fps (Windows runs timers every ~15.6 ms), and a
30 fps cap against a 43 fps source sent every other frame, 21: hence the wait on koffi's thread
and the 60 cap.

**Choices taken without the owner** (say if any is wrong): sources picked from the list only; a
source's name defaults to NDI's bracketed part; the worker starts only once a source is added or
the Add list is opened; 60 fps, at the page cost above; the highest bandwidth, thinned here,
rather than NDI's own low-bandwidth proxy (640 wide, too soft for a big window); the trademark
notice ("NDI® is a registered trademark of Vizrt NDI AB") under Add and each source's row, as
NDI's licence asks.

⚠️ Not yet: by finger; a camera or ProPresenter as the source; another machine's source over
the network (decoding then costs the receiving CPU, which a local source does not); macOS (the
runtime's paths there are the SDK's documented ones, untried); the installed build (koffi is
unpacked from the archive, `asarUnpack`). **Arena can send NDI itself**, so this could also be
a multiview on another computer (Spout is this machine only).

## Capture inputs: Blackmagic, ATEM, OBS, webcams (owner's ask, 2026-10-05; built the same day)

The owner: "accept input from Blackmagic devices", and "this would work for stuff like OBS as
well". Blackmagic's Desktop Video driver presents each card input (DeckLink, UltraStudio,
Intensity) as a camera, an ATEM Mini's USB output is one, and so is OBS's Virtual Camera, so the
page takes any of them with **`getUserMedia`**, the browser's own camera route: no native code,
decoded and drawn on the GPU in a `<video>`, nothing through main.

**The shape**, as NDI's: Connections › **Add a capture input** (Admin) lists the cameras
this computer has; Add makes one a view (`capture:<id>`) and a row, renamed, turned off and
removed there. Kept by its **name** (Windows' USB ids such as `(5986:2159)` dropped from the tab's
name, kept in the stored one), not by the browser's device id, which belongs to the page and is
not promised to last. One stream per device per page however many tabs show it, let go with the
last; a stream that ends is said and reopened every 3 s. Asked for 1920×1080 at up to 60 fps,
video only. `src/shared/capture.ts` has the rules, `src/renderer/capture.ts` the streams,
`src/renderer/components/CaptureView.tsx` the view.

**Main's camera rule** (`src/main/kiosk.ts`): the kiosk's own pages had no permission rule at all,
so Electron's default granted everything. Now `media` is granted for video only, never the
microphone; other permissions keep the default they had. The MA, run order and embeds have
sessions of their own that refuse everything, as before.

✅ **In the kiosk on the Windows box, 2026-10-05**, over CDP: the page lists `FHD Webcam
(5986:2159)` and `OBS Virtual Camera` with no prompt (Desktop Video 's driver is installed here,
no card). Added through Connections, popped out: **the webcam at 1920×1080, 29.7 fps**, live.
OBS Virtual Camera with OBS not running refuses to start (`NotReadableError`), which the view says
in words naming both causes (another program has it, or OBS's Start Virtual Camera not pressed).
Test inputs removed after.

⚠️ Not yet: **a Blackmagic card** (none here) and whether its input opens while Arena also uses
it (usually one program at a time); an ATEM; OBS with its virtual camera started; by finger; the
installed build; macOS (it would ask for camera access the first time). A card shows nothing
until its signal matches the format in Desktop Video Setup; the view says so while it waits.

## One Video view for every feed, and the Timer view (owner's asks, 2026-10-08)

**Video (item 8, the owner chose one view).** Spout/Syphon, NDI sources and capture
inputs are one **Video** view. Each Video tab carries its own feed in the layout
(`src/shared/layout.ts`, `VideoChoice`: `{ kind: 'spout' | 'syphon', name }`, `{ kind:
'ndi', id }`, `{ kind: 'capture', id }`), picked from a touch-sized list grouped by kind
(`src/renderer/components/FeedPicker.tsx`): the feed button in the tab's strip, or the
list in the body of a Video tab with nothing picked yet. Anyone picks; it is the layout.
NDI sources and capture inputs are added in **Settings › Video sources**; this
computer's senders need no adding. Each engine is as it was: a Video tab shows its
feed's old view (`tabView`: `ndi:<id>`, `capture:<id>`, `video`), which is also what
pops out, so pop-outs work per feed.

Taken without asking:
- **Old layouts** convert on reading: an NDI or capture tab becomes a Video tab with that
  feed, keeping its id (and so its window and any name); an old Video tab gets "the first
  sender" (`name: null`), as it showed then. The old view's sender pick was held only
  while the app ran, never stored, so there was nothing more to carry over.
- **One Spout/Syphon picture at a time**: the engine receives one sender. Video tabs on
  screen asking for one sender get it at once; asking for two, the tab not shown says "One
  Syphon picture at a time" and offers **Show "…" here**. Never another sender's picture
  under a tab's name, and a sender not being sent is said as such. Spout tabs share one
  pop-out (the engine's picture), which says which sender it holds.
- A Video tab with no feed yet is always on screen (so it can be picked); one whose feed
  is turned off or removed leaves, as the old NDI and capture tabs did.
- Restart video stays the Spout/Syphon engine's; NDI and capture keep their own strips.

**Timer (item 1).** The bar's countdown as a view (`TimerView.tsx`), drawn from the
chip's own `timerFace`, so it follows `chooseTimer` and cannot disagree with the chip; no
source picker. Scaled to its window by container units.

✅ In the dev kiosk on the owner's Mac over CDP, 2026-10-08: two Syphon stand-ins
(`spikes/spout-test-sender.cjs`), an old layout's Video tab read as "first sender", a tab
picked to one and a second tab to the other, the one-at-a-time words and Show here both
ways, a pop-out; the Timer against a stand-in OnTime. ⚠️ Not on Windows, with NDI or a
capture input (none on that Mac), or by finger. One kiosk crash seen while doing it: a
SIGSEGV in Syphon's own message-port callback (`Syphon MessageReturnCallback`) as the
kiosk started receiving with two stand-ins just started; not seen again in the same run
and not in Pāua's code. Watch for it on a Mac.

## Open questions

- **Briefs:** where should a brief's link live? The candidates were the item in the
  Cue Manager, PCO, sent from a phone on the day, or pasted at the booth. The owner is
  undecided. Until then, a plain web-page slot covers it.
- **ProPresenter announcements, loading**: the check is built (§ ProPresenter announcements).
  Open for the load: the order the playlist should take (today the standing notices WTL, NSL,
  Bibles, WTG first, then promos: hold it to that?); whether CT131 Altar Call, in the PM
  playlist but on no run sheet, is a standing item to leave; and the NAS folder both machines
  reach, for a Smart Playlist.

## ProPresenter announcements (2026-10-14)

**The check, built** (`src/shared/announcements.ts`, `src/bridge/propresenter-playlist.ts`,
`src/main/propresenter-playlist.ts`, the **Announcements** view). The owner's answers: the
playlists are "-Announcements AM", "-Announcements PM" and "-Announcements EVENT"; each item is
a picture named by its file; someone puts them in by hand; the files are on the graphics drive
and the NAS, which ProPresenter's computer (another machine) also reaches.

✅ **Read from Central's ProPresenter** (10.11.60.7:1025, on the booth network) the same day:
twelve playlists, no groups; "-Announcements AM" holds a header NORMAL NOTICES (CT108 Connect
With Us, CT003 Next Steps Lounge, CT110 Bibles, CT109 Ways to Give), a header PROMOS, then
CT290 Prayer & Fasting. A media item's name is its file's without the extension. The fixture is
`test/fixtures/propresenter-announcements-am.json`.

What the real data changed from the owner's first answers:
- **Every T code on the run sheet** belongs, not only announcement items': on Central's 11 and 18
  October run sheets the Welcome moments (WTL, NSL, WTG) carry T codes and all are in the
  playlist. Speaker titles have their own playlist and no T code there.
- **Order is not checked**: the playlist is not in run-sheet order (standing notices in a fixed
  order, then promos).
- **AM or PM by the service's name**, else EVENT (`Central Team Night`).

✅ Against the live booth and the lookbook, 18 October: AM has 4 of 5, **CT299 Value Your Vote
missing**, CT290 still in; PM lacks CT110 and CT299 and holds CT290 and CT131 Altar Call. Seen in
the dev kiosk on the Mac (this Mac's ProPresenter address set to the booth's, then cleared).

**Loading, the plan (not built):** a folder on the NAS (a setting) that a Smart Playlist in
ProPresenter's Media Bin follows; Pāua copies each missing T code's file into it, found on the
drive by code as Holding does, or the lookbook's after asking, and moves last week's aside; then
PUTs the playlist: its headers and other items kept, the pictures in place, after a confirmation.
Unknowns: whether ProPresenter 18 takes the PUT (`spikes/propresenter-playlist.mjs append …
--write`, at a quiet moment, on a copy of the playlist), whether a Smart Playlist on the NAS
notices new files promptly, and the order rule.

## The first spike

On an Arena machine: turn on the web server, build a multiview Screen in Advanced
Output sent over Syphon or Spout, receive it in a bare Electron window with a texture
addon, and measure Arena's frame rate. Then do the same on the other OS. Receiving is
done (§ The video feed); Arena's side and its frame rate are what is left.

Related: [LOOKBOOK_CHECK.md](LOOKBOOK_CHECK.md), the parked foregrounds check.
