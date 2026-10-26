"use client";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { request } from "@/lib/store";
import type { Food } from "@/lib/types";
async function photoBlob(file: File): Promise<Blob> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn’t prepare the photo. Try again.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn’t prepare the photo."))),
        "image/jpeg",
        0.86,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function LabelScan({
  disabled,
  onRead,
  onBusy,
}: {
  disabled?: boolean;
  onRead: (food: Food, note: string | null) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        className="scanner-torch"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Loader2 size={17} className="spin" /> : <Camera size={17} />}{" "}
        {busy ? "Reading nutrition label…" : "Photograph nutrition label"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          onBusy?.(true);
          setError("");
          try {
            const image = await photoBlob(file),
              form = new FormData();
            form.append("image", image, "label.jpg");
            const result = await request("/api/label", { method: "POST", body: form });
            onRead(result.food, result.note);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t read the label. Try again.");
          } finally {
            setBusy(false);
            onBusy?.(false);
          }
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
