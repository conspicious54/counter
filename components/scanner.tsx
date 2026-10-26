"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { scannerHints } from "@/lib/scanner-config";
import { Flashlight, FlashlightOff, ScanLine } from "lucide-react";
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const video = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const active = useRef(true);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [torchError, setTorchError] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    active.current = true;
    setTorch(false);
    setTorchAvailable(false);
    setTorchBusy(false);
    setTorchError("");
    const element = video.current;
    let controls: IScannerControls | undefined;
    const hideLight = () => {
      if (document.visibilityState === "hidden")
        void controls
          ?.switchTorch?.(false)
          .then(() => {
            if (!stopped) setTorch(false);
          })
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", hideLight);
    const reader = new BrowserMultiFormatReader(scannerHints(), {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 500,
    });
    let capture: MediaStream | undefined;
    // Paint the selected mode before requesting hardware; abandon late grants.
    const startTimer = setTimeout(() => {
      void (async () => {
        capture = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (stopped) {
          capture.getTracks().forEach((t) => t.stop());
          return;
        }
        return reader.decodeFromStream(capture, element!, (result, _, ctl) => {
          if (result && !stopped) {
            stopped = true;
            active.current = false;
            ctl.stop();
            onCodeRef.current(result.getText());
          }
        });
      })()
        .then((c) => {
          if (!c) return;
          controls = c;
          if (stopped) c.stop();
          else {
            controlsRef.current = c;
            const stream = element?.srcObject as MediaStream | null;
            const capability = stream?.getVideoTracks()[0]?.getCapabilities?.() as
              | (MediaTrackCapabilities & { torch?: boolean })
              | undefined;
            setTorchAvailable(typeof c.switchTorch === "function" && capability?.torch !== false);
          }
        })
        .catch(() => {
          if (!stopped)
            setError(
              "Camera unavailable. Allow camera access in your device settings, or enter the barcode below.",
            );
        });
    }, 0);
    return () => {
      clearTimeout(startTimer);
      capture?.getTracks().forEach((t) => t.stop());
      stopped = true;
      document.removeEventListener("visibilitychange", hideLight);
      active.current = false;
      controlsRef.current = null;
      controls?.stop();
      const stream = element?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="scanner-wrap">
      <div className="scanner-toolbar">
        <strong>Scan barcode</strong>
        <button
          type="button"
          className="scanner-torch"
          aria-label={torch ? "Turn flashlight off" : "Turn flashlight on"}
          aria-pressed={torch}
          disabled={!torchAvailable || torchBusy}
          title={torchAvailable ? "Camera flashlight" : "Flashlight unavailable on this camera"}
          onClick={async () => {
            const controls = controlsRef.current;
            if (!controls?.switchTorch) return;
            setTorchBusy(true);
            setTorchError("");
            try {
              await controls.switchTorch(!torch);
              if (
                active.current &&
                controlsRef.current === controls &&
                document.visibilityState === "visible"
              )
                setTorch(!torch);
              else await controls.switchTorch(false);
            } catch {
              if (active.current && controlsRef.current === controls)
                setTorchError("Flashlight unavailable. Try moving to better light.");
            } finally {
              if (active.current && controlsRef.current === controls) setTorchBusy(false);
            }
          }}
        >
          {torch ? <FlashlightOff size={17} /> : <Flashlight size={17} />}{" "}
          {torch ? "Flash on" : "Flash"}
        </button>
      </div>
      <div className="scanner">
        <video ref={video} autoPlay playsInline muted />
        <div className="scan-frame">
          <ScanLine size={34} />
        </div>
        <span>{error || torchError || "Hold the barcode inside the frame"}</span>
      </div>
    </div>
  );
}
