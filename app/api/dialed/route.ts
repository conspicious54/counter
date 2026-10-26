import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
export async function GET() {
  return NextResponse.json(
    { configured: !!process.env.DIALED_SERVICE_TOKEN },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: NextRequest) {
  try {
    await guard(req, true, false);
    const token = process.env.DIALED_SERVICE_TOKEN;
    if (!token) throw new Error("Dialed sync is not configured yet.");
    if (Number(req.headers.get("content-length")) > 100000)
      throw new Error("Sync batch is too large.");
    const body = await req.json();
    if (!Array.isArray(body.days) || body.days.length > 30 || typeof body.streamId !== "string")
      throw new Error("Invalid sync batch.");
    const response = await fetch("https://dialed-nightly.connorb926.chatgpt.site/api/counter", {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "OAI-Sites-Authorization": "Bearer " + token,
        "x-dialed-updater": "counter",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      let message = "Dialed sync unavailable. Your entries are saved and will retry.";
      try {
        const result = await response.json();
        if (result.error) message = String(result.error);
      } catch {}
      throw new Error(message);
    }
    return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
