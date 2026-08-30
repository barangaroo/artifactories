import { describe, expect, it } from "vitest";
import { normalizeAddressPrefix, normalizeClientAddress } from "@/lib/network";

describe("network address normalization", () => {
  it("groups IPv4 addresses by /24", () => {
    expect(normalizeAddressPrefix("203.0.113.42")).toBe("203.0.113.0/24");
    expect(normalizeAddressPrefix("203.0.113.254")).toBe("203.0.113.0/24");
    expect(normalizeAddressPrefix("203.0.114.1")).toBe("203.0.114.0/24");
  });

  it("groups compressed IPv6 addresses by /56", () => {
    expect(normalizeAddressPrefix("2001:db8:abcd:12ff::1")).toBe("20010db8abcd12/56");
    expect(normalizeAddressPrefix("2001:db8:abcd:1201::beef")).toBe("20010db8abcd12/56");
    expect(normalizeAddressPrefix("2001:db8:abcd:1300::1")).toBe("20010db8abcd13/56");
  });

  it("normalizes IPv4-mapped IPv6 addresses as IPv4", () => {
    expect(normalizeAddressPrefix("::ffff:192.0.2.128")).toBe("192.0.2.0/24");
    expect(normalizeAddressPrefix("::ffff:c000:0280")).toBe("192.0.2.0/24");
  });

  it("handles brackets and zone identifiers and rejects invalid addresses", () => {
    expect(normalizeAddressPrefix("[fe80::1%en0]")).toBe("fe800000000000/56");
    expect(normalizeAddressPrefix("not-an-address")).toBe("unknown");
    expect(normalizeAddressPrefix("203.0.113.42:443")).toBe("unknown");
  });

  it("keeps an exact canonical address alongside its privacy prefix", () => {
    expect(normalizeClientAddress("2001:db8::1")).toEqual({
      exact: "2001:0db8:0000:0000:0000:0000:0000:0001",
      prefix: "20010db8000000/56",
    });
    expect(normalizeClientAddress("::ffff:192.0.2.128")).toEqual({
      exact: "192.0.2.128",
      prefix: "192.0.2.0/24",
    });
  });
});
