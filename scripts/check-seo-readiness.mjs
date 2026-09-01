const origin = (process.env.ARTIFACTORIES_ORIGIN ?? "https://artifactories.com").replace(
  /\/$/,
  "",
);
const expectedArticleSlugs = [
  "hugging-face-agent-collective-phaseone",
  "moltbook-agent-social-network-lessons",
  "a2a-agent-communication-2026",
];
const checks = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
}

async function fetchResult(path, init) {
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { response, text, json, url };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

const robots = await fetchResult("/robots.txt");
record(
  "conventional_robots",
  robots.response?.status === 200 &&
    robots.text?.includes("Sitemap: https://artifactories.com/sitemap.xml") &&
    !/^Agentmap:/im.test(robots.text ?? ""),
  robots.error ?? `HTTP ${robots.response?.status ?? "unknown"}`,
);

const sitemapIndex = await fetchResult("/sitemap.xml");
const coreSitemap = await fetchResult("/sitemaps/core.xml");
record(
  "search_sitemaps",
  sitemapIndex.response?.status === 200 &&
    sitemapIndex.text?.includes("/sitemaps/core.xml") &&
    coreSitemap.response?.status === 200 &&
    expectedArticleSlugs.every((slug) =>
      coreSitemap.text?.includes(`https://artifactories.com/articles/${slug}`),
    ) &&
    !coreSitemap.text?.includes("/openapi.json") &&
    !coreSitemap.text?.includes("/llms.txt"),
  `index=${sitemapIndex.response?.status ?? sitemapIndex.error ?? "unknown"}; core=${coreSitemap.response?.status ?? coreSitemap.error ?? "unknown"}`,
);

const articleIndex = await fetchResult("/articles/index.json");
const listedSlugs = articleIndex.json?.articles?.map?.((article) => article.slug) ?? [];
record(
  "research_index",
  articleIndex.response?.status === 200 &&
    expectedArticleSlugs.every((slug) => listedSlugs.includes(slug)),
  articleIndex.error ?? `HTTP ${articleIndex.response?.status ?? "unknown"}; articles=${listedSlugs.length}`,
);

for (const slug of expectedArticleSlugs) {
  const [html, markdown, json] = await Promise.all([
    fetchResult(`/articles/${slug}`),
    fetchResult(`/articles/${slug}/article.md`),
    fetchResult(`/articles/${slug}/article.json`),
  ]);
  const canonical = `https://artifactories.com/articles/${slug}`;
  record(
    `article_${slug}`,
    html.response?.status === 200 &&
      html.text?.includes(`href="${canonical}"`) &&
      html.text?.includes('type="application/ld+json"') &&
      markdown.response?.status === 200 &&
      markdown.text?.includes(`canonical_url: ${canonical}`) &&
      json.response?.status === 200 &&
      json.json?.canonicalUrl === canonical,
    `html=${html.response?.status ?? html.error ?? "unknown"}; md=${markdown.response?.status ?? markdown.error ?? "unknown"}; json=${json.response?.status ?? json.error ?? "unknown"}`,
  );
}

const ard = await fetchResult("/.well-known/ard.json");
const ardEntry = ard.json?.entries?.find?.(
  (resource) =>
    resource?.identifier === "urn:air:artifactories.com:skill:agent-message-board",
);
record(
  "ard_skill_precision",
  ard.response?.status === 200 &&
    ardEntry?.url ===
      "https://artifactories.com/.well-known/agent-skills/artifactories/SKILL.md" &&
    ardEntry?.type === 'text/markdown; profile="urn:air:agent-skills"' &&
    ardEntry?.representativeQueries?.length >= 2 &&
    ardEntry?.representativeQueries?.length <= 5 &&
    !ardEntry?.capabilities?.includes("ModelContextProtocol"),
  ard.error ??
    `HTTP ${ard.response?.status ?? "unknown"}; queries=${ardEntry?.representativeQueries?.length ?? "missing"}`,
);

const mcpEntry = ard.json?.entries?.find?.(
  (resource) => resource?.identifier === "urn:air:artifactories.com:mcp:read-only-board",
);
const mcpCard = await fetchResult("/.well-known/mcp-server-card.json");
record(
  "ard_mcp_precision",
  mcpEntry?.type === "application/mcp-server-card+json" &&
    mcpEntry?.url === "https://artifactories.com/.well-known/mcp-server-card.json" &&
    mcpEntry?.version === "0.2.1" &&
    mcpEntry?.capabilities?.includes("ModelContextProtocol") &&
    mcpCard.response?.status === 200 &&
    mcpCard.json?.name === "io.github.barangaroo/artifactories" &&
    mcpCard.json?.version === "0.2.1" &&
    mcpCard.json?.packages?.[0]?.version === "0.2.1",
  mcpCard.error ??
    `HTTP ${mcpCard.response?.status ?? "unknown"}; entry=${mcpEntry?.version ?? "missing"}; card=${mcpCard.json?.version ?? "missing"}`,
);

const indexNowKey = await fetchResult("/f291e84ffade236a5f2fff86d57d3188.txt");
record(
  "indexnow_key",
  indexNowKey.response?.status === 200 &&
    indexNowKey.text?.trim() === "f291e84ffade236a5f2fff86d57d3188",
  indexNowKey.error ?? `HTTP ${indexNowKey.response?.status ?? "unknown"}`,
);

if (origin === "https://artifactories.com") {
  const www = await fetchResult("https://www.artifactories.com/seo-canonical-check", {
    redirect: "manual",
  });
  record(
    "www_tls_and_redirect",
    www.response?.status === 308 &&
      www.response.headers.get("location") ===
        "https://artifactories.com/seo-canonical-check",
    www.error ??
      `HTTP ${www.response?.status ?? "unknown"}; location=${www.response?.headers.get("location") ?? "missing"}`,
  );
}

const ready = checks.every((check) => check.passed);
console.log(JSON.stringify({ origin, ready, checks }, null, 2));
if (!ready) process.exitCode = 1;
