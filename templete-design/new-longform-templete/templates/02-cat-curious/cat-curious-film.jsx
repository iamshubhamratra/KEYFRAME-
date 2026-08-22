/* KEYFRAME long-form template 02 — CAT CURIOUS
   Motion world: off-grid crops that bleed off frame, snap cuts and stepped
   jitter, narrowing-pupil and whisker motifs, layered crop windows. Sophisticated
   playful — curious, quick, slightly unpredictable. */
const K = window.FilmKit;
const { ease, stg, rnd, rnd2, Words, Chars, Typed, Counter, Roll, Marquee, Slot, LogoSlot, Fill, Burst, Drift, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the system's
   tokens are resolved once here rather than left as var(--*). Fallbacks cover the
   first frame, before the stylesheet lands. */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-neutral-900', '#22201d'),
  bg: DS('--color-neutral-800', '#2c2925'),
  cream: DS('--color-bg', '#f5ead8'),
  stone: DS('--color-neutral-300', '#ded5c6'),
  taupe: DS('--color-neutral-700', '#6b6355'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;


/* ---- transition language: snaps, slats, peels — nothing eases smoothly ---- */
const snap = (p, steps = 5) => Math.round(clamp(p, 0, 1) * steps) / steps;
const TR = {
  shutter: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: 9 }).map((_, i) => {
        const q = Math.max(1 - snap(clamp((p - i * 0.008) / 0.13, 0, 1), 4), snap(o, 3));
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 120, height: 121, background: col, transform: `scaleY(${q})`, transformOrigin: i % 2 ? '50% 100%' : '50% 0%' }} />;
      })}
    </div>;
  },
  slats: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const q = Math.max(1 - ease.out(clamp((p - rnd(i) * 0.07) / 0.13, 0, 1)), o);
        return <div key={i} style={{ flex: 1, background: col, transform: `translateY(${(i % 2 ? -1 : 1) * (1 - q) * 104}%)` }} />;
      })}
    </div>;
  },
  peel: (p, col) => {
    const q = clamp(p / 0.15, 0, 1), o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    const v = Math.max(1 - ease.out(q), o * 1.1);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, clipPath: `polygon(0 0, ${v * 210}% 0, 0 ${v * 210}%)` }} />;
  },
  dots: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gridTemplateRows: 'repeat(6,1fr)', placeItems: 'center' }}>
      {Array.from({ length: 60 }).map((_, i) => {
        const q = Math.max(1 - ease.out(clamp((p - rnd(i) * 0.09) / 0.12, 0, 1)), o);
        return <div key={i} style={{ width: 300, height: 300, borderRadius: 999, background: col, transform: `scale(${q * 1.15})` }} />;
      })}
    </div>;
  },
  swipe: (p, col) => {
    const q = ease.out(clamp(p / 0.14, 0, 1)), o = p > 0.9 ? ease.in((p - 0.9) / 0.1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '52%', background: col, transform: `translateX(${(-q + o) * 104}%)` }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '52%', background: col, transform: `translateX(${(q - o) * 104}%)` }} />
    </div>;
  },
};
/* ---- cameras: stepped, quick, off-centre ---- */
const CAM = {
  whip: (p) => ({ transform: `translateX(${(1 - ease.back(Math.min(p / 0.16, 1))) * 460}px)` }),
  jolt: (p) => ({ transform: `translate(${(snap(p, 7) - p) * 90}px, ${(snap(p * 1.4, 5) - p) * 40}px)` }),
  tiltIn: (p) => ({ transform: `rotate(${(1 - ease.out(p / 0.24)) * 5}deg) scale(${1 + (1 - ease.out(p / 0.4)) * 0.1})` }),
  scanY: (p) => ({ transform: `translateY(${(1 - ease.out(p / 0.2)) * -320}px)` }),
  crop: (p) => ({ transform: `scale(${1 + snap(p, 4) * 0.06})` }),
  driftR: (p) => ({ transform: `translateX(${-p * 40}px)` }),
};
/* ---- world: the continuously running background ----
   A properly drawn cat: arched spine, layered body forms, striped flank, folded
   ears with inner tone, blinking eyes with slit pupils, whiskers, and a tail that
   swishes on its own S-curve. A walk cycle carries it along the ledge; it pauses
   to sit, the way a cat does. Off the composition clock. */
const AMB = 1.1;
const K_BODY = K.lighten(C.accent, 0.34);
const K_DARK = K.darken(C.accent, 0.2);
const K_INNER = K.lighten(C.accent, 0.62);
const K_STRIPE = K.alpha(K.darken(C.accent, 0.3), 0.42);

/* The cat is drawn by the shared cartoon set: folded ears with an inner tone,
   slit pupils that blink and look, whiskers, striped flank, a two-segment tail
   that curls, and a sit pose it settles into. */
const IL = window.Illo.make({ primary: C.accent, secondary: C.accent2, fur: K.lighten(C.accent, 0.2) });
function Figure({ fn, t, x, y, h, ...rest }) {
  return <g transform={`translate(${x},${y}) scale(${h / (fn.h || 110)})`}>{fn(t, rest)}</g>;
}

/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Eyes: 'MOMENT',
  Hook: 'INTRO',
  Crop1: 'INTRO',
  Ch1: 'PROBLEM',
  Ignore: 'PROBLEM',
  Bowl: 'PROBLEM',
  Stat1: 'DATA',
  Quote1: 'PROBLEM',
  Litter: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Pillars: 'SOLUTION',
  Feature1: 'FEATURE',
  Feature2: 'FEATURE',
  Feature3: 'DATA',
  Scent: 'FEATURE',
  Vet: 'MOMENT',
  Pack: 'FEATURE',
  Ch3: 'DATA',
  Stats: 'DATA',
  Purr: 'MOMENT',
  Compare: 'DATA',
  Reviews: 'SOLUTION',
  Ch4: 'SOLUTION',
  Montage: 'DATA',
  Breeds: 'FEATURE',
  Nap: 'MOMENT',
  Map: 'DATA',
  Founder: 'INTRO',
  Ch5: 'CTA',
  Guarantee: 'CTA',
  Referral: 'CTA',
  Free: 'MOMENT',
  CTA: 'CTA',
  End: 'CTA',
  Water: 'FEATURE',
  Night: 'DATA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own world as one decor layer. Scene energy drives the cat's
   walk, so she crosses the ledge faster on an energetic beat. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const cycle = (t * 0.05 * s.energy) % 1;
  const cx = -300 + cycle * (W2 + 600);
  const un = (t * 0.12 * s.energy) % 1;
  const tints = [C.accent, C.accent2, C.stone, K.lighten(C.accent, 0.4), K.lighten(C.accent2, 0.3)];
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[0, 1, 2].map(k => {
        const sh = Math.sin(t * (0.13 + k * 0.05) + k) * 70;
        return <polygon key={k} points={`${160 + k * 430 + sh},-20 ${520 + k * 430 + sh},-20 ${390 + k * 430 + sh * 1.5},${H} ${20 + k * 430 + sh * 1.5},${H}`}
          fill={K.alpha(tints[k], 0.075)} />;
      })}
      <rect x={0} y={H - 196} width={W} height={9} rx={5} fill={K.alpha(C.accent2, 0.3)} />
      <g opacity={0.9}><Figure fn={IL.cat} t={t} x={cx} y={H - 192} h={168} pose="walk" speed={s.energy} /></g>
      <Figure fn={IL.cat} t={t} x={W - 224} y={H - 192} h={142} pose="sit" />
      <Figure fn={IL.plant} t={t} x={56} y={H - 192} h={88} seed={2} />
      {IL.defs()}
      <g opacity={0.45}>
        <path d={`M ${240 - un * 70} ${H - 168} q 190 -40 350 24 q 140 54 280 -14`} fill="none" stroke={K.alpha(C.accent, 0.75)} strokeWidth={7}
          strokeDasharray={1400} strokeDashoffset={1400 * (1 - un)} strokeLinecap="round" />
        <g transform={`translate(${240 - un * 70},${H - 168}) rotate(${t * 110})`}>
          <circle r={42 * (1 - un * 0.3)} fill={K.alpha(C.accent, 0.9)} />
          <path d="M -32 -12 q 32 26 64 -6 M -28 16 q 28 -32 58 -10" fill="none" stroke={K.alpha(C.cream, 0.65)} strokeWidth={4} />
        </g>
      </g>
      {[0, 1, 2, 3].map(k => {
        const ph = (t * 0.13 + k * 0.25) % 1;
        return <rect key={'o' + k} x={460 + k * 340} y={250 + ph * (H - 420)} width={46} height={46} rx={12}
          fill={K.alpha(tints[(k + 1) % tints.length], 0.34 * (1 - ph * 0.4))}
          transform={`rotate(${ph * 320} ${483 + k * 340} ${273 + ph * (H - 420)})`} />;
      })}
      {Array.from({ length: 22 }).map((_, k) => (
        <circle key={'m' + k} cx={120 + ((k * 113) % 1600) + Math.sin(t * 0.5 + k) * 34} cy={150 + ((k * 173) % 700) + Math.cos(t * 0.4 + k * 1.3) * 28}
          r={2.8} fill={K.alpha(k % 4 === 0 ? C.accent : C.cream, 0.34)} />))}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent, C.accent2, K.lighten(C.accent, 0.3), C.stone],
  ink: C.cream, light: C.cream, decor: DECOR,
});

const TAGS = ['NINE LIVES · A CAT FILM', 'SHE IS NOT IGNORING YOU', 'THE BOWL, OBSERVED', 'NAP ARCHITECTURE', 'CONSENT NEGOTIATED HOURLY'];
const FOOTS = ['filmed between naps, quietly', 'she approved this cut, eventually', 'no cat was persuaded to perform', 'the log was kept by hand', 'four proteins, one opinion'];
const SIDES = ['WATCH · WAIT · FEED', 'SIXTEEN HOURS A DAY', 'THE BOX WON AGAIN'];
function Backdrop() {
  const a = K.useActive();
  const bg = a.bg || C.bg;
  return <div style={{ position: 'absolute', inset: 0, background: bg }}>
    {GROUND(bg, a.p, a.T, a.name)}
    {/* readability wash: one instance, so contrast behind type holds through a cut */}
    <div style={{ position: 'absolute', inset: 0, background: bg, opacity: 0.34, pointerEvents: 'none' }} />
  </div>;
}
function Garnish() {
  const a = K.useActive();
  const i = a.index, t = a.T * ENERGY;
  /* Ink comes from the ground actually painted, not a hand-typed scene list. */
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
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const HEAD = (s, c) => ({ fontFamily: FH, fontWeight: 400, fontSize: s, lineHeight: 1.0, letterSpacing: '-0.015em', color: c, margin: 0 });
const SERIF = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.06, color: c, margin: 0, fontWeight: 400 });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.42, color: c, margin: 0, fontWeight: 400 });
const LEAD = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.32, color: c, margin: 0, fontWeight: 600 });
const LABEL = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 800, letterSpacing: '0.2em', color: c, margin: 0 });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 140px', boxSizing: 'border-box' };
const EDGE = { position: 'absolute', inset: 0, padding: '120px 140px', boxSizing: 'border-box' };
/* off-grid: content deliberately anchored away from centre and allowed to bleed */
const OFF = (l, t) => ({ position: 'absolute', left: l, top: t });

/* ---- signature ornaments ---- */
function Pupil({ x, y, s = 1, p, color, ring }) {
  const narrow = 1 - ease.inOut(clamp((p - 0.3) / 0.4, 0, 1)) * 0.82;
  return <svg width={220 * s} height={220 * s} viewBox="0 0 220 220" style={{ position: 'absolute', left: x, top: y }}>
    <circle cx="110" cy="110" r="104" fill={ring} />
    <ellipse cx="110" cy="110" rx={78 * narrow} ry="94" fill={color} />
  </svg>;
}
function Whiskers({ x, y, w = 460, color, q = 1, flip = false }) {
  return <svg width={w} height={200} viewBox="0 0 460 200" style={{ position: 'absolute', left: x, top: y, transform: flip ? 'scaleX(-1)' : 'none' }}>
    {[0, 1, 2].map(i => (
      <path key={i} d={`M10 ${70 + i * 30} Q 230 ${40 + i * 46} 450 ${20 + i * 58}`} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray="520" strokeDashoffset={520 * (1 - clamp((q - i * 0.12) / 0.6, 0, 1))} />
    ))}
  </svg>;
}
function Tag({ children, bg, fg, rot = 0, size = 26, style }) {
  return <div style={{ ...LABEL(size, fg), display: 'inline-block', background: bg, padding: '12px 28px', borderRadius: 8, whiteSpace: 'nowrap', transform: `rotate(${rot}deg)`, ...style }}>{children}</div>;
}
/* crop window: an image slot inside a frame that resizes mid-scene */
/* raw is the scene's real progress (makeScene's third callback arg): the aspect
   change must sit mid-scene, not inside the accelerated choreography window. */
function CropWindow({ raw, from, to, at = 0.5, id, r = 12, style, placeholder }) {
  const t = ease.inOut(clamp((raw - at) / 0.3, 0, 1));
  const w = from[0] + (to[0] - from[0]) * t, h = from[1] + (to[1] - from[1]) * t;
  return <div style={{ width: w, height: h, borderRadius: r, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', ...style }}>
    <Fill id={id} shape="rect" placeholder={placeholder || 'DROP IMAGE'} idle={C.ink} />
  </div>;
}
function Chapter({ p, n, title, sub }) {
  const bars = 6;
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    {Array.from({ length: bars }).map((_, i) => {
      const q = ease.out(stg(p, i, 0.05, 0.3));
      return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 180, height: 181, background: i % 2 ? C.accent : C.ink, transform: `translateX(${(1 - q) * (i % 2 ? -102 : 102)}%)` }} />;
    })}
    <div style={{ ...OFF(150, 250), background: C.ink, borderRadius: 24, padding: '40px 56px 46px', opacity: ease.out((p - 0.3) / 0.3) }}>
      <div style={HEAD(280, C.cream)}>{n}</div>
      <div style={{ ...SERIF(88, C.accent), marginTop: -6 }}>{title}</div>
      {sub ? <div style={{ ...LABEL(28, alpha(C.cream, 0.65)), marginTop: 20 }}>{sub}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  /* Own solid surface: the chrome sits outside the scene tree and cannot read
     each scene's ground, so it carries its own contrast. */
  return <div style={{ position: 'absolute', top: 40, right: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px 9px 20px', background: C.ink, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.28)', pointerEvents: 'none' }}>
    <span style={{ ...LABEL(24, C.cream) }}>{(window.OM_TWEAKS || {}).brandName || 'MERROW'}</span>
    <div style={{ width: 30, height: 30, borderRadius: 6, overflow: 'hidden' }}><Fill id="cat-mark" shape="rounded" radius={6} placeholder="LOGO" /></div>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.ink} wipe="dots" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Whiskers x={-40} y={420} w={620} color={alpha(C.accent, 0.5)} q={ease.out(p / 0.6)} />
          <Whiskers x={1340} y={420} w={620} color={alpha(C.accent, 0.5)} q={ease.out(p / 0.6)} flip />
          <div style={{ ...OFF(180, 360) }}>
            <Chars t="merrow" p={p} size={260} color={C.cream} font={FH} mode="rise" per={0.05} style={{ fontWeight: 800, letterSpacing: '-0.05em' }} />
            <div style={{ ...LABEL(30, C.accent), marginTop: 18, opacity: ease.out((p - 0.5) / 0.3) }}>FOR THE ANIMAL THAT CHOSE YOU</div>
          </div>
          <LogoSlot id="cat-logo" size={150} p={p} d={0.3} shape="rounded" style={{ ...OFF(1520, 200), borderRadius: 20 }} />
        </div>)}
      </Scene>

      <Scene name="Eyes" bg={C.accent} wipe="shutter" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Pupil x={420} y={330} s={1.6} p={p} color={C.ink} ring={C.accent2} />
          <Pupil x={1120} y={330} s={1.6} p={p} color={C.ink} ring={C.accent2} />
          <div style={{ ...OFF(0, 860), width: '100%', textAlign: 'center', ...HEAD(72, C.ink), opacity: ease.out((p - 0.5) / 0.3) }}>She has already decided about you.</div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.bg} wipe="swipe" wipeColor={C.cream}>{(p) => (
        <div style={EDGE}>
          {['cats do not', 'perform', 'gratitude.'].map((l, i) => {
            const q = ease.back(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ ...HEAD(i === 1 ? 190 : 130, i === 1 ? C.accent : C.cream), marginLeft: i * 90, opacity: q, transform: `translateX(${(1 - q) * -140}px)` }}>{l}</div>;
          })}
          <div style={{ ...LEAD(42, C.accent2), marginTop: 40, marginLeft: 90, opacity: ease.out((p - 0.5) / 0.3) }}>Which makes the small signals worth reading.</div>
        </div>)}
      </Scene>

      <Scene name="Crop1" bg={C.ink} wipe="peel" wipeColor={C.accent2}>{(p, lt, raw) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <CropWindow id="cat-hero" raw={raw} from={[520, 900]} to={[1180, 640]} at={0.42} style={{ ...OFF(120, 90) }} placeholder="DROP HERO IMAGE" />
          <div style={{ ...OFF(1340, 210), width: 460 }}>
            <Tag bg={C.accent} fg={C.ink} rot={-2}>THE BRIEF</Tag>
            <div style={{ ...SERIF(74, C.cream), marginTop: 20 }}>Read the cat, not the label.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.ink} wipe="slats" wipeColor={C.cream}>{(p) => <Chapter p={p} n="01" title="What she isn't telling you" sub="SIX QUIET SIGNALS" />}</Scene>

      <Scene name="Ignore" bg={C.cream} wipe="dots" wipeColor={C.stone}>{(p) => {
        const signs = ['Eats half, walks off', 'Sleeps nineteen hours', 'Water, only running', 'Grooms one patch', 'Hides after dinner', 'Sits by the door'];
        return <div style={{ ...EDGE, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignContent: 'center' }}>
          {signs.map((s, i) => {
            const q = ease.out(stg(p, i, 0.06, 0.24));
            return <div key={i} style={{ background: i % 2 ? C.stone : C.ink, color: i % 2 ? C.ink : C.cream, borderRadius: 14, padding: '24px 32px', ...LEAD(40, i % 2 ? C.ink : C.cream), opacity: q, transform: `translateY(${(1 - q) * 44}px)` }}>{s}</div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Bowl" bg={C.bg} wipe="shutter" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ ...OFF(-120, 240), width: 900, height: 600, borderRadius: 24, overflow: 'hidden' }}>
            <Fill id="cat-bowl" shape="rect" placeholder="DROP BOWL IMAGE" idle={alpha(C.taupe, 0.4)} />
          </div>
          <div style={{ ...OFF(880, 300), width: 900 }}>
            <div style={HEAD(150, C.cream)}>half</div>
            <div style={HEAD(150, C.accent)}>eaten.</div>
            <div style={{ ...BODY(40, alpha(C.cream, 0.78)), marginTop: 24, maxWidth: 700 }}>The most common thing owners describe, and the one nobody escalates.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Stat1" bg={C.accent2} wipe="swipe" wipeColor={C.cream}>{(p) => (
        <div style={{ ...EDGE, display: 'flex', alignItems: 'center', gap: 70 }}>
          <div style={{ ...HEAD(400, C.ink), lineHeight: 0.82 }}><Counter target={61} p={p} dur={0.45} suffix="%" /></div>
          <div style={{ maxWidth: 720 }}>
            <Words t="of cats are fed the same food every day of their lives." p={p} d={0.2} style={SERIF(62, C.cream)} />
            <div style={{ ...LABEL(26, alpha(C.ink, 0.7)), marginTop: 26, opacity: ease.out((p - 0.6) / 0.3) }}>SOURCE: OWNER SURVEY, N=2,400</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.ink} wipe="peel" wipeColor={C.accent}>{(p, lt) => (
        <div style={EDGE}>
          <div style={{ ...SERIF(150, C.accent), lineHeight: 0.4, marginBottom: 44 }}>“</div>
          <div style={{ maxWidth: 1500, minHeight: 280 }}>
            <Typed t="I assumed she was fussy. She was bored." p={p} lt={lt} dur={0.55} caretColor={C.accent} style={HEAD(96, C.cream)} />
          </div>
          <div style={{ ...LABEL(28, C.accent2), marginTop: 30, opacity: ease.out((p - 0.7) / 0.2) }}>NAOMI · AND A TORTOISESHELL CALLED PIP</div>
        </div>)}
      </Scene>

      <Scene name="Habits" bg={C.cream} wipe="slats" wipeColor={C.accent2}>{(p) => {
        const hours = [['00', 0.2], ['04', 0.9], ['08', 0.4], ['12', 0.15], ['16', 0.3], ['20', 0.75], ['23', 0.5]];
        return <div style={{ ...EDGE, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...HEAD(84, C.ink) }}>Her day, plotted honestly.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, height: 420, marginTop: 50 }}>
            {hours.map(([h, v], i) => {
              const q = ease.out(stg(p, i, 0.06, 0.26));
              return <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 360 * v * q, background: v > 0.7 ? C.accent : C.stone, borderRadius: 10 }} />
                <div style={{ ...LABEL(24, C.taupe), marginTop: 14 }}>{h}</div>
              </div>;
            })}
          </div>
          <div style={{ ...LEAD(38, C.accent2), marginTop: 20 }}>Two peaks. Neither at your dinner time.</div>
        </div>;
      }}</Scene>

      <Scene name="Litter" bg={C.bg} wipe="dots" wipeColor={C.stone}>{(p, lt, raw) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <CropWindow id="cat-litter" raw={raw} from={[1400, 500]} to={[760, 780]} at={0.45} style={{ ...OFF(760, 150) }} placeholder="DROP PRODUCT IMAGE" />
          <div style={{ ...OFF(140, 640), width: 640 }}>
            <Tag bg={C.accent2} fg={C.cream} rot={2}>THE OTHER HALF OF THE JOB</Tag>
            <div style={{ ...SERIF(76, C.cream), marginTop: 20 }}>Everything she stands in, too.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Cost" bg={C.stone} wipe="swipe" wipeColor={C.ink}>{(p) => {
        const rows = [['Food she refuses', '£180'], ['Litter that clumps badly', '£96'], ['Unplanned vet trips', '£420'], ['Guesswork', 'constant']];
        return <div style={{ ...EDGE, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1400 }}>
          <Tag bg={C.ink} fg={C.cream} style={{ alignSelf: 'flex-start' }}>THE YEAR, ITEMISED</Tag>
          <div style={{ marginTop: 36 }}>
            {rows.map(([k, v], i) => {
              const q = ease.out(stg(p, i, 0.08, 0.26));
              return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '15px 0', borderBottom: `2px solid ${alpha(C.ink, 0.2)}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
                <span style={LEAD(46, C.ink)}>{k}</span><span style={{ flex: 1 }} />
                <span style={SERIF(50, darken(C.accent, 0.3))}>{v}</span>
              </div>;
            })}
          </div>
          <div style={{ ...HEAD(80, darken(C.accent, 0.28)), marginTop: 30, opacity: ease.back((p - 0.62) / 0.24) }}>£696, and she still walks off.</div>
        </div>;
      }}</Scene>

      <Scene name="Turn" bg={C.accent} wipe="shutter" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <div style={HEAD(170, C.ink)}>so we built</div>
          <div style={HEAD(170, C.cream)}>a listener.</div>
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.accent2} wipe="dots" wipeColor={C.ink}>{(p) => <Chapter p={p} n="02" title="How Merrow works" sub="THREE PARTS, ONE HABIT" />}</Scene>

      <Scene name="Pillars" bg={C.cream} wipe="slats" wipeColor={C.stone}>{(p) => {
        const cols = [['Rotate', 'four proteins, cycled'], ['Portion', 'weighed to her, not the bag'], ['Watch', 'one line a day, that is all']];
        return <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {cols.map(([t2, s2], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.3));
            return <div key={i} style={{ flex: 1, background: [C.ink, C.accent, C.accent2][i], display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 60, boxSizing: 'border-box', transform: `translateY(${(1 - q) * (i === 1 ? -100 : 100)}%)` }}>
              <div style={HEAD(96, C.cream)}>{t2}</div>
              <div style={{ ...BODY(34, alpha(C.cream, 0.85)), marginTop: 12 }}>{s2}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Feature1" bg={C.bg} wipe="peel" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Slot id="cat-feat-1" w={880} h={660} r={24} p={p} enter="right" style={{ ...OFF(940, 210) }} />
          <div style={{ ...OFF(140, 300), width: 780 }}>
            <Tag bg={C.accent} fg={C.ink}>FEATURE 01</Tag>
            <div style={{ ...HEAD(96, C.cream), marginTop: 22 }}>Four proteins, on rotation.</div>
            <div style={{ ...BODY(38, alpha(C.cream, 0.78)), marginTop: 20, maxWidth: 680 }}>Variety is not a luxury for cats — it is how you find the one she will not walk away from.</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              {['RABBIT', 'DUCK', 'HAKE', 'CHICKEN'].map((c, i) => {
                const q = ease.back(stg(p - 0.4, i, 0.07, 0.2));
                return <Tag key={i} bg={i % 2 ? C.accent2 : C.stone} fg={i % 2 ? C.cream : C.ink} size={22} style={{ transform: `scale(${q})` }}>{c}</Tag>;
              })}
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Ingredients" bg={C.cream} wipe="dots" wipeColor={C.accent2}>{(p) => {
        const bits = [['RABBIT', '58%'], ['BROTH', '22%'], ['PUMPKIN', '9%'], ['TAURINE', '4%'], ['OILS', '4%'], ['MINERALS', '3%']];
        return <div style={{ ...EDGE, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, alignContent: 'center' }}>
          {bits.map(([k, v], i) => {
            const q = ease.back(stg(p, i, 0.06, 0.22));
            return <div key={i} style={{ background: i === 0 ? C.accent : C.stone, borderRadius: 14, padding: '28px 32px', textAlign: 'left', transform: `scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
              <div style={LABEL(22, i === 0 ? C.ink : C.taupe)}>{k}</div>
              <div style={{ ...HEAD(72, C.ink), marginTop: 6 }}>{v}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Feature2" bg={C.ink} wipe="swipe" wipeColor={C.cream}>{(p, lt, raw) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <CropWindow id="cat-feat-2" raw={raw} from={[1180, 620]} to={[700, 860]} at={0.4} style={{ ...OFF(-60, 110) }} />
          <div style={{ ...OFF(760, 420), width: 900 }}>
            <Tag bg={C.accent2} fg={C.cream}>FEATURE 02</Tag>
            <div style={{ ...HEAD(92, C.cream), marginTop: 22 }}>Weighed to the gram.</div>
            <div style={{ ...BODY(38, alpha(C.cream, 0.78)), marginTop: 18, maxWidth: 660 }}>Indoor, ten years old, four kilos — that is a different portion from the one printed on a bag.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Texture" bg={C.stone} wipe="slats" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {[[100, 120, 460, 620, -3], [600, 260, 520, 540, 2], [1180, 90, 620, 700, -1.5]].map(([l, t2, w, h, r], i) => {
            const q = ease.back(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ position: 'absolute', left: l, top: t2, width: w, height: h, borderRadius: 16, overflow: 'hidden', transform: `translateY(${(1 - q) * 180}px) rotate(${r}deg) scale(${q})`, opacity: q > 0 ? 1 : 0, boxShadow: '0 20px 50px rgba(0,0,0,0.28)' }}>
              <Fill id={`cat-tex-${i}`} shape="rect" placeholder="DROP IMAGE" idle={C.ink} />
            </div>;
          })}
          <div style={{ ...OFF(140, 890), ...LABEL(30, C.ink), opacity: ease.out((p - 0.5) / 0.3) }}>PATE · SHREDS · BROTH</div>
        </div>)}
      </Scene>

      <Scene name="Feature3" bg={C.accent} wipe="shutter" wipeColor={C.ink}>{(p) => {
        const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        return <div style={MID}>
          <div style={{ ...HEAD(88, C.ink) }}>One line a day.</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 50 }}>
            {days.map((d, i) => {
              const q = ease.back(stg(p, i, 0.06, 0.22));
              const done = i < 5;
              return <div key={i} style={{ width: 150, height: 190, borderRadius: 16, background: done ? C.ink : alpha(C.ink, 0.18), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, transform: `scale(${q}) rotate(${(1 - q) * 10}deg)`, opacity: q > 0 ? 1 : 0 }}>
                <span style={LABEL(28, done ? C.accent : alpha(C.ink, 0.5))}>{d}</span>
                <span style={{ ...HEAD(52, done ? C.cream : alpha(C.ink, 0.4)) }}>{done ? '✓' : '·'}</span>
              </div>;
            })}
          </div>
          <div style={{ ...LEAD(38, C.ink), marginTop: 40, opacity: ease.out((p - 0.55) / 0.3) }}>Ate well? Yes or no. That is the whole log.</div>
        </div>;
      }}</Scene>

      <Scene name="Scent" bg={C.bg} wipe="dots" wipeColor={C.accent2}>{(p, lt) => (
        <div style={MID}>
          {Array.from({ length: 5 }).map((_, i) => {
            const y = 700 - ((lt * 60 + i * 140) % 800);
            return <svg key={i} width="200" height="200" viewBox="0 0 200 200" style={{ position: 'absolute', left: 700 + Math.sin(lt * 0.8 + i) * 220, top: y, opacity: 0.3 }}>
              <path d="M20 180 Q 100 120 60 60 Q 30 20 110 20" fill="none" stroke={C.accent} strokeWidth="6" strokeLinecap="round" />
            </svg>;
          })}
          <div style={{ position: 'relative', ...SERIF(96, C.cream), maxWidth: 1300 }}>
            <Words t="Warm from the pouch, so it actually smells like something." p={p} per={0.045} style={SERIF(96, C.cream)} />
          </div>
        </div>)}
      </Scene>

      <Scene name="Steps" bg={C.cream} wipe="peel" wipeColor={C.ink}>{(p) => {
        const steps = [['Profile', 'age, weight, indoor or out'], ['Trial box', 'four proteins, small tins'], ['Lock the winner', 'we ship it, she keeps it']];
        return <div style={{ ...EDGE, display: 'flex', alignItems: 'center', gap: 30 }}>
          {steps.map(([t2, s2], i) => {
            const q = ease.back(stg(p, i, 0.11, 0.28));
            return <div key={i} style={{ flex: 1, transform: `translateY(${(1 - q) * 160}px) rotate(${(1 - q) * (i - 1) * 6}deg)`, opacity: q > 0 ? 1 : 0, background: i === 1 ? C.ink : C.stone, borderRadius: 24, padding: '46px 40px', boxSizing: 'border-box', minHeight: 420 }}>
              <div style={{ ...HEAD(140, i === 1 ? C.accent : C.taupe) }}>{i + 1}</div>
              <div style={{ ...HEAD(56, i === 1 ? C.cream : C.ink), marginTop: 10 }}>{t2}</div>
              <div style={{ ...BODY(30, i === 1 ? alpha(C.cream, 0.8) : alpha(C.ink, 0.7)), marginTop: 10 }}>{s2}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Vet" bg={C.accent2} wipe="swipe" wipeColor={C.ink}>{(p) => (
        <div style={{ ...EDGE, display: 'flex', alignItems: 'center', gap: 70 }}>
          <Slot id="cat-vet" w={440} h={560} r={24} p={p} enter="left" />
          <div style={{ maxWidth: 900 }}>
            <Words t="“Rotation solves more feline appetite problems than any supplement I prescribe.”" p={p} d={0.15} per={0.04} style={SERIF(74, C.cream)} />
            <div style={{ ...LABEL(26, C.ink), marginTop: 26, opacity: ease.out((p - 0.65) / 0.25) }}>DR YUSUF KAYA · FELINE MEDICINE</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Pack" bg={C.ink} wipe="slats" wipeColor={C.accent}>{(p, lt, raw) => {
        const slide = ease.inOut(clamp((raw - 0.3) / 0.4, 0, 1));
        return <div style={MID}>
          <div style={{ position: 'relative', width: 1000, height: 560, borderRadius: 24, overflow: 'hidden' }}>
            <Fill id="cat-pack" shape="rect" placeholder="DROP PACKAGING SHOT" idle={alpha(C.taupe, 0.4)} />
            <div style={{ position: 'absolute', inset: 0, background: C.accent, transform: `translateX(${-slide * 101}%)` }} />
          </div>
          <div style={{ ...HEAD(64, C.cream), marginTop: 32, opacity: ease.out((p - 0.6) / 0.3) }}>Tins, not pouches. Recyclable, endlessly.</div>
        </div>;
      }}</Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.accent} wipe="shutter" wipeColor={C.cream}>{(p) => <Chapter p={p} n="03" title="Did she notice" sub="EIGHT WEEKS OF LOGS" />}</Scene>

      <Scene name="Stats" bg={C.bg} wipe="dots" wipeColor={C.stone}>{(p) => {
        const cols = [[87, '%', 'cleared the bowl', C.accent], [8, ' wks', 'to a steady weight', C.accent2], [4, '', 'proteins, always', C.stone]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 40 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ width: 480, height: 480, background: col, borderRadius: 24, display: 'grid', placeItems: 'center', transform: `translateY(${(1 - q) * (i % 2 ? 200 : -200)}px)`, opacity: q }}>
              <div>
                <div style={HEAD(150, i === 2 ? C.ink : C.cream)}><Counter target={n} p={p} d={i * 0.1} dur={0.4} suffix={sfx} /></div>
                <div style={{ ...BODY(32, i === 2 ? alpha(C.ink, 0.75) : alpha(C.cream, 0.85)), marginTop: 8 }}>{lbl}</div>
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Weeks" bg={C.cream} wipe="swipe" wipeColor={C.accent2}>{(p) => {
        const line = [0.3, 0.42, 0.38, 0.55, 0.68, 0.64, 0.8, 0.88];
        const q = ease.inOut(p / 0.7);
        const pts = line.map((v, i) => [180 + i * 220, 780 - v * 520]);
        const shown = Math.floor(q * pts.length);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ ...OFF(140, 120), ...HEAD(76, C.ink) }}>Appetite, logged nightly.</div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.slice(0, shown + 1).map(pt => pt.join(',')).join(' ')} fill="none" stroke={C.accent} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            {pts.slice(0, shown + 1).map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r="14" fill={C.ink} />)}
          </svg>
          <div style={{ ...OFF(140, 880), ...LABEL(26, C.taupe) }}>WEEK 1 → WEEK 8</div>
        </div>;
      }}</Scene>

      <Scene name="Purr" bg={C.accent2} wipe="peel" wipeColor={C.cream}>{(p, lt) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', height: 220 }}>
            {Array.from({ length: 46 }).map((_, i) => (
              <div key={i} style={{ width: 12, height: 20 + Math.abs(Math.sin(lt * 2.4 + i * 0.5)) * (40 + rnd(i) * 120) * clamp(p * 4, 0, 1), borderRadius: 99, background: i % 6 === 0 ? C.ink : C.cream }} />
            ))}
          </div>
          <div style={{ ...HEAD(120, C.ink), marginTop: 34 }}>the sound of yes.</div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.ink} wipe="slats" wipeColor={C.stone}>{(p) => {
        const rows = [['Four proteins on rotation', 'One flavour, forever'], ['Portion by weight', 'Portion by guess'], ['Tins, recyclable', 'Laminate pouches'], ['A log she teaches you', 'No feedback at all']];
        return <div style={{ ...EDGE, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 18, opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
              <div style={{ flex: 1, background: C.accent, borderRadius: 14, padding: '22px 32px', ...LEAD(38, C.ink) }}>{a}</div>
              <div style={{ flex: 1, background: alpha(C.cream, 0.08), borderRadius: 14, padding: '22px 32px', ...LEAD(38, alpha(C.cream, 0.55)) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Testimonial" bg={C.stone} wipe="dots" wipeColor={C.accent}>{(p) => {
        const q = ease.back(p / 0.26);
        return <div style={MID}>
          <div style={{ background: C.cream, borderRadius: 24, padding: '54px 64px', maxWidth: 1340, transform: `scale(${q}) rotate(${(1 - q) * -3}deg)`, textAlign: 'left', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={SERIF(70, C.ink)}>“Eight years of leaving half. Six days of Merrow and the tin goes back empty.”</div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 30 }}>
              <LogoSlot id="cat-owner-1" size={72} p={p} d={0.4} shape="rounded" />
              <span style={LABEL(26, C.taupe)}>DECLAN · AND MOTH, A VERY OLD RUSSIAN BLUE</span>
            </div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Reviews" bg={C.accent} wipe="shutter" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Marquee items={['“empty tin, first time in years”', '“she waits by the cupboard now”', '“the rotation was the trick”', '“no more three brands in the shelf”']} T={T} speed={140} size={44} style={{ top: 200, ...LEAD(44, alpha(C.ink, 0.45)) }} />
          <Marquee items={['“vet noticed at the check-up”', '“the log takes ten seconds”', '“tins go straight in the recycling”']} T={T} speed={110} dir={-1} size={44} style={{ bottom: 210, ...LEAD(44, alpha(C.cream, 0.6)) }} />
          <div style={MID}>
            <div style={{ background: C.accent, padding: '20px 46px' }}>
              <div style={HEAD(170, C.ink)}><Counter target={8214} p={p} dur={0.55} /></div>
              <div style={{ ...LABEL(30, C.cream), textAlign: 'center' }}>EMPTY TINS REPORTED</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Awards" bg={C.cream} wipe="swipe" wipeColor={C.accent2}>{(p) => {
        const badges = [['FELINE FEED AWARD', '2025'], ['VET RECOMMENDED', 'BVA'], ['PACKAGING PRIZE', 'DESIGN WEEK']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 50 }}>
          {badges.map(([t2, s2], i) => {
            const q = ease.elastic(stg(p, i, 0.12, 0.5));
            return <div key={i} style={{ width: 400, padding: '46px 36px', borderRadius: 18, background: i === 1 ? C.ink : C.stone, textAlign: 'center', transform: `scale(${q}) rotate(${(1 - q) * -14}deg)`, opacity: q > 0 ? 1 : 0 }}>
              <div style={LABEL(22, i === 1 ? C.accent : C.taupe)}>{s2}</div>
              <div style={{ ...SERIF(48, i === 1 ? C.cream : C.ink), marginTop: 12 }}>{t2}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.ink} wipe="peel" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="04" title="Who's already listening" sub="TWELVE THOUSAND HOUSEHOLDS" />}</Scene>

      <Scene name="Montage" bg={C.bg} wipe="dots" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Slot id="cat-mont-1" w={900} h={480} r={24} p={p} d={0.04} enter="left" style={{ ...OFF(-80, 140) }} />
          <Slot id="cat-mont-2" w={900} h={480} r={24} p={p} d={0.16} enter="right" style={{ ...OFF(1100, 460) }} />
          <div style={{ ...OFF(880, 90), ...LABEL(28, C.accent) }}>REAL HOUSEHOLDS, REAL TINS</div>
        </div>)}
      </Scene>

      <Scene name="Breeds" bg={C.accent2} wipe="slats" wipeColor={C.cream}>{(p, lt) => {
        const tags = ['moggies', 'ragdolls', 'bengals with opinions', 'rescues', 'siamese', 'one maine coon the size of a dog', 'tabbies', 'sphynxes'];
        return <div style={{ position: 'absolute', inset: 0 }}>
          {tags.map((t2, i) => {
            const q = ease.back(stg(p, i, 0.05, 0.2));
            return <div key={i} style={{ position: 'absolute', left: 120 + (i % 3) * 560 + (i > 5 ? 180 : 0), top: 220 + Math.floor(i / 3) * 220 + Math.sin(lt * 1.5 + i) * 12, transform: `scale(${q}) rotate(${(rnd(i) - 0.5) * 8}deg)`, opacity: q > 0 ? 1 : 0, background: i % 3 === 0 ? C.ink : i % 3 === 1 ? C.cream : C.accent, color: i % 3 === 0 ? C.cream : C.ink, ...LEAD(38, i % 3 === 0 ? C.cream : C.ink), padding: '14px 30px', borderRadius: 10, whiteSpace: 'nowrap' }}>{t2}</div>;
          })}
          <div style={{ ...OFF(120, 880), ...HEAD(72, C.cream) }}>All of them fussy. All of them fed.</div>
        </div>;
      }}</Scene>

      <Scene name="Nap" bg={C.ink} wipe="shutter" wipeColor={C.stone}>{(p, lt, raw) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <CropWindow id="cat-nap" raw={raw} from={[1780, 420]} to={[1180, 700]} at={0.4} style={{ ...OFF(70, 120) }} placeholder="DROP LIFESTYLE IMAGE" />
          <div style={{ ...OFF(1300, 700), width: 540 }}>
            <div style={HEAD(200, C.accent)}>19h</div>
            <div style={{ ...LEAD(36, C.cream), marginTop: 6 }}>asleep, and every hour of it earned</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Plans" bg={C.cream} wipe="swipe" wipeColor={C.stone}>{(p) => {
        const plans = [['Trial', '£12', 'four tins, four proteins'], ['Monthly', '£46', 'her winner, every month'], ['Multi-cat', '£82', 'two cats, separate plans']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 26 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.back(stg(p, i, 0.1, 0.28)); const hero = i === 1;
            return <div key={i} style={{ width: 460, background: hero ? C.ink : C.stone, borderRadius: 24, padding: '48px 40px', boxSizing: 'border-box', transform: `translateY(${(1 - q) * 220}px)`, opacity: q > 0 ? 1 : 0, textAlign: 'left' }}>
              <div style={LABEL(22, hero ? C.accent : C.taupe)}>{n.toUpperCase()}</div>
              <div style={{ ...HEAD(120, hero ? C.cream : C.ink), marginTop: 10 }}>{price}</div>
              <div style={{ ...BODY(32, hero ? alpha(C.cream, 0.8) : alpha(C.ink, 0.7)), marginTop: 10 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Map" bg={C.bg} wipe="dots" wipeColor={C.accent}>{(p, lt) => {
        const pins = [[520, 300], [760, 480], [640, 660], [980, 380], [1160, 600], [1320, 300], [880, 720]];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ ...OFF(420, 200), width: 1120, height: 640, borderRadius: 24, background: alpha(C.cream, 0.06), border: `2px solid ${alpha(C.cream, 0.12)}` }} />
          {pins.map(([x, y], i) => {
            const q = ease.back(stg(p, i, 0.07, 0.24));
            return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 26, height: 26, borderRadius: 999, background: C.accent, transform: `scale(${q})`, boxShadow: `0 0 0 ${6 + Math.sin(lt * 3 + i) * 4}px ${alpha(C.accent, 0.28)}` }} />;
          })}
          <div style={{ ...OFF(140, 890), ...HEAD(68, C.cream) }}>Next-day, everywhere on the island.</div>
        </div>;
      }}</Scene>

      <Scene name="FAQ" bg={C.stone} wipe="slats" wipeColor={C.ink}>{(p) => {
        const qs = [['She hates change.', 'That is what the trial box is for.'], ['Two cats, one bowl?', 'Two plans, two labels, one box.'], ['Raw?', 'No. Gently cooked, then sealed.']];
        return <div style={{ ...EDGE, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
          {qs.map(([q1, a1], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ background: C.cream, borderRadius: 18, padding: '30px 42px', opacity: q, transform: `translateX(${(1 - q) * (i % 2 ? 140 : -140)}px)` }}>
              <div style={SERIF(52, darken(C.accent, 0.24))}>{q1}</div>
              <div style={{ ...BODY(36, C.ink), marginTop: 8 }}>{a1}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.accent} wipe="peel" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Slot id="cat-founder" w={560} h={700} r={24} p={p} enter="left" style={{ ...OFF(140, 190) }} />
          <div style={{ ...OFF(800, 300), width: 900 }}>
            <Tag bg={C.ink} fg={C.cream}>WHY WE STARTED</Tag>
            <div style={{ ...SERIF(70, C.ink), marginTop: 22 }}>Moth stopped eating for nine days and nobody could tell us why.</div>
            <div style={{ ...BODY(36, alpha(C.ink, 0.78)), marginTop: 20, maxWidth: 780 }}>We built the log first, then the food. The log is still the part people write to us about.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 05 ===== */}
      <Scene name="Ch5" bg={C.accent2} wipe="shutter" wipeColor={C.cream}>{(p) => <Chapter p={p} n="05" title="Start the trial" sub="FOUR TINS, TWELVE POUNDS" />}</Scene>

      <Scene name="Guarantee" bg={C.cream} wipe="dots" wipeColor={C.accent}>{(p) => {
        const q = ease.back((p - 0.16) / 0.24);
        return <div style={MID}>
          <Burst p={p} T={T} n={24} colors={[C.accent, C.accent2, C.stone, C.taupe]} spread={560} size={14} />
          <div style={{ position: 'relative', border: `10px solid ${C.ink}`, borderRadius: 24, padding: '24px 66px', transform: `scale(${q}) rotate(${(1 - q) * 8 - 4}deg)`, opacity: q > 0 ? 1 : 0 }}>
            <div style={HEAD(116, C.ink)}>SHE EATS IT</div>
            <div style={{ ...LABEL(32, darken(C.accent, 0.22)), textAlign: 'center' }}>OR YOU PAY NOTHING</div>
          </div>
          <div style={{ ...LEAD(40, C.taupe), marginTop: 40, opacity: ease.out((p - 0.55) / 0.3) }}>No form. Reply to the delivery email.</div>
        </div>;
      }}</Scene>

      <Scene name="Referral" bg={C.ink} wipe="swipe" wipeColor={C.accent2}>{(p) => (
        <div style={MID}>
          <div style={{ background: C.accent, borderRadius: 18, padding: '44px 70px', transform: `scale(${ease.back(p / 0.24)}) rotate(${Math.sin(p * 5) * 1.6}deg)` }}>
            <div style={LABEL(24, C.ink)}>GIVE A TRIAL, GET A TIN</div>
            <div style={{ ...HEAD(104, C.ink), marginTop: 10, letterSpacing: '0.04em' }}>MOTH12</div>
          </div>
          <div style={{ ...LEAD(40, C.cream), marginTop: 40, opacity: ease.out((p - 0.5) / 0.3) }}>Cats talk. Apparently.</div>
        </div>)}
      </Scene>

      <Scene name="Free" bg={C.accent} wipe="slats" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Chars t="four tins." p={p} size={170} color={C.ink} font={FH} mode="drop" per={0.045} style={{ letterSpacing: '-0.02em' }} />
          <Chars t="twelve pounds." p={p} d={0.3} size={170} color={C.cream} font={FH} mode="drop" per={0.04} style={{ letterSpacing: '-0.02em' }} />
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.bg} wipe="dots" wipeColor={C.accent}>{(p) => {
        const bq = ease.back((p - 0.2) / 0.22);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Whiskers x={1420} y={110} w={560} color={alpha(C.accent2, 0.32)} q={ease.out(p / 0.5)} flip />
          <div style={{ ...OFF(200, 300) }}>
            <LogoSlot id="cat-logo-cta" size={140} p={p} shape="rounded" style={{ borderRadius: 18, marginBottom: 26 }} />
            <div style={HEAD(120, C.cream)}>Build her plan</div>
            <div style={HEAD(120, C.accent)}>in two minutes.</div>
            <div style={{ display: 'inline-block', marginTop: 40, transform: `scale(${bq * (1 + Math.sin(T * 3.4) * 0.02)})`, opacity: bq > 0 ? 1 : 0, background: C.accent, color: C.ink, ...LEAD(46, C.ink), fontWeight: 800, padding: '24px 62px', borderRadius: 12 }}>Start the trial →</div>
            <div style={{ ...LABEL(30, alpha(C.cream, 0.7)), marginTop: 24 }}>MERROW.CAT</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="shutter" wipeColor={C.accent}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ ...MID, opacity: fade }}>
          <Pupil x={860} y={200} s={0.9} p={p} color={C.ink} ring={C.accent} />
          <div style={{ marginTop: 260 }}>
            <Chars t="merrow" p={p} size={200} color={C.cream} font={FH} mode="rise" per={0.05} style={{ fontWeight: 800, letterSpacing: '-0.05em' }} />
          </div>
          <div style={{ ...LABEL(28, C.accent2), marginTop: 14 }}>FOR THE ANIMAL THAT CHOSE YOU</div>
        </div>;
      }}</Scene>

      <Scene name="Water" bg={C.ink} wipe="dots" wipeColor={C.accent2}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const t2 = ((lt * 1.4 + i * 0.5) % 2) / 2;
            return <div key={i} style={{ position: 'absolute', left: 300 + i * 190, top: 120 + t2 * 700, width: 14, height: 26 + t2 * 22, borderRadius: 999, background: C.accent2, opacity: 1 - t2 * 0.8 }} />;
          })}
          <div style={{ ...OFF(180, 420) }}>
            <div style={HEAD(280, C.accent)}><Counter target={4} p={p} dur={0.4} suffix="x" /></div>
            <div style={{ ...LEAD(44, C.cream), marginTop: 8, maxWidth: 900 }}>more water drunk when it moves. Cats are desert animals with a grudge.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Night" bg={C.bg} wipe="swipe" wipeColor={C.ink}>{(p) => {
        const split = ease.inOut(clamp(p / 0.5, 0, 1));
        return <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ flex: 1, background: C.ink, transform: `translateY(${(1 - split) * -100}%)`, display: 'grid', placeItems: 'center' }}>
            <div><div style={LABEL(26, C.taupe)}>WHAT YOU SEE</div><div style={{ ...HEAD(96, alpha(C.cream, 0.5)), marginTop: 10 }}>asleep</div></div>
          </div>
          <div style={{ flex: 1, background: C.accent, transform: `translateY(${(1 - split) * 100}%)`, display: 'grid', placeItems: 'center' }}>
            <div><div style={LABEL(26, alpha(C.ink, 0.6))}>WHAT SHE DOES</div><div style={{ ...HEAD(96, C.ink), marginTop: 10 }}>hunts at 4am</div></div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Trust" bg={C.stone} wipe="peel" wipeColor={C.accent}>{(p, lt, raw) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <CropWindow id="cat-trust" raw={raw} from={[700, 820]} to={[1240, 560]} at={0.45} style={{ ...OFF(560, 130) }} placeholder="DROP LIFESTYLE IMAGE" />
          <div style={{ ...OFF(120, 780), width: 620 }}>
            <div style={SERIF(66, C.ink)}>Trust is a slow protocol.</div>
            <div style={{ ...BODY(34, alpha(C.ink, 0.72)), marginTop: 12 }}>Food is the first line of it.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Kitchen" bg={C.cream} wipe="shutter" wipeColor={C.accent2}>{(p) => {
        const steps = [['Cut', 'whole muscle, never meal'], ['Steam', 'sealed, 88°'], ['Seal', 'tinned same shift']];
        return <div style={{ ...EDGE, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
          <div style={{ ...HEAD(80, C.ink), marginBottom: 14 }}>Three moves in the kitchen.</div>
          {steps.map(([t2, s2], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 30, opacity: q, transform: `translateX(${(1 - q) * -90}px)`, borderBottom: `2px solid ${alpha(C.ink, 0.16)}`, paddingBottom: 14 }}>
              <span style={{ ...HEAD(84, C.accent), width: 90 }}>{i + 1}</span>
              <span style={LEAD(50, C.ink)}>{t2}</span>
              <span style={{ flex: 1 }} />
              <span style={BODY(32, C.taupe)}>{s2}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Garnish />
    </div>
  );
}

window.CatCuriousFilm = function CatCuriousFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
