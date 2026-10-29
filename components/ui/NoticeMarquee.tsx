"use client";
import { useEffect } from "react";
import { offeringHref, type Phase } from "@/lib/links";
import { useLivestream } from "@/lib/useLivestream";

// One group must be wider than any real viewport, or the seamless-loop trick
// (translate a duplicated track by -50%) leaves a visible gap once a single
// sentence has scrolled past. Repeating the sentence guarantees that.
const REPEATS = 10;

declare function gtag(...args: unknown[]): void;

function trackEvent(name: string, params?: Record<string, string>) {
  if (typeof gtag === "function") gtag("event", name, params ?? {});
}

function Out({
  href,
  event,
  hidden,
  children,
}: {
  href: string;
  event: string;
  hidden: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="reg-marquee__link"
      tabIndex={hidden ? -1 : 0}
      onClick={() => trackEvent(event, { location: "marquee" })}
    >
      <em>{children}</em>
    </a>
  );
}

function Message({
  phase,
  link,
  hidden = false,
}: {
  phase: Phase;
  link: string;
  hidden?: boolean;
}) {
  const offering = (text: string) => (
    <Out href={offeringHref("marquee")} event="outbound_108bt" hidden={hidden}>
      {text}
    </Out>
  );
  const watch = (text: string) => (
    <Out href={link} event="livestream_click" hidden={hidden}>
      {text}
    </Out>
  );

  let body: React.ReactNode;
  if (phase === "live") {
    body = (
      <>
        Live now — the 108 chortens are being raised in Gelephu.{" "}
        {watch("Watch the livestream")} · Placing has opened at{" "}
        {offering("108.bt")}
      </>
    );
  } else if (phase === "after") {
    body = (
      <>
        Placing on {offering("108.bt")} closes 15 November, 23:59 Bhutan time —
        leave your offering among the 108 chortens ·{" "}
        {watch("Watch the recording")}
      </>
    );
  } else if (phase === "sealed") {
    body = (
      <>
        Everything placed on {offering("108.bt")} is sealed until 21 February
        2027 · {watch("Watch the recording")}
      </>
    );
  } else {
    body = (
      <>
        Sign-up is open at {offering("108.bt")} — a place for you among the
        108, ahead of 1 November 2026 ·{" "}
        {watch("Watch the livestream on 1 November")}
      </>
    );
  }

  return (
    <span className="reg-marquee__msg" aria-hidden={hidden || undefined}>
      {body}
      <img
        src="/assets/chorten.png"
        alt=""
        aria-hidden="true"
        className="reg-marquee__glyph"
      />
    </span>
  );
}

export default function NoticeMarquee() {
  const { phase, link } = useLivestream();

  // Shifts the status bar down to make room — no dismiss, so this class is
  // permanent for as long as this component is mounted (i.e. always).
  useEffect(() => {
    document.body.classList.add("has-reg-notice");
    return () => {
      document.body.classList.remove("has-reg-notice");
    };
  }, []);

  return (
    <div className="reg-marquee" role="region" aria-label="Announcements">
      <div className="reg-marquee__track">
        <div className="reg-marquee__group">
          {Array.from({ length: REPEATS }, (_, i) => (
            <Message key={`a${i}`} phase={phase} link={link} hidden={i > 0} />
          ))}
        </div>
        <div className="reg-marquee__group" aria-hidden="true">
          {Array.from({ length: REPEATS }, (_, i) => (
            <Message key={`b${i}`} phase={phase} link={link} hidden />
          ))}
        </div>
      </div>
    </div>
  );
}
