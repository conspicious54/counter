import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const SESSION_COOKIE = "counter-session";
export const SESSION_AGE = 180 * 24 * 60 * 60;
function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function validAccessCode(code: string, secret: string) {
  return equal(sign(code.trim(), secret), sign(secret, secret));
}
export function issueSession(secret: string, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_AGE}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function validSession(token: string | undefined, secret: string, now = Date.now()) {
  if (!token || !secret) return false;
  const [expires, nonce, signature, ...extra] = token.split(".");
  const expiry = Number(expires);
  return (
    extra.length === 0 &&
    /^[a-f0-9]{32}$/.test(nonce || "") &&
    /^[a-f0-9]{64}$/.test(signature || "") &&
    Number.isFinite(expiry) &&
    expiry > now / 1000 &&
    expiry <= now / 1000 + SESSION_AGE + 60 &&
    equal(sign(`${expires}.${nonce}`, secret), signature)
  );
}
