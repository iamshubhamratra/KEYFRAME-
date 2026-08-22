/* KEYFRAME long-form template 08 — CANOPY
   Motion world: layered jungle depth. Five-plane foliage parallax with independent
   sway, volumetric light shafts, drifting spores, leaf-mask and canopy transitions,
   route maps drawn like expedition charts. The environment is always alive. */
const K = window.FilmKit;
const { ease, stg, rnd, rnd2, Words, Chars, Typed, Counter, Marquee, Slot, LogoSlot, Fill, Drift, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-neutral-900', '#141a13'),
  bg: DS('--color-bg', '#e7e2cf'),
  deep: DS('--color-accent-2-900', '#1b2a1c'),
  moss: DS('--color-accent-2-800', '#31462f'),
  sun: DS('--color-accent-200', '#e2c079'),
  cream: DS('--color-neutral-100', '#f7f4e6'),
  bark: DS('--color-accent-800', '#5b4a33'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');

/* ---- transition language: foliage, canopy, light ---- */
const TR = {
  leaves: (p, col) => {
    const o = p > 0.89 ? clamp((p - 0.89) / 0.11, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: 16 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - rnd(i) * 0.07) / 0.13, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: (i % 4) * 520 - 60, top: Math.floor(i / 4) * 300 - 40, width: 620, height: 420, background: col, opacity: Math.min(1, v * 2.4), borderRadius: '68% 32% 74% 26% / 40% 62% 38% 60%', transform: `scale(${v}) rotate(${(1 - v) * 40 + i * 12}deg)` }} />;
      })}
    </div>;
  },
  canopy: (p, col) => {
    const o = p > 0.89 ? clamp((p - 0.89) / 0.11, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[0, 1, 2].map(i => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.03) / 0.14, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '104%', background: i === 1 ? lighten(col, 0.1) : col, transform: `translateY(${(v - 1) * 100}%)`, clipPath: 'polygon(0 0, 100% 0, 100% 82%, 88% 96%, 74% 84%, 60% 98%, 46% 86%, 32% 97%, 18% 85%, 6% 95%, 0 84%)' }} />;
      })}
    </div>;
  },
  shaft: (p, col) => {
    const q = ease.inOut(clamp(p / 0.18, 0, 1)), o = p > 0.88 ? ease.inOut((p - 0.88) / 0.12) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', display: 'flex' }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ flex: 1, background: col, transform: `translateY(${(1 - clamp(v * 1.2 - i * 0.05, 0, 1)) * (i % 2 ? -104 : 104)}%) skewX(-4deg)` }} />
      ))}
    </div>;
  },
  undergrowth: (p, col) => {
    const q = ease.inOut(clamp(p / 0.2, 0, 1)), o = p > 0.88 ? ease.inOut((p - 0.88) / 0.12) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '104%', background: col, transform: `translateY(${(1 - v) * 100}%)`, clipPath: 'polygon(0 18%, 10% 4%, 22% 16%, 36% 2%, 50% 14%, 64% 3%, 78% 15%, 90% 5%, 100% 17%, 100% 100%, 0 100%)' }} />
    </div>;
  },
  mist: (p, col) => {
    const q = ease.inOut(clamp(p / 0.24, 0, 1)), o = p > 0.86 ? ease.inOut((p - 0.86) / 0.14) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, opacity: Math.max(1 - q, o) }} />;
  },
};
/* ---- cameras: expedition — push through, climb, sweep ---- */
const CAM = {
  push: (p) => ({ transform: `scale(${1.02 + p * 0.06}) translateY(${10 - p * 34}px)` }),
  climb: (p) => ({ transform: `scale(1.06) translateY(${60 - p * 130}px)` }),
  sweepR: (p) => ({ transform: `scale(1.06) translateX(${60 - p * 130}px)` }),
  sweepL: (p) => ({ transform: `scale(1.06) translateX(${-60 + p * 130}px)` }),
  breathe: (p) => ({ transform: `scale(${1.015 + Math.sin(p * 4.4) * 0.012}) translateY(${Math.cos(p * 3.6) * 7}px)` }),
  emerge: (p) => ({ transform: `scale(${1.16 - ease.out(p / 0.5) * 0.14})`, filter: `blur(${(1 - ease.out(p / 0.3)) * 8}px)` }),
};
/* ---- world: the continuously running background ----
   Depth-tinted strata, swaying vines with leaves at their tips, spinning leaf
   fall in four hues, raking light shafts, a flitting bird, a skulking shape. */
const AMB = 1.25;
const LEAFC = [C.moss, C.deep, C.sun, C.accent2, K.lighten(C.accent2, 0.25), C.accent];
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Depth: 'DATA',
  Floor: 'DATA',
  Ch1: 'PROBLEM',
  Loss: 'DATA',
  Road: 'PROBLEM',
  Quote1: 'PROBLEM',
  Species: 'DATA',
  Rain: 'PROBLEM',
  Sound: 'FEATURE',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Chart: 'FEATURE',
  Trap: 'FEATURE',
  Grid: 'FEATURE',
  Drone: 'MOMENT',
  Camp: 'FEATURE',
  Kit: 'FEATURE',
  Rangers: 'FEATURE',
  Ch3: 'DATA',
  Stats: 'DATA',
  Find: 'MOMENT',
  Nightlife: 'DATA',
  Seeds: 'DATA',
  Regrow: 'DATA',
  Quote2: 'MOMENT',
  Reviews: 'SOLUTION',
  Compare: 'DATA',
  Ch4: 'CTA',
  Agreement: 'FEATURE',
  Carbon: 'DATA',
  Villages: 'FEATURE',
  Support: 'DATA',
  Founder: 'INTRO',
  Now: 'MOMENT',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own forest as one decor layer. Scene energy drives the sway
   and the leaf fall, so the canopy stirs harder on an energetic beat. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const sun = (a) => K.alpha(C.sun, a);
  const LEAF = 'M 0 0 q 22 -26 46 0 q -22 26 -46 0';
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[[0, C.deep, 0.14], [260, C.moss, 0.1], [560, C.accent2, 0.07]].map(([y, c, a], k) => (
        <rect key={k} x={0} y={y} width={W2} height={k === 2 ? H2 - 560 : 300} fill={K.alpha(c, a)} />))}
      {[0, 1, 2, 3].map(k => {
        const sh = 130 + k * 400 + Math.sin(t * 0.2 + k) * 60;
        return <polygon key={'s' + k} points={`${sh},-20 ${sh + 130},-20 ${sh + 250},${H2} ${sh + 60},${H2}`} fill={sun(0.055)} />;
      })}
      {[0, 1, 2, 3, 4, 5, 6].map(k => {
        const sw = Math.sin(t * (0.5 + k * 0.11) + k) * (16 + k * 5);
        const x = 60 + k * 300, len = 280 + (k % 3) * 200;
        return <g key={k}>
          <path d={`M ${x} -20 q ${sw} ${len * 0.55} ${sw * 1.7} ${len}`} fill="none" stroke={K.alpha(C.deep, 0.55)} strokeWidth={7} strokeLinecap="round" />
          {[0.4, 0.68, 0.92].map((f, j) => (
            <path key={j} d={LEAF} fill={K.alpha(LEAFC[(k + j) % LEAFC.length], 0.5)}
              transform={`translate(${x + sw * 1.7 * f},${len * f}) rotate(${-40 + sw * 2 + j * 62}) scale(${1.5 - j * 0.25})`} />))}
          <circle cx={x + sw * 1.7} cy={len} r={10} fill={K.alpha(k % 2 ? C.accent : C.sun, 0.5)} />
        </g>;
      })}
      {Array.from({ length: 14 }).map((_, k) => {
        const ph = (t * 0.055 + k * 0.0714) % 1;
        const x = 100 + ((k * 331) % 1680) + Math.sin(t * 0.7 + k) * 90;
        return <path key={'l' + k} d={LEAF} fill={K.alpha(LEAFC[k % LEAFC.length], 0.4)}
          transform={`translate(${x},${-40 + ph * (H2 + 80)}) rotate(${ph * 520 + k * 40}) scale(${0.8 + (k % 3) * 0.4})`} />;
      })}
      {(() => {
        const ph = (t * 0.11) % 1, x = W2 + 120 - ph * (W2 + 240);
        const w = 10 + Math.sin(t * 9) * 9;
        return <g transform={`translate(${x},${260 + Math.sin(t * 1.4) * 60})`} opacity={0.5}>
          <ellipse rx={20} ry={9} fill={K.alpha(C.accent, 0.85)} />
          <path d={`M -6 0 q 14 ${-w} 30 0`} fill="none" stroke={K.alpha(C.sun, 0.9)} strokeWidth={4} strokeLinecap="round" />
          <path d={`M -6 0 q -14 ${-w} -30 0`} fill="none" stroke={K.alpha(C.sun, 0.9)} strokeWidth={4} strokeLinecap="round" />
        </g>;
      })()}
      {(() => {
        const ph = (t * 0.045) % 1, x = -180 + ph * (W2 + 360);
        const skulk = Math.abs(Math.sin(t * 3.2)) * 8;
        return <g transform={`translate(${x},${H2 - 92 - skulk})`} opacity={0.38}>
          <ellipse rx={92} ry={34} fill={K.alpha(C.ink, 0.85)} />
          <circle cx={96} cy={-26} r={28} fill={K.alpha(C.ink, 0.85)} />
          <circle cx={106} cy={-32} r={4} fill={K.alpha(C.sun, 0.9)} />
          <path d="M -90 -14 q -60 -22 -46 -66" fill="none" stroke={K.alpha(C.ink, 0.85)} strokeWidth={11} strokeLinecap="round" transform={`rotate(${Math.sin(t * 2.6) * 14} -90 -14)`} />
        </g>;
      })()}
      {Array.from({ length: 22 }).map((_, k) => {
        const ph = (t * 0.035 + k * 0.045) % 1;
        return <circle key={'sp' + k} cx={((k * 233) % W2) + Math.sin(t * 0.5 + k) * 60} cy={H2 - ph * (H2 + 60)} r={2.8}
          fill={K.alpha(k % 4 === 0 ? C.accent : C.sun, 0.4)} />;
      })}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent2, C.sun, C.accent, C.moss],
  ink: C.ink, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['CANOPY · AN EXPEDITION FILM', 'SIX HUNDRED HECTARES, ON FOOT', 'SURVEYED, NOT ESTIMATED', 'THE MAP WAS THIRTY YEARS OLD', 'ELEVEN SPECIES NEW TO SCIENCE'];
const FOOTS = ['walked twice a year, on foot', 'the concession lapsed in 2021', 'written in the village hall', 'two hundred and eighty traps', 'nothing here was planted'];
const SIDES = ['WALK · RECORD · PROTECT', 'NINE TRANSECTS, TWICE A YEAR', 'TWO PER CENT OF THE LIGHT'];

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

const SET = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.05, color: c, margin: 0, fontWeight: 400 });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.5, color: c, margin: 0, fontWeight: 400 });
const LEAD = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.34, color: c, margin: 0, fontWeight: 600 });
const NUM = (s, c) => ({ fontFamily: FB, fontWeight: 700, fontSize: s, letterSpacing: '-0.02em', lineHeight: 0.94, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const CAPS = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 700, letterSpacing: '0.26em', color: c, margin: 0, textTransform: 'uppercase' });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 180px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '150px 160px', boxSizing: 'border-box' };

/* ---- environment ---- */
/* static leaf silhouettes per plane; only transform animates (capture-safe) */
const FROND = 'polygon(50% 0%, 62% 16%, 78% 10%, 74% 30%, 92% 34%, 80% 50%, 96% 62%, 76% 66%, 82% 86%, 62% 76%, 50% 100%, 38% 76%, 18% 86%, 24% 66%, 4% 62%, 20% 50%, 8% 34%, 26% 30%, 22% 10%, 38% 16%)';
function Canopy({ T, planes = 5, o = 1 }) {
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    {Array.from({ length: planes }).map((_, i) => {
      const depth = (i + 1) / planes;
      const sway = Math.sin(T * (0.35 + i * 0.12) + i) * (10 + i * 8);
      const size = 340 + i * 190;
      return <div key={i} style={{ position: 'absolute', inset: 0, transform: `translateX(${sway}px)`, opacity: (0.2 + i * 0.16) * o }}>
        {Array.from({ length: 4 }).map((_, j) => (
          <div key={j} style={{
            position: 'absolute', width: size, height: size,
            left: -140 + j * (620 - i * 40) + rnd2(i, j) * 160,
            top: -180 + (j % 2 ? 40 : -60) + rnd2(i, j + 9) * 90,
            background: i < 2 ? C.moss : C.deep, clipPath: FROND,
            transform: `rotate(${rnd2(i, j) * 90 - 45 + Math.sin(T * 0.5 + j) * 3}deg)`,
          }} />))}
      </div>;
    })}
  </div>;
}
/* volumetric light shafts through the canopy */
function Shafts({ T, n = 5, color = C.sun, o = 0.16 }) {
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{
        position: 'absolute', top: -200, left: 120 + i * 380 + Math.sin(T * 0.3 + i) * 26,
        width: 150 + i * 30, height: 1500, background: `linear-gradient(180deg, ${alpha(color, 0.55)}, transparent)`,
        transform: `rotate(${10 + i * 2}deg)`, opacity: o * (0.6 + Math.sin(T * 0.6 + i) * 0.4), filter: 'blur(8px)',
      }} />))}
  </div>;
}
function Spores({ T }) {
  return <Drift T={T} n={34} colors={[C.sun, C.cream, alpha(C.sun, 0.6)]} opacity={0.42} size={7} speed={11} sway={90} />;
}
/* expedition chart marker */
function Marker({ x, y, label, q = 1, color, ink }) {
  return <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
    <div style={{ width: 22, height: 22, border: `3px solid ${color}`, borderRadius: 999, background: alpha(ink, 0.4) }} />
    {label ? <div style={{ ...CAPS(15, color), marginTop: 10, whiteSpace: 'nowrap' }}>{label}</div> : null}
  </div>;
}
function Stratum({ rows, p, color, ink }) {
  return <div>
    {rows.map(([n, h, note], i) => {
      const q = ease.inOut(stg(p, i, 0.1, 0.32));
      return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16, opacity: q }}>
        <span style={{ ...CAPS(17, alpha(ink, 0.65)), width: 210 }}>{n}</span>
        <div style={{ flex: 1, height: 42, position: 'relative' }}>
          <div style={{ height: 42, width: `${h * 100 * q}%`, background: i % 2 ? color : alpha(color, 0.55), borderRadius: 3 }} />
        </div>
        <span style={{ ...BODY(26, alpha(ink, 0.75)), width: 240 }}>{note}</span>
      </div>;
    })}
  </div>;
}
function Chapter({ p, n, title, deck }) {
  const q = ease.inOut(p / 0.45);
  return <div style={{ position: 'absolute', inset: 0, background: C.deep, overflow: 'hidden' }}>
    <Canopy T={p * 22} o={0.9} />
    <Shafts T={p * 22} o={0.22} />
    <Spores T={p * 22} />
    <div style={{ position: 'absolute', left: 160, top: 380 }}>
      <div style={{ ...CAPS(19, C.sun), opacity: ease.out((p - 0.15) / 0.3) }}>STAGE {n}</div>
      <div style={{ ...SET(94, C.cream), marginTop: 18, opacity: ease.out((p - 0.28) / 0.3) }}>{title}</div>
      <div style={{ height: 3, width: 420, background: C.accent, marginTop: 24, transform: `scaleX(${q})`, transformOrigin: '0 50%' }} />
      {deck ? <div style={{ ...BODY(34, alpha(C.cream, 0.8)), marginTop: 22, maxWidth: 820, opacity: ease.out((p - 0.44) / 0.3) }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  return <div style={{ position: 'absolute', top: 46, left: 54, display: 'flex', alignItems: 'center', gap: 12, background: alpha(C.ink, 0.72), padding: '9px 20px 9px 9px', borderRadius: 999, pointerEvents: 'none' }}>
    <div style={{ width: 28, height: 28, borderRadius: 999, overflow: 'hidden' }}><Fill id="cp-mark" shape="circle" placeholder="LOGO" /></div>
    <span style={CAPS(20, C.cream)}>{(window.OM_TWEAKS || {}).brandName || 'CANOPY'}</span>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.deep} wipe="leaves" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} />
          <Shafts T={T} />
          <Spores T={T} />
          <div style={MID}>
            <LogoSlot id="cp-logo" size={130} p={p} d={0.05} shape="circle" />
            <div style={{ marginTop: 28 }}>
              <Chars t="CANOPY" p={p} d={0.2} size={200} color={C.cream} font={FH} mode="rise" per={0.05} />
            </div>
            <div style={{ ...CAPS(21, C.sun), marginTop: 22, opacity: ease.out((p - 0.55) / 0.3) }}>SIX HUNDRED HECTARES, MAPPED ON FOOT</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.ink} wipe="canopy" wipeColor={C.moss}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.6 }}><Fill id="cp-hero" shape="rect" placeholder="DROP CANOPY IMAGE" idle={C.moss} /></div>
          <Spores T={T} />
          <div style={MID}>
            <div style={{ maxWidth: 1480 }}>
              <Words t="Half the species here have never been named." p={p} per={0.055} dy={34} style={SET(108, C.cream)} />
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Depth" bg={C.deep} wipe="shaft" wipeColor={C.sun}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} />
          <Shafts T={T} o={0.24} />
          <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ ...CAPS(19, C.sun), marginBottom: 30 }}>FIVE STRATA, GROUND TO CROWN</div>
            <Stratum rows={[['EMERGENT', 0.42, '60m · hornbills'], ['CANOPY', 0.92, '35m · most of the life'], ['UNDERSTOREY', 0.68, '15m · shade specialists'], ['SHRUB', 0.44, '4m · seedlings'], ['FLOOR', 0.28, '0m · two per cent of light']]} p={p} color={C.accent2} ink={C.cream} />
          </div>
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.deep} wipe="mist" wipeColor={C.ink}>{(p) => <Chapter p={p} n="ONE" title="What we walked into" deck="A concession sold twice, a road half built, and no survey since 1994." />}</Scene>

      <Scene name="Loss" bg={C.bg} wipe="undergrowth" wipeColor={C.moss}>{(p) => {
        const years = [1994, 2004, 2014, 2024];
        const vals = [1.0, 0.86, 0.68, 0.51];
        const q = ease.inOut(p / 0.7);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...SET(80, C.ink), marginBottom: 46 }}>Forest cover, four surveys apart.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40, height: 420 }}>
            {vals.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ ...NUM(44, i === 3 ? C.accent : C.ink), marginBottom: 14 }}>{Math.round(v * 100 * q)}%</div>
                <div style={{ height: 340 * v * q, background: i === 3 ? C.accent : C.accent2, borderRadius: 4 }} />
                <div style={{ ...CAPS(17, alpha(C.ink, 0.6)), marginTop: 16 }}>{years[i]}</div>
              </div>))}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Road" bg={C.ink} wipe="leaves" wipeColor={C.accent}>{(p, lt, raw) => {
        const q = ease.inOut(clamp(raw / 0.8, 0, 1));
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}><Fill id="cp-road" shape="rect" placeholder="DROP ROAD IMAGE" idle={C.bark} /></div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <path d="M120 900 Q 700 700 1080 520 T 1820 260" fill="none" stroke={C.accent} strokeWidth="7" strokeDasharray="2200" strokeDashoffset={2200 * (1 - q)} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', left: 160, top: 190, width: 900 }}>
            <div style={{ ...CAPS(19, C.sun) }}>THE LOGGING ROAD</div>
            <div style={{ ...SET(86, C.cream), marginTop: 20 }}>Fourteen kilometres in, then abandoned.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Quote1" bg={C.moss} wipe="mist" wipeColor={C.deep}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Shafts T={T} o={0.2} />
          <div style={MID}>
            <div style={{ maxWidth: 1460, minHeight: 300 }}>
              <Typed t="The map said primary forest. The map was thirty years old." p={p} lt={lt} dur={0.58} caretColor={C.sun} style={SET(84, C.cream)} />
            </div>
            <div style={{ ...CAPS(18, C.sun), marginTop: 34, opacity: ease.out((p - 0.72) / 0.2) }}>SURVEY LEAD · FIRST TRANSECT, 2019</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Species" bg={C.bg} wipe="canopy" wipeColor={C.accent2}>{(p) => {
        const rows = [['Trees over 40cm dbh', '318'], ['Epiphytes', '96'], ['Amphibians', '41'], ['Bats', '28'], ['Undescribed, so far', '11']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1460 }}>
          <div style={{ ...CAPS(19, C.accent), marginBottom: 30 }}>WHAT ONE HECTARE HELD</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 24, padding: '20px 0', borderBottom: `1px solid ${alpha(C.ink, 0.22)}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
              <span style={SET(52, C.ink)}>{k}</span><span style={{ flex: 1 }} />
              <span style={NUM(52, i === 4 ? C.accent : C.accent2)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Turn" bg={C.accent} wipe="shaft" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="So we mapped it properly." p={p} size={128} color={C.cream} font={FH} mode="rise" per={0.032} />
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.deep} wipe="leaves" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="TWO" title="How the survey works" deck="Transects on foot, drones above, and a camera trap every four hundred metres." />}</Scene>

      <Scene name="Chart" bg={C.deep} wipe="undergrowth" wipeColor={C.moss}>{(p, lt) => {
        const marks = [[420, 300, 'CAMP ONE'], [700, 470, 'RIDGE'], [980, 380, 'RIVER CROSSING'], [1240, 560, 'SALT LICK'], [1480, 340, 'CAMP TWO']];
        const q = ease.inOut(p / 0.7);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} o={0.5} />
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <path d={`M${marks[0][0]} ${marks[0][1]} ${marks.slice(1).map(m => `L${m[0]} ${m[1]}`).join(' ')}`} fill="none" stroke={alpha(C.sun, 0.8)} strokeWidth="3" strokeDasharray="10 12" strokeDashoffset={-lt * 20} />
          </svg>
          {marks.map(([x, y, l], i) => (
            <Marker key={i} x={x} y={y} label={l} q={ease.back(stg(p, i, 0.09, 0.26))} color={C.sun} ink={C.ink} />))}
          <div style={{ position: 'absolute', left: 160, bottom: 160, width: 900 }}>
            <div style={{ ...SET(76, C.cream) }}>Nine transects, walked twice a year.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Trap" bg={C.bg} wipe="mist" wipeColor={C.cream}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <div style={{ flex: '0 0 700px' }}>
            <div style={CAPS(19, C.accent)}>THE INSTRUMENT</div>
            <div style={{ ...SET(86, C.ink), marginTop: 20 }}>A camera every four hundred metres.</div>
            <div style={{ ...BODY(36, alpha(C.ink, 0.78)), marginTop: 22 }}>Two hundred and eighty traps, triggered eleven thousand times last season.</div>
          </div>
          <Slot id="cp-trap" w={780} h={660} r={10} p={p} d={0.15} enter="right" />
        </div>)}
      </Scene>

      <Scene name="Grid" bg={C.deep} wipe="canopy" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Shafts T={T} o={0.18} />
          <div style={{ ...MID }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, width: 1500 }}>
              {Array.from({ length: 8 }).map((_, i) => {
                const q = ease.out(stg(p, i, 0.06, 0.24));
                return <div key={i} style={{ height: 260, borderRadius: 8, overflow: 'hidden', opacity: q, transform: `translateY(${(1 - q) * 60}px)` }}>
                  <Fill id={`cp-cam-${i}`} shape="rect" placeholder="DROP TRAP FRAME" idle={C.moss} />
                </div>;
              })}
            </div>
            <div style={{ ...CAPS(19, C.sun), marginTop: 30, opacity: ease.out((p - 0.5) / 0.3) }}>ONE NIGHT, EIGHT CAMERAS</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Drone" bg={C.ink} wipe="shaft" wipeColor={C.sun}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.66 }}><Fill id="cp-drone" shape="rect" placeholder="DROP AERIAL IMAGE" idle={C.moss} /></div>
          <div style={{ position: 'absolute', left: 160, bottom: 180, width: 1000 }}>
            <div style={CAPS(19, C.sun)}>FROM ABOVE</div>
            <div style={{ ...SET(84, C.cream), marginTop: 18 }}>Lidar finds the gaps the canopy hides.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Rangers" bg={C.bg} wipe="leaves" wipeColor={C.accent2}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.out(stg(p, i, 0.09, 0.28));
              return <div key={i} style={{ width: 250, height: 330, borderRadius: 10, overflow: 'hidden', opacity: q, transform: `translateY(${(1 - q) * 100}px)` }}>
                <Fill id={`cp-ranger-${i}`} shape="rect" placeholder="DROP PORTRAIT" idle={C.moss} />
              </div>;
            })}
          </div>
          <div style={{ ...SET(72, C.ink), marginTop: 48 }}>Eleven rangers, all from the three villages.</div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.deep} wipe="mist" wipeColor={C.sun}>{(p) => <Chapter p={p} n="THREE" title="What the forest showed" deck="Five seasons of data, and one animal nobody expected." />}</Scene>

      <Scene name="Stats" bg={C.bg} wipe="undergrowth" wipeColor={C.accent2}>{(p) => {
        const cols = [[618, '', 'hectares protected', C.accent], [11, '', 'species new to science', C.accent2], [280, '', 'camera traps live', C.ink]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 0 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.11, 0.3));
            return <React.Fragment key={i}>
              {i > 0 ? <div style={{ width: 1, height: 250, background: alpha(C.ink, 0.25), margin: '0 70px' }} /> : null}
              <div style={{ width: 400, opacity: q, transform: `translateY(${(1 - q) * 50}px)` }}>
                <div style={{ ...NUM(150, col), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.11} dur={0.45} suffix={sfx} /></div>
                <div style={{ ...CAPS(17, alpha(C.ink, 0.62)), marginTop: 22 }}>{lbl}</div>
              </div>
            </React.Fragment>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Find" bg={C.ink} wipe="canopy" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.72 }}><Fill id="cp-find" shape="rect" placeholder="DROP DISCOVERY IMAGE" idle={C.deep} /></div>
          <Spores T={T} />
          <div style={{ position: 'absolute', left: 160, bottom: 170, width: 1200 }}>
            <div style={{ ...CAPS(19, C.sun) }}>FRAME 4,912 · 02:41</div>
            <div style={{ ...SET(94, C.cream), marginTop: 20, textShadow: '0 4px 30px rgba(0,0,0,0.6)' }}>A clouded leopard, four hundred kilometres out of range.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Nightlife" bg={C.deep} wipe="shaft" wipeColor={C.moss}>{(p) => {
        const hours = [['18', 0.2], ['20', 0.5], ['22', 0.78], ['00', 0.94], ['02', 0.86], ['04', 0.52], ['06', 0.24]];
        const q = ease.inOut(p / 0.7);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} o={0.4} />
          <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ ...CAPS(19, C.sun), marginBottom: 30 }}>TRIGGERS BY HOUR</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, height: 400 }}>
              {hours.map(([h, v], i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: 340 * v * q, background: v > 0.8 ? C.sun : C.accent2, borderRadius: 4 }} />
                  <div style={{ ...CAPS(17, alpha(C.cream, 0.65)), marginTop: 16 }}>{h}</div>
                </div>))}
            </div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Reviews" bg={C.moss} wipe="mist" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Shafts T={T} o={0.2} />
          <Marquee items={['“the concession was cancelled”', '“eleven new species in five years”', '“rangers run the whole grid”']} T={T} speed={72} size={44} style={{ top: 250, ...BODY(44, alpha(C.cream, 0.4)) }} />
          <Marquee items={['“the data is public”', '“three villages, one agreement”', '“no road, no logging”']} T={T} speed={56} dir={-1} size={44} style={{ bottom: 260, ...BODY(44, alpha(C.sun, 0.5)) }} />
          <div style={MID}>
            <div style={{ ...NUM(180, C.cream) }}><Counter target={11402} p={p} dur={0.6} /></div>
            <div style={{ ...CAPS(19, C.sun), marginTop: 22 }}>CAMERA TRIGGERS THIS SEASON</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.deep} wipe="leaves" wipeColor={C.moss}>{(p) => <Chapter p={p} n="FOUR" title="How it stays standing" deck="A community agreement, a carbon contract, and a road that never got finished." />}</Scene>

      <Scene name="Agreement" bg={C.bg} wipe="canopy" wipeColor={C.accent2}>{(p) => {
        const terms = [['Village consent', 'renewed every five years'], ['Harvest rights', 'retained, mapped, limited'], ['Ranger employment', 'eleven full-time posts'], ['Carbon revenue', '62% to the villages']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {terms.map(([t2, s2], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.3));
            return <div key={i} style={{ borderTop: `2px solid ${alpha(C.ink, 0.25)}`, paddingTop: 22, marginBottom: 32, opacity: q, transform: `translateY(${(1 - q) * 36}px)` }}>
              <div style={{ display: 'flex', gap: 30, alignItems: 'baseline' }}>
                <span style={NUM(48, C.accent)}>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div style={SET(56, C.ink)}>{t2}</div>
                  <div style={{ ...BODY(32, alpha(C.ink, 0.72)), marginTop: 6 }}>{s2}</div>
                </div>
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Support" bg={C.deep} wipe="shaft" wipeColor={C.sun}>{(p) => {
        const plans = [['Hectare', '£12', 'a year, one hectare watched'], ['Transect', '£80', 'a year, one route walked'], ['Grid', 'Custom', 'a whole camera array']];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} o={0.4} />
          <div style={{ ...MID, flexDirection: 'row', gap: 28 }}>
            {plans.map(([n, price, sub], i) => {
              const q = ease.out(stg(p, i, 0.1, 0.3)); const hero = i === 1;
              return <div key={i} style={{ width: 470, background: hero ? C.cream : alpha(C.ink, 0.55), padding: '46px 38px', boxSizing: 'border-box', textAlign: 'left', borderRadius: 12, opacity: q, transform: `translateY(${(1 - q) * 80}px)` }}>
                <div style={CAPS(18, hero ? C.accent : C.sun)}>{n.toUpperCase()}</div>
                <div style={{ ...NUM(100, hero ? C.ink : C.cream), marginTop: 16 }}>{price}</div>
                <div style={{ ...BODY(30, hero ? alpha(C.ink, 0.72) : alpha(C.cream, 0.78)), marginTop: 12 }}>{sub}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.bg} wipe="undergrowth" wipeColor={C.moss}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Slot id="cp-founder" w={540} h={680} r={10} p={p} enter="left" />
          <div style={{ maxWidth: 840 }}>
            <div style={CAPS(19, C.accent)}>HOW IT STARTED</div>
            <div style={{ ...SET(70, C.ink), marginTop: 20 }}>We came to survey for six weeks and stayed for five years.</div>
            <div style={{ ...BODY(34, alpha(C.ink, 0.78)), marginTop: 22 }}>The concession lapsed in 2021. The agreement that replaced it was written in the village hall, not in an office.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.deep} wipe="canopy" wipeColor={C.ink}>{(p) => {
        const bq = ease.out((p - 0.25) / 0.32);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} />
          <Shafts T={T} o={0.22} />
          <Spores T={T} />
          <div style={MID}>
            <LogoSlot id="cp-logo-cta" size={120} p={p} d={0.05} shape="circle" />
            <div style={{ ...SET(100, C.cream), marginTop: 28 }}>Watch one hectare.</div>
            <div style={{ height: 3, width: 520, background: C.accent, marginTop: 26, transform: `scaleX(${ease.inOut((p - 0.4) / 0.4)})` }} />
            <div style={{ display: 'inline-block', marginTop: 40, opacity: bq, transform: `translateY(${(1 - bq) * 26}px)`, background: C.accent, color: C.cream, ...CAPS(24, C.cream), padding: '22px 56px', borderRadius: 999 }}>SUPPORT THE SURVEY</div>
            <div style={{ ...CAPS(18, alpha(C.cream, 0.7)), marginTop: 26 }}>CANOPY.ORG</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="mist" wipeColor={C.deep}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
          <Canopy T={T} o={0.8} />
          <Spores T={T} />
          <div style={MID}>
            <Chars t="CANOPY" p={p} size={180} color={C.cream} font={FH} mode="rise" per={0.045} />
            <div style={{ ...CAPS(19, C.sun), marginTop: 24, opacity: ease.out((p - 0.5) / 0.3) }}>CANOPY.ORG</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Floor" bg={C.deep} wipe="undergrowth" wipeColor={C.moss}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} o={0.6} />
          <div style={{ ...MID, flexDirection: 'row', gap: 90 }}>
            <div>
              <div style={NUM(300, C.sun)}><Counter target={2} p={p} dur={0.45} suffix="%" /></div>
              <div style={{ ...CAPS(18, alpha(C.cream, 0.7)), marginTop: 20 }}>OF SUNLIGHT REACHES THE FLOOR</div>
            </div>
            <div style={{ maxWidth: 620, textAlign: 'left' }}>
              <div style={LEAD(40, C.cream)}>Everything down here is built for shade, and nothing down here moves fast.</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Rain" bg={C.ink} wipe="mist" wipeColor={C.moss}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} o={0.5} />
          {Array.from({ length: 40 }).map((_, i) => {
            const y = ((lt * 460 + i * 118) % 1260) - 150;
            return <div key={i} style={{ position: 'absolute', left: rnd(i) * 1900, top: y, width: 2, height: 80, background: alpha(C.cream, 0.24), transform: 'rotate(6deg)' }} />;
          })}
          <div style={{ position: 'absolute', left: 160, top: 340, width: 1080 }}>
            <div style={CAPS(19, C.sun)}>WET SEASON · 3,400MM</div>
            <div style={{ ...SET(92, C.cream), marginTop: 20 }}>Nine months of it, most of it at night.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Sound" bg={C.moss} wipe="shaft" wipeColor={C.sun}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Shafts T={T} o={0.18} />
          <div style={{ position: 'absolute', left: 160, right: 160, top: 340 }}>
            <div style={{ ...CAPS(19, C.sun), marginBottom: 34 }}>DAWN CHORUS · SIXTY SECONDS</div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 300 }}>
              {Array.from({ length: 80 }).map((_, i) => {
                const on = i / 80 < clamp(p * 1.1, 0, 1);
                const h = on ? 10 + Math.abs(Math.sin(i * 0.6 + lt * 1.4)) * (24 + rnd(i) * 240) : 4;
                return <div key={i} style={{ flex: 1, height: h, background: i % 10 === 0 ? C.sun : alpha(C.cream, 0.6), borderRadius: 2 }} />;
              })}
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Seeds" bg={C.bg} wipe="leaves" wipeColor={C.accent2}>{(p) => {
        const rows = [['Hornbills', 'move seeds 8km'], ['Fruit bats', 'move seeds 12km'], ['Civets', 'move seeds 2km'], ['Wind', 'moves seeds 40m']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...SET(78, C.ink), marginBottom: 40 }}>The forest plants itself, if you let it.</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 26, padding: '18px 0', borderBottom: `1px solid ${alpha(C.ink, 0.2)}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <span style={{ ...SET(50, C.ink), width: 380 }}>{k}</span>
              <span style={BODY(34, alpha(C.ink, 0.75))}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Camp" bg={C.ink} wipe="canopy" wipeColor={C.bark}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.62 }}><Fill id="cp-camp" shape="rect" placeholder="DROP CAMP IMAGE" idle={C.bark} /></div>
          <Spores T={T} />
          <div style={{ position: 'absolute', left: 160, bottom: 180, width: 1000 }}>
            <div style={CAPS(19, C.sun)}>CAMP TWO · 640M</div>
            <div style={{ ...SET(82, C.cream), marginTop: 18 }}>Six weeks at a time, three hours from a road.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Kit" bg={C.bg} wipe="mist" wipeColor={C.cream}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 26, alignItems: 'flex-end' }}>
          <Slot id="cp-kit-0" w={420} h={520} r={8} p={p} d={0.04} enter="rise" />
          <Slot id="cp-kit-1" w={480} h={640} r={8} p={p} d={0.14} enter="rise" />
          <Slot id="cp-kit-2" w={420} h={500} r={8} p={p} d={0.24} enter="rise" />
          <div style={{ position: 'absolute', left: 160, top: 150, ...CAPS(19, C.accent) }}>FIELD KIT · WHAT GOES IN THE PACK</div>
        </div>)}
      </Scene>

      <Scene name="Regrow" bg={C.deep} wipe="undergrowth" wipeColor={C.accent2}>{(p) => {
        const bars = [0.16, 0.28, 0.44, 0.6, 0.74, 0.88];
        const q = ease.inOut(p / 0.7);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Canopy T={T} o={0.35} />
          <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ ...SET(80, C.cream), marginBottom: 44 }}>Cleared ground, six years later.</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 30, height: 400 }}>
              {bars.map((v, i) => (
                <div key={i} style={{ flex: 1, height: 340 * v * q, background: i > 3 ? C.accent2 : alpha(C.cream, 0.4), borderRadius: 4 }} />))}
            </div>
            <div style={{ ...CAPS(17, alpha(C.cream, 0.6)), marginTop: 22 }}>CANOPY CLOSURE · YEAR ONE TO SIX</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Quote2" bg={C.bg} wipe="shaft" wipeColor={C.moss}>{(p) => (
        <div style={MID}>
          <div style={{ maxWidth: 1420 }}>
            <Words t="“The forest does not need planting. It needs leaving alone, on paper, for thirty years.”" p={p} per={0.045} dy={28} style={SET(80, C.ink)} />
          </div>
          <div style={{ ...CAPS(18, alpha(C.ink, 0.6)), marginTop: 34, opacity: ease.out((p - 0.7) / 0.2) }}>VILLAGE COUNCIL CHAIR</div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.bg} wipe="leaves" wipeColor={C.deep}>{(p) => {
        const rows = [['Nine transects, twice a year', 'One survey, thirty years ago'], ['Community consent, renewed', 'A concession sold twice'], ['Rangers from three villages', 'Guards flown in'], ['Open dataset', 'A filing cabinet']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', gap: 60, padding: '26px 0', borderTop: `1px solid ${alpha(C.ink, 0.22)}`, opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
              <div style={{ flex: 1, ...LEAD(38, C.ink) }}>{a}</div>
              <div style={{ flex: 1, ...BODY(38, alpha(C.ink, 0.45)) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Carbon" bg={C.moss} wipe="canopy" wipeColor={C.cream}>{(p) => {
        const cols = [[214, 'kt', 'carbon held'], [62, '%', 'revenue to villages'], [30, 'yr', 'contract term']];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Shafts T={T} o={0.16} />
          <div style={{ ...MID, flexDirection: 'row', gap: 80 }}>
            {cols.map(([n, sfx, lbl], i) => {
              const q = ease.out(stg(p, i, 0.1, 0.28));
              return <div key={i} style={{ width: 420, opacity: q, transform: `translateY(${(1 - q) * 60}px)` }}>
                <div style={{ ...NUM(150, C.cream), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.42} suffix={sfx} /></div>
                <div style={{ height: 2, background: C.sun, margin: '18px 0' }} />
                <div style={CAPS(17, alpha(C.cream, 0.75))}>{lbl}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Villages" bg={C.bg} wipe="mist" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Slot id="cp-village" w={800} h={620} r={10} p={p} enter="left" />
          <div style={{ maxWidth: 640 }}>
            <div style={CAPS(19, C.accent)}>THREE VILLAGES</div>
            <div style={{ ...SET(74, C.ink), marginTop: 20 }}>Everyone within a day's walk signed it.</div>
            <div style={{ ...BODY(34, alpha(C.ink, 0.75)), marginTop: 20 }}>Four hundred and twelve households, one map, one signature page.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Now" bg={C.accent} wipe="shaft" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="Still standing." p={p} size={140} color={C.cream} font={FH} mode="rise" per={0.035} />
          <div style={{ ...LEAD(42, alpha(C.cream, 0.9)), marginTop: 30, opacity: ease.out((p - 0.45) / 0.3) }}>Six hundred and eighteen hectares of it.</div>
        </div>)}
      </Scene>

      <Garnish />
    </div>
  );
}

window.CanopyFilm = function CanopyFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
