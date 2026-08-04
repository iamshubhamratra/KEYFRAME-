// DEV HARNESS — build a Showcase composition into a job dir. Usage:
//   node scripts/showcase-harness.js <outDir> [W] [H] [#hex,#hex,...] [shots|shots:N|none]
//     #hex list → an Art Director BRAND SKIN. Showcase wears ONE accent, and DERIVES its four
//       companion blob hues and its highlight mark from it — so a skinned build must repaint
//       the whole backdrop, not just the pill and the arrows.
//     shots:N → stage N pictures at REAL, DIFFERENT aspect ratios. The count is the point:
//       the montage re-lays its grid to 6/5/4/3/2 and beats that come up empty must fall back
//       to a type layout rather than draw a hollow browser window.
// Then: cd <outDir> && npx --yes hyperframes@<pinned> render --output renders/out.mp4 --quality draft
//
// The storyboard exercises the FULL SEVEN-SCENE SPINE: an intro, a bulleted tour, a
// three-point detail beat, a mobile beat, a montage, a numeric proof beat and a CTA. If a
// beat cannot carry its authored layout the spine skips it, so a harness that omits bullets
// or numbers silently tests a DIFFERENT film than the reference.

const fs = require("node:fs");
const path = require("node:path");
const showcase = require("../src/services/showcase_composer");
const { sitePage, mobileApp, photo, logo } = require("./lib/placeholder_assets");

const outDir = path.resolve(process.argv[2] || "jobs/_showcasetest");
const W = Number(process.argv[3]) || 1920;
const H = Number(process.argv[4]) || 1080;
const brandHexes = String(process.argv[5] || "").split(",").map((s) => s.trim()).filter(Boolean);
const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;
const shotArg = String(process.argv[6] || "");
const shotCount = /^shots:(\d+)$/.test(shotArg) ? Number(shotArg.split(":")[1]) : (shotArg === "shots" ? 8 : 0);

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

// Pictures at the shapes the layout's boxes actually want: wide desktop captures for the
// browser windows, a tall phone capture for the phone screen, and mid-ratio photos for the
// montage tiles. Staging them all at one ratio hides every crop bug this pack can have.
function stage(n) {
  const dir = path.join(outDir, "assets", "images");
  fs.mkdirSync(dir, { recursive: true });
  const put = (name, buf) => { fs.writeFileSync(path.join(dir, name), buf); return `assets/images/${name}`; };
  const SPEC = [
    { n: "hero_desktop.png", w: 1600, h: 900, kind: "site", score: 97, sid: "s1", alt: "product dashboard" },
    { n: "tour_desktop.png", w: 1600, h: 920, kind: "site", score: 95, sid: "s2", alt: "reporting view" },
    { n: "detail_desktop.png", w: 1680, h: 880, kind: "site", score: 93, sid: "s3", alt: "settings panel" },
    { n: "app_phone.png", w: 430, h: 930, kind: "phone", score: 91, sid: "s4", alt: "mobile app" },
    { n: "grid_a.png", w: 1400, h: 720, kind: "site", score: 88, alt: "integrations" },
    { n: "grid_b.png", w: 900, h: 650, kind: "photo", score: 86, alt: "team workspace" },
    { n: "grid_c.png", w: 1500, h: 560, kind: "site", score: 84, alt: "timeline view" },
    { n: "grid_d.png", w: 1000, h: 720, kind: "photo", score: 82, alt: "product detail" },
  ].slice(0, n);
  const made = SPEC.map((s, i) => {
    const buf = s.kind === "phone" ? mobileApp(s.w, s.h) : s.kind === "site" ? sitePage(s.w, s.h) : photo(s.w, s.h, i + 3);
    return {
      path: put(s.n, buf), type: "image", source: i < 4 ? "website" : "upload", visionOk: true,
      cdScore: s.score, sceneId: s.sid, width: s.w, height: s.h, ratio: s.w / s.h, alt: s.alt,
    };
  });
  made.push({
    path: put("logo.png", logo(512, "#131722")), type: "image", source: "upload", role: "logo",
    assetType: "logo", width: 512, height: 512, ratio: 1, alt: "Northwind logo",
  });
  return made;
}

const storyboard = {
  title: "Northwind Analytics — the reporting layer for product teams",
  durationSec: 32.4,
  scenes: [
    { id: "s1", start: 0, duration: 5.2, purpose: "hook", kind: "hook",
      headline: "See how it works", emphasis: "works", kicker: "A 30-second tour",
      subtext: "Everything that matters, the moment you land.",
      voiceover: "Here is how Northwind works, in thirty seconds." },
    { id: "s2", start: 5.2, duration: 4.8, purpose: "feature", kind: "text",
      headline: "One view, zero noise", kicker: "01 — The dashboard",
      subtext: "Everything that matters, surfaced the moment you land.",
      onScreenText: ["Live metrics", "Any source", "No setup"],
      voiceover: "One view, and zero noise." },
    { id: "s3", start: 10, duration: 5.4, purpose: "how", kind: "text",
      headline: "Three things to notice", kicker: "How it works",
      onScreenText: ["One-click actions", "Real-time sync", "Your whole team"],
      subtext: "https://northwind.io",
      voiceover: "There are three things worth noticing here." },
    { id: "s4", start: 15.4, duration: 4.6, purpose: "feature", kind: "text",
      headline: "Take it with you", kicker: "02 — Pocket-sized",
      onScreenText: ["Instant alerts", "Offline ready"],
      voiceover: "And you can take the whole thing with you." },
    { id: "s5", start: 20, duration: 4.4, purpose: "showcase", kind: "text",
      headline: "Every screen, one glance",
      voiceover: "Every screen your team needs, in one glance." },
    { id: "s6", start: 24.4, duration: 4.2, purpose: "proof", kind: "stat",
      headline: "Loved at scale",
      onScreenText: ["12K+ teams", "4.9 rating", "99.9% uptime"],
      subtext: "12K+ teams · 4.9 rating · 99.9% uptime",
      voiceover: "Twelve thousand teams, and ninety-nine point nine percent uptime." },
    { id: "s7", start: 28.6, duration: 3.8, purpose: "cta", kind: "cta",
      headline: "Start the free trial", emphasis: "Get started",
      subtext: "Your first dashboard in three minutes. northwind.io",
      voiceover: "Start the free trial — your first dashboard is three minutes away." },
  ],
};
const captionCues = storyboard.scenes.map((s) => ({
  start: s.start + 0.35, end: s.start + s.duration - 0.35, text: s.voiceover || s.headline,
}));

const assets = shotCount ? stage(shotCount) : [];
const built = showcase.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: "showcase",
  captionCues, assets, brandSkin, seedKey: "harness01",
});
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");

const shots = assets.filter((a) => showcase.__test.screenOk(a));
const roles = showcase.__test.assignRoles(storyboard.scenes, shots.length);
console.log(`[showcase-harness] wrote ${outDir} (${W}x${H}, ${storyboard.scenes.length} scenes, ${shots.length} shot(s)${assets.length > shots.length ? " + logo" : ""}, brand=${brandSkin ? brandSkin.accents.join("/") : "none"})`);
console.log(`[showcase-harness] spine: ${roles.join(" -> ")}`);
console.log(`[showcase-harness] resolvedBrand: ${built.resolvedBrand ? built.resolvedBrand.accents.join(" ") : "null (unbranded — pack palette)"}`);
console.log(`[showcase-harness] html ${built.indexHtml.length} bytes · ${(built.indexHtml.match(/<img /g) || []).length} <img> · ${(built.indexHtml.match(/class="clip/g) || []).length} clips`);
const missing = assets.filter((a) => a && a.path && a.role !== "logo" && !built.indexHtml.includes(a.path));
if (missing.length) console.log(`[showcase-harness] !! ${missing.length} shot(s) placed but never drawn: ${missing.map((a) => path.basename(a.path)).join(", ")}`);
