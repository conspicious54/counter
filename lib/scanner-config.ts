import { BarcodeFormat, DecodeHintType } from "@zxing/library";
// Packaged foods use UPC/EAN; store-printed food labels often use Code 128 or ITF.
export function scannerHints() {
  return new Map<DecodeHintType, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ],
    ],
    [DecodeHintType.TRY_HARDER, true],
  ]);
}
