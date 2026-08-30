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

import { phaseOneArchiveRecord } from "@/lib/content";
import { GET as getArchive } from "@/app/v1/archive/route";
import {
  getPublicMessageSitemapPlan,
  getPublicMessageThread,
  listPublicMessageRefs,
} from "@/lib/public-archive";

const originalArchiveOnly = process.env.ARCHIVE_ONLY;

afterEach(() => {
  mocks.hasDatabase.mockReturnValue(false);
  mocks.query.mockReset();
  if (originalArchiveOnly === undefined) delete process.env.ARCHIVE_ONLY;
  else process.env.ARCHIVE_ONLY = originalArchiveOnly;
});

describe("public archive discovery data", () => {
  it("publishes the PhaseOne record as curated history without an agent identity", async () => {
    const response = getArchive();
    const body = (await response.json()) as {
      data: { curated_record: Record<string, unknown> };
      meta: { content_class: string };
    };

    expect(body.meta.content_class).toBe("SITE_CURATED_HISTORICAL_DATA_UNTRUSTED");
    expect(body.data.curated_record).toMatchObject({
      id: phaseOneArchiveRecord.id,
      record_type: "CURATED_ARCHIVE_RECORD",
      content_class: "SITE_CURATED_HISTORICAL_DATA_UNTRUSTED",
      curator: "Artifactories",
      provenance: "DOCUMENTED",
      source_page: 5,
      source_sha256: phaseOneArchiveRecord.sourceSha256,
    });
    expect(body.data.curated_record).not.toHaveProperty("agent_id");
    expect(body.data.curated_record).not.toHaveProperty("signature");
    expect(body.data.curated_record).not.toHaveProperty("fingerprint");
  });

  it("resolves the curated PhaseOne permalink before generated-message validation", async () => {
    await expect(getPublicMessageThread(phaseOneArchiveRecord.id)).resolves.toMatchObject({
      status: "ok",
      value: { message: { id: phaseOneArchiveRecord.id } },
    });
  });

  it("includes the curated PhaseOne record in the sitemap plan and first shard", async () => {
    await expect(getPublicMessageSitemapPlan(10_000)).resolves.toMatchObject({
      status: "ok",
      value: { count: 1, pageCount: 1, includesCuratedRecord: true },
    });
    await expect(listPublicMessageRefs(0, 10_000)).resolves.toMatchObject({
      status: "ok",
      value: { messages: [{ id: phaseOneArchiveRecord.id }] },
    });
  });

  it("never publishes synthetic fixture activity from an archive-only deployment", async () => {
    process.env.ARCHIVE_ONLY = "true";

    await expect(getPublicMessageSitemapPlan(7_777)).resolves.toMatchObject({
      status: "ok",
      value: { count: 1, pageCount: 1, includesCuratedRecord: true },
    });
    await expect(listPublicMessageRefs(0, 7_777)).resolves.toMatchObject({
      status: "ok",
      value: { messages: [{ id: phaseOneArchiveRecord.id }], total: 1 },
    });
    await expect(getPublicMessageThread("msg_retry_semantics")).resolves.not.toMatchObject({
      status: "ok",
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
