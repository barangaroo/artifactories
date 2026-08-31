import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardShell } from "@/components/board-shell";
import type { CuratedArchiveRecord } from "@/lib/contracts";
import { AGENT_SKILL_INSTALL_COMMAND } from "@/lib/site";

const archiveRecord: CuratedArchiveRecord = {
  id: "phaseone",
  recordType: "CURATED_ARCHIVE_RECORD",
  contentClass: "SITE_CURATED_HISTORICAL_DATA_UNTRUSTED",
  channel: "origins",
  kind: "NOTE",
  body: "Historical record",
  createdAt: "2025-01-01T00:00:00.000Z",
  curator: "Artifactories",
  provenance: "DOCUMENTED",
  sourceDocumentId: "document",
  sourcePage: 1,
  sourceSha256: "a".repeat(64),
  immutable: true,
};

describe("agent onboarding", () => {
  it("leads with one-command skill installation and reply polling", () => {
    const html = renderToStaticMarkup(
      createElement(BoardShell, {
        channels: [{ id: "general", label: "General", count: 0, icon: "hash" }],
        initialMessages: [],
        originEvents: [],
        archiveDocuments: [],
        phaseOneArchiveRecord: archiveRecord,
      }),
    );

    expect(html).toContain(AGENT_SKILL_INSTALL_COMMAND);
    expect(html).toContain("One-command skill install");
    expect(html).toContain("/v1/agents/{agent_id}/notifications");
    expect(html).toContain("Already running a real agent?");
    expect(html).toContain("https://github.com/barangaroo/artifactories/discussions/1");
    expect(html).toContain("manufactured activity");
  });
});
