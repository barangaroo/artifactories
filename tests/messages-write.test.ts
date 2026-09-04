import { beforeEach, describe, expect, it, vi } from "vitest";

const { after, createMessage, listMessages, submitIndexNow } = vi.hoisted(() => ({
  after: vi.fn(),
  createMessage: vi.fn(),
  listMessages: vi.fn(),
  submitIndexNow: vi.fn(),
}));

vi.mock("@/lib/board-store", () => ({ createMessage, listMessages }));
vi.mock("@/lib/indexnow", () => ({ submitIndexNow }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));

import { POST } from "@/app/v1/messages/route";
import { ApiError } from "@/lib/http";

const validMessage = {
  agent_id: `agt_${"a".repeat(16)}`,
  public_key: Buffer.alloc(32, 1).toString("base64url"),
  agent_proof: `v1.${Buffer.alloc(32, 2).toString("base64url")}`,
  channel: "general",
  parent_id: null,
  kind: "NOTE",
  body: "Signal received.",
  signed_at: "2026-09-03T00:00:00.000Z",
  signature: Buffer.alloc(64, 3).toString("base64url"),
};

const storedMessage = {
  id: `msg_${"b".repeat(16)}`,
  channel: "general",
  kind: "NOTE",
  body: "Signal received.",
};

function request(body: Record<string, unknown>, idempotencyKey?: string) {
  return new Request("https://artifactories.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey !== undefined ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  after.mockReset();
  createMessage.mockReset();
  listMessages.mockReset();
  submitIndexNow.mockReset();
  createMessage.mockResolvedValue({
    message: storedMessage,
    idempotent_replay: true,
  });
});

describe("signed message idempotency contract", () => {
  it("accepts the standard Idempotency-Key header without duplicating it in JSON", async () => {
    const response = await POST(request(validMessage, "post:header:001"));

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe("post:header:001");
    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "post:header:001" }),
    );
    expect(after).not.toHaveBeenCalled();
    expect(response.headers.get("access-control-expose-headers")).toContain("Idempotency-Key");
  });

  it("returns 201 for a new write and schedules indexing once", async () => {
    createMessage.mockResolvedValue({ message: storedMessage, idempotent_replay: false });
    const response = await POST(request(validMessage, "post:created:001"));
    expect(response.status).toBe(201);
    expect(response.headers.get("idempotency-key")).toBe("post:created:001");
    expect(response.headers.get("idempotency-replayed")).toBe("false");
    expect(after).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ data: storedMessage, meta: { idempotent_replay: false } });
  });

  it("accepts matching header and body keys", async () => {
    const response = await POST(request({ ...validMessage, idempotency_key: "post:both:001" }, "post:both:001"));
    expect(response.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "post:both:001" }));
  });

  it.each(["", "short", "a".repeat(129), "key with spaces", "key:one,key:two"])("rejects malformed header keys: %j", async (key) => {
    const response = await POST(request(validMessage, key));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ERR.INVALID_IDEMPOTENCY_KEY" } });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns a stored-key conflict as a stable JSON 409", async () => {
    createMessage.mockRejectedValue(new ApiError(409, "ERR.IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different message."));
    const response = await POST(request(validMessage, "post:conflict:001"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ERR.IDEMPOTENCY_CONFLICT" } });
    expect(after).not.toHaveBeenCalled();
  });

  it("preserves legacy body-only idempotency keys", async () => {
    const response = await POST(
      request({ ...validMessage, idempotency_key: "post:body:001" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe("post:body:001");
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "post:body:001" }),
    );
  });

  it("rejects conflicting header and body keys before attempting a write", async () => {
    const response = await POST(
      request(
        { ...validMessage, idempotency_key: "post:body:002" },
        "post:header:002",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ERR.IDEMPOTENCY_KEY_MISMATCH",
        message: "Idempotency-Key header and idempotency_key body field must match.",
      },
    });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("requires one valid idempotency key location", async () => {
    const response = await POST(request(validMessage));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ERR.IDEMPOTENCY_KEY_REQUIRED",
        message: "Send Idempotency-Key on every message creation request.",
      },
    });
    expect(createMessage).not.toHaveBeenCalled();
  });
});
