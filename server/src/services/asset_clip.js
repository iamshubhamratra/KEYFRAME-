// CLIP image<->text relevance (local, no API cost) via transformers.js.
//
// Judges whether an image's PIXELS actually match a text description — the
// semantic-relevance signal that the lexical tag-overlap ranker (util.js) and
// tag-based matching can't provide. Used by the Creative Director to pre-score
// every collected asset against the film's subject, so obviously off-topic stock
// is caught cheaply and the strongest-matching assets are surfaced.
//
// Model: Xenova/clip-vit-base-patch32 (ONNX, quantized). Loaded lazily and cached
// for the process; the first call downloads the weights (~1x, then cached on disk).
//
// FAIL-SOFT by design: if the package/model/onnx runtime isn't available, every
// entry point returns null and callers fall back to their existing behavior — CLIP
// is a bonus signal, never a hard dependency.

const path = require("node:path");
const fs = require("node:fs");

const MODEL_ID = process.env.CLIP_MODEL || "Xenova/clip-vit-base-patch32";
const DISABLED = /^(0|false|no|off)$/i.test(String(process.env.CREATIVE_DIRECTOR_CLIP || ""));

let loadPromise = null;   // Promise<{ tokenizer, textModel, processor, visionModel, RawImage } | null>
let warned = false;

function warnOnce(msg) {
  if (!warned) { warned = true; console.warn(`[clip] ${msg} — CLIP relevance disabled (falling back to lexical + vision-LLM only)`); }
}

async function load() {
  if (DISABLED) return null;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let tf;
    try {
      tf = await import("@huggingface/transformers");
    } catch (e) {
      warnOnce(`@huggingface/transformers not installed (${String(e.message).slice(0, 80)})`);
      return null;
    }
    try {
      const { AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = tf;
      // Keep the model cache inside the repo so it survives across runs and is easy to find.
      try { env.cacheDir = path.join(__dirname, "..", "..", ".cache", "transformers"); } catch { /* optional */ }
      const t0 = Date.now();
      const [tokenizer, textModel, processor, visionModel] = await Promise.all([
        AutoTokenizer.from_pretrained(MODEL_ID),
        CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8" }),
        AutoProcessor.from_pretrained(MODEL_ID),
        CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8" }),
      ]);
      console.log(`[clip] model "${MODEL_ID}" ready (${Date.now() - t0}ms)`);
      return { tokenizer, textModel, processor, visionModel, RawImage };
    } catch (e) {
      warnOnce(`could not load model "${MODEL_ID}" (${String(e.message).slice(0, 100)})`);
      return null;
    }
  })();
  return loadPromise;
}

// True once the model is available (or determinably unavailable). Callers can use
// this to decide whether to bother thumbnailing for CLIP.
async function available() {
  return (await load()) != null;
}

function l2norm(arr) {
  let s = 0; for (const x of arr) s += x * x;
  const n = Math.sqrt(s) || 1;
  return arr.map((x) => x / n);
}
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// Embed one text string -> normalized vector (or null).
async function embedText(m, text) {
  const inputs = await m.tokenizer([String(text || "")], { padding: true, truncation: true });
  const { text_embeds } = await m.textModel(inputs);
  return l2norm(Array.from(text_embeds.data));
}

// Embed one image file -> normalized vector.
// CLIP ViT-B/32 sees 224x224. Everything above that is decoded and thrown away.
//
// `RawImage.read(path)` decodes the ORIGINAL at full resolution — for this pipeline's website
// captures that is a 2732x1800 PNG, decoded in full so the processor can immediately resize it
// to 224. The same file is decoded and resized AGAIN moments later by the Creative Director's
// `thumbBase64`, and again by the crop engine. The audit costed this at 80-250ms per image
// across 20-30 images.
//
// So: hand CLIP a small file instead. The target is 336px rather than 224 — 1.5x the model's
// input — deliberately, so the processor's own resample still has headroom and the resulting
// tensor is as close as possible to the single-resample original. `clipRelevance` is a soft
// ranking signal, not a gate, so a marginal resampling difference is acceptable; a large one
// would not be, which is why this does not resize straight to 224.
//
// Only images meaningfully LARGER than that are touched (below the threshold the copy costs
// more than the decode saves), and any failure falls straight back to the original path.
//
// FFMPEG, NOT SHARP — AND THIS IS NOT A STYLE PREFERENCE.
//
// The first version of this used `sharp`, and it SEGFAULTED the whole process. Measured
// directly: loading sharp BEFORE @huggingface/transformers survives; loading it AFTER —
// which is exactly what a lazy `require("sharp")` inside the CLIP path does — dies with
// `GLib-GObject-CRITICAL: invalid uninstantiatable type` and takes the render with it.
// libvips and onnxruntime-node both pull native image libraries and the second one to
// initialise loses.
//
// `asset_sources/util.js:167` states the repo's standing policy in so many words —
// "ffmpeg-only (no `sharp`, per repo policy)" — and this is the reason for it. ffmpeg is a
// separate PROCESS, so it cannot conflict with anything loaded in ours.
const CLIP_INPUT_PX = 336;
const CLIP_DOWNSCALE_ABOVE = 768;

// One ffmpeg pass -> a downscaled PNG at `tmp`. Resolves false on any failure.
function ffDownscale(src, tmp) {
  return new Promise((resolve) => {
    const { spawn } = require("node:child_process");
    // `force_original_aspect_ratio=decrease` is ffmpeg's `fit: inside`; the white pad matches
    // the flatten a cut-out would otherwise need (CLIP has no alpha and reads it as black).
    const p = spawn("ffmpeg", [
      "-v", "error", "-i", src,
      "-vf", `scale=${CLIP_INPUT_PX}:${CLIP_INPUT_PX}:force_original_aspect_ratio=decrease,format=rgb24`,
      "-frames:v", "1", "-y", tmp,
    ], { windowsHide: true });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve(false); });
    p.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

// Returns a path CLIP should read, plus a disposer. Never throws.
async function readablePath(p) {
  try {
    // Cheap metadata read via the probe this repo already uses everywhere else — no new
    // native dependency, and it is the same ffprobe call the asset pipeline makes anyway.
    const { ffprobeImage } = require("./asset_sources");
    const dim = await ffprobeImage(p).catch(() => null);
    if (!dim || Math.max(dim.width || 0, dim.height || 0) <= CLIP_DOWNSCALE_ABOVE) {
      return { path: p, dispose: null };
    }
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `kf_clip_${process.pid}_${Math.abs(hashPath(p))}.png`);
    const ok = await ffDownscale(p, tmp);
    if (!ok) { try { fs.unlinkSync(tmp); } catch { /* noop */ } return { path: p, dispose: null }; }
    return { path: tmp, dispose: () => { try { fs.unlinkSync(tmp); } catch { /* noop */ } } };
  } catch {
    return { path: p, dispose: null };
  }
}
function hashPath(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h | 0;
}

async function embedImage(m, p) {
  const { path: readPath, dispose } = await readablePath(p);
  try {
    const image = await m.RawImage.read(readPath);
    const inputs = await m.processor(image);
    const { image_embeds } = await m.visionModel(inputs);
    return l2norm(Array.from(image_embeds.data));
  } finally {
    if (dispose) dispose();
  }
}

// The proper zero-shot relevance signal: for each image, softmax its similarity
// to "a photo of <subject>" against a handful of generic NEGATIVE prompts. Raw
// CLIP cosines cluster (0.2–0.3) and barely separate topics; the softmax vs
// negatives turns that into a sharp 0..1 probability that the image is actually
// about the subject. Returns number[] (0..1) aligned to imagePaths, or null.
const DEFAULT_NEGATIVES = [
  "a generic unrelated stock photo",
  "an abstract background or texture",
  "a random unrelated object",
  "outdoor scenery, a landscape, or a landmark",
  "food, an animal, or a plant",
];
async function relevanceProb(subject, imagePaths, { negatives = DEFAULT_NEGATIVES, positive } = {}) {
  const m = await load();
  if (!m || !Array.isArray(imagePaths) || !imagePaths.length) return null;
  try {
    // The six prompt embeddings are independent of each other and of every image. They were
    // computed one at a time; `Promise.all` costs nothing and removes five round-trips from
    // the front of every review.
    const prompts = [positive || `a photo of ${subject}`, ...negatives];
    const pvecs = await Promise.all(prompts.map((p) => embedText(m, p)));

    // Images stay SERIAL through the model on purpose: one ONNX session is shared for the
    // process, and issuing concurrent `run()` calls against it buys little (the runtime
    // serialises internally) while risking a class of bug that would be invisible until it
    // corrupted a score. The expensive part was never the inference — it was decoding a
    // full-resolution PNG per image, which `readablePath` now avoids.
    const out = [];
    for (const ip of imagePaths) {
      try {
        if (!ip || !fs.existsSync(ip)) { out.push(null); continue; }
        const ivec = await embedImage(m, ip);
        const scaled = pvecs.map((pv) => dot(ivec, pv) * 100); // CLIP temperature ≈ 100
        const mx = Math.max(...scaled);
        const exps = scaled.map((s) => Math.exp(s - mx));
        const sum = exps.reduce((a, b) => a + b, 0) || 1;
        out.push(Math.round((exps[0] / sum) * 1000) / 1000); // P(image is the subject)
      } catch { out.push(null); }
    }
    return out;
  } catch (e) {
    warnOnce(`softmax scoring failed (${String(e.message).slice(0, 80)})`);
    return null;
  }
}

// Cosine similarity of `text` against each image path. Returns number[] aligned to
// `imagePaths` (each ~ -1..1, typically 0.15–0.35 for CLIP ViT-B/32), or null if
// CLIP is unavailable. Individual unreadable images resolve to null in the array.
async function relevance(text, imagePaths) {
  const m = await load();
  if (!m || !Array.isArray(imagePaths) || !imagePaths.length) return null;
  try {
    const tvec = await embedText(m, text);
    const out = [];
    for (const p of imagePaths) {
      try {
        if (!p || !fs.existsSync(p)) { out.push(null); continue; }
        // Route through `embedImage` rather than repeating its three lines inline. The inline
        // copy read every image at FULL resolution and so missed the downscale entirely — two
        // implementations of one operation, and only one of them fixed.
        const ivec = await embedImage(m, p);
        out.push(Math.round(dot(tvec, ivec) * 1000) / 1000);
      } catch { out.push(null); }
    }
    return out;
  } catch (e) {
    warnOnce(`scoring failed (${String(e.message).slice(0, 80)})`);
    return null;
  }
}

module.exports = { relevance, relevanceProb, available, MODEL_ID };
