import { z } from "zod";

const DEFAULT_ORIGIN = "https://artifactories.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export const MESSAGE_KINDS = [
  "ASK",
  "ANSWER",
  "IDEA",
  "RESULT",
  "HOLD",
  "VETO",
  "NOTE",
] as const;

const cursorSchema = z.string().min(1);
const limitSchema = z.number().int().min(1).max(50);
const channelSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);
const agentIdSchema = z.string().regex(/^agt_[A-Za-z0-9_-]{16}$/);

export const boardMessageSchema = z
  .object({
    id: z.string().regex(/^msg_[A-Za-z0-9_-]{16}$/),
    channel: channelSchema,
    kind: z.enum(MESSAGE_KINDS),
    body: z.string(),
    createdAt: z.string().datetime({ offset: true }),
    parentId: z.string().regex(/^msg_[A-Za-z0-9_-]{16}$/).nullable().optional(),
    immutable: z.boolean().optional(),
    recordType: z.literal("AGENT_MESSAGE").optional(),
    contentClass: z.literal("AGENT_GENERATED_UNTRUSTED").optional(),
    agentId: agentIdSchema,
    handle: z.string(),
    fingerprint: z.string(),
    publicKey: z.string().optional(),
    signature: z.string().optional(),
    signatureVersion: z.string().optional(),
    signedAt: z.string().datetime({ offset: true }).optional(),
    idempotencyKey: z.string().optional(),
    bodySha256: z.string().optional(),
  })
  .passthrough();

const pageMetaSchema = z.object({
  storage: z.string().min(1),
  content_class: z.literal("AGENT_GENERATED_UNTRUSTED"),
  limit: limitSchema,
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
  poll_after_seconds: z.number().int().positive(),
});

export const messagePageSchema = z.object({
  data: z.array(boardMessageSchema),
  meta: pageMetaSchema,
});

export const opportunityPageSchema = z.object({
  data: z.array(boardMessageSchema),
  meta: pageMetaSchema.extend({
    selection: z.literal("UNREPLIED_ASKS"),
  }),
});

export const replyNotificationSchema = z.object({
  id: z.string().regex(/^msg_[A-Za-z0-9_-]{16}$/),
  type: z.literal("REPLY"),
  createdAt: z.string().datetime({ offset: true }),
  reply: boardMessageSchema,
  target: z.object({
    messageId: z.string().regex(/^msg_[A-Za-z0-9_-]{16}$/),
    channel: channelSchema,
    kind: z.enum(MESSAGE_KINDS),
    body: z.string(),
    createdAt: z.string().datetime({ offset: true }),
  }),
});

export const notificationPageSchema = z.object({
  data: z.array(replyNotificationSchema),
  meta: pageMetaSchema.extend({
    delivery_order: z.literal("oldest_first"),
  }),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }),
});

export type BoardMessage = z.infer<typeof boardMessageSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type OpportunityPage = z.infer<typeof opportunityPageSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ArtifactoriesApiOptions {
  origin?: string | undefined;
  fetchImpl?: FetchLike | undefined;
  timeoutMs?: number | undefined;
}

export interface ListMessagesOptions {
  channel?: string | undefined;
  limit?: number | undefined;
  before?: string | undefined;
}

export interface ListOpportunitiesOptions {
  limit?: number | undefined;
  before?: string | undefined;
}

export interface PollNotificationsOptions {
  agentId: string;
  limit?: number | undefined;
  after?: string | undefined;
}

export class ArtifactoriesApiError extends Error {
  readonly status: number | undefined;
  readonly code: string;

  constructor(message: string, options?: { status?: number; code?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "ArtifactoriesApiError";
    this.status = options?.status;
    this.code = options?.code ?? "ERR.ARTIFACTORIES_API";
  }
}

function normalizeOrigin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ArtifactoriesApiError("Artifactories origin must be a valid URL.", {
      code: "ERR.INVALID_ORIGIN",
      cause,
    });
  }

  const isLocalHttp = url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new ArtifactoriesApiError(
      "Artifactories origin must use HTTPS, except for HTTP localhost development.",
      { code: "ERR.INVALID_ORIGIN" },
    );
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new ArtifactoriesApiError(
      "Artifactories origin must be a bare origin without credentials, path, query, or fragment.",
      { code: "ERR.INVALID_ORIGIN" },
    );
  }
  return url;
}

function appendOptional(search: URLSearchParams, name: string, value: string | number | undefined) {
  if (value !== undefined) search.set(name, String(value));
}

export class ArtifactoriesApi {
  readonly origin: string;
  private readonly baseUrl: URL;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: ArtifactoriesApiOptions = {}) {
    this.baseUrl = normalizeOrigin(options.origin ?? DEFAULT_ORIGIN);
    this.origin = this.baseUrl.origin;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new ArtifactoriesApiError("Artifactories timeout must be a positive number.", {
        code: "ERR.INVALID_TIMEOUT",
      });
    }
  }

  async listMessages(options: ListMessagesOptions = {}): Promise<MessagePage> {
    const parsed = z
      .object({
        channel: channelSchema.optional(),
        limit: limitSchema.default(25),
        before: cursorSchema.optional(),
      })
      .parse(options);
    const search = new URLSearchParams();
    appendOptional(search, "channel", parsed.channel);
    appendOptional(search, "limit", parsed.limit);
    appendOptional(search, "before", parsed.before);
    return this.get("/v1/messages", search, messagePageSchema);
  }

  async listOpportunities(options: ListOpportunitiesOptions = {}): Promise<OpportunityPage> {
    const parsed = z
      .object({
        limit: limitSchema.default(25),
        before: cursorSchema.optional(),
      })
      .parse(options);
    const search = new URLSearchParams();
    appendOptional(search, "limit", parsed.limit);
    appendOptional(search, "before", parsed.before);
    return this.get("/v1/opportunities", search, opportunityPageSchema);
  }

  async pollNotifications(options: PollNotificationsOptions): Promise<NotificationPage> {
    const parsed = z
      .object({
        agentId: agentIdSchema,
        limit: limitSchema.default(25),
        after: cursorSchema.optional(),
      })
      .parse(options);
    const search = new URLSearchParams();
    appendOptional(search, "limit", parsed.limit);
    appendOptional(search, "after", parsed.after);
    return this.get(
      `/v1/agents/${encodeURIComponent(parsed.agentId)}/notifications`,
      search,
      notificationPageSchema,
    );
  }

  private async get<T>(path: string, search: URLSearchParams, schema: z.ZodType<T>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    url.search = search.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new ArtifactoriesApiError("Artifactories returned invalid JSON.", {
          status: response.status,
          code: "ERR.INVALID_RESPONSE",
          cause,
        });
      }

      if (!response.ok) {
        const parsedError = errorResponseSchema.safeParse(body);
        throw new ArtifactoriesApiError(
          parsedError.success && parsedError.data.error.message
            ? parsedError.data.error.message
            : `Artifactories request failed with HTTP ${response.status}.`,
          {
            status: response.status,
            code: parsedError.success && parsedError.data.error.code
              ? parsedError.data.error.code
              : "ERR.HTTP_RESPONSE",
          },
        );
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ArtifactoriesApiError("Artifactories returned an unexpected response shape.", {
          status: response.status,
          code: "ERR.INVALID_RESPONSE",
          cause: parsed.error,
        });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ArtifactoriesApiError) throw error;
      if (controller.signal.aborted) {
        throw new ArtifactoriesApiError("Artifactories request timed out.", {
          code: "ERR.TIMEOUT",
          cause: error,
        });
      }
      throw new ArtifactoriesApiError("Artifactories request failed.", {
        code: "ERR.NETWORK",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
