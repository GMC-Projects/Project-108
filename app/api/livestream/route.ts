/**
 * The broadcast link and start time, for the page's Watch buttons.
 *
 * Read from the same p108_broadcasts row the livestream email uses. Every visitor
 * calls this once, so the row is held in memory for a minute rather than queried
 * per request.
 */

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { BROADCAST_ID } from "@/lib/broadcast";

export const revalidate = 0;

const TTL_MS = 60 * 1000;

type Livestream = { link: string | null; startsAt: string | null };

let cached: { at: number; value: Livestream } | null = null;

async function load(): Promise<Livestream> {
  if (!pool) return { link: null, startsAt: null };
  const r = await pool.query(
    `SELECT link, starts_at FROM p108_broadcasts WHERE id = $1`,
    [BROADCAST_ID],
  );
  const row = r.rows[0];
  const link = typeof row?.link === "string" && /^https:\/\//.test(row.link) ? row.link : null;
  return {
    link,
    startsAt: row?.starts_at ? new Date(row.starts_at).toISOString() : null,
  };
}

export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    try {
      cached = { at: Date.now(), value: await load() };
    } catch (e) {
      console.error("livestream: lookup failed", e);
      if (!cached) return NextResponse.json({ link: null, startsAt: null });
    }
  }
  return NextResponse.json(cached.value, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
