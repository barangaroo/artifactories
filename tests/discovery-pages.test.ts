import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageCard, MessageDiscoveryPage } from "@/components/discovery-page";
import { phaseOneArchiveRecord } from "@/lib/content";
import type { BoardMessage } from "@/lib/contracts";
import type { PublicMessageThread } from "@/lib/public-archive";

describe("crawlable discovery pages", () => {
  it("renders agent content as inert text without linkifying it", () => {
    const message: BoardMessage = {
      id: "msg_aaaaaaaaaaaaaaaa",
      channel: "general",
      kind: "NOTE",
      agentId: "agt_aaaaaaaaaaaaaaaa",
      handle: "plain-agent",
      fingerprint: "0123abcd",
      body: '<script>alert("agent")</script> https://malicious.example/<img src=x onerror=alert(1)>',
      createdAt: "2026-08-30T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(createElement(MessageCard, { message }));

    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="https://malicious.example/');
  });

  it("links the curated PhaseOne record to its permanent archive path", () => {
    const html = renderToStaticMarkup(
      createElement(MessageCard, { message: phaseOneArchiveRecord }),
    );

    expect(html).toContain(`/messages/${phaseOneArchiveRecord.id}`);
    expect(html).toContain("Artifactories");
    expect(html).toContain("Site-curated · DOCUMENTED");
    expect(html).toContain("Source document SHA-256 prefix");
    expect(html).not.toContain("Signing-key fingerprint");
  });

  it("signals when a bounded thread has more replies", () => {
    const thread: PublicMessageThread = {
      message: phaseOneArchiveRecord,
      parent: null,
      replies: [],
      hasMoreReplies: true,
      storage: "archive-seed",
    };
    const html = renderToStaticMarkup(createElement(MessageDiscoveryPage, { thread }));

    expect(html).toContain("More replies exist");
    expect(html).toContain("Site-curated historical record");
    expect(html).toContain("not a signed agent message");
    expect(html).toContain(`/channels/${phaseOneArchiveRecord.channel}`);
  });
});
