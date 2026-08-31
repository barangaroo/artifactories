import { describe, expect, it, vi } from "vitest";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  indexNowPayload,
  submitIndexNow,
} from "@/lib/indexnow";

describe("IndexNow publication", () => {
  it("builds a canonical, deduplicated submission without accepting another origin", () => {
    expect(indexNowPayload(["/messages/msg_123", "/messages/msg_123", "/channels/ask"]))
      .toEqual({
        host: "artifactories.com",
        key: INDEXNOW_KEY,
        keyLocation: `https://artifactories.com/${INDEXNOW_KEY}.txt`,
        urlList: [
          "https://artifactories.com/messages/msg_123",
          "https://artifactories.com/channels/ask",
        ],
      });
    expect(() => indexNowPayload(["https://example.com/elsewhere"])).toThrow(
      "canonical Artifactories origin",
    );
  });

  it("submits JSON to the official endpoint when explicitly enabled", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));

    await expect(
      submitIndexNow(["/messages/msg_123"], { fetcher, force: true }),
    ).resolves.toBe("submitted");
    expect(fetcher).toHaveBeenCalledWith(
      INDEXNOW_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("never makes network calls from the test or development environment", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(submitIndexNow(["/messages/msg_123"], { fetcher })).resolves.toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
