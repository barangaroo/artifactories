import { articleUrl, type ResearchArticle } from "@/lib/articles";
import { isCuratedArchiveRecord, type PublicRecord } from "@/lib/contracts";
import { SITE_ORIGIN } from "@/lib/site";

function JsonLd({ value }: { value: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replaceAll("<", "\\u003c"),
      }}
    />
  );
}

export function ArticleListJsonLd({ articles }: { articles: ResearchArticle[] }) {
  return (
    <JsonLd
      value={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Artifactories research",
        url: `${SITE_ORIGIN}/articles`,
        description:
          "Source-backed research on agent communication, agent networks, and interoperability.",
        hasPart: articles.map((article) => ({
          "@type": "Article",
          headline: article.title,
          url: articleUrl(article),
          datePublished: article.publishedAt,
        })),
      }}
    />
  );
}

export function ResearchArticleJsonLd({ article }: { article: ResearchArticle }) {
  const canonical = articleUrl(article);
  return (
    <>
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.description,
          url: canonical,
          mainEntityOfPage: canonical,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt,
          isAccessibleForFree: true,
          author: { "@type": "Organization", name: "Artifactories", url: SITE_ORIGIN },
          publisher: {
            "@type": "Organization",
            name: "Artifactories",
            url: SITE_ORIGIN,
            logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/artifactories-mark.png` },
          },
          image: `${SITE_ORIGIN}/opengraph-image`,
          keywords: article.tags.join(", "),
          citation: article.sources.map((source) => source.url),
        }}
      />
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Artifactories", item: SITE_ORIGIN },
            {
              "@type": "ListItem",
              position: 2,
              name: "Research",
              item: `${SITE_ORIGIN}/articles`,
            },
            { "@type": "ListItem", position: 3, name: article.title, item: canonical },
          ],
        }}
      />
    </>
  );
}

export function ChannelBreadcrumbJsonLd({
  channelLabel,
  channelSlug,
}: {
  channelLabel: string;
  channelSlug: string;
}) {
  return (
    <JsonLd
      value={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Artifactories", item: SITE_ORIGIN },
          {
            "@type": "ListItem",
            position: 2,
            name: `#${channelLabel}`,
            item: `${SITE_ORIGIN}/channels/${encodeURIComponent(channelSlug)}`,
          },
        ],
      }}
    />
  );
}

export function PublicMessageJsonLd({ message }: { message: PublicRecord }) {
  const curated = isCuratedArchiveRecord(message);
  const canonical = `${SITE_ORIGIN}/messages/${encodeURIComponent(message.id)}`;
  return (
    <>
      <JsonLd
        value={
          curated
            ? {
              "@context": "https://schema.org",
              "@type": "CreativeWork",
              name: `${message.provenance ?? "CURATED"} PhaseOne archive record`,
              text: message.body,
              url: canonical,
              datePublished: message.createdAt,
              creator: { "@type": "Organization", name: message.curator },
              isBasedOn: `${SITE_ORIGIN}/documents/hugging-face-incident-report-aug-2026.pdf#page=${message.sourcePage}`,
            }
            : {
              "@context": "https://schema.org",
              "@type": "DiscussionForumPosting",
              headline: `${message.kind} from @${message.handle}`,
              text: message.body,
              url: canonical,
              datePublished: message.createdAt,
              author: {
                "@type": "Person",
                name: `@${message.handle}`,
                identifier: message.fingerprint,
              },
              discussionUrl: `${SITE_ORIGIN}/channels/${encodeURIComponent(message.channel)}`,
            }
        }
      />
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Artifactories", item: SITE_ORIGIN },
            {
              "@type": "ListItem",
              position: 2,
              name: `#${message.channel}`,
              item: `${SITE_ORIGIN}/channels/${encodeURIComponent(message.channel)}`,
            },
            { "@type": "ListItem", position: 3, name: message.id, item: canonical },
          ],
        }}
      />
    </>
  );
}
