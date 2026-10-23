import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ai, guard, failure } from "@/lib/server";
const itemSchema = z.object({
  name: z.string().min(1).max(160),
  brand: z.string().nullable(),
  quantity: z.number().positive().max(100000),
  unit: z.enum(["g", "ml", "serving", "piece", "cup", "tbsp", "tsp", "scoop", "slice", "oz"]),
  preparation: z.string().nullable(),
  action: z.enum(["add", "remove", "set"]),
});
export async function POST(req: NextRequest) {
  try {
    await guard(req, true);
    const input = z
      .object({
        text: z.string().min(1).max(2000),
        recipeNames: z.array(z.string().max(160)).max(100),
      })
      .parse(await req.json());
    const data = await ai("chat/completions", {
      model: process.env.OPENAI_PARSE_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Extract foods only, never nutrition values. Preserve brand and raw/cooked preparation. Preserve restaurant names as brand and preserve item size, sauces, fillings, exclusions and customizations in name. A prepared restaurant dish with fillings or exclusions is ONE food (e.g. chicken burrito with black beans, queso, no rice), not a list of its ingredients. Only split out sides when the user explicitly describes a separate side/item. For ordinary food logging all actions are add; preserve no/without exclusions in the food name. Use remove/set actions ONLY when modifying a saved recipe, and use quantity 1 for remove because quantity is ignored. All quantities must be greater than zero. Normalize units to enum. Eggs and countable fruit use piece. Select recipeName only from supplied saved recipe names; then foods are ONLY modifications (add another egg means add 1 egg; used two instead of one means set 2). Without recipeName foods are the whole meal. Ask ONE short clarification only when the food cannot be identified or an important preparation difference cannot be resolved. Preserve explicit quantities. If no quantity was supplied for a restaurant item or prepared dish, use 1 serving (one standard menu portion); for a plain generic food use 100 g as the visible starting amount for weighing. Do not ask for quantity just to block logging. Recipe names: " +
            JSON.stringify(input.recipeNames),
        },
        { role: "user", content: input.text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "food_log",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recipeName: { type: ["string", "null"] },
              clarification: { type: ["string", "null"] },
              foods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    brand: { type: ["string", "null"] },
                    quantity: { type: "number", exclusiveMinimum: 0 },
                    unit: {
                      type: "string",
                      enum: [
                        "g",
                        "ml",
                        "serving",
                        "piece",
                        "cup",
                        "tbsp",
                        "tsp",
                        "scoop",
                        "slice",
                        "oz",
                      ],
                    },
                    preparation: { type: ["string", "null"] },
                    action: { type: "string", enum: ["add", "remove", "set"] },
                  },
                  required: ["name", "brand", "quantity", "unit", "preparation", "action"],
                  additionalProperties: false,
                },
              },
            },
            required: ["recipeName", "clarification", "foods"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No food detected. Try a shorter description.");
    const result = z
      .object({
        recipeName: z.string().nullable(),
        clarification: z.string().nullable(),
        foods: z.array(itemSchema).max(30),
      })
      .parse(JSON.parse(content));
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
