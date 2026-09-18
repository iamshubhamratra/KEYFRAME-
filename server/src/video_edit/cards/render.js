// VIDEO EDIT CARD RENDERER — template + vars + brand → transparent VP9 webm via HyperFrames, or an ASS
// fallback that says the same thing (RENDER.md §7, spike S4).
//
// WHY THIS EXISTS. A card is the one overlay drawn by a headless browser rather than ffmpeg, and each way
// it can go wrong is silent:
//   * a lint error still renders;
//   * a timeline that throws renders blank;
//   * the native vp9 decoder drops alpha;
//   * a family without @font-face pulls Google Fonts over the network;
//   * a cold Chrome launch takes 64 s on this host;
//   * Windows kills a launch with an NTSTATUS exit.
// So every card goes through one path. It is built into an isolated directory keyed by its content hash,
// gated by the same lint + runtime smoke check as template renders, rendered by the pinned local CLI with
// telemetry off under a duration-scaled watchdog, then accepted only when ffprobe and an alpha-plane
// decode (libvpx-vp9) prove a transparent 30 fps webm of the planned size and length. Anything short of
// that returns ASS dialogue events with the same text, so an edit never loses a graphic, only its motion.
// A committed card (card.json written last) is reused by hash without spawning anything.
//
// CONTRACT:
//   TEMPLATE_IDS · KIND_TO_TEMPLATE · getTemplate(idOrKindOrModule) -> template | null
//   resolveCardFonts(template, { lang, brandFont }) -> [{ family, file, ttfPath, weight, role }]
//   cardHashFor({ template, vars, brand, fonts, w, h, fps=30, dur }) -> sha1 hex
//     sha1(template@version, vars (logo by content sha1), palette, font sha1s, GSAP version, w, h, fps, dur)
//   snapDur(sec) -> 0.1 s grid, clamped 1..12 · watchdogMsFor(dur) -> max(120 s, dur × 40 s)
//   prepareCardDir(dir, built) -> copies extraFiles (gsap.min.js, logo) before validate() writes index.html/meta.json
//   renderCard({ template, vars, brand, dims, dur, projectDir, runId, signal, lang='en', brandFont, aspect='9:16',
//                settings, project, pidFile, deps })
//     -> { ok:true, path, relPath, format:'webm', cardHash, fallback:null, cached, w, h, durSec, frames, bytes,
//          layout, attempts, fontLog:{ fetched, injected }, timings }
//      | { ok:false, path:null, format:null, cardHash, reason, detail, fallback, w, h, durSec, timings }
//     reason: unknown_template | fonts | fault | build_failed | prepare | lint | runtime | render | verify
//     Throws only EditError PROC_ABORTED (cancellation is not a card failure).
//     deps (tests): { validate, runtimeCheck, cliFor, runProcess, maybeFail, retryDelayMs }
//     The render child runs through engine/proc.runProcess, i.e. spawn_compat.spawnCompat + killTree with the
//     watchdog as timeoutMs, abort-signal kill and a pid-registry entry.
//   fallbackForCard({ template, vars, brand, dims, dur, lang, brandFont, aspect }) -> fallback (no render)
//     fallback = { kind:'ass', region:{w,h}, durSec, style:{ name:'Card', line }, fonts:[ttf], families,
//                  assEvents:[{ layer, startSec, endSec, an, x, y, family, bold, sizePx, colour, outlinePx,
//                               shadowPx, tags, text, lines }] }   (x/y in region pixels; text ASS-escaped)
//   fallbackDialogues(fallback, { outInSec, offsetX, offsetY, scale }) -> ASS Dialogue lines on the output
//   fallbackAssText(fallback, { output:{w,h}, outInSec, offsetX, offsetY, scale }) -> standalone ASS script
//   verifyCardWebm(file, { w, h, dur, fps, signal, pidFile }) -> { ok, problems, codec, alphaMode, durationSec, frames, alpha }

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EditError } = require("../errors");
const fsx = require("../fsx");
const proc = require("../engine/proc");
const faults = require("../faults");
const fontname = require("../captions/fontname");
const ass = require("../captions/ass");
const K = require("./templates/_common");

const FPS = 30;
const TEMPLATE_IDS = Object.freeze(["hook_title", "keyword", "stat", "lower_third", "cta", "logo_outro"]);
const KIND_TO_TEMPLATE = Object.freeze({
  HOOK_TITLE: "hook_title", KEYWORD: "keyword", STAT: "stat", LOWER_THIRD: "lower_third", CTA: "cta", LOGO_OUTRO: "logo_outro",
});
const MIN_DUR_SEC = 1;
const MAX_DUR_SEC = 12;
const NT_CRASH_FLOOR = 0xC0000000;
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
const TEMPLATE_ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
const MARKER = "card.json";
const OUT_NAME = "out.webm";
const HASH_VERSION = 1;

const FALLBACK_STYLE = "Card";
const FALLBACK_FADE_MS = 120;
const FALLBACK_POP_MS = 240;
const FALLBACK_POP_FROM = 92;
const STYLE_FORMAT = "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";
const EVENT_FORMAT = "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

let seq = 0;

function abortError(detail) {
  return new EditError("PROC_ABORTED", { status: 409, errorClass: "cancelled", stage: "PREPARING_RENDER", detail });
}
const isCancel = (e, signal) => (e && e.code === "PROC_ABORTED") || !!(signal && signal.aborted);
const isNtCrash = (code) => typeof code === "number" && code >= NT_CRASH_FLOOR;

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError("aborted during retry delay"));
    const timer = setTimeout(() => { if (signal) signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(abortError("aborted during retry delay")); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ---- templates, fonts, hash ------------------------------------------------------------------------
function getTemplate(t) {
  if (t && typeof t === "object") {
    return typeof t.build === "function" && TEMPLATE_ID_RE.test(String(t.id)) && Number.isInteger(t.version) ? t : null;
  }
  const key = Object.prototype.hasOwnProperty.call(KIND_TO_TEMPLATE, t) ? KIND_TO_TEMPLATE[t] : t;
  return TEMPLATE_IDS.includes(key) ? require(`./templates/${key}`) : null;
}

function snapDur(sec) {
  const n = Number(sec);
  const v = Number.isFinite(n) ? n : 2.5;
  return Math.min(MAX_DUR_SEC, Math.max(MIN_DUR_SEC, Math.round(v * 10) / 10));
}

function watchdogMsFor(dur) { return Math.max(120000, Math.ceil(snapDur(dur) * 40000)); }

function normDims(dims, tpl, aspect) {
  const src = dims && typeof dims === "object" ? dims
    : (tpl && typeof tpl.defaultDims === "function" ? tpl.defaultDims(aspect) : { w: 1080, h: 560 });
  const even = (v, dflt) => {
    const n = Math.round(Number(v));
    const x = Number.isFinite(n) && n > 0 ? n : dflt;
    const c = Math.min(2160, Math.max(64, x));
    return c - (c % 2);
  };
  return { w: even(src.w != null ? src.w : src.width, 1080), h: even(src.h != null ? src.h : src.height, 560) };
}

function fontEntry(family, role) {
  const e = fontname.entryForFamily(family);
  if (!e) throw new EditError("CARD_FONT_MISSING", { status: 500, errorClass: "config", detail: `card font '${family}' is not bundled` });
  return { family: e.family, file: e.file, ttfPath: path.join(fontname.FONTS_DIR_ABS, e.file), weight: e.weight, role };
}

function resolveCardFonts(template, { lang = "en", brandFont = null } = {}) {
  const roles = (template && template.fontRoles) || { display: "Archivo Black", body: "DM Sans" };
  let display = roles.display || "Archivo Black";
  const body = roles.body || "DM Sans";
  if (roles.brandDisplay && brandFont && brandFont.family) {
    const e = fontname.entryForFamily(brandFont.family);
    if (e && e.scripts.length === 1 && e.scripts[0] === "Latn") display = e.family;
  }
  const script = fontname.fontForScript(K.safeLang(lang));
  if (!script) return [fontEntry(display, "display"), fontEntry(body, "body")];
  const out = [fontEntry(script.family, "display"), fontEntry(script.family, "body")];
  if (!script.scripts.includes("Latn")) out.push(fontEntry(fontname.latinFallbackFamily(body), "fallback"));
  return out;
}

const fileShaCache = new Map();
function sha1FileSync(abs) {
  const st = fs.statSync(abs);
  const key = `${abs}|${st.size}|${st.mtimeMs}`;
  if (fileShaCache.has(key)) return fileShaCache.get(key);
  const hex = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
  fileShaCache.set(key, hex);
  return hex;
}

function hashableVars(vars) {
  const v = vars && typeof vars === "object" ? vars : {};
  const out = {};
  for (const key of Object.keys(v)) {
    if (key === "logoPath" || v[key] == null || typeof v[key] === "function") continue;
    out[key] = v[key];
  }
  if (v.logoPath) {
    const abs = path.resolve(String(v.logoPath));
    try { out.logo = { sha1: sha1FileSync(abs), ext: path.extname(abs).toLowerCase() }; }
    catch { out.logo = { missing: path.basename(abs) }; }
  }
  return out;
}

function cardHashFor({ template, vars, brand, fonts, w, h, fps = FPS, dur }) {
  const tpl = getTemplate(template);
  const payload = {
    v: HASH_VERSION,
    template: tpl ? `${tpl.id}@${tpl.version}` : `unknown:${String(template)}`,
    vars: hashableVars(vars),
    palette: K.normalizePalette(brand),
    fonts: (fonts || []).map((f) => ({ family: f.family, role: f.role || null, sha1: sha1FileSync(path.resolve(f.ttfPath)) })),
    gsap: K.gsapVersion(),
    w, h, fps, dur: snapDur(dur),
  };
  return crypto.createHash("sha1").update(fsx.canonicalJson(payload)).digest("hex");
}

// ---- directory ---------------------------------------------------------------------------------------
function prepareCardDir(dir, built) {
  fsx.ensureDir(dir);
  for (const f of (built && built.extraFiles) || []) {
    const rel = String((f && f.rel) || "");
    if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/.test(rel) || rel === "index.html" || rel === "meta.json" || rel === MARKER) {
      throw new EditError("CARD_TEMPLATE_INVALID", { status: 500, errorClass: "bug", detail: `bad extra file name '${rel}'` });
    }
    const src = path.resolve(String(f.srcPath || ""));
    if (!fs.existsSync(src)) throw new EditError("CARD_TEMPLATE_INVALID", { status: 500, errorClass: "config", detail: `extra file source missing for ${rel}` });
    fs.copyFileSync(src, path.join(dir, rel));
  }
  return dir;
}

function readCachedCard(dir, cardHash) {
  const r = fsx.readJsonSafe(path.join(dir, MARKER));
  if (!r.ok || !r.value || r.value.cardHash !== cardHash) return null;
  try {
    const st = fs.statSync(path.join(dir, OUT_NAME));
    if (!st.isFile() || st.size !== r.value.bytes) return null;
  } catch { return null; }
  return r.value;
}

// ---- verification ------------------------------------------------------------------------------------
function parseAlphaStats(text) {
  const frames = [];
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (/^frame:\d+/.test(line)) { cur = {}; frames.push(cur); continue; }
    const m = /lavfi\.signalstats\.(YMIN|YMAX|YAVG)=([\d.]+)/.exec(line);
    if (m && cur) cur[m[1].toLowerCase()] = Number(m[2]);
  }
  const ok = frames.filter((f) => Number.isFinite(f.ymin) && Number.isFinite(f.ymax) && Number.isFinite(f.yavg));
  if (!ok.length) return { frames: 0 };
  return {
    frames: ok.length,
    minYmin: Math.min(...ok.map((f) => f.ymin)),
    maxYmax: Math.max(...ok.map((f) => f.ymax)),
    peakAvg: K.r2(Math.max(...ok.map((f) => f.yavg))),
    firstAvg: ok[0].yavg,
    lastAvg: ok[ok.length - 1].yavg,
  };
}

async function verifyCardWebm(file, { w, h, dur, fps = FPS, signal = null, pidFile } = {}) {
  const cwd = path.dirname(path.resolve(file));
  const rel = path.basename(file);
  const extra = pidFile !== undefined ? { pidFile } : {};
  const problems = [];
  const probe = await proc.ffprobeJson(
    ["-protocol_whitelist", "file", "-f", "matroska", "-count_frames", "-select_streams", "v:0", "-show_streams", "-show_format", "-of", "json", `file:${rel}`],
    { cwd, signal, timeoutMs: 60000, label: "card-probe", ...extra },
  );
  const st = (probe.streams || [])[0] || {};
  const tags = st.tags || {};
  const alphaMode = String(tags.ALPHA_MODE != null ? tags.ALPHA_MODE : tags.alpha_mode != null ? tags.alpha_mode : "");
  const durationSec = Number(probe.format && probe.format.duration);
  const frames = Number(st.nb_read_frames);
  const wantFrames = Math.round(dur * fps);
  if (st.codec_name !== "vp9") problems.push(`codec ${st.codec_name}`);
  if (st.width !== w || st.height !== h) problems.push(`size ${st.width}x${st.height} != ${w}x${h}`);
  if (alphaMode !== "1") problems.push("no ALPHA_MODE=1 stream tag");
  if (!(Math.abs(durationSec - dur) <= 1.5 / fps)) problems.push(`container duration ${durationSec} != ${dur}`);
  if (!(Math.abs(frames - wantFrames) <= 1)) problems.push(`frames ${frames} != ${wantFrames}`);

  let alpha = null;
  if (!problems.length) {
    const fcs = `alpha_probe.${process.pid}.${++seq}.fcs`;
    fs.writeFileSync(path.join(cwd, fcs), "[0:v]alphaextract,signalstats,metadata=mode=print:file=-[o]\n");
    try {
      const r = await proc.ffmpeg(
        ["-protocol_whitelist", "file", "-c:v", "libvpx-vp9", "-f", "matroska", "-i", `file:${rel}`, "-/filter_complex", fcs, "-map", "[o]", "-an", "-f", "null", "-"],
        { cwd, signal, timeoutMs: 120000, maxStdoutBytes: 32e6, label: "card-alpha", ...extra },
      );
      alpha = parseAlphaStats(r.stdout);
    } catch (e) {
      if (isCancel(e, signal)) throw e;
      problems.push(`alpha decode failed (${e && e.code ? e.code : "error"})`);
    } finally {
      try { fs.unlinkSync(path.join(cwd, fcs)); } catch { /* noop */ }
    }
    if (alpha) {
      if (!(Math.abs(alpha.frames - wantFrames) <= 1)) problems.push(`alpha frames ${alpha.frames}`);
      if (!(alpha.maxYmax >= 200)) problems.push(`no opaque pixels (alpha max ${alpha.maxYmax})`);
      if (!(alpha.minYmin <= 16)) problems.push(`no transparent pixels (alpha min ${alpha.minYmin})`);
      if (!(alpha.firstAvg <= 8)) problems.push(`first frame not clear (alpha avg ${alpha.firstAvg})`);
      if (!(alpha.lastAvg <= 8)) problems.push(`last frame not clear (alpha avg ${alpha.lastAvg})`);
    }
  }
  return { ok: problems.length === 0, problems, codec: st.codec_name || null, alphaMode, durationSec, frames, alpha };
}

// ---- ASS fallback --------------------------------------------------------------------------------------
const bgr = (hex) => { const h = K.normHex(hex, "#ffffff").slice(1).toUpperCase(); return h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };

function genericBlocks(vars = {}) {
  return [
    { text: K.cleanText(vars.value, 16), role: "display", color: "accent" },
    { text: K.cleanText(vars.title, 60), role: vars.value ? "body" : "display", color: "text" },
    { text: K.cleanText(vars.subtitle, 70), role: "body", color: "text" },
  ].filter((b) => b.text);
}

// Latin runs inside hi/ar text switch to a bundled face that has them (captions/ass.js fontRuns).
function runsText(family, raw, used) {
  let out = "";
  for (const r of ass.fontRuns(family, raw)) {
    const esc = ass.escapeAssText(r.text);
    if (r.family === family) { out += esc; continue; }
    used.add(r.family);
    out += `{\\fn${r.family}}${esc}{\\fn${family}}`;
  }
  return out;
}

function buildFallback({ tpl, vars, brand, fonts, w, h, dur, lang = "en" }) {
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const blocks = (tpl && typeof tpl.fallbackBlocks === "function" ? tpl.fallbackBlocks(vars || {}, { lang }) : genericBlocks(vars || {}))
    .filter((b) => b && b.text).slice(0, 4);
  const kw = Math.min(1.6, w / 1080);
  const fitted = blocks.map((b) => {
    const display = b.role === "display";
    const face = display ? F.display : F.body;
    const fit = K.fitText({
      text: b.text, chain: display ? F.displayChain : F.bodyChain, maxWidth: w * 0.88, maxLines: 2,
      maxSize: (display ? 84 : 44) * kw, minSize: (display ? 30 : 20) * kw, lang,
    });
    return { b, face, fit };
  });
  const lh = 1.18, gap = 0.3;
  const natural = fitted.reduce((a, x, i) => a + x.fit.lines.length * x.fit.size * lh + (i ? gap * x.fit.size : 0), 0);
  const s = natural > h * 0.9 ? (h * 0.9) / natural : 1;
  let y = (h - natural * s) / 2;
  const used = new Set();
  const assEvents = fitted.map((x, i) => {
    const size = x.fit.size * s;
    if (i) y += gap * size;
    const blockH = x.fit.lines.length * size * lh;
    const cy = y + blockH / 2;
    y += blockH;
    const fsPx = size * x.face.metrics.hheaEm;
    used.add(x.face.family);
    const lines = x.fit.lines.map((l) => l.text);
    return {
      layer: 0, startSec: 0, endSec: K.r3(dur), an: 5, x: K.r2(w / 2), y: K.r2(cy),
      family: x.face.family, bold: x.face.weight >= 700, sizePx: K.r2(fsPx),
      colour: x.b.color === "accent" ? P.accentOnDark : P.text,
      outlinePx: K.r2(Math.max(2, fsPx * 0.07)), shadowPx: K.r2(Math.max(1, fsPx * 0.035)),
      tags: `\\fad(${FALLBACK_FADE_MS},${FALLBACK_FADE_MS})\\fscx${FALLBACK_POP_FROM}\\fscy${FALLBACK_POP_FROM}\\t(0,${FALLBACK_POP_MS},\\fscx100\\fscy100)`,
      text: runsText(x.face.family, lines.join("\n"), used),
      lines,
    };
  });
  const families = [...used];
  const style = `Style: ${FALLBACK_STYLE},${F.display.family},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,${fontname.assBoldFor(F.display.family)},0,0,0,100,100,0,0,1,3,1,5,0,0,0,-1`;
  return {
    kind: "ass",
    region: { w, h },
    durSec: K.r3(dur),
    style: { name: FALLBACK_STYLE, line: style },
    fonts: families.map((f) => { const e = fontname.entryForFamily(f); return e ? e.file : null; }).filter(Boolean),
    families,
    assEvents,
  };
}

function safeFallback(args) {
  try { return buildFallback(args); } catch { /* try the plainest form */ }
  try {
    return buildFallback({ ...args, tpl: null, lang: "en", fonts: resolveCardFonts(null, {}) });
  } catch {
    return { kind: "ass", region: { w: args.w, h: args.h }, durSec: args.dur, style: null, fonts: [], families: [], assEvents: [], error: "fallback unavailable" };
  }
}

function fallbackDialogues(fallback, { outInSec = 0, offsetX = 0, offsetY = 0, scale = 1 } = {}) {
  if (!fallback || !Array.isArray(fallback.assEvents) || !fallback.style) return [];
  const f0 = Math.max(0, Math.round(Number(outInSec) * FPS));
  return fallback.assEvents.map((e) => {
    const a = f0 + Math.round(e.startSec * FPS);
    const b = f0 + Math.round(e.endSec * FPS);
    const head = `\\an${e.an}\\pos(${Math.round(offsetX + e.x * scale)},${Math.round(offsetY + e.y * scale)})`
      + `\\fn${e.family}\\b${e.bold ? 1 : 0}\\fs${K.r2(e.sizePx * scale)}\\c&H${bgr(e.colour)}&\\3c&H000000&`
      + `\\bord${K.r2(e.outlinePx * scale)}\\shad${K.r2(e.shadowPx * scale)}${e.tags}`;
    return `Dialogue: ${e.layer},${ass.assTime(a)},${ass.assTime(b)},${fallback.style.name},,0,0,0,,{${head}}${e.text}`;
  });
}

function fallbackAssText(fallback, { output, ...place } = {}) {
  const W = Number(output && (output.w != null ? output.w : output.width));
  const H = Number(output && (output.h != null ? output.h : output.height));
  if (!Number.isInteger(W) || !Number.isInteger(H)) throw new EditError("CARD_BAD_INPUT", { status: 500, errorClass: "bug", detail: "output {w,h} required" });
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "YCbCr Matrix: TV.709", "",
    "[V4+ Styles]", STYLE_FORMAT, fallback && fallback.style ? fallback.style.line : `Style: ${FALLBACK_STYLE},DM Sans,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,5,0,0,0,-1`, "",
    "[Events]", EVENT_FORMAT, ...fallbackDialogues(fallback, place), "",
  ].join("\n");
}

function fallbackForCard({ template, vars = {}, brand = null, dims = null, dur = 2.5, lang = "en", brandFont = null, aspect = "9:16" } = {}) {
  const tpl = getTemplate(template);
  const { w, h } = normDims(dims, tpl, aspect);
  let fonts;
  try { fonts = resolveCardFonts(tpl, { lang, brandFont }); } catch { fonts = resolveCardFonts(null, {}); }
  return safeFallback({ tpl, vars, brand, fonts, w, h, dur: snapDur(dur), lang });
}

// ---- render --------------------------------------------------------------------------------------------
function services(deps = {}) {
  return {
    validate: deps.validate || ((dir, files) => require("../../services/validator").validate(dir, files)),
    runtimeCheck: deps.runtimeCheck || ((dir) => require("../../services/runtime_check").runtimeCheck(dir)),
    cliFor: deps.cliFor || ((sub, args) => require("../../services/hyperframes_cli").cliFor(sub, args)),
    runProcess: deps.runProcess || proc.runProcess,
    maybeFail: deps.maybeFail || faults.maybeFail,
    retryDelayMs: Number.isFinite(deps.retryDelayMs) ? deps.retryDelayMs : 3000,
  };
}

function lintSummary(lint) {
  if (!lint) return "validator returned nothing";
  if (Array.isArray(lint.errors) && lint.errors.length) return lint.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
  return String(lint.stdout || lint.stderr || `lint exit ${lint.code}`);
}

const FONT_FETCH_RE = /\[Compiler\] Fetched \d+ font face/;
const FONT_INJECT_RE = /Injected deterministic @font-face/;

async function renderCard(opts = {}) {
  const {
    template, vars = {}, brand = null, dims = null, dur = 2.5, projectDir, runId = null, signal = null,
    lang = "en", brandFont = null, aspect = "9:16", settings = null, project = null, pidFile, deps = {},
  } = opts;
  const started = Date.now();
  if (signal && signal.aborted) throw abortError("aborted before card render");
  if (typeof projectDir !== "string" || !projectDir) throw new EditError("CARD_BAD_INPUT", { status: 500, errorClass: "bug", detail: "projectDir is required" });
  const S = services(deps);
  const D = snapDur(dur);
  const tpl = getTemplate(template);
  const { w, h } = normDims(dims, tpl, aspect);
  let fonts = null;
  try { fonts = resolveCardFonts(tpl, { lang, brandFont }); } catch { fonts = null; }
  let cardHash = null;
  try { cardHash = cardHashFor({ template: tpl || template, vars, brand, fonts: fonts || [], w, h, fps: FPS, dur: D }); } catch { cardHash = null; }
  const timings = {};
  const fail = (reason, detail = null) => ({
    ok: false, path: null, relPath: null, format: null, cardHash, reason,
    detail: detail == null ? null : String(detail).slice(0, 600),
    fallback: safeFallback({ tpl, vars, brand, fonts: fonts || resolveCardFonts(null, {}), w, h, dur: D, lang }),
    w, h, durSec: D, timings: { ...timings, totalMs: Date.now() - started },
  });

  if (!tpl) return fail("unknown_template", String(template && template.id ? template.id : template));
  if (!fonts || !cardHash) return fail("fonts", "card fonts are unavailable");

  const relDir = `render/cards/${cardHash}`;
  const dir = fsx.resolveInside(projectDir, relDir);
  const cached = readCachedCard(dir, cardHash);
  if (cached) {
    return {
      ok: true, path: path.join(dir, OUT_NAME), relPath: `${relDir}/${OUT_NAME}`, format: "webm", cardHash, fallback: null, cached: true,
      w, h, durSec: D, frames: cached.frames, bytes: cached.bytes, layout: cached.layout || null, attempts: 0,
      fontLog: cached.fontLog || null, timings: { totalMs: Date.now() - started },
    };
  }

  try { await S.maybeFail("card", { settings, project, signal }); }
  catch (e) { if (isCancel(e, signal)) throw abortError("aborted"); return fail("fault", (e && (e.code || e.message)) || "fault"); }

  let built;
  try {
    built = tpl.build(vars || {}, brand || {}, fonts, { w, h, dur: D, lang: K.safeLang(lang), fps: FPS });
    if (!built || typeof built.indexHtml !== "string" || typeof built.metaJson !== "string") throw new Error("template returned no indexHtml/metaJson");
  } catch (e) {
    return fail("build_failed", e && (e.detail || e.message));
  }

  try {
    if (fs.existsSync(dir) && !(await fsx.rmWithRetry(dir))) throw new Error("stale card dir could not be removed");
    prepareCardDir(dir, built);
  } catch (e) {
    return fail("prepare", e && (e.detail || e.message));
  }

  // Gates: lint (errors only) then the runtime smoke check, in the isolated card dir.
  let t = Date.now();
  let lint;
  try { lint = await S.validate(dir, { indexHtml: built.indexHtml, metaJson: built.metaJson }); }
  catch (e) { lint = { ok: false, errors: [{ code: "validator_crashed", message: e && e.message }] }; }
  timings.lintMs = Date.now() - t;
  if (signal && signal.aborted) throw abortError("aborted after lint");
  if (!lint || !lint.ok) return fail("lint", lintSummary(lint));
  t = Date.now();
  let rc;
  try { rc = await S.runtimeCheck(dir); } catch (e) { rc = { ok: false, error: e && e.message }; }
  timings.runtimeMs = Date.now() - t;
  if (signal && signal.aborted) throw abortError("aborted after runtime check");
  if (!rc || !rc.ok) return fail("runtime", rc && rc.error);

  // Render: pinned local CLI, telemetry off, watchdog, one retry on an NTSTATUS launch crash.
  // The CLI creates its frame work dir next to --output (`work-<uuid>-XXXXXX`); inside a deep project path
  // that exceeds Windows MAX_PATH (ENOENT on mkdtemp), so the output goes to a short per-render temp dir
  // and is moved into the card dir afterwards. cwd (the composition) stays the isolated card dir.
  const runTag = RUN_ID_RE.test(String(runId || "")) ? String(runId) : `r${process.pid}_${++seq}`;
  const outTmp = `out_tmp_${runTag}.webm`;
  const outTmpAbs = path.join(dir, outTmp);
  const cleanupTmp = () => { try { fs.unlinkSync(outTmpAbs); } catch { /* noop */ } };
  let workRoot;
  try { workRoot = fs.mkdtempSync(path.join(deps.workRoot || os.tmpdir(), "vecard-")); }
  catch (e) { return fail("prepare", `render work dir: ${e && e.code}`); }
  const workOut = path.join(workRoot, OUT_NAME);
  const { cmd, args } = S.cliFor("render", ["--format", "webm", "--output", workOut, "--fps", String(FPS), "--workers", "1", "--quality", "standard", "."]);
  const runOpts = {
    cwd: dir, env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" }, timeoutMs: watchdogMsFor(D), signal,
    label: "hyperframes-card", maxStdoutBytes: 64e6, stage: "PREPARING_RENDER",
  };
  if (pidFile !== undefined) runOpts.pidFile = pidFile;
  let res = null, lastErr = null, attempts = 0;
  t = Date.now();
  try {
    for (let i = 0; i < 2; i++) {
      attempts++;
      try { res = await S.runProcess(cmd, args, runOpts); lastErr = null; break; }
      catch (e) {
        try { fs.unlinkSync(workOut); } catch { /* noop */ }
        if (isCancel(e, signal)) throw abortError("card render aborted");
        lastErr = e;
        const exitCode = e && e.extra ? e.extra.exitCode : null;
        if (i === 0 && e && e.code === "PROC_EXIT" && isNtCrash(exitCode)) { await abortableDelay(S.retryDelayMs, signal); continue; }
        break;
      }
    }
    if (res && fs.existsSync(workOut)) {
      try { fsx.renameWithRetrySync(workOut, outTmpAbs); }
      catch { fs.copyFileSync(workOut, outTmpAbs); }
    }
  } finally {
    await fsx.rmWithRetry(workRoot).catch(() => false);
  }
  timings.renderMs = Date.now() - t;
  if (!res) {
    const code = lastErr && lastErr.code ? lastErr.code : "error";
    const exit = lastErr && lastErr.extra && lastErr.extra.exitCode != null ? ` exit ${lastErr.extra.exitCode}` : "";
    return { ...fail("render", `${code}${exit}: ${lastErr && lastErr.detail ? lastErr.detail : ""}`), attempts };
  }
  const logText = `${res.stdout || ""}\n${res.stderr || ""}`;
  const fontLog = { fetched: FONT_FETCH_RE.test(logText), injected: FONT_INJECT_RE.test(logText) };
  if (!fs.existsSync(outTmpAbs)) { cleanupTmp(); return { ...fail("render", "render exited 0 without an output file"), attempts }; }

  t = Date.now();
  let v;
  try { v = await verifyCardWebm(outTmpAbs, { w, h, dur: D, fps: FPS, signal, pidFile }); }
  catch (e) {
    cleanupTmp();
    if (isCancel(e, signal)) throw abortError("aborted during verification");
    return { ...fail("verify", e && (e.code || e.message)), attempts };
  }
  timings.verifyMs = Date.now() - t;
  if (!v.ok) { cleanupTmp(); return { ...fail("verify", v.problems.join("; ")), attempts }; }

  const finalAbs = path.join(dir, OUT_NAME);
  let bytes;
  try {
    try { fs.unlinkSync(finalAbs); } catch { /* absent */ }
    fsx.renameWithRetrySync(outTmpAbs, finalAbs);
    bytes = fs.statSync(finalAbs).size;
    fsx.writeJsonAtomic(path.join(dir, MARKER), {
      cardHash, template: `${tpl.id}@${tpl.version}`, w, h, fps: FPS, durSec: D, frames: v.frames, bytes,
      alpha: v.alpha, fontLog, layout: built.layout || null, gsap: K.gsapVersion(), renderedAt: new Date().toISOString(),
    });
  } catch (e) {
    cleanupTmp();
    return { ...fail("verify", `commit failed: ${e && (e.code || e.message)}`), attempts };
  }
  return {
    ok: true, path: finalAbs, relPath: `${relDir}/${OUT_NAME}`, format: "webm", cardHash, fallback: null, cached: false,
    w, h, durSec: D, frames: v.frames, bytes, layout: built.layout || null, attempts, fontLog, alpha: v.alpha,
    timings: { ...timings, totalMs: Date.now() - started },
  };
}

module.exports = {
  TEMPLATE_IDS, KIND_TO_TEMPLATE, FPS, MARKER, OUT_NAME,
  getTemplate, resolveCardFonts, cardHashFor, snapDur, watchdogMsFor, normDims, prepareCardDir,
  renderCard, verifyCardWebm, parseAlphaStats,
  fallbackForCard, fallbackDialogues, fallbackAssText,
};
