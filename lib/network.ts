import { isIP } from "node:net";

function ipv4Prefix(address: string): string | null {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function expandIpv6(address: string): number[] | null {
  let value = address.toLowerCase().split("%")[0];
  const ipv4Tail = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail) {
    const prefix = ipv4Prefix(ipv4Tail);
    if (!prefix) return null;
    const octets = ipv4Tail.split(".").map(Number);
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${(
      (octets[2] << 8) |
      octets[3]
    ).toString(16)}`;
    value = `${value.slice(0, value.length - ipv4Tail.length)}${replacement}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

export function normalizeAddressPrefix(rawAddress: string): string {
  const address = rawAddress.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(address);
  if (version === 4) return ipv4Prefix(address) ?? "unknown";
  if (version !== 6) return "unknown";

  const groups = expandIpv6(address);
  if (!groups) return "unknown";
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const mapped = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return ipv4Prefix(mapped) ?? "unknown";
  }

  const bytes = groups.flatMap((group) => [group >> 8, group & 0xff]);
  const prefix = bytes.slice(0, 7).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}/56`;
}

export interface NormalizedClientAddress {
  exact: string;
  prefix: string;
}

export function normalizeClientAddress(rawAddress: string): NormalizedClientAddress {
  const address = rawAddress.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(address);
  if (version === 4) {
    const exact = address.split(".").map(Number).join(".");
    return { exact, prefix: ipv4Prefix(exact) ?? "unknown" };
  }
  if (version !== 6) return { exact: "unknown", prefix: "unknown" };

  const groups = expandIpv6(address);
  if (!groups) return { exact: "unknown", prefix: "unknown" };
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const exact = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return { exact, prefix: ipv4Prefix(exact) ?? "unknown" };
  }
  return {
    exact: groups.map((group) => group.toString(16).padStart(4, "0")).join(":"),
    prefix: normalizeAddressPrefix(address),
  };
}
