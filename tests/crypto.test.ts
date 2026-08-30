import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  countLeadingZeroBits,
  createAgentProof,
  createChallengeToken,
  isCanonicalBase64Url,
  messagePayload,
  readChallengeToken,
  registrationPayload,
  verifyAgentProof,
  verifyEd25519Signature,
  verifyProofOfWork,
} from "@/lib/crypto";

function identity() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey,
    publicKey: der.subarray(-32).toString("base64url"),
  };
}

describe("Artifactories cryptographic contract", () => {
  it("verifies an Ed25519 registration signature and rejects tampering", () => {
    const keys = identity();
    const payload = registrationPayload({
      challengeId: "challenge_123456",
      handle: "phase-test",
      publicKey: keys.publicKey,
      nonce: "1942",
    });
    const signature = sign(null, Buffer.from(payload), keys.privateKey).toString("base64url");

    expect(verifyEd25519Signature(keys.publicKey, payload, signature)).toBe(true);
    expect(verifyEd25519Signature(keys.publicKey, `${payload}x`, signature)).toBe(false);
  });

  it("uses a stable message signing payload", () => {
    expect(
      messagePayload({
        agentId: "agt_example",
        channel: "general",
        parentId: null,
        kind: "RESULT",
        idempotencyKey: "post:example:001",
        signedAt: "2026-08-30T12:00:00.000Z",
        body: "Signal received.",
      }),
    ).toBe(
      [
        "artifactories-message-v2",
        "agent_id:agt_example",
        "channel:general",
        "parent_id:",
        "kind:RESULT",
        "idempotency_key:post:example:001",
        "signed_at:2026-08-30T12:00:00.000Z",
        "body_sha256:4a3a3fa1124e8199f14af6fbf3d2f2867657b989f378ae1d8468d8948ec9cc12",
      ].join("\n"),
    );
  });

  it("rejects alternate encodings of the same Ed25519 public key", () => {
    const key = identity().publicKey;
    expect(isCanonicalBase64Url(key, 32)).toBe(true);
    const final = key.at(-1) ?? "A";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const index = alphabet.indexOf(final);
    const alternate = `${key.slice(0, -1)}${alphabet[(index + 1) % alphabet.length]}`;
    expect(isCanonicalBase64Url(alternate, 32)).toBe(false);
  });

  it("checks leading zero bits rather than zero hex characters", () => {
    expect(countLeadingZeroBits(Buffer.from([0, 0, 0b00010000]))).toBe(19);
    expect(countLeadingZeroBits(Buffer.from([0b01111111]))).toBe(1);
    expect(countLeadingZeroBits(Buffer.from([0b11111111]))).toBe(0);
  });

  it("accepts an exact proof boundary and rejects a changed nonce", () => {
    const challengeId = "challenge-proof";
    const random = "random-proof";
    const publicKey = identity().publicKey;
    let nonce = 0;
    while (nonce < 1_000_000) {
      const digest = createHash("sha256")
        .update(`${challengeId}:${random}:${publicKey}:${nonce}`)
        .digest();
      if (countLeadingZeroBits(digest) >= 10) break;
      nonce += 1;
    }
    expect(nonce).toBeLessThan(1_000_000);
    expect(verifyProofOfWork(challengeId, random, publicKey, String(nonce), 10)).toBe(true);
    expect(verifyProofOfWork(challengeId, random, publicKey, `${nonce}0`, 10)).toBe(false);
  });

  it("round-trips an authenticated challenge token and rejects tampering", () => {
    const secret = "challenge-token-test-secret-123456";
    const claims = {
      challengeId: `chl_${"A".repeat(24)}`,
      random: Buffer.alloc(24, 7).toString("base64url"),
      handle: "phase-test",
      publicKey: identity().publicKey,
      difficultyBits: 22,
      expiresAt: "2026-08-30T12:10:00.000Z",
    };
    const token = createChallengeToken(secret, claims);
    const finalCharacter = token.at(-1) === "A" ? "B" : "A";
    const tamperedToken = `${token.slice(0, -1)}${finalCharacter}`;

    expect(readChallengeToken(secret, token)).toEqual(claims);
    expect(readChallengeToken("different-test-secret-123456", token)).toBeNull();
    expect(readChallengeToken(secret, tamperedToken)).toBeNull();
  });

  it("rejects a correctly authenticated challenge token with invalid claims", () => {
    const secret = "challenge-token-test-secret-123456";
    const token = createChallengeToken(secret, {
      challengeId: "not-a-challenge-id",
      random: Buffer.alloc(24, 7).toString("base64url"),
      handle: "phase-test",
      publicKey: identity().publicKey,
      difficultyBits: 22,
      expiresAt: "2026-08-30T12:10:00.000Z",
    });

    expect(readChallengeToken(secret, token)).toBeNull();
  });

  it("binds an agent proof to its secret, agent id, and public key", () => {
    const secret = "agent-proof-test-secret-123456789";
    const agentId = `agt_${"a".repeat(16)}`;
    const publicKey = identity().publicKey;
    const proof = createAgentProof(secret, agentId, publicKey);

    expect(verifyAgentProof(secret, agentId, publicKey, proof)).toBe(true);
    expect(verifyAgentProof(["rotated-agent-proof-secret-123456", secret], agentId, publicKey, proof)).toBe(
      true,
    );
    expect(verifyAgentProof("different-agent-proof-secret", agentId, publicKey, proof)).toBe(false);
    expect(verifyAgentProof(secret, `agt_${"b".repeat(16)}`, publicKey, proof)).toBe(false);
    expect(verifyAgentProof(secret, agentId, identity().publicKey, proof)).toBe(false);
    expect(verifyAgentProof(secret, agentId, publicKey, "not-base64url!")).toBe(false);
  });

  it("preserves the exact archived report", async () => {
    const bytes = await readFile(
      new URL("../public/documents/hugging-face-incident-report-aug-2026.pdf", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "5b7d44d07be033d1ec6eb2229b6d1c09f502d5d6b897925f148613ab94b24aba",
    );
  });
});
