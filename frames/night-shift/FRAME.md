# Night Shift — long-form kinetic-typography film (16:9)

A 5:01, 40-beat looping film for 24h bakery / night city, rendered from its own
original bundle — only the words and the two pictures change. Built for LONG-FORM
video: every beat is a different type animation (~7.5s each), so a 2–5 minute
script never repeats a layout.

## Design system
- Paper `#e8e9f0`, ink `#0d1018`, accent `#f2b03c`, second accent
  `#8c6aff`, tinted grounds `#141c22` / `#1c1620`.
- **Unbounded** display over **Wix Madefor Text** body (bundled in the standalone).
- Brand mark top-left; per-scene garnish layer — rotating corner tag, italic
  footnote, vertical side label or spinning doodle — so no frame reads empty.
- Animated SVG world behind every scene: windows lighting at random, delivery van, sweeping clock.

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
