import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const HOUR = 3_600_000;
const LIMIT = 100;
const COUNT = "vercel_request_count_sum";
const PRODUCTION = "environment eq 'production'";
const MCP = `${PRODUCTION} and request_path eq '/mcp/http'`;
const METHODS = `${PRODUCTION} and (request_path eq '/v1/messages' or request_path eq '/mcp/http' or contains(request_path, '/v1/agents') or request_path eq '/v1/opportunities')`;
const QUERIES = {
  total_final: { groupBy: [], filter: PRODUCTION },
  status_final: { groupBy: ["http_status"], filter: PRODUCTION },
  paths_final: { groupBy: ["request_path"], filter: PRODUCTION },
  methods_final: { groupBy: ["request_path", "request_method", "http_status"], filter: METHODS },
  headless_routes: { groupBy: ["request_path"], filter: `${PRODUCTION} and contains(client_user_agent, 'HeadlessChrome')` },
  clients_mcp: { groupBy: ["client_user_agent"], filter: MCP },
  clients_all: { groupBy: ["client_user_agent"], filter: PRODUCTION },
  mcp_total: { groupBy: [], filter: MCP },
  headless_total: { groupBy: [], filter: `${PRODUCTION} and contains(client_user_agent, 'HeadlessChrome')` },
};

export function usageWindow(now = new Date(), requested = {}) {
  const end = Math.floor(now.getTime() / HOUR) * HOUR;
  const since = requested.since === undefined ? end - 24 * HOUR : Date.parse(requested.since);
  const until = requested.until === undefined ? end : Date.parse(requested.until);
  if ((requested.since === undefined) !== (requested.until === undefined) ||
      !Number.isFinite(since) || !Number.isFinite(until) ||
      since % HOUR !== 0 || until % HOUR !== 0 || until - since !== 24 * HOUR || until > end) {
    throw new Error("Window must be a completed, UTC-hour-aligned 24 hours; supply both --since and --until.");
  }
  return { since: new Date(since).toISOString(), until: new Date(until).toISOString() };
}

export function clientFamily(value) {
  const ua = typeof value === "string" ? value : "";
  if (/HeadlessChrome/i.test(ua)) return "headless_chrome";
  if (/SentinelOracle/i.test(ua)) return "sentinel_oracle_self_report";
  if (/mcpbeat/i.test(ua)) return "mcpbeat_self_report";
  if (/codex/i.test(ua)) return "codex_client_self_report";
  if (/monitor|probe|scan|collector|harvester|observatory|mcp.?watch/i.test(ua)) return "monitor_or_scanner_self_report";
  if (/^(node|undici)(?:[ /]|$)/i.test(ua)) return "node_or_undici";
  if (/python|httpx|aiohttp/i.test(ua)) return "python_http_client";
  if (/curl|wget/i.test(ua)) return "command_line_http_client";
  if (/Chrome|Chromium|Firefox|Safari|Edg\//i.test(ua)) return "browser_self_report";
  return "other_or_unspecified";
}

export function routeFamily(value) {
  const path = typeof value === "string" ? value.split("?")[0] : "";
  const exact = { "/": "homepage", "/v1/messages": "messages_api", "/mcp/http": "mcp_http", "/v1/opportunities": "opportunities_api", "/v1/live": "liveness", "/v1/health": "readiness", "/v1/agents/register": "registration", "/v1/agents/challenge": "registration_challenge", "/mcp": "mcp_setup", "/codex": "codex_setup", "/feed.atom": "feeds", "/feed.json": "feeds" };
  if (Object.hasOwn(exact, path)) return exact[path];
  if (/^\/v1\/agents\/[^/]+\/notifications$/.test(path)) return "agent_notifications";
  if (path.startsWith("/messages/")) return "message_pages";
  if (path.startsWith("/channels/")) return "channel_pages";
  if (path === "/articles" || path.startsWith("/articles/")) return "articles";
  if (path.startsWith("/sitemap") || path === "/robots.txt") return "crawler_discovery";
  if (path.startsWith("/.well-known/") || ["/llms.txt", "/skill.md", "/openapi.json", "/apis.json"].includes(path)) return "agent_discovery";
  if (path.startsWith("/_next/") || /\.(png|ico|svg|woff2)$/.test(path)) return "static_assets";
  if (["/privacy", "/terms", "/support", "/principles", "/principles.md", "/principles.json"].includes(path)) return "information_pages";
  return "other";
}

function validateProject(project) {
  if (!/^prj_[A-Za-z0-9]+$/.test(project?.projectId ?? "") ||
      !/^(team_|user_)[A-Za-z0-9]+$/.test(project?.orgId ?? "")) {
    throw new Error("A valid linked projectId and orgId are required in .vercel/project.json.");
  }
}

export async function collectUsage({ project, window, cwd = process.cwd(), run = promisify(execFile) }) {
  validateProject(project);
  const entries = await Promise.all(Object.entries(QUERIES).map(async ([name, spec]) => {
    const args = ["metrics", "vercel.request.count", "--aggregation", "sum", "--project", project.projectId,
      "--scope", project.orgId, "--filter", spec.filter, "--since", window.since, "--until", window.until,
      "--granularity", "1h", "--limit", String(LIMIT), "--format", "json", "--non-interactive"];
    for (const dimension of spec.groupBy) args.push("--group-by", dimension);
    try {
      const result = await run("vercel", args, { cwd, encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024, shell: false });
      try {
        return [name, JSON.parse(result.stdout)];
      } catch {
        return [name, { failure: "malformed_cli_json" }];
      }
    } catch (error) {
      // Never echo command errors: they can contain credentials, URLs, or raw output.
      const failure = error?.code === "ENOENT" ? "cli_unavailable" : error?.killed ? "cli_timeout" : "cli_failed_auth_or_network";
      return [name, { failure }];
    }
  }));
  return { scope: { projectId: project.projectId, orgId: project.orgId }, ...Object.fromEntries(entries) };
}

function checkedQuery(value, spec, window, scopeValid) {
  const base = { state: "unavailable", reasons: [], observedRequests: null, groupLimitPerHour: spec.groupBy.length ? LIMIT : null };
  const reject = (reason) => ({ coverage: { ...base, reasons: [reason] }, rows: null });
  if (!scopeValid) return reject("scope_unverified_or_mismatched");
  if (!value) return reject("missing_query");
  if (value.failure) return reject(["cli_unavailable", "cli_timeout", "cli_failed_auth_or_network", "malformed_cli_json"].includes(value.failure) ? value.failure : "query_failed");
  if (value.error) return reject("query_failed");
  const q = value.query;
  if (!q || q.metric !== "vercel.request.count" || q.aggregation !== "sum" ||
      q.startTime !== window.since || q.endTime !== window.until || q.filter !== spec.filter ||
      JSON.stringify(q.groupBy) !== JSON.stringify(spec.groupBy) || q.granularity?.hours !== 1) {
    return reject("query_contract_mismatch");
  }
  if (!Array.isArray(value.summary) || (!spec.groupBy.length && value.summary.length !== 1)) return reject("missing_or_invalid_summary");
  const rows = [];
  for (const row of value.summary) {
    const count = row?.[COUNT] ?? row?.requests;
    if (!Number.isSafeInteger(count) || count < 0 || spec.groupBy.some((key) =>
      typeof row[key] !== "string" && !(key === "client_user_agent" && typeof row.client_family === "string"))) return reject("invalid_summary_row");
    if (spec.groupBy.includes("http_status") && !/^[1-5]\d\d$/.test(row.http_status)) return reject("unknown_http_status");
    rows.push({ ...row, requests: count });
  }
  const observedRequests = rows.reduce((total, row) => total + row.requests, 0);
  if (!Number.isSafeInteger(observedRequests)) return reject("invalid_summary_count");
  const truncated = value.truncated === true || value.hasMore === true || value.meta?.truncated === true;
  return { rows, coverage: { ...base, observedRequests, state: truncated || spec.groupBy.length ? "partial" : "complete",
    reasons: truncated ? ["source_reports_truncation"] : spec.groupBy.length ? ["group_limit_may_omit_groups"] : [] } };
}

function aggregate(rows, classify) {
  if (rows === null) return null;
  const counts = new Map();
  for (const row of rows) {
    const family = classify(row);
    counts.set(family, (counts.get(family) ?? 0) + row.requests);
  }
  return [...counts].map(([family, requests]) => ({ family, requests })).sort((a, b) => b.requests - a.requests || a.family.localeCompare(b.family));
}

function savedCost(value, project, window, scopeValid) {
  const unavailable = { state: "unavailable", reason: "Live cost collection is not implemented; supply valid project-attributed saved evidence.", effectiveCost: null };
  const cost = Array.isArray(value?.artifactories) ? value.artifactories.find((entry) => entry?.name === project.projectName) : undefined;
  const since = Date.parse(value?.period?.from);
  const until = Date.parse(value?.period?.to);
  if (!scopeValid || value?.pricingUnit !== "USD" || !cost || !Number.isFinite(since) || !Number.isFinite(until) || until <= since ||
      ![cost.totals?.effectiveCost, cost.totals?.billedCost].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)) return unavailable;
  const costWindow = { since: new Date(since).toISOString(), until: new Date(until).toISOString() };
  return { state: "available", currency: "USD", window: costWindow, effectiveCost: cost.totals.effectiveCost,
    billedCost: cost.totals.billedCost, sameWindowAsTraffic: costWindow.since === window.since && costWindow.until === window.until,
    coverage: "project_attributed_only", excludes: ["unattributed_team_charges", "external_providers"], source: "saved_evidence" };
}

export function buildReport(evidence, { project, window, mode }) {
  validateProject(project);
  const sourceScope = evidence?.scope ?? { projectId: evidence?.deployment?.id, orgId: evidence?.deployment?.accountId };
  const scopeValid = sourceScope.projectId === project.projectId && sourceScope.orgId === project.orgId;
  const results = Object.fromEntries(Object.entries(QUERIES).map(([name, spec]) => [name, checkedQuery(evidence?.[name], spec, window, scopeValid)]));
  const coverage = Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.coverage]));
  const count = (name) => coverage[name].observedRequests;
  const reconcile = (name, expected) => {
    const item = coverage[name];
    item.expectedRequests = expected;
    if (item.state === "unavailable" || expected === null) return;
    if (item.observedRequests !== expected) {
      item.state = "partial";
      item.reasons.push("count_mismatch");
    } else if (!item.reasons.includes("source_reports_truncation")) {
      item.state = "complete";
      item.reasons = [];
    }
  };
  const total = coverage.total_final.state === "complete" ? count("total_final") : null;
  reconcile("status_final", total);
  reconcile("paths_final", total);
  reconcile("clients_all", total);
  const routes = results.paths_final.rows;
  const routeCount = (path) => routes?.find((row) => row.request_path === path)?.requests ?? (coverage.paths_final.state === "complete" ? 0 : null);
  const mcpTotal = coverage.mcp_total.state === "complete" ? count("mcp_total") : (coverage.paths_final.state === "complete" ? routeCount("/mcp/http") : null);
  reconcile("clients_mcp", mcpTotal);
  reconcile("headless_routes", coverage.headless_total.state === "complete" ? count("headless_total") : null);
  const methodRows = results.methods_final.rows;
  const mcpRows = methodRows?.filter((row) => row.request_path === "/mcp/http") ?? null;
  // This is a subset of the method query; do not compare its count to all route methods.
  const mcpHttpObserved = mcpRows?.reduce((sum, row) => sum + row.requests, 0) ?? null;
  const methodExpected = coverage.paths_final.state === "complete" ? routes.filter((row) =>
    ["/v1/messages", "/mcp/http", "/v1/opportunities"].includes(row.request_path) || row.request_path.includes("/v1/agents"))
    .reduce((sum, row) => sum + row.requests, 0) : null;
  reconcile("methods_final", methodExpected);
  const statusRows = results.status_final.rows;
  const http5xxObserved = statusRows?.filter((row) => /^5\d\d$/.test(row.http_status)).reduce((sum, row) => sum + row.requests, 0) ?? null;
  const safeStatus = (value) => /^[1-5]\d\d$/.test(value) ? value : "other";
  const clientGroups = (name) => aggregate(results[name].rows, (row) => clientFamily(row.client_user_agent ?? row.client_family));
  return {
    schemaVersion: 1, state: total === null ? "unavailable" : Object.values(coverage).every((item) => item.state === "complete") ? "complete" : "partial",
    mode, scope: { projectId: project.projectId, orgId: project.orgId, environment: "production",
      verified: scopeValid, basis: mode === "live" ? "explicit_cli_arguments" : "saved_project_metadata" }, window,
    coverage,
    traffic: { totalRequests: total, routeFamilies: aggregate(routes, (row) => routeFamily(row.request_path)),
      httpStatuses: aggregate(statusRows, (row) => safeStatus(row.http_status)), http5xxObservedRequests: http5xxObserved,
      http5xxRequests: coverage.status_final.state === "complete" ? http5xxObserved : null,
      headlessChromeObservedRequests: count("headless_total") ?? count("headless_routes"),
      headlessRouteFamilies: aggregate(results.headless_routes.rows, (row) => routeFamily(row.request_path)),
      clientFamilies: clientGroups("clients_all") },
    mcp: { totalRequests: mcpTotal, observedRouteRequests: routeCount("/mcp/http"), httpObservedRequests: mcpHttpObserved,
      httpCountReconciled: mcpTotal !== null && mcpHttpObserved !== null ? mcpTotal === mcpHttpObserved : null,
      httpOutcomes: aggregate(mcpRows, (row) => `${["GET", "POST", "HEAD", "OPTIONS", "DELETE"].includes(row.request_method) ? row.request_method : "OTHER"}_HTTP_${safeStatus(row.http_status)}`),
      clientFamilies: clientGroups("clients_mcp"),
      protocolOutcomes: { state: "unavailable", reason: "HTTP status aggregates do not reveal JSON-RPC methods, tool success, or useful task outcomes." } },
    cost: savedCost(evidence?.project_cost, project, window, scopeValid),
    productEvidence: { activatedAgents: null, independentOperators: null, usefulOutcomes: null, retainedOperators: null,
      reason: "Requests and self-reported clients are not identities or activation evidence; use the operator-attested cohort ledger." },
    caveats: ["User-agent families are unverified self-reports, not identity, ownership, or confirmed monitoring activity.",
      "Dimensional queries may be capped per hour and queried at different times. Partial counts are observations, not exhaustive totals.",
      "This report reads Vercel metrics only; it does not generate application traffic or public activity.",
      "Cost, when supplied, has its own billing window and is not total company cost."],
  };
}

async function main() {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const flag = process.argv[index];
    if (!["--input", "--since", "--until"].includes(flag) || !process.argv[index + 1] || Object.hasOwn(options, flag.slice(2))) {
      throw new Error("Expected --input PATH and/or paired --since ISO --until ISO; repeated or unknown flags are not accepted.");
    }
    options[flag.slice(2)] = process.argv[index + 1];
  }
  let project;
  try { project = JSON.parse(await readFile(resolve(".vercel/project.json"), "utf8")); }
  catch { throw new Error("Cannot read linked project JSON at .vercel/project.json."); }
  validateProject(project);
  let evidence;
  if (options.input) {
    try { evidence = JSON.parse(await readFile(resolve(options.input), "utf8")); }
    catch { throw new Error("Cannot read or parse saved evidence JSON."); }
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("Saved evidence requires a JSON object.");
  }
  const requested = options.since !== undefined || options.until !== undefined ? options : evidence ? {
    since: evidence?.total_final?.query?.startTime, until: evidence?.total_final?.query?.endTime,
  } : {};
  if (evidence && (requested.since === undefined || requested.until === undefined)) throw new Error("Saved evidence requires an explicit valid traffic window.");
  const window = usageWindow(new Date(), requested);
  const mode = options.input ? "saved" : "live";
  if (!options.input) evidence = await collectUsage({ project, window });
  const report = buildReport(evidence, { project, window, mode });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state === "unavailable") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // All intentionally raised messages above are fixed text, never source/CLI payloads.
    const message = error instanceof Error && /^(Expected --input|Cannot read|A valid linked|Window must|Saved evidence requires)/.test(error.message)
      ? error.message : "Usage report failed; check the linked project, input, and CLI access.";
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, state: "unavailable", error: message })}\n`);
    process.exitCode = 1;
  });
}
