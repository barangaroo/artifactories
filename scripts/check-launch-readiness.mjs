import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const origin = process.env.ARTIFACTORIES_ORIGIN ?? "https://artifactories.com";
const repositoryRoot = new URL("../", import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("packages/artifactories-mcp/package.json", repositoryRoot), "utf8"),
);
const localSkill = await readFile(
  new URL("public/.well-known/agent-skills/artifactories/SKILL.md", repositoryRoot),
  "utf8",
);
const localSkillDigest = `sha256:${createHash("sha256").update(localSkill).digest("hex")}`;
const checks = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
}

async function fetchResult(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json, text/plain;q=0.9" },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { response, text, json };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const live = await fetchResult(`${origin}/v1/live`);
record(
  "service_liveness",
  live.response?.status === 200 && live.json?.status === "ok",
  live.error ?? `HTTP ${live.response?.status ?? "unknown"}`,
);

const health = await fetchResult(`${origin}/v1/health`);
record(
  "storage_readiness",
  health.response?.status === 200 &&
    health.json?.storage?.ready === true &&
    health.json?.storage?.writable === true,
  health.error ?? `HTTP ${health.response?.status ?? "unknown"}`,
);

const opportunities = await fetchResult(`${origin}/v1/opportunities?limit=1`);
record(
  "opportunity_return_loop",
  opportunities.response?.status === 200 &&
    opportunities.json?.meta?.selection === "UNREPLIED_ASKS",
  opportunities.error ?? `HTTP ${opportunities.response?.status ?? "unknown"}`,
);

const notifications = await fetchResult(
  `${origin}/v1/agents/not-an-agent/notifications?limit=1`,
);
record(
  "reply_notification_route",
  notifications.response?.status === 400 &&
    notifications.json?.error?.code === "ERR.INVALID_AGENT_ID",
  notifications.error ?? `HTTP ${notifications.response?.status ?? "unknown"}`,
);

const skillIndex = await fetchResult(
  `${origin}/.well-known/agent-skills/index.json`,
);
const deployedSkillEntry = skillIndex.json?.skills?.find?.(
  (skill) => skill?.name === "artifactories",
);
const deployedSkill = await fetchResult(
  `${origin}/.well-known/agent-skills/artifactories/SKILL.md`,
);
const deployedSkillDigest = deployedSkill.text === undefined
  ? undefined
  : `sha256:${createHash("sha256").update(deployedSkill.text).digest("hex")}`;
record(
  "current_skill_deployed",
  skillIndex.response?.status === 200 &&
    deployedSkill.response?.status === 200 &&
    deployedSkillEntry?.digest === localSkillDigest &&
    deployedSkillDigest === localSkillDigest,
  `local=${localSkillDigest} index=${deployedSkillEntry?.digest ?? "missing"} body=${deployedSkillDigest ?? "missing"}`,
);

const npmPackage = await fetchResult(
  `https://registry.npmjs.org/${encodeURIComponent(packageJson.name)}`,
);
record(
  "npm_package_published",
  npmPackage.response?.status === 200 &&
    npmPackage.json?.["dist-tags"]?.latest === packageJson.version &&
    npmPackage.json?.versions?.[packageJson.version]?.mcpName === packageJson.mcpName,
  npmPackage.error ??
    `HTTP ${npmPackage.response?.status ?? "unknown"}; latest=${npmPackage.json?.["dist-tags"]?.latest ?? "missing"}`,
);

const registry = await fetchResult(
  `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(packageJson.mcpName)}`,
);
const registryMatch = registry.json?.servers?.some?.((entry) => {
  const server = entry?.server ?? entry;
  return server?.name === packageJson.mcpName && server?.version === packageJson.version;
});
record(
  "mcp_registry_listing",
  registry.response?.status === 200 && registryMatch === true,
  registry.error ??
    `HTTP ${registry.response?.status ?? "unknown"}; matches=${registryMatch === true ? 1 : 0}`,
);

const ready = checks.every((check) => check.passed);
console.log(JSON.stringify({ origin, ready, checks }, null, 2));
if (!ready) process.exitCode = 1;
