# KEYFRAME long-form video templates — integration guide

Ten 16:9 long-form motion templates, 1920×1080, ~5 minutes each, looping.
Everything in this folder is plain browser JavaScript — no npm install, no build
step required for route A below.

---

## 1. What's in here

```
animations-v3.jsx      Composition engine. One element tree, one authored clock.
                       Exposes CompositionStage, Shot, useComposition, clamp,
                       Easing as window globals.
support.js             Runtime that mounts a .dc.html page and transpiles JSX
                       in the browser. Only needed for route A.
image-slot.js          <image-slot> drag-and-drop image placeholder element.

kit/film-kit.js        Shared film mechanics: palette(), easings, staggering,
                       useSpan, useActive, makeScene, fitText, text mechanics
                       (Words, Chars, Typed, Counter, Roll, Marquee),
                       asset slots (Slot, BrowserSlot, LaptopSlot, LogoSlot).
kit/bg-engine.js       Twelve-layer scene-reactive background system.
kit/content.js         Content contract — maps host-supplied copy into scenes.
kit/illo.js            Illustration library (animals, people, props).
kit/cartoon.js         Cartoon-styling helpers used by illo.js.

_ds/organic-…/         The Organic design system: styles.css carries every
                       colour, ramp, font and spacing token the films read.

templates/01-pet-story/ … templates/10-workspace/
  <Name>.dc.html       The page. Holds fonts, scene list, playback mode,
                       brand tokens and content. This is the config surface.
  <name>-film.jsx      The film: palette, transitions, cameras, all scenes.
  support.js           Per-folder copy of the runtime (route A).
  README.md            Per-template docs: design brief, animation description,
                       asset ids, text roles, brand tokens.

templates/README.md    Collection overview, background-engine docs, the
                       architectural rules and the traps to avoid.
templates/Collection.html   Grid of all ten, each playing live.
```

---

## 2. Route A — drop in as-is (no build)

Each `.dc.html` is a self-contained page. Serve this folder over HTTP and open
any of them directly:

```
templates/01-pet-story/Pet Story.dc.html
```

To embed in your product, iframe it and pass config on the URL or via
`postMessage` into the globals in section 4:

```html
<iframe src="/templates/01-pet-story/Pet%20Story.dc.html"
        style="width:1920px;height:1080px;border:0" />
```

Must be served over HTTP, not `file://` — the films fetch their sibling JSX.

**Trade-off:** `support.js` transpiles JSX in the browser at load, which costs
roughly 200–400ms of startup. Fine for previewing and for server-side frame
capture; use route B if the film mounts inside a React app the user interacts
with.

---

## 3. Route B — native React (with a build step)

The films are ordinary React function components that read their inputs from
window globals. To bundle them:

**1.** Transpile `animations-v3.jsx` and each `*-film.jsx` with your existing
JSX toolchain (Vite, esbuild, Babel — the classic runtime, `React` in scope).

**2.** Load in this exact order, before the film:

```
animations-v3.jsx      →  window.CompositionStage, Shot, useComposition,
                          clamp, Easing
kit/film-kit.js        →  window.FilmKit
kit/illo.js            →  window.Illo          (templates 01, 02 only)
kit/cartoon.js         →  window.Cartoon       (templates 01, 02 only)
kit/bg-engine.js       →  window.BGEngine
kit/content.js         →  window.Content       (template 01 only)
<name>-film.jsx        →  window.<Name>Film
```

Each kit file is an IIFE assigning to `window`, so a plain `<script src>` or a
side-effect `import` both work. Order matters: the films read these at module
evaluation time.

**3.** Link the design system stylesheet — the films resolve colour, ramps and
both typefaces from its `:root` custom properties, so without it they render
unstyled:

```html
<link rel="stylesheet" href="/_ds/organic-…/styles.css">
```

**4.** Render the global:

```jsx
const Film = window.PetStoryFilm;
return <Film />;
```

The component mounts its own `CompositionStage` at 1920×1080 and scales to fit
its container.

**Global names:**

| Template | Global | Extra kit files |
| --- | --- | --- |
| 01 Pet Story | `PetStoryFilm` | illo, cartoon, content |
| 02 Cat Curious | `CatCuriousFilm` | illo, cartoon |
| 03 Kitchen Table | `KitchenTableFilm` | — |
| 04 Lunch Rush | `LunchRushFilm` | — |
| 05 Signal | `SignalFilm` | — |
| 06 Split Time | `SplitTimeFilm` | — |
| 07 Flightpath | `FlightpathFilm` | — |
| 08 Canopy | `CanopyFilm` | — |
| 09 Latent | `LatentFilm` | — |
| 10 Workspace | `WorkspaceFilm` | — |

All ten need `animations-v3.jsx`, `kit/film-kit.js` and `kit/bg-engine.js`.

---

## 4. Configuration surface

Four globals, all set in the `.dc.html` before the film loads. These are the
only things your renderer needs to write.

### `OM_SCENES` — the timeline (JSON **string**)

```js
window.OM_SCENES = '[{"name":"Open","dur":4,"desc":"…","nat":7}, …]';
```

`name` matches the scene in the film (do not rename — the film looks scenes up
by name). `dur` is seconds. `desc` is the human label. `nat` is the natural
duration hint. Change `dur` to retime; drop an entry to cut a scene.

### `OM_PLAYBACK`

```js
window.OM_PLAYBACK = '{"mode":"loop"}';
// or '{"mode":"times","count":1}' to play through once
```

### `OM_TWEAKS` — brand adaptation

```js
window.OM_TWEAKS = { brand: "#c67139", brand2: "#7a8a5e", energy: "Lively" };
```

`brand` and `brand2` replace the two accents. `palette()` derives the light,
mid, deep, glow and veil steps from them, so one injected brand colour flows
through fills, gradients, borders, shapes, glows and type accents while each
template keeps its own grounds and geometry. `energy` is `"Calm" | "Lively" |
"Urgent"` and scales ambient motion.

### `OM_CONTENT` — the copy (template 01 only)

```js
window.OM_CONTENT = {
  Open:  { title: "MERIDIAN PROVISIONS", label: "…", body: "…" },
  Stat1: { stat: 91, unit: " in 100", body: "…" },
  Hook:  { items: ["THE SHELF LIES", "BY OMISSION", "…"] },
  Cost:  { rows: [["Vet visits", "£340"], …] },
};
```

Fields per scene: `kicker`, `title`, `body`, `label`, `quote`, `source`, `stat`,
`unit`, `items`, `rows`. Behaviour that matters for generated jobs:

- **Fallback is per field, not per scene** — a partially filled job renders demo
  copy for the rest rather than blank frames.
- **Lists cap** to what the layout holds, so a ten-item answer can't break a
  three-cell grid.
- **Headlines refit** — `Content.fit()` measures the real string against the real
  measure, so a long generated headline shrinks instead of overflowing.
- **Unread fields warn** — `CT.audit()` logs anything declared that no scene
  consumes, since that silently renders demo copy.

Read at render time, so a host writing `OM_CONTENT` after load needs a repaint.

**Templates 02–10 still have their copy hardcoded in the film.** The contract
exists and 01 is the worked pattern; wiring the other nine is outstanding work.

---

## 5. Image slots

Every template exposes named `<image-slot>` placeholders — ids and sizes are
listed in each template's `README.md`. In the authoring host they are
drag-and-drop; in production, set the image before mount:

```js
document.querySelector('image-slot#pet-hero').setAttribute('src', url);
```

Template 01 carries 3 slots (it was rebuilt for text-led films). Templates 02–10
carry 10–22 each, so an unfilled job shows dashed placeholder boxes — reduce the
slot count in the film, or supply images.

---

## 6. Architecture rules — read before editing

Two mistakes cost real time on this collection. Both are in
`templates/README.md` in full; the short version:

**Continuous layers are composition-level, never per-scene.** The background
engine, the readability wash and the garnish each render **once**, above every
scene, coloured from `FilmKit.useActive()`. The engine deliberately keeps
neighbouring scenes mounted across a cut, so anything drawn inside a scene
doubles at every boundary — two mismatched instances blended, producing a
brightness lift exactly where the eye is. Scenes are built with
`{ paint: false }` so the backdrop paints the ground.

**Animate transforms, not geometry.** Clip-path strings, gradient definitions,
node positions and particle scatter are computed once at construction. Per frame
only transforms, opacities and a few numeric attributes change, and nothing
calls `Math.random` at render time — so a given frame always draws identically.
This is what keeps DOM capture, thumbnails and frame-by-frame video export inside
budget. Rebuilding a `clip-path` per frame on a large element will break capture.

---

## 7. Rendering to video

The films are deterministic functions of one clock, so frame capture works by
setting the playhead and screenshotting:

1. Mount at exactly 1920×1080 with no CSS scale.
2. For each frame `n` at fps `f`, set the composition time to `n / f`.
3. Capture the stage element.

Total runtime is the sum of `dur` across `OM_SCENES` (300s per template as
shipped). Frame cost varies: template 09 Latent is the heaviest at ~238 SVG
shapes plus the engine; template 10 Workspace is the lightest at ~88.

---

## 8. Fonts

Caprasimo (display) and Figtree (body) load from the design system stylesheet.
If your product blocks external font requests, self-host both and override
`--font-heading` / `--font-body` in your own `:root` — the films read the tokens,
not hardcoded family names.

---

## 9. Known gaps

Stated plainly so they don't surprise you:

- **16:9 only.** No 9:16 or 1:1 variants; the layouts are composed for landscape.
- **Content contract on template 01 only.** The other nine have hardcoded copy.
- **No caption lane or title-safe margin.** For burnt-in captions, reserve the
  bottom ~15%; several scenes currently place content there, and the garnish
  footnote sits where captions go.
- **Ten templates share layout archetypes.** Three counting stats, two-column
  compare, marquee-plus-counter, three price cards, portrait-plus-quote. The
  differentiation is colour, world and transitions more than composition.
- **All ten default to the same Organic palette.** Brand override works; the
  defaults don't differentiate.
- **No per-template thumbnail images.**
