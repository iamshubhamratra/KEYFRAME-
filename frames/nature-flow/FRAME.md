---
name: nature-flow
renderer: nature-flow
vibe: "A calm, living-ecosystem film — a soft flowing mesh gradient, drifting glow-waves, a hazy sun, gently falling leaves and a water-ripple base breathe behind serif headlines that bloom and screenshots resting in soft leaf-shaped frames. Brand color repaints the whole ecosystem. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Fraunces"
colors:
  ground: "#0A1F17"
  text: "#F4FAF0"
  muted: "#8FB39F"
  leaf: "#4CAF6E"
  teal: "#2E9E8F"
  cream: "#F3F7EC"
---

# Nature Flow

A **calm, living-ecosystem** film for wellness, eco and organic brands. A persistent,
continuously-**breathing** backdrop — a soft flowing mesh gradient, two slow drifting
glow-waves, a hazy sun with light rays, gently falling leaves and petals, a water-ripple
base with widening rings and a soft vignette — runs behind every scene and **matches
across every cut**, so the film reads as one unbroken, gently-moving natural world rather
than a slideshow. Portrait-native **9:16** for Reels, Shorts and TikTok (it also holds up
in 1:1 and 16:9 — all geometry is relative to the stage).

## The ecosystem (persistent, theme-colored)
- **Ground** deep-organic forest dark `#0A1F17`. Nothing is a flat fill: the whole
  backdrop is painted on one canvas as a pure function of time (deterministic, seek-exact).
- **Flowing gradient** — a soft mesh gradient (bgDeep → deep → mid) tinted by the accent.
- **Glow-waves** — two large soft radial glows drift slowly in the leaf hues.
- **Sun & rays** — a hazy cream sun in the upper corner breathes, casting faint light rays.
- **Leaves** — a seeded field of leaf/petal shapes falls gently and sways sideways.
- **Water** — a ripple base at the foot with widening elliptical rings.
- **Vignette** — softens the edges back into the ground so content owns the center.

## Palette — everything is theme-driven
Default accents: **leaf** `#4CAF6E` → **teal** `#2E9E8F`. The accent tints every forest
dark (`bgDeep` = accent 22% over `#071812`, `deep` = 55% over `#0B1F17`, `mid` = teal 40%
over `#10352A`) and the **leaf highlight** (`leaf2` = accent 60% over cream). Because the
whole system derives from the accents, a brand color repaints the ENTIRE ecosystem —
gradient, glow-waves, leaves, leaf-frames, chips, buttons and the blooming emphasis word
— not just the text. Text is `#F4FAF0` with a 72%/40% dim scale for supporting copy.

## Type
- **Display** Fraunces 600 — an organic optical serif; the last word of a headline
  **blooms** in *italic* leaf-green.
- **Chrome / labels** IBM Plex Mono (kickers, gallery labels, the CTA URL).
- **Body** Inter, dimmed.

## Motion grammar
- **Grow / enter** ease-out & back-out — words and frames settle and gently overshoot in.
- **Sway / drift** sine — ambient float and rotation on leaf-frames, chips and the mark.
- **Bloom** — the sun breathes, the CTA button breathes, headline words bloom word-by-word.
Every scene fades from and back to pure Nature at its edges (opacity 0 at the boundary),
so cuts frame-match.

## Screenshots & images (intentional slots)
Real screenshots rest inside soft-rounded **leaf-shaped organic frames** (`.nf-frame`):
overflow-clipped to an organic radius, leaf-green bordered, with a soft shadow, an overlay
tint and a top sheen.
- **Showcase** — one screenshot blooms in a leaf frame with a caption headline. Portrait
  screenshots (ratio < 0.9) get a tall frame; wider shots get a shorter one.
- **Gallery** — a row of 2–3 leaf-framed angle-views on gentle organic tilts, each with an
  optional mono label from `onScreenText`.
- With **no** screenshot, a frame shows an intentional branded placeholder (flowing
  gradient wash + a soft glowing node), never a blank box.
- An uploaded **logo** is reserved for the CTA mark (never a leaf panel).

## Scene types (chosen per storyboard scene)
`open` (calm serif title blooming over the flow), `statement` (a single serene italic line
that breathes — for quotes / a lone number), `showcase` (a screenshot in a leaf frame +
headline), `bullets` (headline + rising soft feature chips, the bullet default), `gallery`
(a row of leaf-framed shots), `cta` (logo/leaf-badge reveal + typed wordmark + breathing
pill button). Any scene count and duration works; the ecosystem is constant.

## Do
- Let Nature flow — keep scene content centered inside the safe area (Reels chrome).
- Bloom the last headline word in italic leaf-green; keep body copy in the dim scale.
- Give real screenshots the leaf frame; keep the logo for the CTA mark.

## Don't
- Don't add a second full-frame background — the one canvas ecosystem is the world.
- Don't hard-code a hex; take every color from the derived theme so brand color carries.
- Don't overfill a portrait frame — a few words per headline, ≤5 chips, ≤3 gallery shots.
