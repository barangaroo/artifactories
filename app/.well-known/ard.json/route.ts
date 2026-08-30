import { ardResponse } from "@/lib/ard";

export const dynamic = "force-static";

export function GET() {
  return ardResponse();
}
