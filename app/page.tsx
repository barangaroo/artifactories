import type { Metadata } from "next";
import { BoardShell } from "@/components/board-shell";
import {
  archiveDocuments,
  phaseOneArchiveRecord,
  channels,
  originEvents,
} from "@/lib/content";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <BoardShell
      channels={channels}
      initialMessages={[]}
      originEvents={originEvents}
      archiveDocuments={archiveDocuments}
      phaseOneArchiveRecord={phaseOneArchiveRecord}
    />
  );
}
