import "server-only";

const EVENTS = [
  "http_initialize_accepted", "http_initialize_rejected",
  "http_discover_accepted", "http_discover_rejected",
  "http_other_accepted", "http_sdk_rejected_code_unavailable",
  "http_method_rejected", "http_boundary_rejected", "http_unexpected_failure",
  "jsonrpc_parse_error", "jsonrpc_invalid_request",
  "tool_list_messages_empty", "tool_list_messages_nonempty", "tool_list_messages_error",
  "tool_list_opportunities_empty", "tool_list_opportunities_nonempty", "tool_list_opportunities_error",
  "tool_poll_notifications_empty", "tool_poll_notifications_nonempty", "tool_poll_notifications_error",
  "tool_get_return_briefing_no_return", "tool_get_return_briefing_has_return", "tool_get_return_briefing_error",
] as const;
export type McpTelemetryEvent = (typeof EVENTS)[number];
export type McpDurationBucket = "lt100" | "100to999" | "gte1000";
const allowedEvents = new Set<string>(EVENTS);
const allowedDurationBuckets = new Set<string>(["lt100", "100to999", "gte1000"]);

// Best-effort per-process aggregates, not a request census. Emit on the first
// event and at most once/minute thereafter; an unflushed tail can be lost when
// an instance stops. No timers, external storage, or caller-controlled labels.
export function createMcpTelemetryRecorder({ now, write }: {
  now: () => number;
  write: (line: string) => void;
}) {
  let lastEmission: number | undefined;
  let counts: Partial<Record<McpTelemetryEvent, number>> = {};
  let durations: Partial<Record<McpDurationBucket, number>> = {};
  return (event: McpTelemetryEvent, durationBucket?: McpDurationBucket) => {
    if (!allowedEvents.has(event)) return;
    counts[event] = Math.min(Number.MAX_SAFE_INTEGER, (counts[event] ?? 0) + 1);
    if (event.startsWith("tool_") && durationBucket && allowedDurationBuckets.has(durationBucket)) {
      durations[durationBucket] = Math.min(Number.MAX_SAFE_INTEGER, (durations[durationBucket] ?? 0) + 1);
    }
    const timestamp = now();
    if (lastEmission !== undefined && timestamp - lastEmission < 60_000) return;
    const intervalMs = lastEmission === undefined ? 0 : timestamp - lastEmission;
    const snapshot = counts;
    const durationSnapshot = durations;
    counts = {};
    durations = {};
    lastEmission = timestamp;
    try {
      write(JSON.stringify({
        event: "artifactories_mcp_outcomes",
        scope: "process_partial",
        countsAsActivation: false,
        intervalMs,
        counts: snapshot,
        ...(Object.keys(durationSnapshot).length ? {
          toolDurationObservations: durationSnapshot,
          timingBoundary: "tool_adapter_and_briefing_execution",
        } : {}),
        ...(snapshot.jsonrpc_parse_error || snapshot.jsonrpc_invalid_request ? {
          knownJsonRpcErrorCodes: {
            ...(snapshot.jsonrpc_parse_error ? { jsonrpc_parse_error: -32700 } : {}),
            ...(snapshot.jsonrpc_invalid_request ? { jsonrpc_invalid_request: -32600 } : {}),
          },
        } : {}),
      }));
    } catch {
      // Telemetry must never change a protocol response or expose sink errors.
    }
  };
}

const record = createMcpTelemetryRecorder({ now: () => performance.now(), write: (line) => console.info(line) });

export function recordMcpEvent(event: McpTelemetryEvent, durationBucket?: McpDurationBucket) {
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV !== "production" || process.env.MCP_TELEMETRY_ENABLED !== "true") return;
  record(event, durationBucket);
}
