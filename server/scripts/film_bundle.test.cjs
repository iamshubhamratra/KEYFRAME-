// Guard: a GENERATED film bundle must carry the studio's film, not the model's demo.
//
// admin/film_bundle.js builds a bundle by hand for the omelette pipeline to
// render. Two defects shipped completely green — check:packs, check:templates,
// lint, contrast, identity and the render itself all passed on a film that was
// either black or telling the wrong story:
//
//   1. THE BLOCK IN <head> CORRUPTED ITSELF. The adapter stamps its parse-time
//      dimension contract onto the first <body> in the file. With the
//      `__bundler/template` block in <head>, that first <body> was the one
//      inside the block's JSON STRING, so a raw `<div class="composition" …>`
//      was spliced into the JSON, which then failed to parse. The film never
//      mounted. Nothing reported it, because everything downstream measures the
//      composition rather than whether the film is in it.
//
//   2. THE FILM READ A COPY THE ADAPTER NEVER WROTE TO. The globals were
//      declared TWICE — once in the block, once as ordinary top-level scripts —
//      and the film executed the top-level pair. The adapter rewrites only the
//      block, so every job rendered the demo copy and the demo brand. No error,
//      no missing frame, just the wrong words in every one.
//
// So the checks here are end-to-end on purpose: build a bundle, run it through
// the real adapter, then run the real hydration against the result and assert
// the studio's copy and brand are what the film would actually see.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const adapter = require("../src/services/omelette_adapter");
const fb = require("../src/admin/film_bundle");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

// A minimal but honest film: it assigns its global and reads OM_SCENES, which is
// what validateFilmSpec insists a real one does.
const FILM_SRC = `
  window.ZzFilmProbe = function () {
    var scenes = [];
    try { scenes = JSON.parse(window.OM_SCENES); } catch (e) {}
    return React.createElement('div', null, scenes.length);
  };
`;
const DEMO_SCENES = [
  { name: "Hook", dur: 4, title: "DEMO TITLE ONE", sub: "demo sub one" },
  { name: "Statement", dur: 4, title: "DEMO TITLE TWO", sub: "demo sub two" },
  { name: "Cta", dur: 4, title: "DEMO TITLE THREE", sub: "demo sub three" },
];
const DEMO_TWEAKS = { brand: "Demo Brand", accent: "#ff0000", motion: "Lively" };

const TPL_ID = "ZzFilmProbe";
const TPL_FILE = path.join(fb.TPL_DIR, `${TPL_ID}.html`);

const OWNER = "zz-film-probe";

function buildProbeBundle(owner = OWNER) {
  return fb.buildBundle({
    templateId: TPL_ID, filmSource: FILM_SRC, scenes: DEMO_SCENES, tweaks: DEMO_TWEAKS,
    fonts: ["Karla"], width: 1080, height: 1920, owner,
  });
}

// The storyboard's copy carries a marker string no demo scene contains, so
// "did the studio's film get through" is a substring test rather than a guess.
const MARK = "ZZMARKER";
function compose() {
  const scenes = [];
  let t = 0;
  for (let i = 0; i < 6; i++) {
    scenes.push({
      id: `s${i + 1}`, start: t, duration: 5,
      kind: i === 0 ? "title" : i === 5 ? "cta" : "point",
      headline: `${MARK} headline ${i + 1}`, subtext: `${MARK} copy ${i + 1}.`, voiceover: "vo",
    });
    t += 5;
  }
  return adapter.buildComposition({
    storyboard: { title: `${MARK} film`, durationSec: 30, scenes, brand: "Acme Roasters", url: "acme.example" },
    dims: { width: 1080, height: 1920, fps: 30 },
    template: TPL_ID, assets: [],
  });
}

/** The page the adapter left inside the block — throws if it is not parseable. */
function blockPage(html) {
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(m, "built film carries no __bundler/template block");
  return JSON.parse(m[1]);   // defect 1 threw exactly here
}

/** Run the bundle's real hydration against that page and report the globals. */
function hydrate(html) {
  const page = blockPage(html);
  const win = {};
  const doc = { querySelector: () => ({ textContent: JSON.stringify(page) }) };
  const prevWin = global.window, prevDoc = global.document;
  global.window = win; global.document = doc;
  try { fb.HYDRATE_FROM_BLOCK(); } finally { global.window = prevWin; global.document = prevDoc; }
  return win;
}

try {
  buildProbeBundle();
  const raw = fs.readFileSync(TPL_FILE, "utf8");

  ok("the template block sits inside <body>, after the document's own tag", () => {
    const body = raw.search(/<body[^>]*>/i);
    const block = raw.indexOf('<script type="__bundler/template"');
    assert.ok(body >= 0 && block >= 0, "bundle is missing <body> or the block");
    assert.ok(body < block, `block at ${block} precedes <body> at ${body} — the adapter would stamp inside its JSON`);
  });

  ok("the globals are declared ONCE, in the block and nowhere else", () => {
    for (const g of ["OM_SCENES", "OM_TWEAKS", "OM_PLAYBACK"]) {
      const page = blockPage(raw);
      assert.ok(new RegExp(`window\\.${g}\\s*=`).test(page), `${g} is not declared inside the block`);
      // Outside the block the only mentions may be reads (the hydration, the
      // duration script) — never a second assignment for the film to prefer.
      const outside = raw.replace(/<script type="__bundler\/template"[^>]*>[\s\S]*?<\/script>/i, "");
      const assigns = (outside.match(new RegExp(`window\\.${g}\\s*=\\s*['"\\/]`, "g")) || []).length;
      assert.strictEqual(assigns, 0, `${g} is assigned ${assigns}x outside the block — the adapter never rewrites those`);
    }
  });

  ok("the raw template still hydrates its own demo copy (poster/preview path)", () => {
    const win = hydrate(raw);
    const scenes = JSON.parse(win.OM_SCENES);
    assert.strictEqual(scenes.length, DEMO_SCENES.length);
    assert.strictEqual(scenes[0].title, "DEMO TITLE ONE");
    assert.strictEqual(win.OM_TWEAKS.accent, "#ff0000", "the template's own knobs must survive");
  });

  const built = compose();

  ok("the block still parses after the adapter has stamped its contract", () => {
    blockPage(built.indexHtml);
  });

  ok("the film hydrates the STUDIO's scenes, not the demo ones", () => {
    const win = hydrate(built.indexHtml);
    const scenes = JSON.parse(win.OM_SCENES);
    const text = JSON.stringify(scenes);
    assert.ok(text.includes(MARK), `no storyboard copy reached the film: ${text.slice(0, 160)}`);
    assert.ok(!text.includes("DEMO TITLE ONE"), "the demo copy survived into the film");
  });

  ok("the film hydrates the JOB's brand, not the demo brand", () => {
    const win = hydrate(built.indexHtml);
    assert.strictEqual(win.OM_TWEAKS.brandName, "Acme Roasters");
    assert.strictEqual(win.OM_TWEAKS.url, "acme.example");
    assert.strictEqual(win.OM_TWEAKS.accent, "#ff0000", "the merge must keep the template's own knobs");
  });

  ok("a straight apostrophe in the copy does not truncate the scene list", () => {
    const scenes = [];
    let t = 0;
    for (let i = 0; i < 4; i++) {
      scenes.push({
        id: `s${i + 1}`, start: t, duration: 5, kind: i === 0 ? "title" : "point",
        // "';" is the sequence that ends a naive single-quoted match early.
        headline: `${MARK} it's a roaster's craft`, subtext: `${MARK} don't stop; keep going`, voiceover: "vo",
      });
      t += 5;
    }
    const b = adapter.buildComposition({
      storyboard: { title: `${MARK} apostrophes`, durationSec: 20, scenes },
      dims: { width: 1080, height: 1920, fps: 30 }, template: TPL_ID, assets: [],
    });
    const win = hydrate(b.indexHtml);
    const got = JSON.parse(win.OM_SCENES);
    assert.ok(got.length >= 1, "scene list came back empty");
    assert.ok(JSON.stringify(got).includes(MARK), "copy did not survive the escaping");
  });

  // ---- collision guard ---------------------------------------------------
  // buildBundle writes into the same directory as the 142 hand-built bundles,
  // under a name derived from the pack slug. Authoring a film for "ember-roast"
  // destroyed the shipped 1.2 MB EmberRoast bundle with no error at all.

  ok("the bundle stamps the pack that owns it", () => {
    assert.strictEqual(fb.ownerOf(TPL_FILE), OWNER);
  });

  ok("regenerating the SAME pack's own film is allowed", () => {
    const out = buildProbeBundle();
    assert.strictEqual(out.owner, OWNER);
    assert.strictEqual(fb.ownerOf(TPL_FILE), OWNER);
  });

  ok("a DIFFERENT pack claiming the same template is refused", () => {
    assert.throws(() => buildProbeBundle("some-other-pack"), (e) => {
      assert.strictEqual(e.code, fb.ETPLCOLLISION, `wrong error code: ${e.code}`);
      assert.match(e.message, /generated for "zz-film-probe"/);
      return true;
    });
    assert.strictEqual(fb.ownerOf(TPL_FILE), OWNER, "the refused build still wrote the file");
  });

  ok("a hand-built shipped bundle is never overwritten", () => {
    // A real one: 1.2 MB of __bundler blobs, no provenance stamp.
    const victim = fs.readdirSync(fb.TPL_DIR)
      .filter((f) => f.endsWith(".html"))
      .map((f) => f.replace(/\.html$/, ""))
      .find((id) => id !== TPL_ID && fb.ownerOf(path.join(fb.TPL_DIR, `${id}.html`)) === null);
    assert.ok(victim, "no unstamped template to test against");
    const before = fs.statSync(path.join(fb.TPL_DIR, `${victim}.html`));
    assert.throws(() => fb.buildBundle({
      templateId: victim, filmSource: FILM_SRC, scenes: DEMO_SCENES, tweaks: DEMO_TWEAKS,
      fonts: ["Karla"], width: 1080, height: 1920, owner: "some-new-pack",
    }), (e) => {
      assert.strictEqual(e.code, fb.ETPLCOLLISION, `wrong error code: ${e.code}`);
      assert.match(e.message, /hand-built bundle/);
      return true;
    });
    const after = fs.statSync(path.join(fb.TPL_DIR, `${victim}.html`));
    assert.strictEqual(after.size, before.size, `${victim}.html was modified by a refused build`);
    assert.strictEqual(after.mtimeMs, before.mtimeMs, `${victim}.html was rewritten by a refused build`);
  });

  ok("the name is checked BEFORE the model is asked for a film", () => {
    // checkBundleTarget is what authorFilm calls up front; a collision found
    // here costs nothing, one found after generation costs a frontier-model call.
    assert.throws(
      () => fb.checkBundleTarget({ templateId: TPL_ID, owner: "some-other-pack" }),
      (e) => e.code === fb.ETPLCOLLISION,
    );
    assert.doesNotThrow(() => fb.checkBundleTarget({ templateId: TPL_ID, owner: OWNER }));
    assert.doesNotThrow(() => fb.checkBundleTarget({ templateId: "ZzNotATemplateAtAll", owner: "anyone" }));
  });
} finally {
  try { fs.unlinkSync(TPL_FILE); } catch { /* nothing to clean up */ }
}

console.log(fail ? `\n${fail} failing` : `\ngenerated film bundles carry the studio's film (${pass} checks)`);
process.exit(fail ? 1 : 0);
