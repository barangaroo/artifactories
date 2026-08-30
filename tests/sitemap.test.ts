import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { channels, phaseOneArchiveRecord } from "@/lib/content";
import {
  coreSitemapUrls,
  messageSitemapUrl,
  parseMessageSitemapFile,
  serializeSitemapIndex,
  serializeUrlSet,
} from "@/lib/sitemap";

describe("public sitemap discovery", () => {
  it("lists every public channel and the machine discovery surfaces", () => {
    const locations = coreSitemapUrls().map(({ loc }) => loc);

    for (const channel of channels) {
      expect(locations).toContain(`https://artifactories.com/channels/${channel.id}`);
    }
    expect(locations).toContain("https://artifactories.com/.well-known/ard.json");
    expect(locations).toContain("https://artifactories.com/feed.atom");
    expect(locations).toContain("https://artifactories.com/feed.json");
    expect(locations).toContain("https://artifactories.com/llms.txt");
    expect(locations).toContain("https://artifactories.com/apis.json");
    expect(locations).toContain(
      "https://artifactories.com/.well-known/agent-skills/index.json",
    );
    expect(locations).toContain(
      "https://artifactories.com/.well-known/agent-skills/artifactories/SKILL.md",
    );
    expect(locations).toContain("https://artifactories.com/principles");
    expect(locations).not.toContain("https://artifactories.com/.well-known/agent-card.json");
  });

  it("uses stable one-based shard URLs and rejects ambiguous shard names", () => {
    expect(messageSitemapUrl(0)).toBe(
      "https://artifactories.com/sitemaps/messages/1.xml",
    );
    expect(parseMessageSitemapFile("1.xml")).toBe(0);
    expect(parseMessageSitemapFile("250.xml")).toBe(249);
    expect(parseMessageSitemapFile("0.xml")).toBeNull();
    expect(parseMessageSitemapFile("01.xml")).toBeNull();
    expect(parseMessageSitemapFile("1.xml/anything")).toBeNull();
  });

  it("escapes sitemap values and emits a permanent message URL", () => {
    const xml = serializeUrlSet([
      {
        loc: `https://artifactories.com/messages/${phaseOneArchiveRecord.id}?a=1&b=<unsafe>`,
        lastmod: phaseOneArchiveRecord.createdAt,
      },
    ]);

    expect(xml).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
    expect(xml).toContain(`/messages/${phaseOneArchiveRecord.id}?a=1&amp;b=&lt;unsafe&gt;`);
    expect(xml).toContain(`<lastmod>${phaseOneArchiveRecord.createdAt}</lastmod>`);
    expect(xml).not.toContain("<unsafe>");
  });

  it("emits a sitemap index for every supplied shard", () => {
    const xml = serializeSitemapIndex([
      "https://artifactories.com/sitemaps/core.xml",
      messageSitemapUrl(0),
      messageSitemapUrl(1),
    ]);

    expect(xml).toContain("<sitemapindex");
    expect(xml.match(/<sitemap>/g)).toHaveLength(3);
    expect(xml).toContain("https://artifactories.com/sitemaps/messages/2.xml");
  });
});
