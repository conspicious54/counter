// ENS-C551S-SUS format verified on physical hardware, October 22, 2026.
// Only gram mode is accepted. Other models/packet layouts are intentionally rejected.
export type ScaleReading = {
  grams: number | null;
  stable: boolean;
  timestamp: number;
  unitCode: number;
};
export const ETEKCITY_SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
export const ETEKCITY_NOTIFY = "0000fff1-0000-1000-8000-00805f9b34fb";
export function decodeEtekcity(bytes: Uint8Array, timestamp = Date.now()): ScaleReading | null {
  if (
    bytes.length !== 16 ||
    bytes[0] !== 0xa5 ||
    bytes[1] !== 0x02 ||
    bytes[3] !== 0x0a ||
    bytes[6] !== 1 ||
    bytes[7] !== 0x83 ||
    bytes[8] !== 0xa1
  )
    return null;
  if (bytes.reduce((sum, b) => sum + b, 0) % 256 !== 255 || bytes[10] > 1 || bytes[15] > 1)
    return null;
  const unitCode = bytes[13];
  return {
    grams:
      unitCode === 2 && bytes[14] === 0
        ? ((bytes[11] + 256 * bytes[12]) / 10) * (bytes[10] === 1 ? -1 : 1)
        : null,
    stable: bytes[15] === 1,
    timestamp,
    unitCode,
  };
}
export function usableWeight(reading: ScaleReading | null, armedAt: number, now = Date.now()) {
  return (
    !!reading &&
    reading.grams !== null &&
    reading.grams > 0 &&
    reading.grams <= 5000 &&
    reading.stable &&
    reading.timestamp >= armedAt &&
    now - reading.timestamp >= 0 &&
    now - reading.timestamp <= 2500
  );
}
