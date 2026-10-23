import { appVersion } from "@/lib/app-updates";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ version: appVersion }, { headers: { "Cache-Control": "no-store" } });
}
