// VIDEO EDIT PLAN SCHEMA — the zod contract of the Edit Plan (EDIT_PLAN.md §2).
//
// WHY THIS EXISTS. The Edit Plan is the single source of truth of an edit: nothing renders, plays or
// exports except from a plan revision. It is written by four very different authors — the LLM
// director, the heuristic fallback, user ops and QA repair — and read by resolve, compose, the
// editor and the API. Without one strict gate every reader re-validates (or worse, trusts) a shape
// that any author may have bent. Objects are `.strict()` on purpose: a misspelled key (`srcin`) is a
// bug in the author, and silently stripping it would lose data the author meant to write.
//
// Cross-element rules zod cannot express per field live in one plan-level superRefine: ids unique
// across the plan, id prefixes, anchors inside the transcript / source, references to existing
// elements, output size even + matching aspect, contiguous timeline, unique B-roll ordinals, graphic
// text limits (AI-authored ≤ 32/48, user edits up to the op limits of §5).
//
// CONTRACT:
//   PLAN_SCHEMA_ID 'keyframe.edit_plan' · PLAN_SCHEMA_VERSION 1
//   parsePlan(obj, { wordCount? }) -> { ok, plan|null, issues:[{ path, message }] }
//   emptyPlan({ projectId, source, output, settings, now, createdBy='system' }) -> EditPlan (revision 0)
//   planSettingsFromProject(projectSettings) -> plan settings (settings_schema -> EDIT_PLAN §2 keys)
//   outputDims(aspect, shortEdge=1080) -> { width, height }
//   collectIds(plan) -> [{ id, path }]
//   Every sub-schema is exported (EditPlanSchema, AnchorSchema, CutSchema, EffectSchema, …) plus ENUMS.
// Additive extensions beyond §2 (all optional): Cut.fillerKind ('pure'|'discourse', needed by
// settingEnabled('removeFillers')), JUMP_ZOOM.offsetX/lowRes (the lowRes ±4 % fallback of §3.11),
// Sfx.resolved.collapsed, Music.track nullable while retrieval is pending, `resolved` nullable
// before the first resolvePlan(); captions.overrides.hiddenCueWords (word keys of user-hidden cues) and
// cueYWords ({ wordKey: y }) — the re-chunking-proof forms of hiddenCues / cueY, which stay readable for
// legacy plans; BrollItem.seenCandidates (asset ids broll.regenerate already offered);
// BrollOpportunity.retrieved (retrieval result of a re-plan-dropped AI item, restored on re-add).

const { z } = require("zod");
const { EditError } = require("../errors");
const { PROJECT_ID_RE } = require("../ids");
const { CAPTION_STYLES } = require("../settings_schema");

const PLAN_SCHEMA_ID = "keyframe.edit_plan";
const PLAN_SCHEMA_VERSION = 1;

const ASPECTS = Object.freeze(["9:16", "16:9", "1:1"]);
const ASPECT_RATIO = Object.freeze({ "9:16": [9, 16], "16:9": [16, 9], "1:1": [1, 1] });
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const LANG_RE = /^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})?)$/;

const ENUMS = Object.freeze({
  origin: ["ai", "heuristic", "user"],
  createdBy: ["director", "heuristic", "user", "qa-repair", "restore", "system"],
  timing: ["word", "approx"],
  background: ["none", "blur", "brand"],
  pieceKind: ["play", "hold", "speed"],
  segmentType: ["HOOK", "TALKING_HEAD", "EMPHASIS", "SCREEN_CONTENT", "CTA"],
  editingIntent: ["hook_grab", "explain", "proof", "story", "emphasis", "aside", "cta"],
  framingMode: ["auto", "static", "follow"],
  cutKind: ["SILENCE", "FILLER", "REPEAT", "FALSE_START", "RETAKE", "JUMP_CUT", "USER"],
  snapMethod: ["rms_gap", "word_edge", "island_edge", "none"],
  controlledBy: ["removeSilence", "removeFillers", "autoJumpCuts"],
  fillerKind: ["pure", "discourse"],
  captionPolicy: ["auto", "top", "center", "bottom"],
  highlight: ["none", "color", "blob", "sweep", "single_word"],
  timingMode: ["words", "proportional"],
  assetProvider: ["pexels", "pixabay", "openverse", "user", "screenshot"],
  assetType: ["video", "image"],
  layout: ["FULL", "PIP", "SPLIT"],
  corner: ["tl", "tr", "bl", "br"],
  splitSide: ["top", "bottom"],
  brollIntent: ["illustrate", "context", "data", "emotion"],
  queryKind: ["visual_noun", "scene", "fallback", "user"],
  judge: ["ok", "unavailable"],
  brollStatus: ["pending", "ok", "missing", "removed"],
  effectKind: ["PUNCH_IN", "PUNCH_OUT", "JUMP_ZOOM", "ZOOM_EMPHASIS", "REFRAME", "FREEZE", "SPEED"],
  ease: ["smoothstep", "linear"],
  speedTarget: ["aroll_nonspeech", "broll"],
  // CUT … CROSSFADE are the original kinds; the rest are real picture transitions (render/transitions.js).
  transitionKind: ["CUT", "DIP_BLACK", "DIP_WHITE", "FLASH", "CROSSFADE", "ZOOM_IN", "WHIP_LEFT", "WHIP_RIGHT", "SLIDE_UP", "BLUR", "CIRCLE_OPEN", "PIXELATE"],
  cutTransition: ["auto", "none", "smooth", "zoom", "whip", "slide", "blur", "flash"],
  look: ["natural", "warm", "cool", "vivid", "cinematic", "mono", "vintage"],
  graphicKind: ["HOOK_TITLE", "KEYWORD", "STAT", "LOWER_THIRD", "CTA", "LOGO_OUTRO"],
  region: ["top", "center", "bottom"],
  renderer: ["hyperframes", "ass"],
  renderStatus: ["pending", "ok", "fallback", "failed"],
  musicProvider: ["pixabay_bridge", "synth", "user"],
  sfxCue: ["whoosh", "swoosh", "pop", "click", "riser", "impact", "sparkle", "ding", "transition"],
  edge: ["in", "out"],
  logoShow: ["always", "intro_outro", "none"],
  paletteSource: ["user", "logo", "default"],
  adjustmentAction: ["dropped", "shortened", "moved", "disabled"],
  severity: ["blocker", "major", "minor"],
  brollIntensity: ["low", "medium", "high"],
  effectsLevel: ["subtle", "dynamic"],
  removeFillers: ["off", "light", "aggressive"],
  silencePace: ["natural", "fast", "extra_fast"],
  platformSafe: ["tiktok", "reels", "shorts", "generic"],
  mediaPreference: ["video", "image", "either"],
  effectOpportunityKind: ["PUNCH_IN", "ZOOM_EMPHASIS"],
  sfxAnchor: ["broll_in", "graphic_in", "punch_in", "section_change"],
});

// Element id prefixes (EDIT_PLAN.md §1). Cue ids are `c_<firstSrcWordIndex>` (or an insertion key).
const ID_PREFIXES = Object.freeze({
  segment: "seg", cut: "cut", broll: "br", effect: "fx", transition: "tr", graphic: "gfx", sfx: "sfx",
  asset: "ast", op: "op", piece: "pc", opportunity: "opp", cue: "c",
});

const MAX_SEC = 24 * 3600;
const sec = () => z.number().finite().min(0).max(MAX_SEC);
const unit = () => z.number().finite().min(0).max(1);
const int = () => z.number().int();
const idOf = (prefix) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,40}$`), `expected an id like ${prefix}_<id>`);
const CueIdSchema = z.string().regex(/^c_[A-Za-z0-9_:-]{1,48}$/, "expected a cue id like c_<firstSrcWordIndex>");
const hex = () => z.string().regex(HEX_RE, "expected #RRGGBB");
const Origin = z.enum(ENUMS.origin);
const Reason = z.string().max(160);

const EvidenceSchema = z.object({
  sentenceId: z.string().max(40).nullable(),
  wordRange: z.tuple([int().min(0), int().min(0)]).nullable().optional(),
  quote: z.string().max(80).optional(),
}).strict();

const provenanceFields = {
  reason: Reason,
  reasonCode: z.string().max(40).optional(),
  evidence: EvidenceSchema.optional(),
};

// ---------------------------------------------------------------- anchors
const WordsAnchor = z.object({ kind: z.literal("words"), w0: int().min(0), w1: int().min(0) }).strict();
const SrcAnchor = z.object({ kind: z.literal("src"), srcIn: sec(), srcOut: sec() }).strict();
const OutAnchor = z.object({ kind: z.literal("out"), outIn: sec(), outOut: sec() }).strict();
const AnchorSchema = z.discriminatedUnion("kind", [WordsAnchor, SrcAnchor, OutAnchor]);
const ResolvedSchema = z.object({ outIn: sec(), outOut: sec(), collapsed: z.boolean() }).strict();

// ---------------------------------------------------------------- timeline
const PieceSchema = z.object({
  id: idOf(ID_PREFIXES.piece),
  srcIn: sec(), srcOut: sec(), outIn: sec(), outOut: sec(),
  kind: z.enum(ENUMS.pieceKind),
  rate: z.number().finite().min(0.25).max(4),
  chunkKey: z.string().min(1).max(128),
}).strict();

const TimelineSchema = z.object({
  pieces: z.array(PieceSchema),
  outDurationSec: sec(),
  mapHash: z.string().max(128),
}).strict();

// ---------------------------------------------------------------- A-roll
const FramingSchema = z.object({
  mode: z.enum(ENUMS.framingMode),
  zoomBase: z.number().finite().min(1).max(1.5),
  keyframes: z.array(z.object({ src: sec(), cx: unit(), cy: unit(), zoom: z.number().finite().min(1).max(2.5) }).strict()).max(500),
  userCrop: z.object({ cx: unit(), cy: unit(), zoom: z.number().finite().min(1).max(2) }).strict().optional(),
  locked: z.boolean(),
}).strict();

const ARollSegmentSchema = z.object({
  id: idOf(ID_PREFIXES.segment),
  type: z.enum(ENUMS.segmentType),
  anchor: AnchorSchema,
  resolved: ResolvedSchema.nullable(),
  sentenceIds: z.array(z.string().max(40)).max(200),
  importance: unit(),
  editingIntent: z.enum(ENUMS.editingIntent),
  faceRequired: z.boolean(),
  framing: FramingSchema,
  label: z.string().max(80),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
}).strict();

// ---------------------------------------------------------------- cuts
const CutSchema = z.object({
  id: idOf(ID_PREFIXES.cut),
  kind: z.enum(ENUMS.cutKind),
  srcIn: sec(), srcOut: sec(),
  raw: z.object({ srcIn: sec(), srcOut: sec() }).strict(),
  snap: z.object({ method: z.enum(ENUMS.snapMethod), padIn: z.number().finite().min(-1).max(1), padOut: z.number().finite().min(-1).max(1) }).strict(),
  wordRange: z.tuple([int().min(0), int().min(0)]).nullable(),
  confidence: unit(),
  controlledBy: z.enum(ENUMS.controlledBy).nullable(),
  fillerKind: z.enum(ENUMS.fillerKind).nullable().optional(),
  enabled: z.boolean(),
  userToggled: z.boolean(),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
}).strict();

// ---------------------------------------------------------------- captions
const CueWordSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_:-]{1,48}$/),
  i: int().min(0).nullable(),
  text: z.string().max(120),
  srcStart: sec(), srcEnd: sec(), outStart: sec(), outEnd: sec(),
  emphasis: z.boolean(),
  conf: unit(),
}).strict();

const CueSchema = z.object({
  id: CueIdSchema,
  anchor: WordsAnchor,
  resolved: ResolvedSchema.nullable(),
  text: z.string().max(400),
  lines: z.array(z.string().max(240)).max(4),
  words: z.array(CueWordSchema).max(60),
  timingMode: z.enum(ENUMS.timingMode),
  pos: z.object({ x: unit(), y: unit(), an: int().min(1).max(9) }).strict().nullable(),
  styleOverride: z.record(z.string(), z.any()).optional(),
  hidden: z.boolean(),
  edited: z.boolean(),
}).strict();

const InsertionSchema = z.object({
  key: z.string().regex(/^(?!w\d+$)[A-Za-z][A-Za-z0-9_:-]{0,47}$/, "insertion keys must not look like word keys"),
  afterWordIndex: int().min(-1),
  order: int().min(0).max(1000),
  text: z.string().min(1).max(60),
  srcStart: sec(), srcEnd: sec(),
}).strict();

const CaptionTrackSchema = z.object({
  enabled: z.boolean(),
  styleId: z.enum(CAPTION_STYLES),
  language: z.string().regex(LANG_RE),
  sourceLanguage: z.string().regex(LANG_RE),
  position: z.object({
    policy: z.enum(ENUMS.captionPolicy),
    faceAvoid: z.boolean(),
    yOverride: unit().optional(),
  }).strict(),
  highlight: z.enum(ENUMS.highlight),
  overrides: z.object({
    wordText: z.record(z.string().regex(/^\d+$/), z.string().max(120)),
    insertions: z.array(InsertionSchema).max(2000),
    hiddenWords: z.array(int().min(0)).max(100000),
    hiddenCues: z.array(CueIdSchema).max(5000),
    cueY: z.record(CueIdSchema, unit()),
    emphasis: z.record(z.string().regex(/^[A-Za-z0-9_:-]{1,48}$/), z.boolean()),
    // word-keyed forms written by caption.hide / caption.setPosition (survive re-chunking; see header)
    hiddenCueWords: z.array(z.string().regex(/^[A-Za-z0-9_:-]{1,48}$/)).max(100000).optional(),
    cueYWords: z.record(z.string().regex(/^[A-Za-z0-9_:-]{1,48}$/), unit()).optional(),
  }).strict(),
  cues: z.array(CueSchema),
  translations: z.record(z.string().regex(LANG_RE), z.object({
    cues: z.array(CueSchema),
    sourceHash: z.string().max(128),
    quality: z.union([unit(), z.string().max(20)]),
  }).strict()),
  userEdited: z.boolean(),
}).strict();

// ---------------------------------------------------------------- B-roll
const AssetRefSchema = z.object({
  assetId: idOf(ID_PREFIXES.asset),
  provider: z.enum(ENUMS.assetProvider),
  providerId: z.string().max(120).nullable(),
  type: z.enum(ENUMS.assetType),
  path: z.string().max(512).nullable(),
  thumbPath: z.string().max(512).nullable(),
  sourceUrl: z.string().max(2048).nullable(),
  license: z.string().max(120),
  attribution: z.string().max(300).nullable(),
  width: int().min(0), height: int().min(0),
  durationSec: sec().nullable(),
  trimInSec: sec(),
  dhash: z.string().max(64).nullable(),
  tags: z.array(z.string().max(60)).max(60),
  scores: z.object({
    lexical: unit(),
    judgeRelevance: z.number().finite().min(0).max(10).nullable(),
    judgeQuality: z.number().finite().min(0).max(10).nullable(),
    issues: z.array(z.string().max(40)).max(12),
    resolution: unit(), aspect: unit(), composition: unit(), brand: unit(), duration: unit(), diversity: unit(),
    total: z.number().finite().min(-5).max(5),
  }).strict(),
}).strict();

const MotionPoint = z.object({ z: z.number().finite().min(1).max(2), cx: unit(), cy: unit() }).strict();

const BrollItemSchema = z.object({
  id: idOf(ID_PREFIXES.broll),
  ordinal: int().min(0),
  anchor: AnchorSchema,
  resolved: ResolvedSchema.nullable(),
  sentenceId: z.string().max(40).nullable(),
  segmentId: z.string().max(48).nullable(),
  layout: z.enum(ENUMS.layout),
  layoutParams: z.object({
    corner: z.enum(ENUMS.corner).optional(),
    scale: z.number().finite().min(0.3).max(0.55).optional(),
    splitSide: z.enum(ENUMS.splitSide).optional(),
  }).strict(),
  intent: z.enum(ENUMS.brollIntent),
  queries: z.array(z.object({ text: z.string().min(1).max(80), kind: z.enum(ENUMS.queryKind) }).strict()).max(8),
  ...provenanceFields,
  chosen: AssetRefSchema.nullable(),
  candidateSetId: z.string().max(80).nullable(),
  topCandidates: z.array(AssetRefSchema).max(8),
  judge: z.enum(ENUMS.judge),
  motion: z.object({ from: MotionPoint, to: MotionPoint }).strict().optional(),
  seenCandidates: z.array(idOf(ID_PREFIXES.asset)).max(64).optional(),
  status: z.enum(ENUMS.brollStatus),
  origin: Origin,
  locked: z.boolean(),
  userModified: z.boolean(),
}).strict();

// ---------------------------------------------------------------- opportunities
const BrollOpportunitySchema = z.object({
  id: idOf(ID_PREFIXES.opportunity),
  sentenceId: z.string().max(40),
  wordAnchor: z.object({ w0: int().min(0), w1: int().min(0) }).strict().optional(),
  priority: unit(),
  layoutPreference: z.enum(ENUMS.layout),
  mediaPreference: z.enum(ENUMS.mediaPreference),
  queries: z.array(z.string().min(1).max(60)).min(2).max(4),
  reason: Reason,
  candidatesPrefetched: z.boolean(),
  // retrieval result of an AI B-roll item a re-plan dropped, restored when a later re-plan re-adds it
  retrieved: z.object({
    chosen: AssetRefSchema,
    topCandidates: z.array(AssetRefSchema).max(8),
    candidateSetId: z.string().max(80).nullable(),
    judge: z.enum(ENUMS.judge),
  }).strict().optional(),
}).strict();

const EffectOpportunitySchema = z.object({
  id: idOf(ID_PREFIXES.opportunity),
  sentenceId: z.string().max(40),
  w: int().min(0),
  kind: z.enum(ENUMS.effectOpportunityKind),
  priority: unit(),
  reason: Reason,
}).strict();

const GraphicOpportunitySchema = z.object({
  id: idOf(ID_PREFIXES.opportunity),
  kind: z.enum(ENUMS.graphicKind),
  sentenceId: z.string().max(40),
  title: z.string().max(32),
  subtitle: z.string().max(48).optional(),
  value: z.string().max(24).optional(),
  priority: unit(),
  reason: Reason,
}).strict();

const SfxOpportunitySchema = z.object({
  id: idOf(ID_PREFIXES.opportunity),
  anchor: z.enum(ENUMS.sfxAnchor),
  ref: z.string().max(48),
  cue: z.enum(ENUMS.sfxCue),
  priority: unit(),
  reason: Reason,
}).strict();

const OpportunitiesSchema = z.object({
  broll: z.array(BrollOpportunitySchema),
  effects: z.array(EffectOpportunitySchema),
  graphics: z.array(GraphicOpportunitySchema),
  sfx: z.array(SfxOpportunitySchema),
}).strict();

// ---------------------------------------------------------------- effects
const effectBase = {
  id: idOf(ID_PREFIXES.effect),
  anchor: AnchorSchema,
  resolved: ResolvedSchema.nullable(),
  enabled: z.boolean(),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
  userModified: z.boolean(),
};
const zoomish = (lo, hi) => z.number().finite().min(lo).max(hi);
const EffectSchema = z.discriminatedUnion("kind", [
  z.object({ ...effectBase, kind: z.literal("PUNCH_IN"), zoom: zoomish(1.05, 1.35), center: z.union([z.literal("face"), z.object({ cx: unit(), cy: unit() }).strict()]) }).strict(),
  z.object({ ...effectBase, kind: z.literal("PUNCH_OUT"), toZoom: zoomish(1, 1.35) }).strict(),
  z.object({ ...effectBase, kind: z.literal("JUMP_ZOOM"), zoom: zoomish(1, 1.35), offsetX: z.number().finite().min(-0.1).max(0.1).optional(), lowRes: z.boolean().optional() }).strict(),
  z.object({ ...effectBase, kind: z.literal("ZOOM_EMPHASIS"), fromZoom: zoomish(1, 1.5), toZoom: zoomish(1, 1.5), durationSec: z.number().finite().min(0.4).max(1.2), ease: z.enum(ENUMS.ease) }).strict(),
  z.object({ ...effectBase, kind: z.literal("REFRAME"), cx: unit(), cy: unit(), zoom: zoomish(1, 2) }).strict(),
  z.object({ ...effectBase, kind: z.literal("FREEZE"), atSrc: sec(), holdSec: z.number().finite().min(0.2).max(0.8) }).strict(),
  z.object({ ...effectBase, kind: z.literal("SPEED"), rate: z.number().finite().min(0.5).max(2), target: z.enum(ENUMS.speedTarget) }).strict(),
]);

// ---------------------------------------------------------------- transitions / graphics
const TransitionSchema = z.object({
  id: idOf(ID_PREFIXES.transition),
  kind: z.enum(ENUMS.transitionKind),
  at: z.union([
    z.object({ joint: z.literal("after"), elementId: z.string().min(1).max(48) }).strict(),
    z.object({ outAt: sec() }).strict(),
  ]),
  durationSec: z.number().finite().min(0.08).max(0.8),
  enabled: z.boolean(),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
}).strict();

const GraphicSchema = z.object({
  id: idOf(ID_PREFIXES.graphic),
  kind: z.enum(ENUMS.graphicKind),
  anchor: AnchorSchema,
  resolved: ResolvedSchema.nullable(),
  text: z.object({
    title: z.string().min(1).max(60),
    subtitle: z.string().max(50).optional(),
    value: z.string().max(24).optional(),
  }).strict(),
  templateId: z.string().min(1).max(40),
  variables: z.record(z.string().max(40), z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])),
  region: z.enum(ENUMS.region),
  renderer: z.enum(ENUMS.renderer),
  fallback: z.literal("ass"),
  render: z.object({
    cardHash: z.string().max(128).nullable(),
    path: z.string().max(512).nullable(),
    status: z.enum(ENUMS.renderStatus),
  }).strict(),
  enabled: z.boolean(),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
  userModified: z.boolean(),
}).strict();

// ---------------------------------------------------------------- audio
const TrackSchema = z.object({
  assetId: idOf(ID_PREFIXES.asset).nullable(),
  path: z.string().max(512).nullable(),
  provider: z.enum(ENUMS.musicProvider),
  title: z.string().max(120).optional(),
  query: z.string().max(80),
  mood: z.string().max(40),
  sourceUrl: z.string().max(2048).optional(),
  license: z.string().max(120),
  durationSec: sec(),
}).strict();

const MusicSchema = z.object({
  enabled: z.boolean(),
  track: TrackSchema.nullable(),
  candidates: z.array(TrackSchema).max(3),
  volume: z.number().finite().min(0.06).max(0.16),
  envelope: z.array(z.object({ anchor: AnchorSchema, volume: z.number().finite().min(0).max(0.3) }).strict()).max(24),
  duck: z.object({ enabled: z.boolean(), depthDb: z.number().finite().min(-24).max(-3) }).strict(),
  startOffsetSec: sec(),
  fadeInSec: z.number().finite().min(0).max(5),
  fadeOutSec: z.number().finite().min(0).max(5),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
}).strict();

const SfxSchema = z.object({
  id: idOf(ID_PREFIXES.sfx),
  cue: z.enum(ENUMS.sfxCue),
  path: z.string().max(512).nullable(),
  anchor: z.object({ elementId: z.string().min(1).max(48), edge: z.enum(ENUMS.edge), offsetSec: z.number().finite().min(-2).max(2) }).strict(),
  resolved: z.object({ outAt: sec(), collapsed: z.boolean().optional() }).strict().nullable(),
  volume: z.number().finite().min(0.15).max(0.45),
  license: z.string().max(120),
  attribution: z.string().max(300).nullable(),
  enabled: z.boolean(),
  ...provenanceFields,
  origin: Origin,
  locked: z.boolean(),
}).strict();

// ---------------------------------------------------------------- branding
const BrandingSchema = z.object({
  logo: z.object({
    assetId: idOf(ID_PREFIXES.asset),
    path: z.string().max(512),
    placement: z.enum(ENUMS.corner),
    scale: z.number().finite().min(0.08).max(0.2),
    opacity: z.number().finite().min(0.6).max(1),
    marginPct: z.number().finite().min(0.03).max(0.08),
    show: z.enum(ENUMS.logoShow),
  }).strict().nullable(),
  palette: z.object({
    primary: hex(), accent: hex(), text: hex(), onAccent: hex(),
    source: z.enum(ENUMS.paletteSource),
  }).strict(),
  font: z.object({ family: z.string().min(1).max(60), ttf: z.string().regex(/^[A-Za-z0-9_.-]{1,80}\.ttf$/), weight: int().min(100).max(900) }).strict(),
  recolorFootage: z.literal(false),
}).strict();

// ---------------------------------------------------------------- provenance / qa / settings
const ProvenanceSchema = z.object({
  director: z.object({
    model: z.string().max(120).nullable(),
    stage: z.string().max(40),
    promptHash: z.string().max(128).nullable(),
    costUsd: z.number().finite().min(0),
    fallback: z.boolean(),
  }).strict(),
  rhythm: z.object({
    rulesVersion: z.string().max(40),
    adjustments: z.array(z.object({
      elementId: z.string().min(1).max(48),
      rule: z.string().min(1).max(40),
      action: z.enum(ENUMS.adjustmentAction),
    }).strict()),
  }).strict(),
  ops: z.array(z.object({
    opId: idOf(ID_PREFIXES.op),
    at: z.number().finite().min(0),
    type: z.string().min(1).max(60),
    elementIds: z.array(z.string().max(48)).max(500),
    batchId: z.string().max(80).nullable(),
  }).strict()),
}).strict();

const QaSchema = z.object({
  revision: int().min(0),
  findings: z.array(z.object({
    severity: z.enum(ENUMS.severity),
    category: z.string().min(1).max(40),
    elementId: z.string().max(48).optional(),
    detail: z.string().max(500),
  }).strict()),
}).strict();

const PlanSettingsSchema = z.object({
  captionStyle: z.enum(CAPTION_STYLES),
  captionLanguage: z.union([z.literal("auto"), z.string().regex(LANG_RE)]),
  maxWordsPerLine: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  captionsEnabled: z.boolean(),
  brandColors: z.array(hex()).max(6),
  musicEnabled: z.boolean(),
  sfxEnabled: z.boolean(),
  brollIntensity: z.enum(ENUMS.brollIntensity),
  effects: z.enum(ENUMS.effectsLevel),
  effectsEnabled: z.boolean(),
  removeFillers: z.enum(ENUMS.removeFillers),
  removeSilence: z.boolean(),
  silencePace: z.enum(ENUMS.silencePace),
  autoJumpCuts: z.boolean(),
  punchInOnJumpCuts: z.boolean(),
  platformSafe: z.enum(ENUMS.platformSafe),
  // Optional so every plan written before they existed stays valid: absent = "auto" / "natural".
  cutTransition: z.enum(ENUMS.cutTransition).optional(),
  look: z.enum(ENUMS.look).optional(),
}).strict();

const SourceSchema = z.object({
  assetId: idOf(ID_PREFIXES.asset),
  sha1: z.string().regex(/^[0-9a-f]{40}$/),
  durationSec: z.number().finite().gt(0).max(MAX_SEC),
  fps: z.literal(30),
  width: int().min(2).max(16384),
  height: int().min(2).max(16384),
  analysisVersion: z.string().min(1).max(40),
  transcriptHash: z.string().max(128).nullable(),
  timing: z.enum(ENUMS.timing),
  language: z.string().regex(LANG_RE),
}).strict();

const OutputSchema = z.object({
  aspect: z.enum(ASPECTS),
  width: int().min(2).max(8192),
  height: int().min(2).max(8192),
  fps: z.literal(30),
  background: z.enum(ENUMS.background),
}).strict();

const EditPlanObject = z.object({
  schema: z.literal(PLAN_SCHEMA_ID),
  version: z.literal(PLAN_SCHEMA_VERSION),
  projectId: z.string().regex(PROJECT_ID_RE),
  revision: int().min(0),
  parentRevision: int().min(0).nullable(),
  createdAt: z.number().finite().min(0),
  createdBy: z.enum(ENUMS.createdBy),
  source: SourceSchema,
  output: OutputSchema,
  settings: PlanSettingsSchema,
  timeline: TimelineSchema,
  aRoll: z.object({ segments: z.array(ARollSegmentSchema) }).strict(),
  cuts: z.array(CutSchema),
  captions: CaptionTrackSchema,
  broll: z.array(BrollItemSchema),
  opportunities: OpportunitiesSchema,
  effects: z.array(EffectSchema),
  transitions: z.array(TransitionSchema),
  graphics: z.array(GraphicSchema),
  music: MusicSchema.nullable(),
  sfx: z.array(SfxSchema),
  branding: BrandingSchema,
  provenance: ProvenanceSchema,
  qa: QaSchema.nullable(),
}).strict();

// ---------------------------------------------------------------- plan-level refinements
const GRAPHIC_USER_LIMITS = Object.freeze({
  HOOK_TITLE: { title: 60, subtitle: 50 }, CTA: { title: 60, subtitle: 50 }, LOGO_OUTRO: { title: 60, subtitle: 50 },
  LOWER_THIRD: { title: 40, subtitle: 50 }, KEYWORD: { title: 48, subtitle: 48 }, STAT: { title: 48, subtitle: 48 },
});
const GRAPHIC_AI_LIMITS = Object.freeze({ title: 32, subtitle: 48 });

function collectIds(plan) {
  const out = [];
  const add = (arr, base) => (Array.isArray(arr) ? arr : []).forEach((el, i) => {
    if (el && typeof el.id === "string") out.push({ id: el.id, path: [...base, i, "id"] });
  });
  if (!plan || typeof plan !== "object") return out;
  add(plan.timeline && plan.timeline.pieces, ["timeline", "pieces"]);
  add(plan.aRoll && plan.aRoll.segments, ["aRoll", "segments"]);
  add(plan.cuts, ["cuts"]);
  add(plan.captions && plan.captions.cues, ["captions", "cues"]);
  add(plan.broll, ["broll"]);
  add(plan.effects, ["effects"]);
  add(plan.transitions, ["transitions"]);
  add(plan.graphics, ["graphics"]);
  add(plan.sfx, ["sfx"]);
  const opp = plan.opportunities || {};
  for (const k of ["broll", "effects", "graphics", "sfx"]) add(opp[k], ["opportunities", k]);
  return out;
}

function refinePlan(plan, ctx, opts) {
  const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const D = plan.source.durationSec;
  const wordCount = Number.isInteger(opts.wordCount) ? opts.wordCount : null;
  const TOL = 1e-3;

  // 1. ids unique across the plan
  const ids = collectIds(plan);
  const seen = new Map();
  for (const { id, path } of ids) {
    if (seen.has(id)) issue(path, `duplicate id '${id}' (first at ${seen.get(id).join(".")})`);
    else seen.set(id, path);
  }
  const idSet = new Set(seen.keys());

  // 2. anchors inside the transcript / source
  const checkAnchor = (a, path) => {
    if (!a) return;
    if (a.kind === "words") {
      if (a.w1 < a.w0) issue([...path, "w1"], "anchor w1 must be >= w0");
      if (wordCount != null && a.w1 >= wordCount) issue([...path, "w1"], `anchor word ${a.w1} is outside the transcript (${wordCount} words)`);
    } else if (a.kind === "src") {
      if (a.srcOut < a.srcIn) issue([...path, "srcOut"], "anchor srcOut must be >= srcIn");
      if (a.srcOut > D + TOL) issue([...path, "srcOut"], "anchor srcOut is past the source duration");
    } else if (a.kind === "out") {
      if (a.outOut < a.outIn) issue([...path, "outOut"], "anchor outOut must be >= outIn");
    }
  };
  const checkResolved = (r, path) => { if (r && r.outOut < r.outIn) issue([...path, "outOut"], "resolved outOut must be >= outIn"); };
  const anchored = [["aRoll", "segments"], ["broll"], ["effects"], ["graphics"], ["captions", "cues"]];
  for (const base of anchored) {
    const arr = base.reduce((o, k) => (o ? o[k] : undefined), plan) || [];
    arr.forEach((el, i) => { checkAnchor(el.anchor, [...base, i, "anchor"]); checkResolved(el.resolved, [...base, i, "resolved"]); });
  }
  if (plan.music) plan.music.envelope.forEach((p, i) => checkAnchor(p.anchor, ["music", "envelope", i, "anchor"]));
  plan.effects.forEach((e, i) => { if (e.kind === "FREEZE" && e.atSrc > D + TOL) issue(["effects", i, "atSrc"], "FREEZE atSrc is past the source duration"); });

  plan.cuts.forEach((c, i) => {
    if (!(c.srcOut > c.srcIn)) issue(["cuts", i, "srcOut"], "cut srcOut must be > srcIn");
    if (c.srcOut > D + TOL) issue(["cuts", i, "srcOut"], "cut srcOut is past the source duration");
    if (c.raw.srcOut < c.raw.srcIn) issue(["cuts", i, "raw", "srcOut"], "raw srcOut must be >= srcIn");
    if (c.wordRange) {
      if (c.wordRange[1] < c.wordRange[0]) issue(["cuts", i, "wordRange"], "wordRange end must be >= start");
      if (wordCount != null && c.wordRange[1] >= wordCount) issue(["cuts", i, "wordRange"], "wordRange is outside the transcript");
    }
  });

  // 3. references to existing elements
  plan.transitions.forEach((t, i) => {
    if (t.at && t.at.elementId !== undefined && !idSet.has(t.at.elementId)) issue(["transitions", i, "at", "elementId"], `unknown element '${t.at.elementId}'`);
  });
  plan.sfx.forEach((s, i) => { if (!idSet.has(s.anchor.elementId)) issue(["sfx", i, "anchor", "elementId"], `unknown element '${s.anchor.elementId}'`); });
  const segIds = new Set(plan.aRoll.segments.map((s) => s.id));
  plan.broll.forEach((b, i) => { if (b.segmentId != null && !segIds.has(b.segmentId)) issue(["broll", i, "segmentId"], `unknown segment '${b.segmentId}'`); });

  // 4. output size even and matching the aspect
  const { width: W, height: H, aspect } = plan.output;
  if (W % 2 !== 0) issue(["output", "width"], "output width must be even");
  if (H % 2 !== 0) issue(["output", "height"], "output height must be even");
  const [aw, ah] = ASPECT_RATIO[aspect];
  if (Math.abs(H - (W * ah) / aw) > 2) issue(["output", "height"], `output ${W}x${H} does not match aspect ${aspect}`);

  // 5. timeline contiguity
  const P = plan.timeline.pieces;
  let lastSrc = -Infinity;
  P.forEach((p, i) => {
    const path = ["timeline", "pieces", i];
    if (p.outOut < p.outIn - 1e-9) issue([...path, "outOut"], "piece outOut must be >= outIn");
    if (p.kind === "hold") { if (Math.abs(p.srcOut - p.srcIn) > 1e-9) issue([...path, "srcOut"], "hold pieces have srcIn === srcOut"); }
    else if (!(p.srcOut > p.srcIn)) issue([...path, "srcOut"], "play/speed pieces need srcOut > srcIn");
    if (i === 0 && Math.abs(p.outIn) > 1e-6) issue([...path, "outIn"], "the first piece starts at out 0");
    if (i > 0 && Math.abs(p.outIn - P[i - 1].outOut) > 1e-6) issue([...path, "outIn"], "pieces must be contiguous on the output timeline");
    if (p.srcIn < lastSrc - 1e-6) issue([...path, "srcIn"], "pieces must be monotonic on the source timeline");
    lastSrc = Math.max(lastSrc, p.srcOut);
    if (p.srcOut > D + TOL) issue([...path, "srcOut"], "piece srcOut is past the source duration");
  });
  const lastOut = P.length ? P[P.length - 1].outOut : 0;
  if (Math.abs(plan.timeline.outDurationSec - lastOut) > 1e-6) issue(["timeline", "outDurationSec"], "outDurationSec must equal the last piece outOut");

  // 6. B-roll ordinals are never renumbered, so they must stay unique
  const ords = new Set();
  plan.broll.forEach((b, i) => { if (ords.has(b.ordinal)) issue(["broll", i, "ordinal"], `duplicate ordinal ${b.ordinal}`); ords.add(b.ordinal); });

  // 7. graphic text limits (AI ≤ 32/48; user edits per graphic.editText)
  plan.graphics.forEach((g, i) => {
    const userLimits = GRAPHIC_USER_LIMITS[g.kind];
    const authored = g.origin === "user" || g.userModified;
    const lim = authored ? userLimits : GRAPHIC_AI_LIMITS;
    if (g.text.title.length > lim.title) issue(["graphics", i, "text", "title"], `title longer than ${lim.title} chars`);
    if (g.text.subtitle != null && g.text.subtitle.length > lim.subtitle) issue(["graphics", i, "text", "subtitle"], `subtitle longer than ${lim.subtitle} chars`);
  });

  // 8. caption overrides
  const insKeys = new Set();
  plan.captions.overrides.insertions.forEach((ins, i) => {
    if (insKeys.has(ins.key)) issue(["captions", "overrides", "insertions", i, "key"], `duplicate insertion key '${ins.key}'`);
    insKeys.add(ins.key);
    if (ins.srcEnd < ins.srcStart) issue(["captions", "overrides", "insertions", i, "srcEnd"], "insertion srcEnd must be >= srcStart");
    if (wordCount != null && ins.afterWordIndex >= wordCount) issue(["captions", "overrides", "insertions", i, "afterWordIndex"], "insertion anchor is outside the transcript");
  });
  if (wordCount != null) {
    plan.captions.overrides.hiddenWords.forEach((w, i) => { if (w >= wordCount) issue(["captions", "overrides", "hiddenWords", i], "hidden word is outside the transcript"); });
  }
  plan.captions.cues.forEach((c, i) => c.words.forEach((w, j) => {
    if (w.outEnd < w.outStart - 1e-9) issue(["captions", "cues", i, "words", j, "outEnd"], "word outEnd must be >= outStart");
  }));

  // 9. revisions
  if (plan.parentRevision != null && plan.parentRevision >= plan.revision) issue(["parentRevision"], "parentRevision must be < revision");
}

const EditPlanSchema = EditPlanObject.superRefine((plan, ctx) => refinePlan(plan, ctx, {}));

function parsePlan(obj, { wordCount } = {}) {
  const parsed = EditPlanObject.superRefine((plan, ctx) => refinePlan(plan, ctx, { wordCount })).safeParse(obj);
  if (parsed.success) return { ok: true, plan: parsed.data, issues: [] };
  return {
    ok: false,
    plan: null,
    issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

// ---------------------------------------------------------------- defaults / constructors
const DEFAULT_PLAN_SETTINGS = Object.freeze({
  captionStyle: "bold_pop", captionLanguage: "auto", maxWordsPerLine: 3, captionsEnabled: true, brandColors: Object.freeze([]),
  musicEnabled: true, sfxEnabled: true, brollIntensity: "medium", effects: "subtle", effectsEnabled: true,
  removeFillers: "light", removeSilence: true, silencePace: "natural", autoJumpCuts: true, punchInOnJumpCuts: true,
  platformSafe: "generic",
});

const DEFAULT_PALETTE = Object.freeze({ primary: "#ffffff", accent: "#ffd400", text: "#ffffff", onAccent: "#14130e", source: "default" });
const DEFAULT_BRAND_FONT = Object.freeze({ family: "Archivo Black", ttf: "ArchivoBlack-Regular.ttf", weight: 400 });

const STYLE_HIGHLIGHT = Object.freeze({
  bold_pop: "color", clean: "none", karaoke_blob: "blob", single_word: "single_word", minimal_lower: "none", brand_bar: "color",
});

function outputDims(aspect, shortEdge = 1080) {
  const s = Math.max(2, Math.round(shortEdge / 2) * 2);
  if (aspect === "9:16") return { width: s, height: Math.round((s * 16) / 9 / 2) * 2 };
  if (aspect === "16:9") return { width: Math.round((s * 16) / 9 / 2) * 2, height: s };
  if (aspect === "1:1") return { width: s, height: s };
  throw new EditError("INVALID_PLAN", { status: 422, errorClass: "input", detail: `unknown aspect ${aspect}` });
}

function planSettingsFromProject(ps = {}) {
  const pal = ps.brand && ps.brand.palette;
  const colors = pal ? [pal.primary, pal.secondary].filter((c) => typeof c === "string" && HEX_RE.test(c)) : [];
  const cap = ps.captions || {};
  return {
    ...DEFAULT_PLAN_SETTINGS,
    captionStyle: cap.styleId || DEFAULT_PLAN_SETTINGS.captionStyle,
    captionLanguage: cap.language || "auto",
    maxWordsPerLine: [1, 2, 3].includes(cap.maxWordsPerLine) ? cap.maxWordsPerLine : 3,
    captionsEnabled: cap.enabled !== false,
    brandColors: colors.map((c) => c.toLowerCase()),
    musicEnabled: !(ps.music && ps.music.enabled === false),
    sfxEnabled: !(ps.sfx && ps.sfx.enabled === false),
    brollIntensity: (ps.broll && ps.broll.intensity) || "medium",
    effects: (ps.effects && ps.effects.intensity) || "subtle",
    effectsEnabled: true,
    removeFillers: ps.removeFillers || "light",
    removeSilence: !(ps.removeSilence && ps.removeSilence.enabled === false),
    silencePace: (ps.removeSilence && ps.removeSilence.pace) || "natural",
    autoJumpCuts: !(ps.effects && ps.effects.autoJumpCuts === false),
    punchInOnJumpCuts: true,
    platformSafe: "generic",
  };
}

function invalid(detail) {
  return new EditError("INVALID_PLAN", { status: 422, errorClass: "input", detail });
}

function emptyPlan({ projectId, source, output, settings, now, createdBy = "system" } = {}) {
  if (!Number.isFinite(now) || now < 0) throw invalid("emptyPlan: `now` (ms epoch) is required");
  if (!source || typeof source !== "object") throw invalid("emptyPlan: source is required");
  const aspect = output && output.aspect;
  const dims = output && Number.isInteger(output.width) && Number.isInteger(output.height)
    ? { width: output.width, height: output.height }
    : outputDims(aspect);
  const s = { ...DEFAULT_PLAN_SETTINGS, ...(settings || {}) };
  s.brandColors = Array.isArray(s.brandColors) ? [...s.brandColors] : [];
  const lang = source.language || "und";
  const palette = { ...DEFAULT_PALETTE };
  if (s.brandColors.length) {
    palette.primary = s.brandColors[0];
    palette.accent = s.brandColors[1] || s.brandColors[0];
    palette.source = "user";
  }

  const plan = {
    schema: PLAN_SCHEMA_ID,
    version: PLAN_SCHEMA_VERSION,
    projectId,
    revision: 0,
    parentRevision: null,
    createdAt: now,
    createdBy,
    source: {
      assetId: source.assetId, sha1: source.sha1, durationSec: source.durationSec, fps: 30,
      width: source.width, height: source.height, analysisVersion: String(source.analysisVersion || "1"),
      transcriptHash: source.transcriptHash == null ? null : source.transcriptHash,
      timing: source.timing || "word", language: lang,
    },
    output: { aspect, width: dims.width, height: dims.height, fps: 30, background: (output && output.background) || "none" },
    settings: s,
    timeline: { pieces: [], outDurationSec: 0, mapHash: "" },
    aRoll: { segments: [] },
    cuts: [],
    captions: {
      enabled: s.captionsEnabled,
      styleId: s.captionStyle,
      language: s.captionLanguage === "auto" ? lang : s.captionLanguage,
      sourceLanguage: lang,
      position: { policy: "auto", faceAvoid: true },
      highlight: STYLE_HIGHLIGHT[s.captionStyle] || "none",
      overrides: { wordText: {}, insertions: [], hiddenWords: [], hiddenCues: [], cueY: {}, emphasis: {} },
      cues: [],
      translations: {},
      userEdited: false,
    },
    broll: [],
    opportunities: { broll: [], effects: [], graphics: [], sfx: [] },
    effects: [],
    transitions: [],
    graphics: [],
    music: null,
    sfx: [],
    branding: { logo: null, palette, font: { ...DEFAULT_BRAND_FONT }, recolorFootage: false },
    provenance: {
      director: { model: null, stage: "ve_director", promptHash: null, costUsd: 0, fallback: false },
      rhythm: { rulesVersion: "1", adjustments: [] },
      ops: [],
    },
    qa: null,
  };
  const res = parsePlan(plan);
  if (!res.ok) throw invalid(`emptyPlan: ${res.issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return res.plan;
}

module.exports = {
  PLAN_SCHEMA_ID, PLAN_SCHEMA_VERSION, ASPECTS, ENUMS, ID_PREFIXES,
  AnchorSchema, WordsAnchorSchema: WordsAnchor, SrcAnchorSchema: SrcAnchor, OutAnchorSchema: OutAnchor, ResolvedSchema,
  PieceSchema, TimelineSchema, FramingSchema, ARollSegmentSchema, CutSchema, CueSchema, CueWordSchema, InsertionSchema,
  CaptionTrackSchema, AssetRefSchema, BrollItemSchema, BrollOpportunitySchema, EffectOpportunitySchema,
  GraphicOpportunitySchema, SfxOpportunitySchema, OpportunitiesSchema, EffectSchema, TransitionSchema, GraphicSchema,
  TrackSchema, MusicSchema, SfxSchema, BrandingSchema, ProvenanceSchema, QaSchema, PlanSettingsSchema, SourceSchema,
  OutputSchema, EditPlanSchema,
  parsePlan, emptyPlan, planSettingsFromProject, outputDims, collectIds,
  DEFAULT_PLAN_SETTINGS, DEFAULT_PALETTE, DEFAULT_BRAND_FONT, STYLE_HIGHLIGHT, GRAPHIC_AI_LIMITS, GRAPHIC_USER_LIMITS,
};
