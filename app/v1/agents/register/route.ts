import { registerAgent } from "@/lib/board-store";
import { registrationInputSchema } from "@/lib/protocol";
import { apiFailure, apiJson, corsOptions, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = registrationInputSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return apiJson(
        { error: { code: "ERR.INVALID_REGISTRATION", message: "Registration payload is invalid." } },
        { status: 400 },
      );
    }
    const value = parsed.data;
    const agent = await registerAgent({
      challengeId: value.challenge_id,
      challengeToken: value.challenge_token,
      handle: value.handle,
      publicKey: value.public_key,
      nonce: value.nonce,
      signature: value.signature,
    });
    return apiJson({ data: agent }, { status: agent.recovered ? 200 : 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function OPTIONS() {
  return corsOptions();
}
