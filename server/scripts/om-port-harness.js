// DEV HARNESS for every om_port_kit-based pack. Usage:
//   node scripts/om-port-harness.js <pack> <outDir> [#hex,...] [shots:N]
//   cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
//
// Stage size comes from the PACK's own manifest orientation, so a landscape pack is exercised
// landscape and a portrait one portrait — the thing a single hardcoded size would hide.
//
// `shots:N` stages N pictures at REAL, DIFFERENT aspect ratios. The COUNT is the point: it is
// what exercises the empty-container law (no device frame around nothing) and the statement
// fallback (no empty frame either). Staging everything at one ratio hides every crop bug.

const fs = require("node:fs");
const path = require("node:path");
const { sitePage, mobileApp, photo, logo } = require("./lib/placeholder_assets");

const pack = process.argv[2];
const outDir = path.resolve(process.argv[3] || `jobs/_${pack}test`);
const brandHexes = String(process.argv[4] || "").split(",").map((s) => s.trim()).filter(Boolean);
const shotArg = String(process.argv[5] || "");
const shotCount = /^shots:(\d+)$/.test(shotArg) ? Number(shotArg.split(":")[1]) : (shotArg === "shots" ? 8 : 0);

if (!pack) { console.error("usage: om-port-harness.js <pack> <outDir> [#hex,...] [shots:N]"); process.exit(1); }

const frameManifest = require("../src/services/frame_manifest");
const manifest = frameManifest.getManifest(pack);
const portrait = manifest.orientation === "portrait";
const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;

// Resolve through composerModuleFor — the AUTHORITATIVE renderer->module map — never by
// guessing a filename from the renderer id. Tooling that guessed is exactly what silently
// SKIPPED packs from the portrait regression guard.
const { composerModuleFor } = require("../src/services/pipeline");
const renderer = manifest.renderer;
const mod = composerModuleFor(renderer);
if (!mod) { console.error(`no composer registered for pack "${pack}" (renderer ${renderer})`); process.exit(1); }

const brandSkin = brandHexes.length
  ? { accents: brandHexes.slice(0, 3), emphasis: [brandHexes[0], brandHexes[1] || brandHexes[0]], source: "harness", provenance: "explicit" }
  : null;

fs.mkdirSync(path.join(outDir, "renders"), { recursive: true });

function stage(n) {
  const dir = path.join(outDir, "assets", "images");
  fs.mkdirSync(dir, { recursive: true });
  const put = (name, buf) => { fs.writeFileSync(path.join(dir, name), buf); return `assets/images/${name}`; };
  const SPEC = [
    { n: "a_wide.png", w: 1600, h: 900, k: "site", s: 97, sid: "s1", alt: "product dashboard" },
    { n: "b_wide.png", w: 1600, h: 920, k: "site", s: 95, sid: "s2", alt: "reporting view" },
    { n: "c_wide.png", w: 1680, h: 880, k: "site", s: 93, sid: "s3", alt: "settings panel" },
    { n: "d_tall.png", w: 430, h: 930, k: "phone", s: 91, sid: "s4", alt: "mobile app" },
    { n: "e_mid.png", w: 1400, h: 720, k: "site", s: 88, alt: "integrations" },
    { n: "f_sq.png", w: 900, h: 650, k: "photo", s: 86, alt: "team workspace" },
    { n: "g_pano.png", w: 1500, h: 560, k: "site", s: 84, alt: "timeline view" },
    { n: "h_photo.png", w: 1000, h: 720, k: "photo", s: 82, alt: "product detail" },
  ].slice(0, n);
  const made = SPEC.map((sp, i) => ({
    path: put(sp.n, sp.k === "phone" ? mobileApp(sp.w, sp.h) : sp.k === "site" ? sitePage(sp.w, sp.h) : photo(sp.w, sp.h, i + 3)),
    type: "image", source: i < 4 ? "website" : "upload", visionOk: true,
    cdScore: sp.s, sceneId: sp.sid, width: sp.w, height: sp.h, ratio: sp.w / sp.h, alt: sp.alt,
  }));
  made.push({
    path: put("logo.png", logo(512, "#131722")), type: "image", source: "upload", role: "logo",
    assetType: "logo", width: 512, height: 512, ratio: 1, alt: "brand logo",
  });
  return made;
}

// Shaped to exercise a FULL spine: a hook, a bulleted beat, a beat carrying a URL, a
// multi-point beat, a numeric beat, a quote, and a CTA. A harness that omits bullets or
// numbers silently tests a DIFFERENT film than the reference.
const storyboard = {
  title: "Northwind Analytics — the reporting layer for product teams",
  durationSec: 32.4,
  scenes: [
    { id: "s1", start: 0, duration: 5.2, purpose: "hook", kind: "hook",
      headline: "See how it works", emphasis: "works", kicker: "A 30-second tour",
      subtext: "Everything that matters, the moment you land.",
      onScreenText: ["Live metrics", "Any source", "No setup"],
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
      onScreenText: ["Dashboards", "Reports", "Alerts"],
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
const built = mod.buildComposition({
  storyboard, dims: { width: W, height: H, fps: 30 }, framePack: pack,
  captionCues, assets, brandSkin, seedKey: "harness01",
});
fs.writeFileSync(path.join(outDir, "index.html"), built.indexHtml, "utf8");
fs.writeFileSync(path.join(outDir, "meta.json"), built.metaJson, "utf8");

const html = built.indexHtml;
const shots = assets.filter((a) => a.role !== "logo");
const drawn = shots.filter((a) => html.includes(a.path)).length;
console.log(`[${pack}] ${W}x${H} · ${storyboard.scenes.length} scenes · ${shots.length} shot(s) offered, ${drawn} drawn · brand=${brandSkin ? brandSkin.accents.join("/") : "none"}`);
console.log(`[${pack}] resolvedBrand: ${built.resolvedBrand ? built.resolvedBrand.accents.join(" ") : "null (unbranded — pack palette)"}`);
console.log(`[${pack}] ${html.length} bytes · ${(html.match(/<img /g) || []).length} <img> · ${(html.match(/class="clip/g) || []).length} clips`);
// UNUSED IS NOT DROPPED. A pack with two picture slots offered six assets draws two — that is
// the design, not a defect. The defect this guard exists for is a shot the composer ASSIGNED
// to a beat and then failed to render, which shows up as drawn < the pack's own capacity.
const spec = mod.__test && mod.__test.SPEC;
let capacity = null;
if (spec && typeof spec.slots === "function") {
  const roles = [spec.first, spec.last, ...(spec.middle || [])];
  capacity = roles.reduce((a, role) => a + (spec.slots(role, shots.length) || 0), 0);
}
const expect = capacity == null ? drawn : Math.min(shots.length, capacity);
if (drawn < expect) {
  const missing = shots.filter((a) => !html.includes(a.path));
  console.log(`[${pack}] !! DROPPED — drew ${drawn} of an expected ${expect}: ${missing.map((a) => path.basename(a.path)).join(", ")}`);
} else if (drawn < shots.length) {
  console.log(`[${pack}] ${shots.length - drawn} asset(s) unused — this pack draws fewer pictures than were offered`);
}
