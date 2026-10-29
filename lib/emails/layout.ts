/**
 * The shared shell every Project 108 email sits in: frame, header, watermark, footer.
 *
 * Receipts and the livestream email both render through layout(), so a restyle here
 * reaches all of them at once. gmc-app's src/lib/email-templates-108.ts carries a copy
 * of this shell for the patron and payment-link emails — the two apps are separate
 * deployments and cannot share a module — so if this is restyled, restyle that too.
 *
 * EMAIL-SAFE BY CONSTRUCTION. Tables, inline styles, bgcolor attributes alongside
 * CSS backgrounds (Outlook ignores the CSS), and images instead of SVG or web fonts
 * wherever the look depends on them: Gmail renders neither SVG nor Cormorant, so the
 * "Project 108" wordmark, the ornamental divider and the watermark are PNGs served
 * from public/email/. Every image has width/height set and the layout reads fine
 * with images blocked.
 */

export const C = {
  maroon: "#4A1A2C",
  maroonDeep: "#3A1320",
  gold: "#C8A663",
  goldText: "#7E6230",
  frameInner: "#E4D3AE",
  cream: "#F2E9D8",
  creamLight: "#FAF6ED",
  ink: "#2D1419",
  inkSoft: "#5A3640",
  ruleLight: "rgba(74, 26, 44, 0.12)",
};

export const FONTS = {
  display: "'Cormorant Garamond', 'Georgia', 'Times New Roman', serif",
  body: "'Lora', 'Georgia', serif",
  utility: "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
};

/** Escape anything a person typed. Names and dedications reach an HTML body. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Where the email images live. They ship in this app's public/email/, so they deploy
 * with the code that references them. Absolute, because a mail client has no base URL.
 */
export const SITE_ORIGIN = (process.env.EMAIL_SITE_ORIGIN?.trim() || "https://108.gmc.bt").replace(/\/$/, "");
const IMG = `${SITE_ORIGIN}/email`;

export const CONTACT_EMAIL = "108@gmc.bt";

/**
 * Postal address for the email footer.
 *
 * Required by the client, and by the anti-spam rules of most jurisdictions the
 * campaign will reach: a commercial or campaign email must carry a physical address
 * someone could actually write to. Constructed from what GMCA supplied (postcode
 * 31101, Gelephu) — if a street or PO box exists it belongs here, since a postcode
 * alone is not somewhere post can be delivered.
 */
const POSTAL_ADDRESS =
  process.env.ORG_POSTAL_ADDRESS?.trim() ||
  "Gelephu Mindfulness City Authority, Gelephu 31101, Bhutan";

export type LayoutOptions = {
  /** Signed unsubscribe link. Omit for mail the person did not opt in to (a receipt). */
  unsubscribeUrl?: string;
  /** Why they are getting it, shown before the unsubscribe link. */
  unsubscribeReason?: string;
};

/** Nine chortens across the footer, the middle one taller. */
function chortenRow(): string {
  const img = (h: number) =>
    `<img src="${IMG}/chorten-small.png" width="${Math.round((h * 39) / 64)}" height="${h}" alt="" style="display:inline-block;border:0;margin:0 7px;vertical-align:bottom;" />`;
  return [22, 22, 22, 22, 32, 22, 22, 22, 22].map(img).join("");
}

/**
 * Keep the email in its light design when the reader's mail app is in dark mode.
 *
 * Two layers, both safe to ignore for clients that do not understand them:
 *   - `color-scheme: light only` (meta + CSS): Apple Mail, iOS Mail, Outlook for Mac
 *     and newer Outlook apps leave the email alone;
 *   - Outlook.com / Outlook apps rewrite colours and tag the elements they touched
 *     with data-ogsc (text) / data-ogsb (background). Every inline colour in the
 *     email gets a class here, and a matching !important rule puts the original
 *     back. Generated from the HTML itself, so any template using layout() is
 *     covered without hand-maintained class names.
 *   - Gmail on iOS inverts every colour in dark mode and turns the maroon pink. It
 *     leaves gradients alone, so maroon backgrounds are repeated as a one-colour
 *     linear-gradient; the cream text on them is wrapped in gmailLight(), the
 *     blend-mode trick that keeps it light (hteumeuleu.com, "Fixing Gmail's dark
 *     mode issues with CSS Blend Modes"). White areas are deliberately left to
 *     invert: forcing them white leaves Gmail's inverted text pale on white.
 */
const KEEP_BG = new Set(["4a1a2c", "3a1320"]);

/**
 * Light text that must stay light on a maroon background in Gmail's dark mode.
 * Outside Gmail the two spans do nothing (the rules are scoped to Gmail's markup).
 */
export function gmailLight(html: string): string {
  return `<span class="gm-screen"><span class="gm-diff">${html}</span></span>`;
}
function lightOnly(html: string): string {
  const fg = new Set<string>();
  const bg = new Set<string>();
  const tagged = html.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name: string, attrs: string) => {
    const style = /\sstyle="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const classes: string[] = [];
    const c = /(?:^|;)\s*color:\s*#([0-9a-fA-F]{6})\b/.exec(style);
    if (c) {
      const v = c[1].toLowerCase();
      fg.add(v);
      classes.push(`p108c-${v}`);
    }
    const b =
      /(?:^|;)\s*background(?:-color)?:\s*#([0-9a-fA-F]{6})\b/.exec(style) ??
      /\sbgcolor="#([0-9a-fA-F]{6})"/.exec(attrs);
    if (b) {
      const v = b[1].toLowerCase();
      bg.add(v);
      classes.push(`p108b-${v}`);
    }
    if (!classes.length) return tag;
    if (b && KEEP_BG.has(b[1].toLowerCase()) && !/background-image/.test(style)) {
      const g = `background-image:linear-gradient(#${b[1]},#${b[1]});`;
      attrs = attrs.replace(/\sstyle="([^"]*)"/, (_m, v: string) => ` style="${v.replace(/;?\s*$/, ";")}${g}"`);
    }
    const withClass = /\sclass="/.test(attrs)
      ? attrs.replace(/\sclass="([^"]*)"/, (_m, k: string) => ` class="${k} ${classes.join(" ")}"`)
      : ` class="${classes.join(" ")}"${attrs}`;
    return `<${name}${withClass}>`;
  });
  const rules = [
    ":root{color-scheme:light only;supported-color-schemes:light only;}",
    "u + .body .gm-screen{background:#000;mix-blend-mode:screen;}",
    "u + .body .gm-diff{background:#000;mix-blend-mode:difference;}",
    ...[...fg].map((v) => `[data-ogsc] .p108c-${v},.p108c-${v}[data-ogsc]{color:#${v} !important;}`),
    ...[...bg].map((v) => `[data-ogsb] .p108b-${v},.p108b-${v}[data-ogsb]{background-color:#${v} !important;}`),
  ].join("\n");
  return tagged.replace(
    "</head>",
    `  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <style>
${rules}
  </style>
</head>`,
  );
}

export function layout(body: string, opts: LayoutOptions = {}): string {
  const small = `font-family:${FONTS.body};font-size:12px;line-height:1.7;color:${C.inkSoft};`;
  const link = `color:${C.maroon};text-decoration:underline;`;

  return lightOnly(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Project 108</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Lora:wght@400;500;600&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
<body class="body" style="margin:0;padding:0;background:${C.creamLight};font-family:${FONTS.body};color:${C.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.creamLight}" style="background:${C.creamLight};">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${C.gold};">
        <tr><td style="padding:6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.frameInner};">

            <tr><td align="center" bgcolor="${C.maroon}" style="background:${C.maroon};border-top:2px solid ${C.gold};padding:34px 28px 28px;text-align:center;">
              <div style="font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.3em;text-transform:uppercase;color:${C.gold};">Gelephu Mindfulness City &middot; Bhutan</div>
              <img src="${IMG}/wordmark.png" width="168" height="37" alt="Project 108" style="display:block;border:0;margin:14px auto 0;font-family:${FONTS.display};font-size:34px;color:${C.cream};" />
              <img src="${IMG}/divider-gold.png" width="480" height="12" alt="" style="display:block;border:0;width:100%;max-width:480px;height:auto;margin:18px auto 16px;" />
              <div style="font-family:${FONTS.utility};font-size:9px;font-weight:500;letter-spacing:0.3em;text-transform:uppercase;color:#9E8282;">Jangchub Chortens</div>
            </td></tr>

            <tr><td background="${IMG}/watermark-108.png" style="background-image:url('${IMG}/watermark-108.png');background-repeat:no-repeat;background-position:center 30px;background-size:351px auto;padding:44px 40px 40px;">
              ${body}
            </td></tr>

            <tr><td align="center" style="padding:0 28px 30px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center" style="border-top:1px solid ${C.frameInner};padding-top:24px;font-size:0;line-height:0;">${chortenRow()}</td></tr>
              </table>
              <div style="margin-top:16px;font-family:${FONTS.utility};font-size:9px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:${C.maroon};">108 Jangchub Chortens Initiative</div>
              <div style="margin-top:8px;${small}">${POSTAL_ADDRESS}</div>
              <div style="${small}">Questions? Write to <a href="mailto:${CONTACT_EMAIL}" style="${link}">${CONTACT_EMAIL}</a> &middot; <a href="${SITE_ORIGIN}" style="${link}">${SITE_ORIGIN.replace(/^https?:\/\//, "")}</a></div>
              ${
                opts.unsubscribeUrl
                  ? `<div style="margin-top:10px;${small}font-size:11px;">${opts.unsubscribeReason ?? "You are receiving updates because you asked to stay connected."} <a href="${opts.unsubscribeUrl}" style="${link}">Unsubscribe</a>.</div>`
                  : ""
              }
            </td></tr>

          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`);
}
