// Stills of /gratitude at chosen points in its scroll, with Playwright.
// Development only: drives the page's window.__grFrame hook (GratitudeStory.tsx),
// so each still is the page settled at that point, eased as at full speed.
//
//   node scripts/shoot.mjs --out /tmp/shots open:0 raise:0.5 close:0.8@crop=300,200,600,340
//
// Each shot is chapter:progress, optionally @crop=w,h,x,y (in CSS pixels), and
// @cam=ex,ey,ez,ax,ay,az (scene units) to look from eye to at in place of the
// story's camera (chortenScene.ts's window.__grCam), e.g. raise:0.78@cam=300,6,-40,320,0,-60.
// Options: --url (http://localhost:3000/gratitude) --width (1440) --height (900)
// --device (a Playwright device name, e.g. "iPhone 15", in place of width/height)
// --settle (frames drawn at each point before the still, 90) --gpu (0 to use
// software rendering), --bare (1 to hide the page's text, the picture alone).
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opts = {};
const shots = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[++i];
  else shots.push(argv[i]);
}
const url = opts.url ?? "http://localhost:3000/gratitude";
const out = opts.out ?? "/tmp/gratitude-shots";
const settle = Number(opts.settle ?? 90);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: opts.gpu === "0" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext(
  opts.device ? devices[opts.device] : { viewport: { width: Number(opts.width ?? 1440), height: Number(opts.height ?? 900) }, deviceScaleFactor: Number(opts.scale ?? 1) },
);
const page = await context.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(url);
await page.waitForFunction(() => typeof window.__grFrame === "function", null, { timeout: 60000 });
await page.waitForTimeout(4000);
// (--bare 1: the page's text and controls hidden, the picture alone.)
if (opts.bare === "1") await page.addStyleTag({ content: "body * { visibility: hidden !important; } canvas { visibility: visible !important; }" });

for (const spec of shots) {
  const [where, ...tags] = spec.split("@");
  const crop = tags.find((t) => t.startsWith("crop="))?.slice(5);
  const cam = tags.find((t) => t.startsWith("cam="))?.slice(4);
  await page.evaluate((c) => {
    window.__grCam = c ? { eye: c.slice(0, 3), at: c.slice(3, 6) } : undefined;
  }, cam ? cam.split(",").map(Number) : null);
  const [chapter, p] = where.split(":");
  const y = await page.evaluate(
    ([ch, at]) => {
      const c = document.querySelector(`[data-ch="${ch}"]`);
      return c.offsetTop + (c.offsetHeight - innerHeight) * at;
    },
    [chapter, Number(p)],
  );
  await page.evaluate(([top, n]) => {
    for (let i = 0; i < n; i++) window.__grFrame(top, 1 / 24);
  }, [y, settle]);
  const name = `${chapter}-${p}${crop ? "-crop" : ""}${cam ? `-cam${cam.replaceAll(",", "_")}` : ""}.jpg`;
  const clip = crop ? (([w, h, x, cy]) => ({ width: w, height: h, x, y: cy }))(crop.split(",").map(Number)) : undefined;
  await page.screenshot({ path: join(out, name), type: "jpeg", quality: 80, clip });
  console.log(join(out, name));
}
await browser.close();
