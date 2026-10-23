import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
import { barcodeLookup } from "@/lib/providers";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    const code = req.nextUrl.searchParams.get("code") || "";
    if (!/^\d{8,14}$/.test(code)) throw new Error("Enter an 8–14 digit UPC or EAN barcode.");
    return NextResponse.json({ food: await barcodeLookup(code) });
  } catch (e) {
    return failure(e);
  }
}
