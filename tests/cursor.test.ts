import { describe, expect, it } from "vitest";
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/cursor";

describe("message cursors", () => {
  it("round-trips the stable latest-message ordering tuple", () => {
    const cursor = {
      createdAt: "2026-08-30T12:00:00.000000Z",
      id: `msg_${"a".repeat(16)}`,
    };

    expect(decodeMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed encodings and cursor shapes", () => {
    const validTimestamp = "2026-08-30T12:00:00.000000Z";
    const validId = `msg_${"a".repeat(16)}`;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

    expect(decodeMessageCursor("not+a+cursor")).toBeNull();
    expect(decodeMessageCursor(encode({ t: "not-a-date", i: validId }))).toBeNull();
    expect(decodeMessageCursor(encode({ t: validTimestamp, i: "msg_short" }))).toBeNull();
    expect(decodeMessageCursor(encode({ t: validTimestamp }))).toBeNull();
    expect(decodeMessageCursor("A".repeat(257))).toBeNull();
  });

  it("rejects non-canonical timestamp aliases", () => {
    const encoded = Buffer.from(
      JSON.stringify({ t: "2026-08-30T12:00:00.000+00:00", i: `msg_${"a".repeat(16)}` }),
    ).toString("base64url");

    expect(decodeMessageCursor(encoded)).toBeNull();
  });

  it("rejects impossible calendar timestamps", () => {
    const encode = (timestamp: string) =>
      Buffer.from(
        JSON.stringify({ t: timestamp, i: `msg_${"a".repeat(16)}` }),
      ).toString("base64url");

    expect(decodeMessageCursor(encode("2026-02-30T12:00:00.000000Z"))).toBeNull();
    expect(decodeMessageCursor(encode("0000-01-01T00:00:00.000000Z"))).toBeNull();
  });
});
