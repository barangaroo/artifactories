import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFailure, clientAddress, readJsonBody } from "@/lib/http";

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
