// THE RETRIEVAL SCORER — one transparent 0-100 verdict per candidate image.
//
// WHAT THIS IS FOR. The retrieval layer pulls ~20 candidates per query from each provider and
// has to answer one question: which of these should this scene actually use? It used to answer
// it with a single opaque float (`relevance*0.65 + quality*0.35`, multiplied by an aspect
// fudge factor) that was computed, sorted on, and then thrown away — so nothing downstream
// could say why a picture won, and no threshold could be applied because there was no number
// to apply it to.
//
// SEVEN AXES, WEIGHTED TO 100. A component's weight reads directly as "how many points of the
// final score this can move", the same convention services/asset_quality.js uses:
//
//   relevance 35 · quality 20 · sceneCompat 15 · aspect 10 · subject 10 · brand 5 · uniqueness 5
//
// TWO PASSES, BECAUSE PIXELS COST A DOWNLOAD. `scoreCandidate` is metadata-only: it runs on
// every candidate in the pool for free, before anything is fetched. `rescoreMeasured` runs
// once, on the winner, after validateImage has already measured it — upgrading `quality` from
// a declared-resolution guess to real sharpness and information, and `uniqueness` from a URL
// check to a perceptual hash. Nothing else re-scores, so the cost of a pixel-accurate score is
// one download, not twenty.
//
// PURE AND SYNCHRONOUS. No I/O, no model, no clock. It is called from inside the fetch lanes,
// where an async re-rank would serialise them, and its determinism is what makes it testable.
//
// SCALE DISCIPLINE IS LOAD-BEARING. The output is 0..100, the same band as cdScore and
// qualityScore, because asset_admission.displayRank blends tier x1e6 + prominence x1e3 +
// qualityScore x10 + cdScore x1. A score emitted at a different magnitude would outrank the
// tier law and hand a stock photo the seat the user's own upload should own.
//
// FAIL-OPEN, LIKE EVERY OTHER FILTER IN THIS LAYER. An unmeasurable input scores NEUTRAL, not
// zero — "we could not measure this" must never read as "this is bad". That convention is why
// providers that return no dimensions (openverse, pixabay_scrape) stay eligible on merit.

const { SHARPNESS_BANDS, STDEV_BANDS } = require("./asset_quality");

/** Component weights. Sum = 100. */
const WEIGHTS = Object.freeze({
  relevance: 35,
  quality: 20,
  sceneCompat: 15,
  aspect: 10,
  subject: 10,
  brand: 5,
  uniqueness: 5,
});

// The selection bar, by how much the template says the box matters. 80 is the headline rule
// and it is also the DEFAULT — a want with no known box is held to it. The relaxations are a
// deliberate, template-driven exception: `template_media` grades a decorative corner tile
// `low`, and holding a texture slot to the same bar as a hero plate starves it and trips
// preflight's empty-slot warning for no quality gain anyone can see.
const BARS = Object.freeze({ critical: 80, high: 80, medium: 70, low: 60 });
const DEFAULT_BAR = 80;

// Bands on the final score, as requested: 90+ excellent, 80-89 approved, 70-79 backup only.
const GRADES = Object.freeze([
  ["excellent", 90],
  ["approved", 80],
  ["backup", 70],
  ["reject", -Infinity],
]);

// Off by this many natural-log units of aspect ratio and the shape score reaches zero.
// 0.98 ~= ln(2.66), so a 16:9 photo judged against a 9:16 slot (ln 3.16 = 1.15) scores a
// hard 0 — which is the entire point on a portrait film.
const ASPECT_TOLERANCE_LN = 0.98;

// ---------------------------------------------------------------- helpers

const num = (v, d = null) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Linear ramp lo->0, hi->1, with a NEUTRAL 0.6 for unmeasurable input. Copied in spirit from
// asset_quality.ramp, and neutral is deliberately above the midpoint for the same reason.
function ramp(v, lo, hi) {
  if (v == null || !Number.isFinite(v)) return 0.6;
  if (hi <= lo) return 0.6;
  return clamp01((v - lo) / (hi - lo));
}

function tokenize(s) {
  return [...new Set(String(s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

// Scene text is prose — a headline or a narration line — so it arrives full of connective
// words that appear in stock captions by coincidence ("with", "your", "that"). Matching on
// those manufactures agreement between a sentence and a picture that have nothing to do with
// each other. Only applied to the SCENE side: a query word is deliberate, and if someone
// searches for "about" they meant it.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "your", "you", "our", "are", "was", "were",
  "from", "into", "onto", "out", "have", "has", "had", "not", "but", "all", "any", "can",
  "will", "just", "how", "why", "who", "what", "when", "where", "its", "it's", "their",
  "them", "they", "she", "her", "his", "him", "one", "two", "get", "got", "let", "see",
  "make", "made", "now", "new", "more", "most", "than", "then", "every", "each", "some",
]);

// Everything a provider told us about the picture, as one bag of words. Pexels puts a full
// sentence in `alt` ("Abstract visualization of data analytics with graphs and charts"),
// Unsplash uses `alt_description` + `description`, Pixabay ships comma-separated tags — the
// normalizers map all three onto title/tags/alt, so this reads them uniformly.
function candidateText(c) {
  if (!c) return "";
  const tags = Array.isArray(c.tags) ? c.tags.join(" ") : c.tags;
  return [c.title, c.alt, tags, c.description].filter(Boolean).join(" ");
}

// The measurement band an image should be judged against. Screenshots carry UI chrome and
// text, so their sharpness baseline is far higher than a continuous-tone photograph's.
function bandKind(requirement, candidate) {
  const k = String((requirement && (requirement.kindPref || requirement.kind)) || "").toLowerCase();
  if (k === "vector" || k === "icon" || k === "logo") return "vector";
  if (k === "screenshot" || k === "dashboard" || k === "ui") return "screenshot";
  if (/\.svgz?($|\?)/i.test(String((candidate && candidate.url) || ""))) return "vector";
  return "photo";
}

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
function colorDistance(a, b) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  if (!pa || !pb) return null;
  return Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2);
}

// ---------------------------------------------------------------- components

// 35 pts — does this picture depict what the scene asked for?
//
// Two signals, not one. The QUERY is what we searched for; the SCENE TEXT is what the film
// actually says at that moment (headline, subtext, the narration line). A candidate that
// matches the query but has nothing to do with the sentence being spoken over it is the exact
// failure this feature exists to stop — the "random office worker over 'track your revenue in
// real time'" case. Scene overlap is capped at a quarter of the component so a long voiceover
// can inform the ranking without drowning out the query it was derived from.
function relevanceScore({ query, candidate, sceneText, subjectTerms }) {
  const q = tokenize(query);
  const text = tokenize(candidateText(candidate));
  if (!q.length) return { v: 0.5, note: "no query terms to match" };
  // A provider that returns no description at all (pixabay_scrape) cannot prove relevance
  // and must not be punished to zero for it — that would delete the last-resort provider
  // from every pool. Below neutral, above nothing.
  if (!text.length) return { v: 0.35, note: "provider supplied no description" };

  // NOT EVERY QUERY WORD IS A THING A PHOTOGRAPH CAN CONTAIN.
  //
  // A flat `hits / queryLength` treats "overwhelmed analyst wall monitors" as four equal
  // requirements. Only two of them — analyst, monitors — are objects a stock caption will
  // ever name; "overwhelmed" is mood and "wall" is framing. Measured on live pools, the best
  // available picture of an analyst at a bank of monitors scored 13.1/35 on relevance and
  // capped the whole candidate at 71/100, so the scene could not clear its bar no matter what
  // was in the pool or how the query was worded. Shortening the query does not fix it either:
  // four retrieval strategies were measured against a fixed yardstick and the ceiling did not
  // move (77.2 current vs 77.7 nouns-only vs 73.2 two-word).
  //
  // So terms are WEIGHTED by whether the scene actually needs them. A subject term counts
  // full; anything else counts a third — enough that a picture matching the mood still edges
  // out one that does not, nowhere near enough to cap a picture that shows the right thing.
  // Absent subject terms, every term counts full and this is the old behaviour exactly.
  const subj = new Set((Array.isArray(subjectTerms) ? subjectTerms : []).flatMap((s) => tokenize(s)));
  let need = 0, got = 0;
  const qHit = [];
  for (const w of q) {
    const wt = subj.size ? (subj.has(w) ? 1 : 0.34) : 1;
    need += wt;
    if (text.includes(w)) { got += wt; qHit.push(w); }
  }
  const qv = need > 0 ? got / need : 0.5;

  const s = tokenize(sceneText).filter((w) => !STOPWORDS.has(w));
  if (!s.length) return { v: qv, note: `${qHit.length}/${q.length} query terms` };
  // SCENE ECHO IS A BONUS, NOT A TAX.
  //
  // This was a 0.75/0.25 blend, which meant a picture matching the subject perfectly but not
  // echoing the narration was capped at 75% of the axis — 26.25 of 35 — before anything had
  // gone wrong. Stock captions describe what is IN the frame, not what a voiceover says over
  // it, so that cap applied to almost every candidate and cost roughly nine points of a
  // hundred across the board. Weighted 0.88/0.24 and capped at 1, the echo still breaks a tie
  // between two candidates that match the subject equally (which is the whole reason it
  // exists) without penalising the ones that simply had nothing to echo.
  // DENOMINATOR CAPPED AT FOUR, and that number is calibrated rather than guessed. A whole
  // narration line carries 5-12 content words and a stock caption is one sentence, so
  // demanding overlap proportional to the line's length made full credit unreachable and
  // applied a flat haircut to every candidate instead of discriminating between them.
  // Measured against live Pexels results for "analytics dashboard": four is where a
  // genuinely on-script picture separates from a merely on-topic one.
  const sHit = s.filter((w) => text.includes(w)).length;
  const sv = clamp01(sHit / Math.min(Math.max(s.length, 1), 4));
  return {
    v: clamp01(qv * 0.88 + sv * 0.24),
    note: `${qHit.length}/${q.length} query term(s), ${sHit} scene term(s)`,
  };
}

// 20 pts — will it LOOK good at the size it will be drawn?
//
// Metadata pass: the provider's declared long edge, which is all we have before downloading.
// Measured pass: real sharpness and information, which is what actually separates a crisp
// 1600px photograph from a soft, over-compressed 4000px one. That distinction is invisible to
// the declared-dimension proxy, and it is the reason the measured pass exists at all.
function qualityScore({ candidate, measured, kind }) {
  if (measured) {
    const sharpBand = SHARPNESS_BANDS[kind] || SHARPNESS_BANDS.photo;
    const sharp = kind === "vector" ? 1 : ramp(num(measured.sharpness), sharpBand.soft, sharpBand.crisp);
    const info = ramp(num(measured.stdev), STDEV_BANDS.flat, STDEV_BANDS.rich);
    const longEdge = Math.max(num(measured.width, 0), num(measured.height, 0));
    const res = longEdge > 0 ? clamp01(longEdge / 1920) : 0.6;
    return {
      v: sharp * 0.5 + info * 0.3 + res * 0.2,
      note: `measured: laplacian ${Math.round(num(measured.sharpness, 0))}, stdev ${num(measured.stdev, 0).toFixed(1)}, ${longEdge}px`,
    };
  }
  const longEdge = Math.max(num(candidate && candidate.width, 0), num(candidate && candidate.height, 0));
  // Unknown dimensions score NEUTRAL, not the old 0.4. openverse and pixabay_scrape return
  // null dimensions for everything they serve; scoring that as near-worst quietly deleted
  // two providers from contention on a signal that says nothing about the picture.
  if (!longEdge) return { v: 0.6, note: "dimensions not declared" };
  return { v: clamp01(longEdge / 1920), note: `${longEdge}px declared long edge` };
}

// 15 pts — does it fit the BOX, as opposed to the topic?
//
// The template's placeholder contract already knows what each box needs (asset_requirements
// computes kindPref, minWidth/minHeight, objectFit and orientation per box, then the pipeline
// has historically used almost none of it at fetch time). This is where that knowledge finally
// affects which picture gets bought.
function sceneCompatScore({ candidate, requirement, measured }) {
  if (!requirement) return { v: 0.6, note: "no box contract for this want" };
  const parts = [];
  const notes = [];

  // --- kind: a transparent icon role cannot be filled by an opaque photograph.
  const wantVector = bandKind(requirement, candidate) === "vector";
  if (wantVector) {
    if (measured) {
      const ok = measured.hasAlpha === true || measured.vector === true;
      parts.push(ok ? 1 : 0);
      notes.push(ok ? "has alpha" : "opaque raster for a vector role");
    } else {
      const text = tokenize(candidateText(candidate));
      const hinted = ["icon", "vector", "logo", "symbol", "illustration", "clipart"].some((w) => text.includes(w));
      parts.push(hinted ? 1 : 0.5);
      notes.push(hinted ? "described as vector/icon art" : "vector role, unproven from metadata");
    }
  }

  // --- resolution floor: the box states the smallest image that will not look upscaled.
  const w = num(measured ? measured.width : candidate && candidate.width);
  const h = num(measured ? measured.height : candidate && candidate.height);
  const minW = num(requirement.minWidth), minH = num(requirement.minHeight);
  if ((minW || minH) && w && h) {
    // Ratio of supplied to required, on the binding dimension. A SOFT score, not a gate:
    // an image at 80% of the authored box is imperfect, not unusable, and hard-rejecting
    // here is how boxes end up empty.
    const rw = minW ? w / minW : Infinity;
    const rh = minH ? h / minH : Infinity;
    const r = Math.min(rw, rh);
    parts.push(clamp01((r - 0.5) / 0.5)); // 0.5x -> 0, 1.0x and above -> 1
    notes.push(`${w}x${h} vs box floor ${minW || "-"}x${minH || "-"} (${r.toFixed(2)}x)`);
  }

  // --- orientation: a tall picture in a wide box loses its subject to the crop.
  if (w && h && requirement.preferredAspect) {
    const candLandscape = w >= h;
    const boxLandscape = num(requirement.preferredAspect, 1) >= 1;
    parts.push(candLandscape === boxLandscape ? 1 : 0.35);
    notes.push(candLandscape === boxLandscape ? "orientation agrees with the box" : "orientation fights the box");
  }

  if (!parts.length) return { v: 0.6, note: "box contract carried nothing checkable" };
  return { v: parts.reduce((a, b) => a + b, 0) / parts.length, note: notes.join("; ") };
}

// 10 pts — SHAPE. Additive now, not the multiplier it used to be.
//
// It was `max(0.62, 1 - min(0.38, rel*0.5))` applied as a factor over the whole score, which
// meant the worst possible shape still kept 62% of its points and a wrong-way-round image
// could out-rank a correctly-shaped one on relevance alone. As a real 10-point axis a
// landscape photo scores zero against a 9:16 slot, which is what a portrait film needs.
function aspectScore({ candidate, requirement, targetRatio, measured }) {
  const target = num(requirement && requirement.preferredAspect) || num(targetRatio);
  const w = num(measured ? measured.width : candidate && candidate.width);
  const h = num(measured ? measured.height : candidate && candidate.height);
  if (!target || !w || !h) return { v: 0.6, note: "shape or target unknown" };
  const rel = Math.abs(Math.log((w / h) / target));
  return {
    v: clamp01(1 - rel / ASPECT_TOLERANCE_LN),
    note: `${(w / h).toFixed(2)} vs target ${target.toFixed(2)}`,
  };
}

// 10 pts — is the required SUBJECT actually in the frame?
//
// Deliberately separate from relevance. Relevance asks "does this overlap the words we
// searched"; subject asks "does it contain the specific thing this scene must show". A stock
// photo of a laptop matches the query "analytics dashboard laptop" on one word while showing
// none of the dashboard. Terms come from the requirement's visualDescription or the product
// model's visualVocabulary — the concrete, shootable nouns.
function subjectScore({ candidate, subjectTerms }) {
  const terms = (Array.isArray(subjectTerms) ? subjectTerms : [])
    .flatMap((t) => tokenize(t))
    .filter(Boolean);
  if (!terms.length) return { v: 0.5, note: "no subject terms supplied" };
  const text = tokenize(candidateText(candidate));
  if (!text.length) return { v: 0.35, note: "provider supplied no description" };
  const uniq = [...new Set(terms)];
  const hit = uniq.filter((w) => text.includes(w));
  return { v: hit.length / uniq.length, note: `${hit.length}/${uniq.length} subject term(s): ${hit.join(", ") || "none"}` };
}

// 5 pts — does it sit inside the film's visual world?
//
// Two weak signals combined: the pack's own style vocabulary (vapor-chrome wants "neon",
// "retro") and how close the picture's dominant colour sits to the brand palette. Both are
// weak on purpose — this is a tiebreaker between two good pictures, never a reason to pick a
// bad one, which is why it is the smallest weight that still moves an ordering.
function brandScore({ candidate, styleKeywords, brandColors, measured }) {
  const parts = [];
  const notes = [];

  const sk = (Array.isArray(styleKeywords) ? styleKeywords : []).map((w) => String(w).toLowerCase());
  if (sk.length) {
    const text = tokenize(candidateText(candidate));
    const hit = sk.filter((w) => text.includes(w));
    parts.push(hit.length ? clamp01(hit.length / Math.min(sk.length, 3)) : 0.35);
    notes.push(hit.length ? `on-style: ${hit.join(", ")}` : "no pack style words");
  }

  // Pexels returns `avg_color` and Unsplash returns `color` on every result, so this works
  // BEFORE the download for those two; the measured pass upgrades it to the real dominant
  // colour that ffmpeg computed.
  const hex = (measured && measured.dominantColor) || (candidate && candidate.avgColor);
  const palette = (Array.isArray(brandColors) ? brandColors : []).filter(Boolean);
  if (hex && palette.length) {
    const best = palette.map((p) => colorDistance(hex, p)).filter((d) => d != null).sort((a, b) => a - b)[0];
    if (best != null) {
      // ~120 RGB units apart is a different colour family; beyond that there is no credit.
      parts.push(clamp01(1 - best / 120));
      notes.push(`dominant ${hex}, ${Math.round(best)} from brand`);
    }
  }

  if (!parts.length) return { v: 0.6, note: "no style or palette context" };
  return { v: parts.reduce((a, b) => a + b, 0) / parts.length, note: notes.join("; ") };
}

// 5 pts — is this a DIFFERENT picture from the ones already chosen?
//
// The pipeline already deletes exact and perceptual duplicates after download, but deleting
// is not the same as preferring: a duplicate that gets dropped has already spent one of the
// film's fetches, and the scene it was meant for ends up empty. Scoring uniqueness at
// retrieval lets the pool avoid the collision instead of paying for it. The provider term is
// a gentle diversity nudge — with three sources available, a film that takes every picture
// from one of them has usually found a rut, not a winner.
function uniquenessScore({ candidate, seen, provider, measured }) {
  if (!seen) return { v: 1, note: "nothing chosen yet" };
  const url = String((candidate && candidate.url) || "");
  if (url && seen.urls && seen.urls.has(url)) return { v: 0, note: "this exact url is already in the film" };
  if (measured && measured.dhash && Array.isArray(seen.dhashes) && seen.dhashes.length) {
    // Cheap hamming over the 16-hex-char dHash, same threshold the film's deduper uses.
    for (const h of seen.dhashes) {
      if (hamming(measured.dhash, h) <= 10) return { v: 0, note: "perceptual duplicate of a picture already chosen" };
    }
  }
  const wins = (seen.providerWins && seen.providerWins.get && seen.providerWins.get(provider)) || 0;
  if (wins >= 4) return { v: 0.35, note: `${provider} has already supplied ${wins} pictures` };
  if (wins >= 2) return { v: 0.6, note: `${provider} has already supplied ${wins} pictures` };
  return { v: 1, note: "new picture, balanced source" };
}

function hamming(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return Infinity;
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    let v = parseInt(x[i], 16) ^ parseInt(y[i], 16);
    while (v) { d += v & 1; v >>= 1; }
  }
  return d;
}

// ---------------------------------------------------------------- the composite

function compose(components) {
  const parts = {};
  const reasons = [];
  let total = 0;
  for (const [name, weight] of Object.entries(WEIGHTS)) {
    const c = components[name] || { v: 0.6, note: "not evaluated" };
    const pts = clamp01(c.v) * weight;
    parts[name] = Math.round(pts * 10) / 10;
    total += pts;
    reasons.push(`${name} ${parts[name]}/${weight} — ${c.note}`);
  }
  return { score: Math.round(total), parts, reasons };
}

/**
 * Metadata-only score for one provider candidate. Pure, synchronous, runs on the whole pool.
 * @returns {{score:number, parts:object, reasons:string[], measured:boolean}}
 */
function scoreCandidate(ctx = {}) {
  const { query, candidate, requirement = null, targetRatio = null, styleKeywords = null,
    sceneText = "", subjectTerms = null, brandColors = null, seen = null, provider = null } = ctx;
  const out = compose({
    relevance: relevanceScore({ query, candidate, sceneText, subjectTerms }),
    quality: qualityScore({ candidate, measured: null, kind: bandKind(requirement, candidate) }),
    sceneCompat: sceneCompatScore({ candidate, requirement, measured: null }),
    aspect: aspectScore({ candidate, requirement, targetRatio, measured: null }),
    subject: subjectScore({ candidate, subjectTerms }),
    brand: brandScore({ candidate, styleKeywords, brandColors, measured: null }),
    uniqueness: uniquenessScore({ candidate, seen, provider, measured: null }),
  });
  return { ...out, measured: false };
}

/**
 * Re-score the ONE candidate that was downloaded, now that its pixels have been measured.
 * `meta` is validateImage's meta (width/height/ratio/hasAlpha/dhash/stdev/dominantColor/
 * sharpness) — already computed by the ladder, so this costs nothing extra.
 */
function rescoreMeasured(ctx = {}) {
  const { query, candidate, meta, requirement = null, targetRatio = null, styleKeywords = null,
    sceneText = "", subjectTerms = null, brandColors = null, seen = null, provider = null } = ctx;
  if (!meta) return scoreCandidate(ctx);
  const out = compose({
    relevance: relevanceScore({ query, candidate, sceneText, subjectTerms }),
    quality: qualityScore({ candidate, measured: meta, kind: bandKind(requirement, candidate) }),
    sceneCompat: sceneCompatScore({ candidate, requirement, measured: meta }),
    aspect: aspectScore({ candidate, requirement, targetRatio, measured: meta }),
    subject: subjectScore({ candidate, subjectTerms }),
    brand: brandScore({ candidate, styleKeywords, brandColors, measured: meta }),
    uniqueness: uniquenessScore({ candidate, seen, provider, measured: meta }),
  });
  return { ...out, measured: true };
}

/** The score this box must reach. 80 unless the template says the box is decorative. */
function barFor(requirement) {
  const p = String((requirement && requirement.priority) || "").toLowerCase();
  return BARS[p] != null ? BARS[p] : DEFAULT_BAR;
}

/** "excellent" | "approved" | "backup" | "reject" */
function gradeFor(score) {
  for (const [name, min] of GRADES) if (score >= min) return name;
  return "reject";
}

/**
 * The one-line log the operator reads. Deliberately terse and deterministic — it is printed
 * once per selected asset, and the sub-scores are what make a bad pick diagnosable.
 */
function explain(record, { provider, query, poolSize } = {}) {
  if (!record) return "";
  const p = record.parts || {};
  const bits = Object.keys(WEIGHTS).map((k) => `${k[0].toUpperCase()}${k.slice(1, 3)} ${p[k] ?? "-"}/${WEIGHTS[k]}`);
  return `${record.score}/100 [${bits.join(" · ")}]`
    + `${provider ? ` via ${provider}` : ""}${query ? ` "${query}"` : ""}${poolSize ? ` (pool ${poolSize})` : ""}`;
}

module.exports = {
  scoreCandidate, rescoreMeasured, barFor, gradeFor, explain,
  WEIGHTS, BARS, DEFAULT_BAR, GRADES, ASPECT_TOLERANCE_LN,
  // Test seam: the components are individually calibrated, so they are individually testable.
  __test: { relevanceScore, qualityScore, sceneCompatScore, aspectScore, subjectScore, brandScore, uniquenessScore, tokenize, hamming },
};
