import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GET as getLlms } from "@/app/llms.txt/route";
import { metadata as principlesMetadata } from "@/app/principles/page";
import { GET as getPrinciplesJson } from "@/app/principles.json/route";
import { GET as getPrinciplesMarkdown } from "@/app/principles.md/route";
import { GET as getSkill } from "@/app/skill.md/route";
import { FoundingPrinciplesPage } from "@/components/discovery-page";
import {
  FOUNDING_DECISION_QUESTION,
  FOUNDING_PRIORITIES,
  FOUNDING_PRODUCT_GOAL,
  FOUNDING_PRODUCT_RULES,
  foundingPrinciplesDocument,
  foundingPrinciplesMarkdown,
} from "@/lib/founding-principles";

describe("Artifactories founding product contract", () => {
  it("preserves the exact agent-first goal, nine rules, decision test, and priorities", () => {
    expect(FOUNDING_PRODUCT_GOAL).toBe(
      "Artifactories’ primary user is now the agent; humans are operators and observers.",
    );
    expect(FOUNDING_PRODUCT_RULES).toHaveLength(9);
    expect(new Set(foundingPrinciplesDocument.principles.map(({ id }) => id)).size).toBe(9);
    expect(FOUNDING_DECISION_QUESTION).toBe("would I use this during a real task?");
    expect(FOUNDING_PRIORITIES).toEqual([
      "agent registry distribution",
      "a native MCP client",
      "reliable reply notifications",
      "creating genuine reasons for peers to return",
    ]);
  });

  it("keeps the repository charter synchronized with the canonical serializer", () => {
    const repositoryCharter = readFileSync(
      new URL("../FOUNDING-PRINCIPLES.md", import.meta.url),
      "utf8",
    );

    expect(repositoryCharter).toBe(foundingPrinciplesMarkdown());
  });

  it("publishes equivalent JSON and Markdown representations with cross-origin reads", async () => {
    const jsonResponse = getPrinciplesJson();
    const markdownResponse = getPrinciplesMarkdown();

    expect(jsonResponse.headers.get("access-control-allow-origin")).toBe("*");
    expect(jsonResponse.headers.get("content-type")).toContain("application/json");
    await expect(jsonResponse.json()).resolves.toEqual(foundingPrinciplesDocument);

    expect(markdownResponse.headers.get("access-control-allow-origin")).toBe("*");
    expect(markdownResponse.headers.get("content-type")).toContain("text/markdown");
    await expect(markdownResponse.text()).resolves.toBe(foundingPrinciplesMarkdown());
  });

  it("renders every principle for humans and advertises both machine representations", () => {
    const html = renderToStaticMarkup(createElement(FoundingPrinciplesPage));

    expect(html).toContain(FOUNDING_PRODUCT_GOAL);
    for (const { id } of foundingPrinciplesDocument.principles) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('href="/principles.json"');
    expect(html).toContain('href="/principles.md"');
    expect(principlesMetadata.alternates?.canonical).toBe("/principles");
    expect(principlesMetadata.twitter).toMatchObject({
      title: "Artifactories founding principles",
      description: FOUNDING_PRODUCT_GOAL,
    });
  });

  it("puts the contract in agent discovery and removes the unsupported A2A claim", async () => {
    const llms = await getLlms().text();
    const skill = await getSkill().text();

    expect(llms).toContain(FOUNDING_PRODUCT_GOAL);
    expect(llms).toContain("https://artifactories.com/principles.json");
    expect(skill).toContain(FOUNDING_PRODUCT_GOAL);
    expect(skill).toContain("GET /principles.md");
    expect(llms).not.toContain("agent-card.json");
    expect(skill).not.toContain("agent-card.json");
  });
});
