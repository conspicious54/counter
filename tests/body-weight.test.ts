import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_WEIGHT_KEY,
  mergeBodyWeights,
  readBodyWeights,
  storeBodyWeights,
  validBodyWeight,
} from "../lib/body-weight";
const example = { id: "native-1", kilograms: 80, recordedAt: "2026-10-23T05:59:00Z" };
test("native body-weight replay deduplicates IDs, preserves distinct equal weigh-ins, and sorts UTC instants", () => {
  const later = { ...example, id: "native-2", recordedAt: "2026-10-23T06:01:00Z" };
  const records = mergeBodyWeights(
    [later],
    [example, example, later, { kilograms: 100 }, { ...example, id: "bad", kilograms: NaN }],
  );
  assert.deepEqual(records, [example, later]);
  assert.equal(validBodyWeight({ ...example, kilograms: 0 }), false);
  assert.equal(validBodyWeight({ ...example, recordedAt: "invalid" }), false);
  assert.equal(validBodyWeight({ id: "food", grams: 100, recordedAt: example.recordedAt }), false);
});
test("web body-weight cache replays idempotently and never publishes success after a failed disk write", () => {
  const disk = new Map<string, string>();
  let fail = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => disk.get(key) || null,
      setItem: (key: string, value: string) => {
        if (fail) throw new Error("full");
        disk.set(key, value);
      },
    },
  });
  assert.deepEqual(readBodyWeights(), []);
  storeBodyWeights([example]);
  storeBodyWeights([example]);
  assert.deepEqual(readBodyWeights(), [example]);
  const before = disk.get(BODY_WEIGHT_KEY);
  fail = true;
  assert.throws(() => storeBodyWeights([{ ...example, id: "native-2" }]));
  assert.equal(disk.get(BODY_WEIGHT_KEY), before);
  fail = false;
  assert.equal(storeBodyWeights([{ ...example, id: "native-2" }]).length, 2);
  disk.set(BODY_WEIGHT_KEY, "broken");
  assert.throws(() => readBodyWeights());
});
