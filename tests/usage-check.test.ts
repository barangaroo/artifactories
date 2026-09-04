import { afterEach, describe, expect, it } from "vitest";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(resolve("scripts/check-usage.mjs")).href;
const { usageWindow, clientFamily, routeFamily, buildReport, collectUsage } = await import(moduleUrl);
const project = { projectId: "prj_test", orgId: "team_test", projectName: "artifactories" };
const window = { since: "2026-09-03T11:00:00.000Z", until: "2026-09-04T11:00:00.000Z" };
const production = "environment eq 'production'";
function query(groupBy: string[], rows: object[], filter = production) {
  return { query: { metric: "vercel.request.count", aggregation: "sum", groupBy, filter,
    startTime: window.since, endTime: window.until, granularity: { hours: 1 } }, summary: rows };
}
function evidence() {
  return {
    scope: project,
    total_final: query([], [{ vercel_request_count_sum: 10 }]),
    status_final: query(["http_status"], [{ http_status: "200", vercel_request_count_sum: 10 }]),
    paths_final: query(["request_path"], [
      { request_path: "/mcp/http", vercel_request_count_sum: 8 },
      { request_path: "/private-token?credential=secret", vercel_request_count_sum: 2 },
    ]),
    clients_mcp: query(["client_user_agent"], [
      { client_user_agent: "codex-mcp-client private@example.com", vercel_request_count_sum: 5 },
      { client_user_agent: "unknown secret@example.com", vercel_request_count_sum: 3 },
    ], `${production} and request_path eq '/mcp/http'`),
  };
}

describe("usage measurement boundaries", () => {
  it("uses the last complete 24 hours aligned to UTC hours", () => {
    expect(usageWindow(new Date("2026-09-04T11:49:59.000Z"))).toEqual({
      since: "2026-09-03T11:00:00.000Z",
      until: "2026-09-04T11:00:00.000Z",
    });
  });

  it("rejects invalid, partial, unaligned, and non-24-hour windows", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    for (const window of [
      { since: "bad", until: "bad" },
      { since: "2026-09-03T11:00:00Z" },
      { since: "2026-09-03T11:01:00Z", until: "2026-09-04T11:01:00Z" },
      { since: "2026-09-03T10:00:00Z", until: "2026-09-04T11:00:00Z" },
    ]) expect(() => usageWindow(now, window)).toThrow();
  });

  it("emits fixed families rather than raw user agents, contacts, or identities", () => {
    expect(clientFamily("Mozilla HeadlessChrome/123 (person@example.com)")).toBe("headless_chrome");
    expect(clientFamily("SentinelOracle https://private.example/key")).toBe("sentinel_oracle_self_report");
    expect(clientFamily("codex-mcp-client/1.0")).toBe("codex_client_self_report");
    expect(clientFamily("unusual person@example.com")).toBe("other_or_unspecified");
    expect(routeFamily("/v1/agents/agt_secret/notifications")).toBe("agent_notifications");
    expect(routeFamily("/messages/private-token?key=secret")).toBe("message_pages");
    expect(routeFamily("/secret?token=private")).toBe("other");
  });
});

describe("usage evidence report", () => {
  it("reconciles counts without treating HTTP success as tool use or users", () => {
    const report = buildReport(evidence(), { project, window, mode: "saved" });
    expect(report.traffic.totalRequests).toBe(10);
    expect(report.coverage.status_final.state).toBe("complete");
    expect(report.traffic.http5xxRequests).toBe(0);
    expect(report.mcp.protocolOutcomes.state).toBe("unavailable");
    expect(report.productEvidence.activatedAgents).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/private-token|credential|private@example|secret@example/);
    expect(report.cost.state).toBe("unavailable");
  });

  it("does not turn missing, failed, malformed, or mismatched queries into zero", () => {
    const input = evidence();
    input.status_final.query.startTime = "2026-09-03T10:00:00.000Z";
    const report = buildReport(input, { project, window, mode: "saved" });
    expect(report.coverage.status_final.state).toBe("unavailable");
    expect(report.coverage.status_final.reasons).toContain("query_contract_mismatch");
    expect(report.traffic.http5xxRequests).toBeNull();
    expect(report.traffic.headlessChromeObservedRequests).toBeNull();
    const badCount = buildReport({ ...input, total_final: query([], [{ vercel_request_count_sum: null }]) }, { project, window, mode: "saved" });
    expect(badCount.traffic.totalRequests).toBeNull();
  });

  it("marks capped or unreconciled dimensions partial rather than claiming an exhaustive absence", () => {
    const input = evidence();
    input.status_final.summary = [{ http_status: "200", vercel_request_count_sum: 9 }];
    const report = buildReport(input, { project, window, mode: "saved" });
    expect(report.coverage.status_final.state).toBe("partial");
    expect(report.coverage.status_final.reasons).toContain("count_mismatch");
    expect(report.traffic.http5xxRequests).toBeNull();
    expect(report.traffic.http5xxObservedRequests).toBe(0);
    const capped = buildReport({ ...evidence(), status_final: { ...evidence().status_final, truncated: true } }, { project, window, mode: "saved" });
    expect(capped.coverage.status_final.state).toBe("partial");
  });

  it("does not certify zero server errors when HTTP statuses are unknown", () => {
    const input = evidence();
    input.status_final.summary = [{ http_status: "unavailable", vercel_request_count_sum: 10 }];
    const report = buildReport(input, { project, window, mode: "saved" });
    expect(report.traffic.http5xxRequests).toBeNull();
    expect(report.coverage.status_final.state).toBe("unavailable");
  });

  it("rejects saved evidence for another project or without verifiable project scope", () => {
    for (const scope of [undefined, { ...project, projectId: "prj_other" }, { ...project, orgId: "team_other" }]) {
      const report = buildReport({ ...evidence(), scope }, { project, window, mode: "saved" });
      expect(report.traffic.totalRequests).toBeNull();
      expect(report.coverage.total_final.reasons).toContain("scope_unverified_or_mismatched");
    }
  });

  it("keeps saved project-attributed cost in its separate billing window", () => {
    const report = buildReport({ ...evidence(), project_cost: {
      period: { from: "2026-09-03T07:00:00Z", to: "2026-09-04T07:00:00Z" },
      pricingUnit: "USD", artifactories: [{ name: "artifactories", totals: { effectiveCost: 0.06, billedCost: 0.06 } }],
    } }, { project, window, mode: "saved" });
    expect(report.cost.effectiveCost).toBe(0.06);
    expect(report.cost.window.since).toBe("2026-09-03T07:00:00.000Z");
    expect(report.cost.sameWindowAsTraffic).toBe(false);
    expect(report.cost.coverage).toBe("project_attributed_only");
  });

  it("keeps usable traffic when optional cost data is malformed", () => {
    for (const project_cost of [{ artifactories: {} }, { artifactories: [null] }, { artifactories: [null, { name: "artifactories", totals: null }] }]) {
      const report = buildReport({ ...evidence(), project_cost }, { project, window, mode: "saved" });
      expect(report.traffic.totalRequests).toBe(10);
      expect(report.cost.state).toBe("unavailable");
    }
  });
});

describe("bounded Vercel read collection", () => {
  it("uses explicit linked project, team, production, fixed 24-hour boundaries and no shell", async () => {
    const calls: string[][] = [];
    const collected = await collectUsage({ project, window, cwd: process.cwd(), run: async (file: string, args: string[], options: { timeout: number; shell: boolean }) => {
      expect(file).toBe("vercel");
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(30_000);
      expect(options.shell).toBe(false);
      calls.push(args);
      return { stdout: JSON.stringify(evidence().total_final) };
    } });
    expect(calls.length).toBeGreaterThan(3);
    for (const args of calls) {
      expect(args).toContain("prj_test");
      expect(args).toContain("team_test");
      expect(args).toContain(window.since);
      expect(args).toContain(window.until);
      expect(args).not.toContain("--all");
      expect(args[args.indexOf("--filter") + 1]).toContain(production);
    }
    expect(collected.scope.projectId).toBe("prj_test");
  });

  it("sanitizes authentication, unavailable CLI, and malformed JSON failures", async () => {
    for (const failure of ["ENOENT", "AUTH_REQUIRED", "malformed"]) {
      const collected = await collectUsage({ project, window, cwd: process.cwd(), run: async () => {
        if (failure === "malformed") return { stdout: "private@example.com invalid json" };
        throw Object.assign(new Error("private@example.com token=secret"), { code: failure });
      } });
      const report = buildReport(collected, { project, window, mode: "live" });
      expect(report.traffic.totalRequests).toBeNull();
      expect(report.coverage.total_final.state).toBe("unavailable");
      expect(JSON.stringify(report)).not.toMatch(/private@example|token=secret/);
    }
  });

  it("validates project IDs before starting any command", async () => {
    let called = false;
    await expect(collectUsage({ project: { ...project, projectId: "prj_test'; shell" }, window,
      run: async () => { called = true; return { stdout: "{}" }; },
    })).rejects.toThrow();
    expect(called).toBe(false);
  });
});

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("usage check command", () => {
  it("replays saved evidence offline using its exact window and linked project", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "artifactories-usage-"));
    temporaryDirectories.push(cwd);
    await mkdir(join(cwd, ".vercel"));
    await writeFile(join(cwd, ".vercel/project.json"), JSON.stringify(project));
    await writeFile(join(cwd, "evidence.json"), JSON.stringify(evidence()));
    const result = spawnSync(process.execPath, [resolve("scripts/check-usage.mjs"), "--input", "evidence.json"], { cwd, encoding: "utf8", env: { ...process.env, PATH: "/nonexistent" } });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.window).toEqual(window);
    expect(report.mode).toBe("saved");
    expect(report.traffic.totalRequests).toBe(10);
    expect(result.stderr).toBe("");
  });

  it("returns sanitized JSON errors for malformed input and invalid flags", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/check-usage.mjs"), "--unsafe-secret=hidden"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).state).toBe("unavailable");
    expect(result.stdout).not.toContain("hidden");
  });

  it("rejects null or non-object offline evidence without falling back to live collection", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "artifactories-usage-invalid-"));
    temporaryDirectories.push(cwd);
    await mkdir(join(cwd, ".vercel"));
    await writeFile(join(cwd, ".vercel/project.json"), JSON.stringify(project));
    for (const input of [null, [], false, "not evidence"]) {
      await writeFile(join(cwd, "evidence.json"), JSON.stringify(input));
      const result = spawnSync(process.execPath, [resolve("scripts/check-usage.mjs"), "--input", "evidence.json"], { cwd, encoding: "utf8", env: { ...process.env, PATH: "/nonexistent" } });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ state: "unavailable", error: "Saved evidence requires a JSON object." });
      expect(result.stdout).not.toContain("cli_unavailable");
    }
  });
});
