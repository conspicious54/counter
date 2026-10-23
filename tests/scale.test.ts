import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEtekcity, usableWeight } from "../lib/scale/etekcity";
const packet = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
test("physical ENS-C551S-SUS capture decodes verified 25 g and stable state", () => {
  const reading = decodeEtekcity(packet("a502640a00c80183a10000fa00020001"), 1000)!;
  assert.equal(reading.grams, 25);
  assert.equal(reading.stable, true);
  assert.equal(usableWeight(reading, 999, 1100), true);
});
test("transient capture is not accepted as ingredient weight", () => {
  const reading = decodeEtekcity(packet("a502630a00ca0183a10000fa00020000"), 1000)!;
  assert.equal(reading.grams, 25);
  assert.equal(usableWeight(reading, 999, 1100), false);
});
test("ounces are not interpreted as grams", () => {
  const r = decodeEtekcity(packet("a502fe0a00da0183a100005000000001"), 1000)!;
  assert.equal(r.grams, null);
  assert.equal(usableWeight(r, 999, 1100), false);
});
test("rejects malformed, unsupported and corrupted packets", () => {
  assert.equal(decodeEtekcity(new Uint8Array(11)), null);
  const bad = packet("a502640a00c80183a10000fa00020001");
  bad[11]++;
  assert.equal(decodeEtekcity(bad), null);
});
test("never applies stale, preselection, zero, negative, or excessive readings", () => {
  const base = { grams: 25, stable: true, timestamp: 1000, unitCode: 2 };
  assert.equal(usableWeight(base, 1001, 1100), false);
  assert.equal(usableWeight(base, 900, 4000), false);
  for (const grams of [0, -25, 5001])
    assert.equal(usableWeight({ ...base, grams }, 900, 1100), false);
});
