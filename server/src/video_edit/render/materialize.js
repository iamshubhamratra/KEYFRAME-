// VIDEO EDIT MATERIALIZATION — turn the plan's references into files on disk (B-roll, music, SFX, logo, cards).
//
// WHY THIS EXISTS. The Edit Plan names assets ("pexels 123451, trim 0.5 s", "calm background music", "whoosh",
// "the uploaded logo"); the renderer needs verified local files. Two moments need them:
//   1. BUILDING_EDIT_PLAN — the first plan should already point at downloaded B-roll and a chosen music track, so
//      the editor can show "Bright Morning · Pixabay" and offer the other candidates without another fetch
//      (`materializePlan`, applied to the draft BEFORE revision 1 is committed; soft deadline, fail-open).
//   2. PREPARING_RENDER — anything a later revision still lacks (a user picked a candidate that was never
//      downloaded, a music search op, a file lost to retention) is fetched into a per-project LEDGER, never into the
//      plan: a render must not create revisions (that would push onto the user's undo stack and wipe redo).
//      `resolveMedia` returns the composition's `media` block from plan paths first, then the ledger.
// Every download goes through the existing gates: broll/acquire.acquireChosen (SSRF-safe fetch, magic + probe +
// decode checks), audio/music.musicCandidates (Pixabay bridge → synthesized pad), audio/sfx.resolveSfx (the shipped
// library), cards/render.renderCard (HyperFrames with an ASS fallback). No URL, file name or transcript text is logged.
//
// CONTRACT:
//   materializePlan(plan, { projectDir, project, signal, deadlineMs=60000, log, deps }) -> Promise<{ plan, changed, notes }>
//     plan is a draft (mutated in place and returned): B-roll items get `chosen` with a local path (status 'ok'), or
//     the next unused top candidate, or status 'missing'; music gets track + ≤2 candidates; a pending uploaded logo is
//     re-encoded to assets/logo-<sha12>.png and set as branding.logo (palette taken from it when the palette is 'default').
//   resolveMedia(plan, { projectDir, project, profileName, kind:'preview'|'export', signal, runId, log, pidFile,
//                        onProgress(pct, message), deps }) -> Promise<{ media, notes, ledgerChanged }>
//   processLogo(projectDir, { signal, pidFile, srcRel='source/logo.bin' }) -> Promise<{ path:'assets/logo-<sha12>.png', w, h, sha, type } | null>
//     (content-addressed; demuxer forced from the magic bytes; temp file always removed)
//   readLedger(projectDir) · LEDGER_REL
//   deps (tests): { acquireChosen, musicCandidates, resolveSfx, renderCard, fallbackForCard, extractLogoPalette, now }

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fsx = require("../fsx");
const proc = require("../engine/proc");
const { isEditError, EditError } = require("../errors");
const compose = require("./compose");
const P = require("./profiles");

const LEDGER_REL = "assets/ledger.json";
const LOGO_REL = "assets/logo.png";
const LOGO_SRC_REL = "source/logo.bin";
const MAX_LOGO_PX = 1024;
const CARD_CONCURRENCY = 1;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const r3 = (x) => Math.round(x * 1000) / 1000;
const live = (b) => b && b.status !== "removed" && b.enabled !== false;
const shown = (el) => el && el.resolved && !el.resolved.collapsed;

function mods(deps = {}) {
  return {
    acquireChosen: deps.acquireChosen || ((a) => require("../broll/acquire").acquireChosen(a)),
    musicCandidates: deps.musicCandidates || ((a) => require("../audio/music").musicCandidates(a)),
    resolveSfx: deps.resolveSfx || ((c, o) => require("../audio/sfx").resolveSfx(c, o)),
    renderCard: deps.renderCard || ((a) => require("../cards/render").renderCard(a)),
    fallbackForCard: deps.fallbackForCard || ((a) => require("../cards/render").fallbackForCard(a)),
    getTemplate: deps.getTemplate || ((id) => require("../cards/render").getTemplate(id)),
    extractLogoPalette: deps.extractLogoPalette || ((f, o) => require("../brand/brand").extractLogoPalette(f, o)),
    resolveEditBrand: deps.resolveEditBrand || ((a) => require("../brand/brand").resolveEditBrand(a)),
  };
}

function fileOk(projectDir, rel) {
  if (typeof rel !== "string" || !rel) return false;
  try {
    const abs = fsx.resolveInside(projectDir, rel);
    const st = fs.statSync(abs);
    return st.isFile() && st.size > 0;
  } catch { return false; }
}

function sha1Of(projectDir, rel) {
  try {
    const st = fs.statSync(path.join(projectDir, rel));
    return crypto.createHash("sha1").update(`${rel}|${st.size}|${Math.round(st.mtimeMs)}`).digest("hex");
  } catch { return null; }
}

function withDeadline(signal, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new EditError("MATERIALIZE_DEADLINE", { errorClass: "transient" })), Math.max(1, ms));
  const onAbort = () => ac.abort(signal.reason);
  if (signal) { if (signal.aborted) ac.abort(signal.reason); else signal.addEventListener("abort", onAbort, { once: true }); }
  return { signal: ac.signal, done: () => { clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); } };
}

const cancelled = (e, signal) => !!(signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled" && e.code !== "MATERIALIZE_DEADLINE");

// ---------------------------------------------------------------- ledger
function readLedger(projectDir) {
  const r = fsx.readJsonSafe(path.join(projectDir, LEDGER_REL));
  const v = r.ok && isPlain(r.value) ? r.value : {};
  return { broll: isPlain(v.broll) ? v.broll : {}, music: isPlain(v.music) ? v.music : {} };
}
function writeLedger(projectDir, ledger) {
  fsx.ensureDir(path.join(projectDir, "assets"));
  fsx.writeJsonAtomic(path.join(projectDir, LEDGER_REL), ledger);
}
const musicKey = (m) => crypto.createHash("sha1").update(`${(m.track && m.track.query) || ""}|${(m.track && m.track.mood) || ""}`).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- B-roll
async function acquireOne(M, projectDir, assetRef, output, signal) {
  const r = await M.acquireChosen({ projectDir, assetRef, output: { width: output.width, height: output.height }, profile: "export1080", signal, stage: "PREPARING_RENDER" });
  return r && r.assetRef ? r.assetRef : null;
}

async function materializeBrollItem(M, item, { projectDir, output, signal, used }) {
  const tries = [item.chosen, ...(Array.isArray(item.topCandidates) ? item.topCandidates : [])]
    .filter((a, i, arr) => a && a.assetId && arr.findIndex((x) => x && x.assetId === a.assetId) === i)
    .filter((a, i) => i === 0 || !used.has(a.assetId))
    .slice(0, 3);
  for (let i = 0; i < tries.length; i++) {
    const a = tries[i];
    if (fileOk(projectDir, a.path) && a.path.startsWith("assets/broll/")) return { ref: a, replaced: i > 0 };
    try {
      const ref = await acquireOne(M, projectDir, a, output, signal);
      if (ref && fileOk(projectDir, ref.path)) return { ref: { ...a, ...ref, scores: a.scores, trimInSec: a.trimInSec || 0 }, replaced: i > 0 };
    } catch (e) {
      if (cancelled(e, signal)) throw e;
    }
  }
  return null;
}

// ---------------------------------------------------------------- logo
// Logos are content-addressed (assets/logo-<sha1 12>.png): every revision keeps pointing at the logo it was made with,
// so undo / re-rendering an old revision never silently picks up a newer upload.
const DEMUXER = { png: "png_pipe", jpeg: "jpeg_pipe", webp: "webp_pipe" };
async function sniffImageType(file) {
  const b = Buffer.alloc(12);
  const fh = await fs.promises.open(file, "r");
  try { await fh.read(b, 0, 12, 0); } finally { await fh.close().catch(() => {}); }
  if (b.readUInt32BE(0) === 0x89504e47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

async function processLogo(projectDir, { signal, pidFile, srcRel = LOGO_SRC_REL } = {}) {
  const src = path.join(projectDir, srcRel);
  if (!fs.existsSync(src)) return null;
  const type = await sniffImageType(src);
  if (!type) return null;
  fsx.ensureDir(path.join(projectDir, "assets"));
  const tmpRel = `assets/logo.tmp.${crypto.randomBytes(6).toString("hex")}.png`;
  try {
    // Re-encode (strips metadata, bounds the size, normalizes to RGBA PNG) with the demuxer FORCED from the magic bytes
    // and a pixel cap, so a hostile file cannot pick a decoder.
    await proc.ffmpeg([
      "-y", "-protocol_whitelist", "file", "-f", DEMUXER[type], "-max_pixels", String(4096 * 4096), "-i", `file:${srcRel}`,
      "-frames:v", "1", "-vf", `scale='min(${MAX_LOGO_PX},iw)':'min(${MAX_LOGO_PX},ih)':force_original_aspect_ratio=decrease:flags=lanczos,format=rgba`,
      "-map_metadata", "-1", "-c:v", "png", tmpRel,
    ], { cwd: projectDir, signal, pidFile, timeoutMs: 60000, label: "logo-encode", stage: "PREPARING_RENDER" });
    const j = await proc.ffprobeJson(["-show_entries", "stream=width,height", "-of", "json", "-protocol_whitelist", "file", `file:${tmpRel}`],
      { cwd: projectDir, signal, pidFile, timeoutMs: 30000, label: "logo-probe" });
    const st = j && j.streams && j.streams[0];
    const w = Number(st && st.width) || 0, h = Number(st && st.height) || 0;
    if (!(w > 0 && h > 0)) return null;
    const sha = crypto.createHash("sha1").update(fs.readFileSync(path.join(projectDir, tmpRel))).digest("hex");
    const rel = `assets/logo-${sha.slice(0, 12)}.png`;
    if (!fs.existsSync(path.join(projectDir, rel))) fsx.renameWithRetrySync(path.join(projectDir, tmpRel), path.join(projectDir, rel));
    return { path: rel, w, h, sha, type };
  } finally {
    try { fs.unlinkSync(path.join(projectDir, tmpRel)); } catch { /* renamed or never written */ }
  }
}

async function logoForPlan(M, plan, { projectDir, project, signal, pidFile }) {
  const pending = project && isPlain(project.uploads) && isPlain(project.uploads.logo) && project.uploads.logo.status === "pending";
  if (!pending || (plan.branding && plan.branding.logo)) return false;
  const logo = await processLogo(projectDir, { signal, pidFile });
  if (!logo) return false;
  plan.branding = plan.branding || {};
  plan.branding.logo = { assetId: `ast_logo${logo.sha.slice(0, 12)}`, path: logo.path, placement: "tr", scale: 0.12, opacity: 0.9, marginPct: 0.04, show: "always" };
  const pal = plan.branding.palette;
  if (!pal || pal.source === "default") {
    try {
      const lp = await M.extractLogoPalette(path.join(projectDir, logo.path), { signal });
      if (lp && Array.isArray(lp.colors) && lp.colors.length) {
        const b = M.resolveEditBrand({ userPalette: plan.settings && plan.settings.brandColors, logoPalette: lp });
        if (b && b.primary) plan.branding.palette = { primary: b.primary, accent: b.accent, text: b.text, onAccent: b.onAccent, source: b.source };
      }
    } catch (e) { if (cancelled(e, signal)) throw e; }
  }
  return true;
}

// ---------------------------------------------------------------- plan-time materialization
async function materializePlan(plan, { projectDir, project, signal = null, deadlineMs = 60000, log = console, pidFile, deps = {} } = {}) {
  const M = mods(deps);
  const notes = [];
  let changed = false;
  const dl = withDeadline(signal, deadlineMs);
  try {
    // Logo first: it can change the palette the captions and cards are styled with.
    try { if (await logoForPlan(M, plan, { projectDir, project, signal: dl.signal, pidFile })) changed = true; }
    catch (e) { if (cancelled(e, signal)) throw e; notes.push({ code: "LOGO_NOT_PROCESSED" }); }

    const used = new Set((plan.broll || []).filter((b) => b.chosen && b.chosen.assetId).map((b) => b.chosen.assetId));
    const items = (plan.broll || []).filter((b) => live(b) && b.chosen && (b.status === "ok" || b.status === "pending"));
    const jobs = items.map((item) => async () => {
      if (dl.signal.aborted) return;
      try {
        const got = await materializeBrollItem(M, item, { projectDir, output: plan.output, signal: dl.signal, used });
        if (got) {
          if (got.replaced) { used.add(got.ref.assetId); notes.push({ code: "BROLL_REPLACED_UNAVAILABLE", elementId: item.id }); }
          item.chosen = got.ref; item.status = "ok"; changed = true;
        } else if (!dl.signal.aborted) {
          item.status = "missing"; changed = true;
          notes.push({ code: "BROLL_UNAVAILABLE", elementId: item.id });
        }
      } catch (e) {
        if (cancelled(e, signal)) throw e;
      }
    });
    await runLimited(jobs, 2);

    const m = plan.music;
    if (m && m.enabled && !(m.track && fileOk(projectDir, m.track.path)) && !dl.signal.aborted) {
      try {
        const tracks = await M.musicCandidates({
          query: (m.track && m.track.query) || "calm background", mood: (m.track && m.track.mood) || "calm",
          durationSec: (plan.timeline && plan.timeline.outDurationSec) || (plan.source && plan.source.durationSec) || 30,
          projectId: project && project.id, projectDir, max: 3, signal: dl.signal,
        });
        if (Array.isArray(tracks) && tracks.length) {
          m.track = { ...tracks[0] };
          m.candidates = tracks.slice(1, 3).map((t) => ({ ...t }));
          changed = true;
        } else notes.push({ code: "MUSIC_UNAVAILABLE" });
      } catch (e) { if (cancelled(e, signal)) throw e; notes.push({ code: "MUSIC_UNAVAILABLE" }); }
    }
  } finally { dl.done(); }
  if (dl.signal.aborted && !(signal && signal.aborted)) notes.push({ code: "MATERIALIZE_DEFERRED" });
  void log;
  return { plan, changed, notes };
}

async function runLimited(jobs, n) {
  let i = 0;
  const worker = async () => { while (i < jobs.length) { const j = jobs[i++]; await j(); } };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
}

// ---------------------------------------------------------------- render-time media
function probeLite(projectDir, rel) {
  // Dimensions/duration recorded by acquire in its sidecar (assets/broll/<assetId>.json), when present.
  try {
    const side = rel.replace(/\.[a-z0-9]+$/i, ".json");
    const j = JSON.parse(fs.readFileSync(path.join(projectDir, side), "utf8"));
    const p = j && j.probe ? j.probe : {};
    return { w: Number(p.width) || null, h: Number(p.height) || null, durationSec: Number(p.durationSec) || null, sha: j.sha1 || null };
  } catch { return {}; }
}

async function resolveMedia(plan, { projectDir, project, profileName, kind = "preview", signal = null, runId = null, log = console, pidFile, settings, onProgress, deps = {} } = {}) {
  const M = mods(deps);
  const notes = [];
  const ledger = readLedger(projectDir);
  let ledgerChanged = false;
  const say = (pct, msg) => { try { if (typeof onProgress === "function") onProgress(pct, msg); } catch { /* noop */ } };
  const media = { broll: {}, music: null, sfx: {}, logo: null, cards: {} };

  // B-roll
  const used = new Set();
  const items = (plan.broll || []).filter((b) => live(b) && b.status !== "missing" && b.chosen && shown(b));
  let k = 0;
  for (const item of items) {
    say(5 + Math.round((k++ / Math.max(1, items.length)) * 40), "Getting your B-roll");
    let ref = item.chosen;
    if (!fileOk(projectDir, ref.path) || !String(ref.path).startsWith("assets/broll/")) {
      const hit = ledger.broll[ref.assetId];
      if (hit && fileOk(projectDir, hit.path)) ref = { ...ref, ...hit };
      else {
        try {
          const got = await acquireOne(M, projectDir, ref, plan.output, signal);
          if (got && fileOk(projectDir, got.path)) {
            ref = { ...ref, ...got };
            ledger.broll[ref.assetId] = { path: got.path, type: got.type || ref.type, width: got.width, height: got.height, durationSec: got.durationSec };
            ledgerChanged = true;
          } else ref = null;
        } catch (e) {
          if (cancelled(e, signal)) throw e;
          ref = null;
        }
      }
    }
    if (!ref) { notes.push({ code: "BROLL_UNAVAILABLE", elementId: item.id }); continue; }
    const lite = probeLite(projectDir, ref.path);
    media.broll[item.id] = {
      path: ref.path, type: ref.type === "image" ? "image" : "video", durationSec: ref.durationSec || lite.durationSec || null,
      w: ref.width || lite.w || null, h: ref.height || lite.h || null, sha: lite.sha || sha1Of(projectDir, ref.path),
    };
    used.add(ref.assetId);
  }

  // Music
  const m = plan.music;
  if (m && m.enabled && plan.settings.musicEnabled !== false) {
    say(50, "Finding the music");
    let track = m.track && fileOk(projectDir, m.track.path) ? m.track : null;
    if (!track) {
      const key = musicKey(m);
      const hit = Array.isArray(ledger.music[key]) ? ledger.music[key].find((t) => fileOk(projectDir, t.path)) : null;
      if (hit) track = hit;
      else {
        try {
          const tracks = await M.musicCandidates({
            query: (m.track && m.track.query) || "calm background", mood: (m.track && m.track.mood) || "calm",
            durationSec: (plan.timeline && plan.timeline.outDurationSec) || 30, projectId: project && project.id, projectDir, max: 3, signal,
          });
          if (Array.isArray(tracks) && tracks.length) { ledger.music[key] = tracks; ledgerChanged = true; track = tracks[0]; }
        } catch (e) { if (cancelled(e, signal)) throw e; }
      }
    }
    if (track) media.music = { path: track.path, durationSec: track.durationSec || null, title: track.title || null, sha: sha1Of(projectDir, track.path) };
    else notes.push({ code: "MUSIC_UNAVAILABLE" });
  }

  // SFX (the shipped library; copied into the project once)
  if (plan.settings.sfxEnabled !== false) {
    for (const s of plan.sfx || []) {
      if (!s || s.enabled === false || !s.resolved || s.resolved.collapsed) continue;
      try {
        const r = await M.resolveSfx(s.cue, { projectDir });
        if (r && r.path && fileOk(projectDir, r.path)) media.sfx[s.id] = { path: r.path, attribution: r.attribution || null, license: r.license || null, sourceUrl: r.licenseUrl || null, sha: sha1Of(projectDir, r.path) };
        else notes.push({ code: "SFX_UNAVAILABLE", elementId: s.id });
      } catch (e) { if (cancelled(e, signal)) throw e; notes.push({ code: "SFX_UNAVAILABLE", elementId: s.id }); }
    }
  }

  // Logo
  const logo = plan.branding && plan.branding.logo;
  if (logo && logo.show !== "none") {
    if (fileOk(projectDir, logo.path)) {
      let w = null, h = null;
      try {
        const j = await proc.ffprobeJson(["-show_entries", "stream=width,height", "-of", "json", "-protocol_whitelist", "file", `file:${logo.path}`], { cwd: projectDir, signal, pidFile, timeoutMs: 30000, label: "logo-probe" });
        const st = j && j.streams && j.streams[0];
        w = Number(st && st.width) || null; h = Number(st && st.height) || null;
      } catch (e) { if (cancelled(e, signal)) throw e; }
      if (w && h) media.logo = { path: logo.path, w, h, sha: sha1Of(projectDir, logo.path) };
      else notes.push({ code: "LOGO_UNREADABLE" });
    } else notes.push({ code: "LOGO_MISSING" });
  }

  // Cards: export renders real HyperFrames cards (one at a time, heavy); preview uses the ASS fallback immediately.
  const graphics = (plan.graphics || []).filter((g) => g && g.enabled === true && shown(g));
  const out = P.outputFor(profileName, plan.output.aspect);
  const lang = (plan.captions && plan.captions.sourceLanguage) || (plan.source && plan.source.language) || "en";
  const brand = plan.branding && plan.branding.palette ? plan.branding.palette : null;
  let gi = 0;
  for (const g of graphics) {
    const geom = compose.cardGeom(g, { w: out.w, h: out.h }, profileName, plan.output.aspect);
    const tpl = M.getTemplate(g.templateId || g.kind);
    const vars = { ...(isPlain(g.variables) ? g.variables : {}), title: g.text && g.text.title, subtitle: g.text && g.text.subtitle, value: g.text && g.text.value };
    if (g.kind === "LOGO_OUTRO" && media.logo) vars.logoPath = path.join(projectDir, media.logo.path);
    const dur = r3(Math.max(1, g.resolved.outOut - g.resolved.outIn));
    const cardArgs = { template: tpl || g.templateId, vars, brand, dims: { w: geom.w, h: geom.h }, dur, lang, aspect: plan.output.aspect, brandFont: plan.branding && plan.branding.font };
    if (kind === "export" && P.getProfile(profileName).cards === "hyperframes") {
      say(60 + Math.round((gi++ / Math.max(1, graphics.length)) * 35), "Animating the titles");
      try {
        const r = await M.renderCard({ ...cardArgs, projectDir, runId, signal, settings, project, pidFile });
        if (r && r.ok && r.relPath) { media.cards[g.id] = { status: "ok", path: r.relPath, w: r.w, h: r.h, durSec: r.durSec, cardHash: r.cardHash }; continue; }
        if (r && r.fallback) { media.cards[g.id] = { status: "fallback", fallback: r.fallback, cardHash: r.cardHash }; notes.push({ code: "CARD_FALLBACK", elementId: g.id, reason: r.reason || null }); continue; }
      } catch (e) { if (cancelled(e, signal)) throw e; }
    }
    try {
      const fb = M.fallbackForCard(cardArgs);
      if (fb) media.cards[g.id] = { status: "fallback", fallback: fb, cardHash: null };
    } catch (e) { if (cancelled(e, signal)) throw e; notes.push({ code: "CARD_UNAVAILABLE", elementId: g.id }); }
  }

  if (ledgerChanged) { try { writeLedger(projectDir, ledger); } catch (e) { log.warn && log.warn(`[video-edit] ledger write failed code=${(e && e.code) || "INTERNAL"}`); } }
  return { media, notes, ledgerChanged };
}

module.exports = { materializePlan, resolveMedia, processLogo, readLedger, LEDGER_REL, LOGO_REL, CARD_CONCURRENCY };
