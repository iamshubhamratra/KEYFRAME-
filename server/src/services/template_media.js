// TEMPLATE MEDIA CONTRACT — what a frame pack can actually SHOW, declared by the pack.
//
// WHY THIS EXISTS. Until now the pipeline collected assets without ever asking the
// chosen template what it needs. `asset_budget.computeAssetBudget` sizes the candidate
// pool from DURATION and SCENE COUNT alone (asset_budget.js:25) — a 30s film gets ~15
// stock candidates whether it is rendering `showcase` (a ten-panel product tour that
// can absorb every one of them) or `deep` (a moody trench that shows one plate a scene).
// The consequences are the reported symptoms from both ends:
//
//   • showcase-class packs starve — the collector stops at a duration-derived number
//     while the template still has empty panels (symptom: "not enough images").
//   • sparse packs over-collect — assets are fetched, scored, cropped and then
//     discarded by a composer that had nowhere to put them (symptom: "slow").
//   • nothing anywhere knows a slot's PIXEL SIZE, so the crop anchor cannot be chosen
//     for the box the image will actually land in (symptom: "cropped incorrectly"),
//     and no gate can say "this hero box is empty" before the render (symptom:
//     "placeholders remain empty").
//
// So a pack now declares its media appetite the same way it already declares its
// colors, motion, brand contract and audio identity: as a validated block in
// `frames/<pack>/pack.json`. See MediaSchema below for the shape.
//
// TWO WAYS TO DECLARE, because packs come in two shapes:
//   • `placeholders`  — FIXED slots. A pack with an exact authored layout (showcase's
//                       ten annotated panels) enumerates them, optionally pinned to a
//                       scene index.
//   • `slotsByRole`   — TEMPLATED slots, instantiated once per scene of that role. Most
//                       packs are this: "every feature scene has one 16:9 plate".
// A pack may use either or both. Fixed slots are placed first; role slots then fill
// every remaining scene whose role they name.
//
// AND A DERIVED FALLBACK, because 46 packs cannot all be hand-authored at once and a
// pack with no `media` block must keep working exactly as before. `resolveMediaPlan`
// falls back to a plan derived from the renderer family + orientation, reusing
// asset_reuse.showableRoles as the SINGLE source of truth for "which roles can this
// renderer actually draw a picture on" — so collection and reuse can never disagree
// about what a template can show. A derived plan is marked `source:"derived"` and its
// slot geometry is approximate; every consumer is expected to treat a derived plan as
// a floor, never as a contract.
//
// PURE + FAIL-OPEN (THE HOUSE LAW): no I/O beyond the mtime-cached manifest read, no
// LLM, no randomness. Any throw returns a conservative derived plan, so a malformed
// media block can never cost a film its assets.

const { z } = require("zod");
const { roleOf } = require("./scene_role");

// ---------------------------------------------------------------- vocabulary

// Slot importance. This is the axis the ranking engine sorts against: a `critical`
// slot is the first thing a viewer looks at (the opening hero, the CTA lockup), and
// must never receive a weak asset while a strong one sits in a `low` slot.
const PRIORITIES = ["critical", "high", "medium", "low"];
const PRIORITY_WEIGHT = { critical: 100, high: 70, medium: 40, low: 15 };

// The asset KINDS a template can ask for. Deliberately the product-facing vocabulary
// from the requirements (screenshots / productImages / logos / illustrations / icons)
// rather than the internal `asset_priority.CATEGORIES`, with an explicit bridge below —
// a pack author should not have to know the internal taxonomy.
const KINDS = ["screenshots", "productImages", "logos", "illustrations", "icons"];

// requiredAssets kind -> the internal categories (asset_priority.categorize) that
// satisfy it. One kind may be satisfied by several categories; a category may serve
// several kinds (a dashboard capture is both a screenshot and, for a data-heavy pack,
// the product). Used to score a collected pool against a declared quota.
const KIND_CATEGORIES = {
  screenshots: ["screenshot", "dashboard"],
  productImages: ["product", "marketing", "background", "team"],
  logos: ["logo"],
  illustrations: ["illustration"],
  icons: ["icon"],
};

// requiredAssets kind -> the retrieval `kindPref` the collector should use when it has
// to go and FIND more of this kind. Mirrors graph.assetSearchAgent.kindPrefFor so the
// two cannot drift.
const KIND_PREF = {
  screenshots: undefined, // screenshots are captured/owned, never stock-searched
  productImages: "photo",
  logos: undefined,
  illustrations: "illustration",
  icons: "vector",
};

// ---------------------------------------------------------------- schema

const Priority = z.enum(["critical", "high", "medium", "low"]);
const ObjectFit = z.enum(["cover", "contain"]);

// One declared slot. `width`/`height` are the slot's size in the pack's AUTHORED
// coordinate space (the 1080x1920 or 1920x1080 the composer was drawn against) — they
// are used for their RATIO and their relative area, never as absolute render pixels, so
// a pack authored at any scale is fine as long as it is internally consistent.
const PlaceholderSchema = z.object({
  id: z.string().min(1),
  // Which scene role this slot belongs to. Omit on a fixed slot that is pinned by
  // `sceneIndex` instead.
  role: z.enum(["hook", "context", "feature", "proof", "how", "quote", "cta"]).optional(),
  // 0-based scene index this slot is pinned to. Omit for role-matched placement.
  sceneIndex: z.number().int().min(0).optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  priority: Priority.default("medium"),
  objectFit: ObjectFit.default("cover"),
  // The kind this slot most wants. Steers ranking, never a hard filter — a slot is
  // always fillable by something rather than left empty.
  kind: z.enum(["screenshots", "productImages", "logos", "illustrations", "icons"]).optional(),
  // Free-text note for the pack author / disclosure UI.
  note: z.string().default(""),
});

// A role slot template: the same shape, minus the id (generated per instance) and the
// role (it is the map key). `count` instantiates N slots on EVERY scene of that role.
const RoleSlotSchema = z.object({
  count: z.number().int().min(0).max(12).default(1),
  width: z.number().positive(),
  height: z.number().positive(),
  priority: Priority.default("medium"),
  objectFit: ObjectFit.default("cover"),
  kind: z.enum(["screenshots", "productImages", "logos", "illustrations", "icons"]).optional(),
  note: z.string().default(""),
});

const MediaSchema = z.object({
  // How many of each kind the template can meaningfully USE. This is the collector's
  // target, not a cap — the pool is deliberately oversampled (see `oversample`) so the
  // ranking engine has something to reject.
  requiredAssets: z
    .object({
      screenshots: z.number().int().min(0).default(0),
      productImages: z.number().int().min(0).default(0),
      logos: z.number().int().min(0).default(0),
      illustrations: z.number().int().min(0).default(0),
      icons: z.number().int().min(0).default(0),
    })
    .default({}),
  placeholders: z.array(PlaceholderSchema).default([]),
  slotsByRole: z.record(RoleSlotSchema).default({}),
  // How many candidates to collect per slot. >1 gives the ranking engine a real choice;
  // 1 means "collect exactly what fits" (for packs whose slots are so specific that a
  // surplus is pure waste). Clamped so a typo cannot explode the fetch budget.
  oversample: z.number().min(1).max(4).default(1.6),
  // Hard ceiling on total collected assets for this pack, regardless of the arithmetic
  // above. A guard for sparse packs whose scenes are long and few.
  maxAssets: z.number().int().min(1).max(120).optional(),
  // Does this pack's composer place assets by `sceneId` (true for essentially every
  // composer) or does it consume a flat ordered pool? Recorded for the placement stage.
  addressing: z.enum(["scene", "pool"]).default("scene"),
  // THE SHEET EVERY SLOT ABOVE IS MEASURED ON. Slot sizes are authored pixels against the
  // composer's own stage (`om_port_kit.stageOf(W,H)`, film_stage's 1080x1920), and are
  // meaningless without it — see the areaShare note in resolveMediaPlan. Normally implied by
  // `orientation`; declared explicitly by a pack that RENDERS at both aspects and therefore
  // declares no orientation, since there is nothing else for the stage to be inferred from.
  stage: z.object({ width: z.number().int().min(16), height: z.number().int().min(16) }).optional(),
});

// ---------------------------------------------------------------- derivation

// Slot geometry for a DERIVED plan, as a fraction of the frame. These are honest
// approximations of what the composer families actually draw, measured against the
// archetypes in scene_kit / om_stage rather than invented:
//   hero    — the opening/feature plate: near-full width, roughly half the height
//   plate   — a standard content visual
//   tile    — a montage/grid cell
//   mark    — a logo lockup (contain-fit, never cropped)
// Ratios differ by aspect because a portrait composer stacks and a landscape one
// splits — the same slot name is a different box in each.
const DERIVED_GEOMETRY = {
  portrait: {
    hero: { w: 0.92, h: 0.46 },
    plate: { w: 0.86, h: 0.36 },
    tile: { w: 0.42, h: 0.30 },
    mark: { w: 0.44, h: 0.14 },
  },
  landscape: {
    hero: { w: 0.52, h: 0.62 },
    plate: { w: 0.46, h: 0.52 },
    tile: { w: 0.24, h: 0.30 },
    mark: { w: 0.18, h: 0.12 },
  },
  square: {
    hero: { w: 0.86, h: 0.52 },
    plate: { w: 0.80, h: 0.44 },
    tile: { w: 0.38, h: 0.34 },
    mark: { w: 0.34, h: 0.14 },
  },
};

// Role -> (slot shape, priority, wanted kind) for a derived plan. The priorities encode
// the product rule directly: the opening hero and the CTA are what a viewer looks at,
// so they are `critical`; the substance scenes are `high`; a quote is a face, and it is
// `low` only because a quote scene's content is the WORDS — an image there is a bonus.
const DERIVED_ROLE = {
  hook: { shape: "hero", priority: "critical", kind: "productImages" },
  cta: { shape: "mark", priority: "critical", kind: "logos" },
  feature: { shape: "plate", priority: "high", kind: "screenshots" },
  how: { shape: "plate", priority: "high", kind: "screenshots" },
  proof: { shape: "plate", priority: "high", kind: "screenshots" },
  context: { shape: "plate", priority: "medium", kind: "productImages" },
  quote: { shape: "tile", priority: "low", kind: "productImages" },
};

// The aspect bucket a job renders at, in the manifest's vocabulary.
function aspectOf(dims) {
  const w = Number(dims && dims.width) || 0;
  const h = Number(dims && dims.height) || 0;
  if (!w || !h) return "landscape";
  const r = w / h;
  if (r >= 1.2) return "landscape";
  if (r <= 0.86) return "portrait";
  return "square";
}

// Which of THESE scenes the chosen renderer can actually draw a picture on. Delegated
// to asset_reuse.buildSlots so there is exactly ONE table — a renderer added there is
// understood here for free, and the two can never disagree about what a template shows.
//
// It must be asked about the REAL scenes, not a synthetic probe: the scene-kit branch
// excludes by POSITION (never the first or last scene), not by role, so a probe built
// one-scene-per-role answers a question nobody asked. Returns a Set of scene INDICES.
// Lazy require: asset_reuse pulls config, and this module is loaded by the manifest
// layer that config itself may touch.
function showableIndicesFor(scenes, renderer, native) {
  const list = Array.isArray(scenes) ? scenes : [];
  try {
    const { buildSlots } = require("./asset_reuse");
    return new Set(buildSlots(list, { native, renderer }).map((s) => s.index));
  } catch {
    // Conservative fallback: the substance scenes, never the open/close.
    const out = new Set();
    list.forEach((sc, i) => {
      const r = roleOf(sc, { index: i, total: list.length });
      if (i > 0 && i < list.length - 1 && r !== "quote" && r !== "cta") out.add(i);
    });
    return out;
  }
}

// A derived media plan for a pack that has not declared one. Conservative by design:
// one slot per showable scene, plus the logo lockup the composers all draw, sized from
// DERIVED_GEOMETRY. Marked `source:"derived"` so consumers can treat it as a floor.
function derivePlan({ scenes, dims, renderer, native }) {
  const aspect = aspectOf(dims);
  const geo = DERIVED_GEOMETRY[aspect] || DERIVED_GEOMETRY.landscape;
  const W = Number(dims && dims.width) || (aspect === "portrait" ? 1080 : 1920);
  const H = Number(dims && dims.height) || (aspect === "portrait" ? 1920 : 1080);
  const list = Array.isArray(scenes) ? scenes : [];
  const showable = showableIndicesFor(list, renderer, native);

  const placeholders = [];
  list.forEach((sc, i) => {
    const role = roleOf(sc, { index: i, total: list.length });
    // A scene the renderer cannot draw on gets NO slot. Declaring one would report
    // coverage the film does not have — the exact "assigned then silently discarded"
    // failure asset_reuse.SHOWABLE_BY_RENDERER exists to prevent.
    if (!showable.has(i)) return;
    const spec = DERIVED_ROLE[role] || DERIVED_ROLE.feature;
    const shape = geo[spec.shape] || geo.plate;
    placeholders.push({
      id: `${sc && sc.id != null ? sc.id : `s${i + 1}`}-${spec.shape}`,
      sceneId: sc && sc.id != null ? String(sc.id) : `s${i + 1}`,
      sceneIndex: i,
      role,
      width: Math.round(W * shape.w),
      height: Math.round(H * shape.h),
      priority: spec.priority,
      // A logo lockup is CONTAIN — cropping a wordmark is never acceptable, and it is
      // why the crop engine skips these entirely.
      objectFit: spec.shape === "mark" ? "contain" : "cover",
      kind: spec.kind,
      note: "",
      derived: true,
    });
  });

  return { placeholders, aspect, showable };
}

// ---------------------------------------------------------------- instantiation

// Turn an AUTHORED media block into concrete, scene-bound placeholders.
function instantiateAuthored(media, { scenes, dims }) {
  const list = Array.isArray(scenes) ? scenes : [];
  const roles = list.map((sc, i) => roleOf(sc, { index: i, total: list.length }));
  const idOf = (i) => (list[i] && list[i].id != null ? String(list[i].id) : `s${i + 1}`);
  const out = [];

  // 1) FIXED slots first — they name their scene explicitly (by index) or by role.
  //    A fixed slot pinned to a scene index that this script does not have is DROPPED,
  //    not clamped: a pack authored for ten panels running a four-scene script should
  //    report four slots, not ten phantom ones the film will never show.
  //
  //    Role-matched fixed slots are handed out ROUND-ROBIN over the scenes of that role,
  //    in declaration order: a pack that declares three `feature` panels running a script
  //    with two feature scenes puts one on each and the third back on the first. That is
  //    the same "spread before stacking" rule the layout director applies to assets
  //    (visual_layout_director.spreadAcrossScenes) — declaring three panels and piling all
  //    three on scene 2 would leave scene 5 bare while over-filling scene 2.
  const roleCursor = new Map(); // role -> how many of its scenes have been handed a slot
  const scenesOfRole = new Map();
  roles.forEach((r, i) => {
    if (!scenesOfRole.has(r)) scenesOfRole.set(r, []);
    scenesOfRole.get(r).push(i);
  });
  for (const p of media.placeholders || []) {
    let idx = null;
    if (Number.isInteger(p.sceneIndex)) {
      if (p.sceneIndex >= list.length) continue;
      idx = p.sceneIndex;
    } else if (p.role) {
      const pool = scenesOfRole.get(p.role);
      if (!pool || !pool.length) continue;      // this script has no scene of that role
      const n = roleCursor.get(p.role) || 0;
      idx = pool[n % pool.length];
      roleCursor.set(p.role, n + 1);
    } else {
      continue; // neither pinned nor role-matched: not placeable
    }
    out.push({
      id: p.id,
      sceneId: idOf(idx),
      sceneIndex: idx,
      role: roles[idx],
      width: p.width,
      height: p.height,
      priority: p.priority,
      objectFit: p.objectFit,
      kind: p.kind,
      note: p.note || "",
      derived: false,
    });
  }

  // 2) ROLE slots — instantiated on every scene of the named role.
  const byRole = media.slotsByRole || {};
  list.forEach((sc, i) => {
    const spec = byRole[roles[i]];
    if (!spec) return;
    for (let n = 0; n < (spec.count || 0); n++) {
      out.push({
        id: `${idOf(i)}-${roles[i]}-${n + 1}`,
        sceneId: idOf(i),
        sceneIndex: i,
        role: roles[i],
        width: spec.width,
        height: spec.height,
        priority: spec.priority,
        objectFit: spec.objectFit,
        kind: spec.kind,
        note: spec.note || "",
        derived: false,
      });
    }
  });

  return out;
}

// ---------------------------------------------------------------- main

/**
 * The media plan for one film: every placeholder the chosen template will try to fill,
 * plus the collection quota that satisfies them.
 *
 * @param {string} pack        the resolved frame-pack id
 * @param {object[]} scenes    the approved script's (or storyboard's) scenes
 * @param {object} dims        { width, height } of the render
 * @param {object} manifest    optional pre-read pack.json (avoids a second read)
 * @returns {{
 *   source: "authored"|"derived"|"hybrid",
 *   pack: string, aspect: string, addressing: string,
 *   placeholders: object[], slotCount: number, criticalCount: number,
 *   requiredAssets: object, quota: object, aspects: number[], oversample: number
 * }}
 */
// The pack's authored stage, via the manifest (lazy require — frame_manifest reads this
// module's MediaSchema, so the two are mutually recursive at load time).
function packStageFor(pack) {
  try { return require("./frame_manifest").packStage(pack); } catch { return null; }
}

function resolveMediaPlan({ pack, scenes, dims, manifest = undefined } = {}) {
  let m = manifest;
  if (m === undefined) {
    try { m = require("./frame_manifest").getManifest(pack); } catch { m = null; }
  }
  const renderer = (m && m.renderer) || "";
  const native = !!renderer;

  let media = null;
  if (m && m.media) {
    try { media = MediaSchema.parse(m.media); }
    catch (e) {
      console.warn(`[template_media] ${pack}/pack.json media block invalid, deriving instead: ${(e && e.message ? String(e.message).split("\n")[0] : e)}`);
      media = null;
    }
  }

  const derivedPlan = derivePlan({ scenes, dims, renderer, native });
  let placeholders;
  let source;
  if (media && (media.placeholders.length || Object.keys(media.slotsByRole).length)) {
    placeholders = instantiateAuthored(media, { scenes, dims });
    source = "authored";
    // A declared block that instantiates to NOTHING for this script (e.g. every fixed
    // slot pinned past the end) must not silently produce a film with no slots at all.
    if (!placeholders.length) {
      placeholders = derivedPlan.placeholders;
      source = "derived";
    }
  } else {
    placeholders = derivedPlan.placeholders;
    source = media ? "hybrid" : "derived"; // `hybrid`: quota authored, geometry derived
  }

  // Stable ordering: by scene, then by priority (critical first). Everything downstream
  // fills in this order, which is what makes "the best asset lands in the best slot" an
  // ordering property rather than a special case.
  placeholders.sort((a, b) =>
    (a.sceneIndex - b.sceneIndex) ||
    (PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]) ||
    String(a.id).localeCompare(String(b.id)));

  // EVERY FILM HAS A MOST-IMPORTANT PICTURE. A plan often has no `critical` slot at all:
  // the conservative slot table excludes the hook (a hook is likeliest to be a pure type
  // moment) and excludes the CTA (its content is the words), so a seven-scene film can end
  // up with five `high` slots and nothing above them. The ranking engine then has no target
  // to protect, and the whole "best asset in the best slot" rule degenerates into "best
  // asset in the first slot that asks".
  //
  // So when nothing is critical, the EARLIEST slot becomes critical. Not an invention — the
  // first visual a viewer sees is the film's hero whatever the pack calls it, and being
  // wrong here costs one slot's worth of over-protection, while being silent costs the
  // guarantee entirely.
  //
  // THIS APPLIES TO AUTHORED PLANS TOO. It originally did not — "authored plans are left
  // exactly as authored" sounded right — but a pack that declares priorities and happens to
  // name none of them critical has made an omission, not a statement, and the first run
  // across all 46 authored packs duly reported `crit 0` for every pack except the om skins.
  // The relative order the author DID express is preserved untouched; this only names a
  // winner when the author named none.
  if (placeholders.length && !placeholders.some((p) => p.priority === "critical")) {
    placeholders[0].priority = "critical";
    placeholders[0].note = (placeholders[0].note ? placeholders[0].note + " · " : "")
      + "promoted: earliest visual in a plan that declared no critical slot";
  }

  // ...AND EXACTLY ONE. The mirror of the rule above, and it is the case that actually occurs:
  // a role declared `critical` with a count of two instantiates two heroes, and a pack whose
  // hook AND lead plate are both critical instantiates one of each. "Critical" then stops
  // meaning anything — the promotion pass would protect several slots equally and the gate
  // would block on whichever happened to be empty.
  //
  // The EARLIEST critical slot keeps the title (it is the first one a viewer sees); the rest
  // fall back to `high`, which is still ahead of everything else and is what they would have
  // been had the pack ranked them against each other.
  const criticals = placeholders.filter((p) => p.priority === "critical");
  if (criticals.length > 1) {
    for (const p of criticals.slice(1)) {
      p.priority = "high";
      p.note = (p.note ? p.note + " · " : "") + "demoted: a film has one most-important picture";
    }
  }

  // Annotate each slot with its aspect ratio + a normalized area share. The crop engine
  // buckets by `aspect`; the ranking engine and the frame_selector's supply routing use
  // `areaShare` to know how much of the frame a box would actually occupy.
  //
  // A SLOT'S PIXELS BELONG TO THE PACK'S STAGE, NOT TO THE DELIVERED FRAME.
  //
  // This divided the authored `w x h` by the JOB's pixel area, which conflates three different
  // frames and was wrong on two independent axes:
  //
  //   • RESOLUTION. The same pack scored 900x516/(1280x720) = 50% at 720p and 22% at 1080p —
  //     the identical design, rated twice as dense for being rendered smaller. Coverage is a
  //     property of a composition, and cannot depend on the encoder's output size.
  //   • ASPECT. A composer lays out in `cqw`, so an authored box occupies `w/stageW` of the
  //     frame's WIDTH and `h/stageW` of it too — a HEIGHT expressed in width units. Rendered at
  //     a different aspect, its share of the frame's height therefore scales by the aspect
  //     ratio between the two frames. showcase's 1119x544 hook computed 29.4% of a 1080x1920
  //     frame and truly renders 9.3%: overstated 3.2x, on exactly the cross-aspect pairing the
  //     supply router exists to catch.
  //
  // So: express the box against the pack's OWN stage, then map that stage onto the job's.
  // Algebraically identical to the old formula whenever the two frames match, which keeps every
  // same-aspect 1080p pairing byte-identical. A pack with no declared stage keeps the legacy
  // reading — an unknown stage is not guessed.
  const stage = packStageFor(pack);
  const jobW = Number(dims && dims.width) || 1920, jobH = Number(dims && dims.height) || 1080;
  for (const p of placeholders) {
    p.aspect = Math.round((p.width / p.height) * 1000) / 1000;
    const share = stage
      ? (p.width / stage.width) * (p.height / stage.width) * (jobW / jobH)
      : (p.width * p.height) / (jobW * jobH);
    // A box cannot cover more than the frame. Clamping keeps a mis-declared stage from
    // handing the router a coverage score no layout could deliver.
    p.areaShare = Math.round(Math.min(1, share) * 1000) / 1000;
    p.weight = PRIORITY_WEIGHT[p.priority] || 40;
  }

  const requiredAssets = quotaFromPlan(placeholders, media);
  const oversample = (media && media.oversample) || 1.6;
  const aspects = [...new Set(placeholders.filter((p) => p.objectFit === "cover").map((p) => p.aspect))].sort((a, b) => a - b);

  return {
    source,
    pack: pack || null,
    renderer,
    native,
    aspect: derivedPlan.aspect,
    addressing: (media && media.addressing) || "scene",
    placeholders,
    slotCount: placeholders.length,
    criticalCount: placeholders.filter((p) => p.priority === "critical").length,
    requiredAssets,
    oversample,
    maxAssets: (media && media.maxAssets) || null,
    // The distinct cover-fit aspect ratios this film needs a crop for. The crop engine
    // analyses ONCE PER BUCKET rather than once per slot — typically 2-3 buckets even on
    // a ten-panel pack, which is what keeps per-placeholder cropping affordable.
    aspects,
  };
}

// The per-kind collection quota implied by a plan. An AUTHORED `requiredAssets` wins
// where it is non-zero (the pack author knows its layout); every other kind is counted
// from the instantiated slots, so a plan always carries a number even when the pack
// declared only geometry.
function quotaFromPlan(placeholders, media) {
  const counted = { screenshots: 0, productImages: 0, logos: 0, illustrations: 0, icons: 0 };
  for (const p of placeholders) {
    const k = p.kind || "productImages";
    if (counted[k] != null) counted[k]++;
  }
  // Every film wants exactly one logo — more is a duplicate, none is a missed brand
  // moment. Floor it here rather than making every pack author remember.
  counted.logos = Math.max(counted.logos, 1);
  const declared = (media && media.requiredAssets) || null;
  if (!declared) return counted;
  const out = { ...counted };
  for (const k of KINDS) if (declared[k]) out[k] = declared[k];
  return out;
}

/**
 * How many assets to COLLECT for this plan, per kind, including oversampling.
 * This is the number `asset_planner` should chase — the point of the whole phase.
 *
 * `floor` is the duration-derived budget the pipeline already computes
 * (asset_budget.computeAssetBudget). It knows the film's LENGTH; the plan knows the
 * template's APPETITE. Neither alone is the answer, and the rule that combines them is:
 *
 *     target = max(slots x oversample, min(floor.total, slots x HEADROOM))
 *
 * Read the two halves separately:
 *   • `slots x oversample` is the RAISE. A ten-panel product tour needs more than a
 *     30-second duration budget implies, and it now gets it — this is the fix for
 *     "some templates do not receive enough images".
 *   • `min(floor, slots x HEADROOM)` is the CAP. A template that can place two pictures
 *     across the whole film has no use for fifteen candidates: the extra thirteen are
 *     downloaded, probed, scored, cropped and discarded, which is pure wall-clock on the
 *     critical path. This is the fix for the other half of the complaint.
 *
 * HEADROOM is deliberately generous (2.5 candidates per slot even after oversampling)
 * because rejecting a bad asset requires having a better one to reject it FOR — starving
 * the ranker would trade one defect for another.
 */
const HEADROOM = 2.5;

function collectionTargetFor(plan, floor = {}) {
  const os = plan.oversample || 1.6;
  const want = {};
  for (const k of KINDS) {
    const need = Number(plan.requiredAssets[k]) || 0;
    // Logos and screenshots are OWNED material — they are captured or uploaded, not
    // stock-searched, so oversampling them means "capture more pages", not "fetch more".
    want[k] = k === "logos" ? Math.min(1, need) : Math.ceil(need * os);
  }
  const slots = Math.max(1, Number(plan.slotCount) || 0);
  const floorTotal = Number(floor.total) || 0;
  const total = Math.max(Math.ceil(slots * os), Math.min(floorTotal, Math.ceil(slots * HEADROOM)));
  const capped = plan.maxAssets ? Math.min(total, plan.maxAssets) : total;
  return {
    ...want,
    // Distribute the (possibly raised) stock total back across the searchable kinds,
    // preserving the floor's own photo/vector/video split where the plan is silent.
    total: capped,
    maxPhotos: Math.max(Number(floor.maxPhotos) || 0, want.productImages),
    maxVectors: Math.max(Number(floor.maxVectors) || 0, want.illustrations + want.icons),
    maxVideos: Number(floor.maxVideos) || 0,
    maxScreenshots: Math.max(Number(floor.maxScreenshots) || 0, want.screenshots),
    maxUploads: Number(floor.maxUploads) || 6,
    maxBrand: Number(floor.maxBrand) || 4,
    cdMaxTopUp: Number(floor.cdMaxTopUp) || 3,
    cdMaxPerScene: Number(floor.cdMaxPerScene) || 2,
    // Provenance for the disclosure UI + the logs: did the TEMPLATE raise this, and by
    // how much? "8 → 14 because showcase declares ten panels" is the sentence an
    // operator needs; "14" alone is not.
    __raisedBy: capped - floorTotal,          // negative when the template CAPPED the floor
    __planSource: plan.source,
    __slotCount: plan.slotCount,
  };
}

/**
 * HOW MANY SCREENSHOTS TO CAPTURE, decided BEFORE the browser opens.
 *
 * This is the awkward one, and the awkwardness is structural: screenshots are captured at
 * INTAKE (project_pipeline.runIntake), and the frame pack is not chosen until PRODUCTION
 * (graph.frameSelectorAgent). So at the moment of capture there is usually no single template
 * to ask — which is why the capture cap was a literal `3` and why a pack that can place ten
 * screenshots only ever saw three.
 *
 * Two cases, and the first is exact:
 *   • the user PINNED a pack (intent.preferences.framePack !== "auto") — ask that pack.
 *   • "auto" — the pack is unknowable, so ask the HUNGRIEST installed pack. Capturing for the
 *     appetite we might need is the right side to err on: an unused capture costs one scroll
 *     and one PNG, while a missing one cannot be recovered without relaunching Chrome in the
 *     middle of production.
 *
 * Clamped hard. `cap` exists because "the hungriest pack" is a number that grows every time
 * someone authors an ambitious template, and nobody should discover that by watching intake
 * take a minute longer.
 */
function screenshotAppetite(pack) {
  try {
    const m = require("./frame_manifest").getManifest(pack);
    const n = m && m.media && m.media.requiredAssets && Number(m.media.requiredAssets.screenshots);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

function captureTarget({ framePack = null, cap = 6, floor = 3 } = {}) {
  const clamp = (n) => Math.max(floor, Math.min(cap, n));
  try {
    if (framePack && framePack !== "auto") {
      const n = screenshotAppetite(framePack);
      return { target: clamp(n || floor), source: `pack ${framePack}`, appetite: n };
    }
    const registry = require("./frame_registry");
    let best = 0, bestPack = null;
    for (const p of registry.listPacks()) {
      const n = screenshotAppetite(p);
      if (n > best) { best = n; bestPack = p; }
    }
    return { target: clamp(best || floor), source: best ? `hungriest installed pack (${bestPack} wants ${best})` : "default", appetite: best };
  } catch {
    // FAIL-OPEN: an unreadable registry must never stop a capture — it just captures as before.
    return { target: floor, source: "fallback", appetite: 0 };
  }
}

/** Slots that MUST be filled for the film to read as designed. */
function criticalPlaceholders(plan) {
  return (plan.placeholders || []).filter((p) => p.priority === "critical");
}

/**
 * How many pictures each scene can show, keyed by scene id. Logo lockups are excluded — they
 * are the pack's own brand treatment, fed by find(isLogo), not from the asset pool.
 */
function slotsPerScene(plan) {
  const out = new Map();
  for (const p of (plan && plan.placeholders) || []) {
    if (p.kind === "logos") continue;
    const k = String(p.sceneId);
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

/**
 * HAS THIS SCENE GOT ALL THE PICTURES IT CAN SHOW? — the predicate that decides whether the
 * planner still asks for stock on a scene that already owns pinned material.
 *
 * It used to be a BOOLEAN ("does this scene own any pin at all?"), written when nothing knew how
 * many pictures a scene could hold. That is the binding constraint on "not enough images":
 * `scene_role.showcaseTargets` returns EVERY feature/proof/how/context scene, so on a
 * website-ingest job the screenshot and harvested-brand pins claim essentially every substance
 * scene and silence its stock needs. Audited job ahtquvd86o shipped 9 assets of which exactly
 * ONE was stock, while its own budget said maxPhotos = 9 — raising the budget cannot fix that,
 * because the wants were never created.
 *
 * With a slot count it is arithmetic. Without one (`slots` empty) it degrades to the old boolean,
 * so a pack with no media contract behaves exactly as before.
 */
function sceneIsSatisfied(sceneId, { pins, slots }) {
  const k = String(sceneId);
  const n = (pins && pins.get(k)) || 0;
  if (!n) return false;
  if (!slots || !slots.size) return true;      // no plan: any pin satisfies, as it always did
  return n >= (slots.get(k) || 1);
}

/** A compact, loggable one-liner. */
function describePlan(plan) {
  const byPriority = PRIORITIES
    .map((pr) => {
      const n = (plan.placeholders || []).filter((p) => p.priority === pr).length;
      return n ? `${n} ${pr}` : null;
    })
    .filter(Boolean)
    .join(" / ");
  const req = KINDS.map((k) => (plan.requiredAssets[k] ? `${plan.requiredAssets[k]} ${k}` : null)).filter(Boolean).join(", ");
  return `${plan.pack || "?"} [${plan.source}] ${plan.slotCount} slot(s) (${byPriority || "none"})`
    + ` · wants ${req || "nothing"} · ${plan.aspects.length} crop aspect(s)`;
}

module.exports = {
  MediaSchema, PlaceholderSchema, RoleSlotSchema,
  resolveMediaPlan, collectionTargetFor, criticalPlaceholders, describePlan,
  slotsPerScene, sceneIsSatisfied, screenshotAppetite, captureTarget,
  aspectOf, derivePlan, quotaFromPlan,
  PRIORITIES, PRIORITY_WEIGHT, KINDS, KIND_CATEGORIES, KIND_PREF,
};
