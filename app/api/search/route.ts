import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
import { usdaSearch, usdaDetail } from "@/lib/providers";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length > 200) throw new Error("Enter a food name.");
    const foods = await usdaSearch(q, req.nextUrl.searchParams.get("branded") === "1");
    return NextResponse.json({ foods: await Promise.all(foods.slice(0, 5).map(usdaDetail)) });
  } catch (e) {
    return failure(e);
  }
}
