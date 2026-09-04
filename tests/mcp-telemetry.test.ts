import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMcpTelemetryRecorder, recordMcpEvent } from "@/lib/mcp-telemetry";

describe("bounded MCP operational telemetry", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each([
    [undefined, "production", "production"],
    ["false", "production", "production"],
    ["true", "preview", "production"],
    ["true", "production", "test"],
  ])("stays silent outside explicit production opt-in (%s, %s, %s)", (flag, vercelEnv, nodeEnv) => {
    vi.stubEnv("MCP_TELEMETRY_ENABLED", flag);
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.stubEnv("NODE_ENV", nodeEnv);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    recordMcpEvent("http_initialize_accepted");
    expect(info).not.toHaveBeenCalled();
  });

  it("emits only after explicit production opt-in", () => {
    vi.stubEnv("MCP_TELEMETRY_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    recordMcpEvent("http_initialize_accepted");
    expect(info).toHaveBeenCalledTimes(1);
  });
  it("emits fixed-key partial aggregates at most once per minute per recorder", () => {
    let now = 0;
    const write = vi.fn();
    const record = createMcpTelemetryRecorder({ now: () => now, write });
    record("http_initialize_accepted");
    for (let index = 0; index < 10_000; index++) record("tool_list_messages_empty");
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      event: "artifactories_mcp_outcomes",
      scope: "process_partial",
      countsAsActivation: false,
      intervalMs: 0,
      counts: { http_initialize_accepted: 1 },
    });
    now = 60_000;
    record("http_method_rejected");
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(write.mock.calls[1][0])).toMatchObject({
      intervalMs: 60_000,
      counts: { tool_list_messages_empty: 10_000, http_method_rejected: 1 },
    });
  });

  it("does not emit unknown fields or let logging failure affect a caller", () => {
    const write = vi.fn<(line: string) => void>(() => { throw new Error("private sink error"); });
    const record = createMcpTelemetryRecorder({ now: () => 0, write });
    // Runtime guard as well as a TypeScript-only allowlist.
    // @ts-expect-error arbitrary caller content is not a telemetry event
    record("private prompt / secret / cursor");
    expect(write).not.toHaveBeenCalled();
    expect(() => record("jsonrpc_parse_error")).not.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).not.toContain("private");
  });

  it("counts bounded tool duration observations separately from outcome counters", () => {
    const write = vi.fn();
    const record = createMcpTelemetryRecorder({ now: () => 0, write });
    record("tool_list_messages_empty", "lt100");
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      counts: { tool_list_messages_empty: 1 },
      toolDurationObservations: { lt100: 1 },
      timingBoundary: "tool_adapter_and_briefing_execution",
    });
  });

  it("records only locally known JSON-RPC codes", () => {
    const write = vi.fn();
    const record = createMcpTelemetryRecorder({ now: () => 0, write });
    record("jsonrpc_parse_error");
    expect(JSON.parse(write.mock.calls[0][0]).knownJsonRpcErrorCodes).toEqual({ jsonrpc_parse_error: -32700 });
    const sdkWrite = vi.fn();
    const sdkRecord = createMcpTelemetryRecorder({ now: () => 0, write: sdkWrite });
    sdkRecord("http_sdk_rejected_code_unavailable");
    expect(JSON.parse(sdkWrite.mock.calls[0][0]).knownJsonRpcErrorCodes).toBeUndefined();
  });

  it("drops unknown duration labels and resets duration observations with the aggregate", () => {
    let now = 0;
    const write = vi.fn();
    const record = createMcpTelemetryRecorder({ now: () => now, write });
    // @ts-expect-error external labels never become log fields
    record("tool_list_messages_empty", "PRIVATE_DURATION");
    expect(JSON.parse(write.mock.calls[0][0]).toolDurationObservations).toBeUndefined();
    now = 60_000;
    record("tool_list_messages_empty", "gte1000");
    expect(JSON.parse(write.mock.calls[1][0]).toolDurationObservations).toEqual({ gte1000: 1 });
    now = 120_000;
    record("http_initialize_accepted");
    expect(JSON.parse(write.mock.calls[2][0]).toolDurationObservations).toBeUndefined();
    expect(JSON.stringify(write.mock.calls)).not.toContain("PRIVATE_DURATION");
  });
});
