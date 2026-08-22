/* KEYFRAME long-form template 04 — LUNCH RUSH
   Motion world: a modular tile grid that shuffles and flips, order-tracking UI,
   price tags and receipt strips. Fast, saturated, high-contrast colour blocks.
   Energetic — built for restaurants, cafés and delivery. */
const K = window.FilmKit;
const { ease, stg, rnd, Words, Chars, Typed, Counter, Roll, Marquee, Slot, LogoSlot, Fill, Burst, Cursor, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-text', '#241d17'),
  bg: DS('--color-bg', '#f5ead8'),
  cream: DS('--color-neutral-100', '#fffaf1'),
  sun: DS('--color-accent-300', '#e8b44f'),
  deep: DS('--color-accent-800', '#8f3d1c'),
  night: DS('--color-neutral-900', '#2e2419'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');

/* ---- transition language: tiles, zips, dealt cards, ticker strips ---- */
const TR = {
  tiles: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gridTemplateRows: 'repeat(3,1fr)' }}>
      {Array.from({ length: 18 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - rnd(i) * 0.06) / 0.12, 0, 1)), o);
        return <div key={i} style={{ background: col, opacity: Math.min(1, v * 2.4), transform: `scale(${v}) rotate(${(1 - v) * 20}deg)` }} />;
      })}
    </div>;
  },
  zip: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    const v = Math.max(1 - ease.out(clamp(p / 0.13, 0, 1)), o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: col, transform: `translateY(${(v - 1) * 101}%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', background: col, transform: `translateY(${(1 - v) * 101}%)` }} />
    </div>;
  },
  deal: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[0, 1, 2, 3].map(i => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.025) / 0.12, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', inset: 0, background: i % 2 ? lighten(col, 0.18) : col, borderRadius: v > 0.03 ? 40 : 0, transform: `translate(${v * (i % 2 ? -108 : 108)}%, ${v * (i < 2 ? -14 : 14)}%) rotate(${v * (i % 2 ? -8 : 8)}deg)` }} />;
      })}
    </div>;
  },
  strip: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: 7 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.016) / 0.12, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 155, height: 156, background: col, transform: `translateX(${(i % 2 ? -1 : 1) * (1 - v) * 103}%)` }} />;
      })}
    </div>;
  },
  pop: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    const v = Math.max(1 - ease.out(clamp(p / 0.14, 0, 1)), o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, clipPath: `circle(${v * 92}% at 82% 18%)`, opacity: v > 0.02 ? 1 : 0 }} />;
  },
};
/* ---- cameras: quick, punchy, slightly unsettled ---- */
const CAM = {
  punch: (p) => ({ transform: `scale(${1 + (1 - ease.back(Math.min(p / 0.14, 1))) * 0.14})` }),
  slideUp: (p) => ({ transform: `translateY(${(1 - ease.back(Math.min(p / 0.16, 1))) * 300}px)` }),
  shuffle: (p) => {
    const s = 1 - clamp(p / 0.3, 0, 1);
    return { transform: `translate(${Math.sin(p * 40) * 10 * s}px, ${Math.cos(p * 34) * 8 * s}px)` };
  },
  tilt3d: (p) => ({ transform: `perspective(2000px) rotateY(${(1 - ease.out(p / 0.3)) * 12}deg) scale(${1.02 - ease.out(p / 0.4) * 0.02})` }),
  rushL: (p) => ({ transform: `translateX(${(1 - ease.out(p / 0.18)) * 620}px)` }),
  hold: (p) => ({ transform: `scale(${1.01 + Math.sin(p * 7) * 0.008})` }),
};
/* ---- world: the continuously running background ----
   Neon service bands, a scooter running a scrolling road, a sweeping clock, an
   order printer feeding tickets, a bento grid pulsing, steaming cups. */
const AMB = 1.9;
const HUES = [C.accent, C.accent2, C.sun, '#7a5f9e', '#3c8fbf', C.deep];
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Clock: 'INTRO',
  Peak: 'DATA',
  Ch1: 'PROBLEM',
  Queue: 'PROBLEM',
  Wait: 'DATA',
  Quote1: 'PROBLEM',
  Paralysis: 'PROBLEM',
  Waste: 'DATA',
  Cost: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Board: 'FEATURE',
  Sourcing: 'FEATURE',
  Order: 'FEATURE',
  Notify: 'FEATURE',
  Feature1: 'FEATURE',
  Route: 'FEATURE',
  Rain: 'MOMENT',
  Window: 'DATA',
  Hot: 'FEATURE',
  Dishes: 'FEATURE',
  Diet: 'FEATURE',
  Chef: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  ETA: 'DATA',
  Rating: 'DATA',
  Loyalty: 'DATA',
  Reviews: 'SOLUTION',
  Compare: 'DATA',
  Ch4: 'SOLUTION',
  Montage: 'DATA',
  Cuisines: 'FEATURE',
  Coverage: 'DATA',
  Teams: 'FEATURE',
  Riders: 'FEATURE',
  Plans: 'DATA',
  Invoice: 'DATA',
  Packaging: 'FEATURE',
  Planet: 'DATA',
  FAQ: 'FEATURE',
  Skip: 'FEATURE',
  Founder: 'INTRO',
  Ch5: 'CTA',
  Offer: 'CTA',
  Referral: 'CTA',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own props, handed to the engine as one decorative layer. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const ink = (a) => K.alpha(C.ink, a);
  const ride = (t * 0.14 * s.energy) % 1, sx = -320 + ride * (W2 + 640);
  const bump = Math.sin(t * 9) * 5;
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {HUES.map((c, k) => (
        <rect key={k} x={((k * 320 - t * 42) % (W2 + 320)) - 160} y={0} width={160} height={H2} fill={K.alpha(c, 0.055)} />))}
      <rect x={0} y={H2 - 118} width={W2} height={7} fill={K.alpha(C.accent, 0.22)} />
      {Array.from({ length: 12 }).map((_, k) => (
        <rect key={k} x={((k * 200 - (t * 150)) % (W2 + 200)) - 100} y={H2 - 74} width={110} height={7} fill={K.alpha(C.sun, 0.3)} />))}
      <g transform={`translate(${W2 - 250},240)`} opacity={0.36}>
        <circle r={132} fill={K.alpha(C.cream, 0.25)} />
        <circle r={132} fill="none" stroke={ink(0.3)} strokeWidth={12} />
        {Array.from({ length: 12 }).map((_, k) => (
          <line key={k} x1={0} y1={-112} x2={0} y2={-94} stroke={ink(0.35)} strokeWidth={k % 3 === 0 ? 8 : 4} transform={`rotate(${k * 30})`} />))}
        <line x1={0} y1={0} x2={Math.cos(t * 2 - 1.57) * 104} y2={Math.sin(t * 2 - 1.57) * 104} stroke={C.accent} strokeWidth={7} strokeLinecap="round" />
        <line x1={0} y1={0} x2={Math.cos(t * 0.32 - 1.57) * 72} y2={Math.sin(t * 0.32 - 1.57) * 72} stroke={K.alpha(C.accent2, 0.9)} strokeWidth={10} strokeLinecap="round" />
        <circle r={11} fill={C.accent} />
      </g>
      <g transform={`translate(${sx},${H2 - 168 + bump})`} opacity={0.55}>
        <circle cx={-72} cy={40} r={34} fill="none" stroke={ink(0.8)} strokeWidth={11} />
        <circle cx={92} cy={40} r={34} fill="none" stroke={ink(0.8)} strokeWidth={11} />
        <path d="M -72 40 L -20 -14 L 62 -14 L 92 40" fill="none" stroke={K.alpha(C.accent2, 0.9)} strokeWidth={12} strokeLinecap="round" />
        <rect x={-14} y={-96} width={80} height={72} rx={8} fill={K.alpha(C.accent, 0.9)} />
        <rect x={2} y={-78} width={48} height={10} rx={4} fill={K.alpha(C.cream, 0.7)} />
        <path d="M -20 -14 q -26 -46 -8 -84" fill="none" stroke={ink(0.8)} strokeWidth={10} strokeLinecap="round" />
        <circle cx={-26} cy={-118} r={26} fill={K.alpha(C.sun, 0.9)} />
      </g>
      <g transform={`translate(150,${H2 - 500})`} opacity={0.4}>
        <rect x={-14} y={-14} width={332} height={230} rx={14} fill={ink(0.1)} stroke={ink(0.28)} strokeWidth={4} />
        {[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].map(([cx2, cy2], k) => {
          const e = ((t * 0.5 + k * 0.16) % 1) < 0.72 ? 1 : 0.34;
          return <rect key={k} x={cx2 * 104} y={cy2 * 104} width={94} height={94} rx={12} fill={K.alpha(HUES[k % HUES.length], 0.7 * e)}
            transform={`rotate(${Math.sin(t * 1.2 + k) * 1.6} ${cx2 * 104 + 47} ${cy2 * 104 + 47})`} />;
        })}
      </g>
      <g transform={`translate(${W2 - 620},${H2 - 470})`} opacity={0.36}>
        <rect x={-8} y={-40} width={186} height={54} rx={8} fill={ink(0.6)} />
        {[0, 1].map(k => {
          const feed = ((t * 0.34 + k * 0.5) % 1);
          return <g key={k} transform={`translate(14,${14 + feed * 250})`} opacity={1 - feed * 0.8}>
            <rect width={150} height={92} rx={4} fill={K.alpha(C.cream, 0.85)} />
            {[0, 1, 2].map(j => <rect key={j} x={16} y={20 + j * 22} width={110 - j * 26} height={7} rx={3} fill={K.alpha(j === 0 ? C.accent : C.ink, 0.4)} />)}
          </g>;
        })}
      </g>
      {[0, 1, 2].map(k => (
        <g key={k} transform={`translate(${560 + k * 150},${H2 - 168})`} opacity={0.36}>
          <path d="M -30 -34 h 60 l -7 62 h -46 z" fill={K.alpha(HUES[(k + 2) % HUES.length], 0.7)} />
          {[0, 1].map(j => {
            const ph = (t * 0.4 + k * 0.3 + j * 0.5) % 1;
            return <path key={j} d={`M ${-12 + j * 24} ${-48 - ph * 200} q 16 -30 0 -60`} fill="none" stroke={K.alpha(C.cream, 0.3 * (1 - ph))} strokeWidth={9} strokeLinecap="round" />;
          })}
        </g>))}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent, C.sun, C.accent2, C.deep],
  ink: C.ink, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['LUNCH HOUR · 12:00\u201313:00', 'SIXTY MINUTES, USED WELL', 'DESK LUNCH ABOLISHED', 'THE QUEUE IS THE PROBLEM', 'HOT, ON TIME'];
const FOOTS = ['timed with an actual stopwatch', 'the microwave queue is real', 'eaten away from the keyboard', 'leftovers are a strategy', 'no one queued for this'];
const SIDES = ['ORDER · WALK · EAT', 'AWAY FROM THE SCREEN', 'TWELVE TO ONE, DEFENDED'];

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

const NUM = (s, c) => ({ fontFamily: FB, fontWeight: 800, fontSize: s, letterSpacing: '-0.04em', lineHeight: 0.92, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const DISH = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.04, color: c, margin: 0, fontWeight: 400 });
const HEAD = (s, c) => ({ fontFamily: FB, fontWeight: 800, fontSize: s, letterSpacing: '-0.035em', lineHeight: 0.96, color: c, margin: 0 });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.42, color: c, margin: 0, fontWeight: 500 });
const CAPS = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 800, letterSpacing: '0.18em', color: c, margin: 0 });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 130px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '130px 140px', boxSizing: 'border-box' };

/* ---- signature furniture ---- */
function Price({ v, bg, fg, rot = -4, size = 46, style }) {
  return <div style={{ display: 'inline-block', background: bg || C.accent, color: fg || C.cream, ...NUM(size, fg || C.cream), padding: '12px 26px', borderRadius: 10, transform: `rotate(${rot}deg)`, boxShadow: '0 6px 0 rgba(36,29,23,0.22)', ...style }}>{v}</div>;
}
function Chip({ children, bg, fg, size = 24, style }) {
  return <div style={{ display: 'inline-block', background: bg, color: fg, ...CAPS(size, fg), padding: '11px 24px', borderRadius: 999, whiteSpace: 'nowrap', ...style }}>{children}</div>;
}
/* order stepper — the template's UI signature */
function Stepper({ steps, p, at = 0, color, track, ink }) {
  const active = clamp(at, 0, steps.length - 1);
  return <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
    {steps.map((s, i) => {
      const done = i <= active;
      const q = ease.back(stg(p, i, 0.1, 0.26));
      return <React.Fragment key={i}>
        {i > 0 ? <div style={{ flex: 1, height: 8, background: track, marginTop: 34, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${done ? 100 : 0}%`, background: color }} />
        </div> : null}
        <div style={{ textAlign: 'center', width: 220, transform: `scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
          <div style={{ width: 76, height: 76, borderRadius: 999, margin: '0 auto', background: done ? color : track, display: 'grid', placeItems: 'center', ...NUM(34, done ? C.cream : ink) }}>{done ? '✓' : i + 1}</div>
          <div style={{ ...CAPS(20, ink), marginTop: 14 }}>{s}</div>
        </div>
      </React.Fragment>;
    })}
  </div>;
}
function Receipt({ rows, total, p, bg, ink, accent, style }) {
  return <div style={{ width: 560, background: bg, padding: '38px 40px', boxSizing: 'border-box', ...style }}>
    <div style={{ ...CAPS(20, accent), marginBottom: 18 }}>ORDER · 12:47</div>
    {rows.map(([k, v], i) => {
      const q = ease.out(stg(p, i, 0.07, 0.22));
      return <div key={i} style={{ display: 'flex', gap: 14, padding: '9px 0', opacity: q, borderBottom: `1px dashed ${alpha(ink, 0.3)}` }}>
        <span style={{ ...BODY(30, ink), flex: 1 }}>{k}</span><span style={NUM(30, ink)}>{v}</span>
      </div>;
    })}
    <div style={{ display: 'flex', gap: 14, marginTop: 18, opacity: ease.out((p - 0.5) / 0.3) }}>
      <span style={{ ...CAPS(24, ink), flex: 1 }}>TOTAL</span><span style={NUM(44, accent)}>{total}</span>
    </div>
  </div>;
}
function Stars({ n = 5, p, color, size = 40, d = 0 }) {
  return <div style={{ display: 'flex', gap: 8 }}>
    {Array.from({ length: n }).map((_, i) => {
      const q = ease.back(stg(p - d, i, 0.08, 0.22));
      return <span key={i} style={{ fontSize: size, color, transform: `scale(${q})`, display: 'inline-block' }}>★</span>;
    })}
  </div>;
}
function Chapter({ p, n, title, deck, ground, ink, tile }) {
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gridTemplateRows: 'repeat(3,1fr)' }}>
      {Array.from({ length: 18 }).map((_, i) => {
        const q = ease.back(stg(p, i, 0.018, 0.26));
        return <div key={i} style={{ background: i % 3 === 0 ? tile : ground, transform: `scale(${q})` }} />;
      })}
    </div>
    <div style={{ position: 'absolute', left: 140, top: 300, opacity: ease.out((p - 0.3) / 0.3) }}>
      <div style={NUM(260, ink)}>{n}</div>
      <div style={{ ...DISH(88, ink), marginTop: -6 }}>{title}</div>
      {deck ? <div style={{ ...BODY(36, alpha(ink, 0.8)), marginTop: 18, maxWidth: 860 }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  return <div style={{ position: 'absolute', top: 38, left: 46, display: 'flex', alignItems: 'center', gap: 12, background: C.ink, borderRadius: 999, padding: '9px 24px 9px 10px', pointerEvents: 'none' }}>
    <div style={{ width: 30, height: 30, borderRadius: 999, overflow: 'hidden' }}><Fill id="lr-mark" shape="circle" placeholder="LOGO" /></div>
    <span style={CAPS(22, C.cream)}>{(window.OM_TWEAKS || {}).brandName || 'MIDDAY'}</span>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.accent} wipe="tiles" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <LogoSlot id="lr-logo" size={170} p={p} d={0.05} shape="circle" />
          <div style={{ marginTop: 26 }}><Chars t="MIDDAY" p={p} d={0.2} size={230} color={C.cream} font={FB} mode="pop" per={0.05} style={{ fontWeight: 800, letterSpacing: '-0.045em' }} /></div>
          <div style={{ marginTop: 14, opacity: ease.out((p - 0.55) / 0.3) }}><Chip bg={C.ink} fg={C.sun}>LUNCH, SOLVED BY 12:30</Chip></div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.ink} wipe="zip" wipeColor={C.accent} camera="slideUp">{(p) => (
        <div style={MID}>
          {['YOU HAVE', '43 MINUTES', 'AND NO PLAN.'].map((l, i) => {
            const q = ease.back(stg(p, i, 0.11, 0.28));
            return <div key={i} style={{ ...HEAD(i === 1 ? 190 : 120, i === 1 ? C.sun : C.cream), opacity: q, transform: `scale(${0.7 + q * 0.3})` }}>{l}</div>;
          })}
        </div>)}
      </Scene>

      <Scene name="Clock" bg={C.sun} wipe="strip" wipeColor={C.ink} camera="shuffle">{(p, lt) => {
        const mins = 47 + Math.floor(lt * 2) % 6;
        return <div style={MID}>
          <div style={NUM(400, C.ink)}>12<span style={{ opacity: Math.floor(lt * 2) % 2 ? 1 : 0.25 }}>:</span>{mins}</div>
          <div style={{ ...HEAD(70, C.deep), marginTop: 20 }}>the rush, every single day</div>
        </div>;
      }}</Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.bg} wipe="deal" wipeColor={C.accent}>{(p) => <Chapter p={p} n="01" title="The lunch problem" deck="Forty minutes, six people, one decision nobody wants to make." ground={C.bg} ink={C.ink} tile={C.sun} />}</Scene>

      <Scene name="Queue" bg={C.night} wipe="tiles" wipeColor={C.sun} camera="tilt3d">{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}><Fill id="lr-queue" shape="rect" placeholder="DROP QUEUE IMAGE" idle={C.deep} /></div>
          <div style={{ position: 'absolute', left: 140, top: 280, width: 940 }}>
            <Chip bg={C.accent} fg={C.cream}>THE QUEUE AT 12:40</Chip>
            <div style={{ ...HEAD(120, C.cream), marginTop: 22 }}>Nineteen minutes to reach the counter.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Wait" bg={C.accent} wipe="zip" wipeColor={C.cream}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 80 }}>
          <div style={NUM(380, C.cream)}><Counter target={31} p={p} dur={0.45} suffix="m" /></div>
          <div style={{ textAlign: 'left', maxWidth: 720 }}>
            <Words t="of the average lunch break is spent getting the lunch." p={p} d={0.2} style={DISH(66, C.ink)} />
            <div style={{ marginTop: 24, opacity: ease.out((p - 0.6) / 0.3) }}><Chip bg={C.ink} fg={C.sun} size={20}>UK OFFICE SURVEY, 2025</Chip></div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.cream} wipe="strip" wipeColor={C.accent2}>{(p, lt) => (
        <div style={MID}>
          <div style={{ maxWidth: 1480, minHeight: 300 }}>
            <Typed t="We spent longer choosing than eating. Every day." p={p} lt={lt} dur={0.58} caretColor={C.accent} style={HEAD(100, C.ink)} />
          </div>
          <div style={{ marginTop: 34, opacity: ease.out((p - 0.7) / 0.2) }}><Chip bg={C.accent2} fg={C.cream}>OPS LEAD · 40-PERSON STUDIO</Chip></div>
        </div>)}
      </Scene>

      <Scene name="Paralysis" bg={C.bg} wipe="tiles" wipeColor={C.ink} camera="shuffle">{(p) => {
        const opts = ['salad?', 'noodles again', 'the meal deal', 'skip it', 'that place is shut', 'nobody agrees', 'too far', 'too slow'];
        return <div style={{ ...PAD, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: 18 }}>
          {opts.map((o, i) => {
            const q = ease.back(stg(p, i, 0.05, 0.22));
            return <div key={i} style={{ background: i % 3 === 0 ? C.accent : i % 3 === 1 ? C.sun : C.cream, borderRadius: 18, display: 'grid', placeItems: 'center', transform: `scale(${q}) rotate(${(rnd(i) - 0.5) * 6}deg)`, opacity: q > 0 ? 1 : 0, ...DISH(46, i % 3 === 2 ? C.ink : C.ink) }}>{o}</div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Cost" bg={C.night} wipe="deal" wipeColor={C.accent} camera="slideUp">{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Receipt rows={[['Meal deal, again', '£4.20'], ['Coffee, out', '£3.60'], ['The thing you did not want', '£8.90'], ['Wasted minutes', '31']]} total="£16.70" p={p} bg={C.cream} ink={C.ink} accent={C.accent} />
          <div style={{ maxWidth: 800 }}>
            <div style={HEAD(96, C.cream)}>Eighty-three pounds a week, per desk.</div>
            <div style={{ ...BODY(38, alpha(C.cream, 0.75)), marginTop: 22 }}>And no one can tell you what they ate on Tuesday.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Turn" bg={C.accent2} wipe="pop" wipeColor={C.sun}>{(p) => (
        <div style={MID}>
          <div style={HEAD(160, C.cream)}>SO WE PUT LUNCH</div>
          <div style={HEAD(160, C.ink)}>ON A TIMER.</div>
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.bg} wipe="tiles" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="02" title="How Midday works" deck="One board, one tap, one twelve-minute window." ground={C.bg} ink={C.ink} tile={C.accent2} />}</Scene>

      <Scene name="Board" bg={C.ink} wipe="strip" wipeColor={C.sun} camera="tilt3d">{(p) => {
        const dishes = [['Chilli beef bowl', '£8.20', C.accent], ['Roast squash salad', '£7.40', C.accent2], ['Katsu roll', '£8.90', C.sun], ['Soup + sourdough', '£6.10', C.cream]];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...CAPS(24, C.sun), marginBottom: 24 }}>TODAY'S BOARD · FOUR THINGS ONLY</div>
          {dishes.map(([n, price, col], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '20px 0', borderBottom: `2px solid ${alpha(C.cream, 0.16)}`, opacity: q, transform: `translateX(${(1 - q) * -80}px)` }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: col }} />
              <span style={DISH(62, C.cream)}>{n}</span>
              <span style={{ flex: 1 }} />
              <span style={NUM(52, col)}>{price}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Order" bg={C.cream} wipe="zip" wipeColor={C.accent}>{(p, lt, raw) => {
        const at = Math.floor(clamp(raw / 0.85, 0, 1) * 4) - 1;
        const cx = 1180 - ease.out(clamp(raw / 0.3, 0, 1)) * 300;
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 140, right: 140, top: 300 }}>
            <div style={{ ...HEAD(84, C.ink), marginBottom: 70 }}>Tap once at 11:50.</div>
            <Stepper steps={['ORDERED', 'COOKING', 'ON ROUTE', 'AT THE DESK']} p={p} at={at} color={C.accent} track={alpha(C.ink, 0.14)} ink={C.ink} />
            <div style={{ ...BODY(38, alpha(C.ink, 0.7)), marginTop: 60 }}>You get one notification, and it is the one that says it has arrived.</div>
          </div>
          <Cursor x={cx} y={560} click={clamp((raw - 0.3) / 0.2, 0, 1) < 1 ? clamp((raw - 0.3) / 0.2, 0, 1) : 0} color={C.accent} ink={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Feature1" bg={C.sun} wipe="deal" wipeColor={C.cream} camera="rushL">{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <div style={{ flex: '0 0 780px' }}>
            <Chip bg={C.ink} fg={C.sun}>FEATURE 01</Chip>
            <div style={{ ...HEAD(104, C.ink), marginTop: 22 }}>Real kitchens, four streets away.</div>
            <div style={{ ...BODY(38, C.deep), marginTop: 20, maxWidth: 680 }}>Nine independents cook to their own menu. We only handle the window.</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              {['NO DARK KITCHENS', 'NO GHOST BRANDS'].map((c, i) => {
                const q = ease.back(stg(p - 0.4, i, 0.08, 0.2));
                return <Chip key={i} bg={C.accent} fg={C.cream} size={20} style={{ transform: `scale(${q})` }}>{c}</Chip>;
              })}
            </div>
          </div>
          <Slot id="lr-kitchen" w={800} h={640} r={20} p={p} d={0.15} enter="right" tilt={2} />
        </div>)}
      </Scene>

      <Scene name="Route" bg={C.night} wipe="pop" wipeColor={C.accent2}>{(p, lt, raw) => {
        const q = ease.inOut(clamp(raw / 0.85, 0, 1));
        const px = 240 + q * 1420, py = 700 - Math.sin(q * Math.PI) * 300;
        return <div style={{ position: 'absolute', inset: 0 }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <path d="M240 700 Q 960 200 1660 700" fill="none" stroke={alpha(C.cream, 0.2)} strokeWidth="8" />
            <path d="M240 700 Q 960 200 1660 700" fill="none" stroke={C.accent} strokeWidth="8" strokeDasharray="2400" strokeDashoffset={2400 * (1 - q)} strokeLinecap="round" />
            <circle cx={px} cy={py} r="22" fill={C.sun} />
          </svg>
          <div style={{ position: 'absolute', left: 140, bottom: 150, width: 900 }}>
            <div style={HEAD(88, C.cream)}>Twelve minutes, door to desk.</div>
            <div style={{ ...BODY(34, alpha(C.cream, 0.7)), marginTop: 14 }}>Insulated, sealed, still steaming.</div>
          </div>
          <div style={{ position: 'absolute', right: 140, top: 200, textAlign: 'right' }}>
            <div style={CAPS(22, C.sun)}>ETA</div>
            <div style={NUM(150, C.cream)}>{Math.max(1, 12 - Math.round(q * 11))}′</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Window" bg={C.bg} wipe="tiles" wipeColor={C.ink} camera="slideUp">{(p) => {
        const slots = [['11:50', 'order closes'], ['12:02', 'kitchens start'], ['12:20', 'riders leave'], ['12:32', 'at the desk']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...HEAD(80, C.ink), marginBottom: 50 }}>The whole thing runs on one window.</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {slots.map(([t2, l], i) => {
              const q = ease.back(stg(p, i, 0.1, 0.26));
              return <div key={i} style={{ flex: 1, background: i === 3 ? C.accent : C.cream, borderRadius: 20, padding: '32px 28px', transform: `translateY(${(1 - q) * 140}px) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <div style={NUM(72, i === 3 ? C.cream : C.ink)}>{t2}</div>
                <div style={{ ...CAPS(20, i === 3 ? alpha(C.cream, 0.85) : alpha(C.ink, 0.6)), marginTop: 10 }}>{l}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Dishes" bg={C.cream} wipe="strip" wipeColor={C.sun} camera="shuffle">{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
          {[[420, 520, -2], [480, 640, 1], [420, 500, 3]].map(([w, h, r], i) => (
            <div key={i} style={{ position: 'relative' }}>
              <Slot id={`lr-dish-${i}`} w={w} h={h} r={18} p={p} d={0.06 + i * 0.09} enter="rise" tilt={r} />
              <Price v={['£8.20', '£7.40', '£6.10'][i]} bg={[C.accent, C.accent2, C.sun][i]} fg={i === 2 ? C.ink : C.cream} rot={i % 2 ? 5 : -5} style={{ position: 'absolute', right: -16, top: -18, opacity: ease.back((p - 0.4) / 0.26) }} />
            </div>))}
        </div>)}
      </Scene>

      <Scene name="Diet" bg={C.accent2} wipe="deal" wipeColor={C.cream}>{(p) => {
        const tags = ['VEGAN', 'GF', 'DAIRY-FREE', 'NUT-FREE', 'HIGH PROTEIN', 'LOW CARB'];
        return <div style={MID}>
          <div style={{ ...HEAD(88, C.cream), marginBottom: 40 }}>Filtered once, remembered forever.</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1400 }}>
            {tags.map((t2, i) => {
              const q = ease.back(stg(p, i, 0.07, 0.22));
              return <Chip key={i} bg={i % 2 ? C.ink : C.cream} fg={i % 2 ? C.sun : C.ink} size={28} style={{ transform: `scale(${q})`, padding: '16px 32px' }}>{t2}</Chip>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Chef" bg={C.ink} wipe="zip" wipeColor={C.accent} camera="tilt3d">{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 70 }}>
          <Slot id="lr-chef" w={520} h={620} r={20} p={p} enter="left" />
          <div style={{ maxWidth: 880 }}>
            <Words t="“They order at 11:50. I know exactly what to cook at 12:02. I have never worked a calmer service.”" p={p} d={0.15} per={0.038} style={DISH(66, C.cream)} />
            <div style={{ marginTop: 28, opacity: ease.out((p - 0.72) / 0.2) }}><Chip bg={C.sun} fg={C.ink}>OWNER · KOTO NOODLE BAR</Chip></div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.bg} wipe="pop" wipeColor={C.sun}>{(p) => <Chapter p={p} n="03" title="Does it hold up" deck="Four thousand desks, ninety days." ground={C.bg} ink={C.ink} tile={C.accent} />}</Scene>

      <Scene name="Stats" bg={C.cream} wipe="tiles" wipeColor={C.accent}>{(p) => {
        const cols = [[12, '′', 'kitchen to desk', C.accent], [98, '%', 'arrive hot', C.accent2], [0, '', 'lunch decisions', C.ink]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 30 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.back(stg(p, i, 0.11, 0.28));
            return <div key={i} style={{ width: 460, background: col, borderRadius: 26, padding: '54px 40px', boxSizing: 'border-box', transform: `translateY(${(1 - q) * 200}px) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
              <div style={{ ...NUM(160, C.cream), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.11} dur={0.4} suffix={sfx} /></div>
              <div style={{ ...BODY(32, alpha(C.cream, 0.86)), marginTop: 12 }}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="ETA" bg={C.night} wipe="strip" wipeColor={C.accent2}>{(p) => {
        const bars = [['Mon', 11], ['Tue', 12], ['Wed', 12], ['Thu', 13], ['Fri', 14]];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...CAPS(24, C.sun), marginBottom: 30 }}>MEDIAN DELIVERY, LAST WEEK</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40, height: 460 }}>
            {bars.map(([d, v], i) => {
              const q = ease.out(stg(p, i, 0.08, 0.28));
              return <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ ...NUM(52, C.cream), marginBottom: 14, opacity: q }}>{Math.round(v * q)}′</div>
                <div style={{ height: 340 * (v / 16) * q, background: v > 13 ? C.sun : C.accent, borderRadius: 14 }} />
                <div style={{ ...CAPS(22, alpha(C.cream, 0.6)), marginTop: 14 }}>{d}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Rating" bg={C.sun} wipe="deal" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Stars n={5} p={p} color={C.ink} size={90} />
          <div style={{ ...NUM(240, C.deep), marginTop: 24 }}><Counter target={4.9} p={p} dur={0.5} decimals={1} /></div>
          <div style={{ ...HEAD(52, C.ink), marginTop: 10 }}>across 11,204 lunches</div>
        </div>)}
      </Scene>

      <Scene name="Reviews" bg={C.accent} wipe="zip" wipeColor={C.cream}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Marquee items={['“it just turns up”', '“hot, every time”', '“the board is the best part”', '“no more 1pm decisions”']} T={T} speed={150} size={54} style={{ top: 210, ...DISH(54, alpha(C.cream, 0.5)) }} />
          <Marquee items={['“the katsu roll, weekly”', '“our whole floor uses it”', '“twelve minutes, not a lie”']} T={T} speed={118} dir={-1} size={54} style={{ bottom: 220, ...DISH(54, alpha(C.ink, 0.35)) }} />
          <div style={MID}>
            <div style={{ background: C.accent, padding: '20px 46px' }}>
              <div style={NUM(180, C.cream)}><Counter target={11204} p={p} dur={0.55} /></div>
              <div style={{ ...CAPS(28, C.ink), textAlign: 'center' }}>LUNCHES DELIVERED</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.bg} wipe="tiles" wipeColor={C.night}>{(p) => {
        const rows = [['Four dishes, chosen daily', 'Two hundred, none good'], ['Twelve minutes', 'Forty-five, optimistic'], ['Nine local kitchens', 'One dark kitchen, four brands'], ['One flat fee', 'Fees on fees']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 18, opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
              <div style={{ flex: 1, background: C.accent, borderRadius: 18, padding: '24px 34px', ...BODY(40, C.cream), fontWeight: 700 }}>{a}</div>
              <div style={{ flex: 1, background: C.cream, borderRadius: 18, padding: '24px 34px', ...BODY(40, alpha(C.ink, 0.5)) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.bg} wipe="deal" wipeColor={C.accent}>{(p) => <Chapter p={p} n="04" title="Who eats with us" deck="Studios, clinics, sites and one very hungry newsroom." ground={C.bg} ink={C.ink} tile={C.sun} />}</Scene>

      <Scene name="Montage" bg={C.night} wipe="strip" wipeColor={C.cream} camera="rushL">{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 26 }}>
          <Slot id="lr-mont-1" w={820} h={480} r={18} p={p} d={0.05} enter="left" tilt={-1.5} />
          <Slot id="lr-mont-2" w={820} h={480} r={18} p={p} d={0.16} enter="right" tilt={1.5} />
        </div>)}
      </Scene>

      <Scene name="Cuisines" bg={C.accent2} wipe="tiles" wipeColor={C.cream}>{(p, lt) => {
        const tags = ['thai', 'levantine', 'north indian', 'sicilian', 'korean', 'peruvian', 'georgian', 'proper sandwiches'];
        return <div style={{ position: 'absolute', inset: 0 }}>
          {tags.map((t2, i) => {
            const q = ease.back(stg(p, i, 0.05, 0.2));
            return <div key={i} style={{ position: 'absolute', left: 130 + (i % 3) * 560 + (i > 5 ? 200 : 0), top: 230 + Math.floor(i / 3) * 230 + Math.sin(lt * 1.6 + i) * 14, transform: `scale(${q}) rotate(${(rnd(i) - 0.5) * 8}deg)`, opacity: q > 0 ? 1 : 0, background: i % 3 === 0 ? C.accent : i % 3 === 1 ? C.cream : C.ink, ...DISH(46, i % 3 === 1 ? C.ink : C.cream), padding: '14px 32px', borderRadius: 14, whiteSpace: 'nowrap' }}>{t2}</div>;
          })}
          <div style={{ position: 'absolute', left: 140, bottom: 130, ...HEAD(76, C.cream) }}>Nine kitchens, rotating weekly.</div>
        </div>;
      }}</Scene>

      <Scene name="Coverage" bg={C.cream} wipe="pop" wipeColor={C.accent}>{(p, lt) => {
        const zones = [[520, 320], [760, 460], [660, 620], [980, 380], [1180, 560], [1340, 330]];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 440, top: 220, width: 1120, height: 420, borderRadius: 26, background: alpha(C.ink, 0.05) }} />
          {zones.map(([x, y], i) => {
            const q = ease.back(stg(p, i, 0.07, 0.24));
            return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 24, height: 24, borderRadius: 999, background: C.accent, transform: `scale(${q})`, boxShadow: `0 0 0 ${6 + Math.sin(lt * 3 + i) * 5}px ${alpha(C.accent, 0.24)}` }} />;
          })}
          <div style={{ position: 'absolute', left: 140, bottom: 150, width: 900 }}>
            <div style={HEAD(76, C.ink)}>Six zones, one twelve-minute promise.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Teams" bg={C.ink} wipe="zip" wipeColor={C.sun} camera="slideUp">{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 22 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.back(stg(p, i, 0.08, 0.24));
              return <div key={i} style={{ width: 260, height: 260, borderRadius: 20, overflow: 'hidden', transform: `translateY(${(1 - q) * 180}px) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <Fill id={`lr-team-${i}`} shape="rounded" radius={20} placeholder="DROP TEAM PHOTO" idle={C.night} />
              </div>;
            })}
          </div>
          <div style={{ ...HEAD(76, C.cream), marginTop: 44 }}>Whole floors, one order.</div>
        </div>)}
      </Scene>

      <Scene name="Plans" bg={C.bg} wipe="deal" wipeColor={C.ink}>{(p) => {
        const plans = [['Solo', '£0', 'pay per lunch'], ['Desk', '£28', 'five lunches a week'], ['Floor', '£240', 'ten desks, one invoice']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 26 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.back(stg(p, i, 0.1, 0.28)); const hero = i === 1;
            return <div key={i} style={{ width: 460, background: hero ? C.accent : C.cream, borderRadius: 26, padding: '48px 40px', boxSizing: 'border-box', textAlign: 'left', transform: `translateY(${(1 - q) * 200}px) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
              <div style={CAPS(20, hero ? alpha(C.cream, 0.85) : C.accent)}>{n.toUpperCase()}</div>
              <div style={{ ...NUM(120, hero ? C.cream : C.ink), marginTop: 10 }}>{price}</div>
              <div style={{ ...BODY(32, hero ? alpha(C.cream, 0.85) : alpha(C.ink, 0.7)), marginTop: 10 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Packaging" bg={C.sun} wipe="tiles" wipeColor={C.cream}>{(p, lt, raw) => {
        const open = ease.inOut(clamp((raw - 0.3) / 0.4, 0, 1));
        return <div style={MID}>
          <div style={{ position: 'relative', width: 940, height: 540, borderRadius: 22, overflow: 'hidden' }}>
            <Fill id="lr-pack" shape="rect" placeholder="DROP PACKAGING SHOT" idle={C.deep} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: C.sun, transformOrigin: '50% 0', transform: `translateY(${-open * 100}%)` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', background: C.sun, transformOrigin: '50% 100%', transform: `translateY(${open * 100}%)` }} />
          </div>
          <div style={{ ...HEAD(64, C.ink), marginTop: 30, opacity: ease.out((p - 0.62) / 0.28) }}>Pulp box, paper band, no sleeve.</div>
        </div>;
      }}</Scene>

      <Scene name="Planet" bg={C.accent2} wipe="strip" wipeColor={C.cream}>{(p) => {
        const cols = [[100, '%', 'compostable packaging'], [0, '', 'single-use plastic'], [92, '%', 'deliveries by bike']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 80 }}>
          {cols.map(([n, sfx, lbl], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ width: 440, opacity: q, transform: `translateY(${(1 - q) * 60}px)` }}>
              <div style={{ ...NUM(170, C.cream), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.4} suffix={sfx} /></div>
              <div style={{ ...BODY(32, C.ink), marginTop: 14 }}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="FAQ" bg={C.cream} wipe="zip" wipeColor={C.accent2}>{(p) => {
        const qs = [['Missed the 11:50 cutoff?', 'There is a second window at 12:40.'], ['Allergies?', 'Set once. The board filters itself.'], ['Nobody in the office?', 'Skip from the notification.']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
          {qs.map(([q1, a1], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ background: C.bg, borderRadius: 22, padding: '30px 42px', opacity: q, transform: `translateX(${(1 - q) * (i % 2 ? 140 : -140)}px)` }}>
              <div style={DISH(54, C.accent)}>{q1}</div>
              <div style={{ ...BODY(36, C.ink), marginTop: 8 }}>{a1}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.night} wipe="pop" wipeColor={C.sun} camera="tilt3d">{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="lr-founder" w={560} h={660} r={20} p={p} enter="left" />
          <div style={{ maxWidth: 840 }}>
            <Chip bg={C.accent} fg={C.cream}>WHY WE BUILT IT</Chip>
            <div style={{ ...DISH(72, C.cream), marginTop: 22 }}>I ran a café that was empty at 11 and drowning at 1.</div>
            <div style={{ ...BODY(36, alpha(C.cream, 0.75)), marginTop: 20 }}>Midday is that curve, flattened — for the kitchens as much as the desks.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 05 ===== */}
      <Scene name="Ch5" bg={C.bg} wipe="tiles" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="05" title="Order tomorrow" deck="First week free, no card, no contract." ground={C.bg} ink={C.ink} tile={C.accent2} />}</Scene>

      <Scene name="Offer" bg={C.accent} wipe="deal" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Burst p={p} T={T} n={22} colors={[C.sun, C.cream, C.accent2]} spread={560} size={14} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 28 }}>
            <span style={{ ...NUM(180, alpha(C.ink, 0.4)), textDecoration: 'line-through' }}>£28</span>
            <span style={{ ...NUM(280, C.cream), opacity: ease.out((p - 0.3) / 0.3) }}>FREE</span>
          </div>
          <div style={{ ...HEAD(52, C.ink), marginTop: 18 }}>first week, five lunches</div>
        </div>)}
      </Scene>

      <Scene name="Referral" bg={C.ink} wipe="strip" wipeColor={C.sun} camera="shuffle">{(p) => (
        <div style={MID}>
          <div style={{ background: C.sun, borderRadius: 20, padding: '42px 70px', transform: `scale(${ease.back(p / 0.24)}) rotate(${Math.sin(p * 5) * 1.5}deg)` }}>
            <div style={CAPS(24, C.deep)}>SHARE A DESK, GET A LUNCH</div>
            <div style={{ ...NUM(120, C.ink), marginTop: 10 }}>DESK5</div>
          </div>
          <div style={{ ...HEAD(48, C.cream), marginTop: 40, opacity: ease.out((p - 0.5) / 0.3) }}>Word travels fastest at 12:47.</div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.accent2} wipe="zip" wipeColor={C.ink}>{(p) => {
        const bq = ease.back((p - 0.22) / 0.24);
        return <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="lr-cta" w={720} h={700} r={22} p={p} enter="left" />
          <div>
            <LogoSlot id="lr-logo-cta" size={140} p={p} d={0.1} shape="circle" style={{ marginBottom: 26 }} />
            <div style={HEAD(116, C.cream)}>Lunch, handled</div>
            <div style={HEAD(116, C.ink)}>by half twelve.</div>
            <div style={{ display: 'inline-block', marginTop: 38, transform: `scale(${bq * (1 + Math.sin(T * 3.4) * 0.022)})`, opacity: bq > 0 ? 1 : 0, background: C.ink, color: C.sun, ...HEAD(46, C.sun), padding: '24px 62px', borderRadius: 999 }}>See today's board →</div>
            <div style={{ ...CAPS(28, C.ink), marginTop: 24 }}>MIDDAY.LUNCH</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.accent} wipe="tiles" wipeColor={C.ink}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ ...MID, opacity: fade }}>
          <Chars t="MIDDAY" p={p} size={220} color={C.cream} font={FB} mode="pop" per={0.05} style={{ fontWeight: 800, letterSpacing: '-0.045em' }} />
          <div style={{ marginTop: 18, opacity: ease.out((p - 0.45) / 0.3) }}><Chip bg={C.ink} fg={C.sun} size={26}>LUNCH, SOLVED BY 12:30</Chip></div>
        </div>;
      }}</Scene>

      <Scene name="Notify" bg={C.night} wipe="zip" wipeColor={C.sun} camera="slideUp">{(p) => {
        const q = ease.back(p / 0.26);
        return <div style={MID}>
          <div style={{ width: 1080, background: C.cream, borderRadius: 26, padding: '34px 40px', display: 'flex', alignItems: 'center', gap: 26, transform: `translateY(${(1 - q) * -300}px) scale(${q})`, boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ width: 76, height: 76, borderRadius: 18, background: C.accent, display: 'grid', placeItems: 'center', ...NUM(36, C.cream) }}>12</div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={CAPS(20, C.accent)}>MIDDAY · NOW</div>
              <div style={{ ...HEAD(52, C.ink), marginTop: 6 }}>It's on your desk.</div>
            </div>
            <Chip bg={C.accent2} fg={C.cream} size={20}>12:31</Chip>
          </div>
          <div style={{ ...HEAD(60, C.cream), marginTop: 46, opacity: ease.out((p - 0.5) / 0.3) }}>One notification. That one.</div>
        </div>;
      }}</Scene>

      <Scene name="Hot" bg={C.accent} wipe="strip" wipeColor={C.ink}>{(p) => {
        const q = ease.inOut(p / 0.7);
        return <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 100 }}>
          <div style={{ width: 150, height: 600, background: alpha(C.ink, 0.18), borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${q * 82}%`, background: C.sun }} />
          </div>
          <div style={{ maxWidth: 900 }}>
            <div style={{ ...NUM(220, C.cream), whiteSpace: 'nowrap' }}><Counter target={68} p={p} dur={0.6} suffix="°" /></div>
            <div style={{ ...HEAD(64, C.ink), marginTop: 10 }}>at the desk, measured</div>
            <div style={{ ...BODY(36, alpha(C.ink, 0.8)), marginTop: 16 }}>Insulated pulp holds heat for twenty-two minutes. We use twelve.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Peak" bg={C.cream} wipe="tiles" wipeColor={C.night}>{(p) => {
        const curve = [0.12, 0.2, 0.55, 0.92, 0.7, 0.3, 0.18];
        const q = ease.inOut(p / 0.7);
        const pts = curve.map((v, i) => [200 + i * 250, 760 - v * 460]);
        const shown = Math.floor(q * pts.length);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 140, top: 150, ...HEAD(76, C.ink) }}>The rush is one hour wide.</div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.slice(0, shown + 1).map(a => a.join(',')).join(' ')} fill="none" stroke={C.accent} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            {pts.slice(0, shown + 1).map((a, i) => <circle key={i} cx={a[0]} cy={a[1]} r="13" fill={C.ink} />)}
          </svg>
          <div style={{ position: 'absolute', left: 200, bottom: 190, display: 'flex', gap: 168 }}>
            {['11', '11:30', '12', '12:30', '1', '1:30', '2'].map((t2, i) => <span key={i} style={CAPS(20, alpha(C.ink, 0.55))}>{t2}</span>)}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Riders" bg={C.accent2} wipe="deal" wipeColor={C.cream} camera="rushL">{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[0, 1, 2, 3].map(i => {
              const q = ease.back(stg(p, i, 0.09, 0.24));
              return <div key={i} style={{ width: 300, height: 380, borderRadius: 20, overflow: 'hidden', transform: `translateY(${(1 - q) * 200}px) rotate(${(i % 2 ? 2 : -2)}deg) scale(${q})`, opacity: q > 0 ? 1 : 0 }}>
                <Fill id={`lr-rider-${i}`} shape="rounded" radius={20} placeholder="DROP RIDER PHOTO" idle={C.deep} />
              </div>;
            })}
          </div>
          <div style={{ ...HEAD(72, C.cream), marginTop: 44 }}>Eleven riders. All on payroll.</div>
        </div>)}
      </Scene>

      <Scene name="Waste" bg={C.night} wipe="pop" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gridTemplateRows: 'repeat(5,1fr)', gap: 6, padding: 120, boxSizing: 'border-box' }}>
            {Array.from({ length: 50 }).map((_, i) => {
              const gone = i < Math.floor(ease.inOut(clamp(p / 0.7, 0, 1)) * 47);
              return <div key={i} style={{ background: gone ? alpha(C.cream, 0.08) : C.accent, borderRadius: 8, transform: `scale(${gone ? 0.7 : 1})` }} />;
            })}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 130, textAlign: 'center' }}>
            <span style={{ ...HEAD(72, C.cream), background: C.night, padding: '14px 34px' }}>Three portions wasted in fifty. The trade average is twelve.</span>
          </div>
        </div>)}
      </Scene>

      <Scene name="Loyalty" bg={C.sun} wipe="strip" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <div style={{ background: C.cream, borderRadius: 24, padding: '40px 46px' }}>
            <div style={{ ...CAPS(22, C.deep), marginBottom: 20 }}>TEN LUNCHES, ONE FREE</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const q = ease.back(stg(p, i, 0.05, 0.2));
                const filled = i < 7;
                return <div key={i} style={{ width: 76, height: 76, borderRadius: 999, background: filled ? C.accent : alpha(C.ink, 0.1), display: 'grid', placeItems: 'center', transform: `scale(${q})`, ...NUM(30, filled ? C.cream : alpha(C.ink, 0.4)) }}>{filled ? '★' : i + 1}</div>;
              })}
            </div>
          </div>
          <div style={{ ...HEAD(60, C.ink), marginTop: 40, opacity: ease.out((p - 0.5) / 0.3) }}>Three to go, and it counts itself.</div>
        </div>)}
      </Scene>

      <Scene name="Rain" bg={C.night} wipe="zip" wipeColor={C.accent2}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 30 }).map((_, i) => {
            const y = ((lt * 420 + i * 137) % 1200) - 120;
            return <div key={i} style={{ position: 'absolute', left: rnd(i) * 1880, top: y, width: 3, height: 60, background: alpha(C.cream, 0.22), transform: 'rotate(10deg)' }} />;
          })}
          <div style={{ position: 'absolute', left: 140, top: 340, width: 1100 }}>
            <Chip bg={C.accent2} fg={C.cream}>WET TUESDAY</Chip>
            <div style={{ ...HEAD(110, C.cream), marginTop: 22 }}>Thirteen minutes, in the rain.</div>
            <div style={{ ...BODY(36, alpha(C.cream, 0.72)), marginTop: 18 }}>The promise does not change with the weather. The bikes just get wetter.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Invoice" bg={C.bg} wipe="deal" wipeColor={C.ink}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Receipt rows={[['42 desks', '£1,176'], ['Guest lunches', '£84'], ['Dietary swaps', '£0'], ['Admin time', '0h']]} total="£1,260" p={p} bg={C.cream} ink={C.ink} accent={C.accent2} style={{ borderRadius: 20 }} />
          <div style={{ maxWidth: 780 }}>
            <div style={HEAD(88, C.ink)}>One invoice, once a month.</div>
            <div style={{ ...BODY(38, alpha(C.ink, 0.75)), marginTop: 20 }}>No petty cash, no expense claims, no spreadsheet with everybody's order in it.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Sourcing" bg={C.cream} wipe="tiles" wipeColor={C.accent2}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Marquee items={['MARKET AT 5AM', 'BUTCHER ON THE ROW', 'BAKERY NEXT DOOR', 'FARM BOX TUESDAY']} T={T} speed={130} size={56} style={{ top: 230, ...DISH(56, alpha(C.ink, 0.2)) }} />
          <Marquee items={['NOTHING FROZEN', 'PREPPED THAT MORNING', 'MENU SET AT 9AM']} T={T} speed={100} dir={-1} size={56} style={{ bottom: 240, ...DISH(56, alpha(C.accent, 0.35)) }} />
          <div style={MID}>
            <div style={{ background: C.cream, padding: '26px 46px' }}>
              <Words t="Everything bought the morning you eat it." p={p} style={HEAD(84, C.ink)} />
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Skip" bg={C.accent} wipe="pop" wipeColor={C.night} camera="shuffle">{(p, lt, raw) => {
        const on = raw > 0.4;
        const kq = ease.back((raw - 0.4) / 0.2);
        return <div style={MID}>
          <div style={{ ...HEAD(80, C.cream), marginBottom: 46 }}>Out on Thursday? One switch.</div>
          <div style={{ width: 320, height: 150, borderRadius: 999, background: on ? C.ink : alpha(C.ink, 0.3), position: 'relative' }}>
            <div style={{ position: 'absolute', top: 15, left: 15 + (on ? kq : 0) * 170, width: 120, height: 120, borderRadius: 999, background: C.sun }} />
          </div>
          <div style={{ ...CAPS(28, C.ink), marginTop: 34, opacity: ease.out((raw - 0.6) / 0.2) }}>SKIPPED · NOT CHARGED</div>
        </div>;
      }}</Scene>

      <Garnish />
    </div>
  );
}

window.LunchRushFilm = function LunchRushFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
