"use client";

import { useLivestream } from "@/lib/useLivestream";

declare function gtag(...args: unknown[]): void;

/**
 * Floating "Watch Live" button, bottom-left opposite FloatTopButton. Shown only on
 * 1 November and only once the broadcast has a link, so it never leads anywhere empty.
 */
export default function LivePill() {
  const { phase, link } = useLivestream();
  if (phase !== "live" || !link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="live-pill"
      onClick={() => {
        if (typeof gtag === "function")
          gtag("event", "livestream_click", { location: "float" });
      }}
    >
      <span className="live-dot" aria-hidden="true" />
      Watch Live
    </a>
  );
}
