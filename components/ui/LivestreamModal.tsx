"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays the broadcast in place rather than sending the reader off to YouTube.
 *
 * Every livestream link on the page (hero, card, drawer, marquee, pill) is a plain
 * <a href> to YouTube; this catches clicks on any of them at the document, so none
 * need to know the modal exists. A link it cannot parse a video id from, or a
 * modified click (new tab, etc.), falls through and opens YouTube as before.
 * Each link's own onClick still fires first, so analytics are unchanged.
 */

function youtubeId(href: string): string | null {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host !== "youtube.com") return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export default function LivestreamModal() {
  const [video, setVideo] = useState<{ id: string; href: string } | null>(
    null,
  );
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = video !== null;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!a || a.closest(".stream-modal")) return;
      const id = youtubeId(a.href);
      if (!id) return;
      e.preventDefault();
      openerRef.current = a;
      setVideo({ id, href: a.href });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Escape closes, and body scroll is locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVideo(null);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      openerRef.current?.focus?.();
    };
  }, [open]);

  return (
    <div
      className={`stream-modal${open ? " is-open" : ""}`}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Project 108 livestream"
    >
      <div
        className="stream-modal__backdrop"
        onClick={() => setVideo(null)}
        aria-hidden="true"
      />
      <div className="stream-modal__frame">
        {/* Mounted only while open, so closing stops playback. */}
        {video && (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title="Project 108 livestream"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
      </div>
      <div className="stream-modal__bar">
        <a
          href={video?.href}
          target="_blank"
          rel="noopener noreferrer"
          className="stream-modal__yt"
          onClick={() => setVideo(null)}
        >
          Watch on YouTube ↗
        </a>
        <button
          type="button"
          ref={closeRef}
          className="stream-modal__close"
          onClick={() => setVideo(null)}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
