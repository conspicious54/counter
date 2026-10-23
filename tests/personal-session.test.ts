import { test } from "node:test";
import assert from "node:assert/strict";
import { issueSession, validSession, validAccessCode, SESSION_AGE } from "../lib/personal-session";
test("personal session rejects missing, forged, expired, and rotated credentials", () => {
  const now = Date.now(),
    secret = "random-long-test-code";
  const token = issueSession(secret, now);
  assert.equal(validSession(token, secret, now), true);
  assert.equal(validSession(undefined, secret, now), false);
  assert.equal(validSession(token + "x", secret, now), false);
  assert.equal(validSession(token, "new-secret", now), false);
  assert.equal(validSession(token, secret, now + (SESSION_AGE + 1) * 1000), false);
  assert.equal(validSession("123.foo.bar", secret, now), false);
  assert.equal(validAccessCode(secret, secret), true);
  assert.equal(validAccessCode("incorrect", secret), false);
});
