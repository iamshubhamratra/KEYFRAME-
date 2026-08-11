// ASSET REQUIREMENT PLANNER — what this film NEEDS, box by box, before anything is fetched.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// THE GAP IT CLOSES
//
// Three stages each held one third of the answer, and nothing joined them up:
//
//   the SCRIPT knows what the film is SAYING          — scene.assetNeeds: {type, query, role}
//   the TEMPLATE knows what boxes exist               — template_media.resolveMediaPlan():
//                                                       placeholders with id, scene, role,
//                                                       width/height, priority, objectFit, kind
//   the COLLECTOR knows how many assets to fetch      — asset_budget + collectionTargetFor
//
// The media plan was resolved (graph.js:457) and then used for exactly two things: sizing the
// collection budget, and picking a target aspect ratio for the fetch ranker. Its
// `placeholders` — the only structure in the codebase that knows a box's PRIORITY and SHAPE —
// reached the reuse optimizer and the pre-render gate, and never reached the thing that
// decides WHAT TO GO AND FIND. So the collector chased a per-scene count while the template
// sat on a per-BOX contract, and the two could not disagree because they never spoke.
//
// The visible consequences are the reported ones:
//   • a scene's most prominent box and its background texture were the same "want" — one
//     image, one query, no priority — so a weak asset could land in the hero.
//   • a want carried no aspect and no minimum size, so a 400px-wide photo could be fetched
//     for a full-bleed 1080-wide plate.
//   • a box with no script need got a query derived by stripping stopwords out of a prose
//     `visualDirection` (graph.js deriveQuery) — which is how "scalable growth" became a
//     search for trading charts.
//   • nothing could answer "is this film going to have an empty hero?" until preflight, by
//     which point the fetch budget was already spent.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// WHAT A REQUIREMENT IS
//
// One per BOX the film will actually draw, plus one per script need that no box claimed.
// It carries everything the four downstream stages need and nothing they must re-derive:
//
//   retrieval  — query, assetType, preferredAspect, minWidth/minHeight, kindPref
//   ranking    — priority, weight, areaShare
//   placement  — placeholderId, sceneId, objectFit
//   validation — required, visualDescription
//
// PURE + FAIL-OPEN (THE HOUSE LAW): no I/O, no LLM, no randomness. A missing media plan
// degrades to script-only requirements, which is exactly today's behaviour.

const { roleOf } = require("./scene_role");
const tmedia = require("./template_media");

const PRIORITY_WEIGHT = tmedia.PRIORITY_WEIGHT;

// The product-facing asset vocabulary, shared with the script schema and the template
// contract's `kind`. Two spellings exist for historical reasons and are bridged here rather
// than in five call sites.
//   template_media KINDS : screenshots | productImages | logos | illustrations | icons
//   script purpose       : screenshot | productImage | person | object | place | icon | background
const KIND_TO_PURPOSE = {
  screenshots: "screenshot",
  productImages: "productImage",
  logos: "logo",
  illustrations: "object",
  icons: "icon",
};
const PURPOSE_TO_KIND = {
  screenshot: "screenshots",
  productImage: "productImages",
  logo: "logos",
  person: "productImages",
  object: "productImages",
  place: "productImages",
  background: "productImages",
  icon: "icons",
};

// The retrieval preference a purpose implies. Mirrors graph.assetSearchAgent.kindPrefFor and
// template_media.KIND_PREF so the three cannot drift.
//   undefined => no restriction (the general photo pool)
const PURPOSE_KINDPREF = {
  screenshot: undefined,   // captured or uploaded, never stock-searched
  logo: undefined,         // harvested or uploaded
  productImage: "photo",
  person: "photo",
  place: "photo",
  object: "photo",
  background: "photo",
  icon: "vector",
};

// Purposes that are satisfied by material the pipeline OWNS (captures, uploads, harvests)
// rather than by a stock search. A requirement of this kind must never spend a fetch.
const OWNED_PURPOSES = new Set(["screenshot", "logo"]);

// Scene role -> the purpose that beat most wants, when nothing more specific is known.
// Deliberately the same table `template_media.DERIVED_ROLE` encodes, restated in the script
// vocabulary: a feature beat proves itself with the product's own UI, a proof beat with a
// person, a context beat with a place or an object.
const ROLE_PURPOSE = {
  hook: "productImage",
  context: "place",
  feature: "screenshot",
  how: "screenshot",
  proof: "person",
  quote: "person",
  cta: "logo",
};

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Words that carry no visual meaning. Superset of the planner's old inline list — it kept
// leaking film-language ("scene", "camera", "frame") into stock queries.
const STOP = new Set([
  "the", "a", "an", "and", "or", "with", "of", "in", "on", "over", "into", "across", "as",
  "to", "that", "then", "while", "for", "is", "are", "we", "our", "your", "you", "it", "its",
  "see", "sees", "shows", "showing", "scene", "text", "headline", "screen", "camera", "frame",
  "shot", "cut", "pan", "push", "zoom", "slow", "fast", "left", "right", "up", "down",
  "reveal", "reveals", "appears", "appear", "settles", "snaps", "slides", "fades", "lands",
  "one", "two", "three", "each", "every", "more", "most", "very", "just", "like",
]);

/** A concrete search phrase distilled from a prose direction. The historical last resort. */
function queryFromProse(text, max = 4) {
  const words = String(text || "").toLowerCase().match(/[a-z]{3,}/g) || [];
  const picked = [];
  for (const w of words) {
    if (STOP.has(w)) continue;
    if (picked.includes(w)) continue;
    picked.push(w);
    if (picked.length >= max) break;
  }
  return picked.length >= 2 ? picked.join(" ") : null;
}

/**
 * The product model's shootable subjects, best first, as a consumable pool. Each entry is
 * spent at most once so two boxes never chase the same picture.
 */
function visualPool(product) {
  const list = (product && Array.isArray(product.visualVocabulary)) ? product.visualVocabulary : [];
  const rank = { critical: 0, high: 1, medium: 2 };
  return list
    .map((v, i) => ({ ...v, __i: i }))
    .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || a.__i - b.__i);
}

/** Does a pool entry suit this requirement? Purpose match first, then anything unspent. */
function takeVisual(pool, purpose) {
  let i = pool.findIndex((v) => !v.__used && v.assetType === purpose);
  if (i < 0 && purpose === "productImage") i = pool.findIndex((v) => !v.__used && (v.assetType === "object" || v.assetType === "person" || v.assetType === "place"));
  if (i < 0) i = pool.findIndex((v) => !v.__used && v.assetType !== "screenshot" && v.assetType !== "logo");
  if (i < 0) return null;
  pool[i].__used = true;
  return pool[i];
}

/**
 * Minimum acceptable pixels for a box. A slot's declared width/height live in the pack's
 * AUTHORED coordinate space, which is the render frame — so they are directly the pixels the
 * picture has to cover. Held at 70% (a modest upscale is invisible; a 3x one is not) and
 * floored so a tiny decorative tile does not accept a thumbnail.
 */
function minPixelsFor(placeholder) {
  const w = num(placeholder && placeholder.width, 0);
  const h = num(placeholder && placeholder.height, 0);
  if (!w || !h) return { minWidth: 640, minHeight: 360 };
  return {
    minWidth: Math.max(480, Math.round(w * 0.7)),
    minHeight: Math.max(270, Math.round(h * 0.7)),
  };
}

/**
 * WHAT AN OWNED REQUIREMENT DEGRADES TO WHEN THERE IS NO OWNED MATERIAL.
 *
 * Every one of the 125 packs declares screenshot slots, because a pack is authored against
 * the case it was designed for: a product tour of a real site. A PROMPT-ONLY film has no
 * captures and no uploads, so those boxes can never be filled from owned material — and a
 * requirement that can never be filled is worse than no requirement at all: it spends no
 * fetch, reports as an empty critical slot, and hard-fails the pre-render gate for a picture
 * nobody could have supplied.
 *
 * So an owned requirement the inventory cannot cover becomes a searchable one, keeping its
 * box, its priority and its shape. The film shows a real photograph of the subject where it
 * would otherwise show a blank plate, and the disclosure records the substitution.
 */
const OWNED_FALLBACK = { screenshot: "productImage", logo: "productImage" };

/**
 * PLAN THE REQUIREMENTS.
 *
 * @param {object[]} scenes        the approved script's scenes (or the storyboard's)
 * @param {object}   mediaPlan     template_media.resolveMediaPlan() output, or null
 * @param {object}   product       product_understanding model, or null
 * @param {object}   dims          { width, height } of the render
 * @param {boolean}  acceptsVectors can the chosen pack draw an SVG in a scene slot?
 * @param {boolean}  videoOk       is a keyed video provider available?
 * @param {object}   inventory     how much OWNED material this job actually has:
 *                                 { screenshots, logos, uploads }. Owned requirements beyond
 *                                 that count degrade to a searchable purpose rather than
 *                                 becoming boxes nothing can ever fill.
 * @returns {{ requirements: object[], summary: object }}
 */
function planRequirements({ scenes, mediaPlan = null, product = null, dims = null, acceptsVectors = true, videoOk = false, inventory = null } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  const total = list.length;
  const sceneById = new Map();
  const roleById = new Map();
  const indexById = new Map();
  list.forEach((sc, i) => {
    const id = sc && sc.id != null ? String(sc.id) : `s${i + 1}`;
    sceneById.set(id, sc);
    roleById.set(id, roleOf(sc, { index: i, total }));
    indexById.set(id, i);
  });

  const placeholders = (mediaPlan && Array.isArray(mediaPlan.placeholders)) ? mediaPlan.placeholders : [];
  const pool = visualPool(product);

  // Script needs, grouped by scene and ordered strongest first, so the script's own
  // `critical` request claims the scene's `critical` box rather than whichever box sorts
  // first. A need with no declared priority sits between `high` and `medium` — the model
  // opted out of ranking, and treating that as "least important" would bury the common case.
  const needsByScene = new Map();
  list.forEach((sc, i) => {
    const id = sc && sc.id != null ? String(sc.id) : `s${i + 1}`;
    const needs = (Array.isArray(sc && sc.assetNeeds) ? sc.assetNeeds : []).map((n, k) => ({ ...n, __k: k }));
    needs.sort((a, b) => {
      const w = (n) => (n.priority ? PRIORITY_WEIGHT[n.priority] || 40 : 55);
      return w(b) - w(a) || a.__k - b.__k;
    });
    needsByScene.set(id, needs);
  });

  const out = [];
  const claimed = new Map();   // sceneId -> how many of its script needs have been consumed

  // ---- 1) ONE REQUIREMENT PER REAL BOX ------------------------------------------------
  // The template's placeholders are the film's actual capacity. Walking them first is what
  // makes "every box is accounted for" true by construction rather than by luck, and it is
  // the ordering that lets a scarce asset be credited to the hero.
  for (const p of placeholders) {
    const sceneId = String(p.sceneId);
    const scene = sceneById.get(sceneId);
    const role = p.role || roleById.get(sceneId) || "feature";
    const needs = needsByScene.get(sceneId) || [];
    const taken = claimed.get(sceneId) || 0;
    const need = needs[taken] || null;
    if (need) claimed.set(sceneId, taken + 1);

    // Purpose precedence: what the SCRIPT asked for, then what the TEMPLATE declared the box
    // wants, then what the beat's role implies. The script wins because it knows the story;
    // the template's `kind` is a preference about its own layout, not about the content.
    const purpose = need && need.purpose
      ? need.purpose
      : (p.kind && KIND_TO_PURPOSE[p.kind]) || ROLE_PURPOSE[role] || "productImage";

    // Priority precedence is the other way round: the TEMPLATE owns how prominent its own
    // boxes are (it drew them), so a script that calls a texture "critical" cannot promote a
    // corner tile into the hero. The script's priority only breaks a tie.
    const priority = p.priority || need?.priority || "medium";

    const visual = need ? null : takeVisual(pool, purpose);
    const query = need?.query
      || (visual && visual.subject)
      || queryFromProse(scene && (scene.visualDirection || scene.headline || scene.subtext))
      || null;

    const isOwned = OWNED_PURPOSES.has(purpose);
    const { minWidth, minHeight } = minPixelsFor(p);
    out.push({
      id: p.id,
      placeholderId: p.id,
      sceneId, sceneIndex: p.sceneIndex != null ? p.sceneIndex : indexById.get(sceneId),
      role,
      assetType: purpose,
      kind: PURPOSE_TO_KIND[purpose] || "productImages",
      priority,
      weight: PRIORITY_WEIGHT[priority] || 40,
      // A box the TEMPLATE calls critical is required; below that, the script decides. A film
      // is not broken because a decorative tile is empty, and reporting it as broken teaches
      // the user to ignore the report.
      required: priority === "critical" ? true : (need?.required === true),
      preferredAspect: num(p.aspect, 0) || null,
      objectFit: p.objectFit || "cover",
      areaShare: num(p.areaShare, 0) || null,
      minWidth, minHeight,
      visualDescription: need?.visualDescription
        || (visual && visual.why)
        || (scene && scene.visualDirection) || "",
      query,
      // A screenshot/logo requirement is satisfied by material the pipeline OWNS. Spending a
      // stock fetch on it buys a picture of somebody else's product.
      searchable: !isOwned && !!query,
      kindPref: acceptsVectors ? PURPOSE_KINDPREF[purpose] : (PURPOSE_KINDPREF[purpose] === "vector" ? "photo" : PURPOSE_KINDPREF[purpose]),
      type: need?.type === "video" && videoOk ? "video" : "image",
      source: need ? "script+template" : (visual ? "product+template" : "template"),
      // Is the query already the SUBJECT, or is it a vague direction that needs anchoring
      // to the film's topic? A script-authored need and a product-model visual are written
      // to be shootable; only the prose fallback is vague. The collector reads this to
      // decide whether to prepend the topic anchor — see graph.assetSearchAgent, where
      // anchoring an already-concrete query collapsed every search into the same string.
      concrete: !!(need?.query || (visual && visual.subject)),
    });
  }

  // ---- 2) SCRIPT NEEDS NO BOX CLAIMED --------------------------------------------------
  // A template that declares fewer boxes than the script asks for is normal (most packs draw
  // one picture a beat while a writer asks for two). These are still worth collecting: the
  // reuse optimizer and the layout director both redistribute, and a composer with spare
  // per-beat capacity will draw them. They are never `required` — no box is waiting.
  for (const [sceneId, needs] of needsByScene) {
    const taken = claimed.get(sceneId) || 0;
    const role = roleById.get(sceneId) || "feature";
    const scene = sceneById.get(sceneId);
    for (let k = taken; k < needs.length; k++) {
      const need = needs[k];
      const purpose = need.purpose || ROLE_PURPOSE[role] || "productImage";
      if (OWNED_PURPOSES.has(purpose) && !need.query) continue;
      out.push({
        id: `${sceneId}-need-${k + 1}`,
        placeholderId: null,
        sceneId, sceneIndex: indexById.get(sceneId), role,
        assetType: purpose,
        kind: PURPOSE_TO_KIND[purpose] || "productImages",
        priority: need.priority || "medium",
        weight: PRIORITY_WEIGHT[need.priority || "medium"] || 40,
        required: false,
        preferredAspect: null,
        objectFit: "cover",
        areaShare: null,
        minWidth: 640, minHeight: 360,
        visualDescription: need.visualDescription || (scene && scene.visualDirection) || "",
        query: need.query || queryFromProse(scene && scene.visualDirection),
        searchable: !OWNED_PURPOSES.has(purpose) && !!(need.query || queryFromProse(scene && scene.visualDirection)),
        kindPref: acceptsVectors
          ? (need.type === "icon" || need.role === "icon" || need.role === "texture" ? "vector" : PURPOSE_KINDPREF[purpose])
          : (PURPOSE_KINDPREF[purpose] === "vector" ? "photo" : PURPOSE_KINDPREF[purpose]),
        type: need.type === "video" && videoOk ? "video" : "image",
        source: "script",
        concrete: !!need.query,
      });
    }
  }

  // ---- 3) NO TEMPLATE CONTRACT AT ALL --------------------------------------------------
  // Degrade to one requirement per scene that has copy but asked for nothing, which is the
  // behaviour the planner's gap-fill already had. Only reachable when the media plan is
  // missing entirely (a malformed pack.json), so it is a floor, not a path.
  if (!placeholders.length) {
    for (const [sceneId, scene] of sceneById) {
      if (out.some((r) => r.sceneId === sceneId)) continue;
      const role = roleById.get(sceneId) || "feature";
      const purpose = ROLE_PURPOSE[role] || "productImage";
      const visual = takeVisual(pool, purpose);
      const query = (visual && visual.subject) || queryFromProse(scene && scene.visualDirection);
      if (!query) continue;
      out.push({
        id: `${sceneId}-derived`, placeholderId: null,
        sceneId, sceneIndex: indexById.get(sceneId), role,
        assetType: purpose, kind: PURPOSE_TO_KIND[purpose] || "productImages",
        priority: "medium", weight: 40, required: false,
        preferredAspect: null, objectFit: "cover", areaShare: null,
        minWidth: 640, minHeight: 360,
        visualDescription: (scene && scene.visualDirection) || "",
        query, searchable: !OWNED_PURPOSES.has(purpose),
        kindPref: acceptsVectors ? PURPOSE_KINDPREF[purpose] : (PURPOSE_KINDPREF[purpose] === "vector" ? "photo" : PURPOSE_KINDPREF[purpose]),
        type: "image", source: "derived",
      });
    }
  }

  // Stable order: by scene, then most important box first. Everything downstream fills in
  // this order, which is what makes "the best asset lands in the best box" an ordering
  // property rather than a special case.
  out.sort((a, b) =>
    (num(a.sceneIndex, 99) - num(b.sceneIndex, 99))
    || (b.weight - a.weight)
    || String(a.id).localeCompare(String(b.id)));

  // ---- 4) DEGRADE OWNED REQUIREMENTS THE JOB CANNOT COVER -------------------------------
  // Ration the owned material to the MOST IMPORTANT owned boxes first (strongest priority,
  // then earliest scene — the sort above already put them in that order within a scene, and
  // a stable re-sort by weight gives the film-wide ranking). Everything past the count
  // degrades to a searchable purpose, keeping its box and its shape.
  //
  // This is the single line between "the template wants three screenshots" and "this film
  // has none", and getting it wrong in either direction is expensive: leave them owned and
  // the boxes render blank; degrade them all and a URL job stops showing the real product.
  if (inventory) {
    const budgetFor = {
      screenshot: Math.max(0, num(inventory.screenshots, 0)) + Math.max(0, num(inventory.uploads, 0)),
      logo: Math.max(0, num(inventory.logos, 0)),
    };
    const ownedReqs = out
      .filter((r) => OWNED_PURPOSES.has(r.assetType))
      .sort((a, b) => (b.weight - a.weight) || (num(a.sceneIndex, 99) - num(b.sceneIndex, 99)));
    const spent = { screenshot: 0, logo: 0 };
    let degraded = 0;
    for (const r of ownedReqs) {
      const cap = budgetFor[r.assetType];
      if (cap == null) continue;
      if (spent[r.assetType] < cap) { spent[r.assetType]++; continue; }
      const to = OWNED_FALLBACK[r.assetType];
      if (!to) continue;
      // A LOGO box is the pack's own brand lockup, not a picture slot. When there is no logo
      // the composer already draws its own mark; turning that into a stock-photo requirement
      // would put a random photograph where the brand belongs. Drop the requirement instead.
      if (r.assetType === "logo") { r.__drop = true; degraded++; continue; }
      r.degradedFrom = r.assetType;
      r.assetType = to;
      r.kind = PURPOSE_TO_KIND[to] || "productImages";
      r.kindPref = acceptsVectors ? PURPOSE_KINDPREF[to] : (PURPOSE_KINDPREF[to] === "vector" ? "photo" : PURPOSE_KINDPREF[to]);
      r.searchable = !!r.query;
      degraded++;
    }
    if (degraded) {
      for (let i = out.length - 1; i >= 0; i--) if (out[i].__drop) out.splice(i, 1);
    }
  }

  const summary = {
    total: out.length,
    fromTemplate: out.filter((r) => r.placeholderId).length,
    fromScript: out.filter((r) => r.source === "script").length,
    searchable: out.filter((r) => r.searchable).length,
    owned: out.filter((r) => !r.searchable).length,
    critical: out.filter((r) => r.priority === "critical").length,
    required: out.filter((r) => r.required).length,
    degraded: out.filter((r) => r.degradedFrom).length,
    byPurpose: out.reduce((m, r) => { m[r.assetType] = (m[r.assetType] || 0) + 1; return m; }, {}),
  };
  return { requirements: out, summary };
}

/** A compact, loggable one-liner. */
function describeRequirements(summary) {
  const by = Object.entries(summary.byPurpose || {}).map(([k, v]) => `${v} ${k}`).join(", ");
  return `${summary.total} requirement(s) — ${summary.fromTemplate} from the template, ${summary.fromScript} script-only`
    + ` · ${summary.searchable} searchable / ${summary.owned} owned`
    + ` · ${summary.critical} critical, ${summary.required} required`
    + (summary.degraded ? ` · ${summary.degraded} degraded (no owned material for them)` : "")
    + (by ? ` · ${by}` : "");
}

module.exports = {
  planRequirements, describeRequirements,
  queryFromProse, minPixelsFor,
  ROLE_PURPOSE, PURPOSE_TO_KIND, KIND_TO_PURPOSE, PURPOSE_KINDPREF, OWNED_PURPOSES,
};
