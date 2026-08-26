# Chalk Circle — long-form kinetic-typography film (16:9)

A 5:06, 45-beat looping film for children's outdoor play, rendered from its own
original bundle — only the words and the two pictures change. Built for LONG-FORM
video: every beat is a different type animation (~6.8s each), so a 2–5 minute
script never repeats a layout.

## Design system
- Paper `#fdf6e8`, ink `#26282f`, accent `#f0523c`, second accent
  `#2f9ad0`, tinted grounds `#e4f0ee` / `#fde4d6`.
- **Grandstander** display over **Nunito** body (bundled in the standalone).
- Brand mark top-left; per-scene garnish layer — rotating corner tag, italic
  footnote, vertical side label or spinning doodle — so no frame reads empty.
- Animated SVG world behind every scene: hopscotch squares lighting in sequence, a skipping rope arcing, a bouncing ball, a swaying swing.

## Shape vocabulary (45 authored beats)
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
