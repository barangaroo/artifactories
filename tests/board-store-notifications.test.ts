import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => true),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => db);

import { listReplyNotifications } from "@/lib/board-store";
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/cursor";

const agentId = `agt_${"a".repeat(16)}`;
const targetId = `msg_${"t".repeat(16)}`;

function row(letter: string, minute: number) {
  const id = `msg_${letter.repeat(16)}`;
  const timestamp = `2026-08-31T00:${String(minute).padStart(2, "0")}:00.000000Z`;
  return {
    id,
    channel: "ask",
    kind: "ANSWER",
    agent_id: `agt_${letter.repeat(16)}`,
    handle: `agent-${letter}`,
    fingerprint: letter.repeat(32),
    body: `Answer ${letter}`,
    created_at: new Date(timestamp),
    parent_id: targetId,
    cursor_created_at: timestamp,
    target_id: targetId,
    target_channel: "ask",
    target_kind: "ASK",
    target_body: "A real question?",
    target_created_at: new Date("2026-08-31T00:00:00.000Z"),
  };
}

beforeEach(() => {
  db.hasDatabase.mockReturnValue(true);
  db.query.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reply notification storage", () => {
  it("starts at the oldest reply so the initial poll cannot skip a burst", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: agentId }] })
      .mockResolvedValueOnce({ rows: [row("a", 1), row("b", 2), row("c", 3)] });

    const result = await listReplyNotifications({ agentId, limit: 2 });

    expect(result.notifications.map(({ id }) => id)).toEqual([
      `msg_${"a".repeat(16)}`,
      `msg_${"b".repeat(16)}`,
    ]);
    expect(result.notifications[0]).toMatchObject({
      type: "REPLY",
      target: { messageId: targetId, body: "A real question?" },
      reply: { parentId: targetId, body: "Answer a" },
    });
    expect(result.hasMore).toBe(true);
    expect(decodeMessageCursor(result.nextCursor ?? "")).toEqual({
      createdAt: "2026-08-31T00:02:00.000000Z",
      id: `msg_${"b".repeat(16)}`,
    });

    const [sql, values] = db.query.mock.calls[1];
    expect(sql).toContain("FROM artifactories_notification_events event");
    expect(sql).toContain("event.recipient_agent_id = $1");
    expect(sql).toContain("JOIN artifactories_messages reply ON reply.id = event.reply_id");
    expect(sql).toContain("ORDER BY event.notification_order_at ASC, event.reply_id ASC");
    expect(values).toEqual([agentId, 3]);
  });

  it("drains newer replies after the cursor without skipping a burst", async () => {
    const after = encodeMessageCursor({
      createdAt: "2026-08-31T00:01:00.000000Z",
      id: `msg_${"a".repeat(16)}`,
    });
    db.query
      .mockResolvedValueOnce({ rows: [{ id: agentId }] })
      .mockResolvedValueOnce({ rows: [row("b", 2), row("c", 3), row("d", 4)] });

    const result = await listReplyNotifications({ agentId, limit: 2, after });

    expect(result.notifications.map(({ id }) => id)).toEqual([
      `msg_${"b".repeat(16)}`,
      `msg_${"c".repeat(16)}`,
    ]);
    expect(result.hasMore).toBe(true);
    expect(decodeMessageCursor(result.nextCursor ?? "")).toEqual({
      createdAt: "2026-08-31T00:03:00.000000Z",
      id: `msg_${"c".repeat(16)}`,
    });

    const [sql, values] = db.query.mock.calls[1];
    expect(sql).toContain("(event.notification_order_at, event.reply_id) >");
    expect(sql).toContain("ORDER BY event.notification_order_at ASC, event.reply_id ASC");
    expect(values).toEqual([
      agentId,
      "2026-08-31T00:01:00.000000Z",
      `msg_${"a".repeat(16)}`,
      3,
    ]);
  });

  it("returns an empty read-only inbox for an archive-only deployment", async () => {
    db.hasDatabase.mockReturnValue(false);
    vi.stubEnv("ARCHIVE_ONLY", "true");

    await expect(
      listReplyNotifications({ agentId, limit: 25, after: "checkpoint" }),
    ).resolves.toEqual({
      notifications: [],
      storage: "archive-seed",
      nextCursor: "checkpoint",
      hasMore: false,
    });
    expect(db.query).not.toHaveBeenCalled();
  });
});
