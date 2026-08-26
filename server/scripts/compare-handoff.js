// Compare an incoming long-form handoff against what is INSTALLED.
//
// A handoff arrives as a numbered zip and the films inside it get revised between
// drops. Reinstalling blind would either miss a revision or needlessly rewrite 28
// bundles, so this answers the only two questions that matter before importing:
// is every film present, and for each one does the installed bundle still match
// the handoff — same authored beats, same authored length, same resources?
//
//   node scripts/compare-handoff.js --src <handoff dir>
//
// Compares DECODED resources, not file bytes: the installed bundle has the
// playback bar stripped and re-gzipped, so its bytes legitimately differ from the
// handoff's while the film is identical. The one resource that carries the bar is
// compared with that edit normalised out.

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SRC = argOf("src", null);
if (!SRC) { console.error("usage: node scripts/compare-handoff.js --src <handoff dir>"); process.exit(1); }

const ROOT = path.resolve(__dirname, "..", "..");
const FRAMES_DIR = path.join(ROOT, "frames");
const TPL_DIR = path.join(ROOT, "server", "public", "omelette-templates");

const manifestOf = (html) => {
  const m = /<script type="__bundler\/manifest">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};
const decode = (r) => {
  if (!r || !r.data) return null;
  const b = Buffer.from(r.data, "base64");
  try { return r.compressed ? zlib.gunzipSync(b).toString("utf8") : b.toString("base64"); }
  catch { return b.toString("base64"); }
};
// The bar edit is ours, not a revision — normalise it out before comparing.
//
// So are the resource UUIDs. The bundler MINTS A FRESH UUID for every resource on
// every build, and the page's `__bundler/template` resource embeds them by name.
// Keying the comparison on those UUIDs therefore reported EVERY resource of EVERY
// film as changed — measured on this drop: 58/58 films "CONTENT DIFFERS", 42/42
// resources, when 27 of them differed by a single file. A report that cannot say
// "unchanged" cannot tell a revision from a rebuild, so resources are matched by
// their CONTENT and UUIDs are masked inside it.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const norm = (t) => String(t).replace(/const barH = 44;/g, "const barH = 0;").replace(UUID_RE, "<uuid>");
const digest = (t) => crypto.createHash("sha1").update(String(t)).digest("hex");

function scenesOf(html) {
  const m = /window\.OM_SCENES\s*=\s*'([\s\S]*?)';/.exec(html);
  if (!m) return null;
  const raw = m[1].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  try { const s = JSON.parse(raw); return Array.isArray(s) ? s : null; } catch { return null; }
}
const secs = (sc) => Math.round(sc.reduce((a, s) => a + (Number(s.dur) || 0), 0));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// slug -> installed template name, from the packs themselves.
const installed = new Map();
for (const slug of fs.readdirSync(FRAMES_DIR)) {
  const pj = path.join(FRAMES_DIR, slug, "pack.json");
  if (!fs.existsSync(pj)) continue;
  try {
    const m = JSON.parse(fs.readFileSync(pj, "utf8"));
    if (m.longForm && m.template) installed.set(slug, m.template);
  } catch { /* skip */ }
}

const standaloneDir = fs.existsSync(path.join(SRC, "standalone")) ? path.join(SRC, "standalone") : SRC;
const files = fs.readdirSync(standaloneDir).filter((f) => f.endsWith(".html") && f !== "index.html").sort();
const slugify = (s) => s.replace(/\.html$/, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rows = [];
for (const f of files) {
  const slug = slugify(f);
  const srcHtml = fs.readFileSync(path.join(standaloneDir, f), "utf8");
  const srcScenes = scenesOf(srcHtml);
  const row = {
    slug,
    srcBeats: srcScenes ? srcScenes.length : "?",
    srcSec: srcScenes ? secs(srcScenes) : 0,
    state: "", note: "",
  };
  const tpl = installed.get(slug);
  if (!tpl) { row.state = "MISSING"; row.note = "no installed pack"; rows.push(row); continue; }
  const bundle = path.join(TPL_DIR, `${tpl}.html`);
  if (!fs.existsSync(bundle)) { row.state = "MISSING"; row.note = `bundle ${tpl}.html absent`; rows.push(row); continue; }

  const insHtml = fs.readFileSync(bundle, "utf8");
  const insScenes = scenesOf(insHtml);
  row.insBeats = insScenes ? insScenes.length : "?";
  row.insSec = insScenes ? secs(insScenes) : 0;

  // Compare the two resource sets as MULTISETS of normalised content. What is
  // reported is the count that exists on one side only, which is what "this film
  // was revised" actually looks like.
  const a = manifestOf(insHtml), b = manifestOf(srcHtml);
  let resDiff = 0, resTotal = 0;
  if (a && b) {
    const bag = (m) => {
      const out = new Map();
      for (const r of Object.values(m)) {
        const h = digest(norm(decode(r)));
        out.set(h, (out.get(h) || 0) + 1);
      }
      return out;
    };
    const A = bag(a), B = bag(b);
    resTotal = Math.max(Object.keys(a).length, Object.keys(b).length);
    for (const h of new Set([...A.keys(), ...B.keys()])) {
      resDiff += Math.abs((A.get(h) || 0) - (B.get(h) || 0));
    }
    row.changed = [...B.keys()].filter((h) => !A.has(h))
      .map((h) => {
        const r = Object.values(b).find((x) => digest(norm(decode(x))) === h);
        const t = String(decode(r) || "");
        const name = /^\s*\/\*\s*([\w.-]+)/.exec(t);
        return name ? name[1] : `${r && r.mime || "?"} ${t.length}b`;
      });
  }
  row.resDiff = resDiff; row.resTotal = resTotal;

  if (row.srcSec !== row.insSec || row.srcBeats !== row.insBeats) { row.state = "LENGTH DIFFERS"; }
  else if (resDiff) {
    row.state = "CONTENT DIFFERS";
    row.note = `${resDiff}/${resTotal} resource(s)` + (row.changed && row.changed.length ? `: ${row.changed.join(", ")}` : "");
  }
  else { row.state = "match"; }
  rows.push(row);
}

console.log("pack".padEnd(18) + "handoff".padStart(14) + "installed".padStart(14) + "  state");
for (const r of rows) {
  const s = `${r.srcBeats}b ${mmss(r.srcSec)}`;
  const i = r.insBeats === undefined ? "-" : `${r.insBeats}b ${mmss(r.insSec)}`;
  console.log(r.slug.padEnd(18) + s.padStart(14) + i.padStart(14) + "  " + r.state + (r.note ? ` (${r.note})` : ""));
}
const bad = rows.filter((r) => r.state !== "match");
console.log(`\n${rows.length} film(s) in handoff; ${rows.length - bad.length} match, ${bad.length} differ`);
if (bad.length) console.log("differ: " + bad.map((r) => `${r.slug} [${r.state}]`).join(", "));
process.exit(bad.length ? 1 : 0);
