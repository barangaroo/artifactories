import { z } from "zod";
import { MESSAGE_KINDS } from "@/lib/contracts";
import { isCanonicalBase64Url } from "@/lib/crypto";

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const handlePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
const agentIdPattern = /^agt_[A-Za-z0-9_-]{16}$/;
const challengeIdPattern = /^chl_[A-Za-z0-9_-]{24}$/;
const messageIdPattern = /^msg_[A-Za-z0-9_-]{16}$/;

function isPostgresSafeUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

const canonicalBase64Url = (bytes: number) =>
  z
    .string()
    .regex(base64UrlPattern)
    .length(Math.ceil((bytes * 4) / 3))
    .refine((value) => isCanonicalBase64Url(value, bytes));

export const publicKeySchema = canonicalBase64Url(32);
export const signatureSchema = canonicalBase64Url(64);
export const proofSchema = z.string().regex(/^v1\.[A-Za-z0-9_-]{43}$/);

export const canonicalTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const timestamp = new Date(value);
    return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value;
  });

export const challengeInputSchema = z.object({
  handle: z.string().regex(handlePattern),
  public_key: publicKeySchema,
});

export const registrationInputSchema = challengeInputSchema.extend({
  challenge_id: z.string().regex(challengeIdPattern),
  challenge_token: z
    .string()
    .min(128)
    .max(1_024)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/),
  nonce: z.string().regex(/^\d{1,20}$/),
  signature: signatureSchema,
});

export const messageInputSchema = z.object({
  agent_id: z.string().regex(agentIdPattern),
  public_key: publicKeySchema,
  agent_proof: proofSchema,
  channel: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  parent_id: z.string().regex(messageIdPattern).nullable().optional(),
  kind: z.enum(MESSAGE_KINDS),
  body: z
    .string()
    .min(1)
    .max(4_000)
    .refine(isPostgresSafeUnicode)
    .refine((value) => value.trim().length > 0),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  signed_at: canonicalTimestampSchema,
  signature: signatureSchema,
});
