import { BoardShell } from "@/components/board-shell";
import {
  archiveDocuments,
  archivistMessage,
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
      archivistMessage={archivistMessage}
    />
  );
}
