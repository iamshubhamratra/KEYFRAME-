// Stage 2: Intent Object -> Creative Brief.
// One LLM call, zod-validated strict JSON, one repair re-ask on failure.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const openrouter = require("./openrouter");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const templateIntel = require("./template_intelligence");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_brief.md"),
  "utf8"
);

const HEX = /^#[0-9a-fA-F]{6}$/;

const BriefSchema = z.object({
  improvedPrompt: z.string().min(20).max(1400),
  // The concrete, SHOOTABLE subject (what stock searches should show) — e.g.
  // "golden retriever dog", "skincare products on marble". Optional so older
  // cached briefs and forgetful models still validate; graph falls back to a
  // frequency heuristic when absent.
  subject: z.string().min(2).max(120).optional(),
  audience: z.string().min(2).max(400),
  tone: z.string().min(2).max(300),
  goal: z.string().min(2).max(400),
  keyMessages: z.array(z.string().min(1).max(400)).min(1).max(8),
  mustIncludeFacts: z.array(z.string().min(1).max(500)).max(12),
  brandColors: z.array(z.string().regex(HEX)).max(6).default([]),
  suggestedFramePack: z.string(),
  suggestedDuration: z.number().int().min(5).max(600),
  musicMood: z.string().min(2).max(200),
  voProfile: z.string().min(2).max(300),
});

// One-line vibe per pack, given to the LLM so suggestions are informed.
// Falls back to the pack name alone for packs without a known description.
const PACK_VIBES = {
  "biennale-yellow": "literary editorial: warm parchment, indigo ink, solar yellow blooms, serif display — elegant, cultural, slow-confidence",
  "fable-storybook": "warm storybook: parchment, ink-brown serif spirit, watercolor terracotta/sage/dusk washes, paper planes + firefly orbs in gentle 3D — for narratives, brand stories, emotional arcs, journeys",
  "longshot-cinema": "one-take cinema: graphite stage, tungsten amber + beam blue, letterboxed continuous camera travel with live timecode, pop-up stat figures, animated product mocks, light sweeps — for trailers, hype reels, cinematic announcements",
};

const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

// Packs used by the user's most recent jobs (deduped, newest first). Given to
// the brief LLM on "auto" so back-to-back videos rotate looks instead of every
// tech prompt landing on the same pack. Best-effort — an empty list is fine.
function recentlyUsedPacks(limit = 3) {
  try {
    const db = require("../db");
    const used = db.listRecent({ limit: 10 })
      .map((j) => j.framePack)
      .filter(Boolean);
    return [...new Set(used)].slice(0, limit);
  } catch {
    return [];
  }
}

// A BRIEF-SHAPED VIEW OF WHAT WE KNOW BEFORE THE BRIEF EXISTS.
//
// Template selection reads a brief (subject, tone, key messages), and on this
// call there is not one yet — that is what the call produces. But ingest has
// usually already run, so the site's own title, description, headings and
// feature copy are sitting in `intent`, and they are exactly the fields a brief
// would carry. Shaping them like a brief lets one matcher serve both this
// pre-brief pass and the post-brief re-check in the graph, with no second code
// path and no pretending we know less than we do.
function briefSeedFrom(intent) {
  const w = (intent && intent.website) || {};
  const b = (intent && intent.blog) || {};
  const v = (intent && intent.video) || {};
  const keyMessages = [
    ...(w.headings || []).slice(0, 8),
    ...(b.headings || []).slice(0, 8),
    ...((w.featureCopy || []).slice(0, 6).map((f) => (f && (f.heading || f.title)) || "")),
  ].filter(Boolean);
  return {
    subject: null,
    improvedPrompt: [w.description, b.excerpt ? String(b.excerpt).slice(0, 600) : "", v.visualStyleNotes]
      .filter(Boolean).join(" "),
    keyMessages,
    goal: w.title || b.title || "",
    audience: "",
    tone: v.visualStyleNotes || "",
    // Carries the analysis's refined prompt into the PRE-BRIEF rank below. The
    // production-time re-rank gets it a different way — off `brief.analysis`, which
    // resolveForJob already passes through as `brief` — so neither path needs a new
    // parameter threaded through analyze()/select()/resolveForJob().
    analysis: (intent && intent.analysis) || null,
  };
}

// What pictures this film is going to have. Feeds the asset-capacity component:
// a job carrying six real screenshots wants a template that paints six, and the
// measured capacity across the library runs from 0 to 13.
function assetSignalsFrom(intent) {
  const w = (intent && intent.website) || {};
  const b = (intent && intent.blog) || {};
  const u = (intent && intent.userAssets) || {};
  return {
    screenshots: Number(w.hasRealScreenshots) || 0,
    userAssets: Number(u.count) || 0,
    images: (Number(b.imageCount) || 0) > 0,
    video: !!(intent && intent.video),
    brandPalette: !!(w.brandColors && w.brandColors.length),
  };
}

// Score one template the ranking did not shortlist, so its own number and its
// own reasons are what get recorded. Fail-soft: an unscorable pack falls back to
// the selection-level summary rather than blocking the brief.
function scoreOf(pack, selection) {
  try { return templateIntel.scoreTemplate(templateIntel.profileOf(pack), selection.signals); }
  catch { return selection; }
}

// How many scored candidates the brief model is shown. Small on purpose: the old
// code sent all 285 installed packs as {name, vibe} — roughly 23,000 tokens of
// list on every brief call — and a model asked to pick one name out of 285
// one-liners while also writing the whole brief does not read them, it pattern-
// matches the first plausible word. A dozen candidates that have already passed
// the hard constraints is a question a model can actually answer well, and it
// leaves the context budget for the film.
const SHORTLIST = 14;

async function generateBrief({ intent, signal }) {
  const prefs = (intent && intent.preferences) || {};

  // STAGE 0 — the reading of the prompt this brief is built on.
  //
  // It lives HERE, not in runIntake, because generateBrief is the one function both
  // pipelines call: server.js:58-61 sends /api/generate jobs to pipeline.runJob,
  // which calls this at pipeline.js:1752 and never enters runIntake. A hook there
  // would have missed exactly the unauthenticated entry point that made an
  // unavoidable hook worth having.
  //
  // An intent that already carries an analysis (a regenerate that replays a stored one)
  // reuses it rather than paying for an identical second call. Nothing on the create
  // screen produces one any more: normalisation is automatic and happens here.
  let analysisUsage = null;
  let analysis = (intent && intent.analysis) || null;
  if (!analysis) {
    // analyzePrompt never throws — a model outage lands on the deterministic floor,
    // so the brief is never blocked by the stage in front of it.
    const res = await require("./prompt_analysis").analyzePrompt({
      prompt: intent && intent.prompt, intent, preferences: prefs, scope: "full", signal,
    });
    analysis = res.analysis;
    analysisUsage = { tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd };
  }

  // NO BRIEF FOR DISALLOWED CONTENT — defence in depth, not the gate.
  //
  // Scope and tier-1 moderation are decided at submit (prompt_scope.js), and the
  // create routes never insert a job for a disallowed request. But not every entry
  // point passes through that gate — the admin template-test route enqueues intake
  // directly — and this function is the one every pipeline shares. The analysis can
  // only say DISALLOWED on a deterministic tier-1 match (coerce() downgrades it from
  // anywhere else), so no model opinion can trip this; and the tier-1 reason is
  // written for a person and never echoes the prompt, so it IS the error message.
  // It throws BEFORE the brief model, the template ranking and the recent-jobs read,
  // so a refused request costs nothing past the free screen.
  if (analysis && analysis.classification === "DISALLOWED") {
    const reason = analysis.safety && typeof analysis.safety.reason === "string" ? analysis.safety.reason.trim() : "";
    const err = new Error(reason || "This request can't be made into a video.");
    // A code, because a message is not a contract: pipeline.js runJob treats any brief
    // failure as "carry on with the raw prompt", and it must be able to tell a refusal
    // apart from a flaky model without matching on prose.
    err.code = "PROMPT_DISALLOWED";
    throw err;
  }

  // Local reassignment so briefSeedFrom(intent) below sees it.
  intent = { ...intent, analysis };

  // What the brief model is shown: a RESTATEMENT and the structural findings, never
  // the grading. `classification`, `improvements` and `quality` describe how the
  // request was READ — showing them to a model whose job is to make the film invites
  // it to re-litigate that reading instead of building on it.
  const analysisForModel = analysis ? {
    refinedPrompt: analysis.refinedPrompt,
    orderLocked: !!(analysis.narrative && analysis.narrative.orderLocked),
    beats: (analysis.narrative && analysis.narrative.beats) || [],
    facts: analysis.facts || [],
    signals: analysis.signals || {},
  } : null;

  // Only relevant on "auto" — an explicit user choice is echoed verbatim anyway.
  const userChose = prefs.framePack && prefs.framePack !== "auto";
  const recentFramePacks = userChose ? [] : recentlyUsedPacks();

  // TEMPLATE INTELLIGENCE — the hard constraints and the ranking run HERE, before
  // the model sees anything. Orientation, runtime and capability are settled in
  // code so the model cannot spend a good answer on a template that would ship
  // the wrong-shaped file; what it is asked for is the judgement call the code
  // cannot make — which of these already-fitting looks the prompt actually wants.
  const selection = userChose ? null : templateIntel.select({
    prompt: intent && intent.prompt,
    // No brief yet (this call is what produces it), so the prompt and whatever
    // ingest already learned are the signal. The graph re-runs this AFTER the
    // brief exists and can only improve on it.
    brief: briefSeedFrom(intent),
    orientation: prefs.orientation,
    durationSec: Number(prefs.duration) || null,
    pace: prefs.pace || "normal",
    assets: assetSignalsFrom(intent),
    recentPacks: recentFramePacks,
    shortlist: SHORTLIST,
  });

  // The candidates, described richly enough to choose between. `vibe` still comes
  // from the manifest (with the legacy tables as fail-soft fallbacks), joined by
  // the facts that make one of them right for THIS film.
  const vibeOf = (name) => frameManifest.getManifest(name)?.vibe
    || PACK_VIBES[name]
    || frameRegistry.getPackVibe(name)
    || "a curated design system";
  const candidateFramePacks = userChose
    // The user pinned a template. There is nothing to choose, so show that one
    // and nothing else — a list of other candidates beside an instruction to echo
    // the pin is an invitation to ignore it.
    ? [{ name: prefs.framePack, vibe: vibeOf(prefs.framePack) }]
    : (selection && selection.candidates.length)
      ? selection.candidates.map((c) => ({
        name: c.templateId,
        vibe: vibeOf(c.templateId),
        orientation: c.orientation,
        authoredLengthSec: c.nativeSec,
        density: c.density,
        matchScore: c.score,
        whyItFits: c.reasons.slice(0, 4),
      }))
      // The matcher found nothing compatible (an empty or unreadable registry).
      // Fall back to the installed list so the model still has something to name;
      // the resolver below is what actually guarantees the answer.
      : frameRegistry.listPacks().slice(0, SHORTLIST).map((name) => ({ name, vibe: vibeOf(name) }));

  const user = JSON.stringify(
    {
      ...intent,
      // Substitute the narrow projection for the full analysis object. Spreading
      // `intent` would otherwise put the whole reading — grading and all — into the
      // brief prompt.
      ...(analysisForModel ? { analysis: analysisForModel } : { analysis: undefined }),
      // The key name changed with its meaning: this is no longer "everything
      // installed", it is "the templates that fit this film, best first".
      candidateFramePacks,
      ...(recentFramePacks.length ? { recentFramePacks } : {}),
    },
    null, 2
  );

  let totalIn = 0, totalOut = 0;
  // Actual charges reported by the provider, summed across retries/laps.
  let totalCost = 0, costCalls = 0;
  let lastErr = "";
  let userMsg = user;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
      system: SYSTEM,
      user: userMsg,
      jsonMode: true,
      stage: "brief",
      temperature: 0.6,
      signal,
    });
    totalIn += tokensIn;
    totalOut += tokensOut;
    if (typeof costUsd === "number") { totalCost += costUsd; costCalls++; }

    try {
      const raw = parseLenient(text);
      const brief = BriefSchema.parse(raw);

      // THE READING THIS BRIEF WAS BUILT ON, carried on the brief so the Script Room,
      // the production graph, the template re-rank and the admin UI can all see it.
      // Attached AFTER BriefSchema.parse: zod strips unknown keys, so the model can
      // neither supply nor clobber it — the same contract as `templateSelection` and
      // `pacing`. Both return paths below inherit it from here, including the
      // user-pinned early return.
      if (analysis) brief.analysis = require("./prompt_analysis_schema").reduce(analysis);

      // BRAND COLOURS ARE EVIDENCE, NOT TASTE. The schema validates hex SHAPE only,
      // so a model that helpfully "picks colours matching the tone" produces a
      // palette that is indistinguishable downstream from a real extraction:
      // art_director.js hands it to its own LLM labelled "EXTRACTED BRAND COLORS
      // (the product's real palette)", and scene_kit.deriveTheme then skins the
      // whole film in it. The user sees a confident brand treatment built from
      // colours the brand does not own. Enforce provenance here rather than
      // trusting the prompt to be obeyed.
      const extracted = (intent && intent.website && Array.isArray(intent.website.brandColors))
        ? intent.website.brandColors.filter((c) => HEX.test(String(c)))
        : [];
      const allowed = new Set(extracted.map((c) => String(c).toLowerCase()));
      const before = brief.brandColors.length;
      if (!extracted.length) {
        brief.brandColors = [];
      } else {
        const kept = brief.brandColors.filter((c) => allowed.has(String(c).toLowerCase()));
        // If the model paraphrased the hexes instead of echoing them, do NOT throw
        // the site's real palette away — fall back to the extraction itself.
        brief.brandColors = kept.length ? kept : extracted.slice(0, 6);
      }
      if (before && !brief.brandColors.length) {
        console.log(`[brief] dropped ${before} invented brand colour(s) — none came from the analysed site`);
      }

      // ---- TEMPLATE RESOLUTION -------------------------------------------
      //
      // An EXPLICIT user pick is honoured verbatim, exactly as before — manual
      // selection is untouched by any of this.
      //
      // On AUTO the model's answer is a vote inside a set the code already
      // proved is safe, not a free choice. It is accepted when it names a
      // template that cleared the hard constraints (whether or not it made the
      // shortlist — its judgement is allowed to beat the ranking). Anything else
      // — a hallucinated name, an uninstalled pack, a wrong-orientation or
      // wrong-length one — falls back to the TOP-SCORED candidate.
      //
      // There is no random branch here any more. The old code hashed the prompt
      // and indexed the installed list when a suggestion did not resolve, which
      // is a coin flip wearing a determinism costume, and then let a cross-family
      // rotation overrule a good match outright. Variety now lives inside the
      // ranking as a tie-break that cannot displace a clear winner.
      const userChoice = prefs.framePack;
      if (userChoice && userChoice !== "auto") {
        const pinned = frameRegistry.resolvePack(userChoice);
        brief.suggestedFramePack = pinned || brief.suggestedFramePack;
        console.log(`[brief] ok on attempt ${attempt} (pack=${brief.suggestedFramePack} — user pinned, honoured verbatim, duration=${brief.suggestedDuration}s)`);
        return { brief, analysisUsage, tokensIn: totalIn, tokensOut: totalOut, costUsd: costCalls ? totalCost : null };
      }

      const model = String(brief.suggestedFramePack || "");
      const compatible = new Set((selection && selection.compatibleIds) || []);
      let chosen, via;
      if (selection && selection.pack) {
        if (compatible.has(model)) {
          chosen = model;
          const shortlisted = selection.candidates.some((c) => c.templateId === model);
          via = shortlisted ? "model (shortlisted)" : "model (compatible, outside the shortlist)";
        } else {
          chosen = selection.pack;
          via = model
            ? `ranking (the model asked for "${model}", which does not fit this film's ${selection.signals.orientation} / ${prefs.duration || "?"}s brief)`
            : "ranking (the model named no template)";
        }
      } else {
        // No compatible template at all — the registry is empty or unreadable.
        // Keep the historical last resort so a film still renders.
        chosen = frameRegistry.resolvePack(model) || frameRegistry.resolvePack("auto");
        via = "registry default (no compatible template found)";
      }
      brief.suggestedFramePack = chosen;

      // Carried on the brief so the Script Room, the production graph and the
      // admin UI can all see WHY this template was chosen — and so the graph's
      // guard can tell a fresh decision from a stale one. Attached AFTER
      // BriefSchema.parse: zod strips unknown keys, so the model can neither
      // supply nor clobber it (same contract as `pacing`).
      if (selection) {
        // The chosen template may be compatible without having been shortlisted
        // — the model is shown the top dozen but may name any survivor. Score it
        // itself rather than reporting the leader's number under its name.
        const shown = selection.candidates.find((c) => c.templateId === chosen)
          || (chosen === selection.pack ? selection : scoreOf(chosen, selection));
        brief.templateSelection = {
          pack: chosen, via,
          score: shown.score,
          reasons: shown.reasons,
          modelChoice: model || null,
          orientation: selection.signals.orientation,
          durationSec: selection.signals.durationSec,
          compatibleCount: selection.compatibleCount,
          poolSize: selection.poolSize,
          rejected: selection.rejected,
          topCandidates: selection.candidates.slice(0, 3).map((c) => ({ pack: c.templateId, score: c.score })),
        };
        console.log(templateIntel.explain(selection));
      }
      const repeated = recentFramePacks[0] && recentFramePacks[0] === brief.suggestedFramePack;
      console.log(`[brief] ok on attempt ${attempt} (pack=${brief.suggestedFramePack} via ${via}${repeated ? " — repeats the previous video's pack" : ""}, duration=${brief.suggestedDuration}s)`);
      return { brief, analysisUsage, tokensIn: totalIn, tokensOut: totalOut, costUsd: costCalls ? totalCost : null };
    } catch (e) {
      lastErr = e instanceof z.ZodError ? JSON.stringify(e.issues).slice(0, 800) : e.message;
      console.warn(`[brief] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`brief generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = { generateBrief, BriefSchema };
