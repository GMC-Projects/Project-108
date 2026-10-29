"use client";
import { useState } from "react";
import { offeringHref } from "@/lib/links";
import { useLivestream } from "@/lib/useLivestream";

// Brochure buttons are commented out below; restore them together with this.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BROCHURE_HREF = "/assets/Project_108.pdf";

declare function gtag(...args: unknown[]): void;

function trackEvent(name: string, params?: Record<string, string>) {
  if (typeof gtag === "function") gtag("event", name, params ?? {});
}

export default function StatusBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { phase, link } = useLivestream();
  // On the day, Watch Live takes the primary slot from Take Part.
  const live = phase === "live";
  const watchLabel =
    phase === "before" ? "Livestream" : live ? "Watch Live" : "Recording";

  function scrollToInvitation(e: React.MouseEvent) {
    e.preventDefault();
    setMenuOpen(false);
    trackEvent("nav_take_part");
    document
      .getElementById("scene-invitation")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <header className="status" role="banner">
        <span className="brand">Project 108 · Bhutan · 1 November 2026</span>

        {/* ── Desktop buttons ── */}
        <div className="status-split" aria-label="Actions">
          {/* Download Brochure — hidden for now.
          <a
            href={BROCHURE_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="status-split__btn status-split__btn--glow"
            onClick={() =>
              trackEvent("pdf_download", { location: "nav_desktop" })
            }
          >
            Download Brochure
            <svg
              className="status-split__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15V3" />
              <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
              <path d="m7 10 5 5 5-5" />
            </svg>
          </a> */}
          <a
            href="#scene-invitation"
            className="status-split__btn status-split__btn--primary"
            onClick={scrollToInvitation}
          >
            Take Part
            <span className="status-split__arrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>

        {/* ── Mobile: hamburger toggle ── */}
        <button
          className={`status-burger${menuOpen ? " is-open" : ""}`}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {/* ── Mobile: side drawer ── */}
      <div
        className={`status-drawer${menuOpen ? " is-open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div
          className="status-drawer__backdrop"
          onClick={() => setMenuOpen(false)}
        />
        <nav className="status-drawer__panel" role="menu">
          <button
            className="status-drawer__close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
          {/* Download Brochure — hidden for now.
          <a
            href={BROCHURE_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="status-drawer__btn"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              trackEvent("pdf_download", { location: "nav_mobile" });
            }}
          >
            Download Brochure
            <svg
              className="status-drawer__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15V3" />
              <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
              <path d="m7 10 5 5 5-5" />
            </svg>
          </a> */}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={`status-drawer__btn${live ? " status-drawer__btn--primary" : ""}`}
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              trackEvent("livestream_click", { location: "nav_mobile" });
            }}
          >
            <span className="status-drawer__live">
              {live && <span className="live-dot" aria-hidden="true" />}
              {watchLabel}
            </span>
            <span className="status-drawer__arrow" aria-hidden="true">
              ↗
            </span>
          </a>
          <a
            href={offeringHref("nav_mobile")}
            target="_blank"
            rel="noopener noreferrer"
            className="status-drawer__btn"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              trackEvent("outbound_108bt", { location: "nav_mobile" });
            }}
          >
            Visit 108.bt
            <span className="status-drawer__arrow" aria-hidden="true">
              ↗
            </span>
          </a>
          <a
            href="#scene-invitation"
            className={`status-drawer__btn${live ? "" : " status-drawer__btn--primary"}`}
            role="menuitem"
            onClick={scrollToInvitation}
          >
            Take Part
            <span className="status-drawer__arrow" aria-hidden="true">
              →
            </span>
          </a>
        </nav>
      </div>
    </>
  );
}
