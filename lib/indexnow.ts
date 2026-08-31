import { SITE_ORIGIN } from "@/lib/site";

export const INDEXNOW_KEY = "f291e84ffade236a5f2fff86d57d3188";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowPayload(paths: string[]) {
  const urlList = Array.from(
    new Set(
      paths.map((path) => {
        const url = new URL(path, SITE_ORIGIN);
        if (url.origin !== SITE_ORIGIN) {
          throw new Error("IndexNow URLs must use the canonical Artifactories origin.");
        }
        return url.toString();
      }),
    ),
  );

  return {
    host: new URL(SITE_ORIGIN).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList,
  };
}

export async function submitIndexNow(
  paths: string[],
  options: {
    fetcher?: typeof fetch;
    force?: boolean;
  } = {},
): Promise<"submitted" | "skipped"> {
  if (!options.force && process.env.NODE_ENV !== "production") return "skipped";
  const response = await (options.fetcher ?? fetch)(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowPayload(paths)),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`IndexNow submission failed with HTTP ${response.status}.`);
  }
  return "submitted";
}
