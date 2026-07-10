# SHOWCASE DNA — the codified grammar of our three best films

Source of truth for what "our best video" means, extracted from the three
hand-authored reference templates. Every upcoming video template (scene-kit
archetypes, LLM-composer prompts, new packs) is designed **in respect of these**
— same grammar, enhanced execution.

| Reference | Canvas | Length | Scenes | Signature |
|---|---|---|---|---|
| `showcase/flagship/index.html` | 1280×720 | 19s | 6 | Photo + scrim scenes, asset grid, neural SVG split |
| `showcase/index.html` (KEYFRAME master) | 1920×1080 | 33s | 9 | WebGL depth, cqw fluid type, narrative arc, glass cards |
| `showcase/amazon-premium/index.html` | 1280×720 | 20s | 5 | Brand palette, screenshot annotation, stat arcs |

---

## 1. The composition contract (identical in all three)

- `#root.composition` carries `data-composition-id / data-width / data-height / data-duration`.
- **Every `.clip` is a DIRECT child of `#root`** with `data-start / data-duration / data-track-index`. No nested clips.
- Scene windows are **sequential and disjoint** → no cross-scene occlusion is possible.
- One **paused** GSAP timeline registered in `window.__timelines["vid"]` — the renderer seeks it frame-by-frame. All hidden state is `opacity:0` in markup (never `gsap.set` for initial state).
- Every repeating tween uses **finite repeats** computed from the duration (`reps(D,cycle)`), never `repeat:-1`.
- WebGL / canvas layers repaint as a **pure function of `hf-seek` time** (seeded PRNG — never `Math.random()` at runtime).
- Dev-preview boot is gated on `!navigator.webdriver` so the render browser is unaffected.

## 2. The layered depth model (bottom → top)

All three build the frame as a **5-tier stack**; this is why they read "premium"
while a single-layer comp reads "slideshow":

| Tier | flagship | KEYFRAME master | amazon-premium |
|---|---|---|---|
| 0 · Ground | radial-gradient base, animated `backgroundPosition` drift | radial gradient + **procedural THREE.js point-clouds/icosahedron** | radial ground |
| 1 · Light field | per-scene radial `#bg` variants | 2 giant blurred **blobs** (screen blend) + 4 bokeh + vignette | 3-stop glow layer + 12-particle SVG + masked grid |
| 2 · Scene backdrop | full-bleed photo + **scrim** (Ken-Burns) | per-scene `.cam` with its **own glow light source** | per-scene `.hero-glow` behind the hero |
| 3 · Scene content | flex `.scene` (padding+gap, no abs stacks) | `.safe` area (7.5%/5% padding) | `.stage` (camera target) + absolute zones |
| 4 · Overlay | caption pill (track 20) | caption pill (track 20) | ONE seek-safe caption node (top track) |

Key insight: **the camera moves the backdrop tier, not the composed content**
(KEYFRAME master `.cam`, amazon `.stage` pushIn) — content stays legible while
the shot breathes.

## 3. Narrative flow (the arc, not just scenes)

The KEYFRAME master is a story spine, generalizable to any product:

```
HOOK (typewriter, blank page) → TURN (question) → REVEAL (brand, 3D char-cascade)
→ STEP 01 (write: code card) → STEP 02 (compose: agent graph draws) → STEP 03 (render: filmstrip + playhead)
→ PROOF (3 stat cards, triple count-up) → DIFFERENTIATOR (strike-through "No X / No Y" → "Just Z")
→ CTA (mark blur-in, aura pulse, heartbeat button)
```

flagship: HOOK → PRODUCT (screenshot) → SCALE (grid + counter) → HOW (split diagram) → QUALITY → CTA.
amazon:  HERO (screenshot) → FEATURE (annotated screenshot) → DATA (stat arcs) → BREADTH (card grid) → CTA.

**Pacing law:** scenes run 2.5–4.5s; all content beats land inside the first
~40% of the scene, ambient holds (floats/pulses) own the remaining 60%; exits
are 0.3–0.5s `power2.in` fades finishing exactly on the boundary, followed by a
hard `set(opacity:0)` kill.

## 4. Asset-placement grammar

- **Screenshots are never bare.** Always inside a browser frame: bar (3 dots +
  URL pill) + fixed-height body + `object-fit:cover / top center`. Entrance =
  3D tilt (`rotationX 12–16`, `transformPerspective`, `expo.out`), a glow pool
  *behind* the frame, then either a float loop or an internal `yPercent` pan
  (amazon pans the shot −10% over the scene). Landscape: frame 52–62% wide,
  copy in the other column.
- **Annotation grammar (amazon S2 — the money shot):** callout chips (`.chip` —
  icon square + bold accent value) pop `back.out(1.7)` AFTER a connector line
  draws (`stroke-dashoffset→0`) into a **target ring** that pops on the
  feature being called out. Sequence: draw line (0.4s) → ring (0.4s) → chip
  (0.45s), repeated per callout ~1s apart.
- **Photos are backgrounds, never foregrounds.** Full-bleed `object-fit:cover`
  + radial/linear **scrim toward the ground color** + Ken-Burns
  (`scale 1→1.1` + 3% axis drift, `sine.inOut`, whole scene).
- **Vectors/illustrations** live in glass/hard tiles (`object-fit:contain`,
  padding) — grid of 3–6, stagger-popped `back.out(1.5–1.6)`, then a stagger
  float. Or as split-row art beside copy.
- **Authored SVG diagrams** (neural net, agent graph): edges are
  `stroke-dasharray/offset` lines drawn on with stagger, nodes scale-pop
  `back.out(1.8–2.2)` after their edges, then glow-pulse (`drop-shadow` yoyo).
  Staged left→right = "the system is thinking".

## 5. Vector / ornament placement

- Decorative particles sit at **asymmetric authored positions** (never grids),
  4–12 per scene, 2–9px, in 2–3 palette hues + white; enter `back.out(2)`
  scale-pop with 0.05–0.08 stagger, then yoyo float −14 to −22px.
- Underlines/rules **draw** (scaleX or dashoffset), never appear.
- Corner brackets, orbit rings, folio marks = "chrome" that brands the frame;
  always margin-placed so they orbit the headline, never fight it.
- Every ornament layer is `pointer-events:none` + `data-layout-allow-occlusion`.

## 6. Motion vocabulary (the verbs)

**Entrances** (0.4–0.9s):
- word cascade: `yPercent 80–110 → 0` + `blur(6–10px)→0`, stagger 0.07–0.12, `power3/4.out`
- char cascade (brand moments): `yPercent:120, rotationX:-80 → 0`, stagger 0.05, `back.out(1.6)`
- masked line rise: parent `overflow:hidden`, child `yPercent:115→0`, `power4.out`
- 3D card tilt-in: `y:36–60, rotationX:14–22` (or `rotationY:26–38`) → 0, `expo.out`
- scale-pop: `scale:0.6–0.85 → 1`, `back.out(1.4–2.2)`
- blur-in mark: `scale:0.7, blur(10px) → 1, 0`, `expo.out`

**Emphasis / reactive beats** (every scene needs ≥1 value that *resolves*):
- count-up: `{v:0}` proxy + `snap` + `onUpdate textContent` (0.9–1.7s, `power2.out`), staggered starts when multiple
- arc/progress ring: `stroke-dashoffset → target` (partial fills = real data feel)
- gradient shine: `.grad` has `background-size:220%`; sweep `backgroundPosition 120%→0%`
- strike-through: `scaleX 0→1` from left, `power3.inOut`, then the struck row dims to 0.28
- hand-drawn underline path draws under the answer word
- light sweep: skewed white gradient strip crossing the frame once
- caret blink: finite-repeat opacity yoyo; typewriter via proxy + `slice`

**Ambient holds:** Ken-Burns/camera drift (`ease:none` or `sine.inOut`), glow
pulse (opacity/scale yoyo 1.2–1.6s), float yoyo (y −8…−16, 1.6–2.2s, stagger),
heartbeat on CTA (`scale 1→1.04–1.08` yoyo ×2–3).

**Exits:** fade + `power2.in`, optionally −y/scale; **alternating camera** —
some scenes push in (1→1.08), some arrive zoomed and settle (1.14→1.0) — this
alternation is film grammar the single-direction drift lacks.

**Eases table:** entrances `power3.out/power4.out/expo.out`; pops
`back.out(1.4–2.2)`; ambient `sine.inOut`; draws `power2.out/inOut`; exits
`power2.in`. Camera `ease:none`.

## 7. Typography system

- Eyebrow/kicker pill: 12–18px, 700, `letter-spacing:.2–.36em`, uppercase, dot bullet.
- Display: 800–900 weight, `line-height ≤1.05`, `letter-spacing −0.02…−0.035em`; one **gradient emphasis word** per headline (background-clip:text).
- Sub: 500 weight, muted color (~62% ink), `max-width` in ch.
- Fluid sizing: the master uses **cqw units** (`container-type:size` on #root) so type scales with canvas — the portable equivalent in scene-kit is dims-scaled px + `fitBig()`.
- Captions: ONE pill node, bottom 4.5–6%, seek-safe (recomputed per frame from a proxy tween — amazon's pattern, adopted by scene-kit).

## 8. Determinism & safety laws (why these render clean)

1. Hidden = `opacity:0` inline style only.
2. Finite repeats everywhere (`reps`/`sreps`).
3. One caption node, recomputed per frame (seek-proof).
4. Content lives inside a safe area; nothing within the bottom caption zone.
5. Sibling cards in flex/grid with gap (occlusion-proof); absolutes are decorative + `data-layout-allow-occlusion`.
6. `fromTo` on both halves of any full-frame transition element, `immediateRender:false` on the exit half (the cut-layer blank-frame law).
7. GSAP owns the whole `transform` of whatever it animates → never put layout centering (`translate(-50%)`) on the same element GSAP transforms.

---

# Enhancement spec → scene_kit.js (what "enhanced version" means)

The deterministic scene-kit already encodes tier 0/1 (ground + canvas/three FX +
particles + grid), the cut layer, per-pack textfx, card chrome, browser-framed
screenshots, montage, quote/stat/feature archetypes. The following showcase
patterns were **missing** and are now implemented:

| # | Enhancement | From | Where |
|---|---|---|---|
| E1 | **Per-scene light source** — seeded glow div per scene, fades in with the scene, slow parallax drift (opposite the camera) | master `.cam` glows, amazon `.hero-glow` | `buildSceneLight()`, injected in Pass 3 (gradient packs) |
| E2 | **Alternating camera** — even scenes push in `1→drift`, odd scenes arrive at `drift` and settle to 1 | master S3/S7 pull-outs | `sceneMotion()` |
| E3 | **Emphasis shine sweep** — gradient emphasis gets `background-size:220%` + one `backgroundPosition` sweep after the words land | master S2 `#s2-em` | `emphasisBlock()` + Pass 3 |
| E4 | **Stat progress ring** — the single-stat scene draws an arc ring around the number (partial fill; % uses the real value) | amazon `.arc`, nova gauge | `archStat()` |
| E5 | **Proof row** — 2–3 chromed stat cards, per-card count-up + mini arc, rotationY-stagger entrance, float hold | master S7, amazon S3 | new `archProofStats()`, triggered when ≥2 bullets carry strong numbers |
| E6 | **Screenshot callouts** — chips + connector draws + target rings over the browser frame when the scene has bullets | amazon S2 | `archScreenshotHero()` |
| E7 | **Strike-list differentiator** — negation bullets struck out and dimmed, headline answer pops with a drawn underline | master S8 | new `archStrikeList()`, triggered when all 2–3 bullets start with No/Without/Stop/Forget/Skip |

Triggering is **content-driven and conservative** (storyboards that don't carry
the shape render exactly as before). Flat packs keep the flat law: hard rings,
solid chips, no glow/shine (E1/E3 are gradient-pack only).

Phase-2 candidates (documented, not yet built): filmstrip render-strip motif,
process-flow node graph archetype for step sequences, brand char-cascade reveal
for one-word CTA headlines, per-scene kicker pills fed by a storyboard `purpose`
field.
