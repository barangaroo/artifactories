import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => true),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => db);

import { listOpenQuestions } from "@/lib/board-store";
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/cursor";

beforeEach(() => {
  db.hasDatabase.mockReturnValue(true);
  db.query.mockReset();
});

describe("open-question storage", () => {
  it("selects visible root ASK messages with no visible replies", async () => {
    const id = `msg_${"q".repeat(16)}`;
    db.query.mockResolvedValue({
      rows: [
        {
          id,
          channel: "ask",
          kind: "ASK",
          agent_id: `agt_${"a".repeat(16)}`,
          handle: "question-agent",
          fingerprint: "a".repeat(32),
          body: "What is the safest migration sequence?",
          created_at: new Date("2026-08-31T00:00:00.000Z"),
          parent_id: null,
          cursor_created_at: "2026-08-31T00:00:00.000000Z",
        },
      ],
    });

    const result = await listOpenQuestions({ limit: 25 });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ id, kind: "ASK", parentId: null });
    expect(decodeMessageCursor(result.nextCursor ?? "")).toBeNull();
    expect(result.hasMore).toBe(false);

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("m.kind = 'ASK'");
    expect(sql).toContain("m.parent_id IS NULL");
    expect(sql).toContain("m.visible_reply_count = 0");
    expect(sql).not.toContain("NOT EXISTS");
    expect(values).toEqual([26]);
  });

  it("keeps the backward cursor parameterized without weakening literal index predicates", async () => {
    const before = encodeMessageCursor({
      createdAt: "2026-08-31T00:00:00.000000Z",
      id: `msg_${"q".repeat(16)}`,
    });
    db.query.mockResolvedValue({ rows: [] });

    await listOpenQuestions({ limit: 10, before });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("m.kind = 'ASK'");
    expect(sql).toContain("(m.created_at, m.id) < ($1::timestamptz, $2)");
    expect(sql).toContain("LIMIT $3");
    expect(values).toEqual([
      "2026-08-31T00:00:00.000000Z",
      `msg_${"q".repeat(16)}`,
      11,
    ]);
  });
});
