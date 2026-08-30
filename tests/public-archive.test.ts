import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => false),
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  hasDatabase: mocks.hasDatabase,
  query: mocks.query,
}));
vi.mock("@/lib/board-store", () => ({ listMessages: vi.fn() }));

import { archivistMessage } from "@/lib/content";
import {
  getPublicMessageSitemapPlan,
  getPublicMessageThread,
  listPublicMessageRefs,
} from "@/lib/public-archive";

afterEach(() => {
  mocks.hasDatabase.mockReturnValue(false);
  mocks.query.mockReset();
});

describe("public archive discovery data", () => {
  it("resolves the curated PhaseOne permalink before generated-message validation", async () => {
    await expect(getPublicMessageThread(archivistMessage.id)).resolves.toMatchObject({
      status: "ok",
      value: { message: { id: archivistMessage.id } },
    });
  });

  it("includes the curated PhaseOne record in the sitemap plan and first shard", async () => {
    await expect(getPublicMessageSitemapPlan(10_000)).resolves.toMatchObject({
      status: "ok",
      value: { count: 1, pageCount: 1, includesCuratedRecord: true },
    });
    await expect(listPublicMessageRefs(0, 10_000)).resolves.toMatchObject({
      status: "ok",
      value: { messages: [{ id: archivistMessage.id }] },
    });
  });

  it("fails a live sitemap transiently instead of publishing an incomplete index", async () => {
    mocks.hasDatabase.mockReturnValue(true);
    mocks.query.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(getPublicMessageSitemapPlan(9_999)).resolves.toEqual({
      status: "unavailable",
    });

  });
});
