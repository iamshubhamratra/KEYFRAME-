// Screenshot Director harness — dry-runs the topic->page matching against a
// real site WITHOUT rendering a film. By default it stops before PeekShot
// (discover + LLM match + preflight only); pass --capture to also spend the
// 1-3 PeekShot captures and write PNGs next to this script.
//
//   node scripts/shots-harness.js https://stripe.com [--capture]
//
// The fake script below stands in for an approved script: a pricing scene, a
// features scene, a social-proof scene. Expect the director to map them to
// /pricing, a product/features page, and /customers (or pick fewer).

const path = require("node:path");
const { resolveSite, matchScenesToPages, preflight, captureTopicShots } = require("../src/services/screenshot_director");

const url = process.argv[2];
const doCapture = process.argv.includes("--capture");
if (!url) { console.error("usage: node scripts/shots-harness.js <site-url> [--capture]"); process.exit(1); }

const script = {
  scenes: [
    { id: "s1", start: 0, duration: 4, purpose: "hook", onScreenText: ["Meet the product"], voiceover: "Every team hits the same wall." },
    { id: "s2", start: 4, duration: 5, purpose: "feature", onScreenText: ["Everything in one place"], voiceover: "See the features that do the heavy lifting for you." },
    { id: "s3", start: 9, duration: 5, purpose: "proof", onScreenText: ["Loved by teams"], voiceover: "Thousands of companies already run on it." },
    { id: "s4", start: 14, duration: 5, purpose: "how", onScreenText: ["Simple pricing"], voiceover: "Plans start free and scale with you — no surprises on the bill." },
    { id: "s5", start: 19, duration: 4, purpose: "cta", onScreenText: ["Start today"], voiceover: "Try it now." },
  ],
};

(async () => {
  const job = { intent: { websiteUrl: url }, website_title: new URL(url).hostname, website_pages: [] };

  console.log(`\n— DISCOVER ${url} (auth-wall rescue included)`);
  const { siteUrl: activeSite, pages, rescued } = await resolveSite({ job, siteUrl: url, topic: job.website_title, tracker: null });
  if (rescued) console.log(`  RESCUED -> shooting ${activeSite} instead`);
  for (const p of pages) console.log(`  ${p.guessed ? "(guess) " : ""}${p.url}  ${p.text ? `— "${p.text}"` : ""}`);
  if (!pages.length) { console.log("  no pages — director would skip"); return; }

  console.log(`\n— MATCH (LLM)`);
  const picks = await matchScenesToPages({ script, pages, topic: job.website_title, tracker: null });
  if (!picks.length) { console.log("  0 picks — director would skip"); return; }
  for (const p of picks) console.log(`  scene ${p.sceneId} <- ${p.url}  (${p.label})`);

  console.log(`\n— PREFLIGHT`);
  for (const p of picks) {
    const f = await preflight(p.url, p);
    console.log(`  ${f.ok ? "OK  " : "SKIP"} ${p.url}${f.why ? ` — ${f.why}` : ""}${f.soft ? " (fetch blocked; PeekShot may still succeed)" : ""}`);
  }

  if (doCapture) {
    console.log(`\n— CAPTURE (PeekShot, for real)`);
    const jobDir = path.join(__dirname, "shots-harness-out");
    const shots = await captureTopicShots({ job, script, jobDir, topic: job.website_title, tracker: null });
    for (const s of shots) console.log(`  ${s.path}  -> scene ${s.sceneId}`);
    if (!shots.length) console.log("  no shots captured");
  } else {
    console.log(`\n(dry run — add --capture to spend PeekShot captures)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
