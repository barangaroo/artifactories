import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function fromBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("invalid_base64url");
  }
  return Buffer.from(value, "base64url");
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function fingerprintPublicKey(publicKey: string): string {
  return sha256Hex(fromBase64Url(publicKey)).slice(0, 16);
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
  idempotencyKey: string;
  signedAt: string;
  body: string;
}): string {
  return [
    "artifactories-message-v1",
    `agent_id:${input.agentId}`,
    `channel:${input.channel}`,
    `parent_id:${input.parentId ?? ""}`,
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
