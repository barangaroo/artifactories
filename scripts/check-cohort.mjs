import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ledgerPath = resolve(process.argv[2] ?? "cohort-ledger.json");
const errors = [];
const checkedAt = new Date();
const asOfArgument = process.argv[3];
const asOf = asOfArgument?.startsWith("--as-of=")
  ? new Date(asOfArgument.slice("--as-of=".length))
  : checkedAt;
if ((asOfArgument && (!asOfArgument.startsWith("--as-of=") || !validTimestamp(asOfArgument.slice("--as-of=".length)))) ||
    Number.isNaN(asOf.getTime()) || asOf > checkedAt) {
  console.error(JSON.stringify({ ready: false, valid: false, error: "--as-of must be an ISO timestamp with timezone no later than now" }));
  process.exit(1);
}
let ledger;

try {
  ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)) {
    throw new Error("ledger must be an object");
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ready: false,
        valid: false,
        ledger: ledgerPath,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (!Array.isArray(ledger.operators)) errors.push("operators must be an array");
if (!Array.isArray(ledger.manufactured_activity_events)) errors.push("manufactured_activity_events must be an array");
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
const outcomeAgents = { USEFUL: new Set(), NOT_USEFUL: new Set(), NO_TRIGGER: new Set() };
const usefulOperators = new Set();
const matureAgents = new Set();
const returnedAgents = new Set();
const matureOperators = new Set();
const returnedOperators = new Set();
const sevenDays = 7 * 24 * 60 * 60 * 1_000;

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function genuineEvent(event, allowedTypes) {
  return event &&
    allowedTypes.includes(event.type) &&
    validTimestamp(event.occurred_at) &&
    Date.parse(event.occurred_at) <= asOf.getTime() &&
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
    validTimestamp(operator?.consent_recorded_at) &&
    Date.parse(operator.consent_recorded_at) <= asOf.getTime();
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
    const activatedAt = Date.parse(agent.activation_event.occurred_at);
    if (independent && activatedAt + sevenDays <= asOf.getTime()) {
      matureAgents.add(agentIdentity);
      matureOperators.add(operator.operator_id);
    }
    if (agent.usefulness_event != null) {
      const event = agent.usefulness_event;
      const validOutcome =
        Object.hasOwn(outcomeAgents, event.outcome) &&
        validTimestamp(event.occurred_at) &&
        Date.parse(event.occurred_at) >= activatedAt &&
        Date.parse(event.occurred_at) <= asOf.getTime() &&
        event.genuine_task_attested === true &&
        nonEmpty(event.evidence_ref);
      if (!validOutcome) {
        errors.push(`${agentLabel}: usefulness evidence must be attested USEFUL, NOT_USEFUL, or NO_TRIGGER with an evidence reference at or after activation and no later than as-of`);
      } else if (independent) {
        outcomeAgents[event.outcome].add(agentIdentity);
        if (event.outcome === "USEFUL") usefulOperators.add(operator.operator_id);
      }
    }
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
        Date.parse(agent.return_event.occurred_at) >= activatedAt;
      if (validReturn) {
        const returnedAt = Date.parse(agent.return_event.occurred_at);
        if (studyStartedAt !== undefined && returnedAt >= studyStartedAt + sevenDays) operatorReturned = true;
        if (independent && returnedAt >= activatedAt + sevenDays) {
          returnedAgents.add(agentIdentity);
          returnedOperators.add(operator.operator_id);
        }
      } else {
        errors.push(
          `${agentLabel}: return evidence must be genuine REPLY or OPPORTUNITY at or after activation and no later than as-of`,
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
if (studyStartedAt !== undefined && studyStartedAt > asOf.getTime()) {
  errors.push("study_started_at must be no later than as-of");
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
const assessedAgents = Object.values(outcomeAgents).reduce((count, agents) => count + agents.size, 0);

console.log(
  JSON.stringify(
    {
      ready,
      valid: errors.length === 0,
      ledger: ledgerPath,
      as_of: asOf.toISOString(),
      metrics: {
        qualified_independent_operators: qualifiedOperators,
        genuinely_active_agents: activeAgents,
        notification_cursor_verified_agents: notificationVerifiedAgents,
        week_two_retained_operators: retainedOperators,
        manufactured_activity_events: manufacturedEvents.length,
      },
      task_outcomes: {
        useful_agents: outcomeAgents.USEFUL.size,
        not_useful_agents: outcomeAgents.NOT_USEFUL.size,
        no_trigger_agents: outcomeAgents.NO_TRIGGER.size,
        assessed_agents: assessedAgents,
        useful_operators: usefulOperators.size,
        useful_rate: errors.length === 0 && assessedAgents > 0 ? outcomeAgents.USEFUL.size / assessedAgents : null,
        state: errors.length > 0 ? "invalid_evidence" : assessedAgents > 0 ? "measured" : "not_measurable",
      },
      activation_relative_retention: {
        d7_mature_agents: matureAgents.size,
        d7_or_later_returned_agents: returnedAgents.size,
        d7_mature_operators: matureOperators.size,
        d7_or_later_returned_operators: returnedOperators.size,
        agent_return_rate: errors.length === 0 && matureAgents.size > 0 ? returnedAgents.size / matureAgents.size : null,
        operator_return_rate: errors.length === 0 && matureOperators.size > 0 ? returnedOperators.size / matureOperators.size : null,
        state: errors.length > 0 ? "invalid_evidence" : matureAgents.size > 0 ? "measured" : "not_measurable",
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
