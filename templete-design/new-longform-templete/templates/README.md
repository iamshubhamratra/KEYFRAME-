# KEYFRAME — Long-form template collection

Ten 16:9 long-form motion worlds for narrated videos of up to about five
minutes. Each template is an independent, host-editable film: its own palette,
transition language, camera set, shape language, typographic treatment, scene
architecture and pacing.

## Shared engineering

| File | Role |
| --- | --- |
| `animations-v3.jsx` | Continuous-composition engine. One element tree rendered from one authored clock, so elements persist across scene boundaries. Owns the host timeline (scene trims, reorder, speed, video export). |
| `kit/film-kit.js` | Shared mechanics only — `palette()` brand adaptation, easing set, staggering, `useSpan`, `makeScene`, text mechanics (`Words`, `Chars`, `Typed`, `Counter`, `Roll`, `Marquee`, `RingText`), asset slots (`Slot`, `BrowserSlot`, `LaptopSlot`, `LogoSlot`), interaction motifs (`Cursor`, `Keycaps`, `Burst`, `Drift`). |
| `image-slot.js` | Drag-and-drop image placeholder; drops persist per slot id. |

Each template owns its **transition set** and **camera set** and passes them to
`makeScene()`, so no two templates move alike even though they share primitives.

## Scene architecture

Every template covers the long-form arc rather than stretching one idea:

```
Open → Hook → Visual establish → Ch1 Problem → evidence → statistic → quote
→ context → cost → Turn → Ch2 Explanation → pillars → features ×3 → steps
→ detail grid → authority quote → Ch3 Proof → stats → comparison visual
→ testimonial → social proof → comparison table → Ch4 Context/scale → montage
→ scale visual → plans → coverage → origin → Ch5 Close → guarantee → offer
→ CTA → End
```

Chapter dividers reset the eye every 6–8 beats; no mechanic is reused.

## Brand colour adaptation

Every template reads `window.OM_TWEAKS`:

```js
window.OM_TWEAKS = { brandName: "…", brand: "#hex", brand2: "#hex" };
```

`palette()` derives light/mid/dark ramps, glows and alpha veils from those two
values, so an injected brand or logo colour flows through fills, gradients,
borders, UI elements, shapes, glow and type accents while each template keeps
its own ground, ink and shape language.

## Rebuild status

**All ten templates are on the shared system.**

Every film now: binds to the Organic design system (its `styles.css` and
`_ds_bundle.js` linked, with colour, ramps and both faces resolved from `:root`);
runs the twelve-layer background engine as a single composition-level instance;
draws one composition-level garnish layer whose ink comes from the live ground;
cycles camera moves by scene index; carries a scene→state map so the background
reacts to the kind of beat; exposes an `energy` tweak; and shows no template name
on screen.

| # | Template | Scenes | State bias | Decor driven by scene energy |
| --- | --- | --- | --- | --- |
| 01 | Pet Story | 50 | FEATURE | trotting dog, bouncing ball, paw prints |
| 02 | Cat Curious | 50 | FEATURE | stalking cat, yarn ball, tumbling objects |
| 03 | Kitchen Table | 46 | FEATURE | rocking knife, simmering pot, spice shelf |
| 04 | Lunch Rush | 50 | FEATURE | scooter, service clock, ticket printer |
| 05 | Signal | 45 | DATA | radar sweep, channel traces, packet routing |
| 06 | Split Time | 43 | FEATURE | runner's cadence, stopwatch, lane markers |
| 07 | Flightpath | 45 | INTRO | skein crossing, lone bird, high flock |
| 08 | Canopy | 38 | FEATURE | vine sway, leaf fall, light shafts |
| 09 | Latent | 36 | DATA | pulse traffic, attention beam, ridges |
| 10 | Workspace | 40 | FEATURE | cursor tour, windows, dock |

01 Pet Story is the one rebuilt from scratch (new direction, scenes reauthored,
redrawn dog, slots cut to three). The other nine keep their own scene mechanics
and were brought onto the shared system, with their worlds becoming the engine's
`decor` layer and their creatures and props redrawn where they were weak.

## The ten templates

| # | Template | Theme | Motion world | Status |
| --- | --- | --- | --- | --- |
| 01 | Pet Story | Dogs / pet lifestyle | **Rebuilt v2** — modernist broadsheet: 12-col ruled grid, Archivo 900, zero radius, one red accent, grayscale plates | ✅ built |
| 02 | Cat Curious | Cats / playful | Off-grid crops that bleed off frame, snap/shutter cuts, stepped jitter cameras | ✅ built |
| 03 | Kitchen Table | Food / culinary | Magazine page grid, rules and folios, page folds, cinematic Ken Burns | ✅ built |
| 04 | Lunch Rush | Restaurant / delivery | Shuffling tile grid, order-tracking UI, receipts and price tags, punch cuts | ✅ built |
| 05 | Signal | Future tech | Parallax coordinate grid, HUD brackets, glowing data viz, dolly and rack cameras | ✅ built |
| 06 | Split Time | Running / fitness | −7° skewed kinetic layouts, motion-trail ghosting, split-flap clocks, streak and slam cuts | ✅ built |
| 07 | Flightpath | Birds / nature | Four-plane parallax sky, depth-layered flocks, dissolves and light blooms, slow-to-quickening cameras | ✅ built |
| 08 | Canopy | Jungle / adventure | Five-plane foliage sway, volumetric light shafts, leaf and canopy wipes, pushing cameras | ✅ built |
| 09 | Latent | AI | Living node lattice, embedding clouds that reorganise, type resolving out of noise, computational wipes | ✅ built |
| 10 | Workspace | Computer / SaaS | Window chrome that stacks and tiles, cursor-driven demos, command palette, pane wipes | ✅ built |

Each template folder contains its page, its film, and a README with description,
category, tags, use cases, design brief, animation description, asset
documentation, text documentation and brand-token documentation.

## Collection at a glance

All ten run 5:00 exactly, 16:9 at 1920×1080, looping, with the host timeline
wired for scene trims, reordering, speed changes and video export.

| # | Scenes | Ground | Display voice | Signature mechanic |
| --- | --- | --- | --- | --- |
| 01 Pet Story | 50 | bone #f3f2f2 | Archivo 900 caps | ruled grid, drawing rules, stepping cells, red poster dividers |
| 02 Cat Curious | 50 | warm charcoal | Figtree 800 lowercase | crop windows that change aspect mid-scene |
| 03 Kitchen Table | 46 | paper | Caprasimo editorial | page folds, folios, drop caps |
| 04 Lunch Rush | 50 | saturated blocks | Figtree 800 tabular | order tracker, receipts, price tags |
| 05 Signal | 45 | near-black | Figtree 700 readouts | HUD brackets, sparklines, gauges |
| 06 Split Time | 43 | bone / track black | Figtree 800 −0.05em | −7° skew, motion-trail ghosting, split-flap |
| 07 Flightpath | 45 | dusk / mist | Figtree 400 light | four-plane parallax sky, depth-layered flocks |
| 08 Canopy | 38 | deep forest | Caprasimo + field caps | five-plane foliage sway, light shafts |
| 09 Latent | 36 | cool near-black | Caprasimo resolving | type resolving out of noise, node lattice |
| 10 Workspace | 40 | bone (only light one) | Figtree 600 UI | window chrome, cursor demos, command palette |

## Content contract

`kit/content.js` makes the films data-driven. Copy used to be written into the
JSX, which made them demos rather than templates — a generator could not populate
them without editing the source. Now each scene declares the fields it consumes
and the host supplies them per scene:

```js
window.OM_CONTENT = {
  Open:  { title: "MERIDIAN PROVISIONS", label: "HONEST PET NUTRITION", body: "…" },
  Stat1: { stat: 91, unit: " in 100", body: "…" },
  Hook:  { items: ["THE SHELF LIES", "BY OMISSION", "…"] },
  Cost:  { rows: [["Vet visits", "£340"], ["Food refused", "£120"]] },
};
```

Fields: `kicker`, `title`, `body`, `label`, `quote`, `source`, `stat`, `unit`,
`items`, `rows`. Behaviour that matters for generated jobs:

- **Fallback per field, not per scene.** Anything absent renders the template's
  demo copy, so a partially-filled job never produces blank frames.
- **Lists are capped** to what the layout was designed to hold — a ten-item answer
  will not break a three-cell grid.
- **Stats coerce** from string or number.
- **Text refits.** `Content.fit(text, size, measure, family, weight, lines)`
  measures the real string: a long headline shrinks to its column, and a wrapping
  statement gets the capacity of its intended line count so it keeps its authored
  size and breaks where meant. Generated copy is longer and less predictable than
  authored demo copy, so this is not optional.

**Declared-but-unwired fields are auditable — on demand, not on a timer.** A field
in `DEMO` that no scene consumes is worse than a crash: the job looks filled and
still renders demo copy. `CT.audit()` reports those, and each template exposes it
(`window.PetStoryAudit()`).

It cannot run automatically, and this is the trap: reads accumulate as scenes
render, and `makeScene` gates scenes to the playhead, so a field can only be
judged unwired once its own scene has rendered. A timed run early in playback sees
one live scene and reports the other thirty as dead — which an earlier version did,
naming ~29 correctly-wired scenes on every load, with the list varying by playhead
position. The audit now blames only scenes it actually saw, and returns its own
coverage (`{dead, covered, declared, complete, unseen}`) so a partial answer is
never mistaken for a clean one. Run it after a full playthrough for a complete
verdict.

Wired into **01 Pet Story**: all 50 scenes carry bindings. 31 were wired first —
the ones a generated job most needs (brand name and URL at the open *and* the
close, price cards, recipe percentages, headline stats, FAQ pairs, steps, pillars,
comparison rows, ingredient panel).

The remaining 19 were described here as "pure-mechanic scenes with no copy of their
own", and that was wrong. They hold the press quotes, the referral code, the team
names, the kitchen timetable and the whole proof section — roughly 38% of the
runtime. Because they were undeclared, a generated job for another brand published
all of it verbatim, and `CT.audit()` could not report it: the audit iterates the
keys of `DEMO`, so a scene that never appears there is invisible to it. They are
declared now, their demo copy unchanged as the fallback. Verified: injected content
overrides, absent fields fall back per field, over-long lists cap, and a
35-character headline refits from 263px to 138px rather than overflowing.

The other nine templates still have hardcoded copy — the contract exists and the
binding pattern is established, but rolling it through them is outstanding work.

## Background engine

`kit/bg-engine.js` is the shared long-form background system. `BGEngine.make(cfg)`
returns a ground function for `makeScene`, assembling twelve layers back to front:

| Layer | Behaviour |
| --- | --- |
| Gradient mesh | Four large blobs on their own frequencies, drifting, breathing and rotating, blurred at 38px |
| Depth bands | Three parallax bands at different speeds and vertical scales |
| Ambient orbs | Two 800px blurred light sources moving and rescaling behind the content |
| Animated grid | Perspective grid that scrolls and tilts, with five intersections pulsing — on only for structured beats |
| Data flow | A fixed 16-node graph with pulses travelling its edges — on for feature and data beats |
| Decorative objects | The template's own world (its animals, props, charts) handed in as one layer |
| Particle field | Thirty-four motes across three depth tiers, parallaxed by depth |
| Light sweep | A blurred beam entering off-frame, crossing, fading, waiting, returning |
| Morph shape | At each boundary a soft blob expands, deforms and clears, so the background carries the cut |
| Grain | An animated fractal-noise tile drifting under `mix-blend-mode: overlay` |
| Camera drift | One wrapper for every layer above — a slow figure-of-eight plus a micro-zoom breath |
| Vignette | Outside the drift, so the frame edge stays put while its strength varies |

**Scene-reactive.** Each template maps its scene names to one of seven states —
`INTRO`, `PROBLEM`, `SOLUTION`, `FEATURE`, `DATA`, `MOMENT`, `CTA` — and the
state sets brightness, particle energy, grid and flow strength, vignette
tightness, sweep rate and orb scale. States are **interpolated** out of the
previous scene's values over the first fifth of each scene, so the background
transforms between beats instead of switching. A section index derived from
elapsed runtime nudges the mesh further round the palette across five chapters,
so a five-minute film keeps evolving without changing identity.

**Brand-adaptive.** Every gradient, orb, pulse and mote is drawn from the
template's resolved palette, so an injected brand colour flows through the whole
system while the template keeps its own grounds and geometry.

**Three layers are composition-level, never per-scene.** The background engine,
the readability wash and the garnish all render once, above every scene, coloured
from `FilmKit.useActive()`. The kit deliberately keeps neighbouring scenes mounted
across a cut, so anything drawn inside a scene doubles at every boundary — two
mismatched instances blended, producing a brightness lift and settle exactly where
the eye is. All three were caught making this mistake in turn; the wash was the
last, jumping 34% to 56% at each cut and changing the contrast behind type
mid-transition. If a layer is meant to be continuous, it goes at composition
level.

**One instance, above every scene.** The engine is rendered once at composition
level and coloured from `FilmKit.useActive()`, and scenes are built with
`{ paint: false }` so the backdrop paints the ground instead of each scene
painting over it. Passing the engine as `makeScene`'s per-scene `ground` looks
right but is wrong: the kit deliberately keeps neighbouring scenes mounted across
a cut, so two whole background systems would stack at every boundary — each
resolving a different scene state — producing a brightness pop exactly where the
eye is. The same rule applies to the garnish layer.

**Capture-safe.** Gradient strings, node positions and particle scatter are
computed once at construction; per frame only transforms, opacities and a few
numeric attributes change, and nothing calls `Math.random` at render time, so a
given frame always draws identically.

Wired into **01 Pet Story**; the remaining nine still use their own single-layer
worlds and can be moved over by passing their existing world in as `decor`.

## Worlds

No scene sits on a flat fill. Each template owns a **world** — an animated SVG
background passed to `makeScene()` and drawn behind the camera layer in every
scene. Worlds run off the composition clock rather than scene progress, so they
never restart at a cut: the dog keeps trotting, the pot keeps simmering, the
radar keeps sweeping straight through the transition. Each template sets its own
`AMB` tempo multiplier.

| # | World |
| --- | --- |
| 01 Pet Story | A twelve-column technical grid, a flat rectangle-built dog trotting a ruled baseline with scrolling ticks, a red square ball bouncing, plotted paw marks, a turning outline square |
| 02 Cat Curious | Three drifting sunbeams in different hues, a cat stalking a ledge with a lit eye, a yarn ball rolling out its own thread, a swinging toy, tumbling knick-knacks, motes |
| 03 Kitchen Table | A knife rocking on the board, herbs and chopped colour flying in six hues, a simmering pot with steam and bubbles, a seven-jar spice shelf, settling flour |
| 04 Lunch Rush | Six travelling neon service bands, a scooter with a lit helmet on a scrolling road, a sweeping clock, a pulsing bento grid, a ticket printer, steaming cups |
| 05 Signal | A radar head lighting contacts as it passes, three stacked channel traces in different hues, a 46-bar spectrum floor, packets routed between switches, an orbiting satellite |
| 06 Split Time | Five coloured lane bands, three runners at different depths each trailing ghosts, a two-hand stopwatch, a nine-bar split readout, scrolling markers, split flags |
| 07 Flightpath | A four-band dawn sky with a low sun, coloured cloud layers at two depths, an eleven-bird skein, a lone bird ahead, a high flock crossing the other way, pollen rising |
| 08 Canopy | Three depth-tinted strata, seven swaying vines with six-hue leaves at their tips, spinning leaf fall, raking shafts, a flitting bird, a skulking shape with a lit eye |
| 09 Latent | A three-hue nebula wash, pulses travelling a 26-node graph in four colours, a raking attention beam over a token row, two breathing probability ridges, falling samples |
| 10 Workspace | Five drifting app-colour bands, three tinted windows sliding in with traffic lights and content, a touring cursor that clicks and ripples, a bouncing dock, a filling progress bar |

Worlds are built from a small number of SVG groups driven by phase loops
(`(t * speed) % 1` for traversals, `Math.sin(t * f)` for oscillation), kept at
low alpha and pushed to the frame edges and floor so content stays readable. A
scene can opt out with `ground={false}` where a full-bleed image should own the
frame.

## Playback rules

- **No template branding on screen.** The films carry no wordmark, logo chip or
  template-name overlay — nothing that would end up burned into an exported
  video. Brand identity comes from the user's own assets in the image slots.
- **Pacing.** Choreography runs at 2.6× scene length, so each beat animates
  across roughly the first 40% of its scene and then holds. Earlier builds ran at
  8–12×, which landed everything inside the first fraction of a second and then
  froze for the remainder.
- **Readability.** Every world sits behind a 34% veil of its own scene ground, so
  background motion always reads as background and never competes with type.
- **Auto-fit display type.** `FilmKit.fitText(text, size, maxW, family, weight)`
  measures a string and shrinks the size until it fits its column, so longer real
  content cannot collide or run off the frame.

**Performance contract** — every template gates image slots and scene bodies to
the playhead, and animates only transforms over statically computed clip-paths, so
DOM capture, thumbnails and frame-by-frame video export stay within budget.
