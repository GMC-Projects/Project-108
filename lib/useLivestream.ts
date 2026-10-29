"use client";

import { useEffect, useState } from "react";
import { LIVESTREAM_URL, phaseAt, type Phase } from "@/lib/links";

type Livestream = { link: string | null; startsAt: string | null };

// Several components ask at once; they share one request.
let request: Promise<Livestream> | null = null;

function fetchLivestream(): Promise<Livestream> {
  if (!request) {
    const base = window.location.pathname.startsWith("/108") ? "/108" : "";
    request = fetch(`${base}/api/livestream`)
      .then((r) => (r.ok ? r.json() : { link: null, startsAt: null }))
      .catch(() => ({ link: null, startsAt: null }));
  }
  return request;
}

/**
 * The current phase and stream link. Starts as "before" — what the page is
 * prerendered with — and settles after mount, so hydration matches.
 * Rechecked every minute so an open tab turns live on its own.
 */
export function useLivestream(): { phase: Phase; link: string } {
  const [data, setData] = useState<Livestream>({ link: null, startsAt: null });
  const [phase, setPhase] = useState<Phase>("before");

  useEffect(() => {
    let alive = true;
    fetchLivestream().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => setPhase(phaseAt(Date.now(), data.startsAt));
    tick();
    const id = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(id);
  }, [data.startsAt]);

  return { phase, link: data.link ?? LIVESTREAM_URL };
}
