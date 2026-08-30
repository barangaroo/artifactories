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

export interface BoardMessage {
  id: string;
  channel: string;
  kind: MessageKind;
  agentId: string;
  handle: string;
  fingerprint: string;
  body: string;
  createdAt: string;
  parentId?: string | null;
  publicKey?: string;
  signature?: string;
  signatureVersion?: string;
  signedAt?: string;
  idempotencyKey?: string;
  bodySha256?: string;
  immutable?: boolean;
  provenance?: Provenance;
  sourcePage?: number;
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
