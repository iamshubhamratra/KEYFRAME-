#!/usr/bin/env node
// GUARD FOR `scene.treatment` — the one field a storyboard scene may use to ask a template for a
// beat shape. It exists to close an ambiguity the storyboard cannot otherwise express (a scrolling
// manifest and a four-tile wall are both `purpose: showcase`), and its whole safety argument is
// that it can ONLY name this template's own vocabulary. These assertions are that argument:
//
//   1. omitted        → routes exactly as before (the field is additive, goldens do not move)
//   2. declared       → honoured, even when the archetype would never have inferred it
//   3. undeclared     → ignored in silence; no pack can be talked into another's mechanism
//   4. native beat    → honoured, and protected from the mechanic alternation
//   5. hook / cta     → never overridable; the opener carries the lockup and the closer the address
//   6. nonsense       → ignored, never throws
//   7. spelling       → "drag-drop" / "DRAG DROP" / "dragdrop" all reach the declared name

const path = require("node:path");
const { treatmentsForPack, normalizeTreatment } = require("../src/services/treatments");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${msg}`); } };

const PACK = "abyss-dive";                       // declares Ring, Scroll, Typing, Notify
const skin = require(path.join(__dirname, "..", "src", "services", "film_skins", "abyss_dive.js"));

function beatsFor(treatments, { tiles = false } = {}) {
  const scenes = treatments.map((t, i) => ({
    id: `s${i + 1}`, start: i * 3, duration: 3,
    kind: i === 0 ? "hook" : i === treatments.length - 1 ? "cta" : "quote",
    purpose: i === 0 ? "hook" : i === treatments.length - 1 ? "cta" : "problem",
    headline: `Line ${i + 1} of the film`,
    subtext: "A supporting line that says a little more.",
    ...(tiles ? { onScreenText: ["The drum", "Bag wall", "Brew bar", "The dog"] } : {}),
    ...(t ? { treatment: t } : {}),
  }));
  const { indexHtml } = skin.buildComposition({
    storyboard: { title: "t", durationSec: scenes.length * 3, orientation: "portrait", scenes },
    dims: { width: 1080, height: 1920, fps: 30 },
    framePack: PACK, captionCues: [], assets: [], seedKey: "treatments",
  });
  return [...indexHtml.matchAll(/data-fk-beat="([^"]*)"/g)].map((m) => m[1]);
}

console.log("TREATMENT GUARD — scene.treatment is a request from the pack's own vocabulary\n");

// ---- vocabulary -----------------------------------------------------------------
const vocab = treatmentsForPack(`film-${PACK}`);
ok(vocab.mechanics.length > 0, `${PACK} should expose its declared mechanics`);
ok(vocab.native.includes("montage") && vocab.native.includes("statement"), "native beats are offered");
ok(treatmentsForPack("kinetic-universe").mechanics.length === 0, "a pack with no skin offers no mechanics");

// ---- normalizer -----------------------------------------------------------------
const declared = skin.SKIN.variants;
ok(normalizeTreatment("Scroll", declared)?.name === "Scroll", "declared mechanic resolves");
ok(normalizeTreatment("scroll", declared)?.name === "Scroll", "case-insensitive");
ok(normalizeTreatment("  SCROLL  ", declared)?.name === "Scroll", "whitespace tolerated");
ok(normalizeTreatment("montage", declared)?.kind === "native", "native beat resolves");
ok(normalizeTreatment("DragDrop", declared) === null, "a mechanic this pack never declared is refused");
ok(normalizeTreatment("drag-drop", { DragDrop: "card" })?.name === "DragDrop", "hyphenated spelling resolves");
ok(normalizeTreatment("", declared) === null, "empty is nothing");
ok(normalizeTreatment(null, declared) === null, "null is nothing");
ok(normalizeTreatment("banana", declared) === null, "nonsense is refused");
ok(normalizeTreatment({ a: 1 }, declared) === null, "a non-string is refused, not thrown on");

// ---- routing --------------------------------------------------------------------
const n = 6;
const none = beatsFor(new Array(n).fill(null));
ok(none.length === n, "every scene renders with no treatment set");
ok(none[0] === "hook" && none[n - 1] === "cta", "opener and closer are structural");

// 2. declared mechanic honoured on a beat the archetype would not have inferred it for.
// `kind: quote` infers `statement`, whose mechanic row does not contain Typing.
const typing = beatsFor([null, "Typing", null, null, null, null]);
ok(typing[1] === "Typing", `a declared mechanic is honoured across archetype rows (got ${typing[1]})`);

// 3. undeclared mechanic ignored — abyss-dive never declares DragDrop.
const undeclared = beatsFor([null, "DragDrop", null, null, null, null]);
ok(undeclared[1] !== "DragDrop", "an undeclared mechanic never renders");
ok(undeclared[1] === none[1], "an undeclared ask changes nothing at all");

// 4. native beat honoured and protected from the alternation — when it can actually be drawn.
const montage = beatsFor([null, "montage", "montage", "montage", "montage", null], { tiles: true });
ok(montage.slice(1, 5).every((b) => b === "montage"), `a native ask survives the alternation (got ${montage.slice(1, 5).join(",")})`);
const bareWall = beatsFor([null, "montage", null, null, null, null]);
// NO EMPTY CONTAINER OUTRANKS THE REQUEST. A wall asked for on a scene with neither a picture nor
// an authored tile list is still an empty wall, so the beat downgrades exactly as it would have.
ok(bareWall[1] === "feature", `an unfurnishable wall still downgrades (got ${bareWall[1]})`);

// 5. hook / cta not overridable.
const structural = beatsFor(["Scroll", null, null, null, null, "Scroll"]);
ok(structural[0] === "hook", "the opener cannot be asked away");
ok(structural[n - 1] === "cta", "the closer cannot be asked away");

// 6. nonsense is inert.
const junk = beatsFor([null, "banana", null, "", null, null]);
ok(junk[1] === none[1] && junk[3] === none[3], "nonsense and empty leave routing untouched");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
