// Films one seated person of /gratitude from all round, for looking the
// figure over (development server only): window.__grOrbit in chortenScene.ts.
//   node scripts/orbit.mjs --out /tmp/orbit.mp4 [--r 1.6] [--h 0.9] [--frames 48]
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const out = args.out ?? join(tmpdir(), "orbit.mp4");
const r = Number(args.r ?? 1.6), h = Number(args.h ?? 0.9), frames = Number(args.frames ?? 48);
const work = mkdtempSync(join(tmpdir(), "orbit-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${join(work, "profile")}`, "about:blank"]);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
await wait(3000);
const tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res) => (ws.onopen = res));
let id = 0;
const pending = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/gratitude" });
for (let i = 0; i < 60 && !(await evaluate("typeof window.__grFrame === 'function' && !!document.querySelector('canvas')")); i++) await wait(500);
await wait(6000);
const y = await evaluate(`(() => { const c = document.querySelector('[data-ch="close"]'); return c.offsetTop + (c.offsetHeight - innerHeight) * 0.9; })()`);
for (let i = 0; i < 40; i++) await evaluate(`window.__grFrame(${y}, 1/12)`);
for (let i = 0; i < frames; i++) {
  const a = (i / frames) * Math.PI * 2;
  await evaluate(`window.__grOrbit = { a: ${a}, r: ${r}, h: ${h} }; window.__grFrame(${y}, 1/12)`);
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  writeFileSync(join(work, `f${String(i).padStart(4, "0")}.jpg`), Buffer.from(shot.data, "base64"));
}
ws.close();
chrome.kill();
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", join(work, "f%04d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", out], { stdio: "inherit" });
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", out, "-vf", `select='not(mod(n\\,${Math.max(1, Math.round(frames / 8))}))',scale=480:-1,tile=4x2`, "-frames:v", "1", out.replace(/\.mp4$/, "-sheet.jpg")], { stdio: "inherit" });
rmSync(work, { recursive: true, force: true });
console.log(`orbit ${out}`);
