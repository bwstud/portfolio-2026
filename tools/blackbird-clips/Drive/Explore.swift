import XCTest
// Runs STEPS (from TEST_RUNNER_STEPS), separated by ';', then dumps the tree.
//   tap:<label>   tap the first hittable element with that label (any type)
//   tapxy:<x>,<y> tap a point (in points)
//   up / down     swipe up / down;  slow:<dy> drag by dy points slowly
//   type:<text>   type into the focused field
//   wait:<s>      pause
//   relaunch      terminate and launch fresh
//   mark:<name>   print a timestamp marker
final class Explore: XCTestCase {
  func testSteps() {
    let app = XCUIApplication(bundleIdentifier: "com.ideagen.blackbird")
    app.activate()
    let steps = (ProcessInfo.processInfo.environment["STEPS"] ?? "").split(separator: ";").map(String.init)
    for s in steps { Drive.step(app, s) }
    if (ProcessInfo.processInfo.environment["NODUMP"] ?? "").isEmpty {
      print("DUMP-BEGIN"); print(app.debugDescription); print("DUMP-END")
    }
  }
}
enum Drive {
  static func step(_ app: XCUIApplication, _ s: String) {
    let parts = s.split(separator: ":", maxSplits: 1).map(String.init)
    let cmd = parts[0], arg = parts.count > 1 ? parts[1] : ""
    switch cmd {
    case "tap":
      let q = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR identifier == %@", arg, arg))
      let e = q.allElementsBoundByIndex.first(where: { $0.isHittable }) ?? q.firstMatch
      if e.waitForExistence(timeout: 4) { e.tap() } else { print("MISSING \(arg)") }
    case "tapc":   // contains
      let q = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", arg))
      let e = q.allElementsBoundByIndex.first(where: { $0.isHittable }) ?? q.firstMatch
      if e.waitForExistence(timeout: 4) { e.tap() } else { print("MISSING \(arg)") }
    case "tapxy":
      let n = arg.split(separator: ",").compactMap { Double($0) }
      app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: n[0], dy: n[1])).tap()
    case "up": app.swipeUp()
    case "down": app.swipeDown()
    case "slow":
      let n = arg.split(separator: ",").compactMap { Double($0) }
      let x = n.count > 2 ? n[2] : 201, y0 = n.count > 1 ? n[1] : 600
      let a = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y0))
      let b = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y0 + n[0]))
      a.press(forDuration: 0.05, thenDragTo: b, withVelocity: XCUIGestureVelocity(300), thenHoldForDuration: 0.3)
    case "swipel":
      let n = arg.split(separator: ",").compactMap { Double($0) }
      let a = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 340, dy: n[0]))
      let b = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 120, dy: n[0]))
      a.press(forDuration: 0.05, thenDragTo: b, withVelocity: XCUIGestureVelocity(500), thenHoldForDuration: 0.2)
    case "type": app.typeText(arg)
    case "typeslow": for c in arg { app.typeText(String(c)); usleep(70_000) }
    case "typewords":   // a word at a time, with its trailing space
      let words = arg.split(separator: " ", omittingEmptySubsequences: false)
      for (i, w) in words.enumerated() { app.typeText(String(w) + (i < words.count - 1 ? " " : "")) }
    case "wait": usleep(UInt32((Double(arg) ?? 1) * 1_000_000))
    case "relaunch": app.terminate(); app.launch()
    case "mark":
      let t = Date().timeIntervalSince1970
      print("MARK \(arg) \(t)")
      // also as a file, read while the test is still running (xcodebuild prints the log only at the end)
      if let dir = ProcessInfo.processInfo.environment["MARKS"] {
        try? "\(t)".write(toFile: dir + "/" + arg, atomically: true, encoding: .utf8)
      }
    default: print("UNKNOWN \(s)")
    }
  }
}
