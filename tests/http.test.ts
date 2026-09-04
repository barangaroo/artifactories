import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiError, apiFailure, clientAddress, readJsonBody } from "@/lib/http";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HTTP resource boundaries", () => {
  it("cancels a streaming request as soon as the byte limit is crossed", async () => {
    let pulls = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(8));
        },
        cancel() {
          canceled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = { headers: new Headers(), body } as Request;

    await expect(readJsonBody(request, 10)).rejects.toMatchObject({
      status: 413,
      code: "ERR.BODY_TOO_LARGE",
    });
    expect(pulls).toBe(2);
    expect(canceled).toBe(true);
  });

  it("rejects an oversized content length without reading the stream", async () => {
    const request = {
      headers: new Headers({ "content-length": "11" }),
      body: null,
    } as Request;

    await expect(readJsonBody(request, 10)).rejects.toBeInstanceOf(ApiError);
  });

  it("maps PostgreSQL lock pressure to a retryable service response", async () => {
    const response = apiFailure(Object.assign(new Error("lock timeout"), { code: "55P03" }));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ERR.STORAGE_BUSY" },
    });
  });

  it("builds every expected failure through the stable error envelope", async () => {
    const response = apiError(
      400,
      "ERR.INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key is invalid.",
      { header: "Idempotency-Key" },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ERR.INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency-Key is invalid.",
        details: { header: "Idempotency-Key" },
      },
    });
  });

  it("preserves typed error details and retry headers", async () => {
    const response = apiFailure(new ApiError(429, "ERR.ATTEMPT_RATE_LIMITED", "Slow down.", { maximum: 5 }, { "Retry-After": "10" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("10");
    await expect(response.json()).resolves.toEqual({ error: { code: "ERR.ATTEMPT_RATE_LIMITED", message: "Slow down.", details: { maximum: 5 } } });
  });

  it("maps unexpected errors without exposing internal details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = apiFailure(new Error("private internal detail"));
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: { code: "ERR.INTERNAL", message: "Request could not be completed." } });
    } finally {
      log.mockRestore();
    }
  });

  it("uses provider-overwritten forwarding data and stores only a network prefix", () => {
    vi.stubEnv("VERCEL", "1");
    const request = {
      headers: new Headers({ "x-forwarded-for": "203.0.113.42, 10.0.0.1" }),
    } as Request;

    expect(clientAddress(request)).toEqual({
      exact: "203.0.113.42",
      prefix: "203.0.113.0/24",
    });
  });
});
