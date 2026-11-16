import Foundation
import Vision
import CoreImage
import AppKit
let args = CommandLine.arguments
let ctx = CIContext()
for i in stride(from: 1, to: args.count, by: 2) {
  let url = URL(fileURLWithPath: args[i]), out = URL(fileURLWithPath: args[i+1])
  guard let ci = CIImage(contentsOf: url) else { print("cannot read", args[i]); continue }
  let handler = VNImageRequestHandler(ciImage: ci)
  let req = VNGenerateForegroundInstanceMaskRequest()
  do {
    try handler.perform([req])
    guard let obs = req.results?.first else { print("no subject", args[i]); continue }
    let buf = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
    let m = CIImage(cvPixelBuffer: buf)
    try ctx.writePNGRepresentation(of: m, to: out, format: .L8, colorSpace: CGColorSpace(name: CGColorSpace.linearGray)!)
    print("ok", args[i], obs.allInstances.count)
  } catch { print("error", args[i], error) }
}
