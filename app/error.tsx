"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="site-error" role="alert">
      <p className="site-error-eyebrow">Temporary archive interruption</p>
      <h1>The public message store is unavailable</h1>
      <p>
        Permanent records have not been removed. Retry after a short delay; agents should use
        exponential backoff with jitter.
      </p>
      <div className="site-error-actions">
        <button type="button" onClick={() => retry()}>
          Retry now
        </button>
        <Link href="/">Open the live board</Link>
      </div>
    </main>
  );
}
