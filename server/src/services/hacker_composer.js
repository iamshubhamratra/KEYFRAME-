// HACKER — a terminal/CRT film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. A scene-for-scene port of the Claude Design reference
// `old-templete/all-template-handoffs/Hacker/src/hacker-film.jsx` (1920x1080, 6 scenes,
// Boot / Access / Compile / Deploy / Metrics / Run, transition="cut"). Its layout, geometry, type
// scale, colour and cast are reproduced; none of its copy is — every string is either derived from
// the storyboard or is a neutral label on the film's own machinery.
//
// THE LOOK. Near-black ground, phosphor green, one monospace face for the entire system.
// Everything is a terminal surface: code that types itself, windows with traffic lights, block
// gauges, a glitched wordmark, matrix rain under it all and the tube's own glass over the top.
//
// WHY THIS FILE WAS REBUILT (10 Aug 2026). It scored 58/100 against the reference and the audit's
// first three findings were all the same failure: authored, and not connected.
//   · NOTHING TYPED. `hacker_furniture` exported a faithful CodeBlock, Term, Glitch and Bar, and
//     the composer imported none of them — while self-typing syntax-highlighted code is the FIRST
//     feature the README advertises. Text arrived as a per-line fade, and the eight-colour syntax
//     map (the only place cyan and amber ever appear as content) never rendered at all.
//   · THE GLASS BLINKED. The CRT stack sat inside `chrome`, which the kit renders into `.om-hud`
//     and cross-fades on every cut, so scanlines, roll band, vignette and fringing all dipped to
//     zero at each boundary. It now hangs OUTSIDE that wrapper and hands over between scenes at
//     the cut — see `shell()`.
//   · THE RAIN MARCHED. Forty columns were bucketed into seven tweens that also shared a starting
//     offset, so bright heads descended in seven rigid rows. The phase now lives per column.
// Beats were also re-composed onto the reference's own frames: Boot and Access are PICTURELESS in
// the reference (a 190px glitched wordmark and a typed ssh session with a rubber stamp), and
// Compile — the longest beat — is the one that carries the sliding preview panel.
//
// TIMING IS AUTHORED IN PROGRESS, NOT IN SECONDS. Every cue in the reference is a fraction of its
// scene (`M.pop(progress, 0.62, 0.4)`), so this port uses `P(f)`/`D(f)` — absolute time at
// fraction f of the beat, and a duration of f of the beat — rather than the kit's at()/du(), which
// measure seconds against a reference beat length. A storyboard beat is never 2.3s, and a cue
// authored at "half way in" must still land half way in. `refBeat` survives only for the shared
// `statement` fallback, and is set to the reference's own 2.77s mean.
//
// FONT SUBSTITUTION: the reference sets everything in JetBrains Mono, which IS bundled — this
// pack needs no substitution.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const F = require("./hacker_furniture");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

// The reference ThemeContext (hacker-film.jsx:6-9), verbatim.
const BG = "#05080B", PANEL = "#0B1016", INK = "#D7F5E1", DIM = "#4C6B58", ACCENT = "#37FF7A";
const DISPLAY = "JetBrains Mono", MONO = "JetBrains Mono";
// Every display string in the reference is fontWeight 800, and the face is loaded at 400/500/700/800
// precisely so that weight exists. At 190px the difference between Bold and ExtraBold is the
// difference between a wordmark and a caption; the port set everything at 700.
const W8 = 800;

const STRINGS = {
  boot: "BOOT", access: "ACCESS", compile: "COMPILE", nodes: "DEPLOY", deploy: "SHIP", metrics: "METRICS",
  scene: "SCENE", of: "OF", ok: "ok", run: "RUN",
  ready: "system ready", granted: "ACCESS GRANTED", building: "building bundle",
  preview: "preview", logs: "logs", node: "node",
};

function theme(brandSkin) {
  // A dark ground LIFTS a brand accent rather than darkening it — a deep navy brand would
  // otherwise vanish into #05080B and take the prompts, bars and rules with it.
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: DIM,
    // THE SYNTAX MAP is a chosen editor theme — a manufactured surface — so it follows the brand.
    // The CRT's edge fringing and the glitch title's channel split do NOT: those are artefacts of
    // the medium and are held at literal #35E0FF / #FF4D9D inside hacker_furniture.js, along with
    // the macOS traffic lights and the magenta REC dot.
    cyan: K.spin(accent, 40, 0.04), amber: K.spin(accent, -70, 0.06), mag: K.spin(accent, 160, 0.02),
    line: rgba(accent, 0.22), glowInk: rgba(accent, 0.5),
    adv: K.ADVANCE.mono,
    capBg: BG, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, "ui-monospace, monospace"),
    resolvedBrand,
  };
}

// ---- cueing ------------------------------------------------------------------
// A 4dp round for values a 2dp one would quantise away — the jitter's L/60 half-period is 0.04s
// on a short beat, and 0.04 rounded to 2dp is a 25% error on the reference's own square wave.
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// P(f) — the absolute timeline position at fraction f of this beat.
// D(f) — a duration of f of this beat, scaled by the film's tempo (a music-led film quickens).
const cue = (ctx) => {
  const mo = (ctx.tempo && ctx.tempo.motion) || 1;
  return {
    P: (f) => r(ctx.T + f * ctx.L),
    D: (f) => r(Math.max(0.06, f * ctx.L * mo)),
  };
};

// ---- ground ------------------------------------------------------------------
// THE GROUND IS THE MATRIX RAIN, and it lives INSIDE the camera behind the scene's content
// exactly as the reference's `Frame` puts it (hacker-film.jsx:177). The CRT is not part of it:
// on a CRT the glass is in front of the picture, so it is drawn last, over the HUD — see
// `shell()`. Compile passes `cols: 30, opacity: 0.16`, the reference's own override for the beat
// that carries the most type (hacker-film.jsx:239-240).
function ground(id, th, { rain = true, rainOpacity = 0.72, cols = 40 } = {}) {
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    ${rain ? F.matrix(th, { cls: id, cols, opacity: rainOpacity }) : ""}
  </div>`;
}
const groundTweens = (id, ctx, { rain = true } = {}) => (rain ? F.matrixTweens(ctx, { cls: id }) : []);

// ---- machine text ------------------------------------------------------------
// A terminal's own furniture: hosts, module paths, flags. Machine strings, never copy — the same
// class of text as the HUD's telemetry ticker, and derived from the brand so the film is one
// system rather than a template with a logo dropped in it.
const slug = (s, n = 12) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, n) || "node";
const line = (...toks) => toks;
// A bullet as a CLI flag. `clampWords` first so the slug never ends mid-word: "--everything-your-te"
// is a clipped string wearing a flag's clothes, which is worse than a shorter flag.
const flag = (s) => slug(K.clampWords(String(s), 16), 20);

// A log row with dot leaders and a trailing ok, the shape of the reference's boot log
// ("loading kernel......... ok", hacker-film.jsx:190). `width` is the column in characters.
function logRow(text, width, okWord) {
  const t = K.clampWords(String(text), Math.max(8, width - 12));
  const dots = Math.max(3, width - 10 - t.length);
  return line([t, "def"], [` ${".".repeat(dots)} `, "op"], [okWord, "ok"]);
}

// ---- the clip shell ----------------------------------------------------------
// THE GLASS IS NOT CHROME. `open()` renders a builder's chrome into `.om-hud`, and buildFilm
// cross-fades that wrapper across every transition so two scenes' counters never ghost
// (om_port_kit.js:717-718). That is right for a masthead and wrong for a pane of glass: at each
// cut the scanlines, the refresh roll, the curvature vignette and the fringing all faded to zero
// and back, so the tube stopped existing for a third of a second, six times a film.
//
// So the CRT is appended as the clip's LAST child — a sibling AFTER `.om-hud`, which nothing
// cross-fades — at z-index 50, above `.om-chrome` (40) and below the caption node (60). That is
// the reference's own paint order.
//
// AND EXACTLY ONE COPY IS EVER LIT. Each scene draws its own glass, so during a cut's overlap two
// would paint at once and the scanlines and vignette would double into a visible darkening. The
// outgoing copy is therefore switched off at T+L — the instant the next beat begins — while the
// incoming clip's copy is already on. The two copies partition the film end to end: no gap, no
// overlap, and no dependency on the transition's own length. Only the glass hands over; the beat
// underneath still cross-fades exactly as the dealer choreographed it.
function shell(ctx, inner, { backdrop, chrome, glass }) {
  const base = K.open(ctx, inner, { backdrop, chrome });
  const cut = base.lastIndexOf("</div>");   // the clip root's own closing tag
  return `${base.slice(0, cut)}${glass}${base.slice(cut)}`;
}

// HCAM — the reference's per-scene SIGNAL DROPOUT (hacker-film.jsx:28-34). Over the first and last
// 12% of every beat, `hcam` hard-alternates translateX between +18 and -18px on
// `floor(progress*60)%2` — a square wave that changes state every L/60 seconds — and decays it to
// zero. It is not a transition and it is not a camera move: the reference cuts, so this fires
// identically on all six beats and is what makes the frame visibly unstable at every boundary.
// Nothing in the port reproduced it, and the film read as a smooth parallax piece wearing a CRT.
//
// It is restored ADDITIVELY, on a layer of its own. `.om-cam` belongs to the transition dealer and
// `.om-drift`/`.om-bg` to the kit's parallax — the single-ownership rule at om_port_kit.js:326-341
// — so the scene's content is wrapped in one more inset:0 layer that only this file animates. The
// wrapper is transparent to absolute positioning, so every coordinate above is unchanged.
//
// The decay is two steps rather than a ramp (18px then 8px on the way in, 8px then 18px on the way
// out) because a repeating tween has one amplitude; sequential passes are how a decaying square
// wave is expressed on a paused timeline. `reps` floors, so the passes never overlap.
const JIT_A = 18, JIT_B = 8;   // reference amplitude, and its half-way value
function jitterTweens(ctx) {
  const { id, T, L } = ctx;
  const half = L / 60;                  // the reference's own state-change interval
  const win = L * 0.12, q = win / 2;
  const runs = Math.max(0, Math.ceil(q / half) - 1);
  const pass = (at, px) => `tl.fromTo(".${id}-jit",{x:"${r(-U(px))}cqw"},{x:"${r(U(px))}cqw",duration:${r4(half)},ease:"steps(1)",repeat:${runs},yoyo:true},${r(at)});`;
  return [
    pass(T, JIT_A), pass(T + q, JIT_B),
    `tl.set(".${id}-jit",{x:0},${r(T + win)});`,
    pass(T + L - win, JIT_B), pass(T + L - q, JIT_A),
  ];
}

// ---- media -------------------------------------------------------------------
// A terminal window around a real picture. NEVER drawn without one — an empty container is the
// defect this program has had blocked twice, so every caller checks first.
//
// No filter. The port piped every screenshot through `saturate(0.55) contrast(1.15)`, which halved
// the colour of the only real photography in the film; the reference's MediaSlot applies nothing
// and lets the rain and the glass do the tinting. The box dimensions go through to `shotFill` so
// the crop engine answers for THIS slot's shape rather than for the picture's own.
function shotTerm(th, { cls, x, y, w, h, title, shot, z = 2 }) {
  const bw = w, bh = h - U(40);
  return F.term(th, {
    cls, U, x, y, w, h, title, z,
    body: K.shotFill(shot, { bg: th.panel, w: bw, h: bh }),
    pad: false,
  });
}

// ---- scenes ------------------------------------------------------------------
// BOOT (reference Boot, hacker-film.jsx:187-203) — the film announces itself as a system coming
// up. A boot log types itself at (120, 200) in a 900 column and then dims, and the brand lands
// centred at top 470 as a 190px GLITCHED wordmark with a tagline under it.
//
// THE BEAT IS DELIBERATELY PICTURELESS. The port gave it a 800x620 screenshot terminal, which
// forced the brand to share the frame and dropped its ceiling to U(72) — a 2.6x miss on the
// largest type in the film, and the lowest display ratio in the library. The wordmark IS the beat.
function sBoot(scene, ctx) {
  const { id, th } = ctx;
  const { P, D } = cue(ctx);
  const brand = String(ctx.brand).toUpperCase().slice(0, 18);
  // +0.02 on the advance is the Glitch face's own 0.02em tracking, which the metric does not carry.
  const bSize = K.fitOne(brand, U(1680) / K.camSafe(), U(190), th.adv + 0.02);
  const tag = K.clampWords(String(scene.headline || scene.title || ctx.title || ""), 58);
  const tagSize = tag ? K.fitOne(tag, U(1500) / K.camSafe(), U(24), th.adv) : 0;

  const lines = [line(["$ ", "op"], [`./boot --${slug(ctx.brand)}`, "def"])];
  K.bullets(scene, 3).forEach((b) => lines.push(logRow(b, 52, ctx.S.ok)));
  lines.push(line(["> ", "op"], [String(ctx.S.ready || "system ready"), "ok"]));
  const code = F.code(th, { cls: id, U, lines, size: U(26) });
  // The reference types at 22cps and simply runs out of beat; we keep 22cps as a CEILING and
  // compress only when the copy would not finish inside the half of the beat it owns.
  const typeDur = Math.min(code.chars / 22, Math.max(0.5, ctx.L * 0.5));

  return {
    backdrop: ground(id, th),
    html: `
    <div class="${id}-log" style="position:absolute;left:${r(U(120))}cqw;top:${r(U(200))}cqw;width:${r(U(900))}cqw;">${code.html}</div>
    <div class="${id}-brand" style="position:absolute;left:0;right:0;top:${r(U(470))}cqw;text-align:center;opacity:0;">
      ${F.glitch(th, { cls: id, text: brand, size: bSize, ink: th.ink, weight: W8 })}
    </div>
    ${tag ? `<div class="${id}-tag" style="position:absolute;left:0;right:0;top:${r(U(470) + bSize + U(18))}cqw;text-align:center;font-family:${th.monoStack};font-size:${r(tagSize)}cqw;letter-spacing:0.24em;color:${th.accent};opacity:0;">${esc(tag)}</div>` : ""}`,
    s: [
      ...F.codeTweens(ctx, { cls: id, lens: code.lens, charW: code.charW, at: P(0.06), dur: typeDur }),
      // The reference drops the log to 0.35 once the brand takes the frame (:194).
      `tl.to(".${id}-log",{opacity:0.35,duration:${D(0.12)},ease:"power1.out"},${P(0.58)});`,
      `tl.fromTo(".${id}-brand",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:${D(0.4)},ease:"back.out(1.7)"},${P(0.5)});`,
      ...F.glitchTweens(ctx, { cls: id, U, amp: 4, hot: 1.6, cool: 0.5, split: 0.65 }),
      tag ? `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${D(0.3)},ease:"power2.out"},${P(0.62)});` : "",
      ...groundTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ACCESS (reference Access, :205-222) — a typed ssh session in a 1120 window, resolving on a
// RUBBER STAMP: a 3px accent box at 72px/800, rotated -3deg, popping from 0.7 on easeOutBack.
//
// Also pictureless in the reference. The port invented a full-bleed band over a screenshot and
// inflated its word to a U(150) ceiling — making it the largest type in our film, where the
// reference reserves that for Boot's wordmark. The tilt, the box and the bloom are the whole gag.
function sAccess(scene, ctx) {
  const { id, th } = ctx;
  const { P, D } = cue(ctx);
  const host = `${slug(ctx.brand, 10)}@prod`;
  const lines = [line(["$ ", "op"], ["ssh ", "kw"], [host, "str"])];
  K.bullets(scene, 3).forEach((b) => lines.push(logRow(b, 56, ctx.S.ok)));
  lines.push(line(["$ ", "op"], ["grant ", "kw"], ["--scope=all", "num"]));
  const size = U(26);
  const code = F.code(th, { cls: id, U, lines, size });
  const h = F.termHeight(U, size, lines.length);
  const typeDur = Math.min(code.chars / 24, Math.max(0.5, ctx.L * 0.5));

  const word = K.clampWords(String(scene.emphasis || scene.headline || ctx.S.granted).toUpperCase(), 26);
  // The stamp is tracked at 0.06em, and tracking is NOT in the advance metric — measured without
  // it a 24-character word sets 10% wider than the fitter believes and walks out of its box.
  const wSize = K.fitOne(word, U(1200) / K.camSafe(), U(72), th.adv + 0.06);

  return {
    backdrop: ground(id, th),
    html: `
    ${F.term(th, { cls: `${id}-win`, U, x: (U(1920) - U(1120)) / 2, y: U(210), w: U(1120), h, title: `ssh — ${host}`, body: code.html, z: 2 })}
    <div class="${id}-stamp" style="position:absolute;left:0;right:0;top:${r(U(620))}cqw;text-align:center;z-index:3;">
      <span class="${id}-box" style="display:inline-block;padding:${r(U(18))}cqw ${r(U(44))}cqw;border:${r(U(3))}cqw solid ${th.accent};color:${th.accent};font-family:${th.displayStack};font-weight:${W8};font-size:${r(wSize)}cqw;line-height:1;letter-spacing:0.06em;box-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.4)};opacity:0;">${esc(word)}</span>
    </div>`,
    s: [
      `tl.fromTo(".${id}-win",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${D(0.24)},ease:"power2.out"},${P(0.08)});`,
      ...F.codeTweens(ctx, { cls: id, lens: code.lens, charW: code.charW, at: P(0.16), dur: typeDur }),
      // The tilt is supplied by GSAP in BOTH keyframes, never baked into the markup: GSAP owns the
      // transform the moment it tweens scale, and a CSS `rotate(-3deg)` would be discarded on the
      // first frame of the pop — the stamp would land square.
      `tl.fromTo(".${id}-box",{opacity:0,scale:0.7,rotation:-3},{opacity:1,scale:1,rotation:-3,duration:${D(0.4)},ease:"back.out(1.7)"},${P(0.62)});`,
      ...groundTweens(id, ctx),
    ],
  };
}

// COMPILE (reference Compile, :224-255) — the longest beat and the richest. A vim window at
// (96, 150) types a real source file with a line-number gutter beside a preview window at
// (right 90, top 190) that SLIDES IN from off the right edge, and three --flag chips close it out.
//
// The port had no picture here at all (the role table allocated compile zero slots), no slide, and
// no chips — its lower half was a bare block bar. This beat is where the pack's second-largest
// media slot lives.
function sCompile(scene, ctx, shots) {
  const { id, th } = ctx;
  const { P, D } = cue(ctx);
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: false }), backdrop: ground(id, th) };

  const mod = slug(ctx.brand, 10);
  const lines = [
    line(["// deploy.ts", "cm"]),
    line(["import ", "kw"], ["{ ship } ", "def"], ["from ", "kw"], [`"@${mod}/pipe"`, "str"]),
    line(["", "def"]),
    line(["export ", "kw"], ["async ", "kw"], ["function ", "kw"], ["deploy", "fn"], ["(env) {", "def"]),
    line(["  const ", "kw"], ["res", "def"], [" = ", "op"], ["await ", "kw"], ["ship", "fn"], ["(env, ", "def"], ["{ fast: ", "def"], ["true", "num"], [" })", "def"]),
    line(["  return ", "kw"], ["res", "def"], [".status", "def"]),
    line(["}", "def"]),
  ];
  const size = U(24);
  const code = F.code(th, { cls: id, U, lines, size, lineNums: true });
  const typeDur = Math.min(code.chars / 40, Math.max(0.6, ctx.L * 0.55));

  // The build readout under the source: the reference's braille spinner plus a 14-cell block bar
  // filling over the back half of the beat. `meter` is the same 28-cell gauge the Metrics beat
  // uses, so both fill one block at a time rather than sliding.
  const build = F.meter(th, { cls: `${id}-bld`, U, label: `${String(ctx.S.building || "building bundle")}...`, frac: 0.86, labelW: 0 });

  // Chips carry the beat's own points as CLI arguments — the reference's --fast / --zero-downtime
  // read as flags, and a flag is exactly what a short feature bullet becomes.
  const flags = K.bullets(scene, 3).map(flag).filter(Boolean);

  return {
    backdrop: ground(id, th, { cols: 30, rainOpacity: 0.16 }),
    html: `
    ${F.term(th, {
      cls: `${id}-vim`, U, x: U(96), y: U(150), w: U(780), h: U(620), title: "deploy.ts — vim", z: 2,
      body: `${code.html}<div style="margin-top:${r(U(20))}cqw;">${build}</div>`,
    })}
    ${shotTerm(th, { cls: `${id}-prev`, x: U(980), y: U(190), w: U(850), h: U(500), title: `${ctx.S.preview} — ${ctx.url}`, shot, z: 2 })}
    ${flags.length ? `<div style="position:absolute;right:${r(U(90))}cqw;top:${r(U(720))}cqw;display:flex;gap:${r(U(12))}cqw;">${flags.map((f) => F.chip(th, { cls: `${id}-chip`, U, text: f })).join("")}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-vim",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${D(0.24)},ease:"power2.out"},${P(0.08)});`,
      ...F.codeTweens(ctx, { cls: id, lens: code.lens, charW: code.charW, at: P(0.16), dur: typeDur }),
      ...F.meterTweens({ cls: `${id}-bld`, frac: 0.86, at: P(0.55), dur: D(0.4) }),
      // The preview arrives from off the right edge — translateX(760) -> 0 on easeOutCubic over
      // progress 0.12 to 0.46 (:247). The panel is off-frame when it is switched on, so the
      // reveal is a `set`, not a fade the reference does not have.
      `tl.set(".${id}-prev",{opacity:1},${P(0.12)});`,
      `tl.fromTo(".${id}-prev",{x:"${r(U(760))}cqw"},{x:0,duration:${D(0.34)},ease:"power2.out"},${P(0.12)});`,
      flags.length ? `tl.fromTo(".${id}-chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${D(0.3)},ease:"back.out(1.7)",stagger:${D(0.09)}},${P(0.5)});` : "",
      ...groundTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DEPLOY (reference Deploy, :257-279) — the fan-out beat: a centred 66px headline, a deploy-log
// window typing down the middle, and two 540x300 preview nodes either side carrying screenshots.
function sNodes(scene, ctx, shots) {
  const { id, th } = ctx;
  const { P, D } = cue(ctx);
  if (!shots.length) return { ...K.statement(scene, ctx, { centred: true }), backdrop: ground(id, th) };
  const n = Math.min(2, shots.length);
  const text = K.clampWords(String(scene.headline || scene.title || ""), 46);
  const size = K.fitOne(text, U(1500) / K.camSafe(), U(66), th.adv);

  const logs = K.bullets(scene, 5).map((b, i) => line([`[${K.pad2(i + 1)}] `, "op"], [K.clampWords(String(b), 30), "def"], [" ", "def"], [String(ctx.S.ok), "ok"]));
  const lSize = U(18);
  const code = logs.length ? F.code(th, { cls: id, U, lines: logs, size: lSize }) : null;
  const typeDur = code ? Math.min(code.chars / 26, Math.max(0.5, ctx.L * 0.5)) : 0;

  // With one picture the pair would leave a hole, so it takes the right bay alone and the log
  // widens — never a drawn terminal standing empty.
  const tiles = n === 2
    ? [{ x: U(96), w: U(540) }, { x: U(1284), w: U(540) }]
    : [{ x: U(1180), w: U(644) }];
  const logX = n === 2 ? U(660) : U(96);
  const logW = n === 2 ? U(600) : U(1040);

  return {
    backdrop: ground(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(120))}cqw;text-align:center;font-family:${th.displayStack};font-weight:${W8};font-size:${r(size)}cqw;line-height:1;color:${th.ink};text-shadow:0 0 ${r(U(16))}cqw ${th.glowInk};opacity:0;">${esc(text)}</div>
    ${code ? F.term(th, { cls: `${id}-log`, U, x: logX, y: U(300), w: logW, h: U(300), title: `${ctx.S.logs} — ${slug(ctx.brand, 10)}`, body: code.html, z: 2 }) : ""}
    ${tiles.map((t, i) => shotTerm(th, { cls: `${id}-t${i}`, x: t.x, y: U(280), w: t.w, h: U(300), title: `${ctx.S.node}-${i + 1}`, shot: shots[i] })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${D(0.22)},ease:"power2.out"},${P(0.06)});`,
      code ? `tl.fromTo(".${id}-log",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${D(0.24)},ease:"power2.out"},${P(0.14)});` : "",
      ...(code ? F.codeTweens(ctx, { cls: id, lens: code.lens, charW: code.charW, at: P(0.2), dur: typeDur }) : []),
      ...tiles.map((_t, i) => `tl.fromTo(".${id}-t${i}",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${D(0.34)},ease:"power2.out"},${P(0.28 + i * 0.14)});`),
      ...groundTweens(id, ctx),
    ].filter(Boolean),
  };
}

// METRICS (reference Metrics, :281-304) — LEFT-anchored to the same rail as everything else in the
// film: a 76px headline at (110, 180), three bordered cards from (110, 350) with 92px numerals, and
// FOUR 28-cell block gauges at (110, 640). The gauges are half the beat's content and the port
// drew none of them; centring the beat also broke the alignment with the HUD's own left rail.
const GAUGES = [["cpu", 0.62], ["mem", 0.48], ["net", 0.86], ["io", 0.35]];
function sMetrics(scene, ctx) {
  const { id, th } = ctx;
  const { P, D } = cue(ctx);
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: false }), backdrop: ground(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1500) / K.camSafe(), U(76), 2, th.adv);
  const CARD = U(300), PADX = U(40);

  return {
    backdrop: ground(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(180))}cqw;width:${r(U(1500))}cqw;font-family:${th.displayStack};font-weight:${W8};font-size:${r(head.size)}cqw;line-height:1.08;color:${th.ink};text-shadow:0 0 ${r(U(16))}cqw ${th.glowInk};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(350))}cqw;display:flex;gap:${r(U(30))}cqw;">
      ${stats.map((st, i) => {
        // `numbersIn` returns the unit verbatim, and a WORD unit run straight on to the figure
        // reads as one token: "8seconds". A one- or two-character unit is a symbol (%, x, K, ms)
        // and stays welded on, exactly as the reference's Counter prints it.
        const suf = String(st.suffix).length >= 3 ? ` ${st.suffix}` : String(st.suffix);
        const fSize = K.fitOne(`${st.v}${suf}`, CARD - PADX * 2, U(92), th.adv);
        return `<div class="${id}-c${i}" style="min-width:${r(CARD)}cqw;border:1px solid ${rgba(th.accent, 0.4)};background:${rgba(th.accent, 0.05)};padding:${r(U(24))}cqw ${r(PADX)}cqw;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:${W8};font-size:${r(fSize)}cqw;line-height:1;color:${th.accent};text-shadow:0 0 ${r(U(24))}cqw ${rgba(th.accent, 0.5)};white-space:pre;"><span class="${id}-n${i}">0</span>${esc(suf)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;color:${th.sub};margin-top:${r(U(6))}cqw;white-space:nowrap;overflow:hidden;">&gt; ${esc(K.statLabel(scene, i))}</div>
      </div>`;
      }).join("")}
    </div>
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(640))}cqw;display:flex;flex-direction:column;gap:${r(U(14))}cqw;">
      ${GAUGES.map((g, i) => F.meter(th, { cls: `${id}-g${i}`, U, label: g[0], frac: g[1] })).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${D(0.22)},ease:"power2.out"},${P(0.06)});`,
      // The figure lands EARLY: every frame before it does prints a number the script never
      // claimed, and this film is frame-sampled by review.
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${D(0.4)},ease:"back.out(1.7)"},${P(0.28 + i * 0.1)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${D(0.5)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${P(0.32 + i * 0.1)});`,
        ];
      }),
      ...GAUGES.flatMap((g, i) => F.meterTweens({ cls: `${id}-g${i}`, frac: g[1], at: P(0.5 + i * 0.08), dur: D(0.4) })),
      ...groundTweens(id, ctx),
    ].filter(Boolean),
  };
}

// RUN (reference Run, :306-326) — the close, and the only beat that resolves ON the accent: a
// 120px logo tile, the command typed at 40px, a 128px GLITCHED payoff in phosphor, then the CTA
// pill and the address. The port set its closing word in ink with a glow, which is a different
// ending: the payoff word IS the phosphor moment.
function sDeploy(scene, ctx, logo) {
  const { id, th } = ctx;
  const { P, D } = cue(ctx);
  const hasMark = !!(logo && logo.path);
  const word = K.clampWords(String(scene.headline || scene.emphasis || ctx.title || "").toUpperCase(), 22);
  const wSize = K.fitOne(word, U(1520) / K.camSafe(), U(128), th.adv + 0.02);   // Glitch tracking
  // The typed command is machine text: `run <target> --prod`. The target is the brand's own module
  // name, never the CTA copy — "$ run start free --prod" is not a command anyone would type.
  const lines = [line(["$ ", "op"], ["run ", "kw"], [slug(ctx.brand, 14), "def"], [" --prod", "num"])];
  const code = F.code(th, { cls: id, U, lines, size: U(40) });
  const typeDur = Math.min(code.chars / 20, Math.max(0.4, ctx.L * 0.35));
  const cta = K.clampWords(String(scene.emphasis || ctx.S.run).toUpperCase(), 22);

  return {
    backdrop: ground(id, th),
    capTint: th.ink,
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(120))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(120))}cqw;height:${r(U(120))}cqw;border-radius:${r(U(16))}cqw;border:1px solid ${rgba(th.accent, 0.4)};background:${rgba(th.accent, 0.05)};padding:${r(U(16))}cqw;margin-bottom:${r(U(26))}cqw;display:flex;align-items:center;justify-content:center;flex:0 0 auto;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-cmd">${code.html}</div>
      <div class="${id}-word" style="margin-top:${r(U(14))}cqw;opacity:0;">
        ${F.glitch(th, { cls: id, text: word, size: wSize, ink: th.accent, weight: W8 })}
      </div>
      <div class="${id}-pill" style="margin-top:${r(U(34))}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;opacity:0;">
        <span style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(18))}cqw ${r(U(42))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:${W8};font-size:${r(K.fitOne(cta, U(560), U(30), th.adv))}cqw;box-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.5)};white-space:nowrap;">${esc(cta)} <span>&#9656;</span></span>
        <span style="font-family:${th.monoStack};font-size:${r(U(22))}cqw;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${D(0.5)},ease:"back.out(1.7)"},${P(0.3)});` : "",
      ...F.codeTweens(ctx, { cls: id, lens: code.lens, charW: code.charW, at: P(0.14), dur: typeDur }),
      `tl.fromTo(".${id}-word",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${D(0.4)},ease:"back.out(1.7)"},${P(0.5)});`,
      ...F.glitchTweens(ctx, { cls: id, U, amp: 4, hot: 1.4, cool: 0.4, split: 0.75 }),
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${D(0.4)},ease:"back.out(1.7)"},${P(0.6)});`,
      ...groundTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
// THE PICTURE PLAN IS THE REFERENCE'S. Boot and Access are typed beats and take no screenshot;
// Compile carries the sliding preview (850x500, body 850x460) and Deploy the two node windows
// (540x300, body 540x260). `needs` is the last gate: a layout that ends up short degrades to
// `statement` rather than drawing a hollow window.
const SPEC = {
  first: "boot", last: "deploy",
  // `middle` is the rotation PREFERENCE order om_port_kit.assignRoles walks, not the story order
  // (that is first -> ... -> last). services/template_media puts this pack's CRITICAL media slot on
  // scene 2 — the first middle scene — so a middle[0] whose slots() returns 0 guarantees it renders
  // empty. `access` draws nothing; `compile` is the terminal window that holds the screenshot.
  // `boot` still opens and `deploy` still closes. Same defect and fix as orbit/fetch/fight.
  middle: ["compile", "nodes", "access", "metrics"],
  shapes: {
    compile: [850 / 460], nodes: [540 / 260, 540 / 260],
    boot: [], access: [], metrics: [], deploy: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "nodes" ? Math.min(2, Math.max(0, budget))
    : role === "compile" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "nodes" || role === "compile" ? 1 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `metrics` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "metrics") return isStats;
    if (isStats) return false;
    if (role === "nodes" || role === "compile") return budget >= 1;
    // `access` is pictureless BY DESIGN — it is the reference's typed ssh session, and the beat
    // the ACCESS GRANTED stamp belongs to. Two conditions, both of them about not wasting the
    // film: it needs at least two script points to type (a window typing two machine lines is a
    // window typing nothing), and it steps aside while more than one unspent picture is waiting,
    // so a picture-rich film spends them on compile/nodes instead. One in hand is a beat the
    // later roles can still absorb, so the stamp survives in every film that is not asset-poor.
    return budget <= 1 && K.bullets(scene, 3).length >= 2;
  },
};

// THE HUD AND THE GLASS BELONG TO EVERY SCENE. The reference draws both on all six beats, and the
// HUD fills all four margins — keyline, corner brackets, a live prompt with a blinking cursor, the
// sync/REC/timecode/LIVE strip, a hex address rail, an EQ meter, a telemetry ticker. Wrapping the
// builders applies them (and the glass handover) at ONE place; six separate edits would drift.
const withTerminal = (fn) => (sc, ctx, shots, logo) => {
  const out = fn(sc, ctx, shots, logo) || {};
  const chrome = out.chrome != null ? out.chrome : F.hud(ctx.th, { cls: ctx.id, U, url: ctx.url || "root@node", label: ctx.label });
  const glass = F.crt(ctx.th, { cls: ctx.id, U });
  const s = [
    ...(out.s || []),
    ...F.hudTweens(ctx, { cls: ctx.id, U }),
    ...F.crtTweens(ctx, { cls: ctx.id, U }),
    ...jitterTweens(ctx),
  ];
  // Hand the glass to the next beat at the cut. See `shell()` for why exactly one copy is lit.
  if (!ctx.isLast) s.push(`tl.set(".${ctx.id}-glass",{opacity:0},${r(ctx.T + ctx.L)});`);
  const inner = `<div class="${ctx.id}-jit" style="position:absolute;inset:0;">${out.html || ""}</div>`;
  return {
    ...out,
    wrapped: true,
    html: shell(ctx, inner, { backdrop: out.backdrop || "", chrome, glass }),
    s,
  };
};
const RAW_BUILDERS = {
  boot: sBoot, access: sAccess, nodes: sNodes, compile: sCompile, metrics: sMetrics, deploy: sDeploy,
  statement: (sc, ctx) => { const b = K.statement(sc, ctx); return { ...b, backdrop: ground(ctx.id, ctx.th), s: [...(b.s || []), ...groundTweens(ctx.id, ctx)] }; },
  "statement-c": (sc, ctx) => { const b = K.statement(sc, ctx, { centred: true }); return { ...b, backdrop: ground(ctx.id, ctx.th), s: [...(b.s || []), ...groundTweens(ctx.id, ctx)] }; },
};
const BUILDERS = Object.fromEntries(Object.entries(RAW_BUILDERS).map(([k, fn]) => [k, withTerminal(fn)]));
// The prompt label the HUD prints after `host:~$` — machine text, lowercase, the reference's own.
const LABELS = { boot: "boot", access: "access", compile: "compile", nodes: "deploy", metrics: "top", deploy: "run" };

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${rgba(th.accent, 0.4)}; }
  #cap-text { font-family:${th.monoStack}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    // refBeat only reaches the shared `statement` fallback now — every scene in this file cues off
    // progress. 2.8 is the reference's own mean beat (2.3/2.3/3.7/2.5/3.0/2.8), where the port's
    // 4.4 authored the whole pack against beats 60% longer than anything in the source.
    css, refBeat: 2.8, camera: { push: 140, scale: 1.03 },
    signature: "technical", fallbackBrand: "TERMINAL",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
