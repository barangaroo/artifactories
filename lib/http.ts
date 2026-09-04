import { NextResponse } from "next/server";
import { normalizeClientAddress } from "@/lib/network";

declare global {
  var __artifactoriesActiveWrites: number | undefined;
  var __artifactoriesLastErrorLogAt: number | undefined;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

export function apiJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "Idempotency-Key, Idempotency-Replayed, Retry-After");
  return NextResponse.json(body, { ...init, headers });
}

export function apiErrorEnvelope(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  headers?: HeadersInit,
) {
  return apiJson(apiErrorEnvelope(code, message, details), { status, headers });
}

export function publicOrigin(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to provider request metadata.
    }
  }
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const protocol = headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${protocol.split(",")[0]}://${host.split(",")[0]}`;
  return new URL(request.url).origin;
}

export function corsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function apiFailure(error: unknown) {
  if (error instanceof ApiError) {
    return apiError(error.status, error.code, error.message, error.details, error.headers);
  }

  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  const message = error instanceof Error ? error.message : "unknown_error";
  if (code === "55P03" || code === "57014") {
    return apiError(
      503, "ERR.STORAGE_BUSY", "Storage is busy. Retry with jitter.",
      undefined, { "Retry-After": "1" },
    );
  }
  if (
    code?.startsWith("08") ||
    ["ECONNREFUSED", "ECONNRESET", "57P01", "57P02", "57P03"].includes(code ?? "") ||
    /connection (?:terminated|refused)|timeout exceeded when trying to connect/i.test(message)
  ) {
    logUnexpectedError("storage_unavailable", code, message);
    return apiError(
      503, "ERR.STORAGE_UNAVAILABLE", "Persistent storage is temporarily unavailable.",
      undefined, { "Retry-After": "2" },
    );
  }
  logUnexpectedError("internal", code, message);
  return apiError(500, "ERR.INTERNAL", "Request could not be completed.");
}

export async function readJsonBody(request: Request, maxBytes = 16_384) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(413, "ERR.BODY_TOO_LARGE", "Request body exceeds the limit.");
  }
  const reader = request.body?.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const configuredTimeout = Number(process.env.BODY_READ_TIMEOUT_MS ?? "5000");
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(30_000, Math.max(1_000, Math.floor(configuredTimeout)))
    : 5_000;
  const deadline = Date.now() + timeoutMs;

  if (reader) {
    try {
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new ApiError(408, "ERR.BODY_TIMEOUT", "Request body took too long to read.");
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await Promise.race([
            reader.read(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new ApiError(
                      408,
                      "ERR.BODY_TIMEOUT",
                      "Request body took too long to read.",
                    ),
                  ),
                remaining,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (result.done) break;
        totalBytes += result.value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel("body_limit_exceeded").catch(() => undefined);
          throw new ApiError(413, "ERR.BODY_TOO_LARGE", "Request body exceeds the limit.");
        }
        chunks.push(Buffer.from(result.value));
      }
    } catch (error) {
      await reader.cancel("body_read_aborted").catch(() => undefined);
      throw error;
    }
  }
  const text = Buffer.concat(chunks, totalBytes).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "ERR.INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function clientAddress(request: Request) {
  const headers = request.headers;
  const trustProxy = process.env.TRUST_PROXY_HEADERS?.toLowerCase() === "true";
  const forwarded = process.env.VERCEL
    ? headers.get("x-forwarded-for")
    : process.env.RENDER || trustProxy
      ? headers.get("x-forwarded-for")
      : null;
  return normalizeClientAddress(forwarded?.split(",")[0]?.trim() || "unknown");
}

export async function withWriteCapacity<T>(operation: () => Promise<T>): Promise<T> {
  const configured = Number(
    process.env.WRITE_CONCURRENCY_MAX ?? (process.env.VERCEL ? "3" : "10"),
  );
  const maximum = Number.isFinite(configured)
    ? Math.min(100, Math.max(1, Math.floor(configured)))
    : process.env.VERCEL
      ? 3
      : 10;
  const active = globalThis.__artifactoriesActiveWrites ?? 0;
  if (active >= maximum) {
    throw new ApiError(
      503,
      "ERR.SERVER_BUSY",
      "Write capacity is busy. Retry with jitter.",
      { maximum },
      { "Retry-After": "1" },
    );
  }
  globalThis.__artifactoriesActiveWrites = active + 1;
  try {
    return await operation();
  } finally {
    globalThis.__artifactoriesActiveWrites = Math.max(
      0,
      (globalThis.__artifactoriesActiveWrites ?? 1) - 1,
    );
  }
}

function logUnexpectedError(kind: string, code: string | undefined, message: string) {
  const now = Date.now();
  if (now - (globalThis.__artifactoriesLastErrorLogAt ?? 0) < 5_000) return;
  globalThis.__artifactoriesLastErrorLogAt = now;
  console.error(
    "artifactories_api_error",
    JSON.stringify({ kind, ...(code ? { code } : {}), message: message.slice(0, 240) }),
  );
}
