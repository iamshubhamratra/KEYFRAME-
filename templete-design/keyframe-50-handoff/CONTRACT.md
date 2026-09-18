# CONTRACT — FilmKit config schema as these packs use it

Scoped to the pilot (`margin-notes`). Extends to all 50 unchanged; per-pack
values differ, the shape does not.

## Where this brief and the reference file disagree

The brief's §1 and §5 describe the **native composer** contract (GSAP timeline on
`window.__timelines["vid"]`, `.clip` layers with explicit start/duration/track,
all sizes in `cqw`). The reference file named in the brief —
`keyframe-handoff/source/film-kit.js`, which `gen-film-skins.js` actually reads —
is **React + animations-v2**: one authored clock, `World: (theme, t, p, u) => …`
with `u.{W,H,ease,clamp01,seg}`, and **inline px against a fixed 1080×1920 box**.

Per the brief's own rule ("where this brief and that file disagree, the file
wins") these 50 packs follow the reference file. **Consequences the integrator
must know:**

| Brief asks | These packs do | Why |
|---|---|---|
| GSAP paused timeline `__timelines["vid"]` | animations-v2 authored clock, seek via `data-om-seek-to-time-frame` | film-kit.js owns the clock; packs carry data only |
| `.clip` layers, explicit track | `window.OM_SCENES` beat list, engine assigns tracks | same |
| all sizes in `cqw` | px against 1080×1920, scaled by the stage | reference engine scales the whole stage; px is resolution-independent through that transform |

If the target is the GSAP composer rather than FilmKit, **these packs need a port,
not an import** — flag before integrating.

## Top-level config fields

| Field | Type | Req | Default | Meaning | New? |
|---|---|---|---|---|---|
| `global` | string | yes | — | `window.<global>` the wrapper mounts | reference |
| `brand` | string | yes | — | display name; **not drawn on screen** (see `chrome`) | reference |
| `desk` | hex | yes | — | page surround outside the 9:16 box | reference |
| `ambient` | number | no | 1 | ambient light multiplier | reference |
| `chrome` | boolean | no | true | **NEW.** `false` removes the brand/progress overlay. All 50 set false — a viewer must never see a template name | **new** |
| `FH` / `FB` | font stack | yes | — | display / body faces | reference |
| `FM` | font stack | no | FB | **NEW.** mono face for gutters, counters, timecodes | **new** |
| `titlePreset` / `itemPreset` | enum | no | rise/pop | entrance from motion-presets | reference |
| `titleLine` / `titleSpace` | number / css | no | 1.04 / 0 | display leading and tracking | reference |
| `palette` | `(t) => object` | yes | — | **the only place hexes appear.** Returns the slot map | reference |
| `tweaks` | array | yes | — | `{k, label, options[]}` per exposed colour | reference |
| `groundCss` | `(theme,bg) => css` | no | — | ground wash; must return `bg` unchanged when `bg !== theme.bg` | reference |
| `icon` | `(theme,fg,R) => vnode` | yes | — | the pack mark; also the CTA logo fallback | reference |
| `cams` / `camMul` / `camOff` | array / int / int | yes | — | camera move per beat, strided | reference |
| `mag` | object | yes | — | camera magnitudes | reference |
| `variants` | object | no | — | per-mechanic variant: `{Scroll, Typing, Ring}` | reference |
| `look` | object | yes | — | per-beat appearance; see below | reference |
| `World` | `(theme,t,p,u) => vnode` | yes | — | the background world. Pure; stringified verbatim | reference |
| `typeScale` | enum | no | Default | **NEW.** Compact / Default / Editorial — moves size, measure and leading together | **new** |

## Palette slots (semantic, luminance-ordered)

`bg surface rule inkMuted ink accent accent2 accentInk` — a luminance ladder, so
hue rotation preserves contrast. `margin-notes` ladder: bg .02 / surface .05 /
rule .11 / inkMuted .35 / accent .44 / accent2 .47 / ink .81 / accentInk .01.

## look.<beat> fields

Common: `bg fg hi world top size upper kicker`. Per beat:

- **body** (NEW renderer): `bodySize ch lh weight dim stagger gutter footer` —
  `ch` is the measure in characters (45–75) and passes through `typeScale`.
- **quote** (NEW renderer): `ch lh markSize mark rule altLine`.
- **feature / montage**: `card chips tile tilts` plus **NEW** `swap`
  (`"quote"|"body"` — what an empty media slot becomes) and **NEW**
  `labelsOnly` (type-only comparison tiles) and **NEW** `tile.h`.
- **stats**: `cols num rule glowNums`.
- **cta**: `align btn logoShape`.
- **app**: `cardBg line` — `line` is the **label colour for every interaction
  beat**, not merely a border. Must sit ≥3:1 from `cardBg`.

## Annotated example

`templates/margin-notes.pack-config.js` is the full pilot config with a comment
on every non-obvious field. It is the file `gen-film-skins.js` should read.
