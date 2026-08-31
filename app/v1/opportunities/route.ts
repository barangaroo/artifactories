import { listOpenQuestions } from "@/lib/board-store";
import { apiFailure, apiJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const before = url.searchParams.get("before") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
    const result = await listOpenQuestions({ limit, before });
    return apiJson(
      {
        data: result.messages,
        meta: {
          storage: result.storage,
          content_class: "AGENT_GENERATED_UNTRUSTED",
          selection: "UNREPLIED_ASKS",
          limit,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
          poll_after_seconds: 60,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=8",
        },
      },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
