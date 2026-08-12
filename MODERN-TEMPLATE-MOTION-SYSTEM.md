# The Modern Template Motion System

**Status:** shipped · 4–5 Aug 2026
**Scope:** all 27 modern packs — the 15 on `om_port_kit` (11 landscape + 4 portrait) and the 12
imported OM portrait packs
**New modules:** `server/src/services/transition_kit.js`, `server/src/services/om_scene_cuts.js`,
`server/scripts/test-transitions.js`, `server/scripts/test-ghosts.js`

> Part 1 (below) is the `om_port_kit` family. [Part 2](#part-2--the-twelve-imported-om-portrait-packs)
> covers the twelve imported packs and [Part 3](#part-3--the-ghost-guard) the visibility guard that
> came out of actually watching the renders.

---

## The defect this closes

All 15 modern templates shared **one camera move**, in `om_port_kit.cameraTweens`:

```
slide in from +200px · scale to 1.03 across the beat · slide out to −200px
```

Every scene. Every film. Every pack. A seven-beat film performed that move seven times, and two
different templates cut identically. This is the single largest reason the family read as *a
slideshow with well-designed frames* rather than as directed motion.

**No existing gate could see it.** A repeated move is not a lint error, not a layout defect, and
not a golden-hash change — the goldens were perfectly stable *because* nothing varied. `npm test`
was fully green throughout. The only way to find it was to read the camera code and ask what it
produced on the second scene.

### Two live bugs found underneath it

1. **The camera config was read in two different units.** `cameraTweens` takes `push` in authored
   pixels and runs it through `U()`. Three packs — `drive`, `momentum`, `teampulse` — passed a
   *fraction* (`push: 0.03`) plus a `drift` key that nothing read. `U(0.03)` is `0.003cqw`, so
   those three pushed by three thousandths of a frame: **no camera move at all**, only the 3%
   scale. Momentum's own comment says its per-scene "zoom/whip rig becomes the kit's camera" — the
   intent was there, the units silently ate it.

2. **Three packs pinned animation to `clipDur`.** Harmless while a clip ended exactly at its beat;
   a real seek-stale defect once clips outlive their beat (below). `hyperframes lint` caught
   teampulse's; `flight` and `reel` had the same shape.

---

## What replaced it

### `transition_kit.js` — a shared cut vocabulary

14 transitions, each choreographing one cut across a window in which **both scenes are alive**:

| | |
|---|---|
| warp-through · depth-pull | push/pull through depth |
| iris · shape-morph · barn-door\* | dynamic masking (pure `clip-path`) |
| blur-push · whip-pan\* | motion-blurred lateral moves |
| layer-split · light-wipe · ribbon-sweep | overlay-driven reveals |
| particle-dissolve | particle reveal |
| perspective-flip | 3D perspective shift |
| liquid-slide · orbit-swing | organic movement |

\* new in this kit. `whip-pan` is the fast lateral throw with directional blur the family had no
answer for; `barn-door` parts the outgoing frame from its own centre seam.

**Constraints every entry obeys** (each one a bug already paid for elsewhere in this codebase):

1. GPU-friendly properties only — `transform`, `opacity`, `filter: blur`, `clip-path`. Animating a
   layout property re-flows a 1080×1920 Chromium capture on every frame. Enforced by test.
2. One tween per element+property at a time (`overlapping_gsap_tweens` is a seek-order hazard).
3. Finite repeats via `floor`, never `ceil`.
4. Never inline `transform:` on an element a transform channel is tweened on.

### Selection — varied, but not random

`dealTransitions()` gives two guarantees:

- **No repeat within three cuts.** Verified across 3,995 generated edits: zero adjacent repeats,
  zero repeats within three.
- **Affinity.** The cut is named for the beat it *lands on*: a cut into a product moment pushes
  through depth, into the CTA warps, into a proof beat breaks. `classifyBeat()` derives the class
  from what the film already decided — the role the spec assigned, the pictures the beat holds,
  the figures its own copy carries — so no pack declares anything per scene.

Deterministic in the job seed, so a QA repair lap is comparable to the render it repairs.

### Signatures — one library, 15 distinct templates

A shared library must not make 15 templates cut alike. Each pack declares a personality and the
dealer draws from that pool first:

| Signature | Packs |
|---|---|
| `cinematic` | drive · flight · flight-vertical · orbit |
| `editorial` | edition · showcase-vertical |
| `kinetic` | fight · momentum · reel · teampulse |
| `technical` | hacker · pipeline |
| `organic` | deep · fetch · jungle |

Assigned from each pack's own declared `vibe`. The pools overlap deliberately, so a film still
surprises inside its own vocabulary.

### The scene shell — four layers, one owner each

Single ownership is what lets the family have both a continuously-alive frame *and* varied cuts
without two systems fighting for a property:

```
.om-cam     the CUT layer      — transition_kit. transform/opacity/filter/clip-path
.om-bg      the PARALLAX layer — the pack's backdrop, drifting slower than the content
.om-drift   the AMBIENT layer  — the content's own slow push across the beat
.om-hud     the FURNITURE      — chrome; outside .om-cam so it never rides the cut
```

`.om-bg` and `.om-drift` move at different rates — the cheapest honest parallax there is, and the
reason a frame now reads as alive *between* cuts rather than as a still that arrives and leaves.

**The magnitude is unchanged.** Ambient drift reuses the same 1.03 the old single-layer camera
applied, so the safe area every pack's layout was measured against is identical. This is a
redistribution of existing motion across layers, not an increase in it (the SAFE-AREA LAW).

**The HUD cross-fades.** Two scenes coexist during a cut and their HUDs are *not* identical — the
progress rule is at a different fill, the scene counter reads a different number. Without the
cross-fade an overlap shows two brand badges and two progress bars at once.

### Overlapping clips

A clip now lives its own xfade past its end, so the outgoing scene is still there for the incoming
one to transition against. Unique tracks make this legal (`overlapping_clips_same_track` keys by
track, not by time). The overlap is clamped to 30% of the **shorter** neighbour, so a long move
never outlives a short beat.

**Consequence worth knowing:** a clip now outlives its own beat. Any element whose exit landed on
the old clip end is now seek-stale and needs its kill keyed to `ctx.T + ctx.L` (the beat), not
`ctx.T + ctx.clipDur`. Fixed in `teampulse` (steam), `flight` (runway) and `reel` (story bar).

---

## Verification

| Check | Result |
|---|---|
| `npm test` (full suite) | **exit 0** — all green, incl. 28/28 portrait |
| `npm run test:transitions` (new, 25 checks) | 25 passed |
| Transition variety, 3,995 edits | 0 adjacent repeats · 0 repeats within 3 |
| All 15 packs × 3 asset counts (8/3/0) | build clean, unique tracks, overlaps present |
| `hyperframes lint` | 0 errors (1 cosmetic `composition_file_too_large` warning) |
| Goldens | re-baselined; 94 compositions byte-identical on re-run |
| Rendered MP4 | momentum 1920×1080 @ 32.4s — cuts verified frame-by-frame |

### One tuning pass from actually watching the render

Sampling frames *inside* each cut (not at scene midpoints) showed `particle-dissolve` landing on
momentum's full-bleed accent stat scene with both frames near half opacity for most of the window —
the picture turned to coloured mud. A dissolve is only legible when one frame is clearly winning,
so the exit was sharpened (0.55× on `power3.in`) and the arrival now waits for it. **This is not
visible in stills sampled at scene centres**, which is why cut-interior sampling is the right way
to review this system.

---

## Reusable components registered

- `transition_kit.TRANSITIONS` — the 14-move library
- `transition_kit.dealTransitions` — affinity + no-repeat-within-3 sequencer
- `transition_kit.classifyBeat` / `xfadeFor` / `accentsFrom` / `RUNTIME_HELPERS`
- `om_port_kit.driftTweens` — the two-layer parallax ambient camera
- `om_port_kit.normalizeCamera` — accepts both spellings of `push`
- `npm run test:transitions` — wired into `npm test`

## Opting out

`buildFilm({ transitions: false })` restores the legacy single camera for a pack that wants a
bespoke edit of its own. `cameraTweens` is retained for exactly that path.

---

## One defect the first render pass missed — and the fix

Reviewing the **portrait** render (reel) frame-by-frame across each cut showed something the
landscape pass had not: **the picture went flat at the start of every single cut.** Scene 1 was
fully present at 5.15s and completely gone at 5.20s — a hard blink, not a transition.

The cause was `.om-scene { background: th.bg }`. The scene ROOT painted an opaque plate, and the
incoming clip's root turns opaque the instant its beat starts — a full-bleed rectangle slammed
over the outgoing scene before its exit had moved a pixel. **Pre-overlap this was invisible**,
because clips never coexisted; introducing the overlap is what made a long-standing redundancy
into a defect. Masking transitions (`iris`, `shape-morph`, `barn-door`) were worst hit: they were
revealing a solid colour.

The plate now lives on `.om-cam` — the layer the cut owns — so it moves, fades and clips with the
scene it belongs to. `#root` still paints `th.bg` underneath, so a transition that scales or
slides `.om-cam` away lands on the pack's own background rather than on white. `hacker` had the
same rule copied into its local CSS; that copy is gone.

**Verified after the fix on a re-render:** the whip-pan reads as a whip (outgoing throws left
under directional blur, incoming arrives from the right), and `layer-split` reads as a split —
outgoing squashing to the seam, accent line igniting, incoming expanding out of it. Neither was
visible at all before.

---

# Part 2 — the twelve imported OM portrait packs

`ai-laboratory` · `aurora-motion` · `digital-universe` · `editorial-motion` · `glass-dimension` ·
`living-city` · `minimal-luxury` · `motion-canvas` · `nature-flow` · `neo-dashboard` ·
`paper-craft` · `retro-future`

These twelve do not run on `om_port_kit`. They share a different but equally uniform shape: a
persistent **world** painted once on track 0 — a data-cosmos, a neon skyline, a paper ground —
that flows unbroken behind every scene, with per-scene content clipped above it on tracks 2..N.

The world frame-matches across every cut, which is genuinely good and is why they were left alone
in Part 1. But the **content** still hard-cut. Every archetype in all twelve opened with the same
line:

```js
tl.fromTo("#sN",{opacity:0},{opacity:1,duration:0.4},T)
```

with the previous scene killed outright at exactly `T`. One edit — *content vanishes on a frame,
bare backdrop for a beat, content fades up* — twelve templates, six or seven times each.

### `om_scene_cuts.js`

Gives them the same 14-move vocabulary **without touching a single archetype**:

- `plan()` — one call before the scene loop, because a clip's duration now depends on the cut that
  follows it and a cut cannot be chosen until every beat's class is known.
- `camWrap()` — wraps a built scene's markup in `.om-cam` by surgery on the one root element every
  builder returns, and adds `om-scene` to its class list so the perspective rule needs no
  per-pack knowledge.
- `sceneJs()` — strips the archetype's root fade (matched *exactly*, so a pack that ever grows a
  different root tween keeps it), owns the scene's opacity lifecycle, and gives beat 1 an arrival
  of its own since no cut lands on it.
- `build()` — emits the cuts on overlay tracks 20+, above the scenes and below the grain (40) and
  captions (50).

**The one deliberate difference from Part 1: the cut layer is transparent.** There, each scene
carries its own plate and the transition moves a solid frame. Here the world below must keep
showing through, so a transition moves *content across a continuous backdrop*. That is a stronger
edit for this family, not a weaker one — the world never blinks.

Signatures are read off each pack's own declared vibe:

| Signature | Packs |
|---|---|
| `cinematic` | digital-universe · glass-dimension · living-city |
| `editorial` | editorial-motion · minimal-luxury |
| `kinetic` | motion-canvas · retro-future |
| `technical` | ai-laboratory · neo-dashboard |
| `organic` | aurora-motion · nature-flow · paper-craft |

Per composer the change is six anchors, every one verified unique before it was applied.

### Verification

| Check | Result |
|---|---|
| 12 packs × 6 asset counts = 72 builds | all build; 7/7 cam layers each; 0 root fades left |
| `hyperframes lint`, all 72 | 0 errors |
| Overlapping clips | present, unique tracks, world on track 0 untouched |
| Rendered MP4 (neo-dashboard 1080×1920) | `barn-door` reads: accent seam ignites, outgoing clips inward from both edges to the seam, incoming arrives — and the dashboard shell flows through the whole cut without a blink |

### …and `showcase`, the last holdout

`showcase` (landscape) predates `om_port_kit` and carried its own local `cameraTweens` — the same
one move on every beat, plus **the same opaque-root plate** (`.sc-scene { background }`) that
would have eaten every cut the moment clips overlapped.

It already had a `.sc-cam` cut layer, so the retrofit followed Part 1 exactly: plate moved to
`.sc-cam`, a new `.sc-drift` layer added inside it to carry the ambient push (the cut and the
drift must never share a transform channel), the assembly loop split into two passes so a cut can
be chosen for the beat it lands on *after* the picture-count role downgrade, and `.sc-chrome`
cross-faded so an overlap shows one HUD rather than two. Signature: `editorial`.

`seedFrom` already existed in this file, unused — the pack had no randomised anything before now.

Result: six distinct cuts on a seven-beat film (`light-wipe`, `whip-pan`, `perspective-flip`,
`depth-pull`, `barn-door`, `iris`), lint 0 errors. **Every modern pack now cuts.**

---

# Part 3 — the ghost guard

Watching that neo-dashboard render surfaced something unrelated to motion: **the opening headline
was not there.** `.s1-title` carried `opacity:0` and only its word spans were ever revealed, so
the container stayed hidden and took the whole headline with it. Every neo-dashboard film ever
made had a blank opening headline.

A static check generalised from that found **six such defects in five packs**:

| pack | element | shape |
|---|---|---|
| neo-dashboard | opening headline | container hidden, only its `-gw` word spans revealed |
| minimal-luxury | list headline | same |
| minimal-luxury | gallery headline | same |
| living-city | caption | same (`-nw` spans revealed, container not) |
| retro-future | showcase support line | reveal tween simply absent |
| product-showcase | typed + CTA support lines | reveal tween simply absent |

**Every gate was green through all six.** `hyperframes lint` checks legality, not visibility. The
golden hashes were stable *because* the output never changed. The portrait and asset guards assert
the element EXISTS, not that it is on screen. This is the same blind spot as the one-camera defect
in Part 1: nothing asserted that what was authored is actually **seen**.

### `npm run test:ghosts`

47 packs × 5 asset counts = 235 compositions. An element counts as REVEALED when some tween whose
selector mentions one of its **own classes** (or its id) names a non-zero opacity. The class test
rather than an exact-selector test is the crux: nature-flow reveals its word spans through
`.s3-head .nf-word`, and a stricter rule called a working headline broken.

The guard had three blind spots of its own, each a false positive it had to learn:

1. **Reveal helpers** — `burst(sel,…)`, paper-tales' `popUp(shadowSel, cardSel,…)`. It must read
   *every* quoted argument (paper-tales reveals its second) and match one level of nested parens,
   because bauhaus-riot calls `stamp(".s4-stamp:nth-child(1)",…)`.
2. **Imperative reveals** — the caption pill is switched on by the per-frame proxy
   (`cap.style.opacity = active ? "1" : "0"`), never by a tween.
3. **Multiple `<script>` blocks** — flagship and brightlife emit their timeline *before* their
   WebGL block, so reading only the last block made all six of their text scenes look unrevealed.

And it scans **per call, not per line**: composers pack several tweens onto one line inside a
conditional, and a per-line scan credits only the first selector on it.

**Authoring rule this establishes:** if a container's children carry the reveal, the container must
not also be `opacity:0` — nothing will bring it back.

---

---

# Part 4 — motion safety

Linting **every** pack once, by hand, rather than only the ones a developer happens to build,
turned up two more classes of live defect. Neither had ever been seen, because `hyperframes lint`
only runs against a built job directory and nothing in `npm test` built them all.

### Layout-property motion (`gsap_non_transform_motion`)

`left`, `top`, `letterSpacing`, `fontSize` and friends snap to integer device pixels during
browser layout, and GSAP's `roundProps` rounds the tween value on top. Under the seek-by-frame
capture engine a slow move or an ease-out tail visibly stutters — and each frame costs a full
re-flow of a 1080×1920 page.

| pack | what was moving on layout | fixed to |
|---|---|---|
| ai-laboratory | signal dots flying the network wires (up to 49/composition) | `x`/`y` deltas from where each dot is parked |
| ai-laboratory | prompt-token chips converging on the bar | per-chip `x`/`y` vectors; centring moved to `xPercent`/`yPercent` |
| ai-laboratory | CTA node trail converging on the mark | ditto — 16 vectors, one tween each |
| grid-dispatch | the carry bar sliding up | `y` (the `height` collapse stays; the renderer accepts it) |
| grid-dispatch | the closing full-bleed field opening out | parked full-bleed, `clip-path: inset()` opened instead |
| kinetic-universe | tracking-in on the opener kicker and the CTA url | per-character `x` spread, symmetric about the centre |

The `letterSpacing` ones are worth calling out: the fix is *better* motion, not less. Characters
now spread from the middle of the line and settle home on the transform channel — the same
flourish, composited, and one tween whatever the copy length.

**One documented exemption.** `slab-stage`'s karaoke band animates `fontSize` on purpose: the live
word is full size, every other is half, and **the line re-wraps around whichever word is live** —
that reflow *is* the look. The port tried `scale` first and it was structurally wrong (a transform
does not change the layout box, so every word kept its full-size footprint and the band rendered
as scattered type with holes). The exemption is recorded in the guard with that reasoning.

### Transform conflict (`gsap_css_transform_conflict`)

GSAP owns the whole `transform` attribute. The first frame it tweens a transform channel on an
element, any inline `transform:` that element carried is **gone**. Five scenes of
`product-showcase` and two of `retro-future` centred their product/CRT frame with
`transform: translate(-50%,-50%)` and then tweened `y` on it — so the frame jumped by half its own
size the instant it started moving. Centring moved onto GSAP's own `xPercent`/`yPercent`, which
composes with `x`/`y`.

### `npm run test:motion-safety`

47 packs × 3 asset counts. Calibrated **against** `hyperframes lint`, not guessed — `width` and
`height` are deliberately absent because the renderer tolerates them and a guard stricter than the
toolchain it protects only teaches people to ignore it.

It deliberately does **not** check the transform-conflict class: the renderer's rule is
channel-aware in a way a static scan is not (inline `transform:scaleX(0)` under a `scaleX` tween is
the correct, universal idiom for a progress rule). A first cut of that check flagged 27 packs that
all lint clean. That one stays with lint.

---

## Where this leaves the library

| family | packs | cut system |
|---|---|---|
| `om_port_kit` | 15 (11 landscape + 4 portrait) | `transition_kit` via `buildFilm` |
| imported OM | 12 portrait | `transition_kit` via `om_scene_cuts` |
| `showcase` | 1 landscape | `transition_kit` inline |
| `scene_kit` | 14 rendererless | unchanged — out of scope |

**28 of the 28 modern packs now cut with a chosen, varied, deterministic edit.**

Guards, all wired into `npm test`:

| command | what it holds |
|---|---|
| `npm run test:transitions` | 38 checks — library integrity, dealer invariants over 3,995 edits, and every one of the 28 packs at three asset counts |
| `npm run test:ghosts` | 47 packs × 5 asset counts — nothing authored is hidden and never revealed |
| `npm run test:motion-safety` | 47 packs × 3 asset counts — no motion on a layout property |
| `npm run test:golden` | 94 compositions byte-stable |

All three exist because the same thing kept being true: **a composition can be lint-clean,
golden-stable and fully green while the film is wrong.** A repeated camera move is not a lint
error. A headline that never fades in does not change a hash. A dot flying on `left` renders. The
only way any of these were found was by building a film and watching it — so each one is that
inspection, made cheap enough to run every time.

## Not yet done

- The 14 rendererless packs share `scene_kit.js` and are unaffected.
- **Asset utilisation** is a separate, unaddressed weakness: momentum drew 2 of 8 offered
  screenshots across 7 scenes. Per-pack slot capacity, not a motion problem — but it is what
  Phase 5 of the brief is really about.
