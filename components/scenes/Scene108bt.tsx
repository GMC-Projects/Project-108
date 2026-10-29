"use client";

import { offeringHref, type Phase } from "@/lib/links";
import { useLivestream } from "@/lib/useLivestream";

declare function gtag(...args: unknown[]): void;

const PLACES = [
  { name: "Your selfie", text: "One photo, taken there and then." },
  {
    name: "Your memories",
    text: "Up to ten photos and one video from the day.",
  },
  {
    name: "Your prayer",
    text: "In Dzongkha or English, signed with your name.",
  },
  { name: "Your handles", text: "So what you appear in can be shared to you." },
];

const DATES: { date: string; text: string; phase: Phase | null }[] = [
  { date: "23 October", text: "Sign-up opens", phase: "before" },
  {
    date: "1 November",
    text: "The chortens are raised. Placing opens.",
    phase: "live",
  },
  {
    date: "15 November",
    text: "Placing closes. Everything is sealed.",
    phase: "after",
  },
  { date: "21 February 2027", text: "The reveal", phase: "sealed" },
];

const CTA: Record<Phase, string> = {
  before: "Begin at 108.bt",
  live: "Place yours at 108.bt",
  after: "Place yours at 108.bt",
  sealed: "Visit 108.bt",
};

/**
 * 108.bt, the offering platform, given a section of its own after the
 * completion scene. On desktop it pins and scrollytelling.js reveals each
 * .bt-step in turn; on phones it is a plain section.
 */
export default function Scene108bt() {
  const { phase } = useLivestream();
  const now = DATES.findIndex((d) => d.phase === phase);

  return (
    <section className="scene scene-108bt" id="scene-108bt">
      <div className="stage">
        <div className="stage__inner">
          <div className="bt-block">
            <p className="kicker">108.bt</p>
            <h2 className="bt-title">
              A Place For You <em>Among the 108</em>
            </h2>
            <p className="bt-lede">
              As the 108 chortens are raised, anyone, here or far away, can
              place an offering among them. Everything placed is kept sealed and
              opens together on 21 February 2027.
            </p>

            <ul className="bt-places">
              {PLACES.map((p) => (
                <li key={p.name} className="bt-step">
                  <p className="bt-places__name">{p.name}</p>
                  <p className="bt-places__text">{p.text}</p>
                </li>
              ))}
            </ul>

            <ol className="bt-dates">
              {DATES.map((d, i) => (
                <li
                  key={d.date}
                  className={`bt-step${i === now ? " is-now" : i < now ? " is-past" : ""}`}
                  aria-current={i === now ? "step" : undefined}
                >
                  <span className="bt-dates__dot" aria-hidden="true" />
                  <p className="bt-dates__date">{d.date}</p>
                  <p className="bt-dates__text">{d.text}</p>
                </li>
              ))}
            </ol>

            <a
              href={offeringHref("section")}
              target="_blank"
              rel="noopener noreferrer"
              className="bt-cta bt-step"
              onClick={() => {
                if (typeof gtag === "function")
                  gtag("event", "outbound_108bt", { location: "section" });
              }}
            >
              {CTA[phase]} ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
