import type { WaterEntry } from "./types";
import { localDay } from "./nutrition";
export const waterContainers = {
  yeti: { name: "Yeti", ounces: 42 },
  hydro: { name: "Hydro Flask", ounces: 16 },
} as const;
export type WaterContainer = keyof typeof waterContainers;
export function makeWaterEntry(
  container: WaterContainer,
  day = localDay(),
  now = new Date(),
): WaterEntry {
  if (!waterContainers[container]) throw new Error("Unknown water container.");
  return {
    id: crypto.randomUUID(),
    container,
    ounces: waterContainers[container].ounces,
    day,
    timestamp: now.toISOString(),
  };
}
export function dailyWater(entries: WaterEntry[] = [], day: string) {
  const drinks = entries
    .filter((entry) => !entry.deleted && entry.day === day)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    drinks,
    ounces: drinks.reduce((sum, entry) => sum + entry.ounces, 0),
    count: drinks.length,
  };
}
export function removeWater(entries: WaterEntry[], id: string) {
  return entries.map((entry) => (entry.id === id ? { ...entry, deleted: true } : entry));
}
