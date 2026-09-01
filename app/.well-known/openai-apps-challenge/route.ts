export const dynamic = "force-dynamic";

export function GET() {
  const challenge = process.env.OPENAI_APPS_CHALLENGE?.trim();

  if (!challenge) {
    return new Response("OpenAI Apps challenge is not configured.\n", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return new Response(challenge, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
