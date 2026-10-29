"use client";

import { offeringHref, type Phase } from "@/lib/links";
import { useLivestream } from "@/lib/useLivestream";

declare function gtag(...args: unknown[]): void;

const WATCH: Record<Phase, string> = {
  before: "Watch the livestream",
  live: "Watch live",
  after: "Watch the day again",
  sealed: "Watch the day again",
};

export default function SceneTitle() {
  const { phase, link } = useLivestream();
  return (
    <section className="scene scene-title" id="scene-title" data-scene="title">
      <div className="stage">
        <div className="stage__inner">
          <div className="title-mist" aria-hidden="true"></div>
          <p className="title-eyebrow">Project</p>
          <h1 className="title-numeral">
            <span aria-hidden="true">108</span>
            <span className="visually-hidden">
              Project 108 — 108 Jangchub Chortens, Gelephu Mindfulness City,
              Bhutan. 108 chortens, each fifteen metres tall, completed together
              in a single day. 1 November 2026.
            </span>
          </h1>
          <p className="title-caption">
            108 Jangchub Chortens, each fifteen metres tall,
            <br />
            completed together in a single day.
          </p>
          <div className="title-pair">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="title-pair__btn"
              onClick={() => {
                if (typeof gtag === "function")
                  gtag("event", "livestream_click", { location: "hero" });
              }}
            >
              <span className="live-dot title-pair__dot" aria-hidden="true" />
              {WATCH[phase]} ↗
            </a>
            <a
              href={offeringHref("hero")}
              target="_blank"
              rel="noopener noreferrer"
              className="title-pair__btn title-pair__btn--solid"
              onClick={() => {
                if (typeof gtag === "function")
                  gtag("event", "outbound_108bt", { location: "hero" });
              }}
            >
              Seal a prayer at 108.bt ↗
            </a>
          </div>
          <div className="title-meta">
            <span>Gelephu Mindfulness City</span>
            <span>Bhutan</span>
            <span>1 November 2026</span>
          </div>
        </div>
      </div>
    </section>
  );
}
