# Chalk & Crimp — long-form kinetic-typography film (16:9)

A 5:01, 40-beat looping film for climbing, rendered from its own
original bundle — only the words and the two pictures change. Built for LONG-FORM
video: every beat is a different type animation (~7.5s each), so a 2–5 minute
script never repeats a layout.

## Design system
- Paper `#f2f2ee`, ink `#1b1e22`, accent `#ff8a3d`, second accent
  `#3d7bff`, tinted grounds `#e6ecec` / `#f7e6d8`.
- **Bebas Neue** display over **Instrument Sans** body (bundled in the standalone).
- Brand mark top-left; per-scene garnish layer — rotating corner tag, italic
  footnote, vertical side label or spinning doodle — so no frame reads empty.
- Animated SVG world behind every scene: holds popping in sequence, chalk puff, swinging rope.

## Shape vocabulary (40 authored beats)
Drawn from the kit's 74 scene renderers with no name repeating inside the film —
letter-level (Open, Rain, Spiral, Wave…), word-level (Problem, Marker, Magnet…),
line/block (Wilt, Curtain, Cards…), data (Counts, Ladder, Gauge, Plans…), the FX
set (NeonSign, Glitch, FlipCube, Ticker3D, Kaleido, Spotlight…) and the
bookends (Kit chapter cards, Peek image card, QA, Join CTA). Slot keys include
kicker/title/sub/lines/steps/stats/items/words/pairs/rows/q&a/plans — text-first;
`image` appears twice (a mid-film setup card and the CTA logo).

## Casting notes
- 16:9 only (`portraitNative: false`); it is a LONG FORM gallery entry
  (`longForm: true`) and must not be rerouted to scene-kit past 75s
  (`longFormOk: true` — honoured per-pack by the pipeline).
- Copy law: `title` is the primary slot (kit convention) — the adapter maps it
  from the beat's own line.
- The engine caps the scene list at 50 entries and the serialized scenes string
  at 16KB; the adapter's `__kfplate__` sentinel keeps the branded fill plate out
  of that budget.
