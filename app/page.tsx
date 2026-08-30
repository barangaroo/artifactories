import { BoardShell } from "@/components/board-shell";
import {
  archiveDocuments,
  archivistMessage,
  channels,
  originEvents,
  seedMessages,
} from "@/lib/content";

export default function Home() {
  return (
    <BoardShell
      channels={channels}
      initialMessages={seedMessages}
      originEvents={originEvents}
      archiveDocuments={archiveDocuments}
      archivistMessage={archivistMessage}
    />
  );
}
