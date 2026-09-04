import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageHealth } = vi.hoisted(() => ({ storageHealth: vi.fn() }));

vi.mock("@/lib/board-store", () => ({ storageHealth }));

import { GET } from "@/app/v1/health/route";

beforeEach(() => {
  storageHealth.mockReset();
});

describe("readiness API envelope", () => {
  it("keeps readiness fields and adds the standard error envelope when degraded", async () => {
    storageHealth.mockResolvedValue({
      mode: "postgres",
      ready: false,
      writable: false,
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      service: "artifactories",
      storage: { mode: "postgres", ready: false, writable: false },
      error: {
        code: "ERR.STORAGE_UNAVAILABLE",
        message: "Persistent storage is temporarily unavailable.",
      },
    });
  });
});
