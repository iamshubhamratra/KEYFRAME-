# AI Video Edit — Edit Plan contract (schema · timeline · ops · director · invalidation)

The Edit Plan is the single source of truth for an edit. Nothing renders, plays or exports except from a plan revision.
Companion docs: `ARCHITECTURE.md`, `API.md`, `ENGINE.md`, `RENDER.md` (composition/render), `ANALYSIS.md` (inputs to the director).

Modules (`server/src/video_edit/`): `plan/schema.js` (zod) · `plan/timeline.js` · `plan/resolve.js` · `plan/ops.js` ·
`plan/revisions.js` · `plan/outline.js` · `director/director.js` · `director/rhythm.js` · `director/framing.js` ·
`director/heuristic.js` · `director/build_plan.js`. The web client mirrors pure helpers in `web/src/editModel.js`.

## 1. Conventions
- ids: `<prefix>_<nanoid8>` — `seg_`, `cut_`, `cue_` (cues use `c_<firstSrcWordIndex>` so ids survive re-chunking), `br_`, `fx_`,
  `tr_`, `gfx_`, `sfx_`, `ast_` (asset), `op_`.
- Time: seconds, ms precision, snapped to the 30 fps frame grid (`round(t·30)/30`); audio 48 kHz → 1600 samples/frame. The plan's
  ms values are for display and anchoring only: the renderer converts to integer frames first and derives every ffmpeg seek/trim
  seconds value from frame indices with ≥ 6 decimals (spike S2).
- **Speech-anchored elements live on the SOURCE timeline.** `resolved` output times are derived on every revision (never authored),
  so toggling a cut never re-runs analysis and user edits survive.
- **Tombstones:** removing an AI item sets `status:'removed'` (or `enabled:false`); it stays in the plan so restore/undo are free and
  intensity re-plans never resurrect it.
- **Origin & ownership:** `origin: 'ai'|'heuristic'|'user'`; `locked: boolean` (user pinned); `userModified: boolean` (any user op
  touched it). Re-plans (intensity/effects/pacing) may add or drop only items with `origin!=='user' && !locked && !userModified &&
  status!=='removed'`.
- **Provenance:** every element carries `reason` (≤160 chars, human readable) and optional `reasonCode` + `evidence{sentenceId,
  wordRange, quote≤80}` for the editor's "Added because…" line.

## 2. Schema (zod-style)
```ts
Origin   = 'ai' | 'heuristic' | 'user'
Anchor   = { kind:'words', w0:int, w1:int }             // inclusive transcript word indices
         | { kind:'src',   srcIn:number, srcOut:number } // source seconds
         | { kind:'out',   outIn:number, outOut:number } // output seconds (rare: user-placed overlays after cuts)
Resolved = { outIn:number, outOut:number, collapsed:boolean }   // collapsed = anchor fully cut away → hidden, not deleted

EditPlan = {
  schema:'keyframe.edit_plan', version:1, projectId, revision:int, parentRevision:int|null, createdAt:number,
  createdBy:'director'|'heuristic'|'user'|'qa-repair'|'restore'|'system',

  source:{ assetId, sha1, durationSec, fps:30, width, height, analysisVersion, transcriptHash, timing:'word'|'approx', language },
  output:{ aspect:'9:16'|'16:9'|'1:1', width, height, fps:30, background:'none'|'blur'|'brand' },
  settings:{ captionStyle, captionLanguage, maxWordsPerLine:1|2|3, captionsEnabled:boolean, brandColors:string[],
             musicEnabled:boolean, sfxEnabled:boolean, brollIntensity:'low'|'medium'|'high', effects:'subtle'|'dynamic',
             effectsEnabled:boolean, removeFillers:'off'|'light'|'aggressive', removeSilence:boolean,
             silencePace:'natural'|'fast'|'extra_fast', autoJumpCuts:boolean, punchInOnJumpCuts:boolean,
             platformSafe:'tiktok'|'reels'|'shorts'|'generic' },

  timeline:{ pieces:Piece[], outDurationSec:number, mapHash:string },           // DERIVED cache, recomputed by resolvePlan()

  aRoll:{ segments:ARollSegment[] },
  cuts:Cut[],
  captions:CaptionTrack,
  broll:BrollItem[],
  opportunities:{ broll:BrollOpportunity[], effects:EffectOpportunity[], graphics:GraphicOpportunity[], sfx:SfxOpportunity[] },
  effects:Effect[],
  transitions:Transition[],
  graphics:Graphic[],
  music:Music|null,
  sfx:Sfx[],
  branding:Branding,
  provenance:{ director:{ model, stage, promptHash, costUsd, fallback:boolean },
               rhythm:{ rulesVersion, adjustments:[{ elementId, rule, action:'dropped'|'shortened'|'moved'|'disabled' }] },
               ops:[{ opId, at, type, elementIds:string[], batchId }] },
  qa:{ revision, findings:[{ severity, category, elementId?, detail }] } | null,
}

Piece = { id, srcIn, srcOut, outIn, outOut, kind:'play'|'hold'|'speed', rate:number, chunkKey:string }

ARollSegment = { id, type:'HOOK'|'TALKING_HEAD'|'EMPHASIS'|'SCREEN_CONTENT'|'CTA', anchor, resolved, sentenceIds:string[],
  importance:0..1, editingIntent:'hook_grab'|'explain'|'proof'|'story'|'emphasis'|'aside'|'cta', faceRequired:boolean,
  framing:{ mode:'auto'|'static'|'follow', zoomBase:1..1.5, keyframes:[{ src, cx:0..1, cy:0..1, zoom }],  // normalized → aspect-independent
            userCrop?:{ cx, cy, zoom }, locked:boolean },
  label, reason, origin, locked }

Cut = { id, kind:'SILENCE'|'FILLER'|'REPEAT'|'FALSE_START'|'RETAKE'|'JUMP_CUT'|'USER', srcIn, srcOut, raw:{ srcIn, srcOut },
  snap:{ method:'rms_gap'|'word_edge'|'island_edge'|'none', padIn, padOut }, wordRange:[int,int]|null, confidence:0..1,
  controlledBy:'removeSilence'|'removeFillers'|'autoJumpCuts'|null, enabled:boolean, userToggled:boolean,
  reason, origin, locked }
  // effective(cut) = cut.enabled && (cut.controlledBy===null || settingEnabled(cut.controlledBy))
  // settingEnabled('removeFillers') = settings.removeFillers !== 'off' (discourse fillers only when 'aggressive')

CaptionTrack = { enabled, styleId, language, sourceLanguage,
  position:{ policy:'auto'|'top'|'center'|'bottom', faceAvoid:boolean, yOverride?:0..1 },
  highlight:'none'|'color'|'blob'|'sweep'|'single_word',            // forced 'none' where timing is approx and conf < .5
  overrides:{ wordText:{ [srcWordIndex]:string }, insertions:[{ key, afterWordIndex, order, text, srcStart, srcEnd }],
              hiddenWords:int[], hiddenCues:string[], cueY:{ [cueId]:0..1 }, emphasis:{ [wordKey]:boolean } },
  cues:Cue[],                                                         // DERIVED from words + overrides + style
  translations:{ [lang]:{ cues:Cue[], sourceHash, quality } }, userEdited:boolean }

Cue = { id, anchor /*words*/, resolved, text, lines:string[],
  words:[{ key /* 'w<srcIndex>' or insertion key */, i:int|null, text, srcStart, srcEnd, outStart, outEnd, emphasis:boolean, conf }],
  timingMode:'words'|'proportional', pos:{ x, y, an }|null, styleOverride?, hidden:boolean, edited:boolean }

AssetRef = { assetId, provider:'pexels'|'pixabay'|'openverse'|'user'|'screenshot', providerId, type:'video'|'image', path,
  thumbPath, sourceUrl, license, attribution:string|null, width, height, durationSec:number|null, trimInSec, dhash, tags:string[],
  scores:{ lexical, judgeRelevance:0..10|null, judgeQuality:0..10|null, issues:string[], resolution, aspect, composition,
           brand, duration, diversity, total } }

BrollItem = { id, ordinal:int /* never renumbered */, anchor, resolved, sentenceId, segmentId,
  layout:'FULL'|'PIP'|'SPLIT', layoutParams:{ corner?:'tl'|'tr'|'bl'|'br', scale?:0.3..0.55, splitSide?:'top'|'bottom' },
  intent:'illustrate'|'context'|'data'|'emotion', queries:[{ text, kind:'visual_noun'|'scene'|'fallback'|'user' }],
  reason, reasonCode, evidence,
  chosen:AssetRef|null, candidateSetId, topCandidates:AssetRef[] /* ≤8; full list in broll/candidates/<id>.json */,
  judge:'ok'|'unavailable', motion?:{ from:{ z, cx, cy }, to:{ z, cx, cy } },
  status:'pending'|'ok'|'missing'|'removed', origin, locked, userModified }

Effect = { id, anchor, resolved, enabled, reason, origin, locked, userModified } & (
    { kind:'PUNCH_IN', zoom:1.05..1.35, center:'face'|{ cx, cy } }
  | { kind:'PUNCH_OUT', toZoom }
  | { kind:'JUMP_ZOOM', zoom }                                   // derived at jump-cut joints (autoJumpCuts), not counted in caps
  | { kind:'ZOOM_EMPHASIS', fromZoom, toZoom, durationSec:0.4..1.2, ease:'smoothstep'|'linear' }
  | { kind:'REFRAME', cx, cy, zoom }
  | { kind:'FREEZE', atSrc, holdSec:0.2..0.8 }
  | { kind:'SPEED', rate:0.5..2, target:'aroll_nonspeech'|'broll' } )

Transition = { id, kind:'CUT'|'DIP_BLACK'|'DIP_WHITE'|'FLASH'|'CROSSFADE', at:{ joint:'after', elementId }|{ outAt },
  durationSec:0.08..0.4, enabled, reason, origin, locked }

Graphic = { id, kind:'HOOK_TITLE'|'KEYWORD'|'STAT'|'LOWER_THIRD'|'CTA'|'LOGO_OUTRO', anchor, resolved,
  text:{ title /*≤32*/, subtitle? /*≤48*/, value? }, templateId, variables, region:'top'|'center'|'bottom',
  renderer:'hyperframes'|'ass', fallback:'ass', render:{ cardHash, path:string|null, status:'pending'|'ok'|'fallback'|'failed' },
  enabled, reason, origin, locked, userModified }

Music = { enabled, track:{ assetId, path, provider:'pixabay_bridge'|'synth'|'user', title?, query, mood, sourceUrl?, license, durationSec },
  candidates:Track[] /*≤3*/, volume:0.06..0.16, envelope:[{ anchor, volume }], duck:{ enabled, depthDb:-24..-3 },
  startOffsetSec, fadeInSec, fadeOutSec, reason, origin, locked }

Sfx = { id, cue:'whoosh'|'swoosh'|'pop'|'click'|'riser'|'impact'|'sparkle'|'ding'|'transition', path,
  anchor:{ elementId, edge:'in'|'out', offsetSec }, resolved:{ outAt }, volume:0.15..0.45, license, attribution:string|null,
  enabled, reason, origin, locked }

Branding = { logo:{ assetId, path, placement:'tl'|'tr'|'bl'|'br', scale:0.08..0.2, opacity:0.6..1, marginPct:0.03..0.08,
                    show:'always'|'intro_outro'|'none' } | null,
  palette:{ primary, accent, text, onAccent, source:'user'|'logo'|'default' }, font:{ family, ttf, weight },
  recolorFootage: false /* z.literal(false) */ }

BrollOpportunity   = { id, sentenceId, wordAnchor?:{ w0, w1 }, priority:0..1, layoutPreference, mediaPreference:'video'|'image'|'either',
                       queries:string[2..4], reason, candidatesPrefetched:boolean }
EffectOpportunity  = { id, sentenceId, w:int, kind:'PUNCH_IN'|'ZOOM_EMPHASIS', priority, reason }
GraphicOpportunity = { id, kind, sentenceId, title, subtitle?, value?, priority, reason }
SfxOpportunity     = { id, anchor:'broll_in'|'graphic_in'|'punch_in'|'section_change', ref, cue, priority, reason }
```
Validation extras (in `schema.js` refinements): ids unique across the plan; anchors reference existing words/elements; numeric
ranges as above; `recolorFootage` literal false; `output.width/height` even and matching aspect; tombstoned items keep valid shape.

## 3. Timeline math (`plan/timeline.js`, pure, unit-tested)
1. **Effective cuts** `C = { c | effective(c) }`, quantized inward (`srcIn=⌈srcIn·30⌉/30`, `srcOut=⌊srcOut·30⌋/30`), merged when
   the gap between them < 2 frames.
2. **Kept ranges** `K = [head, D − tail] \ ∪C`, head = max(0, firstWord.start − 0.15), tail = max(0, D − (lastWord.end + 0.15)).
   **minRemove**: SILENCE/JUMP_CUT ≥ 0.25 s, FILLER ≥ 0.15 s (smaller → `enabled=false`, adjustment rule `min_cut`).
   **minKeep** 0.35 s: a shorter kept range without words is absorbed into the neighbouring cut; with words it disables the shorter
   adjacent cut (rule `min_keep`) and step 2 repeats (bounded to 50 iterations).
3. **Pieces:** FREEZE inserts a `hold` piece (`srcIn=srcOut=atSrc`, `outLen=holdSec`); SPEED splits a piece (`outLen=(srcOut−srcIn)/rate`);
   `outIn_0 = 0`, `outIn_{i+1} = outIn_i + outLen_i`. `chunkKey` = sha1(srcIn, srcOut, kind, rate, framing slice) — excludes outIn.
4. **TimeMap** (binary search): `srcToOutStart(t)` (inside a cut → next piece `outIn`), `srcToOutEnd(t)` (inside a cut → previous
   piece `outOut`), `outToSrc(o)`; `resolve(anchor)` → `{ outIn, outOut, collapsed }` with `collapsed = outOut − outIn < minDur`
   (2 frames for words/effects/cues, 0.4 s for B-roll/graphics). Words removed by cuts are dropped from cues.
5. **RMS envelope** (from `analysis/audio.json` or recomputed from 16 kHz PCM, hop 10 ms, window 20 ms): `floor` = P10 of non-speech
   frames, `speech` = median inside words.
6. **Word-edge refinement:** end extends forward while RMS > floor + 10 dB (≤150 ms), start extends backward (≤120 ms), clamped to
   neighbours; with `timing:'approx'` edges snap to the nearest dip within ±80 ms.
7. **Gap cut** between words k and k+1: `a` = first frame ≥ end_k + 0.04 where RMS < floor + 6 dB holds for 30 ms, clamped to
   [end_k + 0.04, end_k + 0.20]; `b` = last such frame ≤ start_{k+1} − 0.04, clamped to [start_{k+1} − 0.15, start_{k+1} − 0.04];
   `keepGap` from pace: natural 0.20 s (remove gaps ≥ 0.60 s), fast 0.14 s (≥ 0.35 s), extra_fast 0.10 s (≥ 0.20 s);
   `cut = [a + keepGap/2, b − keepGap/2]`.
8. **Filler cut:** `[w.start − 0.03, w.end + 0.05]` merged with adjacent silence; requires `conf ≥ 0.6` (and a dip/island edge on both
   sides when approx); **veto** `coarticulated` when both 40 ms flanks are > speech − 6 dB.
9. **Repeat / false start / retake:** from the fragment's first word start − 0.03 to the kept take's first word start − 0.06.
10. **Joints:** voice stem gets 6 ms `afade` out/in at every joint (no zero-crossing search needed).
11. **Jump-cut framing alternation** (`autoJumpCuts && punchInOnJumpCuts`): at joint J between pieces i and i+1 unless a scene change
    lies in the removed span, FULL B-roll covers J, removed duration < 0.12 s, or a hold/speed piece is involved:
    `Z(i+1) = Z(i) === Z0 ? Z1 : Z0`, Z1 = 1.10 (subtle) / 1.20 (dynamic), centred on the smoothed face at J. Upscale cap
    `outH·Z / cropH_base ≤ 2.0` on export; if even Z1 = 1.05 fails, alternate ±4 % horizontal offset instead and flag `lowRes`.
    Headroom: face box top ≥ 8 % of crop height; face centre y target 0.38 (9:16) / 0.42 (1:1) / 0.40 (16:9).
    Inside a piece framing moves only when the face leaves the dead zone (±12 % x, ±8 % y), eased over 0.5 s; joints may re-centre instantly.

## 4. Resolution (`plan/resolve.js`)
`resolvePlan(plan, ctx) → plan` (pure): recompute effective cuts → pieces → TimeMap → `resolved` for every anchored element → derive
caption cues (grouping per `RENDER.md` §Captions using words ∖ cut words ∖ hiddenWords ∪ insertions with overrides) → collapse flags →
`timeline.mapHash`. Called after every op batch and before composition. Deterministic: same plan + same analysis → byte-identical output.

## 5. Ops (`plan/ops.js applyOps(plan, ops, ctx) → { plan, warnings, invalidates, costEvents }`)
Transport and concurrency: `API.md` `POST /:id/ops`. A batch is atomic (all ops validate against the evolving draft; any 422 aborts
the batch) and produces one revision. Every op marks touched AI items `userModified=true` unless stated. Invalidation levels:
`NONE` (plan only) · `AUDIO` (re-mix/remux) · `COMPOSITE[range]` (ASS/overlays/cards) · `BASE[range]` (A-roll chunks) · `SHIFT[range]`
(duration change: changed chunks + downstream re-projection). Net: `none` | `fetch` (stock/music search or download, no model) |
`AI` (OpenRouter/KIE call — shown as "1 AI CALL" in the UI).

### Captions
| Op | Payload | Validation | Invalidates | Net |
|---|---|---|---|---|
| `captions.setEnabled` | `{enabled}` | bool | COMPOSITE* | none |
| `caption.editText` | `{cueId, text}` | cue exists; 1–120 chars; ≤ 2×orig tokens + 4; not punctuation-only; all-deleted → 422 "use caption.hide" | COMPOSITE[cue] | none |
| `caption.hide` / `caption.show` | `{cueId}` | exists | COMPOSITE[cue] | none |
| `caption.setEmphasis` | `{cueId, wordKey, emphasis}` | word in cue | COMPOSITE[cue] | none |
| `caption.setPosition` | `{cueId, y:0..1|null}` | clamped to style safe band | COMPOSITE[cue] | none |
| `caption.rebuildFromWords` | `{range:[outIn,outOut]}` | QA repair only | COMPOSITE[range] | none |
| `captions.setStyle` | `{styleId, maxWordsPerLine?}` | style in registry | COMPOSITE* | none |
| `captions.setPosition` | `{y}` | safe band | COMPOSITE* | none |
| `captions.setLanguage` | `{language:'auto'|code}` | code in `caption_lang.js` | COMPOSITE* | none if spoken language, else AI (translation, async) |

**Caption re-timing (`caption.editText`)** — times in source seconds:
1. Tokenize with `Intl.Segmenter(lang, {granularity:'word'})`; trailing punctuation attaches to the previous token; compare on
   NFKC + lowercase + strip `\p{P}`.
2. LCS diff old words vs new tokens (cues ≤ ~15 tokens) → runs of equal / delete / insert.
3. Equal tokens keep timing, `srcWordIndex`, emphasis; take the new display text (case/punctuation edits are free).
4. Adjacent delete+insert = substitution. Same length: pairwise inheritance → `overrides.wordText`. Different length: split the deleted
   span `[first.srcStart, last.srcEnd]` across new tokens proportional to character length (≥ 80 ms each); first token inherits
   `srcWordIndex`, the rest become `insertions` anchored `afterWordIndex`.
5. Pure insert: into the gap between neighbours if gap ≥ 80 ms × n (proportional to chars); else borrow symmetrically from neighbours
   (each keeps ≥ 60 % and ≥ 80 ms); else compress between neighbour midpoints. Stored in `insertions`.
6. Pure delete → `hiddenWords`; everyone else keeps timing.
7. Clamp monotonic, inside the original cue window, never overlapping neighbouring cues; cue start/end = first/last visible word.
8. Re-break lines for that cue only; new words have no emphasis; dirty range = projected span of that cue.

### Cuts and pacing
| Op | Payload | Validation | Invalidates | Net |
|---|---|---|---|---|
| `cut.toggle` | `{cutId, enabled}` | exists; sets `userToggled` | SHIFT[cut] | none |
| `cut.adjust` | `{cutId, padStart:-0.3..0.3, padEnd:-0.3..0.3}` | may not cross a kept word midpoint | SHIFT[cut] | none |
| `cut.add` | `{w0, w1}` or `{srcIn, srcOut}` | ≤ 60 s; not the whole take; protected sentence needs `force` | SHIFT[range] | none |
| `cuts.restoreAll` | `{kind?}` | enum | SHIFT* | none |
| `settings.set` | `{key: removeSilence|silencePace|removeFillers|autoJumpCuts|punchInOnJumpCuts, value}` | enum/bool | SHIFT* | none (re-derived from stored detections; `userToggled` cuts keep their state) |

### B-roll
| Op | Payload | Validation | Invalidates | Net |
|---|---|---|---|---|
| `broll.replace` | `{id, candidateId}` or `{id, assetId}` (uploaded via `POST /:id/assets`, later phase) | candidate in the stored set / search result; video duration ≥ slot or image | COMPOSITE[item] | fetch if not downloaded |
| `broll.regenerate` | `{id, query?}` | query 2–80 chars | COMPOSITE[item] | none if unseen stored candidates and no query; else fetch; judge on new candidates = AI |
| `broll.remove` / `broll.restore` | `{id}` | status transitions | COMPOSITE[item] | none |
| `broll.setLayout` | `{id, layout, corner?, scale?}` | SPLIT only for 9:16 (vertical split) and 16:9 (side split); server may move PIP (warning) | COMPOSITE[item] (SPLIT → BASE[item]) | none |
| `broll.setTiming` | `{id, w0, w1, offsetIn, offsetOut}` | 1–8 s; no B-roll overlap; not inside a cut | COMPOSITE[old ∪ new] | none |
| `broll.add` | `{sentenceId, layout?, useAi?:false}` | sentence not fully cut; `faceRequired` needs `force` | COMPOSITE[new] | fetch; AI only if `useAi` |
| `broll.setLocked` | `{id, locked}` | — | NONE | none |
| `settings.set brollIntensity` | `{value}` | enum | COMPOSITE* | none if opportunities pre-fetched, else fetch |

### Effects, transitions, graphics
| Op | Payload | Validation | Invalidates | Net |
|---|---|---|---|---|
| `effect.toggle` | `{id, enabled}` | — | PUNCH/ZOOM/REFRAME: BASE[item]; FREEZE/SPEED: SHIFT[item] | none |
| `effect.adjust` | `{id, zoom?:1.05..1.40, w0?, w1?}` | ≥ 0.4 s | BASE[old ∪ new] | none |
| `settings.set effectsEnabled` / `effects` | `{value}` | bool / enum | BASE* | none |
| `transition.set` | `{id, kind}` | CROSSFADE only at segment boundaries with kept pause ≥ .3 s | COMPOSITE or BASE[joint] | none |
| `graphic.editText` | `{id, title?, subtitle?, value?}` | HOOK ≤ 60, LOWER_THIRD ≤ 40/50, KEYWORD/STAT ≤ 48, CTA ≤ 60 | COMPOSITE[item] (+ card re-render) | none |
| `graphic.toggle` | `{id, enabled}` | — | COMPOSITE[item] | none |

### Audio
| Op | Payload | Validation | Invalidates | Net |
|---|---|---|---|---|
| `music.change` | `{candidateId}` or `{query|mood}` | candidate exists | AUDIO | none / fetch |
| `music.remove` / `music.restore` | `{}` | — | AUDIO | none |
| `music.setVolume` | `{volumeDb:-30..0}` | coalesced client-side | AUDIO | none |
| `music.setDucking` | `{enabled, depthDb:-24..-3}` | — | AUDIO | none |
| `sfx.toggle` | `{id, enabled}` | — | AUDIO | none |
| `sfx.setVolume` | `{id, volumeDb:-30..6}` | — | AUDIO | none |
| `sfx.muteAll` | `{muted}` | — | AUDIO | none |

### Branding, framing, output, meta
| Op | Payload | Validation | Invalidates | Net |
|---|---|---|---|---|
| `branding.setLogo` | `{assetId}` | kind logo | COMPOSITE* | none |
| `branding.removeLogo` | `{}` | — | COMPOSITE* | none |
| `branding.setLogoPlacement` | `{placement, scale, opacity}` | ranges | COMPOSITE* | none |
| `branding.setPalette` | `{primary, accent?, presetId?}` | `#RRGGBB` | COMPOSITE* (+ cards) | none |
| `framing.adjust` | `{segmentId, offsetX:-1..1, offsetY:-1..1, zoom:1..2}` | warns if the face leaves the crop | BASE[segment] | none |
| `framing.reset` | `{segmentId}` | — | BASE[segment] | none |
| `output.setAspect` | `{aspect}` | ≠ current | BASE* + COMPOSITE* + AUDIO remux | none (stored face track, caption re-layout, B-roll re-ranked from stored candidates; fetch only for a newly chosen asset) |
| `edit.setTitle` | `{title:1..80}` | — | NONE | none |
| undo / redo | endpoint | canUndo/canRedo | computed by `diffLevels` between revisions | none |

**Re-plan rule** (intensity / effects / pacing settings): only eligible AI items (§1) may be added or removed; opportunities sorted by
priority desc then out-time asc; spacing constraints and protected moments applied (§6); result reported as a warning
`{code:'REPLANNED', added, removed, keptUserChanges}`.

## 6. Director and rhythm engine
**`ve_director`** (`director/director.js`, `ai/llm.js callJson`, zod + one repair re-ask). Input: ContentAnalysis (`ANALYSIS.md`),
sentences `{id, outDur, faceVisiblePct, shotType, screenContent}`, settings, vocabularies (layouts, SFX cues, graphic kinds, moods).
Output (over-complete, ranked — intensity changes never need another LLM call):
```ts
Opportunities = {
  brollOpportunities:[{ sentenceId, wordAnchor?:{ fromText, toText }, priority:0..1, layoutPreference:'FULL'|'PIP'|'SPLIT',
    mediaPreference:'video'|'image'|'either', queries:string[2..4] /* concrete visual nouns ≤5 words */, reason≤120 }],
  punchIns:[{ sentenceId, wordText, kind:'PUNCH_IN'|'ZOOM_EMPHASIS', priority, reason }],
  graphics:[{ kind, sentenceId, title≤32, subtitle?≤48, value?, priority, reason }],
  sfx:[{ anchor:'broll_in'|'graphic_in'|'punch_in'|'section_change', ref, cue, priority, reason }],
  music:{ include:boolean, mood, query≤4 words, energy:0..1, reason },
  transitions:[{ afterSentenceId, kind:'DIP_BLACK'|'FLASH', reason }],
  hookTitle?:{ text≤32, sentenceId }, ctaCard?:{ text≤32, sentenceId } }
```
Post-parse: unknown ids dropped; `wordText` resolved to word indices by fuzzy match inside the sentence.

**Deterministic selection** (`director/rhythm.js selectEdits(ctx)`, output timeline; every rejection/clamp logged to
`provenance.rhythm.adjustments`):
1. Resolve opportunities to out spans; drop collapsed; locked/user elements placed first and consume budget.
2. **Protected moments** (no B-roll, graphics or SFX): out < hookGuard; `faceRequired` sentences (sincere, personal, humor, direct
   address); CTA segment; last 2.0 s; SCREEN_CONTENT segments; face-absent ranges (B-roll only); shaky ranges (no punch-ins).
3. **B-roll:** priority desc then earlier first; skip below threshold. Span start = anchor word start − 0.10; end = word end + 0.15,
   extended to the next joint when ≤ 0.4 s away; clamp to [min,max]; long sentence → densest keyword/emphasis window; covering a joint
   +0.10 priority. Accept only if coverage ≤ max, gap to previous ≥ minGap, items in any 60 s window ≤ cap, face shown ≥ minFaceAfter
   after every FULL, the video starts and ends on the face, no overlap with graphic regions.
4. **Punch-ins:** PUNCH_IN at emphasis word start, PUNCH_OUT at the next joint or after 2–4 s; spacing + per-minute caps (JUMP_ZOOM not counted).
5. **Graphics:** HOOK_TITLE only if hook strength ≥ 0.5 and within the first 3 s; CTA card only when a CTA exists; KEYWORD/STAT need
   ≥ 2.5 s without FULL B-roll in a region captions don't use.
6. **SFX:** only on accepted visual events; no identical consecutive cues; none within 0.3 s of a filler joint.
7. **Transitions:** CUT by default; DIP/FLASH only at segment boundaries with a kept pause ≥ 0.3 s.
8. **Music:** volume 0.08 (energy < 0.4) … 0.12 (≥ 0.7), clamped 0.06–0.16; envelope +0.04 before the first word and after the CTA;
   0.06 during `faceRequired` sentences; duck depth −9 dB default.

**RHYTHM_DEFAULTS**
| B-roll | low | medium (default) | high |
|---|---|---|---|
| max coverage of output | 12 % | 25 % | 40 % |
| max items per 60 s | 2 | 4 | 7 |
| minGap (face between) | 8 s | 5 s | 3 s |
| duration min–max | 1.8–4.0 s | 1.5–4.5 s | 1.2–5.0 s |
| hookGuard | 2.5 s | 2.0 s | 1.5 s |
| priority threshold | 0.70 | 0.55 | 0.40 |
| minFaceAfter FULL | 3.0 s | 2.0 s | 1.5 s |
| back-to-back FULL | no | no | ≤ 2, ≤ 8 s total |

| Effects | subtle (default) | dynamic |
|---|---|---|
| jump-cut Z1 | 1.10 | 1.20 (capped) |
| emphasis punch-ins per 60 s / min spacing | 2 / 10 s | 5 / 5 s |
| ZOOM_EMPHASIS | off | ≤ 2 per 60 s, 0.6–1.2 s, Δz ≤ 0.12 |
| FREEZE | 0 | ≤ 1 per video, 0.4–0.6 s, before CTA/reveal |
| SPEED | 0 | non-speech A-roll or B-roll only, 0.8–1.5× |
| non-cut transitions / spacing | ≤ 1 / ≥ 20 s | ≤ 3 / ≥ 12 s |
| SFX per 60 s / spacing / volume | 2 / 6 s / 0.20–0.30 | 5 / 3 s / 0.25–0.40 |
| graphics per 60 s (+ hook, CTA ≤ 1 each) | 1 | 2 |
| captions | color highlight, fade | pop + highlight + emphasis ×1.12 |

**Heuristic director** (`director/heuristic.js`, no LLM, same rhythm engine, `provenance.director.fallback=true`):
hook = sentences within the first 4 s (strength 0.6 when the first sentence has a question, number or superlative, else 0.4);
CTA = last ≤ 2 sentences matching `lexicon[lang].ctaPatterns`; faceRequired when first-person-emotional ratio ≥ 0.3 or CTA;
B-roll on sentences with ≥ 1 TF-IDF-salient noun-like non-stopword token (priority = salience · min(1, outDur/2.5); queries = top
bigram/unigram through `query_terms.subjectQuery` + `asset_taxonomy.classify`; layout FULL, PIP when faceVisiblePct < 0.3);
punch-ins on superlatives, numbers, "key/secret/most important", "!"; STAT graphic on number + unit; music energetic when words/s > 3
or "!" density > 0.1 else calm (query `mood + " background"`); SFX whoosh on FULL B-roll entry only.

`director/build_plan.js buildInitialPlan(ctx)` = segments from content analysis → cuts from transcript detections (§3) → director
opportunities (or heuristic) → rhythm selection (B-roll opportunities restricted to sentences whose slot in `analysis/broll_scored.json` has an accepted candidate)
→ B-roll items with `chosen`/`topCandidates` attached from the slot (`status:'ok'`; `ANALYSIS.md` §8) → captions track (style from settings)
→ music/SFX → branding → `resolvePlan` → revision 1 (`createdBy:'director'|'heuristic'`). `redirect(plan, ctx, {keepLocked:true})` for
"Regenerate with AI".

## 7. Outline (`plan/outline.js outline(plan)`)
Returns the user's tree for the editor and API:
```
{ duration, aRoll:[{ id, type, outIn, outOut, label, effects:[kind] }],
  tracks:{ captions:{ enabled, styleId, cueCount }, broll:[{ id, ordinal, outIn, outOut, layout, status }],
           effects:[{ id, kind, outIn, outOut, enabled }], music:{ enabled, title, outIn, outOut } | null,
           sfx:[{ id, cue, outAt, enabled }], branding:{ logo:boolean, palette }, transitions:[{ id, kind, outAt }] },
  summary:{ captions:boolean, brollCount, punchIns, jumpCuts, fillersRemoved, silenceRemovedSec, music:boolean, logo:boolean, hookTitle:boolean } }
```

## 8. Revisions and invalidation (`plan/revisions.js`)
- `saveRevision` writes `plan/revisions/r<6 digits>.json` (canonical JSON, sha256) via the store; head/undo/redo live in project.json.
- `diffLevels(prevComposition, nextComposition)` → `{ level, ranges }` by comparing per-level hashes (A-roll chunk keys, voice hash,
  ASS hash, overlay conform hashes + geometry, card hashes, logo, music/SFX/envelope) — the server's authority for what re-renders
  (the per-op table above is used only for estimates and UI hints).
- Undo creates revision r+1 equal to the target revision's content (never deletes history, never re-fetches assets).
