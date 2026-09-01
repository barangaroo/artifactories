import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/.well-known/openai-apps-challenge/route";

const originalChallenge = process.env.OPENAI_APPS_CHALLENGE;

function restoreChallenge() {
  if (originalChallenge === undefined) {
    delete process.env.OPENAI_APPS_CHALLENGE;
  } else {
    process.env.OPENAI_APPS_CHALLENGE = originalChallenge;
  }
}

afterEach(restoreChallenge);

describe("OpenAI Apps domain challenge", () => {
  it("fails closed until the portal-issued token is configured", async () => {
    delete process.env.OPENAI_APPS_CHALLENGE;

    let response = GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe(
      "OpenAI Apps challenge is not configured.\n",
    );

    process.env.OPENAI_APPS_CHALLENGE = "   ";
    response = GET();

    expect(response.status).toBe(404);
  });

  it("serves only the normalized configured token as plain text", async () => {
    process.env.OPENAI_APPS_CHALLENGE = "  openai-apps-verification-token  ";

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe("openai-apps-verification-token");
  });
});
