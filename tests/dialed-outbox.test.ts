import test from "node:test";
import assert from "node:assert/strict";
import { watchDialedSync } from "../lib/dialed-sync";
import { emptyData } from "../lib/store";
import type { Entry } from "../lib/types";
const disk = new Map<string, string>(),
  windowEvents = new EventTarget(),
  documentEvents = new EventTarget();
Object.defineProperty(globalThis, "window", { value: windowEvents, configurable: true });
Object.defineProperty(globalThis, "document", {
  value: Object.assign(documentEvents, { visibilityState: "visible" }),
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => disk.get(k) || null,
    setItem: (k: string, v: string) => disk.set(k, v),
  },
  configurable: true,
});
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 80; i++) {
    if (check()) return;
    await pause(20);
  }
  throw new Error("Sync did not finish");
}
test("durable outbox retries failures and sends latest edits without blocking the caller", async () => {
  const data = emptyData();
  const entry: Entry = {
    id: "e",
    groupId: "g",
    day: "2026-10-25",
    timestamp: "2026-10-25T15:00:00Z",
    quantity: 100,
    unit: "g",
    food: {
      id: "f",
      name: "Food",
      source: "Custom",
      basis: { quantity: 100, unit: "g" },
      nutrients: { calories: 150, protein: 4, carbs: 30, fat: 0 },
    },
  };
  data.entries = [entry];
  let calls: any[] = [],
    failed = false,
    synced = false;
  windowEvents.addEventListener("counter-dialed-status", (event: Event) => {
    const state = (event as CustomEvent).detail.state;
    failed ||= state === "error";
    synced ||= state === "synced";
  });
  const original = globalThis.fetch;
  globalThis.fetch = (async (path, options) => {
    if (!options?.method) return Response.json({ configured: true });
    calls.push(JSON.parse(String(options.body)));
    return calls.length === 1
      ? Response.json({ error: "temporary outage" }, { status: 503 })
      : Response.json({ synced: true });
  }) as typeof fetch;
  const stop = watchDialedSync(() => data);
  try {
    assert.equal(calls.length, 0);
    await until(() => failed);
    let queue = JSON.parse(disk.get("counter.dialed-outbox.v1")!);
    assert.equal(queue.pending["2026-10-25"].day.nutrition.calories, 150);
    data.entries = [{ ...entry, quantity: 200 }];
    windowEvents.dispatchEvent(new Event("counter-data-saved"));
    await until(() => synced);
    assert.equal(calls[1].days[0].nutrition.calories, 300);
    queue = JSON.parse(disk.get("counter.dialed-outbox.v1")!);
    assert.equal(Object.keys(queue.pending).length, 0);
    windowEvents.dispatchEvent(new Event("counter-data-saved"));
    await pause(160);
    assert.equal(calls.length, 2);
  } finally {
    stop();
    globalThis.fetch = original;
  }
});

test("edits made during an upload are flushed immediately after it instead of waiting for the retry timer", async () => {
  disk.clear();
  const data = emptyData();
  data.entries = [
    {
      id: "e",
      groupId: "g",
      day: "2026-10-25",
      timestamp: "2026-10-25T15:00:00Z",
      quantity: 100,
      unit: "g",
      food: {
        id: "f",
        name: "Food",
        source: "Custom",
        basis: { quantity: 100, unit: "g" },
        nutrients: { calories: 150, protein: 4, carbs: 30, fat: 0 },
      },
    },
  ];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const calls: any[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (path, options) => {
    if (!options?.method) return Response.json({ configured: true });
    calls.push(JSON.parse(String(options.body)));
    if (calls.length === 1) await gate;
    return Response.json({ synced: true });
  }) as typeof fetch;
  const stop = watchDialedSync(() => data);
  try {
    await until(() => calls.length === 1);
    data.entries = [{ ...data.entries[0], quantity: 200 }];
    windowEvents.dispatchEvent(new Event("counter-data-saved"));
    release();
    await until(() => calls.length === 2);
    assert.equal(calls[1].days[0].nutrition.calories, 300);
    await until(
      () => Object.keys(JSON.parse(disk.get("counter.dialed-outbox.v1")!).pending).length === 0,
    );
  } finally {
    release();
    stop();
    globalThis.fetch = original;
  }
});
