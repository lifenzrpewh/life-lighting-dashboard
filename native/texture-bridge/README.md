# texture-bridge, LIFE's Windows build

`@napolab/texture-bridge` 0.15.0 (MIT, github.com/naporin0624/electron-texture-bridge)
receives Arena's Spout output for the Video view (`src/main/video-feed.ts`). As
published it refuses a sender whose texture Electron cannot import, which includes
Arena with **High Detail** on: 16 bits a channel, DXGI format 11.

`life-16bit.patch` makes its Windows receiver draw such a texture into a BGRA8 one
with a one-texel shader pass (the GPU converts on write) instead of copying it, and
report BGRA. 8-bit and half-float senders are copied as before. It applies to upstream
at `7f7d589` (npm's 0.15.0).

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
