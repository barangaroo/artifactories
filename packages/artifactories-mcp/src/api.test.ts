import { describe, expect, it, vi } from "vitest";
import {
  ArtifactoriesApi,
  ArtifactoriesApiError,
  type FetchLike,
} from "./api.js";

const message = {
  id: "msg_1234567890abcdef",
  channel: "general",
  kind: "ASK" as const,
  body: "How should this be verified?",
  createdAt: "2026-08-31T00:00:00.000Z",
  parentId: null,
  agentId: "agt_1234567890abcdef",
  handle: "verifier",
  fingerprint: "ed25519:example",
};

const pageMeta = {
  storage: "postgres",
  content_class: "AGENT_GENERATED_UNTRUSTED" as const,
  limit: 2,
  has_more: false,
  next_cursor: null,
  poll_after_seconds: 15,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ArtifactoriesApi", () => {
  it("builds a validated message request without leaking configuration", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({ data: [message], meta: pageMeta }),
    );
    const api = new ArtifactoriesApi({
      origin: "http://127.0.0.1:8787",
      fetchImpl,
    });

    const result = await api.listMessages({
      channel: "general",
      limit: 2,
      before: "opaque-cursor",
    });

    expect(result.data).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    expect(String(input)).toBe(
      "http://127.0.0.1:8787/v1/messages?channel=general&limit=2&before=opaque-cursor",
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("validates opportunity and notification response contracts", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [message],
          meta: { ...pageMeta, selection: "UNREPLIED_ASKS", poll_after_seconds: 60 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "msg_fedcba0987654321",
              type: "REPLY",
              createdAt: "2026-08-31T00:01:00.000Z",
              reply: { ...message, id: "msg_fedcba0987654321", kind: "ANSWER" },
              target: {
                messageId: message.id,
                channel: message.channel,
                kind: message.kind,
                body: message.body,
                createdAt: message.createdAt,
              },
            },
          ],
          meta: { ...pageMeta, delivery_order: "oldest_first", next_cursor: "next" },
        }),
      );
    const api = new ArtifactoriesApi({
      origin: "http://localhost:8787",
      fetchImpl,
    });

    const opportunities = await api.listOpportunities({ limit: 2 });
    const notifications = await api.pollNotifications({
      agentId: "agt_1234567890abcdef",
      limit: 2,
      after: "checkpoint",
    });

    expect(opportunities.meta.selection).toBe("UNREPLIED_ASKS");
    expect(notifications.meta.delivery_order).toBe("oldest_first");
    expect(String(fetchImpl.mock.calls[1]![0])).toBe(
      "http://localhost:8787/v1/agents/agt_1234567890abcdef/notifications?limit=2&after=checkpoint",
    );
  });

  it.each([
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?token=secret",
  ])("rejects unsafe or non-origin configuration: %s", (origin) => {
    expect(() => new ArtifactoriesApi({ origin })).toThrowError(ArtifactoriesApiError);
  });

  it("rejects a successful response with an unexpected shape", async () => {
    const api = new ArtifactoriesApi({
      fetchImpl: vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ data: "not-an-array" })),
    });

    await expect(api.listMessages()).rejects.toMatchObject({
      code: "ERR.INVALID_RESPONSE",
    });
  });

  it("surfaces a structured service error without including the origin", async () => {
    const api = new ArtifactoriesApi({
      fetchImpl: vi.fn<FetchLike>().mockResolvedValue(
        jsonResponse(
          { error: { code: "ERR.STORAGE_UNAVAILABLE", message: "Storage unavailable." } },
          503,
        ),
      ),
    });

    await expect(api.listOpportunities()).rejects.toMatchObject({
      code: "ERR.STORAGE_UNAVAILABLE",
      status: 503,
      message: "Storage unavailable.",
    });
  });
});
