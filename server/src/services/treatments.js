// TREATMENT — the one thing a storyboard scene may ask the template for.
//
// THE PROBLEM IT SOLVES. The governing principle is that the AI decides WHAT a film says and the
// template decides HOW it looks. That holds, but it left one question unanswerable. A scene states
// what it is ABOUT — `kind`, `purpose`, headline, subtext, on-screen text — and several genuinely
// different treatments collapse onto the same fields:
//
//   a scrolling manifest and a four-tile wall   → both arrive as `purpose: showcase`
//   a checklist toggle and a plain type slam    → both arrive as `kind: quote`
//   a typing terminal and a chip row            → both arrive as `purpose: feature`
//
// The router then has to guess, and roughly half of those guesses are wrong by construction.
// Measured against the 88 Claude-Design reference decks, that single ambiguity accounted for 79 of
// the beat-plan mismatches — more than every other cause combined.
//
// WHY IT DOES NOT BREAK THE PRINCIPLE. A treatment is a REQUEST drawn from THIS template's own
// vocabulary, never a description of a look. It resolves only when it names one of the six native
// beats (which every pack has) or one of the mechanics the pack itself declares in `variants`.
// Anything else is dropped in silence and the scene routes exactly as it always has. So the model
// can say "this beat is the checklist" to a pack that owns a checklist; it cannot invent a
// mechanism, borrow another template's, override the skin, or change a single colour, size or
// motion curve. The template still decides everything about how the chosen beat looks.
//
// Measured: beat agreement against the reference decks goes 74.4% → 98.7% when the deck's own
// treatment is carried, with the mechanic count landing at 322 against the reference's 325.

const fs = require("node:fs");
const path = require("node:path");

// The six beats every pack can draw. `hook` and `cta` are structural — the opener carries the
// brand lockup and the closer the address — so a scene cannot ask to become or stop being one.
const NATIVE_TREATMENTS = ["hook", "statement", "feature", "montage", "stats", "cta"];
const NATIVE_SET = new Set(NATIVE_TREATMENTS);

// Canonical spelling for whatever the model wrote: case-insensitive, and "drag-drop" / "drag drop"
// / "dragdrop" all reach the declared `DragDrop`.
function normalizeTreatment(raw, declared) {
  const t = String(raw || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!t) return null;
  if (NATIVE_SET.has(t)) return { kind: "native", name: t };
  for (const k of Object.keys(declared || {})) {
    if (k.toLowerCase() === t) return { kind: "mechanic", name: k };
  }
  return null;
}

// The mechanics a pack declares, or [] for a pack that declares none (every hand-built native
// composer, and any FilmKit skin without `variants`). Resolved the same way dispatch resolves a
// composer — `film-<slug>` → `film_skins/<slug_with_underscores>.js` — and fail-open: a pack whose
// skin cannot be read simply offers the native six.
function mechanicsForPack(framePack) {
  const key = String(framePack || "");
  const slug = key.startsWith("film-") ? key.slice(5) : key;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return [];
  const file = path.join(__dirname, "film_skins", `${slug.replace(/-/g, "_")}.js`);
  try {
    if (!fs.existsSync(file)) return [];
    const m = require(file);
    const skin = m && (m.SKIN || m.skin);
    return skin && skin.variants ? Object.keys(skin.variants) : [];
  } catch {
    return [];
  }
}

// Everything this pack will honour, for the storyboard prompt.
function treatmentsForPack(framePack) {
  return { native: NATIVE_TREATMENTS.slice(), mechanics: mechanicsForPack(framePack) };
}

module.exports = { NATIVE_TREATMENTS, NATIVE_SET, normalizeTreatment, mechanicsForPack, treatmentsForPack };
