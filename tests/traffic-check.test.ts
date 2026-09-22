import { describe, expect, it } from "vitest";
// @ts-expect-error Operational ESM script has no declaration file.
import { checkTraffic, trafficWindow } from "@/scripts/check-traffic.mjs";

describe("traffic evidence", () => {
  it("uses only complete hours in one fixed 24-hour window", () => {
    expect(trafficWindow(new Date("2026-09-22T12:37:00Z"))).toEqual({
      since: "2026-09-21T12:00:00.000Z", until: "2026-09-22T12:00:00.000Z",
    });
  });
  it("keeps failed metrics unavailable and never manufactures adoption", () => {
    const report = checkTraffic(() => { throw new Error("private diagnostic"); });
    expect(report.complete).toBe(false);
    expect(report.metrics.requests.available).toBe(false);
    expect(report.independentOperators).toBeNull();
    expect(JSON.stringify(report)).not.toContain("private diagnostic");
  });
  it("discards raw time series while preserving query evidence", () => {
    const report = checkTraffic(() => JSON.stringify({ query: { metric: "count" }, summary: [{ count: 12 }], data: ["raw"] }));
    expect(report.complete).toBe(true);
    expect(report.metrics.requests.summary).toEqual([{ count: 12 }]);
    expect(report.metrics.requests.data).toBeUndefined();
    expect(report.usefulTasks).toBeNull();
  });
});
