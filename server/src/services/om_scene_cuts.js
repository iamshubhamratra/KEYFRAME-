"use strict";

// om_scene_cuts — the cut system for the IMPORTED OM portrait packs that survived the
// library trim: motion-canvas and paper-craft. (It was authored for twelve of them; the
// other ten were removed from the project, and the shape below is what they shared.)
//
// These do not run on om_port_kit. They share a different, equally uniform shape: a
// persistent WORLD painted once on track 0 (a data-cosmos, a neon skyline, a paper ground) that
// flows unbroken behind every scene, with per-scene content clipped above it on tracks 2..N.
//
// The world frame-matches across every cut — which is genuinely good, and the reason these packs
// were left alone the first time round. But the CONTENT still hard-cuts. Every archetype in all
// twelve opens with the same line:
//
//     tl.fromTo("#sN",{opacity:0},{opacity:1,duration:0.4},T)
//
// and the previous scene is killed outright at exactly T. So every cut in every film is the same
// edit: the outgoing content vanishes on a frame, the backdrop shows through bare for a beat, the
// incoming content fades up. Twelve templates, one transition, repeated six or seven times each.
//
// This module gives them the transition_kit vocabulary without touching a single archetype. It
// differs from the om_port_kit integration in one deliberate way: THE CUT LAYER IS TRANSPARENT.
// There the scene carries its own plate and the transition moves a solid frame; here the world
// below must keep showing through, so a transition moves CONTENT across a continuous backdrop.
// That is a stronger edit for this family, not a weaker one — the world never blinks.

const {
  dealTransitions, classifyBeat, xfadeFor, accentsFrom, mulberry, RUNTIME_HELPERS,
} = require("./transition_kit");

const r = (n) => Math.round(n * 100) / 100;

// Appended to each pack's own CSS. `.om-cam` deliberately declares NO background (see above).
// The perspective must live on the SCENE, not on the layer being rotated: a transform layer
// cannot supply its own vanishing point, so perspective-flip would otherwise flatten into a
// horizontal squash instead of reading as a card turning in space.
const CAM_CSS = `
  .om-scene { perspective:1400px; }
  .om-cam { position:absolute; inset:0; will-change:transform, opacity, filter; transform-origin:center center; }`;

const HELPERS = RUNTIME_HELPERS;

// The scene-root fade described above. Matched exactly — not loosely — so that a pack which ever
// grows a different root tween keeps it, and so `plan.stripped` can be asserted in a test.
const ROOT_FADE = /^tl\.fromTo\("#s\d+",\s*\{opacity:0\},\s*\{opacity:1,duration:[\d.]+\},\s*[\d.]+\);$/;

// Which cut vocabulary each pack draws from first. Read off the pack's own declared vibe, so a
// shared library still leaves distinguishable templates. An unlisted pack falls back to the
// caller's default signature.
const SIGNATURES = {
  "motion-canvas": "kinetic",
  "paper-craft": "organic",
};

// ---- planning ----------------------------------------------------------------
// Called ONCE per film, before the scene loop, because a clip's duration now depends on the cut
// that follows it and a cut cannot be chosen until every beat's class is known.
//
// beats: [{ T, L, role, scene, shotCount, numbers }]
// `tempo` is the film-level pacing profile (services/pacing.js). With no narration the cut
// overlap tightens; the beats themselves are the approved script's and are never touched.
function plan({ beats, seed = 1, signature = "cinematic", D, transitions = true, tempo = null }) {
  const list = Array.isArray(beats) ? beats : [];
  const useTx = transitions !== false && list.length > 1;
  const cuts = useTx
    ? dealTransitions({
        classes: list.map((b, i) => classifyBeat({
          role: b.role, scene: b.scene, shotCount: b.shotCount || 0,
          i, total: list.length, numbers: b.numbers || 0,
        })),
        seed, signature,
      })
    : [];
  // xf[i] is the overlap of the cut OUT of beat i — the same window as the cut INTO beat i+1.
  // A neutral tempo is a literal no-op — see the note in om_port_kit: rounding an unscaled
  // value is still a change, and a narrated film must be byte-identical to before.
  const xfScale = (tempo && Number(tempo.xfade)) || 1;
  const xfade = (a, b) => (xfScale === 1
    ? xfadeFor(a, b)
    : Math.round(Math.max(0.12, xfadeFor(a, b) * xfScale) * 1000) / 1000);
  const xf = list.map((b, i) => (useTx && i < list.length - 1 ? xfade(b.L, list[i + 1].L) : 0));
  // The clip lives its own xfade past its beat, so the outgoing content is still there for the
  // incoming one to transition against. Scene tracks are already unique (2 + i) in all twelve
  // packs, which is what makes the overlap legal — `overlapping_clips_same_track` keys by TRACK.
  const clipDur = list.map((b, i) => (i === list.length - 1
    ? Math.max(0.1, D - b.T)
    : Math.min(Math.max(0.1, D - b.T), b.L + xf[i])));
  return { beats: list, cuts, xf, clipDur, useTx, seed, D, stripped: 0 };
}

// ---- the cut layer -----------------------------------------------------------
// Wraps a built scene's markup in `.om-cam` without any archetype knowing. Every builder in all
// twelve packs returns `open(id, ctx) + …content… + </div>` — one root element, closed last — so
// the insertion points are the end of the opening tag and the final close.
//
// `.om-cam` is `position:absolute; inset:0`, an identical box to the clip root, so absolutely
// positioned children resolve exactly as before: the extra nesting changes ownership of
// transform/opacity/filter and nothing else about the geometry.
function camWrap(html) {
  const s = String(html || "");
  const gt = s.indexOf(">");
  const end = s.lastIndexOf("</div>");
  if (gt < 0 || end <= gt) return s;
  // `om-scene` carries the perspective; adding it here means no pack has to know the class name.
  const head = s.slice(0, gt + 1).replace('class="clip ', 'class="clip om-scene ');
  return `${head}<div class="om-cam">${s.slice(gt + 1, end)}</div>${s.slice(end)}`;
}

// ---- per-scene script --------------------------------------------------------
// Replaces both the archetype's root fade and the composer's `kill(...)` line.
function sceneJs(built, ctx, p, i) {
  const src = Array.isArray(built) ? built : [];
  const clipDur = p.clipDur[i] != null ? p.clipDur[i] : ctx.L;
  const out = [`tl.set("#${ctx.id}",{opacity:1},${r(ctx.T)});`];
  for (const line of src) {
    if (!line) continue;
    if (p.useTx && ROOT_FADE.test(String(line).trim())) { p.stripped++; continue; }
    out.push(line);
  }
  if (p.useTx) {
    if (i === 0) {
      // No cut lands on the first beat, so it needs an arrival of its own — otherwise the film
      // starts on a hard appear while every later beat gets a designed one.
      out.push(`tl.fromTo("#${ctx.id} .om-cam",{opacity:0,scale:1.04,filter:"blur(7px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:${r(Math.min(0.8, ctx.L * 0.32))},ease:"expo.out"},${r(ctx.T)});`);
    }
    // Seek safety: the root going hidden is not enough, because a non-linear seek landing past
    // the exit would restore stale visibility on the cut layer itself.
    out.push(`tl.set("#${ctx.id} .om-cam",{opacity:0},${r(ctx.T + clipDur)});`);
  }
  if (!ctx.isLast) out.push(`tl.set("#${ctx.id}",{opacity:0},${r(ctx.T + clipDur)});`);
  return out;
}

// ---- the cuts ----------------------------------------------------------------
// Emitted after the scene loop. Overlay tracks (20+i) sit above the scenes (2+i) and below the
// grain (40) and caption node (50), so a light bar sweeps the picture without ever crossing the
// subtitle — and without disturbing the persistent world on track 0.
function build(p, { theme } = {}) {
  if (!p || !p.useTx) return { html: [], js: [] };
  const acc = accentsFrom(theme || {});
  const rnd = mulberry((p.seed ^ 0x9e3779b9) >>> 0);
  const html = [], js = [];
  for (let i = 0; i < p.beats.length - 1; i++) {
    if (!p.cuts[i] || !(p.xf[i] > 0)) continue;
    const piece = p.cuts[i].build({
      o: `#s${i + 1} .om-cam`, n: `#s${i + 2} .om-cam`,
      t: p.beats[i + 1].T, x: p.xf[i], id: `tx${i + 1}`, track: 20 + i, acc, th: theme, rnd,
    });
    if (piece.html) html.push(piece.html);
    js.push(...piece.js.filter(Boolean));
  }
  return { html, js };
}

module.exports = { plan, build, camWrap, sceneJs, CAM_CSS, HELPERS, SIGNATURES, ROOT_FADE };
