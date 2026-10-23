"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { ScanLine } from "lucide-react";
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let controls: IScannerControls | undefined;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false },
        video.current!,
        (result, _, ctl) => {
          if (result && !stopped) {
            stopped = true;
            ctl.stop();
            onCode(result.getText());
          }
        },
      )
      .then((c) => {
        controls = c;
        if (stopped) c.stop();
      })
      .catch(() =>
        setError(
          "Camera unavailable. Allow camera access in Safari settings, or enter the barcode below.",
        ),
      );
    return () => {
      stopped = true;
      controls?.stop();
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="scanner">
      <video ref={video} autoPlay playsInline muted />
      <div className="scan-frame">
        <ScanLine size={34} />
      </div>
      <span>{error || "Hold the barcode inside the frame"}</span>
    </div>
  );
}
