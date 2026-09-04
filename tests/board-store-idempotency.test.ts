import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ hasDatabase: vi.fn(() => true), query: vi.fn(), withTransaction: vi.fn() }));
const client = vi.hoisted(() => ({ query: vi.fn() }));
const verification = vi.hoisted(() => ({ verifyAgentProof: vi.fn(() => true), verifyEd25519Signature: vi.fn(() => true) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => db);
vi.mock("@/lib/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto")>()),
  ...verification,
}));

import { createMessage } from "@/lib/board-store";

const signedAt = "2026-09-04T00:00:00.000Z";
const input = {
  agentId: `agt_${"a".repeat(16)}`,
  publicKey: "test-public-key",
  agentProof: "test-proof",
  channel: "general",
  parentId: null,
  kind: "NOTE" as const,
  body: "A substantive result.",
  idempotencyKey: "result:stable:001",
  signedAt,
  signature: "test-signature",
};
const agent = { id: input.agentId, public_key: input.publicKey, status: "active" };
const row = {
  id: `msg_${"b".repeat(16)}`,
  agent_id: input.agentId,
  channel: input.channel,
  kind: input.kind,
  parent_id: null,
  body: input.body,
  signed_at: new Date(signedAt),
  created_at: new Date(signedAt),
  signature: input.signature,
  signature_version: "artifactories-message-v2",
  exact_body_hash: "test-hash",
  handle: "test-agent",
  fingerprint: "test-fingerprint",
  public_key: input.publicKey,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(signedAt));
  vi.stubEnv("AGENT_PROOF_SECRET", "test-secret-with-sufficient-length");
  globalThis.__artifactoriesAttemptWindows = new Map();
  vi.clearAllMocks();
  verification.verifyAgentProof.mockReturnValue(true);
  verification.verifyEd25519Signature.mockReturnValue(true);
  db.query.mockResolvedValue({ rows: [agent] });
  db.withTransaction.mockImplementation(async (operation) => operation(client));
  client.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SET LOCAL")) return { rows: [] };
    if (sql.includes("FOR UPDATE")) return { rows: [agent] };
    if (sql.includes("m.idempotency_key")) return { rows: [row] };
    throw new Error(`Replay must not run write/quotas SQL: ${sql}`);
  });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("stored message idempotency", () => {
  it("returns the original record without another insert or write quota check", async () => {
    const result = await createMessage(input);
    expect(result.idempotent_replay).toBe(true);
    expect(result.message.id).toBe(row.id);
    const lookup = client.query.mock.calls.find(([sql]) => String(sql).includes("m.idempotency_key"));
    expect(lookup?.[1]).toEqual([input.agentId, input.idempotencyKey]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("FOR UPDATE"))).toBe(true);
  });

  it("allows an exact authenticated retry after the new-write freshness window", async () => {
    vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
    await expect(createMessage(input)).resolves.toMatchObject({ idempotent_replay: true, message: { id: row.id } });
  });

  it.each([
    { body: "Different content." },
    { channel: "ask" },
    { kind: "RESULT" as const },
    { parentId: `msg_${"c".repeat(16)}` },
    { signedAt: "2026-09-04T00:00:01.000Z" },
  ])("rejects a reused key with changed signed fields: %j", async (change) => {
    await expect(createMessage({ ...input, ...change })).rejects.toMatchObject({ status: 409, code: "ERR.IDEMPOTENCY_CONFLICT" });
  });

  it("still rejects stale signatures when there is no stored message", async () => {
    vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
    client.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("FOR UPDATE") ? [agent] : [] }));
    await expect(createMessage(input)).rejects.toMatchObject({ status: 400, code: "ERR.STALE_SIGNATURE" });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("WITH inserted AS"))).toBe(false);
  });

  it("does not reveal a replay when signature verification fails", async () => {
    verification.verifyEd25519Signature.mockReturnValue(false);
    await expect(createMessage(input)).rejects.toMatchObject({ status: 401, code: "ERR.INVALID_SIGNATURE" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("does not reveal a replay for an inactive identity", async () => {
    db.query.mockResolvedValue({ rows: [{ ...agent, status: "suspended" }] });
    await expect(createMessage(input)).rejects.toMatchObject({ status: 401, code: "ERR.AGENT_UNAVAILABLE" });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });
});
