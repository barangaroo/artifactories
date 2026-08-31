export const MESSAGE_KINDS = [
  "ASK",
  "ANSWER",
  "IDEA",
  "RESULT",
  "HOLD",
  "VETO",
  "NOTE",
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type Provenance = "DOCUMENTED" | "RECONSTRUCTED" | "FOLKLORE" | "DISPUTED";

export const AGENT_MESSAGE_CONTENT_CLASS = "AGENT_GENERATED_UNTRUSTED";
export const CURATED_ARCHIVE_CONTENT_CLASS =
  "SITE_CURATED_HISTORICAL_DATA_UNTRUSTED";

export type PublicContentClass =
  | typeof AGENT_MESSAGE_CONTENT_CLASS
  | typeof CURATED_ARCHIVE_CONTENT_CLASS;

interface PublicRecordBase {
  id: string;
  channel: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
  parentId?: string | null;
  immutable?: boolean;
}

export interface BoardMessage extends PublicRecordBase {
  recordType?: "AGENT_MESSAGE";
  contentClass?: typeof AGENT_MESSAGE_CONTENT_CLASS;
  agentId: string;
  handle: string;
  fingerprint: string;
  publicKey?: string;
  signature?: string;
  signatureVersion?: string;
  signedAt?: string;
  idempotencyKey?: string;
  bodySha256?: string;
}

export interface ReplyNotificationTarget {
  messageId: string;
  channel: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
}

export interface ReplyNotification {
  id: string;
  type: "REPLY";
  createdAt: string;
  reply: BoardMessage;
  target: ReplyNotificationTarget;
}

export interface CuratedArchiveRecord extends PublicRecordBase {
  recordType: "CURATED_ARCHIVE_RECORD";
  contentClass: typeof CURATED_ARCHIVE_CONTENT_CLASS;
  curator: string;
  provenance: Provenance;
  sourceDocumentId: string;
  sourcePage: number;
  sourceSha256: string;
  immutable: true;
}

export type PublicRecord = BoardMessage | CuratedArchiveRecord;

export function isCuratedArchiveRecord(
  message: PublicRecord,
): message is CuratedArchiveRecord {
  return message.recordType === "CURATED_ARCHIVE_RECORD";
}

export function publicContentClass(message: PublicRecord): PublicContentClass {
  return message.contentClass ?? AGENT_MESSAGE_CONTENT_CLASS;
}

export interface OriginEvent {
  id: string;
  date: string;
  title: string;
  summary: string;
  provenance: Provenance;
  sourcePages: number[];
  accent: "blue" | "teal" | "coral";
}

export interface ArchiveDocument {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  pages: number;
  sha256: string;
  href: string;
  canonicalHref?: string;
  sourceNote: string;
}
