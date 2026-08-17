// FETCH — a park-day film: a dog runs a ball to its master. Native GSAP + DOM/SVG, on om_port_kit.
//
// PROVENANCE. A SCENE-FOR-SCENE port of the Claude Design reference
// `all-template-handoffs/Fetch/src/fetch-film.jsx` (1920x1080, 6 scenes, transition="cut"). Its
// layout, geometry, type scale, colour, material and cast are reproduced; none of its copy is. The
// reference ships this file three times under different names — `launch` and `flightVertical` are
// byte-identical copies of it — so it is ported ONCE, here.
//
// WHY THIS FILE WAS REBUILT (10 Aug 2026). The previous port scored 57/100 against the reference
// frames, and the headline defect was that THE DOG IS THE TEMPLATE AND IT WAS DRAWN ON ONE BEAT OF
// SIX. `fetch_furniture.js` already contained a complete, well-proportioned dog and master; five of
// the six builders called `park(id, th)` with no cast, so five sixths of the film was an empty
// meadow with cards on it. The other four losses, all now closed:
//   · the FETCH beat — the beat the pack is named for — was a tilted photo card and a cream plate,
//     with no hand-off, no hearts, no master. The reference has the ball leave the dog's mouth on a
//     spinning arc while the master's arms lift and three hearts rise.
//   · every surface was a soft blurred drop shadow. The reference is a STICKER world: a 2-3px solid
//     ink outline plus a HARD zero-blur offset shadow. A blurred shadow contradicts the pack's own
//     flat-vector rule, which fetch_furniture.js:6-8 already states for the backdrop.
//   · every display ceiling but Run's sat 15-49% under the reference's px, so no frame in the film
//     ever reached the reference's scale of statement.
//   · the Run beat's five-layer 900px parallax was gone, so the dog crossed a static park.
//
// FONTS: THE REFERENCE'S FACES, IN BOTH PLACES. `DISP = Fredoka`, `BODY = Nunito`
// (fetch-film.jsx:14-15). Fredoka is a soft rounded geometric and it is why the film reads as
// friendly rather than as a poster; Nunito 700/800/900 carries every label, tagline, chip and stat
// caption. Both are bundled (`pack_fonts.isBundled` returns true for each), so
// `frames/fetch/pack.json` now declares exactly these two and the picker, the film and the handoff
// finally agree. The manifest previously named Caprasimo/Figtree/JetBrains Mono and this composer
// deferred to it; that resolved a manifest-vs-composer disagreement in the wrong direction — the
// reference has no monospace at all, and Caprasimo is a fat single-weight slab against which the
// composer's own font-weight:600/700 had to be synthesised. There is no "mono" role in this world:
// the kit's `monoStack` is mapped to Nunito so the shared statement layout and the caption node set
// their small type in the same face the reference does.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const F = require("./fetch_furniture");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

// The reference ThemeContext, verbatim (fetch-film.jsx:6-11, 533-540).
const SKY_TOP = "#EAF7FB", SKY = "#C7E7F1", GRASS = "#8FC15A", GRASS_DK = "#7CAF49";
const INK = "#3A352C", PAPER = "#FFFDF6", SUN = "#FFC24C", ACCENT = "#F2683C";
const DOG = "#E6A95C", DOG_DK = "#CE9142";
const DISPLAY = "Fredoka", BODY = "Nunito";
const BODY_STACK = `'${BODY}', system-ui, sans-serif`;

const STRINGS = {
  title: "A GOOD BOY STORY", run: "THE FETCH", incoming: "INCOMING DELIVERY",
  fetch: "DELIVERED", feature: "IN YOUR POCKET", stats: "BY THE NUMBERS", go: "COME PLAY",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_TOP, sky: SKY, paper: PAPER, panel: PAPER, ink: INK,
    // THERE IS NO GREY IN THIS PALETTE. The reference carries small label text as INK AT REDUCED
    // ALPHA (rgba(ink,0.5-0.55) on the BrandTag label and the progress caption) and sets its
    // secondary COPY — the Title tagline, the Fetch sub, the Feature eyebrow — in the accent. The
    // first port invented a warm grey #7A7263 for both jobs, which cost the film the orange thread
    // the reference runs through its secondary type. `sub` is now the reduced-alpha ink; the
    // accent is applied explicitly wherever the reference sets copy in it.
    sub: rgba(INK, 0.6), line: rgba(INK, 0.14),
    grass: GRASS, grassDk: GRASS_DK, sun: SUN,
    // The dog's own two tans. Not brand-derived and not optional: the cast reads these directly,
    // and an undefined fill is not "no colour" in SVG — it paints BLACK, which is how the first
    // shot of the run came back with a black dog in a pastel meadow.
    dog: DOG, dogDk: DOG_DK,
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, BODY, BODY_STACK, [BODY]),
    // Deliberately AFTER the spread: this world has no monospace, so the kit's "mono" role — the
    // statement eyebrow, the caption node — is Nunito, exactly as the reference sets it.
    monoStack: BODY_STACK,
    bodyStack: BODY_STACK,
    resolvedBrand,
  };
}

// ---- material ----------------------------------------------------------------
// EVERY SURFACE IN THIS FILM IS A STICKER. A solid ink outline plus a hard offset shadow with ZERO
// blur — Chip `2px / 0 6px 0 rgba(ink,.12)`, stat card `3px / 0 10px 0 .14`, BrandTag `2.5px /
// 0 6px 0 .14`, CTA pill `3px / 0 8px 0 .22`, logo tile `3px / 0 10px 0 .14` (fetch-film.jsx:300,
// 320, 488, 513, 516). Display type carries the same idea as a text shadow at 7-8px.
// The ONE blurred shadow in the reference is the phone bezel's `0 30px 60px rgba(ink,0.3)`, which
// is transcribed verbatim where it belongs and nowhere else.
const hardShadow = (dy, a) => `0 ${r(U(dy))}cqw 0 ${rgba(INK, a)}`;
const inkEdge = (w) => `${r(U(w))}cqw solid ${INK}`;
const typeShadow = (dy = 8) => `0 ${r(U(dy))}cqw 0 ${rgba(INK, 0.12)}`;

const park = (id, th, cast) => F.park(id, th, cast);

// ---- chrome ------------------------------------------------------------------
// THE BRANDTAG IS THE ENTIRE PERSISTENT CHROME (fetch-film.jsx:317-327). A cream pill with a 2.5px
// ink border and a hard 6px shadow, holding a 34px accent disc with the pack's PAW GLYPH in it, the
// brand in Fredoka 700/24, and the beat's kicker beside it in Nunito 800/14 at 0.16em.
//
// The reference mounts NOTHING else: `ProgressPaws` is defined at fetch-film.jsx:329-340 and
// `FetchFrame` never renders it, so the reference film has no progress rule and no scene counter.
// Returning a `chrome` from every builder replaces the kit's default HUD — which was drawing a
// letter-in-a-square badge, a mono "／ LABEL", a "SCENE 01 OF 06" counter and a film-wide accent
// progress rule, none of which exists in the handoff. It also stops `buildFilm` emitting the HUD's
// progress tween against an element no longer drawn (om_port_kit.js:730).
function chrome(th, brand, label) {
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(44))}cqw;left:${r(U(56))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <div style="display:flex;align-items:center;gap:${r(U(10))}cqw;padding:${r(U(10))}cqw ${r(U(18))}cqw ${r(U(10))}cqw ${r(U(12))}cqw;background:${th.paper};border-radius:${r(U(999))}cqw;border:${inkEdge(2.5)};box-shadow:${hardShadow(6, 0.14)};">
        <span style="width:${r(U(34))}cqw;height:${r(U(34))}cqw;border-radius:50%;background:${th.accent};display:grid;place-items:center;flex:0 0 auto;">${F.pawGlyph(`${r(U(20))}cqw`, th.paper)}</span>
        <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(24))}cqw;color:${th.ink};letter-spacing:0.01em;white-space:nowrap;">${esc(brand)}</span>
      </div>
      ${label ? `<span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(14))}cqw;letter-spacing:0.16em;text-transform:uppercase;color:${rgba(INK, 0.55)};white-space:nowrap;">${esc(label)}</span>` : ""}
    </div>
  </div>`;
}

// ---- the cast table ----------------------------------------------------------
// THE REFERENCE'S OWN COORDINATES, ONE ROW PER BEAT (fetch-film.jsx:374, 375, 400, 403, 431, 433,
// 453, 480, 510). Everything the cast does on a beat is read from here, so a beat can never again
// silently ship without its animals: `castFor(role)` is called by every builder, including the two
// statement fallbacks.
//
//   dog.x / dog.to  ground-contact x, and where it walks to (absent = it stays put)
//   dog.runFor      fraction of the beat the run cycle plays for (0 = sitting)
//   dog.idleK       the reference's `phase = localTime * k` for a sitting dog
//   master.lift     armLift in degrees, over [liftFrom, liftTo] of the beat
const GY = F.GROUND_Y;
const CAST = {
  title: {
    dog: { x: -260, to: 690, scale: 1.5, carrying: true, runFor: 0.5, travel: [0.05, 0.5], travelEase: "power2.out", idleK: 1, wag: 1 },
    master: { x: 1580, scale: 1.1, waveK: 4 },
    sparkles: [{ x: 520, y: 240 }, { x: 1500, y: 300, s: 0.8 }],
  },
  run: {
    dog: { x: 160, to: 1230, scale: 1.62, carrying: true, runFor: 1, travel: [0.08, 0.94], lines: true },
    master: { x: 1620, scale: 1.12, waveK: 5, lift: 12, liftFrom: 0.6, liftTo: 0.95 },
    paw: { from: 180, to: 1160 },
    drift: 900,
  },
  fetch: {
    dog: { x: 560, to: 720, scale: 1.55, carrying: true, travel: [0, 0.32], travelEase: "back.out(2)", idleK: 2, wag: 2.4, dropAt: 0.4 },
    master: { x: 1230, scale: 1.2, waveK: 6, waveAt: 0.7, lift: 26, liftFrom: 0.4, liftTo: 0.7, liftEase: "back.out(2)" },
    sparkles: [{ x: 780, y: 360 }],
    hearts: { cx: 1160, cy: GY - 220, at: 0.6 },
  },
  feature: {
    dog: { x: 470, scale: 1.35, carrying: false, idleK: 1.6, wag: 1.6 },
  },
  // The reference's Stats beat is the one with NO dog: the hero is the bouncing ball at x=1560
  // with its squashing ground shadow (fetch-film.jsx:480-481). The first port had this exactly
  // inverted — a ball on five beats that have none, and none on the one that does.
  stats: { bounce: { x: 1560, y: GY - 40, r: 30 } },
  comeplay: {
    dog: { x: 1360, scale: 1.5, carrying: true, idleK: 2.4, wag: 3 },
    sparkles: [{ x: 520, y: 250 }, { x: 1440, y: 300, s: 0.8 }],
  },
  // The pictureless fallback keeps the world alive too, with the dog sitting well right of the
  // statement layout's copy column so it reads as part of the park rather than behind the type.
  statement: { dog: { x: 1700, scale: 1.2, carrying: true, idleK: 1.8, wag: 1.4 } },
};
CAST["statement-c"] = CAST.statement;

// The markup half of the table. `park()`'s third argument is the cast layer, so the world and the
// animals share ONE transform — which is how the reference's `<Scene>` wraps `<Park>` and its cast
// together (fetch-film.jsx:369-376).
function castOf(id, th, role) {
  const c = CAST[role] || {};
  const parts = [];
  if (c.hearts) parts.push(F.hearts(id, th, c.hearts));
  (c.sparkles || []).forEach((s, i) => parts.push(F.sparkle(id, th, { i, x: s.x, y: s.y, s: s.s || 1 })));
  if (c.paw) parts.push(F.pawTrail(id, th, c.paw));
  if (c.master) parts.push(F.master(id, th, { x: c.master.x, y: GY + 70, scale: c.master.scale }));
  if (c.dog) {
    parts.push(F.dog(id, th, {
      x: c.dog.x, y: GY + 78, scale: c.dog.scale,
      carrying: c.dog.carrying !== false, running: (c.dog.runFor || 0) > 0, lines: !!c.dog.lines,
    }));
  }
  // The bouncing ball is the Stats beat's hero, and the only place a free ball rides the backdrop
  // — the Fetch hand-off draws its own on the content layer, because there it is the subject.
  if (c.bounce) parts.push(F.ballBounce(id, th, c.bounce));
  return parts.join("\n");
}

// The motion half of the same table.
function castTweens(id, ctx, role) {
  const c = CAST[role] || {};
  const out = [...F.parkTweens(id, ctx, K, c.drift ? { drift: c.drift, from: 0.08 * ctx.L, dur: 0.86 * ctx.L } : {})];
  if (c.dog) {
    const [t0, t1] = c.dog.travel || [0, 0];
    out.push(...F.dogTweens(id, ctx, K, {
      spanX: c.dog.to != null ? c.dog.to - c.dog.x : 0,
      travelAt: t0 * ctx.L, travelDur: (t1 - t0) * ctx.L, travelEase: c.dog.travelEase || "sine.inOut",
      runFor: (c.dog.runFor || 0) * ctx.L, idleK: c.dog.idleK || 0, wag: c.dog.wag || 1,
      dropAt: c.dog.dropAt != null ? c.dog.dropAt * ctx.L : null,
    }));
  }
  if (c.master) out.push(...F.masterTweens(id, ctx, K, c.master));
  if (c.paw) out.push(...F.pawTweens(id, ctx, K, { at: 0.1, count: 7 }));
  if (c.hearts) out.push(...F.heartTweens(id, ctx, K, { at: c.hearts.at }));
  if (c.sparkles) out.push(...F.sparkleTweens(id, ctx, K, { count: c.sparkles.length }));
  if (c.bounce) out.push(...F.ballBounceTweens(id, ctx, K, {}));
  return out;
}

// A whole beat's shell, so no builder can forget the world, the cast or the chrome.
const beat = (ctx, role, html, s) => ({
  backdrop: park(ctx.id, ctx.th, castOf(ctx.id, ctx.th, role)),
  chrome: chrome(ctx.th, ctx.brand, ctx.label),
  html,
  s: [...s.filter(Boolean), ...castTweens(ctx.id, ctx, role)],
});

const lines = (arr) => arr.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("");

// ---- scenes ------------------------------------------------------------------

// TITLE — the day begins (fetch-film.jsx:357-385). A CENTRED LOCKUP over an open meadow: the
// statement at the reference's 190px ceiling with the accent tagline under it, the dog trotting in
// from off-frame left to x=690 with dust at its heels, the master waving at 1580, two sparkles.
//
// PICTURELESS BY DESIGN. The first port gave this beat a photo card at x=1010 and then halved the
// headline to U(96) to clear it — the opener's own scale sacrificed to a slot the reference does
// not have. The film's one screenshot lives on the Feature phone, where the reference puts it.
//
// The copy block starts at U(180) rather than the reference's 210 because the reference sets one
// known short brand word and we measure real AI copy that can want a second line; 30px of headroom
// is what keeps a two-line lockup clear of the master's head at the right edge.
function sTitle(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.title || ctx.title || ctx.brand,
    U(1560) / K.camSafe(), U(190), 2, th.adv);
  const tagline = String(scene.subtext || scene.body || "").slice(0, 90);
  return beat(ctx, "title", `
    <div style="position:absolute;left:${r(U(180))}cqw;right:${r(U(180))}cqw;top:${r(U(180))}cqw;text-align:center;z-index:5;">
      <div class="${id}-head" style="display:inline-block;transform-origin:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.9;letter-spacing:0.01em;color:${th.ink};text-shadow:${typeShadow(8)};opacity:0;">${lines(head.lines)}</div>
      ${tagline ? `<div class="${id}-tag" style="margin-top:${r(U(6))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(30))}cqw;color:${th.accent};opacity:0;">${esc(tagline)}</div>` : ""}
    </div>`, [
    // M.pop(progress, 0.35, 0.5, 0.5) on a 2.5s reference beat: scale 0.5 -> 1 on easeOutBack.
    `tl.fromTo(".${id}-head",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(1.25)},ease:"back.out(1.6)"},${at(0.88)});`,
    tagline ? `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.75)},ease:"back.out(1.4)"},${at(1.38)});` : "",
  ]);
}

// THE RUN — the crossing (fetch-film.jsx:387-411). The dog runs 160 -> 1230 while the whole park
// tracks past it on five parallax layers, laying a paw trail as it goes and throwing dust and
// speed streaks; the master's arms start to open as it closes. Copy is held at the top of the frame
// so the ground stays clear for all of it.
//
// It takes no picture on purpose: it is the pack's wholly illustrated beat, and a screenshot would
// land exactly where the cast runs.
function sRun(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(1500) / K.camSafe(), U(118), 2, th.adv);
  const kick = String(scene.kicker || STRINGS.incoming).toUpperCase().slice(0, 28);
  return beat(ctx, "run", `
    <div class="${id}-run-copy" style="position:absolute;left:0;right:0;top:${r(U(150))}cqw;text-align:center;opacity:0;z-index:5;">
      <div style="display:inline-block;padding:${r(U(10))}cqw ${r(U(30))}cqw;border-radius:${r(U(999))}cqw;background:${th.ink};color:${th.paper};font-family:${th.displayStack};font-weight:600;font-size:${r(U(30))}cqw;letter-spacing:0.02em;">${esc(kick)}</div>
      <div style="margin-top:${r(U(14))}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.92;color:${th.ink};text-shadow:${typeShadow(7)};">${lines(head.lines)}</div>
    </div>`, [
    `tl.fromTo(".${id}-run-copy",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.99)},ease:"back.out(1.4)"},${at(0.4)});`,
  ]);
}

// FETCH — THE DELIVERY, and the beat the pack is named for (fetch-film.jsx:413-441).
//
// The dog skids in 560 -> 720 on easeOutBack and stops carrying at progress 0.4; the ball leaves
// its mouth and arcs 820 -> 1060, rising 120px while it spins 420 degrees; the master's arms lift
// 0 -> 26 degrees on easeOutBack to receive it; three hearts float 150px up out of (1160, 528),
// the middle one pink. The statement lands at 150px with an accent sub under it.
//
// The first port drew a tilted photo card bounding in from y=-220 plus a cream plate — no dog, no
// hand-off, no master, no hearts — and with no picture it degraded to a bulleted list on grass.
function sFetch(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1520) / K.camSafe(), U(150), 2, th.adv);
  const sub = String(scene.subtext || scene.body || "").slice(0, 90);
  return beat(ctx, "fetch", `
    <div style="position:absolute;left:${r(U(200))}cqw;right:${r(U(200))}cqw;top:${r(U(170))}cqw;text-align:center;z-index:5;">
      <div class="${id}-head" style="display:inline-block;transform-origin:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.94;color:${th.ink};text-shadow:${typeShadow(8)};opacity:0;">${lines(head.lines)}</div>
      ${sub ? `<div class="${id}-sub" style="margin-top:${r(U(4))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(28))}cqw;color:${th.accent};opacity:0;">${esc(sub)}</div>` : ""}
    </div>
    <svg viewBox="0 0 ${F.W} ${F.H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;">
      ${F.ball(id, th, { cls: `${id}-throw`, x: 820, y: GY - 40, r: 20, hidden: true })}
    </svg>`, [
    // M.pop(progress, 0.55, 0.5, 0.5) on a 2.3s reference beat.
    `tl.fromTo(".${id}-head",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(1.15)},ease:"back.out(1.6)"},${at(1.27)});`,
    sub ? `tl.fromTo(".${id}-sub",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(1.5)});` : "",
    // THE HAND-OFF ITSELF. The free ball rides the CONTENT layer, not the backdrop, because it is
    // the beat's subject rather than set dressing — and it is drawn in the park's own 1920x1080
    // coordinates, so its tween values are SVG user units, not cqw.
    ...F.ballArcTweens(id, ctx, K, { cls: "throw", from: 0.38, dx: 240, rise: 120 }),
  ]);
}

// THE APP — the two-column split (fetch-film.jsx:443-468). Copy in a 720px column on the left
// (accent eyebrow at 20px/900, the headline at 92px, then a wrapping row of sticker Chips), the
// PHONE on the right, and the dog sitting at 470 in front of the copy's baseline.
//
// THIS IS THE FILM'S ONLY SCREENSHOT SLOT, and it is a PORTRAIT DEVICE: 360x740 (aspect 0.486),
// ink bezel at radius 44 with 12px of padding, a 92x20 notch, an inner screen at radius 34 on
// paper. The first port had no device frame anywhere and published a 1.4:1 landscape "fridge photo"
// aspect to the asset pipeline, so a phone screenshot handed to this pack was cropped to landscape
// before the composer ever saw it. `frames/fetch/pack.json` now declares this box.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = (shots || [])[0] || null;
  // Defensive only: `carry` will not hand this role a beat without a picture, and the kit's
  // pre-draw `needs` gate downgrades it to `statement` if the fill ever came up short.
  if (!shot) return sStatement(scene, ctx, false);
  const head = K.fitLines(scene.headline || scene.title || "", U(720) / K.camSafe(), U(92), 3, th.adv);
  const eyebrow = String(scene.kicker || STRINGS.feature).toUpperCase().slice(0, 30);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 22));
  return beat(ctx, "feature", `
    <div class="${id}-copy" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(220))}cqw;width:${r(U(720))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.bodyStack};font-weight:900;font-size:${r(U(20))}cqw;letter-spacing:0.14em;color:${th.accent};text-transform:uppercase;margin-bottom:${r(U(12))}cqw;">${esc(eyebrow)}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.94;color:${th.ink};">${lines(head.lines)}</div>
      ${chips.length ? `<div style="margin-top:${r(U(26))}cqw;display:flex;gap:${r(U(14))}cqw;flex-wrap:wrap;">${chips.map((c) => `<span class="fchip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(10))}cqw ${r(U(18))}cqw;border-radius:${r(U(999))}cqw;background:${th.paper};border:${inkEdge(2)};box-shadow:${hardShadow(6, 0.12)};font-family:${th.bodyStack};font-weight:800;font-size:${r(U(16))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(9))}cqw;height:${r(U(9))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="${id}-phone" style="position:absolute;left:${r(U(1350))}cqw;top:${r(U(150))}cqw;width:${r(U(360))}cqw;height:${r(U(740))}cqw;z-index:6;">
      <div style="width:100%;height:100%;border-radius:${r(U(44))}cqw;padding:${r(U(12))}cqw;background:${th.ink};box-shadow:0 ${r(U(30))}cqw ${r(U(60))}cqw ${rgba(INK, 0.3)};position:relative;">
        <div style="position:absolute;top:${r(U(24))}cqw;left:50%;transform:translateX(-50%);width:${r(U(92))}cqw;height:${r(U(20))}cqw;border-radius:${r(U(20))}cqw;background:${th.ink};z-index:2;"></div>
        <div style="width:100%;height:100%;border-radius:${r(U(34))}cqw;overflow:hidden;background:${th.paper};position:relative;">${K.shotFill(shot, { bg: th.paper, w: 360, h: 740 })}</div>
      </div>
    </div>`, [
    `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(1.11)},ease:"back.out(1.4)"},${at(0.52)});`,
    // The phone rides up from below the frame across progress 0.10 -> 0.42, on easeOutBack.
    `tl.fromTo(".${id}-phone",{y:"${r(U(780))}cqw"},{y:0,duration:${r(0.32 * ctx.L)},ease:"back.out(1.5)"},${r(ctx.T + 0.1 * ctx.L)});`,
    chips.length ? `tl.fromTo("#${id} .fchip",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(1.18)},ease:"back.out(1.8)",stagger:${du(0.33)}},${at(1.63)});` : "",
  ]);
}

// BY THE NUMBERS (fetch-film.jsx:470-496). The headline at 92px in a left column, three sticker
// stat cards counting up on easeOutExpo beneath it, and the ball bouncing at 1560 over a shadow
// that squashes in sync — the beat's only other motion. Figures come from the script only.
function sStats(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return sStatement(scene, ctx, true);
  const head = K.fitLines(scene.headline || scene.title || "", U(1180) / K.camSafe(), U(92), 2, th.adv);
  return beat(ctx, "stats", `
    <div class="${id}-head" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(200))}cqw;width:${r(U(1180))}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1;color:${th.ink};z-index:6;opacity:0;">${lines(head.lines)}</div>
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(400))}cqw;display:flex;gap:${r(U(40))}cqw;z-index:6;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="background:${th.paper};border:${inkEdge(3)};border-radius:${r(U(28))}cqw;box-shadow:${hardShadow(10, 0.14)};padding:${r(U(30))}cqw ${r(U(40))}cqw;min-width:${r(U(300))}cqw;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(100))}cqw;line-height:1;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="margin-top:${r(U(6))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(20))}cqw;letter-spacing:0.08em;color:${th.ink};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`, [
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${du(0.84)},ease:"back.out(1.4)"},${at(0.3)});`,
    ...stats.flatMap((st, i) => {
      const num = Number(String(st.v).replace(/,/g, "")) || 0;
      const dp = String(st.v).includes(".") ? 1 : 0;
      return [
        `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(1.2)},ease:"back.out(1.8)"},${at(0.9 + i * 0.36)});`,
        `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(1.5)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(1.02 + i * 0.36)});`,
      ];
    }),
  ]);
}

// COME PLAY — the close (fetch-film.jsx:498-524). A LEFT COLUMN over open ground: the mark on a
// 150x150 sticker tile that pops ahead of everything else, the statement at 130px, then the accent
// CTA pill carrying the paw glyph with the url beside it — and the dog wagging on the grass at
// 1360 with two sparkles in the sky. Roughly half the frame stays park, which is what leaves the
// dog somewhere to stand; the first port centred all of it inside one 1420-wide cream card that
// spanned the frame and left no ground at all.
function sComePlay(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1000) / K.camSafe(), U(130), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return beat(ctx, "comeplay", `
    <div style="position:absolute;left:${r(U(130))}cqw;top:${r(U(250))}cqw;width:${r(U(1000))}cqw;z-index:6;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(150))}cqw;height:${r(U(150))}cqw;border-radius:${r(U(34))}cqw;background:${th.paper};border:${inkEdge(3)};box-shadow:${hardShadow(10, 0.14)};overflow:hidden;padding:${r(U(18))}cqw;margin-bottom:${r(U(26))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="transform-origin:left center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.92;color:${th.ink};text-shadow:${typeShadow(8)};opacity:0;">${lines(head.lines)}</div>
      <div class="${id}-pill" style="margin-top:${r(U(40))}cqw;display:flex;align-items:center;gap:${r(U(22))}cqw;opacity:0;">
        <span style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(20))}cqw ${r(U(42))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};color:${K.inkOn(th.accent, INK)};border:${inkEdge(3)};box-shadow:${hardShadow(8, 0.22)};font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(action, U(460), U(32), th.adv))}cqw;white-space:nowrap;">${esc(action)}${F.pawGlyph(`${r(U(26))}cqw`, K.inkOn(th.accent, INK))}</span>
        <span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(24))}cqw;color:${th.ink};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`, [
    // The tile has an entrance OF ITS OWN, ahead of the headline — M.pop(0.2, 0.5, 0.4).
    hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(1.4)},ease:"back.out(1.7)"},${at(0.56)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(1.4)},ease:"back.out(1.6)"},${at(0.34)});`,
    `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(1.12)},ease:"back.out(2)"},${at(1.18)});`,
  ]);
}

// THE PICTURELESS FALLBACK. The kit's statement layout over the pack's own world, with the park's
// motion and the sitting dog — jungle's lesson was that `{...K.statement(), backdrop: canopy()}`
// draws the world and silently drops every tween that makes it live.
function sStatement(scene, ctx, centred) {
  const role = centred ? "statement-c" : "statement";
  const built = K.statement(scene, ctx, { centred: !!centred });
  return beat(ctx, role, built.html, built.s || []);
}

// ---- spine -------------------------------------------------------------------
// MEDIA LIVES WHERE THE REFERENCE PUTS IT: one PHONE on `feature`, and the mark on the close. The
// reference's whole film has exactly those two slots (fetch-film.jsx:463, 513). title / run /
// fetch / stats are pictureless BY DESIGN — they carry the dog, the master, the hand-off, the
// hearts and the bouncing ball instead, so not one of them is a bare frame.
const SPEC = {
  first: "title", last: "comeplay",
  // `middle` IS A PREFERENCE ORDER, NOT THE STORY ORDER — the story is first -> ... -> last, and
  // om_port_kit.assignRoles walks this list as a rotation, taking the first entry whose carry()
  // accepts the scene in hand. Leading with a role that draws nothing is therefore not a narrative
  // choice, it is a silent contract break.
  //
  // `feature` is the ONLY beat in this pack that draws a picture (`slots` below returns 1 for it
  // and 0 for everything else), and services/template_media puts the pack's single CRITICAL media
  // slot on the first script scene it types "feature" — scene 2, the first middle scene. With `run`
  // leading, scene 2 drew nothing and the one picture the film had collected was reported empty.
  // Same defect and same fix as orbit_composer; measured across this family, packs whose middle[0]
  // draws a picture (reel "show", edition "lead") pass and those whose does not (orbit, fetch) fail.
  //
  // Nothing about the film's shape changes: `title` still opens, `comeplay` still closes, and run /
  // fetch simply take later turns in the rotation.
  middle: ["feature", "run", "fetch", "stats"],
  shapes: { title: [], run: [], fetch: [], feature: [360 / 740], stats: [], comeplay: [], statement: [], "statement-c": [] },
  slots: (role) => (role === "feature" ? 1 : 0),
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    if (role === "feature") return budget >= 1;
    if (role === "stats") return K.numbersIn(scene).length >= 2;
    return true;
  },
};
const BUILDERS = {
  title: sTitle, run: sRun, fetch: sFetch, feature: sFeature, stats: sStats, comeplay: sComePlay,
  statement: (sc, ctx) => sStatement(sc, ctx, false),
  "statement-c": (sc, ctx) => sStatement(sc, ctx, true),
};
const LABELS = {
  title: STRINGS.title, run: STRINGS.run, fetch: STRINGS.fetch, feature: STRINGS.feature,
  stats: STRINGS.stats, comeplay: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  /* The caption is a sticker too — the one surface the kit styles for us. */
  #cap-pill { border-radius:${r(stage.U(18))}cqw; border:${r(stage.U(2.5))}cqw solid ${INK}; box-shadow:0 ${r(stage.U(6))}cqw 0 ${rgba(INK, 0.14)}; }
  #cap-text { font-weight:800; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css,
    // OM_SCENES runs six beats at 2.5 / 3.3 / 2.3 / 3.7 / 3.0 / 2.8 seconds — a 2.93s mean, and
    // every animation offset in this file is authored in the reference's own seconds against those
    // beats. `refBeat` is what normalises them, so it has to be THIS pack's mean and not a family
    // default: at the old 4.2 a typical KEYFRAME beat ran the reference's brisk timings stretched
    // by nearly half.
    refBeat: 2.93,
    // `scale` is the reference's fcam push-in, 1 -> 1.035 on easeInOutSine (fetch-film.jsx:36), and
    // it is what om_port_kit's driftTweens applies to the content layer. `push` is only read by the
    // legacy single-camera path, which never runs while the transition system is on.
    camera: { push: 90, scale: 1.035 },
    signature: "organic", fallbackBrand: "FETCH",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, CAST, theme, STAGE };
