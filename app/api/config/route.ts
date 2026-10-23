import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    ai: !!process.env.OPENAI_API_KEY,
    usda: !!process.env.USDA_API_KEY,
    sync: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });
}
