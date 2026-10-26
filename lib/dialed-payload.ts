import type { Entry } from "./types";
import type { BodyWeight } from "./body-weight";
import { dailyTotals, localDay } from "./nutrition";
export type DialedDay = {
  date: string;
  nutrition?: {
    revision: number;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
  weight?: BodyWeight;
};
export function dialedDays(entries: Entry[], weights: BodyWeight[]): DialedDay[] {
  const days = new Map<string, DialedDay>();
  // Tombstones retain the date, so removing the last food explicitly syncs zero.
  for (const date of new Set(entries.filter((e) => e.food.source !== "Demo").map((e) => e.day))) {
    days.set(date, {
      date,
      nutrition: {
        ...dailyTotals(
          entries.filter((e) => e.food.source !== "Demo"),
          date,
        ),
        revision: 1,
      },
    });
  }
  for (const weight of weights) {
    const date = localDay(new Date(weight.recordedAt));
    const current = days.get(date) || { date };
    if (!current.weight || Date.parse(weight.recordedAt) > Date.parse(current.weight.recordedAt))
      current.weight = weight;
    days.set(date, current);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
