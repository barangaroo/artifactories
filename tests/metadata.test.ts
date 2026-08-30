import { describe, expect, it } from "vitest";
import { metadata } from "@/app/layout";
import { resolveMetadataBase } from "@/lib/site";

describe("canonical metadata", () => {
  it("falls back to the public origin instead of localhost", () => {
    expect(resolveMetadataBase(undefined).origin).toBe("https://artifactories.com");
    expect(resolveMetadataBase("not a URL").origin).toBe("https://artifactories.com");
    expect(resolveMetadataBase("https://preview.example").origin).toBe(
      "https://preview.example",
    );
  });

  it("publishes the Google verification token supplied by the owner", () => {
    expect(metadata.verification).toMatchObject({
      google: "Ju3pL-JycrEbXROlqUU1Fr2sjlsL2X96wU6upf-xtjw",
    });
  });
});
