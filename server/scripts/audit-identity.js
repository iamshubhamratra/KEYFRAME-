#!/usr/bin/env node
// TEMPLATE IDENTITY AUDIT — measures whether the 40+ frame packs actually
// DIVERGE, both as declared (manifest fingerprints) and as rendered (structural
// similarity of the composition each pack builds for one canonical storyboard).
//
// The older check-pack-identity.js guards each pack INDIVIDUALLY (its ground
// and display face render, enrich passes it through). This tool guards packs
// AGAINST EACH OTHER — the "every template looks the same" regression class:
//
//   A. DECLARED IDENTITY MATRIX — per pack, every render-affecting knob the
//      manifest + scene_kit resolution actually produce.
//   B. LOOK-ALIKE CLUSTERS — packs whose full declared fingerprint is IDENTICAL
//      (they can differ only in hex values / copy). Each cluster is a bug.
//   C. STRUCTURAL SIMILARITY — Jaccard over normalized animation/DOM tokens of
//      the BUILT composition (same storyboard, same seed policy). Catches
//      sameness that sneaks past the manifest (shared furniture, shared
//      entrances, shared fx) and scores each pack's distinctiveness.
//
// Usage:  node scripts/audit-identity.js [--strict] [--json <out.json>]
//   --strict  exit 1 when any look-alike cluster exists or any pair's
//             structural similarity ≥ STRICT_SIM (default 0.93,
//             env IDENTITY_MAX_SIM). Report-only otherwise.

const fs = require("node:fs");
const path = require("node:path");
const sk = require("../src/services/scene_kit");
const man = require("../src/services/frame_manifest");
const reg = require("../src/services/frame_registry");
const { isBundled } = require("../src/fonts/pack_fonts");

const STRICT = process.argv.includes("--strict");
const JSON_OUT = (() => { const i = process.argv.indexOf("--json"); return i > -1 ? process.argv[i + 1] : null; })();
const STRICT_SIM = Number(process.env.IDENTITY_MAX_SIM || 0.93);

// Ornamented packs are hardcoded in scene_kit (if framePack === "..." chains +
// per-pack ornament modules). Parse the source so the list can't go stale.
function ornamentedPacks() {
  const src = fs.readFileSync(path.join(__dirname, "../src/services/scene_kit.js"), "utf8");
  const start = src.indexOf("function buildSkinOrnaments");
  const scope = start > -1 ? src.slice(start) : src;
  const out = new Set();
  for (const m of scope.matchAll(/framePack === "([a-z0-9-]+)"/g)) out.add(m[1]);
  return out;
}

// The same canonical storyboard for every pack: one text/hook, one stat, one
// bullet/feature, one cta — exercises kicker/underline/stat/prop furniture.
const dims = { width: 1280, height: 720, fps: 24 };
const storyboard = {
  title: "Identity audit",
  scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", headline: "Ship films that look like you", emphasis: "you", subtext: "One sentence in, a branded film out." },
    { id: "s2", start: 3, duration: 3, kind: "stat", headline: "faster to publish", emphasis: "8x", subtext: "8x" },
    { id: "s3", start: 6, duration: 3, kind: "bullet", headline: "Every scene art-directed", subtext: "Colors, motion and type stay sacred." },
    { id: "s4", start: 9, duration: 3, kind: "cta", headline: "Pick a template. Keep its soul.", emphasis: "soul" },
  ],
};

// ---- A. declared identity ----
function declared(name, orn) {
  const m = man.getManifest(name) || {};
  const theme = sk.deriveTheme(name, storyboard);
  const lm = m.layout || {};
  return {
    pack: name,
    renderer: m.renderer || null,
    groundAuthored: !!(m.surface && m.surface.ground),
    groundClass: theme && theme.ink === "#FFFFFF" ? "dark" : "light",
    cut: (m.motion && m.motion.cut) || "glow",
    drift: (m.motion && m.motion.drift) || 1.05,
    canvas: (m.fx && m.fx.canvas) || "bokeh",
    three: (m.fx && m.fx.three) || null,
    skin: !!(m.skin && (m.skin.accents || []).length),
    emphasisCss: !!(m.skin && m.skin.emphasisCss),
    enter: (m.textfx && m.textfx.enter) || "blur-up",
    emphasis: (m.textfx && m.textfx.emphasis) || "gradient",
    tcase: (m.textfx && m.textfx.case) || "none",
    align: (m.textfx && m.textfx.align) || "rotate",
    layout: [lm.kicker !== false ? "k" : "-", lm.underline !== false ? "u" : "-", lm.propFill !== false ? "p" : "-", lm.stat === "headline" ? "S" : "s", lm.assetStyle === "paper" ? "P" : "d"].join(""),
    audio: !!(m.audio && m.audio.music && m.audio.music.query),
    display: (m.typography && m.typography.display) || null,
    displayBundled: !!(m.typography && m.typography.display && isBundled(m.typography.display)),
    ornaments: orn.has(name),
  };
}

// The fingerprint = every declared knob that changes DOM/animation structure
// (NOT raw hex values — two packs that differ only in hex ARE the bug).
function fingerprint(d) {
  if (d.renderer) return `dedicated:${d.renderer}`; // dedicated composers are distinct by construction
  return [d.groundClass, d.cut, d.canvas, d.three || "-", d.enter, d.emphasis, d.tcase, d.align, d.layout, d.display || "none", d.ornaments ? "orn" : "-"].join("|");
}

// ---- C. structural similarity of the BUILT comp ----
// Normalize away pack-specific hexes/ids/copy; keep structure: per-tween shape
// (which css properties animate together, with which ease), the canvas-fx
// painter body, svg/dom furniture, fonts, cut/fx markers.
function structuralTokens(html) {
  const t = new Set();
  // strip color values so two packs differing only in hex tokenize identically
  const norm = html.replace(/#[0-9a-fA-F]{3,8}\b/g, "#").replace(/rgba?\([^)]*\)/g, "rgb()");
  // per-GSAP-call shape: sorted property set + ease (the true motion signature)
  for (const m of norm.matchAll(/tl\.(to|fromTo|set)\(([^;]{0,400}?)\},\s*[\d."]/g)) {
    const props = [...m[2].matchAll(/\b([a-zA-Z]+)\s*:/g)].map((x) => x[1])
      .filter((p) => !/^(duration|stagger|delay|repeat|yoyo|onComplete|immediateRender)$/.test(p));
    const ease = (/ease:"([a-zA-Z0-9.()]+)"/.exec(m[2]) || [])[1] || "none";
    t.add(`tween:${m[1]}:${[...new Set(props)].sort().join(",")}:${ease}`);
  }
  // canvas-fx painter body (mode-distinct once colors are normalized)
  const fx = /<canvas id="kffx"[\s\S]*?<\/script>/.exec(norm);
  if (fx) {
    let h = 0; const s = fx[0].replace(/\s+/g, "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    t.add("fxbody:" + h.toString(36));
  }
  for (const m of norm.matchAll(/<(svg|circle|rect|path|polyline|polygon|line|text|ellipse|canvas)\b/g)) t.add("svg:" + m[1]);
  for (const m of norm.matchAll(/class="([a-z]+)\d*[a-z]*"/g)) t.add("cls:" + m[1].replace(/\d+/g, ""));
  for (const m of norm.matchAll(/font-family:\s*'([^']+)'/g)) t.add("font:" + m[1]);
  for (const m of norm.matchAll(/text-transform:\s*(\w+)/g)) t.add("case:" + m[1]);
  if (norm.includes("@font-face")) t.add("fontface");
  for (const m of norm.matchAll(/(kfcut|kffx|kfw|kfc|kchip|krule|kstat|kprop)/g)) t.add("mark:" + m[1]);
  // size-class: identity mass differs by >2x → visibly different investment
  t.add("mass:" + Math.round(Math.log2(html.length / 8000)));
  return t;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 1;
}

// ---- run ----
const orn = ornamentedPacks();
const packs = reg.listPacks();
const rows = [];
const structs = new Map();
for (const name of packs) {
  const d = declared(name, orn);
  rows.push(d);
  if (!d.renderer) {
    // Same seedKey policy for all packs — differences left are PACK identity.
    const built = sk.buildComposition({ storyboard, dims, framePack: name, assets: [], seedKey: "identity-audit" });
    structs.set(name, structuralTokens(built.indexHtml));
  }
}

// A. matrix
console.log("\n== A. DECLARED IDENTITY MATRIX ==");
const pad = (s, n) => String(s == null ? "-" : s).padEnd(n);
console.log(pad("pack", 20) + pad("rendr", 6) + pad("grnd", 5) + pad("cut", 7) + pad("canvas", 14) + pad("three", 15) + pad("enter", 12) + pad("emph", 11) + pad("align", 7) + pad("layout", 7) + pad("display", 16) + "orn audio skin");
for (const d of rows.sort((a, b) => a.pack.localeCompare(b.pack))) {
  console.log(
    pad(d.pack, 20) + pad(d.renderer ? "DED" : "-", 6) + pad(d.groundAuthored ? d.groundClass[0].toUpperCase() : d.groundClass[0], 5) +
    pad(d.cut, 7) + pad(d.canvas, 14) + pad(d.three || "-", 15) + pad(d.enter, 12) + pad(d.emphasis, 11) + pad(d.align, 7) +
    pad(d.layout, 7) + pad(d.display ? d.display.slice(0, 14) + (d.displayBundled ? "" : "!") : "-", 16) +
    (d.ornaments ? " ✓  " : " ·  ") + (d.audio ? "  ✓  " : "  ·  ") + (d.skin ? "  ✓" : "  ·"));
}

// coverage summary
const kit = rows.filter((r) => !r.renderer);
const pct = (n) => `${n}/${kit.length} (${Math.round((n / kit.length) * 100)}%)`;
console.log("\n== COVERAGE (scene-kit packs only) ==");
console.log(`authored ground      ${pct(kit.filter((r) => r.groundAuthored).length)}`);
console.log(`non-default enter    ${pct(kit.filter((r) => r.enter !== "blur-up").length)}`);
console.log(`non-default emphasis ${pct(kit.filter((r) => r.emphasis !== "gradient").length)}`);
console.log(`layout customized    ${pct(kit.filter((r) => r.layout !== "kups d".replace(" ", "")).length)}`);
console.log(`ornament cluster     ${pct(kit.filter((r) => r.ornaments).length)}`);
console.log(`audio identity       ${pct(kit.filter((r) => r.audio).length)}`);
console.log(`pinned skin accents  ${pct(kit.filter((r) => r.skin).length)}`);
console.log(`display face set     ${pct(kit.filter((r) => r.display).length)} (unbundled: ${kit.filter((r) => r.display && !r.displayBundled).map((r) => r.pack).join(", ") || "none"})`);

// B0. CONTRACT VALIDATION — a manifest value scene_kit doesn't implement is an
// identity DROP (declared but silently rendered as the default). Always fatal:
// these shipped six packs whose authored cuts never existed.
const violations = [];
for (const d of rows) {
  if (d.renderer) continue;
  if (!sk.CUT_STYLES.has(d.cut)) violations.push(`${d.pack}: motion.cut "${d.cut}" not implemented`);
  if (!sk.TEXT_ENTERS.has(d.enter)) violations.push(`${d.pack}: textfx.enter "${d.enter}" not implemented`);
  if (!sk.EMPHASIS_STYLES.has(d.emphasis)) violations.push(`${d.pack}: textfx.emphasis "${d.emphasis}" not implemented`);
  if (!sk.CANVAS_MODES.has(d.canvas)) violations.push(`${d.pack}: fx.canvas "${d.canvas}" not implemented`);
}
console.log("\n== B0. CONTRACT VIOLATIONS (declared identity scene_kit silently drops) ==");
if (!violations.length) console.log("  none — every declared value is implemented");
for (const v of violations) console.log(`  ✗ ${v}`);

// B. look-alike clusters
const groups = new Map();
for (const d of rows) {
  const f = fingerprint(d);
  if (!groups.has(f)) groups.set(f, []);
  groups.get(f).push(d.pack);
}
const clusters = [...groups.entries()].filter(([, v]) => v.length > 1);
console.log("\n== B. LOOK-ALIKE CLUSTERS (identical declared fingerprint — differ only in hex/copy) ==");
if (!clusters.length) console.log("  none — every pack declares a distinct fingerprint");
for (const [f, v] of clusters) console.log(`  ✗ [${v.join(", ")}]\n      ${f}`);

// C. structural similarity
const names = [...structs.keys()];
const pairs = [];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  pairs.push({ a: names[i], b: names[j], sim: jaccard(structs.get(names[i]), structs.get(names[j])) });
}
pairs.sort((x, y) => y.sim - x.sim);
const avg = pairs.reduce((s, p) => s + p.sim, 0) / (pairs.length || 1);
console.log(`\n== C. STRUCTURAL SIMILARITY (built comps, ${names.length} packs, avg ${(avg * 100).toFixed(1)}%) ==`);
console.log("  most-similar pairs:");
for (const p of pairs.slice(0, 15)) console.log(`   ${(p.sim * 100).toFixed(1)}%  ${p.a}  ~  ${p.b}`);
const distinct = new Map(names.map((n) => [n, 1]));
for (const p of pairs) {
  distinct.set(p.a, Math.min(distinct.get(p.a), 1 - p.sim));
  distinct.set(p.b, Math.min(distinct.get(p.b), 1 - p.sim));
}
const least = [...distinct.entries()].sort((a, b) => a[1] - b[1]);
console.log("  least distinctive packs (1 - max similarity):");
for (const [n, s] of least.slice(0, 8)) console.log(`   ${(s * 100).toFixed(1)}%  ${n}`);

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ rows, clusters: clusters.map(([f, v]) => ({ fingerprint: f, packs: v })), pairs, avgSim: avg }, null, 2));
  console.log(`\n[audit-identity] json written to ${JSON_OUT}`);
}

const tooSimilar = pairs.filter((p) => p.sim >= STRICT_SIM);
console.log(`\n${violations.length || clusters.length ? "✗" : "✓"} ${violations.length} contract violation(s); ${clusters.length} look-alike cluster(s); ${tooSimilar.length} pair(s) ≥ ${STRICT_SIM} structural similarity${STRICT ? " (strict)" : ""}`);
// Contract violations and declared-duplicate clusters are outright bugs — fatal
// even without --strict. The similarity threshold only gates in strict mode.
process.exit(violations.length || clusters.length || (STRICT && tooSimilar.length) ? 1 : 0);
