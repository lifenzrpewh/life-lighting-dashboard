# Pāua field test

For whoever is trying Pāua at a booth. It's the touchscreen dashboard beside
the grandMA3: the run order (Cue Manager), the MA's web remote, Arena's clips
and video, and any web page you add (a Google Sheet, say), in windows you
arrange on a grid.

This is a test build. Nothing here can change the show except what an
operator does on purpose (Save As, Load, firing a clip), and the console is
always the fallback.

## Installing

**Windows** (`Paua-Setup-<version>.exe`). Run it; it installs for you alone,
no admin rights, and opens when done. The build is not signed, so Windows
SmartScreen may stop it: **More info › Run anyway**. Please note what it said
(see the checklist).

**Mac, Apple Silicon only** (`Paua-<version>-arm64.dmg`). Open it and drag Pāua
into Applications. The build is not signed by Apple, so the first open is
refused. Either:

- open it once, then **System Settings › Privacy & Security**, scroll down,
  **Open Anyway**; or
- in Terminal: `xattr -dr com.apple.quarantine /Applications/Paua.app`

Each new build asks again. The first time it stores an MA password, macOS asks
whether Pāua may use the keychain: **Always Allow**. That too comes back with
each new build.

**Getting out:** Alt+F4 on Windows, Cmd+Q on a Mac. It runs full screen; on a
laptop, **Connections › This screen › Window** (operator mode) gives it a window.

## First run

Everything starts off. Tap **Connections** in the status bar, hold the mode
chip for 3 s for operator mode, then tap a row to give it an address: the
Console first, then Arena, OnTime and ProPresenter if the booth has them. The
Cue Manager signs in from its own column, by QR, approved as this campus's
booth device.

## The log

Pāua writes `paua.log` as it goes, with times on every line:

- Windows: `%APPDATA%\paua\paua.log`
- Mac: `~/Library/Application Support/paua/paua.log`

The path and the version are at the foot of Connections; in operator mode,
**Show the log** opens its folder. The file before it is `paua.1.log`.

## Reporting something

When something happens, tap the **flag** in the top bar (MARK in 0.2.0): it writes a numbered
mark in the log at that moment, with what was on screen, and shows the number.
Write the number down with what you saw.

Say: the **version** (foot of Connections), roughly **when** it happened, what
you did, what you saw. Send `paua.log` with it. A photo of the screen helps
more than a description of it.

## What to check

Tick what you saw; anything odd is worth a line.

**Installing**
- [ ] What Windows SmartScreen showed, word for word, and whether Run anyway worked
- [ ] On a Mac: which of the two ways in worked, on which macOS
- [ ] The touch keyboard comes up when you tap into a Cue Manager note (booth touchscreen)

**The console** (a real desk, not onPC)
- [ ] The console card (top left) reads Live, and names the loaded show
- [ ] The MA view logs in and stays in; volunteer and operator users each see their own
- [ ] Turn the console's Web Remote off and on: the MA view comes back by itself
- [ ] Restart the console: the MA view and LIVE both come back by themselves
- [ ] Save As from the console card: the new name comes back on the card
- [ ] Load from the same sheet, with "save first" ticked: the show loads, the card follows

**Arena** (with the show's own media)
- [ ] The media check (Arena view › Media): pick this week's service; every code reads ✓, or says why not
- [ ] A clip whose file is missing shows the notice above Clips
- [ ] Clips fire from the Clips view; faders move
- [ ] The Video view shows Arena's output and keeps up

**Capture inputs** (after 0.2.3, in the next build)
- [ ] Connections › Add a capture input (operator mode) lists this computer's cameras: a Blackmagic card's inputs (Desktop Video installed), an ATEM Mini on USB, OBS Virtual Camera, a webcam
- [ ] A Blackmagic input shows its picture; say the card, the signal's format, and whether it still works while Arena uses the same card
- [ ] OBS: Start Virtual Camera in OBS first; then the view shows OBS's output
- [ ] Unplug it or stop OBS's camera: the view says it stopped, and comes back by itself when it returns

**NDI sources** (0.2.3)
- [ ] Connections › Add an NDI source (operator mode) lists the booth's NDI sources (a camera, ProPresenter, Arena); Add one
- [ ] Put it in a window (Edit layout, a window's +): the picture shows and keeps up; the strip says its size and frames a second
- [ ] Turn the source off at its end: the view says it stopped, then that it is not on the network; back on, it returns by itself
- [ ] A computer without NDI installed says so in words, not a blank view (NDI comes with ProPresenter, or ndi.video's NDI Tools)
- [ ] Anything slow elsewhere on screen while an NDI view shows (it costs the kiosk's page more than the Video view)
- [ ] Also in 0.2.3: the Video view through Arena's fades to black (fixed: no frozen picture), the Lookbook view, Guide on the top bar

**Media, the bar, tabs and video** (0.2.2)
- [ ] Holding view: a clip that's right shows only its code; amber marks one to look at; a dashed "+ place" tile sits where a run-sheet item belongs and isn't yet
- [ ] A one-off with no column waits in the "No column" tray: tap it, then a lit slot; it stays placed for that service
- [ ] Update all with a clip on screen: the red tick asks first, and the picture changes cleanly when you say yes (say what the audience saw)
- [ ] The top bar's ⌃ (far right) folds it to a thin strip; ⌄ brings it back; it stays as you left it after a restart
- [ ] Edit layout: drag a tab along its strip to reorder it, and onto another window to move it (by finger: does the strip scroll instead?)
- [ ] Video view during a full-screen fade in Arena: smooth, no tearing or flicker; the frame rate (it may now reach 60)

**The new look** (0.2.1)
- [ ] Hold Volunteer (top right) for 3 s: it turns to Operator with a coloured line under the bar; one tap goes back
- [ ] Anything that reads too dim, too small or too close together from where a volunteer stands
- [ ] Drag the edge between two windows by finger: it follows smoothly and snaps to the other windows' edges

**Windows and layouts** (0.2.0, rearranged in 0.2.1)
- [ ] Layouts › Edit this layout (operator mode): move a window, resize it by an edge or corner, add one (its view menu opens), add and remove tabs
- [ ] A second MA tab says the MA is showing in another window; Move it here brings it over without logging in again
- [ ] Save the layout under a name (Layouts, top right), change it, then switch back to it as a volunteer by its picture
- [ ] Pop a tab out, Send behind, then Show from its tab; Bring back

**Embeds** (0.2.0)
- [ ] Connections › Add a web page: a Google Sheet; sign in inside it (say what Google showed, passkey prompts included)
- [ ] Zoom it with − / +; it keeps its zoom after a restart
- [ ] A link that opens a new window opens in the computer's browser
- [ ] Two embeds signed in to two different Google accounts stay apart

**Generally**
- [ ] Anything a volunteer found confusing, in their words
