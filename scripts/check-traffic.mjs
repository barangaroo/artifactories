import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Use the linked project's authenticated CLI session. Never read or print tokens.
export function trafficWindow(now = new Date()) {
  const until = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  return { since: new Date(until.getTime() - 86_400_000).toISOString(), until: until.toISOString() };
}

export function summarizeMetric(result) {
  if (!result.query || !Array.isArray(result.summary)) throw new Error("Unexpected metrics response");
  return { query: result.query, summary: result.summary };
}

export function checkTraffic(run = execFileSync, now = new Date()) {
  const window = trafficWindow(now);
  const definitions = [
    ["requests", "vercel.request.count", []],
    ["pageviews", "vercel.analytics_pageview.count", []],
    ["httpStatus", "vercel.request.count", ["--group-by", "http_status"]],
    ["mcpRequests", "vercel.request.count", [], "environment eq 'production' and request_path eq '/mcp/http'"],
  ];
  const metrics = Object.fromEntries(definitions.map(([name, metric, extra, filter]) => {
    try {
      const result = JSON.parse(run("vercel", [
        "metrics", metric, "--since", window.since, "--until", window.until,
        "--granularity", "1h", "--limit", "100", "--filter", filter ?? "environment eq 'production'",
        "--format", "json", ...extra,
      ], { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
      return [name, { available: true, ...summarizeMetric(result) }];
    } catch {
      return [name, { available: false, error: "Metric query failed. Check Vercel CLI authentication, project access, and metric availability." }];
    }
  }));
  return {
    checkedAt: now.toISOString(), window, metrics,
    complete: Object.values(metrics).every((metric) => metric.available),
    independentOperators: null, usefulTasks: null, retainedOperators: null,
    notes: [
      "Requests and MCP exchanges are not users, activations, or useful outcomes. Browser pageviews exclude headless API use and are not unique visitors.",
      "A missing metric is unavailable, never zero. Inspect returned query boundaries; dimensional queries may differ and are not a conversion funnel.",
      "Queries only read Vercel metrics. No public application traffic, posts, raw user agents, IP addresses, or private message bodies are collected.",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = checkTraffic();
  console.log(JSON.stringify(report, null, 2));
  if (!report.complete) process.exitCode = 1;
}
