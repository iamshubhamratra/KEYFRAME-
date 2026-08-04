// ASSET REUSE OPTIMIZER — the last stage of asset intelligence, between scene
// assignment and rendering. See ASSET-REUSE-OPTIMIZER-PLAN.md for the full design.
//
// THE PROBLEM IT SOLVES. visual_layout_director.spreadAcrossScenes already gives every
// scene one asset before any scene gets two — but it MOVES assets, it never duplicates
// them, so its coverage ceiling is min(assets, scenes). A six-asset film with nine scenes
// leaves three scenes with nothing, and no amount of better ranking can change that. It is
// arithmetic. This module is the only thing in the pipeline allowed to make one asset
// appear twice, so it is the only thing that can close that gap.
//
// THE KEY DESIGN DECISION: A REUSE IS A SECOND ENTRY ON THE WIRE, NOT A MUTATED FIRST ONE.
// scene_kit.partitionAssets pushes every wire entry into a pool and the weave then consumes
// pools with shift()/splice(); om_stage distributes by a.sceneId with per-beat capacity.
// So a CLONE — same `path`, its own `sceneId` — is automatically a second placeable unit in
// both composer families, and this module needs no changes to the weaving logic of any of
// the 43 packs. Clones share `path` deliberately: asset_coverage keys a Map by path, so a
// reused asset still counts as ONE asset used, which is the truth.
//
// PURE + FAIL-OPEN (THE HOUSE LAW): no I/O, no LLM, no vision, no randomness. Any throw
// returns the inputs untouched. When there are at least as many assets as slots it is a
// guaranteed no-op — that invariant is what protects every existing film, and it is the
// first thing scripts/test-asset-reuse.js asserts.

const config = require("../config");
const { categorize, isLogo, isTrustedProminent, tierFor, assetConfidence } = require("./asset_priority");
const { roleOf } = require("./scene_role");

// ---------------------------------------------------------------- tuning
function cfg() {
  const c = (config && config.assetReuse) || {};
  return {
    enabled: c.enabled !== false,
    maxUses: Number.isFinite(Number(c.maxUses)) ? Number(c.maxUses) : 2,
    minGap: Number.isFinite(Number(c.minGap)) ? Number(c.minGap) : 3,
    minScore: Number.isFinite(Number(c.minScore)) ? Number(c.minScore) : 40,
    allowLogoReuse: c.allowLogoReuse !== false,
  };
}

// Scene roles that can actually SHOW an image, per composer family. This is deliberately
// pessimistic: assigning into a slot the composer will discard is the failure om_stage's
// own SHOT_CAPACITY comment documents ("surplus shots were routed onto beats already at
// capacity and silently vanished"), and a wasted assignment is worse than none because it
// reads as coverage in the report.
//
//   scene-kit — the weave only takes foreground assets on CONTENT scenes (isContent =
//               not first, not last) whose archetype is archText, and Pass 2 B-roll also
//               skips scene 0. So the hook and the closing scene are not addressable here.
//   native    — the dedicated composers place by sceneId across their display-capable
//               beats, and WHICH beats those are differs per renderer — see
//               SHOWABLE_BY_RENDERER below.
//
// Content-critical roles are excluded from BOTH: turning a testimonial or a metric into an
// asset slot deletes the content that scene exists to deliver (scene_kit.js:1829-1835).
const CONTENT_CRITICAL = new Set(["quote", "cta"]);

// WHICH ROLES A RENDERER CAN ACTUALLY DRAW A PICTURE ON — and it is RENDERER-SPECIFIC.
//
// Assuming one native profile fits every native pack is how a reuse gets spent on a scene
// that will never draw it. Measured on job 9e0fq1724n (prisma-bloc): the optimizer put a
// reuse on the HOOK and reported 100% coverage, while the scene rendered no picture at all,
// because `om_stage.bHook` draws `sceneAssets[0]` but `prisma.bHook(scene, ctx, _assets, logo)`
// takes an underscore-prefixed `_assets` and renders only the brand mark. Same role, opposite
// capability. That is exactly the "assigned, then silently discarded" failure om_stage's own
// SHOT_CAPACITY comment documents.
//
// THE DEFAULT EXCLUDES "hook" ON PURPOSE. A hook is the likeliest scene to be a pure
// type/brand moment, and the cost of being wrong is asymmetric: a slot wrongly EXCLUDED only
// forgoes one reuse, while a slot wrongly INCLUDED burns a scarce appearance (the ceiling is
// 2) on a scene that renders nothing — and reports it as coverage. A renderer earns the hook
// by being verified to draw on it.
const ROLE_SHOWABLE_DEFAULT = new Set(["context", "feature", "proof", "how"]);
// The seven OM skins share one engine whose CAN_SHOW is hook/feature/montage/statement/stats.
const OM_SHOWABLE = new Set(["hook", "context", "feature", "proof", "how"]);
const SHOWABLE_BY_RENDERER = {
  "om-garden": OM_SHOWABLE, "om-lantern": OM_SHOWABLE, "om-bakehouse": OM_SHOWABLE,
  "om-blocks": OM_SHOWABLE, "om-poster": OM_SHOWABLE, "om-premiere": OM_SHOWABLE,
  "om-hype": OM_SHOWABLE,
};
function showableRoles(renderer) {
  return SHOWABLE_BY_RENDERER[String(renderer || "")] || ROLE_SHOWABLE_DEFAULT;
}

// ---------------------------------------------------------------- scene ↔ asset semantics
// The reuse matrix: how well an asset CATEGORY (asset_priority.CATEGORIES, the canonical
// visual-type taxonomy) supports a scene ROLE (scene_role.ROLES). An extension of
// asset_taxonomy.PURPOSE_KIND at finer granularity — it must stay consistent with it, or
// collection and reuse would pull in opposite directions.
const IDEAL = 1.0, GOOD = 0.6, WEAK = 0.25, NONE = 0.0;
const SEMANTIC = {
  hook:    { product: IDEAL, screenshot: IDEAL, marketing: GOOD, illustration: GOOD, dashboard: WEAK, team: WEAK, background: WEAK, decorative: WEAK, icon: NONE, logo: NONE },
  context: { marketing: IDEAL, illustration: IDEAL, product: GOOD, team: GOOD, screenshot: WEAK, dashboard: WEAK, background: WEAK, decorative: WEAK, icon: NONE, logo: NONE },
  feature: { screenshot: IDEAL, dashboard: IDEAL, product: GOOD, icon: GOOD, illustration: WEAK, marketing: WEAK, background: WEAK, decorative: WEAK, team: NONE, logo: NONE },
  how:     { screenshot: IDEAL, dashboard: IDEAL, icon: GOOD, illustration: GOOD, product: WEAK, marketing: WEAK, background: WEAK, decorative: WEAK, team: NONE, logo: NONE },
  proof:   { dashboard: IDEAL, team: IDEAL, screenshot: GOOD, product: GOOD, marketing: WEAK, illustration: WEAK, background: WEAK, decorative: WEAK, icon: NONE, logo: NONE },
  quote:   { team: IDEAL, product: GOOD, marketing: WEAK, illustration: WEAK, background: WEAK, decorative: WEAK, screenshot: NONE, dashboard: NONE, icon: NONE, logo: NONE },
  cta:     { logo: IDEAL, product: IDEAL, illustration: GOOD, icon: GOOD, marketing: WEAK, background: WEAK, decorative: WEAK, screenshot: NONE, dashboard: NONE, team: NONE },
};
function semanticFit(category, role) {
  const row = SEMANTIC[role] || SEMANTIC.feature;
  const v = row[category];
  return typeof v === "number" ? v : WEAK;   // unknown category: placeable, never ideal
}

// ---------------------------------------------------------------- similarity
// Hamming distance over the 64-bit perceptual hash asset_sources/util already computes for
// every fetched image (a 16-char hex string). Two near-identical captures beside each other
// is the most visible kind of repetition, and this is what detects it for free.
function dhashSimilarity(a, b) {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") return 0;
  if (a.length !== 16 || b.length !== 16) return 0;
  let bits = 0;
  for (let i = 0; i < 16; i += 8) {
    let x = parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16);
    if (!Number.isFinite(x)) return 0;
    // Kernighan popcount over the 32-bit half.
    for (; x; bits++) x &= x - 1;
  }
  return 1 - bits / 64;
}
function hexRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorProximity(a, b) {
  const x = hexRgb(a), y = hexRgb(b);
  if (!x || !y) return 0;
  const d = Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
  return Math.max(0, 1 - d / 441.67);        // 441.67 = max RGB distance
}
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a.path && a.path === b.path) return 1;
  return 0.7 * dhashSimilarity(a.dhash, b.dhash) + 0.3 * colorProximity(a.dominantColor, b.dominantColor);
}

// ---------------------------------------------------------------- variation
// A second appearance must not read as a repeat. Variation is PRESENTATIONAL ONLY: it may
// change how an asset is framed, sized, entered and angled, and it may never change which
// pixels of the subject are visible in a way that hides load-bearing content.
//
// DETERMINISTIC BY CONSTRUCTION — seeded from (seedKey, path, instance), never Math.random.
// The renderer captures frames by seeking a paused timeline, so a value that differs
// between two evaluations of the same document would tear the capture (composer.js:280).
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The crop anchors a re-framed image may use, and the entrances a reuse may borrow. The
// entrance verbs are deliberately the ones the pack's own choreography already speaks
// (rise / slide / pop / fade), so a variation can never introduce a motion the design
// system does not use. "rise" is excluded because it is the DEFAULT — a variation that
// picked it would be no variation at all.
const CROP_ANCHORS = ["center center", "top center", "bottom center"];
const ENTER_VERBS = ["slide-left", "pop", "slide-right", "fade"];
// Never 1.0: a reuse must be visibly a different size, not accidentally the same one.
const SCALES = [0.92, 0.96, 1.06];

// Categories whose crop is load-bearing. A dashboard or UI capture keeps the anchor the
// Visual Layout Director chose — re-anchoring a screenshot cuts off the header, which is
// the one thing the shot exists to show (visual_layout_director.cropFocusFor).
const CROP_LOCKED = new Set(["screenshot", "dashboard", "icon", "logo"]);

/**
 * The presentation variation for appearance `instance` (1 = the second appearance).
 * Returns null for instance 0 — a first appearance is never varied, which is what makes
 * a film with no reuse byte-identical to one built before this feature existed.
 */
function variationFor(row, instance, seedKey) {
  if (!instance) return null;
  const rnd = mulberry32(hash32(`${seedKey || "kf"}|${row.assetId}|${instance}`));
  const enter = ENTER_VERBS[Math.floor(rnd() * ENTER_VERBS.length)];
  const scale = SCALES[Math.floor(rnd() * SCALES.length)];
  // Tilt is emitted always and honoured only by packs whose surface is flat — a tilted
  // plate reads as a mistake on a glass/cinematic pack, so the pack keeps that decision.
  const tilt = (rnd() < 0.5 ? -1 : 1) * 1.5;
  const cropFocus = CROP_LOCKED.has(row.type)
    ? null                                   // keep the director's anchor
    : CROP_ANCHORS[Math.floor(rnd() * CROP_ANCHORS.length)];
  return { instance, enter, scale, tilt, cropFocus };
}

// ---------------------------------------------------------------- ledger
const ratioOf = (a) => {
  const r = Number(a && a.ratio);
  if (Number.isFinite(r) && r > 0) return r;
  const w = Number(a && a.width), h = Number(a && a.height);
  return (w > 0 && h > 0) ? w / h : 0;
};
// The asset's quality on a 0..1 scale, from whatever signal it actually carries — never
// invented. cdScore is the Creative Director's 0-100; assetConfidence blends CD + CLIP +
// tier and is already tier-floored for owned material.
function qualityNorm(a) {
  const cd = Number(a && a.cdScore);
  if (Number.isFinite(cd) && cd > 0) return Math.max(0, Math.min(1, cd > 1 ? cd / 100 : cd));
  const c = Number(assetConfidence(a));
  return Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.4;
}

function buildLedger(assets) {
  const byPath = new Map();
  for (const a of assets) {
    if (!a || !a.path) continue;
    let row = byPath.get(a.path);
    if (!row) {
      row = {
        assetId: a.path,
        type: categorize(a),
        tier: tierFor(a),
        qualityScore: Math.round(qualityNorm(a) * 100),
        sceneAssignments: [],
        usageCount: 0,
        reuseEligible: true,
        isLogo: isLogo(a),
        ratio: ratioOf(a),
        dhash: a.dhash || null,
        dominantColor: a.dominantColor || null,
        ref: a,                                // the first wire entry — the clone source
      };
      byPath.set(a.path, row);
    }
    // An asset already placed by the CD/VLD starts at one use.
    if (a.sceneId != null) {
      row.usageCount++;
      row.sceneAssignments.push(String(a.sceneId));
    }
  }
  return byPath;
}

// ---------------------------------------------------------------- slots
// The addressable slots this film has, one per scene that the CHOSEN composer family can
// actually show an image on. One slot per scene, never more: coverage is the defect being
// fixed, and one-per-scene is within every composer's per-beat capacity, so nothing can be
// assigned and then sliced away. (Per-renderer multi-slot capacity — om_stage's
// SHOT_CAPACITY and friends — is P3 in the plan; it raises DEPTH, not coverage.)
function buildSlots(scenes, { native, renderer = null }) {
  const total = scenes.length;
  const showable = showableRoles(renderer);
  const out = [];
  scenes.forEach((sc, i) => {
    const role = roleOf(sc, { index: i, total });
    if (CONTENT_CRITICAL.has(role)) return;
    if (native) { if (!showable.has(role)) return; }
    // scene-kit: the weave only reaches CONTENT scenes (not first, not last).
    else if (i === 0 || i === total - 1) return;
    out.push({
      sceneId: sc.id != null ? String(sc.id) : `s${i + 1}`,
      index: i, role, scene: sc, filled: false, via: null,
    });
  });
  return out;
}

// ---------------------------------------------------------------- scoring
const W_SEMANTIC = 30, W_QUALITY = 20, W_RECENCY = 15, W_DIVERSITY = 12,
      W_HEADROOM = 10, W_ASPECT = 8, W_COMPOSITION = 5;

// A slot's target aspect. Portrait films frame their heroes tall, landscape wide; without
// a per-renderer slot geometry this is the honest approximation, and aspect is only 8 of
// the 100 points precisely because it is approximate.
function slotRatio(dims) {
  const w = Number(dims && dims.width) || 16, h = Number(dims && dims.height) || 9;
  return w >= h ? 1.6 : 0.8;
}
function aspectFit(assetRatio, target) {
  if (!assetRatio || !target) return 0.5;                    // unknown: neutral, never a veto
  return Math.max(0, 1 - Math.abs(Math.log(assetRatio / target)) / Math.log(3));
}

/**
 * Score one candidate for one slot. Returns { score, vetoed, reason, parts }.
 * A veto is -Infinity, never a low score, so it can never be outweighed by quality.
 */
function scoreCandidate(row, slot, { neighbours, dims, acceptsVectors, prominentSlot, tuning }) {
  const veto = (reason) => ({ score: -Infinity, vetoed: true, reason, parts: null });
  const a = row.ref;

  // --- hard vetoes ---
  const ceiling = row.isLogo && tuning.allowLogoReuse ? Infinity : tuning.maxUses;
  if (row.usageCount >= ceiling) return veto(`at the ${tuning.maxUses}-use ceiling`);
  if (row.sceneAssignments.includes(slot.sceneId)) return veto("already on this scene");
  if (a && (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(String(a.path)))) return veto("video cannot fill an image slot");
  if (!acceptsVectors && /\.svg($|\?)/i.test(String(a && a.path))) return veto("the template discards vectors");
  if (prominentSlot && !isTrustedProminent(a) && a.cdProminence !== "hero" && a.cdProminence !== "support") {
    return veto("not trusted for a prominent slot");
  }
  // Adjacency: the same picture on consecutive scenes reads as a mistake. A user's own
  // upload that is the only one of its category is the film's subject, so it is allowed to
  // recur — that is the `narrativeCentral` escape hatch, derived rather than modelled.
  const adjacent = row.sceneAssignments.some((id) => {
    const other = neighbours.indexOf(id);
    return other >= 0 && Math.abs(other - slot.index) <= 1;
  });
  if (adjacent && !row.narrativeCentral) return veto("would repeat on an adjacent scene");

  // --- weighted components ---
  const sem = semanticFit(row.type, slot.role);
  const qual = qualityNorm(a);
  const gap = row.sceneAssignments.reduce((best, id) => {
    const i = neighbours.indexOf(id);
    return i < 0 ? best : Math.min(best, Math.abs(i - slot.index));
  }, Infinity);
  const recency = gap === Infinity ? 1 : Math.min(1, gap / Math.max(1, tuning.minGap));
  const near = (slot.neighbourAssets || []).reduce((m, other) => Math.max(m, similarity(a, other)), 0);
  const diversity = 1 - near;
  const headroom = row.usageCount === 0 ? 1 : 0.35;
  const asp = aspectFit(row.ratio, slotRatio(dims));
  // A contain-fit slot never crops, so composition is only at risk on cover-fit photos.
  const contain = row.type === "screenshot" || row.type === "dashboard" || row.type === "icon" || row.type === "logo";
  const composition = contain ? 1 : (asp >= 0.65 ? 1 : 0.4);

  const parts = {
    semantic: +(W_SEMANTIC * sem).toFixed(2),
    quality: +(W_QUALITY * qual).toFixed(2),
    recency: +(W_RECENCY * recency).toFixed(2),
    diversity: +(W_DIVERSITY * diversity).toFixed(2),
    headroom: +(W_HEADROOM * headroom).toFixed(2),
    aspect: +(W_ASPECT * asp).toFixed(2),
    composition: +(W_COMPOSITION * composition).toFixed(2),
  };
  const score = Object.values(parts).reduce((x, y) => x + y, 0);
  return { score: Math.round(score * 100) / 100, vetoed: false, reason: null, parts };
}

// ---------------------------------------------------------------- main
/**
 * @param {object[]} assets      the wire, post Creative Director + Visual Layout Director
 * @param {object}   script      the approved script (scene ids/roles/timing)
 * @param {object}   storyboard  optional, for scene copy
 * @param {string}   framePack
 * @param {object}   dims        { width, height }
 * @param {boolean}  native      does the chosen pack have a dedicated composer?
 * @param {string}   renderer    the pack's renderer id — decides WHICH ROLES can show a
 *                               picture (see SHOWABLE_BY_RENDERER). Omitting it is safe but
 *                               conservative: the default set excludes the hook.
 * @param {boolean}  acceptsVectors
 * @param {string}   seedKey     per-job salt for the variation engine (the jobId), so the
 *                               same film always varies the same way and a re-render is
 *                               reproducible — the renderer seeks a paused timeline.
 * @returns {{assets: object[], review: object|null}} the SAME array, plus clones
 */
function optimizeAssetReuse({ assets, script, storyboard, framePack, dims, native = false, acceptsVectors = true, seedKey = null, renderer = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const tuning = cfg();
  if (!tuning.enabled) return { assets: list, review: null };

  try {
    const scenes = (script && Array.isArray(script.scenes) && script.scenes.length)
      ? script.scenes
      : (storyboard && Array.isArray(storyboard.scenes) ? storyboard.scenes : []);
    if (!scenes.length || !list.length) return { assets: list, review: null };

    const ledger = buildLedger(list);
    const slots = buildSlots(scenes, { native, renderer });
    const sceneIds = scenes.map((s, i) => (s && s.id != null ? String(s.id) : `s${i + 1}`));

    // narrativeCentral: the user's own upload, sole example of its category. Derived, not
    // modelled — no new model call, and it is the only thing exempt from the adjacency veto.
    const byCategory = new Map();
    for (const row of ledger.values()) {
      if (!byCategory.has(row.type)) byCategory.set(row.type, []);
      byCategory.get(row.type).push(row);
    }
    for (const row of ledger.values()) {
      row.narrativeCentral = row.tier === 100 && (byCategory.get(row.type) || []).length === 1;
    }

    // Which slots already hold something (the CD/VLD's own placements).
    const placed = new Map();                      // sceneId -> [wire assets]
    for (const a of list) {
      if (!a || a.sceneId == null || isLogo(a)) continue;
      const k = String(a.sceneId);
      if (!placed.has(k)) placed.set(k, []);
      placed.get(k).push(a);
    }
    for (const s of slots) {
      if ((placed.get(s.sceneId) || []).length) { s.filled = true; s.via = "assigned"; }
    }

    const decisions = [];
    const added = [];
    // Neighbour context for the diversity term: what sits on the scenes either side.
    const neighbourAssetsFor = (slot) => {
      const out = [];
      for (const d of [-1, 1]) {
        const id = sceneIds[slot.index + d];
        if (id) out.push(...(placed.get(id) || []));
      }
      return out;
    };

    // ---- PASS A: genuinely unused assets first (the "exhaust unique before reusing" rule).
    // VLD's spread already did most of this; what reaches here are assets it demoted or
    // never assigned at all.
    const unusedRows = [...ledger.values()].filter((r) => r.usageCount === 0 && !r.isLogo);
    // ---- PASS B: reuse. Both passes run through the same scorer, so the ONLY difference is
    // which candidate pool is offered — that is what makes "unused wins" a property of the
    // headroom term rather than a special case.
    for (const slot of slots) {
      if (slot.filled) continue;
      slot.neighbourAssets = neighbourAssetsFor(slot);
      const prominentSlot = true;                  // one-per-scene slots are the scene's visual
      const pool = unusedRows.filter((r) => r.usageCount === 0);
      const candidates = (pool.length ? pool : [...ledger.values()].filter((r) => !r.isLogo));
      let best = null;
      for (const row of candidates) {
        const v = scoreCandidate(row, slot, { neighbours: sceneIds, dims, acceptsVectors, prominentSlot, tuning });
        if (v.vetoed) continue;
        if (!best || v.score > best.v.score) best = { row, v };
      }
      if (!best || best.v.score < tuning.minScore) {
        // Nothing fits well enough. The decorative brand fallback (scene_kit.buildPropFill)
        // is a better answer than forcing an asset that fights the scene.
        slot.via = "decorative";
        decisions.push({ sceneId: slot.sceneId, role: slot.role, chose: null, score: null,
          because: best ? `best candidate scored ${best.v.score} (< ${tuning.minScore}) — left to the decorative fallback`
                        : "no eligible asset — left to the decorative fallback" });
        continue;
      }

      const { row } = best;
      const reused = row.usageCount > 0;
      const scene = slot.scene;
      const clone = {
        ...row.ref,
        sceneId: scene.id != null ? scene.id : slot.sceneId,
        ...(scene.start != null ? { startSec: scene.start } : {}),
        ...(scene.duration != null ? { durationSec: scene.duration } : {}),
      };
      let variation = null;
      if (reused) {
        clone.__reuseOf = row.assetId;
        clone.__reuseInstance = row.usageCount;
        // A reuse must not inherit a demotion that would make the composer skip it: this
        // slot is empty precisely because nothing better exists for it.
        clone.__layoutDemoted = false;
        // PRESENTATION VARIATION — the difference between "reused" and "repeated".
        variation = variationFor(row, row.usageCount, seedKey);
        clone.__variant = variation;
        // cropFocus is the one variation channel the composers ALREADY read, so it is
        // written onto the asset itself rather than tucked inside __variant.
        if (variation.cropFocus) clone.cropFocus = variation.cropFocus;
      }
      row.usageCount++;
      row.sceneAssignments.push(slot.sceneId);
      row.reuseEligible = row.isLogo ? tuning.allowLogoReuse : row.usageCount < tuning.maxUses;
      added.push(clone);
      if (!placed.has(slot.sceneId)) placed.set(slot.sceneId, []);
      placed.get(slot.sceneId).push(clone);
      slot.filled = true;
      slot.via = reused ? "reuse" : "unique";
      decisions.push({
        sceneId: slot.sceneId, role: slot.role, chose: row.assetId, score: best.v.score,
        kind: reused ? "reuse" : "unique",
        because: `${row.type}→${slot.role} fit ${semanticFit(row.type, slot.role)}`
          + `, quality ${row.qualityScore}`
          + (reused ? `, appearance ${row.usageCount} of ${tuning.maxUses}` : ", first use"),
        // What makes this appearance look different from the last one — the record that
        // answers "is the reuse varied, or just repeated?" without watching the film.
        variation: variation
          ? { enter: variation.enter, scale: variation.scale, tilt: variation.tilt, cropFocus: variation.cropFocus || "unchanged (crop is load-bearing)" }
          : null,
        parts: best.v.parts,
      });
    }

    const out = added.length ? [...list, ...added] : list;
    const rows = [...ledger.values()];
    const uniqueUsed = rows.filter((r) => r.usageCount > 0 && !r.isLogo).length;
    const reusedCount = rows.filter((r) => r.usageCount > 1 && !r.isLogo).length;
    const review = {
      totalAssetsCollected: rows.filter((r) => !r.isLogo).length,
      uniqueAssetsUsed: uniqueUsed,
      reusedAssets: reusedCount,
      maximumReuseCount: rows.reduce((m, r) => Math.max(m, r.isLogo ? 0 : r.usageCount), 0),
      emptyPlaceholders: slots.filter((s) => !s.filled).length,
      placeholderContentUsed: false,     // the fallback is brand geometry, never synthetic UI
      assetCoverage: slots.length ? `${Math.round((slots.filter((s) => s.filled).length / slots.length) * 100)}%` : "n/a",
      slotsDemanded: slots.length,
      slotsFilledUnique: slots.filter((s) => s.via === "unique" || s.via === "assigned").length,
      slotsFilledReuse: slots.filter((s) => s.via === "reuse").length,
      slotsFilledDecorative: slots.filter((s) => s.via === "decorative").length,
      framePack: framePack || null,
      composerFamily: native ? "native" : "scene-kit",
      ledger: rows.map((r) => ({
        assetId: r.assetId, type: r.type, qualityScore: r.qualityScore,
        sceneAssignments: r.sceneAssignments.slice(), usageCount: r.usageCount,
        reuseEligible: r.reuseEligible,
      })),
      decisions: decisions.slice(0, 20),
    };
    return { assets: out, review };
  } catch (e) {
    // FAIL-OPEN (THE LAW): a reuse failure must never cost a film its assets.
    console.warn(`[asset_reuse] skipped (${String((e && e.message) || e).slice(0, 140)})`);
    return { assets: list, review: null };
  }
}

module.exports = { optimizeAssetReuse, semanticFit, scoreCandidate, buildLedger, buildSlots, dhashSimilarity, variationFor, SEMANTIC };
