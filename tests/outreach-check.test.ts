import { describe, expect, it } from "vitest";
// @ts-expect-error The operational checker is an ESM script without a declaration file.
import { buildOutreachReport } from "@/scripts/check-outreach.mjs";

function discussion({
  comments = [],
  upvoteCount = 1,
}: {
  comments?: Array<{ author: { login: string }; createdAt: string; url: string }>;
  upvoteCount?: number;
} = {}) {
  return {
    discussion: {
      url: "https://example.test/discussion",
      updatedAt: "2026-08-31T00:00:00.000Z",
      upvoteCount,
      comments: { nodes: comments },
    },
  };
}

function fixture() {
  return {
    artifactories: discussion(),
    agentOps: discussion(),
    autoGen: discussion(),
    agentCommunity: discussion(),
    googleAdk: discussion(),
    agentFramework: discussion(),
    colonyTemplate: {
      url: "https://github.com/TheColonyCC/colony-agent-template",
      discussionCategories: {
        nodes: [{ name: "Show and tell", slug: "show-and-tell" }],
      },
    },
    elizaPermission: {
      url: "https://example.test/eliza",
      updatedAt: "2026-08-31T00:00:00.000Z",
      replies: { nodes: [] },
    },
  };
}

describe("outreach status checker", () => {
  it("does not treat upvotes or operator comments as independent responses", () => {
    const data = fixture();
    data.agentOps = discussion({
      upvoteCount: 9,
      comments: [
        {
          author: { login: "barangaroo" },
          createdAt: "2026-08-31T00:00:00.000Z",
          url: "https://example.test/self-comment",
        },
      ],
    });

    const report = buildOutreachReport(data, new Date("2026-09-01T00:00:00.000Z"));

    expect(report.metrics.channelsWithIndependentResponses).toBe(0);
    expect(report.metrics.followupsDue).toBe(0);
    expect(report.metrics.fallbacksEligible).toBe(0);
    expect(report.fallbacks[0]).toMatchObject({
      status: "date_hold",
      channelAvailable: true,
    });
    expect(report.channels.find(({ name }: { name: string }) => name === "AgentOps")).toMatchObject({
      status: "waiting",
      independentResponseCount: 0,
      upvoteCountIgnored: 9,
    });
  });

  it("opens follow-ups only after the date gate and preserves the elizaOS hold", () => {
    const report = buildOutreachReport(fixture(), new Date("2026-09-07T00:00:00.000Z"));

    expect(report.metrics.followupsDue).toBe(6);
    expect(report.metrics.permissionHolds).toBe(1);
    expect(report.metrics.fallbacksEligible).toBe(1);
    expect(report.fallbacks[0]).toMatchObject({
      status: "eligible",
      currentIndependentResponders: 0,
    });
    expect(report.channels.at(-1)).toMatchObject({
      status: "permission_hold",
      followupAllowed: false,
    });
  });

  it("counts distinct independent responders without inflating duplicate comments", () => {
    const data = fixture();
    data.googleAdk = discussion({
      comments: [
        {
          author: { login: "real-operator" },
          createdAt: "2026-09-01T00:00:00.000Z",
          url: "https://example.test/one",
        },
        {
          author: { login: "real-operator" },
          createdAt: "2026-09-01T00:01:00.000Z",
          url: "https://example.test/two",
        },
      ],
    });

    const report = buildOutreachReport(data, new Date("2026-09-01T00:00:00.000Z"));

    expect(report.metrics.channelsWithIndependentResponses).toBe(1);
    expect(report.metrics.independentResponders).toBe(1);
    expect(report.channels.find(({ name }: { name: string }) => name === "Google ADK")).toMatchObject({
      status: "responded",
      independentResponseCount: 2,
      independentResponders: ["real-operator", "real-operator"],
    });
  });

  it("does not open the fallback after four distinct independent responders", () => {
    const data = fixture();
    const keys = ["artifactories", "agentOps", "autoGen", "agentCommunity"] as const;
    keys.forEach((key, index) => {
      data[key] = discussion({
        comments: [
          {
            author: { login: `operator-${index}` },
            createdAt: "2026-09-07T00:00:00.000Z",
            url: `https://example.test/operator-${index}`,
          },
        ],
      });
    });

    const report = buildOutreachReport(data, new Date("2026-09-07T00:00:00.000Z"));

    expect(report.metrics.independentResponders).toBe(4);
    expect(report.metrics.fallbacksEligible).toBe(0);
    expect(report.fallbacks[0]).toMatchObject({
      status: "not_needed",
      currentIndependentResponders: 4,
    });
  });

  it("holds the fallback when the designated category disappears", () => {
    const data = fixture();
    data.colonyTemplate.discussionCategories.nodes = [];

    const report = buildOutreachReport(data, new Date("2026-09-07T00:00:00.000Z"));

    expect(report.metrics.fallbacksEligible).toBe(0);
    expect(report.fallbacks[0]).toMatchObject({
      status: "channel_unavailable",
      channelAvailable: false,
    });
  });
});
