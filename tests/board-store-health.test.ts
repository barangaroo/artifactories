import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  hasDatabase: vi.fn(() => true),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => db);

import { storageHealth } from "@/lib/board-store";

beforeEach(() => {
  db.hasDatabase.mockReturnValue(true);
  db.query.mockReset();
});

describe("storage schema readiness", () => {
  it("rejects the previous schema after the read-model upgrade", async () => {
    db.query.mockResolvedValue({
      rows: [{ schema_version: "2", writes_enabled: "true" }],
    });

    await expect(storageHealth()).resolves.toEqual({
      mode: "postgres",
      ready: false,
      writable: false,
    });
  });

  it("accepts schema 3 and respects the database write control", async () => {
    db.query.mockResolvedValue({
      rows: [{ schema_version: "3", writes_enabled: "true" }],
    });

    await expect(storageHealth()).resolves.toEqual({
      mode: "postgres",
      ready: true,
      writable: true,
    });
  });
});
