"use client";
import { decodeEtekcity, ETEKCITY_SERVICE, ETEKCITY_NOTIFY, type ScaleReading } from "./etekcity";
type NativeWindow = Window & {
  webkit?: { messageHandlers?: { counterScale?: { postMessage: (v: unknown) => void } } };
};
export function scaleSupport() {
  if (typeof window === "undefined") return false;
  return (
    !!(window as NativeWindow).webkit?.messageHandlers?.counterScale || "bluetooth" in navigator
  );
}
// Native iPhone bridge and desktop Web Bluetooth share the same verified decoder.
export async function connectScale(
  onReading: (r: ScaleReading) => void,
  onStatus: (s: string) => void,
): Promise<() => void> {
  const bridge = (window as NativeWindow).webkit?.messageHandlers?.counterScale;
  if (bridge) {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.status) onStatus(detail.status);
      if (typeof detail?.hex === "string" && /^[0-9a-f]{32}$/i.test(detail.hex)) {
        const bytes = Uint8Array.from(detail.hex.match(/../g)! as string[], (b) => parseInt(b, 16));
        const reading = decodeEtekcity(bytes);
        if (reading) onReading(reading);
      }
    };
    window.addEventListener("counter-scale", listen);
    bridge.postMessage({ action: "connect" });
    return () => {
      bridge.postMessage({ action: "disconnect" });
      window.removeEventListener("counter-scale", listen);
    };
  }
  const bluetooth = (navigator as any).bluetooth;
  if (!bluetooth)
    throw new Error(
      "Direct Bluetooth needs the Counter iPhone app, or Chrome/Edge on a computer. Safari does not expose the scale connection.",
    );
  const device = await bluetooth.requestDevice({
    filters: [{ name: "Etekcity Nutrition Scale" }],
    optionalServices: [ETEKCITY_SERVICE],
  });
  let characteristic: any;
  const lost = () => onStatus("Disconnected");
  const notify = (event: any) => {
    const data = event.target.value as DataView;
    const reading = decodeEtekcity(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (reading) onReading(reading);
  };
  try {
    device.addEventListener("gattserverdisconnected", lost);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(ETEKCITY_SERVICE);
    characteristic = await service.getCharacteristic(ETEKCITY_NOTIFY);
    characteristic.addEventListener("characteristicvaluechanged", notify);
    await characteristic.startNotifications();
    onStatus("Connected");
  } catch (error) {
    device.removeEventListener("gattserverdisconnected", lost);
    characteristic?.removeEventListener("characteristicvaluechanged", notify);
    device.gatt?.disconnect();
    throw error;
  }
  return () => {
    device.removeEventListener("gattserverdisconnected", lost);
    characteristic?.removeEventListener("characteristicvaluechanged", notify);
    device.gatt?.disconnect();
  };
}
