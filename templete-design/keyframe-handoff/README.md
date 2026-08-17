# Handoff: KEYFRAME — 96 animated video templates

## Overview
This bundle contains **96 looping animated "video" templates** in 9:16 vertical format (1080×1920), for social reels / promo loops. Each is a self-contained motion piece with:
- a hand-drawn animated **world** (inline SVG) that never stops moving,
- **6 recurring beats** expanded to ~15–18 scenes so each loop runs **45–55 seconds**,
- **editable copy** (every headline, sub, stat, list item, caption),
- **screenshot drop-slots** in desktop aspect that the end user fills in,
- **tweakable brand colors** via a Tweaks panel,
- a **unique visual identity per template** — its own palette, type pairing, world, camera moves and interaction mechanic. No two share a look or a motion vocabulary.

## About the design files
The files here are **design references built in HTML/JS** — fully working prototypes that show the exact intended look, animation and behavior. They are **not** a ready-made React/Vue component library. The task in your codebase is either to **reproduce these designs in your app's environment** using its own patterns, OR — since every template is already a self-contained offline HTML file — to **embed the standalone builds directly**. See "Two ways to use this".

## Fidelity
**High-fidelity.** Final colors, typography, spacing, timing and animation. Reproduce pixel- and motion-accurately; every value you need is in the source (see Design Tokens).

## Bundle layout
```
keyframe-handoff/
├── README.md              ← this file
├── standalone/            ← 96 self-contained .html builds (engine + film + fonts + tweaks all inlined)
│   ├── index.html         ← gallery: browse & open all 96
│   ├── README.md
│   └── <slug>.html        ← e.g. ember-roast.html, ghost-route.html …
└── source/                ← editable source (the real project)
    ├── support.js             ← runtime (do not edit)
    ├── animations-v2.jsx      ← scene-sequencing engine (Stage/Sprite, easings, scrubber)
    ├── tweaks-panel.jsx       ← Tweaks panel (color/text/radio/toggle controls)
    ├── film-kit.js            ← shared themed-template engine (FilmKit.make + scene renderers)
    ├── mega-pack-1..6.js      ← 60 kit templates (10 per pack): theme + world + look
    ├── world-pack-1..4.js     ← 20 earlier kit templates
    ├── motion-presets.js      ← shared easing / motion helpers
    ├── <name>-film.jsx        ← 17 fully hand-built one-off films (Organic Garden, Premiere Night, …)
    └── "<Name>.dc.html"       ← 96 thin wrappers: load deps + declare the 3 globals + mount the film
```

## Two ways to use this

### A. Ship the standalone builds (fastest, exact)
Each file in `standalone/` runs offline in any browser — no build step, no network. To place one in a product, point an iframe at it and scale to fit:
```html
<iframe src="/media/ember-roast.html"
        style="width:1080px; height:1920px; border:0"
        title="Ember Roast promo"></iframe>
```
The film letterboxes itself to 9:16 inside whatever box you give it. This is the truest reproduction — it *is* the design.

### B. Rebuild from source in your app (for deep integration / editing)
The source is a plain **browser project — no bundler, no npm**. React + Babel are loaded by the runtime and `.jsx` is transpiled at load. Architecture:

1. **Engine** (`animations-v2.jsx`): a `SceneStage` plays an ordered list of scene objects; each scene renders a React film component for its duration against a shared `clock`, with easings and a scrubber. Exposes `window.useScene()` → `{index,total}` and `window.useTimeline().time`.
2. **Film kit** (`film-kit.js`): `FilmKit.make(config)` registers one template under `window.<GlobalName>`. The config carries the palette, fonts, camera list, per-scene `look` (bg/fg/accent, layout, card & chip styles), the `World` (persistent animated SVG backdrop), and the tweakable brand fields. It also defines the reusable scene renderers: Hook, Statement, Feature, Montage, Stats, CTA + the interaction beats Scroll, Ring, Toggle, Cursor, Typing, Notify, Swipe, DragDrop, Morph, Code.
3. **Template files** (`mega-pack-*.js`, `world-pack-*.js`): each `FilmKit.make({...})` call = one template's identity. Per-template palette, type pairing, world animation and mechanic combo live here.
4. **Wrappers** (`<Name>.dc.html`): load `support.js animations-v2.jsx tweaks-panel.jsx film-kit.js <pack>.js`, declare **3 inline globals**, and mount the film full-bleed.

To port into a real framework: lift the `palette` + `look` + `World` from a template's `FilmKit.make` block into your component, and drive it from one authored clock (rAF or a timeline lib). The world functions are pure `(theme, t, progress, utils) => <g>…</g>` and port as-is.

## Gotcha when editing scene copy
`OM_SCENES` is a JSON string inside a **single-quoted** JS string. A straight apostrophe in copy (`doesn't`) terminates that string and the scene list fails to parse ("the scenes prop isn't a valid JSON scene list"). Use a typographic apostrophe (’) in copy, or escape it as \\'.

## Editing content — the 3 globals (present in every `.dc.html`)
```js
window.OM_SCENES   = '[{"name":"Hook","dur":3.0,"kicker":"…","title":"FIRST CRACK|AT 6 AM.","sub":"…"}, …]';
//   name → which scene renderer; dur → seconds; all other keys → editable copy/data.
//   "|" inside a title forces a line break. Lists / stats / chips / notes are arrays on the scene object.
window.OM_PLAYBACK = '{"mode":"loop"}';          // or '{"mode":"times","count":1}' to play once
window.OM_TWEAKS   = /*EDITMODE-BEGIN*/{ "brand":"Ember Roast", "roast":"#2b1d16", "ember":"#e0662c", "motion":"Lively" }/*EDITMODE-END*/;
//   brand name, 1–2 brand colors, and a motion energy preset — surfaced in the Tweaks panel.
```

## Screenshot / media slots
Scenes with `"image":""` or `"logo":""` render a **dashed desktop-aspect placeholder** reading "DROP IMAGE TO REPLACE" / "Desktop screenshot". Replace the empty string with an image URL (or data URI) to fill it. Feature and Montage beats carry image slots; the CTA carries a logo slot.

## Interactions & behavior
- **Continuous motion**: the `World` is driven by the global clock, so the backdrop drifts / loops the entire scene — never a reveal-then-freeze.
- **Per-scene cameras**: each scene picks a different enter/exit transform (zoom / push L·R·U·D / drop / spin) from the template's `cams` list, so cuts read as motion, not slides.
- **Interaction beats**: Scroll (ticker/board/feed/stack), Ring (gauge/ring/bar), Toggle (switch/check/dial), Cursor (click/keys/slider), Typing (typewriter/terminal/hand/caret), Notify (pop/side/drop), Swipe (flip/swipe), DragDrop (drag/assemble), Morph (fade/roll/flap), Code (terminal/diff) — each template uses a different subset with different variants.
- **Motion presets**: the `motion` tweak (Calm / Lively / Bouncy) scales world energy, camera travel and easing snap.
- **Timing**: ~2.7–3.2s per scene, 15–18 scenes, 45–55s loop. Easings live in `animations-v2.jsx` (outQuint, outBack, inCubic, inOut, …).

## State management
No app state — playback is a pure function of one clock. `SceneStage` maps elapsed time → current scene index + local scene progress (0→1); films are stateless renderers of `(progress, index, localTime, scene)`. The only persisted values are the 3 globals (content, playback mode, tweaks).

## Design tokens
Tokens are **per template**, defined in each `FilmKit.make` `palette` / `look` / `FH` / `FB` block. To read a template's exact values, open its block in the matching pack file. Example — Ember Roast (`source/mega-pack-1.js`):
- **Palette**: roast `#2b1d16`, ember `#e0662c`, cream `#f3e9dc`, gold `#caa465`, ink `#1c110c`.
- **Type** (`FH`/`FB`): heading + body font stacks, loaded via a Google Fonts `<link>` in the wrapper's helmet. All styling is inline literals.
- **Layout** (`look.<beat>`): bg/fg/accent role, title top-offset & size, card/chip/tile treatments, whether the world shows.
- **Radii / shadows / strokes**: inline per element in the renderers and world functions.
The Google Fonts family for each template is in its `<Name>.dc.html` `<link href="…css2?family=…">`.

## The 96 templates (by family)
- **Hand-built one-offs (17)** — Organic Garden, Lantern Night, Story Blocks, Premiere Night, Hype Wave, Studio Launch, Safari Dawn, Cat Nap, Puppy Park, Road Trip, Night Drive, Ocean Dive, Jungle Trek, Campfire Tales, Daybreak Bakehouse, Poster Pop, Type Riot. Each has its own `*-film.jsx`.
- **world-pack 1–4 (19)** — City Pulse, Retro Arcade, Snow Peak, Space Hop, Paper Cut, Ink Brush, Synthwave Sunset, Festival Stage, Storybook Pop, Bird Sky, Desert Neon, Rainy Window, Bloom Market, Pixel Pet, Metro Line, Serif Manifesto, Chalk Talk, Aurora Night, Robot Factory.
- **mega-pack 1 (10)** — Ember Roast, Sole Drop, Abyss Dive, Hive & Honey, Groove Crate, Midnight Ramen, Kickflip Co, Star Watch, Lift Off, Endgame.
- **mega-pack 2 (10)** — Fold Studio, Night Bazaar, Dawn Patrol, Fade Parlor, Kiln & Clay, Crux Climb, Harbor Light, Forest Floor, Steep Ritual, Darkroom Dev.
- **mega-pack 3 (10)** — Velvet Brass, Scoop Lab, Pedal Express, Moon Card, Magma Trail, Wing Garden, Atlas & Ink, On Air, Steam Spring, Turbine Coast.
- **mega-pack 4 (10)** — Lock & Legend, Koi Court, Salsa Wheels, Spinnaker Cup, Rocket Nights, Stacks & Spines, Rind & Wheel, Prop Wash, Tube & Glow, Front & Isobar.
- **mega-pack 5 (10)** — Scale Line, Molten Studio, Nose & Note, Ink & Panel, String & Sky, Twenty Moves, Ghost Route, Semolina Club, Tide Pool Lab, Cold Plunge Club.
- **mega-pack 6 (10)** — Loom & Weft, Vault Twelve, Bonsai Bench, Slow Rise, Aerial Silk, Alpine Post, Reef Build, Clay Court, Escapement, Dune Camp.

## Assets
No external image assets ship with the bundle — screenshot / logo slots are **placeholders the user fills**. All fonts load from Google Fonts (families listed per `.dc.html`). All worlds are hand-authored inline SVG. For a fully offline build, self-host the families named in each wrapper's `<link>`.

## Files to reference
- Working reference for any template: `standalone/<slug>.html` (open in a browser; `standalone/index.html` links all 96).
- Editable identity for any template: its `FilmKit.make` block in `source/mega-pack-*.js` / `source/world-pack-*.js`, or its `source/<name>-film.jsx` for the hand-built ones.
- Engine + shared behavior: `source/animations-v2.jsx`, `source/film-kit.js`, `source/tweaks-panel.jsx`, `source/motion-presets.js`.
