# Terminal Departures

An **airport departures hall for films**. A native GSAP + SVG/CSS composition
(renderer `terminal-departures` → `server/src/services/terminal_departures_composer.js`),
a sibling of the blueprint / bloom-fable / bauhaus-riot native composers.

## Look
Dark FIDS terminal: dim slate ground, a light sweep across the concourse, a soft
vignette, a masthead + an **analog clock whose second hand laps the whole film**, and
a scrolling **yellow ticker band** along the floor. Warm amber (`#FFC61A`) + ivory
(`#F2EEE3`) over near-black, with green/red/cyan status accents. Space Grotesk display,
IBM Plex Mono chrome (both bundled — no network fonts).

## Signature motion — the split-flap board
Every headline arrives on a **Solari split-flap board**: characters mechanically cycle
through intermediate glyphs with a scaleY "clack" squash per swap, landing on the
target letter. The cycling is **seeded and deterministic** (no `Math.random`, no `Date`),
so it renders identically every pass.

## Scene grammar (storyboard scene → airport scene-type)
- **hook** (scene 0 / `hook`/`title`) — split-flap hero (two lines, line 2 gold) + a
  paper plane that flies its dashed route.
- **board** (bullets / how / feature) — a live **departures board**, each destination a
  flap row with an ON TIME / BOARDING status.
- **signs** (numbers / `stat`/`chart`) — up to three **hanging gate signs** that swing in
  on ceiling pivots, each a big flap number + caption.
- **baggage** (quote / problem / "no…") — a moving **baggage belt** carrying labelled cases.
- **security** (default / feature list) — **security scan** tags that a cyan beam
  x-ray-pings in order, each earning a green check.
- **screen** (any middle scene with a real screenshot/photo) — a mounted **gate MONITOR**
  (FIDS bezel + yellow "GATE K·F — LIVE" header) showing the screenshot, with a soft
  scan sweep and supporting copy beside it.
- **cta** (last / `cta`) — flap "final call" + CTA button + a gold plane taking off.

## Screenshots / images
Real website screenshots or curated/vision-approved photos (`screenOk`) are shown in the
**gate monitor** scene-type: a screenshot pinned to a scene claims it; leftover images fill
the next plain board/security scene. Browser-shaped shots are `object-fit:cover` (top);
portrait shots are `contain`.

## Engineering contract
Identical to the other native composers: one paused GSAP timeline on
`window.__timelines["vid"]`; direct-child `.clip` scenes on unique tracks; a boundary
`opacity:0` hard-kill per scene (the hall persists behind them); ONE seek-safe caption
node driven by a single `onUpdate` proxy; finite repeats; `pathLength=100` draw-ons; cqw
units + `container-type:size`; hidden = `opacity:0` only. Fully deterministic; passes
`hyperframes lint` with 0 errors.

## Iterate
`node server/scripts/terminal-harness.js jobs/_tdtest 1280 720 shot` →
`cd jobs/_tdtest && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft --workers 2`
→ contact sheet `ffmpeg -i renders/out.mp4 -vf "fps=1,scale=470:-1,tile=6x3" c.jpg`.
`terminal-departures` is opt-in (`framePack:"terminal-departures"`), not the auto-default.
