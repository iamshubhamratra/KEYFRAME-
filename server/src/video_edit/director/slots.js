// VIDEO EDIT B-ROLL SLOTS (plan side) — analysis/broll_scored.json slots -> availability, filtering, attachment.
//
// WHY THIS EXISTS. SEARCHING_BROLL / SCORING_ASSETS run BEFORE BUILDING_EDIT_PLAN and size their slots for the
// HIGH-intensity budget, so a B-roll item never has to wait for a search it could have had already, and an
// intensity change never refetches (ANALYSIS.md §8, EDIT_PLAN.md §6). That promise only holds if the plan side
// reads the scored slots the same way everywhere it creates B-roll: the director is told which sentences have
// usable footage, the rhythm engine only turns opportunities with an accepted slot into items, every new item
// carries the slot's chosen / ranked candidates (status 'ok' when downloaded), and plan.opportunities records
// `candidatesPrefetched`. Build, "Regenerate with AI" and intensity re-plans all go through these helpers.
// Absent slot information (null / undefined) means "retrieval has not run": nothing is filtered, items stay
// 'pending' — the pre-Phase-5 behaviour.
//
// CONTRACT (pure; never mutates its inputs except attachFromSlot's `item`):
//   normalizeSlots(brollSlots) -> Map<sentenceId, Slot> | null     (a Map passes through; broll_scored `{slots}` or the array)
//     Slot = { slotId, sentenceId, accepted, acceptedByIntensity?, judge?, bestTotal?, mediaTypes?, best, top }
//     best / top entries that fail AssetRefSchema are discarded (top ≤ 8, best first).
//   slotAccepted(slot, intensity) -> boolean   acceptedByIntensity[intensity] when present, else accepted; needs an asset
//   slotPrefetched(slot) -> boolean            accepted at any intensity and an asset exists
//   pickSlotAsset(slot, usedAssetIds:Set) -> AssetRef | null   best, else the first top candidate not used elsewhere
//   attachFromSlot(item, slot, usedAssetIds) -> boolean   sets chosen, topCandidates, candidateSetId, judge, status
//   slotAvailability(slots, intensity) -> [{ sentenceId, bestTotal, mediaTypes }]   accepted slots, input order

const { AssetRefSchema } = require("../plan/schema");

const MAX_TOP = 8;
const clone = (v) => JSON.parse(JSON.stringify(v));

function validRef(a) {
  if (!a || typeof a !== "object") return null;
  const r = AssetRefSchema.safeParse(a);
  return r.success ? r.data : null;
}

function normalizeSlots(brollSlots) {
  if (brollSlots instanceof Map) return brollSlots;
  const list = Array.isArray(brollSlots) ? brollSlots : brollSlots && Array.isArray(brollSlots.slots) ? brollSlots.slots : null;
  if (!list) return null;
  const out = new Map();
  for (const s of list) {
    if (!s || typeof s.sentenceId !== "string" || out.has(s.sentenceId)) continue;
    const best = validRef(s.best);
    const top = [];
    for (const c of [best, ...(Array.isArray(s.top) ? s.top : [])]) {
      const v = validRef(c);
      if (v && !top.some((x) => x.assetId === v.assetId) && top.length < MAX_TOP) top.push(v);
    }
    out.set(s.sentenceId, {
      slotId: typeof s.slotId === "string" ? s.slotId.slice(0, 80) : null, sentenceId: s.sentenceId, accepted: s.accepted === true,
      acceptedByIntensity: s.acceptedByIntensity && typeof s.acceptedByIntensity === "object" ? s.acceptedByIntensity : null,
      judge: s.judge === "ok" ? "ok" : "unavailable", bestTotal: Number.isFinite(s.bestTotal) ? s.bestTotal : null,
      mediaTypes: Array.isArray(s.mediaTypes) ? s.mediaTypes.filter((m) => m === "video" || m === "image") : [],
      best, top,
    });
  }
  return out;
}

function slotAccepted(slot, intensity) {
  if (!slot || !slot.top.length) return false;
  if (slot.acceptedByIntensity && Object.prototype.hasOwnProperty.call(slot.acceptedByIntensity, intensity)) return slot.acceptedByIntensity[intensity] === true;
  return slot.accepted === true;
}

function slotPrefetched(slot) {
  if (!slot || !slot.top.length) return false;
  return slot.accepted === true || (!!slot.acceptedByIntensity && Object.values(slot.acceptedByIntensity).some((v) => v === true));
}

function pickSlotAsset(slot, used = new Set()) {
  if (!slot) return null;
  return slot.top.find((c) => !used.has(c.assetId)) || null;
}

function attachFromSlot(item, slot, used = new Set()) {
  const asset = pickSlotAsset(slot, used);
  if (!asset) return false;
  item.chosen = clone(asset);
  item.topCandidates = clone(slot.top);
  item.candidateSetId = slot.slotId;
  item.judge = slot.judge;
  item.status = asset.path ? "ok" : "pending";
  return true;
}

function slotAvailability(slots, intensity) {
  if (!slots) return null;
  return [...slots.values()].filter((s) => slotAccepted(s, intensity))
    .map((s) => ({ sentenceId: s.sentenceId, bestTotal: s.bestTotal, mediaTypes: s.mediaTypes }));
}

module.exports = { normalizeSlots, slotAccepted, slotPrefetched, pickSlotAsset, attachFromSlot, slotAvailability };
