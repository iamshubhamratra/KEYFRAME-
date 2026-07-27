---
name: glass-dimension
renderer: glass-dimension
vibe: "A premium glassmorphism depth film — layered frosted-glass panels floating over a soft drifting field of accent light-orbs. Blur, translucency, thin luminous borders and soft inner glow. Titles, stat cards and screenshots all live inside glass. Brand color repaints the whole light field. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  ground: "#0A0A14"
  text: "#FFFFFF"
  muted: "#B6B6C8"
  light-a: "#6366F1"
  light-b: "#EC4899"
  glass: "rgba(255,255,255,0.12)"
---

# Glass Dimension

A **premium glassmorphism** film. Frosted-glass panels float at **layered depth** over a
persistent, continuously-flowing field of **soft accent light-orbs**. The light field runs
behind every scene and **matches across every cut**, so the film reads as one unbroken
drift through depth rather than a slideshow — and it is the light the glass refracts.
Portrait-native **9:16** for Reels, Shorts and TikTok (it also holds up in 1:1 and 16:9 —
all geometry is relative to the stage).

## The light field (persistent, theme-colored)
- **Ground** deep near-black `#0A0A14`. Nothing is a flat fill: the whole backdrop is
  painted on one canvas as a pure function of time (deterministic, seek-exact).
- **Light orbs** — three large soft radial glows in the accent hues (indigo + pink by
  default) drift and pulse slowly. This is the light behind the glass.
- **Refraction grid** — a faint white grid for a sense of surface the glass distorts.
- **Light sweep** — a slow diagonal band of light passes across the field.
- **Glints** — accent-tinted motes float upward and twinkle in the light.
- **Vignette** — darkens the edges back into the ground so content owns the center.

## Palette — everything is theme-driven
Default lights: **A** `#6366F1` → **B** `#EC4899`. The two accents derive the **orbs**, the
**gradient** (`120deg A→B`), the **glass tints** (`color-mix A/B 26–30% over transparent`),
the **borders**, the **glows** and the CTA. Because the whole system is derived from two
accents, a brand color repaints the ENTIRE film — the light behind the glass, the panel
tints, the borders, the glows and the gradient headlines — not just the text. The glass
itself is a fixed translucent-white wash; text is `#FFFFFF` with a 72%/40% dim scale.

## The glass (the signature surface)
Every panel is **frosted glass**: a translucent white gradient wash, a 1px luminous border
(`rgba(255,255,255,0.28)`), a `backdrop-filter: blur`, a soft inner top highlight and a
diagonal brand tint it picks up from the light field, over a deep drop shadow. Headlines,
stat cards, screenshots and the CTA button all live **on or inside** glass surfaces.

## Type
- **Display** Space Grotesk 700–800, tight (`-0.02em`), sometimes clipped to the accent
  **gradient** (blur-up reveals, word-by-word on captions).
- **Chrome / labels** JetBrains Mono (kickers, card tags, the CTA URL).
- **Body** Inter, dimmed.

## Motion grammar
- **Enter** ease-out — panels slide and scale up.
- **Un-blur** — panels resolve from `blur(20–24px)` into focus (the glass "settles").
- **Pop** back-out — punchy overshoot reveals (statement panel, CTA button, logo mark).
- **Drift** sine — ambient float on every glass surface.
Every scene fades from and back to the pure light field at its edges (opacity 0 at the
boundary), so cuts frame-match.

## Screenshots & images (intentional slots)
Real screenshots ride **inside frosted-glass frames** — padded plates with a thin inner
border, floating in the panel.
- **Showcase** — one screenshot in a glass frame with a headline. Portrait screenshots
  (ratio < 0.9) get a tall frame; wider shots get a shorter landscape card.
- **Cards** — glass stat/feature cards, each with a screenshot thumbnail and a label.
- **Gallery** — several glass shots scatter and float at layered depth around a caption.
- With **no** screenshot, a frame shows an intentional branded placeholder (gradient wash
  + faint grid + a glowing node), never a blank box.
- An uploaded **logo** is reserved for the CTA mark (never a glass panel).

## Scene types (chosen per storyboard scene)
`open` (a glass title panel un-blurs into focus), `statement` (a single breathing gradient
line in glass, for quotes), `showcase` (a screenshot floating in a glass frame),
`cards` (glass stat/feature cards with thumbnails, the bullet/stat default),
`gallery` (scattered floating glass shots), `cta` (glass panel: logo reveal + typed
wordmark + bright glass button). Any scene count and duration works; the light field is
constant.

## Do
- Let the light field flow — keep scene content centered inside the safe area (Reels chrome).
- Use the gradient for hero headlines and captions; keep body copy in the dim scale.
- Give real screenshots the frosted-glass frame; keep the logo for the CTA mark.

## Don't
- Don't add a second full-frame background — the one canvas light field is the world.
- Don't hard-code a hex; take every color from the derived theme so brand color carries.
- Don't overfill a portrait panel — a few words per headline, ≤3 cards, ≤5 gallery shots.
