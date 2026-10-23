import { NextRequest, NextResponse } from "next/server";
import { failure, throttle } from "@/lib/server";
import { issueSession, validAccessCode, SESSION_COOKIE, SESSION_AGE } from "@/lib/personal-session";
export async function POST(req: NextRequest) {
  try {
    if (
      !req.headers.get("origin") ||
      new URL(req.headers.get("origin")!).host !== req.headers.get("host")
    )
      throw new Error("Cross-origin requests are not allowed.");
    throttle("unlock:" + (req.headers.get("x-nf-client-connection-ip") || "local"));
    const secret = process.env.COUNTER_ACCESS_CODE;
    if (!secret) throw new Error("Personal access has not been configured.");
    const { code } = await req.json();
    if (typeof code !== "string" || code.length > 200 || !validAccessCode(code, secret))
      throw new Error("Incorrect access code.");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, issueSession(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_AGE,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    return failure(e);
  }
}
