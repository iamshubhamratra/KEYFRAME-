---
name: kinetic-universe
renderer: kinetic-universe
vibe: "A cinematic prompt-to-video launch film in a living cosmos — drifting light beams, a perspective grid and a parallax starfield behind kinetic gradient headlines and floating screenshot frames. Brand color repaints the whole universe. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  ground: "#040509"
  text: "#F2F5FC"
  muted: "#8A8FB5"
  violet: "#7A5AE0"
  cyan: "#22D3EE"
  magenta: "#F0459B"
---

# Kinetic Universe

A **cinematic prompt-to-video launch film** set in a **living cosmos**. A persistent,
continuously-flowing backdrop — drifting light beams, a perspective grid floor, a
parallax starfield and a soft vignette — runs behind every scene and **matches across
every cut**, so the film reads as one unbroken camera move through space rather than a
slideshow. Portrait-native **9:16** for Reels, Shorts and TikTok (it also holds up in
1:1 and 16:9 — all geometry is relative to the stage).

## The universe (persistent, theme-colored)
- **Ground** near-black `#040509`. Nothing is a flat fill: the whole backdrop is painted
  on one canvas as a pure function of time (deterministic, seek-exact).
- **Light beams** — two-to-three large soft radial glows drift slowly in the accent
  hues (violet + cyan by default).
- **Grid floor** — a perspective grid recedes to a vanishing point and scrolls forward.
- **Starfield** — a parallax field of accent-tinted stars streams upward with depth,
  sway and twinkle.
- **Vignette** — darkens the edges back into the ground so content always owns the center.

## Palette — everything is theme-driven
Default accents: **violet** `#7A5AE0` → **cyan** `#22D3EE` → **magenta** `#F0459B`.
`primary` and `secondary` derive the **gradient** (`120deg primary→secondary`), the
card **surface** (`color-mix primary 13% over #0A0C14`), the **border**, the **grid
line** color and the **glow**. Because the whole system is derived from two accents, a
brand color repaints the ENTIRE universe — beams, grid, glows, screen frames, chips,
buttons and gradient headlines — not just the text. Text is `#F2F5FC` with a 64%/34%
dim scale for supporting copy.

## Type
- **Display** Space Grotesk 800, tight (`-0.03em`), often clipped to the accent
  **gradient** (kinetic gradient headlines that pop in word-by-word).
- **Chrome / prompt** JetBrains Mono (the prompt bar, kickers, the CTA URL).
- **Body** Inter, dimmed.

## Motion grammar (three curves)
- **Enter** ease-out — slides and scales into place.
- **Pop** back-out — punchy overshoot reveals (headline words, buttons, the logo mark).
- **Drift** sine — ambient float on screens, chips and the mark.
Every scene fades from and back to pure Cosmos at its edges (opacity 0 at the boundary),
so cuts frame-match. Signature beats: a prompt bar **types** the line and **ignites** a
ring + flash; light streaks **converge** into a shockwave before the headline; screens
**float** in orbit; the logo **assembles** and the wordmark **types** in on the CTA.

## Screenshots & images (intentional slots)
Real screenshots ride in glowing **cosmic device-frames** (`.kf-screen`): rounded,
surface-filled, brand-bordered, with a hero glow shadow and a top sheen.
- **Showcase** — a hero screen (or a small 2–3 panel perspective wall) with the headline
  and feature chips. Portrait screenshots (ratio < 0.9) get a tall phone frame; wider
  shots get a landscape/dashboard card.
- **Discovery** — several screens **scatter and float** around a centered caption.
- With **no** screenshot, a frame shows an intentional branded placeholder (gradient wash
  + faint holographic grid + a glowing node), never a blank box.
- An uploaded **logo** is reserved for the CTA mark (never a wall panel).

## Scene types (chosen per storyboard scene)
`ignition` (opener: prompt bar + ignition), `reveal` (converging streaks + kinetic
gradient headline, for stats/impact), `showcase` (screens + features), `discovery`
(scattered screens), `orbit` (headline + rising feature chips, the bullet default),
`statement` (a single breathing gradient line, for quotes), `cta` (logo reveal + typed
wordmark + gradient button). Any scene count and duration works; the universe is constant.

## Do
- Let the cosmos flow — keep scene content centered inside the safe area (Reels chrome).
- Use the gradient for the hero headline and the CTA; keep body copy in the dim scale.
- Give real screenshots the glowing device-frame; keep the logo for the CTA mark.

## Don't
- Don't add a second full-frame background — the one canvas cosmos is the world.
- Don't hard-code a hex; take every color from the derived theme so brand color carries.
- Don't overfill a portrait frame — a few words per headline, ≤5 chips, ≤3 hero screens.
