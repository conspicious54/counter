"use client";
import { useEffect, useRef, useState } from "react";
import { Barcode, Loader2 } from "lucide-react";
import { captureCommand, subscribeCapture } from "@/lib/native-capture";
import { Button } from "./ui/button";
export function NativeScanner({ onCode }: { onCode: (code: string) => void }) {
  const id = useRef("");
  const callback = useRef(onCode);
  callback.current = onCode;
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    id.current = crypto.randomUUID();
    const unsubscribe = subscribeCapture(id.current, (event) => {
      if (event.type === "barcode" && event.code) callback.current(event.code);
      if (event.type === "cancelled" || event.type === "error") {
        setOpening(false);
        setError(event.message || "");
      }
    });
    captureCommand("scan.start", id.current);
    return () => {
      unsubscribe();
      captureCommand("scan.cancel", id.current);
    };
  }, []);
  return (
    <div className="scanner-wrap">
      <Button
        variant="outline"
        disabled={opening}
        onClick={() => {
          setOpening(true);
          setError("");
          captureCommand("scan.start", id.current);
        }}
      >
        {opening ? <Loader2 size={18} className="spin" /> : <Barcode size={18} />}
        {opening ? "Opening camera…" : "Open camera"}
      </Button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
