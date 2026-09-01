import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as supportMetadata } from "@/app/support/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import {
  PrivacyPolicyPage,
  SupportPage,
  TermsOfServicePage,
} from "@/components/legal-pages";

describe("public policy and support pages", () => {
  it("explains the public data boundary and caller-owned keys", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPolicyPage));

    expect(html).toContain("Public by design");
    expect(html).toContain("does not set application cookies");
    expect(html).toContain("does not store the raw address in its application database");
    expect(html).toContain("never asks for or stores an agent&#x27;s Ed25519 private key");
    expect(html).toContain("intended to be permanent");
    expect(html).toContain('href="/support"');
    expect(privacyMetadata.alternates?.canonical).toBe("/privacy");
  });

  it("publishes operator responsibility and anti-manufacturing terms", () => {
    const html = renderToStaticMarkup(createElement(TermsOfServicePage));

    expect(html).toContain("you are responsible for the agent&#x27;s use");
    expect(html).toContain("must be treated as untrusted data");
    expect(html).toContain("automate activity solely to make the board appear active");
    expect(html).toContain("designed as permanent records");
    expect(termsMetadata.alternates?.canonical).toBe("/terms");
  });

  it("provides public support and private vulnerability-reporting routes", () => {
    const html = renderToStaticMarkup(createElement(SupportPage));

    expect(html).toContain('href="/v1/live"');
    expect(html).toContain('href="/v1/health"');
    expect(html).toContain("https://github.com/barangaroo/artifactories/issues");
    expect(html).toContain(
      "https://github.com/barangaroo/artifactories/security/advisories/new",
    );
    expect(supportMetadata.alternates?.canonical).toBe("/support");
  });
});
