/* KEYFRAME long-form template 10 — WORKSPACE
   Motion world: a real desktop. Window chrome that opens, stacks and tiles,
   a cursor that drives every demo, panes that split and swap, command palettes,
   tabs, toasts and keyboard shortcuts. Clean, light, product-demo led. */
const K = window.FilmKit;
const { ease, stg, rnd, Words, Chars, Typed, Counter, Marquee, Slot, BrowserSlot, LaptopSlot, LogoSlot, Fill, Cursor, Keycaps, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-text', '#1e2024'),
  bg: DS('--color-bg', '#eeeae2'),
  desk: DS('--color-neutral-200', '#dcd6ca'),
  cream: DS('--color-neutral-100', '#ffffff'),
  panel: DS('--color-surface', '#f6f4ef'),
  line: DS('--color-neutral-300', '#cfc8ba'),
  mute: DS('--color-neutral-600', '#78736a'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');

/* ---- transition language: window and pane behaviour ---- */
const TR = {
  pane: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
      {[0, 1, 2].map(i => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.025) / 0.12, 0, 1)), o);
        return <div key={i} style={{ flex: 1, background: col, transform: `translateX(${(1 - v) * (i % 2 ? 310 : -310)}%)` }} />;
      })}
    </div>;
  },
  sheet: (p, col) => {
    const q = ease.out(clamp(p / 0.13, 0, 1)), o = p > 0.9 ? ease.in((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: col, borderRadius: v > 0.05 ? 20 : 0, transform: `translateY(${(1 - v) * -102}%)`, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} />
    </div>;
  },
  tile: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: 8, padding: 8, boxSizing: 'border-box' }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.02) / 0.12, 0, 1)), o);
        return <div key={i} style={{ background: col, opacity: Math.min(1, v * 2.4), borderRadius: 12, transform: `scale(${v})` }} />;
      })}
    </div>;
  },
  minimise: (p, col) => {
    const q = ease.out(clamp(p / 0.14, 0, 1)), o = p > 0.9 ? ease.in((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: '50%', bottom: 0, width: `${v * 100}%`, height: `${v * 100}%`, marginLeft: `${-v * 50}%`, background: col, borderRadius: v > 0.05 ? 16 : 0 }} />
    </div>;
  },
  fade: (p, col) => {
    const q = ease.inOut(clamp(p / 0.16, 0, 1)), o = p > 0.9 ? ease.inOut((p - 0.9) / 0.1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, opacity: Math.max(1 - q, o) }} />;
  },
};
/* ---- cameras: restrained, like a screen recording ---- */
const CAM = {
  lift: (p) => ({ transform: `translateY(${(1 - ease.out(p / 0.22)) * 90}px)` }),
  zoomUI: (p) => ({ transform: `scale(${0.97 + ease.out(p / 0.3) * 0.03})` }),
  nudgeL: (p) => ({ transform: `translateX(${18 - p * 40}px)` }),
  nudgeR: (p) => ({ transform: `translateX(${-18 + p * 40}px)` }),
  still: () => ({}),
  settle: (p) => ({ transform: `translateY(${(1 - ease.out(p / 0.3)) * 34}px) scale(${1.006 - ease.out(p / 0.4) * 0.006})` }),
};
/* ---- world: the continuously running background ----
   Tinted app windows sliding in, a cursor touring the desktop and clicking, a
   blinking field, a bouncing dock, a filling progress bar, drifting rules. */
const AMB = 1.2;
const APPC = [C.accent, C.accent2, '#3c6f9e', '#9e6f3c', '#6f3c9e'];
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Tabs: 'PROBLEM',
  Ch1: 'PROBLEM',
  Switch: 'DATA',
  Stack: 'PROBLEM',
  Quote1: 'PROBLEM',
  Cost: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Command: 'FEATURE',
  Search: 'FEATURE',
  Split: 'FEATURE',
  Feature1: 'FEATURE',
  Rowsview: 'FEATURE',
  Inbox: 'FEATURE',
  Feature2: 'FEATURE',
  Shortcuts: 'FEATURE',
  Toasts: 'MOMENT',
  Perm: 'FEATURE',
  Api: 'FEATURE',
  Offline: 'DATA',
  Mobile: 'FEATURE',
  Eng: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  Before: 'DATA',
  Adoption: 'DATA',
  Retire: 'MOMENT',
  Audit: 'DATA',
  Reviews: 'SOLUTION',
  Compare: 'DATA',
  Ch4: 'CTA',
  Import: 'FEATURE',
  Team: 'FEATURE',
  Plans: 'DATA',
  Founder: 'INTRO',
  Free: 'MOMENT',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own desktop as one decor layer. Scene energy drives the
   cursor's tour, so it moves between stops faster on an energetic beat. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const ln = (a) => K.alpha(C.mute, a);
  const STOPS = [[430, 300], [1300, 380], [1140, 760], [380, 720], [900, 260]];
  const leg = (t * 0.13 * s.energy) % STOPS.length, i0 = Math.floor(leg), f = leg - i0;
  const trav = f < 0.62 ? K.ease.inOut(f / 0.62) : 1;
  const a = STOPS[i0], b = STOPS[(i0 + 1) % STOPS.length];
  const cx = a[0] + (b[0] - a[0]) * trav, cy = a[1] + (b[1] - a[1]) * trav;
  const click = f > 0.66 && f < 0.86 ? (f - 0.66) / 0.2 : 0;
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {APPC.map((c, k) => (
        <rect key={'bd' + k} x={((k * 384 - t * 22) % (W2 + 384)) - 192} y={0} width={192} height={H2} fill={K.alpha(c, 0.03)} />))}
      {[0, 1, 2].map(k => {
        const ph = (t * 0.09 + k * 0.34) % 1;
        const slide = K.ease.out(Math.min(ph / 0.3, 1));
        const ox = 160 + k * 520 + (1 - slide) * 120;
        return <g key={k} opacity={0.36 * (1 - Math.max(0, (ph - 0.7) / 0.3))}>
          <rect x={ox} y={220 + k * 150} width={470} height={310} rx={12} fill={K.alpha(C.cream, 0.5)} stroke={ln(0.4)} strokeWidth={2} />
          <rect x={ox} y={220 + k * 150} width={470} height={38} rx={12} fill={K.alpha(APPC[k], 0.3)} />
          {[0, 1, 2].map(j => <circle key={j} cx={ox + 22 + j * 20} cy={239 + k * 150} r={5} fill={K.alpha(['#e05c4b', '#e3ab3c', '#5aa85a'][j], 0.6)} />)}
          {[0, 1, 2, 3].map(j => <rect key={'r' + j} x={ox + 24} y={286 + k * 150 + j * 26} width={300 - j * 54} height={8} rx={4} fill={ln(0.3)} />)}
          <rect x={ox + 350} y={286 + k * 150} width={96} height={96} rx={8} fill={K.alpha(APPC[(k + 2) % 5], 0.3)} />
        </g>;
      })}
      {Array.from({ length: 5 }).map((_, k) => {
        const bounce = Math.max(0, Math.sin(t * 1.6 - k * 0.5)) * 16;
        return <rect key={'dk' + k} x={W2 / 2 - 130 + k * 56} y={H2 - 74 - bounce} width={42} height={42} rx={9} fill={K.alpha(APPC[k], 0.35)} />;
      })}
      <g transform={`translate(${W2 - 480},170)`} opacity={0.34}>
        <rect width={340} height={54} rx={6} fill={K.alpha(C.cream, 0.6)} stroke={ln(0.4)} strokeWidth={2} />
        <rect x={18} y={16} width={130} height={9} rx={4} fill={ln(0.34)} />
        <rect x={156} y={12} width={3} height={30} fill={Math.floor(t * 1.6) % 2 ? K.alpha(C.accent, 0.85) : 'transparent'} />
      </g>
      <g transform={`translate(150,${H2 - 250})`} opacity={0.34}>
        <rect width={420} height={16} rx={8} fill={ln(0.2)} />
        <rect width={420 * ((t * 0.14) % 1)} height={16} rx={8} fill={K.alpha(C.accent2, 0.75)} />
      </g>
      {click > 0 ? <circle cx={cx} cy={cy} r={20 + click * 74} fill="none" stroke={K.alpha(C.accent, 0.55 * (1 - click))} strokeWidth={4} /> : null}
      <g transform={`translate(${cx},${cy})`} opacity={0.6}>
        <path d="M 0 0 L 0 34 L 9 26 L 15 40 L 22 37 L 16 23 L 30 22 Z" fill={K.alpha(C.ink, 0.8)} stroke={K.alpha(C.cream, 0.95)} strokeWidth={2.4} strokeLinejoin="round" />
      </g>
      {Array.from({ length: 4 }).map((_, k) => {
        const ph = (t * 0.11 + k * 0.25) % 1;
        return <line key={'sc' + k} x1={0} y1={ph * H2} x2={W2} y2={ph * H2} stroke={ln(0.06)} strokeWidth={1.4} />;
      })}
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent, C.accent2, K.lighten(C.accent, 0.3), C.desk],
  ink: C.ink, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['WORKSPACE · A SOFTWARE FILM', 'ONE WINDOW INSTEAD OF NINE', 'PANES, NOT TABS', 'FOUR SHORTCUTS IS THE MANUAL', 'CLOSE THE OTHER WINDOWS'];
const FOOTS = ['recorded in one window, throughout', 'the tab count was real, and worse', 'four tools retired in a fortnight', 'nothing here needed a manual', 'six hours a week, per person'];
const SIDES = ['FIND · OPEN · CLOSE', 'ELEVEN MINUTES BETWEEN SWITCHES', 'ONE ADDRESS PER OBJECT'];

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

const HEAD = (s, c) => ({ fontFamily: FB, fontWeight: 700, fontSize: s, letterSpacing: '-0.03em', lineHeight: 1.0, color: c, margin: 0 });
const SET = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.05, color: c, margin: 0, fontWeight: 400 });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.5, color: c, margin: 0, fontWeight: 400 });
const UI = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 600, color: c, margin: 0 });
const CAPS = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 700, letterSpacing: '0.16em', color: c, margin: 0, textTransform: 'uppercase' });
const NUM = (s, c) => ({ fontFamily: FB, fontWeight: 700, fontSize: s, letterSpacing: '-0.03em', lineHeight: 0.94, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 150px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '140px 150px', boxSizing: 'border-box' };

/* ---- desktop furniture ---- */
function Win({ children, title, w, h, p = 1, d = 0, tilt = 0, enter = 'lift', active = true, style }) {
  const q = ease.out((p - d) / 0.3);
  const tr = enter === 'lift' ? `translateY(${(1 - q) * 120}px)` : enter === 'left' ? `translateX(${(1 - q) * -240}px)` : enter === 'right' ? `translateX(${(1 - q) * 240}px)` : `scale(${0.94 + q * 0.06})`;
  return <div style={{ width: w, borderRadius: 14, overflow: 'hidden', background: C.panel, border: `1px solid ${C.line}`, boxShadow: active ? '0 24px 60px rgba(30,32,36,0.22)' : '0 10px 26px rgba(30,32,36,0.12)', transform: `${tr} rotate(${tilt}deg)`, opacity: q, ...style }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: C.desk, borderBottom: `1px solid ${C.line}` }}>
      {['#e05c4b', '#e3ab3c', '#5aa85a'].map((c, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 999, background: active ? c : C.line }} />)}
      <span style={{ ...UI(19, C.mute), marginLeft: 10 }}>{title}</span>
    </div>
    <div style={{ height: h, background: C.cream, position: 'relative' }}>{children}</div>
  </div>;
}
function Tabs({ items, active = 0, p, color, ink }) {
  return <div style={{ display: 'flex', gap: 6, padding: '10px 12px 0', background: C.desk }}>
    {items.map((t, i) => {
      const q = ease.out(stg(p, i, 0.06, 0.22));
      const on = i === active;
      return <div key={i} style={{ ...UI(19, on ? ink : C.mute), background: on ? C.cream : alpha(C.cream, 0.45), borderRadius: '10px 10px 0 0', padding: '11px 22px', borderTop: `2px solid ${on ? color : 'transparent'}`, opacity: q }}>{t}</div>;
    })}
  </div>;
}
function Palette({ query, results, p, lt, color, ink }) {
  return <div style={{ width: 1000, background: C.cream, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: '0 30px 70px rgba(30,32,36,0.3)', overflow: 'hidden' }}>
    <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ ...UI(28, color) }}>⌘</span>
      <span style={{ ...UI(30, ink) }}><Typed t={query} p={p} lt={lt} dur={0.4} caretColor={color} style={UI(30, ink)} /></span>
    </div>
    {results.map((r, i) => {
      const q = ease.out(stg(p - 0.42, i, 0.07, 0.22));
      return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 28px', background: i === 0 ? alpha(color, 0.1) : 'transparent', opacity: q }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: i === 0 ? color : C.line }} />
        <span style={UI(26, i === 0 ? ink : C.mute)}>{r}</span>
      </div>;
    })}
  </div>;
}
function Toast({ text, p, d = 0, color, style }) {
  const q = ease.back((p - d) / 0.22);
  return <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.ink, borderRadius: 12, padding: '18px 26px', transform: `translateY(${(1 - q) * 40}px)`, opacity: q > 0 ? 1 : 0, boxShadow: '0 14px 36px rgba(0,0,0,0.28)', ...style }}>
    <div style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
    <span style={UI(24, C.cream)}>{text}</span>
  </div>;
}
function Rows({ items, p, ink, color }) {
  return <div>
    {items.map(([a, b], i) => {
      const q = ease.out(stg(p, i, 0.06, 0.22));
      return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 26px', borderBottom: `1px solid ${C.line}`, opacity: q, transform: `translateY(${(1 - q) * 16}px)` }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: i % 3 === 0 ? color : C.line }} />
        <span style={{ ...UI(24, ink), flex: 1 }}>{a}</span>
        <span style={{ ...UI(22, C.mute) }}>{b}</span>
      </div>;
    })}
  </div>;
}
function Chapter({ p, n, title, deck }) {
  const q = ease.out(p / 0.4);
  return <div style={{ position: 'absolute', inset: 0, background: C.bg }}>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: 10, padding: 10, boxSizing: 'border-box' }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const v = ease.out(stg(p, i, 0.03, 0.26));
        return <div key={i} style={{ background: i === 1 ? C.accent : C.desk, borderRadius: 14, transform: `scale(${0.9 + v * 0.1})`, opacity: v }} />;
      })}
    </div>
    <div style={{ position: 'absolute', left: 150, top: 380, opacity: ease.out((p - 0.25) / 0.3) }}>
      <div style={CAPS(18, C.accent)}>{n}</div>
      <div style={{ ...SET(92, C.ink), marginTop: 18 }}>{title}</div>
      {deck ? <div style={{ ...BODY(34, C.mute), marginTop: 20, maxWidth: 840 }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  return <div style={{ position: 'absolute', top: 40, left: 48, display: 'flex', alignItems: 'center', gap: 11, background: C.ink, borderRadius: 8, padding: '8px 18px 8px 8px', pointerEvents: 'none' }}>
    <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden' }}><Fill id="ws-mark" shape="rounded" radius={6} placeholder="LOGO" /></div>
    <span style={CAPS(18, C.cream)}>{(window.OM_TWEAKS || {}).brandName || 'WORKSPACE'}</span>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.bg} wipe="tile" wipeColor={C.desk}>{(p) => (
        <div style={MID}>
          <LogoSlot id="ws-logo" size={124} p={p} d={0.05} shape="rounded" style={{ borderRadius: 22 }} />
          <div style={{ marginTop: 28 }}>
            <Chars t="Workspace" p={p} d={0.2} size={190} color={C.ink} font={FH} mode="rise" per={0.045} />
          </div>
          <div style={{ ...CAPS(20, C.accent), marginTop: 22, opacity: ease.out((p - 0.55) / 0.3) }}>ONE WINDOW INSTEAD OF NINE</div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.desk} wipe="pane" wipeColor={C.bg}>{(p) => (
        <div style={MID}>
          <div style={{ maxWidth: 1500 }}>
            <Words t="You do not have a focus problem. You have twenty-two tabs." p={p} per={0.05} style={SET(102, C.ink)} />
          </div>
        </div>)}
      </Scene>

      <Scene name="Tabs" bg={C.bg} wipe="sheet" wipeColor={C.desk}>{(p) => (
        <div style={MID}>
          <div style={{ width: 1560, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(30,32,36,0.2)' }}>
            <Tabs items={['Inbox', 'Docs', 'Tracker', 'Deck', 'Sheet', 'Chat', '+18 more']} active={0} p={p} color={C.accent} ink={C.ink} />
            <div style={{ height: 520, background: C.cream, display: 'grid', placeItems: 'center' }}>
              <div style={{ ...BODY(38, C.mute), opacity: ease.out((p - 0.5) / 0.3) }}>…and the one you need is in the fourth window.</div>
            </div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.bg} wipe="fade" wipeColor={C.desk}>{(p) => <Chapter p={p} n="CHAPTER 01" title="Where the day goes" deck="Nine tools, four inboxes, and a context switch every eleven minutes." />}</Scene>

      <Scene name="Switch" bg={C.desk} wipe="tile" wipeColor={C.bg}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 90 }}>
          <div>
            <div style={NUM(320, C.accent)}><Counter target={11} p={p} dur={0.45} suffix="m" /></div>
            <div style={{ ...CAPS(18, C.mute), marginTop: 20 }}>BETWEEN CONTEXT SWITCHES</div>
          </div>
          <div style={{ maxWidth: 660, textAlign: 'left' }}>
            <div style={BODY(40, C.ink)}>It takes twenty-three minutes to get back to where you were. The arithmetic does not work.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Stack" bg={C.bg} wipe="pane" wipeColor={C.desk}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {[0, 1, 2, 3].map(i => {
            const q = ease.out(stg(p, i, 0.08, 0.28));
            return <Win key={i} title={['Tracker — 41 open', 'Docs — draft v7', 'Chat — 3 unread', 'Sheet — Q3 model'][i]} w={900} h={420} p={p} d={i * 0.08} tilt={i % 2 ? 1.2 : -1.2} active={i === 3}
              style={{ position: 'absolute', left: 200 + i * 130, top: 190 + i * 90, zIndex: i }}>
              <Fill id={`ws-stack-${i}`} shape="rect" placeholder="DROP SCREENSHOT" idle={C.panel} />
            </Win>;
          })}
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.panel} wipe="fade" wipeColor={C.bg}>{(p, lt) => (
        <div style={MID}>
          <div style={{ maxWidth: 1480, minHeight: 300 }}>
            <Typed t="I spend the morning finding the thing I wrote yesterday." p={p} lt={lt} dur={0.58} caretColor={C.accent} style={SET(92, C.ink)} />
          </div>
          <div style={{ ...CAPS(18, C.mute), marginTop: 34, opacity: ease.out((p - 0.72) / 0.2) }}>PRODUCT MANAGER · 60-PERSON SAAS</div>
        </div>)}
      </Scene>

      <Scene name="Cost" bg={C.bg} wipe="minimise" wipeColor={C.accent}>{(p) => {
        const rows = [['Tools paid for', '14'], ['Tools opened daily', '9'], ['Licences unused', '£1,840/mo'], ['Hours lost to switching', '6.2/wk']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1480 }}>
          <div style={{ ...CAPS(18, C.accent), marginBottom: 28 }}>THE STACK, AUDITED</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '18px 0', borderBottom: `1px solid ${C.line}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <span style={BODY(44, C.ink)}>{k}</span><span style={{ flex: 1 }} />
              <span style={NUM(46, i > 1 ? C.accent : C.ink)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Turn" bg={C.accent} wipe="sheet" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="One window." p={p} size={150} color={C.cream} font={FH} mode="rise" per={0.04} />
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.bg} wipe="tile" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="CHAPTER 02" title="How Workspace works" deck="Everything addressable from one command bar, and nothing to arrange." />}</Scene>

      <Scene name="Command" bg={C.desk} wipe="sheet" wipeColor={C.bg}>{(p, lt, raw) => {
        const cx = 1180 - ease.out(clamp(raw / 0.24, 0, 1)) * 220;
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={MID}>
            <Palette query="q3 pricing" results={['Q3 pricing model — Sheet, edited 2h ago', 'Pricing review — Doc, yesterday', 'Pricing — Tracker epic, 8 open']} p={p} lt={lt} color={C.accent} ink={C.ink} />
            <div style={{ marginTop: 40, opacity: ease.out((p - 0.2) / 0.3) }}>
              <Keycaps keys={['⌘', 'K']} p={p} d={0.1} up={{ bg: C.cream, fg: C.ink, font: FB }} down={{ bg: C.accent, fg: C.cream, font: FB }} shadow={C.line} size={30} />
            </div>
          </div>
          <Cursor x={cx} y={430} click={clamp((raw - 0.26) / 0.18, 0, 1) < 1 ? clamp((raw - 0.26) / 0.18, 0, 1) : 0} color={C.accent} ink={C.ink} />
        </div>;
      }}</Scene>

      <Scene name="Split" bg={C.bg} wipe="pane" wipeColor={C.desk}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <Win title="Q3 pricing model" w={740} h={520} p={p} d={0.04} enter="left">
            <Fill id="ws-split-1" shape="rect" placeholder="DROP SCREENSHOT" idle={C.panel} />
          </Win>
          <Win title="Pricing review" w={740} h={520} p={p} d={0.14} enter="right">
            <Fill id="ws-split-2" shape="rect" placeholder="DROP SCREENSHOT" idle={C.panel} />
          </Win>
        </div>)}
      </Scene>

      <Scene name="Feature1" bg={C.panel} wipe="tile" wipeColor={C.bg}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <div style={{ flex: '0 0 660px' }}>
            <div style={CAPS(18, C.accent)}>FEATURE 01</div>
            <div style={{ ...HEAD(88, C.ink), marginTop: 18 }}>Every object, one address.</div>
            <div style={{ ...BODY(36, C.mute), marginTop: 20, maxWidth: 600 }}>Docs, tickets, sheets, threads and files share one identifier — so a link is always the real thing, not a screenshot of it.</div>
          </div>
          <BrowserSlot id="ws-ui-1" w={860} h={500} url="workspace.app/q3-pricing" p={p} d={0.15} bar={C.desk} ink={C.mute} screen="#23262b" />
        </div>)}
      </Scene>

      <Scene name="Rowsview" bg={C.bg} wipe="sheet" wipeColor={C.desk}>{(p) => (
        <div style={MID}>
          <div style={{ width: 1420, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`, background: C.cream, boxShadow: '0 24px 60px rgba(30,32,36,0.2)' }}>
            <div style={{ padding: '20px 26px', background: C.desk, borderBottom: `1px solid ${C.line}`, ...CAPS(16, C.mute) }}>ASSIGNED TO YOU · 6</div>
            <Rows items={[['Rewrite the pricing page', 'today'], ['Review Q3 model', 'today'], ['Approve brand kit', 'tomorrow'], ['Close the migration ticket', 'Friday'], ['Draft the changelog', 'next week'], ['Archive Q1 board', 'someday']]} p={p} ink={C.ink} color={C.accent2} />
          </div>
        </div>)}
      </Scene>

      <Scene name="Feature2" bg={C.desk} wipe="minimise" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80, flexDirection: 'row-reverse' }}>
          <div style={{ flex: '0 0 640px' }}>
            <div style={CAPS(18, C.accent2)}>FEATURE 02</div>
            <div style={{ ...HEAD(86, C.ink), marginTop: 18 }}>Panes, not tabs.</div>
            <div style={{ ...BODY(36, C.mute), marginTop: 20 }}>Open a second thing beside the first. Close it with the same key. Nothing gets buried because nothing is stacked.</div>
          </div>
          <Slot id="ws-ui-2" w={880} h={520} r={14} p={p} d={0.15} enter="left" />
        </div>)}
      </Scene>

      <Scene name="Shortcuts" bg={C.bg} wipe="pane" wipeColor={C.desk}>{(p) => {
        const keys = [['⌘K', 'find anything'], ['⌘\\', 'split the pane'], ['⌘/', 'jump back'], ['⌘⏎', 'send and close']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...HEAD(80, C.ink), marginBottom: 44 }}>Four shortcuts is the whole manual.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 18 }}>
            {keys.map(([k, v], i) => {
              const q = ease.out(stg(p, i, 0.08, 0.26));
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '26px 30px', opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
                <span style={{ ...NUM(44, C.accent), background: C.cream, border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 18px' }}>{k}</span>
                <span style={BODY(34, C.ink)}>{v}</span>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Toasts" bg={C.desk} wipe="fade" wipeColor={C.bg}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ ...MID }}>
            <LaptopSlot id="ws-laptop" w={1180} p={p} d={0.05} shell={C.line} p2={C.mute} />
          </div>
          <div style={{ position: 'absolute', right: 150, bottom: 150, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-end' }}>
            <Toast text="Deploy passed — 2m 14s" p={p} d={0.35} color={C.accent2} />
            <Toast text="Ana approved the brand kit" p={p} d={0.5} color={C.accent} />
            <Toast text="Q3 model shared with 4 people" p={p} d={0.65} color={C.accent2} />
          </div>
        </div>)}
      </Scene>

      <Scene name="Eng" bg={C.panel} wipe="tile" wipeColor={C.accent}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="ws-eng" w={500} h={620} r={14} p={p} enter="left" />
          <div style={{ maxWidth: 880 }}>
            <Words t="“We deleted four tools in a fortnight and nobody asked for them back.”" p={p} d={0.15} per={0.04} style={SET(74, C.ink)} />
            <div style={{ ...CAPS(18, C.mute), marginTop: 28, opacity: ease.out((p - 0.72) / 0.2) }}>HEAD OF OPERATIONS · SERIES B FINTECH</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.bg} wipe="sheet" wipeColor={C.accent}>{(p) => <Chapter p={p} n="CHAPTER 03" title="What teams got back" deck="Ninety days, across two hundred and forty workspaces." />}</Scene>

      <Scene name="Stats" bg={C.desk} wipe="tile" wipeColor={C.bg}>{(p) => {
        const cols = [[6.2, 'h', 'a week, per person', C.accent], [4, '', 'tools retired', C.accent2], [1, '', 'window open', C.ink]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 28 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ width: 470, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: '46px 36px', boxSizing: 'border-box', opacity: q, transform: `translateY(${(1 - q) * 70}px)` }}>
              <div style={{ ...NUM(150, col), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.42} decimals={i === 0 ? 1 : 0} suffix={sfx} /></div>
              <div style={{ ...BODY(30, C.mute), marginTop: 14 }}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Before" bg={C.bg} wipe="pane" wipeColor={C.desk}>{(p) => {
        const before = [9, 8, 9, 7, 9];
        const after = [1, 1, 2, 1, 1];
        const q = ease.inOut(p / 0.65);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 50 }}>
          {[['TOOLS OPEN BEFORE', before, C.line], ['TOOLS OPEN AFTER', after, C.accent2]].map(([lbl, arr, col], r) => (
            <div key={r}>
              <div style={{ ...CAPS(16, C.mute), marginBottom: 14 }}>{lbl}</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 180 }}>
                {arr.map((v, i) => <div key={i} style={{ flex: 1, height: (v / 9) * 170 * q, background: col, borderRadius: 8 }} />)}
              </div>
            </div>))}
        </div>;
      }}</Scene>

      <Scene name="Reviews" bg={C.accent} wipe="minimise" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Marquee items={['“one window, genuinely”', '“⌘K replaced our wiki search”', '“panes over tabs, always”']} T={T} speed={110} size={46} style={{ top: 230, ...SET(46, alpha(C.cream, 0.5)) }} />
          <Marquee items={['“onboarded the team in an hour”', '“we cancelled four licences”', '“no more screenshot links”']} T={T} speed={86} dir={-1} size={46} style={{ bottom: 240, ...SET(46, alpha(C.ink, 0.3)) }} />
          <div style={MID}>
            <div style={{ background: C.accent, padding: '22px 48px' }}>
              <div style={NUM(180, C.cream)}><Counter target={240} p={p} dur={0.55} /></div>
              <div style={{ ...CAPS(22, C.ink), textAlign: 'center', marginTop: 12 }}>WORKSPACES MIGRATED</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.bg} wipe="tile" wipeColor={C.desk}>{(p) => {
        const rows = [['One address per object', 'A link per tool'], ['Panes, closed with a key', 'Tabs, closed never'], ['One search bar', 'Nine search bars'], ['Flat per-seat price', 'Fourteen invoices']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 16, opacity: q, transform: `translateY(${(1 - q) * 34}px)` }}>
              <div style={{ flex: 1, background: C.cream, border: `1px solid ${C.accent}`, borderRadius: 12, padding: '22px 30px', ...BODY(36, C.ink) }}>{a}</div>
              <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: '22px 30px', ...BODY(36, C.mute) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.bg} wipe="fade" wipeColor={C.desk}>{(p) => <Chapter p={p} n="CHAPTER 04" title="Getting there" deck="Import on Monday, retire the rest by Friday." />}</Scene>

      <Scene name="Import" bg={C.desk} wipe="sheet" wipeColor={C.bg}>{(p, lt, raw) => {
        const q = ease.inOut(clamp(raw / 0.8, 0, 1));
        return <div style={MID}>
          <Win title="Import — 3 sources" w={1200} h={480} p={p}>
            <div style={{ padding: '34px 40px' }}>
              {[['Docs', 0.98], ['Tracker', 0.72], ['Sheets', 0.41]].map(([n, v], i) => (
                <div key={i} style={{ marginBottom: 26 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...UI(24, C.ink) }}><span>{n}</span><span>{Math.round(Math.min(1, v * q * 1.4) * 100)}%</span></div>
                  <div style={{ height: 12, background: C.panel, borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(1, v * q * 1.4) * 100}%`, background: i === 0 ? C.accent2 : C.accent }} />
                  </div>
                </div>))}
            </div>
          </Win>
          <div style={{ ...BODY(36, C.ink), marginTop: 34, opacity: ease.out((raw - 0.55) / 0.25) }}>Nothing to map by hand. Links keep working.</div>
        </div>;
      }}</Scene>

      <Scene name="Team" bg={C.bg} wipe="pane" wipeColor={C.desk}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 18 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.out(stg(p, i, 0.08, 0.26));
              return <div key={i} style={{ width: 260, height: 300, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`, opacity: q, transform: `translateY(${(1 - q) * 90}px)` }}>
                <Fill id={`ws-team-${i}`} shape="rounded" radius={14} placeholder="DROP TEAM PHOTO" idle={C.panel} />
              </div>;
            })}
          </div>
          <div style={{ ...SET(72, C.ink), marginTop: 46 }}>Built by nine people in one window.</div>
        </div>)}
      </Scene>

      <Scene name="Plans" bg={C.desk} wipe="tile" wipeColor={C.bg}>{(p) => {
        const plans = [['Solo', '£0', 'one person, one workspace'], ['Team', '£9', 'per seat, per month'], ['Company', 'Custom', 'SSO, audit log, residency']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 24 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28)); const hero = i === 1;
            return <div key={i} style={{ width: 470, background: hero ? C.ink : C.cream, border: `1px solid ${hero ? C.ink : C.line}`, borderRadius: 14, padding: '46px 38px', boxSizing: 'border-box', textAlign: 'left', opacity: q, transform: `translateY(${(1 - q) * 80}px)` }}>
              <div style={CAPS(16, hero ? C.accent : C.mute)}>{n.toUpperCase()}</div>
              <div style={{ ...NUM(100, hero ? C.cream : C.ink), marginTop: 14 }}>{price}</div>
              <div style={{ ...BODY(30, hero ? alpha(C.cream, 0.75) : C.mute), marginTop: 12 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.panel} wipe="minimise" wipeColor={C.accent2}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="ws-founder" w={520} h={640} r={14} p={p} enter="left" />
          <div style={{ maxWidth: 860 }}>
            <div style={CAPS(18, C.accent)}>WHY WE BUILT IT</div>
            <div style={{ ...SET(70, C.ink), marginTop: 20 }}>We counted the tabs one Friday and stopped counting at forty.</div>
            <div style={{ ...BODY(34, C.mute), marginTop: 20 }}>Workspace started as a launcher. The launcher turned out to be the product.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.bg} wipe="sheet" wipeColor={C.ink}>{(p) => {
        const bq = ease.out((p - 0.25) / 0.3);
        return <div style={MID}>
          <LogoSlot id="ws-logo-cta" size={116} p={p} d={0.05} shape="rounded" style={{ borderRadius: 20 }} />
          <div style={{ ...SET(102, C.ink), marginTop: 26 }}>Close the other windows.</div>
          <div style={{ display: 'inline-block', marginTop: 40, opacity: bq, transform: `translateY(${(1 - bq) * 28}px) scale(${1 + Math.sin(T * 3) * 0.01})`, background: C.accent, color: C.cream, ...CAPS(22, C.cream), padding: '22px 56px', borderRadius: 10 }}>OPEN A WORKSPACE</div>
          <div style={{ ...CAPS(18, C.mute), marginTop: 26 }}>WORKSPACE.APP</div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.desk} wipe="tile" wipeColor={C.accent}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ ...MID, opacity: fade }}>
          <Chars t="Workspace" p={p} size={180} color={C.ink} font={FH} mode="rise" per={0.04} />
          <div style={{ ...CAPS(19, C.accent), marginTop: 24, opacity: ease.out((p - 0.5) / 0.3) }}>WORKSPACE.APP</div>
        </div>;
      }}</Scene>

      <Scene name="Search" bg={C.bg} wipe="tile" wipeColor={C.desk}>{(p, lt, raw) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={MID}>
            <Palette query="who owns the migration?" results={['Migration — Tracker epic, owner: Ana', 'Migration plan — Doc, 3 comments', 'ana@ — 4 threads mentioning migration']} p={p} lt={lt} color={C.accent2} ink={C.ink} />
          </div>
          <Toast text="Answer found in 240ms" p={p} d={0.6} color={C.accent2} style={{ position: 'absolute', right: 150, bottom: 150 }} />
        </div>)}
      </Scene>

      <Scene name="Inbox" bg={C.desk} wipe="pane" wipeColor={C.bg}>{(p) => (
        <div style={MID}>
          <Win title="One inbox — 7 items" w={1420} h={520} p={p}>
            <Rows items={[['Ana commented on Q3 model', '2m'], ['Deploy 4,912 passed', '14m'], ['Brand kit needs approval', '1h'], ['Migration ticket assigned', '3h'], ['Weekly digest ready', 'yesterday']]} p={p} ink={C.ink} color={C.accent} />
          </Win>
          <div style={{ ...BODY(34, C.ink), marginTop: 30, opacity: ease.out((p - 0.55) / 0.3) }}>Mail, tickets, comments and deploys, in one list.</div>
        </div>)}
      </Scene>

      <Scene name="Perm" bg={C.bg} wipe="sheet" wipeColor={C.desk}>{(p) => {
        const rows = [['Everyone at the company', 'can view'], ['Product team', 'can edit'], ['Ana, Devi', 'can approve'], ['External auditors', 'view, expires Friday']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...HEAD(78, C.ink), marginBottom: 40 }}>Permissions you can read out loud.</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '24px 30px', marginBottom: 14, opacity: q, transform: `translateY(${(1 - q) * 28}px)` }}>
              <span style={{ ...UI(30, C.ink), flex: 1 }}>{k}</span>
              <span style={{ ...CAPS(16, i === 3 ? C.accent : C.accent2) }}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Offline" bg={C.panel} wipe="minimise" wipeColor={C.accent}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 90 }}>
          <div>
            <div style={NUM(300, C.accent2)}><Counter target={100} p={p} dur={0.45} suffix="%" /></div>
            <div style={{ ...CAPS(17, C.mute), marginTop: 20 }}>AVAILABLE OFFLINE</div>
          </div>
          <div style={{ maxWidth: 640, textAlign: 'left' }}>
            <div style={BODY(40, C.ink)}>Local-first storage. The plane, the tunnel and the bad hotel wifi all work.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Mobile" bg={C.bg} wipe="tile" wipeColor={C.desk}>{(p) => (
        <div style={{ ...PAD, display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'flex-end' }}>
          <Slot id="ws-mob-0" w={340} h={620} r={30} p={p} d={0.04} enter="rise" />
          <Slot id="ws-mob-1" w={340} h={680} r={30} p={p} d={0.14} enter="rise" />
          <Slot id="ws-mob-2" w={340} h={600} r={30} p={p} d={0.24} enter="rise" />
          <div style={{ position: 'absolute', left: 150, top: 160, ...CAPS(18, C.accent) }}>THE SAME WORKSPACE, IN A POCKET</div>
        </div>)}
      </Scene>

      <Scene name="Api" bg={C.ink} wipe="pane" wipeColor={C.accent2}>{(p, lt) => (
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <div style={{ ...CAPS(18, C.accent), marginBottom: 6 }}>SCRIPTABLE</div>
          <div style={{ background: '#15171a', border: `1px solid #2c3036`, borderRadius: 12, padding: '30px 34px' }}>
            <div style={{ ...UI(32, C.accent2) }}>
              <Typed t="$ ws query 'assigned:me due:today' --json" p={p} lt={lt} dur={0.45} caretColor={C.accent} style={UI(32, C.accent2)} />
            </div>
            <div style={{ ...UI(26, alpha(C.cream, 0.6)), marginTop: 18, opacity: ease.out((p - 0.5) / 0.3) }}>→ 6 objects · 41ms</div>
          </div>
          <div style={{ ...BODY(34, alpha(C.cream, 0.75)) }}>Everything the interface does, the CLI does too.</div>
        </div>)}
      </Scene>

      <Scene name="Audit" bg={C.desk} wipe="fade" wipeColor={C.bg}>{(p) => {
        const rows = [['ana@ approved brand kit', '14:02'], ['devi@ exported Q3 model', '13:41'], ['auditor@ viewed ledger', '11:20'], ['system retired 4 licences', '09:00']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1480 }}>
          <div style={{ ...CAPS(18, C.mute), marginBottom: 26 }}>AUDIT LOG · TODAY</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.08, 0.24));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '18px 0', borderBottom: `1px solid ${C.line}`, opacity: q }}>
              <span style={{ ...UI(34, C.ink), flex: 1 }}>{k}</span>
              <span style={{ ...NUM(30, C.mute) }}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Adoption" bg={C.bg} wipe="tile" wipeColor={C.accent}>{(p) => {
        const weeks = [0.18, 0.36, 0.58, 0.74, 0.88, 0.96];
        const q = ease.inOut(p / 0.65);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...HEAD(78, C.ink), marginBottom: 44 }}>Daily use, first six weeks.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, height: 380 }}>
            {weeks.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ ...NUM(38, i === 5 ? C.accent : C.mute), marginBottom: 12 }}>{Math.round(v * 100 * q)}%</div>
                <div style={{ height: 300 * v * q, background: i === 5 ? C.accent : C.line, borderRadius: 8 }} />
              </div>))}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Retire" bg={C.accent2} wipe="minimise" wipeColor={C.cream}>{(p) => {
        const tools = ['Wiki', 'Chat app', 'Task tool', 'File drive', 'Note app'];
        return <div style={MID}>
          <div style={{ ...HEAD(84, C.cream), marginBottom: 44 }}>Four of these went first.</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {tools.map((t2, i) => {
              const gone = i < 4;
              const q = ease.out(stg(p, i, 0.09, 0.26));
              return <div key={i} style={{ background: gone ? alpha(C.ink, 0.35) : C.cream, color: gone ? alpha(C.cream, 0.6) : C.ink, ...UI(34, gone ? alpha(C.cream, 0.6) : C.ink), padding: '18px 34px', borderRadius: 999, textDecoration: gone ? 'line-through' : 'none', opacity: q }}>{t2}</div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Free" bg={C.accent} wipe="sheet" wipeColor={C.cream}>{(p) => (
        <div style={MID}>
          <Chars t="Free for one." p={p} size={150} color={C.cream} font={FH} mode="rise" per={0.038} />
          <div style={{ ...BODY(40, alpha(C.cream, 0.88)), marginTop: 30, opacity: ease.out((p - 0.45) / 0.3) }}>Nine pounds a seat when the team follows you in.</div>
        </div>)}
      </Scene>

      <Garnish />
    </div>
  );
}

window.WorkspaceFilm = function WorkspaceFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
