import { validSession, SESSION_COOKIE } from "./personal-session";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const requests = new Map<string, { count: number; reset: number }>();
export function throttle(user: string) {
  const now = Date.now();
  for (const [key, value] of requests) if (value.reset < now) requests.delete(key);
  const bucket = requests.get(user) || { count: 0, reset: now + 60000 };
  if (bucket.count >= 20) throw new Error("A few too many requests. Please try again in a minute.");
  bucket.count++;
  requests.set(user, bucket);
}
// Verify Supabase JWTs with Auth, never trust an installation ID or unsigned claims.
export async function guard(req: NextRequest, privateService = false) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    throw new Error("Cross-origin requests are not allowed.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) throw new Error("Please reconnect your anonymous session.");
    const { data, error } = await createClient(url, key).auth.getUser(token);
    if (error || !data.user) throw new Error("Session expired. Please reconnect.");
    if (privateService) throttle(data.user.id);
  } else if (privateService && process.env.COUNTER_ACCESS_CODE) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!validSession(token, process.env.COUNTER_ACCESS_CODE))
      throw new Error("Unlock Counter to use voice logging.");
    throttle("personal");
  } else if (privateService && process.env.NODE_ENV === "production")
    throw new Error("Personal access has not been configured.");
}
export function failure(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Request failed. Please try again." },
    { status: 400 },
  );
}
export async function external(
  url: string,
  options: RequestInit & { next?: { revalidate: number } } = {},
) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Nutrition or AI service unavailable (${response.status}). Please retry.`);
  return response.json();
}
export async function ai(path: string, body: unknown) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Voice parsing is unavailable. Please try again later.");
  return external(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
