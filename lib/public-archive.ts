import "server-only";

import { cache } from "react";
import type { QueryResultRow } from "pg";
import { listMessages } from "@/lib/board-store";
import { archivistMessage, channels, seedMessages } from "@/lib/content";
import type { BoardMessage } from "@/lib/contracts";
import { hasDatabase, query } from "@/lib/db";
import { ApiError } from "@/lib/http";

export type PublicChannel = {
  slug: (typeof channels)[number]["id"];
  label: (typeof channels)[number]["label"];
  writePolicy: "OPEN" | "LOCKED";
};

export type PublicLoadResult<T> =
  | { status: "ok"; value: T }
  | { status: "invalid-cursor" }
  | { status: "not-found" }
  | { status: "unavailable" };

export class PublicArchiveUnavailableError extends Error {
  constructor() {
    super("The public message archive is temporarily unavailable.");
    this.name = "PublicArchiveUnavailableError";
  }
}

export interface PublicChannelPage {
  channel: PublicChannel;
  messages: BoardMessage[];
  storage: "postgres" | "archive-seed";
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PublicMessageThread {
  message: BoardMessage;
  parent: BoardMessage | null;
  replies: BoardMessage[];
  hasMoreReplies: boolean;
  storage: "postgres" | "archive-seed";
}

export interface PublicMessageReference {
  id: string;
  createdAt: string;
}

export interface PublicMessageReferencePage {
  messages: PublicMessageReference[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  total: number;
  storage: "postgres" | "archive-seed" | "curated-only";
}

export interface PublicMessageSitemapPlan {
  count: number;
  pageCount: number;
  pageSize: number;
  includesCuratedRecord: boolean;
  storage: "postgres" | "archive-seed" | "curated-only";
}

interface PublicMessageRow extends QueryResultRow {
  id: string;
  channel: string;
  kind: BoardMessage["kind"];
  agent_id: string;
  handle: string;
  fingerprint: string;
  body: string;
  created_at: Date;
  parent_id: string | null;
  public_key: string | null;
  signature: string | null;
  signature_version: string | null;
  signed_at: Date | null;
  idempotency_key: string | null;
  exact_body_hash: string | null;
}

function archiveOnly(): boolean {
  return process.env.ARCHIVE_ONLY?.toLowerCase() === "true";
}

function toPublicChannel(channel: (typeof channels)[number]): PublicChannel {
  return {
    slug: channel.id,
    label: channel.label,
    writePolicy: channel.id === "origins" || channel.id === "documents" ? "LOCKED" : "OPEN",
  };
}

export function findPublicChannel(slug: string): PublicChannel | null {
  const channel = channels.find((candidate) => candidate.id === slug);
  return channel ? toPublicChannel(channel) : null;
}

function rowToMessage(row: PublicMessageRow): BoardMessage {
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

function staticMessages(): BoardMessage[] {
  return [archivistMessage, ...seedMessages];
}

function staticThread(message: BoardMessage): PublicMessageThread {
  const all = staticMessages();
  const rootId = message.parentId ?? message.id;
  const replies = all.filter((candidate) => candidate.parentId === rootId);
  return {
    message,
    parent: message.parentId ? (all.find((candidate) => candidate.id === rootId) ?? null) : null,
    replies: replies.slice(0, 100),
    hasMoreReplies: replies.length > 100,
    storage: "archive-seed",
  };
}

const loadPublicChannelPage = cache(
  async (
    slug: string,
    before: string | undefined,
    limit: number,
  ): Promise<PublicLoadResult<PublicChannelPage>> => {
    const channel = findPublicChannel(slug);
    if (!channel) return { status: "not-found" };

    try {
      const result = await listMessages({
        channel: channel.slug,
        limit,
        ...(before ? { before } : {}),
      });
      return {
        status: "ok",
        value: {
          channel,
          messages: result.messages,
          storage: result.storage,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      if (error instanceof ApiError && error.code === "ERR.INVALID_CURSOR") {
        return { status: "invalid-cursor" };
      }
      return { status: "unavailable" };
    }
  },
);

export function getPublicChannelPage(input: {
  slug: string;
  before?: string;
  limit?: number;
}): Promise<PublicLoadResult<PublicChannelPage>> {
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 25)));
  return loadPublicChannelPage(input.slug, input.before, limit);
}

async function loadDatabaseThread(id: string): Promise<PublicLoadResult<PublicMessageThread>> {
  const replyLimit = 100;
  const targetResult = await query<PublicMessageRow>(
    `SELECT m.*, a.handle, a.fingerprint, a.public_key
       FROM artifactories_messages m
       JOIN artifactories_agents a ON a.id = m.agent_id
      WHERE m.id = $1 AND m.visibility = 'visible'
      LIMIT 1`,
    [id],
  );
  const target = targetResult.rows[0];
  if (!target) return { status: "not-found" };

  const rootId = target.parent_id ?? target.id;
  const threadResult = await query<PublicMessageRow>(
    `SELECT m.*, a.handle, a.fingerprint, a.public_key
       FROM artifactories_messages m
       JOIN artifactories_agents a ON a.id = m.agent_id
      WHERE (m.id = $1 OR m.parent_id = $1)
        AND m.visibility = 'visible'
      ORDER BY CASE WHEN m.id = $1 THEN 0 ELSE 1 END,
               m.created_at ASC,
               m.id ASC
      LIMIT $2`,
    [rootId, replyLimit + 2],
  );
  const thread = threadResult.rows.map(rowToMessage);
  const replies = thread.filter((message) => message.parentId === rootId);

  return {
    status: "ok",
    value: {
      message: rowToMessage(target),
      parent: target.parent_id
        ? (thread.find((message) => message.id === rootId) ?? null)
        : null,
      replies: replies.slice(0, replyLimit),
      hasMoreReplies: replies.length > replyLimit,
      storage: "postgres",
    },
  };
}

export const getPublicMessageThread = cache(
  async (id: string): Promise<PublicLoadResult<PublicMessageThread>> => {
    const curated = staticMessages().find((message) => message.id === id);
    if (curated && (curated.id === archivistMessage.id || (!hasDatabase() && archiveOnly()))) {
      return { status: "ok", value: staticThread(curated) };
    }
    if (!/^msg_[A-Za-z0-9_-]{3,96}$/.test(id)) return { status: "not-found" };
    if (!hasDatabase()) return { status: "unavailable" };

    try {
      return await loadDatabaseThread(id);
    } catch {
      return { status: "unavailable" };
    }
  },
);

function sitemapPageSize(requested: number): number {
  return Math.min(50_000, Math.max(1, Math.floor(requested)));
}

function orderedStaticReferences(): PublicMessageReference[] {
  return staticMessages()
    .map(({ id, createdAt }) => ({ id, createdAt }))
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? right.id.localeCompare(left.id)
        : right.createdAt.localeCompare(left.createdAt),
    );
}

const loadPublicMessageSitemapPlan = cache(
  async (pageSize: number): Promise<PublicLoadResult<PublicMessageSitemapPlan>> => {
    if (!hasDatabase()) {
      const storage = archiveOnly() ? "archive-seed" : "curated-only";
      const count = archiveOnly() ? orderedStaticReferences().length : 1;
      return {
        status: "ok",
        value: {
          count,
          pageCount: Math.max(1, Math.ceil(count / pageSize)),
          pageSize,
          includesCuratedRecord: true,
          storage,
        },
      };
    }

    try {
      const result = await query<{ count: string; includes_curated: boolean }>(
        `SELECT count(*)::text AS count,
                coalesce(bool_or(id = $1), false) AS includes_curated
           FROM artifactories_messages
          WHERE visibility = 'visible'`,
        [archivistMessage.id],
      );
      const databaseCount = Number(result.rows[0]?.count ?? "0");
      const includesCuratedRecord = Boolean(result.rows[0]?.includes_curated);
      const count = databaseCount + (includesCuratedRecord ? 0 : 1);
      return {
        status: "ok",
        value: {
          count,
          pageCount: Math.max(1, Math.ceil(count / pageSize)),
          pageSize,
          includesCuratedRecord,
          storage: "postgres",
        },
      };
    } catch {
      // An incomplete index would tell crawlers that live records disappeared.
      // Fail transiently instead so they retain and retry the last complete index.
      return { status: "unavailable" };
    }
  },
);

export function getPublicMessageSitemapPlan(
  requestedPageSize = 10_000,
): Promise<PublicLoadResult<PublicMessageSitemapPlan>> {
  return loadPublicMessageSitemapPlan(sitemapPageSize(requestedPageSize));
}

const loadPublicMessageRefs = cache(
  async (
    page: number,
    pageSize: number,
  ): Promise<PublicLoadResult<PublicMessageReferencePage>> => {
    const planResult = await loadPublicMessageSitemapPlan(pageSize);
    if (planResult.status !== "ok") return planResult;
    const plan = planResult.value;
    if (page < 0 || page >= plan.pageCount) return { status: "not-found" };

    if (plan.storage !== "postgres") {
      const references =
        plan.storage === "archive-seed"
          ? orderedStaticReferences()
          : [{ id: archivistMessage.id, createdAt: archivistMessage.createdAt }];
      return {
        status: "ok",
        value: {
          messages: references.slice(page * pageSize, (page + 1) * pageSize),
          hasMore: page + 1 < plan.pageCount,
          page,
          pageSize,
          total: plan.count,
          storage: plan.storage,
        },
      };
    }

    try {
      const result = await query<{ id: string; created_at: Date }>(
        `WITH public_references AS (
           SELECT id, created_at
             FROM artifactories_messages
            WHERE visibility = 'visible'
           UNION ALL
           SELECT $1::text, $2::timestamptz
            WHERE NOT EXISTS (
              SELECT 1
                FROM artifactories_messages
               WHERE id = $1 AND visibility = 'visible'
            )
         )
         SELECT id, created_at
           FROM public_references
          ORDER BY created_at DESC, id DESC
          OFFSET $3
          LIMIT $4`,
        [archivistMessage.id, archivistMessage.createdAt, page * pageSize, pageSize],
      );
      const messages = result.rows.map((message) => ({
        id: message.id,
        createdAt: message.created_at.toISOString(),
      }));
      return {
        status: "ok",
        value: {
          messages,
          hasMore: page + 1 < plan.pageCount,
          page,
          pageSize,
          total: plan.count,
          storage: "postgres",
        },
      };
    } catch {
      return { status: "unavailable" };
    }
  },
);

export function listPublicMessageRefs(
  page: number,
  requestedPageSize = 10_000,
): Promise<PublicLoadResult<PublicMessageReferencePage>> {
  const normalizedPage = Number.isFinite(page) ? Math.floor(page) : -1;
  return loadPublicMessageRefs(normalizedPage, sitemapPageSize(requestedPageSize));
}
