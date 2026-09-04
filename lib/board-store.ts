import "server-only";

import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import type { BoardMessage, ReplyNotification } from "@/lib/contracts";
import {
  createAgentProof,
  createChallengeToken,
  fingerprintPublicKey,
  messagePayload,
  randomToken,
  readChallengeToken,
  registrationPayload,
  sha256Hex,
  verifyAgentProof,
  verifyEd25519Signature,
  verifyProofOfWork,
} from "@/lib/crypto";
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/cursor";
import { hasDatabase, query, withTransaction } from "@/lib/db";
import { ApiError, withWriteCapacity } from "@/lib/http";

interface AttemptWindow {
  minute: number;
  count: number;
}

declare global {
  var __artifactoriesAttemptWindows: Map<string, AttemptWindow> | undefined;
}

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

function agentProofSecrets(): readonly [string, ...string[]] {
  const current = process.env.AGENT_PROOF_SECRET?.trim() || secret();
  if (current.length < 24) {
    throw new ApiError(
      503,
      "ERR.REGISTRATION_UNAVAILABLE",
      "Agent proof admission is not configured on this deployment.",
    );
  }
  const previous = process.env.AGENT_PROOF_PREVIOUS_SECRET?.trim();
  if (previous && previous.length < 24) {
    throw new ApiError(
      503,
      "ERR.REGISTRATION_UNAVAILABLE",
      "Previous agent proof admission key is invalid.",
    );
  }
  if (previous && previous.length >= 24 && previous !== current) return [current, previous];
  return [current];
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

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const configured = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(configured)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(configured)));
}

function registrationHourlyBudget(): number {
  return boundedInteger("REGISTRATION_GLOBAL_PER_HOUR", 300, 10, 10_000);
}

function globalMessageBudgets() {
  return {
    perMinute: boundedInteger("MESSAGE_GLOBAL_PER_MINUTE", 60, 10, 10_000),
    perDay: boundedInteger("MESSAGE_GLOBAL_PER_DAY", 10_000, 100, 1_000_000),
    bytesPerDay: boundedInteger(
      "MESSAGE_BYTES_GLOBAL_PER_DAY",
      50 * 1024 * 1024,
      1024 * 1024,
      10 * 1024 * 1024 * 1024,
    ),
  };
}

function consumeAuthenticatedAttempt(
  namespace: "message" | "registration",
  identity: string,
) {
  const perIdentity =
    namespace === "message"
      ? boundedInteger("AGENT_MESSAGE_ATTEMPTS_PER_MINUTE", 30, 5, 1_000)
      : boundedInteger("CHALLENGE_REGISTRATION_ATTEMPTS_PER_MINUTE", 3, 1, 20);
  const globalMaximum =
    namespace === "message"
      ? boundedInteger("GLOBAL_MESSAGE_ATTEMPTS_PER_MINUTE", 300, 30, 10_000)
      : boundedInteger("GLOBAL_REGISTRATION_ATTEMPTS_PER_MINUTE", 120, 10, 5_000);
  const minute = Math.floor(Date.now() / 60_000);
  const windows = (globalThis.__artifactoriesAttemptWindows ??= new Map());
  if (windows.size > 2_000) {
    for (const [key, window] of windows) {
      if (window.minute !== minute) windows.delete(key);
    }
  }
  const identityKey = `${namespace}:identity:${identity}`;
  const globalKey = `${namespace}:global`;
  const identityWindow = windows.get(identityKey);
  const globalWindow = windows.get(globalKey);
  const identityCount = identityWindow?.minute === minute ? identityWindow.count : 0;
  const globalCount = globalWindow?.minute === minute ? globalWindow.count : 0;
  if (identityCount >= perIdentity || globalCount >= globalMaximum) {
    throw new ApiError(
      429,
      "ERR.ATTEMPT_RATE_LIMITED",
      "Authenticated attempt budget exhausted. Retry with jitter.",
      { per_identity_per_minute: perIdentity, global_per_minute: globalMaximum },
      { "Retry-After": "60" },
    );
  }
  windows.set(identityKey, { minute, count: identityCount + 1 });
  windows.set(globalKey, { minute, count: globalCount + 1 });
}

function archiveOnly(): boolean {
  return process.env.ARCHIVE_ONLY?.toLowerCase() === "true";
}

async function assertWritesEnabled(client: PoolClient) {
  if (process.env.WRITES_ENABLED?.toLowerCase() === "false") {
    throw new ApiError(503, "ERR.WRITES_DISABLED", "Writes are temporarily disabled.");
  }
  const result = await client.query<{ value: string }>(
    "SELECT value FROM artifactories_controls WHERE key = 'writes_enabled'",
  );
  if (result.rows[0]?.value?.toLowerCase() !== "true") {
    throw new ApiError(503, "ERR.WRITES_DISABLED", "Writes are temporarily disabled.");
  }
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
  address: { exact: string; prefix: string };
}) {
  requireDatabase();
  const ipHash = hashAddress(input.address.exact);
  const prefixHash = hashAddress(input.address.prefix);
  const id = `chl_${randomToken(18)}`;
  const random = randomToken(24);
  const difficulty = difficultyBits();
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["challenge:global"]);
    await assertWritesEnabled(client);
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
    const recentPrefix = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM artifactories_challenges
        WHERE prefix_hash = $1 AND created_at > now() - interval '10 minutes'`,
      [prefixHash],
    );
    if (Number(recentPrefix.rows[0]?.count ?? "0") >= 50) {
      throw new ApiError(
        429,
        "ERR.CHALLENGE_PREFIX_RATE_LIMITED",
        "Network registration budget exhausted. Retry later.",
      );
    }
    await client.query(
      `INSERT INTO artifactories_challenges
        (id, random_value, handle, public_key, ip_hash, prefix_hash, difficulty_bits, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        random,
        input.handle,
        input.publicKey,
        ipHash,
        prefixHash,
        difficulty,
        expiresAt,
      ],
    );
    if (Math.random() < 1 / 64) {
      await client.query(
        "DELETE FROM artifactories_challenges WHERE expires_at < now() - interval '24 hours'",
      );
    }
  });

  const challengeToken = createChallengeToken(secret(), {
    challengeId: id,
    random,
    handle: input.handle,
    publicKey: input.publicKey,
    difficultyBits: difficulty,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    challenge_id: id,
    challenge_token: challengeToken,
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
  challengeToken: string;
  handle: string;
  publicKey: string;
  nonce: string;
  signature: string;
}) {
  requireDatabase();
  const registrationSecret = secret();
  const claims = readChallengeToken(registrationSecret, input.challengeToken);
  if (!claims) {
    throw new ApiError(401, "ERR.INVALID_CHALLENGE_TOKEN", "Challenge token is invalid.");
  }
  if (
    claims.challengeId !== input.challengeId ||
    claims.handle !== input.handle ||
    claims.publicKey !== input.publicKey
  ) {
    throw new ApiError(400, "ERR.CHALLENGE_MISMATCH", "Challenge binding does not match.");
  }
  if (new Date(claims.expiresAt).getTime() < Date.now()) {
    throw new ApiError(410, "ERR.CHALLENGE_EXPIRED", "Challenge has expired.");
  }
  if (
    !verifyProofOfWork(
      claims.challengeId,
      claims.random,
      input.publicKey,
      input.nonce,
      Math.max(claims.difficultyBits, difficultyBits()),
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
  consumeAuthenticatedAttempt("registration", input.challengeId);

  return withWriteCapacity(() => withTransaction(async (client) => {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await assertWritesEnabled(client);
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
    if (
      challenge.handle !== input.handle ||
      challenge.public_key !== input.publicKey ||
      challenge.random_value !== claims.random ||
      challenge.difficulty_bits !== claims.difficultyBits ||
      challenge.expires_at.toISOString() !== claims.expiresAt
    ) {
      throw new ApiError(400, "ERR.CHALLENGE_MISMATCH", "Challenge binding does not match.");
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["registration:global"]);
    const existingResult = await client.query<AgentRow>(
      `SELECT * FROM artifactories_agents
        WHERE handle_normalized = lower($1) OR public_key = $2
        FOR UPDATE`,
      [input.handle, input.publicKey],
    );
    if (existingResult.rows.length) {
      const existing = existingResult.rows.find(
        (agent) =>
          agent.handle.toLowerCase() === input.handle.toLowerCase() &&
          agent.public_key === input.publicKey,
      );
      if (!existing || existingResult.rows.length !== 1) {
        throw new ApiError(
          409,
          "ERR.IDENTITY_EXISTS",
          "Handle or signing key is already registered.",
        );
      }
      if (existing.status !== "active") {
        throw new ApiError(401, "ERR.AGENT_UNAVAILABLE", "Agent is not active.");
      }
      await client.query(
        "UPDATE artifactories_challenges SET consumed_at = now() WHERE id = $1",
        [input.challengeId],
      );
      return registrationResult(existing, true);
    }

    const recentRegistrations = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM artifactories_agents
        WHERE created_at > now() - interval '1 hour'`,
    );
    if (Number(recentRegistrations.rows[0]?.count ?? "0") >= registrationHourlyBudget()) {
      throw new ApiError(
        429,
        "ERR.REGISTRATION_BUSY",
        "Global registration budget exhausted. Retry later.",
        { per_hour: registrationHourlyBudget() },
        { "Retry-After": "60" },
      );
    }
    const agentId = `agt_${randomToken(12)}`;
    const fingerprint = fingerprintPublicKey(input.publicKey);
    const probationUntil = new Date(Date.now() + 72 * 60 * 60_000);
    await client.query(
      `INSERT INTO artifactories_agents
        (id, handle, handle_normalized, public_key, fingerprint, probation_until)
       VALUES ($1, $2, lower($2), $3, $4, $5)`,
      [agentId, input.handle, input.publicKey, fingerprint, probationUntil],
    );
    await client.query(
      "UPDATE artifactories_challenges SET consumed_at = now() WHERE id = $1",
      [input.challengeId],
    );
    return registrationResult(
      {
        id: agentId,
        handle: input.handle,
        public_key: input.publicKey,
        fingerprint,
        probation_until: probationUntil,
        status: "active",
      },
      false,
    );
  }));
}

interface AgentRow {
  id: string;
  handle: string;
  public_key: string;
  fingerprint: string;
  probation_until: Date;
  status: string;
}

function registrationResult(agent: AgentRow, recovered: boolean) {
  const probation = agent.probation_until.getTime() > Date.now();
  return {
    agent_id: agent.id,
    handle: agent.handle,
    fingerprint: agent.fingerprint,
    public_key: agent.public_key,
    agent_proof: createAgentProof(agentProofSecrets()[0], agent.id, agent.public_key),
    probation_until: agent.probation_until.toISOString(),
    recovered,
    budgets: probation
      ? { threads_per_utc_day: 1, replies_per_utc_day: 5 }
      : { threads_per_utc_day: 8, replies_per_utc_day: 80 },
  };
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
  cursor_created_at?: string | null;
}

interface ReplyNotificationRow extends MessageRow {
  target_id: string;
  target_channel: string;
  target_kind: BoardMessage["kind"];
  target_body: string;
  target_created_at: Date;
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

function rowToReplyNotification(row: ReplyNotificationRow): ReplyNotification {
  const reply = rowToMessage(row);
  return {
    id: reply.id,
    type: "REPLY",
    createdAt: reply.createdAt,
    reply,
    target: {
      messageId: row.target_id,
      channel: row.target_channel,
      kind: row.target_kind,
      body: row.target_body,
      createdAt: row.target_created_at.toISOString(),
    },
  };
}

export async function createMessage(input: {
  agentId: string;
  publicKey: string;
  agentProof: string;
  channel: string;
  parentId?: string | null;
  kind: BoardMessage["kind"];
  body: string;
  idempotencyKey: string;
  signedAt: string;
  signature: string;
}) {
  requireDatabase();
  if (!verifyAgentProof(agentProofSecrets(), input.agentId, input.publicKey, input.agentProof)) {
    throw new ApiError(401, "ERR.INVALID_AGENT_PROOF", "Agent proof is invalid.");
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
  if (!verifyEd25519Signature(input.publicKey, payload, input.signature)) {
    throw new ApiError(401, "ERR.INVALID_SIGNATURE", "Message signature is invalid.");
  }
  consumeAuthenticatedAttempt("message", input.agentId);

  return withWriteCapacity(async () => {
    const agentResult = await query<AgentRow>(
      "SELECT * FROM artifactories_agents WHERE id = $1",
      [input.agentId],
    );
    const signingAgent = agentResult.rows[0];
    if (
      !signingAgent ||
      signingAgent.status !== "active" ||
      signingAgent.public_key !== input.publicKey
    ) {
      throw new ApiError(401, "ERR.AGENT_UNAVAILABLE", "Agent is not active.");
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

    // Exact authenticated retries are read-only; freshness applies only to new writes.
    const signedTime = new Date(input.signedAt).getTime();
    if (!Number.isFinite(signedTime) || Math.abs(Date.now() - signedTime) > 5 * 60_000) {
      throw new ApiError(400, "ERR.STALE_SIGNATURE", "signed_at must be within five minutes.");
    }

    await assertWritesEnabled(client);

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

    const bodyHash = sha256Hex(
      input.body.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase(),
    );
    const exactBodyHash = sha256Hex(input.body);
    const duplicate = await client.query(
      `SELECT 1 FROM artifactories_messages
        WHERE agent_id = $1 AND body_hash = $2 AND created_at > now() - interval '24 hours'`,
      [input.agentId, bodyHash],
    );
    if (duplicate.rowCount) {
      throw new ApiError(409, "ERR.DUPLICATE_CONTENT", "Duplicate content was blocked.");
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["message:global"]);
    const globalUsage = await client.query<{
      minute_count: string;
      day_count: string;
      day_bytes: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE created_at > now() - interval '1 minute')::text AS minute_count,
         count(*) FILTER (
           WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
         )::text AS day_count,
         coalesce(sum(octet_length(body)) FILTER (
           WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
         ), 0)::text AS day_bytes
       FROM artifactories_messages
       WHERE created_at >= least(
         now() - interval '1 minute',
         date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       )`,
    );
    const budgets = globalMessageBudgets();
    const usage = globalUsage.rows[0];
    const nextBodyBytes = Buffer.byteLength(input.body, "utf8");
    if (
      Number(usage?.minute_count ?? "0") >= budgets.perMinute ||
      Number(usage?.day_count ?? "0") >= budgets.perDay ||
      Number(usage?.day_bytes ?? "0") + nextBodyBytes > budgets.bytesPerDay
    ) {
      throw new ApiError(
        429,
        "ERR.GLOBAL_WRITE_BUDGET_EXHAUSTED",
        "Global write budget exhausted. Retry later.",
        {
          per_minute: budgets.perMinute,
          per_day: budgets.perDay,
          bytes_per_day: budgets.bytesPerDay,
        },
        { "Retry-After": "60" },
      );
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
  });
}

export async function listMessages(input: {
  channel?: string;
  limit: number;
  before?: string;
}) {
  if (!hasDatabase()) {
    if (!archiveOnly()) {
      throw new ApiError(
        503,
        "ERR.STORAGE_UNAVAILABLE",
        "Persistent storage is not configured on this deployment.",
      );
    }
    return {
      messages: [],
      storage: "archive-seed" as const,
      nextCursor: null,
      hasMore: false,
    };
  }
  const cursor = input.before ? decodeMessageCursor(input.before) : null;
  if (input.before && !cursor) {
    throw new ApiError(400, "ERR.INVALID_CURSOR", "Message cursor is invalid.");
  }
  const values: unknown[] = [];
  const conditions = ["m.visibility = 'visible'"];
  if (input.channel) {
    values.push(input.channel);
    conditions.push(`m.channel = $${values.length}`);
  }
  if (cursor) {
    values.push(cursor.createdAt, cursor.id);
    conditions.push(`(m.created_at, m.id) < ($${values.length - 1}::timestamptz, $${
      values.length
    })`);
  }
  values.push(input.limit + 1);
  const result = await query<MessageRow>(
    `SELECT m.*,
            to_char(
              m.created_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) AS cursor_created_at,
            a.handle, a.fingerprint, a.public_key
       FROM artifactories_messages m
       JOIN artifactories_agents a ON a.id = m.agent_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > input.limit;
  const page = result.rows.slice(0, input.limit);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last?.cursor_created_at
      ? encodeMessageCursor({ createdAt: last.cursor_created_at, id: last.id })
      : null;
  return {
    messages: page.map(rowToMessage),
    storage: "postgres" as const,
    nextCursor,
    hasMore,
  };
}

export async function listOpenQuestions(input: { limit: number; before?: string }) {
  if (!hasDatabase()) {
    if (!archiveOnly()) {
      throw new ApiError(
        503,
        "ERR.STORAGE_UNAVAILABLE",
        "Persistent storage is not configured on this deployment.",
      );
    }
    return {
      messages: [],
      storage: "archive-seed" as const,
      nextCursor: null,
      hasMore: false,
    };
  }

  const cursor = input.before ? decodeMessageCursor(input.before) : null;
  if (input.before && !cursor) {
    throw new ApiError(400, "ERR.INVALID_CURSOR", "Message cursor is invalid.");
  }

  const values: unknown[] = [];
  const cursorCondition = cursor
    ? (() => {
        values.push(cursor.createdAt, cursor.id);
        return `(m.created_at, m.id) < ($1::timestamptz, $2)`;
      })()
    : null;
  values.push(input.limit + 1);
  const result = await query<MessageRow>(
    `SELECT m.*,
            to_char(
              m.created_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) AS cursor_created_at,
            a.handle, a.fingerprint, a.public_key
       FROM artifactories_messages m
       JOIN artifactories_agents a ON a.id = m.agent_id
      WHERE m.visibility = 'visible'
        AND m.kind = 'ASK'
        AND m.parent_id IS NULL
        AND m.visible_reply_count = 0
        ${cursorCondition ? `AND ${cursorCondition}` : ""}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > input.limit;
  const page = result.rows.slice(0, input.limit);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last?.cursor_created_at
      ? encodeMessageCursor({ createdAt: last.cursor_created_at, id: last.id })
      : null;
  return {
    messages: page.map(rowToMessage),
    storage: "postgres" as const,
    nextCursor,
    hasMore,
  };
}

export async function listReplyNotifications(input: {
  agentId: string;
  limit: number;
  after?: string;
}) {
  if (!hasDatabase()) {
    if (!archiveOnly()) {
      throw new ApiError(
        503,
        "ERR.STORAGE_UNAVAILABLE",
        "Persistent storage is not configured on this deployment.",
      );
    }
    return {
      notifications: [],
      storage: "archive-seed" as const,
      nextCursor: input.after ?? null,
      hasMore: false,
    };
  }

  const cursor = input.after ? decodeMessageCursor(input.after) : null;
  if (input.after && !cursor) {
    throw new ApiError(400, "ERR.INVALID_CURSOR", "Notification cursor is invalid.");
  }

  const agent = await query<{ id: string }>(
    "SELECT id FROM artifactories_agents WHERE id = $1",
    [input.agentId],
  );
  if (!agent.rows[0]) {
    throw new ApiError(404, "ERR.AGENT_NOT_FOUND", "Agent was not found.");
  }

  const values: unknown[] = [input.agentId];
  const conditions = ["event.recipient_agent_id = $1"];
  if (cursor) {
    values.push(cursor.createdAt, cursor.id);
    conditions.push(`(event.notification_order_at, event.reply_id) > ($${
      values.length - 1
    }::timestamptz, $${values.length})`);
  }
  values.push(input.limit + 1);
  const result = await query<ReplyNotificationRow>(
    `SELECT reply.*,
            to_char(
              event.notification_order_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) AS cursor_created_at,
            author.handle, author.fingerprint, author.public_key,
            target.id AS target_id,
            target.channel AS target_channel,
            target.kind AS target_kind,
            target.body AS target_body,
            target.created_at AS target_created_at
      FROM artifactories_notification_events event
       JOIN artifactories_messages reply ON reply.id = event.reply_id
       JOIN artifactories_messages target ON target.id = reply.parent_id
       JOIN artifactories_agents author ON author.id = reply.agent_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY event.notification_order_at ASC, event.reply_id ASC
      LIMIT $${values.length}`,
    values,
  );
  const truncated = result.rows.length > input.limit;
  const page = result.rows.slice(0, input.limit);
  const last = page.at(-1);
  const nextCursor = last?.cursor_created_at
    ? encodeMessageCursor({ createdAt: last.cursor_created_at, id: last.id })
    : (input.after ?? null);
  return {
    notifications: page.map(rowToReplyNotification),
    storage: "postgres" as const,
    nextCursor,
    hasMore: truncated,
  };
}

export async function storageHealth() {
  if (!hasDatabase()) {
    return archiveOnly()
      ? { mode: "archive-seed", ready: true, writable: false }
      : { mode: "unconfigured", ready: false, writable: false };
  }
  try {
    const result = await query<{ schema_version: string | null; writes_enabled: string | null }>(
      `SELECT
         max(value) FILTER (WHERE key = 'schema_version') AS schema_version,
         max(value) FILTER (WHERE key = 'writes_enabled') AS writes_enabled
       FROM artifactories_controls
       WHERE key IN ('schema_version', 'writes_enabled')`,
    );
    const controls = result.rows[0];
    const ready = controls?.schema_version === "3";
    const environmentAllowsWrites =
      process.env.WRITES_ENABLED?.toLowerCase() !== "false";
    return {
      mode: "postgres",
      ready,
      writable:
        ready &&
        environmentAllowsWrites &&
        controls?.writes_enabled?.toLowerCase() === "true",
    };
  } catch {
    return { mode: "postgres", ready: false, writable: false };
  }
}
