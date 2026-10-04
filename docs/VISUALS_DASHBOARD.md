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
- **Everyone picks**, not only operator mode: an Arena op and a lighting op can each get
  their view.
- **Each machine remembers its layout** across a restart, as it does the run order's
  width.

## Answered (owner, 2026-10-03, evening): triggers, media, the name

- **The trigger screen is wanted now**, not later: tap a clip to play it, fire a column,
  clear a layer, drag a layer's fader. **Everyone may fire**, as everyone picks views:
  it is for a single-screen volunteer op, so no operator-mode guard.
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
  5800 × 2037 by eye. The rule compares names, so it is right by its own terms; whether
  the booth's file should be the lookbook's `-v5` is the owner's call.
- **Not loaded**: AM wants CF464 (`EXP-NextStepsLounge`) where Arena has CF447
  (`NextStepsLounge`, PLAYBACK 6); PM wants CF465 (`EXP-NextStepsUpstairs`) where Arena has
  CF446, and CF594 (`AllCampus-Prayer-Fasting-Oct-1`) where Arena has CF593. Arena also
  holds CB105 (`ReloSeries-Preach`, HOLD BG 3), on neither run sheet.
- **Slots have no names in Arena**: every column is Arena's default `Column #`, so a slot is
  its position. The owner, 2026-10-05: columns 3 and 4 are used, less often: **3 is the
  Countdown**, **4 the Video / Broadcast Background** (a vignetted black behind videos, so
  they sit nicely; at the other campuses only for now, not Central). In this composition
  only HOLD BG has clips there (CB105, CB095).

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
- **Adding and removing tabs is arranging**, so it is in Edit layout (operator mode).
  Switching tabs and **Move it here** are everyone's.
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
- **Saved layouts open in the windows' place** (like Connections), from Layouts in the
  top bar, because a menu over a live page cannot be drawn. The button names the
  layout on screen; switching a tab still counts as that layout. Up to 12.
- **Embeds open only once a window shows them**, so a booth can add many without each
  loading in the background. Off closes the page and keeps its sign-in; removing one
  clears its session, and its folder at the next start. The Google sign-in page on
  Windows raised a **passkey dialog** naming electron.exe as an "untrusted app": that
  is Google offering a passkey, and Cancel or another way in both work.
- **MARK** is for everyone and writes the mode, the layout and the views on screen
  beside the mark's number. **This screen** (Full screen / Window) is in Connections,
  operator mode.

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

- **Edit layout lives in Layouts** (operator mode), not on the bar: one Layouts button
  instead of LAYOUT and EDIT LAYOUT side by side. One more tap to arrange.
- **MARK is a flag icon**, for testers; it says "Mark N" for 3 s when tapped.
- **The mode button is a lock**: Volunteer, closed and quiet; Operator, open, with the
  nacre line under the bar. The words "hold the mode chip" became "hold Volunteer (top
  right)" everywhere.
- **The countdown has no surface while live**, so it reads as a reading, not a button;
  stale and unknown keep their dashed and dotted outlines.
- **Connections is a list and a detail**; Add a web page and This computer are rows of
  their own. It opens on the first connection that is down.
- **Showfile's Save As and Load are two cards a screen apart**, which is how "Load never
  shares a neighbourhood with Save As" is kept now (it was a gap down the page).
- **Add window opens its view menu** at once.
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
  with progress (`.partial` then renamed), loaded into the clip that has the old one, and
  confirmed by the check's own next reading. **Not in Arena**: copied only ("Copy here"), since
  which clip it belongs in is still open (columns are unnamed, by position: § Answered, the
  media check).
- **Guards**: never into a playing clip (checked at sending), nothing overwritten (a same-size
  file of that name is reused, a different one left alone and said), the page sends a code, a
  file name and a clip id and main builds every path, operator mode only.
- ✅ Copy, 2026-10-05, in the kiosk: a 60 MB file found two folders down, progress shown,
  copied, and reused on a second fetch; the folders-not-set message. 260+ tests cover finding,
  copying, no overwrite, a cut-off copy, the `file:///` address and the open request's guards.
- ⚠️ **Not yet watched**: a load through the Fetch button (the live load above was by hand);
  a second file into a clip that already has one (whether its settings stay); what Arena says
  for a path that is not there; copying from the real NAS (speed, the share's path). The
  check's ask to repeat the load test was stopped by this box's safety check. (The ZZ999
  test clip left in PRE & POST, column 9 went with that composition: the Central one
  loaded on 2026-10-05 has nothing there.)
- Not built: fetching straight from the lookbook when the graphics folder lacks a file
  (the lookbook holds the same files), and placing a not-loaded code into a slot.

## Open questions

- **Briefs:** where should a brief's link live? The candidates were the item in the
  Cue Manager, PCO, sent from a phone on the day, or pasted at the booth. The owner is
  undecided. Until then, a plain web-page slot covers it.

## The first spike

On an Arena machine: turn on the web server, build a multiview Screen in Advanced
Output sent over Syphon or Spout, receive it in a bare Electron window with a texture
addon, and measure Arena's frame rate. Then do the same on the other OS. Receiving is
done (§ The video feed); Arena's side and its frame rate are what is left.

Related: [LOOKBOOK_CHECK.md](LOOKBOOK_CHECK.md), the parked foregrounds check.
