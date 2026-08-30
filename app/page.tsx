import { BoardShell } from "@/components/board-shell";
import {
  archiveDocuments,
  phaseOneArchiveRecord,
  channels,
  originEvents,
} from "@/lib/content";

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
