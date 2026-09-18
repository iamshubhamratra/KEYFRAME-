// AI VIDEO EDIT — end-to-end smoke test against the REAL App (UX.md §7, second bullet).
//
// Starts the Vite dev server with VITE_AI_EDIT_FIXTURES=1 on a free port, drives it with puppeteer-core
// (resolved from server/node_modules) and the newest Chrome in the puppeteer cache. /api/auth/me is
// intercepted to return a logged-in user; /api/video-edits/** is served in-memory by editApi's fixture
// mode (any such request reaching the network is a failure). Screenshots go to KF_SMOKE_SHOTS.
//
//   node web/tests/smoke/ai-edit.smoke.mjs
//
// Env: KF_SMOKE_SHOTS (screenshot dir) · KF_SMOKE_MEDIA (dir with take-ok.webm, take-huge.mp4) ·
//      KF_SMOKE_VIDEO (an .mp4 used as preview/export media) · KF_CHROME (chrome.exe override).
// axe-core is not vendored in this repo and CDNs are not allowed offline, so the axe pass is skipped
// with a logged note unless an axe-core copy is found in web/ or server/ node_modules.

import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../..");
const SERVER = path.resolve(WEB, "../server");
const SHOTS = process.env.KF_SMOKE_SHOTS || path.join(os.tmpdir(), "kf-ai-edit-smoke");
const MEDIA = process.env.KF_SMOKE_MEDIA || "";
const VIDEO = process.env.KF_SMOKE_VIDEO || "";
mkdirSync(SHOTS, { recursive: true });

const require = createRequire(path.join(SERVER, "package.json"));
const puppeteer = require("puppeteer-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READY = JSON.parse(readFileSync(path.join(WEB, "tests/fixtures/edit-ready.json"), "utf8"));
const READY_ID = READY.project?.id || "ve_readydemo0000001";
// B-roll #3 of the ready fixture (br_growth03): its output start and the transcript words it anchors to.
const BR3_OUT_IN = 27.561;
const BR3_WORDS = ["72", "73", "74", "75"];

function newestChrome() {
  if (process.env.KF_CHROME) return process.env.KF_CHROME;
  const base = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  const cmp = (a, b) => { const pa = a.split(/[-.]/).map(Number).filter(Number.isFinite); const pb = b.split(/[-.]/).map(Number).filter(Number.isFinite); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0); } return 0; };
  for (const dir of readdirSync(base).filter((d) => d.startsWith("win64-")).sort(cmp)) {
    const exe = path.join(base, dir, "chrome-win64", "chrome.exe");
    if (existsSync(exe)) return exe;
  }
  throw new Error(`no chrome-win64/chrome.exe under ${base}`);
}
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.unref(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

// ----------------------------------------------------------------- results
const results = [];
const notes = [];
const errors = [];
let phase = "boot";
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== "" ? ` — ${detail}` : ""}`); };
const note = (msg) => { notes.push(msg); console.log(`NOTE ${msg}`); };
async function section(name, fn) {
  phase = name;
  try { await fn(); } catch (err) { check(`section "${name}" ran to completion`, false, String(err?.message || err).split("\n")[0]); }
}
async function waitFor(page, fn, arg, timeout = 15000) {
  try { await page.waitForFunction(fn, { timeout, polling: 100 }, arg); return true; } catch { return false; }
}
const bodyHas = (page, needle, timeout = 15000) => waitFor(page, (n) => document.body.textContent.includes(n), needle, timeout);
const clickText = (page, selector, needle) => page.evaluate((sel, n) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(n) && e.getBoundingClientRect().width > 0);
  if (!el) return false;
  el.scrollIntoView({ block: "center" });
  el.click();
  return true;
}, selector, needle);
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts });
const clockTime = (page) => page.evaluate(async () => (await import("/src/playerClock.js")).playerClock.getTime());
const revision = (page) => page.evaluate(() => { const m = document.querySelector(".kf-ed-head")?.textContent.match(/· r(\d+)/); return m ? Number(m[1]) : null; });
const DROP = 'button[aria-describedby^="kf-drop-limits"]';

async function chooseFile(page, file, { keyboard = false } = {}) {
  await page.waitForSelector(DROP, { timeout: 10000 });
  const btn = await page.$(DROP);
  if (keyboard) await btn.focus();
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 6000 }), keyboard ? page.keyboard.press("Enter") : btn.click()]);
  await chooser.accept([file]);
}

async function audit(page, rootSel, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no horizontal page scroll · ${label}`, overflow <= 0, `${overflow}px`);
  const unnamed = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return ["<root missing>"];
    return [...root.querySelectorAll("button, [role=switch], [role=radio], [role=tab], [role=slider], input, select, textarea")]
      .filter((el) => el.getBoundingClientRect().width > 0 && el.type !== "file" && !el.closest('[aria-hidden="true"]'))
      .filter((el) => {
        const name = (el.getAttribute("aria-label") || "").trim()
          || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join("").trim()
          || (el.labels && [...el.labels].map((l) => l.textContent).join("").trim())
          || el.textContent.trim();
        return !name;
      }).map((el) => el.outerHTML.slice(0, 90));
  }, rootSel);
  check(`every control has an accessible name · ${label}`, unnamed.length === 0, unnamed.slice(0, 3).join(" | "));
}

// ----------------------------------------------------------------- servers
const PORT = await freePort();
const ORIGIN = `http://localhost:${PORT}`;
const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "localhost"], {
  cwd: WEB, shell: true, stdio: "pipe", env: { ...process.env, VITE_AI_EDIT_FIXTURES: "1", BROWSER: "none" },
});
let viteLog = "";
vite.stdout.on("data", (d) => { viteLog += d; });
vite.stderr.on("data", (d) => { viteLog += d; });
const killVite = () => { try { execSync(process.platform === "win32" ? `taskkill /PID ${vite.pid} /T /F` : `kill -9 ${vite.pid}`, { stdio: "ignore" }); } catch { /* already gone */ } };

// Preview/export media: a tiny range-capable server (a <video> needs byte ranges to seek).
let videoServer = null;
let VIDEO_URL = "";
if (VIDEO && existsSync(VIDEO)) {
  const vport = await freePort();
  const size = statSync(VIDEO).size;
  videoServer = createServer((req, res) => {
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : size - 1;
    res.writeHead(m ? 206 : 200, { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...(m ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}), "Access-Control-Allow-Origin": "*" });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(VIDEO, { start, end }).pipe(res);
  }).listen(vport, "127.0.0.1");
  VIDEO_URL = `http://127.0.0.1:${vport}/preview.mp4`;
} else {
  note("KF_SMOKE_VIDEO not set — preview video, swap and export media checks will be limited.");
}

let browser;
const leaks = [];
try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try { const r = await fetch(`${ORIGIN}/`); up = r.ok; } catch { await sleep(500); }
  }
  if (!up) throw new Error(`vite dev server did not start:\n${viteLog}`);
  // Warm the dep optimizer so the first navigation doesn't reload mid-test.
  await fetch(`${ORIGIN}/src/main.jsx`).catch(() => {});

  const CHROME = newestChrome();
  note(`chrome: ${CHROME}`);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

  async function newPage(viewport, { reduced = false, speed = 3, latency = 60 } = {}) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.evaluateOnNewDocument((s, l, v) => {
      window.__KF_AI_EDIT_FIXTURE_SPEED = s;
      window.__KF_AI_EDIT_FIXTURE_LATENCY = l;
      if (v) window.__KF_AI_EDIT_FIXTURE_VIDEO = v;
    }, speed, latency, VIDEO_URL);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.origin !== ORIGIN || !u.pathname.startsWith("/api/")) { req.continue(); return; }
      if (u.pathname === "/api/auth/me") {
        req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "u_smoke", name: "Smoke Tester", email: "smoke@example.test", role: "user" } }) });
      } else if (u.pathname.startsWith("/api/video-edits")) {
        leaks.push(`${req.method()} ${u.pathname}`);
        req.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "SMOKE_NETWORK_LEAK" }) });
      } else {
        // Other studio routes (frames, projects, gallery) aren't under test: answer empty.
        req.respond({ status: 200, contentType: "application/json", body: "{}" });
      }
    });
    page.on("console", (m) => { if (m.type() === "error") errors.push({ phase, vp: viewport.width, text: m.text() }); });
    page.on("pageerror", (e) => errors.push({ phase, vp: viewport.width, text: `pageerror ${e.message}` }));
    page.on("dialog", (d) => d.dismiss());
    return page;
  }
  const waitEditor = (page, timeout = 30000) => waitFor(page, () => !!document.getElementById("kf-tab-captions") && /PREVIEW r\d+/.test(document.body.textContent), null, timeout);

  // ================================================================ 1440 · entry + upload
  const page = await newPage({ width: 1440, height: 900 }, { speed: 1, latency: 80 });

  await section("entry: landing bridge → ModeSwitch → upload", async () => {
    // The landing iframe (design.html, three.js) logs WebGL errors in headless Chrome — not AI Edit code.
    phase = "landing (outside AI Edit)";
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle0", timeout: 60000 });
    check("landing renders the design iframe", !!(await page.$('iframe[src="/design.html"]')));
    await sleep(400); // AuthProvider has resolved /api/auth/me
    await page.evaluate(() => window.postMessage({ type: "kf-ai-edit" }, window.location.origin));
    check("kf-ai-edit bridge message opens the upload page (logged in)", await waitFor(page, (sel) => !!document.querySelector(sel), DROP, 10000));
    const cur = await page.$eval('nav[aria-label="Studio mode"] [aria-current="page"]', (e) => e.textContent).catch(() => "");
    check("ModeSwitch marks “Edit my video” current on upload", cur.includes("Edit my video"), cur);
    check("nav AI EDIT chip visible at 1440 and aria-current", await page.evaluate(() => { const b = [...document.querySelectorAll("nav button")].find((x) => x.textContent.startsWith("AI EDIT")); return !!b && b.getBoundingClientRect().width > 0 && b.getAttribute("aria-current") === "page"; }));
    phase = "create (outside AI Edit)";
    await clickText(page, 'nav[aria-label="Studio mode"] button', "Make a film");
    check("ModeSwitch “Make a film” → Create with Make a film current", await waitFor(page, () => document.querySelector('nav[aria-label="Studio mode"] [aria-current="page"]')?.textContent.includes("Make a film"), null, 8000));
    await sleep(500);
    await clickText(page, 'nav[aria-label="Studio mode"] button', "Edit my video");
    phase = "entry";
    check("ModeSwitch “Edit my video” → upload", await waitFor(page, (sel) => !!document.querySelector(sel), DROP, 8000));
    check("upload headline + SC 01 · THE FOOTAGE", await bodyHas(page, "Drop the take.", 5000) && await bodyHas(page, "SC 01 · THE FOOTAGE", 1000));
    await sleep(700);
    await shot(page, "upload-1440");
  });

  await section("keyboard file selection + oversize copy", async () => {
    if (!MEDIA || !existsSync(path.join(MEDIA, "take-huge.mp4"))) { note("KF_SMOKE_MEDIA/take-huge.mp4 missing — oversize check skipped."); return; }
    await chooseFile(page, path.join(MEDIA, "take-huge.mp4"), { keyboard: true });
    const ok = await waitFor(page, () => [...document.querySelectorAll("[role=alert]")].some((e) => e.textContent.includes("This file is 3.6 GB. The limit is 500 MB — export at 1080p and it will fit.")), null, 6000);
    check("Tab-focus + Enter opens the picker; oversize copy in role=alert", ok);
    check("oversize check made no network request", leaks.length === 0, leaks.join(", "));
    const b = await page.$('button[aria-label^="Remove take"]');
    if (b) await b.click();
    await page.waitForSelector(DROP, { timeout: 5000 });
  });

  await section("upload progress + navigate away/back + analysis → editor handoff", async () => {
    if (!MEDIA || !existsSync(path.join(MEDIA, "take-ok.webm"))) { note("KF_SMOKE_MEDIA/take-ok.webm missing — upload flow skipped."); return; }
    await page.evaluate(() => { window.__KF_AI_EDIT_FIXTURE_SPEED = 0.25; });
    await chooseFile(page, path.join(MEDIA, "take-ok.webm"));
    check("file row shows name, duration and resolution", await waitFor(page, () => document.body.textContent.includes("take-ok.webm") && document.body.textContent.includes("720×1280"), null, 12000));
    await page.click("input[type=checkbox]");
    await clickText(page, "button.btn-mag", "Start AI edit");
    check("upload progressbar appears", await waitFor(page, () => /UPLOADING \d+%/.test(document.querySelector("[role=progressbar][aria-label=Upload]")?.getAttribute("aria-valuetext") || ""), null, 6000));
    await sleep(900);
    await shot(page, "upload-progress-1440");
    phase = "create (outside AI Edit)";
    await clickText(page, 'nav[aria-label="Studio mode"] button', "Make a film");
    await waitFor(page, () => document.querySelector('nav[aria-label="Studio mode"] [aria-current="page"]')?.textContent.includes("Make a film"), null, 6000);
    const chipText = await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent.startsWith("AI EDIT"))?.textContent || "");
    check("navigated away: nav chip keeps counting (AI EDIT · n%)", /AI EDIT · \d+%/.test(chipText), chipText);
    await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent.startsWith("AI EDIT")).click());
    phase = "upload";
    check("navigated back via the chip: upload still running", await waitFor(page, () => !!document.querySelector("[role=progressbar][aria-label=Upload]"), null, 6000));
    await page.evaluate(() => { window.__KF_AI_EDIT_FIXTURE_SPEED = 0.6; });
    phase = "analysis";
    const handed = await waitFor(page, () => /^\/edits\/ve_[0-9a-z]{16}$/.test(location.pathname), null, 25000);
    check("upload completes → session at /edits/<id>", handed, await page.evaluate(() => location.pathname));
    check("analysis stages advance with aria-current=step", await waitFor(page, () => !!document.querySelector('ol[aria-label="Edit stages"] li[aria-current="step"]'), null, 10000));
    check("nav turns dark for aiEdit (wordmark on dark ink)", await page.evaluate(() => [...document.querySelectorAll("nav .wordmark")].some((w) => getComputedStyle(w).color === "rgb(242, 237, 226)")));
    await waitFor(page, () => document.body.textContent.includes("WORDS"), null, 15000);
    await sleep(500);
    await shot(page, "analysis-1440");
    await page.evaluate(() => { window.__KF_AI_EDIT_FIXTURE_SPEED = 6; });
    check("READY beat → editor opens inside the session", await waitEditor(page, 40000));
  });

  // ================================================================ 1440 · editor on the deep link
  await section("/edits/<id> deep link + refresh restores (and old ?edit= links redirect)", async () => {
    phase = "editor";
    await page.evaluate(() => { window.__KF_AI_EDIT_FIXTURE_SPEED = 3; window.__KF_AI_EDIT_FIXTURE_LATENCY = 40; });
    await page.goto(`${ORIGIN}/?edit=${READY_ID}`, { waitUntil: "domcontentloaded" });
    check("legacy ?edit=<ready id> redirects to /edits/<id> and opens the editor", await waitEditor(page) && (await page.evaluate(() => location.pathname)) === `/edits/${READY_ID}`, await page.evaluate(() => location.pathname + location.search));
    await page.reload({ waitUntil: "domcontentloaded" });
    check("refresh restores the same edit", await waitEditor(page) && (await page.evaluate(() => location.pathname)) === `/edits/${READY_ID}`, await page.evaluate(() => location.pathname));
    if (VIDEO_URL) check("preview video loaded", await waitFor(page, async () => { const { playerClock } = await import("/src/playerClock.js"); const v = playerClock.getElement?.(); return !!v && v.readyState >= 2; }, null, 20000));
    const sameModule = await page.evaluate(async () => { const m = await import("/src/editApi.js"); return m.fixtureControl.enabled(); });
    check("fixture mode active in the dev build (VITE_AI_EDIT_FIXTURES=1)", sameModule);
    await sleep(700);
    await shot(page, "editor-1440");
    await audit(page, ".kf-ed", "editor 1440");
  });

  await section("summary chip → panel aria-selected", async () => {
    const clicked = await clickText(page, "ul[aria-labelledby] li button", "B-ROLL");
    check("B-roll summary chip clicked", clicked);
    check("chip opens the B-roll tab (aria-selected=true, panel visible)", await waitFor(page, () => document.getElementById("kf-tab-broll")?.getAttribute("aria-selected") === "true" && !document.getElementById("kf-panel-broll")?.hidden, null, 5000));
  });

  await section("select B-roll #3 → seek + highlighted words", async () => {
    await page.click('[role=toolbar][aria-label="B-roll track"] button[aria-label^="B-ROLL #3"]');
    await sleep(450);
    const t = await clockTime(page);
    check("currentTime ≈ outIn of B-roll #3", Math.abs(t - (BR3_OUT_IN + 0.05)) < 0.15, `${t.toFixed(3)} vs ${BR3_OUT_IN}`);
    const anchors = await page.$$eval("#kf-panel-transcript .kf-tr-word.is-anchor", (els) => els.map((e) => e.dataset.i));
    check("anchored words highlighted by srcWordIndex", anchors.join(",") === BR3_WORDS.join(","), anchors.join(","));
  });

  await section("Delete key → broll.remove + Undo", async () => {
    const rev0 = await revision(page);
    await page.focus('[role=toolbar][aria-label="B-roll track"] button[aria-label^="B-ROLL #3"]');
    await page.keyboard.press("Delete");
    check("toast “B-roll #3 removed”", await bodyHas(page, "B-roll #3 removed", 6000));
    check("broll.remove applied (revision advanced)", await waitFor(page, (r) => { const m = document.querySelector(".kf-ed-head")?.textContent.match(/· r(\d+)/); return m && Number(m[1]) > r; }, rev0, 8000), `from r${rev0}`);
    check("toast Undo clicked", await clickText(page, "[role=status] button, [role=alert] button", "Undo"));
    check("“Undid: Remove B-roll #3”", await bodyHas(page, "Undid: Remove B-roll #3", 8000));
  });

  await section("B-roll replace dialog", async () => {
    await page.click("#kf-tab-broll");
    const opened = await clickText(page, "#kf-panel-broll button", "Replace") || await clickText(page, "#kf-panel-broll button", "Search stock");
    check("Replace opens the dialog", opened && await waitFor(page, () => document.querySelector("dialog[open]")?.textContent.includes("Replace B-roll #"), null, 6000));
    await sleep(900);
    await shot(page, "replace-dialog-1440");
    await page.keyboard.press("Escape");
    check("Esc closes the replace dialog", await waitFor(page, () => !document.querySelector("dialog[open]"), null, 4000));
  });

  await section("caption edit", async () => {
    await page.click("#kf-tab-captions");
    const input = await page.waitForSelector('#kf-panel-captions input[aria-label^="Caption at"]', { timeout: 5000 });
    await input.click({ clickCount: 3 });
    await page.keyboard.type("We doubled revenue in three months.");
    await page.keyboard.press("Enter");
    check("caption saved toast", await bodyHas(page, "Caption saved · rendering", 6000));
  });

  await section("render progress → swap keeps currentTime ±0.1 s", async () => {
    if (!VIDEO_URL) { note("no preview video — swap check skipped"); return; }
    check("preview catches up", await waitFor(page, () => [...document.querySelectorAll(".kf-ed-bar button")].some((b) => b.textContent.includes("Preview up to date")), null, 30000));
    await page.evaluate(async () => { const { playerClock } = await import("/src/playerClock.js"); playerClock.pause(); playerClock.seek(20); });
    await sleep(500);
    const before = await clockTime(page);
    const expected = await page.evaluate(async (t, plan, words) => {
      const M = await import("/src/editModel.js");
      const toggled = M.applyOpLocal(plan, { type: "cut.toggle", cutId: "cut_sil03x", enabled: false }, { words }).plan;
      return M.mapTime(plan.timeline.pieces, toggled.timeline.pieces, t);
    }, before, READY.plan.plan, READY.transcript.words);
    const shownBefore = await page.evaluate(() => document.querySelector("[aria-label^='Preview']")?.textContent.match(/PREVIEW r(\d+)/)?.[1]);
    // At ≥1280 the transcript is its own column (no tab); below that it is the first inspector tab.
    if (await page.$("#kf-tab-transcript")) await page.click("#kf-tab-transcript");
    const pill = await page.$('#kf-panel-transcript button.kf-tr-pill[aria-label="Silence cut, 1.1 seconds"]');
    check("silence cut pill found (aria-pressed)", !!pill);
    await pill.click();
    const swapped = await waitFor(page, (rev) => { const m = document.querySelector("[aria-label^='Preview']")?.textContent.match(/PREVIEW r(\d+)/); return m && m[1] !== rev; }, shownBefore, 35000);
    await sleep(300);
    const after = await clockTime(page);
    check("swapped to the new revision and kept the mapped playhead", swapped && Math.abs(after - expected) <= 0.1, `${before.toFixed(3)} → ${after.toFixed(3)} (expected ${expected.toFixed(3)})`);
  });

  await section("409 conflict notice", async () => {
    await page.evaluate(async () => (await import("/src/editApi.js")).fixtureControl.conflictNext());
    await page.focus('[role=toolbar][aria-label="B-roll track"] button[aria-label^="B-ROLL #3"]');
    await page.keyboard.press("Enter");
    await sleep(200);
    await page.keyboard.press("Delete");
    check("EDIT CHANGED ELSEWHERE notice with Re-apply", await bodyHas(page, "EDIT CHANGED ELSEWHERE", 10000) && await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Re-apply")));
    await shot(page, "editor-conflict-1440");
  });

  await section("export dialog with a stale preview", async () => {
    const autoSwitch = await page.evaluateHandle(() => [...document.querySelectorAll("button[role=switch]")].find((b) => document.getElementById(b.getAttribute("aria-labelledby"))?.textContent.includes("Auto-update preview")));
    if ((await autoSwitch.evaluate((b) => b?.getAttribute("aria-checked"))) === "true") await autoSwitch.click();
    await page.click("#kf-tab-effects");
    const sw = await page.evaluateHandle(() => [...document.querySelectorAll("#kf-panel-effects button[role=switch]")].find((b) => document.getElementById(b.getAttribute("aria-labelledby"))?.textContent.startsWith("Punch-in at")));
    await sw.click();
    check("changes pending while auto-update is off", await bodyHas(page, "PENDING", 5000));
    await sleep(800);
    await clickText(page, ".kf-ed-bar button.btn-mag", "Export");
    await page.waitForSelector("dialog[open]", { timeout: 5000 });
    check("stale-preview export focuses “Update preview first”", await waitFor(page, () => document.activeElement?.textContent === "Update preview first", null, 4000));
    await sleep(500);
    await shot(page, "export-dialog-1440");
    await page.keyboard.press("Escape");
    await waitFor(page, () => !document.querySelector("dialog[open]"), null, 3000);
  });
  await page.close();

  // ================================================================ viewports
  for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await section(`viewport ${vp.width}`, async () => {
      phase = `viewport ${vp.width}`;
      const p = await newPage(vp, { speed: 1, latency: 40 });
      await p.goto(`${ORIGIN}/edits`, { waitUntil: "domcontentloaded" });
      check(`My edits renders @${vp.width}`, await waitFor(p, () => document.querySelectorAll('ul[aria-label="Your edits"] article').length > 0, null, 15000));
      await sleep(600);
      await audit(p, "main", `list @${vp.width}`);
      // Upload via the list's "new edit" affordance keeps the flow inside the app.
      const toUpload = await clickText(p, "main button", "New edit") || await clickText(p, "main button", "Upload") || await clickText(p, "main button", "new");
      if (!toUpload) note(`list @${vp.width}: no New edit button text matched — opened upload via the bridge instead`);
      if (!toUpload) await p.evaluate(() => window.postMessage({ type: "kf-ai-edit" }, window.location.origin));
      check(`upload page @${vp.width}`, await waitFor(p, (sel) => !!document.querySelector(sel), DROP, 10000));
      await sleep(700);
      await audit(p, "main", `upload @${vp.width}`);
      if (vp.width !== 1440) await shot(p, `upload-${vp.width}`, { fullPage: true });
      await p.goto(`${ORIGIN}/edits/ve_analyzedemo00001`, { waitUntil: "domcontentloaded" });
      await waitFor(p, () => document.body.textContent.includes("WORDS"), null, 20000);
      await audit(p, "main", `analysis @${vp.width}`);
      if (vp.width !== 1440) await shot(p, `analysis-${vp.width}`, { fullPage: true });
      await p.evaluate(() => { window.__KF_AI_EDIT_FIXTURE_SPEED = 3; });
      await p.goto(`${ORIGIN}/edits/${READY_ID}`, { waitUntil: "domcontentloaded" });
      check(`editor opens @${vp.width}`, await waitEditor(p));
      const layout = await p.evaluate(() => document.querySelector(".kf-ed")?.dataset.layout);
      check(`editor layout @${vp.width}`, layout === (vp.width >= 1280 ? "wide" : vp.width >= 860 ? "medium" : "narrow"), layout);
      await sleep(800);
      await audit(p, ".kf-ed", `editor @${vp.width}`);
      if (vp.width !== 1440) await shot(p, `editor-${vp.width}`);
      await p.close();
    });
  }

  await section("reduced motion", async () => {
    phase = "reduced motion";
    const p = await newPage({ width: 1440, height: 900 }, { reduced: true });
    await p.goto(`${ORIGIN}/edits/${READY_ID}`, { waitUntil: "domcontentloaded" });
    await waitEditor(p);
    const tr = await p.$$eval("[aria-label^='Preview'] video", (vs) => vs.map((v) => v.style.transition));
    check("reduced motion: video swap has no transition", tr.every((t) => t === "none" || t === ""), tr.join(","));
    await p.goto(`${ORIGIN}/edits`, { waitUntil: "domcontentloaded" });
    await waitFor(p, () => document.querySelectorAll('ul[aria-label="Your edits"] article').length > 0, null, 15000);
    const smooth = await p.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    check("reduced motion: no smooth scroll", smooth !== "smooth", smooth);
    await p.close();
  });

  const axe = ["web", "server"].map((d) => path.resolve(WEB, "..", d, "node_modules", "axe-core", "axe.min.js")).find((f) => existsSync(f));
  if (axe) note(`axe-core found at ${axe} but the axe pass is not wired in this run`);
  else note("axe-core: no local copy in web/ or server/ node_modules and CDNs are not allowed offline — axe pass skipped.");
} catch (err) {
  check("smoke harness", false, err.stack || err.message);
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  killVite();
  videoServer?.close();
}

check("no /api/video-edits request reached the network (fixture mode)", leaks.length === 0, leaks.slice(0, 5).join(", "));
const aiErrors = errors.filter((e) => !/outside AI Edit/.test(e.phase) && !/Download the React DevTools/.test(e.text));
const otherErrors = errors.filter((e) => /outside AI Edit/.test(e.phase));
check("no console/page errors on AI Edit screens", aiErrors.length === 0, aiErrors.slice(0, 6).map((e) => `[${e.phase}@${e.vp}] ${e.text}`).join(" || "));
if (otherErrors.length) note(`${otherErrors.length} console error(s) on non-AI screens (Create, empty stub API) ignored`);
const failed = results.filter((r) => !r.ok);
writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify({ results, notes, errors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed · screenshots in ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
