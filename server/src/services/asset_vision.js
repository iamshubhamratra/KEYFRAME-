// Vision relevance gate for fetched web stock. Off-topic stock (a Pisa-tower
// photo landing in a dog film because the query said "landmark moment") is the
// single biggest visual killer — a scene carried by the design system's own
// vectors beats a scene anchored on an irrelevant photo every time.
//
// One cheap flash-vision call per fetched web asset: "does this plausibly
// serve a film about <subject>?" Curated-library picks, real website
// screenshots, and vectors/icons are trusted and never gated.
//
// FAIL-OPEN by design: any failure (LLM budget exhausted, ffmpeg missing,
// timeout, parse error) keeps the asset — the gate must never make a video
// WORSE by starving it of assets when providers are down.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

function ff(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

// Small JPEG thumbnail (≤384px wide) of an image, or of a frame ~1s into a
// video — keeps the vision call cheap regardless of source size.
async function thumbBase64(absPath, isVideo) {
  const tmp = path.join(os.tmpdir(), `kf-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const args = isVideo
    ? ["-y", "-v", "error", "-ss", "1", "-i", absPath, "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "6", tmp]
    : ["-y", "-v", "error", "-i", absPath, "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "6", tmp];
  const ok = await ff(args);
  if (!ok || !fs.existsSync(tmp)) return null;
  try {
    const b64 = fs.readFileSync(tmp).toString("base64");
    return b64.length > 200 ? b64 : null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
  }
}

// -> { keep: boolean, sees: string|null }. keep=true on ANY failure.
async function checkAssetRelevance({ absPath, type, subject, query, tracker, signal }) {
  try {
    const b64 = await thumbBase64(absPath, type === "video");
    if (!b64) return { keep: true, sees: null };

    const user = [
      {
        type: "text",
        text:
          `A stock library returned this ${type === "video" ? "video (one frame shown)" : "image"} for a film whose subject is: "${subject}". ` +
          `The search query was: "${query}".\n` +
          `Question: would a film director accept this asset in that film — does it show the subject itself, the people who use it, or a setting/mood that genuinely fits the subject's real-world domain? ` +
          `Unrelated buildings/landmarks, maps, diagrams of something else, or random objects are NOT acceptable. ` +
          `In particular, REJECT a photo of a specific physical machine, appliance, or hardware product (e.g. a printer, fax machine, kitchen appliance) when the subject is really software, a digital service, a brand, or an abstract idea and the object is linked only by a keyword or pun — that is a literal-match misfire, not a real asset. ` +
          `(A recognizable concept metaphor like a lightbulb for "ideas" or a rocket for "growth" is fine.)\n` +
          `Reply STRICT JSON: {"usable": true|false, "sees": "<3-6 words: what the image actually shows>"}`,
      },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
    ];

    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: "You are a strict stock-footage librarian. Reply with strict JSON only.",
      user,
      jsonMode: true,
      stage: "vision",
      temperature: 0,
      signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "vision" });

    const v = extractFirstJsonObject(text);
    return { keep: v.usable !== false, sees: typeof v.sees === "string" ? v.sees : null };
  } catch (e) {
    // Budget-dead providers, network, ffmpeg — all land here. Keep the asset.
    return { keep: true, sees: null, skipped: String(e?.message || e).slice(0, 120) };
  }
}

// Batched relevance gate — classify MANY fetched web-stock assets in as few
// vision calls as possible (chunks of 6) instead of one call per asset. Returns
// an array of { keep, sees } aligned 1:1 with the input `assets` order. Same
// FAIL-OPEN contract as checkAssetRelevance: any failure — a dead LLM budget, an
// un-thumbnailable file, or a missing per-asset verdict — keeps that asset.
//
// `assets`: [{ absPath, type:"image"|"video", query? }]
async function checkAssetsRelevance({ assets, subject, tracker, signal }) {
  if (!Array.isArray(assets) || !assets.length) return [];
  const out = assets.map(() => ({ keep: true, sees: null }));
  if (!subject) return out;

  const CHUNK = 6;
  for (let start = 0; start < assets.length; start += CHUNK) {
    const chunk = assets.slice(start, start + CHUNK);
    try {
      // Thumbnail each; an asset we can't render stays keep=true (skipped below).
      const thumbs = [];
      for (const a of chunk) thumbs.push(await thumbBase64(a.absPath, a.type === "video"));
      const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
      if (!usable.length) continue;

      const content = [{
        type: "text",
        text:
          `A stock library returned ${usable.length} asset(s) for a film whose subject is: "${subject}". ` +
          `For EACH numbered asset, decide whether a PROFESSIONAL film director would actually put it on screen ` +
          `in a premium promo. ACCEPT only if it clearly shows the subject itself, the people who genuinely use ` +
          `it, or a real setting/mood that fits the subject's true domain — AND looks modern and professional. ` +
          `REJECT (usable:false) if ANY of these is true:\n` +
          `• LITERAL PUN on a word in the query instead of the real subject — e.g. a construction site / builders ` +
          `/ cranes for "build", cargo ships or boats for "ship", rockets or outer space for "launch", plumbing ` +
          `pipes for "pipeline", a physical target for "goals" — when the subject is software, a digital service, ` +
          `a brand, or an idea. The visual must match the SUBJECT, not a keyword.\n` +
          `• A screenshot, UI, app window, logo, or branding of a DIFFERENT named product or company than the ` +
          `subject (e.g. a ChatGPT / Google / other-app screenshot for an unrelated product).\n` +
          `• A specific physical machine / appliance / consumer product (printer, fax, kitchen gadget, a CAMERA, ` +
          `toothpaste / cosmetics / packaged goods, dental or medical props) linked only by a stray keyword and ` +
          `not by the subject's actual domain.\n` +
          `• A LUXURY OBJECT — a cut diamond or gemstone, jewelry, gold bars, a sports car — used as a ` +
          `"premium / value / quality" metaphor when the subject is software, a digital service, or a brand. ` +
          `Glamour stock never reads as the product.\n` +
          `• Generic, dated, or amateur CLIP-ART / cheesy cartoon illustration (little cartoon office people, ` +
          `corporate-handshake clip-art, flat vector mascots) that would cheapen a premium promo.\n` +
          `• Unrelated buildings / landmarks / maps / random objects, or a visible watermark, stock-site logo, or ` +
          `"sample/preview" text.\n` +
          `A clean, simple ICON-style metaphor (one lightbulb glyph for "ideas") is fine; a full literal SCENE of ` +
          `the pun, or clip-art, is NOT. When unsure, REJECT — fewer on-topic assets beat off-topic filler.\n` +
          `The ${usable.length} images follow, each preceded by its number (1..${usable.length}).\n` +
          `Reply STRICT JSON: {"verdicts":[{"n":1,"usable":true|false,"sees":"<3-6 words: what it shows>"}]} — exactly one entry per asset.`,
      }];
      usable.forEach((x, n) => {
        const q = chunk[x.i] && chunk[x.i].query;
        content.push({ type: "text", text: `Asset ${n + 1}${q ? ` (search query: "${q}")` : ""}:` });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
      });

      const { text, tokensIn, tokensOut } = await openrouter.chat({
        system: "You are a strict stock-footage librarian. Reply with strict JSON only.",
        user: content,
        jsonMode: true,
        stage: "vision",
        temperature: 0,
        signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "vision" });

      const parsed = extractFirstJsonObject(text);
      const verdicts = Array.isArray(parsed && parsed.verdicts) ? parsed.verdicts : [];
      const byN = new Map();
      for (const v of verdicts) { const n = Number(v && v.n); if (Number.isFinite(n)) byN.set(n, v); }
      usable.forEach((x, n) => {
        const v = byN.get(n + 1);
        if (v) out[start + x.i] = { keep: v.usable !== false, sees: typeof v.sees === "string" ? v.sees : null };
      });
    } catch (e) {
      // Fail-open for the whole chunk — never starve a film of assets.
      const skipped = String((e && e.message) || e).slice(0, 120);
      for (let i = 0; i < chunk.length; i++) out[start + i] = { keep: true, sees: null, skipped };
    }
  }
  return out;
}

module.exports = { checkAssetRelevance, checkAssetsRelevance };
