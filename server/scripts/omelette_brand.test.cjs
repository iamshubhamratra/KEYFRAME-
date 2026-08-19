// Guard: the film must not INVENT a brand or a domain.
//
// The CTA and the persistent corner chrome both print a brand name and a URL.
// With no website behind the job, those were derived from the film's TITLE:
// the first word became the brand and `<brand>.com` became the URL. A title
// like "From bare soil to your first harvest" therefore closed the film on
// "GET FROM" over "from.com" — a domain that exists and belongs to somebody
// else. Printing an unverified domain in the corner of every frame is an
// assertion about a third party, not a cosmetic default, so the rule is: show a
// URL only when one was supplied or harvested, never a fabricated one.

const assert = require("node:assert");
const adapter = require("../src/services/omelette_adapter");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

function compose(title, extra = {}, assets = []) {
  const scenes = [];
  let t = 0;
  for (let i = 0; i < 10; i++) {
    scenes.push({
      id: `s${i + 1}`, start: t, duration: 6,
      kind: i === 0 ? "title" : i === 9 ? "cta" : "point",
      headline: `Beat ${i + 1} headline`, subtext: `Copy for beat ${i + 1}.`, voiceover: "vo",
    });
    t += 6;
  }
  const built = adapter.buildComposition({
    storyboard: { title, durationSec: 60, scenes, ...extra },
    dims: { width: 1920, height: 1080, fps: 30 },
    framePack: "allotment", assets, captionCues: null,
  });
  const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(built.indexHtml);
  const page = JSON.parse(blk[1]);
  const jsonStr = /("(?:[^"\\]|\\.)*")/;
  const grab = (name) => {
    const re = new RegExp(`window\\.${name}\\s*=\\s*${jsonStr.source}\\s*;`);
    const m = re.exec(page);
    return m ? JSON.parse(JSON.parse(m[1])) : null;
  };
  // OM_TWEAKS ships in TWO forms and the adapter writes back whichever it found:
  // a quoted JSON string, or a raw object literal wrapped in EDITMODE markers.
  // Reading only the quoted form makes every assertion below pass vacuously on
  // an empty object, which is exactly how this test first "passed".
  const tweaks = (() => {
    const q = grab("OM_TWEAKS");
    if (q) return q;
    const m = /window\.OM_TWEAKS\s*=\s*(?:\/\*EDITMODE-BEGIN\*\/)?([\s\S]*?)(?:\/\*EDITMODE-END\*\/)?\s*;/.exec(page);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { /* fall through */ }
    try { return Function(`"use strict";return (${m[1]})`)(); } catch { return null; }
  })();
  assert.ok(tweaks && typeof tweaks === "object", "could not read OM_TWEAKS from the composed page");
  const omScenes = grab("OM_SCENES") || [];
  const cta = omScenes.find((s) => s.cta) || {};
  return { brand: String(tweaks.brandName || ""), url: String(tweaks.url || ""), cta: String(cta.cta || ""), omScenes };
}

ok("a sentence title does not brand the film with its preposition", () => {
  const r = compose("From bare soil to your first harvest");
  assert.notStrictEqual(r.brand.toLowerCase(), "from", 'branded the film "From"');
  assert.strictEqual(r.url, "", `fabricated a URL: "${r.url}"`);
  assert.ok(!/\bFROM\b/.test(r.cta), `CTA still reads "${r.cta}"`);
});

ok("a leading imperative verb is not the brand either", () => {
  const r = compose("Turn raw earth into a working allotment");
  assert.notStrictEqual(r.brand.toLowerCase(), "turn", 'branded the film "Turn"');
  assert.strictEqual(r.url, "", `fabricated a URL: "${r.url}"`);
});

ok("no .com is ever invented from the brand", () => {
  for (const t of [
    "From bare soil to your first harvest",
    "Turn raw earth into a working allotment",
    "How to keep bees through winter",
    "The complete guide to sowing",
  ]) {
    const r = compose(t);
    assert.strictEqual(r.url, "", `"${t}" produced url "${r.url}"`);
  }
});

ok("a real brand-led title still brands the film", () => {
  const r = compose("Flipkart makes festive delivery effortless");
  assert.strictEqual(r.brand, "Flipkart", `got "${r.brand}"`);
});

ok("an explicitly supplied url is kept", () => {
  const r = compose("Acme ships faster than ever", { url: "acme.io" });
  assert.strictEqual(r.url, "acme.io", `got "${r.url}"`);
});

ok("a harvested owner domain still wins over the title", () => {
  const r = compose("From bare soil to your first harvest", {}, [
    { source: "website", sourceUrl: "https://www.greenthumb.co/plots", path: "x.png", type: "image" },
  ]);
  assert.strictEqual(r.url, "greenthumb.co", `got "${r.url}"`);
  assert.strictEqual(r.brand, "Greenthumb", `got "${r.brand}"`);
});

ok("the CTA is a real call to action when there is no brand", () => {
  const r = compose("From bare soil to your first harvest");
  assert.ok(r.cta.length >= 3, "CTA is empty");
  assert.ok(/GET STARTED|LEARN|START/i.test(r.cta) || !/GET\s*$/.test(r.cta), `dangling CTA: "${r.cta}"`);
});

console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nbrand/url honesty holds (${pass} checks)`);
process.exit(fail ? 1 : 0);
