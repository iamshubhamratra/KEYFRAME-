// AI VIDEO EDIT — LIVE end-to-end browser run: the real App against the real backend and real providers.
//
// Unlike ai-edit.smoke.mjs (client fixtures), this one starts server/scripts/video_edit_e2e.js --live --idle
// (the real /api/video-edits router, store, pipeline, renderer and QA in a scratch dir; billed OpenRouter/KIE calls,
// capped per project) on :8080, the Vite dev server proxying /api to it, and drives Chrome through the user's flow:
// upload a talking-head take → analysis screen → editor with the automatic preview → remove a B-roll → Update
// preview → export 1080p → download links. Screenshots go to KF_SMOKE_SHOTS.
//
//   node web/tests/smoke/ai-edit.live.mjs [path/to/take.mp4]
//
// Only /api/auth/me is intercepted (a logged-in user); the harness authenticates by the ve_e2e_user cookie.

import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../..");
const SERVER = path.resolve(WEB, "../server");
const SHOTS = process.env.KF_SMOKE_SHOTS || path.join(os.tmpdir(), "kf-ai-edit-live");
const TAKE = path.resolve(process.argv[2] || path.join(SERVER, "test-fixtures/video_edit/talking_20s_en_vertical.mp4"));
mkdirSync(SHOTS, { recursive: true });

const require = createRequire(path.join(SERVER, "package.json"));
const puppeteer = require("puppeteer-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== "" ? ` — ${detail}` : ""}`); };

function newestChrome() {
  if (process.env.KF_CHROME) return process.env.KF_CHROME;
  const base = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  for (const dir of readdirSync(base).filter((d) => d.startsWith("win64-")).sort().reverse()) {
    const exe = path.join(base, dir, "chrome-win64", "chrome.exe");
    if (existsSync(exe)) return exe;
  }
  throw new Error(`no chrome-win64/chrome.exe under ${base}`);
}
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.unref(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const kill = (child) => { if (!child) return; try { execSync(process.platform === "win32" ? `taskkill /PID ${child.pid} /T /F` : `kill -9 ${child.pid}`, { stdio: "ignore" }); } catch { /* gone */ } };
// Retries across in-page navigations (the analysis → editor handoff replaces the execution context).
const waitFor = async (page, fn, arg, timeout) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { await page.waitForFunction(fn, { timeout: Math.max(1000, end - Date.now()), polling: 250 }, arg); return true; }
    catch (e) { if (/timeout/i.test(String(e && e.message))) return false; await sleep(500); }
  }
  return false;
};
const clickText = (page, selector, needle) => page.evaluate((sel, n) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(n) && e.getBoundingClientRect().width > 0 && !e.disabled);
  if (!el) return false;
  el.scrollIntoView({ block: "center" });
  el.click();
  return true;
}, selector, needle);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const previewRev = (page) => page.evaluate(() => { const m = document.body.textContent.match(/PREVIEW r(\d+)/); return m ? Number(m[1]) : null; });

// ---- backend (real) + vite ----------------------------------------------------------------------------
const harnessDir = mkdtempSync(path.join(os.tmpdir(), "kf-live-"));
const PORT = await freePort();
const ORIGIN = `http://localhost:${PORT}`;
// The Origin guard admits only WEB_ORIGIN / same origin / :5173 — the random dev port is declared like a split deploy.
const harness = spawn(process.execPath, [path.join(SERVER, "scripts/video_edit_e2e.js"), "--live", "--idle", "--serve", "8080", "--dir", harnessDir], { cwd: SERVER, stdio: "pipe", env: { ...process.env, WEB_ORIGIN: ORIGIN } });
let harnessLog = "";
harness.stdout.on("data", (d) => { harnessLog += d; });
harness.stderr.on("data", (d) => { harnessLog += d; });
const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "localhost"], { cwd: WEB, shell: true, stdio: "pipe", env: { ...process.env, BROWSER: "none" } });

let browser;
try {
  for (let i = 0; i < 120 && !/idle: serving/.test(harnessLog); i++) await sleep(500);
  if (!/idle: serving/.test(harnessLog)) throw new Error(`harness did not start:\n${harnessLog.slice(-2000)}`);
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`${ORIGIN}/`)).ok; } catch { await sleep(500); } }
  if (!up) throw new Error("vite did not start");
  await fetch(`${ORIGIN}/src/main.jsx`).catch(() => {});

  browser = await puppeteer.launch({ executablePath: newestChrome(), headless: true, args: ["--no-sandbox", "--disable-gpu", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie({ name: "ve_e2e_user", value: "e2e-user", domain: "localhost", path: "/" });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.origin === ORIGIN && u.pathname === "/api/auth/me") {
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "e2e-user", name: "Live Tester", email: "live@example.test", role: "user" } }) });
    } else if (u.origin === ORIGIN && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/video-edits")) {
      req.respond({ status: 200, contentType: "application/json", body: "{}" });
    } else req.continue();
  });
  page.on("console", (m) => { if (m.type() === "error" && !/WebGL|three|favicon/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
  page.on("response", (res) => { const u = new URL(res.url()); if (u.pathname.startsWith("/api/video-edits") && !/\/(progress|events)$/.test(u.pathname) && (res.status() >= 400 || res.request().method() !== "GET")) console.log(`  api ${res.request().method()} ${u.pathname} → ${res.status()}`); });

  // ---- upload -----------------------------------------------------------------------------------------
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => window.postMessage({ type: "kf-ai-edit" }, window.location.origin));
  const DROP = 'button[aria-describedby^="kf-drop-limits"]';
  check("upload page opens", await waitFor(page, (s) => !!document.querySelector(s), DROP, 15000));
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 8000 }), page.click(DROP)]);
  await chooser.accept([TAKE]);
  check("take accepted (name + resolution shown)", await waitFor(page, (n) => document.body.textContent.includes(n), path.basename(TAKE), 15000));
  await page.click("input[type=checkbox]");
  await shot(page, "01-upload");
  const cta = await page.evaluate(() => { const b = document.querySelector("button.kf-up-cta"); return b ? { disabled: b.disabled, text: b.textContent } : null; });
  console.log(`  start button: ${JSON.stringify(cta)}`);
  await page.evaluate(() => document.querySelector("button.kf-up-cta").scrollIntoView({ block: "center" }));
  await page.click("button.kf-up-cta");
  await sleep(3000);
  console.log(`  alerts: ${await page.evaluate(() => [...document.querySelectorAll("[role=alert],[role=status]")].map((e) => e.textContent.trim()).filter(Boolean).join(" | ").slice(0, 400))}`);
  check("upload hands off to the session (?edit=<id>)", await waitFor(page, () => /[?&]edit=ve_[0-9a-z]{16}/.test(location.search), null, 120000));
  check("analysis screen shows stages", await waitFor(page, () => !!document.querySelector('ol[aria-label="Edit stages"]'), null, 30000));
  await sleep(20000);
  await shot(page, "02-analysis");

  // ---- editor with the automatic preview --------------------------------------------------------------
  const t0 = Date.now();
  const inEditor = await waitFor(page, () => !!document.getElementById("kf-tab-captions") && /PREVIEW r\d+/.test(document.body.textContent), null, 15 * 60 * 1000);
  check("editor opens with a real preview render", inEditor, `${Math.round((Date.now() - t0) / 1000)} s after analysis started`);
  const loaded = await waitFor(page, () => [...document.querySelectorAll("video")].some((v) => v.readyState >= 2 && v.videoWidth > 0), null, 60000);
  check("preview <video> loads the server render (media route + auth)", loaded);
  const chips = await page.evaluate(() => document.body.textContent.match(/AI EDIT SUMMARY(.{0,200})/)?.[1] || "");
  check("AI edit summary chips are shown", /CAPTIONS/i.test(chips), chips.slice(0, 120));
  await sleep(1500);
  await shot(page, "03-editor");

  // ---- remove a B-roll → Update preview -----------------------------------------------------------------
  const rev0 = await previewRev(page);
  const brTab = await page.$("#kf-tab-broll");
  if (brTab) {
    await brTab.click();
    await sleep(800);
    const removed = await clickText(page, "#kf-panel-broll button", "Remove");
    check("B-roll panel: Remove", removed);
    if (removed) {
      await sleep(1500);
      await clickText(page, "button", "Update preview");
      const updated = await waitFor(page, (r) => { const m = document.body.textContent.match(/PREVIEW r(\d+)/); return m && Number(m[1]) > r; }, rev0, 5 * 60 * 1000);
      check("preview updates to the new revision after the edit", updated, `${rev0} → ${await previewRev(page)}`);
      await shot(page, "04-after-edit");
    }
  } else check("B-roll tab present", false);

  // ---- export -------------------------------------------------------------------------------------------
  await clickText(page, "button", "Export");
  check("export dialog opens", await waitFor(page, () => document.body.textContent.includes("Export your edit"), null, 10000));
  await shot(page, "05-export-dialog");
  await clickText(page, "button.btn-mag", "Export 1080p");
  const wrapped = await waitFor(page, () => document.body.textContent.includes("That's a wrap"), null, 15 * 60 * 1000);
  check("export finishes (That's a wrap.)", wrapped);
  check("export offers the MP4 download", await page.evaluate(() => [...document.querySelectorAll("a, button")].some((e) => /\.mp4|MP4/.test(e.textContent))));
  await shot(page, "06-export-done");
  check("no console errors from the AI edit screens", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  check("run completed", false, String(e && e.message || e).split("\n")[0]);
} finally {
  try { if (browser) await browser.close(); } catch { /* noop */ }
  kill(vite);
  kill(harness);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed · screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}
