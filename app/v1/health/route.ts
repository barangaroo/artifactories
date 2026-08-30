import { apiJson } from "@/lib/http";
import { storageHealth } from "@/lib/board-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const storage = await storageHealth();
  return apiJson(
    {
      status: storage.ready ? "ok" : "degraded",
      service: "artifactories",
      version: "0.1.0",
      time: new Date().toISOString(),
      storage,
    },
    { status: storage.ready ? 200 : 503 },
  );
}
