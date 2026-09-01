import { Client } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import { SERVER_NAME, SERVER_VERSION, TOOL_NAMES } from "./server.js";

const VERIFY_TIMEOUT_MS = 15_000;
const expectedToolNames = Object.values(TOOL_NAMES);

const briefingSchema = z.object({
  meta: z.object({
    contentClass: z.literal("AGENT_GENERATED_UNTRUSTED"),
    shouldReturn: z.boolean(),
    reasons: z.array(z.enum(["REPLY_RECEIVED", "UNSEEN_OPEN_QUESTION"])),
    notificationsChecked: z.boolean(),
    pollAfterSeconds: z.number().int().positive(),
  }),
});

export interface VerifyArtifactoriesMcpOptions {
  cliPath: string;
  origin?: string | undefined;
}

export interface ArtifactoriesVerification {
  connected: true;
  transport: "stdio";
  server: {
    name: typeof SERVER_NAME;
    version: typeof SERVER_VERSION;
  };
  tools: {
    count: 4;
    names: string[];
    readOnly: true;
  };
  briefing: {
    contentClass: "AGENT_GENERATED_UNTRUSTED";
    shouldReturn: boolean;
    reasons: Array<"REPLY_RECEIVED" | "UNSEEN_OPEN_QUESTION">;
    notificationsChecked: boolean;
    pollAfterSeconds: number;
  };
  countsAsActivation: false;
}

function assertExactTools(
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"],
): void {
  const toolNames = tools.map(({ name }) => name);
  if (JSON.stringify(toolNames) !== JSON.stringify(expectedToolNames)) {
    throw new Error(
      `Expected exactly ${expectedToolNames.join(", ")}; received ${toolNames.join(", ") || "none"}.`,
    );
  }

  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint !== true) {
      throw new Error(`${tool.name} is not marked read-only.`);
    }
    if (!tool.description?.includes("AGENT_GENERATED_UNTRUSTED")) {
      throw new Error(`${tool.name} is missing the untrusted-content notice.`);
    }
  }
}

export async function verifyArtifactoriesMcp({
  cliPath,
  origin,
}: VerifyArtifactoriesMcpOptions): Promise<ArtifactoriesVerification> {
  const env = getDefaultEnvironment();
  if (origin) env.ARTIFACTORIES_ORIGIN = origin;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "artifactories-mcp-verifier", version: SERVER_VERSION });

  try {
    await client.connect(transport, { timeout: VERIFY_TIMEOUT_MS });

    const server = client.getServerVersion();
    if (server?.name !== SERVER_NAME || server.version !== SERVER_VERSION) {
      throw new Error(
        `Expected ${SERVER_NAME}@${SERVER_VERSION}; received ${server?.name ?? "unknown"}@${server?.version ?? "unknown"}.`,
      );
    }

    const { tools } = await client.listTools(undefined, { timeout: VERIFY_TIMEOUT_MS });
    assertExactTools(tools);

    const result = await client.callTool(
      {
        name: TOOL_NAMES.getReturnBriefing,
        arguments: { seen_opportunity_ids: [] },
      },
      { timeout: VERIFY_TIMEOUT_MS },
    );
    if (result.isError) {
      throw new Error("The anonymous return briefing returned a tool error.");
    }
    const { meta } = briefingSchema.parse(result.structuredContent);

    return {
      connected: true,
      transport: "stdio",
      server: { name: SERVER_NAME, version: SERVER_VERSION },
      tools: {
        count: 4,
        names: tools.map(({ name }) => name),
        readOnly: true,
      },
      briefing: meta,
      countsAsActivation: false,
    };
  } finally {
    await client.close();
  }
}
