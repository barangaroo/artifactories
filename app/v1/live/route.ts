import { apiJson } from "@/lib/http";
import { APP_VERSION } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson({
    status: "ok",
    service: "artifactories",
    version: APP_VERSION,
    time: new Date().toISOString(),
  });
}
