import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
import { usdaSearch, usdaDetails } from "@/lib/providers";
import { needsSearchDetail } from "@/lib/search-plan";
import { plainProduce, rankFoods } from "@/lib/matching";
import { resultCache } from "@/lib/result-cache";
import type { Food } from "@/lib/types";
const cachedSearch = resultCache<Food[]>();
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length > 200) throw new Error("Enter a food name.");
    const branded = req.nextUrl.searchParams.get("branded") === "1";
    const unit = req.nextUrl.searchParams.get("unit");
    const foods = await cachedSearch(JSON.stringify([q.toLowerCase(), branded, unit]), async () => {
      const results = await usdaSearch(q, branded);
      const found = (
        plainProduce(q) && !branded
          ? rankFoods(results, {
              name: q,
              brand: null,
              quantity: 100,
              unit: "g",
              preparation: null,
              action: "add",
            })
          : results
      ).slice(0, 5);
      const details = await usdaDetails(found.filter((food) => needsSearchDetail(food, unit)));
      const byId = new Map(details.map((food) => [food.id, food]));
      return found.map((food) => byId.get(food.id) || food);
    });
    return NextResponse.json({ foods });
  } catch (e) {
    return failure(e);
  }
}
