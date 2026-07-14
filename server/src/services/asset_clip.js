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
async function embedImage(m, p) {
  const image = await m.RawImage.read(p);
  const inputs = await m.processor(image);
  const { image_embeds } = await m.visionModel(inputs);
  return l2norm(Array.from(image_embeds.data));
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
    const prompts = [positive || `a photo of ${subject}`, ...negatives];
    const pvecs = [];
    for (const p of prompts) pvecs.push(await embedText(m, p));
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
        const image = await m.RawImage.read(p);
        const inputs = await m.processor(image);
        const { image_embeds } = await m.visionModel(inputs);
        const ivec = l2norm(Array.from(image_embeds.data));
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
