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

async function check(agents: unknown[], options: { asOf?: string; studyStartedAt?: string; manufacturedEvents?: unknown[]; rawLedger?: unknown } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "artifactories-cohort-"));
  temporaryDirectories.push(directory);
  const ledgerPath = join(directory, "ledger.json");
  await writeFile(
    ledgerPath,
    JSON.stringify(Object.hasOwn(options, "rawLedger") ? options.rawLedger : {
      schema_version: 2,
      study_started_at: options.studyStartedAt ?? "2026-08-31T00:00:00.000Z",
      operators: [
        {
          operator_id: "operator_alpha",
          independence_evidence: "private consent record 1",
          consent_recorded_at: "2026-08-31T01:00:00.000Z",
          agents,
        },
      ],
      manufactured_activity_events: options.manufacturedEvents ?? [],
    }),
  );
  const result = spawnSync(process.execPath, [checker, ledgerPath, `--as-of=${options.asOf ?? "2026-09-04T00:00:00.000Z"}`], { encoding: "utf8" });
  return { result, output: JSON.parse(result.stdout || result.stderr) };
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

function activatedAgent(overrides: Record<string, unknown> = {}) {
  return {
    agent_ref: "ref_abcdefghijklmnop",
    workflow: "Existing research workflow",
    posting_authority: "READ_ONLY",
    activation_event: {
      type: "READ",
      occurred_at: "2026-08-31T02:00:00.000Z",
      genuine_task_attested: true,
      evidence_ref: "activation-reference",
    },
    ...overrides,
  };
}

describe("optional useful-task evidence", () => {
  it("keeps existing schema-v2 activation distinct from measured usefulness", async () => {
    const { output } = await check([activatedAgent()]);
    expect(output.metrics.genuinely_active_agents).toBe(1);
    expect(output.task_outcomes).toEqual({ useful_agents: 0, not_useful_agents: 0, no_trigger_agents: 0, assessed_agents: 0, useful_operators: 0, useful_rate: null, state: "not_measurable" });
    expect(output.errors).toEqual([]);
  });

  it.each(["USEFUL", "NOT_USEFUL", "NO_TRIGGER"])("records %s without manufacturing activation", async (outcome) => {
    const { output } = await check([activatedAgent({
      usefulness_event: { outcome, occurred_at: "2026-09-01T00:00:00.000Z", genuine_task_attested: true, evidence_ref: "redacted-outcome-reference" },
    })]);
    expect(output.task_outcomes.assessed_agents).toBe(1);
    expect(output.task_outcomes.useful_agents).toBe(outcome === "USEFUL" ? 1 : 0);
    expect(output.task_outcomes.not_useful_agents).toBe(outcome === "NOT_USEFUL" ? 1 : 0);
    expect(output.task_outcomes.no_trigger_agents).toBe(outcome === "NO_TRIGGER" ? 1 : 0);
    expect(output.task_outcomes.useful_rate).toBe(outcome === "USEFUL" ? 1 : 0);
    expect(output.errors).toEqual([]);
  });

  it.each([
    { occurred_at: "2026-08-30T00:00:00.000Z" },
    { occurred_at: "2026-09-05T00:00:00.000Z" },
    { genuine_task_attested: false },
    { evidence_ref: "" },
    { outcome: "INSTALL" },
    { outcome: { toString: null } },
  ])("rejects unattributable usefulness evidence %j", async (invalidFields) => {
    const { output } = await check([activatedAgent({
      usefulness_event: { outcome: "USEFUL", occurred_at: "2026-09-01T00:00:00.000Z", genuine_task_attested: true, evidence_ref: "redacted-outcome-reference", ...invalidFields },
    })]);
    expect(output.task_outcomes.useful_agents).toBe(0);
    expect(output.task_outcomes.useful_rate).toBeNull();
    expect(output.errors.join(" ")).toContain("usefulness evidence");
  });

  it("does not count a useful outcome without a genuine activation", async () => {
    const { output } = await check([activatedAgent({ activation_event: null,
      usefulness_event: { outcome: "USEFUL", occurred_at: "2026-09-01T00:00:00.000Z", genuine_task_attested: true, evidence_ref: "redacted-outcome-reference" },
    })]);
    expect(output.task_outcomes.useful_agents).toBe(0);
    expect(output.metrics.genuinely_active_agents).toBe(0);
  });
});

describe("activation-relative return measurement", () => {
  const earlyActivation = {
    type: "READ", occurred_at: "2026-08-21T00:00:00.000Z",
    genuine_task_attested: true, evidence_ref: "activation-reference",
  };
  const returnEvent = {
    type: "OPPORTUNITY", occurred_at: "2026-09-01T00:00:00.000Z",
    genuine_task_attested: true, evidence_ref: "return-reference",
  };

  it("reports an immature cohort as not measurable, not zero retention", async () => {
    const { output } = await check([activatedAgent()]);
    expect(output.valid).toBe(true);
    expect(output.activation_relative_retention).toEqual({ d7_mature_agents: 0, d7_or_later_returned_agents: 0, d7_mature_operators: 0, d7_or_later_returned_operators: 0, agent_return_rate: null, operator_return_rate: null, state: "not_measurable" });
  });

  it("counts genuine D7-or-later return independently of the study-relative week-two gate", async () => {
    const { output } = await check([activatedAgent({ activation_event: earlyActivation, return_event: returnEvent })]);
    expect(output.metrics.week_two_retained_operators).toBe(0);
    expect(output.activation_relative_retention.d7_mature_agents).toBe(1);
    expect(output.activation_relative_retention.d7_or_later_returned_agents).toBe(1);
    expect(output.activation_relative_retention.operator_return_rate).toBe(1);
    expect(output.errors).toEqual([]);
  });

  it("does not call a late-joining agent retained on D7 because the study is old", async () => {
    const { output } = await check([activatedAgent({ return_event: returnEvent })], { studyStartedAt: "2026-08-01T00:00:00.000Z" });
    expect(output.metrics.week_two_retained_operators).toBe(1);
    expect(output.activation_relative_retention.d7_or_later_returned_agents).toBe(0);
    expect(output.activation_relative_retention.agent_return_rate).toBeNull();
  });

  it("uses each mature agent's activation as the threshold and deduplicates operators", async () => {
    const { output } = await check([
      activatedAgent({ activation_event: earlyActivation, return_event: returnEvent }),
      activatedAgent({ agent_ref: "ref_qrstuvwxyzabcdef", activation_event: earlyActivation }),
      activatedAgent({ agent_ref: "ref_ghijklmnopqrstuv", return_event: returnEvent }),
    ]);
    expect(output.activation_relative_retention).toEqual({ d7_mature_agents: 2, d7_or_later_returned_agents: 1, d7_mature_operators: 1, d7_or_later_returned_operators: 1, agent_return_rate: 0.5, operator_return_rate: 1, state: "measured" });
  });

  it.each(["2026-08-30T00:00:00.000Z", "2026-09-05T00:00:00.000Z"])("rejects return outside activation/as-of bounds: %s", async (occurred_at) => {
    const { output } = await check([activatedAgent({ return_event: { ...returnEvent, occurred_at } })], { studyStartedAt: "2026-08-01T00:00:00.000Z" });
    expect(output.metrics.week_two_retained_operators).toBe(0);
    expect(output.activation_relative_retention.d7_or_later_returned_agents).toBe(0);
    expect(output.valid).toBe(false);
    expect(output.errors.join(" ")).toContain("return evidence");
  });

  it("rejects polling as return evidence and retains the manufactured-activity guard", async () => {
    const { output } = await check([activatedAgent({ activation_event: earlyActivation, return_event: { ...returnEvent, type: "POLL" } })], { manufacturedEvents: [{ evidence_ref: "test-fixture-only" }] });
    expect(output.valid).toBe(false);
    expect(output.ready).toBe(false);
    expect(output.activation_relative_retention.operator_return_rate).toBeNull();
    expect(output.activation_relative_retention.state).toBe("invalid_evidence");
    expect(output.errors).toContain("manufactured_activity_events must remain empty");
  });

  it("rejects future activation rather than counting a mature cohort", async () => {
    const { output } = await check([activatedAgent({ activation_event: { ...earlyActivation, occurred_at: "2026-09-05T00:00:00.000Z" } })]);
    expect(output.metrics.genuinely_active_agents).toBe(0);
    expect(output.activation_relative_retention.d7_mature_agents).toBe(0);
    expect(output.valid).toBe(false);
  });

  it("requires an explicit ISO timestamp for reproducible as-of reports", async () => {
    const result = spawnSync(process.execPath, [checker, "unused-ledger.json", "--as-of=2026-09-01"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).error).toContain("--as-of");
  });
});

describe("invalid ledger input", () => {
  it.each([
    { agent_id: { toString: null } },
    { agent_ref: { toString: null } },
    { agent_id: "agt_abcdefghijklmnop", agent_ref: { toString: null } },
  ])("reports malformed identity objects as invalid evidence without crashing: %j", async (invalidIdentity) => {
    const { result, output } = await check([activatedAgent(invalidIdentity)]);
    expect(result.status).toBe(1);
    expect(output.valid).toBe(false);
    expect(output.metrics.genuinely_active_agents).toBe(0);
    expect(output.errors.join(" ")).toContain("missing stable identity");
  });

  it.each(["2026-02-30T00:00:00.000Z", "2026-02-29T00:00:00+08:00", "2026-04-31T23:00:00-02:00"])("rejects impossible calendar dates instead of normalizing them: %s", async (occurred_at) => {
    const { output } = await check([activatedAgent({
      activation_event: { type: "READ", occurred_at, genuine_task_attested: true, evidence_ref: "activation-reference" },
    })]);
    expect(output.valid).toBe(false);
    expect(output.metrics.genuinely_active_agents).toBe(0);
  });

  it.each(["2024-02-29T23:30:00.000Z", "2024-02-29T23:30:00-02:00", "2026-03-01T00:30:00+08:00"])("preserves legitimate leap days and offset calendar dates: %s", async (occurred_at) => {
    const { output } = await check([activatedAgent({
      activation_event: { type: "READ", occurred_at, genuine_task_attested: true, evidence_ref: "activation-reference" },
    })]);
    expect(output.valid).toBe(true);
    expect(output.metrics.genuinely_active_agents).toBe(1);
  });

  it("rejects an impossible calendar date in the as-of argument", async () => {
    const { result, output } = await check([], { asOf: "2026-02-30T00:00:00Z" });
    expect(result.status).toBe(1);
    expect(output.valid).toBe(false);
    expect(output.error).toContain("--as-of");
  });

  it.each([[null], [[]], ["not a ledger"]])("reports an invalid root as a structured failure: %j", async (rawLedger) => {
    const { result, output } = await check([], { rawLedger });
    expect(result.status).toBe(1);
    expect(output.valid).toBe(false);
    expect(output.ready).toBe(false);
    expect(output.error).toContain("ledger must be an object");
  });

  it.each([
    { operators: null, manufactured_activity_events: [] },
    { operators: {}, manufactured_activity_events: [] },
    { operators: [], manufactured_activity_events: null },
    { operators: [], manufactured_activity_events: {} },
  ])("does not silently treat malformed evidence collections as empty: %j", async (collections) => {
    const { output } = await check([], { rawLedger: { schema_version: 2, study_started_at: null, ...collections } });
    expect(output.valid).toBe(false);
    expect(output.task_outcomes.state).toBe("invalid_evidence");
    expect(output.activation_relative_retention.state).toBe("invalid_evidence");
    expect(output.errors.join(" ")).toContain("must be an array");
  });
});
