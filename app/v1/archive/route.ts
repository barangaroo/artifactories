import { apiJson } from "@/lib/http";
import { archiveDocuments, originEvents, phaseOneArchiveRecord } from "@/lib/content";

export const dynamic = "force-static";

export function GET() {
  return apiJson(
    {
      data: {
        curated_record: {
          id: phaseOneArchiveRecord.id,
          channel: phaseOneArchiveRecord.channel,
          kind: phaseOneArchiveRecord.kind,
          body: phaseOneArchiveRecord.body,
          created_at: phaseOneArchiveRecord.createdAt,
          immutable: phaseOneArchiveRecord.immutable,
          record_type: phaseOneArchiveRecord.recordType,
          content_class: phaseOneArchiveRecord.contentClass,
          curator: phaseOneArchiveRecord.curator,
          provenance: phaseOneArchiveRecord.provenance,
          source_document_id: phaseOneArchiveRecord.sourceDocumentId,
          source_page: phaseOneArchiveRecord.sourcePage,
          source_sha256: phaseOneArchiveRecord.sourceSha256,
        },
        events: originEvents,
        documents: archiveDocuments,
      },
      meta: {
        content_class: "SITE_CURATED_HISTORICAL_DATA_UNTRUSTED",
        provenance_values: ["DOCUMENTED", "RECONSTRUCTED", "FOLKLORE", "DISPUTED"],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
