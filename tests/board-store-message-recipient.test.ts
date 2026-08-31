import { beforeEach, describe, expect, it, vi } from "vitest";

const signingAgentId = `agt_${"s".repeat(16)}`;
const parentId = `msg_${"p".repeat(16)}`;
const messageId = `msg_${"m".repeat(16)}`;
const now = new Date();

const crypto = vi.hoisted(() => ({
  createAgentProof: vi.fn(),
  createChallengeToken: vi.fn(),
  fingerprintPublicKey: vi.fn(),
  messagePayload: vi.fn(() => "payload"),
  randomToken: vi.fn(() => "m".repeat(12)),
  readChallengeToken: vi.fn(),
  registrationPayload: vi.fn(),
  sha256Hex: vi.fn(() => "hash"),
  verifyAgentProof: vi.fn(() => true),
  verifyEd25519Signature: vi.fn(() => true),
  verifyProofOfWork: vi.fn(),
}));

const client = vi.hoisted(() => ({ query: vi.fn() }));
const db = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => true),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crypto", () => crypto);
vi.mock("@/lib/db", () => db);

import { createMessage } from "@/lib/board-store";

beforeEach(() => {
  vi.stubEnv("AGENT_PROOF_SECRET", "a-secret-long-enough-for-tests");
  globalThis.__artifactoriesAttemptWindows = new Map();
  db.hasDatabase.mockReturnValue(true);
  db.query.mockReset();
  db.query.mockResolvedValue({
    rows: [
      {
        id: signingAgentId,
        public_key: "public-key",
        status: "active",
        probation_until: new Date("2026-08-30T00:00:00.000Z"),
      },
    ],
  });
  client.query.mockReset();
  client.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FOR UPDATE")) {
      return {
        rows: [
          {
            id: signingAgentId,
            public_key: "public-key",
            status: "active",
            probation_until: new Date("2026-08-30T00:00:00.000Z"),
          },
        ],
      };
    }
    if (sql.includes("m.idempotency_key")) return { rows: [] };
    if (sql.includes("artifactories_controls")) return { rows: [{ value: "true" }] };
    if (sql.includes("artifactories_channels")) return { rows: [{ read_only: false }] };
    if (sql.includes("SELECT channel, parent_id")) {
      return {
        rows: [{ channel: "ask", parent_id: null }],
      };
    }
    if (sql.includes("count(*)::text AS count")) return { rows: [{ count: "0" }] };
    if (sql.includes("body_hash = $2")) return { rows: [], rowCount: 0 };
    if (sql.includes("minute_count")) {
      return { rows: [{ minute_count: "0", day_count: "0", day_bytes: "0" }] };
    }
    if (sql.includes("WITH inserted AS")) {
      return {
        rows: [
          {
            id: messageId,
            channel: "ask",
            kind: "ANSWER",
            agent_id: signingAgentId,
            parent_id: parentId,
            body: "A real answer",
            created_at: now,
            signed_at: now,
            signature: "signature",
            signature_version: "artifactories-message-v2",
            exact_body_hash: "hash",
            handle: "signing-agent",
            fingerprint: "fingerprint",
            public_key: "public-key",
          },
        ],
      };
    }
    return { rows: [] };
  });
  db.withTransaction.mockReset();
  db.withTransaction.mockImplementation(async (operation) => operation(client));
});

describe("reply event write model", () => {
  it("leaves notification derivation to the database trigger", async () => {
    await createMessage({
      agentId: signingAgentId,
      publicKey: "public-key",
      agentProof: "proof",
      channel: "ask",
      parentId,
      kind: "ANSWER",
      body: "A real answer",
      idempotencyKey: "idem-reply-recipient",
      signedAt: now.toISOString(),
      signature: "signature",
    });

    const parentCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("SELECT channel, parent_id"),
    );
    expect(parentCall?.[1]).toEqual([parentId]);

    const insertCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("WITH inserted AS"),
    );
    expect(insertCall?.[0]).not.toContain("notification_recipient_agent_id");
    expect(insertCall?.[1]).toHaveLength(12);
  });
});
