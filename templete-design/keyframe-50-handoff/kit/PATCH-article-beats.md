# PATCH — article beats for `film-kit.js`

Ready to merge into `keyframe-handoff/source/film-kit.js`. Seven changes, all
additive: every existing pack renders identically without touching its config.
`gen-film-skins.js` needs no change — the new fields are config data, and
`palette` / `icon` / `World` still cross verbatim.

## 1. Type scale (`typeScale` tweak)

Inserted after `const col = …` inside `make(cfg)`:

```js
const SCALES = { Compact: {s:0.9, m:0.88, lh:0.96}, Default: {s:1, m:1, lh:1}, Editorial: {s:1.1, m:1.12, lh:1.06} };
let SCALE = SCALES.Default;
const sz = (n) => Math.round(n * SCALE.s);
const measure = (ch) => Math.round((ch || 62) * SCALE.m);
```

`Root` resolves it before any scene renders, so it is never playhead-dependent:

```js
theme.typeScale = t.typeScale || cfg.typeScale || "Default";
SCALE = SCALES[theme.typeScale] || SCALES.Default;
```

`Title` now uses `sz(size)` and `(cfg.titleLine || 1.04) * SCALE.lh`. One radio
was added to the tweaks panel under a new **Type** section.

Size, measure and leading move together — Compact is for long articles, Editorial
for short ones with big pull quotes.

## 2. `Body` renderer — the article workhorse

`look.body` keys: `bg fg hi world top size bodySize ch lh weight dim kicker
stagger gutter footer`.

- `ch` is the measure **in characters** (45–75); it passes through the type scale
  and is capped by the padded column, so it can never overflow.
- Entrance is a word cascade computed from `PACE(progress)` — a seek to any
  timestamp reproduces the same partially revealed paragraph.
- Optional mono gutter (the beat number, or `scene.mark`) and a bottom
  progress footer (`nn / NN`) — set `gutter:false` / `footer:false` to drop them.
- Scene fields: `body` (falls back to `sub`), optional `kicker`, `title`, `note`, `mark`.

## 3. `Quote` renderer — the expressive beat

`look.quote` keys: `bg fg hi world top size ch lh markSize mark rule altLine`.

Lines break on the authored `|`, each revealed by a `clip-path` mask wipe;
optional oversized quote mark and a left accent rule; `scene.attrib` sets the
attribution. Scene fields: `quote`, `attrib` (falls back to `sub`).

Both are registered in `SCENE_MAP` as `Body` and `Quote`.

## 4. `look.<beat>.swap` — the collapsing media slot

On `Feature` and `Montage`. When the slot comes back empty the beat renders as
the pack's declared swap beat (`"quote"` or `"body"`) instead of a dashed
placeholder. The borrowed line comes from `swapMap()`, a pure function of the
whole authored scene list computed once — **not** from the playhead, so a seek
can never change which line a beat shows.

Precedence: `scene.fallbackText` → `scene.quote` / `body` / `sub` → the nearest
neighbour's `fallbackText` / `sub` that no other swap has claimed.

## 5. `look.<beat>.labelsOnly`

Per-beat equivalent of the global `cfg.media === false`. Lets one pack keep a
real media slot on `Feature` while `Montage` runs as a type-only comparison
beat. `look.montage.tile.h` and `tile.labelSize` now size those tiles.

## 6. CTA logo fallback

An empty `logo` slot renders the pack's own `icon` mark in a filled badge
instead of a dashed box. Nothing in the film ever shows an authoring
placeholder to a viewer.

`cfg.chrome === false` hides the persistent template lockup (badge + brand
name) on every beat, so a generated video carries only the user's own content.
Packs that omit the flag keep the lockup exactly as before.

## Interaction-variant constraints for article packs

- `Scroll: "ticker"` is a horizontal marquee sized for short chips. An article
  list beat (six four-word entries at 9:16) clips at both frame edges, and the
  variant derives its own item count, which then contradicts the script. Use
  `board` or `feed` for list beats; never `ticker` in this set.
- `Scroll: "stack"` deals one card at a time — with six list items across 8.5s
  most of the list is never legibly on screen. Also unsuitable for article list
  beats; keep it for single-item reveals.
- **`look.app.line` is the label colour for every interaction beat** (Scroll,
  Typing, Ring), not just a border. Point it at a ramp step at least 3:1 from
  `app.cardBg` — `inkMuted` in these packs. Pointing it at `rule` (the hairline
  step) renders the whole list at ~1.4:1 on both light and dark grounds.
- `Ring` has three variants against five packs per cohort, so per-value
  uniqueness is impossible. The rule applied instead: **the triple**
  (Scroll, Typing, Ring) is unique per pack. Cohort 01 —
  01 board/terminal/gauge, 02 feed/typewriter/bar, 03 board/caret/ring,
  04 board/hand/ring, 05 feed/caret/gauge.

## 9. Nothing else changed

No renderer was removed or renamed, no existing `look` key changed meaning, and
`Hook / Statement / Feature / Montage / Stats / CTA` plus the ten interaction
beats behave exactly as before when the new keys are absent.

## Verification

- `node scripts/lint-reading-budget.js "Margin Notes.dc.html" --overlay` — every
  beat clears 225 wpm + 1.2s land.
- Determinism: no `Math.random`, `Date.now` or `performance.now` in the patch;
  every value derives from `progress`, the scene list, or the tweak state.
- Scrub backwards through `Margin Notes.dc.html`: each timestamp renders the
  same frame it did on the forward pass.
