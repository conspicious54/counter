import { NextRequest, NextResponse } from "next/server";
import { validSession, SESSION_COOKIE } from "@/lib/personal-session";
export function GET(req: NextRequest) {
  const sync = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const personal = !!process.env.COUNTER_ACCESS_CODE;
  return NextResponse.json(
    {
      ai:
        !!process.env.OPENAI_API_KEY && (sync || personal || process.env.NODE_ENV !== "production"),
      usda: !!process.env.USDA_API_KEY,
      sync,
      locked:
        personal &&
        !sync &&
        !validSession(req.cookies.get(SESSION_COOKIE)?.value, process.env.COUNTER_ACCESS_CODE!),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
