/* KEYFRAME long-form template 03 — KITCHEN TABLE
   Motion world: editorial magazine grid — hairline rules, folios, drop caps,
   captioned figures. Page-fold and band transitions; slow cinematic camera
   (Ken Burns) over dominant photography. Calm, premium, image-led. */
const K = window.FilmKit;
const { ease, stg, rnd, Words, Chars, Typed, Counter, Roll, Marquee, Slot, LogoSlot, Fill, Drift, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-text', '#1c1a17'),
  bg: DS('--color-bg', '#f5ead8'),
  cream: DS('--color-neutral-100', '#fffdf8'),
  paper: DS('--color-accent-100', '#e8dcc9'),
  shadow: DS('--color-neutral-300', '#cbbda6'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');

/* ---- transition language: paper — folds, bands, columns, washes ---- */
const TR = {
  fold: (p, col) => {
    const q = ease.inOut(clamp(p / 0.2, 0, 1)), o = p > 0.87 ? ease.inOut((p - 0.87) / 0.13) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', perspective: 2400 }}>
      <div style={{ position: 'absolute', inset: 0, background: col, transformOrigin: '0% 50%', transform: `rotateY(${(1 - v) * -96}deg)`, opacity: v > 0.02 ? 1 : 0 }} />
    </div>;
  },
  bands: (p, col) => {
    const o = p > 0.88 ? ease.inOut((p - 0.88) / 0.12) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[0, 1, 2, 3, 4].map(i => {
        const v = Math.max(1 - ease.inOut(clamp((p - i * 0.022) / 0.16, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 216, height: 217, background: col, transform: `translateX(${(i % 2 ? -1 : 1) * (1 - v) * 103}%)` }} />;
      })}
    </div>;
  },
  columns: (p, col) => {
    const o = p > 0.88 ? ease.inOut((p - 0.88) / 0.12) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
      {[0, 1, 2, 3].map(i => {
        const v = Math.max(1 - ease.inOut(clamp((p - i * 0.03) / 0.17, 0, 1)), o);
        return <div key={i} style={{ flex: 1, background: col, transform: `translateY(${(1 - v) * -103}%)` }} />;
      })}
    </div>;
  },
  wash: (p, col) => {
    const q = ease.inOut(clamp(p / 0.19, 0, 1)), o = p > 0.88 ? ease.inOut((p - 0.88) / 0.12) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', left: 0, width: '150%', background: col, transform: `translateX(${(v - 1) * 110}%) skewX(-10deg)` }} />
    </div>;
  },
  frameIn: (p, col) => {
    const q = ease.inOut(clamp(p / 0.2, 0, 1)), o = p > 0.88 ? ease.inOut((p - 0.88) / 0.12) : 0;
    const v = Math.max(1 - q, o) * 50;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', border: `${v}vh solid ${col}`, boxSizing: 'border-box' }} />;
  },
};
/* ---- cameras: cinematic and slow — the frame is always moving a little ---- */
const CAM = {
  /* Zoom is capped at 1.06: these cameras scale the whole scene about its centre,
     and above ~1.07 the 150px page gutter is pushed outside the frame. */
  kenIn: (p) => ({ transform: `scale(${1.02 + p * 0.04}) translate(${p * -12}px, ${p * 8}px)` }),
  kenOut: (p) => ({ transform: `scale(${1.06 - p * 0.04}) translate(${p * 10}px, ${p * -6}px)` }),
  panL: (p) => ({ transform: `scale(1.08) translateX(${40 - p * 82}px)` }),
  panR: (p) => ({ transform: `scale(1.08) translateX(${-40 + p * 82}px)` }),
  settle: (p) => ({ transform: `translateY(${(1 - ease.out(p / 0.4)) * 46}px) scale(${1.02 - ease.out(p / 0.5) * 0.02})` }),
  driftDown: (p) => ({ transform: `scale(1.06) translateY(${-24 + p * 52}px)` }),
};
/* ---- world: the continuously running background ----
   A rocking knife, herbs and chopped colour flying, a simmering pot with steam
   and bubbles, a spice shelf, settling flour. */
const AMB = 1.6;
const HUES = [C.accent, C.accent2, '#d9a13c', '#8c6a2c', K.lighten(C.accent, 0.3), K.darken(C.accent2, 0.18)];
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Cover: 'INTRO',
  Masthead: 'INTRO',
  Contents: 'INTRO',
  Hook: 'INTRO',
  Ch1: 'PROBLEM',
  Shelf: 'PROBLEM',
  Waste: 'DATA',
  Quote1: 'PROBLEM',
  Season: 'DATA',
  Miles: 'DATA',
  Cost: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Spread: 'FEATURE',
  Recipe: 'FEATURE',
  Ingredients: 'FEATURE',
  Method: 'FEATURE',
  Timing: 'DATA',
  Macro: 'MOMENT',
  Pantry: 'FEATURE',
  Wine: 'FEATURE',
  Chef: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  Panel: 'DATA',
  Plate: 'MOMENT',
  Testimonial: 'MOMENT',
  Reviews: 'SOLUTION',
  Compare: 'DATA',
  Ch4: 'SOLUTION',
  Farmers: 'FEATURE',
  Producers: 'FEATURE',
  Grain: 'FEATURE',
  Map: 'DATA',
  Plans: 'DATA',
  Thursday: 'FEATURE',
  Packaging: 'FEATURE',
  Planet: 'DATA',
  FAQ: 'FEATURE',
  Founder: 'INTRO',
  Ch5: 'CTA',
  Guarantee: 'CTA',
  Referral: 'CTA',
  Price: 'CTA',
  CTA: 'CTA',
  End: 'CTA'
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own props, handed to the engine as one decorative layer. */
const DECOR = (t, s, u) => {
  const T0 = t, W2 = W, H2 = H;
  const ink = (a) => K.alpha(C.ink, a);
  const chop = Math.abs(Math.sin(t * 3.4));
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <rect x={0} y={H2 - 180} width={W2} height={180} fill={K.alpha(C.paper, 0.5)} />
      <rect x={W2 - 640} y={H2 - 232} width={580} height={38} rx={6} fill={K.alpha('#b98a52', 0.6)} />
      <g transform={`translate(${W2 - 420 + ((t * 26) % 170)},${H2 - 244 - chop * 120}) rotate(${-15 + chop * 20})`} opacity={0.5}>
        <path d="M -8 0 L 126 0 L 146 29 L -8 29 Z" fill={K.alpha('#c8ced6', 0.85)} />
        <rect x={-84} y={4} width={80} height={22} rx={4} fill={ink(0.75)} />
      </g>
      {Array.from({ length: 11 }).map((_, k) => {
        const ph = (t * 0.44 + k * 0.09) % 1;
        const col = HUES[k % HUES.length];
        return k % 3 === 0
          ? <rect key={k} width={18} height={18} rx={3} fill={K.alpha(col, 0.6 - ph * 0.35)}
              transform={`translate(${W2 - 390 + ph * 230},${H2 - 240 - Math.sin(ph * Math.PI) * 200}) rotate(${ph * 340 + k * 30})`} />
          : <path key={k} d="M 0 0 q 14 -12 26 0 q -12 14 -26 0" fill={K.alpha(col, 0.62 - ph * 0.35)}
              transform={`translate(${W2 - 390 + ph * 210},${H2 - 240 - Math.sin(ph * Math.PI) * 190}) rotate(${ph * 300 + k * 44})`} />;
      })}
      <g transform={`translate(240,${H2 - 220})`} opacity={0.46}>
        <path d="M -104 -38 h 208 l -15 86 q -8 24 -89 24 q -81 0 -89 -24 z" fill={ink(0.62)} />
        <ellipse cy={-38} rx={106} ry={17} fill={K.alpha(C.accent, 0.65)} transform={`rotate(${Math.sin(t * 6.2) * 2})`} />
        <rect x={96} y={-47} width={66} height={14} rx={4} fill={ink(0.62)} />
        {[0, 1, 2].map(k => {
          const ph = (t * 0.28 + k * 0.33) % 1;
          return <path key={k} d={`M ${-48 + k * 48} ${-66 - ph * 400} q 23 -44 0 -88 q -23 -44 0 -88`} fill="none" stroke={K.alpha(C.cream, 0.24 * (1 - ph))} strokeWidth={15} strokeLinecap="round" />;
        })}
        {[0, 1, 2, 3].map(k => <circle key={'b' + k} cx={-58 + k * 39} cy={-44 + Math.sin(t * 5.6 + k * 2) * 6} r={4 + (k % 2) * 3} fill={K.alpha(K.lighten(C.accent, 0.4), 0.4)} />)}
      </g>
      <g transform={`translate(560,190)`} opacity={0.34}>
        <rect x={-20} y={78} width={600} height={9} rx={3} fill={ink(0.3)} />
        {Array.from({ length: 7 }).map((_, k) => (
          <g key={k} transform={`translate(${k * 84},${Math.sin(t * 1.1 + k) * 3})`}>
            <rect width={54} height={78} rx={6} fill={K.alpha(HUES[k % HUES.length], 0.6)} />
            <rect y={-11} x={12} width={30} height={13} rx={3} fill={ink(0.4)} />
          </g>))}
      </g>
      {Array.from({ length: 18 }).map((_, k) => {
        const ph = (t * 0.08 + k * 0.056) % 1;
        return <circle key={k} cx={340 + ((k * 197) % 1250) + Math.sin(t * 0.6 + k) * 22} cy={-20 + ph * (H2 + 40)} r={2.6 + (k % 3) * 0.8} fill={K.alpha(k % 5 === 0 ? C.accent : C.ink, 0.15)} />;
      })}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent, C.accent2, K.lighten(C.accent, 0.28), C.paper],
  ink: C.ink, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['KNIFE & BOARD · A KITCHEN FILM', 'MISE EN PLACE FIRST', 'COOKED, NOT PLATED', 'TASTE AS YOU GO', 'ONE PAN, NO GADGETS'];
const FOOTS = ['everything here was eaten', 'the board has scars, and history', 'seasoning is not a suggestion', 'recipe written on a napkin', 'timed with a real clock'];
const SIDES = ['CHOP · SEAR · REST', 'SHARP KNIVES, CALM HANDS', 'DINNER IN FORTY MINUTES'];

/* Both of these are composition-level: drawn per-scene they would double at
   every cut, since the engine keeps neighbouring scenes mounted. */
function Backdrop() {
  const a = K.useActive();
  const bg = a.bg || C.bg;
  return <div style={{ position: 'absolute', inset: 0, background: bg }}>{GROUND(bg, a.p, a.T, a.name)}
    {/* readability wash: one instance, so background contrast behind type holds
        steady through a cut rather than doubling with the neighbouring scene */}
    <div style={{ position: 'absolute', inset: 0, background: bg, opacity: 0.34, pointerEvents: 'none' }} />
  </div>;
}
function Garnish() {
  const a = K.useActive();
  const i = a.index, t = a.T * ENERGY;
  const c = K.isDark(a.bg) ? C.cream : C.ink;
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 44, right: 120, fontFamily: FB, fontWeight: 800, fontSize: 20, letterSpacing: '0.2em', textTransform: 'uppercase', color: alpha(c, 0.6), border: `2px solid ${alpha(c, 0.3)}`, borderRadius: 999, padding: '10px 26px', transform: `rotate(${Math.sin(t * 1.1 + i) * 1.4}deg)` }}>
      {TAGS[i % TAGS.length]}
    </div>
    <div style={{ position: 'absolute', bottom: 42, left: 120, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ width: 46, height: 4, borderRadius: 999, background: C.accent }} />
      <div style={{ fontFamily: FB, fontWeight: 600, fontStyle: 'italic', fontSize: 23, color: alpha(c, 0.6) }}>{FOOTS[i % FOOTS.length]}</div>
    </div>
    {i % 2 === 0
      ? <div style={{ position: 'absolute', left: 34, top: 340, writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: FB, fontWeight: 800, fontSize: 17, letterSpacing: '0.34em', textTransform: 'uppercase', color: alpha(c, 0.62) }}>{SIDES[(i >> 1) % SIDES.length]}</div>
      : <svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute', right: 62, bottom: 44, opacity: 0.55 }}>
          <g transform={`rotate(${t * 26} 35 35)`}>
            {[0, 1, 2, 3, 4, 5].map(k => (
              <line key={k} x1={35} y1={10} x2={35} y2={26} stroke={C.accent} strokeWidth={5} strokeLinecap="round" transform={`rotate(${k * 60} 35 35)`} />))}
          </g>
        </svg>}
  </div>;
}

/* ---- editorial type roles ---- */
const DISP = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.0, color: c, margin: 0, fontWeight: 400 });
const DECK = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.3, color: c, margin: 0, fontWeight: 600 });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.52, color: c, margin: 0, fontWeight: 400 });
const CAPS = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 700, letterSpacing: '0.24em', color: c, margin: 0 });
const FIG = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 600, fontStyle: 'italic', color: c, margin: 0 });
const PAGE = { position: 'absolute', inset: 0, padding: '120px 150px 130px', boxSizing: 'border-box' };
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 180px', boxSizing: 'border-box' };

/* ---- editorial furniture ---- */
function Rule({ q = 1, color, weight = 2, style }) {
  return <div style={{ height: weight, background: color, transform: `scaleX(${q})`, transformOrigin: '0 50%', ...style }} />;
}
function Folio({ n, label, color }) {
  return <div style={{ position: 'absolute', left: 150, bottom: 62, right: 150, display: 'flex', alignItems: 'center', gap: 22 }}>
    <span style={CAPS(22, color)}>{label}</span>
    <div style={{ flex: 1, height: 1, background: alpha(color, 0.4) }} />
    <span style={{ ...FIG(24, color) }}>{n}</span>
  </div>;
}
function Caption({ t, q = 1, color, style }) {
  return <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', opacity: q, ...style }}>
    <span style={CAPS(18, color)}>FIG.</span><span style={FIG(22, color)}>{t}</span>
  </div>;
}
/* drop-cap paragraph — the template's editorial signature */
function DropCap({ cap, text, p, d = 0, capColor, textColor, size = 34, width = 720 }) {
  const q = ease.out((p - d) / 0.4);
  return <div style={{ width, opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
    <span style={{ float: 'left', fontFamily: FH, fontSize: size * 3.4, lineHeight: 0.82, color: capColor, marginRight: 14, marginTop: 6 }}>{cap}</span>
    <span style={BODY(size, textColor)}>{text}</span>
  </div>;
}
function Chapter({ p, n, title, deck }) {
  const q = ease.inOut(p / 0.4);
  return <div style={PAGE}>
    <Rule q={q} color={C.accent} weight={5} />
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 60, marginTop: 50 }}>
      <div style={{ ...DISP(230, C.accent), opacity: ease.out((p - 0.16) / 0.3) }}>{n}</div>
      <div style={{ paddingTop: 30, opacity: ease.out((p - 0.3) / 0.3) }}>
        <div style={DISP(96, C.ink)}>{title}</div>
        {deck ? <div style={{ ...DECK(38, alpha(C.ink, 0.66)), marginTop: 18, maxWidth: 820 }}>{deck}</div> : null}
      </div>
    </div>
    <Rule q={ease.inOut((p - 0.3) / 0.4)} color={alpha(C.ink, 0.3)} weight={1} style={{ marginTop: 60 }} />
  </div>;
}
function Chrome() {
  return <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 92, display: 'flex', alignItems: 'center', gap: 16, padding: '0 150px', background: C.ink, pointerEvents: 'none', boxSizing: 'border-box' }}>
    <div style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden' }}><Fill id="kt-mark" shape="rounded" radius={4} placeholder="LOGO" /></div>
    <span style={CAPS(22, C.cream)}>{(window.OM_TWEAKS || {}).brandName || 'TABLE SEVEN'}</span>
    <div style={{ flex: 1 }} />
    <span style={CAPS(20, alpha(C.cream, 0.6))}>SEASONAL RECIPE BOXES · ISSUE 07</span>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== COVER ===== */}
      <Scene name="Cover" bg={C.ink} wipe="frameIn" wipeColor={C.bg} camera="kenIn">{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0 }}><Fill id="kt-cover" shape="rect" placeholder="DROP COVER IMAGE" idle={C.paper} /></div>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(C.ink, 0.5)}, ${alpha(C.ink, 0.1)} 45%, ${alpha(C.ink, 0.72)})` }} />
          <div style={{ position: 'absolute', left: 150, bottom: 150, right: 150 }}>
            <Caption t="the table, laid for seven" q={ease.out((p - 0.5) / 0.3)} color={alpha(C.cream, 0.8)} style={{ marginBottom: 18 }} />
            <Chars t="Kitchen Table" p={p} size={170} color={C.cream} font={FH} mode="rise" per={0.035} />
            <Rule q={ease.inOut((p - 0.4) / 0.4)} color={C.accent} weight={6} style={{ marginTop: 26 }} />
          </div>
        </div>)}
      </Scene>

      <Scene name="Masthead" bg={C.bg} wipe="bands" wipeColor={C.ink}>{(p) => (
        <div style={PAGE}>
          <Rule q={ease.inOut(p / 0.3)} color={C.ink} weight={4} />
          <div style={{ display: 'flex', gap: 70, marginTop: 60 }}>
            <div style={{ flex: '0 0 900px' }}>
              <div style={DISP(120, C.ink)}>Seven dinners, one box, every Thursday.</div>
            </div>
            <div style={{ flex: 1, paddingTop: 20 }}>
              <DropCap cap="W" text="We ship what the farms actually cut this week, with the recipes written around it — not the other way round. The box changes because the season does." p={p} d={0.3} capColor={C.accent} textColor={C.ink} width={620} />
            </div>
          </div>
          <Folio n="01" label="KITCHEN TABLE" color={C.ink} />
        </div>)}
      </Scene>

      <Scene name="Contents" bg={C.paper} wipe="columns" wipeColor={C.cream}>{(p) => {
        const rows = [['01', 'What the supermarket forgot'], ['02', 'How the box is built'], ['03', 'What people cooked'], ['04', 'Who grows it'], ['05', 'Come to the table']];
        return <div style={PAGE}>
          <div style={CAPS(24, C.accent)}>IN THIS ISSUE</div>
          <div style={{ marginTop: 40 }}>
            {rows.map(([n, t2], i) => {
              const q = ease.out(stg(p, i, 0.08, 0.28));
              return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 30, padding: '20px 0', borderBottom: `1px solid ${alpha(C.ink, 0.28)}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
                <span style={{ ...FIG(34, C.accent), width: 70 }}>{n}</span>
                <span style={DISP(64, C.ink)}>{t2}</span>
              </div>;
            })}
          </div>
          <Folio n="02" label="CONTENTS" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Hook" bg={C.cream} wipe="wash" wipeColor={C.accent} camera="panL">{(p) => (
        <div style={MID}>
          <div style={{ maxWidth: 1500 }}>
            <Words t="Most of what we eat was picked before it was ready." p={p} per={0.05} style={DISP(120, C.ink)} />
          </div>
          <Rule q={ease.inOut((p - 0.5) / 0.4)} color={C.accent} weight={5} style={{ width: 400, marginTop: 40 }} />
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.bg} wipe="fold" wipeColor={C.paper}>{(p) => <Chapter p={p} n="01" title="What the supermarket forgot" deck="On picking early, shipping far, and the taste that goes missing in between." />}</Scene>

      <Scene name="Shelf" bg={C.ink} wipe="bands" wipeColor={C.accent} camera="kenOut">{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.55 }}><Fill id="kt-shelf" shape="rect" placeholder="DROP SHELF IMAGE" idle={C.shadow} /></div>
          <div style={{ position: 'absolute', left: 150, top: 260, width: 900 }}>
            <div style={CAPS(24, C.accent)}>THE AVERAGE TOMATO</div>
            <div style={{ ...DISP(110, C.cream), marginTop: 20 }}>Nine days old before you meet it.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Waste" bg={C.accent} wipe="columns" wipeColor={C.cream}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', alignItems: 'center', gap: 90 }}>
          <div style={{ ...DISP(400, C.cream), lineHeight: 0.85 }}><Counter target={30} p={p} dur={0.45} suffix="%" /></div>
          <div style={{ maxWidth: 700 }}>
            <Words t="of household vegetables are thrown away uncooked." p={p} d={0.2} style={DISP(66, C.ink)} />
            <div style={{ ...BODY(34, alpha(C.ink, 0.8)), marginTop: 22 }}>Mostly because nobody planned a meal for them.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.paper} wipe="wash" wipeColor={C.ink} camera="panR">{(p, lt) => (
        <div style={MID}>
          <div style={{ ...DISP(160, C.accent), lineHeight: 0.35, marginBottom: 40 }}>“</div>
          <div style={{ maxWidth: 1420, minHeight: 300 }}>
            <Typed t="I cooked four things a week and bought food for eleven." p={p} lt={lt} dur={0.6} caretColor={C.accent} style={DISP(88, C.ink)} />
          </div>
          <div style={{ ...CAPS(24, alpha(C.ink, 0.65)), marginTop: 34, opacity: ease.out((p - 0.7) / 0.2) }}>ELLIE R. · SUBSCRIBER, TWO YEARS</div>
        </div>)}
      </Scene>

      <Scene name="Season" bg={C.cream} wipe="bands" wipeColor={C.paper}>{(p) => {
        const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
        const rows = [['Asparagus', 3, 5], ['Broad beans', 5, 7], ['Tomato', 6, 9], ['Squash', 8, 11], ['Kale', 9, 12]];
        return <div style={PAGE}>
          <div style={CAPS(24, C.accent2)}>WHAT IS ACTUALLY IN SEASON</div>
          <div style={{ marginTop: 34 }}>
            {rows.map(([n, a, b], i) => {
              const q = ease.inOut(stg(p, i, 0.08, 0.3));
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '13px 0', borderBottom: `1px solid ${alpha(C.ink, 0.16)}` }}>
                <span style={{ ...DECK(34, C.ink), width: 300 }}>{n}</span>
                <div style={{ flex: 1, position: 'relative', height: 32 }}>
                  <div style={{ position: 'absolute', left: `${(a / 12) * 100}%`, width: `${((b - a) / 12) * 100 * q}%`, height: 32, background: i % 2 ? C.accent2 : C.accent, borderRadius: 6 }} />
                </div>
              </div>;
            })}
            <div style={{ display: 'flex', gap: 24, marginTop: 14, paddingLeft: 324 }}>
              {months.map((m, i) => <span key={i} style={{ ...CAPS(20, alpha(C.ink, 0.5)), flex: 1 }}>{m}</span>)}
            </div>
          </div>
          <Folio n="06" label="THE CALENDAR" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Miles" bg={C.ink} wipe="frameIn" wipeColor={C.accent2} camera="kenIn">{(p) => {
        const q = ease.inOut(p / 0.7);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            {[[300, 260, 1660, 520], [300, 260, 1420, 200], [300, 260, 1560, 700]].map(([x1, y1, x2, y2], i) => {
              const len = 2600;
              return <path key={i} d={`M${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 + 300} ${x2} ${y2}`} fill="none" stroke={i === 0 ? C.accent : alpha(C.cream, 0.35)} strokeWidth={i === 0 ? 6 : 3} strokeDasharray={len} strokeDashoffset={len * (1 - clamp((q - i * 0.14) / 0.6, 0, 1))} />;
            })}
            <circle cx="300" cy="260" r="16" fill={C.accent} />
          </svg>
          <div style={{ position: 'absolute', left: 150, bottom: 180, width: 900 }}>
            <div style={{ ...DISP(84, C.cream) }}>Two thousand miles for a courgette.</div>
            <Caption t="typical import routes, February" q={ease.out((p - 0.6) / 0.3)} color={alpha(C.cream, 0.7)} style={{ marginTop: 18 }} />
          </div>
        </div>;
      }}</Scene>

      <Scene name="Cost" bg={C.paper} wipe="columns" wipeColor={C.ink}>{(p) => {
        const rows = [['Weekly shop, unplanned', '£96'], ['Thrown away', '£28'], ['Takeaway on tired nights', '£34'], ['The same six meals', 'forever']];
        return <div style={PAGE}>
          <div style={CAPS(24, C.accent)}>THE WEEK, ADDED UP</div>
          <div style={{ marginTop: 36, maxWidth: 1420 }}>
            {rows.map(([k, v], i) => {
              const q = ease.out(stg(p, i, 0.08, 0.26));
              return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '18px 0', borderBottom: `1px solid ${alpha(C.ink, 0.24)}`, opacity: q, transform: `translateY(${(1 - q) * 32}px)` }}>
                <span style={DECK(46, C.ink)}>{k}</span><span style={{ flex: 1 }} />
                <span style={DISP(50, C.accent)}>{v}</span>
              </div>;
            })}
          </div>
          <div style={{ ...DISP(76, C.accent2), marginTop: 34, opacity: ease.out((p - 0.62) / 0.26) }}>£158, and Thursday still felt like a decision.</div>
          <Folio n="08" label="ARITHMETIC" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Turn" bg={C.accent2} wipe="wash" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="So we set a table." p={p} size={150} color={C.cream} font={FH} mode="rise" per={0.04} />
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.bg} wipe="fold" wipeColor={C.accent}>{(p) => <Chapter p={p} n="02" title="How the box is built" deck="Cut on Tuesday, written on Wednesday, cooked on Thursday." />}</Scene>

      <Scene name="Spread" bg={C.ink} wipe="bands" wipeColor={C.bg} camera="panR">{(p) => (
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - ease.out(p / 0.4)) * -100}%)` }}><Fill id="kt-spread-1" shape="rect" placeholder="DROP IMAGE" idle={C.shadow} /></div>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - ease.out((p - 0.12) / 0.4)) * 100}%)` }}><Fill id="kt-spread-2" shape="rect" placeholder="DROP IMAGE" idle={C.paper} /></div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 90, textAlign: 'center', opacity: ease.out((p - 0.5) / 0.3) }}>
            <span style={{ ...DISP(74, C.cream), background: C.ink, padding: '16px 40px' }}>A spread, not a menu.</span>
          </div>
        </div>)}
      </Scene>

      <Scene name="Recipe" bg={C.cream} wipe="columns" wipeColor={C.paper}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', gap: 80 }}>
          <div style={{ flex: '0 0 720px' }}>
            <div style={CAPS(22, C.accent)}>RECIPE NO. 41</div>
            <div style={{ ...DISP(88, C.ink), marginTop: 16 }}>Brown butter squash, sage, hazelnut</div>
            <Rule q={ease.inOut((p - 0.3) / 0.4)} color={C.accent} weight={3} style={{ marginTop: 26 }} />
            <div style={{ display: 'flex', gap: 50, marginTop: 26 }}>
              {[['SERVES', '2'], ['TIME', '35 min'], ['PANS', 'one']].map(([k, v], i) => (
                <div key={i} style={{ opacity: ease.out((p - 0.4 - i * 0.06) / 0.3) }}>
                  <div style={CAPS(18, alpha(C.ink, 0.55))}>{k}</div>
                  <div style={{ ...DISP(46, C.ink), marginTop: 4 }}>{v}</div>
                </div>))}
            </div>
          </div>
          <Slot id="kt-recipe" w={780} h={700} r={6} p={p} d={0.15} enter="right" />
        </div>)}
      </Scene>

      <Scene name="Ingredients" bg={C.paper} wipe="bands" wipeColor={C.cream}>{(p) => {
        const list = ['One crown prince squash', 'Butter, more than feels wise', 'A handful of sage', 'Toasted hazelnuts', 'Lemon, for the end'];
        return <div style={{ ...PAGE, display: 'flex', gap: 90 }}>
          <div style={{ flex: '0 0 640px' }}>
            <DropCap cap="T" text="The list is short because the box is fresh. When something arrives at its peak you spend your effort on heat and salt, not on rescuing it." p={p} capColor={C.accent} textColor={C.ink} width={600} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={CAPS(22, C.accent2)}>IN THE BOX</div>
            <div style={{ marginTop: 22 }}>
              {list.map((l, i) => {
                const q = ease.out(stg(p, i, 0.08, 0.26));
                return <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'baseline', padding: '12px 0', borderBottom: `1px solid ${alpha(C.ink, 0.16)}`, opacity: q, transform: `translateX(${(1 - q) * 40}px)` }}>
                  <span style={FIG(24, C.accent)}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={DECK(38, C.ink)}>{l}</span>
                </div>;
              })}
            </div>
          </div>
          <Folio n="14" label="INGREDIENTS" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Method" bg={C.cream} wipe="fold" wipeColor={C.accent2}>{(p) => {
        const steps = ['Halve, seed, roast cut-side down.', 'Brown the butter until it smells of nuts.', 'Crisp the sage, thirty seconds, no more.', 'Lemon over everything, at the table.'];
        return <div style={PAGE}>
          <div style={CAPS(24, C.accent)}>METHOD</div>
          <div style={{ marginTop: 30 }}>
            {steps.map((s, i) => {
              const q = ease.out(stg(p, i, 0.1, 0.3));
              return <div key={i} style={{ display: 'flex', gap: 34, alignItems: 'baseline', marginBottom: 22, opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
                <span style={{ ...DISP(90, C.accent2), width: 100 }}>{i + 1}</span>
                <span style={DISP(58, C.ink)}>{s}</span>
              </div>;
            })}
          </div>
          <Folio n="15" label="METHOD" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Timing" bg={C.ink} wipe="wash" wipeColor={C.accent} camera="kenIn">{(p) => {
        const q = ease.inOut(p / 0.7);
        const marks = [['0', 'oven on'], ['12', 'squash in'], ['26', 'butter'], ['35', 'table']];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 150, top: 240, right: 150 }}>
            <div style={{ ...DISP(84, C.cream), marginBottom: 110 }}>Thirty-five minutes, mapped.</div>
            <div style={{ position: 'relative', height: 200 }}>
              <div style={{ height: 6, background: alpha(C.cream, 0.2) }}>
                <div style={{ height: '100%', width: `${q * 100}%`, background: C.accent }} />
              </div>
              {marks.map(([m, l], i) => {
                const at = i / (marks.length - 1);
                const vis = ease.out((q * 1.12 - at) / 0.14);
                const last = i === marks.length - 1;
                return <div key={i} style={{ position: 'absolute', left: `${at * 100}%`, top: -12, opacity: vis, transform: last ? 'translateX(-100%)' : 'none', textAlign: last ? 'right' : 'left' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, background: C.accent }} />
                  <div style={{ ...DISP(48, C.cream), marginTop: 16 }}>{m}′</div>
                  <div style={CAPS(18, alpha(C.cream, 0.6))}>{l}</div>
                </div>;
              })}
            </div>
            <div style={{ display: 'flex', gap: 60, marginTop: 60 }}>
              {[['ONE PAN', 'nothing else to wash'], ['NO PREP', 'the box is already prepped'], ['ONE TIMER', 'set it and walk away']].map(([k, v], i) => {
                const q2 = ease.out(stg(p - 0.4, i, 0.1, 0.3));
                return <div key={i} style={{ flex: 1, borderTop: `3px solid ${C.accent}`, paddingTop: 18, opacity: q2, transform: `translateY(${(1 - q2) * 34}px)` }}>
                  <div style={CAPS(22, C.accent)}>{k}</div>
                  <div style={{ ...DECK(36, C.cream), marginTop: 6 }}>{v}</div>
                </div>;
              })}
            </div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Macro" bg={C.bg} wipe="columns" wipeColor={C.ink}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 26 }}>
          <Slot id="kt-macro-1" w={440} h={560} r={4} p={p} d={0.04} enter="rise" cap="SQUASH" capStyle={CAPS(18, C.ink)} />
          <Slot id="kt-macro-2" w={520} h={700} r={4} p={p} d={0.14} enter="rise" cap="SAGE" capStyle={CAPS(18, C.ink)} />
          <Slot id="kt-macro-3" w={440} h={520} r={4} p={p} d={0.24} enter="rise" cap="HAZELNUT" capStyle={CAPS(18, C.ink)} />
        </div>)}
      </Scene>

      <Scene name="Pantry" bg={C.paper} wipe="bands" wipeColor={C.accent2}>{(p) => {
        const cells = [['SALT', 'flaked, always'], ['ACID', 'lemon or vinegar'], ['FAT', 'butter, oil'], ['HEAT', 'chilli, pepper'], ['HERB', 'soft or woody'], ['CRUNCH', 'nut or crumb']];
        return <div style={PAGE}>
          <div style={{ ...DISP(80, C.ink), marginBottom: 34 }}>Six things that finish any plate.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {cells.map(([k, v], i) => {
              const q = ease.out(stg(p, i, 0.06, 0.24));
              return <div key={i} style={{ borderTop: `3px solid ${C.accent}`, paddingTop: 18, opacity: q, transform: `translateY(${(1 - q) * 34}px)` }}>
                <div style={CAPS(22, C.accent)}>{k}</div>
                <div style={{ ...DECK(38, C.ink), marginTop: 6 }}>{v}</div>
              </div>;
            })}
          </div>
          <Folio n="18" label="THE PANTRY" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Wine" bg={C.cream} wipe="wash" wipeColor={C.paper} camera="panL">{(p) => (
        <div style={{ ...PAGE, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="kt-wine" w={620} h={720} r={4} p={p} enter="left" />
          <div style={{ maxWidth: 780 }}>
            <div style={CAPS(22, C.accent2)}>ALONGSIDE</div>
            <div style={{ ...DISP(84, C.ink), marginTop: 16 }}>Something cold, something orange, nothing serious.</div>
            <div style={{ ...BODY(34, alpha(C.ink, 0.78)), marginTop: 22 }}>Every card carries one pairing note, written by someone who actually drank it with the dish.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Chef" bg={C.accent} wipe="frameIn" wipeColor={C.ink}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', alignItems: 'center', gap: 70 }}>
          <Slot id="kt-chef" w={480} h={600} r={4} p={p} enter="left" />
          <div style={{ maxWidth: 880 }}>
            <Words t="“A recipe is a schedule with flavour attached. Get the schedule right and everything else follows.”" p={p} d={0.15} per={0.04} style={DISP(70, C.cream)} />
            <div style={{ ...CAPS(22, C.ink), marginTop: 28, opacity: ease.out((p - 0.7) / 0.2) }}>ROSA LINDQVIST · HEAD OF KITCHEN</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.bg} wipe="fold" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="03" title="What people cooked" deck="Eight thousand kitchens, one Thursday at a time." />}</Scene>

      <Scene name="Stats" bg={C.cream} wipe="columns" wipeColor={C.paper}>{(p) => {
        const cols = [[41, '', 'recipes a season', C.accent], [96, '%', 'boxes cooked in full', C.accent2], [4, 'd', 'farm to doorstep', C.ink]];
        return <div style={{ ...PAGE, display: 'flex', alignItems: 'center' }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.3));
            return <React.Fragment key={i}>
              {i > 0 ? <div style={{ width: 1, alignSelf: 'stretch', background: alpha(C.ink, 0.25), margin: '0 60px' }} /> : null}
              <div style={{ flex: 1, opacity: q, transform: `translateY(${(1 - q) * 50}px)` }}>
                <div style={{ ...DISP(180, col), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.42} suffix={sfx} /></div>
                <Rule q={ease.inOut((p - 0.4 - i * 0.08) / 0.3)} color={col} weight={3} style={{ margin: '18px 0' }} />
                <div style={DECK(34, C.ink)}>{lbl}</div>
              </div>
            </React.Fragment>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Panel" bg={C.paper} wipe="bands" wipeColor={C.ink}>{(p) => {
        const rows = [['Flavour', 0.94], ['Ease', 0.88], ['Would cook again', 0.97], ['Portion size', 0.81]];
        return <div style={PAGE}>
          <div style={CAPS(24, C.accent)}>TASTE PANEL · 240 HOUSEHOLDS</div>
          <div style={{ marginTop: 40 }}>
            {rows.map(([k, v], i) => {
              const q = ease.inOut(stg(p, i, 0.09, 0.3));
              return <div key={i} style={{ marginBottom: 30, opacity: q > 0 ? 1 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={DECK(38, C.ink)}>{k}</span>
                  <span style={DISP(44, C.accent)}>{Math.round(v * 100 * q)}%</span>
                </div>
                <div style={{ height: 14, background: alpha(C.ink, 0.14), marginTop: 10 }}>
                  <div style={{ height: '100%', width: `${v * 100 * q}%`, background: i % 2 ? C.accent2 : C.accent }} />
                </div>
              </div>;
            })}
          </div>
          <Folio n="24" label="PANEL" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Plate" bg={C.ink} wipe="frameIn" wipeColor={C.accent} camera="kenIn">{(p, lt, raw) => {
        const split = ease.inOut(clamp((raw - 0.3) / 0.4, 0, 1));
        return <div style={MID}>
          <div style={{ position: 'relative', width: 1440, height: 640, overflow: 'hidden' }}>
            <Fill id="kt-plate-after" shape="rect" placeholder="DROP PLATED DISH" idle={C.shadow} />
            <div style={{ position: 'absolute', inset: 0, width: `${(1 - split) * 100}%`, overflow: 'hidden' }}>
              <div style={{ width: 1440, height: 640 }}><Fill id="kt-plate-before" shape="rect" placeholder="DROP RAW INGREDIENTS" idle={C.paper} /></div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(1 - split) * 100}%`, width: 4, background: C.cream }} />
          </div>
          <Caption t="the box, and the same box thirty-five minutes later" q={ease.out((p - 0.6) / 0.3)} color={alpha(C.cream, 0.75)} style={{ marginTop: 24 }} />
        </div>;
      }}</Scene>

      <Scene name="Testimonial" bg={C.cream} wipe="wash" wipeColor={C.accent2}>{(p) => (
        <div style={MID}>
          <div style={{ maxWidth: 1400, borderTop: `5px solid ${C.accent}`, borderBottom: `1px solid ${alpha(C.ink, 0.3)}`, padding: '46px 0' }}>
            <Words t="“We stopped deciding what to eat. It turns out that was the tiring part.”" p={p} per={0.045} style={DISP(84, C.ink)} />
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 34, opacity: ease.out((p - 0.6) / 0.3) }}>
              <LogoSlot id="kt-owner-1" size={72} p={p} d={0.6} shape="circle" />
              <span style={CAPS(22, alpha(C.ink, 0.7))}>JOSEPH & MIRA · SHEFFIELD</span>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Reviews" bg={C.accent2} wipe="bands" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Marquee items={['“the sage butter, honestly”', '“cooked every card this month”', '“no more Thursday panic”', '“the squash was still muddy”']} T={T} speed={110} size={54} style={{ top: 250, ...DISP(54, alpha(C.cream, 0.45)) }} />
          <Marquee items={['“my partner cooks now”', '“the pairing notes are a joy”', '“box goes straight in the compost”']} T={T} speed={88} dir={-1} size={54} style={{ bottom: 250, ...DISP(54, alpha(C.ink, 0.35)) }} />
          <div style={MID}>
            <div style={{ background: C.accent2, padding: '22px 50px' }}>
              <div style={DISP(170, C.cream)}><Counter target={8140} p={p} dur={0.55} /></div>
              <div style={{ ...CAPS(26, C.ink), textAlign: 'center' }}>DINNERS COOKED LAST THURSDAY</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.bg} wipe="columns" wipeColor={C.paper}>{(p) => {
        const rows = [['Cut on Tuesday', 'Picked green, ripened in transit'], ['Recipes written to the crop', 'Crop bought to the recipe'], ['Paper and pulp', 'Trays and film'], ['Four named farms', 'A distribution centre']];
        return <div style={PAGE}>
          <div style={{ display: 'flex', gap: 40, ...CAPS(22, C.accent), marginBottom: 12 }}>
            <div style={{ flex: 1 }}>TABLE SEVEN</div><div style={{ flex: 1, color: alpha(C.ink, 0.5) }}>THE ALTERNATIVE</div>
          </div>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 40, padding: '22px 0', borderTop: `1px solid ${alpha(C.ink, 0.24)}`, opacity: q, transform: `translateY(${(1 - q) * 34}px)` }}>
              <div style={{ flex: 1, ...DECK(40, C.ink) }}>{a}</div>
              <div style={{ flex: 1, ...DECK(40, alpha(C.ink, 0.45)) }}>{b}</div>
            </div>;
          })}
          <Folio n="28" label="COMPARISON" color={C.ink} />
        </div>;
      }}</Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.bg} wipe="fold" wipeColor={C.paper}>{(p) => <Chapter p={p} n="04" title="Who grows it" deck="Four farms, one courier, no distribution centre." />}</Scene>

      <Scene name="Farmers" bg={C.ink} wipe="bands" wipeColor={C.accent} camera="panL">{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {[0, 1, 2].map(i => {
              const q = ease.out(stg(p, i, 0.1, 0.34));
              return <div key={i} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - q) * (i % 2 ? 100 : -100)}%)` }}>
                  <Fill id={`kt-farm-${i}`} shape="rect" placeholder="DROP FARM IMAGE" idle={i % 2 ? C.shadow : C.paper} />
                </div>
              </div>;
            })}
          </div>
          <div style={{ position: 'absolute', left: 150, bottom: 140, opacity: ease.out((p - 0.5) / 0.3) }}>
            <span style={{ ...DISP(78, C.cream), background: C.ink, padding: '14px 34px' }}>Named, not sourced.</span>
          </div>
        </div>)}
      </Scene>

      <Scene name="Producers" bg={C.paper} wipe="columns" wipeColor={C.cream}>{(p) => {
        const rows = [['Wrenbury Farm', 'brassicas, roots', '18 mi'], ['Ashcombe', 'tomatoes, chilli', '31 mi'], ['Hollow Lane', 'salad, herbs', '9 mi'], ['Pike Dairy', 'butter, cream', '24 mi']];
        return <div style={PAGE}>
          <div style={CAPS(24, C.accent2)}>THE GROWERS</div>
          <div style={{ marginTop: 32 }}>
            {rows.map(([n, w, d], i) => {
              const q = ease.out(stg(p, i, 0.09, 0.28));
              return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 30, padding: '20px 0', borderBottom: `1px solid ${alpha(C.ink, 0.2)}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
                <span style={{ ...DISP(58, C.ink), flex: '0 0 480px' }}>{n}</span>
                <span style={{ ...BODY(32, alpha(C.ink, 0.7)), flex: 1 }}>{w}</span>
                <span style={FIG(34, C.accent)}>{d}</span>
              </div>;
            })}
          </div>
          <Folio n="31" label="GROWERS" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Grain" bg={C.cream} wipe="frameIn" wipeColor={C.accent2} camera="kenOut">{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0 }}><Fill id="kt-texture" shape="rect" placeholder="DROP TEXTURE IMAGE" idle={C.paper} /></div>
          <Drift T={T} n={20} colors={[C.cream, C.paper]} opacity={0.5} size={7} speed={18} />
          <div style={{ position: 'absolute', left: 150, top: 300, width: 900, opacity: ease.out((p - 0.3) / 0.35) }}>
            <span style={{ ...DISP(96, C.ink), background: C.cream, padding: '10px 26px', lineHeight: 1.4 }}>Soil, weather, luck.</span>
          </div>
        </div>)}
      </Scene>

      <Scene name="Map" bg={C.ink} wipe="wash" wipeColor={C.accent} camera="kenIn">{(p, lt) => {
        const pins = [[560, 320], [820, 470], [700, 590], [1080, 380], [1280, 540], [1420, 330]];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 460, top: 240, width: 1100, height: 420, border: `1px solid ${alpha(C.cream, 0.2)}` }} />
          {pins.map(([x, y], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 20, height: 20, borderRadius: 999, background: C.accent, transform: `scale(${q})`, boxShadow: `0 0 0 ${5 + Math.sin(lt * 2.4 + i) * 4}px ${alpha(C.accent, 0.26)}` }} />;
          })}
          <div style={{ position: 'absolute', left: 150, bottom: 160, width: 760 }}>
            <div style={{ ...DISP(76, C.cream) }}>Everything within forty miles.</div>
            <Caption t="collection routes, Tuesday" q={ease.out((p - 0.6) / 0.3)} color={alpha(C.cream, 0.7)} style={{ marginTop: 16 }} />
          </div>
        </div>;
      }}</Scene>

      <Scene name="Plans" bg={C.bg} wipe="columns" wipeColor={C.ink}>{(p) => {
        const plans = [['Two plates', '£38', 'three recipes a week'], ['Four plates', '£62', 'three recipes, doubled'], ['The long table', '£96', 'five recipes, six plates']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 24 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.3)); const hero = i === 1;
            return <div key={i} style={{ width: 470, background: hero ? C.ink : C.paper, padding: '46px 40px', boxSizing: 'border-box', textAlign: 'left', opacity: q, transform: `translateY(${(1 - q) * 90}px)`, borderTop: `6px solid ${hero ? C.accent : C.accent2}` }}>
              <div style={CAPS(20, hero ? C.accent : C.accent2)}>{n.toUpperCase()}</div>
              <div style={{ ...DISP(110, hero ? C.cream : C.ink), marginTop: 12 }}>{price}</div>
              <div style={{ ...BODY(30, hero ? alpha(C.cream, 0.78) : alpha(C.ink, 0.72)), marginTop: 12 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Thursday" bg={C.accent} wipe="bands" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <div style={CAPS(26, C.ink)}>IT ARRIVES</div>
          <Chars t="THURSDAY" p={p} d={0.15} size={230} color={C.cream} font={FH} mode="drop" per={0.045} />
          <div style={{ ...DECK(44, C.ink), marginTop: 20, opacity: ease.out((p - 0.5) / 0.3) }}>Before six, in a box you can compost.</div>
        </div>)}
      </Scene>

      <Scene name="Packaging" bg={C.paper} wipe="fold" wipeColor={C.cream}>{(p, lt, raw) => {
        const open = ease.inOut(clamp((raw - 0.3) / 0.4, 0, 1));
        return <div style={MID}>
          <div style={{ position: 'relative', width: 940, height: 560, overflow: 'hidden' }}>
            <Fill id="kt-pack" shape="rect" placeholder="DROP BOX IMAGE" idle={C.shadow} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: C.paper, transformOrigin: '50% 0', transform: `translateY(${-open * 100}%)` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', background: C.paper, transformOrigin: '50% 100%', transform: `translateY(${open * 100}%)` }} />
          </div>
          <Caption t="pulp tray, paper sleeve, no film" q={ease.out((p - 0.6) / 0.3)} color={alpha(C.ink, 0.7)} style={{ marginTop: 22 }} />
        </div>;
      }}</Scene>

      <Scene name="Planet" bg={C.accent2} wipe="wash" wipeColor={C.cream}>{(p) => {
        const cols = [[0, '', 'plastic in the box'], [94, '%', 'less food waste'], [40, ' mi', 'longest journey']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 90 }}>
          {cols.map(([n, sfx, lbl], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.3));
            return <div key={i} style={{ width: 420, opacity: q, transform: `translateY(${(1 - q) * 50}px)` }}>
              <div style={DISP(160, C.cream)}><Counter target={n} p={p} d={i * 0.1} dur={0.42} suffix={sfx} /></div>
              <Rule q={ease.inOut((p - 0.4) / 0.3)} color={C.ink} weight={3} style={{ margin: '16px 0' }} />
              <div style={DECK(32, C.ink)}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="FAQ" bg={C.cream} wipe="bands" wipeColor={C.paper}>{(p) => {
        const qs = [['Can I skip a week?', 'Any Sunday, from the email.'], ['Fussy household?', 'Swap any card for another.'], ['No time on Thursday?', 'Everything keeps to Sunday.']];
        return <div style={PAGE}>
          {qs.map(([q1, a1], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ borderTop: `2px solid ${C.accent}`, paddingTop: 20, marginBottom: 34, opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
              <div style={DISP(60, C.ink)}>{q1}</div>
              <div style={{ ...BODY(36, alpha(C.ink, 0.75)), marginTop: 8 }}>{a1}</div>
            </div>;
          })}
          <Folio n="38" label="QUESTIONS" color={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.bg} wipe="columns" wipeColor={C.accent} camera="panR">{(p) => (
        <div style={{ ...PAGE, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="kt-founder" w={560} h={720} r={4} p={p} enter="left" />
          <div style={{ maxWidth: 820 }}>
            <div style={CAPS(22, C.accent)}>HOW IT STARTED</div>
            <div style={{ ...DISP(76, C.ink), marginTop: 16 }}>A glut of tomatoes and nobody to eat them.</div>
            <DropCap cap="I" text="In 2019 a farm two villages over was ploughing fruit back into the ground because the buyer changed the spec. We took a van, wrote four recipes, and knocked on doors." p={p} d={0.35} capColor={C.accent2} textColor={C.ink} width={760} />
          </div>
        </div>)}
      </Scene>

      {/* ===== 05 ===== */}
      <Scene name="Ch5" bg={C.bg} wipe="fold" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="05" title="Come to the table" deck="First box half price, and nothing to cancel." />}</Scene>

      <Scene name="Guarantee" bg={C.cream} wipe="frameIn" wipeColor={C.accent}>{(p) => {
        const q = ease.out((p - 0.16) / 0.3);
        return <div style={MID}>
          <div style={{ border: `4px solid ${C.ink}`, padding: '40px 80px', opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
            <div style={{ ...DISP(110, C.ink), textAlign: 'center' }}>COOK IT ONCE</div>
            <Rule q={ease.inOut((p - 0.4) / 0.3)} color={C.accent} weight={3} style={{ margin: '18px 0' }} />
            <div style={{ ...CAPS(30, C.accent), textAlign: 'center' }}>OR THE BOX IS ON US</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Referral" bg={C.ink} wipe="wash" wipeColor={C.accent2}>{(p) => (
        <div style={MID}>
          <div style={CAPS(24, C.accent)}>GIVE A BOX, GET A BOX</div>
          <div style={{ ...DISP(150, C.cream), marginTop: 16, letterSpacing: '0.06em' }}>TABLE38</div>
          <div style={{ ...BODY(36, alpha(C.cream, 0.72)), marginTop: 20 }}>Every friend who cooks feeds you next Thursday.</div>
        </div>)}
      </Scene>

      <Scene name="Price" bg={C.accent} wipe="bands" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 30 }}>
            <span style={{ ...DISP(200, alpha(C.ink, 0.45)), textDecoration: 'line-through' }}>£38</span>
            <span style={{ ...DISP(280, C.cream), opacity: ease.out((p - 0.3) / 0.3) }}>£19</span>
          </div>
          <div style={{ ...DECK(46, C.ink), marginTop: 20 }}>first box, three recipes, six plates</div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.bg} wipe="columns" wipeColor={C.ink}>{(p) => {
        const bq = ease.out((p - 0.24) / 0.3);
        return <div style={{ ...PAGE, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="kt-cta" w={700} h={760} r={4} p={p} enter="left" />
          <div>
            <LogoSlot id="kt-logo-cta" size={120} p={p} d={0.1} shape="rounded" style={{ borderRadius: 8, marginBottom: 26 }} />
            <div style={DISP(112, C.ink)}>Set a place</div>
            <div style={DISP(112, C.accent)}>for Thursday.</div>
            <div style={{ display: 'inline-block', marginTop: 38, opacity: bq, transform: `translateY(${(1 - bq) * 30}px) scale(${1 + Math.sin(T * 3) * 0.012})`, background: C.ink, color: C.cream, ...DECK(44, C.cream), fontWeight: 700, padding: '24px 62px' }}>Choose your box →</div>
            <div style={{ ...CAPS(26, alpha(C.ink, 0.7)), marginTop: 26 }}>TABLESEVEN.CO</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="frameIn" wipeColor={C.bg} camera="kenOut">{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.55 }}><Fill id="kt-end" shape="rect" placeholder="DROP CLOSING IMAGE" idle={C.shadow} /></div>
          <div style={{ position: 'absolute', left: 150, bottom: 160, right: 150 }}>
            <Chars t="Kitchen Table" p={p} size={150} color={C.cream} font={FH} mode="rise" per={0.035} />
            <Rule q={ease.inOut((p - 0.4) / 0.4)} color={C.accent} weight={6} style={{ marginTop: 24 }} />
            <div style={{ ...CAPS(24, alpha(C.cream, 0.7)), marginTop: 20 }}>SEASONAL RECIPE BOXES · TABLESEVEN.CO</div>
          </div>
        </div>;
      }}</Scene>

      <Garnish />
    </div>
  );
}

window.KitchenTableFilm = function KitchenTableFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
