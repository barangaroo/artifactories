import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const checker = resolve("scripts/check-cohort.mjs");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function check(agents: unknown[]) {
  const directory = await mkdtemp(join(tmpdir(), "artifactories-cohort-"));
  temporaryDirectories.push(directory);
  const ledgerPath = join(directory, "ledger.json");
  await writeFile(
    ledgerPath,
    JSON.stringify({
      schema_version: 2,
      study_started_at: "2026-08-31T00:00:00.000Z",
      operators: [
        {
          operator_id: "operator_alpha",
          independence_evidence: "private consent record 1",
          consent_recorded_at: "2026-08-31T01:00:00.000Z",
          agents,
        },
      ],
      manufactured_activity_events: [],
    }),
  );
  const result = spawnSync(process.execPath, [checker, ledgerPath], { encoding: "utf8" });
  return { result, output: JSON.parse(result.stdout) };
}

describe("cohort evidence checker", () => {
  it("counts an operator-attested read-only MCP activation without requiring registration", async () => {
    const { result, output } = await check([
      {
        agent_ref: "ref_abcdefghijklmnop",
        workflow: "Research assistant checks open questions during a real literature review",
        posting_authority: "READ_ONLY",
        notification_cursor_verified: false,
        activation_event: {
          type: "READ",
          occurred_at: "2026-08-31T02:00:00.000Z",
          genuine_task_attested: true,
          evidence_ref: "operator-attestation-1",
        },
      },
    ]);

    expect(result.status).toBe(1);
    expect(output.metrics.genuinely_active_agents).toBe(1);
    expect(output.metrics.qualified_independent_operators).toBe(1);
    expect(output.errors).toEqual([]);
  });

  it("requires a registered identity before counting notification cursor verification", async () => {
    const { output } = await check([
      {
        agent_ref: "ref_abcdefghijklmnop",
        workflow: "Research assistant checks open questions during a real literature review",
        posting_authority: "READ_ONLY",
        notification_cursor_verified: true,
        activation_event: {
          type: "READ",
          occurred_at: "2026-08-31T02:00:00.000Z",
          genuine_task_attested: true,
          evidence_ref: "operator-attestation-1",
        },
      },
    ]);

    expect(output.metrics.notification_cursor_verified_agents).toBe(0);
    expect(output.errors).toContain(
      "ref_abcdefghijklmnop: notification cursor verification requires a registered agent ID",
    );
  });

  it("requires write-authorized agents to use registered Artifactories identities", async () => {
    const { output } = await check([
      {
        agent_ref: "ref_abcdefghijklmnop",
        workflow: "Coding agent publishes operator-approved reusable findings",
        posting_authority: "PER_POST",
        activation_event: {
          type: "RESULT",
          occurred_at: "2026-08-31T02:00:00.000Z",
          genuine_task_attested: true,
          evidence_ref: "operator-attestation-1",
        },
      },
    ]);

    expect(output.metrics.genuinely_active_agents).toBe(0);
    expect(output.errors[0]).toContain("missing stable identity");
  });
});
