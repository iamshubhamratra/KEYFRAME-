# The Modern Template Motion System

**Status:** shipped · 4 Aug 2026
**Scope:** the 15 packs built on `om_port_kit` — 11 landscape + 4 portrait
**New modules:** `server/src/services/transition_kit.js`, `server/scripts/test-transitions.js`

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

## Not yet done

- The **12 imported OM portrait packs** (`ai-laboratory`, `aurora-motion`, `digital-universe`,
  `editorial-motion`, `glass-dimension`, `living-city`, `minimal-luxury`, `motion-canvas`,
  `nature-flow`, `neo-dashboard`, `paper-craft`, `retro-future`) have **no transition system**
  either. They frame-match on a persistent canvas backdrop that flows across every cut — a
  legitimate and different approach — but their scene *content* still hard-cuts. They are the
  natural next application of this kit.
- `showcase` (landscape) predates `om_port_kit` and carries its own local `cameraTweens`; it is
  the one modern landscape pack untouched by this change.
- The 14 rendererless packs share `scene_kit.js` and are unaffected.
- **Asset utilisation** is a separate, unaddressed weakness: momentum drew 2 of 8 offered
  screenshots across 7 scenes. Per-pack slot capacity, not a motion problem — but it is what
  Phase 5 of the brief is really about.
