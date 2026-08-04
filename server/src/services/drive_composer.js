// DRIVE — a golden-hour highway film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. REBUILT 4 Aug 2026 against the readable reference source at
// templete-design/all-template-handoffs/Drive/src/drive-film.jsx (1920x1080, 6 scenes, ~15.9s,
// MAP = Intro/Billboards/Feature/Fleet/Stats/CTA).
//
// WHY A REBUILD. The bundle-derived port kept the idea and lost the world. The template's own
// description is "golden-hour highway, product-first with AMBIENT CARS" and the port had no cars
// at all — nor the sun, the drifting clouds, the lit skyline windows or the speedometer. It also
// dropped the Fleet scene outright, and made the roadside billboard the hero device where the
// reference is PRODUCT-FIRST: browser cards and phones are the heroes, the road is the set.
//
// SVG COORDINATES ARE RAW REFERENCE PIXELS. The world lives in one 0 0 1920 1080 viewBox, so the
// reference's HORIZON=892 / ROAD_Y=1004 and every building, cloud and car coordinate transcribes
// directly. HTML geometry converts with U(px) = px/1920*100.
//
// The reference drives the world from a per-frame clock; a SEEKED timeline cannot, so the
// scrolling layers (clouds, both skylines, centre dashes, cars, wheels) become repeating linear
// tweens whose durations are derived from the reference's own px/s speeds.
//
// FONT SUBSTITUTION: none — the reference's own Barlow Semi Condensed + Sora are bundled.
// ADVANCE: still the grotesk value measured for the old Archivo substitute. Barlow Semi
// Condensed is genuinely narrower, so headlines set SMALLER than they could — safe (a too-low
// advance is what clips a headline), but it wants a measured pass against a render.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const SKY_A = "#FFE3A3", SKY_B = "#FCA26A", SKY_C = "#EE7B7B", SUN = "#FFD36B";
const SKYLINE = "#5A3F66", SKYLINE_FAR = "#835F8E";
const ROAD_C = "#2B2733", ROAD_EDGE = "#4C4655", DASH = "#F5E7C6";
const INK = "#2A2233", PAPER = "#FFF7EA", ACCENT = "#12B5C8";
// FONTS: the reference's own Barlow Semi Condensed + Sora, both bundled.
const DISPLAY = "Barlow Semi Condensed", MONO = "JetBrains Mono", BODY = "Sora";

const HORIZON = 892, ROAD_Y = 1004;

const STRINGS = {
  intro: "THE PRODUCT", billboards: "SHOWCASE", feature: "FEATURES",
  fleet: "THE WHOLE APP", stats: "BY THE NUMBERS", cta: "GET STARTED",
  scene: "MILE", of: "OF", go: "DOWNLOAD NOW",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_B, skyA: SKY_A, skyB: SKY_B, skyC: SKY_C, sun: SUN,
    skyline: SKYLINE, skylineFar: SKYLINE_FAR, road: ROAD_C, roadEdge: ROAD_EDGE, dash: DASH,
    ink: INK, paper: PAPER, panel: PAPER, sub: rgba(INK, 0.62), line: rgba(INK, 0.15),
    // The hero car is derived from the accent so a rebranded film is not still driving the
    // stock yellow past a new palette.
    car: K.spin(accent, 172, -0.1, 0.62),
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
const M = U(96);
const COL = U(1920) - M * 2;

const svg = (inner) =>
  `<svg viewBox="0 0 1920 1080" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden;">${inner}</svg>`;

// A skyline block with lit windows — reference Building.
function building(x, y, w, h, color, lit) {
  let wins = "";
  for (let row = 0; row < Math.floor(h / 46) - 1; row++) {
    for (let c = 0; c < Math.floor(w / 34); c++) {
      if ((row * 7 + c * 3) % 4 === 0) wins += `<rect x="${x + 12 + c * 34}" y="${y + 18 + row * 46}" width="15" height="22" fill="${lit}" opacity="0.7" />`;
    }
  }
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" /><rect x="${x}" y="${y}" width="${w}" height="5" fill="${rgba("#000000", 0.12)}" />${wins}</g>`;
}
// A wheel whose hub spins. The spoke group carries NO transform attribute, so GSAP owns its
// transform outright and cannot fight a static one.
const wheelG = (id, cx, cy, rad) => `<g transform="translate(${cx} ${cy})">
  <circle r="${rad}" fill="#211E28" />
  <g class="${id}-wh"><circle r="${rad * 0.5}" fill="#726C7E" />
    ${[0, 72, 144, 216, 288].map((a) => `<rect x="-2" y="${-rad * 0.5}" width="4" height="${rad * 0.5}" rx="2" fill="#8E8898" transform="rotate(${a})" />`).join("")}
    <circle r="${rad * 0.16}" fill="#B8B2C0" /></g>
</g>`;
// One ambient car — reference Car.
function carG(id, { x, y, s = 1, color }) {
  const win = rgba("#0E1626", 0.5);
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="12" rx="118" ry="14" fill="${rgba("#000000", 0.22)}" />
    ${wheelG(id, -62, 0, 30)}${wheelG(id, 64, 0, 30)}
    <path d="M-52 -50 L-34 -86 Q-28 -94 -14 -94 L38 -94 Q52 -94 60 -82 L78 -50 Z" fill="${color}" />
    <rect x="-104" y="-58" width="212" height="50" rx="20" fill="${color}" />
    <rect x="-104" y="-30" width="212" height="14" fill="${rgba("#000000", 0.16)}" />
    <path d="M-30 -54 L-16 -84 L14 -84 L14 -54 Z" fill="${win}" /><path d="M22 -54 L22 -84 L34 -84 L50 -54 Z" fill="${win}" />
    <rect x="100" y="-46" width="12" height="15" rx="5" fill="#FFF3C4" />
    <rect x="-112" y="-46" width="9" height="15" rx="4" fill="#FF5A4E" />
  </g>`;
}

// The whole set: sky, sun, clouds, two parallax skylines, road, centre dashes and traffic.
function road(id, th) {
  const clouds = [[300, 150, 1.0], [900, 120, 0.8], [1600, 175, 0.95]].map(([x, y, s]) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="${rgba("#FFFFFF", 0.6)}"><ellipse cx="0" cy="0" rx="86" ry="30" /><ellipse cx="66" cy="10" rx="54" ry="24" /><ellipse cx="-60" cy="12" rx="48" ry="22" /></g>`).join("");
  const far = [0, 420, 840, 1260, 1680, 2100].map((bx, i) =>
    building(bx + 40, HORIZON - 150 - (i % 3) * 40, 150, 150 + (i % 3) * 40, th.skylineFar, th.sun)).join("");
  const near = [0, 520, 1040, 1560, 2080].map((bx, i) =>
    building(bx, HORIZON - 210 - (i % 3) * 56, 210, 210 + (i % 3) * 56, th.skyline, th.sun)).join("");
  const dashes = Array.from({ length: 16 }, (_, i) =>
    `<rect x="${i * 210 - 210}" y="${ROAD_Y + 30}" width="120" height="8" rx="4" fill="${th.dash}" opacity="0.85" />`).join("");
  const cars = [{ c: th.car, s: 0.5 }, { c: "#F2683C", s: 0.44 }, { c: th.paper, s: 0.4 }];
  return `<div style="position:absolute;inset:0;background:${th.skyB};overflow:hidden;">${svg(`
    <defs>
      <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${th.skyA}" /><stop offset="0.55" stop-color="${th.skyB}" /><stop offset="1" stop-color="${th.skyC}" /></linearGradient>
      <radialGradient id="${id}-sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFF3C8" /><stop offset="0.5" stop-color="${th.sun}" /><stop offset="1" stop-color="${rgba(th.sun, 0)}" /></radialGradient>
    </defs>
    <rect x="0" y="0" width="1920" height="${HORIZON + 20}" fill="url(#${id}-sky)" />
    <circle cx="1300" cy="${HORIZON - 250}" r="340" fill="url(#${id}-sun)" opacity="0.8" />
    <circle cx="1300" cy="${HORIZON - 250}" r="120" fill="#FFEFC2" opacity="0.9" />
    <g class="${id}-cloud">${clouds}</g>
    <g class="${id}-far" opacity="0.8">${far}</g>
    <g class="${id}-near">${near}</g>
    <rect x="0" y="${HORIZON}" width="1920" height="${1080 - HORIZON}" fill="${th.road}" />
    <rect x="0" y="${HORIZON}" width="1920" height="8" fill="${th.roadEdge}" />
    <rect x="0" y="${HORIZON + 8}" width="1920" height="3" fill="${rgba(th.sun, 0.35)}" />
    <g class="${id}-dash">${dashes}</g>
    ${cars.map((c, i) => `<g class="${id}-car${i}">${carG(id, { x: -260, y: ROAD_Y, s: c.s, color: c.c })}</g>`).join("")}`)}</div>`;
}
// Every speed below is the reference's own px/s.
const roadTweens = (id, ctx) => {
  const loop = (dist, speed) => dist / speed;
  const t = [
    `tl.to(".${id}-cloud",{x:-2400,duration:${r(loop(2400, 26))},ease:"none",repeat:${K.reps(ctx.L, loop(2400, 26))}},${r(ctx.T)});`,
    `tl.to(".${id}-far",{x:-420,duration:${r(loop(420, 40))},ease:"none",repeat:${K.reps(ctx.L, loop(420, 40))}},${r(ctx.T)});`,
    `tl.to(".${id}-near",{x:-520,duration:${r(loop(520, 90))},ease:"none",repeat:${K.reps(ctx.L, loop(520, 90))}},${r(ctx.T)});`,
    `tl.to(".${id}-dash",{x:-210,duration:${r(loop(210, 260))},ease:"none",repeat:${K.reps(ctx.L, loop(210, 260))}},${r(ctx.T)});`,
    `tl.to(".${id}-wh",{rotation:360,duration:0.5,ease:"none",repeat:${K.reps(ctx.L, 0.5)},transformOrigin:"50% 50%"},${r(ctx.T)});`,
  ];
  // Three lanes at the reference's speeds. ONE tween each: staggering by starting each car
  // further off-screen LEFT keeps the entries apart without a second overlapping tween on the
  // same property — two tweens on `x` is what the overlap lint (correctly) flags.
  [150, 108, 205].forEach((sp, i) => {
    const from = -(i * 813), dist = 2440 - from, d = loop(dist, sp);
    t.push(`tl.fromTo(".${id}-car${i}",{x:${r(from)}},{x:2440,duration:${r(d)},ease:"none",repeat:${K.reps(ctx.L, d)}},${r(ctx.T)});`);
  });
  return t;
};

// The locked chrome — brand badge, beat label, and a bottom scrim carrying the url.
function chrome(ctx) {
  const { th, id } = ctx;
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(40))}cqw;left:${r(U(58))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <span style="padding:${r(U(6))}cqw ${r(U(14))}cqw;border-radius:${r(U(8))}cqw;background:${th.ink};color:${th.paper};font-family:${th.displayStack};font-weight:700;font-size:${r(U(24))}cqw;letter-spacing:0.04em;white-space:nowrap;">${esc(ctx.brand)}</span>
      ${ctx.label ? `<span style="font-family:${th.bodyStack};font-weight:700;font-size:${r(U(13))}cqw;letter-spacing:0.18em;color:${th.ink};text-transform:uppercase;white-space:nowrap;">${esc(ctx.label)}</span>` : ""}
    </div>
    <div style="position:absolute;bottom:0;left:0;right:0;padding:${r(U(44))}cqw ${r(U(58))}cqw ${r(U(22))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;background:linear-gradient(0deg, ${rgba(th.ink, 0.62)} 0%, ${rgba(th.ink, 0.3)} 55%, transparent 100%);box-sizing:border-box;">
      <span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(14))}cqw;letter-spacing:0.12em;color:${th.paper};white-space:nowrap;">${esc(ctx.url)}</span>
      <span style="margin-left:auto;flex:1 1 auto;max-width:${r(U(420))}cqw;height:${r(U(4))}cqw;border-radius:${r(U(4))}cqw;background:${rgba(th.paper, 0.28)};overflow:hidden;">
        <span class="${id}-prog" style="display:block;width:100%;height:100%;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></span>
      </span>
    </div>
  </div>`;
}

// A browser card — the reference's HERO device. Only ever drawn around a real picture.
function browser(th, { cls, x, y, w, h, url, shot }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(18))}cqw;overflow:hidden;background:${th.paper};border:1px solid ${rgba(th.ink, 0.15)};box-shadow:0 ${r(U(50))}cqw ${r(U(100))}cqw ${rgba("#2A1420", 0.4)};display:flex;flex-direction:column;opacity:0;">
    <div style="height:${r(U(50))}cqw;flex:0 0 auto;background:#FBEFDD;border-bottom:1px solid ${rgba(th.ink, 0.1)};display:flex;align-items:center;gap:${r(U(8))}cqw;padding:0 ${r(U(18))}cqw;">
      ${["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:${r(U(13))}cqw;height:${r(U(13))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
      <div style="margin-left:${r(U(14))}cqw;flex:1 1 auto;max-width:${r(U(440))}cqw;height:${r(U(26))}cqw;border-radius:${r(U(13))}cqw;background:${rgba(th.ink, 0.06)};display:flex;align-items:center;padding:0 ${r(U(14))}cqw;box-sizing:border-box;font-family:${th.bodyStack};font-weight:600;font-size:${r(U(13))}cqw;color:${rgba(th.ink, 0.55)};overflow:hidden;white-space:nowrap;">${esc(url)}</div>
    </div>
    <div style="flex:1 1 auto;min-height:0;">${K.shotFill(shot, { bg: th.paper })}</div>
  </div>`;
}
// A handset — the reference's second device.
function phone(th, { cls, x, y, w, h, shot, right = false }) {
  return `<div class="${cls}" style="position:absolute;${right ? "right" : "left"}:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(46))}cqw;padding:${r(U(13))}cqw;box-sizing:border-box;background:${th.ink};box-shadow:0 ${r(U(50))}cqw ${r(U(100))}cqw ${rgba("#2A1420", 0.45)};z-index:5;opacity:0;">
    <div style="position:absolute;top:${r(U(24))}cqw;left:50%;translate:-50% 0;width:${r(U(96))}cqw;height:${r(U(24))}cqw;border-radius:${r(U(24))}cqw;background:${th.ink};z-index:2;"></div>
    <div style="width:100%;height:100%;border-radius:${r(U(34))}cqw;overflow:hidden;background:${th.paper};">${K.shotFill(shot, { bg: th.paper })}</div>
  </div>`;
}
// A legibility plate for headlines set over the sky. NO backdrop-filter: a stack of blurred
// layers is what makes a composition capture come out solid black.
const plate = (th, inner) =>
  `<span style="display:inline-block;background:${rgba(th.paper, 0.9)};border-radius:${r(U(18))}cqw;padding:${r(U(14))}cqw ${r(U(30))}cqw;box-shadow:0 ${r(U(10))}cqw ${r(U(30))}cqw ${rgba(th.ink, 0.12)};">${inner}</span>`;

const chip = (th, t) =>
  `<span class="chip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(10))}cqw ${r(U(18))}cqw;border-radius:${r(U(999))}cqw;background:${th.paper};border:${r(U(2))}cqw solid ${th.ink};box-shadow:0 ${r(U(5))}cqw 0 ${rgba(th.ink, 0.16)};font-family:${th.bodyStack};font-weight:700;font-size:${r(U(16))}cqw;color:${th.ink};white-space:nowrap;opacity:0;">
    <span style="width:${r(U(8))}cqw;height:${r(U(8))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(t)}</span>`;

// ---- scenes ------------------------------------------------------------------
// INTRO — the brand over the road, the hero browser rising 520px from below.
function sIntro(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  // Reference Intro is a BRAND lockup (s.brand || theme.brand) — not the beat emphasis.
  const word = K.clampWords(String(ctx.brand || scene.emphasis || ctx.title || ""), 30);
  const size = K.fitOne(word, COL / K.camSafe(), U(128), th.adv);
  const tag = String(scene.subtext || scene.kicker || "").trim().slice(0, 52);
  return {
    backdrop: road(id, th),
    chrome: chrome(ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(70))}cqw;text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:0.9;letter-spacing:0.02em;color:${th.ink};text-shadow:0 ${r(U(5))}cqw 0 ${rgba(th.ink, 0.12)};text-transform:uppercase;">${esc(word)}</div>
      ${tag ? `<div style="font-family:${th.bodyStack};font-weight:700;font-size:${r(U(26))}cqw;color:${K.inkOn(th.accent, INK, PAPER)};background:${th.accent};display:inline-block;padding:${r(U(7))}cqw ${r(U(22))}cqw;border-radius:${r(U(999))}cqw;margin-top:${r(U(4))}cqw;">${esc(tag)}</div>` : ""}
    </div>
    ${shot ? browser(th, { cls: `${id}-hero`, x: (U(1920) - U(1160)) / 2, y: U(300), w: U(1160), h: U(600), url: ctx.url, shot }) : ""}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"back.out(1.6)"},${at(0.05)});`,
      shot ? `tl.to(".${id}-hero",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.18)});` : "",
      shot ? `tl.fromTo(".${id}-hero",{y:"${r(U(520))}cqw",scale:0.94},{y:0,scale:1,duration:${du(0.34)},ease:"back.out(1.5)",transformOrigin:"center bottom"},${at(0.18)});` : "",
      ...roadTweens(id, ctx),
    ].filter(Boolean),
  };
}

// BILLBOARDS — the showcase: a plated headline, a big browser rising, a phone beside it.
function sBillboards(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx), backdrop: road(id, th), chrome: chrome(ctx) };
  const text = String(scene.headline || scene.title || "").toUpperCase().slice(0, 34);
  const head = K.fitOne(text, U(1500) / K.camSafe(), U(66), th.adv);
  const two = shots.length > 1;
  return {
    backdrop: road(id, th),
    chrome: chrome(ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(66))}cqw;text-align:center;z-index:6;opacity:0;">
      ${plate(th, `<span style="font-family:${th.displayStack};font-weight:700;font-size:${r(head)}cqw;letter-spacing:0.02em;color:${th.ink};text-transform:uppercase;white-space:nowrap;">${esc(text)}</span>`)}
    </div>
    ${browser(th, { cls: `${id}-big`, x: U(150), y: U(220), w: two ? U(1080) : U(1620), h: U(610), url: ctx.url, shot: shots[0] })}
    ${two ? phone(th, { cls: `${id}-ph`, x: U(130), y: U(300), w: U(330), h: U(620), shot: shots[1], right: true }) : ""}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.6)"},${at(0.06)});`,
      `tl.to(".${id}-big",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.08)});`,
      `tl.fromTo(".${id}-big",{y:"${r(U(540))}cqw"},{y:0,duration:${du(0.32)},ease:"back.out(1.5)",transformOrigin:"center bottom"},${at(0.08)});`,
      two ? `tl.to(".${id}-ph",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.34)});` : "",
      two ? `tl.fromTo(".${id}-ph",{y:"${r(U(620))}cqw"},{y:0,duration:${du(0.28)},ease:"back.out(1.5)"},${at(0.34)});` : "",
      ...roadTweens(id, ctx),
    ].filter(Boolean),
  };
}

// FEATURE — copy top-left, a browser sliding in from the left, a phone rising, chips beside them.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx), backdrop: road(id, th), chrome: chrome(ctx) };
  const head = K.fitLines(scene.headline || scene.title || "", U(760) / K.camSafe(), U(86), 3, th.adv);
  const chips = K.bullets(scene, 3).map((b) => String(b).slice(0, 20));
  const two = shots.length > 1;
  return {
    backdrop: road(id, th),
    chrome: chrome(ctx),
    html: `
    <div class="${id}-copy" style="position:absolute;left:${r(M)}cqw;top:${r(U(96))}cqw;width:${r(U(760))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(20))}cqw;letter-spacing:0.14em;color:${K.inkOn(th.accent, INK, PAPER)};background:${th.accent};display:inline-block;padding:${r(U(6))}cqw ${r(U(16))}cqw;border-radius:${r(U(8))}cqw;text-transform:uppercase;margin-bottom:${r(U(14))}cqw;">${esc(String(scene.kicker || STRINGS.feature).slice(0, 24))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.92;color:${th.ink};text-shadow:0 ${r(U(4))}cqw 0 ${rgba(th.ink, 0.1)};text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${browser(th, { cls: `${id}-dk`, x: M, y: U(384), w: U(760), h: U(470), url: ctx.url, shot: shots[0] })}
    ${two ? phone(th, { cls: `${id}-ph`, x: U(150), y: U(210), w: U(360), h: U(660), shot: shots[1], right: true }) : ""}
    ${chips.length ? `<div style="position:absolute;left:${r(U(900))}cqw;top:${r(U(300))}cqw;display:flex;flex-direction:column;gap:${r(U(14))}cqw;align-items:flex-start;z-index:6;">${chips.map((c) => chip(th, c)).join("")}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"back.out(1.6)"},${at(0.08)});`,
      `tl.to(".${id}-dk",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.1)});`,
      `tl.fromTo(".${id}-dk",{x:"${r(-U(900))}cqw"},{x:0,duration:${du(0.32)},ease:"back.out(1.5)"},${at(0.1)});`,
      two ? `tl.to(".${id}-ph",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.24)});` : "",
      two ? `tl.fromTo(".${id}-ph",{y:"${r(U(700))}cqw"},{y:0,duration:${du(0.3)},ease:"back.out(1.5)"},${at(0.24)});` : "",
      chips.length ? `tl.fromTo("#${id} .chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.09)}},${at(0.5)});` : "",
      ...roadTweens(id, ctx),
    ].filter(Boolean),
  };
}

// FLEET — the six-tile grid of every screen. RESTORED 4 Aug 2026: the bundle-derived port
// dropped this beat entirely, and it is the only one that shows the product's full surface.
// The grid FITS what it has — one, two, three or six — so a tile is never drawn empty.
const FLEET_TILES = [
  { x: 96, y: 250, w: 560, h: 300, dx: -1, dy: 0 },
  { x: 690, y: 250, w: 380, h: 300, dx: 0, dy: -1 },
  { x: 1104, y: 250, w: 720, h: 300, dx: 1, dy: 0 },
  { x: 96, y: 590, w: 720, h: 280, dx: 0, dy: 1 },
  { x: 852, y: 590, w: 380, h: 280, dx: 0, dy: 1 },
  { x: 1268, y: 590, w: 556, h: 280, dx: 1, dy: 1 },
];
const FLEET_FITS = {
  1: [{ x: 380, y: 260, w: 1160, h: 600, dx: 0, dy: 1 }],
  2: [{ x: 96, y: 260, w: 860, h: 600, dx: -1, dy: 0 }, { x: 992, y: 260, w: 832, h: 600, dx: 1, dy: 0 }],
  3: [{ x: 96, y: 300, w: 560, h: 500, dx: -1, dy: 0 }, { x: 690, y: 300, w: 540, h: 500, dx: 0, dy: -1 }, { x: 1264, y: 300, w: 560, h: 500, dx: 1, dy: 0 }],
  4: [{ x: 96, y: 250, w: 860, h: 300, dx: -1, dy: 0 }, { x: 992, y: 250, w: 832, h: 300, dx: 1, dy: 0 },
    { x: 96, y: 590, w: 860, h: 280, dx: -1, dy: 1 }, { x: 992, y: 590, w: 832, h: 280, dx: 1, dy: 1 }],
  5: FLEET_TILES.slice(0, 5),
};
function sFleet(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx), backdrop: road(id, th), chrome: chrome(ctx) };
  const n = Math.min(6, shots.length);
  const tiles = FLEET_FITS[n] || FLEET_TILES;
  const text = String(scene.headline || scene.title || "").toUpperCase().slice(0, 30);
  const head = K.fitOne(text, U(1400) / K.camSafe(), U(64), th.adv);
  return {
    backdrop: road(id, th),
    chrome: chrome(ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(96))}cqw;text-align:center;z-index:6;opacity:0;">
      ${plate(th, `<span style="font-family:${th.displayStack};font-weight:700;font-size:${r(head)}cqw;color:${th.ink};text-transform:uppercase;white-space:nowrap;">${esc(text)}</span>`)}
    </div>
    ${tiles.map((t, i) => browser(th, { cls: `${id}-t${i}`, x: U(t.x), y: U(t.y), w: U(t.w), h: U(t.h), url: ctx.url, shot: shots[i] })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(32))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.6)"},${at(0.06)});`,
      ...tiles.flatMap((t, i) => [
        `tl.to(".${id}-t${i}",{opacity:1,duration:${du(0.12)},ease:"none"},${at(0.16 + i * 0.08)});`,
        `tl.fromTo(".${id}-t${i}",{x:"${r(t.dx * U(460))}cqw",y:"${r(t.dy * U(360))}cqw",scale:0.9},{x:0,y:0,scale:1,duration:${du(0.36)},ease:"back.out(1.5)"},${at(0.16 + i * 0.08)});`,
      ]),
      ...roadTweens(id, ctx),
    ],
  };
}

// STATS — hard-shadowed cards on the roadside, with the reference's sweeping speedometer.
function sStats(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx), backdrop: road(id, th), chrome: chrome(ctx) };
  const head = K.fitLines(scene.headline || scene.title || "", U(900) / K.camSafe(), U(92), 2, th.adv);
  const CX = 1540, CY = 360, R = 150;
  const pt = (deg, rr) => [CX + Math.cos((deg * Math.PI) / 180) * rr, CY + Math.sin((deg * Math.PI) / 180) * rr];
  const arcD = (f, to, rr) => { const [x1, y1] = pt(f, rr), [x2, y2] = pt(to, rr); return `M${r(x1)} ${r(y1)} A ${rr} ${rr} 0 ${to - f > 180 ? 1 : 0} 1 ${r(x2)} ${r(y2)}`; };
  const [nx, ny] = pt(140, R - 24);
  const SWEEP = Math.PI * 2 * R * ((400 - 140) / 360);
  return {
    backdrop: road(id, th),
    chrome: chrome(ctx),
    html: `
    ${svg(`<g>
      <circle cx="${CX}" cy="${CY}" r="${R + 16}" fill="${th.paper}" stroke="${th.ink}" stroke-width="4" />
      <path d="${arcD(140, 400, R)}" fill="none" stroke="${rgba(th.ink, 0.14)}" stroke-width="13" stroke-linecap="round" />
      <path class="${id}-arc" d="${arcD(140, 400, R)}" fill="none" stroke="${th.accent}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${r(SWEEP)}" stroke-dashoffset="${r(SWEEP)}" />
      <g class="${id}-ndl"><line x1="${CX}" y1="${CY}" x2="${r(nx)}" y2="${r(ny)}" stroke="${th.accent}" stroke-width="6" stroke-linecap="round" /></g>
      <circle cx="${CX}" cy="${CY}" r="12" fill="${th.ink}" />
    </g>`)}
    <div class="${id}-head" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(150))}cqw;width:${r(U(900))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.92;color:${th.ink};text-shadow:0 ${r(U(4))}cqw 0 ${rgba(th.ink, 0.1)};text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(420))}cqw;display:flex;gap:${r(U(32))}cqw;z-index:6;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="background:${th.paper};border:${r(U(3))}cqw solid ${th.ink};border-radius:${r(U(22))}cqw;box-shadow:0 ${r(U(10))}cqw 0 ${rgba(th.ink, 0.16)};padding:${r(U(28))}cqw ${r(U(40))}cqw;min-width:${r(U(290))}cqw;box-sizing:border-box;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(100))}cqw;line-height:1;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.bodyStack};font-weight:700;font-size:${r(U(18))}cqw;letter-spacing:0.08em;color:${th.ink};margin-top:${r(U(6))}cqw;text-transform:uppercase;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"back.out(1.6)"},${at(0.08)});`,
      `tl.fromTo(".${id}-arc",{strokeDashoffset:${r(SWEEP)}},{strokeDashoffset:0,duration:${du(0.7)},ease:"power3.out"},${at(0.3)});`,
      `tl.fromTo(".${id}-ndl",{rotation:0},{rotation:260,duration:${du(0.7)},ease:"power3.out",svgOrigin:"${CX} ${CY}"},${at(0.3)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(1.8)"},${at(0.34 + i * 0.12)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.5)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.38 + i * 0.12)});`,
        ];
      }),
      ...roadTweens(id, ctx),
    ],
  };
}

// CTA — the close: copy and a logo plate on the left, the last browser rising on the right.
function sCTA(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(820) / K.camSafe(), U(128), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 22) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: road(id, th),
    chrome: chrome(ctx),
    html: `
    <div style="position:absolute;left:${r(U(100))}cqw;top:${r(U(210))}cqw;width:${r(U(820))}cqw;z-index:6;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(132))}cqw;height:${r(U(132))}cqw;border-radius:${r(U(26))}cqw;background:${th.paper};border:${r(U(3))}cqw solid ${th.ink};box-shadow:0 ${r(U(10))}cqw 0 ${rgba(th.ink, 0.16)};overflow:hidden;padding:${r(U(15))}cqw;margin-bottom:${r(U(22))}cqw;box-sizing:border-box;display:grid;place-items:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.9;color:${th.ink};text-shadow:0 ${r(U(6))}cqw 0 ${rgba(th.ink, 0.12)};opacity:0;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <!-- The pill must not shrink and the url must not ride up against it: a wrapping row with
           a 20px gap let the address sit on the button's rounded edge. -->
      <div class="${id}-pill" style="margin-top:${r(U(34))}cqw;display:flex;align-items:center;gap:${r(U(34))}cqw;flex-wrap:wrap;opacity:0;">
        <span style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(20))}cqw ${r(U(44))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};color:${K.inkOn(th.accent, INK, PAPER)};font-family:${th.displayStack};font-weight:700;font-size:${r(K.fitOne(action, U(560), U(34), th.adv))}cqw;letter-spacing:0.02em;box-shadow:0 ${r(U(8))}cqw 0 ${rgba(th.ink, 0.24)};white-space:nowrap;text-transform:uppercase;flex:0 0 auto;">${esc(action)} <span style="font-size:${r(U(32))}cqw;">→</span></span>
        <span style="font-family:${th.bodyStack};font-weight:700;font-size:${r(U(22))}cqw;color:${th.ink};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(1.8)"},${at(0.24)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"back.out(1.6)"},${at(0.1)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(1.8)"},${at(0.44)});`,
      ...roadTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
// Reference order: Intro · Billboards · Feature · Fleet · Stats · CTA.
const SPEC = {
  first: "intro", last: "cta",
  middle: ["billboards", "feature", "fleet", "stats"],
  shapes: {
    intro: [1160 / 550], billboards: [1080 / 560, 330 / 594], feature: [760 / 420, 360 / 634],
    fleet: [560 / 300, 380 / 300, 720 / 300, 720 / 280, 380 / 280, 556 / 280],
    stats: [], cta: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "intro" ? 1
    : role === "billboards" || role === "feature" ? Math.min(2, Math.max(0, budget))
      : role === "fleet" ? Math.min(6, Math.max(0, budget)) : 0),
  needs: (role) => (role === "billboards" || role === "feature" || role === "fleet" ? 1 : 0),
  // Roles are picked by a ROTATING cursor, not by priority. `stats` is the only layout that
  // prints figures AS figures, so every other role declines a beat carrying two or more numbers.
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "stats") return isStats;
    if (isStats) return false;
    if (role === "billboards" || role === "feature" || role === "fleet") return budget >= 1;
    return true;
  },
};
const BUILDERS = {
  intro: sIntro, billboards: sBillboards, feature: sFeature, fleet: sFleet, stats: sStats, cta: sCTA,
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: road(ctx.id, ctx.th), chrome: chrome(ctx) }),
};
const LABELS = {
  intro: STRINGS.intro, billboards: STRINGS.billboards, feature: STRINGS.feature,
  fleet: STRINGS.fleet, stats: STRINGS.stats, cta: STRINGS.cta,
};

function buildComposition(input) {
  return K.buildFilm({
    ...input, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    refBeat: 2.65,                      // the reference runs 6 scenes in ~15.9s
    camera: { push: 0.03, drift: 0.012 },
    fallbackBrand: "DRIVE",
  });
}

module.exports = { buildComposition };
