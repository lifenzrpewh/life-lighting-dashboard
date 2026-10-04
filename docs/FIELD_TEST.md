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

When something happens, tap **MARK** in the status bar (the flag, from the build after 0.2.0): it writes a numbered
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
- [ ] The status bar reads LIVE, and the showfile chip names the loaded show
- [ ] The MA view logs in and stays in; volunteer and operator users each see their own
- [ ] Turn the console's Web Remote off and on: the MA view comes back by itself
- [ ] Restart the console: the MA view and LIVE both come back by themselves
- [ ] Save As from the showfile chip's ▸: the new name comes back on the chip
- [ ] Load from the same sheet, with "save first" ticked: the show loads, the chip follows

**Arena** (with the show's own media)
- [ ] The media check (Arena view › Media): pick this week's service; every code reads ✓, or says why not
- [ ] A clip whose file is missing shows the notice above Clips
- [ ] Clips fire from the Clips view; faders move
- [ ] The Video view shows Arena's output and keeps up

**Windows and layouts** (0.2.0)
- [ ] Edit layout (operator mode, status bar): move a window, resize it by an edge, add one, add and remove tabs
- [ ] A second MA tab says "Only one MA window at a time"; Move it here brings the MA over without logging in again
- [ ] Save the layout under a name (LAYOUT in the status bar; Layouts after 0.2.0), change it, then switch back as a volunteer
- [ ] Pop a tab out, Send behind, then Show from its tab; Bring back

**Embeds** (0.2.0)
- [ ] Connections › Add a web page: a Google Sheet; sign in inside it (say what Google showed, passkey prompts included)
- [ ] Zoom it with − / +; it keeps its zoom after a restart
- [ ] A link that opens a new window opens in the computer's browser
- [ ] Two embeds signed in to two different Google accounts stay apart

**Generally**
- [ ] Anything a volunteer found confusing, in their words
