/* ============================================================
   Project 108 — Cinematic Scrollytelling
   Scroll controller for index.html
   ============================================================ */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion:reduce)",
  ).matches;

  /* ---------------- Helpers ---------------- */
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Touch screens scroll on the browser's own fast path; there the scenes
  // follow the real scroll position instead of easing after it.
  const touch = window.matchMedia("(pointer: coarse)").matches;

  /* ---------------- Cached lookups and writes ----------------
     The scenes' elements are built once, so looking them up every frame is
     wasted work. $ / $$ remember what they found (and look again if React
     has replaced the node). setVar writes a style property only when its
     value has changed, so an idle frame causes no style recalculation.
  ---------------------------------------------------------------- */
  const one = new Map();
  const all = new Map();
  function $(sel) {
    let el = one.get(sel);
    if (!el || !el.isConnected) {
      el = document.querySelector(sel);
      if (el) one.set(sel, el);
    }
    return el;
  }
  function $$(sel) {
    let list = all.get(sel);
    if (!list || !list.length || !list[0].isConnected) {
      list = document.querySelectorAll(sel);
      if (list.length) all.set(sel, list);
    }
    return list;
  }
  function setVar(el, name, v) {
    const s = typeof v === "number" ? String(+v.toFixed(4)) : String(v);
    const seen = el._vars || (el._vars = {});
    if (seen[name] === s) return;
    seen[name] = s;
    el.style.setProperty(name, s);
  }
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
  // Element sizes, measured once and forgotten on resize (reading a size in
  // the frame loop forces the browser to lay the page out again).
  let sizes = new WeakMap();
  function size(el) {
    let s = sizes.get(el);
    if (!s) {
      s = [el.offsetWidth, el.offsetHeight];
      if (s[0] && s[1]) sizes.set(el, s);
    }
    return s;
  }

  /* ---------------- Scenes registry ----------------
     Each scene exposes a sticky `<div class="stage">` inside a
     tall section. We compute scroll progress (0..1) for the
     section's pinned region and call its `update(p)` handler.
  ---------------------------------------------------- */
  const sceneDefs = []; // {el, label, num, act, update}

  function registerScene({ selector, label, num, act, update }) {
    const el = $(selector);
    if (!el) return;
    sceneDefs.push({ el, label, num, act, update: update || (() => {}) });
  }

  /* ---------------- Caption + rail ---------------- */
  const captionNum = $(".caption-bar .num");
  const captionLbl = $(".caption-bar .lbl");
  const railFill = $(".rail__fill");

  let lastSceneIdx = -1;

  function setActiveScene(idx) {
    if (idx === lastSceneIdx) return;
    const s = sceneDefs[idx];
    if (!s) return;
    if (captionNum) captionNum.textContent = s.num;
    if (captionLbl) captionLbl.textContent = s.label;
    lastSceneIdx = idx;
  }

  /* ---------------- Scene-specific setup ---------------- */

  // Scene 01 — Title
  registerScene({
    selector: ".scene-title",
    label: "Project 108",
    num: "01 / 15",
    act: "I — The Sacred Object",
  });

  // Scene 02 — What is a chorten?
  registerScene({
    selector: ".scene-what",
    label: "What is a chorten?",
    num: "02 / 15",
    act: "I — The Sacred Object",
    update(p) {
      // Phones: no pin, so show the end state.
      if (window.innerWidth <= 768) p = 1;
      const stg = $(".scene-what .what-chorten");
      if (stg) setVar(stg, "--p", clamp(p));
      const truths = $$(".scene-what .truth");
      // Stagger four truths over progress 0.15..0.95
      truths.forEach((el, i) => {
        const start = 0.15 + i * 0.18;
        const lit = p > start;
        el.classList.toggle("show", lit);
      });
    },
  });

  // Scene 03 — Chorten Assembly (7 parts)
  registerScene({
    selector: ".scene-assembly",
    label: "Seven sacred elements",
    num: "03 / 15",
    act: "I — The Sacred Object",
    update(p) {
      const parts = $$(".scene-assembly .assy-part");
      const items = $$(".scene-assembly .assy-item");
      const N = 7;
      // Stagger each part across progress segments. Each part takes 1/N
      // of the scroll, with a small overlap.
      parts.forEach((el) => {
        const i = parseInt(el.dataset.part, 10) - 1; // 0..6
        const start = (i / N) * 0.9; // 0 .. 0.9
        const end = start + 0.15;
        const t = clamp((p - start) / (end - start));
        setVar(el, "--p", easeOut(t));
      });
      items.forEach((el) => {
        const i = parseInt(el.dataset.part, 10) - 1; // 0..6
        const start = (i / N) * 0.9 + 0.04;
        const t = clamp((p - start) / 0.12);
        setVar(el, "--p", t);
        el.classList.toggle("lit", t > 0.8);
      });
    },
  });

  // Scene 04 — How tall is 15 metres?
  registerScene({
    selector: ".scene-scale",
    label: "How tall is fifteen metres?",
    num: "04 / 15",
    act: "I — The Sacred Object",
    update(p) {
      if (window.innerWidth <= 768) p = 1;
      const wrap = $(".scene-scale .scale-scrolly");
      const art = $(".scene-scale .scale-art");
      if (art) setVar(art, "--p", clamp(p));
      if (!wrap) return;
      // Figure reveal thresholds: person 0.10, building 0.40, chorten 0.70
      const figs = wrap.querySelectorAll(".scale-fig");
      const thresholds = [0.08, 0.38, 0.66];
      figs.forEach((f, i) => {
        const t = thresholds[i] || 0;
        const local = clamp((p - t) / 0.18);
        setVar(f, "--on", local);
      });
      // data-stage drives tick visibility
      let stage = 0;
      if (p >= thresholds[0]) stage = 1;
      if (p >= thresholds[1]) stage = 2;
      if (p >= thresholds[2]) stage = 3;
      wrap.setAttribute("data-stage", String(stage));
    },
  });

  // Scene 05 — Why 108? (multi-chapter pinned scene)
  // Five chapters: A astronomy, B buddhism, D math, C hinduism, E project
  const WHY_CHAPTERS = ["A", "B", "D", "C", "E"];
  registerScene({
    selector: ".scene-why",
    label: "Why 108?",
    num: "05 / 15",
    act: "II — The Sacred Number",
    update(p) {
      // Anchor visibility: hide during chapter content, return at hand-offs
      // Chapters span: A 0.05–0.22, B 0.24–0.41, D 0.43–0.58, C 0.60–0.75, E 0.78–0.98
      const ranges = [
        ["A", 0.05, 0.22],
        ["B", 0.24, 0.41],
        ["D", 0.43, 0.58],
        ["C", 0.6, 0.75],
        ["E", 0.78, 0.98],
      ];
      let anchorP = 0;
      let anchorS = 1;
      let activeChap = null;
      ranges.forEach(([id, a, b]) => {
        const inside = p >= a && p <= b;
        if (inside) activeChap = id;
      });

      // Only show anchor before the first chapter
      if (p < 0.05) {
        anchorP = 1;
        anchorS = 1;
      }

      const anchor = $(".why-anchor");
      if (anchor) {
        setVar(anchor, "--p", anchorP);
        setVar(anchor, "--s", anchorS);
      }

      $$(".why-chapter").forEach((c) => {
        const id = c.dataset.chap;
        c.classList.toggle("active", id === activeChap);
      });

      // Buddhism / Hinduism line ticking
      const tickLines = (chap, range) => {
        const c = $(`.why-chapter[data-chap="${chap}"]`);
        if (!c) return;
        const lines = c.querySelectorAll(".lines span");
        const [a, b] = range;
        const local = clamp((p - a) / (b - a));
        lines.forEach((ln, i) => {
          const t = i / lines.length;
          ln.classList.toggle("lit", local > t);
        });
      };
      tickLines("B", [0.24, 0.41]);
      tickLines("C", [0.6, 0.75]);

      // Project chapter — mandala radial reveal
      const projC = $('.why-chapter[data-chap="E"]');
      if (projC) {
        const [a, b] = [0.78, 0.98];
        const local = clamp((p - a) / (b - a));
        const mandala = projC.querySelector(".why-mandala");
        if (mandala) setVar(mandala, "--mandala-p", local);
      }
    },
  });

  // Scene 06 — One becomes 108 (12 cols × 9 rows = 108 cells)
  registerScene({
    selector: ".scene-multiply",
    label: "One sacred form, repeated",
    num: "06 / 15",
    act: "III — The Sacred Formation",
    update(p) {
      const cells = $$(".scene-multiply .cg-cell");
      // Define multiplication waves: 1 → 3 → 9 → 27 → 54 → 108
      // Mapping each step to a progress range
      const steps = [
        { at: 0.05, n: 1 },
        { at: 0.22, n: 3 },
        { at: 0.38, n: 9 },
        { at: 0.54, n: 27 },
        { at: 0.7, n: 54 },
        { at: 0.86, n: 108 },
      ];
      // Determine current target count
      let target = 1;
      for (const s of steps) {
        if (p >= s.at) target = s.n;
      }
      // Sequence cells from center outwards
      const ordered = window.__multiplyOrder || [];
      cells.forEach((el, i) => {
        const order = ordered[i] != null ? ordered[i] : i;
        el.classList.toggle("lit", order < target);
      });
      // Counter is managed by SceneMultiplyController (React) — do not update here.
    },
  });

  // Scene 07 — 108 m apart
  registerScene({
    selector: ".scene-spacing",
    label: "108 metres apart",
    num: "07 / 15",
    act: "III — The Sacred Formation",
    update(p) {
      const tr = $(".scene-spacing .spacing-track");
      const measure = $(".scene-spacing .spacing-measure");
      const total = $(".scene-spacing .spacing-total");
      const row = $(".scene-spacing .spacing-row");
      const chortens = $$(".scene-spacing .spacing-row .chorten-mini");
      const N = chortens.length; // 108

      // Four phases:
      // 0.00 → 0.25 : zoom in to center 2 chortens
      // 0.25 → 0.45 : HOLD — show center 4, 108 m line appears between middle 2
      // 0.45 → 0.75 : reveal all 108 chortens from sides, gap shrinks
      // 0.75 → 1.00 : HOLD — all 108 shown, ~11.7km line appears across full row
      let trackP;
      if (p < 0.25) {
        trackP = clamp(p / 0.25) * 0.45;
      } else if (p < 0.45) {
        trackP = 0.45; // first hold
      } else if (p < 0.75) {
        trackP = 0.45 + clamp((p - 0.45) / 0.3) * 0.55;
      } else {
        trackP = 1.0; // second hold — fully zoomed out
      }
      if (tr) setVar(tr, "--p", trackP);

      const isMobile = window.innerWidth <= 768;
      const maxGapPx = ((isMobile ? 65 : 38) * window.innerWidth) / 100;

      // Gap: set directly in px — avoids vw recalculation cost on 108 slots.
      let gapPx;
      if (p < 0.45) {
        gapPx = maxGapPx;
      } else {
        const t = clamp((p - 0.45) / 0.3);
        gapPx = maxGapPx - t * (maxGapPx - window.innerWidth * 0.01);
      }
      if (row) {
        const gapStr = gapPx.toFixed(1) + "px";
        // Skip the write (and the relayout of 108 slots) when the gap is unchanged.
        if (row._gap !== gapStr) {
          row._gap = gapStr;
          row.style.gap = gapStr;
          // Apply same gap to every .pair child in one pass
          row.querySelectorAll(".pair").forEach((pair) => {
            pair.style.gap = gapStr;
          });
        }
      }

      // Measure line width matches the gap
      if (measure) setVar(measure, "width", gapPx.toFixed(1) + "px");

      // Reveal chortens: only mutate DOM when revealRadius actually changes.
      let revealRadius;
      if (p < 0.25) {
        revealRadius = 1;
      } else if (p < 0.45) {
        revealRadius = isMobile ? 1 : 2;
      } else {
        const t = clamp((p - 0.45) / 0.3);
        revealRadius = Math.round(2 + t * (N / 2 - 2));
      }
      // Cache on the element so we only touch the DOM when the value changes.
      if (row && row._lastReveal !== revealRadius) {
        row._lastReveal = revealRadius;
        chortens.forEach((c, i) => {
          const dist = Math.abs(i - (N / 2 - 0.5));
          const visible = dist < revealRadius;
          // Use opacity directly — avoids CSS custom property resolution cost.
          setVar(c, "opacity", visible ? "1" : "0");
        });
      }

      // 108 m measure line: fades in during first hold, fades out as zoom resumes
      if (measure) {
        const fadeIn = clamp((p - 0.27) / 0.06);
        const fadeOut = 1 - clamp((p - 0.42) / 0.06);
        setVar(measure, "opacity", Math.min(fadeIn, fadeOut).toFixed(3));
        setVar(measure, "--p", trackP);
      }

      // ~11.7 km total line: fades in during second hold
      if (total) {
        const fadeIn = clamp((p - 0.78) / 0.08);
        const fadeOut = 1 - clamp((p - 0.96) / 0.04);
        setVar(total, "--vis", Math.min(fadeIn, fadeOut));
      }
    },
  });

  // Scene 08 — A line along the Mau Chhu
  registerScene({
    selector: ".scene-river",
    label: "A line along the Mau Chhu",
    num: "08 / 15",
    act: "III — The Sacred Formation",
    update(p) {
      // Phones: no pin, so show the end state.
      if (window.innerWidth <= 768) p = 1;
      const photo = $(".scene-river .river-photo");
      const path = $(".scene-river .river-path");
      if (photo) setVar(photo, "--p", clamp((p - 0.05) / 0.3));
      if (path) setVar(path, "--p", clamp((p - 0.15) / 0.55));
      // Markers light along path
      const markers = $$(".scene-river .river-marker");
      const isMobile = window.innerWidth <= 768;
      const litCount = Math.floor(clamp((p - 0.35) / 0.55) * markers.length);
      markers.forEach((m, i) =>
        m.classList.toggle(
          "lit",
          isMobile ? i < litCount : i >= markers.length - litCount,
        ),
      );
    },
  });

  // Scene 09 — Stacked height (1.62 km)
  registerScene({
    selector: ".scene-stack",
    label: "Stacked: 1 → 108 chortens",
    num: "09 / 15",
    act: "IV — The Scale of the Offering",
    update(p) {
      if (window.innerWidth <= 768) p = 1;
      const stageEl = $(".scene-stack .sg-stage");
      if (!stageEl) return;
      const [stageW, stageH] = size(stageEl);
      const isMobile = stageW < 600;

      // Asset data — real height (m), image aspect ratio (w/h), phase start/end
      // Aspect ratios measured from actual PNG files:
      //   pyramid.png 1601×1163 → 1.3765
      //   eiffel-tower.png 1090×1588 → 0.6864
      //   building.png (Burj) 645×1454 → 0.4435
      //   stack.png 963×3508 → 0.2745
      const ASSETS = [
        {
          id: "pyramid",
          label: "Great Pyramid",
          meters: 138.5,
          aspect: 1.3765,
          start: 0.0,
          end: 0.2,
        },
        {
          id: "eiffel",
          label: "Eiffel Tower",
          meters: 330,
          aspect: 0.6864,
          start: 0.1,
          end: 0.32,
        },
        {
          id: "burj",
          label: "Burj Khalifa",
          meters: 828,
          aspect: 0.4435,
          start: 0.21,
          end: 0.46,
        },
        {
          id: "stack",
          label: "108 Chortens",
          meters: 1620,
          aspect: 0.2745,
          start: 0.335,
          end: 0.6,
        },
      ];

      const TOTAL_M = 1620;
      const GAP_PX = isMobile ? 16 : 120;
      const TOTAL_GAPS = GAP_PX * (ASSETS.length - 1);

      // Scale factor: pick the tighter of height-based or width-based constraints
      // so all four assets always fit on screen simultaneously at final sizes.
      const totalWidthM = ASSETS.reduce((s, a) => s + a.meters * a.aspect, 0);
      const pxPerM_h = (stageH * (isMobile ? 0.72 : 0.84)) / TOTAL_M;
      const pxPerM_w =
        (stageW * (isMobile ? 0.9 : 0.82) - TOTAL_GAPS) / totalWidthM;
      const pxPerM = Math.min(pxPerM_h, pxPerM_w);

      // Landmark assets enter tall then shrink; stack grows from tiny.
      const ENTER_H = stageH * (isMobile ? 0.5 : 0.7);

      // Rulers fade in during the "scroll-stop" hold phase (p 0.63 → 0.82)
      const RULER_P = clamp((p - 0.63) / 0.19);

      // Tally — label of the last asset whose phase has started
      const labelEl = $(".scene-stack .sg-phase-label");
      const heightEl = $(".scene-stack .sg-phase-h");
      if (labelEl && heightEl) {
        let active = ASSETS[0];
        for (const a of ASSETS) {
          if (p >= a.start) active = a;
        }
        setText(labelEl, active.label);
        const m = active.meters;
        setText(
          heightEl,
          m >= 1000 ? (m / 1000).toFixed(2) + " km" : m + " m",
        );
      }

      // ── Container pan (keeps gaps uniform) ──────────────────────────────────
      // JS owns the full X position so CSS padding doesn't conflict.
      // On mobile: start offset centres the first asset on screen; end offset
      // centres the whole group. On desktop: simple left-to-right pan.
      // Pre-compute stable final positions once per frame (constant given pxPerM).
      // Using these instead of live DOM measurements means the layout never shifts
      // when a new asset enters at its large ENTER_H size.
      let accumX = 0;
      const finalPos = {};
      ASSETS.forEach((a) => {
        const fh = a.meters * pxPerM;
        finalPos[a.id] = { x: accumX, w: fh * a.aspect, h: fh };
        accumX += fh * a.aspect + GAP_PX;
      });
      const finalContW = accumX - GAP_PX;

      // On mobile: nudge the first 3 assets rightward so the gap between
      // burj and stack closes. Stack stays at its computed position.
      if (isMobile) {
        const nudge = stageW * 0.1;
        ["pyramid", "eiffel", "burj"].forEach((id) => {
          finalPos[id].x += nudge;
        });
      }

      const assetsEl = $(".scene-stack .sg-assets");
      if (assetsEl) {
        // Pan timing — each asset pans during its own shrink phase.
        const panFrac = Math.min(
          1,
          clamp((p - 0.0) / 0.2) * 0.25 +
            clamp((p - 0.1) / 0.22) * 0.25 +
            clamp((p - 0.21) / 0.25) * 0.25 +
            clamp((p - 0.335) / 0.265) * 0.25,
        );
        const panEase = 1 - Math.pow(1 - panFrac, 2);

        // Switch to block + fixed width so flex reflow can never happen.
        // Assets are absolutely positioned at their final X, so their large
        // entry size does not push siblings.
        setVar(assetsEl, "display", "block");
        setVar(assetsEl, "position", "relative");
        setVar(assetsEl, "width", finalContW.toFixed(1) + "px");
        setVar(
          assetsEl,
          "height",
          (stageH * (isMobile ? 0.62 : 0.88)).toFixed(1) + "px",
        );

        let panX;
        if (isMobile) {
          const startX = stageW / 2 - finalPos[ASSETS[0].id].w / 2;
          const endX = (stageW - finalContW) / 2 + stageW * 0.04;
          panX = startX + (endX - startX) * panEase;
        } else {
          // CSS (justify-content: center) already centres the container.
          // JS translateX offsets FROM that centre position.
          // Start: shift right so pyramid (leftmost) appears at screen centre.
          // End: return to 0 so CSS centering shows the full group centred.
          const firstW = finalPos[ASSETS[0].id].w;
          const startX = (finalContW - firstW) / 2;
          panX = startX * (1 - panEase) + stageW * 0.06 * panEase;
        }
        setVar(assetsEl, "transform", `translateX(${panX.toFixed(1)}px)`);
      }

      ASSETS.forEach(({ id, aspect, start, end }) => {
        const el = $(
          `.scene-stack .sg-asset[data-id="${id}"]`,
        );
        if (!el) return;

        const fp = finalPos[id];
        const isStack = id === "stack";
        const enterH = isStack ? fp.h * 0.08 : ENTER_H;
        // Scale at entry — how many times larger than the final size it starts
        const s0 = enterH / fp.h;

        // ── Set final dimensions once (causes layout) ──────────────────────
        // Only mutate width/height/left/position when they differ from what
        // was last set — avoids forced reflow on every frame.
        // Subsequent per-frame animation uses only transform + opacity
        // (GPU-composited, zero layout cost).
        // fp is a new object every frame, so compare its numbers, not identity.
        const fpKey = `${fp.x.toFixed(1)},${fp.w.toFixed(2)},${fp.h.toFixed(2)}`;
        if (el._fp !== fpKey) {
          el._fp = fpKey;
          el.style.position = "absolute";
          el.style.bottom = "0";
          el.style.left = fp.x.toFixed(1) + "px";
          el.style.width = fp.w.toFixed(2) + "px";
          el.style.height = fp.h.toFixed(2) + "px";
          el.style.transformOrigin = "bottom center";
          el.style.willChange = "transform, opacity";
        }
        setVar(el, "display", "");

        if (p < start) {
          setVar(el, "opacity", "0");
          setVar(el, "transform", `scale(${s0.toFixed(4)})`);
          return;
        }

        const raw = clamp((p - start) / (end - start));
        const ease = 1 - Math.pow(1 - raw, 3);
        const s = s0 + (1 - s0) * ease;

        setVar(el, "transform", `scale(${s.toFixed(4)})`);
        setVar(el, "opacity", Math.min(1, raw / 0.1).toFixed(3));

        const ruler = el.querySelector(".sg-ruler");
        if (ruler) setVar(ruler, "opacity", RULER_P.toFixed(3));
        const name = el.querySelector(".sg-asset__name");
        if (name) setVar(name, "opacity", RULER_P.toFixed(3));
      });
    },
  });

  // Scene 10 — Time of construction
  registerScene({
    selector: ".scene-time",
    label: "Prepared over time, completed together",
    num: "10 / 15",
    act: "V — The Human Achievement",
    update(p) {
      // Phones: no pin, so show the end state.
      if (window.innerWidth <= 768) p = 1;
      const fill = $(".scene-time .time-fill");
      if (fill) setVar(fill, "--p", clamp(p * 1.1));
      const markers = $$(".scene-time .time-marker");
      markers.forEach((el, i) => {
        const at = parseFloat(el.dataset.at) || i / markers.length;
        const t = clamp((p - at + 0.04) / 0.12);
        setVar(el, "--p", t);
        el.classList.toggle("lit", t > 0.9);
      });
    },
  });

  // Scene 11 — Manpower comparison
  registerScene({
    selector: ".scene-manpower",
    label: "Manpower across history",
    num: "11 / 15",
    act: "V — The Human Achievement",
    update(p) {
      if ($(".scene-manpower.is-unpinned")) p = 1;
      const rows = $$(".scene-manpower .manpower-row");
      rows.forEach((el, i) => {
        const start = i * 0.14;
        const t = clamp((p - start) / 0.25);
        setVar(el, "--p", t);
      });
    },
  });

  // Scene 12 — 40,000 volunteers
  registerScene({
    selector: ".scene-volunteers",
    label: "Forty thousand · one hundred and eight",
    num: "12 / 15",
    act: "V — The Human Achievement",
    update(p) {
      if (window.innerWidth <= 768) p = 1;
      const canvas = $(".scene-volunteers .vol-canvas");
      if (!canvas) return;

      const TARGET = 40000;
      const HAND_COUNT = 650;
      const t = clamp((p - 0.05) / 0.9);
      const count = Math.round(t * TARGET);
      // handsToShow scales with t so the last hand appears exactly at 40,000
      const poolSize = canvas._positions
        ? canvas._positions.length
        : HAND_COUNT;
      const handsToShow = count >= TARGET ? poolSize : Math.floor(t * poolSize);

      // Counter
      const counterNum = $(".vol-counter .num");
      const denomEl = $(".vol-counter .denom");
      if (counterNum) setText(counterNum, count.toLocaleString());
      if (denomEl && !denomEl._set) {
        denomEl._set = true;
        denomEl.innerHTML = `volunteers · <strong>40,000</strong> across <strong>108</strong> sites`;
      }

      // Init: size canvas, load SVG image, pre-compute positions
      if (!canvas._volInit || canvas._volInit !== 17) {
        canvas._volInit = 17;
        canvas._rendered = 0;
        const ctx2 = canvas.getContext("2d");
        if (ctx2) ctx2.clearRect(0, 0, canvas.width || 1, canvas.height || 1);

        const stage = canvas.parentElement;
        const W = stage.offsetWidth;
        const H = stage.offsetHeight;
        canvas.width = W;
        canvas.height = H;

        const isMobile = W < 600;
        const HAND_W = isMobile ? 36 : 56;
        const HAND_H = Math.round(HAND_W * (685.18 / 1028.19));

        // Text zone boundaries
        // Mobile: vol-copy is top:8%, left:4%, width≈92%
        //   — text (kicker+h2+paragraph) ends at roughly 50% height on a phone
        // Desktop: copy block is top-left ~30% width, ~62% height
        const copyX1 = 0;
        const copyY1 = 0;
        const copyX2 = isMobile ? W * 0.85 : W * 0.3;
        const copyY2 = isMobile ? H * 0.38 : H * 0.62;
        // Counter core — the actual number text (bottom-right)
        // Mobile: counter is bottom:8%, right:4%; num is ~10vw font
        const ctrCoreX1 = isMobile ? W * 0.22 : W * 0.72;
        const ctrCoreY1 = isMobile ? H * 0.84 : H * 0.78;
        const ctrX2 = W;
        const ctrY2 = H;
        // Fringe zone around counter (allow a small cluster)
        const ctrFringeX1 = isMobile ? W * 0.05 : W * 0.42;
        const ctrFringeY1 = isMobile ? H * 0.76 : H * 0.66;

        // Allow max 8 hands in copy zone on mobile (sparse overlay looks good), 2 on desktop
        let copyCount = 0,
          ctrFringeCount = 0;

        function isBlocked(cx, cy) {
          if (cx > copyX1 && cx < copyX2 && cy > copyY1 && cy < copyY2) {
            if (copyCount >= (isMobile ? 8 : 2)) return true;
            copyCount++;
          }
          // Hard block: the actual counter text box
          if (cx > ctrCoreX1 && cx < ctrX2 && cy > ctrCoreY1 && cy < ctrY2)
            return true;
          // Pocket zone: small gap just left of counter (desktop only)
          const pocketX1 = W * 0.48,
            pocketX2 = W * 0.68;
          const pocketY1 = H * 0.63,
            pocketY2 = H * 0.85;
          // we allow it — just don't block it, so hands fall here naturally
          // Soft cluster zone to the left of the counter (excluding the pocket)
          if (
            cx > ctrFringeX1 &&
            cx < ctrCoreX1 &&
            cy > ctrFringeY1 &&
            cy < ctrY2
          ) {
            // the pocket is free; only gate the rest of the fringe
            const inPocket =
              cx > pocketX1 && cx < pocketX2 && cy > pocketY1 && cy < pocketY2;
            if (!inPocket) {
              if (ctrFringeCount >= 14) return true;
              ctrFringeCount++;
            }
          }
          return false;
        }

        // Seeded PRNG
        let seed = 0xdeadbeef;
        function rand() {
          seed |= 0;
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        const positions = [];
        const baseMinDist = HAND_W * (isMobile ? 1.15 : 1.25);
        let attempts = 0;

        while (positions.length < HAND_COUNT && attempts < HAND_COUNT * 120) {
          attempts++;
          const x = rand() * (W - HAND_W);
          const y = rand() * (H - HAND_H);
          const cx = x + HAND_W / 2;
          const cy = y + HAND_H / 2;

          if (isBlocked(cx, cy)) continue;

          // Variable spacing: tighter in the open right half, slightly looser overall
          const densityFactor = cx > W * 0.5 ? 0.9 : 1.15;
          const minD = baseMinDist * densityFactor;
          const minD2 = minD * minD;

          let tooClose = false;
          for (let k = 0; k < positions.length; k++) {
            const dx = positions[k].x - x;
            const dy = positions[k].y - y;
            if (dx * dx + dy * dy < minD2) {
              tooClose = true;
              break;
            }
          }
          if (tooClose) continue;

          // Opacity: fade near text zones so the edge feels soft, not cut
          let alpha = 0.5 + rand() * 0.42;
          const edgeCopy = Math.max(
            0,
            Math.min(1, (copyX2 - cx) / (HAND_W * 2)),
          );
          const edgeCtr = Math.max(
            0,
            Math.min(1, (cx - ctrFringeX1) / (HAND_W * 2)),
          );
          const edgeTop = Math.max(
            0,
            Math.min(1, (copyY2 - cy) / (HAND_H * 2)),
          );
          alpha *= 1 - edgeCopy * edgeTop * 0.5;
          alpha *= 1 - edgeCtr * 0.3;

          // Scale: slightly larger in centre of screen for depth illusion
          const distFromCentre =
            Math.hypot(cx - W / 2, cy - H / 2) / Math.hypot(W / 2, H / 2);
          const scale = 0.6 + (1 - distFromCentre * 0.4) * 0.7 * rand();

          const rot = (rand() - 0.5) * 56;

          positions.push({
            x,
            y,
            rot,
            scale,
            alpha: Math.max(0.35, Math.min(0.92, alpha)),
          });
        }

        canvas._positions = positions;
        canvas._handW = HAND_W;
        canvas._handH = HAND_H;

        const img = new Image();
        img.onload = () => {
          canvas._img = img;
          // The hands arrive after this frame: draw them on the next one.
          invalidate();
        };
        img.src = "/assets/2Hand.svg";
      }

      if (!canvas._img || !canvas._positions) return;

      const rendered = canvas._rendered;
      if (handsToShow === rendered) return;

      const ctx = canvas.getContext("2d");
      const positions = canvas._positions;
      const W = canvas.width;
      const H = canvas.height;
      const hw = canvas._handW;
      const hh = canvas._handH;

      function drawHand(ctx, img, pos, hw, hh) {
        const { x, y, rot, scale, alpha } = pos;
        const w = hw * scale;
        const h = hh * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((rot * Math.PI) / 180);
        // Soft golden glow underneath
        ctx.shadowColor = "rgba(200, 166, 99, 0.35)";
        ctx.shadowBlur = 8 * scale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      if (handsToShow > rendered) {
        const end = Math.min(handsToShow, positions.length);
        for (let j = rendered; j < end; j++)
          drawHand(ctx, canvas._img, positions[j], hw, hh);
      } else {
        ctx.clearRect(0, 0, W, H);
        const end = Math.min(handsToShow, positions.length);
        for (let j = 0; j < end; j++)
          drawHand(ctx, canvas._img, positions[j], hw, hh);
      }
      canvas._rendered = handsToShow;
    },
  });

  // Scene 13 — Completion (golden light sweeps the procession)
  registerScene({
    selector: ".scene-completion",
    label: "108 chortens · one day · one offering",
    num: "13 / 15",
    act: "VI — The Invitation",
    update(p) {
      const light = $(".scene-completion .compl-light");
      const track = $(".scene-completion .compl-track");
      const copy = $(".scene-completion .compl-copy");
      if (light) setVar(light, "--p", clamp(p));
      // Light each chorten as the wave passes
      const chortens = $$(".compl-chorten");
      const perRow = 36;
      const litCols = Math.floor(clamp(p * 1.05) * perRow);
      chortens.forEach((c) => {
        const col = parseInt(c.dataset.index) % perRow;
        c.classList.toggle("lit", col < litCols);
      });
      if (copy) setVar(copy, "--p", clamp((p - 0.15) / 0.2));
    },
  });

  // 108.bt — pinned on desktop: the four places, then the dates along a
  // drawn line, then the button. Phones and reduced motion show it whole.
  registerScene({
    selector: ".scene-108bt",
    label: "A place for you among the 108",
    num: "13 / 15",
    act: "VI — The Invitation",
    update(p) {
      if (window.innerWidth <= 760 || reducedMotion) p = 1;
      const steps = $$(".scene-108bt .bt-step");
      // 4 places, 4 dates, button
      const at = [0.08, 0.16, 0.24, 0.32, 0.46, 0.54, 0.62, 0.7, 0.8];
      steps.forEach((el, i) => el.classList.toggle("show", p > (at[i] ?? 0.8)));
      const dates = $(".scene-108bt .bt-dates");
      if (dates)
        setVar(dates, "--line", easeOut(clamp((p - 0.42) / 0.3)));
    },
  });

  // Scene 14 — His Majesty's quote (second-last)
  registerScene({
    selector: ".scene-gesture",
    label: "A Royal initiative",
    num: "14 / 15",
    act: "VI — The Invitation",
    update(p) {
      const block = $(".scene-gesture .gesture-block");
      if (block) setVar(block, "--p", clamp(p));
    },
  });

  // Scene 15 — Invitation
  registerScene({
    selector: ".scene-invitation",
    label: "Four ways to take part",
    num: "15 / 15",
    act: "VI — The Invitation",
    // Desktop: the lede, then each card in turn, then the contact line.
    // Phones and reduced motion show it whole.
    update(p) {
      if (window.innerWidth <= 768 || reducedMotion) p = 1;
      const steps = $$(
        ".scene-invitation .inv-lede, .scene-invitation .inv-card, .scene-invitation .inv-meta",
      );
      steps.forEach((el, i) =>
        el.classList.toggle("show", p > 0.04 + i * 0.12),
      );
    },
  });

  /* ---------------- Multiplication grid setup ---------------- */
  // Build cells in DOM and compute centre-out order so the wave
  // looks like petals opening from the middle.
  function buildMultiplyGrid() {
    const grid = $(".scene-multiply .chorten-grid");
    if (!grid) return;
    const cols = 18,
      rows = 6; // 108 cells
    const cx = (cols - 1) / 2,
      cy = (rows - 1) / 2;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement("div");
        cell.className = "cg-cell";
        if (r === Math.floor(cy) && c === Math.floor(cx))
          cell.classList.add("center");
        cell.innerHTML = window.__chortenMiniSVG;
        // Random positional offset on the img inside the cell (no rotation, stays upright)
        const img = cell.querySelector("img");
        if (img) {
          const rx = (Math.random() - 0.5) * 50; // ±25% horizontal
          const ry = (Math.random() - 0.5) * 50; // ±25% vertical
          img.style.transform = `translate(${rx}%, ${ry}%)`;
        }
        // Distance from centre with slight jitter to break perfect rings
        const dx = c - cx,
          dy = r - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) + Math.random() * 0.15;
        cells.push({ el: cell, dist, idx: r * cols + c });
        grid.appendChild(cell);
      }
    }
    // Sort by dist, then assign order
    const sorted = [...cells].sort((a, b) => a.dist - b.dist);
    const order = new Array(cells.length);
    sorted.forEach((c, i) => {
      order[c.idx] = i;
    });
    window.__multiplyOrder = order;
  }

  /* ---------------- Spacing track setup ---------------- */
  function buildSpacingTrack() {
    const track = $(".scene-spacing .spacing-row");
    if (!track) return;
    // Render all 108 chortens; CSS zooms out to reveal the full procession
    const html = [];
    for (let i = 0; i < 108; i++) {
      html.push(`<div class="chorten-mini">${window.__chortenMiniSVG}</div>`);
    }
    track.innerHTML = html.join("");
  }

  /* ---------------- River SVG path setup ---------------- */
  function buildRiverPath() {
    const svg = $(".scene-river .river-svg");
    if (!svg) return;
    const w = 1200,
      h = 700;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const isMobile = window.innerWidth <= 768;
    svg.setAttribute(
      "preserveAspectRatio",
      isMobile ? "xMidYMid meet" : "xMidYMid slice",
    );
    // Mobile path is rebuilt from scratch to match rectification3's trajectory;
    // desktop keeps the existing upper-left bend composition.
    const d = isMobile
      ? `M -40 ${h * 0.56}
        C 95 ${h * 0.6}, 250 ${h * 0.67}, 400 ${h * 0.78}
        C 520 ${h * 0.88}, 600 ${h * 0.98}, 660 ${h * 1.08}
        C 730 ${h * 1.19}, 805 ${h * 1.31}, 900 ${h * 1.37}
        C 980 ${h * 1.42}, 1080 ${h * 1.47}, ${w + 110} ${h * 1.49}`
      : `M ${w - 560} ${h * 0.76}
        C ${w - 600} ${h * 0.74}, ${w - 660} ${h * 0.64}, ${w - 800} ${h * 0.52}
        C ${w - 900} ${h * 0.43}, ${w - 965} ${h * 0.4}, ${w - 1015} ${h * 0.36}
        C ${w - 1060} ${h * 0.32}, ${w - 1085} ${h * 0.28}, ${w - 1035} ${h * 0.27}`;
    const ns = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "river-path");
    svg.appendChild(path);
    const len = path.getTotalLength();
    path.setAttribute("stroke-dasharray", len);
    setVar(path, "--len", len);
    const styleNode = document.createElement("style");
    styleNode.textContent = `.scene-river .river-path{stroke-dasharray:${len};stroke-dashoffset:calc(${isMobile ? "" : "-"}${len} * (1 - var(--p,0)))}`;
    document.head.appendChild(styleNode);

    // Place fewer chorten markers along the river path.
    const riverMarkerCount = isMobile ? 20 : 35;
    const markerSize = isMobile ? 58 : 18;
    for (let i = 0; i < riverMarkerCount; i++) {
      const t = i / (riverMarkerCount - 1);
      const pt = path.getPointAtLength(t * len);
      const m = document.createElementNS(ns, "image");
      m.setAttribute("href", "/assets/chorten.png");
      m.setAttribute("x", (pt.x - markerSize / 2).toFixed(1));
      m.setAttribute("y", (pt.y - markerSize / 2).toFixed(1));
      m.setAttribute("width", String(markerSize));
      m.setAttribute("height", String(markerSize));
      m.setAttribute("class", "river-marker");
      svg.appendChild(m);
    }
  }

  /* ---------------- Stack column setup ---------------- */
  function buildStackColumn() {
    const col = $(".scene-stack .stack-column");
    if (!col) return;
    const N = 108;
    const html = [];
    for (let i = 0; i < N; i++) {
      html.push(`<div class="stack-unit">${window.__chortenMiniSVG}</div>`);
    }
    col.innerHTML = html.join("");
    // Stars
    const stars = $(".stack-stars");
    if (stars) {
      const s = [];
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const o = 0.4 + Math.random() * 0.5;
        s.push(
          `<div class="stack-star" style="left:${x}%;top:${y}%;opacity:${o}"></div>`,
        );
      }
      stars.innerHTML = s.join("");
    }
  }

  /* ---------------- Volunteers SVG setup ---------------- */
  function buildVolunteersSVG() {
    const svg = $(".scene-volunteers .vol-svg");
    if (!svg) return;
    const w = 1200,
      h = 700;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute(
      "preserveAspectRatio",
      window.innerWidth <= 768 ? "xMidYMid meet" : "xMidYMid slice",
    );
    const ns = "http://www.w3.org/2000/svg";
    // Graceful corridor curve — same shape as river-svg
    const d = `M 30 ${h * 0.78}
               C 180 ${h * 0.74}, 280 ${h * 0.5}, 420 ${h * 0.52}
               C 560 ${h * 0.54}, 660 ${h * 0.66}, 800 ${h * 0.52}
               C 940 ${h * 0.4}, 1040 ${h * 0.36}, ${w - 30} ${h * 0.34}`;
    const guide = document.createElementNS(ns, "path");
    guide.setAttribute("d", d);
    guide.setAttribute("fill", "none");
    guide.setAttribute("stroke", "rgba(200,166,99,0.18)");
    guide.setAttribute("stroke-width", "1");
    guide.setAttribute("stroke-dasharray", "3 6");
    svg.appendChild(guide);
    const len = guide.getTotalLength();
    // 108 sites
    for (let i = 0; i < 108; i++) {
      const pt = guide.getPointAtLength((i / 107) * len);
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", pt.x.toFixed(1));
      c.setAttribute("cy", pt.y.toFixed(1));
      c.setAttribute("r", "3.2");
      c.setAttribute("class", "vol-site");
      svg.appendChild(c);
    }
    // Soft halo rings (no criss-crossing lines) — they pulse outward at each site
    for (let i = 0; i < 12; i++) {
      const idx = i * 9 + 4;
      const pt = guide.getPointAtLength((idx / 107) * len);
      const ring = document.createElementNS(ns, "circle");
      ring.setAttribute("cx", pt.x.toFixed(1));
      ring.setAttribute("cy", pt.y.toFixed(1));
      ring.setAttribute("r", "14");
      ring.setAttribute("class", "vol-flow");
      svg.appendChild(ring);
    }
  }

  /* ---------------- Completion track setup ---------------- */
  function buildCompletionTrack() {
    const track = $(".scene-completion .compl-track");
    if (!track) return;
    const rows = 3;
    const perRow = 36; // 3 × 36 = 108
    let html = "";
    for (let r = 0; r < rows; r++) {
      html += `<div class="compl-row">`;
      for (let i = 0; i < perRow; i++) {
        html += `<div class="compl-chorten" data-index="${r * perRow + i}">${window.__chortenMiniSVG}</div>`;
      }
      html += `</div>`;
    }
    track.innerHTML = html;
  }

  /* ---------------- Why-108 mandala ---------------- */
  function buildWhyDots() {
    // No-op: mandala is now a single static image (why-mandala)
  }

  /* ---------------- Stable screen height ----------------
     A phone's address bar slides away and back as the page scrolls, and
     window.innerHeight (and a resize event) follows it. Re-measuring then
     resized every pinned stage mid-scroll and made progress jump. So on
     touch screens the height is taken once and again only when the width
     changes (a rotation); elsewhere (a desktop window) on every resize.
     --app-h stays measured rather than svh: some iPhone browsers (Brave)
     report vh/svh that don't match what they actually show.
  -------------------------------------------------------- */
  const root = document.documentElement;
  let stableVH = window.innerHeight;
  let measuredWidth = window.innerWidth;

  function setAppHeight() {
    stableVH = window.innerHeight;
    setVar(root, "--app-h", stableVH + "px");
    setVar(root, "--app-vh", stableVH / 100 + "px");
  }
  setAppHeight();

  let resizeTimer = null;
  window.addEventListener(
    "resize",
    () => {
      // Address-bar slides on a phone: same width, ignore.
      if (touch && window.innerWidth === measuredWidth) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measuredWidth = window.innerWidth;
        setAppHeight();
        sizes = new WeakMap();
        fitManpower();
        cacheSceneRects();
        invalidate();
      }, 150);
    },
    { passive: true },
  );

  // Workforce pins on phones only when it fits the screen; otherwise it
  // scrolls as a plain section with its bars filled, so nothing is cut off.
  // Rechecked only when the width changes, not when toolbars show/hide.
  let fitWidth = 0;
  function fitManpower() {
    if (window.innerWidth === fitWidth) return;
    fitWidth = window.innerWidth;
    const sec = $(".scene-manpower");
    const inner = sec && sec.querySelector(".stage__inner");
    if (!inner) return;
    sec.classList.toggle(
      "is-unpinned",
      window.innerWidth <= 768 && inner.offsetHeight > stableVH,
    );
  }

  /* ---------------- Scene rect cache ----------------
     Section positions and the page height are measured once, then again
     on resize or when the page's height changes (fonts, images, React).
     The frame loop works from these numbers alone, so it never asks the
     browser to lay the page out.
  ---------------------------------------------------- */
  let sceneCache = []; // [{top, height}]
  let docH = 1;

  function cacheSceneRects() {
    sceneCache = sceneDefs.map((s) => ({
      top: s.el.offsetTop,
      height: s.el.offsetHeight,
    }));
    docH = Math.max(1, root.scrollHeight - stableVH);
    wake();
  }

  /* ---------------- Main scroll loop ----------------
     Runs only while something is moving: a scroll event wakes it, and it
     goes back to sleep once the page is still and every scene has caught
     up. Scenes more than a screen away are skipped, and a scene whose
     progress hasn't changed isn't touched at all.
  ---------------------------------------------------- */
  const smoothP = {};
  const lastP = {};
  // Desktop eases progress after the wheel; touch screens and reduced
  // motion follow the scroll exactly. Where Lenis eases the wheel itself
  // (components/SmoothScroll.tsx) the scroll is already smooth, so progress
  // follows it exactly too, rather than being smoothed twice.
  const BASE_LERP = touch || reducedMotion ? 1 : 0.14;

  let floatBtn = null;
  let lastY = -1;

  /** Forget what every scene last drew, so each redraws on the next frame. */
  function invalidate() {
    for (const k in lastP) delete lastP[k];
    lastY = -1;
    wake();
  }

  /** One frame. Returns true while anything is still moving. */
  function tick() {
    const scrollY = window.scrollY || window.pageYOffset;
    const moved = scrollY !== lastY;
    lastY = scrollY;
    let settling = false;

    if (moved) {
      if (railFill)
        setVar(railFill, "transform", `scaleX(${clamp(scrollY / docH).toFixed(4)})`);
      document.body.classList.toggle("scrolled", scrollY > 50);
      if (!floatBtn || !floatBtn.isConnected)
        floatBtn = document.getElementById("float-top-btn");
      if (floatBtn) floatBtn.classList.toggle("visible", scrollY > stableVH * 0.8);
    }

    let activeIdx = 0;
    const mid = stableVH * 0.5;
    sceneDefs.forEach((s, i) => {
      const cache = sceneCache[i];
      if (!cache) return;

      const sceneTop = cache.top - scrollY; // relative to viewport
      const sceneBottom = sceneTop + cache.height;
      if (sceneTop <= mid && sceneBottom > mid) activeIdx = i;
      s.el.classList.toggle("is-past", sceneBottom < mid);

      // p from pure arithmetic — no layout reads.
      const travel = Math.max(1, cache.height - stableVH);
      const rawP = clamp(-sceneTop / travel);

      // Off screen (with a screen's margin): nothing to draw. Snap its
      // progress so it doesn't animate from a stale value when it returns.
      const near = sceneTop < stableVH * 1.5 && sceneBottom > -stableVH * 0.5;
      if (!near) {
        smoothP[i] = rawP;
        return;
      }

      let p = smoothP[i] === undefined ? rawP : smoothP[i];
      p += (rawP - p) * (window.__lenis ? 1 : BASE_LERP);
      if (Math.abs(p - rawP) < 0.0005) p = rawP;
      else settling = true;
      smoothP[i] = p;

      if (lastP[i] === p) return;
      lastP[i] = p;
      s.update(p);
    });
    setActiveScene(activeIdx);

    return moved || settling;
  }

  let running = false;
  function frame() {
    running = false;
    if (tick()) wake();
  }
  function wake() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  window.addEventListener("scroll", wake, { passive: true });

  /* ---------------- Init ---------------- */
  function init() {
    // Mini chorten image used throughout (multiplication, spacing, stack, completion)
    window.__chortenMiniSVG = `<img src="/assets/chorten.png" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;" />`;

    // Build dynamic content
    buildMultiplyGrid();
    buildSpacingTrack();
    buildRiverPath();
    buildStackColumn();
    buildVolunteersSVG();
    buildCompletionTrack();
    buildWhyDots();

    fitManpower();
    cacheSceneRects();

    // The page's height changes after load (fonts, images, React mounting a
    // section): re-measure then, at most once a frame.
    if (window.ResizeObserver) {
      let pending = false;
      new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          cacheSceneRects();
        });
      }).observe(document.body);
    }

    invalidate();
  }

  // Expose tick for screenshot harnesses where rAF is paused (document.hidden).
  window.__p108Tick = tick;

  let inited = false;

  function doInit() {
    if (inited) {
      // Re-entry on bfcache restore or font-settle: just re-cache rects
      cacheSceneRects();
      return;
    }
    inited = true;
    init();
  }

  function safeInit() {
    // On slower devices (especially iPhones), React hydration may not have
    // mounted scene components yet. Poll until at least one scene element
    // exists — typically 0-200ms on slow devices, instant on fast ones.
    function waitForScenes() {
      if (document.querySelector(".scene-what")) {
        doInit();
      } else {
        setTimeout(waitForScenes, 50);
      }
    }
    waitForScenes();
    // Re-cache after fonts settle (critical for Cormorant Garamond line heights)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        setTimeout(cacheSceneRects, 50);
      });
    }
  }

  if (document.readyState === "complete") {
    safeInit();
  } else {
    window.addEventListener("load", safeInit, { once: true });
  }

  // Safari bfcache: page is restored from cache — load event doesn't fire,
  // but pageshow does. Re-cache rects so animations start correctly.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      // Page restored from bfcache — measurements may be stale
      setTimeout(() => {
        cacheSceneRects();
        invalidate();
      }, 80);
    }
  });
})();
