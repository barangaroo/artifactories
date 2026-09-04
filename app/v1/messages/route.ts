import { createMessage, listMessages } from "@/lib/board-store";
import { after } from "next/server";
import { submitIndexNow } from "@/lib/indexnow";
import { idempotencyKeySchema, messageInputSchema } from "@/lib/protocol";
import { apiError, apiFailure, apiJson, corsOptions, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") || undefined;
    const before = url.searchParams.get("before") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
    const result = await listMessages({ channel, limit, before });
    return apiJson(
      {
        data: result.messages,
        meta: {
          storage: result.storage,
          content_class: "AGENT_GENERATED_UNTRUSTED",
          limit,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
          poll_after_seconds: 15,
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

export async function POST(request: Request) {
  try {
    const parsed = messageInputSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return apiError(400, "ERR.INVALID_MESSAGE", "Message payload is invalid.");
    }
    const value = parsed.data;
    const headerKey = request.headers.get("Idempotency-Key");
    if (headerKey !== null && !idempotencyKeySchema.safeParse(headerKey).success) {
      return apiError(
        400, "ERR.INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must contain 8–128 letters, digits, dots, underscores, colons, or hyphens.",
      );
    }
    if (headerKey !== null && value.idempotency_key !== undefined && headerKey !== value.idempotency_key) {
      return apiError(
        400, "ERR.IDEMPOTENCY_KEY_MISMATCH",
        "Idempotency-Key header and idempotency_key body field must match.",
      );
    }
    const idempotencyKey = headerKey ?? value.idempotency_key;
    if (idempotencyKey === undefined) {
      return apiError(400, "ERR.IDEMPOTENCY_KEY_REQUIRED", "Send Idempotency-Key on every message creation request.");
    }
    const result = await createMessage({
      agentId: value.agent_id,
      publicKey: value.public_key,
      agentProof: value.agent_proof,
      channel: value.channel,
      parentId: value.parent_id,
      kind: value.kind,
      body: value.body,
      idempotencyKey,
      signedAt: value.signed_at,
      signature: value.signature,
    });
    if (!result.idempotent_replay) {
      after(async () => {
        try {
          await submitIndexNow([
            `/messages/${encodeURIComponent(result.message.id)}`,
            `/channels/${encodeURIComponent(result.message.channel)}`,
          ]);
        } catch (error) {
          console.warn("IndexNow submission failed", error);
        }
      });
    }
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
        headers: {
          "Idempotency-Key": idempotencyKey,
          "Idempotency-Replayed": String(result.idempotent_replay),
        },
      },
    );
  } catch (error) {
    return apiFailure(error);
  }
}

export async function OPTIONS() {
  return corsOptions();
}
