/* stomp-film.jsx — "TEAMPULSE" vertical 9:16 kinetic-TYPOGRAPHY office advertisement.
   Typography-led: giant Caprasimo word slams, letter cascades, scrolling type tickers.
   Animated office people (typing, walking, calling, waving, presenting), desks, chairs,
   plants and steaming coffee. Screenshots ride FULL-WIDTH 16:9 desktop cards with
   mask-reveal + sheen sweep + drift. No beat/pulse system.
   Organic design system tokens: cream/sand ground, terracotta + sage accents, Caprasimo
   over Figtree, pill radii, 16px containers, the .washed photo class. 1080×1920.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Organic tokens (hex mirrors of styles.css :root, needed for JS colour math) ──
const T = {
  bg: '#f5ead8', surface: '#ebddc5', text: '#201e1d',
  accent: '#c67139', accent2: '#7a8a5e',
  n100: '#f9f4ed', n200: '#eee7db', n300: '#dcd3c4', n400: '#c0b6a5', n700: '#645c50', n900: '#2e2b25',
  a200: '#ffe1d0', a300: '#ffc6a5', a400: '#f6a06b', a600: '#b2622d', a700: '#8c491a', a900: '#402310',
  s200: '#e1eecc', s300: '#ccdbb2', s400: '#aebf92', s600: '#728157', s700: '#56633f', s900: '#272e1b',
};
const ThemeContext = React.createContext({ ...T, brand: 'TEAMPULSE', url: 'teampulse.work' });
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Caprasimo', system-ui, sans-serif";
const BODY = "'Figtree', system-ui, sans-serif";

const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
// Pick whichever ink actually reads best on the given background (contrast ratio,
// not a fixed luminance cut) — a300/a400/s400 fills sit near the old 0.5 threshold.
function inkOn(bg) {
  const L = lum(bg);
  const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return cr(L, lum(T.text)) >= cr(L, lum(T.n100)) ? T.text : T.n100;
}
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));
const M = {
  rise: (p, a = 0, d = 0.16, dist = 40) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.08), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.24, from = 0.35) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.06, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  slam: (p, a = 0, d = 0.2, from = 2.1) => { const s = seg(p, a, a + d, E.easeOutExpo); return { opacity: seg(p, a, a + 0.04, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.4, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};

// ── Per-scene hard cuts — 14 distinct moves, no two neighbours alike ────────
const CUTS = ['slam', 'diag', 'flipL', 'spin', 'punch', 'wipeUp', 'flipR', 'squash', 'drop', 'roll', 'zoomBlur', 'stretch', 'flipL', 'spin'];
function scam(kind, progress, depth = 1, isLast = false) {
  const IN = 0.11, OUT = 0.9;
  let x = 0, y = 0, s = 1 + 0.026 * E.easeInOutSine(progress) * depth, sy = 1, rot = 0, op = 1, blur = 0;
  const dir = /flipR|drop|roll/.test(kind) ? -1 : 1;
  x += dir * (22 - 44 * E.easeInOutSine(progress)) * depth;
  y += Math.sin(progress * Math.PI) * -12 * depth;
  if (progress < IN) {
    const t = seg(progress, 0, IN, E.easeOutExpo); op = seg(progress, 0, IN * 0.4, E.easeOutQuad);
    if (kind === 'slam') { s *= lerp(1.26, 1, t); blur += (1 - t) * 18; }
    else if (kind === 'punch') { s *= lerp(0.62, 1, t); blur += (1 - t) * 14; }
    else if (kind === 'flipL') { x += -(1 - t) * 700; rot += (1 - t) * -6; blur += (1 - t) * 20; }
    else if (kind === 'flipR') { x += (1 - t) * 700; rot += (1 - t) * 6; blur += (1 - t) * 20; }
    else if (kind === 'diag') { x += (1 - t) * 560; y += (1 - t) * 420; blur += (1 - t) * 18; }
    else if (kind === 'spin') { rot += (1 - t) * -14; s *= lerp(0.7, 1, t); blur += (1 - t) * 16; }
    else if (kind === 'wipeUp') { y += (1 - t) * 620; sy = lerp(1.14, 1, t); blur += (1 - t) * 14; }
    else if (kind === 'squash') { sy = lerp(0.5, 1, t); s *= lerp(1.3, 1, t); blur += (1 - t) * 12; }
    else if (kind === 'roll') { x += -(1 - t) * 640; rot += (1 - t) * 16; blur += (1 - t) * 22; }
    else if (kind === 'zoomBlur') { s *= lerp(1.8, 1, t); blur += (1 - t) * 34; }
    else if (kind === 'stretch') { sy = lerp(1.7, 1, t); s *= lerp(0.72, 1, t); blur += (1 - t) * 14; }
    else { y += -(1 - t) * 500; blur += (1 - t) * 16; }
  }
  if (progress > OUT && !isLast) {
    const t = seg(progress, OUT, 1, E.easeInExpo); op = 1 - seg(progress, OUT + 0.03, 1, E.easeInQuad);
    if (kind === 'slam') { s *= lerp(1, 0.8, t); blur += t * 18; }
    else if (kind === 'punch') { s *= lerp(1, 1.3, t); blur += t * 16; }
    else if (kind === 'flipL') { x += t * 700; rot += t * 6; blur += t * 20; }
    else if (kind === 'flipR') { x += -t * 700; rot += t * -6; blur += t * 20; }
    else if (kind === 'diag') { x += -t * 520; y += -t * 400; blur += t * 18; }
    else if (kind === 'spin') { rot += t * 12; s *= lerp(1, 0.72, t); blur += t * 16; }
    else if (kind === 'wipeUp') { y += -t * 560; sy = lerp(1, 1.12, t); blur += t * 14; }
    else if (kind === 'squash') { sy = lerp(1, 0.55, t); blur += t * 12; }
    else if (kind === 'roll') { x += t * 620; rot += t * -16; blur += t * 22; }
    else if (kind === 'zoomBlur') { s *= lerp(1, 1.7, t); blur += t * 32; }
    else if (kind === 'stretch') { sy = lerp(1, 1.6, t); blur += t * 14; }
    else { y += t * 460; blur += t * 16; }
  }
  return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(4)}, ${(s * sy).toFixed(4)})`, filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none', opacity: op, transformOrigin: 'center center', willChange: 'transform, filter, opacity' };
}

// ═══════════════════════════ ANIMATED OFFICE PEOPLE ═════════════════════════
function Svg({ children, style, w = 1080, h = 1920 }) {
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}>{children}</svg>;
}
// One office worker. variant: type | walk | call | wave | present | sit
function Worker({ x, y, s = 1, clock, ph = 0, variant = 'type', shirt, hair, skin = '#e8b98e', flip = false, ink }) {
  const t = clock + ph;
  const tap = Math.sin(t * 9), bob = Math.sin(t * 2.4) * 3, step = Math.sin(t * 5), swing = Math.sin(t * 5 + Math.PI);
  const waveA = Math.sin(t * 5) * 26;
  const dark = ink || '#2e2b25';
  const arm = (x1, y1, x2, y2) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={shirt} strokeWidth="13" strokeLinecap="round" />;
  return (
    <g transform={`translate(${x} ${y}) scale(${(flip ? -s : s)} ${s})`}>
      {/* legs */}
      {variant === 'walk' ? (
        <g stroke={dark} strokeWidth="14" strokeLinecap="round">
          <line x1="-4" y1="-2" x2={-4 + step * 18} y2={38} />
          <line x1="6" y1="-2" x2={6 - step * 18} y2={38} />
        </g>
      ) : variant === 'type' || variant === 'sit' ? (
        <g stroke={dark} strokeWidth="14" strokeLinecap="round">
          <line x1="-6" y1="-4" x2="26" y2="4" /><line x1="26" y1="4" x2="26" y2="40" />
          <line x1="6" y1="-4" x2="36" y2="6" /><line x1="36" y1="6" x2="36" y2="40" />
        </g>
      ) : (
        <g stroke={dark} strokeWidth="14" strokeLinecap="round"><line x1="-6" y1="-2" x2="-8" y2="40" /><line x1="8" y1="-2" x2="10" y2="40" /></g>
      )}
      {/* torso */}
      <g transform={`translate(0 ${bob})`}>
        <rect x="-26" y="-74" width="52" height="78" rx="24" fill={shirt} />
        {/* arms per variant */}
        {variant === 'type' && <g>{arm(-20, -50, -34 - tap * 3, -14 + tap * 4)}{arm(20, -50, 36 + tap * 3, -14 - tap * 4)}</g>}
        {variant === 'walk' && <g>{arm(-20, -52, -30 + swing * 12, -12)}{arm(20, -52, 30 + step * 12, -12)}</g>}
        {variant === 'call' && <g>{arm(20, -52, 16, -92)}{arm(-20, -50, -30, -16)}<rect x="8" y="-104" width="16" height="26" rx="6" fill={dark} /></g>}
        {variant === 'wave' && <g><g transform={`translate(20 -52) rotate(${-40 + waveA})`}>{arm(0, 0, 34, -6)}<circle cx="38" cy="-6" r="9" fill={skin} /></g>{arm(-20, -50, -30, -14)}</g>}
        {variant === 'present' && <g>{arm(20, -50, 52, -62)}<circle cx="56" cy="-64" r="9" fill={skin} />{arm(-20, -50, -28, -16)}</g>}
        {variant === 'sit' && <g>{arm(-20, -50, -32, -20)}{arm(20, -50, 34, -22)}</g>}
        {/* head */}
        <circle cx="0" cy="-96" r="25" fill={skin} />
        <path d="M-25 -104 q 6 -26 25 -26 q 20 0 25 26 q -12 -12 -25 -12 q -14 0 -25 12 z" fill={hair} />
        <circle cx="-8" cy="-94" r="3.2" fill={dark} /><circle cx="8" cy="-94" r="3.2" fill={dark} />
        <path d="M-7 -84 q 7 6 14 0" stroke={dark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}
function Desk({ x, y, w = 250, clock, theme, laptop = true, ph = 0 }) {
  const glow = 0.55 + 0.45 * Math.abs(Math.sin((clock + ph) * 1.6));
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y="0" width={w} height="14" rx="7" fill={theme.n700} />
      <rect x={-w / 2 + 14} y="14" width="12" height="56" rx="6" fill={theme.n700} />
      <rect x={w / 2 - 26} y="14" width="12" height="56" rx="6" fill={theme.n700} />
      {laptop && <g transform="translate(0 -46)"><rect x="-38" y="-2" width="76" height="48" rx="6" fill={theme.n900} /><rect x="-32" y="4" width="64" height="34" rx="3" fill={theme.a300} opacity={glow} /><rect x="-46" y="44" width="92" height="9" rx="4.5" fill={theme.n400} /></g>}
    </g>
  );
}
function Chair({ x, y, clock, theme, ph = 0 }) {
  const sw = Math.sin((clock + ph) * 0.9) * 3;
  return (
    <g transform={`translate(${x} ${y}) rotate(${sw})`}>
      <rect x="-26" y="-56" width="52" height="46" rx="14" fill={theme.s600} />
      <rect x="-30" y="-10" width="60" height="14" rx="7" fill={theme.s700} />
      <rect x="-4" y="4" width="8" height="26" rx="4" fill={theme.n700} />
      <path d="M-26 34 h52" stroke={theme.n700} strokeWidth="8" strokeLinecap="round" />
      <circle cx="-24" cy="38" r="5" fill={theme.n900} /><circle cx="24" cy="38" r="5" fill={theme.n900} />
    </g>
  );
}
function Plant({ x, y, s = 1, clock, theme, ph = 0 }) {
  const sw = Math.sin((clock + ph) * 1.2) * 4;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-22 0 h44 l-6 40 h-32 z" fill={theme.a600} />
      <g transform={`rotate(${sw})`} stroke={theme.accent2} strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M0 0 q -6 -34 -24 -46" /><path d="M0 0 q 6 -38 26 -50" /><path d="M0 0 q 2 -44 2 -60" />
      </g>
      <ellipse cx="-24" cy="-48" rx="14" ry="9" fill={theme.s600} transform={`rotate(${sw})`} />
      <ellipse cx="26" cy="-52" rx="15" ry="9" fill={theme.accent2} transform={`rotate(${sw})`} />
      <ellipse cx="2" cy="-62" rx="13" ry="9" fill={theme.s600} transform={`rotate(${sw})`} />
    </g>
  );
}
function Coffee({ x, y, s = 1, clock, theme }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 1, 2].map(i => { const t = ((clock * 0.55 + i * 0.33) % 1); return <path key={i} d={`M${-8 + i * 8} ${-14 - t * 42} q 7 -10 0 -20`} stroke={rgba(theme.n700, (1 - t) * 0.5)} strokeWidth="4" fill="none" strokeLinecap="round" />; })}
      <path d="M-14 -12 h28 l-4 28 h-20 z" fill={theme.n100} stroke={theme.text} strokeWidth="3" />
      <path d="M14 -6 q 12 4 0 14" stroke={theme.text} strokeWidth="3" fill="none" />
    </g>
  );
}
// A band of office life that scrolls sideways forever
function OfficeBand({ clock, theme, y, speed = 46, dark }) {
  const shirts = [theme.accent, theme.accent2, theme.a600, theme.s600];
  const hairs = ['#3b2a1d', '#6b4a2c', '#20201e', '#4a3427'];
  const cast = [
    { v: 'type', desk: true }, { v: 'walk', desk: false }, { v: 'call', desk: false },
    { v: 'type', desk: true }, { v: 'wave', desk: false }, { v: 'walk', desk: false },
  ];
  const span = 300, total = cast.length * span;
  const off = (clock * speed) % span;
  return (
    <g transform={`translate(0 ${y})`}>
      {cast.map((c, i) => {
        const x = i * span - off + 90;
        return (
          <g key={i}>
            {c.desk && <Desk x={x + 30} y={0} w={210} clock={clock} theme={theme} ph={i} />}
            {c.desk && <Chair x={x - 66} y={-4} clock={clock} theme={theme} ph={i * 0.7} />}
            <Worker x={x} y={c.desk ? -14 : 0} s={0.94} clock={clock} ph={i * 0.9} variant={c.v} shirt={shirts[i % shirts.length]} hair={hairs[i % hairs.length]} flip={i % 3 === 2} ink={dark ? theme.n100 : theme.n900} />
          </g>
        );
      })}
      {cast.map((c, i) => { const x = i * span - off + 90 + total; return x < 1200 ? <Worker key={'w' + i} x={x} y={0} s={0.94} clock={clock} ph={i} variant={c.v} shirt={shirts[i % shirts.length]} hair={hairs[i % hairs.length]} ink={dark ? theme.n100 : theme.n900} /> : null; })}
    </g>
  );
}

// ── Ground: hard colour blocks + soft Organic shapes ────────────────────────
function Ground({ blocks, theme, clock }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg }}>
      {(blocks || []).map((b, i) => <div key={i} style={{ position: 'absolute', left: b.l || 0, right: b.r || 0, top: b.t || 0, height: b.h, background: b.c, borderRadius: b.round ? 999 : 0 }} />)}
      <div style={{ position: 'absolute', width: 620, height: 620, borderRadius: 999, right: -220, top: 300, background: rgba(theme.accent2, 0.2), transform: `translateY(${Math.sin(clock * 0.5) * 18}px)` }} />
      <div style={{ position: 'absolute', width: 470, height: 470, borderRadius: 999, left: -170, bottom: 420, background: rgba(theme.accent, 0.16), transform: `translateY(${Math.cos(clock * 0.44) * 16}px)` }} />
    </div>
  );
}

// ── Media: .washed photo slots + FULL-WIDTH 16:9 desktop card ───────────────
function MediaSlot({ src, kind = 'shot', label, theme, round, onDark }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT — 16:9', team: 'EMPLOYEE PHOTO', office: 'OFFICE PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img className={kind === 'logo' ? undefined : 'washed'} src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  const ph = onDark ? theme.n100 : theme.text;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(ph, onDark ? 0.12 : 0.07)} 0 16px, ${rgba(ph, 0.03)} 16px 32px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: round ? 999 : 0 }}>
      <div style={{ width: 64, height: 64, borderRadius: 999, border: `3px dashed ${onDark ? theme.a400 : theme.accent}`, display: 'grid', placeItems: 'center', color: onDark ? theme.a400 : theme.accent, fontFamily: DISP, fontSize: 36 }}>+</div>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 22, letterSpacing: '0.1em', color: rgba(ph, 0.72), textTransform: 'uppercase', textAlign: 'center', padding: '0 12px' }}>{lbl}</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 15, letterSpacing: '0.12em', color: rgba(ph, 0.45) }}>DROP IMAGE</div>
    </div>
  );
}
// Landscape desktop browser card: mask-reveal, sheen sweep, continuous drift
function DeskCard({ progress, at = 0.1, theme, url, src, label, seed = 0, tilt = 0 }) {
  const clock = useClock();
  const rev = M.draw(progress, at, 0.34, E.easeInOutCubic);
  const fx = Math.sin(clock * 0.5 + seed) * 8, fy = Math.cos(clock * 0.4 + seed * 1.6) * 9;
  const rot = tilt + Math.sin(clock * 0.33 + seed) * 0.5;
  const sweep = ((clock * 0.32 + seed * 0.4) % 1.7);
  return (
    <div style={{ width: '100%', height: '100%', transform: `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${lerp(0.94, 1, rev).toFixed(3)})`, opacity: seg(progress, at, at + 0.1, E.easeOutQuad), willChange: 'transform' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: theme.n100, border: `4px solid ${theme.text}`, boxShadow: `0 16px 0 ${rgba(theme.text, 0.9)}`, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ height: 58, flexShrink: 0, background: theme.text, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px' }}>
          {[theme.accent, theme.a400, theme.accent2].map((c, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 999, background: c }} />)}
          <div style={{ marginLeft: 14, flex: 1, maxWidth: 460, height: 30, borderRadius: 999, background: rgba(theme.n100, 0.16), display: 'flex', alignItems: 'center', padding: '0 18px', fontFamily: BODY, fontWeight: 700, fontSize: 17, color: rgba(theme.n100, 0.88) }}>{url || theme.url}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', clipPath: `inset(0 ${(1 - rev) * 100}% 0 0)` }}><MediaSlot src={src} kind="desktop" label={label} theme={theme} /></div>
          {rev > 0.99 && sweep < 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${sweep * 132 - 32}%`, width: '24%', background: `linear-gradient(100deg, transparent, ${rgba('#ffffff', 0.42)}, transparent)`, transform: 'skewX(-12deg)', mixBlendMode: 'screen' }} />}
        </div>
      </div>
    </div>
  );
}
function Portrait({ progress, at, src, name, role, theme, i = 0 }) {
  const clock = useClock();
  const bob = Math.sin(clock * 1.0 + i * 1.6) * 8;
  return (
    <div style={{ ...M.pop(progress, at, 0.26, 0.4), textAlign: 'center' }}>
      <div style={{ transform: `translateY(${bob}px)` }}>
        <div style={{ width: 250, height: 250, borderRadius: 999, overflow: 'hidden', border: `5px solid ${theme.text}`, background: theme.surface, boxShadow: `0 12px 0 ${rgba(theme.text, 0.9)}` }}>
          <MediaSlot src={src} kind="team" theme={theme} round />
        </div>
        <div style={{ marginTop: 14, fontFamily: DISP, fontSize: 40, lineHeight: 1, color: theme.text }}>{name}</div>
        <div style={{ marginTop: 2, fontFamily: BODY, fontWeight: 700, fontSize: 24, color: rgba(theme.text, 0.66) }}>{role}</div>
      </div>
    </div>
  );
}
function Pill({ progress, at, text, bg, theme, size = 30 }) {
  const ink = inkOn(bg);
  return <span style={{ ...M.pop(progress, at, 0.24, 0.5), display: 'inline-flex', alignItems: 'center', gap: 10, background: bg, color: ink, border: `4px solid ${theme.text}`, borderRadius: 999, padding: size > 27 ? '12px 28px' : '11px 20px', fontFamily: DISP, fontSize: size, whiteSpace: 'nowrap', boxShadow: `0 8px 0 ${rgba(theme.text, 0.9)}` }}>{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

// ── KINETIC TYPOGRAPHY ───────────────────────────────────────────────────────
// Giant word slams, alternating boxed fills, with a breathing tracking wobble
function StompWords({ progress, at = 0.04, per = 0.1, words, theme, size = 214, cols }) {
  const clock = useClock();
  const palette = cols || [theme.text, theme.accent, theme.accent2];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {words.map((w, i) => {
        const a = at + i * per;
        const st = M.slam(progress, a, 0.18, 2.35);
        const boxed = i % 2 === 1;
        const bg = palette[i % palette.length];
        const ink = boxed ? inkOn(bg) : bg;
        const drift = Math.sin(clock * 0.7 + i * 1.2) * 4;
        return (
          <div key={i} style={{ ...st, transformOrigin: 'left center', alignSelf: 'flex-start', transform: `${st.transform} translateX(${drift.toFixed(1)}px)` }}>
            <span style={{ display: 'inline-block', fontFamily: DISP, fontSize: size, lineHeight: 0.92, letterSpacing: '-0.015em', color: ink, background: boxed ? bg : 'transparent', borderRadius: boxed ? 16 : 0, padding: boxed ? '2px 26px 12px' : '2px 0 12px' }}>{w}</span>
          </div>
        );
      })}
    </div>
  );
}
// Letters cascade up one by one (typography-video flourish)
function Cascade({ progress, at = 0.04, per = 0.018, text, theme, size = 130, color, boxEvery }) {
  const chars = String(text).split('');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
      {chars.map((c, i) => {
        const a = at + i * per;
        const o = seg(progress, a, a + 0.1, E.easeOutQuad);
        const ty = (1 - seg(progress, a, a + 0.16, E.easeOutBack)) * 46;
        const boxed = boxEvery && i % boxEvery === 0 && c !== ' ';
        return <span key={i} style={{ opacity: o, transform: `translateY(${ty.toFixed(1)}px)`, fontFamily: DISP, fontSize: size, lineHeight: 0.96, color: boxed ? inkOn(theme.accent) : (color || theme.text), background: boxed ? theme.accent : 'transparent', borderRadius: boxed ? 12 : 0, padding: boxed ? '0 8px' : 0, whiteSpace: 'pre' }}>{c}</span>;
      })}
    </div>
  );
}
function Ticker({ theme, clock, text, bg, y, speed = 150, rot = -2, size = 48 }) {
  const line = new Array(8).fill(text).join('   ★   ');
  return (
    <div style={{ position: 'absolute', left: -70, right: -70, top: y, height: 92, background: bg, borderTop: `4px solid ${theme.text}`, borderBottom: `4px solid ${theme.text}`, overflow: 'hidden', display: 'flex', alignItems: 'center', transform: `rotate(${rot}deg)` }}>
      <div style={{ whiteSpace: 'nowrap', transform: `translateX(${-((clock * speed) % 1500)}px)`, fontFamily: DISP, fontSize: size, color: inkOn(bg), letterSpacing: '0.02em' }}>{line}   {line}</div>
    </div>
  );
}

function Chrome({ theme, clock, ink }) {
  const c = ink || theme.text;
  return (
    <div style={{ position: 'absolute', top: 46, left: 46, right: 46, display: 'flex', alignItems: 'center', gap: 14, zIndex: 30 }}>
      <span style={{ width: 62, height: 62, borderRadius: 999, background: theme.accent, border: `4px solid ${c}`, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 32, color: inkOn(theme.accent), transform: `rotate(${Math.sin(clock * 0.8) * 5}deg)` }}>{theme.brand.slice(0, 1)}</span>
      <span style={{ fontFamily: DISP, fontSize: 42, color: c }}>{theme.brand}</span>
      <span style={{ marginLeft: 'auto', fontFamily: BODY, fontWeight: 800, fontSize: 25, color: rgba(c, 0.72) }}>{theme.url}</span>
    </div>
  );
}
function Frame({ progress, index, count, blocks, children, bg }) {
  const theme = useTheme();
  const clock = useClock();
  const kind = CUTS[index % CUTS.length];
  const isLast = count != null && index === count - 1;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: bg || theme.bg, fontFamily: BODY }}>
      <div style={{ position: 'absolute', inset: 0, ...scam(kind, progress, 0.4, isLast) }}><Ground blocks={blocks} theme={theme} clock={clock} /></div>
      <div style={{ position: 'absolute', inset: 0, ...scam(kind, progress, 1, isLast) }}>{children}</div>
      <Chrome theme={theme} clock={clock} ink={inkOn(bg || theme.bg)} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Hook({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 300, c: theme.accent }, { t: 1560, h: 360, c: theme.s200 }]}>
      <div style={{ position: 'absolute', left: 58, right: 58, top: 400 }}>
        <StompWords progress={progress} at={0.05} per={0.1} words={(s.words || 'WORK|SHOULD|SLAP.').split('|')} theme={theme} size={216} />
        <div style={{ ...M.rise(progress, 0.48, 0.2, 30), marginTop: 32, maxWidth: 860, fontFamily: BODY, fontWeight: 800, fontSize: 36, lineHeight: 1.3, color: rgba(theme.text, 0.8) }}>{s.body || 'The workplace app your team will actually open on a Monday morning.'}</div>
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1610} speed={40} /><Plant x={70} y={1608} s={1} clock={localTime} theme={theme} /><Plant x={1010} y={1606} s={0.9} clock={localTime} theme={theme} ph={1.4} /></Svg>
      <Ticker theme={theme} clock={localTime} text={s.ticker || 'NEW FOR TEAMS'} bg={theme.a200} y={1440} speed={175} rot={-2.5} />
    </Frame>
  );
}

function Problem({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const pains = s.pains || ['12 TABS OPEN', '40 UNREAD PINGS', 'ZERO CLARITY'];
  return (
    <Frame progress={progress} index={index} bg={theme.text} blocks={[{ t: 0, h: 1920, c: theme.text }, { t: 250, h: 210, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 250 }}>
        <div style={{ ...M.slam(progress, 0.04, 0.18, 1.9), transformOrigin: 'left center', fontFamily: DISP, fontSize: 132, lineHeight: 0.9, color: theme.n100, padding: '0 22px' }}>{splitLines(s.headline || 'MONDAY,|RIGHT NOW.')}</div>
        <div style={{ marginTop: 50, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {pains.map((p, i) => { const a = 0.24 + i * 0.1; return (
            <div key={i} style={{ ...M.slam(progress, a, 0.16, 1.8), transformOrigin: 'left center', display: 'flex', alignItems: 'center', gap: 22 }}>
              <span style={{ width: 66, height: 66, borderRadius: 999, background: theme.accent, color: theme.n100, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 34 }}>✕</span>
              <span style={{ fontFamily: DISP, fontSize: 74, color: theme.n100 }}>{p}</span>
            </div>
          ); })}
        </div>
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1250} speed={26} dark /><Coffee x={905} y={1246} s={1.5} clock={localTime} theme={theme} /></Svg>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 1340, height: 300, ...M.pop(progress, 0.56, 0.24, 0.62) }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', border: `5px solid ${theme.n100}` }}><MediaSlot src={s.office} kind="office" theme={theme} onDark /></div>
      </div>
      <Ticker theme={theme} clock={localTime} text={s.ticker || 'SOUND FAMILIAR?'} bg={theme.accent} y={1700} speed={205} rot={2} />
    </Frame>
  );
}

function Reveal({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 640, c: theme.accent }, { t: 1560, h: 360, c: theme.s200 }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 230, textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }}><Pill progress={progress} at={0.03} text={s.eyebrow || 'MEET'} bg={theme.n100} theme={theme} /></div>
        <div style={{ ...M.slam(progress, 0.1, 0.2, 2.4), marginTop: 20, fontFamily: DISP, fontSize: 136, lineHeight: 0.92, letterSpacing: '-0.02em', color: theme.n100, whiteSpace: 'nowrap' }}>{s.brand || theme.brand}</div>
        <div style={{ ...M.rise(progress, 0.28, 0.2, 26), marginTop: 12, marginLeft: 'auto', marginRight: 'auto', maxWidth: 850, fontFamily: BODY, fontWeight: 800, fontSize: 34, lineHeight: 1.28, color: theme.a900 }}>{s.body || 'One calm home for standups, tasks and every hand-off in between.'}</div>
      </div>
      {/* full-width 16:9 desktop screenshot */}
      <div style={{ position: 'absolute', left: 52, right: 52, top: 740, height: 606 }}>
        <DeskCard progress={progress} at={0.3} theme={theme} url={s.url} src={s.shot} seed={1} />
      </div>
      <Svg><Worker x={190} y={1700} s={1.15} clock={localTime} variant="present" shirt={theme.accent2} hair="#3b2a1d" /><Worker x={880} y={1700} s={1.1} clock={localTime} ph={1.5} variant="wave" shirt={theme.accent} hair="#6b4a2c" flip /><Plant x={1010} y={1696} s={0.85} clock={localTime} theme={theme} /></Svg>
      <div style={{ position: 'absolute', left: 40, right: 40, top: 1420, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {(s.tags || ['NO SETUP', 'FREE TIER', 'LOVED BY HR']).map((t, i) => <Pill key={i} progress={progress} at={0.6 + i * 0.07} text={t} bg={[theme.accent2, theme.n100, theme.a400][i % 3]} theme={theme} size={25} />)}
      </div>
    </Frame>
  );
}

function Showcase({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const caps = s.caps || ['THE BOARD', 'THE STANDUP'];
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 320, c: theme.accent2 }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 180 }}>
        <Cascade progress={progress} at={0.03} per={0.016} text={s.headline || 'EVERY SCREEN'} theme={theme} size={104} color={theme.n100} />
      </div>
      {[0, 1].map(i => (
        <div key={i} style={{ position: 'absolute', left: 52, right: 52, top: 390 + i * 700 }}>
          <div style={{ ...M.rise(progress, 0.12 + i * 0.14, 0.18, 24), display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <span style={{ width: 52, height: 52, borderRadius: 999, background: theme.text, color: theme.n100, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 26 }}>{i + 1}</span>
            <span style={{ fontFamily: DISP, fontSize: 52, color: theme.text }}>{caps[i]}</span>
          </div>
          <div style={{ height: 550 }}><DeskCard progress={progress} at={0.14 + i * 0.14} theme={theme} url={s.url} src={s['shot' + (i + 1)]} label={`DESKTOP SCREENSHOT ${i + 1} — 16:9`} seed={i * 2} tilt={i ? 0.8 : -0.8} /></div>
        </div>
      ))}
      <Svg><Worker x={120} y={1856} s={1} clock={localTime} variant="type" shirt={theme.accent} hair="#20201e" /><Desk x={150} y={1842} w={200} clock={localTime} theme={theme} /><Coffee x={980} y={1832} s={1.3} clock={localTime} theme={theme} /></Svg>
    </Frame>
  );
}

function Features({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const feats = s.feats || [{ n: '01', t: 'ONE INBOX', b: 'Every ping, one calm list.' }, { n: '02', t: 'AUTO STANDUP', b: 'Written while you sleep.' }, { n: '03', t: 'REAL HOURS', b: 'Time back, every week.' }];
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 340, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 190 }}>
        <div style={{ ...M.slam(progress, 0.03, 0.18, 1.9), transformOrigin: 'left center', fontFamily: DISP, fontSize: 118, lineHeight: 0.92, color: theme.n100 }}>{s.headline || 'THREE HITS.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, top: 400, height: 550 }}>
        <DeskCard progress={progress} at={0.12} theme={theme} url={s.url} src={s.shot} seed={2} />
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 1010, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {feats.map((f, i) => { const a = 0.34 + i * 0.11; const bg = [theme.accent, theme.n100, theme.accent2][i % 3]; const ink = inkOn(bg); return (
          <div key={i} style={{ ...M.slam(progress, a, 0.16, 1.7), transformOrigin: 'left center' }}>
            <div style={{ background: bg, border: `4px solid ${theme.text}`, borderRadius: 16, boxShadow: `0 12px 0 ${rgba(theme.text, 0.9)}`, padding: '24px 30px', display: 'flex', gap: 24, alignItems: 'center' }}>
              <span style={{ flexShrink: 0, width: 78, height: 78, borderRadius: 999, background: theme.text, color: bg, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 34 }}>{f.n}</span>
              <div>
                <div style={{ fontFamily: DISP, fontSize: 56, lineHeight: 1, color: ink }}>{f.t}</div>
                <div style={{ marginTop: 6, fontFamily: BODY, fontWeight: 800, fontSize: 28, color: rgba(ink, 0.84) }}>{f.b}</div>
              </div>
            </div>
          </div>
        ); })}
      </div>
      <Svg><Worker x={950} y={1856} s={1.05} clock={localTime} variant="call" shirt={theme.s600} hair="#4a3427" flip /><Plant x={80} y={1852} s={0.95} clock={localTime} theme={theme} /></Svg>
    </Frame>
  );
}

function Team({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const roster = s.roster || [{ n: 'ANA', r: 'Ops lead', q: 'Standups run themselves now.' }, { n: 'RAVI', r: 'Engineering', q: 'Two fewer tools, zero regrets.' }, { n: 'MEI', r: 'People team', q: 'Onboarding takes an afternoon.' }];
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 420, c: theme.a200 }, { t: 1600, h: 320, c: theme.s200 }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 180 }}>
        <div style={{ ...M.slam(progress, 0.03, 0.18, 1.9), transformOrigin: 'left center', fontFamily: DISP, fontSize: 128, lineHeight: 0.9, color: theme.text }}>{splitLines(s.headline || 'REAL|TEAMS.')}</div>
        <div style={{ ...M.rise(progress, 0.18, 0.18, 24), marginTop: 16, maxWidth: 860, fontFamily: BODY, fontWeight: 800, fontSize: 32, lineHeight: 1.28, color: rgba(theme.text, 0.78) }}>{s.body || 'From ten-person studios to whole floors — everyone lands in the same calm place.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, top: 560 }}>
        <div style={{ ...M.pop(progress, 0.24, 0.24, 0.6), background: theme.accent, border: `5px solid ${theme.text}`, borderRadius: 16, boxShadow: `0 14px 0 ${rgba(theme.text, 0.9)}`, padding: '30px 34px' }}>
          <div style={{ fontFamily: DISP, fontSize: 40, lineHeight: 0.9, color: inkOn(theme.accent), opacity: 0.5 }}>“</div>
          <div style={{ marginTop: -8, fontFamily: DISP, fontSize: 62, lineHeight: 1.02, color: inkOn(theme.accent) }}>{s.quote || 'Monday feels lighter.'}</div>
          <div style={{ marginTop: 12, fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: '0.1em', textTransform: 'uppercase', color: rgba(inkOn(theme.accent), 0.82) }}>{s.quoteBy || '— THE WHOLE FLOOR'}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 930, display: 'flex', flexDirection: 'column' }}>
        {roster.map((p, i) => { const a = 0.4 + i * 0.11; return (
          <div key={i} style={{ ...M.rise(progress, a, 0.18, 26), borderTop: `4px solid ${theme.text}`, padding: '20px 4px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
              <span style={{ fontFamily: DISP, fontSize: 90, lineHeight: 0.9, color: theme.text }}>{p.n}</span>
              <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 28, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.accent }}>{p.r}</span>
            </div>
            <div style={{ marginTop: 4, fontFamily: BODY, fontWeight: 700, fontSize: 29, lineHeight: 1.26, color: rgba(theme.text, 0.74) }}>{p.q}</div>
          </div>
        ); })}
        <div style={{ ...M.rise(progress, 0.74, 0.18, 18), borderTop: `4px solid ${theme.text}` }} />
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1640} speed={52} /><Plant x={1000} y={1636} s={0.9} clock={localTime} theme={theme} ph={0.8} /></Svg>
      <Ticker theme={theme} clock={localTime} text={s.ticker || 'HAPPIER MONDAYS'} bg={theme.accent2} y={1466} speed={165} rot={-2} />
    </Frame>
  );
}

function Numbers({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const stats = s.stats || [{ v: 6, suf: 'H', l: 'SAVED / WEEK' }, { v: 92, suf: '%', l: 'STICK WITH IT' }, { v: 4.9, suf: '★', l: 'TEAM RATING' }];
  return (
    <Frame progress={progress} index={index} bg={theme.accent} blocks={[{ t: 0, h: 1920, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 220 }}>
        <div style={{ ...M.slam(progress, 0.03, 0.18, 2), transformOrigin: 'left center', fontFamily: DISP, fontSize: 140, lineHeight: 0.9, color: theme.n100 }}>{splitLines(s.headline || 'THE|NUMBERS.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 640, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {stats.map((st, i) => { const a = 0.16 + i * 0.12; return (
          <div key={i} style={{ ...M.slam(progress, a, 0.18, 1.8), transformOrigin: 'left center' }}>
            <div style={{ background: theme.n100, border: `5px solid ${theme.text}`, borderRadius: 16, boxShadow: `0 14px 0 ${rgba(theme.text, 0.9)}`, padding: '30px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: DISP, fontSize: 162, lineHeight: 0.84, color: theme.a700 }}><Counter progress={progress} at={a + 0.04} dur={0.4} value={st.v} suffix={st.suf} color={theme.a700} /></div>
              <div style={{ fontFamily: DISP, fontSize: 36, color: theme.text, textAlign: 'right', maxWidth: 300, lineHeight: 1.08 }}>{st.l}</div>
            </div>
          </div>
        ); })}
      </div>
      <Svg><Worker x={180} y={1856} s={1.15} clock={localTime} variant="wave" shirt={theme.n100} hair="#20201e" ink={theme.n900} /><Worker x={880} y={1856} s={1.1} clock={localTime} ph={1.2} variant="walk" shirt={theme.s200} hair="#3b2a1d" flip ink={theme.n900} /></Svg>
      <Ticker theme={theme} clock={localTime} text={s.ticker || 'PROOF, NOT PROMISES'} bg={theme.n100} y={1660} speed={215} rot={1.6} />
    </Frame>
  );
}

function CTA({ progress, index, count, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} blocks={[{ t: 0, h: 300, c: theme.accent2 }, { t: 1660, h: 260, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 370, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ ...M.pop(progress, 0.06, 0.26, 0.4), width: 210, height: 210, borderRadius: 999, background: theme.n100, border: `5px solid ${theme.text}`, boxShadow: `0 14px 0 ${rgba(theme.text, 0.9)}`, overflow: 'hidden', padding: 28, marginBottom: 36 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...M.slam(progress, 0.16, 0.2, 2.2), fontFamily: DISP, fontSize: 168, lineHeight: 0.9, color: theme.text, textAlign: 'center' }}>{splitLines(s.headline || 'START|TODAY.')}</div>
        <div style={{ ...M.rise(progress, 0.38, 0.18, 24), marginTop: 18, maxWidth: 850, textAlign: 'center', fontFamily: BODY, fontWeight: 800, fontSize: 33, lineHeight: 1.28, color: rgba(theme.text, 0.8) }}>{s.body || 'Free for your first ten people. No card, no demo call, no nonsense.'}</div>
        <div style={{ ...M.pop(progress, 0.5, 0.26, 0.5), marginTop: 40, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '36px 0', borderRadius: 999, background: theme.accent, color: theme.n100, border: `5px solid ${theme.text}`, boxShadow: `0 16px 0 ${rgba(theme.text, 0.9)}`, fontFamily: DISP, fontSize: 56 }}>{s.cta || 'GET TEAMPULSE'} ➜</div>
          <div style={{ marginTop: 22, textAlign: 'center', fontFamily: BODY, fontWeight: 800, fontSize: 32, color: rgba(theme.text, 0.72) }}>{s.url || theme.url}</div>
        </div>
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1856} speed={58} /></Svg>
    </Frame>
  );
}

// ═══════════════════ NEW TEXT-EFFECT SCENES (typography-led) ════════════════
// Giant type wall — rows scroll in opposite directions, continuous
function TypeWall({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const rows = s.rows || [{ w: 'FASTER', c: theme.text, sp: 78 }, { w: 'CALMER', c: theme.accent, sp: -64 }, { w: 'CLEARER', c: theme.accent2, sp: 92 }, { w: 'TOGETHER', c: theme.text, sp: -72 }];
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 240, c: theme.accent }, { t: 1680, h: 240, c: theme.accent2 }]}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 330, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => {
          const line = new Array(6).fill(r.w).join(' • ');
          const o = seg(progress, 0.04 + i * 0.07, 0.14 + i * 0.07, E.easeOutQuad);
          return (
            <div key={i} style={{ overflow: 'hidden', height: 210, display: 'flex', alignItems: 'center', opacity: o }}>
              <div style={{ whiteSpace: 'nowrap', transform: `translateX(${-((localTime * Math.abs(r.sp)) % 1600) * (r.sp > 0 ? 1 : -1) - (r.sp > 0 ? 0 : 800)}px)`, fontFamily: DISP, fontSize: 176, lineHeight: 1, color: r.c, letterSpacing: '-0.01em' }}>{line}   {line}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1300, textAlign: 'center', ...M.pop(progress, 0.4, 0.24, 0.5) }}>
        <Pill progress={progress} at={0.4} text={s.pill || 'THAT IS THE WHOLE PITCH'} bg={theme.n100} theme={theme} size={34} />
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1720} speed={64} /></Svg>
    </Frame>
  );
}
// Outline type that fills in from the left
function Outline({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const words = (s.words || 'NO|NOISE.').split('|');
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 1920, c: theme.surface }, { t: 1560, h: 360, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 400 }}>
        {words.map((w, i) => {
          const a = 0.06 + i * 0.16;
          const fill = M.draw(progress, a, 0.34, E.easeInOutCubic);
          return (
            <div key={i} style={{ position: 'relative', height: 210, ...M.rise(progress, a - 0.04, 0.14, 30) }}>
              <div style={{ position: 'absolute', inset: 0, fontFamily: DISP, fontSize: 200, lineHeight: 1.02, color: 'transparent', WebkitTextStroke: `4px ${rgba(theme.text, 0.55)}` }}>{w}</div>
              <div style={{ position: 'absolute', inset: 0, fontFamily: DISP, fontSize: 200, lineHeight: 1.02, color: i % 2 ? theme.accent2 : theme.accent, clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}>{w}</div>
            </div>
          );
        })}
        <div style={{ ...M.rise(progress, 0.5, 0.18, 26), marginTop: 26, maxWidth: 860, fontFamily: BODY, fontWeight: 800, fontSize: 34, lineHeight: 1.28, color: rgba(theme.text, 0.8) }}>{s.body || 'Every notification earns its place, or it never reaches your team at all.'}</div>
        <div style={{ marginTop: 40, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {(s.tags || ['MUTED BY DEFAULT', 'ONE DIGEST', 'NO @HERE']).map((t, i) => <Pill key={i} progress={progress} at={0.6 + i * 0.08} text={t} bg={[theme.accent, theme.n100, theme.accent2][i % 3]} theme={theme} size={27} />)}
        </div>
        <div style={{ ...M.rise(progress, 0.78, 0.18, 22), marginTop: 44, fontFamily: DISP, fontSize: 74, lineHeight: 1, color: rgba(theme.text, 0.28) }}>{s.footer || '— AND THAT IS IT.'}</div>
      </div>
      <Svg><Worker x={200} y={1700} s={1.2} clock={localTime} variant="walk" shirt={theme.n100} hair="#3b2a1d" /><Worker x={860} y={1700} s={1.15} clock={localTime} ph={1.1} variant="call" shirt={theme.s200} hair="#4a3427" flip /></Svg>
    </Frame>
  );
}
// Typewriter with a blinking caret
function Typewriter({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const full = s.text || 'we deleted the busywork.';
  const n = Math.floor(clamp01(seg(progress, 0.06, 0.62)) * full.length);
  const caret = Math.floor(localTime * 2.6) % 2 === 0;
  return (
    <Frame progress={progress} index={index} bg={theme.text} blocks={[{ t: 0, h: 1920, c: theme.text }, { t: 240, h: 8, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 400 }}>
        <div style={{ ...M.rise(progress, 0.02, 0.14, 22), fontFamily: BODY, fontWeight: 800, fontSize: 30, letterSpacing: '0.22em', textTransform: 'uppercase', color: theme.a400, marginBottom: 26 }}>{s.eyebrow || 'ONE LINE OF CODE LATER'}</div>
        <div style={{ fontFamily: DISP, fontSize: 138, lineHeight: 1.0, color: theme.n100 }}>
          {full.slice(0, n)}<span style={{ display: 'inline-block', width: '0.5em', height: '0.86em', verticalAlign: '-0.08em', background: caret ? theme.accent : 'transparent', marginLeft: 6 }} />
        </div>
        <div style={{ ...M.rise(progress, 0.68, 0.18, 26), marginTop: 34, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {(s.tags || ['NO STATUS MEETINGS', 'NO CHASING']).map((t, i) => <Pill key={i} progress={progress} at={0.7 + i * 0.08} text={t} bg={i ? theme.n100 : theme.accent} theme={theme} size={27} />)}
        </div>
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1780} speed={30} dark /></Svg>
    </Frame>
  );
}
// Marker-highlight sweep behind each line
function Highlight({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const lines = s.lines || [{ t: 'LESS ADMIN', c: theme.a300 }, { t: 'MORE CRAFT', c: theme.s300 }, { t: 'ZERO CHAOS', c: theme.a200 }];
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 300, c: theme.accent2 }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 170 }}>
        <div style={{ ...M.slam(progress, 0.02, 0.16, 1.8), transformOrigin: 'left center', fontFamily: DISP, fontSize: 96, lineHeight: 0.94, color: theme.n100 }}>{s.headline || 'THE TRADE.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 460, display: 'flex', flexDirection: 'column', gap: 42 }}>
        {lines.map((ln, i) => {
          const a = 0.08 + i * 0.14;
          const grow = M.draw(progress, a + 0.06, 0.26, E.easeOutCubic);
          return (
            <div key={i} style={{ position: 'relative', ...M.rise(progress, a, 0.16, 34) }}>
              <div style={{ position: 'absolute', left: -10, right: 0, top: '22%', height: '62%', background: ln.c, borderRadius: 12, transform: `scaleX(${grow.toFixed(3)})`, transformOrigin: 'left center' }} />
              <div style={{ position: 'relative', fontFamily: DISP, fontSize: 128, lineHeight: 1.04, color: theme.text }}>{ln.t}</div>
            </div>
          );
        })}
      </div>
      <div style={{ ...M.rise(progress, 0.66, 0.18, 24), position: 'absolute', left: 56, right: 56, top: 1200, fontFamily: BODY, fontWeight: 800, fontSize: 34, lineHeight: 1.3, color: rgba(theme.text, 0.8) }}>{s.body || 'Same headcount, same hours — a whole lot more of the work that matters.'}</div>
      <Svg><Worker x={880} y={1740} s={1.25} clock={localTime} variant="present" shirt={theme.accent} hair="#20201e" flip /><Plant x={140} y={1736} s={1} clock={localTime} theme={theme} /></Svg>
    </Frame>
  );
}
// Words flipping up in 3D, one after another
function FlipWords({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const words = (s.words || 'SHIP|SOONER|SMILE|WIDER').split('|');
  return (
    <Frame progress={progress} index={index} blocks={[{ t: 0, h: 1920, c: theme.a200 }, { t: 0, h: 260, c: theme.accent }]}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 380, perspective: 1200 }}>
        {words.map((w, i) => {
          const a = 0.05 + i * 0.13;
          const t = seg(progress, a, a + 0.22, E.easeOutBack);
          const rx = lerp(-92, 0, t);
          const boxed = i % 2 === 1;
          const bg = boxed ? theme.text : 'transparent';
          return (
            <div key={i} style={{ opacity: seg(progress, a, a + 0.08, E.easeOutQuad), transform: `rotateX(${rx.toFixed(1)}deg)`, transformOrigin: 'center bottom', marginBottom: 10 }}>
              <span style={{ display: 'inline-block', fontFamily: DISP, fontSize: 182, lineHeight: 1.0, color: boxed ? theme.n100 : theme.text, background: bg, borderRadius: boxed ? 16 : 0, padding: boxed ? '0 24px 10px' : '0 0 10px' }}>{w}</span>
            </div>
          );
        })}
      </div>
      <Svg><OfficeBand clock={localTime} theme={theme} y={1800} speed={70} /></Svg>
    </Frame>
  );
}
// Oversized quote, word by word
function BigQuote({ progress, index, localTime, scene }) {
  const theme = useTheme(); const s = scene || {};
  const words = (s.quote || 'It is the first tool nobody complained about.').split(' ');
  return (
    <Frame progress={progress} index={index} bg={theme.accent2} blocks={[{ t: 0, h: 1920, c: theme.accent2 }]}>
      <div style={{ position: 'absolute', left: 56, top: 250, fontFamily: DISP, fontSize: 220, lineHeight: 0.6, color: rgba(inkOn(theme.accent2), 0.45) }}>“</div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 470, display: 'flex', flexWrap: 'wrap' }}>
        {words.map((w, i) => { const a = 0.05 + i * 0.045; const o = seg(progress, a, a + 0.12, E.easeOutQuad); const sc = lerp(0.7, 1, seg(progress, a, a + 0.18, E.easeOutBack)); return (
          <span key={i} style={{ opacity: o, transform: `scale(${sc.toFixed(3)})`, transformOrigin: 'left bottom', fontFamily: DISP, fontSize: 92, lineHeight: 1.14, color: inkOn(theme.accent2), marginRight: 20 }}>{w}</span>
        ); })}
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 1320, ...M.rise(progress, 0.66, 0.18, 26), display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: M.draw(progress, 0.66, 0.24) * 90, height: 6, background: inkOn(theme.accent2) }} />
        <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 30, letterSpacing: '0.1em', textTransform: 'uppercase', color: inkOn(theme.accent2) }}>{s.by || 'HEAD OF OPERATIONS'}</span>
      </div>
      <Svg><Worker x={200} y={1800} s={1.2} clock={localTime} variant="wave" shirt={theme.n100} hair="#20201e" ink={theme.n900} /><Worker x={860} y={1800} s={1.15} clock={localTime} ph={1.4} variant="type" shirt={theme.a200} hair="#3b2a1d" ink={theme.n900} /><Desk x={890} y={1786} w={210} clock={localTime} theme={theme} /></Svg>
    </Frame>
  );
}

const MAP = { Hook, TypeWall, Problem, Outline, Reveal, Typewriter, Showcase, Highlight, Features, FlipWords, Team, BigQuote, Numbers, CTA };

function StompFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = { ...T, accent: t.accent || T.accent, accent2: t.accent2 || T.accent2, brand: (t.brandName || 'TEAMPULSE').toUpperCase(), url: t.url || 'teampulse.work' };
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
window.StompFilm = StompFilm;
