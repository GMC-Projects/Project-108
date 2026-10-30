"use client";

import { offeringHref, type Phase } from "@/lib/links";
import { useLivestream } from "@/lib/useLivestream";

declare function gtag(...args: unknown[]): void;

function trackEvent(name: string, params?: Record<string, string>) {
  if (typeof gtag === "function") gtag("event", name, params ?? {});
}

/** Stay connected: the livestream link, plus sign-up until the day itself. */
function StreamCard({ phase, link }: { phase: Phase; link: string }) {
  const live = phase === "live";
  const watch = (label: string) => (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="btn"
      onClick={() =>
        trackEvent("livestream_click", { location: "invitation_card" })
      }
    >
      {label} ↗
    </a>
  );

  if (phase === "before") {
    return (
      <div className="inv-card ghost">
        <p className="lbl">Stay connected</p>
        <p className="ttl">
          Join us from wherever you are in the <em>World</em>.
        </p>
        <p className="subtitle">
          Watch the livestream on 1 November, and sign up for prayers and
          practices for the day, and ways to stay part of what unfolds next.
        </p>
        <p className="body">
          On 1 November 2026, the raising of the 108 chortens will be shared
          with our global community by live broadcast, inviting you to witness
          this sacred moment wherever you are. Your prayers and participation
          remain part of this collective offering.
        </p>
        <button type="button" className="inv-card__link" data-open-signup>
          Or sign up for updates
        </button>
        {watch("Watch the livestream")}
      </div>
    );
  }

  return (
    <div className="inv-card ghost">
      <p className="lbl">
        {live ? (
          <span className="inv-live">
            <span className="live-dot" aria-hidden="true" />
            Live now
          </span>
        ) : (
          "Stay connected"
        )}
      </p>
      <p className="ttl">
        {live ? (
          <>
            Watch the 108 <em>rise</em>.
          </>
        ) : (
          <>
            Watch the day <em>again</em>.
          </>
        )}
      </p>
      <p className="subtitle">
        {live
          ? "Broadcast live from Gelephu Mindfulness City, for everyone who cannot be there."
          : "The full broadcast of 1 November, to watch wherever you are in the world."}
      </p>
      <p className="body">
        The raising of the 108 chortens, shared with our global community. Your
        prayers and participation remain part of this collective offering.
        Together, we celebrate, reflect, and dedicate merit beyond borders.
      </p>
      {watch(live ? "Watch the livestream" : "Watch the recording")}
    </div>
  );
}

const PLACE_NOTE: Record<Phase, string> = {
  before:
    "Sign-up is open. Placing opens on 1 November, as the chortens are raised.",
  live: "Placing is open today, and until 15 November.",
  after: "Placing closes 15 November, 23:59 Bhutan time.",
  sealed: "Everything placed is sealed until 21 February 2027.",
};

/** 108.bt: the fourth way to take part. */
function PlaceCard({ phase }: { phase: Phase }) {
  return (
    <div className="inv-card ghost">
      <p className="lbl">108.bt</p>
      <p className="ttl">
        A Place For You <em>Among the 108</em>
      </p>
      <p className="subtitle">{PLACE_NOTE[phase]}</p>
      <p className="body">
        Here or far away, anyone can leave a selfie, memories from the day and a
        prayer among the 108 chortens. Everything is kept sealed and opens
        together on 21 February 2027.
      </p>
      <a
        href={offeringHref("invitation_card")}
        target="_blank"
        rel="noopener noreferrer"
        className="btn"
        onClick={() =>
          trackEvent("outbound_108bt", { location: "invitation_card" })
        }
      >
        Visit 108.bt ↗
      </a>
    </div>
  );
}

export default function SceneInvitation() {
  const { phase, link } = useLivestream();
  return (
    <section className="scene scene-invitation" id="scene-invitation">
      <div className="stage">
        <div className="stage__inner">
          <div className="inv-block">
            <h2>
              Four ways to <em>take part</em>.
            </h2>
            <p className="inv-lede">
              Wherever you are — <em>join</em> the build, <em>witness</em> the
              rising, make an <em>offering</em>, or <em>seal</em> a prayer among
              the 108.
            </p>
            <div className="inv-cards">
              <div className="inv-card">
                <p className="lbl">Join the build day</p>
                <p className="ttl">
                  Become a <em>Volunteer</em>.
                </p>
                <p className="amt">
                  <span className="from">An estimated</span>
                  <strong>40,000</strong>
                  <span className="per">volunteers · across 108 sites</span>
                </p>
                <p className="body">
                  Tens of thousands are already at work along the Mao Chhu,
                  clearing land and preparing sites ahead of 1 November 2026,
                  when all 108 structures will be raised together in a single
                  historic day.
                </p>
                <p className="body">
                  No specialist skills are required. What matters is
                  willingness, discipline, and shared purpose.
                </p>

                <a
                  href="https://sites.google.com/view/gmc-project108"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                >
                  Register to show your interest
                </a>
              </div>
              <StreamCard phase={phase} link={link} />
              <div className="inv-card ghost">
                <p className="lbl">Offering</p>
                <p className="ttl">
                  Support the <em>Project</em>.
                </p>
                <p className="subtitle">
                  Make an offering of any size toward the raising of the 108
                  chortens—every offering becomes part of the whole.
                </p>
                {/* <p className="amt">
                  <span className="from">From</span>
                  <strong>USD 200,000</strong>
                  <span className="per">
                    per chorten · flexible by conversation
                  </span>
                </p> */}
                <p className="body">
                  Every offering, of any size, becomes part of the whole.
                  Offerings cover the construction of the chortens, their sacred
                  materials, and their consecration by Buddhist masters. An
                  offering may be made by an individual, a family, a community,
                  or an institution, and dedicated in honour of one's family, a
                  loved one, or all sentient beings
                </p>

                {/* <p className="body">
                  Each chorten may be dedicated in honour of a patron, a loved
                  one, or all sentient beings. A plaque provides permanent
                  recognition.
                </p> */}
                <a href="/contribute" className="btn">
                  Make an offering
                </a>
              </div>
              <PlaceCard phase={phase} />
            </div>
            <p className="inv-meta">
              Gelephu Mindfulness City Authority ·{" "}
              <a href="mailto:108@gmc.bt">108@gmc.bt</a> · +975 17525480
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
