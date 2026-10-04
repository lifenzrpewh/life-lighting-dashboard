# texture-bridge, LIFE's Windows build

`@napolab/texture-bridge` 0.15.0 (MIT, github.com/naporin0624/electron-texture-bridge)
receives Arena's Spout output for the Video view (`src/main/video-feed.ts`). As
published it refuses a sender whose texture Electron cannot import, which includes
Arena with **High Detail** on: 16 bits a channel, DXGI format 11.

`life-16bit.patch` makes its Windows receiver draw such a texture into a BGRA8 one
with a one-texel shader pass (the GPU converts on write) instead of copying it, and
report BGRA. 8-bit and half-float senders are copied as before. It applies to upstream
at `7f7d589` (npm's 0.15.0).

`life-ring.patch`, applied after it (2026-10-05, the owner: the Video view "freaks out
when fading down full screen things"): upstream copies every frame into **one** staging
texture and hands it on after a plain `Flush`, so the next copy can land while the page is
still drawing the last, and the page can open a frame the GPU has not finished copying.
Still pictures hide it; a full-screen fade, where every pixel changes each frame, shows it.
The patch keeps **three** staging textures used in turn, and puts a GPU fence (an event
query) behind each copy, waited on (at most 20 ms) **after** Arena's texture is let go, so
Arena's own output never waits on the dashboard. The kiosk allows 60 fps only with this
build (`BUILD.txt` names the ring patch), 30 otherwise.

There are no build tools on the booth box (no admin rights), so
`.github/workflows/texture-bridge.yml` builds it on a GitHub Windows runner whenever
this folder changes, and commits the binary to the `texture-bridge-build` branch. To
bring a build in:

```bash
git fetch origin texture-bridge-build
```

```bash
git checkout origin/texture-bridge-build -- vendor/texture-bridge
```

`vendor/texture-bridge/BUILD.txt` records what it was built from. The kiosk loads
that binary when it is present on Windows and the npm one otherwise. A failed build
pushes its logs to `texture-bridge-build-log` instead.
