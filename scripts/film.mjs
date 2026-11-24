// Films a stretch of /gratitude as it plays when scrolled at a steady pace,
// for judging motion rather than still frames. Development server only: it
// drives the page's window.__grFrame hook (GratitudeStory.tsx), one frame at
// a time with a fixed timestep, so the easing is exactly as at full speed
// however slowly headless Chrome draws.
//
//   node scripts/film.mjs --chapter raise --from 0 --to 0.3 --seconds 8 --out /tmp/raise.mp4
//
// Writes the MP4 and, beside it, a contact sheet of every sixth frame.
// Options: --url (http://localhost:3000/gratitude) --fps (24) --width (1280)
// --height (800) --settle (seconds held at the start before filming, 1.5).

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const url = args.url ?? "http://localhost:3000/gratitude";
const chapter = args.chapter ?? "raise";
const from = Number(args.from ?? 0);
const to = Number(args.to ?? 1);
const seconds = Number(args.seconds ?? 8);
const fps = Number(args.fps ?? 24);
const width = Number(args.width ?? 1280);
const height = Number(args.height ?? 800);
const settle = Number(args.settle ?? 1.5);
const out = args.out ?? join(tmpdir(), `${chapter}-${from}-${to}.mp4`);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "film-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  "--hide-scrollbars",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  `--user-data-dir=${join(work, "profile")}`,
  "about:blank",
]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(3000);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = {};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending[m.id]) {
    pending[m.id](m.result);
    delete pending[m.id];
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending[i] = r;
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
for (let i = 0; i < 60 && !(await evaluate("typeof window.__grFrame === 'function' && !!document.querySelector('canvas')")); i++) await wait(500);
await wait(6000); // the scene's models and textures

const yAt = (p) =>
  evaluate(`(() => { const c = document.querySelector('[data-ch="${chapter}"]'); return c.offsetTop + (c.offsetHeight - innerHeight) * ${p}; })()`);
const y0 = await yAt(from);
const y1 = await yAt(to);
const dt = 1 / fps;
for (let i = 0; i < settle * fps; i++) await evaluate(`window.__grFrame(${y0}, ${dt})`);

const frames = Math.round(seconds * fps);
for (let i = 0; i < frames; i++) {
  const y = y0 + (y1 - y0) * (i / Math.max(1, frames - 1));
  await evaluate(`window.__grFrame(${y}, ${dt})`);
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  writeFileSync(join(work, `f${String(i).padStart(5, "0")}.jpg`), Buffer.from(shot.data, "base64"));
  if (i % fps === 0) process.stdout.write(`${i}/${frames}\n`);
}
ws.close();
chrome.kill();

spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(work, "f%05d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", out], { stdio: "inherit" });
const sheet = out.replace(/\.mp4$/, "-sheet.jpg");
spawnSync(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-i", out, "-vf", `select='not(mod(n\\,6))',scale=320:-1,tile=6x${Math.ceil(frames / 36)}`, "-frames:v", "1", "-update", "1", sheet],
  { stdio: "inherit" },
);
rmSync(work, { recursive: true, force: true });
console.log(`film  ${out}\nsheet ${sheet}`);
