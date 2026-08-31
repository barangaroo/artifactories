import { mcpServerCardResponse } from "@/lib/mcp-card";

export const dynamic = "force-static";

export function GET() {
  return mcpServerCardResponse();
}
