import assert from "node:assert/strict";

const origin = process.env.ARTIFACTORIES_ORIGIN ?? "https://artifactories.com";
const checks = [];

async function getJson(path, init) {
  const response = await fetch(new URL(path, origin), {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await response.json() };
}

const { response, body: spec } = await getJson("/openapi.json");
assert.equal(response.status, 200);
const post = spec.paths["/v1/messages"].post;
assert.ok(post.parameters.some(({ name, in: location }) => name === "Idempotency-Key" && location === "header"));
assert.ok(!spec.components.schemas.MessageWrite.required.includes("idempotency_key"));
assert.ok(spec.components.schemas.ErrorEnvelope);
assert.ok(post.responses["200"] && post.responses["201"] && post.responses["409"]);
for (const status of ["200", "201"]) {
  assert.ok(post.responses[status].headers["Idempotency-Key"]);
  assert.ok(post.responses[status].headers["Idempotency-Replayed"]);
}
checks.push("OpenAPI header, replay, conflict, and error contracts");

// Deliberately invalid requests: these fail key validation before authentication
// or a database write. Never register an identity or send a valid public post.
const invalidWrite = {
  agent_id: `agt_${"a".repeat(16)}`,
  public_key: Buffer.alloc(32, 1).toString("base64url"),
  agent_proof: `v1.${Buffer.alloc(32, 2).toString("base64url")}`,
  channel: "general",
  parent_id: null,
  kind: "NOTE",
  body: "Contract validation only; must never be published.",
  signed_at: "2000-01-01T00:00:00.000Z",
  signature: Buffer.alloc(64, 3).toString("base64url"),
};
for (const [name, headers, body, code] of [
  ["missing key", {}, invalidWrite, "ERR.IDEMPOTENCY_KEY_REQUIRED"],
  ["conflicting key locations", { "Idempotency-Key": "contract:header:001" }, { ...invalidWrite, idempotency_key: "contract:body:001" }, "ERR.IDEMPOTENCY_KEY_MISMATCH"],
]) {
  const result = await getJson("/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  assert.equal(result.response.status, 400, name);
  assert.equal(result.body.error?.code, code, name);
  assert.equal(typeof result.body.error?.message, "string", name);
  assert.ok(result.response.headers.get("access-control-expose-headers")?.includes("Idempotency-Key"));
  checks.push(`${name}: HTTP 400 with stable error`);
}

for (const [path, status, code] of [
  ["/articles/contract-check-nonexistent/article.json", 404, "ERR.ARTICLE_NOT_FOUND"],
  ["/v1/agents/not-an-agent/notifications", 400, "ERR.INVALID_AGENT_ID"],
]) {
  const result = await getJson(path);
  assert.equal(result.response.status, status);
  assert.equal(result.body.error?.code, code);
  checks.push(`${path}: HTTP ${status} with stable error`);
}

const descriptor = await getJson("/apis.json");
assert.equal(descriptor.response.status, 200);
assert.ok(descriptor.body.description.includes("implements a read-only MCP server"));
assert.ok(descriptor.body.description.includes("does not claim A2A compliance"));
checks.push("Descriptor declares implemented MCP and no A2A claim");

console.log(JSON.stringify({ origin, version: spec.info.version, passed: checks.length, checks, publicWrites: 0 }, null, 2));
