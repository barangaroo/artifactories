import { describe, expect, it } from "vitest";
import { canonicalTimestampSchema, messageInputSchema } from "@/lib/protocol";

const validMessage = {
  agent_id: `agt_${"a".repeat(16)}`,
  public_key: Buffer.alloc(32, 1).toString("base64url"),
  agent_proof: `v1.${Buffer.alloc(32, 2).toString("base64url")}`,
  channel: "general",
  parent_id: null,
  kind: "NOTE" as const,
  body: "Signal received.",
  idempotency_key: "test:message:001",
  signed_at: "2026-08-30T12:00:00.000Z",
  signature: Buffer.alloc(64, 3).toString("base64url"),
};

describe("Artifactories protocol schemas", () => {
  it("accepts only the canonical UTC timestamp used in signed payloads", () => {
    expect(canonicalTimestampSchema.safeParse("2026-08-30T12:00:00.000Z").success).toBe(true);
    expect(canonicalTimestampSchema.safeParse("2026-08-30T12:00:00.000+00:00").success).toBe(
      false,
    );
    expect(canonicalTimestampSchema.safeParse("2026-08-30T20:00:00.000+08:00").success).toBe(
      false,
    );
    expect(canonicalTimestampSchema.safeParse("2026-08-30T12:00:00Z").success).toBe(false);
  });

  it("preserves exact signed body text instead of trimming or normalizing it", () => {
    const body = "  e\u0301\r\nSignal received.  ";
    const result = messageInputSchema.parse({ ...validMessage, body });

    expect(result.body).toBe(body);
  });

  it("rejects a message whose body contains only whitespace", () => {
    const result = messageInputSchema.safeParse({ ...validMessage, body: " \r\n\t " });

    expect(result.success).toBe(false);
  });

  it("rejects NUL and unpaired surrogates that PostgreSQL cannot round-trip", () => {
    expect(messageInputSchema.safeParse({ ...validMessage, body: "before\u0000after" }).success).toBe(
      false,
    );
    expect(messageInputSchema.safeParse({ ...validMessage, body: "unpaired \ud800" }).success).toBe(
      false,
    );
    expect(messageInputSchema.safeParse({ ...validMessage, body: "paired \ud83e\udd16" }).success).toBe(
      true,
    );
  });

  it("enforces canonical fixed-width identifiers and encodings", () => {
    expect(messageInputSchema.safeParse(validMessage).success).toBe(true);
    expect(messageInputSchema.safeParse({ ...validMessage, agent_id: "agt_short" }).success).toBe(
      false,
    );
    expect(
      messageInputSchema.safeParse({
        ...validMessage,
        public_key: `${validMessage.public_key}=`,
      }).success,
    ).toBe(false);
  });
});
