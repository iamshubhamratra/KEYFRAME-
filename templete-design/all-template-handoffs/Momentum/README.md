# Momentum — 16:9 animated template

Kinetic velocity hype film — forward-rail HUD, accent slice-wipes, speed streaks, pumping chevrons.

**1920x1080 · 8 scenes · ~19.9s**

---

## What's in this folder

```
standalone/Momentum.html      ← ONE self-contained file. Open in any browser. No build, no server.
src/
  Momentum.dc.html          ← entry page: fonts, resets, scene data (OM_SCENES), mount
  momentum-film.jsx   ← THE TEMPLATE: all scenes + motion code
  animations-v2.jsx     ← timeline engine (SceneStage, useTimeline, Easing) — vendored, don't edit
  tweaks-panel.jsx      ← tweaks UI — vendored, don't edit
  support.js            ← runtime that boots the page — vendored, don't edit
```

**Just want the video?** Use `standalone/Momentum.html`.

---

## Running the source

Scripts load over HTTP, so serve the folder — don't double-click:

```bash
cd src
python3 -m http.server 8000
# → http://localhost:8000/Momentum.dc.html
```

All paths are relative, so `src/` drops anywhere in your project.

---

## Editing content — no code required

Copy, timing and scene order live in one line of `Momentum.dc.html`:

```html
<script>window.OM_SCENES = '[{"name":"...","dur":3.2, ...}]';</script>
```

JSON array, single-quoted (escape literal `'` as `\'`). Per entry:

| Key | What it does |
| --- | --- |
| `name` | Which scene component renders it — must match a key in `MAP` (bottom of `momentum-film.jsx`) |
| `dur` | Duration in seconds — **this is your speed control** |
| everything else | That scene's copy: `headline`, `body`, `chips`, `stats`, … |

Headlines split on `|` for line breaks: `"headline":"Line one|Line two"`.

**Change speed** — scale every `dur`. Currently ~19.9s; ×0.8 for faster, ×1.25 for slower.
**Reorder / duplicate / delete scenes** — move or remove array entries.
**Rebrand** — edit `window.OM_TWEAKS`. Tweakable: accent, brand name, URL, ground (Graphite/Midnight/Ink).

### Image slots

logo, desktop screenshot, phone screen, product photo, dashboard shot.

Add the key to that scene's JSON entry (`shot`, `shot1`, `shot2`, `logo`, …):

```json
{"name":"...","dur":3.2,"shot":"./assets/screenshot.png"}
```

Without a key you get a labelled dashed placeholder showing what belongs there.

---

## Architecture

`momentum-film.jsx` is one file: motion helpers at the top (easing, `seg()`, the `M` preset
object), then reusable pieces (media slots, cards, chrome), then one component per
scene, then `MAP` binding scene names to components at the bottom.

Each scene component receives `{ progress, index, count, localTime, scene }` —
`progress` runs 0→1 across that scene, `localTime` is the global clock for
continuous ambient motion.

### Adding a scene

Write a component in `momentum-film.jsx`, add it to `MAP`, then add an entry to `OM_SCENES`
with a matching `name`.

### Changing aspect ratio

In `momentum-film.jsx`, find:
```jsx
<window.SceneStage width={1920} height={1080} ...>
```
Layouts use absolute pixel coordinates against that box, so changing it means
repositioning content.

---

## Exporting to video

Open `standalone/Momentum.html` and screen-record at 1920×1080, or drive the
timeline programmatically:

```js
const stage = document.querySelector('[data-om-exportable-video-with-duration-secs]');
stage.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame',
  { detail: { time: 5.0, sync: true } }));
```

Seek frame by frame and capture for a deterministic export.

---

## Dependencies

React 18 + Babel load from CDN (see `<head>` of `Momentum.dc.html`) — swap for local
copies if you need offline builds. Fonts load from Google Fonts.
`standalone/Momentum.html` has everything inlined already.
