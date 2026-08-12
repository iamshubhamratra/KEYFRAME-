/* cadence-film.jsx — "CADENCE" premium SaaS launch film, built to the KEYFRAME Motion System.
   Motion language: premium, minimal, physics-based, cinematic, layered. Never bouncy, never TikTok.

   ARCHITECTURE — scenes declare animation TOKENS in OM_SCENES:
     "anim": { enter, idle, exit, camera, text, transition }
   Tokens map to the reusable preset library below; scenes compose presets, never raw motion code.

   PRESET LIBRARY
     text:    wordStaggerBlur · charReveal · outlineFillReveal · morphWord · emphasisPulse
     card:    cardRise3D · floatingIdle · cardStackTransition · lightSweep · softShadow
     camera:  pushSlow · pullOut · panSlow · orbitSlow · tiltSlow  (+ parallaxLayers depth)
     scene:   depthWipe · panelSlide · maskedWipe · swipe · lightSweepCut · cameraPush
     ui:      cursorClickRipple · buttonPress · toggleSwitch · checkTick · progressGrow ·
              counterAnimate · scrollReveal
   Organic design system tokens throughout. 1080×1920.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. */

// ── Organic tokens (hex mirrors of styles.css :root, for JS colour math) ─────
const T = {
  bg: '#f5ead8', surface: '#ebddc5', text: '#201e1d',
  accent: '#c67139', accent2: '#7a8a5e',
  n100: '#f9f4ed', n200: '#eee7db', n300: '#dcd3c4', n400: '#c0b6a5', n700: '#645c50', n900: '#2e2b25',
  a200: '#ffe1d0', a300: '#ffc6a5', a400: '#f6a06b', a600: '#b2622d', a700: '#8c491a', a900: '#402310',
  s200: '#e1eecc', s300: '#ccdbb2', s400: '#aebf92', s600: '#728157', s700: '#56633f', s900: '#272e1b',
};
const ThemeContext = React.createContext({ ...T, brand: 'CADENCE', url: 'cadence.work' });
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Caprasimo', system-ui, sans-serif";
const BODY = "'Figtree', system-ui, sans-serif";
const PERSP = 1400;

// ── Maths / easing ───────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
// power4.out — the house ease for entrances
const quartOut = t => 1 - Math.pow(1 - t, 4);
// tiny overshoot settle: 100 → 102 → 100 (never a linear stop)
const settle = (t, over = 0.02) => t >= 1 ? 1 : 1 + over * Math.sin(clamp01(t) * Math.PI) * (1 - clamp01(t) * 0.25);
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { const L = lum(bg), cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); return cr(L, lum(T.text)) >= cr(L, lum(T.n100)) ? T.text : T.n100; }

// ═══════════════════ PRESET LIBRARY — TEXT ═══════════════════════════════════
// wordStaggerBlur: opacity + y + blur + scale, 40ms stagger, power4.out
function WordStaggerBlur({ progress, at = 0.04, stagger = 0.028, dur = 0.2, text, style, dirIndex = 0, seed = 0 }) {
  const words = String(text).split(' ');
  const DIRS = [[0, 40], [-46, 0], [46, 0], [0, -40]];  // bottom · left · right · top
  const [dx, dy] = DIRS[dirIndex % DIRS.length];
  const drift = useDrift(seed + 0.6, 0.9);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', transform: drift, ...style }}>
      {words.map((w, i) => {
        const a = at + i * stagger;
        const t = seg(progress, a, a + dur, quartOut);
        return (
          <span key={i} style={{
            display: 'inline-block', marginRight: '0.28em', whiteSpace: 'pre',
            opacity: t, filter: t < 1 ? `blur(${((1 - t) * 18).toFixed(1)}px)` : 'none',
            transform: `translate(${((1 - t) * dx).toFixed(1)}px, ${((1 - t) * dy).toFixed(1)}px) scale(${(lerp(0.94, 1, t) * settle(t)).toFixed(4)})`,
          }}>{w}</span>
        );
      })}
    </span>
  );
}
// charReveal: character by character behind a soft mask — hero scenes only
function CharReveal({ progress, at = 0.04, per = 0.014, text, style, seed = 0 }) {
  const chars = String(text).split('');
  const drift = useDrift(seed + 1.3, 0.75);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', transform: drift, ...style }}>
      {chars.map((c, i) => {
        const a = at + i * per;
        const t = seg(progress, a, a + 0.16, quartOut);
        return <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: t, filter: t < 1 ? `blur(${((1 - t) * 14).toFixed(1)}px)` : 'none', transform: `translateY(${((1 - t) * 32).toFixed(1)}px) scale(${settle(t).toFixed(4)})` }}>{c}</span>;
      })}
    </span>
  );
}
// outlineFillReveal: stroked outline, then the brand colour floods in
function OutlineFill({ progress, at = 0.04, dur = 0.34, text, size, theme, fill, style }) {
  const appear = seg(progress, at, at + 0.16, quartOut);
  const flood = seg(progress, at + 0.1, at + 0.1 + dur, E.easeInOutCubic);
  const base = { fontFamily: DISP, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.01em', whiteSpace: 'pre' };
  return (
    <span style={{ position: 'relative', display: 'inline-block', opacity: appear, transform: `translateY(${((1 - appear) * 26).toFixed(1)}px)`, ...style }}>
      <span style={{ ...base, color: 'transparent', WebkitTextStroke: `3px ${rgba(theme.text, 0.5)}`, display: 'block' }}>{text}</span>
      <span style={{ ...base, position: 'absolute', inset: 0, color: fill || theme.accent, clipPath: `inset(0 ${((1 - flood) * 100).toFixed(2)}% 0 0)` }}>{text}</span>
    </span>
  );
}
// morphWord: only the changing word animates — the frame around it holds still
function MorphWord({ progress, at = 0.1, span = 0.62, words, theme, size, fill }) {
  const n = words.length;
  const local = clamp01((progress - at) / span);
  const idx = Math.min(n - 1, Math.floor(local * n));
  const inner = clamp01((local * n) - idx);
  const rise = seg(inner, 0, 0.32, quartOut);
  const fall = idx < n - 1 ? 1 - seg(inner, 0.78, 1, E.easeInQuad) : 1;
  return (
    <span style={{ display: 'inline-block', position: 'relative', minWidth: '5em' }}>
      <span style={{
        display: 'inline-block', fontFamily: DISP, fontSize: size, lineHeight: 1.02, color: fill || theme.accent,
        opacity: rise * fall,
        filter: rise < 1 ? `blur(${((1 - rise) * 14).toFixed(1)}px)` : 'none',
        transform: `translateY(${((1 - rise) * 26 - (1 - fall) * 20).toFixed(1)}px) scale(${settle(rise).toFixed(4)})`,
      }}>{words[idx]}</span>
    </span>
  );
}
// emphasisPulse: a single keyword breathes — scale 1→1.06→1, brightness lift
function usePulse(clock, period = 3.4, ph = 0) {
  const t = ((clock + ph) % period) / period;
  const k = t < 0.22 ? Math.sin((t / 0.22) * Math.PI) : 0;
  return { transform: `scale(${(1 + k * 0.06).toFixed(4)})`, filter: `brightness(${(1 + k * 0.15).toFixed(3)})`, display: 'inline-block' };
}

// ═══════════════════ PRESET LIBRARY — CARD & DEPTH ═══════════════════════════
// cardRise3D + floatingIdle + softShadow + lightSweep, one mount
function Card3D({ progress, at = 0.08, clock, seed = 0, children, radius = 20, theme, stack = 0, style }) {
  const t = seg(progress, at, at + 0.4, quartOut);                 // 700ms-feel entrance
  const rx = lerp(12, 0, t), ry = lerp(-8, 0, t), ty = lerp(80, 0, t);
  const sc = lerp(0.92, 1, t) * settle(t);
  const blur = (1 - t) * 12;
  // floatingIdle — ±5px, ±0.8°, 4–6s sine
  const fy = Math.sin(clock * 0.28 + seed) * 5, fr = Math.sin(clock * 0.22 + seed * 1.3) * 0.8;
  // cardStackTransition — pushed-back cards sit left, smaller, blurred
  const sX = stack * -46, sS = 1 - stack * 0.05, sB = stack * 3, sO = 1 - stack * 0.3;
  const shadow = `0 ${(28 + Math.sin(clock * 0.28 + seed) * 6).toFixed(1)}px ${(52 + Math.sin(clock * 0.28 + seed) * 8).toFixed(1)}px ${rgba(theme.n900, 0.16 * t)}`;
  return (
    <div style={{ perspective: PERSP, ...style }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%', borderRadius: radius, background: theme.n100,
        border: `1px solid ${rgba(theme.n900, 0.1)}`, boxShadow: shadow, overflow: 'hidden',
        opacity: t * sO,
        filter: (blur + sB) > 0.3 ? `blur(${(blur + sB).toFixed(1)}px)` : 'none',
        transform: `translate3d(${sX}px, ${(ty + fy).toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${fr.toFixed(2)}deg) scale(${(sc * sS).toFixed(4)})`,
        transformStyle: 'preserve-3d', willChange: 'transform, opacity, filter',
      }}>
        {children}
        <LightSweep clock={clock} seed={seed} active={t > 0.98} />
      </div>
    </div>
  );
}
// lightSweep — a very subtle highlight crosses the top edge every ~4s
function LightSweep({ clock, seed = 0, active }) {
  if (!active) return null;
  const cyc = ((clock * 0.25 + seed * 0.3) % 1);
  if (cyc > 0.4) return null;
  const k = cyc / 0.4;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg, transparent ${(k * 100 - 26).toFixed(0)}%, rgba(255,255,255,0.95) ${(k * 100).toFixed(0)}%, transparent ${(k * 100 + 26).toFixed(0)}%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(104deg, transparent ${(k * 130 - 40).toFixed(0)}%, rgba(255,255,255,0.16) ${(k * 130 - 12).toFixed(0)}%, transparent ${(k * 130 + 12).toFixed(0)}%)`, pointerEvents: 'none' }} />
    </React.Fragment>
  );
}

// ═══════════════════ PRESET LIBRARY — CAMERA ═════════════════════════════════
// Continuous camera on every scene; depth scales it for parallaxLayers.
function camera(kind, progress, depth = 1) {
  const j = E.easeInOutSine(progress);
  let x = 0, y = 0, s = 1, rot = 0;
  if (kind === 'pushSlow') { s = lerp(1.0, 1.085, j); y = lerp(26, -26, j); }
  else if (kind === 'pullOut') { s = lerp(1.09, 1.0, j); y = lerp(-22, 22, j); }
  else if (kind === 'panSlow') { x = lerp(46, -46, j); s = lerp(1.02, 1.06, j); }
  else if (kind === 'panBack') { x = lerp(-46, 46, j); s = lerp(1.06, 1.02, j); }
  else if (kind === 'orbitSlow') { x = Math.sin(progress * Math.PI) * 44; rot = lerp(-1.1, 1.1, j); s = lerp(1.02, 1.07, j); }
  else if (kind === 'tiltSlow') { y = lerp(42, -42, j); rot = lerp(0.8, -0.8, j); s = lerp(1.02, 1.07, j); }
  else { s = lerp(1.0, 1.07, j); y = lerp(18, -18, j); }
  return { x: x * depth, y: y * depth, s: 1 + (s - 1) * depth, rot: rot * depth };
}
// Continuous per-element drift — nothing ever freezes after it lands
function useDrift(seed = 0, amp = 1) {
  const c = useClock();
  return `translate(${(Math.sin(c * 0.26 + seed) * 6 * amp).toFixed(2)}px, ${(Math.cos(c * 0.19 + seed * 1.4) * 8 * amp).toFixed(2)}px)`;
}
// Scene transitions — camera-driven, masked or panel. Never a crossfade.
function transition(kind, progress, isLast) {
  const IN = 0.1, OUT = 0.9;
  let x = 0, y = 0, s = 1, blur = 0, op = 1, clip = null;
  if (progress < IN) {
    const t = seg(progress, 0, IN, E.easeOutExpo);
    op = seg(progress, 0, IN * 0.4, E.easeOutQuad);
    if (kind === 'depthWipe') { s = lerp(1.16, 1, t); blur = (1 - t) * 20; clip = `inset(${((1 - t) * 100).toFixed(1)}% 0 0 0)`; op = 1; }
    else if (kind === 'panelSlide') { y = (1 - t) * 700; blur = (1 - t) * 10; op = 1; }
    else if (kind === 'maskedWipe') { clip = `inset(0 ${((1 - t) * 100).toFixed(1)}% 0 0)`; x = (1 - t) * 90; op = 1; }
    else if (kind === 'swipe') { x = (1 - t) * 760; blur = (1 - t) * 16; op = 1; }
    else if (kind === 'swipeBack') { x = -(1 - t) * 760; blur = (1 - t) * 16; op = 1; }
    else if (kind === 'lightSweepCut') { clip = `inset(0 0 ${((1 - t) * 100).toFixed(1)}% 0)`; s = lerp(1.06, 1, t); op = 1; }
    else { s = lerp(1.14, 1, t); blur = (1 - t) * 14; }        // cameraPush
  }
  if (progress > OUT && !isLast) {
    const t = seg(progress, OUT, 1, E.easeInExpo);
    op = 1 - seg(progress, OUT + 0.035, 1, E.easeInQuad);
    if (kind === 'depthWipe') { s = lerp(1, 1.1, t); blur = t * 20; }
    else if (kind === 'panelSlide') { y = -t * 620; blur = t * 10; }
    else if (kind === 'maskedWipe') { clip = `inset(0 0 0 ${(t * 100).toFixed(1)}%)`; x = -t * 90; op = 1; }
    else if (kind === 'swipe') { x = -t * 760; blur = t * 16; }
    else if (kind === 'swipeBack') { x = t * 760; blur = t * 16; }
    else if (kind === 'lightSweepCut') { clip = `inset(${(t * 100).toFixed(1)}% 0 0 0)`; op = 1; }
    else { s = lerp(1, 1.12, t); blur = t * 14; }
  }
  return { x, y, s, blur, op, clip };
}

// ═══════════════════ PRESET LIBRARY — AMBIENT ════════════════════════════════
// Moving gradients, slow-rotating blobs, drifting particles, grain. No dead frames.
function Ambient({ clock, theme, dark, tint }) {
  const a1 = tint || theme.accent, a2 = theme.accent2;
  const parts = React.useMemo(() => new Array(16).fill(0).map((_, i) => ({ x: (i * 137.5) % 100, y: (i * 61.8) % 100, r: 1.5 + (i % 3), sp: 0.16 + (i % 4) * 0.05, ph: i * 0.7 })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: 999, left: -260, top: 140, background: `radial-gradient(circle, ${rgba(a1, dark ? 0.2 : 0.16)}, transparent 68%)`, transform: `rotate(${(clock * 3).toFixed(2)}deg) translateY(${(Math.sin(clock * 0.2) * 34).toFixed(1)}px)` }} />
      <div style={{ position: 'absolute', width: 760, height: 760, borderRadius: 999, right: -220, bottom: 220, background: `radial-gradient(circle, ${rgba(a2, dark ? 0.18 : 0.15)}, transparent 68%)`, transform: `rotate(${(-clock * 2.4).toFixed(2)}deg) translateY(${(Math.cos(clock * 0.17) * 30).toFixed(1)}px)` }} />
      <div style={{ position: 'absolute', width: 560, height: 560, borderRadius: 999, left: 320, bottom: -160, background: `radial-gradient(circle, ${rgba(theme.a300, dark ? 0.14 : 0.12)}, transparent 70%)`, transform: `translateX(${(Math.sin(clock * 0.13) * 40).toFixed(1)}px)` }} />
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        {parts.map((p, i) => {
          const y = ((p.y / 100 * 1920) - clock * p.sp * 60) % 1980;
          return <circle key={i} cx={p.x / 100 * 1080 + Math.sin(clock * 0.3 + p.ph) * 22} cy={y < -20 ? y + 1980 : y} r={p.r} fill={rgba(dark ? theme.n100 : theme.n900, dark ? 0.22 : 0.14)} />;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, opacity: dark ? 0.05 : 0.035, backgroundImage: `radial-gradient(${dark ? '#fff' : '#000'} 1px, transparent 1px)`, backgroundSize: '3px 3px', mixBlendMode: dark ? 'screen' : 'multiply' }} />
    </div>
  );
}

// ═══════════════════ PRESET LIBRARY — UI MICROINTERACTIONS ═══════════════════
// cursorClickRipple — the cursor travels, clicks, ripples; the UI reacts after
function Cursor({ progress, from, to, at = 0.28, travel = 0.2, clickAt, theme }) {
  const t = seg(progress, at, at + travel, E.easeInOutCubic);
  const x = lerp(from[0], to[0], t), y = lerp(from[1], to[1], t);
  const press = clickAt != null ? seg(progress, clickAt, clickAt + 0.08, E.easeOutQuad) * (1 - seg(progress, clickAt + 0.08, clickAt + 0.2, E.easeInQuad)) : 0;
  const rip = clickAt != null ? seg(progress, clickAt, clickAt + 0.3, E.easeOutCubic) : 0;
  if (progress < at - 0.02) return null;
  return (
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 24 }}>
      {rip > 0 && rip < 1 && <circle cx={to[0]} cy={to[1]} r={12 + rip * 52} fill="none" stroke={rgba(theme.accent, (1 - rip) * 0.85)} strokeWidth={3} />}
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(1 - press * 0.16).toFixed(3)})`}>
        <path d="M0 0 L0 30 L8 22 L14 35 L19 33 L13 20 L23 20 Z" fill={T.n100} stroke={T.n900} strokeWidth="2.4" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
// buttonPress — depresses, then settles, on cue
function PressButton({ progress, at, label, theme, bg, full }) {
  const inT = seg(progress, at - 0.14, at - 0.02, quartOut);
  const press = seg(progress, at, at + 0.07, E.easeOutQuad) * (1 - seg(progress, at + 0.07, at + 0.19, E.easeInQuad));
  const ink = inkOn(bg || theme.accent);
  return (
    <div style={{
      display: full ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '26px 44px', borderRadius: 999, background: bg || theme.accent, color: ink,
      fontFamily: DISP, fontSize: 40, opacity: inT,
      boxShadow: `0 ${(12 - press * 9).toFixed(1)}px ${(26 - press * 14).toFixed(1)}px ${rgba(theme.n900, 0.22)}`,
      transform: `translateY(${((1 - inT) * 26 + press * 5).toFixed(1)}px) scale(${(settle(inT) * (1 - press * 0.02)).toFixed(4)})`,
    }}>{label}</div>
  );
}
// toggleSwitch — knob slides, track tints
function Toggle({ progress, at, theme }) {
  const t = seg(progress, at, at + 0.22, quartOut);
  return (
    <div style={{ width: 92, height: 52, borderRadius: 999, background: `color-mix(in oklab, ${theme.n300} ${((1 - t) * 100).toFixed(0)}%, ${theme.accent})`, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 5, left: 5, width: 42, height: 42, borderRadius: 999, background: T.n100, boxShadow: `0 3px 8px ${rgba(T.n900, 0.22)}`, transform: `translateX(${(t * 40).toFixed(1)}px)` }} />
    </div>
  );
}
// checkTick — the stroke draws itself
function Check({ progress, at, theme, size = 46 }) {
  const box = seg(progress, at, at + 0.16, quartOut);
  const tick = seg(progress, at + 0.08, at + 0.28, E.easeOutCubic);
  return (
    <svg width={size} height={size} viewBox="0 0 46 46" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="42" height="42" rx="13" fill={rgba(theme.accent, box)} stroke={theme.accent} strokeWidth="3" />
      <path d="M12 24 L20 32 L34 15" fill="none" stroke={T.n100} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" strokeDashoffset={(40 * (1 - tick)).toFixed(1)} />
    </svg>
  );
}
// progressGrow
function Progress({ progress, at, frac, theme, label }) {
  const t = seg(progress, at, at + 0.42, E.easeInOutCubic);
  return (
    <div style={{ opacity: seg(progress, at - 0.08, at, quartOut) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontWeight: 800, fontSize: 24, color: rgba(theme.text, 0.7), marginBottom: 10 }}>
        <span>{label}</span><span style={{ color: theme.a700 }}>{Math.round(frac * t * 100)}%</span>
      </div>
      <div style={{ height: 16, borderRadius: 999, background: theme.n300, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(frac * t * 100).toFixed(1)}%`, borderRadius: 999, background: `linear-gradient(90deg, ${theme.accent}, ${theme.a400})` }} />
      </div>
    </div>
  );
}
// counterAnimate
function Counter({ progress, at, dur = 0.44, value, suffix = '', color }) {
  const t = seg(progress, at, at + dur, E.easeOutExpo);
  const v = value * t;
  return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>;
}
// scrollReveal — a real list that scrolls, rows landing as they arrive
function ScrollList({ progress, at, clock, rows, theme }) {
  const t = seg(progress, at, at + 0.62, E.easeInOutCubic);
  const shift = t * (rows.length * 96 - 300);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', padding: '18px 0' }}>
      <div style={{ transform: `translateY(${(-shift).toFixed(1)}px)` }}>
        {rows.map((r, i) => (
          <div key={i} style={{ height: 84, margin: '0 22px 12px', borderRadius: 14, background: i % 2 ? theme.n200 : theme.surface, display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px' }}>
            <Check progress={progress} at={at + 0.06 + i * 0.05} theme={theme} size={38} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 15, borderRadius: 999, background: rgba(theme.n900, 0.24), width: `${52 + (i % 4) * 12}%` }} />
              <div style={{ height: 11, borderRadius: 999, background: rgba(theme.n900, 0.13), width: `${30 + (i % 3) * 10}%`, marginTop: 9 }} />
            </div>
            <div style={{ width: 62, height: 26, borderRadius: 999, background: i % 3 === 0 ? rgba(theme.accent, 0.24) : rgba(theme.accent2, 0.24) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Media slot ───────────────────────────────────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT — 16:9', app: 'APP SCREEN', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img className={kind === 'logo' ? undefined : 'washed'} src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', background: `repeating-linear-gradient(135deg, ${rgba(theme.n900, 0.055)} 0 16px, ${rgba(theme.n900, 0.02)} 16px 32px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div style={{ width: 60, height: 60, borderRadius: 999, border: `2px dashed ${theme.accent}`, display: 'grid', placeItems: 'center', color: theme.accent, fontFamily: DISP, fontSize: 32 }}>+</div>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 21, letterSpacing: '0.1em', color: rgba(theme.text, 0.62), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', color: rgba(theme.text, 0.36) }}>DROP IMAGE</div>
    </div>
  );
}
function BrowserChrome({ theme, url }) {
  return (
    <div style={{ height: 52, flexShrink: 0, background: theme.surface, borderBottom: `1px solid ${rgba(theme.n900, 0.1)}`, display: 'flex', alignItems: 'center', gap: 9, padding: '0 20px' }}>
      {[theme.accent, theme.a400, theme.accent2].map((c, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 999, background: c }} />)}
      <div style={{ marginLeft: 14, flex: 1, maxWidth: 420, height: 28, borderRadius: 999, background: rgba(theme.n900, 0.07), display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: BODY, fontWeight: 700, fontSize: 15, color: rgba(theme.text, 0.55) }}>{url || theme.url}</div>
    </div>
  );
}

// ── Frame: chrome + ambient + parallax camera + tokenised transition ─────────
function Chrome({ theme, ink }) {
  const c = ink || theme.text;
  return (
    <div style={{ position: 'absolute', top: 52, left: 52, right: 52, display: 'flex', alignItems: 'center', gap: 14, zIndex: 30 }}>
      <span style={{ width: 46, height: 46, borderRadius: 999, background: theme.accent, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 24, color: inkOn(theme.accent) }}>{theme.brand.slice(0, 1)}</span>
      <span style={{ fontFamily: DISP, fontSize: 32, color: c }}>{theme.brand}</span>
      <span style={{ marginLeft: 'auto', fontFamily: BODY, fontWeight: 800, fontSize: 22, color: rgba(c, 0.6) }}>{theme.url}</span>
    </div>
  );
}
function Frame({ progress, index, count, scene, children, bg, dark, tint }) {
  const theme = useTheme();
  const clock = useClock();
  const a = (scene && scene.anim) || {};
  const isLast = count != null && index === count - 1;
  const tr = transition(a.transition || 'cameraPush', progress, isLast);
  const camFg = camera(a.camera || 'pushSlow', progress, 1);
  const camBg = camera(a.camera || 'pushSlow', progress, 0.42);   // parallaxLayers
  const wrap = (cam) => ({
    transform: `translate(${(cam.x + tr.x).toFixed(1)}px, ${(cam.y + tr.y).toFixed(1)}px) rotate(${cam.rot.toFixed(2)}deg) scale(${(cam.s * tr.s).toFixed(4)})`,
    filter: tr.blur > 0.3 ? `blur(${tr.blur.toFixed(1)}px)` : 'none',
    opacity: tr.op, clipPath: tr.clip || 'none', transformOrigin: 'center center', willChange: 'transform, opacity, filter',
  });
  const ground = bg || theme.bg;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: ground, fontFamily: BODY }}>
      <div style={{ position: 'absolute', inset: 0, ...wrap(camBg) }}><Ambient clock={clock} theme={theme} dark={dark} tint={tint} /></div>
      <div style={{ position: 'absolute', inset: 0, ...wrap(camFg) }}>{children}</div>
      <Chrome theme={theme} ink={inkOn(ground)} />
    </div>
  );
}

// Small filler primitives — keep every frame full without adding noise
function ChipRow({ progress, at = 0.4, items, theme, dark, center }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start' }}>
      {items.map((c, i) => {
        const t = seg(progress, at + i * 0.05, at + 0.14 + i * 0.05, quartOut);
        const ink = dark ? theme.n100 : theme.text;
        return <span key={i} style={{ opacity: t, transform: `translateY(${((1 - t) * 16).toFixed(1)}px) scale(${settle(t).toFixed(3)})`, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 22px', borderRadius: 999, background: dark ? rgba(theme.n100, 0.1) : theme.n200, border: `1px solid ${rgba(ink, 0.14)}`, fontFamily: BODY, fontWeight: 800, fontSize: 25, color: rgba(ink, 0.82), whiteSpace: 'nowrap' }}><span style={{ width: 10, height: 10, borderRadius: 999, background: i % 2 ? theme.accent2 : theme.accent }} />{c}</span>;
      })}
    </div>
  );
}
function MetaRow({ progress, at = 0.5, stats, theme, dark }) {
  const ink = dark ? theme.n100 : theme.text;
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {stats.map((st, i) => {
        const t = seg(progress, at + i * 0.06, at + 0.16 + i * 0.06, quartOut);
        return (
          <div key={i} style={{ flex: 1, opacity: t, transform: `translateY(${((1 - t) * 20).toFixed(1)}px)`, borderTop: `3px solid ${rgba(ink, 0.16)}`, paddingTop: 14 }}>
            <div style={{ fontFamily: DISP, fontSize: 58, lineHeight: 0.95, color: dark ? theme.a400 : theme.a700 }}><Counter progress={progress} at={at + 0.04 + i * 0.06} dur={0.3} value={st.v} suffix={st.suf || ''} color={dark ? theme.a400 : theme.a700} /></div>
            <div style={{ marginTop: 6, fontFamily: BODY, fontWeight: 800, fontSize: 21, letterSpacing: '0.06em', textTransform: 'uppercase', color: rgba(ink, 0.58) }}>{st.l}</div>
          </div>
        );
      })}
    </div>
  );
}
function Avatars({ progress, at = 0.5, n = 5, theme, label }) {
  const t = seg(progress, at, at + 0.2, quartOut);
  const cols = [theme.accent, theme.accent2, theme.a400, theme.s400, theme.a600];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: t, transform: `translateY(${((1 - t) * 18).toFixed(1)}px)` }}>
      <div style={{ display: 'flex' }}>
        {new Array(n).fill(0).map((_, i) => <div key={i} style={{ width: 62, height: 62, borderRadius: 999, background: cols[i % cols.length], border: `4px solid ${theme.bg}`, marginLeft: i ? -20 : 0 }} />)}
      </div>
      <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 26, color: rgba(theme.text, 0.62) }}>{label}</span>
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
// Search — the query types itself, rows filter live
function Search({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const q = s.query || 'design review';
  const n = Math.floor(clamp01(seg(progress, 0.16, 0.44)) * q.length);
  const caret = Math.floor(localTime * 2.6) % 2 === 0;
  const rows = s.results || ['Design review — Tue', 'Review: onboarding', 'Reviewed by Ana', 'Design system sync', 'Retro notes'];
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} seed={2} text={s.headline || 'Find anything, instantly.'} dirIndex={2} style={{ fontFamily: DISP, fontSize: 88, lineHeight: 1.05, color: theme.text }} />
      </div>
      <Card3D progress={progress} at={0.1} clock={localTime} seed={21} theme={theme} style={{ position: 'absolute', left: 72, right: 72, top: 500, height: 760 }}>
        <div style={{ padding: '34px 34px 0' }}>
          <div style={{ height: 88, borderRadius: 999, background: theme.n200, display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px' }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, border: `4px solid ${rgba(theme.text, 0.4)}` }} />
            <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 32, color: theme.text }}>{q.slice(0, n)}<span style={{ display: 'inline-block', width: 3, height: 34, verticalAlign: '-6px', background: caret ? theme.accent : 'transparent', marginLeft: 3 }} /></span>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            {(s.filters || ['All', 'Recent', 'Mine', 'Shared']).map((f, i) => {
              const on = i === 1;
              const t = seg(progress, 0.4 + i * 0.04, 0.5 + i * 0.04, quartOut);
              return <span key={i} style={{ opacity: t, padding: '10px 20px', borderRadius: 999, background: on ? theme.accent : theme.n200, color: on ? inkOn(theme.accent) : rgba(theme.text, 0.6), fontFamily: BODY, fontWeight: 800, fontSize: 22 }}>{f}</span>;
            })}
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r, i) => {
              const keep = i < 3;
              const fade = keep ? 1 : 1 - seg(progress, 0.5, 0.62, quartOut);
              const app = seg(progress, 0.46 + i * 0.045, 0.56 + i * 0.045, quartOut);
              return (
                <div key={i} style={{ height: 96, borderRadius: 16, background: i % 2 ? theme.n200 : theme.surface, display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px', opacity: app * fade, transform: `translateX(${((1 - app) * 30 - (1 - fade) * 40).toFixed(1)}px)` }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: keep ? rgba(theme.accent, 0.3) : rgba(theme.n900, 0.1), flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 28, color: theme.text }}>{r}</span>
                    <div style={{ height: 9, borderRadius: 999, background: rgba(theme.n900, 0.12), width: `${34 + (i % 3) * 14}%`, marginTop: 8 }} />
                  </div>
                  {keep && <Check progress={progress} at={0.6 + i * 0.05} theme={theme} size={32} />}
                </div>
              );
            })}
          </div>
        </div>
      </Card3D>
      <div style={{ position: 'absolute', left: 72, right: 72, top: 1320 }}>
        <MetaRow progress={progress} at={0.3} theme={theme} stats={s.meta || [{ v: 0.2, suf: 's', l: 'to first result' }, { v: 40, suf: 'K', l: 'items indexed' }, { v: 3, suf: '', l: 'exact matches' }]} />
        <div style={{ marginTop: 34 }}><ChipRow progress={progress} at={0.44} theme={theme} items={s.chips || ['Fuzzy matching', 'Filters', 'Saved searches']} /></div>
      </div>
      <Cursor progress={progress} from={[880, 1740]} to={[420, 640]} at={0.04} travel={0.12} clickAt={0.16} theme={theme} />
      <Cursor progress={progress} from={[420, 640]} to={[560, 940]} at={0.66} travel={0.12} clickAt={0.8} theme={theme} />
    </Frame>
  );
}
// Board — a card travels across kanban columns, cursor dragging it
function Board({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const cols = s.cols || ['To do', 'Doing', 'Shipped'];
  const t = seg(progress, 0.3, 0.78, E.easeInOutCubic);
  const colX = [0, 1, 2].map(i => 64 + i * 328);
  const cardX = lerp(colX[0], colX[2], t), cardY = 700 + Math.sin(t * Math.PI) * -60;
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} seed={3} text={s.headline || 'Work moves itself along.'} dirIndex={0} style={{ fontFamily: DISP, fontSize: 86, lineHeight: 1.05, color: theme.text }} />
      </div>
      {cols.map((c, i) => (
        <Card3D key={i} progress={progress} at={0.08 + i * 0.06} clock={localTime} seed={i + 25} theme={theme} style={{ position: 'absolute', left: colX[i], top: 500, width: 296, height: 780 }}>
          <div style={{ padding: '24px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 23, letterSpacing: '0.1em', textTransform: 'uppercase', color: rgba(theme.text, 0.55) }}>{c}</div>
              <div style={{ width: 34, height: 34, borderRadius: 999, background: rgba(theme.accent, 0.2), display: 'grid', placeItems: 'center', fontFamily: BODY, fontWeight: 800, fontSize: 19, color: theme.a700 }}>{i === 1 ? 2 : 3}</div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {new Array(i === 1 ? 2 : 3).fill(0).map((_, k) => (
                <div key={k} style={{ height: 118, borderRadius: 14, background: theme.n200, padding: 15, opacity: seg(progress, 0.16 + k * 0.05, 0.28 + k * 0.05, quartOut) }}>
                  <div style={{ height: 12, borderRadius: 999, background: rgba(theme.n900, 0.2), width: `${60 + k * 12}%` }} />
                  <div style={{ height: 9, borderRadius: 999, background: rgba(theme.n900, 0.12), width: '40%', marginTop: 9 }} />
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 50, height: 20, borderRadius: 999, background: rgba(k % 2 ? theme.accent2 : theme.accent, 0.28) }} />
                    <div style={{ display: 'flex' }}>{[0, 1].map(av => <div key={av} style={{ width: 24, height: 24, borderRadius: 999, background: av ? theme.accent2 : theme.accent, opacity: 0.55, border: `2px solid ${theme.n100}`, marginLeft: av ? -8 : 0 }} />)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card3D>
      ))}
      {/* the travelling card, lifted under the cursor */}
      <div style={{ position: 'absolute', left: cardX, top: cardY, width: 296, opacity: seg(progress, 0.26, 0.34, quartOut), transform: `rotate(${(Math.sin(t * Math.PI) * 3).toFixed(2)}deg) scale(${(1 + Math.sin(t * Math.PI) * 0.06).toFixed(3)})`, zIndex: 20 }}>
        <div style={{ borderRadius: 14, background: theme.n100, border: `3px solid ${theme.accent}`, boxShadow: `0 ${(18 + Math.sin(t * Math.PI) * 22).toFixed(0)}px ${(30 + Math.sin(t * Math.PI) * 30).toFixed(0)}px ${rgba(theme.n900, 0.26)}`, padding: 18 }}>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 26, color: theme.text }}>{s.card || 'Ship v2 onboarding'}</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Check progress={progress} at={0.74} theme={theme} size={30} />
            <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 22, color: theme.a700 }}>{t > 0.95 ? 'Done' : 'Moving'}</span>
          </div>
        </div>
      </div>
      <Cursor progress={progress} from={[220, 1500]} to={[cardX + 140, cardY + 40]} at={0.16} travel={0.12} clickAt={0.3} theme={theme} />
      <div style={{ position: 'absolute', left: 64, right: 64, top: 1340 }}>
        <MetaRow progress={progress} at={0.28} theme={theme} stats={s.meta || [{ v: 3, suf: '', l: 'stages' }, { v: 12, suf: 'h', l: 'avg cycle' }, { v: 98, suf: '%', l: 'on time' }]} />
        <div style={{ marginTop: 34 }}><ChipRow progress={progress} at={0.42} theme={theme} items={s.chips || ['Auto-advance', 'Owner rules', 'No stale cards']} /></div>
      </div>
    </Frame>
  );
}
// Notify — notification cards stack in, the cursor swipes one away
function Notify({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const notes = s.notes || ['Ana approved your draft', 'Build passed in 42s', 'Digest ready for Friday'];
  const swipe = seg(progress, 0.62, 0.8, E.easeInCubic);
  return (
    <Frame progress={progress} index={index} count={count} scene={s} bg={theme.n900} dark tint={theme.a400}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 240 }}>
        <WordStaggerBlur progress={progress} at={0.03} seed={4} text={s.headline || 'Only what matters reaches you.'} dirIndex={1} style={{ fontFamily: DISP, fontSize: 86, lineHeight: 1.05, color: theme.n100 }} />
      </div>
      <div style={{ position: 'absolute', left: 72, right: 72, top: 700, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {notes.map((nt, i) => (
          <div key={i} style={{ transform: i === 0 ? `translateX(${(swipe * 900).toFixed(0)}px) rotate(${(swipe * 8).toFixed(1)}deg)` : 'none', opacity: i === 0 ? 1 - swipe : 1 }}>
            <Card3D progress={progress} at={0.12 + i * 0.1} clock={localTime} seed={i + 29} theme={theme} style={{ height: 220 }}>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 22, padding: '0 32px' }}>
                <div style={{ width: 62, height: 62, borderRadius: 999, background: rgba(theme.accent, 0.28), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 30, color: theme.text }}>{nt}</div>
                  <div style={{ marginTop: 8, fontFamily: BODY, fontWeight: 700, fontSize: 22, color: rgba(theme.text, 0.5) }}>just now</div>
                </div>
                <Check progress={progress} at={0.34 + i * 0.08} theme={theme} size={40} />
              </div>
            </Card3D>
          </div>
        ))}
      </div>
      <Cursor progress={progress} from={[200, 1560]} to={[760, 810]} at={0.46} travel={0.13} clickAt={0.62} theme={theme} />
      <div style={{ position: 'absolute', left: 72, right: 72, top: 1450 }}>
        <ChipRow progress={progress} at={0.42} theme={theme} dark items={s.chips || ['Muted by default', 'One daily digest', 'Nothing after hours']} />
      </div>
    </Frame>
  );
}
// Thread — a conversation types itself in
function Thread({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const msgs = s.msgs || [{ m: 'Where are we on launch?', me: false }, { m: 'Board says shipped.', me: true }, { m: 'Digest already sent.', me: true }];
  const typing = seg(progress, 0.6, 0.72, quartOut) * (1 - seg(progress, 0.78, 0.86, quartOut));
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} seed={5} text={s.headline || 'Answers before the question.'} dirIndex={3} style={{ fontFamily: DISP, fontSize: 84, lineHeight: 1.05, color: theme.text }} />
      </div>
      <Card3D progress={progress} at={0.1} clock={localTime} seed={33} theme={theme} style={{ position: 'absolute', left: 72, right: 72, top: 520, height: 900 }}>
        <div style={{ padding: '34px 30px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {msgs.map((mm, i) => {
            const a = 0.24 + i * 0.12;
            const t = seg(progress, a, a + 0.16, quartOut);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: mm.me ? 'flex-end' : 'flex-start', opacity: t, transform: `translateY(${((1 - t) * 26).toFixed(1)}px) scale(${settle(t).toFixed(3)})` }}>
                <div style={{ maxWidth: '78%', borderRadius: 22, padding: '22px 26px', background: mm.me ? theme.accent : theme.n200, color: mm.me ? inkOn(theme.accent) : theme.text, fontFamily: BODY, fontWeight: 800, fontSize: 30, lineHeight: 1.25 }}>{mm.m}</div>
              </div>
            );
          })}
          {typing > 0.02 && (
            <div style={{ display: 'flex', opacity: typing }}>
              <div style={{ borderRadius: 22, padding: '22px 26px', background: theme.n200, display: 'flex', gap: 10 }}>
                {[0, 1, 2].map(d => <span key={d} style={{ width: 14, height: 14, borderRadius: 999, background: rgba(theme.text, 0.45), transform: `translateY(${(Math.sin(localTime * 6 - d * 0.7) * 6).toFixed(1)}px)` }} />)}
              </div>
            </div>
          )}
        </div>
      </Card3D>
      <Cursor progress={progress} from={[880, 1700]} to={[500, 1180]} at={0.4} travel={0.13} clickAt={0.56} theme={theme} />
      <div style={{ position: 'absolute', left: 72, right: 72, top: 1480 }}>
        <MetaRow progress={progress} at={0.4} theme={theme} stats={s.meta || [{ v: 2, suf: 'm', l: 'avg reply' }, { v: 0, suf: '', l: 'meetings booked' }, { v: 100, suf: '%', l: 'in context' }]} />
      </div>
    </Frame>
  );
}
// Metric — one huge number over a growing bar chart
function Metric({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const bars = s.bars || [0.4, 0.55, 0.48, 0.7, 0.82, 0.75, 0.96];
  return (
    <Frame progress={progress} index={index} count={count} scene={s} bg={theme.n900} dark tint={theme.s400}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 340 }}>
        <div style={{ opacity: seg(progress, 0.02, 0.12, quartOut), fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: theme.s400 }}>{s.eyebrow || 'MEETING HOURS, PER PERSON'}</div>
        <div style={{ marginTop: 20, fontFamily: DISP, fontSize: 230, lineHeight: 0.9, color: theme.a400 }}>
          <Counter progress={progress} at={0.1} dur={0.4} value={s.value != null ? s.value : 72} suffix={s.suffix || '%'} color={theme.a400} />
        </div>
        <div style={{ marginTop: 6 }}>
          <WordStaggerBlur progress={progress} at={0.34} seed={6} text={s.body || 'fewer status meetings in the first month.'} dirIndex={0} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 38, lineHeight: 1.28, color: rgba(theme.n100, 0.78), maxWidth: 860 }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 1130, height: 340, display: 'flex', alignItems: 'flex-end', gap: 20 }}>
        {bars.map((b, i) => { const g = seg(progress, 0.3 + i * 0.05, 0.6 + i * 0.05, E.easeOutCubic); return (
          <div key={i} style={{ flex: 1, height: `${(b * g * 100).toFixed(1)}%`, borderRadius: 16, background: i === bars.length - 1 ? theme.a400 : rgba(theme.n100, 0.2) }} />
        ); })}
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 1530 }}>
        <MetaRow progress={progress} at={0.34} theme={theme} dark stats={s.meta || [{ v: 6, suf: 'h', l: 'given back weekly' }, { v: 4, suf: '', l: 'fewer meetings' }, { v: 92, suf: '%', l: 'would keep it' }]} />
      </div>
    </Frame>
  );
}
// Voice — a testimonial that scales in word by word
function Voice({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const words = (s.quote || 'We stopped asking for updates in week one.').split(' ');
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, top: 380, fontFamily: DISP, fontSize: 190, lineHeight: 0.6, color: rgba(theme.accent, 0.4) }}>“</div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 560, display: 'flex', flexWrap: 'wrap' }}>
        {words.map((w, i) => { const a = 0.05 + i * 0.05; const o = seg(progress, a, a + 0.14, quartOut); return (
          <span key={i} style={{ opacity: o, filter: o < 1 ? `blur(${((1 - o) * 14).toFixed(1)}px)` : 'none', transform: `translateY(${((1 - o) * 24).toFixed(1)}px) scale(${settle(o).toFixed(3)})`, fontFamily: DISP, fontSize: 86, lineHeight: 1.18, color: theme.text, marginRight: 20 }}>{w}</span>
        ); })}
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 1180, display: 'flex', flexDirection: 'column', gap: 30, opacity: seg(progress, 0.4, 0.54, quartOut) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ width: seg(progress, 0.42, 0.62, E.easeOutCubic) * 90, height: 6, borderRadius: 999, background: theme.accent }} />
          <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 30, letterSpacing: '0.08em', textTransform: 'uppercase', color: rgba(theme.text, 0.7) }}>{s.by || 'HEAD OF PRODUCT'}</span>
        </div>
        <Avatars progress={progress} at={0.5} n={5} theme={theme} label={s.avatarLabel || 'and 4,000 more teams'} />
        <ChipRow progress={progress} at={0.58} theme={theme} items={s.chips || ['★★★★★', 'Verified review', '90 days in']} />
      </div>
    </Frame>
  );
}
// Pricing — cursor hovers one plan card, clicks, the card lifts and ticks
function Plans({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const plans = s.plans || [{ n: 'Solo', p: '0', d: 'For one' }, { n: 'Team', p: '9', d: 'Per person' }, { n: 'Scale', p: '19', d: 'Per person' }];
  const picked = 1;
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} text={s.headline || 'Pick a pace.'} dirIndex={1} style={{ fontFamily: DISP, fontSize: 96, lineHeight: 1.04, color: theme.text }} />
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 460, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {plans.map((p, i) => {
          const chosen = i === picked;
          const lift = chosen ? seg(progress, 0.66, 0.8, quartOut) : 0;
          return (
            <div key={i} style={{ transform: `translateY(${(-lift * 12).toFixed(1)}px) scale(${(1 + lift * 0.03).toFixed(4)})` }}>
              <Card3D progress={progress} at={0.12 + i * 0.09} clock={localTime} seed={i + 11} theme={theme} style={{ height: 300 }}>
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 26, padding: '0 42px', border: chosen ? `3px solid ${rgba(theme.accent, lift)}` : 'none', borderRadius: 20 }}>
                  <Check progress={progress} at={chosen ? 0.72 : 2} theme={theme} size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: DISP, fontSize: 52, lineHeight: 1, color: theme.text }}>{p.n}</div>
                    <div style={{ marginTop: 6, fontFamily: BODY, fontWeight: 700, fontSize: 26, color: rgba(theme.text, 0.62) }}>{p.d}</div>
                  </div>
                  <div style={{ fontFamily: DISP, fontSize: 82, lineHeight: 0.9, color: theme.a700 }}>${p.p}</div>
                </div>
              </Card3D>
            </div>
          );
        })}
      </div>
      <Cursor progress={progress} from={[880, 1720]} to={[300, 880]} at={0.5} travel={0.16} clickAt={0.7} theme={theme} />
    </Frame>
  );
}
// Integrations — cursor sweeps the grid, clicking two tiles on
function Connect({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const tools = s.tools || ['Calendar', 'Repos', 'Docs', 'Chat', 'Tickets', 'Mail'];
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} text={s.headline || 'Plug in what you already use.'} dirIndex={3} style={{ fontFamily: DISP, fontSize: 84, lineHeight: 1.06, color: theme.text }} />
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 560, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
        {tools.map((t, i) => {
          const on = i === 1 ? seg(progress, 0.56, 0.66, quartOut) : i === 4 ? seg(progress, 0.78, 0.88, quartOut) : 0;
          return (
            <Card3D key={i} progress={progress} at={0.1 + i * 0.055} clock={localTime} seed={i + 15} theme={theme} style={{ height: 250 }}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, padding: '0 30px', background: `color-mix(in oklab, transparent ${((1 - on) * 100).toFixed(0)}%, ${rgba(theme.accent, 0.14)})` }}>
                <div style={{ width: 62, height: 62, borderRadius: 18, background: on > 0.5 ? theme.accent : theme.n300, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 30, color: on > 0.5 ? inkOn(theme.accent) : rgba(theme.text, 0.5) }}>{t.slice(0, 1)}</div>
                <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 30, color: theme.text }}>{t}</div>
                <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 22, color: on > 0.5 ? theme.a700 : rgba(theme.text, 0.45) }}>{on > 0.5 ? 'Connected' : 'Tap to add'}</div>
              </div>
            </Card3D>
          );
        })}
      </div>
      <Cursor progress={progress} from={[180, 1740]} to={[790, 700]} at={0.4} travel={0.14} clickAt={0.56} theme={theme} />
      <Cursor progress={progress} from={[790, 700]} to={[300, 1240]} at={0.66} travel={0.12} clickAt={0.78} theme={theme} />
    </Frame>
  );
}
// Digest — a message card composes itself, cursor sends it
function Digest({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const rows = s.rows || ['3 things shipped', '1 blocker cleared', 'Nothing needs you'];
  return (
    <Frame progress={progress} index={index} count={count} scene={s} bg={theme.n900} dark tint={theme.s400}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 220 }}>
        <div style={{ opacity: seg(progress, 0.02, 0.12, quartOut), fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: theme.s400, marginBottom: 26 }}>{s.eyebrow || 'EVERY FRIDAY, 4PM'}</div>
        <WordStaggerBlur progress={progress} at={0.06} text={s.headline || 'The week, written for you.'} dirIndex={0} style={{ fontFamily: DISP, fontSize: 92, lineHeight: 1.04, color: theme.n100 }} />
      </div>
      <Card3D progress={progress} at={0.2} clock={localTime} seed={19} theme={theme} style={{ position: 'absolute', left: 80, right: 80, top: 660, height: 760 }}>
        <div style={{ padding: '40px 40px 0' }}>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 24, letterSpacing: '0.16em', textTransform: 'uppercase', color: theme.a700 }}>{s.cardKicker || 'WEEKLY DIGEST'}</div>
          <div style={{ marginTop: 12, fontFamily: DISP, fontSize: 54, lineHeight: 1.05, color: theme.text }}>{s.cardTitle || 'Quiet week. Good week.'}</div>
          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: seg(progress, 0.36 + i * 0.09, 0.46 + i * 0.09, quartOut), transform: `translateX(${((1 - seg(progress, 0.36 + i * 0.09, 0.5 + i * 0.09, quartOut)) * 30).toFixed(1)}px)` }}>
                <Check progress={progress} at={0.4 + i * 0.09} theme={theme} size={40} />
                <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 32, color: theme.text }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 40, right: 40, bottom: 40 }}>
          <PressButton progress={progress} at={0.8} label={s.cardCta || 'Send to team'} theme={theme} full />
        </div>
      </Card3D>
      <Cursor progress={progress} from={[240, 1780]} to={[540, 1330]} at={0.62} travel={0.14} clickAt={0.8} theme={theme} />
    </Frame>
  );
}

function Hero({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const pulse = usePulse(localTime, 3.2, 1.2);
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 420 }}>
        <div style={{ opacity: seg(progress, 0.02, 0.12, quartOut), fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: '0.24em', textTransform: 'uppercase', color: theme.a700, marginBottom: 34 }}>{s.eyebrow || 'INTRODUCING'}</div>
        <CharReveal progress={progress} at={0.06} per={0.012} text={s.brand || theme.brand} style={{ fontFamily: DISP, fontSize: 168, lineHeight: 0.98, color: theme.text, letterSpacing: '-0.02em' }} />
        <div style={{ marginTop: 30 }}>
          <WordStaggerBlur progress={progress} at={0.32} text={s.body || 'The calm operating rhythm for teams that ship.'} dirIndex={0} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, lineHeight: 1.3, color: rgba(theme.text, 0.78), maxWidth: 880 }} />
        </div>
        <div style={{ marginTop: 40, opacity: seg(progress, 0.6, 0.72, quartOut), fontFamily: DISP, fontSize: 54, color: theme.accent, ...pulse }}>{s.keyword || 'One rhythm.'}</div>
      </div>
      <Card3D progress={progress} at={0.34} clock={localTime} seed={0} theme={theme} style={{ position: 'absolute', left: 96, right: 96, top: 1180, height: 500 }}>
        <BrowserChrome theme={theme} url={s.url} />
        <div style={{ position: 'absolute', top: 52, left: 0, right: 0, bottom: 0 }}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></div>
      </Card3D>
    </Frame>
  );
}

function Statement({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const words = (s.words || 'STOP|CHASING|STATUS').split('|');
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {words.map((w, i) => <OutlineFill key={i} progress={progress} at={0.05 + i * 0.14} dur={0.3} text={w} size={168} theme={theme} fill={i === 1 ? theme.accent2 : theme.accent} />)}
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 1220 }}>
        <WordStaggerBlur progress={progress} at={0.56} text={s.body || 'Updates write themselves. Nobody has to ask twice.'} dirIndex={1} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 38, lineHeight: 1.3, color: rgba(theme.text, 0.76), maxWidth: 880 }} />
      </div>
    </Frame>
  );
}

function Onboard({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const steps = s.steps || ['Pick your team', 'Connect your tools', 'Set the rhythm'];
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} text={s.headline || 'Set up in three moves.'} dirIndex={2} style={{ fontFamily: DISP, fontSize: 96, lineHeight: 1.02, color: theme.text }} />
      </div>
      {/* card stack — the two behind sit left, smaller, blurred */}
      <Card3D progress={progress} at={0.1} clock={localTime} seed={3} theme={theme} stack={2} style={{ position: 'absolute', left: 130, right: 130, top: 520, height: 900 }} />
      <Card3D progress={progress} at={0.16} clock={localTime} seed={2} theme={theme} stack={1} style={{ position: 'absolute', left: 118, right: 118, top: 500, height: 920 }} />
      <Card3D progress={progress} at={0.22} clock={localTime} seed={1} theme={theme} style={{ position: 'absolute', left: 104, right: 104, top: 480, height: 940 }}>
        <div style={{ padding: '46px 44px' }}>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.a700 }}>{s.cardKicker || 'GET STARTED'}</div>
          <div style={{ marginTop: 14, fontFamily: DISP, fontSize: 62, lineHeight: 1.04, color: theme.text }}>{s.cardTitle || 'Your workspace'}</div>
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 30 }}>
            {steps.map((st, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, opacity: seg(progress, 0.34 + i * 0.08, 0.42 + i * 0.08, quartOut), transform: `translateX(${((1 - seg(progress, 0.34 + i * 0.08, 0.46 + i * 0.08, quartOut)) * 34).toFixed(1)}px)` }}>
                <Check progress={progress} at={0.4 + i * 0.09} theme={theme} />
                <span style={{ flex: 1, fontFamily: BODY, fontWeight: 800, fontSize: 34, color: theme.text }}>{st}</span>
                <Toggle progress={progress} at={0.44 + i * 0.09} theme={theme} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 46 }}><Progress progress={progress} at={0.62} frac={1} theme={theme} label={s.progressLabel || 'Setup complete'} /></div>
          <div style={{ marginTop: 44 }}><PressButton progress={progress} at={0.82} label={s.cardCta || 'Start working'} theme={theme} full /></div>
        </div>
      </Card3D>
      <Cursor progress={progress} from={[900, 1700]} to={[540, 1290]} at={0.66} travel={0.14} clickAt={0.82} theme={theme} />
      <Cursor progress={progress} from={[200, 700]} to={[790, 760]} at={0.3} travel={0.12} clickAt={0.44} theme={theme} />
    </Frame>
  );
}

function Morph({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} scene={s} bg={theme.n900} dark tint={theme.a400}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 600 }}>
        <div style={{ opacity: seg(progress, 0.02, 0.12, quartOut), fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: '0.22em', textTransform: 'uppercase', color: theme.a400, marginBottom: 30 }}>{s.eyebrow || 'EVERY HAND-OFF, TRACKED'}</div>
        {/* only the changing word animates — the frame holds perfectly still */}
        <div style={{ fontFamily: DISP, fontSize: 120, lineHeight: 1.06, color: theme.n100 }}>{s.prefix || 'Status:'}</div>
        <MorphWord progress={progress} at={0.14} span={0.66} words={s.states || ['Drafting', 'In review', 'Approved', 'Shipped']} theme={theme} size={140} fill={theme.a400} />
        <div style={{ marginTop: 44 }}>
          <WordStaggerBlur progress={progress} at={0.72} text={s.body || 'No standup required. The board keeps its own minutes.'} dirIndex={3} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 36, lineHeight: 1.3, color: rgba(theme.n100, 0.76), maxWidth: 880 }} />
        </div>
      </div>
    </Frame>
  );
}

function Live({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 190 }}>
        <WordStaggerBlur progress={progress} at={0.03} text={s.headline || 'It moves while you watch.'} dirIndex={1} style={{ fontFamily: DISP, fontSize: 92, lineHeight: 1.04, color: theme.text }} />
      </div>
      <Card3D progress={progress} at={0.14} clock={localTime} seed={4} theme={theme} style={{ position: 'absolute', left: 88, right: 88, top: 470, height: 700 }}>
        <BrowserChrome theme={theme} url={s.url} />
        <div style={{ position: 'absolute', top: 52, left: 0, right: 0, bottom: 0 }}>
          <ScrollList progress={progress} at={0.3} clock={localTime} rows={new Array(9).fill(0)} theme={theme} />
        </div>
      </Card3D>
      <Cursor progress={progress} from={[180, 1320]} to={[720, 900]} at={0.5} travel={0.16} clickAt={0.7} theme={theme} />
      <Cursor progress={progress} from={[860, 620]} to={[300, 780]} at={0.22} travel={0.12} clickAt={0.36} theme={theme} />
      <div style={{ position: 'absolute', left: 88, right: 88, top: 1260, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {(s.bars || [['Focus time', 0.86], ['Handoffs closed', 0.94]]).map((b, i) => <Progress key={i} progress={progress} at={0.56 + i * 0.1} frac={b[1]} theme={theme} label={b[0]} />)}
      </div>
    </Frame>
  );
}

function Showcase({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 180 }}>
        <WordStaggerBlur progress={progress} at={0.03} text={s.headline || 'Every surface, one rhythm.'} dirIndex={0} style={{ fontFamily: DISP, fontSize: 88, lineHeight: 1.04, color: theme.text }} />
      </div>
      {[0, 1].map(i => (
        <React.Fragment key={i}>
          <div style={{ position: 'absolute', left: 64, top: 470 + i * 660, opacity: seg(progress, 0.12 + i * 0.16, 0.22 + i * 0.16, quartOut), fontFamily: BODY, fontWeight: 800, fontSize: 24, letterSpacing: '0.16em', textTransform: 'uppercase', color: theme.a700 }}>{(s.caps || ['THE BOARD', 'THE DIGEST'])[i]}</div>
          <Card3D progress={progress} at={0.14 + i * 0.16} clock={localTime} seed={i * 2 + 5} theme={theme} style={{ position: 'absolute', left: 64, right: 64, top: 520 + i * 660, height: 560 }}>
            <BrowserChrome theme={theme} url={s.url} />
            <div style={{ position: 'absolute', top: 52, left: 0, right: 0, bottom: 0 }}><MediaSlot src={s['shot' + (i + 1)]} kind="desktop" label={`DESKTOP SCREENSHOT ${i + 1} — 16:9`} theme={theme} /></div>
          </Card3D>
        </React.Fragment>
      ))}
      <Cursor progress={progress} from={[160, 1780]} to={[700, 780]} at={0.34} travel={0.14} clickAt={0.5} theme={theme} />
      <Cursor progress={progress} from={[700, 780]} to={[420, 1440]} at={0.62} travel={0.14} clickAt={0.78} theme={theme} />
    </Frame>
  );
}

function Proof({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const stats = s.stats || [{ v: 6, suf: 'h', l: 'saved each week' }, { v: 92, suf: '%', l: 'still active at 90 days' }, { v: 4.9, suf: '', l: 'average team rating' }];
  return (
    <Frame progress={progress} index={index} count={count} scene={s} bg={theme.n900} dark tint={theme.s400}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 260 }}>
        <WordStaggerBlur progress={progress} at={0.03} text={s.headline || 'The numbers settle it.'} dirIndex={2} style={{ fontFamily: DISP, fontSize: 96, lineHeight: 1.04, color: theme.n100 }} />
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 620, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {stats.map((st, i) => (
          <Card3D key={i} progress={progress} at={0.14 + i * 0.11} clock={localTime} seed={i + 7} theme={theme} style={{ height: 250 }}>
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 46px' }}>
              <div style={{ fontFamily: DISP, fontSize: 132, lineHeight: 0.9, color: theme.a700 }}><Counter progress={progress} at={0.2 + i * 0.11} value={st.v} suffix={st.suf} color={theme.a700} /></div>
              <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 30, lineHeight: 1.2, color: rgba(theme.text, 0.72), textAlign: 'right', maxWidth: 320 }}>{st.l}</div>
            </div>
          </Card3D>
        ))}
      </div>
    </Frame>
  );
}

function Close({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const pulse = usePulse(localTime, 3.6, 0.4);
  return (
    <Frame progress={progress} index={index} count={count} scene={s}>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 520, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Card3D progress={progress} at={0.06} clock={localTime} seed={9} theme={theme} radius={999} style={{ width: 190, height: 190, marginBottom: 46 }}>
          <div style={{ width: '100%', height: '100%', padding: 30 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        </Card3D>
        <CharReveal progress={progress} at={0.14} per={0.014} text={s.headline || 'Find your cadence.'} style={{ fontFamily: DISP, fontSize: 118, lineHeight: 1.04, color: theme.text, justifyContent: 'center', textAlign: 'center' }} />
        <div style={{ marginTop: 26, textAlign: 'center' }}>
          <WordStaggerBlur progress={progress} at={0.42} text={s.body || 'Free for your first ten people.'} dirIndex={0} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 36, lineHeight: 1.3, color: rgba(theme.text, 0.76), justifyContent: 'center' }} />
        </div>
        <div style={{ marginTop: 50, width: '100%' }}>
          <PressButton progress={progress} at={0.68} label={s.cta || 'Start free'} theme={theme} full />
        </div>
        <div style={{ marginTop: 26, fontFamily: BODY, fontWeight: 800, fontSize: 30, color: rgba(theme.text, 0.6), ...pulse }}>{s.url || theme.url}</div>
      </div>
      <Cursor progress={progress} from={[880, 1720]} to={[540, 1352]} at={0.54} travel={0.12} clickAt={0.68} theme={theme} />
    </Frame>
  );
}

const MAP = { Hero, Statement, Search, Onboard, Connect, Board, Morph, Live, Notify, Thread, Digest, Showcase, Metric, Voice, Plans, Proof, Close };

function CadenceFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = { ...T, accent: t.accent || T.accent, accent2: t.accent2 || T.accent2, brand: (t.brandName || 'CADENCE').toUpperCase(), url: t.url || 'cadence.work' };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.bg} transition="cut">{MAP}</window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#c67139', '#b2622d', '#8c491a', '#7a8a5e']} onChange={v => setTweak('accent', v)} />
        <TweakColor label="Second accent" value={t.accent2} options={['#7a8a5e', '#56633f', '#aebf92', '#c67139']} onChange={v => setTweak('accent2', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.CadenceFilm = CadenceFilm;
