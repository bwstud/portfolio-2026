# Blackbird clips

Live clips of the Blackbird iOS app (~/Projects/Personal/Blackbird) for the Work page's reel (bb-reel.js). The app
itself is never edited: a separate UI-test project here drives the installed app in the simulator.

1. Build and install the app on the booted simulator, outside the app's folder:
   `xcodebuild -project ~/Projects/Personal/Blackbird/Blackbird.xcodeproj -scheme Blackbird -destination 'id=<sim>' -derivedDataPath <scratch>/bbdd build`
   then `xcrun simctl install booted <scratch>/bbdd/Build/Products/Debug-iphonesimulator/Blackbird.app`.
2. Copy this folder somewhere scratch, `xcodegen generate`, then
   `xcodebuild -project BBDriver.xcodeproj -scheme Drive -destination 'id=<sim>' -derivedDataPath dd build-for-testing`.
   (run.sh has the simulator id in it.)
3. `./run.sh "<steps>" <shot>` explores: it taps, then prints the accessibility tree and saves a screenshot.
   `./recall.sh <dark|light> [name …]` records the clips in clips.txt (`name|setup|clip steps|steps to put the app back`)
   through `rec.sh`, into masters/ at 60fps, with a frame strip of each in shots/. Steps are listed at the top of
   Drive/Explore.swift. Prefer tapxy inside a clip: a tap by label costs about a second while XCUITest looks the
   element up. A clip that begins after a demo trigger (Raise Alarm, Scan Machine, a persona) places its own
   mark:start after the menu has closed, so the app's demo menus never show; mark:flip switches light and dark
   mid-clip. Don't run anything heavy while recording: the capture drops frames under load.
4. `./encode.sh <masters dir>` writes images/blackbird-screens/clips/ (H.264 and AV1 at 60fps, first-frame poster),
   and work.html's data-clips lists the names in ring order (bb-reel.js puts the dark ones at even places and the light
   ones, half the list later, at odd places).
