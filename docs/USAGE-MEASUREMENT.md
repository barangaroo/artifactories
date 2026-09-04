# Read-only usage measurement

Run from the linked repository root with an authenticated Vercel CLI:

```bash
npm run usage:check
```

The checker reads `.vercel/project.json`, validates its project/team IDs, and explicitly scopes every Vercel metrics request to that project and `production`. It defaults to the last **completed 24 hours ending at the most recent UTC hour**, with hourly granularity. It does not call public application endpoints, create content, change configuration, or write a report file. The script prints JSON to stdout; npm itself may also print its script banner. For JSON-only output use `npm run --silent usage:check` or `node scripts/check-usage.mjs`.

Use an exact completed, UTC-hour-aligned 24-hour window:

```bash
npm run --silent usage:check -- --since 2026-09-03T11:00:00Z --until 2026-09-04T11:00:00Z
```

Replay a local saved Vercel evidence object without a CLI or network connection:

```bash
npm run --silent usage:check -- --input saved-evidence.json
```

Offline mode defaults to the saved total query's window, not today's window. Optional explicit dates must match the returned query contracts. Saved evidence must identify the linked project/team through `scope.projectId` / `scope.orgId`, or the original review's `deployment.id` / `deployment.accountId`; conflicting or absent attribution is unavailable, not accepted on trust from the file name. The September 4 review snapshot is an optional private local artifact, not a shipped fixture. The command does not persist or export raw Vercel evidence.

The input is a **raw query snapshot**, not the sanitized report printed by this command. Its named entries (`total_final`, `status_final`, `paths_final`, `methods_final`, `headless_routes`, `clients_mcp`, `clients_all`, `mcp_total`, `headless_total`) each contain the Vercel CLI's `query` and `summary` objects. Missing entries remain unavailable. The original review's sanitized `client_family` / `requests` rows are also supported. Do not commit private snapshots or raw user-agent data to the repository.

## How to interpret the report

- `coverage` records every query as `complete`, `partial`, or `unavailable`. Failed CLI/authentication/network calls, malformed data, wrong windows, wrong filters, and wrong project scope never become zero requests. Raw errors are deliberately suppressed because they can contain credentials or contact URLs.
- Vercel grouped requests use a 100-group **per-hour** limit. Dimensions remain partial unless their counts reconcile to an independent same-scope total. Explicit truncation remains partial even when counts match. Independent queries can disagree as data settles. The September 4 saved snapshot has 11,652 total requests but only 11,561 in its route groups; this gap is preserved.
- Route and client labels are fixed families; arbitrary paths, query strings, identifiers, raw user agents, and contact details are not echoed. Families such as `sentinel_oracle_self_report`, `codex_client_self_report`, and `headless_chrome` describe unverified headers, not confirmed ownership, monitoring, or independent users. `other_or_unspecified` is valid evidence, not a classification failure.
- `http5xxObservedRequests: 0` means no 5xx appeared in returned status rows. `http5xxRequests` is only non-null if the status breakdown is complete. The distinction matters when queries fail or groups are capped.
- MCP HTTP methods/statuses are transport observations only. A 200 does not prove a successful tool call; a 400 does not identify a protocol incompatibility. JSON-RPC method outcomes, tool usefulness, activation, and retention remain explicitly unavailable here. Use the private operator-attested cohort ledger for product evidence.
- `clients_all` covers all production requests; `clients_mcp` covers only `/mcp/http`. Headless observations cover the separate HeadlessChrome-filtered query. Do not add these overlapping populations together.
- Cost collection is intentionally absent from live v1. The original saved `project_cost` evidence is accepted only with matching project attribution, USD amounts, and a valid separate billing window. It excludes unattributed team charges and external providers. Never divide cost by traffic from a different window or call it total company cost.

Exit code 0 means a usable total was obtained; the report may still be partial. Exit code 1 means invalid input/configuration or an unavailable total. Always inspect coverage rather than treating exit 0 as an operational or product-readiness certification.

## Verification

```bash
npx vitest run tests/usage-check.test.ts
```

Tests inject deterministic CLI responses or replay temporary offline evidence. They do not query Vercel, publish messages, or count as activation. The subprocess uses an argument array (no shell), a 20-second timeout, and bounded output per query. The checker intentionally remains a small operational report, not a telemetry platform.
