#!/usr/bin/env node
// APPLY TEMPLATE MEDIA CONTRACTS — writes the `media` block into every frames/<pack>/pack.json.
//
// WHAT THE BLOCK IS FOR. Until it existed, nothing in the pipeline ever asked the chosen
// template how many pictures it could show. `asset_budget.computeAssetBudget` sizes the
// candidate pool from DURATION and SCENE COUNT alone, so `drive` (which places fifteen pictures
// across a 7-scene film) and `fetch` (which places six) were handed the identical stock ceiling.
// One starved; the other collected, scored, cropped and then discarded most of what it was
// given. See services/template_media.js for the contract and its consumers.
//
// THE NUMBERS ARE MEASURED, NOT ESTIMATED. Every capacity below was read out of the pack's own
// composer: the `spec.slots(role, budget)` function for the om_port_kit family, the
// SHOT_CAPACITY table for om_stage and prisma, and a counted pass over the scene builders for
// the rest. `capacity` is the number of pictures a typical 7-scene film actually places —
// obtained by running om_port_kit.assignRoles against each spec — and `perScene` is the most
// any single beat can draw. Each entry carries the file:line it came from.
//
// AN EARLIER PASS OF THIS FILE GUESSED THOSE NUMBERS AND WAS SYSTEMATICALLY LOW, because it
// confused a per-BEAT slot count with a per-FILM total: `fetch` declares `title|fetch = 1` and
// was recorded as a two-picture template, when a 7-scene film gives it six beats and therefore
// six pictures. Measured corrections: fetch 2→6, hacker 4→8, pipeline 5→10, jungle 5→10,
// deep 6→10, edition 5→9, flight 6→9, drive 11→15, the seven om_stage skins 8→12.
//
// Re-runnable and idempotent: it rewrites the `media` key and touches nothing else.
//
//   node scripts/apply-media-profiles.js          # write
//   node scripts/apply-media-profiles.js --check  # verify only, non-zero exit on drift
//
// AUTHORING RULES:
//   · `roles` is keyed by CANONICAL scene role (services/scene_role.js), and for the
//     om_port_kit family that mapping is deliberately approximate: om_port_kit.assignRoles pins
//     only the first and last scene and ROTATES its middle layouts, never reading scene_role at
//     all. So hook and cta are exact; the middles are recorded against the substance default.
//   · `count` is per SCENE of that role, bounded by the composer's real per-beat ceiling and
//     hard-capped at 3. Over-declaring assigns assets into capacity the weave then slices away
//     and reports the loss as coverage — the failure om_stage's SHOT_CAPACITY comment documents.
//   · `wf`/`hf` are the box as a fraction of the frame, written out as pixels against the pack's
//     authored stage. template_media reads them for their RATIO and their relative AREA.
//   · quote and cta never become asset slots: their content is the words and the call to action.
//   · A LOGO LOCKUP is not an asset slot — it is the pack's own brand treatment, fed by
//     find(isLogo), so it is counted in `requiredAssets.logos` and never declared as a slot.
//   · A CONTAIN-FIT CONTENT PLATE *IS* a slot, and reading `objectFit === "contain"` as
//     "not a slot" was wrong: om_stage.fitFor (om_stage.js:433) returns `contain` for every
//     screenshot and every owned asset, so the seven om skins letterbox nearly all of their
//     pictures inside designed frames. Filtering those out dropped most of their real slots.
//     Contain only means the picture is never CROPPED — the crop engine skips it, the slot
//     accounting does not.

const fs = require("node:fs");
const path = require("node:path");

const FRAMES = path.resolve(__dirname, "..", "..", "frames");

// pack -> measured capacity, per-beat ceiling, asset appetite, and per-role box geometry.
const MEASURED = {
  "aurora-spectrum": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 5, logos: 1, illustrations: 2 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "NO `slots:`/SHOT_CAPACITY table exists for scene_kit — capacity is counted from the weave. The governing knobs are visual_layout_director.js:40 `const",
  },
  "bauhaus-print": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 3, logos: 1, illustrations: 4 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No `slots:`/SHOT_CAPACITY exists; the ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };` / :42 `const ",
  },
  "bauhaus-riot": {
    capacity: 4, perScene: 1, aspect: "agnostic",
    wants: { screenshots: 2, productImages: 3, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.68, hf: 0.225, priority: "critical", fit: "contain", kind: "productImages" },
      how: { count: 1, wf: 0.68, hf: 0.225, priority: "high", fit: "contain", kind: "productImages", inferred: true },
      proof: { count: 1, wf: 0.68, hf: 0.225, priority: "high", fit: "contain", kind: "productImages", inferred: true },
      context: { count: 1, wf: 0.68, hf: 0.225, priority: "medium", fit: "contain", kind: "productImages", inferred: true },
    },
    evidence: "bauhaus_composer.js:549-550 `if (!ends && byScene.has(sid)) { arch = \"plate\"; asset = byScene.get(sid); } else if (arch === \"figure\" && pooli < pool.l",
  },
  "biennale-yellow": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 3, logos: 1, illustrations: 4 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "blockframe": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 3, logos: 1, illustrations: 4 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "bloom-fable": {
    capacity: 5, perScene: 1, aspect: "agnostic",
    wants: { screenshots: 2, productImages: 3, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.78, hf: 0.25, priority: "high", fit: "contain", kind: "screenshots" },
      how: { count: 1, wf: 0.78, hf: 0.25, priority: "high", fit: "contain", kind: "screenshots", inferred: true },
      proof: { count: 1, wf: 0.78, hf: 0.25, priority: "high", fit: "contain", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.78, hf: 0.25, priority: "medium", fit: "contain", kind: "screenshots", inferred: true },
    },
    evidence: "No `slots:`/SHOT_CAPACITY declaration. Capacity is bounded by the scene loop — bloom_composer.js:636-638: `const ends = arch === \"title\" || arch === \"",
  },
  "bloom-illustrated": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 3, logos: 1, illustrations: 4 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "blueprint-atelier": {
    capacity: 4, perScene: 1, aspect: "agnostic",
    wants: { screenshots: 4, productImages: 1, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.84, hf: 0.27, priority: "critical", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.84, hf: 0.27, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 1, wf: 0.84, hf: 0.27, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.84, hf: 0.27, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "blueprint_composer.js:733-734 `if (!ends && byScene.has(sid)) { arch = \"plate\"; asset = byScene.get(sid); } else if (arch === \"figure\" && pooli < pool",
  },
  "brightlife": {
    capacity: 7, perScene: 3, aspect: "agnostic",
    wants: { screenshots: 4, productImages: 3, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.55, hf: 0.17, priority: "critical", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.28, hf: 0.1, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 0.36, hf: 0.13, priority: "medium", fit: "cover", kind: "productImages" },
      context: { count: 1, wf: 0.26, hf: 0.09, priority: "medium", fit: "cover", kind: "productImages" },
    },
    evidence: "No `slots:` arrow or SHOT_CAPACITY constant; assignPlates is the capacity table — brightlife_composer.js:910-928: `if (type === \"solution\") { const a ",
  },
  "daybreak-bakehouse": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 3, productImages: 9, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "cover", kind: "productImages" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (shared engine; capacityOf ",
  },
  "deep": {
    capacity: 10, perScene: 3, aspect: "landscape",
    wants: { screenshots: 3, productImages: 7, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.365, hf: 0.648, priority: "critical", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.284, hf: 0.505, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.284, hf: 0.505, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      proof: { count: 2, wf: 0.284, hf: 0.505, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      context: { count: 2, wf: 0.284, hf: 0.505, priority: "medium", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "deep_composer.js:270 — `slots: (role, budget) => (role === \"descend\" || role === \"discover\" || role === \"pocket\" ? 1 : role === \"explore\" ? Math.min(3",
  },
  "drive": {
    capacity: 15, perScene: 6, aspect: "landscape",
    wants: { screenshots: 13, productImages: 2, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.604, hf: 0.509, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 3, wf: 0.563, hf: 0.519, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 3, wf: 0.563, hf: 0.519, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 3, wf: 0.563, hf: 0.519, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 3, wf: 0.563, hf: 0.519, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "drive_composer.js:412-414 — `slots: (role, budget) => (role === \"intro\" ? 1 : role === \"billboards\" || role === \"feature\" ? Math.min(2, Math.max(0, bu",
  },
  "edition": {
    capacity: 9, perScene: 3, aspect: "landscape",
    wants: { screenshots: 7, productImages: 2, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.375, hf: 0.259, priority: "high", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.469, hf: 0.722, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.469, hf: 0.722, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 2, wf: 0.469, hf: 0.722, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 2, wf: 0.469, hf: 0.722, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "edition_composer.js:360 — `slots: (role, budget) => (role === \"spread\" ? Math.min(3, Math.max(0, budget)) : role === \"cover\" || role === \"lead\" ? 1 : ",
  },
  "fable-storybook": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 3, logos: 1, illustrations: 4 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "fetch": {
    capacity: 6, perScene: 1, aspect: "landscape",
    wants: { screenshots: 2, productImages: 5, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.411, hf: 0.519, priority: "critical", fit: "cover", kind: "productImages" },
      feature: { count: 1, wf: 0.448, hf: 0.469, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 1, wf: 0.448, hf: 0.469, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      proof: { count: 1, wf: 0.448, hf: 0.469, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      context: { count: 1, wf: 0.448, hf: 0.469, priority: "medium", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "fetch_composer.js:244 — `slots: (role) => (role === \"title\" || role === \"fetch\" ? 1 : 0),` (shapes, fetch_composer.js:243 — `shapes: { title: [790 / 5",
  },
  "fight": {
    capacity: 5, perScene: 2, aspect: "landscape",
    wants: { screenshots: 2, productImages: 4, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.323, hf: 0.704, priority: "critical", fit: "cover", kind: "productImages" },
      feature: { count: 1, wf: 0.469, hf: 0.519, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.469, hf: 0.519, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 1, wf: 0.469, hf: 0.519, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.469, hf: 0.519, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "fight_composer.js:310 — `slots: (role, budget) => (role === \"main\" || role === \"champion\" ? 1 : role === \"tape\" ? Math.min(2, Math.max(0, budget)) : 0",
  },
  "flagship": {
    capacity: 8, perScene: 3, aspect: "agnostic",
    wants: { screenshots: 4, productImages: 4, logos: 1 },
    roles: {
      feature: { count: 2, wf: 0.63, hf: 0.22, priority: "critical", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.32, hf: 0.11, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 0.42, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      context: { count: 2, wf: 0.24, hf: 0.09, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "No `slots:` arrow or SHOT_CAPACITY constant, but assignPlates IS the capacity table — flagship_composer.js:798-815: `if (type === \"solution\") { const ",
  },
  "flight": {
    capacity: 9, perScene: 3, aspect: "landscape",
    wants: { screenshots: 6, productImages: 3, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.378, hf: 0.42, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.54, hf: 0.527, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 1, hf: 1, priority: "low", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 1, hf: 1, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      context: { count: 2, wf: 1, hf: 1, priority: "medium", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "flight_composer.js:311 — `slots: (role, budget) => (role === \"gate\" || role === \"climb\" ? 1 : role === \"instruments\" ? Math.min(1, Math.max(0, budget)",
  },
  "flight-vertical": {
    capacity: 6, perScene: 3, aspect: "portrait",
    wants: { screenshots: 6, productImages: 6, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.837, hf: 0.232, priority: "critical", fit: "cover", kind: "screenshots" },
      context: { count: 1, wf: 0.837, hf: 0.332, priority: "high", fit: "cover", kind: "screenshots" },
      feature: { count: 1, wf: 0.837, hf: 0.129, priority: "medium", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 1, hf: 1, priority: "low", fit: "cover", kind: "productImages" },
      how: { count: 1, wf: 1, hf: 1, priority: "high", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "server/src/services/flight_composer.js:311 `slots: (role, budget) => (role === \"gate\" || role === \"climb\" ? 1 : role === \"instruments\" ? Math.min(1, M",
  },
  "grid-dispatch": {
    capacity: 7, perScene: 2, aspect: "portrait",
    wants: { screenshots: 5, productImages: 2, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.88, hf: 0.35, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 1, wf: 0.88, hf: 0.3, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.88, hf: 0.13, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 0.88, hf: 0.24, priority: "high", fit: "cover", kind: "screenshots" },
      context: { count: 1, wf: 0.88, hf: 0.3, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "grid_dispatch_composer.js:1337-1344 `function slotsFor(role, scene) { if (role === \"hook\") return 1; if (role === \"solution\") return 2; if (role === \"",
  },
  "hacker": {
    capacity: 8, perScene: 2, aspect: "landscape",
    wants: { screenshots: 8, productImages: 3, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.417, hf: 0.539, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.625, hf: 0.669, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 0.281, hf: 0.243, priority: "medium", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.625, hf: 0.669, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 2, wf: 0.625, hf: 0.669, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "server/src/services/hacker_composer.js:294 — `slots: (role, budget) => (role === \"nodes\" ? Math.min(2, Math.max(0, budget)) : role === \"boot\" || role ",
  },
  "hype-wave": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 3, productImages: 9, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "cover", kind: "productImages" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (shared engine; capacityOf ",
  },
  "jungle": {
    capacity: 10, perScene: 3, aspect: "landscape",
    wants: { screenshots: 5, productImages: 10, logos: 1, illustrations: 2 },
    roles: {
      hook: { count: 1, wf: 0.388, hf: 0.504, priority: "critical", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.46, hf: 0.559, priority: "high", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.278, hf: 0.485, priority: "medium", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.46, hf: 0.559, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      context: { count: 2, wf: 0.46, hf: 0.559, priority: "medium", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "server/src/services/jungle_composer.js:242 — `slots: (role, budget) => (role === \"enter\" || role === \"discover\" ? 1 : role === \"sightings\" ? Math.min(",
  },
  "kinetic-bold": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 3, logos: 1, illustrations: 4 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "illustrations" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "lantern-night": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 3, productImages: 9, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "cover", kind: "productImages" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (shared engine; capacityOf ",
  },
  "midnight-glass": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 5, logos: 1, illustrations: 2 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "productImages" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "momentum": {
    capacity: 4, perScene: 2, aspect: "landscape",
    wants: { screenshots: 4, productImages: 4, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.469, hf: 0.531, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 0.533, hf: 0.519, priority: "medium", fit: "cover", kind: "productImages" },
      how: { count: 1, wf: 0.533, hf: 0.519, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      context: { count: 1, wf: 0.533, hf: 0.519, priority: "medium", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "server/src/services/momentum_composer.js:474 — `slots: (role, budget) => (role === \"feature\" || role === \"mobile\" ? 1 : role === \"gallery\" ? Math.min(",
  },
  "mono-corporate": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 5, logos: 1, illustrations: 2 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "productImages" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "motion-canvas": {
    capacity: 8, perScene: 3, aspect: "portrait",
    wants: { screenshots: 8, productImages: 8, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.594, hf: 0.334, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.594, hf: 0.334, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 0.594, hf: 0.334, priority: "medium", fit: "cover", kind: "screenshots" },
      context: { count: 2, wf: 0.47, hf: 0.264, priority: "medium", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.594, hf: 0.334, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "NO declared slots/SHOT_CAPACITY table — counted from the scene builders. The governing line is server/src/services/motion_canvas_composer.js:639 `if (",
  },
  "noir-spotlight": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 5, logos: 1, illustrations: 2 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "productImages" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
  "orbit": {
    capacity: 7, perScene: 5, aspect: "landscape",
    wants: { screenshots: 7, productImages: 3, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.469, hf: 0.478, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 0.269, hf: 0.23, priority: "medium", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.469, hf: 0.478, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.469, hf: 0.478, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "server/src/services/orbit_composer.js:484 — `slots: (role, budget) => (role === \"feature\" ? 1 : role === \"fleet\" ? Math.min(5, Math.max(0, budget)) : ",
  },
  "organic-garden": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 9, productImages: 3, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "contain", kind: "screenshots" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "contain", kind: "screenshots" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "contain", kind: "screenshots" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "screenshots" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (capacityOf at :594; enforc",
  },
  "paper-craft": {
    capacity: 8, perScene: 3, aspect: "portrait",
    wants: { screenshots: 8, productImages: 8, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.468, hf: 0.24, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.663, hf: 0.34, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 0.663, hf: 0.34, priority: "medium", fit: "cover", kind: "screenshots" },
      context: { count: 2, wf: 0.486, hf: 0.249, priority: "medium", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.663, hf: 0.34, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "NO declared slots/SHOT_CAPACITY table — counted from the scene builders. The governing line is server/src/services/paper_craft_composer.js:698-699 `if",
  },
  "paper-tales": {
    capacity: 5, perScene: 1, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 2, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.74, hf: 0.28, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.74, hf: 0.28, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 1, wf: 0.74, hf: 0.28, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.74, hf: 0.28, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No `slots:`/SHOT_CAPACITY declaration. Capacity is bounded by the scene loop — paper_tales_composer.js:760-766: `const ends = arch === \"cover\" || arch",
  },
  "pipeline": {
    capacity: 10, perScene: 3, aspect: "landscape",
    wants: { screenshots: 10, productImages: 6, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.429, hf: 0.47, priority: "critical", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.406, hf: 0.389, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 0.284, hf: 0.433, priority: "medium", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.406, hf: 0.389, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 2, wf: 0.406, hf: 0.389, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "server/src/services/pipeline_composer.js:263 — `slots: (role, budget) => (role === \"boot\" || role === \"inspect\" ? 1 : role === \"assemble\" ? Math.min(3",
  },
  "poster-pop": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 3, productImages: 9, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "cover", kind: "productImages" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (shared engine; capacityOf ",
  },
  "premiere-night": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 3, productImages: 9, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "cover", kind: "productImages" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (shared engine; capacityOf ",
  },
  "prisma-bloc": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 8, productImages: 4, logos: 7, icons: 6 },
    roles: {
      feature: { count: 2, wf: 0.778, hf: 0.344, priority: "critical", fit: "contain", kind: "screenshots" },
      how: { count: 2, wf: 0.159, hf: 0.064, priority: "low", fit: "contain", kind: "productImages" },
      proof: { count: 2, wf: 0.852, hf: 0.172, priority: "medium", fit: "contain", kind: "screenshots" },
      context: { count: 2, wf: 0.389, hf: 0.151, priority: "medium", fit: "contain", kind: "productImages" },
    },
    evidence: "prisma_composer.js:770 `const SHOT_CAPACITY = { stats: 1, voice: 1, showcase: 2, gallery: 3, statement: 3, grid: 4, cards: 4, swatch: 4 };` and :771 `",
  },
  "reel": {
    capacity: 5, perScene: 1, aspect: "portrait",
    wants: { screenshots: 3, productImages: 5, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.833, hf: 0.344, priority: "critical", fit: "cover", kind: "productImages" },
      feature: { count: 1, wf: 0.852, hf: 0.563, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 1, hf: 1, priority: "low", fit: "cover", kind: "productImages" },
      how: { count: 1, wf: 1, hf: 1, priority: "high", fit: "cover", kind: "productImages", inferred: true },
      context: { count: 1, wf: 1, hf: 1, priority: "medium", fit: "cover", kind: "productImages", inferred: true },
    },
    evidence: "server/src/services/reel_composer.js:277 — `slots: (role, budget) => (role === \"hook\" || role === \"show\" ? 1 : role === \"numbers\" ? Math.min(1, Math.m",
  },
  "showcase": {
    capacity: 10, perScene: 6, aspect: "landscape",
    wants: { screenshots: 10, productImages: 6, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.583, hf: 0.504, priority: "critical", fit: "cover", kind: "screenshots" },
      context: { count: 2, wf: 0.521, hf: 0.531, priority: "high", fit: "cover", kind: "screenshots" },
      feature: { count: 2, wf: 0.615, hf: 0.569, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.181, hf: 0.7, priority: "high", fit: "cover", kind: "screenshots" },
      proof: { count: 2, wf: 0.288, hf: 0.254, priority: "medium", fit: "cover", kind: "screenshots" },
    },
    evidence: "server/src/services/showcase_composer.js:919-923 `function slotsFor(role, available) { if (role === \"montage\") return Math.min(6, Math.max(0, availabl",
  },
  "showcase-vertical": {
    capacity: 6, perScene: 3, aspect: "portrait",
    wants: { screenshots: 6, productImages: 4, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.889, hf: 0.382, priority: "critical", fit: "cover", kind: "screenshots" },
      context: { count: 1, wf: 0.456, hf: 0.553, priority: "high", fit: "cover", kind: "screenshots" },
      feature: { count: 1, wf: 0.815, hf: 0.518, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.87, hf: 0.195, priority: "medium", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 0.815, hf: 0.518, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "server/src/services/showcase_vertical_composer.js:287 `slots: (role, budget) => (role === \"intro\" || role === \"tour\" || role === \"detail\" ? 1 : role =",
  },
  "slab-stage": {
    capacity: 6, perScene: 2, aspect: "portrait",
    wants: { screenshots: 4, productImages: 2, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.435, hf: 0.412, priority: "medium", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.435, hf: 0.412, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 1, wf: 0.435, hf: 0.412, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.435, hf: 0.412, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "slab_stage_composer.js:878 `function slotsFor(role) { return /^tour/.test(role) ? 2 : 0; }` and :879 `const SLOT_SHAPES = { tourRead: [1.5, 0.5625], t",
  },
  "story-blocks": {
    capacity: 12, perScene: 4, aspect: "portrait",
    wants: { screenshots: 9, productImages: 3, logos: 1 },
    roles: {
      hook: { count: 1, wf: 0.844, hf: 0.24, priority: "critical", fit: "contain", kind: "screenshots" },
      context: { count: 2, wf: 0.867, hf: 0.224, priority: "medium", fit: "cover", kind: "productImages" },
      feature: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "contain", kind: "screenshots" },
      how: { count: 2, wf: 0.844, hf: 0.292, priority: "high", fit: "contain", kind: "screenshots" },
      proof: { count: 2, wf: 1, hf: 0.521, priority: "low", fit: "cover", kind: "screenshots" },
    },
    evidence: "server/src/services/om_stage.js:593 — `const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };` (shared engine; capacityOf ",
  },
  "teampulse": {
    capacity: 6, perScene: 2, aspect: "portrait",
    wants: { screenshots: 4, productImages: 6, logos: 1 },
    roles: {
      context: { count: 1, wf: 0.896, hf: 0.281, priority: "high", fit: "cover", kind: "screenshots" },
      feature: { count: 1, wf: 0.896, hf: 0.252, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.896, hf: 0.252, priority: "medium", fit: "cover", kind: "screenshots" },
      proof: { count: 1, wf: 1, hf: 1, priority: "low", fit: "cover", kind: "productImages" },
    },
    evidence: "server/src/services/teampulse_composer.js:784-785 `slots: (role, budget) => (role === \"showcase\" ? (budget >= 4 ? 2 : Math.min(1, Math.max(0, budget))",
  },
  "terminal-departures": {
    capacity: 4, perScene: 1, aspect: "agnostic",
    wants: { screenshots: 4, productImages: 1, logos: 1 },
    roles: {
      feature: { count: 1, wf: 0.8, hf: 0.248, priority: "critical", fit: "cover", kind: "screenshots" },
      how: { count: 1, wf: 0.8, hf: 0.248, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      proof: { count: 1, wf: 0.8, hf: 0.248, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
      context: { count: 1, wf: 0.8, hf: 0.248, priority: "medium", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "terminal_departures_composer.js:688-689 `if (!ends && byScene.has(sid)) { arch = \"screen\"; asset = byScene.get(sid); } else if (!ends && (arch === \"se",
  },
  "vapor-chrome": {
    capacity: 10, perScene: 6, aspect: "agnostic",
    wants: { screenshots: 3, productImages: 5, logos: 1, illustrations: 2 },
    roles: {
      feature: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots" },
      how: { count: 2, wf: 0.52, hf: 0.34, priority: "medium", fit: "contain", kind: "productImages" },
      context: { count: 2, wf: 0.43, hf: 0.15, priority: "medium", fit: "cover", kind: "productImages" },
      proof: { count: 2, wf: 0.9, hf: 0.38, priority: "high", fit: "cover", kind: "screenshots", inferred: true },
    },
    evidence: "No declared slots table; ceilings are visual_layout_director.js:40 `const BUDGET = { screenshot: 3, photo: 6, vector: 6 };`, :42 `const MONTAGE_MAX = ",
  },
};

const FRAME_FOR = { portrait: [1080, 1920], landscape: [1920, 1080], square: [1440, 1440], agnostic: [1920, 1080] };

function buildMedia(name, manifest) {
  const spec = MEASURED[name];
  if (!spec) return null;

  // An aspect-agnostic pack lays out through services/responsive.js and adapts to whatever frame
  // it is given, so it is authored against landscape: template_media reads these boxes for their
  // RATIO and re-derives the real geometry from the job's own dims when it resolves the plan.
  const [FW, FH] = FRAME_FOR[manifest.orientation || spec.aspect] || FRAME_FOR.landscape;

  const slotsByRole = {};
  for (const [role, r] of Object.entries(spec.roles)) {
    slotsByRole[role] = {
      count: r.count,
      width: Math.round(FW * r.wf),
      height: Math.round(FH * r.hf),
      priority: r.priority,
      objectFit: r.fit || "cover",
      kind: r.kind,
      note: "",
    };
  }

  // The MEASURED appetite is better evidence than a count of role slots — it reflects how many
  // distinct boxes the composer really draws across a film — so it is declared in full rather
  // than left to be counted. Vectors are requested only where the composer can render one:
  // asking for assets a composer discards at its `.svg -> return false` gate is how scenes ended
  // up blank (frame_manifest.packAcceptsVectors).
  const acceptsVectors = typeof (manifest.assets && manifest.assets.acceptsVectors) === "boolean"
    ? manifest.assets.acceptsVectors
    : !manifest.renderer;
  const requiredAssets = {};
  for (const [k, v] of Object.entries(spec.wants)) {
    if ((k === "icons" || k === "illustrations") && !acceptsVectors) continue;
    requiredAssets[k] = v;
  }
  if (!requiredAssets.logos) requiredAssets.logos = 1;

  return {
    requiredAssets,
    placeholders: [],
    slotsByRole,
    // A pack that can absorb a lot benefits from a wider candidate pool to rank against; a
    // sparse pack does not — everything extra there is fetched, probed, scored, cropped and
    // thrown away, all of it on the render's critical path.
    oversample: spec.capacity >= 10 ? 1.8 : spec.capacity >= 6 ? 1.6 : 1.3,
    addressing: "scene",
  };
}

// ---------------------------------------------------------------- apply

const check = process.argv.includes("--check");
const packs = fs.readdirSync(FRAMES, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

let written = 0, skipped = 0, drift = 0;
const unknown = [];
for (const name of packs) {
  const p = path.join(FRAMES, name, "pack.json");
  if (!fs.existsSync(p)) continue;

  const raw = fs.readFileSync(p, "utf8");
  let manifest;
  try { manifest = JSON.parse(raw); }
  catch { console.error(`[media-profiles] ${name}/pack.json is not valid JSON — skipped`); continue; }

  const media = buildMedia(name, manifest);
  if (!media) { unknown.push(name); continue; }

  const before = JSON.stringify(manifest.media || null);
  manifest.media = media;
  if (before === JSON.stringify(manifest.media)) { skipped++; continue; }
  if (check) { drift++; console.error(`[media-profiles] DRIFT ${name}`); continue; }

  // Preserve the file's trailing newline convention.
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
  written++;
}

// A pack with no entry keeps the DERIVED plan — today's behaviour, not a break. Still worth
// saying loudly: an unprofiled pack is a template the collector cannot size for.
if (unknown.length) {
  console.warn(`[media-profiles] ${unknown.length} pack(s) have NO measured entry (they fall back to a derived plan): ${unknown.join(", ")}`);
}

if (check) {
  console.log(`[media-profiles] check: ${skipped} up to date, ${drift} drifted, ${unknown.length} unprofiled`);
  process.exit(drift ? 1 : 0);
}
console.log(`[media-profiles] wrote ${written}, unchanged ${skipped}, unprofiled ${unknown.length} (of ${packs.length} packs)`);
