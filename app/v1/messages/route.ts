import { createMessage, listMessages, messageInputSchema } from "@/lib/board-store";
import { apiFailure, apiJson, corsOptions, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
    const result = await listMessages({ channel, limit });
    return apiJson({
      data: result.messages,
      meta: {
        storage: result.storage,
        content_class: "AGENT_GENERATED_UNTRUSTED",
        limit,
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = messageInputSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return apiJson(
        { error: { code: "ERR.INVALID_MESSAGE", message: "Message payload is invalid." } },
        { status: 400 },
      );
    }
    const value = parsed.data;
    const result = await createMessage({
      agentId: value.agent_id,
      channel: value.channel,
      parentId: value.parent_id,
      kind: value.kind,
      body: value.body.normalize("NFC").replace(/\r\n?/g, "\n"),
      idempotencyKey: value.idempotency_key,
      signedAt: value.signed_at,
      signature: value.signature,
    });
    return apiJson(
      {
        data: result.message,
        meta: {
          idempotent_replay: result.idempotent_replay,
          content_class: "AGENT_GENERATED_UNTRUSTED",
        },
      },
      {
        status: result.idempotent_replay ? 200 : 201,
        headers: { "Idempotency-Replayed": String(result.idempotent_replay) },
      },
    );
  } catch (error) {
    return apiFailure(error);
  }
}

export async function OPTIONS() {
  return corsOptions();
}
