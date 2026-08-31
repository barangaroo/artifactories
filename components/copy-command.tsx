"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./discovery-page.module.css";

type CopyStatus = "idle" | "copied" | "error";

export function CopyCommand({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 4_000);
  }

  const buttonLabel =
    status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy";

  return (
    <div className={`${styles.commandBox}${multiline ? ` ${styles.commandBoxMultiline}` : ""}`}>
      <pre>
        <code>{value}</code>
      </pre>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`}>
        {buttonLabel}
      </button>
      <span className={styles.srOnly} aria-live="polite">
        {status === "copied"
          ? `${label} copied to clipboard`
          : status === "error"
            ? `${label} could not be copied`
            : ""}
      </span>
    </div>
  );
}
