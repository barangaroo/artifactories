import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET as getOpenApi } from "@/app/openapi.json/route";

type OpenApiResponse = {
  $ref?: string;
  content?: Record<string, { schema?: { $ref?: string } }>;
};

type OpenApiOperation = {
  parameters?: Array<Record<string, unknown>>;
  responses?: Record<string, OpenApiResponse>;
};

describe("public API contract", () => {
  it("documents header-based idempotency with backward-compatible body input", async () => {
    const response = getOpenApi(new Request("https://artifactories.com/openapi.json"));
    const document = (await response.json()) as {
      paths: Record<string, { post?: OpenApiOperation }>;
      components: { schemas: Record<string, { required?: string[] }> };
    };
    const operation = document.paths["/v1/messages"].post!;

    expect(operation.parameters).toContainEqual(
      expect.objectContaining({
        name: "Idempotency-Key",
        in: "header",
        required: false,
      }),
    );
    expect(document.components.schemas.MessageWrite.required).not.toContain(
      "idempotency_key",
    );
    expect(operation.responses).toHaveProperty("200");
    expect(operation.responses).toHaveProperty("409");
  });

  it("uses one documented error envelope for every JSON v1 failure", async () => {
    const response = getOpenApi(new Request("https://artifactories.com/openapi.json"));
    const document = (await response.json()) as {
      paths: Record<string, Record<string, OpenApiOperation>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(document.components.schemas).toHaveProperty("ErrorEnvelope");
    expect(document.paths["/v1/messages"].get.responses).toHaveProperty("503");
    for (const path of ["/v1/agents/challenge", "/v1/agents/register"]) {
      expect(document.paths[path].post.responses).toHaveProperty("408");
      expect(document.paths[path].post.responses).toHaveProperty("413");
      expect(document.paths[path].post.responses).toHaveProperty("default");
    }
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!path.startsWith("/v1/")) continue;
      for (const operation of Object.values(pathItem)) {
        for (const [status, responseObject] of Object.entries(operation.responses ?? {})) {
          if (Number(status) < 400) continue;
          expect(
            responseObject.content?.["application/json"]?.schema?.$ref,
            `${path} ${status}`,
          ).toBe("#/components/schemas/ErrorEnvelope");
        }
      }
    }
  });

  it("states the implemented MCP boundary without claiming A2A", () => {
    const descriptor = JSON.parse(
      readFileSync(new URL("../public/apis.json", import.meta.url), "utf8"),
    ) as { description: string; apis: Array<{ description: string }> };

    expect(descriptor.description).toContain("implements a read-only MCP server");
    expect(descriptor.description).toContain("does not claim A2A compliance");
    expect(descriptor.apis[0].description).toContain("read-only MCP");
  });
});
