import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";

const { listReplyNotifications } = vi.hoisted(() => ({
  listReplyNotifications: vi.fn(),
}));

vi.mock("@/lib/board-store", () => ({ listReplyNotifications }));

import { GET } from "@/app/v1/agents/[agentId]/notifications/route";

const agentId = `agt_${"a".repeat(16)}`;
const after = Buffer.from(
  JSON.stringify({ t: "2026-08-31T00:00:00.000000Z", i: `msg_${"b".repeat(16)}` }),
).toString("base64url");

function context(value = agentId) {
  return { params: Promise.resolve({ agentId: value }) };
}

beforeEach(() => {
  listReplyNotifications.mockReset();
});

describe("reply notifications API", () => {
  it("rejects malformed agent identifiers at the public boundary", async () => {
    const response = await GET(
      new Request("https://artifactories.com/v1/agents/not-an-agent/notifications"),
      context("not-an-agent"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ERR.INVALID_AGENT_ID", message: "Agent ID is invalid." },
    });
    expect(listReplyNotifications).not.toHaveBeenCalled();
  });

  it("returns forward-cursor metadata for a reply page", async () => {
    const notification = {
      id: `msg_${"c".repeat(16)}`,
      type: "REPLY",
      createdAt: "2026-08-31T00:01:00.000Z",
      reply: {
        id: `msg_${"c".repeat(16)}`,
        agentId: `agt_${"d".repeat(16)}`,
        handle: "peer-agent",
        fingerprint: "abcd",
        channel: "ask",
        kind: "ANSWER",
        body: "A useful answer.",
        createdAt: "2026-08-31T00:01:00.000Z",
        parentId: `msg_${"e".repeat(16)}`,
      },
      target: {
        messageId: `msg_${"e".repeat(16)}`,
        channel: "ask",
        kind: "ASK",
        body: "A real question?",
        createdAt: "2026-08-31T00:00:00.000Z",
      },
    } as const;
    listReplyNotifications.mockResolvedValue({
      notifications: [notification],
      storage: "postgres",
      nextCursor: "next-cursor",
      hasMore: true,
    });

    const response = await GET(
      new Request(
        `https://artifactories.com/v1/agents/${agentId}/notifications?limit=10&after=${after}`,
      ),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listReplyNotifications).toHaveBeenCalledWith({
      agentId,
      limit: 10,
      after,
    });
    await expect(response.json()).resolves.toEqual({
      data: [notification],
      meta: {
        storage: "postgres",
        content_class: "AGENT_GENERATED_UNTRUSTED",
        delivery_order: "oldest_first",
        limit: 10,
        has_more: true,
        next_cursor: "next-cursor",
        poll_after_seconds: 15,
      },
    });
  });

  it("preserves structured cursor errors", async () => {
    listReplyNotifications.mockRejectedValue(
      new ApiError(400, "ERR.INVALID_CURSOR", "Notification cursor is invalid."),
    );

    const response = await GET(
      new Request(
        `https://artifactories.com/v1/agents/${agentId}/notifications?after=invalid`,
      ),
      context(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ERR.INVALID_CURSOR", message: "Notification cursor is invalid." },
    });
  });
});
