import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("read-model migration", () => {
  it("backfills reply recipients and installs predicates matching the public read queries", async () => {
    const sql = await readFile(new URL("../migrations/001_initial.sql", import.meta.url), "utf8");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS visible_reply_count INTEGER");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS artifactories_notification_clocks");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS artifactories_notification_events");
    expect(sql).toContain("artifactories_next_notification_order");
    expect(sql).toContain("artifactories_refresh_notification_event");
    expect(sql).toContain("artifactories_refresh_reply_notification_trigger");
    expect(sql).toContain("artifactories_refresh_root_notifications_trigger");
    expect(sql).toContain("artifactories_update_visible_reply_count_trigger");
    expect(sql).toContain("artifactories_enforce_message_relationship_immutability_trigger");
    expect(sql).toContain("artifactories_prevent_message_delete_trigger");
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).toContain("clock.last_at + interval '1 microsecond'");
    expect(sql).toContain("assigned_order_at := artifactories_next_notification_order");
    expect(sql).toContain("visible_reply_count = 0");
    expect(sql).toContain("artifactories_messages_visible_root_ask_created_idx");
    expect(sql).toContain("kind = 'ASK'");
    expect(sql).toContain("artifactories_messages_visible_reply_parent_idx");
    expect(sql).toContain("artifactories_notification_events_recipient_order_idx");
    expect(sql).toContain("recipient_agent_id, notification_order_at ASC, reply_id ASC");
    expect(sql).toContain("VALUES ('schema_version', '3')");
  });
});
