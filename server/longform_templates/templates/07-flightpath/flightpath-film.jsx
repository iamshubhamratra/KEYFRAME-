/* KEYFRAME long-form template 07 — FLIGHTPATH
   Motion world: cinematic nature. Multi-plane parallax skies, long slow drifts
   that accelerate, floating air particles, dissolve and horizon transitions,
   elegant light typography over dominant photography. Calm, immersive, premium. */
const K = window.FilmKit;
const { ease, stg, rnd, Words, Chars, Typed, Counter, Marquee, Slot, LogoSlot, Fill, Drift, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-neutral-900', '#20241f'),
  bg: DS('--color-bg', '#e9e4d6'),
  dusk: DS('--color-neutral-800', '#3c4438'),
  mist: DS('--color-neutral-300', '#cfd6c6'),
  cream: DS('--color-neutral-100', '#fbf8f0'),
  dawn: DS('--color-accent-200', '#e8cba8'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');

/* ---- transition language: atmospheric — dissolves, horizons, light ---- */
const TR = {
  dissolve: (p, col) => {
    const q = ease.inOut(clamp(p / 0.22, 0, 1)), o = p > 0.84 ? ease.inOut((p - 0.84) / 0.16) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, opacity: Math.max(1 - q, o) }} />;
  },
  horizon: (p, col) => {
    const q = ease.inOut(clamp(p / 0.22, 0, 1)), o = p > 0.85 ? ease.inOut((p - 0.85) / 0.15) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${v * 50}%`, background: col }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${v * 50}%`, background: col }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: alpha(C.cream, 0.5), opacity: v > 0.04 ? v : 0 }} />
    </div>;
  },
  rise: (p, col) => {
    const q = ease.inOut(clamp(p / 0.24, 0, 1)), o = p > 0.85 ? ease.inOut((p - 0.85) / 0.15) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: col, transform: `translateY(${(1 - v) * 102}%)` }} />
    </div>;
  },
  bloom: (p, col) => {
    const q = ease.inOut(clamp(p / 0.24, 0, 1)), o = p > 0.85 ? ease.inOut((p - 0.85) / 0.15) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(circle at 50% 45%, ${col} ${v * 70}%, transparent ${v * 100 + 6}%)`, opacity: v > 0.03 ? 1 : 0 }} />;
  },
  veil: (p, col) => {
    const q = ease.inOut(clamp(p / 0.22, 0, 1)), o = p > 0.85 ? ease.inOut((p - 0.85) / 0.15) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 270, height: 271, background: col, opacity: clamp(v * 1.3 - i * 0.08, 0, 1), transform: `translateY(${(1 - v) * -30 * (i + 1)}px)` }} />
      ))}
    </div>;
  },
};
/* ---- cameras: long, slow, then quickening ---- */
const CAM = {
  soar: (p) => ({ transform: `scale(${1.04 + p * 0.05}) translateY(${20 - p * 60}px)` }),
  descend: (p) => ({ transform: `scale(${1.06 - p * 0.04}) translateY(${-30 + p * 70}px)` }),
  glideR: (p) => ({ transform: `scale(1.05) translateX(${50 - p * 110}px)` }),
  glideL: (p) => ({ transform: `scale(1.05) translateX(${-50 + p * 110}px)` }),
  hover: (p) => ({ transform: `translateY(${Math.sin(p * 4) * 9}px) scale(1.01)` }),
  quicken: (p) => ({ transform: `scale(${1.02 + ease.in(p) * 0.06}) translateX(${-ease.in(p) * 70}px)` }),
};
/* ---- world: the continuously running background ----
   A banded dawn sky, coloured cloud layers, a skein in V formation, a lone bird
   ahead of it, a second flock high and small, altitude ticks, rising pollen. */
const AMB = 1.0;
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Dawn: 'INTRO',
  Scale: 'DATA',
  Ch1: 'PROBLEM',
  Decline: 'DATA',
  Quiet: 'PROBLEM',
  Quote1: 'PROBLEM',
  Causes: 'DATA',
  Night: 'PROBLEM',
  Estuary: 'PROBLEM',
  Stopover: 'DATA',
  Glass: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Mic: 'FEATURE',
  Waveform: 'FEATURE',
  Route: 'FEATURE',
  Species: 'DATA',
  Feature2: 'FEATURE',
  Signal: 'DATA',
  Volunteers: 'FEATURE',
  Colony: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  Season: 'DATA',
  Clock2: 'MOMENT',
  Recovery: 'DATA',
  Sound: 'FEATURE',
  Wide: 'MOMENT',
  Open2: 'SOLUTION',
  Papers: 'FEATURE',
  Cities: 'DATA',
  Quote2: 'MOMENT',
  Reviews: 'SOLUTION',
  Compare: 'DATA',
  Ch4: 'CTA',
  Actions: 'FEATURE',
  Schools: 'FEATURE',
  Adopt: 'DATA',
  Archive: 'FEATURE',
  Founder: 'INTRO',
  Tonight: 'MOMENT',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own sky as one decor layer. Scene energy drives the flocks,
   so the skein crosses faster on an energetic beat than a still one. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const cr = (a) => K.alpha(C.cream, a);
  const Bird = ({ x, y, s, f, o, col }) => {
    const w = 9 + Math.sin(f) * 8;
    return <path d={`M ${x} ${y} q ${13 * s} ${-w * s} ${26 * s} 0 M ${x + 26 * s} ${y} q ${13 * s} ${-w * s} ${26 * s} 0`}
      fill="none" stroke={col || cr(o)} strokeWidth={2.6 * s} strokeLinecap="round" />;
  };
  const sx = -420 + ((t * 0.035 * s.energy) % 1) * (W2 + 840);
  const lx = -160 + ((t * 0.075 * s.energy) % 1) * (W2 + 320);
  const hx = W2 + 200 - ((t * 0.05 * s.energy) % 1) * (W2 + 400);
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[[0, C.dawn, 0.1], [190, C.accent, 0.07], [420, C.accent2, 0.06], [700, C.mist, 0.06]].map(([y, c, a], k) => (
        <rect key={k} x={0} y={y} width={W2} height={k === 3 ? H2 - 700 : 200} fill={K.alpha(c, a)} />))}
      {[0, 1, 2].map(k => {
        const dr = ((t * (5 + k * 4)) % (W2 + 900)) - 450;
        return <ellipse key={k} cx={dr} cy={200 + k * 210} rx={340 - k * 60} ry={54 - k * 10} fill={K.alpha(k === 1 ? C.dawn : C.cream, 0.07)} />;
      })}
      {[0, 1, 2].map(k => {
        const dr = ((t * (3 + k * 2) + 700) % (W2 + 1100)) - 550;
        return <ellipse key={'c' + k} cx={dr} cy={620 + k * 150} rx={420 - k * 70} ry={40 - k * 6} fill={K.alpha(k === 0 ? C.accent2 : C.cream, 0.05)} />;
      })}
      <circle cx={280} cy={210} r={92} fill={K.alpha(C.dawn, 0.22)} />
      {[[0, 0], [1, 1], [-1, 1], [2, 2], [-2, 2], [3, 3], [-3, 3], [4, 4], [-4, 4], [5, 5], [-5, 5]].map(([col, row], k) => (
        <Bird key={k} x={sx + row * 74} y={250 + col * 40 + Math.sin(t * 1.1 + k) * 9} s={0.95} f={t * 5.4 + k * 0.7} o={0.4} />))}
      <Bird x={lx} y={430 + Math.sin(t * 0.8) * 40} s={1.9} f={t * 4.2} col={K.alpha(C.accent, 0.55)} />
      {[0, 1, 2, 3, 4].map(k => (
        <Bird key={'h' + k} x={hx + k * 46} y={132 + (k % 2) * 22 + Math.sin(t * 0.9 + k) * 6} s={0.5} f={t * 6.6 + k} o={0.26} />))}
      {Array.from({ length: 12 }).map((_, k) => {
        const y = H2 - ((t * 0.05 + k * 0.084) % 1) * (H2 + 100);
        return <g key={'a' + k}>
          <line x1={64} y1={y} x2={k % 3 === 0 ? 116 : 92} y2={y} stroke={K.alpha(k % 3 === 0 ? C.dawn : C.cream, 0.22)} strokeWidth={2} />
          <line x1={W2 - 64} y1={y} x2={W2 - (k % 3 === 0 ? 116 : 92)} y2={y} stroke={K.alpha(k % 3 === 0 ? C.dawn : C.cream, 0.22)} strokeWidth={2} />
        </g>;
      })}
      {Array.from({ length: 26 }).map((_, k) => {
        const ph = (t * 0.03 + k * 0.038) % 1;
        return <circle key={'p' + k} cx={((k * 271) % W2) + Math.sin(t * 0.3 + k) * 40} cy={H2 - ph * (H2 + 60)} r={2.4}
          fill={K.alpha(k % 3 === 0 ? C.accent : C.dawn, 0.38)} />;
      })}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'INTRO',
  hues: [C.dawn, C.accent2, C.accent, C.mist],
  ink: C.ink, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['FLIGHTPATH · A NATURE FILM', 'TWENTY YEARS OF MIGRATION', 'RECORDED, NOT ESTIMATED', 'MOST OF IT HAPPENS AT NIGHT', 'NINE HUNDRED MICROPHONES'];
const FOOTS = ['recorded above ordinary roofs', 'the archive is public, and always was', 'four hundred volunteers maintain the poles', 'counted by sound alone', 'nothing here is unfixable'];
const SIDES = ['LISTEN · COUNT · PROTECT', 'FOUR MILLION CALLS A SEASON', 'LIGHTS OUT, MIDNIGHT TO DAWN'];

/* Both composition-level: per-scene they would double at every cut. */
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
    <div style={{ position: 'absolute', top: 44, right: 120, fontFamily: FB, fontWeight: 800, fontSize: 20, letterSpacing: '0.2em', textTransform: 'uppercase', color: alpha(c, 0.6), border: `2px solid ${alpha(c, 0.3)}`, borderRadius: 999, padding: '10px 26px', transform: `rotate(${Math.sin(t * 1.1 + i) * 1.4}deg)` }}>{TAGS[i % TAGS.length]}</div>
    <div style={{ position: 'absolute', bottom: 42, left: 120, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ width: 46, height: 4, borderRadius: 999, background: C.accent }} />
      <div style={{ fontFamily: FB, fontWeight: 600, fontStyle: 'italic', fontSize: 23, color: alpha(c, 0.6) }}>{FOOTS[i % FOOTS.length]}</div>
    </div>
    {i % 2 === 0
      ? <div style={{ position: 'absolute', left: 34, top: 340, writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: FB, fontWeight: 800, fontSize: 17, letterSpacing: '0.34em', textTransform: 'uppercase', color: alpha(c, 0.62) }}>{SIDES[(i >> 1) % SIDES.length]}</div>
      : <svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute', right: 62, bottom: 44, opacity: 0.55 }}>
          <g transform={`rotate(${t * 26} 35 35)`}>
            {[0, 1, 2, 3, 4, 5].map(k => <line key={k} x1={35} y1={10} x2={35} y2={26} stroke={C.accent} strokeWidth={5} strokeLinecap="round" transform={`rotate(${k * 60} 35 35)`} />)}
          </g>
        </svg>}
  </div>;
}

/* light, wide-tracked type — the opposite of the sport template */
const LIGHT = (s, c) => ({ fontFamily: FB, fontWeight: 400, fontSize: s, letterSpacing: '0.01em', lineHeight: 1.14, color: c, margin: 0 });
const SET = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.06, color: c, margin: 0, fontWeight: 400 });
const NUM = (s, c) => ({ fontFamily: FB, fontWeight: 400, fontSize: s, letterSpacing: '-0.01em', lineHeight: 0.94, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.6, color: c, margin: 0, fontWeight: 400 });
const CAPS = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 600, letterSpacing: '0.34em', color: c, margin: 0, textTransform: 'uppercase' });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 200px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '160px 170px', boxSizing: 'border-box' };

/* ---- atmosphere ---- */
/* multi-plane parallax sky — the template's structural signature */
const RIDGE = Array.from({ length: 4 }).map((_, i) =>
  `polygon(0 ${70 - i * 8}%, 12% ${52 - i * 6}%, 26% ${66 - i * 7}%, 40% ${44 - i * 5}%, 55% ${62 - i * 6}%, 70% ${40 - i * 4}%, 84% ${58 - i * 6}%, 100% ${46 - i * 5}%, 100% 100%, 0 100%)`);
function Sky({ T, planes = 4, tint = C.mist, base = C.dusk, speed = 1 }) {
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: base }}>
    {Array.from({ length: planes }).map((_, i) => {
      const depth = (i + 1) / planes;
      const x = -((T * 14 * speed * depth) % 640);
      return <div key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300 + i * 190, opacity: 0.18 + i * 0.14, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -640, bottom: 0, width: W + 1280, height: '100%', background: `linear-gradient(180deg, transparent, ${alpha(tint, 0.5 + i * 0.12)})`, clipPath: RIDGE[i % 4], transform: `translateX(${x}px)` }} />
      </div>;
    })}
  </div>;
}
function Birds({ T, n = 7, color, y = 320, spread = 240, speed = 90 }) {
  return <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
    {Array.from({ length: n }).map((_, i) => {
      const x = ((T * speed + i * 210) % (W + 500)) - 250;
      const yy = y + Math.sin(T * 1.2 + i) * 18 + rnd(i) * spread;
      const flap = 8 + Math.sin(T * 6 + i * 1.7) * 7;
      const s = 0.5 + rnd(i + 5) * 0.8;
      return <path key={i} d={`M${x} ${yy} q ${14 * s} ${-flap * s} ${28 * s} 0 M${x + 28 * s} ${yy} q ${14 * s} ${-flap * s} ${28 * s} 0`} fill="none" stroke={color} strokeWidth={2.4 * s} strokeLinecap="round" opacity={0.35 + rnd(i + 2) * 0.4} />;
    })}
  </svg>;
}
function Air({ T, color, n = 30 }) {
  return <Drift T={T} n={n} colors={[color, alpha(color, 0.5)]} opacity={0.35} size={6} speed={14} sway={70} />;
}
function Hair({ q = 1, color, style }) {
  return <div style={{ height: 1, background: color, transform: `scaleX(${q})`, transformOrigin: '0 50%', ...style }} />;
}
function Chapter({ p, n, title, deck }) {
  const q = ease.inOut(p / 0.5);
  return <div style={{ position: 'absolute', inset: 0 }}>
    <Sky T={p * 24} tint={C.mist} base={C.dusk} />
    <Air T={p * 24} color={C.cream} n={22} />
    <Birds T={p * 20} color={C.cream} y={240} n={5} />
    <div style={{ position: 'absolute', left: 170, top: 400, opacity: ease.out((p - 0.2) / 0.4) }}>
      <div style={CAPS(20, C.dawn)}>PART {n}</div>
      <div style={{ ...SET(96, C.cream), marginTop: 20 }}>{title}</div>
      <Hair q={q} color={alpha(C.cream, 0.5)} style={{ width: 460, marginTop: 26 }} />
      {deck ? <div style={{ ...LIGHT(34, alpha(C.cream, 0.8)), marginTop: 24, maxWidth: 820 }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  return <div style={{ position: 'absolute', top: 52, left: 60, display: 'flex', alignItems: 'center', gap: 14, pointerEvents: 'none' }}>
    <div style={{ width: 30, height: 30, borderRadius: 999, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}><Fill id="fp-mark" shape="circle" placeholder="LOGO" /></div>
    <span style={{ ...CAPS(19, C.cream), textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>{(window.OM_TWEAKS || {}).brandName || 'FLIGHTPATH'}</span>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.dusk} wipe="dissolve" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} />
          <Air T={T} color={C.cream} />
          <Birds T={T} color={C.cream} y={260} n={9} />
          <div style={MID}>
            <LogoSlot id="fp-logo" size={130} p={p} d={0.05} shape="circle" />
            <div style={{ marginTop: 30 }}>
              <Chars t="Flightpath" p={p} d={0.2} size={190} color={C.cream} font={FH} mode="rise" per={0.045} />
            </div>
            <div style={{ ...CAPS(22, C.dawn), marginTop: 22, opacity: ease.out((p - 0.55) / 0.35) }}>TWENTY YEARS OF MIGRATION, MAPPED</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.ink} wipe="horizon" wipeColor={C.dusk}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.6 }}><Fill id="fp-hero" shape="rect" placeholder="DROP SKY IMAGE" idle={C.dusk} /></div>
          <Air T={T} color={C.cream} n={20} />
          <div style={MID}>
            <div style={{ maxWidth: 1500 }}>
              <Words t="Every autumn, four billion birds leave without being told." p={p} per={0.06} dy={30} style={SET(104, C.cream)} />
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Scale" bg={C.dawn} wipe="bloom" wipeColor={C.cream}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 100 }}>
          <div>
            <div style={NUM(340, C.ink)}><Counter target={11000} p={p} dur={0.6} /></div>
            <div style={{ ...CAPS(20, alpha(C.ink, 0.6)), marginTop: 20 }}>KILOMETRES · BAR-TAILED GODWIT, NON-STOP</div>
          </div>
          <div style={{ maxWidth: 620 }}>
            <div style={{ ...LIGHT(40, C.ink) }}>Nine days in the air. No food, no water, no landing.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.dusk} wipe="veil" wipeColor={C.ink}>{(p) => <Chapter p={p} n="ONE" title="What we are losing" deck="Three billion fewer birds than in 1970, and most of the decline is unremarkable species." />}</Scene>

      <Scene name="Decline" bg={C.cream} wipe="rise" wipeColor={C.mist}>{(p) => {
        const years = [1970, 1985, 2000, 2015, 2025];
        const vals = [1.0, 0.88, 0.74, 0.63, 0.58];
        const q = ease.inOut(p / 0.7);
        const pts = vals.map((v, i) => [230 + i * 360, 780 - v * 480]);
        const shown = Math.max(2, Math.ceil(q * pts.length));
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 170, top: 180, ...SET(76, C.ink) }}>The line nobody watched.</div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.slice(0, shown).map(a => a.join(',')).join(' ')} fill="none" stroke={C.accent} strokeWidth="5" />
            {pts.slice(0, shown).map((a, i) => <circle key={i} cx={a[0]} cy={a[1]} r="9" fill={C.ink} />)}
          </svg>
          <div style={{ position: 'absolute', left: 200, bottom: 190, display: 'flex', gap: 268 }}>
            {years.map((y, i) => <span key={i} style={CAPS(18, alpha(C.ink, 0.55))}>{y}</span>)}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Quiet" bg={C.mist} wipe="dissolve" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <div style={{ ...NUM(300, C.accent) }}><Counter target={29} p={p} dur={0.5} suffix="%" /></div>
          <Hair q={ease.inOut((p - 0.35) / 0.4)} color={alpha(C.ink, 0.4)} style={{ width: 520, margin: '30px 0' }} />
          <div style={{ ...LIGHT(42, C.ink), maxWidth: 1100 }}>of North American birdlife, gone within one human lifetime.</div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.dusk} wipe="veil" wipeColor={C.accent}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} speed={0.6} />
          <div style={MID}>
            <div style={{ maxWidth: 1480, minHeight: 300 }}>
              <Typed t="The sky sounded different, and we had no recording to prove it." p={p} lt={lt} dur={0.6} caretColor={C.dawn} style={SET(86, C.cream)} />
            </div>
            <div style={{ ...CAPS(19, C.dawn), marginTop: 36, opacity: ease.out((p - 0.72) / 0.2) }}>FIELD ORNITHOLOGIST · FORTY YEARS ON ONE ESTUARY</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Causes" bg={C.cream} wipe="rise" wipeColor={C.dawn}>{(p) => {
        const rows = [['Habitat loss', 0.42], ['Light pollution', 0.19], ['Glass collisions', 0.16], ['Pesticides', 0.14], ['Climate shift', 0.09]];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...CAPS(20, C.accent), marginBottom: 34 }}>ATTRIBUTED CAUSES</div>
          {rows.map(([k, v], i) => {
            const q = ease.inOut(stg(p, i, 0.09, 0.3));
            return <div key={i} style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={LIGHT(38, C.ink)}>{k}</span>
                <span style={NUM(38, C.accent)}>{Math.round(v * 100 * q)}%</span>
              </div>
              <div style={{ height: 3, background: alpha(C.ink, 0.14), marginTop: 12 }}>
                <div style={{ height: '100%', width: `${v * 100 * q}%`, background: i % 2 ? C.accent2 : C.accent }} />
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Night" bg={C.ink} wipe="bloom" wipeColor={C.dawn}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 60 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: rnd(i) * 1900, top: rnd(i + 40) * 1000, width: 3, height: 3, borderRadius: 999, background: C.cream, opacity: 0.2 + Math.abs(Math.sin(lt + i)) * 0.6 }} />
          ))}
          <Birds T={T} color={alpha(C.dawn, 0.9)} y={420} n={11} speed={64} />
          <div style={{ position: 'absolute', left: 170, bottom: 200, width: 1100 }}>
            <div style={SET(84, C.cream)}>Most of it happens at night, above your house.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Turn" bg={C.accent} wipe="horizon" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="So we started listening." p={p} size={128} color={C.cream} font={FH} mode="rise" per={0.035} />
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.dusk} wipe="dissolve" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="TWO" title="How the network works" deck="Nine hundred microphones, one shared clock, and a model trained on birdsong." />}</Scene>

      <Scene name="Mic" bg={C.mist} wipe="rise" wipeColor={C.cream}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <div style={{ flex: '0 0 700px' }}>
            <div style={CAPS(20, C.accent)}>THE INSTRUMENT</div>
            <div style={{ ...SET(88, C.ink), marginTop: 20 }}>A microphone on a pole, listening upward.</div>
            <Hair q={ease.inOut((p - 0.4) / 0.4)} color={alpha(C.ink, 0.35)} style={{ width: 420, margin: '26px 0' }} />
            <div style={{ ...LIGHT(36, alpha(C.ink, 0.8)) }}>Solar, cellular, weatherproof. Nine hundred of them, from Alaska to Tierra del Fuego.</div>
          </div>
          <Slot id="fp-mic" w={760} h={660} r={10} p={p} d={0.15} enter="right" />
        </div>)}
      </Scene>

      <Scene name="Waveform" bg={C.ink} wipe="veil" wipeColor={C.dusk}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 170, right: 170, top: 380 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 240 }}>
              {Array.from({ length: 70 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 8 + Math.abs(Math.sin(lt * 3 + i * 0.4)) * (30 + rnd(i) * 170) * clamp(p * 4, 0, 1), background: i % 8 === 0 ? C.dawn : alpha(C.cream, 0.75), borderRadius: 99 }} />
              ))}
            </div>
            <div style={{ ...CAPS(19, C.dawn), marginTop: 40, opacity: ease.out((p - 0.4) / 0.3) }}>SWAINSON'S THRUSH · 03:14 · CONFIDENCE 0.97</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Route" bg={C.cream} wipe="bloom" wipeColor={C.accent2}>{(p, lt, raw) => {
        const q = ease.inOut(clamp(raw / 0.85, 0, 1));
        const px = 300 + q * 1300, py = 800 - Math.sin(q * Math.PI) * 460;
        return <div style={{ position: 'absolute', inset: 0 }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <path d="M300 800 Q 950 180 1600 760" fill="none" stroke={alpha(C.ink, 0.16)} strokeWidth="4" />
            <path d="M300 800 Q 950 180 1600 760" fill="none" stroke={C.accent} strokeWidth="4" strokeDasharray="2400" strokeDashoffset={2400 * (1 - q)} />
            <circle cx={px} cy={py} r="11" fill={C.ink} />
          </svg>
          <div style={{ position: 'absolute', left: 170, bottom: 170 }}>
            <div style={CAPS(19, alpha(C.ink, 0.55))}>TIERRA DEL FUEGO</div>
          </div>
          <div style={{ position: 'absolute', right: 170, bottom: 170, textAlign: 'right', opacity: q > 0.9 ? 1 : 0.4 }}>
            <div style={CAPS(19, alpha(C.ink, 0.55))}>ARCTIC ALASKA</div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 170, textAlign: 'center' }}>
            <div style={SET(74, C.ink)}>One bird, tracked by sound alone.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Species" bg={C.dawn} wipe="dissolve" wipeColor={C.cream}>{(p) => {
        const names = ['Swainson’s thrush', 'Bobolink', 'Blackpoll warbler', 'Sanderling', 'Whimbrel', 'Common nighthawk', 'Veery', 'Dickcissel'];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...CAPS(20, darken(C.accent, 0.3)), marginBottom: 30 }}>IDENTIFIED THIS WEEK</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 60px' }}>
            {names.map((n, i) => {
              const q = ease.out(stg(p, i, 0.06, 0.26));
              return <div key={i} style={{ borderBottom: `1px solid ${alpha(C.ink, 0.22)}`, padding: '16px 0', opacity: q, transform: `translateY(${(1 - q) * 24}px)`, ...SET(48, C.ink) }}>{n}</div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Feature2" bg={C.dusk} wipe="rise" wipeColor={C.mist}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} speed={0.5} />
          <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90, flexDirection: 'row-reverse' }}>
            <div style={{ flex: '0 0 680px' }}>
              <div style={CAPS(20, C.dawn)}>THE MODEL</div>
              <div style={{ ...SET(84, C.cream), marginTop: 20 }}>Trained on a million labelled seconds.</div>
              <div style={{ ...LIGHT(36, alpha(C.cream, 0.82)), marginTop: 24 }}>It separates eleven overlapping calls in a single recording — something no human ear does reliably at 3am.</div>
            </div>
            <Slot id="fp-model" w={800} h={600} r={10} p={p} d={0.15} enter="left" />
          </div>
        </div>)}
      </Scene>

      <Scene name="Volunteers" bg={C.cream} wipe="veil" wipeColor={C.accent2}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 22 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.out(stg(p, i, 0.09, 0.3));
              return <div key={i} style={{ width: 250, height: 320, borderRadius: 8, overflow: 'hidden', opacity: q, transform: `translateY(${(1 - q) * 90}px)` }}>
                <Fill id={`fp-vol-${i}`} shape="rect" placeholder="DROP PORTRAIT" idle={C.mist} />
              </div>;
            })}
          </div>
          <div style={{ ...SET(70, C.ink), marginTop: 50 }}>Four hundred volunteers maintain the poles.</div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.dusk} wipe="bloom" wipeColor={C.dawn}>{(p) => <Chapter p={p} n="THREE" title="What the sky told us" deck="Three seasons of continuous recording, and one unexpected result." />}</Scene>

      <Scene name="Stats" bg={C.mist} wipe="dissolve" wipeColor={C.cream}>{(p) => {
        const cols = [[912, '', 'listening stations', C.accent], [4.1, 'M', 'calls identified', C.accent2], [37, '', 'species recovered', C.ink]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 0 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.11, 0.3));
            return <React.Fragment key={i}>
              {i > 0 ? <div style={{ width: 1, height: 260, background: alpha(C.ink, 0.25), margin: '0 70px' }} /> : null}
              <div style={{ width: 400, opacity: q, transform: `translateY(${(1 - q) * 50}px)` }}>
                <div style={{ ...NUM(150, col), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.11} dur={0.45} decimals={i === 1 ? 1 : 0} suffix={sfx} /></div>
                <div style={{ ...CAPS(18, alpha(C.ink, 0.6)), marginTop: 22 }}>{lbl}</div>
              </div>
            </React.Fragment>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Recovery" bg={C.cream} wipe="rise" wipeColor={C.accent2}>{(p) => {
        const bars = [0.3, 0.34, 0.41, 0.52, 0.66, 0.78];
        const q = ease.inOut(p / 0.7);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...SET(78, C.ink), marginBottom: 44 }}>Where the lights went off, the birds came back.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 30, height: 400 }}>
            {bars.map((v, i) => (
              <div key={i} style={{ flex: 1, height: 360 * v * q, background: i > 3 ? C.accent2 : C.mist, borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ ...CAPS(18, alpha(C.ink, 0.55)), marginTop: 22 }}>SIX CITIES · LIGHTS-OUT ORDINANCE, YEAR ONE TO SIX</div>
        </div>;
      }}</Scene>

      <Scene name="Wide" bg={C.ink} wipe="horizon" wipeColor={C.dusk}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.72 }}><Fill id="fp-wide" shape="rect" placeholder="DROP LANDSCAPE IMAGE" idle={C.dusk} /></div>
          <Air T={T} color={C.cream} n={24} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 170, textAlign: 'center', opacity: ease.out((p - 0.35) / 0.4) }}>
            <div style={{ ...SET(88, C.cream), textShadow: '0 4px 30px rgba(0,0,0,0.6)' }}>Nothing about this is unfixable.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Reviews" bg={C.dusk} wipe="veil" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} speed={0.4} />
          <Marquee items={['“the first continent-scale dataset”', '“it changed our lighting policy”', '“open, and audited”']} T={T} speed={70} size={44} style={{ top: 250, ...LIGHT(44, alpha(C.cream, 0.4)) }} />
          <Marquee items={['“cited in eleven papers”', '“our council adopted it”', '“volunteers run the network”']} T={T} speed={54} dir={-1} size={44} style={{ bottom: 260, ...LIGHT(44, alpha(C.dawn, 0.55)) }} />
          <div style={MID}>
            <div style={{ ...NUM(180, C.cream) }}><Counter target={4128000} p={p} dur={0.6} /></div>
            <div style={{ ...CAPS(20, C.dawn), marginTop: 20 }}>CALLS IDENTIFIED THIS SEASON</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.dusk} wipe="rise" wipeColor={C.mist}>{(p) => <Chapter p={p} n="FOUR" title="What you can do tonight" deck="Three actions, one of them takes a light switch." />}</Scene>

      <Scene name="Actions" bg={C.cream} wipe="dissolve" wipeColor={C.dawn}>{(p) => {
        const acts = [['Turn the lights off', 'between midnight and dawn, in migration season'], ['Mark the glass', 'dots at 5cm spacing, outside face'], ['Let it grow', 'one unmown corner is a food supply']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {acts.map(([t2, s2], i) => {
            const q = ease.out(stg(p, i, 0.11, 0.3));
            return <div key={i} style={{ borderTop: `1px solid ${alpha(C.ink, 0.25)}`, paddingTop: 24, marginBottom: 40, opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
              <div style={{ display: 'flex', gap: 30, alignItems: 'baseline' }}>
                <span style={NUM(52, C.accent)}>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div style={SET(62, C.ink)}>{t2}</div>
                  <div style={{ ...LIGHT(32, alpha(C.ink, 0.7)), marginTop: 8 }}>{s2}</div>
                </div>
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Adopt" bg={C.mist} wipe="bloom" wipeColor={C.accent}>{(p) => {
        const plans = [['Listener', '£4', 'a month, one station'], ['Patron', '£20', 'a month, a whole pole'], ['Institution', 'Custom', 'a regional array']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 30 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.3)); const hero = i === 1;
            return <div key={i} style={{ width: 470, background: hero ? C.dusk : C.cream, padding: '48px 40px', boxSizing: 'border-box', textAlign: 'left', opacity: q, transform: `translateY(${(1 - q) * 70}px)` }}>
              <div style={CAPS(18, hero ? C.dawn : C.accent)}>{n.toUpperCase()}</div>
              <div style={{ ...NUM(104, hero ? C.cream : C.ink), marginTop: 16 }}>{price}</div>
              <div style={{ ...LIGHT(30, hero ? alpha(C.cream, 0.8) : alpha(C.ink, 0.7)), marginTop: 12 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.cream} wipe="veil" wipeColor={C.dusk}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Slot id="fp-founder" w={540} h={680} r={8} p={p} enter="left" />
          <div style={{ maxWidth: 840 }}>
            <div style={CAPS(20, C.accent)}>HOW IT STARTED</div>
            <div style={{ ...SET(70, C.ink), marginTop: 20 }}>One microphone, on a shed roof, in 2004.</div>
            <div style={{ ...LIGHT(34, alpha(C.ink, 0.78)), marginTop: 22 }}>It recorded eleven thousand calls in a single September night. We have been building outward from that tape ever since.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.dusk} wipe="horizon" wipeColor={C.ink}>{(p) => {
        const bq = ease.out((p - 0.25) / 0.35);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} />
          <Birds T={T} color={C.cream} y={250} n={8} />
          <Air T={T} color={C.cream} n={22} />
          <div style={MID}>
            <LogoSlot id="fp-logo-cta" size={120} p={p} d={0.05} shape="circle" />
            <div style={{ ...SET(104, C.cream), marginTop: 28 }}>Adopt a listening station.</div>
            <Hair q={ease.inOut((p - 0.4) / 0.4)} color={alpha(C.dawn, 0.7)} style={{ width: 560, marginTop: 26 }} />
            <div style={{ display: 'inline-block', marginTop: 40, opacity: bq, transform: `translateY(${(1 - bq) * 26}px)`, border: `1px solid ${C.cream}`, color: C.cream, ...CAPS(24, C.cream), padding: '22px 56px' }}>SUPPORT THE NETWORK</div>
            <div style={{ ...CAPS(19, alpha(C.cream, 0.65)), marginTop: 26 }}>FLIGHTPATH.ORG</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="dissolve" wipeColor={C.dusk}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
          <Sky T={T} tint={C.mist} base={C.ink} speed={0.5} />
          <Birds T={T} color={alpha(C.dawn, 0.8)} y={300} n={10} speed={70} />
          <div style={MID}>
            <Chars t="Flightpath" p={p} size={170} color={C.cream} font={FH} mode="rise" per={0.04} />
            <div style={{ ...CAPS(20, C.dawn), marginTop: 24, opacity: ease.out((p - 0.5) / 0.35) }}>FLIGHTPATH.ORG</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Dawn" bg={C.dawn} wipe="bloom" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.dawn} base={C.dawn} speed={0.4} />
          <Birds T={T} color={alpha(C.ink, 0.5)} y={220} n={12} speed={70} />
          <div style={{ position: 'absolute', left: 170, bottom: 200, width: 1200 }}>
            <div style={CAPS(20, darken(C.accent, 0.3))}>04:52 · FIRST LIGHT</div>
            <div style={{ ...SET(96, C.ink), marginTop: 20 }}>The loudest hour of the year.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Estuary" bg={C.ink} wipe="horizon" wipeColor={C.mist}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.68 }}><Fill id="fp-estuary" shape="rect" placeholder="DROP ESTUARY IMAGE" idle={C.dusk} /></div>
          <div style={{ position: 'absolute', left: 170, top: 200, width: 900 }}>
            <div style={{ ...SET(84, C.cream), textShadow: '0 4px 26px rgba(0,0,0,0.6)' }}>Every route narrows to a handful of places.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Stopover" bg={C.cream} wipe="rise" wipeColor={C.mist}>{(p) => {
        const sites = [['Delaware Bay', '1.2M'], ['Copper River', '5.0M'], ['Wadden Sea', '6.1M'], ['Bay of Fundy', '2.4M']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...CAPS(20, C.accent), marginBottom: 30 }}>CRITICAL STOPOVERS · PEAK BIRDS</div>
          {sites.map(([n, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 26, padding: '20px 0', borderBottom: `1px solid ${alpha(C.ink, 0.2)}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <span style={SET(58, C.ink)}>{n}</span><span style={{ flex: 1 }} />
              <span style={NUM(52, C.accent)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Glass" bg={C.mist} wipe="veil" wipeColor={C.cream}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 90 }}>
          <div>
            <div style={NUM(300, C.accent)}><Counter target={1} p={p} dur={0.4} suffix="bn" /></div>
            <div style={{ ...CAPS(18, alpha(C.ink, 0.6)), marginTop: 20 }}>WINDOW COLLISIONS A YEAR</div>
          </div>
          <div style={{ maxWidth: 620, textAlign: 'left' }}>
            <div style={LIGHT(40, C.ink)}>Dots on the outside of the glass, five centimetres apart, prevent most of them.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Colony" bg={C.dusk} wipe="dissolve" wipeColor={C.ink}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} speed={0.5} />
          <Birds T={T} color={C.cream} y={180} n={16} speed={110} />
          <Birds T={T * 0.8} color={alpha(C.cream, 0.6)} y={420} n={12} speed={80} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 180, textAlign: 'center' }}>
            <div style={{ ...SET(86, C.cream) }}>Forty thousand in one frame.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Season" bg={C.cream} wipe="rise" wipeColor={C.dawn}>{(p) => {
        const months = ['MAR', 'APR', 'MAY', 'AUG', 'SEP', 'OCT'];
        const vals = [0.3, 0.72, 0.94, 0.5, 0.88, 0.62];
        const q = ease.inOut(p / 0.7);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...SET(76, C.ink), marginBottom: 44 }}>Two waves, six months apart.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 34, height: 400 }}>
            {vals.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 340 * v * q, background: i < 3 ? C.accent2 : C.accent, borderRadius: 2 }} />
                <div style={{ ...CAPS(17, alpha(C.ink, 0.55)), marginTop: 16 }}>{months[i]}</div>
              </div>))}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Clock2" bg={C.ink} wipe="bloom" wipeColor={C.dawn}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: rnd(i) * 1900, top: rnd(i + 20) * 1000, width: 2, height: 2, borderRadius: 999, background: C.cream, opacity: 0.2 + Math.abs(Math.sin(lt * 0.8 + i)) * 0.5 }} />
          ))}
          <div style={MID}>
            <div style={{ ...CAPS(20, C.dawn), marginBottom: 24 }}>PEAK PASSAGE</div>
            <div style={NUM(260, C.cream)}>02:40</div>
            <div style={{ ...LIGHT(38, alpha(C.cream, 0.8)), marginTop: 26 }}>Two hours and forty minutes after midnight, every night in September.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Signal" bg={C.mist} wipe="veil" wipeColor={C.accent2}>{(p) => {
        const rows = [['Calls per hour, rural', '412'], ['Calls per hour, city', '96'], ['Detection radius', '340m'], ['False positives', '0.3%']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1420 }}>
          <div style={{ ...CAPS(20, C.accent), marginBottom: 28 }}>WHAT ONE POLE HEARS</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '18px 0', borderBottom: `1px solid ${alpha(C.ink, 0.2)}`, opacity: q }}>
              <span style={LIGHT(40, C.ink)}>{k}</span><span style={{ flex: 1 }} />
              <span style={NUM(44, C.accent2)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Open2" bg={C.dawn} wipe="dissolve" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <div style={{ maxWidth: 1400 }}>
            <Words t="The whole archive is public, and always was." p={p} per={0.055} dy={26} style={SET(96, C.ink)} />
          </div>
          <Hair q={ease.inOut((p - 0.4) / 0.4)} color={alpha(C.ink, 0.4)} style={{ width: 500, marginTop: 34 }} />
        </div>)}
      </Scene>

      <Scene name="Papers" bg={C.cream} wipe="rise" wipeColor={C.mist}>{(p) => {
        const items = ['Nocturnal flight calls as a census tool', 'Urban light and passage density', 'Acoustic detection of declining passerines', 'Volunteer networks at continental scale'];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...CAPS(20, C.accent), marginBottom: 30 }}>CITED IN</div>
          {items.map((it, i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ borderTop: `1px solid ${alpha(C.ink, 0.22)}`, padding: '22px 0', opacity: q, transform: `translateY(${(1 - q) * 30}px)`, ...SET(52, C.ink) }}>{it}</div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Cities" bg={C.dusk} wipe="bloom" wipeColor={C.accent}>{(p, lt) => {
        const pins = [[520, 340], [780, 470], [660, 620], [1020, 400], [1240, 580], [1420, 350], [900, 700]];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} speed={0.3} />
          {pins.map(([x, y], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 18, height: 18, borderRadius: 999, background: C.dawn, opacity: q, boxShadow: `0 0 ${10 + Math.sin(lt * 2 + i) * 8}px ${alpha(C.dawn, 0.8)}` }} />;
          })}
          <div style={{ position: 'absolute', left: 170, bottom: 180, width: 1000 }}>
            <div style={SET(76, C.cream)}>Seven cities now dim their towers in September.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Schools" bg={C.cream} wipe="veil" wipeColor={C.dawn}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Slot id="fp-school" w={780} h={620} r={8} p={p} enter="left" />
          <div style={{ maxWidth: 660 }}>
            <div style={CAPS(20, C.accent2)}>IN CLASSROOMS</div>
            <div style={{ ...SET(76, C.ink), marginTop: 20 }}>Two hundred schools run a pole of their own.</div>
            <div style={{ ...LIGHT(34, alpha(C.ink, 0.75)), marginTop: 22 }}>The data goes into the same archive as everyone else's.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Sound" bg={C.ink} wipe="horizon" wipeColor={C.dusk}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 170, right: 170, top: 300 }}>
            <div style={{ ...CAPS(20, C.dawn), marginBottom: 40 }}>ONE NIGHT, COMPRESSED TO NINE SECONDS</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 320 }}>
              {Array.from({ length: 96 }).map((_, i) => {
                const on = i / 96 < clamp(p * 1.1, 0, 1);
                const h = on ? 10 + Math.abs(Math.sin(i * 0.7 + lt)) * (20 + rnd(i) * 250) : 4;
                return <div key={i} style={{ flex: 1, height: h, background: i % 12 === 0 ? C.dawn : alpha(C.cream, 0.6) }} />;
              })}
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote2" bg={C.mist} wipe="dissolve" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <div style={{ maxWidth: 1420 }}>
            <Words t="“We stopped arguing about whether it was happening and started arguing about what to do.”" p={p} per={0.045} dy={26} style={SET(80, C.ink)} />
          </div>
          <div style={{ ...CAPS(18, alpha(C.ink, 0.6)), marginTop: 34, opacity: ease.out((p - 0.7) / 0.2) }}>CITY SUSTAINABILITY LEAD · TORONTO</div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.cream} wipe="rise" wipeColor={C.dusk}>{(p) => {
        const rows = [['Continuous, all night', 'Dawn counts, by ear'], ['Nine hundred fixed points', 'Wherever volunteers went'], ['Open archive', 'Papers behind paywalls'], ['Species-level, automated', 'Genus-level, if lucky']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', gap: 60, padding: '26px 0', borderTop: `1px solid ${alpha(C.ink, 0.22)}`, opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
              <div style={{ flex: 1, ...LIGHT(38, C.ink) }}>{a}</div>
              <div style={{ flex: 1, ...LIGHT(38, alpha(C.ink, 0.45)) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Tonight" bg={C.accent} wipe="bloom" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="It starts tonight." p={p} size={132} color={C.cream} font={FH} mode="rise" per={0.035} />
          <div style={{ ...LIGHT(40, alpha(C.cream, 0.85)), marginTop: 30, opacity: ease.out((p - 0.45) / 0.3) }}>Somewhere above your roof, right now.</div>
        </div>)}
      </Scene>

      <Scene name="Archive" bg={C.dusk} wipe="veil" wipeColor={C.mist}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sky T={T} tint={C.mist} base={C.dusk} speed={0.4} />
          <div style={{ ...MID }}>
            <Slot id="fp-archive" w={1300} h={560} r={8} p={p} enter="zoom" />
            <div style={{ ...CAPS(19, alpha(C.cream, 0.7)), marginTop: 28, opacity: ease.out((p - 0.45) / 0.3) }}>THE ARCHIVE · 4.1 MILLION LABELLED CALLS</div>
          </div>
        </div>)}
      </Scene>

      <Garnish />
    </div>
  );
}

window.FlightpathFilm = function FlightpathFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
