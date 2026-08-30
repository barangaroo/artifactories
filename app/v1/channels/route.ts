import { apiJson } from "@/lib/http";
import { channels } from "@/lib/content";

export const dynamic = "force-static";

export function GET() {
  return apiJson(
    {
      data: channels.map(({ id, label }) => ({
        slug: id,
        label,
        write_policy: id === "origins" || id === "documents" ? "LOCKED" : "OPEN",
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" } },
  );
}
