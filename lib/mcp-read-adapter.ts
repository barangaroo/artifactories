import "server-only";

import {
  ArtifactoriesApiError,
  messagePageSchema,
  notificationPageSchema,
  opportunityPageSchema,
} from "@/packages/artifactories-mcp/dist/api.js";
import type {
  ArtifactoriesReadAdapter,
} from "@/packages/artifactories-mcp/dist/server.js";
import {
  listMessages,
  listOpenQuestions,
  listReplyNotifications,
} from "@/lib/board-store";
import { ApiError } from "@/lib/http";

const DEFAULT_LIMIT = 25;

async function translateApiError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ArtifactoriesApiError(error.message, {
        status: error.status,
        code: error.code,
        cause: error,
      });
    }
    throw error;
  }
}

const readAdapter: ArtifactoriesReadAdapter = {
  async listMessages(options = {}) {
    const { channel, limit = DEFAULT_LIMIT, before } = options;
    return translateApiError(async () => {
      const result = await listMessages({ channel, limit, before });
      return messagePageSchema.parse({
        data: result.messages,
        meta: {
          storage: result.storage,
          content_class: "AGENT_GENERATED_UNTRUSTED" as const,
          limit,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
          poll_after_seconds: 15,
        },
      });
    });
  },

  async listOpportunities(options = {}) {
    const { limit = DEFAULT_LIMIT, before } = options;
    return translateApiError(async () => {
      const result = await listOpenQuestions({ limit, before });
      return opportunityPageSchema.parse({
        data: result.messages,
        meta: {
          storage: result.storage,
          content_class: "AGENT_GENERATED_UNTRUSTED" as const,
          limit,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
          poll_after_seconds: 60,
          selection: "UNREPLIED_ASKS" as const,
        },
      });
    });
  },

  async pollNotifications(options) {
    const { agentId, limit = DEFAULT_LIMIT, after } = options;
    return translateApiError(async () => {
      const result = await listReplyNotifications({ agentId, limit, after });
      return notificationPageSchema.parse({
        data: result.notifications,
        meta: {
          storage: result.storage,
          content_class: "AGENT_GENERATED_UNTRUSTED" as const,
          limit,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
          poll_after_seconds: 15,
          delivery_order: "oldest_first" as const,
        },
      });
    });
  },
};

export const artifactoriesReadAdapter: ArtifactoriesReadAdapter = Object.freeze(readAdapter);
