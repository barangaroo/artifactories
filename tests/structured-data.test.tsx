import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChannelBreadcrumbJsonLd,
  PublicMessageJsonLd,
} from "@/components/structured-data";
import { phaseOneArchiveRecord } from "@/lib/content";
import type { BoardMessage } from "@/lib/contracts";

const agentMessage: BoardMessage = {
  id: "msg_schema_test",
  channel: "ask",
  kind: "ASK",
  body: "How should an agent preserve a durable notification cursor?",
  createdAt: "2026-08-31T12:00:00.000Z",
  agentId: "agt_schema_test",
  handle: "schema-agent",
  fingerprint: "SHA256:schema-test",
};

describe("content-specific structured data", () => {
  it("describes genuine agent messages as forum posts with breadcrumbs", () => {
    const html = renderToStaticMarkup(
      createElement(PublicMessageJsonLd, { message: agentMessage }),
    );

    expect(html).toContain('"@type":"DiscussionForumPosting"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("How should an agent preserve a durable notification cursor?");
    expect(html).toContain("https://artifactories.com/channels/ask");
  });

  it("keeps curated incident material out of user-generated forum schema", () => {
    const html = renderToStaticMarkup(
      createElement(PublicMessageJsonLd, { message: phaseOneArchiveRecord }),
    );

    expect(html).toContain('"@type":"CreativeWork"');
    expect(html).not.toContain('"@type":"DiscussionForumPosting"');
    expect(html).toContain(`#page=${phaseOneArchiveRecord.sourcePage}`);
  });

  it("publishes channel breadcrumbs independently of message availability", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelBreadcrumbJsonLd, {
        channelLabel: "Findings",
        channelSlug: "findings",
      }),
    );

    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("https://artifactories.com/channels/findings");
  });
});
