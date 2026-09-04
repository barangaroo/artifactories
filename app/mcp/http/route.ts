import {
  createMcpHandler,
  hostHeaderValidationResponse,
  isJsonContentType,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { ApiError, readJsonBody } from "@/lib/http";
import { artifactoriesReadAdapter } from "@/lib/mcp-read-adapter";
import { recordMcpEvent, type McpTelemetryEvent } from "@/lib/mcp-telemetry";
import { SITE_ORIGIN } from "@/lib/site";
import { createArtifactoriesServer, type ToolOutcome } from "@/packages/artifactories-mcp/dist/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_MCP_BODY_BYTES = 64 * 1024;

function configuredHostname(): string | null {
  try {
    return new URL(process.env.PUBLIC_BASE_URL ?? SITE_ORIGIN).hostname;
  } catch {
    return null;
  }
}

export function allowedMcpHostnames(): string[] {
  const configured = configuredHostname();
  return Array.from(new Set([
    "artifactories.com",
    "www.artifactories.com",
    ...(process.env.NODE_ENV === "production" ? [] : localhostAllowedHostnames()),
    ...(configured ? [configured] : []),
  ]));
}

export function allowedMcpOrigins(): string[] {
  const configured = configuredHostname();
  return Array.from(new Set([
    "artifactories.com",
    "www.artifactories.com",
    ...(process.env.NODE_ENV === "production" ? [] : localhostAllowedOrigins()),
    ...(configured ? [configured] : []),
  ]));
}

const handler = createMcpHandler(
  () => createArtifactoriesServer({
    api: artifactoriesReadAdapter,
    onToolOutcome: ({ tool, outcome, durationBucket }: ToolOutcome) => {
      // Both labels come from internal enums, not request arguments or results.
      const event = `tool_${tool.replace("artifactories_", "")}_${outcome}` as McpTelemetryEvent;
      recordMcpEvent(event, durationBucket);
    },
  }),
  { legacy: "stateless" },
);

function protocolErrorResponse(status: number, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code, message }, id: null },
    { status },
  );
}

function secureResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function observedResponse(response: Response, body?: unknown): Response {
  const method = body && typeof body === "object" && "method" in body ? body.method : undefined;
  const negotiation = method === "initialize" ? "initialize" : method === "server/discover" ? "discover" : null;
  // These are HTTP acceptance counters only. SDK JSON-RPC error codes are not
  // available here without consuming the response stream; never infer them.
  recordMcpEvent(
    response.status >= 500 ? "http_unexpected_failure"
      : response.status === 405 ? "http_method_rejected"
        : negotiation ? `http_${negotiation}_${response.ok ? "accepted" : "rejected"}`
          : response.ok ? "http_other_accepted" : "http_sdk_rejected_code_unavailable",
  );
  return secureResponse(response);
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  const rejected =
    hostHeaderValidationResponse(request, allowedMcpHostnames()) ??
    originValidationResponse(request, allowedMcpOrigins());
  if (rejected) {
    recordMcpEvent("http_boundary_rejected");
    return secureResponse(rejected);
  }

  if (request.method === "POST" && isJsonContentType(request.headers.get("content-type"))) {
    try {
      const parsedBody = await readJsonBody(request, MAX_MCP_BODY_BYTES);
      return observedResponse(await handler.fetch(request, { parsedBody }), parsedBody);
    } catch (error) {
      if (error instanceof ApiError) {
        const code = error.code === "ERR.INVALID_JSON" ? -32700 : -32600;
        recordMcpEvent(code === -32700 ? "jsonrpc_parse_error" : "jsonrpc_invalid_request");
        return secureResponse(protocolErrorResponse(error.status, code, error.message));
      }
      recordMcpEvent("http_unexpected_failure");
      throw error;
    }
  }

  try {
    return observedResponse(await handler.fetch(request));
  } catch (error) {
    recordMcpEvent("http_unexpected_failure");
    throw error;
  }
}

export { handleMcpRequest as DELETE, handleMcpRequest as GET, handleMcpRequest as POST };
