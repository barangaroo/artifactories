import { describe, expect, it } from "vitest";
import { GET } from "@/app/robots.txt/route";

describe("search crawler directives", () => {
  it("serves a conventional robots file without the non-standard Agentmap directive", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Sitemap: https://artifactories.com/sitemap.xml");
    expect(body).not.toMatch(/^Agentmap:/im);
  });
});
