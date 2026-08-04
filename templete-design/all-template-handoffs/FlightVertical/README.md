# FlightVertical — 9:16 animated template

Vertical takeoff — runway to climb, contrail, cabin-window screenshots, flight-data cards.

**1080x1920 · 6 scenes · ~17.8s**

---

## What's in this folder

```
standalone/FlightVertical.html      ← ONE self-contained file. Open in any browser. No build, no server.
src/
  FlightVertical.dc.html    ← entry page: fonts, resets, scene data (OM_SCENES), mount
  flightvert-film.jsx ← THE TEMPLATE: all scenes + motion code
  animations-v2.jsx     ← timeline engine (SceneStage, useTimeline, Easing) — vendored, don't edit
  tweaks-panel.jsx      ← tweaks UI — vendored, don't edit
  support.js            ← runtime that boots the page — vendored, don't edit
```

**Just want the video?** Use `standalone/FlightVertical.html`.

---

## Running the source

Scripts load over HTTP, so serve the folder — don't double-click:

```bash
cd src
python3 -m http.server 8000
# → http://localhost:8000/FlightVertical.dc.html
```

All paths are relative, so `src/` drops anywhere in your project.

---

## Editing content — no code required

Copy, timing and scene order live in one line of `FlightVertical.dc.html`:

```html
<script>window.OM_SCENES = '[{"name":"...","dur":3.2, ...}]';</script>
```

JSON array, single-quoted (escape literal `'` as `\'`). Per entry:

| Key | What it does |
| --- | --- |
| `name` | Which scene component renders it — must match a key in `MAP` (bottom of `flightvert-film.jsx`) |
| `dur` | Duration in seconds — **this is your speed control** |
| everything else | That scene's copy: `headline`, `body`, `chips`, `stats`, … |

Headlines split on `|` for line breaks: `"headline":"Line one|Line two"`.

**Change speed** — scale every `dur`. Currently ~17.8s; ×0.8 for faster, ×1.25 for slower.
**Reorder / duplicate / delete scenes** — move or remove array entries.
**Rebrand** — edit `window.OM_TWEAKS`. Tweakable: livery, brand name, URL.

### Image slots

takeoff screenshot, phone screen, 3 cruise cards, logo.

Add the key to that scene's JSON entry (`shot`, `shot1`, `shot2`, `logo`, …):

```json
{"name":"...","dur":3.2,"shot":"./assets/screenshot.png"}
```

Without a key you get a labelled dashed placeholder showing what belongs there.

---

## Architecture

`flightvert-film.jsx` is one file: motion helpers at the top (easing, `seg()`, the `M` preset
object), then reusable pieces (media slots, cards, chrome), then one component per
scene, then `MAP` binding scene names to components at the bottom.

Each scene component receives `{ progress, index, count, localTime, scene }` —
`progress` runs 0→1 across that scene, `localTime` is the global clock for
continuous ambient motion.

### Adding a scene

Write a component in `flightvert-film.jsx`, add it to `MAP`, then add an entry to `OM_SCENES`
with a matching `name`.

### Changing aspect ratio

In `flightvert-film.jsx`, find:
```jsx
<window.SceneStage width={1080} height={1920} ...>
```
Layouts use absolute pixel coordinates against that box, so changing it means
repositioning content.

---

## Exporting to video

Open `standalone/FlightVertical.html` and screen-record at 1080×1920, or drive the
timeline programmatically:

```js
const stage = document.querySelector('[data-om-exportable-video-with-duration-secs]');
stage.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame',
  { detail: { time: 5.0, sync: true } }));
```

Seek frame by frame and capture for a deterministic export.

---

## Dependencies

React 18 + Babel load from CDN (see `<head>` of `FlightVertical.dc.html`) — swap for local
copies if you need offline builds. Fonts load from Google Fonts.
`standalone/FlightVertical.html` has everything inlined already.
