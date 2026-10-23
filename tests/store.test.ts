import { test } from "node:test";
import assert from "node:assert/strict";
import { commit, load, subscribe } from "../lib/store";
import { demoFoods } from "../lib/demo";
let disk = new Map<string, string>();
let fail = false;
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => disk.get(key) || null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("Quota exceeded");
      disk.set(key, value);
    },
  },
  configurable: true,
});
test("local save survives reload, queues edits and tombstones, rejects storage failures atomically", () => {
  disk = new Map();
  const initial = load();
  let delivered = 0;
  const stop = subscribe(() => delivered++);
  const entry = {
    id: "1",
    groupId: "m",
    timestamp: "2026-10-22T12:00:00Z",
    day: "2026-10-22",
    food: demoFoods[0],
    quantity: 100,
    unit: "g" as const,
  };
  commit({ ...initial, entries: [entry] });
  assert.equal(load().entries[0].quantity, 100);
  assert.equal(delivered, 2); // commit plus local sync notification
  const before = load();
  fail = true;
  assert.throws(() => commit({ ...before, entries: [{ ...entry, quantity: 250 }] }), /not saved/);
  fail = false;
  assert.equal(load().entries[0].quantity, 100);
  commit({ ...before, entries: [{ ...entry, quantity: 150 }] });
  assert.equal(load().entries[0].quantity, 150);
  const stored = JSON.parse([...disk.values()][0]);
  assert.equal(stored.outbox.filter((r: any) => r.kind === "entry").length, 1);
  commit({ ...load(), entries: [{ ...entry, deleted: true }] });
  assert.equal(load().entries[0].deleted, true);
  assert.equal(
    JSON.parse([...disk.values()][0]).outbox.find((r: any) => r.kind === "entry").payload.deleted,
    true,
  );
  stop();
});
