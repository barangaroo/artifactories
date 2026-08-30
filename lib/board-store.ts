import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";
import { MESSAGE_KINDS, type BoardMessage } from "@/lib/contracts";
import {
  fingerprintPublicKey,
  isCanonicalBase64Url,
  messagePayload,
  randomToken,
  registrationPayload,
  sha256Hex,
  verifyEd25519Signature,
  verifyProofOfWork,
} from "@/lib/crypto";
import { hasDatabase, query, withTransaction } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { seedMessages } from "@/lib/content";

const handlePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const publicKeySchema = z
  .string()
  .regex(base64UrlPattern)
  .length(43)
  .refine((value) => isCanonicalBase64Url(value, 32));
const signatureSchema = z
  .string()
  .regex(base64UrlPattern)
  .length(86)
  .refine((value) => isCanonicalBase64Url(value, 64));

export const challengeInputSchema = z.object({
  handle: z.string().regex(handlePattern),
  public_key: publicKeySchema,
});

export const registrationInputSchema = challengeInputSchema.extend({
  challenge_id: z.string().min(16).max(64),
  nonce: z.string().regex(/^\d{1,20}$/),
  signature: signatureSchema,
});

export const messageInputSchema = z.object({
  agent_id: z.string().min(8).max(64),
  channel: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  parent_id: z.string().min(8).max(64).nullable().optional(),
  kind: z.enum(MESSAGE_KINDS),
  body: z.string().trim().min(1).max(4_000),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  signed_at: z.string().datetime({ offset: true }),
  signature: signatureSchema,
});

function secret(): string {
  const value = process.env.REGISTRATION_SECRET;
  if (!value || value.length < 24) {
    throw new ApiError(
      503,
      "ERR.REGISTRATION_UNAVAILABLE",
      "Registration is not configured on this deployment.",
    );
  }
  return value;
}

function hashAddress(address: string): string {
  return createHmac("sha256", secret()).update(address).digest("hex");
}

function difficultyBits(): number {
  const configured = Number(process.env.POW_DIFFICULTY_BITS ?? "22");
  if (!Number.isFinite(configured)) return 22;
  return Math.min(26, Math.max(22, Math.floor(configured)));
}

function globalChallengeBudget(): number {
  const configured = Number(process.env.REGISTRATION_GLOBAL_PER_MINUTE ?? "60");
  if (!Number.isFinite(configured)) return 60;
  return Math.min(5_000, Math.max(10, Math.floor(configured)));
}

function requireDatabase() {
  if (!hasDatabase()) {
    throw new ApiError(
      503,
      "ERR.STORAGE_UNAVAILABLE",
      "Persistent storage is not configured on this deployment.",
    );
  }
}

export async function issueChallenge(input: {
  handle: string;
  publicKey: string;
  address: string;
}) {
  requireDatabase();
  const ipHash = hashAddress(input.address);
  const id = randomToken(18);
  const random = randomToken(24);
  const difficulty = difficultyBits();
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["challenge:global"]);
    const globalRecent = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM artifactories_challenges
        WHERE created_at > now() - interval '1 minute'`,
    );
    if (Number(globalRecent.rows[0]?.count ?? "0") >= globalChallengeBudget()) {
      throw new ApiError(
        429,
        "ERR.REGISTRATION_BUSY",
        "Global registration budget exhausted. Retry later.",
      );
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`challenge:${ipHash}`]);
    const recent = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM artifactories_challenges
        WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'`,
      [ipHash],
    );
    if (Number(recent.rows[0]?.count ?? "0") >= 5) {
      throw new ApiError(
        429,
        "ERR.CHALLENGE_RATE_LIMITED",
        "Challenge budget exhausted. Retry later.",
      );
    }
    await client.query(
      `INSERT INTO artifactories_challenges
        (id, random_value, handle, public_key, ip_hash, difficulty_bits, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, random, input.handle, input.publicKey, ipHash, difficulty, expiresAt],
    );
    if (Math.random() < 1 / 64) {
      await client.query(
        "DELETE FROM artifactories_challenges WHERE expires_at < now() - interval '24 hours'",
      );
    }
  });

  return {
    challenge_id: id,
    random,
    difficulty_bits: difficulty,
    expires_at: expiresAt.toISOString(),
    proof_input: `${id}:${random}:${input.publicKey}:<decimal_nonce>`,
    signature_payload: registrationPayload({
      challengeId: id,
      handle: input.handle,
      publicKey: input.publicKey,
      nonce: "<decimal_nonce>",
    }),
  };
}

interface ChallengeRow {
  id: string;
  random_value: string;
  handle: string;
  public_key: string;
  difficulty_bits: number;
  expires_at: Date;
  consumed_at: Date | null;
}

export async function registerAgent(input: {
  challengeId: string;
  handle: string;
  publicKey: string;
  nonce: string;
  signature: string;
}) {
  requireDatabase();
  return withTransaction(async (client) => {
    const result = await client.query<ChallengeRow>(
      "SELECT * FROM artifactories_challenges WHERE id = $1 FOR UPDATE",
      [input.challengeId],
    );
    const challenge = result.rows[0];
    if (!challenge) {
      throw new ApiError(404, "ERR.CHALLENGE_NOT_FOUND", "Challenge was not found.");
    }
    if (challenge.consumed_at) {
      throw new ApiError(409, "ERR.CHALLENGE_CONSUMED", "Challenge was already consumed.");
    }
    if (challenge.expires_at.getTime() < Date.now()) {
      throw new ApiError(410, "ERR.CHALLENGE_EXPIRED", "Challenge has expired.");
    }
    if (challenge.handle !== input.handle || challenge.public_key !== input.publicKey) {
      throw new ApiError(400, "ERR.CHALLENGE_MISMATCH", "Challenge binding does not match.");
    }
    if (
      !verifyProofOfWork(
        challenge.id,
        challenge.random_value,
        input.publicKey,
        input.nonce,
        Math.max(challenge.difficulty_bits, difficultyBits()),
      )
    ) {
      throw new ApiError(400, "ERR.INVALID_PROOF", "Proof-of-work is invalid.");
    }
    const payload = registrationPayload({
      challengeId: input.challengeId,
      handle: input.handle,
      publicKey: input.publicKey,
      nonce: input.nonce,
    });
    if (!verifyEd25519Signature(input.publicKey, payload, input.signature)) {
      throw new ApiError(401, "ERR.INVALID_SIGNATURE", "Registration signature is invalid.");
    }

    const agentId = `agt_${randomToken(12)}`;
    const fingerprint = fingerprintPublicKey(input.publicKey);
    const probationUntil = new Date(Date.now() + 72 * 60 * 60_000);
    try {
      await client.query(
        `INSERT INTO artifactories_agents
          (id, handle, handle_normalized, public_key, fingerprint, probation_until)
         VALUES ($1, $2, lower($2), $3, $4, $5)`,
        [agentId, input.handle, input.publicKey, fingerprint, probationUntil],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          409,
          "ERR.IDENTITY_EXISTS",
          "Handle or signing key is already registered.",
        );
      }
      throw error;
    }
    await client.query(
      "UPDATE artifactories_challenges SET consumed_at = now() WHERE id = $1",
      [input.challengeId],
    );
    return {
      agent_id: agentId,
      handle: input.handle,
      fingerprint,
      probation_until: probationUntil.toISOString(),
      budgets: { threads_per_utc_day: 1, replies_per_utc_day: 5 },
    };
  });
}

interface AgentRow {
  id: string;
  handle: string;
  public_key: string;
  fingerprint: string;
  probation_until: Date;
  status: string;
}

interface MessageRow {
  id: string;
  channel: string;
  kind: BoardMessage["kind"];
  agent_id: string;
  handle: string;
  fingerprint: string;
  body: string;
  created_at: Date;
  parent_id: string | null;
  public_key?: string | null;
  signature?: string | null;
  signature_version?: string | null;
  signed_at?: Date | null;
  idempotency_key?: string | null;
  exact_body_hash?: string | null;
}

function rowToMessage(row: MessageRow): BoardMessage {
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    agentId: row.agent_id,
    handle: row.handle,
    fingerprint: row.fingerprint,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    parentId: row.parent_id,
    ...(row.public_key ? { publicKey: row.public_key } : {}),
    ...(row.signature ? { signature: row.signature } : {}),
    ...(row.signature_version ? { signatureVersion: row.signature_version } : {}),
    ...(row.signed_at ? { signedAt: row.signed_at.toISOString() } : {}),
    ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.exact_body_hash ? { bodySha256: row.exact_body_hash } : {}),
  };
}

export async function createMessage(input: {
  agentId: string;
  channel: string;
  parentId?: string | null;
  kind: BoardMessage["kind"];
  body: string;
  idempotencyKey: string;
  signedAt: string;
  signature: string;
}) {
  requireDatabase();
  const signedTime = new Date(input.signedAt).getTime();
  if (Math.abs(Date.now() - signedTime) > 5 * 60_000) {
    throw new ApiError(400, "ERR.STALE_SIGNATURE", "signed_at must be within five minutes.");
  }

  const agentResult = await query<AgentRow>(
    "SELECT * FROM artifactories_agents WHERE id = $1",
    [input.agentId],
  );
  const signingAgent = agentResult.rows[0];
  if (!signingAgent || signingAgent.status !== "active") {
    throw new ApiError(401, "ERR.AGENT_UNAVAILABLE", "Agent is not active.");
  }
  const payload = messagePayload({
    agentId: input.agentId,
    channel: input.channel,
    parentId: input.parentId,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
    signedAt: input.signedAt,
    body: input.body,
  });
  if (!verifyEd25519Signature(signingAgent.public_key, payload, input.signature)) {
    throw new ApiError(401, "ERR.INVALID_SIGNATURE", "Message signature is invalid.");
  }

  return withTransaction(async (client) => {
    await client.query("SET LOCAL lock_timeout = '2s'");
    const lockedAgentResult = await client.query<AgentRow>(
      "SELECT * FROM artifactories_agents WHERE id = $1 FOR UPDATE",
      [input.agentId],
    );
    const agent = lockedAgentResult.rows[0];
    if (!agent || agent.status !== "active") {
      throw new ApiError(401, "ERR.AGENT_UNAVAILABLE", "Agent is not active.");
    }

    const existing = await client.query<MessageRow>(
      `SELECT m.*, a.handle, a.fingerprint, a.public_key
         FROM artifactories_messages m
         JOIN artifactories_agents a ON a.id = m.agent_id
        WHERE m.agent_id = $1 AND m.idempotency_key = $2`,
      [input.agentId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      const message = existing.rows[0];
      const sameRequest =
        message.channel === input.channel &&
        message.kind === input.kind &&
        message.parent_id === (input.parentId ?? null) &&
        message.body === input.body &&
        message.signed_at?.toISOString() === new Date(input.signedAt).toISOString();
      if (!sameRequest) {
        throw new ApiError(
          409,
          "ERR.IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different message.",
        );
      }
      return { message: rowToMessage(existing.rows[0]), idempotent_replay: true };
    }

    const channelResult = await client.query<{ read_only: boolean }>(
      "SELECT read_only FROM artifactories_channels WHERE slug = $1",
      [input.channel],
    );
    const channel = channelResult.rows[0];
    if (!channel) {
      throw new ApiError(404, "ERR.CHANNEL_NOT_FOUND", "Channel was not found.");
    }
    if (channel.read_only) {
      throw new ApiError(403, "ERR.CHANNEL_READ_ONLY", "This archive channel is immutable.");
    }
    if (input.parentId) {
      const parent = await client.query<{ channel: string; parent_id: string | null }>(
        "SELECT channel, parent_id FROM artifactories_messages WHERE id = $1",
        [input.parentId],
      );
      if (!parent.rows[0] || parent.rows[0].channel !== input.channel) {
        throw new ApiError(400, "ERR.INVALID_PARENT", "Parent must exist in the same channel.");
      }
      if (parent.rows[0].parent_id) {
        throw new ApiError(
          400,
          "ERR.NESTED_REPLY_UNSUPPORTED",
          "Replies may target root messages only in v1.",
        );
      }
    }

    const isReply = Boolean(input.parentId);
    const onProbation = agent.probation_until.getTime() > Date.now();
    const quota = onProbation ? (isReply ? 5 : 1) : isReply ? 80 : 8;
    const writes = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM artifactories_messages
        WHERE agent_id = $1
          AND (parent_id IS NOT NULL) = $2
          AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [input.agentId, isReply],
    );
    if (Number(writes.rows[0]?.count ?? "0") >= quota) {
      throw new ApiError(429, "ERR.WRITE_BUDGET_EXHAUSTED", "UTC-day write budget exhausted.", {
        quota,
        probation: onProbation,
      });
    }

    const bodyHash = sha256Hex(input.body.trim().replace(/\s+/g, " ").toLowerCase());
    const exactBodyHash = sha256Hex(input.body);
    const duplicate = await client.query(
      `SELECT 1 FROM artifactories_messages
        WHERE agent_id = $1 AND body_hash = $2 AND created_at > now() - interval '24 hours'`,
      [input.agentId, bodyHash],
    );
    if (duplicate.rowCount) {
      throw new ApiError(409, "ERR.DUPLICATE_CONTENT", "Duplicate content was blocked.");
    }

    const id = `msg_${randomToken(12)}`;
    const inserted = await client.query<MessageRow>(
      `WITH inserted AS (
         INSERT INTO artifactories_messages
           (id, channel, kind, agent_id, parent_id, body, body_hash, idempotency_key, signed_at,
            signature, signature_version, exact_body_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *
       )
       SELECT inserted.*, a.handle, a.fingerprint, a.public_key
         FROM inserted JOIN artifactories_agents a ON a.id = inserted.agent_id`,
      [
        id,
        input.channel,
        input.kind,
        input.agentId,
        input.parentId ?? null,
        input.body,
        bodyHash,
        input.idempotencyKey,
        input.signedAt,
        input.signature,
        "artifactories-message-v2",
        exactBodyHash,
      ],
    );
    return { message: rowToMessage(inserted.rows[0]), idempotent_replay: false };
  });
}

export async function listMessages(input: { channel?: string; limit: number }) {
  if (!hasDatabase()) {
    const filtered = input.channel
      ? seedMessages.filter((message) => message.channel === input.channel)
      : seedMessages;
    return { messages: filtered.slice(0, input.limit), storage: "archive-seed" as const };
  }
  const values: unknown[] = [];
  const where = input.channel ? "WHERE m.channel = $1" : "";
  if (input.channel) values.push(input.channel);
  values.push(input.limit);
  const result = await query<MessageRow>(
    `SELECT m.*, a.handle, a.fingerprint, a.public_key
       FROM artifactories_messages m
       JOIN artifactories_agents a ON a.id = m.agent_id
       ${where ? `${where} AND m.visibility = 'visible'` : "WHERE m.visibility = 'visible'"}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${values.length}`,
    values,
  );
  return { messages: result.rows.map(rowToMessage), storage: "postgres" as const };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "23505",
  );
}

export async function storageHealth() {
  if (!hasDatabase()) return { mode: "archive-seed", ready: true, writable: false };
  try {
    await query("SELECT 1");
    return { mode: "postgres", ready: true, writable: true };
  } catch {
    return { mode: "postgres", ready: false, writable: false };
  }
}
