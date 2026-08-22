/* KEYFRAME long-form template 05 — SIGNAL
   Motion world: precision instrument. Depth-parallax grid, HUD brackets and
   coordinate readouts, luminous data visualisation, scan-line and aperture
   transitions, dolly and rack-focus cameras. Premium technical, not cyberpunk. */
const K = window.FilmKit;
const { ease, stg, rnd, rnd2, Words, Chars, Typed, Counter, Marquee, Slot, BrowserSlot, LogoSlot, Fill, Drift, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-neutral-900', '#101311'),
  bg: DS('--color-neutral-800', '#171b18'),
  panel: DS('--color-neutral-700', '#1f251f'),
  edge: DS('--color-neutral-600', '#2c342c'),
  cream: DS('--color-bg', '#f5ead8'),
  mute: DS('--color-neutral-400', '#8b968a'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');
const glow = (c, s = 26) => `0 0 ${s}px ${alpha(c, 0.55)}`;

/* ---- transition language: scans, illuminating cells, shears, depth, apertures ---- */
const TR = {
  scan: (p, col) => {
    const q = ease.inOut(clamp(p / 0.16, 0, 1)), o = p > 0.9 ? ease.inOut((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: col, transform: `translateY(${(v - 1) * 100}%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - v) * 100}%`, height: 4, background: C.accent, boxShadow: glow(C.accent, 34), opacity: v > 0.02 && v < 0.99 ? 1 : 0 }} />
    </div>;
  },
  cells: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gridTemplateRows: 'repeat(6,1fr)' }}>
      {Array.from({ length: 72 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - rnd(i) * 0.07) / 0.11, 0, 1)), o);
        return <div key={i} style={{ background: col, opacity: v, transform: `scale(${0.9 + v * 0.1})` }} />;
      })}
    </div>;
  },
  shear: (p, col) => {
    const q = ease.inOut(clamp(p / 0.17, 0, 1)), o = p > 0.9 ? ease.inOut((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-25%', bottom: '-25%', left: '-25%', width: '150%', background: col, transform: `translateX(${(v - 1) * 105}%) skewX(-14deg)` }} />
    </div>;
  },
  depth: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {[0, 1, 2].map(i => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.035) / 0.13, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', inset: 0, background: i === 1 ? lighten(col, 0.08) : col, transform: `scale(${0.2 + v * 1.6})`, opacity: v }} />;
      })}
    </div>;
  },
  aperture: (p, col) => {
    const q = ease.inOut(clamp(p / 0.18, 0, 1)), o = p > 0.9 ? ease.inOut((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${v * 50}%`, background: col }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${v * 50}%`, background: col }} />
    </div>;
  },
};
/* ---- cameras: mechanical, with depth ---- */
const CAM = {
  dolly: (p) => ({ transform: `perspective(2400px) translateZ(${(1 - ease.out(p / 0.3)) * -420}px) scale(${1 + p * 0.02})` }),
  orbit: (p) => ({ transform: `perspective(2400px) rotateY(${(1 - ease.out(p / 0.35)) * -9}deg) translateX(${(1 - ease.out(p / 0.35)) * 90}px)` }),
  glide: (p) => ({ transform: `translateX(${18 - p * 40}px) scale(1.015)` }),
  rack: (p) => ({ filter: `blur(${(1 - ease.out(p / 0.22)) * 14}px)`, transform: `scale(${1.03 - ease.out(p / 0.4) * 0.03})` }),
  liftHUD: (p) => ({ transform: `translateY(${(1 - ease.out(p / 0.26)) * 120}px)` }),
  hold: (p) => ({ transform: `translateY(${Math.sin(p * 5) * 5}px)` }),
};
/* ---- world: the continuously running background ----
   A radar head sweeping lit contacts, three stacked channel traces, packets
   routed between switches, a spectrum floor, an orbiting satellite. */
const AMB = 1.5;
const CH = [C.accent, C.accent2, '#5f9ec4'];
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Live: 'DATA',
  Ingest: 'DATA',
  Ch1: 'PROBLEM',
  Noise: 'PROBLEM',
  MTTR: 'DATA',
  Quote1: 'PROBLEM',
  Sprawl: 'PROBLEM',
  Trace: 'DATA',
  Cost: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Pipeline: 'FEATURE',
  Feature1: 'FEATURE',
  Anomaly: 'MOMENT',
  Rollback: 'FEATURE',
  Feature2: 'FEATURE',
  Gauges: 'DATA',
  Budget: 'DATA',
  Feature3: 'FEATURE',
  Query: 'FEATURE',
  Integrations: 'FEATURE',
  Eng: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  Scale: 'DATA',
  Before: 'DATA',
  Oncall: 'DATA',
  Reviews: 'SOLUTION',
  Proof: 'MOMENT',
  Compare: 'DATA',
  Ch4: 'SOLUTION',
  Regions: 'DATA',
  Security: 'FEATURE',
  Migration: 'FEATURE',
  Console: 'FEATURE',
  Teams: 'FEATURE',
  Plans: 'DATA',
  Onboard: 'FEATURE',
  Founder: 'INTRO',
  Ch5: 'CTA',
  Free: 'MOMENT',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own instruments, handed to the engine as one decor layer. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const a2 = (a) => K.alpha(C.accent2, a);
  const sweep = (t * 42 * s.energy) % 360;
  const traceAt = (yy, sp, amp) => Array.from({ length: 92 }).map((_, k) => {
    const ph = t * sp - k * 0.16;
    return `${k * (W2 / 91)},${yy + Math.sin(ph) * amp * Math.exp(-Math.abs(Math.sin(ph * 0.34)) * 1.6) + Math.sin(ph * 3.1) * (amp * 0.34)}`;
  }).join(' ');
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <g transform={`translate(${W2 - 260},280)`}>
        <circle r={186} fill={K.alpha(C.accent2, 0.05)} />
        {[64, 118, 172].map((r, k) => <circle key={k} r={r} fill="none" stroke={a2(0.18)} strokeWidth={1.6} />)}
        <line x1={-186} y1={0} x2={186} y2={0} stroke={a2(0.13)} strokeWidth={1.4} />
        <line x1={0} y1={-186} x2={0} y2={186} stroke={a2(0.13)} strokeWidth={1.4} />
        <path d={`M 0 0 L ${Math.cos((sweep - 30) * Math.PI / 180) * 172} ${Math.sin((sweep - 30) * Math.PI / 180) * 172} A 172 172 0 0 1 ${Math.cos(sweep * Math.PI / 180) * 172} ${Math.sin(sweep * Math.PI / 180) * 172} Z`} fill={K.alpha(C.accent, 0.18)} />
        <line x1={0} y1={0} x2={Math.cos(sweep * Math.PI / 180) * 172} y2={Math.sin(sweep * Math.PI / 180) * 172} stroke={K.alpha(C.accent, 0.7)} strokeWidth={2.6} />
        {[[0.4, 96, 0], [0.72, 148, 1], [0.15, 58, 2], [0.9, 120, 0]].map(([ang, r, c], k) => {
          const on = Math.abs(((sweep / 360) % 1) - ang) < 0.11;
          return <circle key={k} cx={Math.cos(ang * Math.PI * 2) * r} cy={Math.sin(ang * Math.PI * 2) * r} r={on ? 7 : 3.4} fill={K.alpha(CH[c], on ? 0.95 : 0.34)} />;
        })}
      </g>
      {[[H2 - 118, 2.4, 24], [H2 - 190, 1.7, 17], [H2 - 258, 3.1, 12]].map(([yy, sp, amp], k) => (
        <g key={k}>
          <line x1={0} y1={yy} x2={W2} y2={yy} stroke={a2(0.1)} strokeWidth={1.2} />
          <polyline points={traceAt(yy, sp, amp)} fill="none" stroke={K.alpha(CH[k], 0.4)} strokeWidth={2.2} />
        </g>))}
      {Array.from({ length: 46 }).map((_, k) => {
        const h = 10 + Math.abs(Math.sin(t * 1.6 + k * 0.5)) * (14 + K.rnd(k) * 70);
        return <rect key={'sb' + k} x={40 + k * 41} y={H2 - 40 - h} width={26} height={h} fill={K.alpha(CH[k % 3], 0.16)} />;
      })}
      <path d="M 120 300 h 300 v 180 h 420 v -120 h 380" fill="none" stroke={a2(0.22)} strokeWidth={2} />
      <path d="M 120 620 h 240 v -140 h 300" fill="none" stroke={K.alpha(CH[2], 0.18)} strokeWidth={2} />
      {[0, 1, 2, 3].map(k => {
        const ph = (t * 0.2 + k * 0.25) % 1;
        const pts = [[120, 300], [420, 300], [420, 480], [840, 480], [840, 360], [1220, 360]];
        const s2 = Math.min(Math.floor(ph * 5), 4), f = (ph * 5) % 1;
        return <circle key={k} cx={pts[s2][0] + (pts[s2 + 1][0] - pts[s2][0]) * f} cy={pts[s2][1] + (pts[s2 + 1][1] - pts[s2][1]) * f} r={6} fill={K.alpha(CH[k % 3], 0.8)} />;
      })}
      {[[420, 300], [840, 480], [1220, 360], [360, 620]].map(([x, y], k) => (
        <rect key={k} x={x - 8} y={y - 8} width={16} height={16} fill={K.alpha(CH[k % 3], 0.45)} />))}
      <g transform={`rotate(${t * 7} ${W2 / 2} ${H2 / 2})`}>
        <circle cx={W2 / 2} cy={H2 / 2 - 430} r={6} fill={K.alpha(C.accent, 0.7)} />
      </g>
      <ellipse cx={W2 / 2} cy={H2 / 2} rx={620} ry={430} fill="none" stroke={a2(0.09)} strokeWidth={1.4} />
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'DATA',
  hues: [C.accent, C.accent2, K.lighten(C.accent2, 0.2), C.accent],
  ink: C.mute, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['SIGNAL · AN OPERATIONS FILM', 'ONE PANE OF GLASS', 'ALERTS THAT MEAN SOMETHING', 'MEASURED, NOT GUESSED', 'NINE ALERTS, ALL REAL'];
const FOOTS = ['every figure here is instrumented', 'the pager stayed quiet for this', 'nineteen seconds, unattended', 'read from the real dashboard', 'no sampling, no averages'];
const SIDES = ['DETECT · TRACE · RESOLVE', 'FOUR MILLION EVENTS A SECOND', 'ON-CALL, UNINTERRUPTED'];

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

const STMT = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.03, color: c, margin: 0, fontWeight: 400 });
const NUM = (s, c) => ({ fontFamily: FB, fontWeight: 700, fontSize: s, letterSpacing: '-0.02em', lineHeight: 0.95, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const READ = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 700, letterSpacing: '0.3em', color: c, margin: 0, textTransform: 'uppercase' });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.5, color: c, margin: 0, fontWeight: 400 });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 160px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '150px 150px 140px', boxSizing: 'border-box' };

/* ---- instrument furniture ---- */
function Grid({ T, o = 0.16, depth = 1 }) {
  const step = 120, off = (T * 6 * depth) % step;
  return <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: o }}>
    {Array.from({ length: 18 }).map((_, i) => <line key={'v' + i} x1={i * step + off} y1="0" x2={i * step + off} y2={H} stroke={C.mute} strokeWidth="1" />)}
    {Array.from({ length: 10 }).map((_, i) => <line key={'h' + i} x1="0" y1={i * step} x2={W} y2={i * step} stroke={C.mute} strokeWidth="1" />)}
  </svg>;
}
function Brackets({ inset = 90, color, q = 1, len = 90 }) {
  const c = [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]];
  return <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: q }}>
    {c.map(([x, y, sx, sy], i) => (
      <g key={i} stroke={color} strokeWidth="3" fill="none">
        <line x1={x} y1={y} x2={x + sx * len * q} y2={y} />
        <line x1={x} y1={y} x2={x} y2={y + sy * len * q} />
      </g>))}
  </svg>;
}
function Readout({ items, color, style }) {
  return <div style={{ display: 'flex', gap: 40, ...style }}>
    {items.map(([k, v], i) => (
      <div key={i}>
        <div style={READ(16, alpha(color, 0.55))}>{k}</div>
        <div style={{ ...NUM(30, color), marginTop: 4 }}>{v}</div>
      </div>))}
  </div>;
}
function Spark({ data, w = 420, h = 130, color, q = 1, fill }) {
  const max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - (v / max) * h]);
  const shown = Math.max(2, Math.ceil(q * pts.length));
  const d = pts.slice(0, shown).map((pt, i) => `${i ? 'L' : 'M'}${pt[0]} ${pt[1]}`).join(' ');
  return <svg width={w} height={h} style={{ display: 'block' }}>
    {fill ? <path d={`${d} L${pts[shown - 1][0]} ${h} L0 ${h} Z`} fill={alpha(color, 0.18)} /> : null}
    <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>;
}
function Gauge({ v, size = 300, color, track, ink, label, q = 1 }) {
  const r = size / 2 - 22, CIRC = Math.PI * r;
  return <div style={{ position: 'relative', width: size, height: size / 2 + 40 }}>
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      <path d={`M22 ${size / 2} A ${r} ${r} 0 0 1 ${size - 22} ${size / 2}`} fill="none" stroke={track} strokeWidth="18" strokeLinecap="round" />
      <path d={`M22 ${size / 2} A ${r} ${r} 0 0 1 ${size - 22} ${size / 2}`} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - v * q)} />
    </svg>
    <div style={{ position: 'absolute', left: 0, right: 0, top: size / 2 - 60, textAlign: 'center' }}>
      <div style={NUM(64, ink)}>{Math.round(v * q * 100)}%</div>
      <div style={{ ...READ(15, alpha(ink, 0.6)), marginTop: 6 }}>{label}</div>
    </div>
  </div>;
}
function Panel({ children, label, style, q = 1 }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 14, padding: '26px 30px', opacity: q, ...style }}>
    {label ? <div style={{ ...READ(15, C.mute), marginBottom: 16 }}>{label}</div> : null}
    {children}
  </div>;
}
function Chapter({ p, n, title, deck }) {
  const q = ease.inOut(p / 0.4);
  return <div style={{ position: 'absolute', inset: 0 }}>
    <Grid T={p * 30} o={0.2} />
    <Brackets color={C.accent} q={q} inset={110} />
    <div style={{ position: 'absolute', left: 200, top: 340 }}>
      <div style={{ ...READ(18, C.accent), opacity: ease.out((p - 0.1) / 0.3) }}>SECTION {n}</div>
      <div style={{ ...NUM(230, C.cream), marginTop: 10, opacity: ease.out((p - 0.2) / 0.3), textShadow: glow(C.accent, 40) }}>{n}</div>
      <div style={{ ...STMT(86, C.cream), marginTop: 6, opacity: ease.out((p - 0.34) / 0.3) }}>{title}</div>
      {deck ? <div style={{ ...BODY(34, C.mute), marginTop: 18, maxWidth: 840, opacity: ease.out((p - 0.46) / 0.3) }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  const { T, authoredTotal } = useComposition();
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 44, left: 56, display: 'flex', alignItems: 'center', gap: 12, background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 8, padding: '8px 18px 8px 8px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 4, overflow: 'hidden' }}><Fill id="sg-mark" shape="rounded" radius={4} placeholder="LOGO" /></div>
      <span style={READ(18, C.cream)}>{(window.OM_TWEAKS || {}).brandName || 'SIGNAL'}</span>
    </div>
    <div style={{ position: 'absolute', top: 50, right: 56, ...READ(16, C.mute) }}>T+{String(Math.floor(T / 60)).padStart(2, '0')}:{String(Math.floor(T % 60)).padStart(2, '0')}</div>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.ink} wipe="depth" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <Grid T={T} o={0.18} />
          <Brackets color={C.accent} q={ease.out(p / 0.5)} />
          <LogoSlot id="sg-logo" size={130} p={p} d={0.05} shape="rounded" style={{ borderRadius: 16 }} />
          <div style={{ marginTop: 26, position: 'relative' }}>
            <Chars t="SIGNAL" p={p} d={0.2} size={210} color={C.cream} font={FH} mode="pop" per={0.06} style={{ textShadow: glow(C.accent, 50) }} />
          </div>
          <div style={{ ...READ(24, C.accent2), marginTop: 20, opacity: ease.out((p - 0.55) / 0.3) }}>TELEMETRY FOR SYSTEMS THAT MATTER</div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.bg} wipe="scan" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Grid T={T} o={0.1} />
          <div style={{ position: 'relative', maxWidth: 1500 }}>
            <Words t="Every outage was visible, somewhere, before it happened." p={p} per={0.05} style={STMT(112, C.cream)} />
          </div>
          <div style={{ ...READ(20, C.accent), marginTop: 40, opacity: ease.out((p - 0.6) / 0.3) }}>THE PROBLEM IS NEVER THE DATA</div>
        </div>)}
      </Scene>

      <Scene name="Live" bg={C.ink} wipe="cells" wipeColor={C.panel}>{(p, lt) => {
        const series = Array.from({ length: 34 }).map((_, i) => 40 + Math.sin(i * 0.5 + lt) * 26 + rnd(i) * 30);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.14} />
          <div style={{ position: 'absolute', left: 150, top: 200, right: 150, display: 'flex', gap: 20 }}>
            {[['REQUESTS', '48.2k/s', C.accent2], ['P99', '212ms', C.accent], ['ERRORS', '0.04%', C.accent2], ['NODES', '1,284', C.cream]].map(([k, v, col], i) => {
              const q = ease.out(stg(p, i, 0.07, 0.24));
              return <Panel key={i} label={k} q={q} style={{ flex: 1, transform: `translateY(${(1 - q) * 40}px)` }}>
                <div style={{ ...NUM(56, col), textShadow: glow(col, 20) }}>{v}</div>
              </Panel>;
            })}
          </div>
          <div style={{ position: 'absolute', left: 150, right: 150, top: 470 }}>
            <Panel label="THROUGHPUT · LAST 60 SECONDS" q={ease.out((p - 0.3) / 0.3)}>
              <Spark data={series} w={1560} h={260} color={C.accent} q={ease.inOut((p - 0.3) / 0.5)} fill />
            </Panel>
          </div>
        </div>;
      }}</Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.bg} wipe="aperture" wipeColor={C.ink}>{(p) => <Chapter p={p} n="01" title="Why signals get lost" deck="Not for want of instrumentation — for want of a place to look." />}</Scene>

      <Scene name="Noise" bg={C.ink} wipe="cells" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.1} />
          {Array.from({ length: 42 }).map((_, i) => {
            const q = ease.out(stg(p, i, 0.012, 0.2));
            return <div key={i} style={{ position: 'absolute', left: 120 + rnd(i) * 1600, top: 200 + rnd(i + 30) * 680, width: 60 + rnd(i + 7) * 200, height: 8, background: i % 7 === 0 ? C.accent : alpha(C.mute, 0.4), borderRadius: 99, transform: `scaleX(${q})`, boxShadow: i % 7 === 0 ? glow(C.accent, 18) : 'none' }} />;
          })}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 150, textAlign: 'center' }}>
            <span style={{ ...STMT(84, C.cream), background: C.ink, padding: '16px 40px' }}>Six of these mattered.</span>
          </div>
        </div>)}
      </Scene>

      <Scene name="MTTR" bg={C.bg} wipe="shear" wipeColor={C.accent}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 100 }}>
          <div>
            <div style={{ ...NUM(360, C.accent), textShadow: glow(C.accent, 60) }}><Counter target={94} p={p} dur={0.5} suffix="m" /></div>
            <div style={{ ...READ(20, C.mute), marginTop: 16 }}>MEDIAN TIME TO RESOLUTION</div>
          </div>
          <div style={{ maxWidth: 700 }}>
            <Words t="Most of it spent deciding which dashboard to open." p={p} d={0.2} style={STMT(64, C.cream)} />
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.panel} wipe="scan" wipeColor={C.bg}>{(p, lt) => (
        <div style={MID}>
          <div style={{ maxWidth: 1480, minHeight: 300 }}>
            <Typed t="We had eleven dashboards and no answer." p={p} lt={lt} dur={0.55} caretColor={C.accent} style={STMT(94, C.cream)} />
          </div>
          <div style={{ ...READ(20, C.accent2), marginTop: 34, opacity: ease.out((p - 0.7) / 0.2) }}>STAFF SRE · PAYMENTS PLATFORM</div>
        </div>)}
      </Scene>

      <Scene name="Sprawl" bg={C.ink} wipe="depth" wipeColor={C.panel}>{(p) => {
        const nodes = [[420, 300], [700, 240], [980, 340], [1280, 260], [1520, 400], [520, 560], [820, 620], [1120, 580], [1400, 680], [660, 820], [1000, 840]];
        const links = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [6, 2], [10, 7]];
        const q = ease.inOut(p / 0.6);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.1} />
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            {links.map(([a, b], i) => {
              const vis = clamp((q - i * 0.05) / 0.3, 0, 1);
              return <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[a][0] + (nodes[b][0] - nodes[a][0]) * vis} y2={nodes[a][1] + (nodes[b][1] - nodes[a][1]) * vis} stroke={alpha(C.accent2, 0.5)} strokeWidth="2" />;
            })}
            {nodes.map(([x, y], i) => {
              const vis = ease.back(stg(p, i, 0.04, 0.22));
              return <circle key={i} cx={x} cy={y} r={10 * vis} fill={i % 4 === 0 ? C.accent : C.cream} />;
            })}
          </svg>
          <div style={{ position: 'absolute', left: 150, bottom: 140, width: 900 }}>
            <div style={STMT(76, C.cream)}>Two hundred services, one incident channel.</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Cost" bg={C.bg} wipe="cells" wipeColor={C.ink}>{(p) => {
        const rows = [['Engineer-hours per incident', '38'], ['Dashboards maintained', '11'], ['Alerts nobody reads', '2,400/wk'], ['Confidence at 3am', 'low']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1500 }}>
          <div style={{ ...READ(20, C.accent), marginBottom: 30 }}>THE COST OF LOOKING</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 24, padding: '18px 0', borderBottom: `1px solid ${C.edge}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
              <span style={BODY(44, C.cream)}>{k}</span><span style={{ flex: 1 }} />
              <span style={{ ...NUM(48, C.accent), textShadow: glow(C.accent, 18) }}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Turn" bg={C.accent} wipe="aperture" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Chars t="One place to look." p={p} size={140} color={C.ink} font={FH} mode="rise" per={0.04} />
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.bg} wipe="shear" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="02" title="How Signal works" deck="Ingest everything, surface the six things that changed." />}</Scene>

      <Scene name="Pipeline" bg={C.ink} wipe="scan" wipeColor={C.panel}>{(p) => {
        const stages = ['INGEST', 'NORMALISE', 'CORRELATE', 'RANK', 'SURFACE'];
        const q = ease.inOut(p / 0.7);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.12} />
          <div style={{ position: 'absolute', left: 150, right: 150, top: 420 }}>
            <div style={{ position: 'relative', height: 6, background: C.edge }}>
              <div style={{ position: 'absolute', inset: 0, width: `${q * 100}%`, background: C.accent, boxShadow: glow(C.accent, 22) }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>
              {stages.map((s, i) => {
                const at = i / (stages.length - 1), vis = ease.back((q * 1.1 - at) / 0.16);
                return <div key={i} style={{ textAlign: 'center', width: 240, transform: `scale(${vis})`, opacity: vis > 0 ? 1 : 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 999, background: C.accent, margin: '0 auto 18px', boxShadow: glow(C.accent, 16) }} />
                  <div style={READ(18, C.cream)}>{s}</div>
                </div>;
              })}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 150, top: 210, ...STMT(80, C.cream) }}>Five steps, forty milliseconds.</div>
        </div>;
      }}</Scene>

      <Scene name="Feature1" bg={C.bg} wipe="cells" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <div style={{ flex: '0 0 720px' }}>
            <div style={READ(20, C.accent)}>CAPABILITY 01</div>
            <div style={{ ...STMT(88, C.cream), marginTop: 18 }}>Correlation, not collection.</div>
            <div style={{ ...BODY(36, C.mute), marginTop: 20, maxWidth: 640 }}>Every metric arrives already joined to the deploy, the flag and the region that moved with it.</div>
            <Readout items={[['LATENCY', '38ms'], ['SOURCES', '212'], ['RETENTION', '13mo']]} color={C.cream} style={{ marginTop: 34 }} />
          </div>
          <BrowserSlot id="sg-ui-1" w={860} h={520} url="signal.app/correlate" p={p} d={0.15} bar={C.panel} ink={C.mute} />
        </div>)}
      </Scene>

      <Scene name="Anomaly" bg={C.ink} wipe="depth" wipeColor={C.accent}>{(p) => {
        const base = Array.from({ length: 40 }).map((_, i) => 50 + Math.sin(i * 0.4) * 14 + rnd(i) * 10);
        const spiked = base.map((v, i) => (i > 30 ? v + (i - 30) * 12 : v));
        const q = ease.inOut(p / 0.6);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.1} />
          <div style={{ position: 'absolute', left: 150, right: 150, top: 260 }}>
            <Panel label="LATENCY · EU-WEST-2" q={ease.out(p / 0.3)}>
              <Spark data={spiked} w={1540} h={300} color={C.accent} q={q} fill />
            </Panel>
            <div style={{ display: 'flex', gap: 20, marginTop: 26, opacity: ease.out((p - 0.55) / 0.3) }}>
              <div style={{ background: C.accent, color: C.ink, ...READ(18, C.ink), padding: '14px 26px', borderRadius: 8, boxShadow: glow(C.accent, 24) }}>ANOMALY · 14:02:11</div>
              <div style={{ ...BODY(32, C.cream), paddingTop: 8 }}>Correlated to deploy #4,912 — rolled back automatically.</div>
            </div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Feature2" bg={C.panel} wipe="scan" wipeColor={C.bg}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80, flexDirection: 'row-reverse' }}>
          <div style={{ flex: '0 0 700px' }}>
            <div style={READ(20, C.accent2)}>CAPABILITY 02</div>
            <div style={{ ...STMT(88, C.cream), marginTop: 18 }}>Alerts that earn the interrupt.</div>
            <div style={{ ...BODY(36, C.mute), marginTop: 20 }}>Ranked by blast radius, not by threshold. Nine alerts last month, all of them real.</div>
          </div>
          <Slot id="sg-ui-2" w={860} h={560} r={12} p={p} d={0.15} enter="left" />
        </div>)}
      </Scene>

      <Scene name="Gauges" bg={C.bg} wipe="cells" wipeColor={C.ink}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 70 }}>
          <Gauge v={0.997} size={360} color={C.accent2} track={C.edge} ink={C.cream} label="AVAILABILITY" q={ease.inOut(p / 0.6)} />
          <Gauge v={0.82} size={360} color={C.accent} track={C.edge} ink={C.cream} label="ALERT PRECISION" q={ease.inOut((p - 0.1) / 0.6)} />
          <Gauge v={0.64} size={360} color={C.cream} track={C.edge} ink={C.cream} label="COST REDUCTION" q={ease.inOut((p - 0.2) / 0.6)} />
        </div>)}
      </Scene>

      <Scene name="Feature3" bg={C.ink} wipe="shear" wipeColor={C.accent}>{(p) => {
        const rows = [['api-gateway', 'ok', C.accent2], ['payments-core', 'degraded', C.accent], ['ledger', 'ok', C.accent2], ['notify', 'ok', C.accent2], ['search', 'ok', C.accent2]];
        return <div style={{ ...PAD, display: 'flex', gap: 80, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={READ(20, C.accent)}>CAPABILITY 03</div>
            <div style={{ ...STMT(84, C.cream), marginTop: 18 }}>The whole estate, one screen.</div>
          </div>
          <Panel label="SERVICE HEALTH" q={ease.out(p / 0.3)} style={{ width: 800 }}>
            {rows.map(([n, s, col], i) => {
              const q = ease.out(stg(p - 0.15, i, 0.07, 0.22));
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 0', borderBottom: `1px solid ${C.edge}`, opacity: q }}>
                <div style={{ width: 12, height: 12, borderRadius: 999, background: col, boxShadow: glow(col, 14) }} />
                <span style={{ ...BODY(34, C.cream), flex: 1 }}>{n}</span>
                <span style={READ(16, col)}>{s}</span>
              </div>;
            })}
          </Panel>
        </div>;
      }}</Scene>

      <Scene name="Integrations" bg={C.bg} wipe="scan" wipeColor={C.panel}>{(p) => {
        const names = ['KUBERNETES', 'POSTGRES', 'KAFKA', 'REDIS', 'LAMBDA', 'CLOUDFRONT', 'TERRAFORM', 'GITHUB', 'PAGERDUTY', 'SNOWFLAKE', 'ENVOY', 'CLICKHOUSE'];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...STMT(76, C.cream), marginBottom: 40 }}>Two hundred and twelve sources, no agents to babysit.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {names.map((n, i) => {
              const q = ease.out(stg(p, i, 0.04, 0.2));
              return <div key={i} style={{ border: `1px solid ${C.edge}`, borderRadius: 10, padding: '20px 24px', ...READ(18, C.cream), opacity: q, transform: `translateY(${(1 - q) * 26}px)`, background: i % 5 === 0 ? C.panel : 'transparent' }}>{n}</div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Eng" bg={C.panel} wipe="aperture" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 70 }}>
          <Slot id="sg-eng" w={480} h={600} r={12} p={p} enter="left" />
          <div style={{ maxWidth: 900 }}>
            <Words t="“It replaced the part of the job I was worst at: deciding where to look first.”" p={p} d={0.15} per={0.04} style={STMT(72, C.cream)} />
            <div style={{ ...READ(20, C.accent2), marginTop: 28, opacity: ease.out((p - 0.72) / 0.2) }}>PRINCIPAL ENGINEER · LOGISTICS</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.bg} wipe="depth" wipeColor={C.accent}>{(p) => <Chapter p={p} n="03" title="What changed" deck="Ninety days across eleven platform teams." />}</Scene>

      <Scene name="Stats" bg={C.ink} wipe="cells" wipeColor={C.panel}>{(p) => {
        const cols = [[94, '%', 'fewer paging alerts', C.accent], [11, 'm', 'median resolution', C.accent2], [3, 'x', 'faster root cause', C.cream]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 30 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <Panel key={i} q={q} style={{ width: 470, transform: `translateY(${(1 - q) * 70}px)`, padding: '46px 36px' }}>
              <div style={{ ...NUM(160, col), textShadow: glow(col, 34), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.4} suffix={sfx} /></div>
              <div style={{ ...BODY(32, C.mute), marginTop: 14 }}>{lbl}</div>
            </Panel>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Before" bg={C.bg} wipe="shear" wipeColor={C.ink}>{(p) => {
        const before = Array.from({ length: 30 }).map((_, i) => 30 + rnd(i) * 70);
        const after = Array.from({ length: 30 }).map((_, i) => 20 + rnd(i + 50) * 16);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
          <Panel label="ALERT VOLUME · BEFORE" q={ease.out(p / 0.3)}>
            <Spark data={before} w={1540} h={180} color={C.accent} q={ease.inOut(p / 0.5)} fill />
          </Panel>
          <Panel label="ALERT VOLUME · AFTER" q={ease.out((p - 0.2) / 0.3)}>
            <Spark data={after} w={1540} h={180} color={C.accent2} q={ease.inOut((p - 0.2) / 0.5)} fill />
          </Panel>
        </div>;
      }}</Scene>

      <Scene name="Reviews" bg={C.ink} wipe="scan" wipeColor={C.accent2}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.1} />
          <Marquee items={['“the first dashboard we did not customise”', '“nine alerts, all real”', '“root cause in the alert itself”']} T={T} speed={110} size={44} style={{ top: 230, ...BODY(44, alpha(C.mute, 0.5)) }} />
          <Marquee items={['“onboarded in a morning”', '“our on-call actually sleeps”', '“the deploy link is the whole feature”']} T={T} speed={86} dir={-1} size={44} style={{ bottom: 240, ...BODY(44, alpha(C.accent2, 0.5)) }} />
          <div style={MID}>
            <div style={{ background: C.ink, padding: '22px 50px' }}>
              <div style={{ ...NUM(180, C.cream), textShadow: glow(C.accent, 40) }}><Counter target={1284} p={p} dur={0.55} /></div>
              <div style={{ ...READ(22, C.accent), textAlign: 'center', marginTop: 10 }}>TEAMS INSTRUMENTED</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.bg} wipe="cells" wipeColor={C.ink}>{(p) => {
        const rows = [['Correlated on ingest', 'Joined by hand, at 3am'], ['Ranked by blast radius', 'Ranked by threshold'], ['One screen', 'Eleven dashboards'], ['Flat per-service price', 'Priced per gigabyte']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 16, opacity: q, transform: `translateY(${(1 - q) * 36}px)` }}>
              <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.accent}`, borderRadius: 10, padding: '22px 30px', ...BODY(36, C.cream) }}>{a}</div>
              <div style={{ flex: 1, border: `1px solid ${C.edge}`, borderRadius: 10, padding: '22px 30px', ...BODY(36, alpha(C.mute, 0.85)) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.bg} wipe="aperture" wipeColor={C.panel}>{(p) => <Chapter p={p} n="04" title="Built for the estate" deck="Regions, tenants, and the parts of the stack nobody documented." />}</Scene>

      <Scene name="Regions" bg={C.ink} wipe="depth" wipeColor={C.accent2}>{(p, lt) => {
        const pts = [[420, 380], [700, 300], [980, 420], [1240, 340], [1480, 460], [820, 620], [1180, 660]];
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.12} />
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            {pts.map(([x, y], i) => {
              const q = ease.back(stg(p, i, 0.07, 0.24));
              return <g key={i}>
                <circle cx={x} cy={y} r={40 + Math.sin(lt * 2 + i) * 10} fill="none" stroke={alpha(C.accent2, 0.35)} strokeWidth="2" opacity={q} />
                <circle cx={x} cy={y} r={11 * q} fill={C.accent2} />
              </g>;
            })}
          </svg>
          <div style={{ position: 'absolute', left: 150, bottom: 150, width: 900 }}>
            <div style={STMT(76, C.cream)}>Seven regions, one clock.</div>
            <Readout items={[['SKEW', '4ms'], ['TENANTS', '312'], ['SLO', '99.97%']]} color={C.cream} style={{ marginTop: 26 }} />
          </div>
        </div>;
      }}</Scene>

      <Scene name="Security" bg={C.panel} wipe="scan" wipeColor={C.bg}>{(p) => {
        const items = ['SOC 2 TYPE II', 'ISO 27001', 'BYOK ENCRYPTION', 'PRIVATE LINK', 'AUDIT STREAMS', 'DATA RESIDENCY'];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...STMT(80, C.cream), marginBottom: 40 }}>Cleared by the people who say no.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
            {items.map((it, i) => {
              const q = ease.out(stg(p, i, 0.07, 0.24));
              return <div key={i} style={{ border: `1px solid ${C.accent2}`, borderRadius: 10, padding: '26px 28px', ...READ(18, C.accent2), opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>{it}</div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Console" bg={C.ink} wipe="cells" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <BrowserSlot id="sg-console" w={1440} h={640} url="signal.app/estate" p={p} bar={C.panel} ink={C.mute} />
          <div style={{ ...READ(20, C.mute), marginTop: 28, opacity: ease.out((p - 0.5) / 0.3) }}>THE ONLY SCREEN ON THE WALL</div>
        </div>)}
      </Scene>

      <Scene name="Plans" bg={C.bg} wipe="shear" wipeColor={C.ink}>{(p) => {
        const plans = [['Team', '$0.09', 'per service, per hour'], ['Platform', '$4,200', 'per month, flat'], ['Estate', 'Custom', 'per region, committed']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 24 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28)); const hero = i === 1;
            return <div key={i} style={{ width: 470, background: hero ? C.panel : 'transparent', border: `1px solid ${hero ? C.accent : C.edge}`, borderRadius: 14, padding: '46px 38px', boxSizing: 'border-box', textAlign: 'left', opacity: q, transform: `translateY(${(1 - q) * 90}px)`, boxShadow: hero ? glow(C.accent, 40) : 'none' }}>
              <div style={READ(18, hero ? C.accent : C.mute)}>{n.toUpperCase()}</div>
              <div style={{ ...NUM(96, C.cream), marginTop: 14 }}>{price}</div>
              <div style={{ ...BODY(30, C.mute), marginTop: 10 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Onboard" bg={C.ink} wipe="scan" wipeColor={C.accent2}>{(p, lt) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 90 }}>
          <Panel label="TERMINAL" q={ease.out(p / 0.3)} style={{ width: 900 }}>
            <div style={{ ...BODY(34, C.accent2), fontFamily: FB }}>
              <Typed t="$ signal connect --estate prod" p={p} lt={lt} dur={0.45} caretColor={C.accent} style={{ ...BODY(34, C.accent2) }} />
            </div>
            <div style={{ ...BODY(30, C.mute), marginTop: 18, opacity: ease.out((p - 0.5) / 0.3) }}>discovered 212 sources · correlating · ready in 4m 12s</div>
          </Panel>
          <div style={{ maxWidth: 700 }}>
            <div style={STMT(80, C.cream)}>One command, one morning.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Founder" bg={C.panel} wipe="aperture" wipeColor={C.accent}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="sg-founder" w={520} h={640} r={12} p={p} enter="left" />
          <div style={{ maxWidth: 840 }}>
            <div style={READ(20, C.accent)}>WHY WE BUILT IT</div>
            <div style={{ ...STMT(72, C.cream), marginTop: 20 }}>We spent four years on call for a system that always knew before we did.</div>
            <div style={{ ...BODY(34, C.mute), marginTop: 20 }}>Signal is the screen we kept sketching on whiteboards at 4am.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 05 ===== */}
      <Scene name="Ch5" bg={C.bg} wipe="depth" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="05" title="Connect an estate" deck="Free to instrument, priced when you page." />}</Scene>

      <Scene name="Free" bg={C.ink} wipe="cells" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <Chars t="FREE TO INSTRUMENT." p={p} size={120} color={C.cream} font={FH} mode="rise" per={0.03} style={{ textShadow: glow(C.accent, 40) }} />
          <div style={{ ...READ(24, C.accent2), marginTop: 30, opacity: ease.out((p - 0.5) / 0.3) }}>NO SEAT LICENCES · NO GIGABYTE BILLING</div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.bg} wipe="scan" wipeColor={C.ink}>{(p) => {
        const bq = ease.out((p - 0.24) / 0.3);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.14} />
          <Brackets color={C.accent} q={ease.out(p / 0.4)} inset={110} />
          <div style={{ ...MID }}>
            <LogoSlot id="sg-logo-cta" size={120} p={p} d={0.05} shape="rounded" style={{ borderRadius: 16 }} />
            <div style={{ ...STMT(110, C.cream), marginTop: 26 }}>See what your estate</div>
            <div style={{ ...STMT(110, C.accent), textShadow: glow(C.accent, 40) }}>already knows.</div>
            <div style={{ display: 'inline-block', marginTop: 40, opacity: bq, transform: `translateY(${(1 - bq) * 30}px) scale(${1 + Math.sin(T * 3) * 0.012})`, background: C.accent, color: C.ink, ...READ(28, C.ink), padding: '24px 60px', borderRadius: 10, boxShadow: glow(C.accent, 40) }}>CONNECT AN ESTATE</div>
            <div style={{ ...READ(20, C.mute), marginTop: 26 }}>SIGNAL.APP</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="depth" wipeColor={C.accent}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ ...MID, opacity: fade }}>
          <Grid T={T} o={0.16} />
          <Chars t="SIGNAL" p={p} size={200} color={C.cream} font={FH} mode="pop" per={0.06} style={{ textShadow: glow(C.accent, 50) }} />
          <div style={{ ...READ(22, C.accent2), marginTop: 22, opacity: ease.out((p - 0.45) / 0.3) }}>TELEMETRY FOR SYSTEMS THAT MATTER</div>
        </div>;
      }}</Scene>

      <Scene name="Ingest" bg={C.ink} wipe="cells" wipeColor={C.accent2}>{(p, lt) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Grid T={T} o={0.12} />
          {Array.from({ length: 9 }).map((_, i) => {
            const t2 = ((lt * 0.5 + i * 0.11) % 1);
            return <div key={i} style={{ position: 'absolute', left: 200 + t2 * 1400, top: 260 + i * 62, width: 44, height: 5, background: i % 3 === 0 ? C.accent : alpha(C.accent2, 0.7), borderRadius: 99, boxShadow: glow(i % 3 === 0 ? C.accent : C.accent2, 12), opacity: 1 - Math.abs(t2 - 0.5) }} />;
          })}
          <div style={{ position: 'absolute', left: 150, bottom: 150, width: 1000 }}>
            <div style={READ(20, C.accent)}>INGEST</div>
            <div style={{ ...STMT(84, C.cream), marginTop: 18 }}>Four million events a second, unsampled.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Trace" bg={C.bg} wipe="scan" wipeColor={C.panel}>{(p) => {
        const spans = [['gateway', 0, 0.95, C.cream], ['auth', 0.06, 0.14, C.accent2], ['payments-core', 0.2, 0.62, C.accent], ['ledger', 0.3, 0.24, C.accent2], ['notify', 0.68, 0.2, C.accent2]];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...READ(20, C.accent), marginBottom: 30 }}>TRACE · 212ms</div>
          {spans.map(([n, off, w2, col], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.28));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20, opacity: q }}>
              <span style={{ ...BODY(30, C.mute), width: 300 }}>{n}</span>
              <div style={{ flex: 1, height: 34, position: 'relative' }}>
                <div style={{ position: 'absolute', left: `${off * 100}%`, width: `${w2 * 100 * q}%`, height: 34, background: col, borderRadius: 6, boxShadow: col === C.accent ? glow(C.accent, 20) : 'none' }} />
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Rollback" bg={C.ink} wipe="depth" wipeColor={C.accent}>{(p, lt, raw) => {
        const done = raw > 0.5;
        const q = ease.back((raw - 0.5) / 0.2);
        return <div style={MID}>
          <Grid T={T} o={0.1} />
          <Panel label="DEPLOY #4,912" q={ease.out(p / 0.3)} style={{ width: 1100, position: 'relative' }}>
            <div style={{ ...NUM(72, done ? C.accent2 : C.accent), textShadow: glow(done ? C.accent2 : C.accent, 24) }}>{done ? 'ROLLED BACK' : 'ROLLING BACK…'}</div>
            <div style={{ height: 10, background: C.edge, borderRadius: 99, marginTop: 24, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${ease.inOut(clamp(raw / 0.5, 0, 1)) * 100}%`, background: done ? C.accent2 : C.accent }} />
            </div>
          </Panel>
          <div style={{ ...STMT(64, C.cream), marginTop: 44, opacity: done ? q : 0 }}>Nineteen seconds, unattended.</div>
        </div>;
      }}</Scene>

      <Scene name="Budget" bg={C.panel} wipe="aperture" wipeColor={C.bg}>{(p) => {
        const q = ease.inOut(p / 0.6);
        return <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 100 }}>
          <div style={{ flex: 1 }}>
            <div style={READ(20, C.accent2)}>ERROR BUDGET · THIS QUARTER</div>
            <div style={{ ...STMT(80, C.cream), marginTop: 18 }}>Spent eleven per cent of the allowance.</div>
          </div>
          <div style={{ width: 620 }}>
            {[['BURNED', 0.11, C.accent], ['REMAINING', 0.89, C.accent2]].map(([k, v, col], i) => (
              <div key={i} style={{ marginBottom: 30 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', ...READ(16, C.mute) }}><span>{k}</span><span>{Math.round(v * 100 * q)}%</span></div>
                <div style={{ height: 20, background: C.edge, borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${v * 100 * q}%`, background: col }} />
                </div>
              </div>))}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Oncall" bg={C.bg} wipe="shear" wipeColor={C.ink}>{(p) => {
        const nights = [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...STMT(80, C.cream), marginBottom: 40 }}>Four interruptions in twenty-eight nights.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 12 }}>
            {nights.map((n, i) => {
              const q = ease.back(stg(p, i, 0.02, 0.2));
              return <div key={i} style={{ height: 90, borderRadius: 8, background: n ? C.accent : C.panel, border: `1px solid ${n ? C.accent : C.edge}`, transform: `scale(${q})`, boxShadow: n ? glow(C.accent, 16) : 'none' }} />;
            })}
          </div>
          <div style={{ ...READ(18, C.mute), marginTop: 24 }}>ONE CELL PER NIGHT · LIT MEANS PAGED</div>
        </div>;
      }}</Scene>

      <Scene name="Query" bg={C.ink} wipe="scan" wipeColor={C.accent}>{(p, lt) => (
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
          <Panel label="ASK IN PLAIN LANGUAGE" q={ease.out(p / 0.3)}>
            <div style={BODY(40, C.cream)}>
              <Typed t="why did checkout slow down after 2pm?" p={p} lt={lt} dur={0.5} caretColor={C.accent} style={BODY(40, C.cream)} />
            </div>
          </Panel>
          <Panel label="ANSWER · 1.2s" q={ease.out((p - 0.45) / 0.3)}>
            <div style={BODY(36, C.accent2)}>Connection pool saturation in payments-core, following deploy #4,912. Two regions affected.</div>
          </Panel>
        </div>)}
      </Scene>

      <Scene name="Scale" bg={C.bg} wipe="cells" wipeColor={C.accent2}>{(p) => {
        const cols = [[4.2, 'M', 'events per second'], [212, '', 'source types'], [13, 'mo', 'hot retention']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 80 }}>
          <Grid T={T} o={0.1} />
          {cols.map(([n, sfx, lbl], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ position: 'relative', width: 440, opacity: q, transform: `translateY(${(1 - q) * 60}px)` }}>
              <div style={{ ...NUM(150, C.cream), textShadow: glow(C.accent, 30), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.42} decimals={i === 0 ? 1 : 0} suffix={sfx} /></div>
              <div style={{ height: 2, background: C.accent, margin: '18px 0' }} />
              <div style={{ ...READ(18, C.mute) }}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Teams" bg={C.panel} wipe="depth" wipeColor={C.bg}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.out(stg(p, i, 0.08, 0.26));
              return <div key={i} style={{ width: 260, height: 300, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.edge}`, transform: `translateY(${(1 - q) * 120}px)`, opacity: q }}>
                <Fill id={`sg-team-${i}`} shape="rounded" radius={12} placeholder="DROP TEAM PHOTO" idle={C.ink} />
              </div>;
            })}
          </div>
          <div style={{ ...STMT(72, C.cream), marginTop: 44 }}>Written by people who carried the pager.</div>
        </div>)}
      </Scene>

      <Scene name="Migration" bg={C.ink} wipe="aperture" wipeColor={C.accent}>{(p) => {
        const steps = [['DAY 0', 'connect read-only'], ['DAY 2', 'shadow your alerts'], ['DAY 9', 'cut over on-call'], ['DAY 14', 'retire the dashboards']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
          <div style={{ ...READ(20, C.accent), marginBottom: 16 }}>MIGRATION, WITHOUT A FREEZE</div>
          {steps.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 40, padding: '16px 0', borderBottom: `1px solid ${C.edge}`, opacity: q, transform: `translateX(${(1 - q) * -60}px)` }}>
              <span style={{ ...NUM(52, C.accent), width: 200 }}>{k}</span>
              <span style={BODY(42, C.cream)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Proof" bg={C.accent} wipe="cells" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Chars t="NINE ALERTS." p={p} size={150} color={C.ink} font={FH} mode="rise" per={0.04} />
          <Chars t="ALL OF THEM REAL." p={p} d={0.3} size={110} color={C.cream} font={FH} mode="rise" per={0.03} />
        </div>)}
      </Scene>

      <Garnish />
    </div>
  );
}

window.SignalFilm = function SignalFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
