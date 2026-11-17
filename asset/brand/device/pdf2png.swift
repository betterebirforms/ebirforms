// Renders page 1 of a PDF to a PNG: swift pdf2png.swift <in.pdf> <out.png> <scale>. og.py uses it for Xcode's device frame.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let scale = CGFloat(Double(a[3])!)
guard let doc = CGPDFDocument(URL(fileURLWithPath: a[1]) as CFURL), let page = doc.page(at: 1) else { exit(1) }
let box = page.getBoxRect(.mediaBox)
let w = Int(box.width * scale), h = Int(box.height * scale)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.scaleBy(x: scale, y: scale)
ctx.drawPDFPage(page)
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)
print(box.width, box.height, w, h)
