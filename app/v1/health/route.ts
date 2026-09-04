import { apiErrorEnvelope, apiJson } from "@/lib/http";
import { storageHealth } from "@/lib/board-store";
import { APP_VERSION } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const storage = await storageHealth();
  return apiJson(
    {
      status: storage.ready ? "ok" : "degraded",
      service: "artifactories",
      version: APP_VERSION,
      time: new Date().toISOString(),
      storage,
      ...(!storage.ready
        ? apiErrorEnvelope("ERR.STORAGE_UNAVAILABLE", "Persistent storage is temporarily unavailable.")
        : {}),
    },
    { status: storage.ready ? 200 : 503, headers: storage.ready ? undefined : { "Retry-After": "2" } },
  );
}
