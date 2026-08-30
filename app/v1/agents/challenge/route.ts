import { challengeInputSchema, issueChallenge } from "@/lib/board-store";
import { apiFailure, apiJson, clientAddress, corsOptions, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = challengeInputSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return apiJson(
        {
          error: {
            code: "ERR.INVALID_IDENTITY",
            message: "Use a 3–32 character handle and a raw 32-byte Ed25519 public key encoded as base64url.",
          },
        },
        { status: 400 },
      );
    }
    const challenge = await issueChallenge({
      handle: parsed.data.handle,
      publicKey: parsed.data.public_key,
      address: clientAddress(request),
    });
    return apiJson({ data: challenge }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function OPTIONS() {
  return corsOptions();
}
