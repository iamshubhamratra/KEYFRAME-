// KIE Flux image-generation provider — the "generate when stock is weak" tier.
//
// KEYFRAME's asset quality is capped by what stock providers happen to have for a
// topic (the "asset quality 40/100" symptom = generic/off photos). This generates
// an ON-BRIEF image instead, reusing the EXISTING KIE key (config.llm.primary.apiKey
// — the same account used for Grok), so it needs no new signup. Verified live: KIE
// Flux Kontext returns a real image URL from this key.
//
// Flow (async, per KIE docs): POST /flux/kontext/generate → { data.taskId } →
// poll GET /flux/kontext/record-info?taskId → { data.successFlag, data.response.resultImageUrl }.
// Fail-open everywhere: any error returns null so the pipeline falls back to stock.

const https = require("node:https");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const config = require("../../config");

const BASE = "https://api.kie.ai/api/v1/flux/kontext";
const DEFAULT_MODEL = "flux-kontext-pro";

function kieKey() {
  return (config.llm && config.llm.primary && config.llm.primary.apiKey) || process.env.KIE_API_KEY || "";
}
// Default OFF until a deploy opts in (it costs ~$0.02-0.04/image). IMAGE_GEN=on enables.
function imageGenEnabled() {
  const v = String(process.env.IMAGE_GEN || (config.imageGen && config.imageGen.enabled ? "on" : "")).toLowerCase();
  return /^(1|true|yes|on)$/.test(v);
}
function aspectFor(orientation) {
  return orientation === "vertical" ? "9:16" : orientation === "square" ? "1:1" : "16:9";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(method, url, body, key) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ status: 0 }); }
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let s = "";
      res.on("data", (d) => (s += d));
      res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(s) }); } catch { resolve({ status: res.statusCode }); } });
    });
    req.on("error", () => resolve({ status: 0 }));
    if (data) req.write(data);
    req.end();
  });
}

function download(url, dest) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve(false); }
    const file = fs.createWriteStream(dest);
    https.get(u, (res) => {
      if (res.statusCode !== 200) { file.close(); try { fs.unlinkSync(dest); } catch { /* noop */ } return resolve(false); }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(true)));
    }).on("error", () => { try { fs.unlinkSync(dest); } catch { /* noop */ } resolve(false); });
  });
}

// ffprobe the real pixel dimensions (piggybacks on the ffmpeg dep every media step uses).
function probeDims(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 20000);
    p.on("error", () => { clearTimeout(timer); resolve(null); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      try { const s = JSON.parse(out).streams[0]; resolve(s && s.width > 0 ? { width: s.width, height: s.height } : null); }
      catch { resolve(null); }
    });
  });
}

// ONE createTask→poll→download attempt. Returns the asset or null.
async function generateOnce({ prompt, orientation, model, destPath, timeoutMs }) {
  const key = kieKey();
  const create = await httpJson("POST", `${BASE}/generate`, { prompt: String(prompt).slice(0, 1500), aspectRatio: aspectFor(orientation), model }, key);
  const taskId = create.json && create.json.data && create.json.data.taskId;
  if (!taskId) { console.warn(`[kie-image] createTask returned no taskId (status ${create.status})`); return null; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(3000);
    const rec = await httpJson("GET", `${BASE}/record-info?taskId=${encodeURIComponent(taskId)}`, null, key);
    const d = rec.json && rec.json.data;
    if (!d) continue;
    if (d.successFlag === 1) {
      const url = d.response && d.response.resultImageUrl;
      if (!url) return null;
      if (!(await download(url, destPath))) return null;
      const dims = await probeDims(destPath);
      if (!dims) { try { fs.unlinkSync(destPath); } catch { /* noop */ } return null; }
      return { path: destPath, width: dims.width, height: dims.height, model };
    }
    if (d.successFlag && d.successFlag !== 0) { console.warn(`[kie-image] attempt failed (flag ${d.successFlag}${d.errorMessage ? ": " + d.errorMessage : ""})`); return null; }
  }
  console.warn(`[kie-image] attempt timed out after ${timeoutMs}ms`);
  return null;
}

// Generate one image, retrying on KIE's intermittent transient failures (Flux
// returns successFlag 3 sporadically then succeeds on retry). Returns
// { path, width, height, model } or null (fail-open → pipeline keeps stock).
async function generateImage({ prompt, orientation = "horizontal", model, destPath, timeoutMs = 150000, attempts = 3 }) {
  const key = kieKey();
  if (!key || !prompt || !destPath) return null;
  const useModel = model || (config.imageGen && config.imageGen.model) || DEFAULT_MODEL;
  for (let a = 0; a < attempts; a++) {
    const r = await generateOnce({ prompt, orientation, model: useModel, destPath, timeoutMs });
    if (r) return r;
    if (a < attempts - 1) { console.log(`[kie-image] retrying (${a + 2}/${attempts})`); await sleep(1500); }
  }
  return null;
}

module.exports = { generateImage, imageGenEnabled, aspectFor, kieKey };
