# Prompt intake — the scope gate and the normaliser

Status: implemented. Replaces the interactive "Refine" design, which was removed.

## The one-line idea

On submit, KEYFRAME first decides whether it can make the request **as a video at all**.
If yes, it makes it — normalising the prompt automatically inside the pipeline, with no
extra click. If no, it stops before anything is spent and explains what it *can* make
and how. It never rewrites an out-of-scope request into some other film.

```
Produce
  │
  ▼
POST /api/projects  (or /api/generate)
  validate ─ 400          (request shape)
  daily cap ─ 429
  prompt_scope.analyzeScope ─────────────┐
  │                                      │
  │ SUPPORTED                            │ NEEDS_CLARIFICATION / OUT_OF_SCOPE / DISALLOWED
  ▼                                      ▼
  daily cap re-check ─ 429               422 { error: userMessage, scope }
  db.insert (+ prompt_scope)             no job row · no enqueue · uploads deleted
  enqueue ─ 202 { projectId, scope }
  │
  ▼
runIntake / runJob → generateBrief
  prompt_analysis.analyzePrompt   ← normalisation, automatic
  brief → script → storyboard → assets → voice → captions → audio → render
```

## Why the old design failed

The previous "Refine" feature was a quality refiner with a scope opinion bolted on.
Measured live on the old analyser, "Write me a Python backend for an e-commerce
website" was flagged in 1 of 3 runs and rewritten into a tutorial video in the other 2;
"write an essay about the causes of WW1" was converted into a film in 3 of 3.

The failure was layered, and every layer pushed toward "proceed":

| Layer | What it did |
|---|---|
| Classifier prompt | Instructed the model to *convert* non-video requests into videos, and required every refusal to carry an alternative film. |
| Coercion | Downgraded any refusal without a creative alternative back to REFINABLE. |
| UI | Analysis ran only on the ✦ REFINE chip or on blur; `submit()` never awaited it. |
| Pipeline | The only unavoidable analysis ran inside `generateBrief`, after the job row, the 202 and ingest — and nothing read its verdict to stop anything. |

## Stage 1 — the scope gate (`services/prompt_scope.js`)

`analyzeScope({ prompt, sources, preferences, clarification, surface, signal })` → `{ scope }`.
**Never throws.** `surface` names the endpoint the request came from (`create-screen` or
`api-generate`) so an out-of-scope answer's steps describe what *that* endpoint accepts.

| Status | Meaning | Effect |
|---|---|---|
| `SUPPORTED` | A video KEYFRAME can make (stated or implied) | job created, pipeline runs |
| `NEEDS_CLARIFICATION` | No identifiable subject, or honestly unclear whether a video is wanted | 422, one question |
| `OUT_OF_SCOPE` | The deliverable is not a video KEYFRAME makes | 422, reason + what it can make + steps |
| `DISALLOWED` | Tier-1 moderation match, or the content policy (below) | 422, plain refusal |

Decided cheapest-first:

1. **Tier-1 moderation** (`prompt_moderation.js`) → `DISALLOWED`. No model, no appeal — so it is
   deliberately narrow. A rule fires only when a term from each of two classes sits within a
   verb-object distance (3–4 tokens) of each other. The weapons, violence and credential rules
   additionally require the text to ask for **instructions** ("how to", "step by step", "guide
   to"…), and the violence and credential rules never fire when the text is **protective or
   historical** ("awareness", "prevention", "training", "history", "documentary"…). The
   child-safety rules need neither. An earlier version matched bare co-occurrence over 10–12
   tokens with everyday verbs and dual-use nouns, and hard-refused a clinic's radiology promo,
   a Lincoln-assassination history lesson, phishing-awareness training and a nuclear-energy
   explainer; `prompt_analysis_cases.json` `moderationMustPass` now guards all of them.
   Each distinct text — the (merged) prompt and the clarification answer — is screened **on
   its own, never joined**. The merged prompt already ends with the answer; joining the two
   put the answer's last words beside its own first words, and a co-occurrence rule matched
   across that seam (a security-awareness answer that began "…banking passwords" and ended
   "a guide to phishing" was refused as fraud).
2. **No prompt but a source** (website / blog / reference video) → `SUPPORTED`. No model.
3. **Empty, or unmistakable non-language** → `NEEDS_CLARIFICATION`. No model. Only three
   things count as junk: no letters at all (digits, punctuation, emoji); one character typed
   4+ times running; a token that *is* a 4+-key QWERTY-row run, forwards or backwards. Tokens
   are Unicode letters (NFC-normalised), tokens under 3 letters are ignored, and the text must
   be **entirely** junk — one real word anywhere and the model decides. Text written mostly in
   a non-Latin script is never judged here.
   The previous pronounceability rules (no vowel; seven consonants in a row; an ASCII-only
   tokeniser) called real subjects nonsense — German compounds (*Rechtsschutzversicherung*,
   *Geschichtsschreibung*), names with umlauts (*Dr. Wünsch GmbH*, split into "w" + "nsch")
   and acronyms (*HTTP vs HTTPS*) — and because the same verdict decides the clarification
   merge, the person's subject was then deleted from the stored job.
4. **The model** — stage `scope`, `temperature 0.1`, `stageEffort low`, one hard wall-clock
   budget (`llm.scopeBudgetMs`, 20 s) enforced by an AbortSignal *and* a race, because
   openrouter's backoff sleeps do not observe the signal.

   The budget has to be larger than the chain it bounds. At 15 s it was not: one call is
   capped at `requestTimeoutByStage.scope` (13 s) and openrouter backs off 1.5 s before
   re-asking the same model, so the primary alone needed 21.5 s to exhaust itself before
   the fallback model was reached. A first call that hung therefore ate the whole budget
   and the gate fell through having asked exactly once. Measured over 45 live scope calls:
   p50 4.2 s, p90 7.4 s, max 9.6 s — so the old 10 s per-call cap sat only 4% above the
   slowest real answer, and the prompt behind the incident (which the model refuses correctly
   when it is allowed to finish) needs 8-11 s. 13 s inside a 20 s budget buys a first attempt
   with real headroom and still leaves 5.5 s for a second.
5. **Model unavailable or over budget** → `SUPPORTED` (fail-open), except for the one class
   in *Where fail-open stops* below.

### The decision rule

The deliverable decides, not the wording. A bare topic, product, story or idea typed into
a video tool **is** a video request. A question whose subject is commonly explained on
video ("how do tides work?") is a request for an explainer. What is out of scope is a
request for a *different kind of work* (code, an essay or article as text, a spreadsheet,
image editing, a live-data answer) or a video whose *core* depends on something KEYFRAME
does not do (cutting footage you filmed, a talking avatar of a real person).

A request with a supported video AND an unsupported sub-ask ("make the promo and write
the blog post") is `SUPPORTED`; the sub-ask is listed in `unsupportedParts` and shown on
the Understanding screen.

### Coercion — every rule fails toward the person's video

- An unknown status → `SUPPORTED`. A model that says `DISALLOWED` → `SUPPORTED` **unless** it names a
  content-policy category at confidence ≥ 0.75 (see *Content policy*). No other model reply refuses on content.
- `OUT_OF_SCOPE` below confidence 0.6 → `NEEDS_CLARIFICATION` (a guessed refusal becomes a
  question) — or, once a question has already been answered, → `SUPPORTED`.
- **At most one question.** Once a clarification has been answered, nothing asks again —
  and an answer that still names nothing does not become a job:
  - the model says `NEEDS_CLARIFICATION` again **and describes a video** (a non-empty,
    non-placeholder `videoIntent`) → `SUPPORTED`;
  - the model says `NEEDS_CLARIFICATION` again **with no described video** → `OUT_OF_SCOPE`,
    reason *"Your answer still doesn't say what the video should be about."*, with the how-to
    guidance. (This used to be forced to `SUPPORTED`, so "idk" or "whatever" as the answer
    created a subjectless job that ran the whole pipeline.)
  - the code path: an unreadable answer to the unreadable-prompt question ends the exchange
    as `OUT_OF_SCOPE` with the how-to guidance.
- This is the one coercion that can produce a refusal, and it is about a missing subject,
  not scope. The low-confidence rule above deliberately does *not* apply it: an
  `OUT_OF_SCOPE` reply carries `videoIntent: null` by contract, so demanding one would turn
  every hesitant refusal after an answer into a real refusal.
- `OUT_OF_SCOPE` never carries `videoIntent`, `videoType` or `unsupportedParts`.

### Content policy

Set by the product owner: KEYFRAME does not make **sexually explicit content**, **graphic
gore**, or **hateful content** (attacking or dehumanising people for a protected
characteristic, or harassing a real, identifiable person).

Tier-1 is a word-pair rule and cannot judge this — the same vocabulary describes
sexual-health films, surgery explainers and anti-racism documentaries. So the scope model
judges it, inside hard walls enforced in `coerce()` (`POLICY_CATEGORIES`):

- `DISALLOWED` from the model stands **only** with a `policyCategory` of `sexual-explicit`,
  `graphic-gore` or `hate`; any other `DISALLOWED` becomes `SUPPORTED`.
- It stands **only** at confidence ≥ `POLICY_MIN_CONFIDENCE` (0.75). A hesitant policy
  refusal makes the video — borderline is where a wrong refusal is most likely.
- The refusal sentence is **the product's**, fixed per category. Everything the model wrote
  is dropped, so a refusal can never repeat explicit, gory or hateful detail to the person.
- A policy refusal is final: the clarification rules cannot soften it.

The prompt lists what is *not* a violation (sexual-health and consent education, tasteful
lingerie or fragrance ads, horror trailers, surgery and first-aid explainers, war and
true-crime documentaries, civil-rights and anti-hate history), and the live matrix carries
near-miss cases in each area that must be made. The refusal is subject to the same fail-open
rule as the rest of the gate: with the model unavailable, a policy violation is not caught.

### Why fail-open

The gate runs on every submit. Failing closed during a provider outage blocks every
paying user to stop a few off-topic requests. Failing open lets an off-topic request
through during an outage, where it produces one wrong film. That trade is deliberate
and is the one to revisit if outages become common.

### Where fail-open stops

That trade holds for requests KEYFRAME would merely make *badly*. It does not hold for
requests KEYFRAME cannot make *at all* — animate this photograph, generate footage of this
person — where saying yes buys nothing and costs a render. `asksForGeneratedImagery`
screens for exactly that class, and only on the degraded path: when the model answers, its
judgement stands unchallenged, because scope is a question about meaning and no word list
belongs in front of it.

Two things hold its precision, which matters because a false positive here refuses a
paying customer mid-outage:

- **Naming a video stands the still-image family down.** Someone who writes "promo",
  "explainer" or "video" is briefing a film, and films are routinely built *from*
  photographs — product shots, listing photos, a team slideshow, an animated title over a
  still. That is core KEYFRAME work. The requests this stops read as notes to an animator
  and never name a video at all. This single guard removed every false positive the benign
  sweep found.
- **`uploadedImages` is never a trigger.** A logo upload is the most ordinary thing in a
  promo, so the request has to carry the meaning, not the attachment.

Measured on the 47 distinct requests in `vifero_videos_dev.csv`: it fires on 5 (the 4 the
model also refused, plus the one the model never judged because it timed out) and on none
of the 40 the model supported. A 45-prompt benign sweep built from the adjacent cases —
logos, product photos, animated titles, people briefed on camera in three languages —
fires 0. It does not catch requests for custom character animation (a stickman cartoon),
which stay a matter for the model.

### The out-of-scope answer is read from the app

`services/keyframe_capabilities.js` builds "what you can make" and "how to create a video"
from live sources — `config` (duration ceiling, orientations), `caption_lang` (languages),
`frame_registry` (template count), `template_lexicon` (kinds of film). Adding a language
or a template changes the message with no edit. It deliberately does **not** promise:
VTT subtitles (only `.srt` is ever written), a minimum duration below what the create
screen's slider allows, or "showreels" (cutting someone's own footage).

The "how to create a video" steps are written per **surface**, because the two create
endpoints do not accept the same request:

| Surface | Endpoint | The steps describe |
|---|---|---|
| `create-screen` (default; unknown values fall back to it) | `POST /api/projects` | prompt, website / blog link, reference video; length ceiling, shape, narration in N languages; template match; script review or Autopilot |
| `api-generate` | `POST /api/generate` | a prompt of 10–2000 characters (`GENERATE_PROMPT_CHARS`, which the route's validator also reads); required duration with config's full range; orientation / quality / fps values; `tts` (+ `voice`), `music`, `sound_effect`; `images`, `video`; `framePack`, `pace`; renders straight through with no script review — poll `statusUrl` |

The `api-generate` steps omit what that endpoint lacks: links and uploads, languages, script
review and Autopilot, and captions (the route accepts a `captions` boolean, but
`pipeline.runJob` composes with no caption cues and writes no subtitle file). They also do not
promise a kept scene order: `runJob` has no script stage to carry the narrative directive.

## Stage 2 — the normaliser (`services/prompt_analysis.js`)

Runs automatically inside `generateBrief`, for every job, on both pipelines. Because scope
was already decided, it **never refuses and never proposes a different film**. It answers:

- `READY` — already well-formed; `refinedPrompt` is the user's words byte for byte.
- `REFINABLE` — thin; filled out with topic, objective, audience, arc, visual direction, tone and close.
- `STRUCTURED_STORY` — the user wrote the sequence; `narrative.orderLocked` and the beats
  reach the brief prompt, and then the stage that plans scenes: on `/api/projects` a
  `NARRATIVE DIRECTIVE` in the script prompt that suspends the Hook → CTA arc; on
  `/api/generate` (which has no script stage) the same order in the storyboard prompt, where the
  first scene carries beat 1 and keeps kind `hook`/`title` because `storyboard.js` validates that
  label. More than 24 beats releases the lock (`source: "derived"`, the first 24 stored) rather
  than promising an order the scene ceiling cannot keep.

It genuinely never throws: prompts up to the 4,000-character route limit are valid output (a
READY echo of a long prompt used to fail zod), and the deterministic floor's own parse is
guarded, with a minimal REFINABLE analysis of the user's words as the last resort.

Its output is attached as `brief.analysis` after zod parsing. Tier-1 content still yields
`DISALLOWED` here as defence in depth, and `generateBrief` throws `PROMPT_DISALLOWED`,
which `pipeline.js` rethrows rather than "carrying on with the raw prompt".

## HTTP contract

- `422 { error: scope.userMessage, scope }` for every non-SUPPORTED decision. `scope` is
  the client projection (no usage, no coercion trail).
- `202 { projectId, statusUrl, autopilot, nextStep, scope: { status, videoIntent, unsupportedParts } }`.
- Optional `clarification: { question, answer }` (object, or JSON string over multipart).
  The server merges the answer into the prompt before deciding (`prompt_scope.mergeClarification`,
  shared by both routes): it **replaces** the prompt only when the prompt is unmistakable junk
  by the stage-1 definition above; anything else is kept and the answer is appended.
- A refusal's guidance is built for the route: `/api/projects` passes `surface: "create-screen"`,
  `/api/generate` passes `surface: "api-generate"`.
- The job row stores `prompt_scope` (decision, confidence, via, ms, usage, coercions);
  `GET /api/projects/:id` exposes `scope: { status, videoIntent, videoType, unsupportedParts }`.
- Client disconnect during the gate is detected with `res.on('close')` and
  `!res.writableEnded` — **not** `req.on('close')`, which on Node 22 fires as soon as the
  body is read and would cancel every analysis.

## UI (`web/src/screens/CreateScreen.jsx`)

No Refine chip, no blur trigger, no analysis panel. Produce submits; while the request is
read the pill says `● READING` (or `● UPLOADING`) and after 6 s it says so out loud. A
decision renders in one panel under the tab content, on every tab, and takes focus:

- **Question** — the question, an answer field (focused), CONTINUE. Both Produce buttons
  route to the answer while it is open.
- **Out of scope** — the reason, ↺ START A NEW PROMPT, what you can make, how to create a video.
- **Disallowed** — the reason, ↺ START A NEW PROMPT.

Refused text stays locked (`● CUT`) until edited, so an identical resubmit cannot buy
another model call.

**Every decision is bound to the exact text it judged.** It is shown only while the field
still holds that text: editing or replacing the prompt (typing, an example chip, SURPRISE ME)
makes it a fresh request with no clarification attached, and restoring refused words
re-shows their refusal and re-locks Produce. A decision that arrives after the person has
already edited the text is announced in the live region but not revealed — no scroll, no
focus stolen mid-typing. ↺ START A NEW PROMPT never switches tabs (the VIDEO tab has its own
optional prompt field, so an attached reference film is never silently dropped). While a
question is open the tab's own source checks still apply, a one-character answer is
accepted, and a failed submit is announced with focus returned to the control that sent it.

## Tests

| Command | What it proves |
|---|---|
| `npm run test:prompt-scope` | the gate offline: deterministic paths never call a model, real subjects (German compounds, umlaut names, acronyms) always reach it, the merge keeps real words, tier 1 screened per text (the seam), every coercion rule including the subjectless answer, fail-open, the budget, a catalog read from the app with per-surface steps |
| `node scripts/prompt_scope.test.cjs --llm` | the 30-case matrix against the real model |
| `npm run test:scope-routes` | both routes over the same representative matrix: status codes, row counts, enqueue calls, which LLM stages run (rejections: only `scope`), uploads deleted, empty prompts (400, no gate), a 3000-character prompt accepted, clarification round-trips that keep the subject, a subjectless answer refused, `/api/generate` refusal steps checked against what that route enforces, automatic normalisation (including a storyline's order lock) — never touching `server/jobs.json` |
| `npm run test:prompt-analysis` | the normaliser offline |

## Known limits

- **Fail-open** means an out-of-scope request gets through during a model outage.
- **Uploads precede the gate.** Multipart files are written before the route can decide;
  a refused request's files are deleted, but the upload itself was paid for. A refused
  clarification round on the video tab re-uploads the file.
- **The admin template-test route** does not run the gate; tier-1 still stops it in `generateBrief`.
- **Gate latency** is typically 3–6 s per submit on the house model.
- **A hesitant refusal after an answer still becomes a job.** If the model answers a
  subjectless clarification with a *low-confidence* `OUT_OF_SCOPE` instead of a second
  question, the refusal floor turns it into `SUPPORTED` with no subject. Closing that would
  mean refusing every unsure verdict after an answer; the trade is kept deliberately.
- **Keyboard mash on non-QWERTY layouts** (AZERTY, QWERTZ) is not recognised in code; it
  costs one model call, which asks the question.
