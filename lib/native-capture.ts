export type CaptureEvent = {
  id: string;
  type:
    | "recording"
    | "partial"
    | "transcript"
    | "audio"
    | "barcode"
    | "cancelled"
    | "idle"
    | "error";
  text?: string;
  streaming?: boolean;
  base64?: string;
  recordingId?: string;
  code?: string;
  message?: string;
  startupMs?: number;
};
type Handler = { postMessage: (body: object) => void };
export function nativeCaptureHandler(): Handler | undefined {
  if (typeof window === "undefined") return;
  return (window as unknown as { webkit?: { messageHandlers?: { counterCapture?: Handler } } })
    .webkit?.messageHandlers?.counterCapture;
}
export function captureCommand(action: string, id: string, extra: object = {}) {
  nativeCaptureHandler()?.postMessage({ action, id, ...extra });
}
export function subscribeCapture(id: string, receive: (event: CaptureEvent) => void) {
  const listen = (event: Event) => {
    const detail = (event as CustomEvent<CaptureEvent>).detail;
    if (detail?.id === id) receive(detail);
  };
  window.addEventListener("counter-capture", listen);
  return () => window.removeEventListener("counter-capture", listen);
}
export function recordingBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw new Error("Recording is empty or too large.");
  return new Blob([bytes], { type: "audio/mp4" });
}
