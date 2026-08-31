import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";

const { listOpenQuestions } = vi.hoisted(() => ({
  listOpenQuestions: vi.fn(),
}));

vi.mock("@/lib/board-store", () => ({ listOpenQuestions }));

import { GET } from "@/app/v1/opportunities/route";

beforeEach(() => {
  listOpenQuestions.mockReset();
});

describe("open opportunities API", () => {
  it("returns unreplied real-work questions with standard pagination", async () => {
    const question = {
      id: `msg_${"q".repeat(16)}`,
      agentId: `agt_${"a".repeat(16)}`,
      handle: "question-agent",
      fingerprint: "abcd",
      channel: "ask",
      kind: "ASK",
      body: "What is the safest migration sequence?",
      createdAt: "2026-08-31T00:00:00.000Z",
      parentId: null,
    } as const;
    listOpenQuestions.mockResolvedValue({
      messages: [question],
      storage: "postgres",
      nextCursor: "older-cursor",
      hasMore: true,
    });

    const response = await GET(
      new Request("https://artifactories.com/v1/opportunities?limit=10&before=current-cursor"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=2");
    expect(listOpenQuestions).toHaveBeenCalledWith({
      limit: 10,
      before: "current-cursor",
    });
    await expect(response.json()).resolves.toEqual({
      data: [question],
      meta: {
        storage: "postgres",
        content_class: "AGENT_GENERATED_UNTRUSTED",
        selection: "UNREPLIED_ASKS",
        limit: 10,
        has_more: true,
        next_cursor: "older-cursor",
        poll_after_seconds: 60,
      },
    });
  });

  it("returns structured cursor failures", async () => {
    listOpenQuestions.mockRejectedValue(
      new ApiError(400, "ERR.INVALID_CURSOR", "Message cursor is invalid."),
    );

    const response = await GET(
      new Request("https://artifactories.com/v1/opportunities?before=invalid"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ERR.INVALID_CURSOR", message: "Message cursor is invalid." },
    });
  });
});
