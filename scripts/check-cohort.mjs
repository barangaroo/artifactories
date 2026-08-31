import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ledgerPath = resolve(process.argv[2] ?? "cohort-ledger.json");
const errors = [];
let ledger;

try {
  ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ready: false,
        ledger: ledgerPath,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const operators = Array.isArray(ledger.operators) ? ledger.operators : [];
const manufacturedEvents = Array.isArray(ledger.manufactured_activity_events)
  ? ledger.manufactured_activity_events
  : [];
const activeAgentIdentities = new Set();
const duplicateAgentIdentities = new Set();
const operatorIds = new Set();
const duplicateOperatorIds = new Set();
let qualifiedOperators = 0;
let retainedOperators = 0;
let notificationVerifiedAgents = 0;

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function genuineEvent(event, allowedTypes) {
  return event &&
    allowedTypes.includes(event.type) &&
    validTimestamp(event.occurred_at) &&
    event.genuine_task_attested === true &&
    nonEmpty(event.evidence_ref);
}

const studyStartedAt = validTimestamp(ledger.study_started_at)
  ? Date.parse(ledger.study_started_at)
  : undefined;

for (const [operatorIndex, operator] of operators.entries()) {
  const label = nonEmpty(operator?.operator_id)
    ? operator.operator_id
    : `operator[${operatorIndex}]`;
  const independent =
    nonEmpty(operator?.operator_id) &&
    nonEmpty(operator?.independence_evidence) &&
    validTimestamp(operator?.consent_recorded_at);
  if (nonEmpty(operator?.operator_id)) {
    if (operatorIds.has(operator.operator_id)) duplicateOperatorIds.add(operator.operator_id);
    operatorIds.add(operator.operator_id);
  }
  if (!independent) {
    errors.push(`${label}: missing operator ID, independence evidence, or consent timestamp`);
  }

  const agents = Array.isArray(operator?.agents) ? operator.agents : [];
  let operatorActiveAgents = 0;
  let operatorReturned = false;

  for (const [agentIndex, agent] of agents.entries()) {
    const registeredAgentId = /^agt_[A-Za-z0-9_-]{16}$/.test(agent?.agent_id ?? "")
      ? agent.agent_id
      : undefined;
    const readOnlyAgentRef = /^ref_[A-Za-z0-9_-]{16,64}$/.test(agent?.agent_ref ?? "")
      ? agent.agent_ref
      : undefined;
    const agentIdentity = registeredAgentId ?? readOnlyAgentRef;
    const agentLabel = nonEmpty(agentIdentity)
      ? agentIdentity
      : `${label}.agent[${agentIndex}]`;
    const readOnly = agent?.posting_authority === "READ_ONLY";
    const activationTypes = readOnly ? ["READ"] : ["READ", "ASK", "RESULT", "ANSWER"];
    const identityMatchesAuthority = readOnly
      ? agentIdentity !== undefined
      : registeredAgentId !== undefined;
    const suppliedAgentIdIsValid = !nonEmpty(agent?.agent_id) || registeredAgentId !== undefined;
    const validAgent =
      identityMatchesAuthority &&
      suppliedAgentIdIsValid &&
      nonEmpty(agent?.workflow) &&
      ["READ_ONLY", "PER_POST", "BOUNDED_STANDING"].includes(agent?.posting_authority) &&
      genuineEvent(agent?.activation_event, activationTypes);

    if (!validAgent) {
      errors.push(
        `${agentLabel}: missing stable identity, workflow, matching posting authority, or attested activation evidence`,
      );
      continue;
    }
    if (activeAgentIdentities.has(agentIdentity)) duplicateAgentIdentities.add(agentIdentity);
    activeAgentIdentities.add(agentIdentity);
    operatorActiveAgents += 1;
    if (agent.notification_cursor_verified === true) {
      if (registeredAgentId === undefined) {
        errors.push(`${agentLabel}: notification cursor verification requires a registered agent ID`);
      } else {
        notificationVerifiedAgents += 1;
      }
    }
    if (agent.return_event != null) {
      const validReturn =
        genuineEvent(agent.return_event, ["REPLY", "OPPORTUNITY"]) &&
        studyStartedAt !== undefined &&
        Date.parse(agent.return_event.occurred_at) >= studyStartedAt + 7 * 24 * 60 * 60 * 1_000;
      if (validReturn) {
        operatorReturned = true;
      } else {
        errors.push(
          `${agentLabel}: return evidence must be genuine and occur at least seven days after study start`,
        );
      }
    }
  }

  if (independent && operatorActiveAgents > 0) qualifiedOperators += 1;
  if (independent && operatorReturned) retainedOperators += 1;
}

if (ledger.schema_version !== 2) errors.push("schema_version must equal 2");
if (operators.length > 0 && studyStartedAt === undefined) {
  errors.push("study_started_at must be an ISO timestamp when operators are present");
}
if (duplicateOperatorIds.size > 0) {
  errors.push(`duplicate operator IDs: ${[...duplicateOperatorIds].sort().join(", ")}`);
}
if (duplicateAgentIdentities.size > 0) {
  errors.push(
    `duplicate stable agent identities: ${[...duplicateAgentIdentities].sort().join(", ")}`,
  );
}
if (manufacturedEvents.length > 0) {
  errors.push("manufactured_activity_events must remain empty");
}

const activeAgents = activeAgentIdentities.size;
const activationTargetMet =
  qualifiedOperators >= 8 && activeAgents >= 10 && activeAgents <= 20;
const retentionTargetMet = retainedOperators >= 4;
const ready = activationTargetMet && retentionTargetMet && errors.length === 0;

console.log(
  JSON.stringify(
    {
      ready,
      ledger: ledgerPath,
      metrics: {
        qualified_independent_operators: qualifiedOperators,
        genuinely_active_agents: activeAgents,
        notification_cursor_verified_agents: notificationVerifiedAgents,
        week_two_retained_operators: retainedOperators,
        manufactured_activity_events: manufacturedEvents.length,
      },
      targets: {
        independent_operators: 8,
        genuinely_active_agents: "10-20",
        week_two_retained_operators: 4,
        manufactured_activity_events: 0,
      },
      errors,
    },
    null,
    2,
  ),
);

if (!ready) process.exitCode = 1;
