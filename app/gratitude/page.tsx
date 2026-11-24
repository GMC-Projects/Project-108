import type { Metadata } from "next";
import HomeLink from "@/components/ui/HomeLink";
import SmoothScroll from "@/components/SmoothScroll";
import GratitudeStory from "@/components/gratitude/GratitudeStory";
import InscriptionToggle from "@/components/gratitude/InscriptionToggle";
import { getContributors } from "@/lib/gratitude";
import { ATTRIBUTION } from "@/components/gratitude/valley/site";

// scroll.css for .home-link; gratitude.css for everything else.
import "../scroll.css";
import "./gratitude.css";

/**
 * /gratitude — the story of 1 November, and thanks to the contributors.
 *
 * A scroll story over a particle chorten (GratitudeStory), then every name as
 * one inscription. The inscription is rendered here, on the server, so all
 * names are in the HTML for search engines and the browser's own find.
 *
 * noindex while the names are samples. Lift it, and add the canonical, once
 * lib/gratitude.ts reads the real contribution table.
 */
export const metadata: Metadata = {
  title: "With gratitude — Project 108",
  description:
    "On 1 November 2026, 108 Jangchub Chortens were raised in Gelephu in a single day. The story of that day, and thanks to every contributor who made it possible.",
  robots: { index: false, follow: false },
};

export default function GratitudePage() {
  const contributors = getContributors();
  const count = contributors.length.toLocaleString("en-GB");

  return (
    <main className="gr-page">
      <HomeLink />
      {/* The same eased wheel as the home page. */}
      <SmoothScroll lerp={0.06} wheelMultiplier={0.7} />
      <GratitudeStory contributors={contributors} />

      <section className="gr-record" id="gr-record">
        <div className="gr-record__in">
          <p className="gr-kicker">Every name</p>
          <h2 className="gr-h2">
            Inscribed <em>together</em>.
          </h2>
          <p className="gr-lede">
            The names of all {count} contributors, written as one inscription,
            the way names are carved around a chorten.
          </p>
          <p className="gr-inscription is-clipped" id="gr-inscription">
            {contributors.map((c, i) => (
              <span key={c.n}>
                <span className={c.name ? undefined : "gr-anon"}>
                  {c.name ?? "an anonymous offering"}
                </span>
                {i < contributors.length - 1 && (
                  <span className="gr-sep" aria-hidden="true">
                    ·
                  </span>
                )}
              </span>
            ))}
          </p>
          <InscriptionToggle count={count} />
          <div className="gr-closing">
            <hr />
            <p>
              May the merit of these offerings reach all beings, in every
              direction.
            </p>
          </div>
          <footer className="gr-foot">
            Gelephu Mindfulness City Authority · 108@gmc.bt · +975 17525480
            <span className="gr-credit">{ATTRIBUTION}</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
