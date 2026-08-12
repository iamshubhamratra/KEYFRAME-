// TWEEN-UNIT GUARD — a length tween value must carry its unit.
//
// THE BUG THIS EXISTS FOR. deep_composer.js:301 animated the Explore beat's five suspended panels
// with `y:"+=${r(U(20))}"` — every other tween in that file writes `cqw`, this one did not. U(20)
// is 1.04, so GSAP received the string "+=1.04" and animated 1.04 PIXELS instead of 1.04cqw
// (~20px on a 1920 stage): the amplitude arrived 19x too small and the only motion in the beat
// after the tiles land was, to the eye, absent. The comment above the line correctly derived
// "period 10.47s, half-cycle 5.24s" and the arithmetic was right. Three characters were missing.
//
// WHY NO EXISTING GUARD SEES IT. `test:motion-safety` checks WHICH properties are animated (a
// transform, not `left`/`top`), not what the values mean. `test:dead-tweens` checks that a tween's
// target EXISTS. `test:ghosts` checks that authored copy is revealed. The element is present, the
// property is legal, the copy is visible, and the tween runs — it simply runs at 1/19th of its
// authored amplitude. Every check passes and the frame is wrong.
//
// WHY IT SCANS EMITTED HTML AND NOT SOURCE. These values are template-interpolated
// (`y:"+=${r(U(20))}cqw"`), so a grep over the composers finds nothing: the unit is a literal
// fragment of a template string and the number never appears in source at all. The composed
// document is the only place the finished value exists.
//
// SCOPE, deliberately narrow. Only QUOTED bare numbers on length properties are flagged. An
// unquoted `y:44` is how a composer legitimately expresses SVG user-space units, and `scale`,
// `rotation`, `opacity`, `scaleX` and `strokeDashoffset` are unitless by definition. A quoted
// numeric string with no unit, however, is always a mistake: if px were intended the number would
// not be in quotes. That keeps the guard at zero false positives on a library of 125 packs.

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");
const { composerModuleFor } = require("../src/services/pipeline");

// Properties GSAP resolves as LENGTHS. A bare quoted number on any of these is unit-ambiguous and
// GSAP falls back to px, which is never what a cqw-authored composition means.
const LENGTH_PROPS = [
  "x", "y", "top", "left", "right", "bottom", "width", "height",
  "translateX", "translateY", "xPercent2", "marginTop", "marginLeft",
];
const BARE_QUOTED = new RegExp(
  `["'\`]?\\b(${LENGTH_PROPS.join("|")})\\b["'\`]?\\s*:\\s*(["'])([+-]?=?\\s*[0-9][0-9.]*)\\2`, "g"
);

// KNOWN DEBT — real defects of exactly this class, in packs OUTSIDE the 20 Claude Design handoffs.
// Both are cqw-authored compositions (bauhaus_composer.js: 184 cqw values vs 4 px;
// bloom_composer.js: 124 vs 30) whose ambient drift is expressed in bare pixels, so it runs at
// roughly 1/19th of its authored amplitude — the same failure as deep_composer.js:301.
//
// They are listed rather than fixed because the fidelity programme that found them is scoped to the
// handoff library, and these two packs are not part of it; changing them would be an unrelated edit
// made on the way past. They are NOT silenced: the count prints on every run, and the assertion
// below is EXACT — a new violation fails the build, and so does a fixed one, because a stale
// exemption is how debt becomes invisible. The list can only ever shrink.
const KNOWN_DEBT = {
  // bauhaus-riot cleared 11 Aug 2026 in its portrait wave — its ring drift now carries cqw.
  "bloom-fable": 14,
};

const COUNTS = [0, 2, 4, 8];
// TEN SCENES, NOT SIX — the fixture has to reach every role or the guard is blind where it matters.
//
// The first version used six, and reported the whole library clean except two packs. It was wrong:
// orbit_composer.js:365 and :405 carry the identical missing-unit defect on `.${id}-con` and
// `.${id}-t${i}`, both plain <div>s, and the guard never saw them because buildFilm deals middle
// roles from a ROTATING cursor (om_port_kit.js:259-261) — six scenes select `first`, `last` and only
// four middles, so any pack with more roles than that has beats the fixture never builds.
//
// This is the same calibration failure test-shot-containment already recorded against itself
// ("it took eight scenes and six pictures to make it bite"). A guard is only as wide as its fixture,
// and a green run over unexercised code is not evidence of anything. Ten scenes plus an eight-asset
// count covers every SPEC.middle in the library with room to spare.
const PURPOSES = ["hook", "feature", "proof", "showcase", "stat", "quote", "gallery", "mobile", "context", "cta"];
// EXACTLY ONE BEAT CARRIES FIGURES.
//
// The obvious fixture — rich copy with figures on every scene — silently defeats itself. Packs
// route a figure-bearing beat to their stats role and make every OTHER role decline it
// (`if (isStats) return false`, e.g. orbit_composer.js:500-505, and the same shape in drive, flight
// and deep). With numbers everywhere, all ten beats resolved to `telemetry`/`statement` and the
// picture-bearing layouts were never built at all — so widening the fixture from six scenes to ten
// changed nothing, and the guard stayed green over code it had still never run.
//
// A fixture is not "more is better". It has to satisfy the SELECTION rules, not just supply data.
const SB = {
  title: "Northwind", durationSec: 40,
  scenes: PURPOSES.map((p, i) => ({
    id: `s${i + 1}`, start: i * 4, duration: 4, kind: p, purpose: p,
    headline: "Ship faster with Northwind",
    subtext: p === "stat"
      ? "2.4M trips a day across 120 cities, rated 4.9 stars."
      : "One place for everything your team ships, from the first commit to the release note.",
    onScreenText: p === "stat" ? ["TRIPS / DAY", "CITIES", "RATING"] : ["Fast", "Simple", "Shared"],
    emphasis: p === "stat" ? "BY THE NUMBERS" : "", voiceover: "", visualDirection: p, beats: [],
  })),
};
const ASSETS = Array.from({ length: 8 }, (_, i) => ({
  path: `assets/images/a${i}.png`, width: 1600, height: 900, ratio: 16 / 9, source: "website",
}));

function scriptsOf(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) out.push(m[1]);
  return out.join("\n");
}

// SVG USER SPACE IS THE ONE PLACE A BARE NUMBER IS CORRECT.
//
// GSAP translating an element INSIDE an <svg> moves it in that svg's viewBox units, so orbit's
// `tl.to(".orbit-rocket",{y:"-=4"})` really is the 4px idle bob its comment documents — the rocket
// is a <g> in a 1920-wide viewBox. Flagging it would be a false positive, and a guard that cries
// wolf on the library's own reference implementation gets switched off.
//
// The distinction is DESCENDANT, not "appears near an svg". A token on the <svg> ROOT tag is styled
// and transformed as an ordinary CSS box (bloom-fable's `.bl-amb-pt` is an <svg> element positioned
// in cqw — GSAP applies a CSS transform to it, so its values ARE pixels). So only tokens found in
// the svg's INNER markup are exempt; tokens on the opening tag are not.
function svgSpaceTokens(html) {
  const tokens = new Set();
  for (const m of String(html).matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gi)) {
    const inner = m[1];                                   // excludes the <svg ...> opening tag
    for (const a of inner.matchAll(/\b(?:class|id)\s*=\s*"([^"]*)"/g)) {
      for (const t of a[1].split(/\s+/)) if (t) tokens.add(t);
    }
  }
  return tokens;
}

// The literal selector a gsap call targets, so it can be tested against the svg-space token set.
function selectorOf(js, index) {
  // Walk back to the nearest gsap/tl call and read its first quoted argument.
  const head = js.slice(Math.max(0, index - 400), index);
  const m = [...head.matchAll(/(?:tl|gsap)\s*\.\s*(?:to|from|fromTo|set)\(\s*(["'])([^"']+)\1/g)].pop();
  return m ? m[2] : "";
}

function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  let packs = frameRegistry.listPacks().filter((p) => composerModuleFor((fm.getManifest(p) || {}).renderer));
  if (only.length) packs = packs.filter((p) => only.includes(p));

  console.log(`\nTWEEN-UNIT GUARD — ${packs.length} pack(s) x ${COUNTS.length} asset count(s)\n`);

  let failed = 0, checked = 0, known = 0;
  for (const pack of packs) {
    const comp = composerModuleFor((fm.getManifest(pack) || {}).renderer);
    const manifest = fm.getManifest(pack) || {};
    const portrait = String(manifest.orientation || "").toLowerCase() === "portrait";
    const dims = portrait ? { width: 1080, height: 1920, fps: 30 } : { width: 1920, height: 1080, fps: 30 };

    const bad = new Map();   // "prop:value" -> times seen
    for (const n of COUNTS) {
      let built;
      try {
        built = comp.buildComposition({
          storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: pack,
          assets: ASSETS.slice(0, n), captionCues: [], brandSkin: null, seedKey: `units-${pack}-${n}`,
        });
      } catch (e) {
        console.log(`  ✗ ${pack}: buildComposition threw at ${n} asset(s) — ${String(e.message).slice(0, 120)}`);
        failed++;
        continue;
      }
      const js = scriptsOf(built && built.indexHtml);
      const svgTokens = svgSpaceTokens(built && built.indexHtml);
      for (const m of js.matchAll(BARE_QUOTED)) {
        const v = m[3].replace(/\s+/g, "");
        // "+=0" / "0" are unit-agnostic — zero is zero in every unit.
        if (/^[+-]?=?0(\.0*)?$/.test(v)) continue;
        const sel = selectorOf(js, m.index);
        const tok = sel.replace(/^[.#]/, "").split(/[\s>,:]/)[0];
        if (tok && svgTokens.has(tok)) continue;     // SVG user space — a bare number is correct
        const key = `${m[1]}:"${v}"${sel ? ` on ${sel}` : ""}`;
        bad.set(key, (bad.get(key) || 0) + 1);
      }
      checked++;
    }

    const debt = KNOWN_DEBT[pack];
    if (bad.size && debt === bad.size) {
      known++;
      console.log(`  ⚠ ${pack}: ${bad.size} KNOWN unit-less length tween value(s) — ${[...bad.keys()].join("  ")}`);
      console.log(`      Outstanding debt, outside the handoff library. Fix and remove from KNOWN_DEBT.`);
    } else if (bad.size) {
      failed++;
      const list = [...bad.keys()].slice(0, 6).join("  ");
      console.log(`  ✗ ${pack}: ${bad.size} unit-less length tween value(s) — ${list}${bad.size > 6 ? " …" : ""}`);
      if (debt !== undefined) console.log(`      (KNOWN_DEBT expects ${debt}; the list is stale — update it.)`);
      console.log(`      GSAP reads these as PIXELS. On a cqw-authored stage that is roughly a 19x`);
      console.log(`      amplitude error — the motion renders as if it were absent.`);
    } else if (debt !== undefined) {
      // A fixed pack must be removed from the list, or the next regression hides behind it.
      failed++;
      console.log(`  ✗ ${pack}: clean, but still listed in KNOWN_DEBT — remove it.`);
    } else {
      console.log(`  ✓ ${pack}: every length tween carries its unit`);
    }
  }

  console.log(`\n${packs.length - failed - known} passed, ${failed} failed, ${known} known-debt  (${checked} composition(s) inspected)`);
  if (failed) process.exit(1);
}

if (require.main === module) main();
