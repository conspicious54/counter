export type BodyWeight = { id: string; kilograms: number; recordedAt: string };
export const BODY_WEIGHT_KEY = "counter.body-weight.v1";
export function validBodyWeight(value: unknown): value is BodyWeight {
  if (!value || typeof value !== "object") return false;
  const r = value as BodyWeight;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    r.id.length <= 128 &&
    typeof r.kilograms === "number" &&
    Number.isFinite(r.kilograms) &&
    r.kilograms >= 0.1 &&
    r.kilograms <= 500 &&
    typeof r.recordedAt === "string" &&
    Number.isFinite(Date.parse(r.recordedAt))
  );
}
export function mergeBodyWeights(existing: BodyWeight[], incoming: unknown[]): BodyWeight[] {
  const merged = new Map(existing.filter(validBodyWeight).map((r) => [r.id, r]));
  for (const r of incoming)
    if (validBodyWeight(r))
      merged.set(r.id, { id: r.id, kilograms: r.kilograms, recordedAt: r.recordedAt });
  return [...merged.values()].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id.localeCompare(b.id),
  );
}
export function readBodyWeights(): BodyWeight[] {
  const raw = localStorage.getItem(BODY_WEIGHT_KEY);
  if (!raw) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records))
    throw new Error("Body-weight cache could not be read. Native weigh-ins remain on your iPhone.");
  return mergeBodyWeights([], records);
}
export function storeBodyWeights(incoming: unknown[]): BodyWeight[] {
  // Read/merge/write before publishing. Native retains its ledger and replays it on every app resume.
  let existing: BodyWeight[];
  try {
    existing = readBodyWeights();
  } catch {
    // A full native replay can repair a corrupt web cache without discarding its original bytes.
    const raw = localStorage.getItem(BODY_WEIGHT_KEY);
    if (raw) localStorage.setItem(BODY_WEIGHT_KEY + ".recovery", raw);
    existing = [];
  }
  const next = mergeBodyWeights(existing, incoming);
  localStorage.setItem(BODY_WEIGHT_KEY, JSON.stringify(next));
  return next;
}
type NativeBodyWindow = Window & {
  webkit?: {
    messageHandlers?: { counterBody?: { postMessage: (message: { action: string }) => void } };
  };
};
export function bodyScaleAvailable() {
  return !!(window as NativeBodyWindow).webkit?.messageHandlers?.counterBody;
}
export function bodyScaleAction(action: "sync" | "show") {
  (window as NativeBodyWindow).webkit?.messageHandlers?.counterBody?.postMessage({ action });
}
