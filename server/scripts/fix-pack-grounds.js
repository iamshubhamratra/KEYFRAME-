// REPAIR: pack manifests whose declared ground is not the ground their template
// actually paints.
//
// 48 of 160 omelette packs were authored as LIGHT films — cream ground, near
// black ink — while the template they skin paints a DARK page. Nothing warns
// about the disagreement, and every colour decision downstream is made against
// the declared value:
//
//   omelette_adapter  uses surface.ground as the CONTRAST GUARD when it repaints
//                     brand accents, and protects surface.ground/ink from being
//                     recoloured. Against a ground that does not exist, a dark
//                     accent passes the guard and lands on a dark page, and the
//                     template's REAL ground hex is left unprotected.
//   scene_kit         takes surface.ground as authoritative and derives ink from
//                     its luminance, so a light lie yields near-black text.
//   contrast_fix      builds its candidate palette from the same tokens.
//
// The measured result on a shipped safelight film: five text elements at a
// contrast ratio of 1.00 — text the exact colour of the page behind it — and a
// contrast pass that reported "0 fixed, 5 left" because its locator works on
// static HTML while the omelette engine builds the DOM at runtime.
//
// The packs are cleanly INVERTED, not randomly wrong: in 48/48 the declared
// ground clears 4.5:1 as INK on the template's real ground. So the repair is to
// believe the template — ground := what the page paints, ink := the colour the
// pack already declared for its type.
//
//   node scripts/fix-pack-grounds.js           # report only
//   node scripts/fix-pack-grounds.js --write   # apply
//
// Idempotent: a pack that already agrees with its template is left untouched.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TPLDIR = path.join(ROOT, "public", "omelette-templates");
const FRAMES = path.join(ROOT, "..", "frames");
const WRITE = process.argv.includes("--write");

function hex(h) {
  h = String(h || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
}
function lum(c) {
  const a = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(a, b) {
  const A = lum(a), B = lum(b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
}

// The ground the template actually paints: the most-declared background colour
// in its own stylesheet. These pages set one page background and then draw on
// top of it, so the mode is the page ground.
function templateGround(tpl) {
  let html;
  try { html = fs.readFileSync(path.join(TPLDIR, tpl + ".html"), "utf8"); } catch { return null; }
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  let page; try { page = JSON.parse(m[1]); } catch { return null; }
  const vals = [...String(page).matchAll(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/g)]
    .map((x) => x[1].toLowerCase())
    .filter((v) => hex(v));
  if (!vals.length) return null;
  const c = {};
  for (const v of vals) c[v] = (c[v] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

const fixed = [], skipped = [], unfixable = [];

for (const pk of fs.readdirSync(FRAMES)) {
  const file = path.join(FRAMES, pk, "pack.json");
  if (!fs.existsSync(file)) continue;
  let man;
  try { man = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
  if (man.renderer !== "omelette" || !man.template) continue;

  const declaredGround = man.surface && man.surface.ground;
  const declaredInk = man.surface && man.surface.ink;
  const real = templateGround(man.template);
  if (!declaredGround || !declaredInk || !real) continue;

  const R = hex(real), K = hex(declaredInk), G = hex(declaredGround);
  if (!R || !K || !G) continue;

  // Already agrees with the template — the ink reads on the real page.
  if (ratio(K, R) >= 3) { skipped.push(pk); continue; }

  // Believe the template. The pack's own declared ground is the candidate ink
  // (it is the colour this pack chose for its type); only accept it if it
  // actually clears AA on the real page, else fall back to max contrast.
  const candidates = [declaredGround, "#f6f4ee", "#15140f"];
  const ink = candidates.find((c) => hex(c) && ratio(hex(c), R) >= 4.5);
  if (!ink) { unfixable.push(pk); continue; }

  const before = { ground: declaredGround, ink: declaredInk };
  man.surface.ground = real;
  man.surface.ink = ink;
  // camera3d mirrors the page ground for the 3D stages; keep them in step.
  if (man.camera3d && man.camera3d.ground) man.camera3d.ground = real;

  fixed.push({ pk, tpl: man.template, before, after: { ground: real, ink }, was: ratio(K, R), now: ratio(hex(ink), R) });
  if (WRITE) fs.writeFileSync(file, JSON.stringify(man, null, 2) + "\n", "utf8");
}

console.log((WRITE ? "APPLIED" : "DRY RUN") + " — omelette packs whose ground disagreed with their template\n");
for (const f of fixed) {
  console.log("  " + f.pk.padEnd(22) + " [" + f.tpl.padEnd(16) + "]  ground "
    + f.before.ground + " -> " + f.after.ground + "   ink " + f.before.ink + " -> " + f.after.ink
    + "   (" + f.was.toFixed(2) + ":1 -> " + f.now.toFixed(2) + ":1)");
}
console.log("\nrepaired: " + fixed.length + "   already correct: " + skipped.length
  + (unfixable.length ? "   NO READABLE INK FOUND: " + unfixable.length + " (" + unfixable.join(", ") + ")" : ""));
if (!WRITE && fixed.length) console.log("\nre-run with --write to apply.");
