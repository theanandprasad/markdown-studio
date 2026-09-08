// Renders the app icon (rounded square, "M" with a down arrow) into build/icon.iconset.
import AppKit

let sizes: [(String, Int)] = [
  ("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
  ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256), ("icon_256x256@2x", 512),
  ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]
let outDir = "build/icon.iconset"
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func render(size: Int) -> NSImage {
  let s = CGFloat(size)
  let img = NSImage(size: NSSize(width: s, height: s))
  img.lockFocus()
  let inset = s * 0.08
  let rect = NSRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
  let path = NSBezierPath(roundedRect: rect, xRadius: s * 0.2, yRadius: s * 0.2)
  let grad = NSGradient(colors: [NSColor(calibratedRed: 0.24, green: 0.45, blue: 0.98, alpha: 1), NSColor(calibratedRed: 0.13, green: 0.28, blue: 0.80, alpha: 1)])!
  grad.draw(in: path, angle: -60)

  // "M" glyph
  let para = NSMutableParagraphStyle(); para.alignment = .center
  let font = NSFont.systemFont(ofSize: s * 0.56, weight: .heavy)
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: para]
  let str = NSAttributedString(string: "M", attributes: attrs)
  let textSize = str.size()
  str.draw(in: NSRect(x: 0, y: (s - textSize.height) / 2 + s * 0.04, width: s, height: textSize.height))

  // small down arrow (markdown mark) at bottom right
  let arrow = NSBezierPath()
  let cx = s * 0.74, cy = s * 0.28, aw = s * 0.11, ah = s * 0.10
  arrow.move(to: NSPoint(x: cx - aw, y: cy + ah * 0.6))
  arrow.line(to: NSPoint(x: cx + aw, y: cy + ah * 0.6))
  arrow.line(to: NSPoint(x: cx, y: cy - ah * 0.8))
  arrow.close()
  NSColor(calibratedWhite: 1, alpha: 0.9).setFill()
  arrow.fill()
  img.unlockFocus()
  return img
}

for (name, size) in sizes {
  let img = render(size: size)
  guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { continue }
  rep.size = NSSize(width: size, height: size)
  let png = rep.representation(using: .png, properties: [:])!
  try! png.write(to: URL(fileURLWithPath: "\(outDir)/\(name).png"))
}
print("wrote \(sizes.count) icons to \(outDir)")
