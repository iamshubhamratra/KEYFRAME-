# Hyperframe Design Principles — extracted from the `templete-design` frame packs, applied to the Flagship template

> Analysis of the 6 premium frame-pack design systems in `templete-design/`
> (bold-poster, broadside, cartesian, cobalt-grid, coral, creative-mode) → the
> reusable design DNA → the typography / color / layout / motion frameworks →
> how it is folded into the **Flagship** cinematic Three.js template.

---

## 1. What the 6 packs are

All six are **type-forward editorial poster systems** — print-inspired (Italian sports magazine, Wim Crouwel grid, museum catalogue, WIRED riso monograph, Saul-Bass travel poster, punk zine). Each ships a `FRAME.md` (tokens + prose law) and a `frame-showcase.html` (reference render). They are *light* editorial, not dark/3D — but their **DNA is aesthetic-agnostic** and is the real prize.

| Pack | Display face | Body / chrome | Accent | Signature move |
|---|---|---|---|---|
| bold-poster | Shrikhand (tilted) | Libre Baskerville + Space Grotesk | `#D8000F` red | stacked "stamped" text-shadow, −6° tilt, red progress bar |
| broadside | Barlow 900 **lowercase** | IBM Plex Mono | `#E85D26` orange | 13cqw lowercase word as primitive, 1.0/0.5/0.22 fade ladder |
| cartesian | Playfair Display 400 | Inter | taupe (no hue) | 1px hairlines only, compass rings, 55–60% silence |
| cobalt-grid | Newsreader 400 | Hanken + DM Mono | `#1F2BE0` cobalt | permanent 10% graph grid, pixel-glitch, QR mosaic |
| coral | Bebas Neue (tracked caps) | Inter | `#E85D5D` coral | hard region-edge splits, 6% hatch, wallpaper numeral |
| creative-mode | Archivo Black (lh 0.92) | JetBrains Mono + Space Grotesk | rationed green/pink/orange | one hard offset shadow, −6° stamp, 999px pill |

---

## 2. The shared DNA (the "Hyperframe Principles")

Every pack independently converges on these — this is the platform's design foundation:

1. **Scale IS hierarchy.** One display face pushed *huge* (8–22cqw). Hierarchy from size + type contrast, **never weight or a second color**. One focal element **3–6× its neighbors** ("squint test").
2. **Fit-to-measure.** Word count sets size: **≤3 words → biggest display, 4–6 → medium, 7+ → smallest.** Legibility floor **≥1.4cqw**; block cap **≤78cqw**.
3. **One display moment per frame.** Never two hero elements competing.
4. **Negative space is the luxury signal.** Declarative frames are **40–60% intentionally empty**.
5. **Type pairing = display + body + MONO chrome.** A characterful display, a clean sans body, and a **mono face for chrome** (kickers, counters, labels) — uppercase, tracked wide (**0.14–0.16em**). Display is negative-tracked (**−0.02 to −0.04em**).
6. **Restraint in color.** **One accent** (or 2–3 rationed), warm neutrals (never pure white/black), and the **"ink-on-fire" law** — headlines are ink on the accent ground, never gray/white.
7. **Flat by default; signature gestures are scarce.** No shadow/gradient/rounded-rect except **one** deliberate craft gesture per system (a stamped shadow, a −6° tilt, a wallpaper numeral, a progress bar).
8. **System furniture.** A persistent eyebrow/kicker + page counter + hairline rules + a grid/texture = the "designed system" tell.
9. **Sparse rule, one dense exception.** Most frames are sparse; exactly **one** data/stats/index frame is deliberately dense (repetition, not clutter).
10. **cqw authoring at 1920×1080** with `container-type:size` — resolution-independent type.

---

## 3. Frameworks (reusable across the video engine)

### Typography framework
- **Roles:** `display` (characterful, negative-tracked), `body` (clean sans, lh 1.5–1.7), `chrome` (mono, uppercase, 0.14–0.16em).
- **Recommended pairings by product type:**
  - **SaaS / premium (flagship):** Space Grotesk display + Inter body + JetBrains Mono chrome.
  - **AI / futuristic:** Space Grotesk / Bricolage display + Inter + JetBrains Mono.
  - **Startup launch:** Archivo Black / Anton display + Space Grotesk body + JetBrains Mono.
  - **Editorial / elegant:** Fraunces / Instrument Serif display + Inter + IBM Plex Mono.
- **Scale:** fit-to-measure multiplier (≤3 words ×1.16, 4–6 ×1.0, 7+ ×0.8). Display lh ~0.95–1.02; body lh 1.5.
- **All bundled** (offline @font-face data-URI) in `server/src/fonts/pack_fonts.js`: Space Grotesk, Archivo Black, Anton, Bricolage Grotesque, Fraunces, Instrument Serif, JetBrains Mono, IBM Plex Mono.

### Color framework
- **Dark cinematic (flagship):** deep indigo ground `#07080F`, aurora accents indigo `#6E8BFF` / cyan `#4ED7FF` / violet `#B16CFF` / mint `#57F2C2`, white ink `#F6F8FF`. Gradient emphasis on the accent; everything else restrained.
- **Premium light:** warm cream ground (`#F0ECE5`/`#EFE9D9`/`#F5F0E8`), warm ink (`#1C1410`/`#0F0F0F`), one saturated accent.
- **Law:** one accent does the focusing; neutrals are warm and *chosen*; contrast is deliberate (ink-on-fire); ≤2–3 accents ever.

### Layout framework (→ video scene layouts)
- 12-region composition, cqw units, generous pad (5–7cqw), one focal per scene, 40–60% negative space, one dense "data" frame permitted.
- Patterns → scenes: **hero → intro**, **feature grid → staggered showcase**, **dashboard → product reveal**, **stats → animated metrics**, **CTA → cinematic close**.

### Motion framework (packs mark motion out-of-scope → we originate it)
- **Premium range:** 280–660ms, ease-out, **staggered** (one element enters at a time).
- **Animate the identity element**, not a generic slide — a ring draws, a hairline extends, a word rises with a blur, a numeral counts up, the camera dollies.
- **Weight/opacity/scale as channels** over raw translation (broadside's 1.0/0.5/0.22 ladder; cartesian's slow reveals).

---

## 4. Web design → video design (the translation)

| Web pattern | Video scene | How the flagship does it |
|---|---|---|
| Hero section | **Intro / hook** | Big fit-to-measure headline over the aurora field, mono kicker + rule stub, slow camera push-in. |
| Feature grid | **Feature showcase** | A staggered *cluster* of glass device plates at varied depth, camera parallax pan. |
| Dashboard layout | **Product reveal** | The hero screenshot on a large glass device plate (browser chrome), camera dolly-in + bloom rim. |
| Statistics section | **Animated metrics** | Space Grotesk count-up numeral + label, faint wallpaper numeral for depth. |
| CTA section | **Cinematic close** | Brand/tagline centered, camera pull-back, particles settle, progress rule completes. |

---

## 5. How the Flagship applies all of this

`server/src/services/flagship_composer.js` + `frames/flagship/` (pack.json + FRAME.md, `renderer:"three-flagship"`):

- **Scale-is-hierarchy + fit-to-measure** — headline size scales by word count; one display moment per scene.
- **Mono chrome** — kicker is JetBrains Mono, uppercase, 0.16em, with a short accent **rule stub** (not a pill).
- **System furniture** — a persistent mono **catalogue label** (bottom-left) + live **scene counter "01 / 06"** (bottom-right) + a thin **accent progress rule** that grows with the timeline.
- **Signature gesture** — a faint **wallpaper index numeral** ("02", 6% opacity) behind interior headlines.
- **Negative space + one focal** — scenes stay ~50% empty; the plate or the type dominates, never both.
- **Color restraint** — one aurora accent family; gradient emphasis on the accent word; ink-on-dark contrast on a scrim.
- **Motion** — 0.3–0.9s staggered word reveals (blur-rise), count-up metrics, and camera-driven transitions (push-in / dolly / parallax / pull-back), not slides.
- **The 3D layer the packs can't give** — aurora-gradient depth, glass device plates presenting real screenshots with parallax, ACES tone-mapping + soft bloom, fog depth.

Verified: renders a real 1920×1080 MP4, passes hyperframes lint, and reads as a Linear/Vercel-tier launch film (contact sheet reviewed).

---

## 6. Quality scoring system (per-frame, 0–100)

Score each rendered frame; ship-quality ≥ 80. (The pipeline's contrast gate + Creative Director already enforce several of these.)

| Dimension | Weight | Pass test |
|---|---|---|
| Typography | 20 | One display moment; fit-to-measure; ≥1.4cqw; mono chrome present |
| Hierarchy | 15 | One focal at 3–6×; squint test passes |
| Negative space | 10 | 40–60% empty on declarative frames; not crowded, not barren |
| Color restraint | 10 | ≤2–3 accents; ink-on-fire contrast; WCAG AA text |
| Asset presentation | 15 | Screenshots on glass, aspect-correct, never stretched/tiny |
| Motion | 15 | Staggered, identity-driven, 280–660ms, camera guides the eye |
| Depth / craft | 10 | Real parallax layers; a scarce signature gesture present |
| Consistency | 5 | System furniture + palette consistent across all frames |

---

## 7. Roadmap

- **Now (done):** flagship pack + composer + routing; editorial-DNA typography/chrome; render verified.
- **Next:** light-mode variant token; a `preview.mp4` + poster for the UI carousel; per-scene bloom tuning; rounded-corner screenshot textures (canvas clip) for a softer device look.
- **Later:** promote the Template Spec (from `ASSET-PIPELINE-IMPROVEMENT-PLAN.md`) so every pack declares `renderer` + these framework tokens, and generate more templates behind the quality-scoring gate above.
