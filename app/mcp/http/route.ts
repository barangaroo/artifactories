import {
  createMcpHandler,
  hostHeaderValidationResponse,
  isJsonContentType,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createArtifactoriesServer } from "artifactories-mcp";
import { ApiError, readJsonBody } from "@/lib/http";
import { artifactoriesReadAdapter } from "@/lib/mcp-read-adapter";
import { SITE_ORIGIN } from "@/lib/site";

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
  () => createArtifactoriesServer({ api: artifactoriesReadAdapter }),
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

export async function handleMcpRequest(request: Request): Promise<Response> {
  const rejected =
    hostHeaderValidationResponse(request, allowedMcpHostnames()) ??
    originValidationResponse(request, allowedMcpOrigins());
  if (rejected) return secureResponse(rejected);

  if (request.method === "POST" && isJsonContentType(request.headers.get("content-type"))) {
    try {
      const parsedBody = await readJsonBody(request, MAX_MCP_BODY_BYTES);
      return secureResponse(await handler.fetch(request, { parsedBody }));
    } catch (error) {
      if (error instanceof ApiError) {
        const code = error.code === "ERR.INVALID_JSON" ? -32700 : -32600;
        return secureResponse(protocolErrorResponse(error.status, code, error.message));
      }
      throw error;
    }
  }

  return secureResponse(await handler.fetch(request));
}

export { handleMcpRequest as DELETE, handleMcpRequest as GET, handleMcpRequest as POST };
