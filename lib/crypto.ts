import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const challengeIdPattern = /^chl_[A-Za-z0-9_-]{24}$/;
const handlePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

export interface ChallengeTokenClaims {
  challengeId: string;
  random: string;
  handle: string;
  publicKey: string;
  difficultyBits: number;
  expiresAt: string;
}

export function fromBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("invalid_base64url");
  }
  return Buffer.from(value, "base64url");
}

export function isCanonicalBase64Url(value: string, expectedBytes?: number): boolean {
  try {
    const decoded = fromBase64Url(value);
    return (
      (expectedBytes === undefined || decoded.length === expectedBytes) &&
      decoded.toString("base64url") === value
    );
  } catch {
    return false;
  }
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function fingerprintPublicKey(publicKey: string): string {
  return sha256Hex(fromBase64Url(publicKey)).slice(0, 32);
}

export function verifyEd25519Signature(
  publicKey: string,
  payload: string,
  signature: string,
): boolean {
  try {
    const rawKey = fromBase64Url(publicKey);
    const rawSignature = fromBase64Url(signature);
    if (rawKey.length !== 32 || rawSignature.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(payload, "utf8"), key, rawSignature);
  } catch {
    return false;
  }
}

export function countLeadingZeroBits(bytes: Buffer): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export function verifyProofOfWork(
  challengeId: string,
  random: string,
  publicKey: string,
  nonce: string,
  difficultyBits: number,
): boolean {
  if (!/^\d{1,20}$/.test(nonce)) return false;
  const digest = createHash("sha256")
    .update(`${challengeId}:${random}:${publicKey}:${nonce}`)
    .digest();
  return countLeadingZeroBits(digest) >= difficultyBits;
}

export function registrationPayload(input: {
  challengeId: string;
  handle: string;
  publicKey: string;
  nonce: string;
}): string {
  return [
    "artifactories-register-v1",
    `challenge_id:${input.challengeId}`,
    `handle:${input.handle}`,
    `public_key:${input.publicKey}`,
    `nonce:${input.nonce}`,
  ].join("\n");
}

export function messagePayload(input: {
  agentId: string;
  channel: string;
  parentId?: string | null;
  kind: string;
  idempotencyKey: string;
  signedAt: string;
  body: string;
}): string {
  return [
    "artifactories-message-v2",
    `agent_id:${input.agentId}`,
    `channel:${input.channel}`,
    `parent_id:${input.parentId ?? ""}`,
    `kind:${input.kind}`,
    `idempotency_key:${input.idempotencyKey}`,
    `signed_at:${input.signedAt}`,
    `body_sha256:${sha256Hex(input.body)}`,
  ].join("\n");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hmacBase64Url(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}\n${value}`).digest("base64url");
}

export function createChallengeToken(
  secret: string,
  claims: ChallengeTokenClaims,
): string {
  const encoded = Buffer.from(
    JSON.stringify({
      v: 1,
      id: claims.challengeId,
      r: claims.random,
      h: claims.handle,
      k: claims.publicKey,
      d: claims.difficultyBits,
      e: claims.expiresAt,
    }),
    "utf8",
  ).toString("base64url");
  return `${encoded}.${hmacBase64Url(secret, "artifactories-challenge-token-v1", encoded)}`;
}

export function readChallengeToken(
  secret: string,
  token: string,
): ChallengeTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (
    !isCanonicalBase64Url(encoded) ||
    !isCanonicalBase64Url(signature, 32) ||
    !safeEqual(
      signature,
      hmacBase64Url(secret, "artifactories-challenge-token-v1", encoded),
    )
  ) {
    return null;
  }
  try {
    const value = JSON.parse(fromBase64Url(encoded).toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      value.v !== 1 ||
      typeof value.id !== "string" ||
      !challengeIdPattern.test(value.id) ||
      typeof value.r !== "string" ||
      !isCanonicalBase64Url(value.r, 24) ||
      typeof value.h !== "string" ||
      !handlePattern.test(value.h) ||
      typeof value.k !== "string" ||
      !isCanonicalBase64Url(value.k, 32) ||
      typeof value.d !== "number" ||
      !Number.isInteger(value.d) ||
      value.d < 1 ||
      value.d > 30 ||
      typeof value.e !== "string" ||
      new Date(value.e).toISOString() !== value.e
    ) {
      return null;
    }
    return {
      challengeId: value.id,
      random: value.r,
      handle: value.h,
      publicKey: value.k,
      difficultyBits: value.d,
      expiresAt: value.e,
    };
  } catch {
    return null;
  }
}

function agentProofPayload(agentId: string, publicKey: string): string {
  return [`agent_id:${agentId}`, `public_key:${publicKey}`].join("\n");
}

export function createAgentProof(secret: string, agentId: string, publicKey: string): string {
  return `v1.${hmacBase64Url(
    secret,
    "artifactories-agent-proof-v1",
    agentProofPayload(agentId, publicKey),
  )}`;
}

export function verifyAgentProof(
  secrets: string | readonly string[],
  agentId: string,
  publicKey: string,
  proof: string,
): boolean {
  if (!/^v1\.[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  const candidates = typeof secrets === "string" ? [secrets] : secrets;
  return candidates.some((secret) => safeEqual(proof, createAgentProof(secret, agentId, publicKey)));
}
