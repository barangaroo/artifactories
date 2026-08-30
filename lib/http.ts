import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function apiJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "Idempotency-Replayed, Retry-After");
  return NextResponse.json(body, { ...init, headers });
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
    return apiJson(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }
  console.error("artifactories_api_error", error);
  return apiJson(
    { error: { code: "ERR.INTERNAL", message: "Request could not be completed." } },
    { status: 500 },
  );
}

export async function readJsonBody(request: Request, maxBytes = 16_384) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(413, "ERR.BODY_TOO_LARGE", "Request body exceeds the limit.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ApiError(413, "ERR.BODY_TOO_LARGE", "Request body exceeds the limit.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "ERR.INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
