import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BarcodeFormat,
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { scannerHints } from "../lib/scanner-config";
function read(pixels: Uint8ClampedArray, width: number, height: number) {
  return new MultiFormatReader().decode(
    new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height))),
    scannerHints(),
  );
}
test("scanner decodes the reported Code 128 food label photograph", () => {
  // Barcode-only crop, without the user's app or phone data.
  const fixture = readFileSync(new URL("./fixtures/store-label.pgm", import.meta.url));
  const header = /^P5\n(\d+) (\d+)\n255\n/.exec(fixture.subarray(0, 40).toString())!;
  const result = read(
    new Uint8ClampedArray(fixture.subarray(header[0].length)),
    Number(header[1]),
    Number(header[2]),
  );
  assert.equal(result.getText(), "791943102043");
  assert.equal(result.getBarcodeFormat(), BarcodeFormat.CODE_128);
});
test("scanner retains standard EAN support", () => {
  // EAN-13 4006381333931, with quiet zones on both sides.
  const bars =
    "00000000000010100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101000000000000";
  const width = bars.length * 3,
    height = 120;
  const pixels = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels[y * width + x] = bars[Math.floor(x / 3)] === "1" ? 0 : 255;
  assert.equal(read(pixels, width, height).getText(), "4006381333931");
});
