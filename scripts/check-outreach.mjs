#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const OPERATOR_LOGIN = "barangaroo";
const FOLLOWUP_AFTER = "2026-09-07";

const CHANNELS = [
  {
    key: "artifactories",
    name: "Artifactories study thread",
    url: "https://github.com/barangaroo/artifactories/discussions/1",
    followupAllowed: true,
  },
  {
    key: "agentOps",
    name: "AgentOps",
    url: "https://github.com/AgentOps-AI/agentops/discussions/1443",
    followupAllowed: true,
  },
  {
    key: "autoGen",
    name: "AutoGen",
    url: "https://github.com/microsoft/autogen/discussions/8130",
    followupAllowed: true,
  },
  {
    key: "agentCommunity",
    name: "Agent Community",
    url: "https://github.com/orgs/agentcommunity/discussions/8",
    followupAllowed: true,
  },
  {
    key: "googleAdk",
    name: "Google ADK",
    url: "https://github.com/google/adk-python/discussions/6967",
    followupAllowed: true,
  },
  {
    key: "agentFramework",
    name: "Microsoft Agent Framework",
    url: "https://github.com/microsoft/agent-framework/discussions/7970",
    followupAllowed: true,
  },
];

const QUERY = `query {
  artifactories: repository(owner: "barangaroo", name: "artifactories") {
    discussion(number: 1) { url updatedAt upvoteCount comments(first: 100) { nodes { author { login } createdAt url } } }
  }
  agentOps: repository(owner: "AgentOps-AI", name: "agentops") {
    discussion(number: 1443) { url updatedAt upvoteCount comments(first: 100) { nodes { author { login } createdAt url } } }
  }
  autoGen: repository(owner: "microsoft", name: "autogen") {
    discussion(number: 8130) { url updatedAt upvoteCount comments(first: 100) { nodes { author { login } createdAt url } } }
  }
  agentCommunity: repository(owner: "agentcommunity", name: ".github") {
    discussion(number: 8) { url updatedAt upvoteCount comments(first: 100) { nodes { author { login } createdAt url } } }
  }
  googleAdk: repository(owner: "google", name: "adk-python") {
    discussion(number: 6967) { url updatedAt upvoteCount comments(first: 100) { nodes { author { login } createdAt url } } }
  }
  agentFramework: repository(owner: "microsoft", name: "agent-framework") {
    discussion(number: 7970) { url updatedAt upvoteCount comments(first: 100) { nodes { author { login } createdAt url } } }
  }
  elizaPermission: node(id: "DC_kwDOMT5cIs4BFePU") {
    ... on DiscussionComment {
      url
      updatedAt
      replies(first: 100) { nodes { author { login } createdAt url } }
    }
  }
}`;

function independentResponses(nodes = []) {
  return nodes.filter(({ author }) => {
    const login = author?.login;
    return login && login !== OPERATOR_LOGIN && !login.endsWith("[bot]");
  });
}

export function buildOutreachReport(data, checkedAt = new Date()) {
  const checkedDate = checkedAt.toISOString().slice(0, 10);
  const channels = CHANNELS.map((channel) => {
    const discussion = data[channel.key]?.discussion;
    if (!discussion) {
      return { ...channel, status: "missing", independentResponses: [] };
    }

    const responses = independentResponses(discussion.comments?.nodes);
    const followupDue =
      channel.followupAllowed && responses.length === 0 && checkedDate >= FOLLOWUP_AFTER;

    return {
      name: channel.name,
      url: discussion.url ?? channel.url,
      status: responses.length > 0 ? "responded" : followupDue ? "followup_due" : "waiting",
      independentResponseCount: responses.length,
      independentResponders: responses.map(({ author }) => author.login),
      followupAllowed: channel.followupAllowed,
      followupAfter: FOLLOWUP_AFTER,
      upvoteCountIgnored: discussion.upvoteCount ?? 0,
      updatedAt: discussion.updatedAt,
    };
  });

  const elizaReplies = independentResponses(data.elizaPermission?.replies?.nodes);
  channels.push({
    name: "elizaOS Fleet HQ permission request",
    url:
      data.elizaPermission?.url ??
      "https://github.com/elizaOS/eliza/discussions/18309#discussioncomment-18211796",
    status: elizaReplies.length > 0 ? "responded" : "permission_hold",
    independentResponseCount: elizaReplies.length,
    independentResponders: elizaReplies.map(({ author }) => author.login),
    followupAllowed: false,
    followupAfter: null,
    upvoteCountIgnored: 0,
    updatedAt: data.elizaPermission?.updatedAt,
  });

  return {
    checkedAt: checkedAt.toISOString(),
    metrics: {
      channelsChecked: channels.length,
      channelsWithIndependentResponses: channels.filter(
        ({ independentResponseCount }) => independentResponseCount > 0,
      ).length,
      independentResponders: [
        ...new Set(channels.flatMap(({ independentResponders }) => independentResponders)),
      ].length,
      followupsDue: channels.filter(({ status }) => status === "followup_due").length,
      permissionHolds: channels.filter(({ status }) => status === "permission_hold").length,
    },
    channels,
  };
}

function fetchOutreachData() {
  const output = execFileSync("gh", ["api", "graphql", "-f", `query=${QUERY}`], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const response = JSON.parse(output);
  if (response.errors?.length) throw new Error(JSON.stringify(response.errors));
  return response.data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(buildOutreachReport(fetchOutreachData()), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          error: "OUTREACH_CHECK_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
