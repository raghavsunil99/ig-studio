// Capture README screenshots from the demo app with headless Chrome (no dependencies).
//   python3 demo_seed.py && python3 app.py --demo     (in another terminal)
//   node scripts/screenshots.mjs
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshots");
const FRAMES = join(OUT, "frames");
const BASE = process.env.IG_STUDIO_URL || "http://127.0.0.1:8766";
const CHROME = process.env.CHROME || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; // any Chromium browser
const W = 1280, H = 820, PORT = 9333;
mkdirSync(FRAMES, { recursive: true });

const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "igs-"))}`,
  `--window-size=${W},${H}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function go(path, theme = "dark") {
  await send("Page.navigate", { url: `${BASE}/?theme=${theme}${path}` });
  await sleep(1500);
}
async function shot(name, { frame = true } = {}) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const buf = Buffer.from(r.result.data, "base64");
  if (name) writeFileSync(join(OUT, name + ".png"), buf);
  if (frame) writeFileSync(join(FRAMES, String(++shot.n).padStart(2, "0") + ".png"), buf);
  console.log("  shot", name || `frame ${shot.n}`);
}
shot.n = 0;
async function hover(sel) {
  const p = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await sleep(300);
}
const scrollTo = (sel, off = 16) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - ${off}); })()`);

(async () => {
  await connect();
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

  // Dashboard
  await go("#dash");
  await shot("dashboard-dark");
  await scrollTo(".cols", 300);
  await hover(".col:nth-of-type(9)");
  await shot("chart-hover");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  await js(`document.querySelector('.tip-pop').classList.remove('show')`); await sleep(300);
  await scrollTo(".split-row", 380);
  await shot("reach-and-formats");
  await go("#dash/content"); await sleep(300); await scrollTo(".ig-tabs", 20);
  await js(`document.querySelector('th[data-k="views"]').click()`);
  await shot("content-table");
  await go("#dash/insights"); await sleep(300); await scrollTo(".ig-tabs", 20);
  await shot("insights");
  await go("#dash", "light");
  await shot("dashboard-light");

  // Writing with Claude (demo replays a canned run)
  await go("#ig-reel");
  await js(`(() => { const t = document.querySelector('#txt'); t.value = "Why freshers' resumes get rejected in 6 seconds"; document.querySelector('#go').click(); })()`);
  await sleep(6500);
  await shot("progress");
  await sleep(8000);
  await scrollTo("#out", 20);
  await shot("reel-result");

  // Profile score from a saved result
  await go("#ig-profile");
  await sleep(500);
  await js(`(() => { const s = document.querySelector('#saved'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); })()`);
  await sleep(800);
  await scrollTo(".ig-h", 20);
  await shot("profile-score");

  // Free checkers
  await go("#hookscore");
  await js(`(() => { document.querySelector('#txt').value = "Recruiters open your resume for 6 seconds. Here's what they see.\\nStop sending your resume as a Word file.\\nI reviewed 200 fresher resumes last month.\\nResume tips for freshers"; document.querySelector('#go').click(); })()`);
  await sleep(1500);
  await shot("hook-scorer");
  await go("#humanize");
  await js(`(() => { document.querySelector('#txt').value = "In today's fast-paced world, it's crucial to delve into your resume — it's a game-changer. Let's unlock your potential and elevate your career journey."; document.querySelector('#go').click(); })()`);
  await sleep(1500);
  await shot("strip-ai-tells");

  ws.close(); chrome.kill();
  console.log("done ->", OUT);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
