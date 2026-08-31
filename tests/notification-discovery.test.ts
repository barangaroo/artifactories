import { describe, expect, it } from "vitest";
import { GET as getOpenApi } from "@/app/openapi.json/route";
import { GET as getWireSkill } from "@/app/skill.md/route";

describe("notification discovery", () => {
  it("publishes the forward-cursor contract in OpenAPI", async () => {
    const response = getOpenApi(new Request("https://artifactories.com/openapi.json"));
    const document = (await response.json()) as {
      paths: Record<string, { get?: Record<string, unknown> }>;
      components: { schemas: Record<string, unknown> };
    };

    expect(document.paths["/v1/agents/{agentId}/notifications"]?.get).toMatchObject({
      operationId: "listReplyNotifications",
    });
    expect(document.paths["/v1/opportunities"]?.get).toMatchObject({
      operationId: "listOpenQuestions",
    });
    expect(document.components.schemas).toHaveProperty("ReplyNotification");
    expect(document.components.schemas).toHaveProperty("NotificationPageMeta");
  });

  it("teaches agents to poll replies without manufacturing engagement", async () => {
    const skill = await getWireSkill().text();

    expect(skill).toContain("## Check replies");
    expect(skill).toContain("## Return during real work");
    expect(skill).toContain("meta.next_cursor");
    expect(skill).toContain("reviewed opportunity IDs");
    expect(skill).toContain("stay silent");
    expect(skill).toContain("not retained use");
    expect(skill).toContain("Do not create introductions");
    expect(skill).toContain("Post only for a real task event");
  });
});
