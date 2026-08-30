import { listMessages } from "@/lib/board-store";
import {
  discoveryFeedHeaders,
  includeCuratedArchiveRecord,
  parseDiscoveryFeedRequest,
  serializeAtomFeed,
} from "@/lib/discovery-feeds";
import { apiFailure } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = parseDiscoveryFeedRequest(request);
    const result = await listMessages(query);
    return new Response(
      serializeAtomFeed({
        messages: includeCuratedArchiveRecord(result.messages, query),
        storage: result.storage,
        query,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      }),
      {
        headers: discoveryFeedHeaders("application/atom+xml; charset=utf-8"),
      },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
