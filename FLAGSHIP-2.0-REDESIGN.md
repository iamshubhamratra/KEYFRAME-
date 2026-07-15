# Flagship 2.0 — Product-Showcase Redesign (DARK, final)

> Complete audit + redesign of the Flagship video template into a **cinematic,
> product-showcase** launch film. Positioning (chosen with the user): **product/
> screenshot-showcase cinematic**, distinct from `brightlife` (abstract graphical-motion).
>
> **Direction note:** this was first shipped BRIGHT (v3), but flagship then read too
> similar to the already-bright `brightlife`, so the user asked to push flagship to the
> **DARKER side** and make the two unique. Final = **v4 DARK** — a deep near-black indigo
> cinematic stage (Linear / Vercel / Raycast dark register) with **bright dashboard
> panels that GLOW against the dark** (higher contrast = a better screenshot showcase).
> The two packs now differ on two axes: **flagship = dark + product-showcase;
> brightlife = bright + abstract-motion.** Everything below is the shared design system;
> where it says a token/blend, the current DARK values are in §2. Implemented in
> `server/src/services/flagship_composer.js` + `frames/flagship/pack.json`.

---

## 1. Audit of the previous flagship (v2, dark)

| Area | Finding (grounded in code) |
|---|---|
| Background | Dark by construction — ground `#07080F`, `FogExp2`, indigo aurora shader, dark `GridHelper`. Everything downstream (bloom, glass, contrast) depended on the near-black stage. |
| Bloom | **Selective `UnrealBloomPass`** (strength 0.9) via a 2-composer darken/restore trick — only meaningful *because* the ground is black. Costly (two render targets/frame). |
| Typography | Slate-on-dark; heavy dark text-shadows; emphasis gradient *lightened toward white* (only works on dark). Readable but muddy in places. |
| Screenshots | Existed as **dark glass plates** (`makePlate`), modest size, competing with bloom/particles for attention. Generated dark UI fallback (`uiTexture`). |
| Three.js | `aurora + grid + 200 bokeh + light-streaks` — ambient **decoration**, disconnected from the product story. |
| Camera | Real dolly/parallax/orbit rig, but gentle; low motion density between beats. |
| Net | A competent *dark SaaS demo*, not a bright premium launch experience. |

**Verdict:** the darkness was structural, not a color tweak — bright required removing bloom and rebuilding glow/lift from shadows + matte gradients (the lesson proven on the `brightlife` redesign).

---

## 2. New design system (Flagship 2.0)

### Color (v4 DARK — current)
| Token | Value | Use |
|---|---|---|
| ground | `#0A0B16` | dark cinematic stage |
| ground-2 | `#05060C` | deeper |
| surface / edge | `#04050A` (edge = ground×0.45) | cinematic vignette |
| ink | `#F6F8FF` | headlines (white) |
| body | `#AEB6D4` | subtext |
| dim | `#7A82A0` | supporting/chrome |
| hair | `rgba(255,255,255,0.12)` | dark-glass borders |
| accents | `#7C8CFF` indigo · `#4ED7FF` cyan · `#B16CFF` violet · `#57F2C2` mint | glowing graphics/data-viz |
| **panel palette (fixed light)** | white `#FFFFFF` card · `#0F172A` ink · `#E2E8F0` hair | the BRIGHT dashboard panels that pop on the dark stage |

**Contrast law:** accent **text** is auto-lightened toward white until it clears a legibility FLOOR on the dark stage (`ensureBright`); emphasis headline words use a BRIGHT cyan-forward gradient (near-white → bright brand) with a glow `drop-shadow`. The **product panels stay bright** (a fixed light palette, decoupled from the dark theme) so screenshots read at full contrast against the dark.

### Typography
**Reality check:** the brief's Clash Display / Cabinet Grotesk / General Sans / Satoshi / Plus Jakarta Sans are **not bundled**, can't load in the offline headless renderer, and *naming* them in CSS fails the `font_family_without_font_face` lint gate. So type becomes a "visual element" through **weight/scale/tracking/gradient** on the bundled faces: **Space Grotesk** display (700/800), **Inter** body, **JetBrains Mono** chrome. Hero headlines up to ~150px @720p, `-0.03em` tracking, an editorial wallpaper numeral behind interior scenes.

### Motion layers (every scene)
1. **Hero** — the product panel (screenshot / bright UI) reveal + parallax bob.
2. **Supporting** — the growth graph-line drawing on + pulsing data dots; kinetic headline reveal.
3. **Ambient** — soft orb sprites drifting; feature-panel counter-parallax.
4. **Background** — the mesh-gradient environment drifting + data-waves flowing + camera always in motion (handheld micro-motion guarantees nothing is ever perfectly still).

### Three.js architecture (purposeful, not decorative) — v4 DARK
- **Nebula environment** — a shader plane starting from the dark ground, mixing BRIGHT accent blobs (a glowing nebula) + a deep edge-vignette. Always drifting.
- **Data-waves** — 3 stacked bright gradient ribbons (traveling sum-of-sines + flow highlight), `AdditiveBlending` so they **glow** on the dark, upper-back — flowing product data.
- **Growth graph-line** — ONE crisp bright accent line (`TubeGeometry` + `setDrawRange`) that **rises and draws on during solution/benefits**, with an additive glowing area + pulsing data dots. The product's "up-and-to-the-right" — the signature purposeful graphic.
- **Orb sprites** — accent radial-gradient glow via `AdditiveBlending` (glow on dark = additive sprites + the panel glow-halos, still **no bloom** — a single `renderer.render` per frame).
- **Grid floor** — faint accent lines for tech depth.

### Screenshot showcase system
The hero. `makePlate` builds a **bright floating dashboard panel that pops on the dark stage**: an **accent GLOW halo** behind it (additive sprite — sells the lift on dark, where a drop-shadow would vanish) → a white **device frame** CanvasTexture (rounded card + light border + header bar with traffic lights + url pill) → the **content** (real screenshot via `TextureLoader`, or a generated **bright** UI: dashboard / donut / kanban / activity / table / bars). Panels are **big** (`w` 6.4 hero / 3.2 feature / 3.8 side) so screenshots occupy ~40–60% of frame, tilt in perspective, and the hero adds a **small floating accent card** in front for layered-screen depth. The panels use a fixed LIGHT palette regardless of the dark stage.

---

## 3. Scene-by-scene (6-act grammar)

| Scene | Treatment | Build |
|---|---|---|
| 1 | **hook** | Pure big type over the mesh-gradient; camera dollies in from 13.5→8.4; waves + graph intro carry motion. Capture in <2s. |
| 2 | **problem** | Two small **fragmented** cards (tilted, offset) visualize silos/friction; camera pans across; "scattered" emphasis. |
| 3 | **solution** | **Hero product reveal** — one big bright dashboard panel + floating accent card; camera **dolly-in** (11→6.6) with a focus feel; the graph-line draws on. The memorable moment. |
| 4 | **features** | Three bright feature panels fanned in perspective (donut/kanban/activity); camera **orbits** across the row. |
| 5 | **benefits** | Huge gradient **counter metric** (e.g. `10x`) + a bars panel + the graph-line held at full; camera eases in. |
| 6 | **cta** | Emotional close — brand headline, CTA, camera **pulls back** (5.4→12) as the film resolves. |

## 4. Camera choreography
Per-treatment rig (`cameraFor`): **hook** push-in · **problem** lateral pan · **solution** dolly-in on the hero · **features** orbit-across · **benefits** ease-in · **cta** pull-back — all layered over seeded handheld micro-motion (pure fn of time). `expoOut` on the signature push/pull moves.

## 5. Asset-placement rules
`assignPlates`: solution→1 hero (big) · features→3 (real screenshots first, generated bright UI fills the rest) · benefits→1 side + graph · problem→2 fragments · cta→1 if spare. Real website/curated/vision-approved screenshots rank first; a scene never renders an empty panel (generated bright UI backstops).

## 6. Quality-scoring framework (reject rules, from the brief)
A scene fails if it: reads dark · has low type contrast (< the readable-on-light floor) · shows a static screenshot (panels must reveal + parallax) · has a static beat (the continuous-motion layer must be present) · leaves large empty space (every scene carries hero+supporting+ambient+bg layers) · uses a generic fade-only transition · reads like a slide. The composer is built so these are structurally satisfied.

---

## 7. Engineering / determinism
Same envelope (`buildComposition -> {indexHtml, metaJson}`), single paused GSAP timeline on `window.__timelines["vid"]`, `render3d(tl.time())` per frame. Seeded `mulberry32`; every per-frame value a pure fn of time; **build-time values inject via `${...}` only** (never `"+var+"`, which ships a literal and blanks the render). QA/repair is skipped for it (native deterministic composer, per `graph.js`).

**Verified 2026-07-15:** 1280×720 draft, **0 lint errors** (only the benign `studio_missing_editable_id` / `gsap_studio_edit_blocked` / `composition_file_too_large` warnings). Renders ~32s (12s film) / ~56s (18s film). Contact sheets confirm: bright airy stage, slate type popping on white with violet gradient emphasis, big bright dashboard panels (generated UI **and** verified real-screenshot loading), fragmented-card problem scene, perspective feature fan, `10x` counter, pull-back CTA. No dark, no voids.

## 8. Roadmap (further polish)
- **P1** — make the growth graph-line more prominent during solution/benefits (thicker/brighter draw-on); add a subtle animated cursor/tooltip on the hero panel.
- **P1** — per-scene mesh-gradient tint (cooler on problem, warmer on cta) for emotional pacing.
- **P2** — device-mockup variants (phone frame for portrait screenshots; laptop lid for hero).
- **P2** — a light-sweep specular pass across panels on reveal (bright equivalent of a shine).
- **P3** — data-driven graph-line (derive the curve from the scene's real metric when present).

*Generated 2026-07-15 on branch `Rohit`. Implementation: `flagship_composer.js` v3 + `frames/flagship/pack.json`.*
