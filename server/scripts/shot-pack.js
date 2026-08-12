// OUR-SIDE FRAME CAPTURE — shoot a KEYFRAME pack at the same beats as its reference.
//
// The other half of scripts/shot-reference.js. Together they make fidelity CHECKABLE:
//   node scripts/shot-reference.js Edition      -> framecheck/ref/Edition/*.png
//   node scripts/shot-pack.js edition --ref Edition -> framecheck/ours/edition/*.png
// Same scene, same moment, same authored stage size, same copy — so every remaining
// difference is the DESIGN, not the content or the timing.
//
// WHY --ref MATTERS. Comparing our render on OUR demo copy against the reference on ITS copy
// compares two different films; a longer headline alone changes the type size, the line count
// and the whole balance of the frame. With --ref, the reference's own OM_SCENES (names,
// durations, headlines, body, stats) are mapped into a KEYFRAME storyboard, so the composer is
// asked for exactly the film the reference draws.
//
// HOW IT SEEKS. Our compositions register ONE paused GSAP timeline as window.__timelines["vid"]
// and paint canvas layers from the renderer's `hf-seek` event. Under navigator.webdriver the
// timeline deliberately does not autoplay, so headless Chromium holds frame 0 until seeked —
// exactly the contract `hyperframes render` uses. This shoots frames directly from the HTML
// instead of encoding an MP4 first: same pixels, seconds instead of minutes.
//
// Usage:
//   node scripts/shot-pack.js edition --ref Edition
//   node scripts/shot-pack.js edition --ref Edition --at 2.5,7.75,13
//   node scripts/shot-pack.js hacker --ref Hacker --assets 3
//   node scripts/shot-pack.js all-ported            # every pack that has a reference

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const config = require("../src/config");
const frameRegistry = require("../src/services/frame_registry");
const frameManifest = require("../src/services/frame_manifest");
// composerModuleFor is the AUTHORITATIVE renderer -> module resolver (never guess a filename).
// Calling buildComposition directly — rather than attemptLlmComposition — is deliberate:
// attemptLlmComposition ends in a real HyperFrames MP4 encode, and it destructures `render` at
// import time, so it cannot be stubbed from outside. Minutes per pack, for pixels we then throw
// away. buildComposition returns the very HTML the encoder would seek, which is what we want,
// and it is the same seam scripts/golden-composers.js and test-motion-safety.js already use.
const { composerModuleFor } = require("../src/services/pipeline");
const sceneKit = require("../src/services/scene_kit");
const { findChromium } = require("./shot-reference");

// Compositions load GSAP from a CDN, and a `file://` page is a hostile origin for that: Chrome
// applies opaque-origin rules, the script never executes, gsap.timeline() throws, the timeline
// never registers and every frame is blank. The real renderer serves the job dir over localhost,
// so this does too — same origin semantics, same result. (Mirrors runtime_check.serveDir.)
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".woff": "font/woff",
};
function serveDir(dir) {
  const rootResolved = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const file = path.resolve(path.join(rootResolved, p));
    if (!file.startsWith(rootResolved)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (e, buf) => {
      if (e) { res.statusCode = 404; return res.end(); }
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

const REF_ROOT = path.join(__dirname, "..", "framecheck", "ref");
const OUT_ROOT = path.join(__dirname, "..", "framecheck", "ours");
const WORK_ROOT = path.join(config.paths.jobsDir, "_framecheck");

// reference template -> our pack. The authoritative mapping; keep in step with
// pipeline.DEDICATED_COMPOSERS. `Stomp` ships as `teampulse`, and FlightVertical is the same
// module at a portrait stage (flight_composer.vertical).
const REF_TO_PACK = {
  Edition: "edition", Hacker: "hacker", Pipeline: "pipeline", Deep: "deep", Jungle: "jungle",
  Orbit: "orbit", Fight: "fight", Flight: "flight", FlightVertical: "flight-vertical",
  Showcase: "showcase", ShowcaseVertical: "showcase-vertical", Reel: "reel", Fetch: "fetch",
  Drive: "drive", Momentum: "momentum", Stomp: "teampulse",
};
const PACK_TO_REF = Object.fromEntries(Object.entries(REF_TO_PACK).map(([r, p]) => [p, r]));

// ---------------------------------------------------------------- storyboard from a reference

const NAME_TO_KIND = [
  [/^(cover|title|intro|hook|boot|gate|main|countdown|enter|descend|open)/i, "hook"],
  [/^(cta|join|go|ship|arrival|surface|comeplay|comealong|stepin|colophon|launch)/i, "cta"],
  [/(quote|pullquote|proof|testimonial)/i, "quote"],
  [/(stat|ledger|numbers|census|telemetry|throughput|metrics|scorecard|instrument)/i, "stat"],
  [/(gallery|spread|fleet|billboard|sighting|tour|show)/i, "gallery"],
];
function kindOf(name, i, total) {
  if (i === 0) return "hook";
  if (i === total - 1) return "cta";
  for (const [re, k] of NAME_TO_KIND) if (re.test(String(name || ""))) return k;
  return "bullet";
}

// The reference scene objects are per-template shapes, so pull copy by CONVENTION rather than
// assuming one schema. Measured across all 20 handoffs: `headline` appears in every template but
// NOT on every scene — 2 of momentum's 8 beats, 2 of hacker's 6, 2 of reel's 6, 1 of edition's 6,
// 6 of stomp's 14 and 6 of cadence's 22 carry their display line under some other key.
//
// THE BUG THIS REPLACES. `head` fell through those keys straight to `name`, so a headline-less
// beat rendered its SCENE ROLE as the headline: momentum's manifesto beat printed the word
// "STATEMENT" where the reference sets "BUILD / BOLD. / SHIP / FASTER.", its quote beat printed
// "QUOTE", its gallery beat "SHOWCASE". Worse, `lines` is an ARRAY, so the authored headline was
// then scraped by the list loop below and rendered as CHIPS — the reference's display line and
// its chip row swapped places. Five of momentum's eight beats compared as garbage.
//
// That is not a cosmetic harness flaw. This harness exists so that "every remaining difference is
// the DESIGN, not the content", and a beat whose copy is a role label fails that guarantee in the
// one direction that manufactures false defects: an auditor reading those frames would file
// "headline missing / wrong copy / chips invented" against a composer that did nothing wrong.
//
// DISPLAY-LINE KEYS, in precedence order. `lines` (array) and `words` ("A|B|C") are the same
// thing authored two ways — a multi-line display headline. `quote` heads a pull-quote beat (the
// reference sets it in display type, which is the entire point of those beats), so it leads here
// and is dropped from the support line to avoid printing it twice.
const HEAD_KEYS = ["headline", "title", "head", "words", "lines", "text", "quote", "stamp", "caption", "pill", "brand"];
const SUB_KEYS = ["body", "tagline", "sub", "subtext", "copy", "desc"];
// Named list keys beat "first array found": `bars:[0.4,0.55,...]` and `anim:{...}` are data, not
// copy, and momentum's `lines` must never be read as a list now that it is a headline.
const LIST_KEYS = ["chips", "stats", "perks", "pains", "bullets", "tags", "combos", "feats",
  "roster", "caps", "blocks", "cards", "states", "tools", "steps", "notes", "plans", "rows",
  "cols", "results", "msgs", "shots"];

function copyOf(s) {
  const src = s || {};
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
  // A display line may arrive as a string, a "|"-delimited string, or an array of lines. All three
  // normalise to one string — our fitters re-wrap to the measured column anyway, so the authored
  // break positions are advisory. ('|' is the reference's own line-break marker.)
  const asLine = (v) => (Array.isArray(v)
    ? v.filter((x) => typeof x === "string").join(" ")
    : str(v)).replace(/\|/g, " ").replace(/\s+/g, " ").trim();

  let head = "", headKey = "";
  for (const k of HEAD_KEYS) {
    const v = asLine(src[k]);
    if (v) { head = v; headKey = k; break; }
  }
  // COMPOSITE display lines — a beat whose headline is assembled from two fields rather than
  // stored in one. Cadence's Metric beat sets {value:72, suffix:"%"} and its Morph beat sets
  // {prefix:"Status:", states:["Draft","In review","Approved","Live"]}; in both the reference
  // renders that pair AS the display type, so neither is a bare beat.
  if (!head && src.value !== undefined && src.value !== null && String(src.value).trim()) {
    head = `${src.value}${str(src.suffix) || ""}`;
    headKey = "value";
  }
  if (!head && Array.isArray(src.states) && src.states.length) {
    head = [str(src.prefix), str(src.states[0])].filter(Boolean).join(" ");
    headKey = "states";
  }
  // Last resort only, and REPORTED rather than silent: a caller comparing frames needs to know the
  // headline was synthesized from the role name and is not the reference's own copy.
  const headFromName = !head;
  if (headFromName) head = String(src.name || "");

  const sub = (() => {
    for (const k of SUB_KEYS) { const v = str(src[k]); if (v) return v; }
    // `quote` only supports the line when it is not already heading it.
    return headKey === "quote" ? "" : str(src.quote);
  })();

  // THE STATS SHAPE, WHICH ALL TWENTY TEMPLATES SHARE: `stats: [{v, suf, l}]` — value, suffix,
  // label ({"v":2.4,"suf":"M","l":"TRIPS / DAY"}). The old extractor looked for
  // label|title|k|name|value, none of which is v/suf/l, so it produced an EMPTY string per entry
  // and dropped the whole array.
  //
  // The blast radius of that was the widest of any defect in this harness. Every pack routes its
  // stats beat through K.numbersIn(scene), which needs at least two figures; with none, the beat
  // takes the pictureless `statement` fallback. So in EVERY ported pack the one beat designed
  // around figures compared as a bare centred headline — drive's speedometer, sweeping arc and
  // hard-shadowed cards, momentum's full-bleed orange ground and bar chart, all present in the
  // composers and all absent from the frames. Sixteen packs, one beat each, every one a false
  // "the layout is missing" against code that implements it.
  //
  // numbersIn() reads emphasis+headline+subtext+body — NOT the list — while statLabel() reads the
  // list. So the figures go into the support line and the labels into the list, which is exactly
  // how a production storyboard presents a stats beat (prose carrying figures, chips carrying
  // captions). Same contract, so the comparison exercises the real path.
  const statsOf = (v) => (Array.isArray(v) ? v : []).slice(0, 4)
    .filter((x) => x && typeof x === "object" && x.v !== undefined)
    .map((x) => ({ fig: `${x.v}${str(x.suf) || ""}`, label: str(x.l) || str(x.label) || "" }));
  const stats = statsOf(src.stats);

  const list = [];
  const takeArray = (v) => {
    if (!Array.isArray(v) || !v.length) return false;
    const got = [];
    for (const x of v.slice(0, 4)) {
      const t = typeof x === "string" ? x
        : (x && typeof x === "object" ? (x.l || x.label || x.title || x.k || x.name || x.v || x.value || "") : "");
      if (t !== "" && t !== undefined && String(t).length <= 60) got.push(String(t));
    }
    if (!got.length) return false;
    list.push(...got);
    return true;
  };
  for (const k of LIST_KEYS) { if (k !== headKey && takeArray(src[k])) break; }
  if (!list.length) {
    for (const [k, v] of Object.entries(src)) { if (k !== headKey && takeArray(v)) break; }
  }

  // Attribution lines: a pull-quote without its author is a different design.
  const attrib = [str(src.author), str(src.by), str(src.quoteBy), str(src.role)].filter(Boolean);

  // The figures ride the support line so numbersIn() can find them; the labels are already in
  // `list` (stats is a LIST_KEY). Appended rather than substituted, so a beat carrying real body
  // copy AND stats keeps both.
  const figures = stats.map((s) => s.fig).join(" · ");
  const subOut = [sub, figures].filter(Boolean).join(" · ");

  return { head, headKey, headFromName, sub: subOut, list, attrib, stats, kicker: (() => {
    for (const k of ["kicker", "eyebrow", "label", "issue"]) { const v = str(src[k]); if (v) return v; }
    return "";
  })() };
}

function storyboardFromRef(meta, dims) {
  const scenes = Array.isArray(meta.omScenes) ? meta.omScenes : [];
  if (!scenes.length) return null;
  const total = scenes.length;
  let t = 0;
  const out = [];
  const synthesized = [];
  for (let i = 0; i < total; i++) {
    const s = scenes[i];
    const dur = Number(s && (s.dur ?? s.duration)) || 4;
    const c = copyOf(s);
    const name = String((s && (s.name || s.id)) || `scene${i + 1}`);
    // SAY SO when a beat's display line is the role name rather than the reference's own copy.
    // Silence here is what let momentum compare five garbage beats as if they were real.
    if (c.headFromName) synthesized.push(name);
    out.push({
      id: `s${i + 1}`, start: +t.toFixed(2), duration: +dur.toFixed(2),
      kind: kindOf(name, i, total),
      purpose: name.toLowerCase(),
      headline: c.head || name,
      subtext: c.sub || "",
      onScreenText: c.list.length ? c.list : (c.attrib.length ? c.attrib : (c.kicker ? [c.kicker] : [])),
      emphasis: c.kicker || "",
      voiceover: "",
      visualDirection: name,
      beats: [],
    });
    t += dur;
  }
  if (synthesized.length) {
    console.warn(`  [ref-copy] ${synthesized.length} beat(s) carry no display line in OM_SCENES `
      + `(${synthesized.join(", ")}) — headline synthesized from the scene name. `
      + `Those frames compare our layout, NOT the reference's copy.`);
  }
  return {
    title: String(meta.template || "Reference"),
    durationSec: +t.toFixed(2),
    orientation: dims.width >= dims.height ? "horizontal" : "vertical",
    palette: { background: "#0B0B12", text: "#FFFFFF", primary: "#6366F1", accent: "#8B5CF6" },
    scenes: out,
    source: "reference-mirror",
    synthesizedHeadlines: synthesized,
  };
}

// Synthetic assets. A fidelity shot must exercise the picture-bearing layouts, and the packs
// deliberately collapse to pictureless variants when handed nothing — which would silently
// compare our STATEMENT fallback against the reference's plated design.
function makeAssets(jobDir, n) {
  if (!n) return [];
  const dir = path.join(jobDir, "assets", "images");
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  const SPECS = [
    { w: 1600, h: 900, kind: "screenshot", prom: "hero", label: "UI" },
    { w: 1200, h: 800, kind: "photo", prom: "support", label: "PHOTO" },
    { w: 1000, h: 1250, kind: "screenshot", prom: "support", label: "MOBILE" },
    { w: 1400, h: 1400, kind: "photo", prom: "support", label: "SQUARE" },
    { w: 1920, h: 1080, kind: "screenshot", prom: "support", label: "WIDE" },
    { w: 800, h: 600, kind: "photo", prom: "support", label: "CARD" },
  ];
  for (let i = 0; i < Math.min(n, SPECS.length); i++) {
    const s = SPECS[i];
    const rel = `assets/images/shot_${i}.svg`;
    // An SVG placeholder rather than a solid colour: a labelled grid makes CROP and ASPECT
    // handling visible in the frame, which is exactly what Phase 8 of the fidelity brief asks
    // about. (SVG is fine here — this path never touches ffmpeg.)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">`
      + `<rect width="100%" height="100%" fill="#2b3a55"/>`
      + `<g stroke="#5b7fb5" stroke-width="2" fill="none">`
      + Array.from({ length: 9 }, (_, k) => `<line x1="${(s.w / 8) * k}" y1="0" x2="${(s.w / 8) * k}" y2="${s.h}"/>`).join("")
      + Array.from({ length: 7 }, (_, k) => `<line x1="0" y1="${(s.h / 6) * k}" x2="${s.w}" y2="${(s.h / 6) * k}"/>`).join("")
      + `</g>`
      + `<rect x="4" y="4" width="${s.w - 8}" height="${s.h - 8}" fill="none" stroke="#eaf1ff" stroke-width="6"/>`
      + `<text x="50%" y="50%" fill="#eaf1ff" font-family="sans-serif" font-size="${Math.round(Math.min(s.w, s.h) * 0.14)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${s.label} ${s.w}x${s.h}</text>`
      + `</svg>`;
    fs.writeFileSync(path.join(jobDir, rel), svg, "utf8");
    out.push({
      path: rel, type: "image", width: s.w, height: s.h, ratio: +(s.w / s.h).toFixed(3),
      source: i === 0 ? "website" : "upload", kindHint: s.kind, cdProminence: s.prom,
      cdScore: 0.92 - i * 0.05, visionOk: true, alt: `${s.label} placeholder`,
    });
  }
  const rel = "assets/images/logo.svg";
  fs.writeFileSync(path.join(jobDir, rel),
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><circle cx="200" cy="200" r="180" fill="#eaf1ff"/><text x="200" y="200" fill="#2b3a55" font-family="sans-serif" font-size="150" font-weight="800" text-anchor="middle" dominant-baseline="middle">K</text></svg>`, "utf8");
  out.push({ path: rel, type: "image", width: 400, height: 400, source: "website-brand", role: "logo", alt: "logo" });
  return out;
}

// ---------------------------------------------------------------- capture

async function shootPack(browser, pack, opts) {
  const refName = opts.ref || PACK_TO_REF[pack] || null;
  const refMeta = refName && fs.existsSync(path.join(REF_ROOT, refName, "meta.json"))
    ? JSON.parse(fs.readFileSync(path.join(REF_ROOT, refName, "meta.json"), "utf8"))
    : null;
  if (refName && !refMeta) {
    return { pack, ok: false, error: `no reference frames yet — run: node scripts/shot-reference.js ${refName}` };
  }

  const manifest = frameManifest.getManifest(pack) || {};
  const portrait = String(manifest.orientation || "").toLowerCase() === "portrait";
  // Match the reference's authored stage exactly when we have it; a different aspect would make
  // every position comparison meaningless.
  const dims = refMeta && refMeta.stage
    ? { width: refMeta.stage.width, height: refMeta.stage.height, fps: 30 }
    : (portrait ? { width: 1080, height: 1920, fps: 30 } : { width: 1920, height: 1080, fps: 30 });

  const storyboard = refMeta ? storyboardFromRef(refMeta, dims) : null;
  if (!storyboard) return { pack, ok: false, error: "could not build a storyboard from the reference scene table" };

  const jobDir = path.join(WORK_ROOT, pack);
  fs.rmSync(jobDir, { recursive: true, force: true });
  fs.mkdirSync(jobDir, { recursive: true });
  const assets = makeAssets(jobDir, opts.assets);

  // The pack's OWN composer — the exact module that renders a customer's film. Deterministic and
  // free (no LLM). A pack with no dedicated renderer is composed by the scene-kit, same as in
  // production dispatch.
  const composer = composerModuleFor(manifest.renderer) || sceneKit;
  let built;
  try {
    built = composer.buildComposition({
      storyboard, dims, framePack: pack, assets, captionCues: [],
      brandSkin: opts.brandSkin || null, localized: null, seedKey: `framecheck-${pack}`,
    });
  } catch (e) {
    return { pack, ok: false, error: `buildComposition threw: ${String(e.message).slice(0, 180)}` };
  }
  if (!built || !built.indexHtml) return { pack, ok: false, error: "composer returned no indexHtml" };

  const indexPath = path.join(jobDir, "index.html");
  fs.writeFileSync(indexPath, built.indexHtml, "utf8");
  if (built.metaJson) fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");

  const outDir = opts.out ? path.resolve(opts.out) : path.join(OUT_ROOT, pack);
  fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage();
  const errors = [];
  const netFails = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("requestfailed", (r) => netFails.push(`${r.url().slice(0, 90)} (${r.failure() && r.failure().errorText})`));
  await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });

  const served = await serveDir(jobDir);
  try {
    await page.goto(`http://127.0.0.1:${served.port}/index.html`, { waitUntil: "load", timeout: opts.timeoutMs });
    // The timeline registers at the end of the composition script. Waiting for it (not a timer)
    // is also the runtime check: a script that throws never registers, and this reports it.
    // The predicate MUST return a boolean — returning the timeline itself makes puppeteer try to
    // serialize a GSAP object full of circular references, which rejects and reads exactly like
    // "the timeline never registered" even though it registered fine.
    await page.waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: opts.timeoutMs })
      .catch(() => {
        throw new Error(`timeline never registered`
          + (errors.length ? ` | page error: ${errors[0]}` : "")
          + (netFails.length ? ` | failed request: ${netFails[0]}` : ""));
      });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const times = opts.at && opts.at.length
      ? opts.at
      : (refMeta.shots || []).map((s) => s.t);

    const shots = [];
    for (const t of times) {
      await page.evaluate((time) => {
        const tl = window.__timelines.vid;
        tl.pause();
        tl.seek(time, false);
        // Canvas layers paint from hf-seek, not from the timeline — the renderer dispatches this
        // on every seek, so a shot that skips it captures a blank backdrop.
        window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
      }, t);
      const scene = (refMeta.scenes || []).find((b) => t >= b.start && t < b.start + b.duration);
      const name = `${pack}-t${String(t).replace(".", "_")}${scene ? `-${String(scene.name).replace(/[^\w-]/g, "")}` : ""}.png`;
      await page.screenshot({ path: path.join(outDir, name) });
      shots.push({ t, scene: scene ? scene.name : null, file: name });
    }

    fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({
      pack, reference: refName, renderer: manifest.renderer || "(scene-kit)",
      stage: { width: dims.width, height: dims.height },
      durationSec: storyboard.durationSec, assets: assets.length,
      resolvedBrand: built.resolvedBrand || null,
      usedAssets: Array.isArray(built.usedAssets) ? built.usedAssets.length : null,
      scenes: storyboard.scenes.map((s) => ({ id: s.id, purpose: s.purpose, kind: s.kind, start: s.start, duration: s.duration })),
      shots, pageErrors: errors,
    }, null, 2), "utf8");

    return { pack, ok: true, shots: shots.length, outDir, renderer: manifest.renderer || "(scene-kit)", errors };
  } catch (e) {
    return { pack, ok: false, error: String(e.message).slice(0, 240), errors };
  } finally {
    await page.close().catch(() => {});
    served.server.close();
  }
}

function parseArgs(argv) {
  // ASSET BUDGET. Was 4, which starved the picture-hungry beats: drive's Fleet asks for up to six
  // browser windows and the reference draws four, but intro(1) + billboards(2) + feature(2)
  // consume the budget first, so Fleet received ZERO and fell to the pictureless `statement`
  // layout. The sheet then showed the reference's four-window grid beside our bare headline —
  // again comparing our fallback against their designed beat rather than comparing two designs.
  // 8 lets every reference slot be filled. Pass `--assets 4` to inspect the sparse behaviour
  // deliberately; that is a different question and deserves an explicit flag.
  const opts = { at: null, out: null, ref: null, assets: 8, timeoutMs: 45_000, brandSkin: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--at") opts.at = String(argv[++i] || "").split(",").map(Number).filter(Number.isFinite);
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--ref") opts.ref = argv[++i];
    else if (a === "--assets") opts.assets = Math.max(0, Number(argv[++i]) || 0);
    else if (a === "--timeout") opts.timeoutMs = Math.max(5000, Number(argv[++i]) || 45_000);
    else if (a === "--brand") opts.brandSkin = { accents: ["#e0218a", "#1f6feb"], emphasis: "#e0218a", tier: "explicit", applied: true, provenance: "explicit" };
    else if (a.startsWith("--")) { console.error(`unknown flag ${a}`); process.exit(2); }
    else positional.push(a);
  }
  return { opts, positional };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const installed = frameRegistry.listPacks();
  if (!positional.length) {
    console.log("usage: node scripts/shot-pack.js <pack|all-ported> [--ref Template] [--at 2.5,7] [--assets N] [--brand]");
    console.log(`ported packs: ${Object.values(REF_TO_PACK).filter((p) => installed.includes(p)).join(", ")}`);
    process.exit(1);
  }
  const want = positional.includes("all-ported")
    ? Object.values(REF_TO_PACK).filter((p) => installed.includes(p))
    : positional;
  const unknown = want.filter((p) => !installed.includes(p));
  if (unknown.length) { console.error(`not installed: ${unknown.join(", ")}`); process.exit(2); }

  let puppeteer;
  try { puppeteer = require("puppeteer-core"); } catch { console.error("puppeteer-core not installed"); process.exit(3); }
  const exe = findChromium();
  if (!exe) { console.error("no cached Chrome found — set PUPPETEER_EXECUTABLE_PATH"); process.exit(3); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"],
  });

  const results = [];
  try {
    for (const pack of want) {
      process.stdout.write(`[ours] ${pack} … `);
      const r = await shootPack(browser, pack, opts);
      results.push(r);
      // PRINT THE ERROR, NOT JUST ITS COUNT. "(1 page error(s))" on all 16 packs is
      // indistinguishable from a harmless favicon 404 and from a font that failed to load and
      // silently swapped the pack's display face — which is exactly the class of defect this
      // harness exists to catch. A count you cannot act on is noise; the text is a diagnosis.
      console.log(r.ok
        ? `${r.shots} frame(s) via ${r.renderer} -> ${path.relative(process.cwd(), r.outDir)}`
          + (r.errors.length ? ` (${r.errors.length} page error(s): ${r.errors[0]})` : "")
        : `FAILED: ${r.error}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`\n[ours] ${results.length - bad.length}/${results.length} captured`);
  if (bad.length) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { shootPack, REF_TO_PACK, PACK_TO_REF, storyboardFromRef };
