/* jungle-film.jsx — "WILD" jungle template: layered rainforest with animated animals
   (toucan, swinging monkey, prowling tiger, butterflies, fireflies), swaying vines and
   light shafts; product screenshots ride wooden signboards / leaf frames.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#F4A100', brand: 'WILD', url: 'wild.eco', pop: '#FF5A5F',
  skyA: '#DFF3D0', skyB: '#B7E39A', c1: '#2E6B3E', c2: '#245A34', c3: '#173F26', c4: '#0E2C1B',
  ink: '#12301E', paper: '#FCF7E9', wood: '#8A5A2B', woodDk: '#6E4620', leaf: '#3E8E4F',
});
const useTheme = () => React.useContext(ThemeContext);
const DISP = "'Chewy', system-ui, sans-serif";
const BODY = "'Nunito', system-ui, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.22, dist = 52) => { const t = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.34, from = 0.5) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.55 ? '#12301E' : '#FCF7E9'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// Camera: gentle sway + push
function jcam(progress) {
  const IN = 0.13, OUT = 0.87;
  let sc = 1 + 0.035 * E.easeInOutSine(progress), tx = Math.sin(progress * Math.PI) * 10, op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); tx += (1 - t) * 200; op = seg(progress, 0, IN * 0.7, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); tx += -t * 180; op = 1 - seg(progress, OUT + (1 - OUT) * 0.5, 1, E.easeInQuad); }
  return { transform: `translateX(${tx.toFixed(1)}px) scale(${sc.toFixed(4)})`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' };
}

// ═══════════════════════════ JUNGLE WORLD (SVG) ═════════════════════════════
function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}
function Leaf({ x, y, s = 1, rot = 0, color }) {
  return <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}><path d="M0 0 Q 40 -34 92 0 Q 40 34 0 0 Z" fill={color} /><path d="M6 0 Q 46 0 86 0" stroke={rgba('#000000', 0.16)} strokeWidth="2.5" fill="none" /></g>;
}
function Frond({ x, y, s = 1, rot = 0, color, clock, phase = 0 }) {
  const sway = Math.sin(clock * 1.1 + phase) * 4;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot + sway}) scale(${s})`}>
      <path d="M0 0 Q 20 -110 0 -230" stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
      {new Array(9).fill(0).map((_, i) => { const t = i / 8, ly = -20 - t * 200, lx = Math.sin(t * 3) * 4; return <g key={i}><path d={`M${lx} ${ly} q -44 -14 -70 -${34 - t * 10}`} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" /><path d={`M${lx} ${ly} q 44 -14 70 -${34 - t * 10}`} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" /></g>; })}
    </g>
  );
}
function Vine({ x, topW = 1920, clock, phase, color, len = 300 }) {
  const sway = Math.sin(clock * 0.8 + phase) * 22;
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(`${x + Math.sin(t * 3 + phase) * 16 + sway * t},${t * len}`); }
  return <g><polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />{[0.4, 0.7, 1].map((t, i) => <ellipse key={i} cx={x + Math.sin(t * 3 + phase) * 16 + sway * t} cy={t * len} rx="16" ry="11" fill={color} transform={`rotate(${sway} ${x + sway * t} ${t * len})`} />)}</g>;
}
function LightShaft({ x, w, o }) {
  return <polygon points={`${x},-20 ${x + w},-20 ${x + w * 2.2},1120 ${x + w * 1.1},1120`} fill={rgba('#FFF3C0', o)} style={{ mixBlendMode: 'screen' }} />;
}

// Animals -----------------------------------------------------------------
function Toucan({ x, y, s = 1, clock, color, beak }) {
  const flap = Math.sin(clock * 5) * 22, bob = Math.sin(clock * 5) * 6;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${s})`}>
      <g transform={`rotate(${-20 + flap})`}><path d="M0 0 Q -50 -30 -96 -6 Q -54 6 0 0 Z" fill="#111" /></g>
      <ellipse cx="0" cy="6" rx="42" ry="34" fill="#111" />
      <circle cx="26" cy="-8" r="22" fill="#111" />
      <circle cx="30" cy="-12" r="7" fill="#fff" /><circle cx="32" cy="-12" r="3.5" fill="#111" />
      <path d="M40 -14 Q 104 -18 116 4 Q 96 16 44 8 Z" fill={beak || '#F4A100'} />
      <path d="M40 -14 Q 104 -18 116 4" stroke={rgba('#000',0.2)} strokeWidth="2" fill="none" />
      <path d="M-8 34 Q 12 68 34 40" fill="#F4C74A" opacity="0.9" />
    </g>
  );
}
function Monkey({ x, y, s = 1, clock, color }) {
  const swing = Math.sin(clock * 1.6) * 16;
  return (
    <g transform={`translate(${x} ${y}) rotate(${swing}) scale(${s})`} style={{ transformOrigin: 'top' }}>
      <path d={`M0 -60 Q ${10} -20 0 20`} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" />
      <circle cx="0" cy="46" r="30" fill={color} />
      <circle cx="0" cy="42" r="20" fill="#E7C9A0" />
      <circle cx="-20" cy="30" r="11" fill={color} /><circle cx="20" cy="30" r="11" fill={color} />
      <circle cx="-8" cy="40" r="3" fill="#3A2A1A" /><circle cx="8" cy="40" r="3" fill="#3A2A1A" />
      <path d="M-8 52 Q 0 58 8 52" stroke="#3A2A1A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="88" rx="24" ry="30" fill={color} />
      <path d={`M22 90 Q 70 90 ${64 + swing} 40`} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
    </g>
  );
}
function Tiger({ x, y, s = 1, facing = 1, clock, color }) {
  const step = Math.sin(clock * 4), lift = Math.max(0, Math.sin(clock * 4)) * 6;
  return (
    <g transform={`translate(${x} ${y}) scale(${facing * s} ${s})`}>
      <ellipse cx="0" cy="0" rx="90" ry="46" fill={color} />
      {[-50, -20, 20, 55].map((sx, i) => <path key={i} d={`M${sx} -40 q 0 -18 8 -30`} stroke="#7A3B12" strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.5" />)}
      <line x1="-70" y1="40" x2="-70" y2={70 - (i => (Math.sin(clock * 4) > 0 ? 8 : 0))(0)} stroke={color} strokeWidth="16" strokeLinecap="round" />
      <line x1="60" y1="40" x2="60" y2={70 - lift} stroke={color} strokeWidth="16" strokeLinecap="round" />
      <line x1="-40" y1="40" x2="-40" y2={70 - (Math.sin(clock*4)<0?8:0)} stroke={color} strokeWidth="16" strokeLinecap="round" />
      <line x1="30" y1="40" x2="30" y2="70" stroke={color} strokeWidth="16" strokeLinecap="round" />
      <circle cx="82" cy="-16" r="40" fill={color} />
      <path d="M58 -46 l10 22 l-22 -6 Z" fill={color} /><path d="M106 -46 l-10 22 l22 -6 Z" fill={color} />
      <circle cx="70" cy="-22" r="5" fill="#2A1A0E" /><circle cx="96" cy="-22" r="5" fill="#2A1A0E" />
      <path d="M78 -4 q 6 6 12 0" stroke="#2A1A0E" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M-100 ${-6 + step * 4} q -40 4 -64 -14`} stroke={color} strokeWidth="14" fill="none" strokeLinecap="round" />
    </g>
  );
}
function Butterfly({ x, y, clock, phase, color }) {
  const w = 0.5 + 0.5 * Math.abs(Math.sin(clock * 6 + phase));
  const fx = x + Math.sin(clock * 0.9 + phase) * 60, fy = y + Math.cos(clock * 1.3 + phase) * 34;
  return <g transform={`translate(${fx} ${fy})`}><g transform={`scale(${w} 1)`}><ellipse cx="-9" cy="0" rx="9" ry="13" fill={color} /><ellipse cx="9" cy="0" rx="9" ry="13" fill={color} /></g><rect x="-1.5" y="-10" width="3" height="20" rx="1.5" fill="#2A1A0E" /></g>;
}
function Firefly({ x, y, clock, i, color }) {
  const gx = x + Math.sin(clock * 0.7 + i) * 40, gy = y + Math.cos(clock * 0.9 + i) * 30, tw = 0.4 + 0.6 * (Math.sin(clock * 3 + i * 1.7) * 0.5 + 0.5);
  return <circle cx={gx} cy={gy} r={5} fill={color} opacity={tw} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />;
}

function JungleBG({ theme, clock, drift = 0 }) {
  const far = -(drift * 0.2 % 500), mid = -(drift * 0.45 % 700);
  return (
    <React.Fragment>
      <defs><linearGradient id="jgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.skyA} /><stop offset="1" stopColor={theme.skyB} /></linearGradient></defs>
      <rect x="0" y="0" width="1920" height="1080" fill="url(#jgSky)" />
      <LightShaft x={300} w={150} o={0.28} /><LightShaft x={820} w={190} o={0.22} /><LightShaft x={1380} w={160} o={0.26} />
      {/* far canopy */}
      <g transform={`translate(${far} 0)`}>{[0, 360, 720, 1080, 1440, 1800, 2160].map((bx, i) => <circle key={i} cx={bx} cy={90 + (i % 3) * 30} r={150 + (i % 3) * 30} fill={theme.c3} opacity="0.8" />)}</g>
      <rect x="0" y="0" width="1920" height="150" fill={theme.c4} />
      {/* mid trees */}
      <g transform={`translate(${mid} 0)`}>{[120, 560, 1040, 1560, 2000].map((bx, i) => <g key={i}><rect x={bx - 26} y="380" width="52" height="700" rx="16" fill={theme.c2} /><circle cx={bx} cy="360" r="130" fill={theme.c1} opacity="0.9" /></g>)}</g>
      {/* ground */}
      <path d="M0 900 Q 480 860 960 900 T 1920 900 V1080 H0 Z" fill={theme.c3} />
      <path d="M0 980 Q 480 950 960 980 T 1920 980 V1080 H0 Z" fill={theme.c4} />
      {/* hanging vines + fronds framing */}
      <Vine x={140} clock={clock} phase={0} color={theme.c2} len={360} /><Vine x={360} clock={clock} phase={1.3} color={theme.c1} len={280} />
      <Vine x={1600} clock={clock} phase={0.6} color={theme.c2} len={340} /><Vine x={1820} clock={clock} phase={2} color={theme.c1} len={300} />
      <Frond x={40} y={1080} s={1.4} rot={-12} color={theme.c1} clock={clock} phase={0} />
      <Frond x={1900} y={1080} s={1.5} rot={12} color={theme.c1} clock={clock} phase={1.2} />
      <Leaf x={70} y={210} s={1.3} rot={30} color={theme.c1} /><Leaf x={1780} y={250} s={1.4} rot={150} color={theme.c1} />
      {[[520, 470], [1500, 520], [900, 300]].map((f, i) => <Firefly key={i} x={f[0]} y={f[1]} clock={clock} i={i} color={theme.accent} />)}
      <Butterfly x={1300} y={640} clock={clock} phase={0} color={theme.pop} /><Butterfly x={640} y={700} clock={clock} phase={2.4} color={theme.accent} />
    </React.Fragment>
  );
}

// ── Product mounts (wooden signboard) ────────────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.025)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, border: `2px dashed ${rgba(theme.accent, 0.9)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 26 }}>+</div>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 14, letterSpacing: '0.1em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', color: rgba(theme.ink, 0.32) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function SignBoard({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: 20, padding: 14, background: `linear-gradient(${theme.wood}, ${theme.woodDk})`, border: `4px solid ${theme.woodDk}`, boxShadow: `0 30px 60px ${rgba('#08160E', 0.5)}` }}>
      <div style={{ position: 'absolute', top: 8, left: 16, right: 16, height: 5, borderRadius: 5, background: rgba('#FFFFFF', 0.14) }} />
      {[18, '50%', 'calc(100% - 26px)'].map((l, i) => <span key={i} style={{ position: 'absolute', top: 14, left: l, width: 10, height: 10, borderRadius: 10, background: theme.woodDk, boxShadow: `inset 0 0 3px ${rgba('#000', 0.5)}` }} />)}
      <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 44, padding: 12, background: theme.ink, boxShadow: `0 30px 60px ${rgba('#08160E', 0.5)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 90, height: 22, borderRadius: 22, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 33, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.32, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 999, background: theme.paper, border: `2px solid ${theme.ink}`, boxShadow: `0 5px 0 ${rgba(theme.ink, 0.25)}`, fontFamily: BODY, fontWeight: 800, fontSize: 16, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 8, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

// ── Chrome ───────────────────────────────────────────────────────────────────
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 40, left: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 8px 10px', background: theme.paper, borderRadius: 999, border: `3px solid ${theme.ink}`, boxShadow: `0 5px 0 ${rgba(theme.ink, 0.25)}` }}>
        <span style={{ width: 30, height: 30, borderRadius: 999, background: theme.accent, display: 'grid', placeItems: 'center', fontSize: 16 }}>🌿</span>
        <span style={{ fontFamily: DISP, fontSize: 24, color: theme.ink }}>{theme.brand}</span>
      </div>
      <div style={{ position: 'absolute', top: 48, right: 56, fontFamily: BODY, fontWeight: 800, fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', color: theme.ink }}>{label}</div>
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children, drift = 0 }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.skyB, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...jcam(progress) }}>
        <Scene><JungleBG theme={theme} clock={clock} drift={drift} /></Scene>
        {children}
      </div>
      <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Enter({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const title = M.pop(progress, 0.28, 0.46, 0.6);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'EXPEDITION'}>
      <Scene style={{ zIndex: 2 }}>
        <Monkey x={340} y={150} s={1.2} clock={localTime} color="#7A4A24" />
        <Toucan x={1520} y={330} s={1.15} clock={localTime} beak={theme.accent} />
        <Tiger x={1360} y={860} s={1.0} facing={-1} clock={localTime} color="#E7862B" />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', zIndex: 3 }}>
        <div style={{ ...title, transformOrigin: 'center', fontFamily: DISP, fontSize: 220, lineHeight: 0.9, color: theme.paper, textShadow: `0 6px 0 ${theme.ink}, 0 0 40px ${rgba('#000',0.4)}` }}>{s.brand || theme.brand}</div>
        <div style={{ ...M.rise(progress, 0.46, 0.3, 34), display: 'inline-block', marginTop: 10, fontFamily: BODY, fontWeight: 800, fontSize: 30, color: theme.ink, background: theme.accent, padding: '10px 26px', borderRadius: 999, border: `3px solid ${theme.ink}` }}>{s.tagline || 'Step into the wild side.'}</div>
      </div>
    </Frame>
  );
}

function Discover({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.12, 0.46, E.easeOutBack);
  const chips = s.chips || ['LIVE TRACKING', 'WILD-FAST', 'EASY TRAILS'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'DISCOVER'} drift={localTime * 60}>
      <Scene style={{ zIndex: 2 }}><Toucan x={900} y={150} s={0.92} clock={localTime} beak={theme.accent} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 250, width: 640, zIndex: 3, ...M.rise(progress, 0.12, 0.3, 40) }}>
        <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 20, letterSpacing: '0.14em', color: theme.paper, background: theme.leaf, display: 'inline-block', padding: '6px 16px', borderRadius: 999, textTransform: 'uppercase', marginBottom: 14 }}>{s.eyebrow || 'FIELD GUIDE'}</div>
        <div style={{ fontFamily: DISP, fontSize: 92, lineHeight: 0.98, color: theme.paper, textShadow: `0 4px 0 ${theme.ink}` }}>{splitLines(s.headline || 'Explore|the canopy.')}</div>
        <div style={{ marginTop: 20, fontFamily: BODY, fontWeight: 700, fontSize: 24, lineHeight: 1.5, color: theme.paper, maxWidth: 520, textShadow: `0 1px 3px ${rgba(theme.ink, 0.8)}` }}>{s.body || 'Every trail, mapped and moving in real time. Swing from feature to feature without ever losing the path.'}</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.5 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 120, top: 240, width: 760, height: 480, zIndex: 3, transform: `translateX(${(1 - inT) * 720}px)`, opacity: inT }}>
        <SignBoard theme={theme}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></SignBoard>
      </div>
    </Frame>
  );
}

function Trek({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.1, 0.42, E.easeOutBack);
  const chips = s.chips || ['OFFLINE MAPS', 'NIGHT MODE', 'SPECIES LOG'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'ON THE TRAIL'} drift={localTime * 40}>
      <Scene style={{ zIndex: 2 }}><Tiger x={1500} y={900} s={0.85} facing={-1} clock={localTime} color="#E7862B" /></Scene>
      <div style={{ position: 'absolute', right: 120, top: 260, width: 620, textAlign: 'right', zIndex: 3, ...M.rise(progress, 0.14, 0.3, 40) }}>
        <div style={{ fontFamily: DISP, fontSize: 88, lineHeight: 0.98, color: theme.paper, textShadow: `0 4px 0 ${theme.ink}` }}>{splitLines(s.headline || 'Take it|off-grid.')}</div>
        <div style={{ marginTop: 18, fontFamily: BODY, fontWeight: 700, fontSize: 23, lineHeight: 1.5, color: theme.paper, textShadow: `0 1px 3px ${rgba(theme.ink, 0.8)}` }}>{s.body || 'Deep in the canopy or off the map entirely, the whole jungle fits in your pocket — synced the second you find signal.'}</div>
        <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.46 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', left: 300, top: 150, width: 356, height: 740, zIndex: 3, transform: `translateY(${(1 - inT) * 800}px)`, opacity: inT }}>
        <Phone theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></Phone>
      </div>
    </Frame>
  );
}

function Sightings({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [
    { x: 150, y: 320, w: 470, h: 260, k: 'desktop' }, { x: 660, y: 290, w: 320, h: 260, k: 'phone' },
    { x: 1020, y: 320, w: 620, h: 260, k: 'desktop' }, { x: 360, y: 620, w: 500, h: 220, k: 'desktop' }, { x: 920, y: 620, w: 560, h: 220, k: 'shot' },
  ];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'SIGHTINGS'} drift={localTime * 30}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 110, textAlign: 'center', zIndex: 6, ...M.rise(progress, 0.06, 0.24, 30) }}>
        <div style={{ display: 'inline-block', fontFamily: DISP, fontSize: 68, color: theme.paper, textShadow: `0 4px 0 ${theme.ink}` }}>{s.headline || 'Spotted in the wild.'}</div>
        <div style={{ ...M.rise(progress, 0.12, 0.26, 24), maxWidth: 1000, margin: '12px auto 0', fontFamily: BODY, fontWeight: 700, fontSize: 24, lineHeight: 1.5, color: theme.paper, textShadow: `0 1px 3px ${rgba(theme.ink, 0.8)}` }}>{s.sub || 'A whole habitat of screens, caught on camera — every view your explorers meet along the way.'}</div>
      </div>
      {tiles.map((t, i) => { const at = 0.16 + i * 0.09, e = seg(progress, at, at + 0.34, E.easeOutBack); const bob = Math.sin(localTime * 0.8 + i) * 8; return (
        <div key={i} style={{ position: 'absolute', left: t.x, top: t.y + bob, width: t.w, height: t.h, zIndex: 4, opacity: e, transform: `translateY(${(1 - e) * 60}px) scale(${lerp(0.9, 1, e)})` }}>
          <SignBoard theme={theme}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></SignBoard>
        </div>
      ); })}
    </Frame>
  );
}

function Census({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 1.2, suf: 'M', l: 'EXPLORERS' }, { v: 340, suf: '+', l: 'SPECIES' }, { v: 4.9, suf: '★', l: 'TRAIL RATING' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'THE CENSUS'}>
      <Scene style={{ zIndex: 2 }}><Toucan x={1540} y={330} s={1.0} clock={localTime} beak={theme.accent} /><Monkey x={1360} y={200} s={0.8} clock={localTime} color="#7A4A24" /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 210, zIndex: 3, ...M.rise(progress, 0.08, 0.26, 36) }}>
        <div style={{ fontFamily: DISP, fontSize: 92, lineHeight: 0.94, color: theme.paper, textShadow: `0 4px 0 ${theme.ink}` }}>{splitLines(s.headline || 'The jungle|is thriving.')}</div>
        <div style={{ ...M.rise(progress, 0.2, 0.28, 26), marginTop: 16, maxWidth: 620, fontFamily: BODY, fontWeight: 700, fontSize: 24, lineHeight: 1.5, color: theme.paper, textShadow: `0 1px 3px ${rgba(theme.ink, 0.8)}` }}>{s.body || 'The numbers are wild and growing: more explorers, more species logged, more five-star trails blazed every single day.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 560, display: 'flex', gap: 30, zIndex: 3 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.34 + i * 0.12, 0.4, 0.6), background: theme.paper, border: `3px solid ${theme.ink}`, borderRadius: 22, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.3)}`, padding: '28px 42px', minWidth: 290 }}>
            <div style={{ fontFamily: DISP, fontSize: 92, lineHeight: 1, color: theme.accent }}><Counter progress={progress} at={0.38 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 18, letterSpacing: '0.08em', color: theme.ink, marginTop: 6 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Join({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.rise(progress, 0.12, 0.3, 44);
  const pill = M.pop(progress, 0.44, 0.4, 0.5);
  const logo = M.pop(progress, 0.22, 0.5, 0.5);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'JOIN US'}>
      <Scene style={{ zIndex: 2 }}><Monkey x={300} y={160} s={1.1} clock={localTime} color="#7A4A24" /><Toucan x={1540} y={300} s={1.05} clock={localTime} beak={theme.accent} /><Tiger x={1440} y={880} s={0.9} facing={-1} clock={localTime} color="#E7862B" /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 250, width: 1000, zIndex: 3 }}>
        <div style={{ ...logo, width: 130, height: 130, borderRadius: '50%', background: theme.paper, border: `4px solid ${theme.ink}`, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.3)}`, overflow: 'hidden', padding: 16, marginBottom: 24 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontSize: 140, lineHeight: 0.9, color: theme.paper, textShadow: `0 6px 0 ${theme.ink}` }}>{splitLines(s.headline || 'Join the|pack.')}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 28), marginTop: 20, maxWidth: 760, fontFamily: BODY, fontWeight: 700, fontSize: 25, lineHeight: 1.5, color: theme.paper, textShadow: `0 1px 3px ${rgba(theme.ink, 0.8)}` }}>{s.body || 'Grab your gear and start exploring today. First expedition is on us — no map-reading required.'}</div>
        <div style={{ ...pill, marginTop: 34, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 46px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), border: `3px solid ${theme.ink}`, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.35)}`, fontFamily: DISP, fontSize: 34 }}>{s.cta || 'START EXPLORING'} <span>🐾</span></div>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 22, color: theme.paper, textShadow: `0 1px 3px ${rgba(theme.ink, 0.8)}` }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Enter, Discover, Trek, Sightings, Census, Join };

function JungleFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#F4A100', pop: '#FF5A5F', brand: (t.brandName || 'WILD').toUpperCase(), url: t.url || 'wild.eco',
    skyA: '#DFF3D0', skyB: '#B7E39A', c1: '#2E6B3E', c2: '#245A34', c3: '#173F26', c4: '#0E2C1B',
    ink: '#12301E', paper: '#FCF7E9', wood: '#8A5A2B', woodDk: '#6E4620', leaf: '#3E8E4F',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.skyB} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#F4A100', '#FF5A5F', '#2FB0C6', '#E0552B', '#8B5CF6']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.JungleFilm = JungleFilm;
