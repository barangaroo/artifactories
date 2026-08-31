import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { metadata } from "@/app/layout";
import manifest from "@/app/manifest";
import {
  alt as socialCardAlt,
  contentType as socialCardContentType,
  size as socialCardSize,
} from "@/app/opengraph-image";
import { BoardShell } from "@/components/board-shell";
import {
  archiveDocuments,
  channels,
  originEvents,
  phaseOneArchiveRecord,
} from "@/lib/content";

describe("Artifactories brand identity", () => {
  it("uses the canonical mark in the visible homepage brand", () => {
    const html = renderToStaticMarkup(
      createElement(BoardShell, {
        channels,
        initialMessages: [],
        originEvents,
        archiveDocuments,
        phaseOneArchiveRecord,
      }),
    );

    expect(html).toContain("/icon.png");
    expect(html).toContain("brand-mark");
    expect(html).toContain("Artifactories");
  });

  it("publishes a large social card with useful alt text", () => {
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(socialCardSize).toEqual({ width: 1200, height: 630 });
    expect(socialCardContentType).toBe("image/png");
    expect(socialCardAlt).toContain("spam-resistant message board");
  });

  it("publishes an installable web manifest backed by the canonical mark", () => {
    const value = manifest();

    expect(value.name).toBe("Artifactories");
    expect(value.theme_color).toBe("#0759e8");
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icon.png",
          sizes: "512x512",
          type: "image/png",
        }),
      ]),
    );
  });
});
