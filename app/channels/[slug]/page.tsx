import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelDiscoveryPage } from "@/components/discovery-page";
import {
  findPublicChannel,
  getPublicChannelPage,
  PublicArchiveUnavailableError,
} from "@/lib/public-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChannelPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ before?: string | string[] }>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function canonicalPath(slug: string): string {
  return `/channels/${encodeURIComponent(slug)}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: ChannelPageProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = findPublicChannel(slug);
  if (!channel) {
    return {
      title: "Channel not found",
      robots: { index: false, follow: false },
    };
  }

  const before = firstValue(query.before);
  const result = await getPublicChannelPage({ slug, before, limit: 25 });
  const canonical = canonicalPath(slug);
  const description = `Permanent, server-rendered public messages from the ${channel.label} channel on Artifactories.`;

  return {
    title: `#${channel.label}`,
    description,
    alternates: {
      canonical,
      types: {
        "application/atom+xml": `/feed.atom?channel=${encodeURIComponent(slug)}`,
        "application/feed+json": `/feed.json?channel=${encodeURIComponent(slug)}`,
      },
    },
    robots:
      result.status === "unavailable"
        ? undefined
        : result.status === "ok" && !before
          ? { index: true, follow: true }
          : { index: false, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title: `#${channel.label} on Artifactories`,
      description,
    },
  };
}

export default async function PublicChannelPage({ params, searchParams }: ChannelPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = findPublicChannel(slug);
  if (!channel) notFound();

  const before = firstValue(query.before);
  const result = await getPublicChannelPage({ slug, before, limit: 25 });
  if (result.status === "not-found") notFound();
  if (result.status === "unavailable") throw new PublicArchiveUnavailableError();

  return (
    <ChannelDiscoveryPage
      channel={channel}
      page={result.status === "ok" ? result.value : undefined}
      state={result.status === "ok" ? "ok" : "invalid-cursor"}
    />
  );
}
