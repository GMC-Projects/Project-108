"use client";

/**
 * An eased mouse wheel on desktop (Lenis), after 108bt-web's smooth-scroll.js.
 *
 * Only the wheel is eased. Touch screens, Safari and reduced motion keep the
 * browser's own scrolling: on a phone that stays on the compositor's fast
 * path, and in Safari a scroll set from script lands a frame apart from fixed
 * and sticky layers, which makes them shake. Keys, the scrollbar and history
 * stay native everywhere.
 *
 * Lenis moves the real window scroll, so scrollytelling.js keeps reading
 * window.scrollY as before; it sees window.__lenis and stops easing progress
 * itself, so the motion isn't smoothed twice.
 *
 * There is no permanent frame loop: Lenis is stepped only while a glide is
 * running, then the page is idle again.
 */

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

declare global {
  interface Window {
    __lenis?: Lenis | null;
  }
}

const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/** lerp: how much of the way the page goes each frame (lower glides more);
    wheelMultiplier: how far a notch goes. The defaults are the home page's;
    /gratitude passes 108bt-web's own (0.06, 0.7), for its long 3D story. */
export default function SmoothScroll({
  lerp = 0.1,
  wheelMultiplier = 0.9,
}: {
  lerp?: number;
  wheelMultiplier?: number;
}) {
  useEffect(() => {
    const mq = (q: string) => window.matchMedia(q).matches;
    if (mq("(prefers-reduced-motion: reduce)")) return;
    if (mq("(pointer: coarse)")) return;
    // WebKit only (Safari): its own wheel scrolling is already eased.
    if (CSS.supports("font", "-apple-system-body")) return;

    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      lerp,
      wheelMultiplier,
      // Menus, dialogs and anything that scrolls on its own keep their wheel.
      allowNestedScroll: true,
      prevent: (node) =>
        !!node.closest?.('dialog, [role="dialog"], [aria-modal="true"]'),
      // A modal locks the page with body overflow:hidden; leave the wheel
      // alone then, or the page would glide underneath it.
      virtualScroll: () => document.body.style.overflow !== "hidden",
    });
    window.__lenis = lenis;

    // Step Lenis only while it is moving the page.
    let raf = 0;
    const step = (now: number) => {
      raf = 0;
      lenis.raf(now);
      if (lenis.isScrolling) raf = requestAnimationFrame(step);
    };
    const glide = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };
    lenis.on("virtual-scroll", glide);

    // A scroll key or a press (the scrollbar's too) stops a glide where it
    // is, so the browser's own scroll takes over at once.
    const stop = () => {
      if (lenis.isScrolling === "smooth")
        lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        SCROLL_KEYS.has(e.key) &&
        !t?.closest?.("input, textarea, select, [contenteditable]")
      )
        stop();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", stop, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", stop, true);
      lenis.destroy();
      window.__lenis = null;
    };
  }, [lerp, wheelMultiplier]);

  return null;
}
