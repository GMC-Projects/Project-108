"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TIMELINE, displayName, type Contributor } from "@/lib/gratitude";
import type { ChortenScene } from "./chortenScene";

declare function gtag(...args: unknown[]): void;

/**
 * The scroll story on /gratitude.
 *
 * Each chapter is a tall section with a sticky screen. One frame loop reads
 * every chapter's scroll progress (0..1), fades in and out what copy it has
 * (for now only the search: the story's words are to come), and hands the
 * scene its state. The Mao Chhu, the 108 lit
 * sites and the crowd's gold orbs are there from the start;
 * at "The raising" the camera comes down to one site and all 108 rise, the
 * contributor lights come on in "Within it", and the camera pulls back in
 * "One of 108".
 *
 * three.js is imported only here, after mount, so it never reaches the home
 * page's bundle. Without WebGL the story and every name still read.
 */

const CHAPTERS = ["open", "timeline", "close", "raise", "noon", "lights", "explore", "many"] as const;
type Chapter = (typeof CHAPTERS)[number];

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => x * x * (3 - 2 * x);
// For the long camera moves: starts and settles more gently than ease.
const sine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
/* The story reads the scroll damped, as 108bt-web's closing does (DAMP_S):
   a flick or a jump of the scrollbar plays out calmly. A jump of more than
   1.5 screens (a link, the inscription's button) is taken at once. */
const DAMP_S = 0.12;

/* The raising, as the storyboard has it (https://claude.ai/artifact/4dRctSoiFZDwVtKnkwihjW),
   on one table: where each beat begins in the chapter's scroll (0..1), and
   how far the lights have gone up (uGather) and down (uDescend) there. The
   camera and the lights are both keyed on those two, so they keep step.
     the first light      0     - 0.10   gather 0    - 0.30
     the answer           0.10  - 0.26   gather 0.30 - 0.50
     gathering in the sky 0.26  - 0.40   gather 0.50 - 0.62
     the mandala          0.40  - 0.56   gather 0.62 - 1, then a hold
     the river of light   0.56  - 0.84   descend 0   - 0.63
     arrival, the coil    0.84  - 1      descend 0.63 - 1 */
const GATHER: [number, number][] = [[0, 0], [0.1, 0.3], [0.3, 0.56], [0.54, 1]];
const DESCEND: [number, number] = [0.56, 1];
const along = (x: number, keys: [number, number][]) => {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    const [x0, y0] = keys[i - 1];
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
  }
  return keys[keys.length - 1][1];
};
/* The chapter is longer than the table above was laid out on: the
   chorten's building keeps its pace; the first light's ride takes most of
   twice as much scroll (rising beside it from under a metre away, the close
   shot opened out to the wide one too quickly), and the stretch between (the
   camera drawing back, the mandala, the river of light down to the
   foundation) half again as much. Maps the chapter's own
   progress onto the table's. */
const RETIME: [number, number][] = [[0, 0], [0.16, 0.1], [0.337, 0.3], [0.543, 0.54], [0.552, 0.56], [0.855, 0.758], [1, 1]];
// As along, but smooth through the keys (monotone cubic), so the pace eases
// from one stretch into the next instead of changing at a step.
const alongSmooth = (x: number, keys: [number, number][]) => {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  const slope = (i: number) => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
  const tangent = (i: number) => {
    if (i === 0) return slope(0);
    if (i === n - 1) return slope(n - 2);
    const a = slope(i - 1);
    const b = slope(i);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  let i = 0;
  while (x > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i];
  const [x1, y1] = keys[i + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tangent(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tangent(i + 1);
};
const descendAt = (raise: number) => clamp((raise - DESCEND[0]) / (DESCEND[1] - DESCEND[0]));

export default function GratitudeStory({ contributors }: { contributors: Contributor[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChortenScene | null>(null);
  const exploringRef = useRef(false);
  const selectedRef = useRef(0);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState("");
  const [noGl, setNoGl] = useState(false);
  const [fine, setFine] = useState(false);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return contributors.filter((c) =>
      `${displayName(c)} ${c.dedication ?? ""}`.toLowerCase().includes(q),
    );
  }, [query, contributors]);

  useEffect(() => {
    sceneRef.current?.setHits(new Set(found?.map((c) => c.n) ?? []));
  }, [found]);

  function scrollToExplore() {
    const el = rootRef.current?.querySelector<HTMLElement>('[data-ch="explore"]');
    if (!el) return;
    const top = el.offsetTop;
    const span = el.offsetHeight - window.innerHeight;
    if (window.scrollY < top || window.scrollY > top + span) {
      window.scrollTo(0, top + span * 0.3);
    }
  }

  function select(n: number, fromLink = false) {
    selectedRef.current = n;
    setSelected(n);
    setCopied("");
    sceneRef.current?.select(n);
    if (!n) return;
    scrollToExplore();
    if (!fromLink) {
      try {
        history.replaceState(null, "", `#light-${n}`);
      } catch {}
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setFine(window.matchMedia("(pointer: fine)").matches);

    const els = Object.fromEntries(
      CHAPTERS.map((k) => [k, root.querySelector<HTMLElement>(`[data-ch="${k}"]`)!]),
    ) as Record<Chapter, HTMLElement>;
    // (Only the search's chapter has copy for now: the story's words are to
    // come. A chapter without any is passed over.)
    const copies = CHAPTERS.map((k) => els[k].querySelector<HTMLElement>(".gr-copy"));
    const ticks = Array.from(root.querySelectorAll<HTMLElement>(".gr-ticks span"));
    const record = document.getElementById("gr-record");

    const geo: Record<Chapter, { top: number; h: number }> = {} as never;
    let recordTop = Infinity;
    const measure = () => {
      for (const k of CHAPTERS) geo[k] = { top: els[k].offsetTop, h: els[k].offsetHeight };
      recordTop = record ? record.offsetTop : Infinity;
    };
    measure();

    /* Before dawn, after 108bt-web's word-by-word headings (landing-behaviour.js,
       "One prayer, sealed for as long as you choose."): each line of thanks
       comes in, its words brighten in reading order with the scroll, and only
       once it is read does the camera move on down the valley, in the last
       part of the line's own stretch of scroll. The shown reveal trails the
       scrolled one (LAG, per second), so it eases and settles. */
    const lines = Array.from(root.querySelectorAll<HTMLElement>(".gr-line"));
    const lineWords = lines.map((l) => Array.from(l.querySelectorAll<HTMLElement>(".gr-w")));
    const FAINT = 0.15;
    const SPREAD = 2.5;
    const LAG = 3.6;
    const READ = [0.04, 0.55]; // of a line's stretch: its words brighten across this
    const shown = lines.map(() => 0);
    const painted = lineWords.map((w) => w.map(() => -1));
    /* The night, down the valley and in among the people: one way, read
       straight from the scroll, from the page's top (so the opening moves
       too, and the way does not change course where Before dawn begins) to
       the close shot's settling. The scene paces it (nightAt). */
    const night = (y: number) => {
      const vh = window.innerHeight;
      const to = geo.close.top + 0.6 * Math.max(1, geo.close.h - vh);
      return clamp(y / Math.max(1, to));
    };
    const paintLines = (t: number, dt: number) => {
      const n = TIMELINE.length;
      lines.forEach((el, i) => {
        const q = t * n - i;
        const o = (i === 0 ? 1 : clamp(q / 0.08)) * (i === n - 1 ? 1 : 1 - clamp((q - 0.92) / 0.08));
        el.style.setProperty("--lo", o.toFixed(3));
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
        const words = lineWords[i];
        const target = clamp((q - READ[0]) / (READ[1] - READ[0])) * (words.length + SPREAD);
        shown[i] = reduce ? target : shown[i] + (target - shown[i]) * (1 - Math.exp(-dt * LAG));
        if (Math.abs(target - shown[i]) < 0.01) shown[i] = target;
        words.forEach((w, k) => {
          const v = Math.round((FAINT + (1 - FAINT) * clamp((shown[i] - k) / SPREAD)) * 100) / 100;
          if (v !== painted[i][k]) w.style.opacity = String((painted[i][k] = v));
        });
      });
      const ei = Math.min(n - 1, Math.floor(t * n * 0.999));
      ticks.forEach((tk, k) => tk.classList.toggle("on", k <= ei));
    };

    const p: Record<Chapter, number> = {} as never;
    let dampY = window.scrollY;
    const read = (y: number) => {
      const vh = window.innerHeight;
      CHAPTERS.forEach((k, i) => {
        p[k] = clamp((y - geo[k].top) / Math.max(1, geo[k].h - vh));
        let o =
          i === 0
            ? 1 - clamp((p[k] - 0.55) / 0.3)
            : clamp(p[k] / 0.12) * (1 - clamp((p[k] - 0.86) / 0.12));
        if (k === "explore") o = clamp(p[k] / 0.1) * (1 - clamp((p[k] - 0.92) / 0.08));
        // Its words come once the camera has reached the person.
        if (k === "close") o = clamp((p[k] - 0.55) / 0.12) * (1 - clamp((p[k] - 0.88) / 0.1));
        // Once the camera is out over the site and the others stand: earlier,
        // the copy sits over the chorten of lights as the camera leaves it.
        if (k === "many") o = clamp((p[k] - 0.35) / 0.15) * (1 - clamp((p[k] - 0.86) / 0.12));
        copies[i]?.style.setProperty("--o", o.toFixed(3));
        if (copies[i]) copies[i]!.style.visibility = o < 0.01 ? "hidden" : "visible";
      });
      // (From here on, the raising by the beats table's own timing.)
      p.raise = alongSmooth(p.raise, RETIME);
      exploringRef.current = p.explore > 0 && p.explore < 1;
    };

    let raf = 0;
    let time = 0;
    let prev = performance.now();
    let disposed = false;
    /* For filming the scene (development only, scripts/film.mjs): a frame
       at a time, each at a scroll position and a timestep the caller gives,
       eased exactly as at full speed however slowly it is drawn. */
    let filming: { dt: number } | null = null;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __grFrame?: (y: number, dt: number) => void }).__grFrame = (y, dt) => {
        cancelAnimationFrame(raf);
        window.scrollTo({ top: y, behavior: "instant" });
        filming = { dt };
        loop(performance.now());
      };
    }
    /* At rest (nothing scrolled, pointed at or pressed for ten seconds) the
       scene is drawn thirty times a second, not every frame: it looks the
       same, the breeze and the fireflies a little less smooth, and the
       device cools. As 108.bt's meadow rests. */
    const REST_MS = 10000;
    let lastInput = performance.now();
    let lastDrawn = 0;
    const woke = () => {
      lastInput = performance.now();
    };
    const INPUTS = ["scroll", "wheel", "pointermove", "pointerdown", "touchstart", "keydown"] as const;
    for (const k of INPUTS) window.addEventListener(k, woke, { passive: true });
    const loop = (now: number) => {
      const resting = !filming && now - lastInput > REST_MS;
      if (resting && now - lastDrawn < 1000 / 30 - 4) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastDrawn = now;
      const dt = filming ? filming.dt : Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!reduce) time += dt;
      const scrollY = window.scrollY;
      dampY =
        reduce || Math.abs(scrollY - dampY) > window.innerHeight * 1.5
          ? scrollY
          : dampY + (scrollY - dampY) * (1 - Math.exp(-dt / DAMP_S));
      if (Math.abs(scrollY - dampY) < 0.1) dampY = scrollY;
      read(dampY);
      paintLines(p.timeline, dt);
      const scene = sceneRef.current;
      if (scene && !document.hidden) {
        // The gatherings breathe with a slow pulse through the last line, waiting.
        const chant = (TIMELINE.length - 1) / TIMELINE.length;
        scene.frame({
          // The raising, by the beats table above (GATHER).
          release: clamp(p.raise / 0.02),
          gather: along(p.raise, GATHER),
          descend: descendAt(p.raise),
          // The chorten complete: its breath, from the last light settling on
          // through the screen before "All 108" (read from the scroll, so that
          // screen moves too).
          breath: (() => {
            const vh = window.innerHeight;
            const from = geo.raise.top + 0.97 * Math.max(1, geo.raise.h - vh);
            return ease(clamp((dampY - from) / Math.max(1, geo.noon.top - from)));
          })(),
          // (in step with the first light, which lands at 0.375 of the descent)
          // (Arriving as the ribbon's head reaches the foundation, at 0.63 of the descent.)
          toValley: 1 - sine(clamp((p.raise - 0.7) / 0.14)),
          reveal: ease(p.lights),
          // ...and as the camera settles on the foundation the night gives way
          // to the page's maroon, before the lights set off.
          valley: clamp(1 - ease(clamp((p.raise - 0.8) / 0.08)) + ease(clamp(p.many / 0.22))),
          night: night(dampY),
          pulse: clamp((p.timeline - chant) * TIMELINE.length) * (1 - clamp(p.raise * 4)),
          // Round the chorten from the last lights settling, through noon and
          // the lights, read from the scroll across them (so the screens
          // between move too); begun as late as noon, the end of the raising
          // held still for screens.
          orbit: (() => {
            const from = geo.raise.top + 0.9 * Math.max(1, geo.raise.h - window.innerHeight);
            return sine(clamp((dampY - from) / Math.max(1, geo.explore.top - from)));
          })(),
          /* The ending, one thing after another, not all at once: the night
             comes back over the valley (valley, above), the camera still; the
             stone rises through CHORTEN's lights and they go into it; then
             the camera pulls back as first light comes and the others rise.
             (Over a fifth of the chapter together, the stone rose white
             inside the maroon grade and the bloom burnt it out.) */
          stone: ease(clamp((p.many - 0.12) / 0.3)),
          settle: ease(clamp(p.many / 0.45)),
          many: ease(clamp((p.many - 0.38) / 0.5)),
          // Night throughout the raising; first light comes as the camera pulls back
          // to show all 108 standing.
          daylight: ease(clamp((p.many - 0.4) / 0.45)),
          fade: 1 - clamp((window.scrollY + window.innerHeight * 0.6 - recordTop) / (window.innerHeight * 0.6)),
          time,
          dt: reduce ? 0 : dt,
          hold: exploringRef.current && selectedRef.current > 0,
          resting,
        });
      }
      if (!filming) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    import("./chortenScene")
      .then((m) => {
        const base = window.location.pathname.startsWith("/108") ? "/108" : "";
        return m.createChortenScene(canvas, contributors.length, `${base}/gratitude/valley.glb`);
      })
      .then((scene) => {
        if (disposed) return scene.dispose();
        sceneRef.current = scene;
        if (selectedRef.current) scene.select(selectedRef.current);
      })
      .catch(() => setNoGl(true));

    const onResize = () => {
      measure();
      sceneRef.current?.resize();
    };
    window.addEventListener("resize", onResize);

    // Pointer: drag to turn (mouse), tap or click a light to open its card.
    let down = false;
    let moved = false;
    let lastX = 0;
    const tip = tipRef.current!;
    const onDown = (e: PointerEvent) => {
      if (!exploringRef.current) return;
      down = true;
      moved = false;
      lastX = e.clientX;
      if (e.pointerType === "mouse") sceneRef.current?.setDragging(true);
    };
    const onMove = (e: PointerEvent) => {
      const scene = sceneRef.current;
      if (!exploringRef.current || !scene || e.pointerType !== "mouse") {
        tip.classList.remove("on");
        return;
      }
      if (down) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        if (Math.abs(dx) > 1) moved = true;
        scene.drag(dx);
        return;
      }
      const n = scene.pickAt(e.clientX, e.clientY);
      if (n) {
        tip.textContent = displayName(contributors[n - 1]);
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY}px`;
        tip.classList.add("on");
        canvas.style.cursor = "pointer";
      } else {
        tip.classList.remove("on");
        canvas.style.cursor = "grab";
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      sceneRef.current?.setDragging(false);
      if (moved || !sceneRef.current) return;
      const n = sceneRef.current.pickAt(e.clientX, e.clientY);
      if (n) select(n);
    };
    const onLeave = () => tip.classList.remove("on");
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    const fromHash = () => {
      const m = /^#light-(\d+)$/.exec(window.location.hash);
      if (m && +m[1] >= 1 && +m[1] <= contributors.length) select(+m[1], true);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      for (const k of INPUTS) window.removeEventListener(k, woke);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("hashchange", fromHash);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // select is stable in behaviour; the effect runs once per contributor list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contributors]);

  function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}#light-${selected}`;
    if (typeof gtag === "function") gtag("event", "gratitude_copy_link");
    if (!navigator.clipboard) return setCopied(link);
    navigator.clipboard.writeText(link).then(
      () => setCopied("Link copied"),
      () => setCopied(link),
    );
  }

  const current = selected ? contributors[selected - 1] : null;

  return (
    <div className="gr-story" ref={rootRef}>
      <canvas className="gr-stage" ref={canvasRef} aria-hidden="true" />
      <div className="gr-tip" ref={tipRef} />

      <section className="gr-ch" data-ch="open" style={{ height: "170vh" }}>
        <div className="gr-sticky" />
      </section>

      <section className="gr-ch" data-ch="timeline" style={{ height: "480vh" }}>
        <div className="gr-sticky" />
      </section>

      <section className="gr-ch" data-ch="close" style={{ height: "300vh" }}>
        <div className="gr-sticky" />
      </section>

      <section className="gr-ch" data-ch="raise" style={{ height: "1700vh" }}>
        <div className="gr-sticky" />
      </section>

      <section className="gr-ch" data-ch="noon" style={{ height: "200vh" }}>
        <div className="gr-sticky" />
      </section>

      <section className="gr-ch" data-ch="lights" style={{ height: "220vh" }}>
        <div className="gr-sticky" />
      </section>

      <section className="gr-ch gr-ch--explore" data-ch="explore" style={{ height: "260vh" }}>
        <div className="gr-sticky">
          <div className="gr-copy gr-live">
            <p className="gr-kicker">Find your light</p>
            <input
              className="gr-field"
              id="gr-search"
              type="search"
              placeholder="Search a name or a dedication"
              aria-label="Search a name or a dedication"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {found && found.length > 0 && (
              <ul className="gr-results">
                {found.slice(0, 30).map((c) => (
                  <li key={c.n}>
                    <button type="button" onClick={() => select(c.n)}>
                      <span>{displayName(c)}</span>
                      <span className="gr-no">No. {c.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="gr-hint" aria-live="polite">
              {found
                ? found.length
                  ? `${found.length} ${found.length === 1 ? "light" : "lights"} glowing brighter`
                  : "No name matches. Try part of a name."
                : fine
                  ? "Drag to turn the chorten · click a light"
                  : "Touch a light to see its name"}
            </p>
            {current && (
              <div className="gr-card">
                <span className="gr-card__lbl">Light</span>
                <div className="gr-card__num">No. {current.n}</div>
                <h3 className="gr-card__name">{displayName(current)}</h3>
                {current.dedication && <p className="gr-card__ded">{current.dedication}</p>}
                <button type="button" className="gr-btn" onClick={copyLink}>
                  Copy link to this light
                </button>
                {copied && <span className="gr-copied">{copied}</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="gr-ch" data-ch="many" style={{ height: "420vh" }}>
        <div className="gr-sticky" />
      </section>

      {noGl && (
        <p className="gr-nogl">
          The 3D chorten could not load in this browser. Every name is still
          here.
        </p>
      )}
    </div>
  );
}
