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
  const times = [0.6];
  for (const s of scenes || []) {
    times.push(Math.min(duration - 0.2, s.start + Math.min(s.duration * 0.6, s.duration - 0.3)));
  }
  return [...new Set(times.map((t) => Math.round(t * 10) / 10))].slice(0, 8);
}

const VERDICT_INSTRUCTIONS = `You are the quality-assurance director reviewing rendered video frames before delivery. Judge ONLY what is visible. Return STRICT JSON:
{
  "pass": true|false,
  "score": <0-10>,
  "issues": [{ "atSec": <number>, "severity": "blocker|minor", "issue": "<what is wrong>", "fix": "<concrete instruction for the composer>" }]
}
BLOCKER issues (any one fails the video): a frame that is empty or near-empty (only background visible, no content); text cut off mid-word or overflowing its container; text unreadable against its background; an image stretched/distorted or covering text; content obviously offscreen (partial edges of a card at the frame border with nothing else).
MINOR issues (report, do not fail): cramped spacing, weak hierarchy, a transition caught mid-motion, slight caption overlap.
A frame caught mid-transition with PARTIAL content is NORMAL — only flag emptiness if a frame shows background only. Be strict about blockers, lenient about style.`;

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
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut });

  const verdict = extractFirstJsonObject(text);
  const issues = Array.isArray(verdict.issues) ? verdict.issues.slice(0, 8) : [];
  const blockers = issues.filter((i) => i.severity === "blocker");
  const pass = verdict.pass !== false && blockers.length === 0;
  console.log(`[qa] verdict: ${pass ? "PASS" : "FAIL"} score=${verdict.score ?? "?"} blockers=${blockers.length} minors=${issues.length - blockers.length}`);
  return { pass, score: verdict.score ?? null, issues };
}

module.exports = { reviewRender };
