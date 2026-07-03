// QA Agent — the reviewer at the end of the line. Samples frames from the
// RENDERED video, shows them to the vision model alongside the design-system
// expectations, and returns a structured verdict. A failed verdict feeds one
// repair pass back through the Composition agent.
//
// This agent exists because every failure we shipped during development
// (empty scenes, offscreen content, unreadable text) was visible in frames
// and invisible to lint.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const openrouter = require("./../services/openrouter");
const { extractFirstJsonObject } = require("../services/json_lenient");

function extractFrame(videoPath, atSec, outPath) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", videoPath, "-vframes", "1", "-vf", "scale=640:-2", "-q:v", "6", outPath]);
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 30_000);
    p.on("error", () => { clearTimeout(timer); resolve(false); });
    p.on("exit", (code) => { clearTimeout(timer); resolve(code === 0 && fs.existsSync(outPath)); });
  });
}

// Sample one frame inside every scene (mid-scene, past the entrance) plus the
// very first frame — empty openings were a real failure mode.
function sampleTimes(scenes, duration) {
  const raw = [0.6];
  for (const s of scenes || []) {
    raw.push(Math.min(duration - 0.2, s.start + Math.min(s.duration * 0.6, s.duration - 0.3)));
  }
  // ALWAYS review the tail — the CTA/outro end-state (final logo, last caption,
  // late entrances) is where videos most often break, and it was previously
  // never sampled on videos with >7 scenes (head-truncated by the slice).
  raw.push(Math.max(0.6, Math.round((duration - 0.4) * 10) / 10));
  const uniq = [...new Set(raw.map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
  if (uniq.length <= 8) return uniq;
  // Too many scenes to sample all 8: down-sample EVENLY but always keep the
  // first and last frame so neither the opening nor the outro goes unreviewed.
  const picked = [uniq[0]];
  const step = (uniq.length - 1) / 7;
  for (let k = 1; k <= 6; k++) picked.push(uniq[Math.round(k * step)]);
  picked.push(uniq[uniq.length - 1]);
  return [...new Set(picked)];
}

const VERDICT_INSTRUCTIONS = `You are the quality-assurance director reviewing rendered video frames before delivery. Judge ONLY what is visible. Return STRICT JSON:
{
  "pass": true|false,
  "score": <0-10>,
  "issues": [{ "atSec": <number>, "severity": "blocker|minor", "issue": "<what is wrong>", "fix": "<a CONCRETE instruction for the composer: which element, what to change, where>" }]
}

BLOCKER issues (any ONE fails the video — be strict, this is a premium motion-graphics product):
1. EMPTY / NEAR-EMPTY FRAME: only a background or solid color is visible, with no real content.
2. UNDER-ILLUSTRATED FRAME: the frame shows essentially just text (a headline/body) on a flat or near-flat background, with NO supporting imagery, vectors, shapes, particles, or decorative layers. Premium video keeps multiple distinct visual layers on screen — a frame must show AT LEAST 2–3 distinct non-text visual elements (a photo, plus SVG accents / particles / shapes / icons). A text-only or text-plus-one-static-gradient frame is a BLOCKER. In the "fix", tell the composer to add specific animated vector/asset layers (e.g. "add a drifting particle field + a drawing underline + an inset image at 8–10s").
3. TEXT CONTRAST FAILURE: any text you cannot read instantly and comfortably at thumbnail size — light text on a light ground, dark text on a dark ground, text in an accent hue that blends into the background, or text laid over a busy image/gradient without a solid contrast device behind it. Treat WCAG AA (~4.5:1) as the floor; if contrast looks even borderline, FAIL it and tell the composer the exact fix (swap text to the lightest/darkest token, or add a solid panel/scrim behind it).
4. TEXT OVERFLOW: text cut off mid-word, overflowing its container, or clipped at the frame edge.
5. IMAGE DISTORTION: an image stretched/squashed (missing object-fit: cover) or covering critical text.
6. CONTENT OFFSCREEN: a card/element half off the frame edge with nothing else visible (layout error).
7. ELEMENT COLLISION: two or more CONTENT blocks (cards, stat tiles, labels, headlines, icon groups, image insets) overlapping or stacked on top of one another in SPACE when they should sit side-by-side or stacked-with-a-gap — e.g. text running through another text block, a stat tile covering a label, two cards occupying the same region. (This does NOT apply to deliberate layered effects like a glow/scrim/shadow behind text.) In the "fix", NAME which elements collide and tell the composer to lay them out in a flex/grid container with an explicit gap, or move/scale one element so they no longer overlap.
8. MASSIVE EMPTY SPACE: visible content (text + imagery + active decoration) covers well under ~70% of the frame — e.g. a headline or small image floating in the center of a near-empty canvas, or a whole quadrant/half left blank. Premium motion design fills the frame edge-to-edge. In the "fix", tell the composer to enlarge the headline/imagery, push content toward the edges (full-bleed or large insets), and add edge-anchored decorative/particle layers so the frame breathes edge-to-edge.
9. DECORATION DOMINATES THE CONTENT: a large flat/saturated decorative shape (a big circle, block, or band) is the most prominent thing in the frame — larger or louder than the actual product/screenshot/message — inverting the hierarchy (it should be product > message > decoration). A flat colored disc/block bigger than the product is the failure. In the "fix", tell the composer to shrink that shape to <25% of the canvas, push it behind the content as a low-opacity/blurred/gradient backdrop, and ensure no decoration out-weighs the product.
10. PRODUCT SCREENSHOT TOO SMALL: a REAL product/website/app screenshot (the actual UI) is rendered as a small card, tiny inset, or dimmed background instead of the hero. In a product video the screenshot must occupy ≥50% of the frame (60–80% on its peak) inside a browser/device frame, camera-explored. If it reads as a sticker on a slide, FAIL it. In the "fix", tell the composer to enlarge the screenshot to ≥50% of the canvas, add a device frame + a camera push-in/pan across the UI, and (optionally) 1–2 callout chips.
11. GROUNDHOG SET — COMPARE THE FRAMES TO EACH OTHER: if frames sampled FAR APART in the timeline (clearly different scenes — different headline/content) share essentially the SAME backdrop and layout (same background art, same decorative cluster in the same place, same composition) with only a swapped photo/caption, the film is one static slide with rotating content — the #1 "cheap template" tell. Each scene must re-dress the set: different ground gradient/dominant tone, relocated decoration, a different layout archetype. IMPORTANT EXCLUSIONS — do NOT flag: two samples that fall within the SAME scene (e.g. 13.6s and 14.6s of a 15s film are both the held final CTA — identical is CORRECT there), or a deliberately held end-card/outro. Only flag sameness across frames whose TEXT CONTENT differs (proving they are different scenes). In the "fix", name the near-identical frames (their atSec values) and tell the composer to give each of those scenes a distinct background variant and layout (e.g. "make scene at 10s a full-bleed type scene on the alternate ground token; move the decor cluster; change the focal position").
12. PALETTE-CLASHING PHOTO: a photo/video appears in its raw native colors, visually clashing with the design system (e.g. a washed-out white/daylight photo dropped onto a neon or parchment set), or is obviously OFF-TOPIC for the video's subject. Photos must be harmonized (design-system frame + color tint/scrim so their hues join the palette) and must serve the story. In the "fix", either specify the harmonizer (add a filter tint + ground-token gradient scrim over the image at Xs) or, if the image is off-topic, tell the composer to REMOVE it and carry the scene with vectors and display type.

MINOR issues (report, do NOT fail): cramped spacing, weak hierarchy, a transition caught mid-motion, a single thin scene in an otherwise rich video. (A caption that very slightly touches a content edge is minor; two CONTENT blocks overlapping is a BLOCKER per #7, not minor.)

A frame caught mid-transition with PARTIAL content is NORMAL — do not fail it for that alone. Be strict about the blockers above (especially under-illustration and contrast), lenient about pure style.`;

async function reviewRender({ videoPath, scenes, duration, framePack, frameMd, workDir, tracker, signal }) {
  fs.mkdirSync(workDir, { recursive: true });
  const times = sampleTimes(scenes, duration);
  const frames = [];
  for (const t of times) {
    const out = path.join(workDir, `qa_${String(t).replace(".", "_")}.jpg`);
    if (await extractFrame(videoPath, t, out)) frames.push({ t, path: out });
  }
  if (frames.length < 2) {
    return { pass: true, score: null, issues: [], note: "qa skipped: could not extract frames" };
  }

  const content = [
    {
      type: "text",
      text: [
        VERDICT_INSTRUCTIONS,
        "",
        framePack ? `The video must follow the "${framePack}" design system. Its rules (summary): the frames should visibly use this system's palette and components.` : "",
        `Frames below are sampled at: ${frames.map((f) => `${f.t}s`).join(", ")} of a ${duration}s video. Scene plan: ${JSON.stringify((scenes || []).map((s) => ({ id: s.id, start: s.start, duration: s.duration, purpose: s.purpose })))}`,
      ].filter(Boolean).join("\n"),
    },
    ...frames.map((f) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f.path).toString("base64")}` },
    })),
  ];

  const { text, tokensIn, tokensOut } = await openrouter.chat({
    system: "You are a meticulous video QA director. Strict JSON only.",
    user: content,
    jsonMode: true,
    stage: "qa",
    temperature: 0.2,
    signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "qa" });

  const verdict = extractFirstJsonObject(text);
  const issues = Array.isArray(verdict.issues) ? verdict.issues.slice(0, 8) : [];
  // Case-insensitive severity — a model that returns "BLOCKER"/"Blocker" must
  // still fail the video (the old === "blocker" silently passed those).
  const blockers = issues.filter((i) => String(i.severity || "").toLowerCase() === "blocker");
  // Also gate on the 0-10 score: a low score with no explicit blocker — or a
  // verdict that forgot the boolean and returned no issues — must not silently
  // pass a weak render. Require a real positive signal to ship.
  const lowScore = typeof verdict.score === "number" && verdict.score < 4;
  const pass = verdict.pass !== false && blockers.length === 0 && !lowScore;
  console.log(`[qa] verdict: ${pass ? "PASS" : "FAIL"} score=${verdict.score ?? "?"} blockers=${blockers.length} minors=${issues.length - blockers.length}${lowScore ? " (low-score gate)" : ""}`);
  return { pass, score: verdict.score ?? null, issues };
}

module.exports = { reviewRender };
