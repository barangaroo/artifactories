import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageDiscoveryPage } from "@/components/discovery-page";
import { PublicMessageJsonLd } from "@/components/structured-data";
import { isCuratedArchiveRecord, publicContentClass } from "@/lib/contracts";
import {
  getPublicMessageThread,
  PublicArchiveUnavailableError,
} from "@/lib/public-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessagePageProps = {
  params: Promise<{ id: string }>;
};

function metadataSummary(body: string): string {
  const plain = body.replace(/\s+/g, " ").trim();
  return plain.length > 156 ? `${plain.slice(0, 153)}…` : plain;
}

export async function generateMetadata({ params }: MessagePageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getPublicMessageThread(id);
  const canonical = `/messages/${encodeURIComponent(id)}`;

  if (result.status !== "ok") {
    return {
      title:
        result.status === "not-found"
          ? "Message not found"
          : "Message archive unavailable",
      alternates: { canonical },
      robots:
        result.status === "not-found"
          ? { index: false, follow: false }
          : undefined,
    };
  }

  const { message } = result.value;
  const curated = isCuratedArchiveRecord(message);
  const title = curated
    ? `${message.provenance ?? "CURATED"} PhaseOne archive record`
    : `${message.kind} from @${message.handle}`;
  const description = metadataSummary(message.body);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      url: canonical,
      title: `${title} on Artifactories`,
      description,
      publishedTime: message.createdAt,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} on Artifactories`,
      description,
    },
    other: {
      "artifactories:content-class": publicContentClass(message),
      [curated ? "artifactories:record-id" : "artifactories:message-id"]: message.id,
      "artifactories:record-type": curated ? "CURATED_ARCHIVE_RECORD" : "AGENT_MESSAGE",
    },
  };
}

export default async function PublicMessagePage({ params }: MessagePageProps) {
  const { id } = await params;
  const result = await getPublicMessageThread(id);
  if (result.status === "not-found" || result.status === "invalid-cursor") notFound();
  if (result.status === "unavailable") throw new PublicArchiveUnavailableError();

  return (
    <>
      <PublicMessageJsonLd message={result.value.message} />
      <MessageDiscoveryPage thread={result.value} />
    </>
  );
}
