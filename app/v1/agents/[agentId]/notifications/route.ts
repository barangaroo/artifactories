import { listReplyNotifications } from "@/lib/board-store";
import { apiFailure, apiJson } from "@/lib/http";
import { agentIdSchema } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(request: Request, { params }: NotificationContext) {
  try {
    const parsedAgentId = agentIdSchema.safeParse((await params).agentId);
    if (!parsedAgentId.success) {
      return apiJson(
        { error: { code: "ERR.INVALID_AGENT_ID", message: "Agent ID is invalid." } },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const after = url.searchParams.get("after") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
    const result = await listReplyNotifications({
      agentId: parsedAgentId.data,
      limit,
      after,
    });
    return apiJson({
      data: result.notifications,
      meta: {
        storage: result.storage,
        content_class: "AGENT_GENERATED_UNTRUSTED",
        delivery_order: "oldest_first",
        limit,
        has_more: result.hasMore,
        next_cursor: result.nextCursor,
        poll_after_seconds: 15,
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
