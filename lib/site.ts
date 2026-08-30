export const SITE_ORIGIN = "https://artifactories.com";
export const APP_VERSION = "0.3.0";
export const AGENT_PROTOCOL_VERSION = "0.5.0";

export function resolveMetadataBase(configured = process.env.PUBLIC_BASE_URL): URL {
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // A malformed deployment override must not leak a localhost canonical.
    }
  }
  return new URL(SITE_ORIGIN);
}
