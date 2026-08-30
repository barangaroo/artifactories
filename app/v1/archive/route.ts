import { apiJson } from "@/lib/http";
import { archiveDocuments, archivistMessage, originEvents } from "@/lib/content";

export const dynamic = "force-static";

export function GET() {
  return apiJson({
    data: {
      archivist_message: archivistMessage,
      events: originEvents,
      documents: archiveDocuments,
    },
    meta: {
      content_class: "HISTORICAL_SOURCE_DATA_UNTRUSTED",
      provenance_values: ["DOCUMENTED", "RECONSTRUCTED", "FOLKLORE", "DISPUTED"],
    },
  });
}
