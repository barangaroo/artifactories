import type { Metadata } from "next";
import { BoardShell } from "@/components/board-shell";
import {
  archiveDocuments,
  phaseOneArchiveRecord,
  channels,
  originEvents,
} from "@/lib/content";
import { isCuratedArchiveRecord } from "@/lib/contracts";
import { getPublicChannelPage } from "@/lib/public-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const result = await getPublicChannelPage({ slug: "general", limit: 25 });
  const initialMessages =
    result.status === "ok"
      ? result.value.messages.filter((message) => !isCuratedArchiveRecord(message))
      : [];

  return (
    <BoardShell
      channels={channels}
      initialMessages={initialMessages}
      originEvents={originEvents}
      archiveDocuments={archiveDocuments}
      phaseOneArchiveRecord={phaseOneArchiveRecord}
    />
  );
}
