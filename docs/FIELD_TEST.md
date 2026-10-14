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

**Updating keeps your settings** (by design, ⚠️ not yet watched): run the new
installer over the old one. Everything Pāua knows (addresses, MA passwords, the
Cue Manager's sign-in, saved layouts) lives in `%APPDATA%\paua`, outside the
install, and the installer never touches it, uninstalling included. It belongs
to the Windows user, so another user on the same PC starts from nothing.

**Getting out:** Alt+F4 on Windows, Cmd+Q on a Mac. It runs full screen; on a
laptop, **Settings › This computer › Window** (Admin) gives it a window.

## First run

Everything starts off. Tap **Volunteer** (top right) for Admin: with no
passcode set yet it opens at once. Then the gear, **Settings**, and tap a
connection to give it an address: the Console first, then Arena, OnTime and
ProPresenter if the booth has them. Set a passcode in **Settings › Admin**
before the booth is left with volunteers. The Cue Manager signs in from its own
column, by QR, approved as this campus's booth device. **Connections** on the
bar is the list anyone can read: what is up, what is down.

## Admin

Admin (called operator mode before 0.2.6) is for changing
settings, layouts and the show. Tap **Volunteer** and enter the passcode, on
Pāua's own keypad or, for one with letters, after **Keyboard**. One tap on
**Admin** goes back. Admin also goes back by itself after a while with nobody
touching anything: 15 minutes unless **Settings › Admin** says 2, 5, 10, 30 or
60. Five wrong tries make the screen wait 30 seconds; it says so.

**Forgotten the passcode?** Quit Pāua (Alt+F4, or Cmd+Q). Open `settings.json`
in the data folder (`%APPDATA%\paua\settings.json` on Windows,
`~/Library/Application Support/paua/settings.json` on a Mac) in Notepad or
TextEdit, delete the `"adminPasscode": { … }` entry and the comma before it,
save, and start Pāua again. Admin then opens with a tap; set a new passcode in
Settings › Admin. Touch nothing else in that file: it holds the booth's
addresses and its sealed MA passwords.

## The log

Pāua writes `paua.log` as it goes, with times on every line:

- Windows: `%APPDATA%\paua\paua.log`
- Mac: `~/Library/Application Support/paua/paua.log`

The path and the version are at the foot of Settings (Admin), where **Show the
log** opens its folder. The file before it is `paua.1.log`.

## Reporting something

When something happens, tap the **flag** in the top bar (MARK in 0.2.0): it writes a numbered
mark in the log at that moment, with what was on screen, and shows the number.
Write the number down with what you saw.

Say: the **version** (foot of Settings), roughly **when** it happened, what
you did, what you saw. Send `paua.log` with it. A photo of the screen helps
more than a description of it.

## What to check

Tick what you saw; anything odd is worth a line.

**1.4.0** (2026-10-14): comes as an update on 1.1.0 to 1.3.0 once its draft on `paua-releases` is
published. New since 1.3.0: **One Lookbook** (Holding merged in) and Settings › Admin › **Leaving
Show mode** (the sections below).

**1.3.0** (2026-10-14): comes as an update on 1.1.0 or 1.2.0, once its draft on `paua-releases` is
published. In it: the Holding fixes, Show mode, and Announcements (the check, and Load), the
sections below.

**Holding fixes** (2026-10-13, merged; in the next build after 1.2.0; `docs/VISUALS_DASHBOARD.md` § The owner's fixes, 2026-10-13)
- [ ] Holding's **Plan** panel says, for every code, where it goes or why not; a tap opens its clip
- [ ] After **Update all**, the line under the header stays ("n loaded · n failed · n already there"), and **Each code** says why a failure failed; `paua.log` has the same as `[holding]` lines
- [ ] A one-off's background lands in its foreground's column, firing the column brings both up; one with no background gets the normal one
- [ ] Announcements and one-off foregrounds go in PROMO 1, 2, 3… in run-sheet order; past the last PROMO, into the spare columns
- [ ] If a load "fails" with a clip that has the file, it shows orange, "sent, though Arena said no"; the log's `[arena] POST` line says what Arena answered (note it)
- [ ] **It's there** on a failure or a missing file: the clip gets an orange hand, the summary reads "All in Arena (1 by hand)" in orange; **Undo** in Inspect takes it back
- [ ] **Place…** on a code in the plan: only its layer's free columns light; the confirmation names each layer; after Load the plan says "by hand", and Update all leaves it there
- [ ] **Files to check**: each mismatch side by side with names, sizes and dates, versions in words; "on the graphics drive" lists the drive's files and which Fetch takes; **Load this one** asks first

**Announcements** (1.3.0)
- [ ] + › Announcements in a window: the service's name, and "n of m in -Announcements AM" (PM for an evening service, EVENT otherwise)
- [ ] Each lower third (T code) of the run sheet with its picture: "In the playlist, item n" or "Not in the playlist"
- [ ] Last week's promo still in the playlist is listed as "not on this run sheet"; headers are left out of it
- [ ] Add the missing one in ProPresenter by hand: within 30 s (or Check again) it turns green

**One Lookbook** (1.4.0; Holding merged into it, 2026-10-14)
- [ ] A Holding tab from before is a Lookbook tab, in the same place; + has no Holding
- [ ] The top line: "n of m in Arena", "n to load", and "n need you", which shows only those; tap again for all
- [ ] The size buttons: Big, Two a row, Rows; the choice is kept after a restart
- [ ] Tick two cards, **Load 2**: one confirmation listing both, a shared background once; after Load, each card says Loading… then In Arena
- [ ] A one-off with no column: "Choose a slot" shows its foreground layer, free columns lit; a tap asks, then it is placed (Placed by hand · Undo)
- [ ] A file that differs: **Compare** on its card shows Arena's beside the lookbook's
- [ ] Lower thirds (with ProPresenter set up): `LT CT108 in ProPresenter`, or amber "not in ProPresenter"
- [ ] As a volunteer: no ticks or buttons, the states and chips still there

**Announcements Load** (1.3.0; Admin; Settings › ProPresenter › Announcements: the folder as this
computer reaches it, Arena's graphics folder set; first run at Central 2026-10-14 into PAUA TEST AM)
- [ ] **Copy to the folder**: the week's T files land numbered (`01 CT108-…`); last week's go into `Old`; one with no file on the drive says so in orange
- [ ] Each row's **Folder** ticks; one with no file says "No file in the folder: left out of the write"
- [ ] Drag the new files from the folder in Finder or Explorer into the media playlist ("Paua"): **Media** ticks within 10 s, and step 2 says "All n in "Paua""
- [ ] Last week's entries left in "Paua" do not tick Media (only a file in the folder now counts)
- [ ] **Write**: the confirmation names the headers it writes and anything left out; after it, "Written and read back: n items", and the playlist in ProPresenter in that order, pictures showing (not missing)
- [ ] The first real Write on "-Announcements AM" replaces it whole (its hand-dragged pictures go): at a quiet time

**Show mode** (the next build after 1.2.0)
- [ ] The tray's Show mode button (four corners): the tab strips and the grips between windows go, and each page fills its window's full height
- [ ] Layouts, Settings and the lock are gone; the lock's place says **Show mode** (or **Show mode · Admin**)
- [ ] Tapping an alert opens nothing; its × still puts it away; Connections opens and reads, but its rows open nothing
- [ ] In Admin, leave it alone past the Admin timeout: it stays Admin
- [ ] Tap **Show mode**: "Leave Show mode" asks the Admin passcode (or leaves at once with none set); a wrong one is refused and it stays; the right one brings the strips back, in Admin
- [ ] Quit and reopen Pāua in Show mode: it comes back in Show mode, as volunteer
- [ ] Settings › Top bar › Show mode hides the way in; the way out still shows while it is on
- [ ] Settings › Admin › Leaving Show mode › **Anyone, with a tap** (1.4.0): a volunteer taps Show mode and is out, still volunteer, no passcode asked; back to **Admin's passcode** and it asks again

**1.2.0** (2026-10-11): comes as an update on 1.1.0 (the bar's "Pāua 1.2.0 is out", then Settings › This computer › Update). Then the section below.

**Alerts, the timer, Add a column** (1.2.0)
- [ ] An alert on the bar (say "Video feed: no sender") has a ×; a tap puts it away, and the Connections dot still shows the fault
- [ ] It comes back when it clears and returns, or says something different; "On the base show" has no ×
- [ ] With OnTime or ProPresenter set up but closed, or nothing counting, the bar shows no countdown box at all (no dotted `?`); a Timer tab says "No countdown running" and why
- [ ] Settings › Holding › Add a column: a name Arena does not have becomes a row, its "Takes" editor open; set something and it stays after closing Settings; its × removes it
- [ ] Name a HOLDING column in Arena the same: the row shows its column number and Holding follows it

**1.1.0** (2026-10-11): install it by hand over 1.0.x, once (it is the first with the updater). Then the sections below: Updates, the Holding map, and the double tap on a tab (§ Edit layout). The onPC-in-session fix: with onPC on this computer in a session, Connections' Console row goes LIVE.

**The Holding map** (Settings › Holding, 1.1.0)
- [ ] With Arena's composition open, every named HOLDING column is a row (PROMO 1 to 6 as their own rows); unnamed columns are not
- [ ] Set a column's words (say WTG takes "Alpha"): Holding shows Alpha's foreground placed in WTG
- [ ] A cell set to **Leave alone**: Update all and Clear old FGs leave that slot be
- [ ] A **Fixed code**: Holding offers it there; Update all loads the drive's file for it
- [ ] **Save as a preset**, **Reset to defaults** (Holding back to the usual), **Use** (back again)
- [ ] **To a file** on one computer, **Import** on another: the same map in use there

**Updates** (from the first build after 1.0.1; needs the public `lifenzrpewh/paua-releases` repo and the `RELEASES_TOKEN` secret, and that version's draft published there)
- [ ] About a minute after the start, the bar says **Pāua <new> is out** (a download icon, quiet blue)
- [ ] As a volunteer, tapping it asks for the Admin passcode; in Admin it opens Settings › This computer
- [ ] **Check for updates** says "is the newest" when nothing is newer, and "Could not check: …" with the network unplugged (never "newest")
- [ ] **Update to <new>** asks once more; **Install now** shows the download counting up, then "Installing"; Pāua closes and opens again by itself on the new version (the foot of Settings says it)
- [ ] Settings, MA logins, the Cue Manager sign-in and saved layouts all survive it
- [ ] What Windows showed, if anything (SmartScreen, a UAC prompt): write it down
- [ ] The watchdog: after the update, kill Paua.exe in Task Manager; it comes back in 5 s

**The video across a tab switch** (1.0.1, for the booth whose Spout picture died on a tab change in 1.0.0)
- [ ] First, Settings › System › Display › Graphics: Paua.exe and Arena both on **High performance**; restart both
- [ ] A Video tab on Arena's Spout output shows the picture
- [ ] Switch to another tab in that window and back, a few times, quickly and after a minute: the picture comes back each time
- [ ] Away for more than 2 minutes, then back: the picture comes back (the log says it opened the sender again)
- [ ] Two Video tabs on the same sender in two windows: both move; switch one away and the other keeps moving
- [ ] If it dies anyway: does **Restart video** bring it back? Send the `[video]` lines from `paua.log`

**The Cue Manager as a device** (the visuals app, live since 2026-10-09; nothing to install here)
- [ ] Signed out, the Cue Manager's column shows only a QR ("Scan this with an admin's phone…"), no email form
- [ ] Scan it with an admin's phone: "Set up this device", with **Existing** (this campus's devices, tap one) and **New** (name and campus). Assign one; the column signs in
- [ ] Signed in as a person (from before): the column says "Pāua signs in as a device" and **Sign out and pair as a device** brings the QR
- [ ] As the device: Account shows the role Device; an open song has no Listen section
- [ ] Rename the device in the app's Admin › Devices on a phone; reload the column: the new name on its Account page

**The plum look and the quieter bar** (1.0.0)
- [ ] The colours: plum-grey surfaces, cream text, one blue for what is selected (the tab showing, a pressed button, Admin's lock). Live green, amber and down red as loud as before. Readable from the booth chair; nothing "soft"
- [ ] Tap between tabs in a window: the blue fill slides to the one tapped
- [ ] The bar on a good day: Layouts on the left and nothing else there; countdown and clock in the middle, each a big number over a grey line; on the right a pulse icon (Connections, its dot a badge) and the lock
- [ ] The bar speaking up: load the base show, and an amber "On the base show: …" appears on the left, a tap opens Save As and Load; stop the console answering, and a red "Console not answering", a tap opens Connections; turn Arena off at the booth, and "Arena: no answer"
- [ ] Connections › the Console row names the show (amber on the base show, `?` and why when unknown) and **Showfile** beside it opens Save As and Load
- [ ] The fold handle (the short bar under the clock): tap it to fold, tap again to unfold; drag it up to fold, down to unfold. By finger: is it easy to find and to hit? Everything still works folded, captions beside their numbers
- [ ] Admin: the lock turns blue and says Admin; Settings is the gear beside it
- [ ] Settings › Top bar › Testing on: a flag appears on the bar; tap it, "Mark 1 written to the log" shows for 3 s, and the log has the line. Testing off: the flag is gone
- [ ] Guide is a view now: Edit layout › + › Guide; the Notion page fills that window, − / + zoom, pop it out and back
- [ ] The passcode keypad's round keys, by finger

**Admin, Settings and the bar** (0.2.6)
- [ ] Installed over 0.2.5: addresses, MA logins, the Cue Manager's sign-in and saved layouts still there; Admin opens with a tap (no passcode yet) and Settings › Admin says so
- [ ] Settings › Admin › Set a passcode, by keypad (digits) and once by Keyboard (letters); tap Admin to leave, tap Volunteer: the passcode sheet opens on the keypad for digits, on the field for letters
- [ ] By finger: the keypad's keys are easy to hit; the Windows touch keyboard (or none) for the Keyboard field
- [ ] Five wrong tries: the screen says to wait 30 seconds, counts down, then takes the right one
- [ ] Forgotten-passcode recovery (§ Admin): delete `adminPasscode`, restart, Admin opens with a tap
- [ ] Settings › Admin timeout at 2 min: Admin drops back by itself after 2 min untouched; working in the MA or the run order keeps it
- [ ] A popped-out Holding or Lookbook follows Admin and volunteer
- [ ] Connections is a list to read as a volunteer (no fields); in Admin, a row opens Settings at that connection
- [ ] ProPresenter's port starts at 1025
- [ ] Fold the bar (the handle since the plum look): every item stays where it was, smaller; Layouts, Connections, Mark, Settings and the lock all still work folded
- [ ] In Admin, at the booth's own screen width: the clock and countdown are never covered; the buttons lose their words, not the clock
- [ ] Settings › Top bar: hide the countdown or Layouts; they leave the bar on this computer only and come back when shown (Mark is Testing's, the Guide a view, since the plum look)
- [ ] Video: with Arena's Spout output picked and no picture, after 10 s the view says why; **Restart video** (the view's ↻, beside the Video feed in Connections, as a volunteer too) brings it back without restarting Pāua. On a computer with two graphics cards, say which
- [ ] As a volunteer: the pencil at the end of a window's strip puts the screen into Edit layout; move, resize, add a window, Done. No "Edit this layout" left in Layouts
- [ ] As a volunteer: Layouts › save the layout on screen under a name, switch away and back, delete it with two taps
- [ ] A double tap on a tab (in or out of Edit layout; the per-tab ✎ is gone since 2026-10-11): name it ("Stage cam"), Done; save the layout, switch to another and back: the name comes with it and the other layout's tab of the same view keeps its own. Empty the name: the view's own name returns. By finger: the Windows touch keyboard comes up for it
- [ ] Edit layout › + › Timer: the countdown fills the window, reads across the booth, matches the bar's chip, goes red past zero; in two windows at once; popped out
- [ ] Installed over 0.2.5: old NDI and capture tabs are now Video tabs showing the same source, under the same name; an old Video tab shows the first sender as before
- [ ] One Video view: + › Video asks what to show; pick an NDI source, a capture input or Arena's Spout output from its list; two Video tabs, two feeds (a camera and the multiview); name them ("Stage cam"); save the layout and come back to it. Settings › Video sources adds NDI sources and capture inputs
- [ ] Two Video tabs asking for two different Spout senders: one shows, the other says "One Spout picture at a time" and Show here swaps them

**Installing**
- [ ] What Windows SmartScreen showed, word for word, and whether Run anyway worked
- [ ] On a Mac: which of the two ways in worked, on which macOS
- [ ] The touch keyboard comes up when you tap into a Cue Manager note (booth touchscreen)

**The console** (a real desk, not onPC)
- [ ] Connections › Console reads Live, and names the loaded show (the console card on the bar until the plum look)
- [ ] The MA view logs in and stays in; volunteer and operator users each see their own
- [ ] Turn the console's Web Remote off and on: the MA view comes back by itself
- [ ] Restart the console: the MA view and LIVE both come back by themselves
- [ ] Save As from Connections › Console › Showfile: the new name comes back on the Console row
- [ ] Load from the same sheet, with "save first" ticked: the show loads, the row follows

**Arena** (with the show's own media)
- [ ] The media check (Arena view › Media): pick this week's service; every code reads ✓, or says why not
- [ ] A clip whose file is missing shows the notice above Clips
- [ ] Clips fire from the Clips view; faders move
- [ ] The Video view shows Arena's output and keeps up

**Volunteer mode, Layouts, backgrounds** (0.2.5)
- [ ] Installed over 0.2.4: Connections' addresses, the MA logging in by itself (passwords kept), the Cue Manager still signed in, saved layouts all still there
- [ ] In volunteer mode, Holding and Lookbook show no Update all, Load, Load all, Clear old FGs or "+ place"; the console card's sheet shows no Save As or Load. Hold for operator mode: they appear
- [ ] Layouts opens as a dropdown over the windows (pages show as still pictures while it is open), from the bar and from the folded strip; tap a layout to switch, tap outside to close
- [ ] Update all fills HOLD BG's empty or old slots up to the last PROMO with the normal background, columns 3 and 4 included; only a column named VIDEO or BROADCAST is left alone
- [ ] Name a HOLD column PREACH in Arena: the message's background (Preach BG) goes there

**Capture inputs** (0.2.4)
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
