import { apiJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson({
    status: "ok",
    service: "artifactories",
    version: "0.2.0",
    time: new Date().toISOString(),
  });
}
