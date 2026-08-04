/* fetch-film.jsx — "FETCH" playful park template: a dog runs a ball to its master.
   Mounted via <x-import> after animations-v2.jsx + tweaks-panel.jsx.
   Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS (declared in the .dc.html helmet). */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#F2683C', brand: 'FETCH', url: 'fetch.dog',
  skyTop: '#EAF7FB', sky: '#C7E7F1', grass: '#8FC15A', grassDk: '#7CAF49',
  ink: '#3A352C', paper: '#FFFDF6', sun: '#FFC24C',
  dog: '#E6A95C', dogDk: '#CE9142', nose: '#3A352C',
});
const useTheme = () => React.useContext(ThemeContext);

const DISP = "'Fredoka', system-ui, sans-serif";
const BODY = "'Nunito', system-ui, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.22, dist = 60) => { const t = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.34, from = 0.4) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg, ink) { return lum(bg) > 0.55 ? '#3A352C' : '#FFFDF6'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ── Camera (gentle push-in + playful hop transitions) ───────────────────────
function fcam(progress) {
  const IN = 0.14, OUT = 0.86;
  let sc = 1 + 0.035 * E.easeInOutSine(progress), ty = 0, op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutBack); ty += (1 - t) * 90; sc *= (0.92 + 0.08 * t); op = seg(progress, 0, IN * 0.6, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); ty += -t * 80; op = 1 - seg(progress, OUT + (1 - OUT) * 0.4, 1, E.easeInQuad); }
  return { transform: `translateY(${ty.toFixed(1)}px) scale(${sc.toFixed(4)})`, opacity: op, transformOrigin: 'center bottom', willChange: 'transform, opacity' };
}

// ═══════════════════════════ VECTOR WORLD (SVG groups) ══════════════════════
const GROUND_Y = 748;

function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}

function Sky({ theme }) {
  return (
    <g>
      <defs><linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={theme.skyTop} /><stop offset="1" stopColor={theme.sky} /></linearGradient></defs>
      <rect x="0" y="0" width="1920" height={GROUND_Y + 40} fill="url(#skyG)" />
    </g>
  );
}

function Ground({ theme }) {
  return (
    <g>
      <rect x="0" y={GROUND_Y} width="1920" height={1080 - GROUND_Y} fill={theme.grass} />
      <path d={`M0 ${GROUND_Y} Q 480 ${GROUND_Y - 26} 960 ${GROUND_Y} T 1920 ${GROUND_Y} V 1080 H 0 Z`} fill={theme.grass} />
      <rect x="0" y={GROUND_Y + 70} width="1920" height={1080} fill={theme.grassDk} opacity="0.55" />
    </g>
  );
}

function Sun({ theme, clock, x = 250, y = 210, r = 84 }) {
  const rot = clock * 8;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g transform={`rotate(${rot})`} opacity="0.9">
        {new Array(12).fill(0).map((_, i) => <rect key={i} x="-3" y={-(r + 46)} width="6" height="26" rx="3" fill={theme.sun} transform={`rotate(${i * 30})`} />)}
      </g>
      <circle r={r} fill={theme.sun} />
      <circle r={r} fill="#fff" opacity="0.18" />
    </g>
  );
}

function Cloud({ x, y, s = 1, o = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <ellipse cx="0" cy="0" rx="70" ry="42" fill="#fff" />
      <ellipse cx="60" cy="10" rx="52" ry="34" fill="#fff" />
      <ellipse cx="-58" cy="12" rx="46" ry="30" fill="#fff" />
      <rect x="-100" y="6" width="220" height="34" rx="17" fill="#fff" />
    </g>
  );
}

function Hill({ x, y, w, h, color }) {
  return <path d={`M${x - w} ${y} Q ${x} ${y - h} ${x + w} ${y} Z`} fill={color} />;
}

function Tree({ x, y, s = 1, theme }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-14" y="-90" width="28" height="100" rx="10" fill="#9B6B3F" />
      <circle cx="0" cy="-120" r="66" fill="#6FA84A" />
      <circle cx="-46" cy="-96" r="46" fill="#79B255" />
      <circle cx="46" cy="-98" r="48" fill="#79B255" />
      <circle cx="0" cy="-140" r="50" fill="#83BC5F" />
    </g>
  );
}

function Bush({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-30" cy="0" rx="34" ry="26" fill="#79B255" />
      <ellipse cx="30" cy="0" rx="36" ry="28" fill="#6FA84A" />
      <ellipse cx="0" cy="-12" rx="40" ry="32" fill="#83BC5F" />
    </g>
  );
}

function Fence({ x, y, posts = 5, gap = 66 }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke="#F3ECDB" strokeWidth="0">
      <rect x="0" y="-46" width={gap * (posts - 1) + 24} height="12" rx="6" fill="#EFE6D2" />
      <rect x="0" y="-22" width={gap * (posts - 1) + 24} height="12" rx="6" fill="#EFE6D2" />
      {new Array(posts).fill(0).map((_, i) => <rect key={i} x={i * gap} y="-64" width="16" height="72" rx="6" fill="#F7EFDD" />)}
    </g>
  );
}

function GrassTuft({ x, y, clock, i = 0, color = '#6FA84A' }) {
  const sway = Math.sin(clock * 2 + i) * 4;
  return (
    <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth="5" strokeLinecap="round" fill="none">
      <path d={`M0 0 Q ${-6 + sway} -18 ${-10 + sway} -30`} />
      <path d={`M8 0 Q ${8 + sway} -20 ${10 + sway} -34`} />
      <path d={`M-8 0 Q ${-10 + sway} -16 ${-16 + sway} -26`} />
    </g>
  );
}

// Full park backdrop (parallax via `drift`, gentle cloud motion via clock)
function Park({ theme, clock, drift = 0 }) {
  return (
    <g>
      <Sky theme={theme} />
      <Sun theme={theme} clock={clock} x={258} y={206} />
      <Cloud x={620 - drift * 0.3 % 2200} y={180} s={1} o={0.95} />
      <Cloud x={1300 - drift * 0.3 % 2200} y={130} s={1.3} o={0.9} />
      <Cloud x={1720 - drift * 0.3 % 2200} y={250} s={0.8} o={0.85} />
      <g transform={`translate(${-drift * 0.25 % 700} 0)`}>
        <Hill x={300} y={GROUND_Y} w={620} h={230} color="#A9D57F" />
        <Hill x={1100} y={GROUND_Y} w={720} h={300} color="#9ECB72" />
        <Hill x={1800} y={GROUND_Y} w={560} h={210} color="#A9D57F" />
      </g>
      <Ground theme={theme} />
      <g transform={`translate(${-drift * 0.5 % 900} 0)`} opacity="0.96">
        <Tree x={120} y={GROUND_Y + 6} s={1.05} theme={theme} />
        <Tree x={1780} y={GROUND_Y + 10} s={1.15} theme={theme} />
        <Bush x={640} y={GROUND_Y + 14} s={1} />
        <Bush x={1420} y={GROUND_Y + 16} s={1.1} />
      </g>
      <Fence x={-40 - (drift * 0.7 % 400)} y={GROUND_Y + 30} posts={34} gap={70} />
      <g>{new Array(14).fill(0).map((_, i) => <GrassTuft key={i} x={40 + i * 150 - (drift % 150)} y={GROUND_Y + 120} clock={clock} i={i} />)}</g>
    </g>
  );
}

// ── Dog — a 4-leg run cycle, ear/tail follow-through, ball carry ─────────────
// Local origin at the dog's ground contact; body drawn above (negative y).
function Dog({ x, y, scale = 1, facing = 1, phase = 0, running = true, carrying = true, theme, wag = 1 }) {
  const A = running ? 0.62 : 0;
  const bob = running ? -Math.abs(Math.sin(phase)) * 7 : 0;
  const hipY = -58, L = 60, hipB = -34, hipF = 32;
  const paw = (hx, a) => [hx + L * Math.sin(a), hipY + L * Math.cos(a)];
  const leg = (hx, a, color, key) => {
    const [px, py] = paw(hx, a);
    return <g key={key}><line x1={hx} y1={hipY} x2={px} y2={py} stroke={color} strokeWidth="12" strokeLinecap="round" /><ellipse cx={px} cy={py} rx="9" ry="5.5" fill={color} /></g>;
  };
  const tailWag = (running ? Math.sin(phase * 1.5) * 16 : Math.sin(phase * 0.6) * 22 * wag);
  const earFlop = running ? -20 - Math.sin(phase) * 16 : -14 - Math.sin(phase * 0.6) * 6;
  return (
    <g transform={`translate(${x} ${y}) scale(${facing * scale} ${scale})`}>
      {/* far legs */}
      {leg(hipB, A * Math.sin(phase + 2.6), theme.dogDk, 'bf')}
      {leg(hipF, A * Math.sin(phase + 3.14 + 2.6), theme.dogDk, 'ff')}
      {/* upper body (bobs) */}
      <g transform={`translate(0 ${bob})`}>
        {/* tail */}
        <g transform={`translate(-56 -70) rotate(${tailWag})`}>
          <path d="M0 0 Q -30 -8 -40 -40 Q -30 -20 0 -12 Z" fill={theme.dog} />
          <path d="M-34 -34 q -8 -12 -6 -22" stroke={theme.dogDk} strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
        {/* body */}
        <ellipse cx="-6" cy="-66" rx="56" ry="33" fill={theme.dog} />
        <ellipse cx="-30" cy="-58" rx="30" ry="26" fill={theme.dogDk} opacity="0.5" />
        {/* neck + head */}
        <path d="M28 -74 Q 46 -60 60 -70 L 48 -96 Q 34 -98 28 -84 Z" fill={theme.dog} />
        <circle cx="52" cy="-92" r="26" fill={theme.dog} />
        <ellipse cx="76" cy="-86" rx="20" ry="14" fill={theme.dog} />
        <ellipse cx="76" cy="-80" rx="20" ry="9" fill={theme.dogDk} opacity="0.45" />
        <circle cx="93" cy="-90" r="6" fill={theme.nose} />
        <circle cx="47" cy="-99" r="4" fill={theme.nose} />
        {/* ear */}
        <g transform={`translate(40 -104) rotate(${earFlop})`}><ellipse cx="0" cy="16" rx="11" ry="24" fill={theme.dogDk} /></g>
        {/* ball in mouth */}
        {carrying && <g transform="translate(96 -78)"><circle r="15" fill={theme.accent} /><path d="M-13 -6 Q 0 4 13 -6" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.8" /><circle cx="-5" cy="-6" r="4" fill="#fff" opacity="0.4" /></g>}
      </g>
      {/* near legs */}
      {leg(hipB, A * Math.sin(phase), theme.dog, 'bn')}
      {leg(hipF, A * Math.sin(phase + 3.14), theme.dog, 'fn')}
    </g>
  );
}

// ── Master — a friendly figure waiting with open arms; can wave / catch ──────
function Master({ x, y, scale = 1, facing = -1, armLift = 0, wave = 0, theme }) {
  const waveA = Math.sin(wave) * 22;
  return (
    <g transform={`translate(${x} ${y}) scale(${facing * scale} ${scale})`}>
      {/* legs */}
      <rect x="-26" y="-96" width="22" height="98" rx="11" fill="#3F4A5A" />
      <rect x="6" y="-96" width="22" height="98" rx="11" fill="#4A576A" />
      {/* torso */}
      <rect x="-34" y="-186" width="70" height="104" rx="30" fill={theme.accent} />
      {/* back arm (reaching) */}
      <g transform={`translate(30 -170) rotate(${-30 - armLift})`}><rect x="0" y="-9" width="78" height="20" rx="10" fill={theme.accent} /><circle cx="80" cy="0" r="12" fill="#E8B98E" /></g>
      {/* head */}
      <circle cx="2" cy="-214" r="30" fill="#E8B98E" />
      <path d="M-26 -226 Q 2 -256 30 -224 Q 20 -240 2 -242 Q -14 -242 -26 -226 Z" fill="#5A4632" />
      <circle cx="-8" cy="-214" r="3.5" fill={theme.ink} />
      <path d="M-14 -202 Q -4 -196 6 -202" stroke={theme.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* front arm (waves / catches) */}
      <g transform={`translate(-30 -170) rotate(${34 + armLift + waveA})`}><rect x="-78" y="-9" width="80" height="20" rx="10" fill={theme.accent} /><circle cx="-80" cy="0" r="12" fill="#E8B98E" /></g>
    </g>
  );
}

// ── Ball (free / bouncing / spinning) ────────────────────────────────────────
function Ball({ cx, cy, r = 22, spin = 0, theme }) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${spin})`}>
      <circle r={r} fill={theme.accent} />
      <path d={`M${-r} ${-r * 0.3} Q 0 ${r * 0.4} ${r} ${-r * 0.3}`} stroke="#fff" strokeWidth="3" fill="none" opacity="0.85" />
      <path d={`M${-r} ${r * 0.3} Q 0 ${-r * 0.4} ${r} ${r * 0.3}`} stroke="#fff" strokeWidth="3" fill="none" opacity="0.85" />
      <circle cx={-r * 0.35} cy={-r * 0.35} r={r * 0.28} fill="#fff" opacity="0.35" />
    </g>
  );
}

// ── Vector FX ────────────────────────────────────────────────────────────────
function Dust({ x, y, phase, theme }) {
  return (
    <g>{[0, 1, 2].map(i => {
      const t = ((phase * 0.5 - i * 0.5) % 3 + 3) % 3 / 3;
      const s = 0.3 + t * 1.1, o = (1 - t) * 0.5;
      return <circle key={i} cx={x - t * 90} cy={y - t * 20} r={16 * s} fill="#fff" opacity={o} />;
    })}</g>
  );
}

function MotionLines({ x, y, theme, n = 4 }) {
  return <g stroke={rgba(theme.ink, 0.28)} strokeWidth="4" strokeLinecap="round">{new Array(n).fill(0).map((_, i) => <line key={i} x1={x} y1={y - 30 + i * 20} x2={x - 40 - i * 22} y2={y - 30 + i * 20} />)}</g>;
}

function PawTrail({ progress, from, to, theme, n = 6, at = 0.1 }) {
  return <g>{new Array(n).fill(0).map((_, i) => {
    const f = i / (n - 1), on = M.draw(progress, at + f * 0.5, 0.06);
    const px = lerp(from, to, f), py = GROUND_Y + 96 + (i % 2 ? 0 : 14);
    return <g key={i} transform={`translate(${px} ${py})`} opacity={on * 0.5} fill={rgba(theme.ink, 0.5)}><ellipse cx="0" cy="0" rx="9" ry="11" /><circle cx="-8" cy="-10" r="3.5" /><circle cx="0" cy="-13" r="3.5" /><circle cx="8" cy="-10" r="3.5" /></g>;
  })}</g>;
}

function Hearts({ progress, at, cx, cy, theme }) {
  return <g>{[[-70, -10, 0], [10, -40, 1], [80, 0, 2]].map((h, i) => {
    const t = M.draw(progress, at + i * 0.12, 0.6, E.easeOutCubic);
    const o = Math.sin(t * Math.PI);
    return <g key={i} transform={`translate(${cx + h[0]} ${cy + h[1] - t * 150}) scale(${0.6 + t * 0.8})`} opacity={o}><path d="M0 6 C -16 -12 -34 2 0 26 C 34 2 16 -12 0 6 Z" fill={i === 1 ? '#F2668A' : theme.accent} /></g>;
  })}</g>;
}

function Sparkle({ x, y, clock, theme, s = 1 }) {
  const tw = 0.5 + 0.5 * Math.sin(clock * 4 + x);
  return <g transform={`translate(${x} ${y}) scale(${s * (0.7 + tw * 0.5)})`} opacity={0.5 + tw * 0.5}><path d="M0 -12 L3 -3 12 0 3 3 0 12 -3 3 -12 0 -3 -3 Z" fill={theme.sun} /></g>;
}

// ═══════════════════════════ HTML overlays ══════════════════════════════════
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.05)} 0 14px, ${rgba(theme.ink, 0.02)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, border: `2px dashed ${rgba(theme.accent, 0.8)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 28, fontWeight: 500 }}>+</div>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 15, letterSpacing: '0.12em', color: rgba(theme.ink, 0.55), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', color: rgba(theme.ink, 0.3) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}

function Chip({ progress, at, text, theme }) {
  return (
    <span style={{ ...M.pop(progress, at, 0.32, 0.5), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, background: theme.paper, boxShadow: `0 6px 0 ${rgba(theme.ink, 0.12)}`, border: `2px solid ${theme.ink}`, fontFamily: BODY, fontWeight: 800, fontSize: 16, color: theme.ink, whiteSpace: 'nowrap' }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: theme.accent }} />{text}
    </span>
  );
}

function Counter({ progress, at, dur, value, suffix = '', color }) {
  const t = M.draw(progress, at, dur, E.easeOutExpo);
  const v = value * t;
  return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>;
}

// ── Chrome: brand tag + paw-print progress ───────────────────────────────────
function PawGlyph({ size = 22, color }) {
  return <svg width={size} height={size} viewBox="-16 -16 32 32"><g fill={color}><ellipse cx="0" cy="4" rx="9" ry="10" /><circle cx="-9" cy="-6" r="4" /><circle cx="-2" cy="-11" r="4" /><circle cx="6" cy="-9" r="4" /><circle cx="11" cy="-1" r="3.5" /></g></svg>;
}

function BrandTag({ theme, label }) {
  return (
    <div style={{ position: 'absolute', top: 44, left: 56, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 10px 12px', background: theme.paper, borderRadius: 999, border: `2.5px solid ${theme.ink}`, boxShadow: `0 6px 0 ${rgba(theme.ink, 0.14)}` }}>
        <span style={{ width: 34, height: 34, borderRadius: 999, background: theme.accent, display: 'grid', placeItems: 'center' }}><PawGlyph size={20} color={theme.paper} /></span>
        <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 24, color: theme.ink, letterSpacing: '0.01em' }}>{theme.brand}</span>
      </div>
      {label && <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', color: rgba(theme.ink, 0.55) }}>{label}</span>}
    </div>
  );
}

function ProgressPaws({ clock, total, count, theme }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <div style={{ position: 'absolute', bottom: 46, left: 56, right: 56, display: 'flex', alignItems: 'center', gap: 14 }}>
      {new Array(count).fill(0).map((_, i) => {
        const on = frac >= (i + 0.5) / count;
        return <span key={i} style={{ transform: `rotate(${i % 2 ? 12 : -12}deg) scale(${on ? 1 : 0.8})`, opacity: on ? 1 : 0.28, transition: 'none' }}><PawGlyph size={26} color={on ? theme.accent : theme.ink} /></span>;
      })}
      <span style={{ marginLeft: 'auto', fontFamily: BODY, fontWeight: 800, fontSize: 15, letterSpacing: '0.14em', color: rgba(theme.ink, 0.5) }}>{theme.brand} · {theme.url}</span>
    </div>
  );
}

function FetchFrame({ progress, index, count, children, label }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null;
  const total = sc && sc.total ? sc.total : 31;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.skyTop, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...fcam(progress) }}>{children}</div>
      <BrandTag theme={theme} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════

function Title({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const ph = localTime * 7;
  // dog trots in from left and sits by ~progress 0.5
  const enter = seg(progress, 0.05, 0.5, E.easeOutCubic);
  const dogX = lerp(-260, 690, enter);
  const running = progress < 0.5;
  const titleRise = M.pop(progress, 0.35, 0.5, 0.5);
  const subRise = M.rise(progress, 0.55, 0.3, 40);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'A GOOD BOY STORY'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Sparkle x={520} y={240} clock={localTime} theme={theme} />
        <Sparkle x={1500} y={300} clock={localTime} theme={theme} s={0.8} />
        {running && <Dust x={dogX - 60} y={GROUND_Y + 84} phase={ph} theme={theme} />}
        <Dog x={dogX} y={GROUND_Y + 78} scale={1.5} phase={running ? ph : localTime} running={running} carrying={true} theme={theme} />
        <Master x={1580} y={GROUND_Y + 70} scale={1.1} wave={localTime * 4} armLift={0} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210, textAlign: 'center' }}>
        <div style={{ ...titleRise, display: 'inline-block', transformOrigin: 'center' }}>
          <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 190, lineHeight: 0.9, color: theme.ink, letterSpacing: '0.01em', textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{s.brand || theme.brand}</div>
        </div>
        <div style={{ ...subRise, marginTop: 6, fontFamily: BODY, fontWeight: 800, fontSize: 30, color: theme.accent }}>{s.tagline || 'Every good boy delivers.'}</div>
      </div>
    </FetchFrame>
  );
}

function Run({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const ph = localTime * 8.5;
  const run = seg(progress, 0.08, 0.94, E.easeInOutSine);
  const dogX = lerp(160, 1230, run);
  const drift = run * 900;
  const headRise = M.rise(progress, 0.12, 0.3, 50);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'THE FETCH'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={drift} />
        <PawTrail progress={progress} from={180} to={dogX - 70} theme={theme} at={0.1} n={7} />
        <Master x={1620} y={GROUND_Y + 70} scale={1.12} wave={localTime * 5} armLift={seg(progress, 0.6, 0.95, E.easeOutCubic) * 12} theme={theme} />
        <Dust x={dogX - 66} y={GROUND_Y + 84} phase={ph} theme={theme} />
        <MotionLines x={dogX - 96} y={GROUND_Y + 8} theme={theme} />
        <Dog x={dogX} y={GROUND_Y + 78} scale={1.62} phase={ph} running={true} carrying={true} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', ...headRise }}>
        <div style={{ display: 'inline-block', background: theme.ink, color: theme.paper, padding: '10px 30px', borderRadius: 999, fontFamily: DISP, fontWeight: 600, fontSize: 30, letterSpacing: '0.02em' }}>{s.eyebrow || 'INCOMING DELIVERY'}</div>
        <div style={{ marginTop: 14, fontFamily: DISP, fontWeight: 700, fontSize: 118, lineHeight: 0.92, color: theme.ink, textShadow: `0 7px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.headline || 'RUN, BOY,|RUN!')}</div>
      </div>
    </FetchFrame>
  );
}

function Fetch({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  // dog skids to a stop; ball drops; master catches; hearts pop
  const arrive = seg(progress, 0, 0.32, E.easeOutBack);
  const dogX = lerp(560, 720, arrive);
  const carrying = progress < 0.4;
  const ballDrop = seg(progress, 0.38, 0.62, E.easeInQuad);
  const ballX = lerp(820, 1060, seg(progress, 0.38, 0.7, E.easeOutCubic));
  const ballY = GROUND_Y - 40 - Math.sin(ballDrop * Math.PI) * 120;
  const armLift = seg(progress, 0.4, 0.7, E.easeOutBack) * 26;
  const head = M.pop(progress, 0.55, 0.5, 0.5);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'DELIVERED'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Hearts progress={progress} at={0.6} cx={1160} cy={GROUND_Y - 220} theme={theme} />
        <Sparkle x={780} y={360} clock={localTime} theme={theme} />
        <Dog x={dogX} y={GROUND_Y + 78} scale={1.55} phase={localTime * 2} running={false} carrying={carrying} wag={2.4} theme={theme} />
        {!carrying && <Ball cx={ballX} cy={ballY} r={20} spin={ballDrop * 420} theme={theme} />}
        <Master x={1230} y={GROUND_Y + 70} scale={1.2} armLift={armLift} wave={progress > 0.7 ? localTime * 6 : 0} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 170, textAlign: 'center', ...head }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 150, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{s.headline || 'GOOD BOY!'}</div>
        <div style={{ marginTop: 4, fontFamily: BODY, fontWeight: 800, fontSize: 28, color: theme.accent }}>{s.sub || 'Delivered — tail wags included.'}</div>
      </div>
    </FetchFrame>
  );
}

function Feature({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const phoneIn = seg(progress, 0.1, 0.42, E.easeOutBack);
  const chips = s.chips || ['LIVE TRACKING', 'TREAT REWARDS', 'PAW-FECT MATCH'];
  const headRise = M.rise(progress, 0.14, 0.3, 50);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'THE APP'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Dog x={470} y={GROUND_Y + 78} scale={1.35} phase={localTime * 1.6} running={false} carrying={false} wag={1.6} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 110, top: 220, width: 720, ...headRise }}>
        <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 20, letterSpacing: '0.14em', color: theme.accent, textTransform: 'uppercase', marginBottom: 12 }}>{s.eyebrow || 'IN YOUR POCKET'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 0.94, color: theme.ink }}>{splitLines(s.headline || 'Track every|fetch.')}</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 14, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.44 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 210, top: 150, width: 360, height: 740, transform: `translateY(${(1 - phoneIn) * 780}px)` }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 44, padding: 12, background: theme.ink, boxShadow: `0 30px 60px ${rgba(theme.ink, 0.3)}`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', width: 92, height: 20, borderRadius: 20, background: theme.ink, zIndex: 2 }} />
          <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: theme.paper }}><MediaSlot src={s.shot} kind="phone" theme={theme} /></div>
        </div>
      </div>
    </FetchFrame>
  );
}

function Stats({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 2, suf: 'M', l: 'BALLS FETCHED' }, { v: 98, suf: '%', l: 'HAPPY PUPS' }, { v: 4.9, suf: '★', l: 'APP RATING' }];
  const bounce = Math.abs(Math.sin(localTime * 3));
  const headRise = M.rise(progress, 0.1, 0.28, 44);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'BY THE NUMBERS'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Ball cx={1560} cy={GROUND_Y - 40 - bounce * 220} r={30} spin={localTime * 260} theme={theme} />
        <g opacity="0.5"><ellipse cx="1560" cy={GROUND_Y + 6} rx={44 - bounce * 16} ry="10" fill={rgba(theme.ink, 0.25)} /></g>
      </Scene>
      <div style={{ position: 'absolute', left: 110, top: 200, ...headRise }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, color: theme.ink }}>{splitLines(s.headline || 'Tails don\u2019t lie.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 400, display: 'flex', gap: 40 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.3 + i * 0.12, 0.4, 0.6), background: theme.paper, border: `3px solid ${theme.ink}`, borderRadius: 28, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.14)}`, padding: '30px 40px', minWidth: 300 }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 100, lineHeight: 1, color: theme.accent }}><Counter progress={progress} at={0.34 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 20, letterSpacing: '0.08em', color: theme.ink, marginTop: 6 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </FetchFrame>
  );
}

function CTA({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const dogWag = localTime * 2.4;
  const head = M.pop(progress, 0.12, 0.5, 0.5);
  const pill = M.pop(progress, 0.42, 0.4, 0.5);
  const logoPop = M.pop(progress, 0.2, 0.5, 0.4);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'GET FETCH'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Sparkle x={520} y={250} clock={localTime} theme={theme} /><Sparkle x={1440} y={300} clock={localTime} theme={theme} s={0.8} />
        <Dog x={1360} y={GROUND_Y + 78} scale={1.5} phase={dogWag} running={false} carrying={true} wag={3} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 130, top: 250, width: 1000 }}>
        <div style={{ ...logoPop, width: 150, height: 150, borderRadius: 34, background: theme.paper, border: `3px solid ${theme.ink}`, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.14)}`, overflow: 'hidden', marginBottom: 26, padding: 18 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, transformOrigin: 'left center', fontFamily: DISP, fontWeight: 700, fontSize: 130, lineHeight: 0.92, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.headline || 'Bring joy|home.')}</div>
        <div style={{ ...pill, marginTop: 40, display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 42px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), border: `3px solid ${theme.ink}`, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.22)}`, fontFamily: DISP, fontWeight: 600, fontSize: 32 }}>
            {s.cta || 'GET FETCH'} <PawGlyph size={26} color={inkOn(theme.accent)} />
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 24, color: theme.ink }}>{s.url || theme.url}</div>
        </div>
      </div>
    </FetchFrame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const SCENE_MAP = { Title, Run, Fetch, Feature, Stats, CTA };

function FetchFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const dogs = { Golden: ['#E6A95C', '#CE9142'], Choco: ['#9A6B45', '#7E5637'], Snow: ['#F3EEE4', '#D9D2C4'], Charcoal: ['#6E6A63', '#57534C'] };
  const dc = dogs[t.dogColor] || dogs.Golden;
  const theme = {
    accent: t.accent || '#F2683C',
    brand: (t.brandName || 'FETCH').toUpperCase(),
    url: t.url || 'fetch.dog',
    skyTop: '#EAF7FB', sky: '#C7E7F1', grass: '#8FC15A', grassDk: '#7CAF49',
    ink: '#3A352C', paper: '#FFFDF6', sun: '#FFC24C',
    dog: dc[0], dogDk: dc[1], nose: '#3A352C',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.skyTop} transition="cut">
          {SCENE_MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#F2683C', '#3FA9F5', '#57B894', '#F25C8A', '#8B5CF6']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="The dog" />
        <TweakRadio label="Coat" value={t.dogColor} options={['Golden', 'Choco', 'Snow', 'Charcoal']} onChange={v => setTweak('dogColor', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.FetchFilm = FetchFilm;

// Reusable visual kit so sibling templates share the exact FETCH look.
window.FetchKit = {
  ThemeContext, useTheme, DISP, BODY, GROUND_Y, E, M, seg, lerp, clamp01,
  rgba, hexToRgb, lum, inkOn, splitLines, fcam,
  Scene, Sky, Ground, Sun, Cloud, Hill, Tree, Bush, Fence, GrassTuft, Park,
  Dog, Master, Ball, Dust, MotionLines, PawTrail, Hearts, Sparkle,
  MediaSlot, Chip, Counter, PawGlyph, BrandTag, ProgressPaws, FetchFrame,
};
