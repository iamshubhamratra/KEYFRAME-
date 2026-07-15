# Paper Tales

A **pop-up storybook**. A native GSAP + SVG/CSS composition (renderer `paper-tales` →
`server/src/services/paper_tales_composer.js`), a sibling of the blueprint / bloom-fable /
bauhaus-riot / terminal-departures native composers.

## Look
The whole film lives inside ONE physical book on a soft desk. Cream paper (`#FFF9F0`),
muted plum ink (`#6B5B73`), and dusty-rose / sky / mint / lilac / butter pastels. Set in
**Fraunces** (bundled serif; the "hand" lines are Fraunces *italic* for a warm handwritten
voice — Quicksand/Caveat from the source aren't bundled and can't load offline).

## Signature grammar (all hand-built, deterministic)
- **3D page turns** — a two-faced leaf rotates about the spine between chapters, with a
  brightness dip at the edge-on moment.
- **Pop-up fold-ups** — each scene's illustration `rotateX`-folds up from the page crease
  with a cast shadow (`popUp`).
- **Pen handwriting** — the chapter line reveals left→right via `clip-path` while a paper
  pen nib travels the same span (`penWrite`).
- Paper friends that **blink**, watercolour blooms, a spinning paper sun, drifting clouds,
  confetti, a swinging ribbon bookmark.

## Scene grammar (storyboard scene → spread)
- **cover** (scene 0 / hook) — the closed book cover: title, "open me", a paper sun.
- **chapter** (default) — a spread: chapter tab + tinted headline + a pen-written line on
  one page, a pop-up illustration (bulb / star / house / heart) on the other (layout alternates).
- **friends** (team / people scenes) — a row of paper friends that fold up, bounce and blink.
- **paint** (create / build / world scenes) — watercolour blooms + a paper sun + a house pop-up.
- **stat** (number scenes) — a big storybook number counts up on a pop-up card.
- **screen** (any middle scene with a real screenshot/photo) — a pop-up paper **CINEMA**
  showing the screenshot (with a shine sweep); a paper filmstrip plays when there's none.
- **end** (last / cta) — "The End" + the brand mark + a CTA sticker + a swinging ribbon.

## Screenshots / images
Real website screenshots or curated/vision-approved photos (`screenOk`) play inside the
pop-up paper cinema. A screenshot pinned to a scene claims it; leftover images turn a plain
mid-story chapter into a cinema spread. `object-fit:cover` (top).

## Engineering contract
Identical to the other native composers: one paused GSAP timeline on
`window.__timelines["vid"]`; direct-child `.clip` scenes on unique tracks; a boundary
`opacity:0` hard-kill per scene (the desk/book persists behind); ONE seek-safe caption node;
finite repeats; cqw units + `container-type:size`; hidden = `opacity:0` only. Deterministic —
initial off-screen transforms use `gsap.set` (never an inline `translate`) so they don't
sum with the tween channel. Passes `hyperframes lint` with 0 errors.

## Iterate
`node server/scripts/paper-tales-harness.js jobs/_pttest 1280 720 shot` →
`cd jobs/_pttest && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2`.
`paper-tales` is opt-in (`framePack:"paper-tales"`), not the auto-default.
