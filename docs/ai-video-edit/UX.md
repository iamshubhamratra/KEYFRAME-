# AI Video Edit — UX & frontend contract (web/)

Status: implementation contract for Phase 8. Backend contracts: `API.md` (routes/SSE/views), `EDIT_PLAN.md` (plan, ops, outline).
Product principle: **an AI video editor, not a timeline editor.** The editor opens with the edit already applied; the user rejects
or changes AI decisions, each tied to the transcript line that caused it. Preview always equals export (server renders only).

## 0. Constraints
- Stack: React 19 + Vite 8 + Tailwind v4 + framer-motion, plain JS, no router/state library/test runner.
- **New files only**, except additive wiring in `web/src/App.jsx` (§4.6). `App.jsx`, `api.js`, `index.css`, `CreateScreen.jsx`,
  `Premiere.jsx`, `ScriptRoom.jsx`, `Templates.jsx`, `UnderstandingScreen.jsx`, `packlore.js` carry the user's uncommitted edits — never
  refactor them; copy patterns instead. `AdminShared.jsx` (unmodified) exports `Stat`, `Pill`, `QDRow`, `PanelHead`, `Field` — import them.
- Design system "KEYFRAME v2 film set" (`web/src/index.css`): tokens `--color-ground #f4f0e6`, `--color-paper`, `--color-ink #17130e`,
  `--color-dim`, `--color-mag #e832a8` (accent; `btn-mag` only for commit/spend CTAs: **Start AI edit**, **Export**), `--color-cy`,
  `--color-am`, `--color-lm`, `--color-cb`, `--color-rec`; dark: `--color-dark`, `--color-editor`, `--color-dark-ink`, **`--color-dark-dim`
  for secondary text on dark** (`--color-dim` fails contrast there), `--color-dark-line`. Fonts: display Bricolage Grotesque, body Hanken
  Grotesk, mono IBM Plex Mono (uppercase labels). Recipes: `.card/.spine`, `.editor-card/.editor-head/.tl-dot`, `.editor-inset`,
  `.btn-ink(.on-dark)`, `.btn-mag(.btn-big)`, `.btn-chip(.is-active)`, `.btn-outline-dark(.btn-sm)`, `.scene-pill`, `.headline(.on-dark)`,
  `.label-mono`, `.link-mono(.on-dark)`, `.timecode`, `.rec-blip`, `.editor-status`, `.chip-c(.is-active,.on-paper)`, `.clip-track/.clip-block`,
  `.meter`, `.inset-field`; `[data-demo-grid]` stacks under 860 px; global `:focus-visible` magenta outline; `prefers-reduced-motion`
  kill switch. Motion ease `[0.16,1,0.3,1]`, 0.2–0.45 s. Dark pages: `marginTop:-90; paddingTop:90` and added to App `darkPage`.
- Lint rules (eslint react-hooks v7 + react-refresh): `.jsx` files export components only (helpers/contexts/hooks in `.js`); no
  synchronous `setState` in effect bodies (derive in render, reset with `key`, set state in handlers/callbacks, `useSyncExternalStore` for
  stores); no ref reads during render; no `Date.now()` in render (clock store); no unused vars. Gates: `npm run lint` error count must not
  exceed the baseline (6) and `npm run build` passes.
- Global instruction: accessible (ARIA), mobile-first, responsive (390 / 768 / 1440 px), honour tokens; use the frontend design skills.

## 1. Screens & flow
### 1a. Entry points & mode
- `web/src/modes.js`: `GENERATION_MODES = { TEMPLATE_GENERATION, AI_VIDEO_EDIT }`; mode derived from the current view
  (`create` → TEMPLATE_GENERATION; `aiUpload|aiEdit|aiEdits` → AI_VIDEO_EDIT).
- `components/ModeSwitch.jsx` — rendered by App **above** `<AnimatePresence>` only on `create`/`aiUpload`:
  `<nav aria-label="Studio mode">` with "Make a film" / "Edit my video" buttons (`aria-current="page"`, `.btn-chip.is-active`, ≥44 px).
- `components/AiEditNavChip.jsx` — nav chip "AI EDIT" after Gallery (shows `AI EDIT · 42%` during an upload); wrapper
  `<span className="hidden sm:inline-flex">` (the unlayered `.btn-chip{display:inline-flex}` overrides Tailwind `hidden`).
- Optional landing CTA "Edit my video →" (`public/design.html` + `kf-bridge.js` message `kf-ai-edit`) — Phase 8b.

### 1b. Upload — `screens/aiEdit/AiEditUpload.jsx` (paper page, "SC 01 · THE FOOTAGE")
- Headline: "Drop the take. *We'll make the cut.*" Sub: "Record yourself talking. KEYFRAME transcribes it, trims the dead air, adds
  B-roll, captions and music — then hands you an edit you can change."
- Continue strip: up to 3 recent edits + "All my edits →".
- Grid `1.15fr .85fr` (`data-demo-grid`). Left `editor-card` "KEYFRAME — EDIT BAY": **Dropzone is a real `<button>`** ("Choose a video file,
  or drop it here", `aria-describedby` → limits line `MP4 · MOV · WEBM · UP TO 500 MB · 3 SEC – 5 MIN` from `GET /capabilities`); touch
  "Record now" `<input accept="video/*" capture="user">`; file row (poster, name, size, duration, resolution, remove); `ProgressBar`
  (`role=progressbar`, `aria-valuetext`) `UPLOADING 42% · 180/430 MB · 6.1 MB/S · ~1 MIN` + Cancel; at 100 % indeterminate
  "CHECKING THE FOOTAGE…". Right paper card "WHAT YOU'LL GET" (✓ Captions · B-roll · Punch-ins · Jump cuts · Silence & filler removal · Music ·
  Logo), defaults line `9:16 · BOLD CAPTIONS · AUTO LANGUAGE · MEDIUM B-ROLL · SUBTLE FX · FILLERS + SILENCE OUT · MUSIC ON`,
  disclosure "Customize" (`aria-expanded`).
- **Consent + privacy** (required checkbox, unchecked blocks Start): "I agree that KEYFRAME sends my video's audio and small still frames to
  third-party AI models (via OpenRouter and KIE) to create this edit. The full video is never sent. [How we handle your video]" — link opens
  a `<dialog>`: what is sent (audio segments, sampled frames ≤640 px, transcript text), who receives it (OpenRouter, KIE and model
  providers behind them), what is stored (source, proxy, analysis, renders, exports), how to delete (Delete edit removes everything).
- Primary CTA `btn-mag btn-big` "Start AI edit →" (v1: the upload starts on Start; the full multipart request carries the settings).
- Customize panel:
| Setting | Control | Default |
|---|---|---|
| Format | radiogroup MATCH MY VIDEO / 9:16 / 16:9 / 1:1 (aspect swatches) | Match my video |
| Caption style | radiogroup tiles BOLD POP / CLEAN / KARAOKE / SINGLE WORD / MINIMAL / BRAND BAR / OFF | BOLD POP |
| Words per line | radiogroup 1 / 2 / 3 | 2 |
| Caption language | select "Auto — match what I say" + en/hi/es/fr/de/pt/ar/ja | Auto |
| Brand colours | `BrandPalettePicker` (presets ocean/sunset/forest/royal/neon/gold + custom hex) | KEYFRAME default |
| Logo | upload slot PNG/JPG/WEBP ≤5 MB with explicit errors | none |
| Music | Switch | on |
| B-roll | LOW / MEDIUM / HIGH ("≈ 1 every 15 s / 12 s / 8 s") | Medium |
| Effects | SUBTLE / DYNAMIC | Subtle |
| Remove fillers | Switch + UM/UH ONLY · + LIKE, YOU KNOW | on, um/uh only (`light`) |
| Remove silence | Switch + NATURAL / FAST / EXTRA FAST | on, Natural |
| Auto jump cuts | Switch ("PUNCH-IN HIDES THE CUT") | on |
- Client checks before any network (via `<video>` metadata, 8 s timeout) with exact copy:
| Check | Blocking | Copy |
|---|---|---|
| type not mp4/mov/webm | yes | "That's a **.avi** file. AI Edit takes MP4, MOV or WEBM — export it as MP4 and drop it again." |
| empty | yes | "This file is empty. Try exporting it again." |
| over size | yes | "This file is **3.4 GB**. The limit is **500 MB** — export at 1080p and it will fit." |
| metadata unreadable (HEVC) | no | "Your browser can't preview this file (common with iPhone HEVC). You can still upload it — we'll check it when it arrives." |
| too long | yes | "This take runs **14:32**. AI Edit handles up to **5:00** — trim it, or split it into parts." |
| too short | yes | "This clip is **2 seconds**. Give us at least **3 seconds** of you talking." |
| < 480p | no | "Low resolution (**360p**) — the edit will look soft." |
| consent unchecked | yes | "Tick the box so we can send the audio and frames to the AI models." |
| 401 | — | "Your session ended. Log in to keep going." |
| 413 / 415 / 422 | — | server `message` verbatim (MEDIA_REJECTED reasons mapped to friendly copy in `editFormat.errorCopy`) |
| offline | — | "SIGNAL LOST — upload stopped at 42%. Choose the file again to retry." |
- Upload state machine (module store, survives navigation): `idle → checking → rejected | ready → uploading → verifying → started` +
  `failed`, `cancelled`. `beforeunload` guard only while bytes are in flight.

### 1c. Analysis — `screens/aiEdit/AiEditAnalyzing.jsx` (dark page, "SC 02 · THE READ")
Headline "Watching your *take.*" / failed "The take got *cut.*" / ready "That's a *cut.*". Left `editor-card`: `StageChecklist`
(`<ol aria-label="Edit stages">`, `aria-current="step"`), progress bar, ETA ("about 2 min" / "under a minute" / "finishing up"; never 0;
increases capped at +20 %/tick), queue line `IN LINE — 2 EDITS AHEAD`, "Stop analyzing" link (dialog: "Stop analyzing? Your upload is kept —
restart any time without uploading again."), "You can close this tab — we'll keep working. It'll be in **My edits**." Right card
"WHAT WE'RE HEARING" live-filled from `discoveries`: poster, `2:14 · 1080×1920 · 30FPS`, `ENGLISH`, `1,284 WORDS · 164 WPM`,
`14 FILLERS FOUND`, `22 SILENCES · 38S`, topic chips, "Hook we'd lead with: “…”", `9 B-ROLL MOMENTS`, `FACE FOUND ✓`.
| Backend stage | Label | Sub |
|---|---|---|
| VALIDATING | FOOTAGE IN | Checking the file |
| COMPRESSING | PREPPING FOOTAGE | Compressing and normalizing |
| EXTRACTING_AUDIO | MEASURING AUDIO | Levels and pauses |
| TRANSCRIBING | TRANSCRIBING | Sending audio to our speech model |
| ANALYZING_VIDEO | WATCHING THE TAKE | AI checks sampled frames for your face and framing |
| ANALYZING_CONTENT | READING THE SCRIPT | AI finds topics, hook and key lines |
| BUILDING_EDIT_PLAN | DIRECTING THE CUT | Cuts, captions, effects |
| SEARCHING_BROLL / SCORING_ASSETS | PULLING B-ROLL & MUSIC | Stock library and music |
| PREPARING_RENDER / RENDERING / POST_PROCESSING | ROLLING THE PREVIEW | First draft |
| QUALITY_CHECK | CHECKING THE CUT | Automatic quality check |
| READY / COMPLETED | READY | — |
On READY/COMPLETED announce "Your edit is ready" (polite) and switch to the editor after 900 ms inside the same session component.

### 1d. Editor — `screens/aiEdit/AiEditor.jsx` (dark page, "SC 03 · THE EDIT BAY")
- Header: editable title; `ORIGINAL 2:14 → EDIT 1:32`; `PREVIEW r14 · 2 CHANGES PENDING` / `PREVIEW UP TO DATE ✓`; Switch
  "Auto-update preview"; "Shortcuts (?)"; "← My edits"; notices (e.g. timing approx: "Word timing is estimated — nudge a caption if the
  highlight drifts.").
- **AI EDIT SUMMARY chips** (buttons, `aria-controls` → panel; counts from `outline.summary`): `✓ CAPTIONS` `✓ 6 B-ROLLS` `✓ 3 PUNCH-INS`
  `✓ 2 JUMP CUTS` `✓ 14 FILLERS OUT` `✓ 38S SILENCE OUT` `✓ MUSIC` `✓ LOGO` `✓ HOOK TITLE`; off → `○ MUSIC OFF`; QA badge `⚠ n`.
- Layout: ≥1280 `340px | 1fr | 380px` (left Transcript & Cuts, centre preview + chips, right Inspector tabs Captions · B-roll · Effects ·
  Audio · Branding · Format); 860–1279 `1fr | 400px` (Transcript first tab); <860 single column with sticky preview (≤42dvh) and bottom-sheet
  `<dialog>` for item actions. Fixed bottom bar (`env(safe-area-inset-bottom)`): play, timecode, timeline, "Update preview (~20s)"
  (`btn-ink on-dark`), **Export** (`btn-mag`).
- **Player** (`VideoPreview`, `PlayerControls`): aspect from `output`; two stacked `<video playsInline>` (A/B swap without flash); custom
  controls (play/pause, seek `role=slider` ±1 s / Shift ±5 s, mute, fullscreen, "Compare original" plays `source-proxy` at the mapped time);
  badges `● PREVIEW r14`, `UPDATING 64% · ~12S`; playback error keeps last good render ("PREVIEW JAMMED").
- **Timeline** (output time `.clip-track` rows): A segments coloured HOOK mag / TALKING_HEAD neutral / EMPHASIS am / SCREEN cb / CTA lm;
  B B-roll cy; FX diamonds; CC caption ticks; MUS ranges (dimmed under speech); cuts as rec ticks; playhead via rAF transform; dirty ranges
  hatched magenta; one Tab stop per track with roving ←/→.
- **Selection** `{kind, id, wordKey}`: selecting any item seeks to `outIn + 0.05`, scrolls/underlines anchored transcript words, rings the
  timeline block, focuses the inspector card (`aria-current`). Clicking transcript word N selects by `srcWordIndex` (never string match);
  a cut word seeks to the cut end and offers "This word is cut · Restore". During playback the live word toggles an `is-live` class via a
  ref map (no React state).
- **Item card**: head `KIND #ordinal · 00:12–00:15 · LAYOUT` + origin `AI`/`YOU` + `LOCKED`; provenance line + "Show in transcript";
  specific action buttons; cost hint `FREE · SAVED RESULTS` / `STOCK SEARCH · NO AI` / `1 AI CALL`; status `PENDING RENDER`, `SEARCHING…`,
  `⚠ NO MATCH`, `REMOVED · RESTORE`.
- **Panels** (ops from `EDIT_PLAN.md` §5):
  1. Transcript & Cuts — filter ALL/SILENCES/FILLERS/REPEATS; pace NATURAL/FAST/EXTRA FAST; filler set; "Restore original" (confirm);
     sentences grouped by segment type with timestamp buttons; cut words struck through; cut pills `⟨ SILENCE 1.4S ⟩` toggles
     (`aria-pressed`); protected sentences "SPEAKER STAYS ON SCREEN — SINCERE MOMENT".
  2. Captions — Switch, style tiles, words per line, language (warning when translated), height slider (safe band), palette; cue list with
     `<input dir="auto">` (save on Enter/blur, Esc reverts), emphasis word chips, Hide, provenance `WORDS 120–126 · 00:18.2–00:20.9`.
  3. B-roll — intensity ("changes AI picks you haven't touched"); card with thumbnail (3 s preview on hover/focus), sentence quote, search
     terms, reason; **Replace** dialog (tabs Suggestions from stored candidates with source badge/duration/`FITS 9:16`|`WILL BE CROPPED`,
     Search stock); **Regenerate** (editable query); **Remove** (instant + toast Undo); Layout FULL / SPLIT / PIP (+corner); Lock; missing state
     "No good match for this line." [Search stock] [Remove slot]; footer "+ Add B-roll" (pick a line).
  4. Effects & Graphics — intensity SUBTLE/DYNAMIC; "All effects" Switch; effect cards (Switch, zoom 1.05–1.40×); graphics HOOK TITLE
     (0/60 counter), KEYWORD, STAT, LOWER THIRD, CTA with Switch + text fields.
  5. Music & SFX — track card (title, mood, source, active range), volume −30..0 dB, "Duck under speech" + depth; **Change** (candidates with
     10 s ▶ preview, mood chips, search); **Remove**; SFX rows (anchor, Switch, volume), "Mute all SFX".
  6. Branding — logo upload/replace/remove, corner radiogroup, scale 8–20 %, opacity 60–100 %, palette.
  7. Format — aspect radiogroup + confirm dialog ("Re-frame for 16:9? Every shot is re-framed and captions re-laid. Your edits are kept.");
     per-segment "Reframe shot" dialog (source frame + draggable crop box in output aspect, arrows ±1 % / Shift ±5 %, +/- zoom, numeric X/Y/Zoom,
     [Auto — follow face], warning "Your face will be partly out of frame.").
- **Export dialog** "SC 04 · THE DELIVERY": quality 1080p (default) / 720p; "Include .SRT and .VTT" (default on); estimate; "Exports
  revision r16 · 1:32 · 1080×1920"; stale preview → "2 changes aren't in your preview yet." with [Update preview first] focused and
  [Export anyway]. During export editing stays allowed ("Edits you make now go into your next export"). Done: "Download MP4 ↓" (`btn-mag`),
  "Captions .srt", ".vtt", credits; QA rows via `QDRow` (✓ Matches preview r16 · ✓ Captions in safe zone · ⚠ … · ✓ Audio −14 LUFS · ✓ Duration
  matches · ✓ 1080×1920 · 30fps · ✓ A/V sync); usage pills AI CALLS / STOCK SEARCHES / RENDERS.

### 1e. My edits — `screens/aiEdit/AiEditList.jsx` (paper, "MY EDITS · n")
Headline "Your *cutting room.*" + "+ New edit"; grid `minmax(240px,1fr)`; card = poster in aspect, title, `2:14 → 1:32`, status badge
(UPLOADING % local / ANALYZING · stage / READY / EXPORTED / NEEDS ATTENTION / FAILED / STOPPED), relative time (30 s clock store), Open,
Delete (confirm "Delete *take-03*? The upload, edit and exports are removed. This can't be undone."). Data: `GET /api/video-edits` merged
with local pending uploads. Empty: "No edits yet. Record yourself talking and drop the file in — KEYFRAME makes the cut."

### 1f. Failure & empty states (dark card, rec spine, `role=alert`)
| State (status/code) | Title | Body | Actions |
|---|---|---|---|
| `NEEDS_ATTENTION STT_FAILED` | TAKE FAILED · TRANSCRIPTION | "We couldn't transcribe the audio. Your upload is safe." | [Try again] (retry resume) · [Continue without captions] · [Delete] |
| provider breaker open | AI CREW UNAVAILABLE | "Our AI models aren't answering right now. We'll keep retrying — you can leave this page." | [Retry now] · [Stop] |
| `NO_SPEECH` | NO DIALOGUE | "We couldn't hear anyone talking. AI Edit needs speech — check the mic track and try again." | [Upload another take] · [Continue without transcript] |
| notice heuristic director | BACKUP DIRECTOR (warn) | "Our AI director was unavailable, so a simpler edit was made. Captions, silence and filler removal are complete; B-roll and effects are lighter." | [Re-direct with AI] · [Dismiss] |
| `NO_BROLL_FOUND` | NO B-ROLL FOUND | "Nothing we found fit your lines well enough, so we kept you on screen." | [Search stock for a line] |
| render failed | PREVIEW JAMMED | "Revision r16 didn't render. Your edits are saved; the player shows r14." | [Retry render] · [Undo last change] |
| export failed / `QA_INTEGRITY` | EXPORT FAILED | server message | [Retry export] |
| `CANCELLED` | CUT BY YOU | "You stopped this edit. The upload is kept." | [Restart analysis] · [Delete] |
| 404 | THIS EDIT COULDN'T BE LOADED | "It may have been deleted or expired." | [← My edits] |
| 409 conflict | EDIT CHANGED ELSEWHERE (toast) | "This edit changed in another tab — reloaded to r15. Not applied: *Remove B-roll #3*." | [Re-apply] |
| offline | OFFLINE | "Changes will send when you're back online." (Export disabled) | — |
An editor never opens on an empty transcript.

## 2. Preview strategy (hybrid, server truth)
- The player always shows a **real server render of one revision** (`preview540` profile). No DOM caption overlays (they would diverge from
  libass output). `compositionHash` equality proves "✓ Matches preview r16" at export.
- Pending changes are **marked, not faked**: hatched dirty ranges, `PENDING RENDER` pills, struck-through removed blocks, header counter.
- Auto-update (default on): 1.2 s after the last op, `POST /:id/render {kind:'preview', planRevision}`; server coalesces; if the estimate
  exceeds 45 s (aspect change, full base re-render) no auto start — the bottom bar shows "Update preview (~1 min)". Audio-only changes
  always auto-update.
- While a render runs the old revision keeps playing and editing continues; header `● UPDATING 64% · ~12S`; completion announcement
  "Preview updated to r16".
- Swap: load new URL in the hidden `<video>`, map playhead old out-time → source time (old timeMap) → new out-time (new timeMap; snap forward
  if cut), wait `seeked`+`canplay`, flip opacity (instant with reduced motion), resume if playing.
- Frame previews (`GET /:id/media/frame/...`) are P2.

## 3. Client op queue (`editState.js createOpQueue`)
One request in flight; `expectedRevision` filled at send; `batchId` per batch; coalescing (300–400 ms) for `music.setVolume`,
`sfx.setVolume:<id>`, `captions.setPosition`, `branding.setLogoPlacement`, `effect.adjust:<id>`; optimistic local apply only for ops marked
optimistic in `editModel.OP_META`; network error → retry same `batchId` at 1 s, 2 s, 4 s (jitter) then hold "Changes will send when you're
back online"; 409 → refetch, re-validate queued ops against existing ids, resend valid ones, toast dropped ones with [Re-apply]; 422 →
roll back + inline alert on the card.

## 4. Frontend architecture
### 4.1 Files (all new)
```
web/src/modes.js              GENERATION_MODES, modeForView
web/src/brand.js              BRAND_PRESETS, HEX_RE, LANGUAGES (mirrors server caption_lang)
web/src/editApi.js            fetch wrapper + EditApiError, all endpoints (API.md), uploadEditVideo (XHR), watchEdit (SSE→poll), mediaSrc(), fixture mode
web/src/editModel.js          PURE ESM: summarize(outline), mapTime(timeMapOld,timeMapNew,t), itemsAt(plan,t), wordAtOut, retimeCaption (mirror), applyOpLocal, OP_META {label, optimistic, coalesceKey, costHint}, validateOp
web/src/editFormat.js         fmtTc("00:18.2"), fmtBytes, fmtEta, fmtWhen, STAGE_COPY, provenanceLine(item, plan, transcript), errorCopy(err), costHint(opType)
web/src/editState.js          reducer, initialState, action types, EditorStateCtx/EditorActionsCtx, useEditor(), useEditorActions(), useSelection(), createOpQueue()
web/src/uploadStore.js        module singleton external store: checkFile, start, cancel, subscribe, getSnapshot
web/src/playerClock.js        external store: attach(videoEl), seek, toggle, subscribe(quantMs), rAF loop
web/src/clockStore.js         30 s "now" tick for relative times
web/src/shortcuts.js          KEYMAP, isTypingTarget(el), formatShortcut()
web/src/recentEdits.js        localStorage "kf.aiEdit.v1" (try/catch, versioned): recent ids
web/src/router/               routes.js (URL table: /edits/new, /edits, /edits/:id; legacy ?edit= / ?edits redirect), router.js, Link.jsx
web/src/components/{Switch,BrandPalettePicker,LanguageSelect,RadioChips,UploadDropzone,ProgressBar,StageChecklist,Dialog,Toasts,ModeSwitch,AiEditNavChip,EditorErrorBoundary,EditNotice}.jsx
web/src/screens/aiEdit/{AiEditUpload,AiEditSession,AiEditAnalyzing,EditorProvider,AiEditor,VideoPreview,PlayerControls,Timeline,SummaryChips,InspectorTabs,ItemCard,ExportDialog,ShortcutsDialog,AiEditList}.jsx
web/src/screens/aiEdit/panels/{TranscriptPanel,CaptionsPanel,BrollPanel,BrollReplaceDialog,EffectsPanel,AudioPanel,BrandingPanel,FormatPanel,ReframeDialog}.jsx
web/tests/editModel.test.mjs  node:test (Node 22 built-in)
web/tests/fixtures/*.json     edit-analyzing sequence, edit-ready (plan + outline + transcript), ops responses, 409, render progress
web/tests/smoke/ai-edit.smoke.mjs  puppeteer-core script (server/node_modules/puppeteer-core) against the Vite dev server with request interception
```
### 4.2 State
Split by update frequency: `EditorStateCtx` (useReducer: editId, status, view, plan, revision, outline, transcript, history, render,
exports, warnings, queue, pendingItemIds, selection, panel, ui{autoUpdate, dialog, toasts}, conflict) and `EditorActionsCtx` (stable object
created once). Player time outside React (`playerClock` + `useSyncExternalStore`, 250 ms quantized). Derived data in `useMemo` keyed on
revision; per-sentence rows `memo`-ized with primitive props.
### 4.3 Live updates (`watchEdit(id, {onUpdate, onEvent, signal, timeoutMs})`)
SSE `new EventSource(API_BASE + "/api/video-edits/:id/events", {withCredentials:true})` (events per `API.md` §5, drop stale `seq`) →
polling `GET /:id/progress` (+ `GET /:id` on stage/plan change) when no message within 10 s, 2 errors, or no EventSource; 1.5 s base, 5 s
hidden, backoff 1→30 s with jitter on network errors; 401 → `onNeedAuth`; 404 → not-found; resolves with last snapshot on timeout.
One `watchEdit` owned by `AiEditSession` for the edit's lifetime.
### 4.4 Upload
`uploadStore` module singleton (survives view changes). `uploadEditVideo(file, {settings, logo, clientRequestId}, {onProgress, signal})`:
XHR multipart `POST /api/video-edits` (`withCredentials`, `upload.onprogress`, no custom headers, `xhr.abort()`), then "verifying" until 201/200.
Resumable chunked upload is P2.
### 4.5 Deep link
The screens are real URLs: `/edits/new` (upload), `/edits` (My edits), `/edits/<id>` (one edit; `AiEditSession` validates the id against
`^ve_[0-9a-z]{16}# AI Video Edit — UX & frontend contract (web/)

Status: implementation contract for Phase 8. Backend contracts: `API.md` (routes/SSE/views), `EDIT_PLAN.md` (plan, ops, outline).
Product principle: **an AI video editor, not a timeline editor.** The editor opens with the edit already applied; the user rejects
or changes AI decisions, each tied to the transcript line that caused it. Preview always equals export (server renders only).

## 0. Constraints
- Stack: React 19 + Vite 8 + Tailwind v4 + framer-motion, plain JS, no router/state library/test runner.
- **New files only**, except additive wiring in `web/src/App.jsx` (§4.6). `App.jsx`, `api.js`, `index.css`, `CreateScreen.jsx`,
  `Premiere.jsx`, `ScriptRoom.jsx`, `Templates.jsx`, `UnderstandingScreen.jsx`, `packlore.js` carry the user's uncommitted edits — never
  refactor them; copy patterns instead. `AdminShared.jsx` (unmodified) exports `Stat`, `Pill`, `QDRow`, `PanelHead`, `Field` — import them.
- Design system "KEYFRAME v2 film set" (`web/src/index.css`): tokens `--color-ground #f4f0e6`, `--color-paper`, `--color-ink #17130e`,
  `--color-dim`, `--color-mag #e832a8` (accent; `btn-mag` only for commit/spend CTAs: **Start AI edit**, **Export**), `--color-cy`,
  `--color-am`, `--color-lm`, `--color-cb`, `--color-rec`; dark: `--color-dark`, `--color-editor`, `--color-dark-ink`, **`--color-dark-dim`
  for secondary text on dark** (`--color-dim` fails contrast there), `--color-dark-line`. Fonts: display Bricolage Grotesque, body Hanken
  Grotesk, mono IBM Plex Mono (uppercase labels). Recipes: `.card/.spine`, `.editor-card/.editor-head/.tl-dot`, `.editor-inset`,
  `.btn-ink(.on-dark)`, `.btn-mag(.btn-big)`, `.btn-chip(.is-active)`, `.btn-outline-dark(.btn-sm)`, `.scene-pill`, `.headline(.on-dark)`,
  `.label-mono`, `.link-mono(.on-dark)`, `.timecode`, `.rec-blip`, `.editor-status`, `.chip-c(.is-active,.on-paper)`, `.clip-track/.clip-block`,
  `.meter`, `.inset-field`; `[data-demo-grid]` stacks under 860 px; global `:focus-visible` magenta outline; `prefers-reduced-motion`
  kill switch. Motion ease `[0.16,1,0.3,1]`, 0.2–0.45 s. Dark pages: `marginTop:-90; paddingTop:90` and added to App `darkPage`.
- Lint rules (eslint react-hooks v7 + react-refresh): `.jsx` files export components only (helpers/contexts/hooks in `.js`); no
  synchronous `setState` in effect bodies (derive in render, reset with `key`, set state in handlers/callbacks, `useSyncExternalStore` for
  stores); no ref reads during render; no `Date.now()` in render (clock store); no unused vars. Gates: `npm run lint` error count must not
  exceed the baseline (6) and `npm run build` passes.
- Global instruction: accessible (ARIA), mobile-first, responsive (390 / 768 / 1440 px), honour tokens; use the frontend design skills.

## 1. Screens & flow
### 1a. Entry points & mode
- `web/src/modes.js`: `GENERATION_MODES = { TEMPLATE_GENERATION, AI_VIDEO_EDIT }`; mode derived from the current view
  (`create` → TEMPLATE_GENERATION; `aiUpload|aiEdit|aiEdits` → AI_VIDEO_EDIT).
- `components/ModeSwitch.jsx` — rendered by App **above** `<AnimatePresence>` only on `create`/`aiUpload`:
  `<nav aria-label="Studio mode">` with "Make a film" / "Edit my video" buttons (`aria-current="page"`, `.btn-chip.is-active`, ≥44 px).
- `components/AiEditNavChip.jsx` — nav chip "AI EDIT" after Gallery (shows `AI EDIT · 42%` during an upload); wrapper
  `<span className="hidden sm:inline-flex">` (the unlayered `.btn-chip{display:inline-flex}` overrides Tailwind `hidden`).
- Optional landing CTA "Edit my video →" (`public/design.html` + `kf-bridge.js` message `kf-ai-edit`) — Phase 8b.

### 1b. Upload — `screens/aiEdit/AiEditUpload.jsx` (paper page, "SC 01 · THE FOOTAGE")
- Headline: "Drop the take. *We'll make the cut.*" Sub: "Record yourself talking. KEYFRAME transcribes it, trims the dead air, adds
  B-roll, captions and music — then hands you an edit you can change."
- Continue strip: up to 3 recent edits + "All my edits →".
- Grid `1.15fr .85fr` (`data-demo-grid`). Left `editor-card` "KEYFRAME — EDIT BAY": **Dropzone is a real `<button>`** ("Choose a video file,
  or drop it here", `aria-describedby` → limits line `MP4 · MOV · WEBM · UP TO 500 MB · 3 SEC – 5 MIN` from `GET /capabilities`); touch
  "Record now" `<input accept="video/*" capture="user">`; file row (poster, name, size, duration, resolution, remove); `ProgressBar`
  (`role=progressbar`, `aria-valuetext`) `UPLOADING 42% · 180/430 MB · 6.1 MB/S · ~1 MIN` + Cancel; at 100 % indeterminate
  "CHECKING THE FOOTAGE…". Right paper card "WHAT YOU'LL GET" (✓ Captions · B-roll · Punch-ins · Jump cuts · Silence & filler removal · Music ·
  Logo), defaults line `9:16 · BOLD CAPTIONS · AUTO LANGUAGE · MEDIUM B-ROLL · SUBTLE FX · FILLERS + SILENCE OUT · MUSIC ON`,
  disclosure "Customize" (`aria-expanded`).
- **Consent + privacy** (required checkbox, unchecked blocks Start): "I agree that KEYFRAME sends my video's audio and small still frames to
  third-party AI models (via OpenRouter and KIE) to create this edit. The full video is never sent. [How we handle your video]" — link opens
  a `<dialog>`: what is sent (audio segments, sampled frames ≤640 px, transcript text), who receives it (OpenRouter, KIE and model
  providers behind them), what is stored (source, proxy, analysis, renders, exports), how to delete (Delete edit removes everything).
- Primary CTA `btn-mag btn-big` "Start AI edit →" (v1: the upload starts on Start; the full multipart request carries the settings).
- Customize panel:
| Setting | Control | Default |
|---|---|---|
| Format | radiogroup MATCH MY VIDEO / 9:16 / 16:9 / 1:1 (aspect swatches) | Match my video |
| Caption style | radiogroup tiles BOLD POP / CLEAN / KARAOKE / SINGLE WORD / MINIMAL / BRAND BAR / OFF | BOLD POP |
| Words per line | radiogroup 1 / 2 / 3 | 2 |
| Caption language | select "Auto — match what I say" + en/hi/es/fr/de/pt/ar/ja | Auto |
| Brand colours | `BrandPalettePicker` (presets ocean/sunset/forest/royal/neon/gold + custom hex) | KEYFRAME default |
| Logo | upload slot PNG/JPG/WEBP ≤5 MB with explicit errors | none |
| Music | Switch | on |
| B-roll | LOW / MEDIUM / HIGH ("≈ 1 every 15 s / 12 s / 8 s") | Medium |
| Effects | SUBTLE / DYNAMIC | Subtle |
| Remove fillers | Switch + UM/UH ONLY · + LIKE, YOU KNOW | on, um/uh only (`light`) |
| Remove silence | Switch + NATURAL / FAST / EXTRA FAST | on, Natural |
| Auto jump cuts | Switch ("PUNCH-IN HIDES THE CUT") | on |
- Client checks before any network (via `<video>` metadata, 8 s timeout) with exact copy:
| Check | Blocking | Copy |
|---|---|---|
| type not mp4/mov/webm | yes | "That's a **.avi** file. AI Edit takes MP4, MOV or WEBM — export it as MP4 and drop it again." |
| empty | yes | "This file is empty. Try exporting it again." |
| over size | yes | "This file is **3.4 GB**. The limit is **500 MB** — export at 1080p and it will fit." |
| metadata unreadable (HEVC) | no | "Your browser can't preview this file (common with iPhone HEVC). You can still upload it — we'll check it when it arrives." |
| too long | yes | "This take runs **14:32**. AI Edit handles up to **5:00** — trim it, or split it into parts." |
| too short | yes | "This clip is **2 seconds**. Give us at least **3 seconds** of you talking." |
| < 480p | no | "Low resolution (**360p**) — the edit will look soft." |
| consent unchecked | yes | "Tick the box so we can send the audio and frames to the AI models." |
| 401 | — | "Your session ended. Log in to keep going." |
| 413 / 415 / 422 | — | server `message` verbatim (MEDIA_REJECTED reasons mapped to friendly copy in `editFormat.errorCopy`) |
| offline | — | "SIGNAL LOST — upload stopped at 42%. Choose the file again to retry." |
- Upload state machine (module store, survives navigation): `idle → checking → rejected | ready → uploading → verifying → started` +
  `failed`, `cancelled`. `beforeunload` guard only while bytes are in flight.

### 1c. Analysis — `screens/aiEdit/AiEditAnalyzing.jsx` (dark page, "SC 02 · THE READ")
Headline "Watching your *take.*" / failed "The take got *cut.*" / ready "That's a *cut.*". Left `editor-card`: `StageChecklist`
(`<ol aria-label="Edit stages">`, `aria-current="step"`), progress bar, ETA ("about 2 min" / "under a minute" / "finishing up"; never 0;
increases capped at +20 %/tick), queue line `IN LINE — 2 EDITS AHEAD`, "Stop analyzing" link (dialog: "Stop analyzing? Your upload is kept —
restart any time without uploading again."), "You can close this tab — we'll keep working. It'll be in **My edits**." Right card
"WHAT WE'RE HEARING" live-filled from `discoveries`: poster, `2:14 · 1080×1920 · 30FPS`, `ENGLISH`, `1,284 WORDS · 164 WPM`,
`14 FILLERS FOUND`, `22 SILENCES · 38S`, topic chips, "Hook we'd lead with: “…”", `9 B-ROLL MOMENTS`, `FACE FOUND ✓`.
| Backend stage | Label | Sub |
|---|---|---|
| VALIDATING | FOOTAGE IN | Checking the file |
| COMPRESSING | PREPPING FOOTAGE | Compressing and normalizing |
| EXTRACTING_AUDIO | MEASURING AUDIO | Levels and pauses |
| TRANSCRIBING | TRANSCRIBING | Sending audio to our speech model |
| ANALYZING_VIDEO | WATCHING THE TAKE | AI checks sampled frames for your face and framing |
| ANALYZING_CONTENT | READING THE SCRIPT | AI finds topics, hook and key lines |
| BUILDING_EDIT_PLAN | DIRECTING THE CUT | Cuts, captions, effects |
| SEARCHING_BROLL / SCORING_ASSETS | PULLING B-ROLL & MUSIC | Stock library and music |
| PREPARING_RENDER / RENDERING / POST_PROCESSING | ROLLING THE PREVIEW | First draft |
| QUALITY_CHECK | CHECKING THE CUT | Automatic quality check |
| READY / COMPLETED | READY | — |
On READY/COMPLETED announce "Your edit is ready" (polite) and switch to the editor after 900 ms inside the same session component.

### 1d. Editor — `screens/aiEdit/AiEditor.jsx` (dark page, "SC 03 · THE EDIT BAY")
- Header: editable title; `ORIGINAL 2:14 → EDIT 1:32`; `PREVIEW r14 · 2 CHANGES PENDING` / `PREVIEW UP TO DATE ✓`; Switch
  "Auto-update preview"; "Shortcuts (?)"; "← My edits"; notices (e.g. timing approx: "Word timing is estimated — nudge a caption if the
  highlight drifts.").
- **AI EDIT SUMMARY chips** (buttons, `aria-controls` → panel; counts from `outline.summary`): `✓ CAPTIONS` `✓ 6 B-ROLLS` `✓ 3 PUNCH-INS`
  `✓ 2 JUMP CUTS` `✓ 14 FILLERS OUT` `✓ 38S SILENCE OUT` `✓ MUSIC` `✓ LOGO` `✓ HOOK TITLE`; off → `○ MUSIC OFF`; QA badge `⚠ n`.
- Layout: ≥1280 `340px | 1fr | 380px` (left Transcript & Cuts, centre preview + chips, right Inspector tabs Captions · B-roll · Effects ·
  Audio · Branding · Format); 860–1279 `1fr | 400px` (Transcript first tab); <860 single column with sticky preview (≤42dvh) and bottom-sheet
  `<dialog>` for item actions. Fixed bottom bar (`env(safe-area-inset-bottom)`): play, timecode, timeline, "Update preview (~20s)"
  (`btn-ink on-dark`), **Export** (`btn-mag`).
- **Player** (`VideoPreview`, `PlayerControls`): aspect from `output`; two stacked `<video playsInline>` (A/B swap without flash); custom
  controls (play/pause, seek `role=slider` ±1 s / Shift ±5 s, mute, fullscreen, "Compare original" plays `source-proxy` at the mapped time);
  badges `● PREVIEW r14`, `UPDATING 64% · ~12S`; playback error keeps last good render ("PREVIEW JAMMED").
- **Timeline** (output time `.clip-track` rows): A segments coloured HOOK mag / TALKING_HEAD neutral / EMPHASIS am / SCREEN cb / CTA lm;
  B B-roll cy; FX diamonds; CC caption ticks; MUS ranges (dimmed under speech); cuts as rec ticks; playhead via rAF transform; dirty ranges
  hatched magenta; one Tab stop per track with roving ←/→.
- **Selection** `{kind, id, wordKey}`: selecting any item seeks to `outIn + 0.05`, scrolls/underlines anchored transcript words, rings the
  timeline block, focuses the inspector card (`aria-current`). Clicking transcript word N selects by `srcWordIndex` (never string match);
  a cut word seeks to the cut end and offers "This word is cut · Restore". During playback the live word toggles an `is-live` class via a
  ref map (no React state).
- **Item card**: head `KIND #ordinal · 00:12–00:15 · LAYOUT` + origin `AI`/`YOU` + `LOCKED`; provenance line + "Show in transcript";
  specific action buttons; cost hint `FREE · SAVED RESULTS` / `STOCK SEARCH · NO AI` / `1 AI CALL`; status `PENDING RENDER`, `SEARCHING…`,
  `⚠ NO MATCH`, `REMOVED · RESTORE`.
- **Panels** (ops from `EDIT_PLAN.md` §5):
  1. Transcript & Cuts — filter ALL/SILENCES/FILLERS/REPEATS; pace NATURAL/FAST/EXTRA FAST; filler set; "Restore original" (confirm);
     sentences grouped by segment type with timestamp buttons; cut words struck through; cut pills `⟨ SILENCE 1.4S ⟩` toggles
     (`aria-pressed`); protected sentences "SPEAKER STAYS ON SCREEN — SINCERE MOMENT".
  2. Captions — Switch, style tiles, words per line, language (warning when translated), height slider (safe band), palette; cue list with
     `<input dir="auto">` (save on Enter/blur, Esc reverts), emphasis word chips, Hide, provenance `WORDS 120–126 · 00:18.2–00:20.9`.
  3. B-roll — intensity ("changes AI picks you haven't touched"); card with thumbnail (3 s preview on hover/focus), sentence quote, search
     terms, reason; **Replace** dialog (tabs Suggestions from stored candidates with source badge/duration/`FITS 9:16`|`WILL BE CROPPED`,
     Search stock); **Regenerate** (editable query); **Remove** (instant + toast Undo); Layout FULL / SPLIT / PIP (+corner); Lock; missing state
     "No good match for this line." [Search stock] [Remove slot]; footer "+ Add B-roll" (pick a line).
  4. Effects & Graphics — intensity SUBTLE/DYNAMIC; "All effects" Switch; effect cards (Switch, zoom 1.05–1.40×); graphics HOOK TITLE
     (0/60 counter), KEYWORD, STAT, LOWER THIRD, CTA with Switch + text fields.
  5. Music & SFX — track card (title, mood, source, active range), volume −30..0 dB, "Duck under speech" + depth; **Change** (candidates with
     10 s ▶ preview, mood chips, search); **Remove**; SFX rows (anchor, Switch, volume), "Mute all SFX".
  6. Branding — logo upload/replace/remove, corner radiogroup, scale 8–20 %, opacity 60–100 %, palette.
  7. Format — aspect radiogroup + confirm dialog ("Re-frame for 16:9? Every shot is re-framed and captions re-laid. Your edits are kept.");
     per-segment "Reframe shot" dialog (source frame + draggable crop box in output aspect, arrows ±1 % / Shift ±5 %, +/- zoom, numeric X/Y/Zoom,
     [Auto — follow face], warning "Your face will be partly out of frame.").
- **Export dialog** "SC 04 · THE DELIVERY": quality 1080p (default) / 720p; "Include .SRT and .VTT" (default on); estimate; "Exports
  revision r16 · 1:32 · 1080×1920"; stale preview → "2 changes aren't in your preview yet." with [Update preview first] focused and
  [Export anyway]. During export editing stays allowed ("Edits you make now go into your next export"). Done: "Download MP4 ↓" (`btn-mag`),
  "Captions .srt", ".vtt", credits; QA rows via `QDRow` (✓ Matches preview r16 · ✓ Captions in safe zone · ⚠ … · ✓ Audio −14 LUFS · ✓ Duration
  matches · ✓ 1080×1920 · 30fps · ✓ A/V sync); usage pills AI CALLS / STOCK SEARCHES / RENDERS.

### 1e. My edits — `screens/aiEdit/AiEditList.jsx` (paper, "MY EDITS · n")
Headline "Your *cutting room.*" + "+ New edit"; grid `minmax(240px,1fr)`; card = poster in aspect, title, `2:14 → 1:32`, status badge
(UPLOADING % local / ANALYZING · stage / READY / EXPORTED / NEEDS ATTENTION / FAILED / STOPPED), relative time (30 s clock store), Open,
Delete (confirm "Delete *take-03*? The upload, edit and exports are removed. This can't be undone."). Data: `GET /api/video-edits` merged
with local pending uploads. Empty: "No edits yet. Record yourself talking and drop the file in — KEYFRAME makes the cut."

### 1f. Failure & empty states (dark card, rec spine, `role=alert`)
| State (status/code) | Title | Body | Actions |
|---|---|---|---|
| `NEEDS_ATTENTION STT_FAILED` | TAKE FAILED · TRANSCRIPTION | "We couldn't transcribe the audio. Your upload is safe." | [Try again] (retry resume) · [Continue without captions] · [Delete] |
| provider breaker open | AI CREW UNAVAILABLE | "Our AI models aren't answering right now. We'll keep retrying — you can leave this page." | [Retry now] · [Stop] |
| `NO_SPEECH` | NO DIALOGUE | "We couldn't hear anyone talking. AI Edit needs speech — check the mic track and try again." | [Upload another take] · [Continue without transcript] |
| notice heuristic director | BACKUP DIRECTOR (warn) | "Our AI director was unavailable, so a simpler edit was made. Captions, silence and filler removal are complete; B-roll and effects are lighter." | [Re-direct with AI] · [Dismiss] |
| `NO_BROLL_FOUND` | NO B-ROLL FOUND | "Nothing we found fit your lines well enough, so we kept you on screen." | [Search stock for a line] |
| render failed | PREVIEW JAMMED | "Revision r16 didn't render. Your edits are saved; the player shows r14." | [Retry render] · [Undo last change] |
| export failed / `QA_INTEGRITY` | EXPORT FAILED | server message | [Retry export] |
| `CANCELLED` | CUT BY YOU | "You stopped this edit. The upload is kept." | [Restart analysis] · [Delete] |
| 404 | THIS EDIT COULDN'T BE LOADED | "It may have been deleted or expired." | [← My edits] |
| 409 conflict | EDIT CHANGED ELSEWHERE (toast) | "This edit changed in another tab — reloaded to r15. Not applied: *Remove B-roll #3*." | [Re-apply] |
| offline | OFFLINE | "Changes will send when you're back online." (Export disabled) | — |
An editor never opens on an empty transcript.

## 2. Preview strategy (hybrid, server truth)
- The player always shows a **real server render of one revision** (`preview540` profile). No DOM caption overlays (they would diverge from
  libass output). `compositionHash` equality proves "✓ Matches preview r16" at export.
- Pending changes are **marked, not faked**: hatched dirty ranges, `PENDING RENDER` pills, struck-through removed blocks, header counter.
- Auto-update (default on): 1.2 s after the last op, `POST /:id/render {kind:'preview', planRevision}`; server coalesces; if the estimate
  exceeds 45 s (aspect change, full base re-render) no auto start — the bottom bar shows "Update preview (~1 min)". Audio-only changes
  always auto-update.
- While a render runs the old revision keeps playing and editing continues; header `● UPDATING 64% · ~12S`; completion announcement
  "Preview updated to r16".
- Swap: load new URL in the hidden `<video>`, map playhead old out-time → source time (old timeMap) → new out-time (new timeMap; snap forward
  if cut), wait `seeked`+`canplay`, flip opacity (instant with reduced motion), resume if playing.
- Frame previews (`GET /:id/media/frame/...`) are P2.

## 3. Client op queue (`editState.js createOpQueue`)
One request in flight; `expectedRevision` filled at send; `batchId` per batch; coalescing (300–400 ms) for `music.setVolume`,
`sfx.setVolume:<id>`, `captions.setPosition`, `branding.setLogoPlacement`, `effect.adjust:<id>`; optimistic local apply only for ops marked
optimistic in `editModel.OP_META`; network error → retry same `batchId` at 1 s, 2 s, 4 s (jitter) then hold "Changes will send when you're
back online"; 409 → refetch, re-validate queued ops against existing ids, resend valid ones, toast dropped ones with [Re-apply]; 422 →
roll back + inline alert on the card.

## 4. Frontend architecture
### 4.1 Files (all new)
```
web/src/modes.js              GENERATION_MODES, modeForView
web/src/brand.js              BRAND_PRESETS, HEX_RE, LANGUAGES (mirrors server caption_lang)
web/src/editApi.js            fetch wrapper + EditApiError, all endpoints (API.md), uploadEditVideo (XHR), watchEdit (SSE→poll), mediaSrc(), fixture mode
web/src/editModel.js          PURE ESM: summarize(outline), mapTime(timeMapOld,timeMapNew,t), itemsAt(plan,t), wordAtOut, retimeCaption (mirror), applyOpLocal, OP_META {label, optimistic, coalesceKey, costHint}, validateOp
web/src/editFormat.js         fmtTc("00:18.2"), fmtBytes, fmtEta, fmtWhen, STAGE_COPY, provenanceLine(item, plan, transcript), errorCopy(err), costHint(opType)
web/src/editState.js          reducer, initialState, action types, EditorStateCtx/EditorActionsCtx, useEditor(), useEditorActions(), useSelection(), createOpQueue()
web/src/uploadStore.js        module singleton external store: checkFile, start, cancel, subscribe, getSnapshot
web/src/playerClock.js        external store: attach(videoEl), seek, toggle, subscribe(quantMs), rAF loop
web/src/clockStore.js         30 s "now" tick for relative times
web/src/shortcuts.js          KEYMAP, isTypingTarget(el), formatShortcut()
web/src/recentEdits.js        localStorage "kf.aiEdit.v1" (try/catch, versioned): recent ids
web/src/router/               routes.js (URL table: /edits/new, /edits, /edits/:id; legacy ?edit= / ?edits redirect), router.js, Link.jsx
web/src/components/{Switch,BrandPalettePicker,LanguageSelect,RadioChips,UploadDropzone,ProgressBar,StageChecklist,Dialog,Toasts,ModeSwitch,AiEditNavChip,EditorErrorBoundary,EditNotice}.jsx
web/src/screens/aiEdit/{AiEditUpload,AiEditSession,AiEditAnalyzing,EditorProvider,AiEditor,VideoPreview,PlayerControls,Timeline,SummaryChips,InspectorTabs,ItemCard,ExportDialog,ShortcutsDialog,AiEditList}.jsx
web/src/screens/aiEdit/panels/{TranscriptPanel,CaptionsPanel,BrollPanel,BrollReplaceDialog,EffectsPanel,AudioPanel,BrandingPanel,FormatPanel,ReframeDialog}.jsx
web/tests/editModel.test.mjs  node:test (Node 22 built-in)
web/tests/fixtures/*.json     edit-analyzing sequence, edit-ready (plan + outline + transcript), ops responses, 409, render progress
web/tests/smoke/ai-edit.smoke.mjs  puppeteer-core script (server/node_modules/puppeteer-core) against the Vite dev server with request interception
```
### 4.2 State
Split by update frequency: `EditorStateCtx` (useReducer: editId, status, view, plan, revision, outline, transcript, history, render,
exports, warnings, queue, pendingItemIds, selection, panel, ui{autoUpdate, dialog, toasts}, conflict) and `EditorActionsCtx` (stable object
created once). Player time outside React (`playerClock` + `useSyncExternalStore`, 250 ms quantized). Derived data in `useMemo` keyed on
revision; per-sentence rows `memo`-ized with primitive props.
### 4.3 Live updates (`watchEdit(id, {onUpdate, onEvent, signal, timeoutMs})`)
SSE `new EventSource(API_BASE + "/api/video-edits/:id/events", {withCredentials:true})` (events per `API.md` §5, drop stale `seq`) →
polling `GET /:id/progress` (+ `GET /:id` on stage/plan change) when no message within 10 s, 2 errors, or no EventSource; 1.5 s base, 5 s
hidden, backoff 1→30 s with jitter on network errors; 401 → `onNeedAuth`; 404 → not-found; resolves with last snapshot on timeout.
One `watchEdit` owned by `AiEditSession` for the edit's lifetime.
### 4.4 Upload
`uploadStore` module singleton (survives view changes). `uploadEditVideo(file, {settings, logo, clientRequestId}, {onProgress, signal})`:
XHR multipart `POST /api/video-edits` (`withCredentials`, `upload.onprogress`, no custom headers, `xhr.abort()`), then "verifying" until 201/200.
Resumable chunked upload is P2.
### 4.5 Deep link
 before any request). Links shared in the old `?edit=<id>` / `?edits` form redirect to them (web/src/router/routes.js).
Auth: `onNeedAuth(retry)` only on a real 401.
### 4.6 `App.jsx` additive wiring (exact)
```jsx
// imports (append after the existing imports)
import AiEditUpload from "./screens/aiEdit/AiEditUpload.jsx";
import AiEditSession from "./screens/aiEdit/AiEditSession.jsx";
import AiEditList from "./screens/aiEdit/AiEditList.jsx";
import ModeSwitch from "./components/ModeSwitch.jsx";
import AiEditNavChip from "./components/AiEditNavChip.jsx";
// (2026-09-18) App.jsx now renders from the URL router (web/src/router): the view and id come from useRoute(),
// so the former readDeepLink() state initializers are gone.
// landing bridge: else if (d.type === "kf-ai-edit") requireAuth(() => go("aiUpload"), "signup");
const aiViews = ["aiUpload", "aiEdit", "aiEdits"];
// screens registry additions
aiUpload: <AiEditUpload onStarted={(id) => go("aiEdit", id)} onOpenEdit={(id) => go("aiEdit", id)} onOpenList={() => go("aiEdits")} onNeedAuth={(retry) => requireAuth(retry, "login")} />,
aiEdit:   <AiEditSession key={projectId} editId={projectId} onList={() => go("aiEdits")} onNew={() => go("aiUpload")} onNeedAuth={(retry) => requireAuth(retry, "login")} />,
aiEdits:  <AiEditList onOpen={(id) => go("aiEdit", id)} onNew={() => go("aiUpload")} onNeedAuth={(retry) => requireAuth(retry, "login")} />,
// darkPage: || view === "aiEdit"
// nav, after the Gallery chip:
<AiEditNavChip active={aiViews.includes(view)} onClick={() => requireAuth(() => go("aiUpload"), "signup")} />
// <main>, directly before <AnimatePresence>:
{(view === "create" || view === "aiUpload") && (
  <ModeSwitch mode={view === "create" ? "TEMPLATE_GENERATION" : "AI_VIDEO_EDIT"}
    onSelect={(m) => (m === "AI_VIDEO_EDIT" ? requireAuth(() => go("aiUpload"), "signup") : enterStudio("create"))} />
)}
```
### 4.7 Error boundary
`EditorErrorBoundary` (class; props `resetKeys`, `onReset`): fallback "SOMETHING JAMMED IN THE EDIT BAY — Your edits are saved on our side."
[Reload editor] + "← My edits"; wraps `EditorProvider` only.
### 4.8 ARIA (per component)
ModeSwitch `nav` + `aria-current` · Dropzone `<button aria-describedby>` + hidden `<input tabIndex=-1 aria-hidden>` + status/alert regions ·
ProgressBar `role=progressbar` + quartile announcements · RadioChips `role=radiogroup`/`radio` roving tabindex (arrows, Home/End) · Switch
`role=switch aria-checked aria-labelledby` · StageChecklist `ol` + `aria-current="step"` · SummaryChips `ul` of buttons `aria-controls` ·
InspectorTabs full tablist pattern · ItemCard `article aria-labelledby`, `aria-current` when selected · VideoPreview `section aria-label`
(no native controls) · PlayerControls toggle labels + `aria-keyshortcuts`, one seek slider · Timeline `role=group`, tracks `role=toolbar`
roving · Transcript timestamp buttons, cut pills `aria-pressed` · caption inputs `aria-label="Caption at 00:18" dir="auto"` · ranges with
`aria-valuetext` · Reframe crop `role=group` with keyboard nudges + numeric alternative · Dialog native `<dialog>` `showModal()` focus
return · Toasts one polite region, errors `role=alert`, actionable toasts ≥ 8 s and pause on hover/focus.
### 4.9 Shortcuts (`shortcuts.js`)
K play/pause · Space play/pause (body/player/timeline focus) · J/L −5 s/+5 s · ←/→ ±1 s (Shift ±5 s) · ,/. frame step (paused) · [/] prev/next
item · Delete/Backspace remove/disable selected (toast Undo) · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z, Ctrl+Y redo · Enter item actions · Esc close
dialog → clear selection · ? shortcuts dialog. Never when typing (`input`, `textarea`, `select`, `[contenteditable]`, open `<dialog>` except Esc).

## 5. Copy
Scene pills SC 01 · THE FOOTAGE · SC 02 · THE READ · SC 03 · THE EDIT BAY · SC 04 · THE DELIVERY · MY EDITS. Status lines:
`UPLOADING 42% · 180/430 MB · ~1 MIN` · `CHECKING THE FOOTAGE…` · `IN LINE — 2 AHEAD` · `● UPDATING 64% · ~12S` · `PREVIEW UP TO DATE ✓` ·
`2 CHANGES PENDING` · `EXPORTING r16 · 38%` · `EXPORTED ✓ MP4 + SRT + VTT`. Provenance (from `reasonCode` + `evidence`): B-roll "Added
because line 12 says “we doubled revenue in three months”." / "Searched: *revenue growth chart · team celebrating*" / "Picked #1 of 8 ·
Pexels · landscape → cropped to 9:16"; caption "Words 120–126 · 00:18.2–00:20.9"; punch-in "Zoom 1.15× from 00:18 to 00:21 — emphasis on
“this changes everything”."; jump cut "Hides a repeated start (“so the — so the thing is”) · punch-in covers the cut."; silence "1.4s of
silence removed at source 01:02 · keeps a 0.15s breath."; filler "“um” removed at 00:44."; music "“Morning Drive” · upbeat · plays
00:00–00:48 · ducks under your voice."; SFX "Whoosh on B-roll #2 entrance."; logo "Top-right · 12% width · 85% opacity · whole video.";
protected "Speaker stays on screen — this line reads as a sincere moment."; user "Added by you." / "Changed by you — kept when AI re-plans."
Toasts: "B-roll #3 removed · Undo" · "Undid: Remove B-roll #3" · "Preview updated to r16" · "B-roll Medium → High · added 4 · kept your 2
changes · Undo" · "Caption saved · rendering 00:18–00:21".

## 6. Acceptance criteria
1. From Create, ModeSwitch "Edit my video" opens upload; `git diff web/src/screens/CreateScreen.jsx` empty.
2. Nav "AI EDIT" chip visible ≥640 px; logged-out users go through Auth and land on upload.
3. Dropzone operable by Tab + Enter/Space; chosen file shows name, size, duration, resolution.
4. Each rejection shows the exact §1b copy in `role=alert` with no network request; consent unchecked blocks Start.
5. Upload progress visible, announced at quartiles, cancellable; navigating away and back keeps the upload running.
6. Analysis stages advance with `aria-current="step"`; discoveries fill live; closing and reopening via My edits or `/edits/<id>` resumes.
7. STT failure shows TAKE FAILED with retry that doesn't re-upload; an empty transcript never opens the editor.
8. Editor opens with the edit applied; summary counts equal `outline.summary`; each chip opens its panel.
9. Selecting any item seeks, highlights the exact anchored words by `srcWordIndex`, and shows provenance; clicking word N selects word N.
10. Removing a B-roll is one action with Undo, triggers no analysis stage events, and marks only that range dirty.
11. Caption edit keeps style and re-times only that cue; music change/remove/volume dirties audio only.
12. Cut toggle shortens the edit and keeps captions/B-roll aligned to their words; intensity change leaves locked/user items untouched.
13. Aspect change completes without re-analysis stages and keeps user edits.
14. Undo/redo work with labels; two-tab conflict shows the 409 notice and offers Re-apply.
15. While a preview renders the old revision keeps playing; swap keeps the mapped playhead without a black frame.
16. Export reports "✓ Matches preview rN" when `compositionHash` matches; downloads deliver MP4/SRT/VTT with correct filenames.
17. My edits lists only the current user's edits; delete works with confirm.
18. Every control has an accessible name; keyboard-only upload → edit → export works; no serious/critical axe violations on dark surfaces.
19. 390×844, 768×1024, 1440×900: no horizontal page scroll, touch targets ≥44 px; reduced motion removes springs and smooth scroll.
20. `npm run lint` errors ≤ baseline 6 and `npm run build` passes; the only existing file changed under `web/src` is `App.jsx` (additive).

## 7. Tests
- `node --test web/tests/editModel.test.mjs`: retimeCaption mirror (case-only keeps timings; substitution; 1→2 split ≥80 ms; insert gap/borrow;
  delete; all-deleted rejects; Japanese; Arabic; 500 random edits property), mapTime across cut toggles, summarize, validateOp bounds,
  op-queue coalescing and 409 revalidation, isTypingTarget/keymap guards.
- `web/tests/smoke/ai-edit.smoke.mjs` (puppeteer-core from `server/node_modules`, Chrome from the puppeteer cache, Vite dev server,
  `page.setRequestInterception(true)` serving `/api/video-edits/**` from fixtures): ModeSwitch → upload; keyboard file selection +
  oversize error copy; progress + navigate away/back; analysis fixture sequence → editor handoff; chip → panel `aria-selected`; select
  B-roll #3 → `currentTime ≈ outIn` + highlighted words; Delete key → `broll.remove` request + Undo; caption edit request; 409 notice;
  render progress → swap keeps `currentTime ±0.1 s`; export dialog with stale preview focuses "Update preview first"; `/edits/<id>` refresh
  restores; axe-core (from CDN is not allowed offline — vendor a copy only if available locally, else skip with a logged note); viewports
  390/768/1440 no horizontal scroll; reduced motion. Screenshots saved to the session scratchpad.
