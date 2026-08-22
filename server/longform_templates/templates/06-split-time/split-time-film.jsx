/* KEYFRAME long-form template 06 — SPLIT TIME
   Motion world: speed. Motion-trail ghosting, skewed kinetic layouts, oversized
   tabular numerals, split-flap lap times, streak and slam transitions.
   Everything enters fast, overshoots, and settles hard. */
const K = window.FilmKit;
const { ease, stg, rnd, Words, Chars, Typed, Counter, Roll, Marquee, Slot, LogoSlot, Fill, Burst, Drift, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-text', '#17150f'),
  bg: DS('--color-bg', '#f3ebdd'),
  cream: DS('--color-neutral-100', '#fffdf7'),
  track: DS('--color-neutral-900', '#2a261c'),
  chalk: DS('--color-neutral-300', '#cfc4ae'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');
const SKEW = -7; /* the whole template leans */

/* ---- transition language: streaks, slams, sweeps ---- */
const TR = {
  streak: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.014) / 0.11, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: '-20%', top: i * 108, width: '140%', height: 109, background: col, transform: `translateX(${(1 - v) * -125}%) skewX(${SKEW}deg)` }} />;
      })}
    </div>;
  },
  slam: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    const v = Math.max(1 - ease.out(clamp(p / 0.1, 0, 1)), o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, transform: `scaleY(${v})`, transformOrigin: '50% 100%' }} />;
  },
  chevron: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.018) / 0.11, 0, 1)), o);
        return <div key={i} style={{ flex: 1, background: col, transform: `translateY(${(1 - v) * (i % 2 ? -104 : 104)}%) skewY(${SKEW / 2}deg)` }} />;
      })}
    </div>;
  },
  swipeUp: (p, col) => {
    const o = p > 0.9 ? ease.in((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - ease.out(clamp(p / 0.12, 0, 1)), o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, transform: `translateY(${(1 - v) * 103}%)` }} />;
  },
  flash: (p, col) => {
    const o = p > 0.92 ? clamp((p - 0.92) / 0.08, 0, 1) : 0;
    const v = Math.max(1 - clamp(p / 0.07, 0, 1), o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, opacity: v }} />;
  },
};
/* ---- cameras: fast, with overshoot and shake ---- */
const CAM = {
  dash: (p) => ({ transform: `translateX(${(1 - ease.back(Math.min(p / 0.12, 1))) * 900}px)` }),
  drop: (p) => ({ transform: `translateY(${(1 - ease.back(Math.min(p / 0.13, 1))) * -700}px)` }),
  kick: (p) => ({ transform: `scale(${1 + (1 - ease.back(Math.min(p / 0.11, 1))) * 0.2})` }),
  shake: (p) => { const s = 1 - clamp(p / 0.22, 0, 1); return { transform: `translate(${Math.sin(p * 90) * 16 * s}px, ${Math.cos(p * 74) * 12 * s}px)` }; },
  leanIn: (p) => ({ transform: `skewX(${(1 - ease.out(p / 0.2)) * 8}deg) scale(${1.03 - ease.out(p / 0.4) * 0.03})` }),
  cruise: (p) => ({ transform: `translateX(${-p * 46}px)` }),
};
/* ---- world: the continuously running background ----
   Coloured lane bands, three runners at different depths trailing ghosts, a
   sweeping stopwatch, scrolling markers, split flags, a rising bar readout. */
const AMB = 1.8;
const LANES = [C.accent, C.accent2, '#c9a227', '#3c7fa8', K.lighten(C.accent, 0.3)];
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Clock: 'DATA',
  Fade: 'DATA',
  Ch1: 'PROBLEM',
  Wall: 'PROBLEM',
  Pace: 'DATA',
  Stat1: 'DATA',
  Quote1: 'PROBLEM',
  Splits: 'DATA',
  Drift: 'DATA',
  Fuel: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Feature1: 'FEATURE',
  Target: 'MOMENT',
  Feature2: 'FEATURE',
  Hydration: 'FEATURE',
  Feature3: 'DATA',
  Taper: 'DATA',
  Track: 'FEATURE',
  Kit: 'FEATURE',
  Audio: 'MOMENT',
  Coach: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  Even: 'DATA',
  Weather: 'FEATURE',
  Finish: 'MOMENT',
  Reviews: 'SOLUTION',
  Compare: 'DATA',
  Ch4: 'SOLUTION',
  Montage: 'DATA',
  Distances: 'FEATURE',
  Club: 'FEATURE',
  Plans: 'DATA',
  Recovery: 'DATA',
  Founder: 'INTRO',
  Ch5: 'CTA',
  Free: 'MOMENT',
  Referral: 'CTA',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own speed props as one decor layer. Scene energy drives the
   runner's cadence, so a MOMENT beat literally runs faster than a PROBLEM beat. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const cr = (a) => K.alpha(C.cream, a);
  const Runner = ({ x, y, s, o, ph, col }) => {
    const stride = Math.sin(ph), lift = Math.abs(Math.sin(ph)) * 14 * s;
    return <g transform={`translate(${x},${y - lift}) scale(${s}) skewX(-7)`} opacity={o}>
      <circle cx={0} cy={-118} r={26} fill={cr(0.82)} />
      <path d="M 0 -94 L -6 -18" stroke={col} strokeWidth={20} strokeLinecap="round" />
      <line x1={-4} y1={-84} x2={38 * stride} y2={-46} stroke={cr(0.82)} strokeWidth={14} strokeLinecap="round" />
      <line x1={-4} y1={-84} x2={-40 * stride} y2={-52} stroke={cr(0.82)} strokeWidth={14} strokeLinecap="round" />
      <line x1={-6} y1={-18} x2={34 * stride} y2={44} stroke={cr(0.82)} strokeWidth={16} strokeLinecap="round" />
      <line x1={-6} y1={-18} x2={-32 * stride} y2={44} stroke={cr(0.82)} strokeWidth={16} strokeLinecap="round" />
    </g>;
  };
  const lead = -340 + ((t * 0.13 * s.energy) % 1) * (W2 + 680);
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {LANES.map((c, k) => (
        <rect key={k} x={-200} y={H2 - 230 + k * 58} width={W2 + 400} height={54} fill={K.alpha(c, 0.07)} transform="skewX(-7)" />))}
      {Array.from({ length: 14 }).map((_, k) => (
        <rect key={k} x={((k * 180 - t * 300) % (W2 + 180)) - 90} y={H2 - 148} width={96} height={5} fill={K.alpha(C.accent, 0.24)} transform="skewX(-7)" />))}
      {Array.from({ length: 12 }).map((_, k) => {
        const ph = (t * 0.5 + k * 0.083) % 1;
        return <rect key={'s' + k} x={-260 + ph * (W2 + 520)} y={120 + ((k * 137) % 800)} width={130 + (k % 4) * 90} height={3}
          fill={K.alpha(LANES[k % LANES.length], 0.2 * (1 - Math.abs(ph - 0.5) * 1.4))} transform="skewX(-7)" />;
      })}
      <Runner x={lead - 620} y={H2 - 316} s={0.62} o={0.2} ph={t * 11.4} col={K.alpha(LANES[3], 0.8)} />
      <Runner x={lead - 300} y={H2 - 282} s={0.8} o={0.28} ph={t * 10.6} col={K.alpha(LANES[2], 0.8)} />
      <Runner x={lead} y={H2 - 250} s={1} o={0.1} ph={t * 10} col={cr(0.5)} />
      <Runner x={lead - 60} y={H2 - 250} s={1} o={0.2} ph={t * 10} col={cr(0.6)} />
      <Runner x={lead - 120} y={H2 - 250} s={1} o={0.52} ph={t * 10} col={K.alpha(C.accent, 0.9)} />
      <g transform={`translate(${W2 - 250},250)`} opacity={0.34}>
        <circle r={122} fill={K.alpha(C.accent2, 0.1)} />
        <circle r={122} fill="none" stroke={cr(0.36)} strokeWidth={11} />
        <rect x={-18} y={-142} width={36} height={20} rx={3} fill={K.alpha(C.accent, 0.7)} />
        {Array.from({ length: 20 }).map((_, k) => (
          <line key={k} x1={0} y1={-104} x2={0} y2={k % 5 === 0 ? -84 : -92} stroke={cr(0.32)} strokeWidth={k % 5 === 0 ? 6 : 3} transform={`rotate(${k * 18})`} />))}
        <line x1={0} y1={0} x2={Math.cos(t * 3.4 - 1.57) * 98} y2={Math.sin(t * 3.4 - 1.57) * 98} stroke={C.accent} strokeWidth={5} strokeLinecap="round" />
        <line x1={0} y1={0} x2={Math.cos(t * 0.28 - 1.57) * 62} y2={Math.sin(t * 0.28 - 1.57) * 62} stroke={K.alpha(LANES[2], 0.9)} strokeWidth={7} strokeLinecap="round" />
        <circle r={9} fill={C.accent} />
      </g>
      <g transform={`translate(120,150)`} opacity={0.3}>
        {Array.from({ length: 9 }).map((_, k) => {
          const h = 22 + Math.abs(Math.sin(t * 1.1 + k * 0.7)) * 92;
          return <rect key={k} x={k * 40} y={120 - h} width={26} height={h} fill={K.alpha(LANES[k % LANES.length], 0.6)} transform="skewX(-7)" />;
        })}
      </g>
      {[0, 1, 2].map(k => {
        const ph = (t * 0.22 + k * 0.33) % 1;
        return <g key={'f' + k} transform={`translate(${W2 + 60 - ph * (W2 + 240)},${300 + k * 190})`} opacity={0.24}>
          <line x1={0} y1={0} x2={0} y2={-72} stroke={cr(0.5)} strokeWidth={4} />
          <path d="M 0 -72 l 62 16 l -62 16 z" fill={K.alpha(LANES[k], 0.85)} />
        </g>;
      })}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent, C.accent2, K.lighten(C.accent, 0.26), C.chalk],
  ink: C.ink, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['SPLIT · A RUNNING FILM', 'RUN THE SECOND HALF FASTER', 'PACE IS A PLAN', 'THE WALL IS ARITHMETIC', 'ONE NUMBER, IN YOUR EAR'];
const FOOTS = ['timed with an actual stopwatch', 'every split here was run', 'the taper is the part people skip', 'no negative split was faked', 'measured at the finish mat'];
const SIDES = ['PACE · HOLD · FINISH', 'EVEN SPLITS, EVERY TIME', 'EIGHTEEN WEEKS, ONE CURVE'];

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

const BIG = (s, c) => ({ fontFamily: FB, fontWeight: 800, fontSize: s, letterSpacing: '-0.05em', lineHeight: 0.86, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const SET = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.02, color: c, margin: 0, fontWeight: 400 });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.4, color: c, margin: 0, fontWeight: 500 });
const TAG = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 800, letterSpacing: '0.2em', color: c, margin: 0, textTransform: 'uppercase' });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 140px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '140px 150px', boxSizing: 'border-box' };

/* ---- speed furniture ---- */
function Trails({ T, n = 14, color, o = 0.5 }) {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    {Array.from({ length: n }).map((_, i) => {
      const x = ((T * (220 + rnd(i) * 340) + i * 260) % (W + 900)) - 450;
      return <div key={i} style={{ position: 'absolute', left: x, top: 60 + rnd(i + 9) * 960, width: 160 + rnd(i + 3) * 420, height: 4 + rnd(i + 5) * 5, background: color, opacity: o * (0.3 + rnd(i + 7) * 0.7), transform: `skewX(${SKEW}deg)`, borderRadius: 99 }} />;
    })}
  </div>;
}
/* ghosted echo of a label — the signature motion-trail treatment */
function Ghost({ t, style, color, n = 4, dx = 44, dy = 0 }) {
  return <div style={{ position: 'relative' }}>
    {Array.from({ length: n }).map((_, i) => {
      const k = n - i;
      return <div key={i} style={{ position: 'absolute', left: -k * dx, top: -k * dy, ...style, color, opacity: 0.1 + i * 0.06, whiteSpace: 'nowrap' }}>{t}</div>;
    })}
    <div style={{ position: 'relative', ...style, whiteSpace: 'nowrap' }}>{t}</div>
  </div>;
}
/* split-flap lap clock */
const FLAP = '0123456789';
function Lap({ t, p, size, color, bg, d = 0 }) {
  return <div style={{ display: 'flex', gap: 6 }}>
    {String(t).split('').map((ch, i) => {
      if (ch === ':' || ch === '.') return <div key={i} style={{ ...BIG(size, color), padding: '0 2px' }}>{ch}</div>;
      const q = stg(p - d, i, 0.05, 0.24);
      const show = q >= 1 ? ch : FLAP[Math.floor(q * 16 + i) % 10];
      return <div key={i} style={{ background: bg, borderRadius: 8, padding: '10px 12px', ...BIG(size, color), transform: `rotateX(${(1 - q) * 70}deg)`, transformOrigin: '50% 55%' }}>{show}</div>;
    })}
  </div>;
}
function Bib({ n, color, ink, style }) {
  return <div style={{ display: 'inline-block', background: color, padding: '10px 22px', borderRadius: 6, transform: `skewX(${SKEW}deg)`, ...style }}>
    <span style={{ ...TAG(24, ink), display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>{n}</span>
  </div>;
}
function Chapter({ p, n, title, deck }) {
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.track }}>
    <Trails T={p * 12} n={16} color={alpha(C.accent, 0.5)} />
    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
      const q = ease.out(stg(p, i, 0.02, 0.24));
      return <div key={i} style={{ position: 'absolute', left: '-20%', top: i * 136, width: '140%', height: 137, background: i % 2 ? alpha(C.cream, 0.05) : 'transparent', transform: `translateX(${(1 - q) * -130}%) skewX(${SKEW}deg)` }} />;
    })}
    <div style={{ position: 'absolute', left: 150, top: 330, opacity: ease.out((p - 0.25) / 0.3) }}>
      <Ghost t={n} style={BIG(280, C.cream)} color={C.accent} n={4} dx={54} />
      <div style={{ ...SET(84, C.accent), marginTop: 14 }}>{title}</div>
      {deck ? <div style={{ ...BODY(34, alpha(C.cream, 0.7)), marginTop: 16, maxWidth: 860 }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  return <div style={{ position: 'absolute', top: 40, left: 48, display: 'flex', alignItems: 'center', gap: 12, background: C.ink, padding: '8px 20px 8px 8px', borderRadius: 6, pointerEvents: 'none', transform: `skewX(${SKEW}deg)` }}>
    <div style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden', transform: `skewX(${-SKEW}deg)` }}><Fill id="st-mark" shape="rounded" radius={4} placeholder="LOGO" /></div>
    <span style={{ ...TAG(22, C.cream), transform: `skewX(${-SKEW}deg)`, display: 'inline-block' }}>{(window.OM_TWEAKS || {}).brandName || 'SPLIT'}</span>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.track} wipe="streak" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <Trails T={T} n={16} color={alpha(C.accent, 0.45)} />
          <LogoSlot id="st-logo" size={140} p={p} d={0.05} shape="rounded" style={{ borderRadius: 10 }} />
          <div style={{ marginTop: 24, position: 'relative' }}>
            <Chars t="SPLIT" p={p} d={0.16} size={250} color={C.cream} font={FB} mode="drop" per={0.05} style={{ fontWeight: 800, letterSpacing: '-0.06em' }} />
          </div>
          <div style={{ ...TAG(26, C.accent), marginTop: 16, opacity: ease.out((p - 0.5) / 0.3) }}>RUN THE SECOND HALF FASTER</div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.accent} wipe="slam" wipeColor={C.ink}>{(p) => (
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {['EVERY RUNNER', 'SLOWS DOWN', 'AT 32K.'].map((l, i) => {
            const q = ease.back(stg(p, i, 0.09, 0.24));
            return <div key={i} style={{ ...BIG(i === 2 ? 190 : 130, i === 2 ? C.ink : C.cream), marginLeft: i * 110, opacity: q, transform: `translateX(${(1 - q) * -220}px) skewX(${SKEW}deg)` }}>{l}</div>;
          })}
          <div style={{ ...BODY(40, C.ink), marginTop: 34, marginLeft: 110, opacity: ease.out((p - 0.5) / 0.3) }}>You do not have to slow down as much.</div>
        </div>)}
      </Scene>

      <Scene name="Clock" bg={C.ink} wipe="flash" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Lap t="03:41:12" p={p} size={150} color={C.cream} bg={C.track} />
          <div style={{ ...TAG(26, C.accent), marginTop: 34, opacity: ease.out((p - 0.5) / 0.3) }}>YOUR LAST MARATHON</div>
        </div>)}
      </Scene>

      <Scene name="Fade" bg={C.bg} wipe="chevron" wipeColor={C.track}>{(p) => {
        const splits = [['0–10K', 0.98], ['10–20K', 1.0], ['20–30K', 0.94], ['30–42K', 0.74]];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...SET(80, C.ink), marginBottom: 40 }}>The fade, drawn to scale.</div>
          {splits.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, marginBottom: 22, opacity: q }}>
              <span style={{ ...TAG(24, C.ink), width: 200 }}>{k}</span>
              <div style={{ flex: 1, height: 54 }}>
                <div style={{ height: 54, width: `${v * 100 * q}%`, background: v < 0.8 ? C.accent : C.chalk, transform: `skewX(${SKEW}deg)` }} />
              </div>
              <span style={{ ...BIG(46, v < 0.8 ? C.accent : C.ink), width: 140, textAlign: 'right' }}>{Math.round(v * 100)}%</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.track} wipe="swipeUp" wipeColor={C.bg}>{(p) => <Chapter p={p} n="01" title="Why the wall exists" deck="It is pacing, fuelling and one very optimistic first mile." />}</Scene>

      <Scene name="Pace" bg={C.cream} wipe="streak" wipeColor={C.accent2}>{(p) => {
        const bars = [4.42, 4.38, 4.4, 4.45, 4.58, 4.72, 5.02];
        const q = ease.inOut(p / 0.7);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...TAG(24, C.accent), marginBottom: 26 }}>MINUTES PER KILOMETRE · 6K SEGMENTS</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, height: 440 }}>
            {bars.map((v, i) => {
              const h = ((v - 4.2) / 1.0) * 400;
              const vis = ease.out(stg(p, i, 0.07, 0.26));
              return <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ ...BIG(38, i > 3 ? C.accent : C.ink), marginBottom: 12, opacity: vis }}>{v.toFixed(2)}</div>
                <div style={{ height: h * vis, background: i > 3 ? C.accent : C.chalk, transform: `skewX(${SKEW}deg)` }} />
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Stat1" bg={C.accent2} wipe="slam" wipeColor={C.cream}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 80 }}>
          <Ghost t="71%" style={BIG(360, C.cream)} color={C.ink} n={4} dx={70} />
          <div style={{ textAlign: 'left', maxWidth: 700 }}>
            <Words t="of amateur marathons are positive splits." p={p} d={0.2} style={SET(64, C.ink)} />
            <div style={{ ...BODY(34, alpha(C.ink, 0.75)), marginTop: 20 }}>The second half slower than the first, almost every time.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.ink} wipe="flash" wipeColor={C.accent}>{(p, lt) => (
        <div style={MID}>
          <div style={{ maxWidth: 1500, minHeight: 300 }}>
            <Typed t="I trained for eighteen weeks and paced it on feel." p={p} lt={lt} dur={0.55} caretColor={C.accent} style={BIG(90, C.cream)} />
          </div>
          <div style={{ marginTop: 34, opacity: ease.out((p - 0.7) / 0.2) }}><Bib n="3:41 · FIRST MARATHON" color={C.accent} ink={C.cream} /></div>
        </div>)}
      </Scene>

      <Scene name="Fuel" bg={C.bg} wipe="chevron" wipeColor={C.accent}>{(p) => {
        const rows = [['Carbs taken on', '42g/hr'], ['Carbs needed', '80g/hr'], ['Fluid taken', '340ml/hr'], ['Sweat rate', '1.1L/hr']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1440 }}>
          <div style={{ ...SET(76, C.ink), marginBottom: 34 }}>Half the fuel, all the effort.</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '18px 0', borderBottom: `3px solid ${alpha(C.ink, 0.16)}`, opacity: q, transform: `translateX(${(1 - q) * -70}px)` }}>
              <span style={BODY(44, C.ink)}>{k}</span><span style={{ flex: 1 }} />
              <span style={BIG(48, i % 2 ? C.accent : C.ink)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Turn" bg={C.accent} wipe="streak" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Ghost t="PACE IS A PLAN." style={BIG(150, C.cream)} color={C.ink} n={5} dx={40} />
          <div style={{ ...SET(74, C.ink), marginTop: 30, opacity: ease.out((p - 0.4) / 0.3) }}>Not a feeling.</div>
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.track} wipe="slam" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="02" title="How Split works" deck="One number in your ear, recalculated every kilometre." />}</Scene>

      <Scene name="Feature1" bg={C.cream} wipe="swipeUp" wipeColor={C.track}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <div style={{ flex: '0 0 760px' }}>
            <Bib n="FEATURE 01" color={C.accent} ink={C.cream} />
            <div style={{ ...BIG(104, C.ink), marginTop: 22 }}>ONE NUMBER, IN YOUR EAR.</div>
            <div style={{ ...BODY(38, alpha(C.ink, 0.75)), marginTop: 20, maxWidth: 660 }}>No dashboard mid-race. Split tells you the pace to hold for the next kilometre, and nothing else.</div>
          </div>
          <Slot id="st-feat-1" w={780} h={640} r={14} p={p} d={0.15} enter="right" tilt={-2} />
        </div>)}
      </Scene>

      <Scene name="Target" bg={C.track} wipe="flash" wipeColor={C.cream}>{(p, lt, raw) => {
        const held = raw > 0.45;
        return <div style={MID}>
          <Trails T={T} n={10} color={alpha(C.accent, 0.3)} />
          <div style={{ ...TAG(26, C.accent), marginBottom: 20 }}>TARGET · KM 33</div>
          <Lap t="04:41" p={p} size={220} color={held ? C.accent2 : C.cream} bg={C.ink} />
          <div style={{ ...BODY(40, C.chalk), marginTop: 34, opacity: ease.out((raw - 0.5) / 0.2) }}>Held. Nine to go.</div>
        </div>;
      }}</Scene>

      <Scene name="Feature2" bg={C.bg} wipe="chevron" wipeColor={C.accent}>{(p) => {
        const factors = [['HEAT', '24°'], ['HILL', '+38m'], ['HR DRIFT', '+4%'], ['WIND', 'HEAD 12'], ['SLEEP', '6h20'], ['CADENCE', '176']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...SET(78, C.ink), marginBottom: 34 }}>Six inputs, recalculated every kilometre.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
            {factors.map(([k, v], i) => {
              const q = ease.back(stg(p, i, 0.06, 0.22));
              return <div key={i} style={{ background: i % 2 ? C.cream : C.chalk, padding: '26px 30px', transform: `skewX(${SKEW}deg) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <div style={{ transform: `skewX(${-SKEW}deg)` }}>
                  <div style={TAG(20, C.accent)}>{k}</div>
                  <div style={{ ...BIG(58, C.ink), marginTop: 6 }}>{v}</div>
                </div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Feature3" bg={C.accent2} wipe="streak" wipeColor={C.cream}>{(p) => {
        const weeks = [0.4, 0.52, 0.48, 0.66, 0.72, 0.6, 0.84, 0.92];
        const q = ease.inOut(p / 0.7);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...BIG(84, C.cream), marginBottom: 40 }}>EIGHTEEN WEEKS, ONE CURVE.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, height: 400 }}>
            {weeks.map((v, i) => {
              const vis = ease.out(stg(p, i, 0.06, 0.24));
              return <div key={i} style={{ flex: 1, height: 360 * v * vis, background: i === 7 ? C.ink : alpha(C.cream, 0.8), transform: `skewX(${SKEW}deg)` }} />;
            })}
          </div>
          <div style={{ ...BODY(34, C.ink), marginTop: 26 }}>Load rises, then falls. The taper is the part people skip.</div>
        </div>;
      }}</Scene>

      <Scene name="Audio" bg={C.ink} wipe="slam" wipeColor={C.accent}>{(p, lt) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', height: 200 }}>
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} style={{ width: 14, height: 20 + Math.abs(Math.sin(lt * 4 + i * 0.5)) * (40 + rnd(i) * 130) * clamp(p * 5, 0, 1), background: i % 5 === 0 ? C.accent : C.cream, borderRadius: 99 }} />
            ))}
          </div>
          <div style={{ ...SET(74, C.cream), marginTop: 40 }}>“Four forty-one. Ease off the arms.”</div>
        </div>)}
      </Scene>

      <Scene name="Coach" bg={C.cream} wipe="swipeUp" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 70 }}>
          <Slot id="st-coach" w={500} h={620} r={14} p={p} enter="left" />
          <div style={{ maxWidth: 880 }}>
            <Words t="“Nobody blows up because they are unfit. They blow up because they ran the first 10K on adrenaline.”" p={p} d={0.15} per={0.038} style={SET(66, C.ink)} />
            <div style={{ marginTop: 28, opacity: ease.out((p - 0.72) / 0.2) }}><Bib n="COACH · 2:19 PB" color={C.accent2} ink={C.cream} /></div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.track} wipe="chevron" wipeColor={C.accent}>{(p) => <Chapter p={p} n="03" title="What changed" deck="Four thousand races, one season." />}</Scene>

      <Scene name="Stats" bg={C.bg} wipe="streak" wipeColor={C.track}>{(p) => {
        const cols = [[94, '%', 'ran an even split', C.accent], [11, 'm', 'off their PB', C.accent2], [0, '', 'wall reported', C.ink]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 40 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.back(stg(p, i, 0.1, 0.26));
            return <div key={i} style={{ width: 460, transform: `skewX(${SKEW}deg) translateY(${(1 - q) * 140}px)`, opacity: q > 0 ? 1 : 0, background: col, padding: '48px 36px' }}>
              <div style={{ transform: `skewX(${-SKEW}deg)` }}>
                <div style={{ ...BIG(170, C.cream), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.4} suffix={sfx} /></div>
                <div style={{ ...BODY(32, alpha(C.cream, 0.85)), marginTop: 14 }}>{lbl}</div>
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Even" bg={C.cream} wipe="flash" wipeColor={C.accent2}>{(p) => {
        const before = [0.98, 1.0, 0.94, 0.74];
        const after = [0.96, 0.98, 0.98, 0.99];
        const q = ease.inOut(p / 0.6);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 50 }}>
          {[['BEFORE', before, C.chalk], ['WITH SPLIT', after, C.accent]].map(([lbl, arr, col], r) => (
            <div key={r}>
              <div style={{ ...TAG(22, C.ink), marginBottom: 14 }}>{lbl}</div>
              <div style={{ display: 'flex', gap: 14 }}>
                {arr.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: 130 }}>
                    <div style={{ height: 130 * v * q, background: col, transform: `skewX(${SKEW}deg)` }} />
                  </div>))}
              </div>
            </div>))}
        </div>;
      }}</Scene>

      <Scene name="Reviews" bg={C.accent} wipe="slam" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Marquee items={['“even split, first time”', '“it shut me up at 5K”', '“negative split at 41”', '“no wall, no drama”']} T={T} speed={170} size={52} style={{ top: 220, ...SET(52, alpha(C.cream, 0.5)) }} />
          <Marquee items={['“the taper warning saved me”', '“eleven minutes off”', '“one number, that is it”']} T={T} speed={130} dir={-1} size={52} style={{ bottom: 230, ...SET(52, alpha(C.ink, 0.35)) }} />
          <div style={MID}>
            <div style={{ background: C.accent, padding: '20px 44px' }}>
              <div style={BIG(180, C.cream)}><Counter target={4128} p={p} dur={0.5} /></div>
              <div style={{ ...TAG(28, C.ink), textAlign: 'center', marginTop: 10 }}>RACES PACED</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.bg} wipe="chevron" wipeColor={C.track}>{(p) => {
        const rows = [['One number per kilometre', 'Nine metrics on a wrist'], ['Recalculated for heat and hills', 'A fixed goal pace'], ['Warns you at 5K', 'Tells you at 35K'], ['Coached taper', 'Taper by vibes']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 16, opacity: q, transform: `translateY(${(1 - q) * 36}px)` }}>
              <div style={{ flex: 1, background: C.accent, padding: '22px 32px', ...BODY(38, C.cream), fontWeight: 700, transform: `skewX(${SKEW}deg)` }}><span style={{ display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>{a}</span></div>
              <div style={{ flex: 1, background: C.chalk, padding: '22px 32px', ...BODY(38, alpha(C.ink, 0.6)), transform: `skewX(${SKEW}deg)` }}><span style={{ display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>{b}</span></div>
            </div>;
          })}
        </div>;
      }}</Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.track} wipe="streak" wipeColor={C.cream}>{(p) => <Chapter p={p} n="04" title="Who runs with it" deck="First-timers, club runners, and one very fast postman." />}</Scene>

      <Scene name="Montage" bg={C.track} wipe="swipeUp" wipeColor={C.accent}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 24 }}>
          <Slot id="st-mont-1" w={840} h={480} r={12} p={p} d={0.05} enter="left" tilt={-1.5} />
          <Slot id="st-mont-2" w={840} h={480} r={12} p={p} d={0.16} enter="right" tilt={1.5} />
        </div>)}
      </Scene>

      <Scene name="Distances" bg={C.accent2} wipe="flash" wipeColor={C.cream}>{(p) => {
        const tags = ['5K', '10K', 'HALF', 'MARATHON', '50K', 'BACKYARD', 'PARKRUN', 'TRACK'];
        return <div style={MID}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1500 }}>
            {tags.map((t2, i) => {
              const q = ease.back(stg(p, i, 0.06, 0.22));
              return <div key={i} style={{ background: i % 3 === 0 ? C.ink : i % 3 === 1 ? C.cream : C.accent, ...BIG(56, i % 3 === 1 ? C.ink : C.cream), padding: '18px 34px', transform: `skewX(${SKEW}deg) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <span style={{ display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>{t2}</span>
              </div>;
            })}
          </div>
          <div style={{ ...SET(72, C.cream), marginTop: 50 }}>Any distance with a finish line.</div>
        </div>;
      }}</Scene>

      <Scene name="Plans" bg={C.bg} wipe="chevron" wipeColor={C.ink}>{(p) => {
        const plans = [['Free', '£0', 'one race, one plan'], ['Season', '£9', 'per month, unlimited races'], ['Club', '£64', 'twenty runners, one coach view']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 24 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.back(stg(p, i, 0.1, 0.26)); const hero = i === 1;
            return <div key={i} style={{ width: 470, background: hero ? C.accent : C.cream, padding: '46px 38px', boxSizing: 'border-box', textAlign: 'left', transform: `skewX(${SKEW}deg) translateY(${(1 - q) * 160}px)`, opacity: q > 0 ? 1 : 0 }}>
              <div style={{ transform: `skewX(${-SKEW}deg)` }}>
                <div style={TAG(20, hero ? C.ink : C.accent)}>{n.toUpperCase()}</div>
                <div style={{ ...BIG(120, hero ? C.cream : C.ink), marginTop: 12 }}>{price}</div>
                <div style={{ ...BODY(30, hero ? C.ink : alpha(C.ink, 0.7)), marginTop: 12 }}>{sub}</div>
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.ink} wipe="streak" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="st-founder" w={540} h={660} r={14} p={p} enter="left" />
          <div style={{ maxWidth: 860 }}>
            <Bib n="WHY WE BUILT IT" color={C.accent} ink={C.cream} />
            <div style={{ ...SET(70, C.cream), marginTop: 22 }}>I ran 1:38 for the first half and 2:03 for the second.</div>
            <div style={{ ...BODY(36, C.chalk), marginTop: 20 }}>Split is the voice I wish had interrupted me at five kilometres.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 05 ===== */}
      <Scene name="Ch5" bg={C.track} wipe="slam" wipeColor={C.accent}>{(p) => <Chapter p={p} n="05" title="Pace your next one" deck="Free for your first race. No card." />}</Scene>

      <Scene name="Free" bg={C.accent} wipe="flash" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Burst p={p} T={T} n={22} colors={[C.cream, C.ink, C.accent2]} spread={560} size={14} />
          <div style={{ position: 'relative' }}>
            <Ghost t="FIRST RACE FREE." style={BIG(130, C.cream)} color={C.ink} n={5} dx={36} />
          </div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.track} wipe="swipeUp" wipeColor={C.ink}>{(p) => {
        const bq = ease.back((p - 0.22) / 0.24);
        return <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Trails T={T} n={12} color={alpha(C.accent, 0.35)} />
          <Slot id="st-cta" w={700} h={700} r={14} p={p} enter="left" />
          <div style={{ position: 'relative' }}>
            <LogoSlot id="st-logo-cta" size={130} p={p} d={0.1} shape="rounded" style={{ borderRadius: 10, marginBottom: 26 }} />
            <div style={BIG(118, C.cream)}>PACE THE</div>
            <div style={BIG(118, C.accent)}>SECOND HALF.</div>
            <div style={{ display: 'inline-block', marginTop: 38, transform: `skewX(${SKEW}deg) scale(${bq * (1 + Math.sin(T * 3.4) * 0.02)})`, opacity: bq > 0 ? 1 : 0, background: C.accent, padding: '24px 60px' }}>
              <span style={{ ...TAG(30, C.cream), display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>BUILD MY PLAN</span>
            </div>
            <div style={{ ...TAG(26, C.chalk), marginTop: 26 }}>SPLIT.RUN</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="streak" wipeColor={C.accent}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ ...MID, opacity: fade }}>
          <Trails T={T} n={14} color={alpha(C.accent, 0.4)} />
          <Chars t="SPLIT" p={p} size={220} color={C.cream} font={FB} mode="drop" per={0.05} style={{ fontWeight: 800, letterSpacing: '-0.06em' }} />
          <div style={{ ...TAG(24, C.accent), marginTop: 20, opacity: ease.out((p - 0.45) / 0.3) }}>RUN THE SECOND HALF FASTER</div>
        </div>;
      }}</Scene>

      <Scene name="Wall" bg={C.track} wipe="flash" wipeColor={C.accent}>{(p, lt, raw) => {
        const hit = raw > 0.4;
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Trails T={T} n={hit ? 4 : 18} color={alpha(C.accent, hit ? 0.2 : 0.5)} />
          <div style={{ ...MID }}>
            <div style={{ ...TAG(26, C.accent) }}>KM 32</div>
            <Ghost t={hit ? 'THE WALL' : 'RUNNING WELL'} style={BIG(170, C.cream)} color={hit ? C.accent : C.accent2} n={hit ? 1 : 5} dx={40} />
            <div style={{ ...BODY(38, C.chalk), marginTop: 34, opacity: ease.out((raw - 0.55) / 0.2) }}>Everything after this is arithmetic you did at kilometre one.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Splits" bg={C.cream} wipe="chevron" wipeColor={C.accent2}>{(p) => {
        const rows = [['5', '23:12', 'ON'], ['10', '46:20', 'ON'], ['15', '69:44', 'ON'], ['20', '93:10', 'ON'], ['25', '117:02', 'FADE']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...TAG(24, C.accent), marginBottom: 24 }}>SPLIT SHEET</div>
          {rows.map(([k, t2, s], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 30, padding: '15px 0', borderBottom: `2px solid ${alpha(C.ink, 0.14)}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
              <span style={{ ...TAG(24, C.ink), width: 120 }}>{k}K</span>
              <span style={BIG(56, C.ink)}>{t2}</span>
              <span style={{ flex: 1 }} />
              <span style={{ ...TAG(24, s === 'ON' ? C.accent2 : C.accent) }}>{s}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Drift" bg={C.bg} wipe="streak" wipeColor={C.ink}>{(p) => {
        const hr = Array.from({ length: 30 }).map((_, i) => 140 + i * 1.4 + Math.sin(i) * 3);
        const q = ease.inOut(p / 0.7);
        const pts = hr.map((v, i) => [180 + i * 52, 760 - (v - 130) * 8]);
        const shown = Math.max(2, Math.ceil(q * pts.length));
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 150, top: 170, ...SET(76, C.ink) }}>Heart rate drifts. Pace should not.</div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.slice(0, shown).map(a => a.join(',')).join(' ')} fill="none" stroke={C.accent} strokeWidth="8" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', left: 150, bottom: 160, ...TAG(22, alpha(C.ink, 0.6)) }}>BPM · 140 → 182 AT CONSTANT EFFORT</div>
        </div>;
      }}</Scene>

      <Scene name="Hydration" bg={C.accent2} wipe="slam" wipeColor={C.cream}>{(p) => {
        const stops = ['5K', '10K', '15K', '21K', '27K', '33K', '38K'];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...BIG(84, C.cream), marginBottom: 46 }}>SEVEN STOPS, PLANNED.</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {stops.map((s, i) => {
              const q = ease.back(stg(p, i, 0.07, 0.22));
              return <div key={i} style={{ flex: 1, background: i % 2 ? C.ink : C.cream, padding: '30px 0', textAlign: 'center', transform: `skewX(${SKEW}deg) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <span style={{ ...TAG(24, i % 2 ? C.cream : C.ink), display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>{s}</span>
              </div>;
            })}
          </div>
          <div style={{ ...BODY(34, C.ink), marginTop: 30 }}>Gel, water, or walk — decided before you start.</div>
        </div>;
      }}</Scene>

      <Scene name="Taper" bg={C.ink} wipe="swipeUp" wipeColor={C.accent}>{(p) => {
        const days = [0.9, 0.82, 0.7, 0.6, 0.44, 0.3, 0.2, 0.34, 0.1, 1.0];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...TAG(24, C.accent), marginBottom: 26 }}>THE LAST TEN DAYS</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 420 }}>
            {days.map((v, i) => {
              const q = ease.out(stg(p, i, 0.06, 0.24));
              return <div key={i} style={{ flex: 1, height: 380 * v * q, background: i === 9 ? C.accent : alpha(C.cream, 0.7), transform: `skewX(${SKEW}deg)` }} />;
            })}
          </div>
          <div style={{ ...BODY(34, C.chalk), marginTop: 26 }}>Nine days of less, one day of everything.</div>
        </div>;
      }}</Scene>

      <Scene name="Kit" bg={C.cream} wipe="chevron" wipeColor={C.track}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
          <Slot id="st-kit-0" w={420} h={520} r={12} p={p} d={0.04} enter="rise" tilt={-2} />
          <Slot id="st-kit-1" w={480} h={640} r={12} p={p} d={0.14} enter="rise" />
          <Slot id="st-kit-2" w={420} h={500} r={12} p={p} d={0.24} enter="rise" tilt={2} />
          <div style={{ position: 'absolute', left: 150, top: 150, ...TAG(24, C.accent) }}>RACE KIT · LAID OUT THE NIGHT BEFORE</div>
        </div>)}
      </Scene>

      <Scene name="Weather" bg={C.track} wipe="flash" wipeColor={C.chalk}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 26 }).map((_, i) => {
            const y = ((lt * 380 + i * 152) % 1240) - 140;
            return <div key={i} style={{ position: 'absolute', left: rnd(i) * 1880, top: y, width: 3, height: 70, background: alpha(C.chalk, 0.3), transform: 'rotate(12deg)' }} />;
          })}
          <div style={{ position: 'absolute', left: 150, top: 320, width: 1100 }}>
            <div style={TAG(26, C.accent)}>RACE MORNING · 9° AND WET</div>
            <div style={{ ...BIG(120, C.cream), marginTop: 20 }}>PLAN ADJUSTED BY FOUR SECONDS.</div>
            <div style={{ ...BODY(36, C.chalk), marginTop: 20 }}>Cold and wet is quick. Split knows that before you do.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Track" bg={C.accent} wipe="streak" wipeColor={C.ink}>{(p) => {
        const reps = ['400', '800', '1K', '1K', '800', '400'];
        return <div style={MID}>
          <div style={{ ...BIG(80, C.ink), marginBottom: 40 }}>TUESDAY, ON THE TRACK.</div>
          <div style={{ display: 'flex', gap: 14 }}>
            {reps.map((r, i) => {
              const q = ease.back(stg(p, i, 0.07, 0.22));
              return <div key={i} style={{ width: 220, background: i % 2 ? C.cream : C.ink, padding: '34px 0', textAlign: 'center', transform: `skewX(${SKEW}deg) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <span style={{ ...BIG(58, i % 2 ? C.ink : C.cream), display: 'inline-block', transform: `skewX(${-SKEW}deg)` }}>{r}</span>
              </div>;
            })}
          </div>
          <div style={{ ...BODY(36, C.ink), marginTop: 36 }}>Six reps, one purpose: hold pace when it hurts.</div>
        </div>;
      }}</Scene>

      <Scene name="Finish" bg={C.ink} wipe="slam" wipeColor={C.accent2}>{(p) => (
        <div style={MID}>
          <Burst p={p} T={T} n={26} colors={[C.accent, C.accent2, C.cream, C.chalk]} spread={620} size={16} />
          <div style={{ position: 'relative', ...TAG(26, C.accent2), marginBottom: 20 }}>FINISH · NEGATIVE SPLIT</div>
          <Lap t="03:30:04" p={p} size={150} color={C.cream} bg={C.track} />
          <div style={{ ...SET(70, C.accent2), marginTop: 36, opacity: ease.out((p - 0.5) / 0.3) }}>Eleven minutes, and the last 10K was the fastest.</div>
        </div>)}
      </Scene>

      <Scene name="Club" bg={C.bg} wipe="chevron" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 18 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.back(stg(p, i, 0.08, 0.24));
              return <div key={i} style={{ width: 270, height: 320, overflow: 'hidden', transform: `skewX(${SKEW}deg) translateY(${(1 - q) * 180}px) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <Fill id={`st-club-${i}`} shape="rect" placeholder="DROP CLUB PHOTO" idle={C.chalk} />
              </div>;
            })}
          </div>
          <div style={{ ...SET(74, C.ink), marginTop: 44 }}>Twelve clubs, one shared start line.</div>
        </div>)}
      </Scene>

      <Scene name="Recovery" bg={C.accent2} wipe="swipeUp" wipeColor={C.cream}>{(p) => {
        const rows = [['Sleep debt cleared', '4 nights'], ['Easy running resumed', 'day 6'], ['Next block starts', 'week 3'], ['Injuries', 'none']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1440 }}>
          <div style={{ ...BIG(80, C.cream), marginBottom: 34 }}>AFTER, ALSO PLANNED.</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '16px 0', borderBottom: `3px solid ${alpha(C.ink, 0.2)}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
              <span style={BODY(42, C.ink)}>{k}</span><span style={{ flex: 1 }} />
              <span style={BIG(44, C.cream)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Referral" bg={C.cream} wipe="flash" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <div style={{ background: C.accent, padding: '40px 66px', transform: `skewX(${SKEW}deg) scale(${ease.back(p / 0.24)})` }}>
            <div style={{ transform: `skewX(${-SKEW}deg)` }}>
              <div style={TAG(24, C.ink)}>BRING A TRAINING PARTNER</div>
              <div style={{ ...BIG(110, C.cream), marginTop: 10 }}>PB2FOR1</div>
            </div>
          </div>
          <div style={{ ...SET(62, C.ink), marginTop: 40, opacity: ease.out((p - 0.5) / 0.3) }}>Both seasons free.</div>
        </div>)}
      </Scene>

      <Garnish />
    </div>
  );
}

window.SplitTimeFilm = function SplitTimeFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
