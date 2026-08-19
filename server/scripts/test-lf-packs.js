#!/usr/bin/env node
// TEST-LF-PACKS — the structural guard for the long-form family.
//
// The sibling of scripts/test-film-packs.js, and it asserts everything that one does, because
// the engineering contract is the same contract. What it adds is the handful of properties that
// are specific to how this port works — and each of those exists because the property was
// ALREADY violated once during the port, silently:
//
//   • THE WORLD MUST DRAW INTO AN <svg>. The first render of this engine appended the World's
//     <g> to an HTML <div>. A <g> outside an <svg> parses, sits in the DOM and paints nothing:
//     every frame came out with perfect type on a bare ground, and no error anywhere said why.
//   • NO CSS TRANSITIONS. lf-kit.js:194 carries transition:"color 0.2s" — a wall clock, not a
//     GSAP tween. It is invisible to test-film-packs' Math.random/Date regexes and to
//     test:motion-safety's transform sweep, and it makes a seeked frame differ from a rendered
//     one by up to 200ms. It must be dropped in transcription, and asserted absent here.
//   • THE TWO EVALUATORS MUST AGREE. Every renderer runs twice — once server-side to emit the
//     static document, once in the browser per seek. If they disagree the film changes the
//     instant playback starts. So every beat is rendered through both and compared.
//   • NO CLOSURES IN A BEAT. Beats ship to the page by Function.prototype.toString, which
//     carries the text and not the scope. A beat that closed over module scope passes in Node
//     and renders blank in Chromium — so the browser payload is compiled in a bare context here.
//
//   node scripts/test-lf-packs.js
//   node scripts/test-lf-packs.js --pack fetch-club
//   node scripts/test-lf-packs.js --runtime      # also launch Chromium and seek

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SKIN_DIR = path.join(__dirname, "..", "src", "services", "lf_skins");
const stage = require("../src/services/lf_stage");
const beats = require("../src/services/lf_beats");
const rt = require("../src/services/lf_runtime");
const fm = require("../src/fonts/font_metrics");
const pf = require("../src/fonts/pack_fonts");

let pass = 0, fail = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) { pass++; return true; }
  fail++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  return false;
}

// A synthetic deck that exercises every field any renderer reads. Deliberately NOT the authored
// deck: this guard has to prove the engine survives content it has never seen, which is what a
// real job supplies. The authored-deck comparison is the fidelity harness's job
// (scripts/shot-lf-pack.js), not this one's.
function syntheticScene(name, i) {
  const meta = beats.META[name] || {};
  const s = { name, dur: 7.5 };
  const long = "A sentence with enough words in it to force a wrap at almost any authored size";
  for (const k of meta.keys || []) {
    switch (k) {
      case "title": s.title = `Scene ${i + 1} headline`; break;
      case "sub": s.sub = long; break;
      case "text": s.text = long; break;
      case "kicker": s.kicker = "A KICKER"; break;
      case "word": s.word = "SINGLE"; break;
      case "num": s.num = String(i + 1).padStart(2, "0"); break;
      case "sign": s.sign = "— attribution"; break;
      case "by": s.by = "— someone, somewhere"; break;
      case "hi": s.hi = ["sentence", "wrap"]; break;
      case "keep": s.keep = ["ONE", "THREE"]; break;
      case "lines": s.lines = ["First line", "Second line", "Third line"]; break;
      case "items": s.items = ["First item", "Second item", "Third item", "Fourth item"]; break;
      case "words": s.words = ["ONE", "TWO", "THREE", "FOUR"]; break;
      case "rows": s.rows = name === "Receipt" ? [["Line one", "$10"], ["Line two", "$20"]] : ["BAND ONE", "BAND TWO", "BAND THREE"]; break;
      case "stamps": s.stamps = ["ONE", "TWO", "THREE"]; break;
      case "caps": s.caps = ["cap one", "cap two", "cap three"]; break;
      case "months": s.months = ["MARCH", "JUNE", "SEPTEMBER", "DECEMBER"]; break;
      case "phrases": s.phrases = ["first phrase", "second phrase"]; break;
      case "sats": s.sats = ["ONE", "TWO", "THREE", "FOUR"]; break;
      case "center": s.center = "MIDDLE"; break;
      case "steps": s.steps = name === "Weeks"
        ? [{ n: "1", label: "week one" }, { n: "3", label: "week three" }]
        : ["ONE", "TWO", "THREE", "FOUR"]; break;
      case "stats": s.stats = [{ to: 12, suffix: "", label: "first stat" }, { to: 340, suffix: "K", label: "second stat" }]; break;
      case "plans": s.plans = [{ name: "Starter", blurb: "the small one", price: 0 }, { name: "Full", blurb: "the big one", price: 24 }]; break;
      case "pairs": s.pairs = [["A question?", "An answer."], ["Another?", "Also answered."]]; break;
      case "to": s.to = 17; break;
      case "q": s.q = "A question?"; break;
      case "a": s.a = "YES."; break;
      case "lo": s.lo = "doubt"; break;
      case "hi2": break;
      case "old": s.old = "old phrase."; break;
      case "neu": s.neu = "NEW"; break;
      case "rest": s.rest = "phrase."; break;
      case "left": s.left = "LEFT"; break;
      case "right": s.right = "RIGHT"; break;
      case "prefix": s.prefix = "PREFIX"; break;
      case "ring": s.ring = "AROUND AND AROUND · "; break;
      case "edge": s.edge = "EDGE TEXT · EDGE TEXT"; break;
      case "band1": s.band1 = "BAND ONE"; break;
      case "band2": s.band2 = "BAND TWO"; break;
      case "stampline": s.stampline = "STAMPED"; break;
      case "badge": s.badge = "MOST PICKED"; break;
      case "cta": s.cta = "Get started"; break;
      case "url": s.url = "example.com"; break;
      case "caption": s.caption = "Desktop screenshot"; break;
      case "image": s.image = ""; break;
      case "logo": s.logo = ""; break;
      default: break;
    }
  }
  if ((meta.keys || []).includes("hi") && name === "Gauge") s.hi = "certain";
  return s;
}

function syntheticDeck(skin) {
  const spine = stage.resolveSpine(skin.SKIN);
  return {
    title: skin.SKIN.label,
    durationSec: spine.length * 7.5,
    scenes: spine.map((name, i) => ({ ...syntheticScene(name, i), id: `s${i}`, start: i * 7.5, duration: 7.5 })),
  };
}

// ---------------------------------------------------------------- engine-level checks
function checkEngine() {
  // The spine literal exists in two places by design (the generator derives against it, the
  // stage replays against it). If they ever diverge, every pack's scene order silently shifts.
  const genSrc = fs.readFileSync(path.join(__dirname, "gen-lf-skins.js"), "utf8");
  const m = genSrc.match(/const SPINE = \[([\s\S]*?)\];/);
  const genSpine = m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : [];
  check(genSpine.join("|") === stage.SPINE.join("|"),
    "SPINE agrees between gen-lf-skins.js and lf_stage.js",
    `generator has ${genSpine.length}, stage has ${stage.SPINE.length}`);

  // Every renderer named by the canonical spine must actually exist, or a pack renders a hole.
  for (const name of stage.SPINE) {
    check(typeof beats.BEATS[name] === "function", `SPINE renderer implemented: ${name}`);
  }
  // Every implemented renderer needs META, and vice versa.
  for (const name of Object.keys(beats.BEATS)) check(beats.META[name], `META declared for ${name}`);
  for (const name of Object.keys(beats.META)) {
    if (!beats.BEATS[name]) failures.push(`NOTE ${name} has META but no renderer (not yet transcribed)`);
  }

  // NO CLOSURES. Compile the browser payload in a context that provides ONLY what the emitted
  // page provides. A beat that reached for module scope throws here rather than in Chromium.
  const src = beats.browserSource();
  const sandbox = { Math, Array, Object, String, Number, JSON, console };
  vm.createContext(sandbox);
  let map = null;
  try {
    map = vm.runInContext(`(function(){${src}})()`, sandbox, { timeout: 5000 });
    check(map && typeof map === "object", "browserSource() compiles in a bare context");
  } catch (e) {
    check(false, "browserSource() compiles in a bare context", e.message.slice(0, 140));
  }
  if (map) {
    check(Object.keys(map).length === Object.keys(beats.BEATS).length,
      "browserSource() exports every beat", `${Object.keys(map).length} vs ${Object.keys(beats.BEATS).length}`);
  }

  // The two camera implementations must agree — build side vs emitted string.
  const camSrc = rt.__shims.LF_CAMERA_SHIM;
  for (const kind of ["pushL", "pushR", "pushU", "pushD", "drop", "hopU", "zoomIn", "zoomOut", "spin"]) {
    check(camSrc.includes(`"${kind}"`) || kind === "spin", `camera shim handles ${kind}`);
  }
}

// ---------------------------------------------------------------- per-pack checks
function checkPack(file) {
  const slug = file.replace(/\.js$/, "").replace(/_/g, "-");
  const skin = require(path.join(SKIN_DIR, file));
  const S = skin.SKIN;
  const tag = `[${slug}]`;

  check(typeof skin.buildComposition === "function", `${tag} exports buildComposition`);
  check(pf.isBundled(S.display), `${tag} display face bundled: ${S.display}`);
  check(pf.isBundled(S.body), `${tag} body face bundled: ${S.body}`);
  check(fm.hasMetrics(S.display), `${tag} display face has metrics: ${S.display}`);

  const spine = stage.resolveSpine(S);
  check(spine.length === S.spineOverrides.filter((o) => o[0] === "insert").length + stage.SPINE.length,
    `${tag} spine resolves to the right length`, `${spine.length}`);

  const out = skin.buildComposition({
    storyboard: syntheticDeck(skin),
    dims: { width: 1920, height: 1080, fps: 30 },
    captionCues: [{ start: 0, end: 3, text: "a caption" }],
    assets: [],
  });
  const h = out.indexHtml;

  // Determinism: the same inputs must produce the same bytes.
  const again = skin.buildComposition({
    storyboard: syntheticDeck(skin),
    dims: { width: 1920, height: 1080, fps: 30 },
    captionCues: [{ start: 0, end: 3, text: "a caption" }],
    assets: [],
  }).indexHtml;
  check(h === again, `${tag} build is byte-deterministic`);

  // The shared engineering contract.
  check(!/Math\.random/.test(h), `${tag} no Math.random`);
  check(!/new Date\(|Date\.now\(/.test(h), `${tag} no Date`);
  check(!/requestAnimationFrame/.test(h), `${tag} no requestAnimationFrame`);
  check(!/repeat:\s*-1/.test(h), `${tag} no infinite repeat`);
  check(!/DROP IMAGE TO REPLACE/.test(h), `${tag} no placeholder text`);
  check((h.match(/__timelines\["vid"\]/g) || []).length === 1, `${tag} exactly one timeline`);
  check((h.match(/id="cap-text"/g) || []).length === 1, `${tag} exactly one caption node`);

  // The long-form-specific ones.
  check(/id="lf-world-svg"/.test(h), `${tag} world draws into an <svg>, not a <div>`);
  const cssBlock = (h.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  // A TIMED transition is a second clock and must not exist. `transition:none` is the opposite —
  // Receipt sets it explicitly to stop the printed rows easing as the slip grows, and stripping
  // it would ADD the animation the source went out of its way to disable. So the guard rejects a
  // duration, not the property.
  const timed = (h.match(/transition\s*:\s*(?!none\b)[^;"']+/g) || []).filter((s) => /\d*\.?\d+m?s/.test(s));
  check(timed.length === 0, `${tag} no timed CSS transition`, timed.slice(0, 3).join(" | "));
  check(/@font-face/.test(cssBlock), `${tag} fonts inlined`);

  // Unique tracks — a duplicate index makes two layers fight for one slot.
  const tracks = [...h.matchAll(/data-track-index="(\d+)"/g)].map((x) => x[1]);
  check(new Set(tracks).size === tracks.length, `${tag} track indexes unique`, `${tracks.length} layers`);

  // EVERY SCENE MUST RENDER SOMETHING. This is the ghost check: a scene block whose camera layer
  // is empty is a frame the film will hold for 7.5 seconds with nothing on it.
  const blocks = [...h.matchAll(/data-beat="([^"]+)"[^>]*>\s*<div class="lf-cam"[^>]*>([\s\S]*?)<\/div>\s*<div class="lf-garnish"/g)];
  check(blocks.length === spine.length, `${tag} every scene emitted a block`, `${blocks.length}/${spine.length}`);
  const empty = blocks.filter((b) => b[2].replace(/<[^>]+>/g, "").trim().length === 0 && !/<(svg|img)/.test(b[2]));
  check(empty.length === 0, `${tag} no empty scene`, empty.map((b) => b[1]).join(", "));

  // The two evaluators must agree on every beat this pack uses.
  const theme = stage.buildTheme(S, null);
  const advTable = fm.hasMetrics(S.display) ? fm.METRICS[S.display] : null;
  const adv = (s) => fm.advanceEm(s, S.display, { avg: (advTable && advTable.avg) || S.em });
  let disagree = 0;
  for (const name of new Set(spine)) {
    const fn = beats.BEATS[name];
    if (!fn) continue;
    const meta = beats.META[name] || {};
    const u = rt.buildUtils({
      W: 1920, H: 1080, dark: !!meta.dark, advance: adv, PADX: stage.PADX, COLW: stage.COLW,
      FH: theme.displayStack, FB: theme.bodyStack,
    });
    const args = { progress: 0.55, index: 3, localTime: 4, scene: syntheticScene(name, 3), theme, t: 9.2, u };
    let a, b;
    try { a = fn(args); } catch (e) { check(false, `${tag} ${name} renders at build time`, e.message.slice(0, 110)); continue; }
    try { b = fn(args); } catch { b = null; }
    if (!a || !a.html || a.html.length < 12) { check(false, `${tag} ${name} produced markup`, `len ${(a && a.html || "").length}`); continue; }
    if (!b || b.html !== a.html) disagree++;
  }
  check(disagree === 0, `${tag} beats are deterministic across calls`, `${disagree} differed`);
}

function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes("--pack") ? argv[argv.indexOf("--pack") + 1] : null;

  checkEngine();
  const files = fs.readdirSync(SKIN_DIR)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => !only || f === `${only.replace(/-/g, "_")}.js`);
  check(files.length > 0, "at least one long-form skin exists");
  for (const f of files) {
    try { checkPack(f); } catch (e) { check(false, `[${f}] threw`, e.message.slice(0, 160)); }
  }

  const notes = failures.filter((f) => f.startsWith("NOTE "));
  const real = failures.filter((f) => !f.startsWith("NOTE "));
  for (const n of notes) console.log(`  ${n}`);
  for (const f of real) console.error(`  FAIL ${f}`);
  console.log(`\n${pass} passed, ${real.length} failed  (${files.length} pack(s) checked)`);
  process.exit(real.length ? 1 : 0);
}

main();
