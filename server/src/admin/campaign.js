// CAMPAIGN PLANNING — how a batch of templates is made to differ.
//
// The first auto batch produced five templates whose motion four-tuples were all
// distinct, and which still looked like one another. Measured: `thrust` was the
// cut on 3 of 5, `telemetry` the canvas on 3 of 5, `countin` and `reticle` twice
// each. Uniqueness of the TUPLE is not uniqueness of the LOOK — a viewer reads
// the cut and the background, not the combination.
//
// And left to itself a model converges. Asked fifteen times for "an entrance
// that suits a launch" it returns the same two or three, which is exactly how
// the shipped library ended up using 10 of 19 entrances and 10 of 16 emphases
// while eleven entrances (flap, brush, pendulum, stitch, ripple, bloom, drift,
// typewriter, line-wipe, mask-reveal, blur-up) had never been used at all.
//
// So the tokens are ALLOCATED here, not requested from the model:
//   * every dimension is walked rarest-in-the-library first, so a campaign
//     reaches for the vocabulary the existing 203 packs never touched;
//   * no dimension repeats inside one campaign until its pool is exhausted;
//   * the resulting four-tuple is checked against every signature already live.
// The model then designs the palette, the fonts and the prose to SUIT the motion
// it has been handed — which is the part it is genuinely good at.

const { listManifests, getManifest } = require("../services/frame_manifest");
const { TEXT_ENTERS, EMPHASIS_STYLES, CUT_STYLES, CANVAS_MODES } = require("../services/scene_kit");

const FAMILY_IDS = [
  "retro-terminal", "healthcare-soft", "data-viz-mono",
  "fintech-dark", "saas-gradient", "liquid-glass",
];

// Suggested subjects for the admin UI. Free text always wins; these are chips.
const THEMES = [
  "mars exploration", "dogs", "cats playing", "jungle wildlife", "street food",
  "fintech", "developer tools", "personal finance", "fitness", "travel",
  "music streaming", "gaming", "education", "real estate", "coffee roasting",
  "climate science", "fashion retail", "healthcare", "logistics", "photography",
];

// A campaign of N templates on ONE subject still has to be N DIFFERENT films, so
// each gets its own angle: a different job the template is for. This is what
// stops fifteen "mars" templates all being a hero shot with a headline.
const ANGLES = [
  { key: "launch", label: "the announcement", brief: "a launch film that opens on one bold claim and builds to a call to action" },
  { key: "explain", label: "how it works", brief: "an explainer that walks through three steps in order, diagram-led" },
  { key: "proof", label: "the numbers", brief: "a data film built around hard figures and measured comparisons" },
  { key: "story", label: "a story", brief: "a narrative piece that follows one person or moment from problem to result" },
  { key: "tour", label: "the product tour", brief: "a guided tour of real screens and features, caption-led" },
  { key: "manifesto", label: "the manifesto", brief: "a short declarative piece — big type, strong statements, little decoration" },
  { key: "compare", label: "before and after", brief: "a contrast film setting the old way against the new one" },
  { key: "field", label: "from the field", brief: "a documentary-feeling piece built around real photography and place" },
  { key: "highlight", label: "the highlight reel", brief: "a fast montage of many moments cut on the beat" },
  { key: "teach", label: "the lesson", brief: "a teaching piece that defines terms and builds understanding step by step" },
  { key: "invite", label: "the invitation", brief: "a warm, human piece that ends on joining or signing up" },
  { key: "spec", label: "the spec sheet", brief: "a precise, technical piece — tables, labels, exact values" },
  { key: "origin", label: "the origin", brief: "how it started and why it exists, quieter and more reflective" },
  { key: "reveal", label: "the reveal", brief: "hold something back, then reveal it late with a hard cut" },
  { key: "ritual", label: "the daily ritual", brief: "a rhythm piece built on repetition — the same beat returning changed" },
];

// ---- library usage ----------------------------------------------------------
/** How often each token appears across the installed packs. Fails open. */
function libraryUsage() {
  const counts = { enter: new Map(), emphasis: new Map(), cut: new Map(), canvas: new Map() };
  const signatures = new Set();
  let names = [];
  try { names = listManifests() || []; } catch { return { counts, signatures }; }
  for (const name of names) {
    let m;
    try { m = getManifest(name); } catch { continue; }
    if (!m) continue;
    const tf = m.textfx || {}, mo = m.motion || {}, fx = m.fx || {};
    const bump = (map, v) => { if (v) map.set(v, (map.get(v) || 0) + 1); };
    bump(counts.enter, tf.enter);
    bump(counts.emphasis, tf.emphasis);
    bump(counts.cut, mo.cut);
    bump(counts.canvas, fx.canvas);
    signatures.add([tf.enter, tf.emphasis, mo.cut, fx.canvas].join("|"));
  }
  signatures.delete("|||");
  return { counts, signatures };
}

// Vocabulary ordered rarest-first, so an unused token is always preferred to a
// token the library already leans on. Ties keep the vocabulary's own order,
// which keeps planning deterministic — the same library plans the same campaign.
function rarestFirst(vocab, counts) {
  return [...vocab].sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0));
}

/**
 * Assign `count` motion signatures that differ from each other AND from the
 * library. Each dimension advances independently, so with pools of 19/16/18/20
 * a campaign of up to 15 never repeats a single token.
 */
function allocateMotion(count, { counts, signatures } = {}) {
  const c = counts || { enter: new Map(), emphasis: new Map(), cut: new Map(), canvas: new Map() };
  const pools = {
    enter: rarestFirst(TEXT_ENTERS, c.enter),
    emphasis: rarestFirst(EMPHASIS_STYLES, c.emphasis),
    cut: rarestFirst(CUT_STYLES, c.cut),
    canvas: rarestFirst(CANVAS_MODES, c.canvas),
  };
  const live = signatures || new Set();
  const out = [];
  const taken = new Set();
  let k = { enter: 0, emphasis: 0, cut: 0, canvas: 0 };
  for (let i = 0; i < count; i++) {
    let pick = null;
    // Up to a full lap of the smallest pool: advance whichever dimension is
    // needed until the tuple is both new to this campaign and new to the library.
    for (let tries = 0; tries < 40 && !pick; tries++) {
      const cand = {
        enter: pools.enter[k.enter % pools.enter.length],
        emphasis: pools.emphasis[k.emphasis % pools.emphasis.length],
        cut: pools.cut[k.cut % pools.cut.length],
        canvas: pools.canvas[k.canvas % pools.canvas.length],
      };
      const sig = [cand.enter, cand.emphasis, cand.cut, cand.canvas].join("|");
      if (!taken.has(sig) && !live.has(sig)) { pick = cand; taken.add(sig); }
      else k.canvas++; // nudge one dimension and re-test
    }
    out.push(pick || {
      enter: pools.enter[i % pools.enter.length],
      emphasis: pools.emphasis[i % pools.emphasis.length],
      cut: pools.cut[i % pools.cut.length],
      canvas: pools.canvas[i % pools.canvas.length],
    });
    // Advance EVERY dimension so no two templates in a campaign share a token.
    k = { enter: k.enter + 1, emphasis: k.emphasis + 1, cut: k.cut + 1, canvas: k.canvas + 1 };
  }
  return out;
}

// ---- slugs ------------------------------------------------------------------
const slugify = (s) => String(s || "")
  .toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
  .trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

function freeSlug(base, taken) {
  const b = slugify(base).slice(0, 40) || "template";
  if (!taken.has(b)) return b;
  for (let n = 2; n <= 99; n++) {
    const c = `${b}-${n}`;
    if (!taken.has(c)) return c;
  }
  return null;
}

const titleCase = (s) => String(s || "").split(/[\s-]+/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").slice(0, 40);

/**
 * Plan a campaign: `count` templates on ONE subject, each a different angle,
 * a different renderer family and a reserved, library-rare motion signature.
 *
 * @param {object} opts
 * @param {number} opts.count       1..15
 * @param {string} opts.requirement what the admin asked for ("mars exploration")
 * @param {Set<string>} opts.taken  slugs already in use (templates + packs)
 * @returns {Array<object>} create-payloads carrying `pinMotion`
 */
// "vertical" / "horizontal" force every template in the run; "mixed" alternates,
// which is the old behaviour and stays the default. A campaign is usually made
// for ONE place — a reel wall or a website hero — so forcing one aspect is the
// common case, not the exception.
const ORIENTATION_MODES = new Set(["vertical", "horizontal", "mixed"]);

function orientationFor(mode, i) {
  if (mode === "vertical" || mode === "horizontal") return mode;
  return i % 2 === 0 ? "vertical" : "horizontal";
}

function planCampaign({ count, requirement, taken, orientation } = {}) {
  const n = Math.max(1, Math.min(15, Math.floor(Number(count) || 0)));
  const subject = String(requirement || "").trim().slice(0, 200);
  const mode = ORIENTATION_MODES.has(String(orientation || "").toLowerCase())
    ? String(orientation).toLowerCase() : "mixed";
  const used = new Set(taken || []);
  const { counts, signatures } = libraryUsage();
  const motion = allocateMotion(n, { counts, signatures });

  const plan = [];
  for (let i = 0; i < n; i++) {
    const angle = ANGLES[i % ANGLES.length];
    const family = FAMILY_IDS[i % FAMILY_IDS.length];
    const m = motion[i];
    const base = subject ? `${slugify(subject).slice(0, 22)}-${angle.key}` : `${family}-${angle.key}`;
    const slug = freeSlug(base, used);
    if (!slug) continue;
    used.add(slug);

    const prompt = [
      subject ? `Subject: ${subject}.` : "Subject: a general-purpose brand film.",
      `This template is for ${angle.brief}.`,
      `Design the palette, the type and the mood so they belong to that subject and that job —`,
      `a "${subject || "brand"}" film in the "${angle.label}" register, not a generic one.`,
      `The motion has already been chosen for you and is fixed: words arrive with "${m.enter}",`,
      `the emphasized word is treated with "${m.emphasis}", scenes hand over with a "${m.cut}" cut,`,
      `and the background layer is "${m.canvas}". Choose colours and fonts that make THAT motion look deliberate.`,
    ].join(" ");

    plan.push({
      name: titleCase(slug.replace(/-/g, " ")),
      slug,
      orientation: orientationFor(mode, i),
      category: subject ? slugify(subject).slice(0, 40) : angle.key,
      description: `Campaign · ${subject || "general"} · ${angle.label}`,
      prompt,
      style: `${angle.label} — ${m.enter}/${m.emphasis}/${m.cut}/${m.canvas}`,
      family,
      // Enforced by the generator, not merely suggested.
      pinMotion: m,
      angle: angle.key,
    });
  }
  return plan;
}

module.exports = {
  planCampaign, allocateMotion, libraryUsage,
  THEMES, ANGLES, FAMILY_IDS, ORIENTATION_MODES,
};
