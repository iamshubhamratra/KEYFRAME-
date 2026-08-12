# Animated video template library

20 self-contained HTML animation templates. Each folder is independent — take
only the ones you need.

Every folder has the same shape:

```
<Template>/
  README.md                  ← how to run, edit copy/timing, swap images, extend
  standalone/<Template>.html ← ONE self-contained file. Open in any browser.
  src/                       ← editable source (entry page + film + vendored runtime)
```

---

## 16:9 landscape (1920×1080)

| Template | Concept | Scenes | Length |
| --- | --- | --- | --- |
| **Momentum** | Kinetic velocity hype — forward-rail HUD, slice-wipes, speed streaks | 8 | ~20s |
| **Fetch** | Playful park — a dog runs a ball to its master | 6 | ~18s |
| **Launch** | Product launch in the park style, dog as mascot | 6 | ~17s |
| **Showcase** | Annotated product tour — arrows, callouts, zoom-ins, cursor | 7 | ~18s |
| **Drive** | Golden-hour highway, product-first with ambient cars | 6 | ~16s |
| **Pipeline** | Assembly line — conveyor, gears, robotic arm, stamping press | 6 | ~17s |
| **Deep** | Bioluminescent deep sea — glowing panels, jellyfish, sonar | 6 | ~17s |
| **Hacker** | Terminal — matrix rain, scanlines, self-typing code | 6 | ~17s |
| **Jungle** | Rainforest — monkey, toucan, tiger; screenshots on signboards | 6 | ~19s |
| **Edition** | Swiss editorial print — modular grid, Anton, figure plates | 6 | ~19s |
| **Fight** | Fight night — arena spotlight, VS layout, KO bursts | 6 | ~19s |
| **Flight** | Aircraft takeoff — runway, rotate, climb with contrail | 6 | ~19s |
| **Orbit** | Rocket launch — starfield, ignition, stage separation | 6 | ~17s |

## 9:16 vertical (1080×1920)

| Template | Concept | Scenes | Length |
| --- | --- | --- | --- |
| **Reel** | Social story — stories bar, kinetic captions, stickers | 6 | ~15s |
| **FetchVertical** | Vertical dog-fetch park story | 6 | ~20s |
| **ShowcaseVertical** | Vertical annotated product tour | 6 | ~15s |
| **FlightVertical** | Vertical takeoff to cruise | 6 | ~18s |
| **Birdsong** | Flat colour blocks, birds and trees, story blocks | 7 | ~13s |
| **Stomp** | Stomp typography office ad — word slams, animated office people | 14 | ~36s |
| **Cadence** | Premium SaaS launch — cursor-driven UI demos, 3D cards | 22 | ~73s |

---

## Quick start

**Preview any template** — open its `standalone/<Name>.html` in a browser.

**Edit a template** — serve its `src/` folder:

```bash
cd <Template>/src
python3 -m http.server 8000
# → http://localhost:8000/<Template>.dc.html
```

**Change copy, timing or scene order** — one JSON line (`window.OM_SCENES`) in
`<Template>.dc.html`. No code changes needed. See that template's README.

**Change speed** — scale the `dur` values in `OM_SCENES`.

**Add your screenshots** — add `"shot": "./assets/your-image.png"` to the relevant
scene entry. Each README lists that template's slots.

---

## How they're built

All 20 share the same architecture:

- **`support.js`** boots the page (vendored, identical across templates)
- **`animations-v2.jsx`** is the timeline engine — `SceneStage`, `useTimeline`,
  `Easing` (vendored, identical)
- **`tweaks-panel.jsx`** is the optional tweaks UI (vendored, identical)
- **`<name>-film.jsx`** is the template itself: motion helpers, reusable pieces,
  one component per scene, and a `MAP` binding scene names to components
- **`<Name>.dc.html`** is the entry page: fonts, resets, `OM_SCENES` data, mount

Because the runtime files are identical, you can dedupe them into one shared
folder if you're integrating several templates — just repoint the `<x-import
from="...">` paths in each `.dc.html`.

Two templates (**Stomp**, **Cadence**) also ship the Organic design system in
`src/_ds/organic/` — a token stylesheet plus component bundle. Their palettes,
type and radii all read from those tokens.

## Dependencies

React 18 + Babel from CDN, fonts from Google Fonts. Swap for local copies if you
need offline builds. The `standalone/` files have everything inlined already.
