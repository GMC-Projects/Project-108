/**
 * Outbound links to 108.bt and the 1 November broadcast, and the calendar that
 * decides which of them the page puts first.
 *
 * The stream link saved in p108_broadcasts (from the gmc-app dashboard, for the
 * livestream email) wins when set, via /api/livestream; LIVESTREAM_URL is the
 * fallback so the page never waits on the database for it.
 */

export const OFFERING_URL = "https://108.bt";

export const LIVESTREAM_URL = "https://www.youtube.com/live/gzFGM1R3dDA";

/** Tags every 108.bt link with where on this site it was clicked. */
export function offeringHref(spot: string): string {
  const qs = new URLSearchParams({
    utm_source: "108.gmc.bt",
    utm_medium: "referral",
    utm_content: spot,
  });
  return `${OFFERING_URL}/?${qs.toString()}`;
}

/** Used until the broadcast row has a start time. Bhutan is UTC+6. */
export const DEFAULT_STREAM_START = "2026-11-01T06:00:00+06:00";

const LIVE_LEAD_MS = 60 * 60 * 1000;
const DAY_ENDS = Date.parse("2026-11-02T00:00:00+06:00");
const PLACING_CLOSES = Date.parse("2026-11-16T00:00:00+06:00");

export type Phase = "before" | "live" | "after" | "sealed";

/**
 * before — up to an hour ahead of the broadcast
 * live   — from then until midnight Bhutan time on 1 November
 * after  — placing on 108.bt still open (closes 15 November, 23:59)
 * sealed — until the reveal on 21 February 2027
 */
export function phaseAt(now: number, startsAt: string | null): Phase {
  const start = Date.parse(startsAt ?? DEFAULT_STREAM_START);
  if (now < start - LIVE_LEAD_MS) return "before";
  if (now < DAY_ENDS) return "live";
  if (now < PLACING_CLOSES) return "after";
  return "sealed";
}
