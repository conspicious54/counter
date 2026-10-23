import type { Candidate, Entry, Food, Parsed } from "./types";
import { rankFoods } from "./matching";
import { scale } from "./nutrition";
import { estimateKey } from "./estimate-reference";
type LookupOptions = {
  foods: Food[];
  entries: Entry[];
  online: boolean;
  database: boolean;
  search: (query: string, branded: boolean) => Promise<Food[]>;
  estimate?: (p: Parsed) => Promise<Food>;
};
function candidate(food: Food, p: Parsed, alternatives: Food[]): Candidate {
  const c: Candidate = { food, quantity: p.quantity, unit: p.unit, alternatives };
  try {
    scale(c);
  } catch (e) {
    c.warning = (e as Error).message;
  }
  return c;
}
export async function lookupFood(p: Parsed, options: LookupOptions): Promise<Candidate> {
  const local = options.foods.filter((f) => f.source !== "Demo");
  let verified = rankFoods(
    local.filter((f) => f.source !== "AI estimate"),
    p,
    options.entries,
  );
  const remembered = verified.find((f) => !candidate(f, p, verified).warning);
  if (remembered) return candidate(remembered, p, verified);
  // A request failure is not a verified database miss: leave the error visible for retry.
  if (options.online && options.database) {
    const query = [p.brand, p.name, p.preparation].filter(Boolean).join(" ");
    const found = await options.search(query, !!p.brand);
    verified = rankFoods(
      [...verified, ...found.filter((f) => f.source !== "AI estimate")],
      p,
      options.entries,
    );
    if (!verified.length && !p.brand)
      verified = rankFoods(await options.search(p.name, true), p, options.entries);
  }
  if (verified.length) return candidate(verified[0], p, verified);
  // Estimates only reuse an exact description + portion basis, so small/large or gram/serving can't mix.
  const cached = local.find(
    (f) =>
      f.source === "AI estimate" &&
      f.estimate?.inputKey === estimateKey(p) &&
      !candidate(f, p, [f]).warning,
  );
  if (cached) return candidate(cached, p, [cached]);
  if (options.online && options.estimate) {
    const food = await options.estimate(p);
    return candidate(food, p, [food]);
  }
  throw new Error(
    options.online
      ? `No database match for “${p.name}”. Voice AI is unavailable; enter its nutrition label.`
      : `No saved match for “${p.name}”. Connect to look it up or estimate it.`,
  );
}
