/**
 * The livestream link email, sent to everyone on the updates list before 1 November.
 *
 * Copy is the team's, near-verbatim. The broadcast times are computed from one
 * instant rather than typed per zone: six hand-entered times are six chances to
 * get a date line wrong (the US zones fall on Saturday 31 October).
 */

import { C, FONTS, esc, layout } from "./layout";

/** 108.bt — the offering platform, mentioned as a P.S. */
const OFFERING_URL = "https://108.bt";

const ZONES: { label: string; tz: string }[] = [
  { label: "Bhutan", tz: "Asia/Thimphu" },
  { label: "US Pacific", tz: "America/Los_Angeles" },
  { label: "US Eastern", tz: "America/New_York" },
  { label: "London", tz: "Europe/London" },
  { label: "Central Europe", tz: "Europe/Paris" },
  { label: "Taiwan / Singapore", tz: "Asia/Taipei" },
];

function inZone(at: Date, tz: string): { time: string; day: string } {
  return {
    time: at.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }),
    day: at.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }),
  };
}

/**
 * Outlook's phone app turns dates into blue calendar links, which breaks the design.
 * A zero-width non-joiner inside the month name stops the detection and is invisible.
 */
function noDateLink(s: string): string {
  return s.replace(/(January|February|March|April|May|June|July|August|September|October|November|December)/g, (m) => `${m.slice(0, 3)}&zwnj;${m.slice(3)}`);
}

export type LivestreamData = {
  /** The stream URL. Required: an email whose only job is a link cannot go without one. */
  link: string;
  /** When the broadcast begins. */
  startsAt: Date;
  /** Signed unsubscribe link for this recipient. */
  unsubscribeUrl: string;
};

export function livestreamEmail(d: LivestreamData): {
  subject: string;
  html: string;
  text: string;
} {
  if (!d.link) throw new Error("livestreamEmail: link is required");

  const rows = ZONES.map((z) => ({ ...z, ...inZone(d.startsAt, z.tz) }));
  const bhutan = rows[0];
  const link = esc(d.link);

  const p = `font-family:${FONTS.body};font-size:15px;line-height:1.8;color:${C.ink};margin:0 0 16px;`;
  const rule = `border-bottom:1px solid ${C.frameInner};`;
  const cell = `font-family:${FONTS.body};font-size:14px;color:${C.ink};padding:11px 0;${rule}`;

  const prayers =
    "Throughout the day, many in Bhutan will recite the six-syllable mantra, Om Mani Padme Hum, and other prayers, and you are welcome to join them.";
  const mantra =
    "Om Mani Padme Hum is the mantra of Chenrezig, the embodiment of compassion. Its six syllables are said to purify six emotions that bring suffering into the world—desire, anger, ignorance, pride, jealousy and greed—so that an open and compassionate heart can shine through. In Bhutan it is everywhere: murmured by elders turning prayer wheels, carved into stones along the paths, carried on the wind by prayer flags. To recite it, one needs only the wish that all beings be free.";

  const html = layout(
    `
      <div style="text-align:center;padding:4px 0 28px;">
        <div style="width:36px;height:1px;background:${C.gold};margin:0 auto 24px;"></div>
        <h2 style="font-family:${FONTS.display};font-size:32px;font-weight:300;font-style:italic;color:${C.ink};margin:0 0 8px;">Watch live</h2>
        <div style="font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${C.goldText};">${noDateLink(esc(bhutan.day))}</div>
        <div style="width:36px;height:1px;background:${C.gold};margin:24px auto 0;"></div>
      </div>

      <p style="${p}">Dear friends,</p>
      <p style="${p}margin-bottom:28px;">Thank you for registering to join Project 108. On Sunday, 1 Nov&zwnj;ember, 108 stupas will be raised in a single day along the Mau River in Gelephu Mindfulness City, as part of a Royal vision of His Majesty The King of Bhutan.</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr><td align="center" bgcolor="${C.maroon}" style="background:${C.maroon};border-radius:3px;border-bottom:2px solid ${C.gold};">
          <a href="${link}" style="display:inline-block;padding:16px 40px;font-family:${FONTS.utility};font-size:12px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${C.cream};text-decoration:none;">Watch live</a>
        </td></tr>
      </table>
      <div style="text-align:center;font-family:${FONTS.body};font-size:12px;color:${C.inkSoft};margin:12px 0 32px;word-break:break-all;">or open <a href="${link}" style="color:${C.maroon};">${link}</a></div>

      <div style="font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${C.goldText};margin-bottom:8px;">The broadcast begins</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.frameInner};margin-bottom:20px;">
        ${rows
          .map(
            (r, i) => `<tr>
          <td style="${cell}${i === 0 ? "font-weight:600;" : ""}">${r.label}</td>
          <td align="right" style="${cell}text-align:right;">${i === 0 ? `<b style="font-weight:600;">${r.time}</b>` : r.time} &middot; ${noDateLink(r.day)}</td>
        </tr>`,
          )
          .join("")}
      </table>

      <p style="${p}">The link will open when the broadcast begins. You may wish to save this email or add the time to your calendar.</p>
      <p style="${p}margin-bottom:24px;">Wherever you are, you are warmly invited to set your own intention for peace and let it rise with the stupas.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td bgcolor="${C.maroonDeep}" style="background:${C.maroonDeep};border-radius:4px;padding:22px 26px;">
        <div style="font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${C.gold};margin-bottom:8px;">Prayers for the day</div>
        <div style="font-family:${FONTS.display};font-size:19px;font-style:italic;font-weight:300;line-height:1.6;color:${C.cream};">${prayers}</div>
        <div style="font-family:${FONTS.body};font-size:14px;line-height:1.75;color:${C.cream};margin-top:14px;">${mantra}</div>
      </td></tr></table>

      <p style="font-family:${FONTS.body};font-size:15px;line-height:1.8;color:${C.ink};margin:0;">
        With prayers for peace,<br />
        <span style="font-family:${FONTS.display};font-size:18px;font-style:italic;">Project 108</span><br />
        <span style="font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${C.inkSoft};">Gelephu Mindfulness City, Bhutan</span>
      </p>

      <!-- 108.bt, as a P.S.: read last, so it never competes with "Watch live". -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;">
        <tr><td align="center" style="border-top:1px solid ${C.frameInner};padding-top:28px;text-align:center;">
          <div style="font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${C.goldText};">Also on Nov&zwnj;ember 1</div>
          <div style="font-family:${FONTS.display};font-size:24px;font-weight:300;font-style:italic;color:${C.ink};margin:8px 0 10px;">A Place For You Among the 108</div>
          <p style="font-family:${FONTS.body};font-size:14px;line-height:1.7;color:${C.inkSoft};margin:0 auto 14px;max-width:420px;">Leave an offering among the 108 stupas: a moment, a memory, a prayer. Kept sealed until Feb&zwnj;ruary 21, 2027.</p>
          <a href="${OFFERING_URL}" style="font-family:${FONTS.utility};font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${C.maroon};text-decoration:none;border-bottom:1px solid ${C.gold};padding-bottom:3px;">Visit 108.bt</a>
        </td></tr>
      </table>
    `,
    {
      unsubscribeUrl: d.unsubscribeUrl,
      unsubscribeReason: "You are receiving this because you asked for the livestream link.",
    },
  );

  const text = [
    `Dear friends,`,
    ``,
    `Thank you for registering to join Project 108. On Sunday, 1 November, 108 stupas will be raised in a single day along the Mau River in Gelephu Mindfulness City, as part of a Royal vision of His Majesty The King of Bhutan.`,
    ``,
    `Watch live: ${d.link}`,
    ``,
    `The broadcast begins:`,
    ``,
    ...rows.map((r) => `${r.time} ${r.day} — ${r.label}`),
    ``,
    `The link will open when the broadcast begins. You may wish to save this email or add the time to your calendar.`,
    ``,
    `Wherever you are, you are warmly invited to set your own intention for peace and let it rise with the stupas.`,
    ``,
    prayers,
    ``,
    mantra,
    ``,
    `With prayers for peace,`,
    ``,
    `Project 108, Gelephu Mindfulness City, Bhutan`,
    ``,
    `Also on November 1 — a place for you among the 108. Leave an offering among the 108 stupas: a moment, a memory, a prayer. Kept sealed until February 21, 2027. ${OFFERING_URL}`,
    ``,
    `Questions? Please contact 108@gmc.bt`,
    ``,
    `Unsubscribe: ${d.unsubscribeUrl}`,
  ].join("\n");

  return {
    subject: "Your link to watch 108 Stupas live on November 1",
    html,
    text,
  };
}
