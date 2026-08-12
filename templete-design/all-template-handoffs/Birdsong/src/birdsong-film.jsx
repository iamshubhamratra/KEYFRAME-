/* birdsong-film.jsx — "BIRDSONG" vertical 9:16 template. Bold flat COLOUR BLOCKS that change
   per scene, animated birds (flapping flocks, perched bobbing bird), swaying trees + falling
   leaves, stacked STORY BLOCKS and colour CARDS. Edited-video feel: continuous ambient motion
   every frame, intra-scene camera drift, and a DIFFERENT cut per scene. 1080×1920.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

const ThemeContext = React.createContext({
  brand: 'BIRDSONG', url: 'birdsong.app',
  cream: '#FDF6E9', ink: '#1E2A24',
  teal: '#0E9B8E', coral: '#FF6B4A', mustard: '#FFC231', plum: '#7A4EC6', sky: '#4FC3F7', leaf: '#3FA65B',
});
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Bricolage Grotesque', system-ui, sans-serif";
const BODY = "'Karla', system-ui, sans-serif";

const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.18, dist = 46) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.09), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.3, from = 0.4) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.08, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  slide: (p, a = 0, d = 0.28, dx = -260) => { const t = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.09, E.easeOutQuad), transform: `translateX(${(1 - t) * dx}px)` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.55 ? '#1E2A24' : '#FDF6E9'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ── A different cut per scene (content moves — never a dead opaque hold) ─────
const CUTS = ['blockwipe', 'left', 'zoom', 'flipup', 'right', 'scale', 'left'];
function cut(kind, progress) {
  const IN = 0.12, OUT = 0.9;
  let x = 0, y = 0, s = 1, rot = 0, op = 1;
  const drift = 1 + 0.03 * E.easeInOutSine(progress);
  if (progress < IN) {
    const t = seg(progress, 0, IN, E.easeOutCubic); op = seg(progress, 0, IN * 0.55, E.easeOutQuad);
    if (kind === 'left') x = (1 - t) * 900;
    else if (kind === 'right') x = -(1 - t) * 900;
    else if (kind === 'zoom') s = lerp(1.18, 1, t);
    else if (kind === 'flipup') { y = (1 - t) * 340; rot = (1 - t) * -7; }
    else if (kind === 'scale') s = lerp(0.82, 1, t);
    else y = (1 - t) * 200;
  }
  if (progress > OUT) {
    const t = seg(progress, OUT, 1, E.easeInCubic); op = 1 - seg(progress, OUT + 0.04, 1, E.easeInQuad);
    if (kind === 'left') x = -t * 900;
    else if (kind === 'right') x = t * 900;
    else if (kind === 'zoom') s = lerp(1, 1.12, t);
    else if (kind === 'flipup') { y = -t * 300; rot = t * 6; }
    else if (kind === 'scale') s = lerp(1, 0.88, t);
    else y = -t * 200;
  }
  return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(s * drift).toFixed(4)})`, opacity: op };
}
// Colour bands that sweep across on the cut (the "colour block" signature)
function BandSweep({ progress, cols }) {
  const IN = 0.13, OUT = 0.88;
  let c = null;
  if (progress < IN) c = 1 - seg(progress, 0, IN, E.easeInOutCubic);
  else if (progress > OUT) c = seg(progress, OUT, 1, E.easeInOutCubic);
  else return null;
  const N = cols.length, st = 0.07;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}>
      {cols.map((col, i) => {
        const cc = clamp01((c - i * st) / (1 - st * (N - 1)));
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 100 / N}%`, height: `${100 / N + 0.5}%`, background: col, transform: `translateX(${(1 - cc) * (i % 2 ? 105 : -105)}%)` }} />;
      })}
    </div>
  );
}

// ═══════════════════════════ BIRDS & TREES (SVG) ════════════════════════════
function Scene({ children, style }) {
  return <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}
// Flying bird — wings flap, body bobs
function FlyBird({ x, y, s = 1, clock, ph = 0, body, wing }) {
  const flap = Math.sin(clock * 7 + ph);
  const wy = flap * 30, bob = flap * 7;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${s})`}>
      <path d={`M-4 0 Q -46 ${-14 - wy} -84 ${-4 - wy * 0.7}`} stroke={wing} strokeWidth="13" fill="none" strokeLinecap="round" />
      <path d={`M4 0 Q 46 ${-14 - wy} 84 ${-4 - wy * 0.7}`} stroke={wing} strokeWidth="13" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="2" rx="30" ry="21" fill={body} />
      <circle cx="21" cy="-9" r="14" fill={body} />
      <path d="M33 -9 l19 6 -19 6 z" fill="#FFC231" />
      <circle cx="26" cy="-12" r="3.4" fill="#1E2A24" />
      <path d="M-26 8 q -22 12 -34 6" stroke={body} strokeWidth="10" fill="none" strokeLinecap="round" />
    </g>
  );
}
// Perched bird — head bob, tail flick, blink
function PerchBird({ x, y, s = 1, clock, body, wing }) {
  const bob = Math.sin(clock * 2.2) * 4, tail = Math.sin(clock * 1.6) * 8;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={`M-30 -6 q -30 ${6 + tail} -54 ${-2 + tail}`} stroke={body} strokeWidth="14" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="0" rx="38" ry="32" fill={body} />
      <ellipse cx="-6" cy="2" rx="22" ry="18" fill={wing} opacity="0.85" />
      <g transform={`translate(26 ${-26 + bob})`}>
        <circle r="21" fill={body} />
        <path d="M18 2 l22 7 -22 7 z" fill="#FFC231" />
        <circle cx="7" cy="-4" r="4.2" fill="#1E2A24" />
        <path d="M-6 -18 q 8 -12 18 -8" stroke={wing} strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
      <g stroke="#FFC231" strokeWidth="6" strokeLinecap="round"><line x1="-6" y1="30" x2="-6" y2="46" /><line x1="12" y1="30" x2="12" y2="46" /></g>
    </g>
  );
}
// Tree — chunky flat canopy, sways
function Tree({ x, y, s = 1, clock, ph = 0, canopy, canopy2, trunk }) {
  const sway = Math.sin(clock * 0.9 + ph) * 2.4;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-19" y="-190" width="38" height="200" rx="14" fill={trunk} />
      <path d="M0 -120 q -46 -18 -66 -56" stroke={trunk} strokeWidth="15" fill="none" strokeLinecap="round" />
      <path d="M0 -150 q 48 -16 70 -52" stroke={trunk} strokeWidth="15" fill="none" strokeLinecap="round" />
      <g transform={`translate(${sway * 1.6} 0)`}>
        <circle cx="0" cy="-248" r="104" fill={canopy} />
        <circle cx="-74" cy="-196" r="70" fill={canopy2} />
        <circle cx="76" cy="-200" r="76" fill={canopy2} />
        <circle cx="-20" cy="-300" r="66" fill={canopy2} />
        <circle cx="40" cy="-280" r="54" fill={canopy} />
      </g>
    </g>
  );
}
// Falling leaves — continuous, tumbling
function Leaves({ clock, cols, n = 12 }) {
  return (
    <g>{new Array(n).fill(0).map((_, i) => {
      const seed = i * 71.3, x0 = (seed % 1000) + 40;
      const t = ((clock * 0.16 + i * 0.14) % 1);
      const y = -60 + t * 2040, x = x0 + Math.sin(clock * 1.1 + i) * 70;
      const rot = clock * 90 + i * 47;
      return <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`} opacity={0.75}><path d="M0 0 Q 20 -16 44 0 Q 20 16 0 0 Z" fill={cols[i % cols.length]} /></g>;
    })}</g>
  );
}
function SunRays({ clock, x, y, color, r = 90 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g transform={`rotate(${clock * 9})`}>{new Array(12).fill(0).map((_, i) => <rect key={i} x="-5" y={-(r + 52)} width="10" height="30" rx="5" fill={color} transform={`rotate(${i * 30})`} />)}</g>
      <circle r={r} fill={color} />
    </g>
  );
}
// A drifting flock (continuous, wraps)
function Flock({ clock, y, sp, body, wing, n = 3, s = 0.5 }) {
  return <g>{new Array(n).fill(0).map((_, i) => { const x = ((clock * sp + i * 130) % (1080 + 400)) - 200; return <FlyBird key={i} x={x} y={y + (i % 2 ? 34 : 0)} s={s * (1 - (i % 3) * 0.1)} clock={clock} ph={i * 1.1} body={body} wing={wing} />; })}</g>;
}

// ── Slots / cards ────────────────────────────────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'SCREENSHOT', phone: 'APP SCREEN', product: 'PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.08)} 0 16px, ${rgba(theme.ink, 0.03)} 16px 32px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 66, height: 66, borderRadius: 20, border: `4px dashed ${theme.coral}`, display: 'grid', placeItems: 'center', color: theme.coral, fontSize: 40, fontFamily: DISP, fontWeight: 800 }}>+</div>
      <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, letterSpacing: '0.06em', color: rgba(theme.ink, 0.65) }}>{lbl}</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 16, letterSpacing: '0.1em', color: rgba(theme.ink, 0.4) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function PhoneTall({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 62, padding: 16, background: theme.ink, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.35)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)', width: 140, height: 32, borderRadius: 32, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 48, overflow: 'hidden', background: theme.cream }}>{children}</div>
    </div>
  );
}
// HORIZONTAL desktop screenshot card — the standard screenshot mount (landscape)
function DeskCard({ theme, url, children, tint }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden', background: tint || theme.cream, border: `5px solid ${theme.ink}`, boxShadow: `0 14px 0 ${theme.ink}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 62, flexShrink: 0, background: theme.ink, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px' }}>
        {[theme.coral, theme.mustard, theme.teal].map((c, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 16, background: c }} />)}
        <div style={{ marginLeft: 12, flex: 1, maxWidth: 420, height: 30, borderRadius: 15, background: rgba(theme.cream, 0.16), display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: BODY, fontWeight: 700, fontSize: 17, color: rgba(theme.cream, 0.85) }}>{url || theme.url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Caption({ progress, at, text, bg, theme }) {
  const ink = inkOn(bg);
  return <div style={{ ...M.rise(progress, at, 0.22, 20), display: 'inline-block', marginTop: 14, background: bg, color: ink, border: `4px solid ${theme.ink}`, borderRadius: 999, padding: '10px 24px', fontFamily: DISP, fontWeight: 800, fontSize: 26 }}>{text}</div>;
}
function Bullets({ progress, at, items, theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((it, i) => (
        <div key={i} style={{ ...M.slide(progress, at + i * 0.06, 0.24, -140), display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <span style={{ flexShrink: 0, marginTop: 4, width: 34, height: 34, borderRadius: 999, background: theme.ink, color: theme.mustard, display: 'grid', placeItems: 'center', fontFamily: DISP, fontWeight: 800, fontSize: 20 }}>✓</span>
          <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 28, lineHeight: 1.3, color: rgba(theme.ink, 0.86) }}>{it}</span>
        </div>
      ))}
    </div>
  );
}
function TagRow({ progress, at, tags, theme, cols }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {tags.map((t, i) => { const bg = cols[i % cols.length]; return <span key={i} style={{ ...M.pop(progress, at + i * 0.07, 0.3, 0.5), display: 'inline-flex', alignItems: 'center', gap: 8, background: bg, color: inkOn(bg), border: `4px solid ${theme.ink}`, borderRadius: 999, padding: '10px 22px', fontFamily: DISP, fontWeight: 800, fontSize: 26, whiteSpace: 'nowrap', boxShadow: `0 7px 0 ${theme.ink}` }}>{t}</span>; })}
    </div>
  );
}
function Bush({ x, y, s = 1, c1, c2 }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="-42" cy="0" rx="48" ry="36" fill={c1} /><ellipse cx="44" cy="2" rx="52" ry="38" fill={c2} /><ellipse cx="0" cy="-16" rx="56" ry="44" fill={c1} /></g>;
}
function Flower({ x, y, s = 1, clock, ph = 0, petal, center }) {
  const sway = Math.sin(clock * 1.4 + ph) * 5;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 0 q ${sway} -34 ${sway * 0.6} -66`} stroke="#3FA65B" strokeWidth="7" fill="none" strokeLinecap="round" />
      <g transform={`translate(${sway * 0.6} -66) scale(${s})`}>
        {[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-17" rx="11" ry="17" fill={petal} transform={`rotate(${a})`} />)}
        <circle r="10" fill={center} />
      </g>
    </g>
  );
}
function Cloud({ x, y, s = 1, o = 0.9, fill }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o} fill={fill}><ellipse cx="0" cy="0" rx="78" ry="34" /><ellipse cx="62" cy="12" rx="52" ry="26" /><ellipse cx="-58" cy="12" rx="46" ry="24" /><rect x="-104" y="4" width="210" height="32" rx="16" /></g>;
}
function Nest({ x, y, s = 1, clock, theme }) {
  const bob = Math.sin(clock * 1.8) * 3;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy={6 + bob} rx="64" ry="26" fill="#8B5A2B" />
      <ellipse cx="0" cy={-2 + bob} rx="58" ry="20" fill="#A06B34" />
      {[-26, 0, 26].map((ex, i) => <ellipse key={i} cx={ex} cy={-10 + bob} rx="15" ry="19" fill={theme.cream} />)}
    </g>
  );
}
// Story block — a numbered narrative card that slides in and keeps breathing
function StoryBlock({ progress, at, n, title, body, bg, theme, clock, i = 0 }) {
  const ink = inkOn(bg);
  const bob = Math.sin(clock * 0.9 + i * 1.3) * 6;
  return (
    <div style={{ ...M.slide(progress, at, 0.3, i % 2 ? 340 : -340), position: 'relative' }}>
      <div style={{ transform: `translateY(${bob}px) rotate(${i % 2 ? 1.2 : -1.2}deg)`, background: bg, borderRadius: 34, border: `5px solid ${theme.ink}`, boxShadow: `0 14px 0 ${rgba(theme.ink, 0.9)}`, padding: '30px 34px', display: 'flex', gap: 26, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0, width: 76, height: 76, borderRadius: 999, background: theme.ink, color: bg, display: 'grid', placeItems: 'center', fontFamily: DISP, fontWeight: 800, fontSize: 40 }}>{n}</div>
        <div>
          <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 46, lineHeight: 1.05, color: ink }}>{title}</div>
          <div style={{ marginTop: 8, fontFamily: BODY, fontWeight: 600, fontSize: 27, lineHeight: 1.35, color: rgba(ink, 0.85) }}>{body}</div>
        </div>
      </div>
    </div>
  );
}
function ColourCard({ progress, at, bg, emoji, title, body, theme, clock, i = 0 }) {
  const ink = inkOn(bg);
  const bob = Math.sin(clock * 1.1 + i * 1.7) * 7;
  return (
    <div style={{ ...M.pop(progress, at, 0.34, 0.4) }}>
      <div style={{ transform: `translateY(${bob}px)`, background: bg, borderRadius: 32, border: `5px solid ${theme.ink}`, boxShadow: `0 12px 0 ${rgba(theme.ink, 0.9)}`, padding: '28px 26px', height: '100%' }}>
        <div style={{ fontSize: 54, lineHeight: 1 }}>{emoji}</div>
        <div style={{ marginTop: 12, fontFamily: DISP, fontWeight: 800, fontSize: 38, lineHeight: 1.05, color: ink }}>{title}</div>
        <div style={{ marginTop: 6, fontFamily: BODY, fontWeight: 600, fontSize: 23, lineHeight: 1.3, color: rgba(ink, 0.85) }}>{body}</div>
      </div>
    </div>
  );
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

function Chrome({ theme }) {
  return (
    <div style={{ position: 'absolute', top: 46, left: 46, right: 46, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 58, height: 58, borderRadius: 999, background: theme.mustard, border: `4px solid ${theme.ink}`, display: 'grid', placeItems: 'center', fontSize: 30 }}>🐦</span>
      <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 40, color: theme.ink }}>{theme.brand}</span>
      <span style={{ marginLeft: 'auto', fontFamily: BODY, fontWeight: 700, fontSize: 25, color: rgba(theme.ink, 0.7) }}>{theme.url}</span>
    </div>
  );
}
function Frame({ progress, children, bandCols, bg }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null;
  const index = sc && sc.index != null ? sc.index : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: bg || theme.cream, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...cut(CUTS[index % CUTS.length], progress), willChange: 'transform, opacity' }}>{children}</div>
      <Chrome theme={theme} />
      <BandSweep progress={progress} cols={bandCols || [theme.teal, theme.coral, theme.mustard, theme.plum]} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Cover({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const birdX = lerp(-200, 780, seg(progress, 0.06, 0.62, E.easeOutCubic));
  return (
    <Frame progress={progress} bandCols={[theme.coral, theme.mustard, theme.teal, theme.plum]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.cream} />
        <rect x="0" y="1180" width="1080" height="740" fill={theme.teal} />
        <circle cx="880" cy="1180" r="230" fill={theme.mustard} />
        <SunRays clock={clock} x={170} y={300} color={theme.mustard} r={68} />
        <Leaves clock={clock} cols={[theme.coral, theme.mustard, theme.leaf]} n={10} />
        <Tree x={170} y={1560} s={1.15} clock={clock} ph={0} canopy={theme.leaf} canopy2="#2E8C4A" trunk="#7A4F2E" />
        <Tree x={930} y={1600} s={0.9} clock={clock} ph={1.4} canopy="#2E8C4A" canopy2={theme.leaf} trunk="#7A4F2E" />
        <Flock clock={clock} y={560} sp={70} body={theme.plum} wing={theme.coral} n={3} s={0.42} />
        <FlyBird x={birdX} y={1300} s={1.2} clock={clock} body={theme.coral} wing={theme.plum} />
      </Scene>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 440 }}>
        <div style={{ ...M.pop(progress, 0.14, 0.4, 0.5), display: 'inline-block', background: theme.coral, color: inkOn(theme.coral), border: `5px solid ${theme.ink}`, borderRadius: 999, padding: '12px 30px', fontFamily: DISP, fontWeight: 800, fontSize: 32, transform: 'rotate(-3deg)', boxShadow: `0 10px 0 ${theme.ink}` }}>{s.eyebrow || 'A LITTLE STORY'}</div>
        <div style={{ ...M.rise(progress, 0.24, 0.3, 60), marginTop: 26, fontFamily: DISP, fontWeight: 800, fontSize: 170, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'FIND|YOUR|FLOCK.')}</div>
        <div style={{ ...M.rise(progress, 0.44, 0.3, 34), marginTop: 22, maxWidth: 700, fontFamily: BODY, fontWeight: 600, fontSize: 34, lineHeight: 1.35, color: rgba(theme.ink, 0.8) }}>{s.body || 'Every big journey starts with one small bird leaving the branch.'}</div>
        <div style={{ marginTop: 26 }}><TagRow progress={progress} at={0.56} tags={s.tags || ['1M+ BIRDERS', '11K SPECIES', 'FREE']} theme={theme} cols={[theme.mustard, theme.sky, theme.plum]} /></div>
      </div>
    </Frame>
  );
}

function Story({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const blocks = s.blocks || [
    { n: '1', t: 'One branch', b: 'It starts alone — a single idea on a quiet limb.' },
    { n: '2', t: 'One song', b: 'You call out. Somewhere across the canopy, someone answers.' },
    { n: '3', t: 'One flock', b: 'Soon the whole tree is singing the same bright tune.' },
  ];
  const cols = [theme.mustard, theme.coral, theme.sky];
  return (
    <Frame progress={progress} bandCols={[theme.plum, theme.teal, theme.coral, theme.mustard]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.cream} />
        <rect x="0" y="0" width="1080" height="320" fill={theme.plum} />
        <circle cx="120" cy="320" r="150" fill={theme.teal} opacity="0.9" />
        <Leaves clock={clock} cols={[theme.coral, theme.mustard]} n={8} />
        <Flock clock={clock} y={250} sp={96} body={theme.mustard} wing={theme.cream} n={3} s={0.4} />
        <Tree x={960} y={1900} s={1.05} clock={clock} ph={0.7} canopy={theme.leaf} canopy2="#2E8C4A" trunk="#7A4F2E" />
      </Scene>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 150, ...M.rise(progress, 0.03, 0.22, 34) }}>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 92, lineHeight: 0.94, color: theme.cream }}>{s.headline || 'How it goes'}</div>
        <div style={{ marginTop: 8, fontFamily: BODY, fontWeight: 700, fontSize: 28, color: rgba(theme.cream, 0.85) }}>{s.sub || 'Three small steps, one loud chorus.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 380, display: 'flex', flexDirection: 'column', gap: 54 }}>
        {blocks.map((b, i) => <StoryBlock key={i} progress={progress} at={0.14 + i * 0.13} n={b.n} title={b.t} body={b.b} bg={cols[i % cols.length]} theme={theme} clock={clock} i={i} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1130 }}>
        <Scene style={{ position: 'relative', width: '100%', height: 520, inset: 'auto' }}>
          <rect x="90" y="400" width="900" height="24" rx="12" fill="#7A4F2E" />
          <PerchBird x={300} y={340} s={2.3} clock={clock} body={theme.coral} wing={theme.mustard} />
          <PerchBird x={760} y={348} s={2} clock={clock} body={theme.teal} wing={theme.sky} />
        </Scene>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, bottom: 130, ...M.rise(progress, 0.62, 0.26, 26), textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: theme.ink, color: theme.cream, borderRadius: 999, padding: '18px 40px', fontFamily: DISP, fontWeight: 800, fontSize: 38 }}>{s.footer || 'and it all starts with you'}</div>
      </div>
    </Frame>
  );
}

function Feature({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const deskIn = M.pop(progress, 0.12, 0.4, 0.6);
  return (
    <Frame progress={progress} bandCols={[theme.mustard, theme.plum, theme.teal, theme.coral]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.mustard} />
        <rect x="0" y="740" width="1080" height="1180" fill={theme.cream} />
        <circle cx="120" cy="740" r="180" fill={theme.coral} />
        <SunRays clock={clock} x={900} y={280} color={theme.cream} r={62} />
        <Cloud x={280} y={210} s={0.8} o={0.55} fill={theme.cream} />
        <Flock clock={clock} y={470} sp={-84} body={theme.plum} wing={theme.coral} n={3} s={0.44} />
        <Leaves clock={clock} cols={[theme.leaf, theme.coral]} n={8} />
        <Bush x={120} y={1880} s={1.1} c1={theme.leaf} c2="#2E8C4A" />
        <Bush x={960} y={1890} s={1} c1="#2E8C4A" c2={theme.leaf} />
        <Flower x={300} y={1880} s={1} clock={clock} ph={0} petal={theme.coral} center={theme.mustard} />
        <Flower x={370} y={1890} s={0.85} clock={clock} ph={1.2} petal={theme.plum} center={theme.mustard} />
        <Flower x={790} y={1884} s={0.95} clock={clock} ph={2.1} petal={theme.sky} center={theme.mustard} />
      </Scene>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 180, ...M.rise(progress, 0.03, 0.22, 36) }}>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: '0.16em', textTransform: 'uppercase', color: rgba(theme.ink, 0.7) }}>{s.eyebrow || 'IN YOUR POCKET'}</div>
        <div style={{ marginTop: 8, fontFamily: DISP, fontWeight: 800, fontSize: 108, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'Hear every|song.')}</div>
        <div style={{ marginTop: 14, maxWidth: 840, fontFamily: BODY, fontWeight: 600, fontSize: 29, lineHeight: 1.35, color: rgba(theme.ink, 0.85) }}>{s.body || 'Log a sighting, learn the call, and watch your life list grow one bird at a time.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 640, height: 500, ...deskIn, transformOrigin: 'center' }}>
        <DeskCard theme={theme} url={s.url}><MediaSlot src={s.shot} kind="desktop" label="DESKTOP SCREENSHOT" theme={theme} /></DeskCard>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 1190 }}>
        <Bullets progress={progress} at={0.42} items={s.bullets || ['Identify any call in under two seconds', 'Auto-logged sightings with date and place', 'Share your list with the whole flock']} theme={theme} />
        <div style={{ marginTop: 26 }}><TagRow progress={progress} at={0.62} tags={s.tags || ['FREE FOREVER', 'NO ADS', 'OFFLINE']} theme={theme} cols={[theme.teal, theme.coral, theme.sky]} /></div>
      </div>
      <div style={{ position: 'absolute', left: 700, top: 1560 }}>
        <Scene style={{ position: 'relative', width: 300, height: 300, inset: 'auto' }}><PerchBird x={150} y={170} s={1.3} clock={clock} body={theme.coral} wing={theme.plum} /></Scene>
      </div>
    </Frame>
  );
}

function Gallery({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const shots = s.shots || [
    { k: 'shot1', cap: 'THE DASHBOARD', bg: theme.teal },
    { k: 'shot2', cap: 'THE LIVE MAP', bg: theme.coral },
    { k: 'shot3', cap: 'YOUR LIFE LIST', bg: theme.sky },
  ];
  return (
    <Frame progress={progress} bandCols={[theme.coral, theme.sky, theme.mustard, theme.plum]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.sky} />
        <rect x="0" y="300" width="1080" height="1620" fill={theme.cream} />
        <Cloud x={820} y={170} s={0.9} o={0.7} fill={theme.cream} />
        <Cloud x={220} y={230} s={0.6} o={0.5} fill={theme.cream} />
        <Flock clock={clock} y={200} sp={92} body={theme.cream} wing={theme.plum} n={4} s={0.36} />
        <Leaves clock={clock} cols={[theme.mustard, theme.coral, theme.leaf]} n={9} />
        <Bush x={90} y={1900} s={1.2} c1={theme.leaf} c2="#2E8C4A" />
        <Bush x={1000} y={1905} s={1.1} c1="#2E8C4A" c2={theme.leaf} />
      </Scene>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 140, ...M.rise(progress, 0.02, 0.2, 30) }}>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 86, lineHeight: 0.94, color: theme.ink }}>{s.headline || 'Every screen'}</div>
        <div style={{ marginTop: 8, fontFamily: BODY, fontWeight: 700, fontSize: 28, color: rgba(theme.ink, 0.75) }}>{s.sub || 'Built wide for the desktop birder.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, top: 340, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {shots.map((sh, i) => { const e = M.pop(progress, 0.14 + i * 0.13, 0.34, 0.55); const bob = Math.sin(clock * 1.1 + i * 1.6) * 6; return (
          <div key={i} style={{ ...e }}>
            <div style={{ transform: `translateY(${bob}px)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: 999, background: theme.ink, color: theme.cream, display: 'grid', placeItems: 'center', fontFamily: DISP, fontWeight: 800, fontSize: 22 }}>{i + 1}</span>
                <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 34, color: theme.ink }}>{sh.cap}</span>
              </div>
              <div style={{ height: 380 }}><DeskCard theme={theme} url={s.url}><MediaSlot src={s[sh.k]} kind="desktop" label={`DESKTOP SCREENSHOT ${i + 1}`} theme={theme} /></DeskCard></div>
            </div>
          </div>
        ); })}
      </div>
    </Frame>
  );
}

function Cards({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const cards = s.cards || [
    { e: '🎧', t: 'Real calls', b: 'Thousands of recorded songs.' },
    { e: '🗺️', t: 'Live map', b: 'See what is nearby right now.' },
    { e: '🪶', t: 'Life list', b: 'Every sighting, kept forever.' },
    { e: '🌱', t: 'Give back', b: 'Your logs help conservation.' },
  ];
  const cols = [theme.teal, theme.coral, theme.mustard, theme.sky];
  return (
    <Frame progress={progress} bandCols={[theme.sky, theme.mustard, theme.plum, theme.teal]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.plum} />
        <rect x="0" y="330" width="1080" height="1240" fill={theme.cream} />
        <Leaves clock={clock} cols={[theme.mustard, theme.coral, theme.leaf]} n={10} />
        <Flock clock={clock} y={220} sp={80} body={theme.mustard} wing={theme.cream} n={4} s={0.38} />
        <Tree x={140} y={1900} s={0.85} clock={clock} ph={0.3} canopy={theme.leaf} canopy2="#2E8C4A" trunk="#7A4F2E" />
        <Tree x={940} y={1900} s={0.95} clock={clock} ph={1.9} canopy="#2E8C4A" canopy2={theme.leaf} trunk="#7A4F2E" />
      </Scene>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 150, ...M.rise(progress, 0.03, 0.22, 32) }}>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 86, lineHeight: 0.94, color: theme.cream }}>{s.headline || 'What you get'}</div>
        <div style={{ marginTop: 8, fontFamily: BODY, fontWeight: 700, fontSize: 27, color: rgba(theme.cream, 0.85) }}>{s.sub || 'Everything a birder needs, nothing they do not.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 400, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, gridAutoRows: '340px' }}>
        {cards.map((c, i) => <ColourCard key={i} progress={progress} at={0.14 + i * 0.1} bg={cols[i % cols.length]} emoji={c.e} title={c.t} body={c.b} theme={theme} clock={clock} i={i} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1160 }}>
        <Scene style={{ position: 'relative', width: '100%', height: 460, inset: 'auto' }}>
          <rect x="70" y="370" width="940" height="26" rx="13" fill="#7A4F2E" />
          <PerchBird x={310} y={306} s={2.4} clock={clock} body={theme.coral} wing={theme.mustard} />
          <PerchBird x={750} y={314} s={2.1} clock={clock} body={theme.plum} wing={theme.sky} />
        </Scene>
      </div>
    </Frame>
  );
}

function Numbers({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const stats = s.stats || [{ v: 240, suf: 'K', l: 'BIRDERS' }, { v: 11, suf: 'K', l: 'SPECIES' }, { v: 4.9, suf: '★', l: 'RATING' }];
  const cols = [theme.mustard, theme.coral, theme.sky];
  return (
    <Frame progress={progress} bandCols={[theme.teal, theme.plum, theme.coral, theme.mustard]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.teal} />
        <circle cx="920" cy="260" r="200" fill={theme.mustard} opacity="0.95" />
        <Leaves clock={clock} cols={[theme.mustard, theme.cream]} n={9} />
        <Flock clock={clock} y={420} sp={-92} body={theme.cream} wing={theme.mustard} n={3} s={0.42} />
        <Tree x={540} y={2040} s={1.5} clock={clock} ph={0.9} canopy={theme.leaf} canopy2="#2E8C4A" trunk="#6B4426" />
      </Scene>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 210, ...M.rise(progress, 0.04, 0.24, 38) }}>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 116, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.cream }}>{splitLines(s.headline || 'The flock|is growing.')}</div>
        <div style={{ marginTop: 16, maxWidth: 780, fontFamily: BODY, fontWeight: 600, fontSize: 30, lineHeight: 1.35, color: rgba(theme.cream, 0.9) }}>{s.body || 'Birders in every timezone, logging songs from dawn until dusk.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 700, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {stats.map((st, i) => { const bob = Math.sin(clock * 1.2 + i * 1.5) * 6; return (
          <div key={i} style={{ ...M.pop(progress, 0.22 + i * 0.12, 0.36, 0.5) }}>
            <div style={{ transform: `translateY(${bob}px) rotate(${i % 2 ? 1 : -1}deg)`, background: cols[i % cols.length], border: `5px solid ${theme.ink}`, borderRadius: 30, boxShadow: `0 12px 0 ${theme.ink}`, padding: '26px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 128, lineHeight: 0.9, color: theme.ink }}><Counter progress={progress} at={0.26 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.ink} /></div>
              <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 32, letterSpacing: '0.06em', color: rgba(theme.ink, 0.8), textAlign: 'right' }}>{st.l}</div>
            </div>
          </div>
        ); })}
      </div>
    </Frame>
  );
}

function Join({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = localTime;
  const logo = M.pop(progress, 0.16, 0.42, 0.4);
  const head = M.rise(progress, 0.26, 0.3, 54);
  const btn = M.pop(progress, 0.46, 0.38, 0.4);
  return (
    <Frame progress={progress} bandCols={[theme.mustard, theme.coral, theme.sky, theme.teal]}>
      <Scene>
        <rect x="0" y="0" width="1080" height="1920" fill={theme.cream} />
        <rect x="0" y="0" width="1080" height="620" fill={theme.coral} />
        <circle cx="200" cy="620" r="190" fill={theme.mustard} />
        <SunRays clock={clock} x={880} y={230} color={theme.mustard} r={70} />
        <Leaves clock={clock} cols={[theme.leaf, theme.mustard, theme.teal]} n={11} />
        <Flock clock={clock} y={430} sp={88} body={theme.cream} wing={theme.plum} n={4} s={0.4} />
        <rect x="60" y="1740" width="960" height="18" rx="9" fill="#7A4F2E" />
        <PerchBird x={300} y={1706} s={1.3} clock={clock} body={theme.teal} wing={theme.mustard} />
        <PerchBird x={780} y={1708} s={1.15} clock={clock} body={theme.plum} wing={theme.coral} />
        <Tree x={980} y={1980} s={1} clock={clock} ph={1.2} canopy={theme.leaf} canopy2="#2E8C4A" trunk="#7A4F2E" />
      </Scene>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 660, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ ...logo, width: 190, height: 190, borderRadius: 48, background: theme.cream, border: `5px solid ${theme.ink}`, boxShadow: `0 12px 0 ${theme.ink}`, overflow: 'hidden', padding: 24, marginBottom: 34 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 800, fontSize: 150, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.ink, textAlign: 'center' }}>{splitLines(s.headline || 'Join the|flock.')}</div>
        <div style={{ ...M.rise(progress, 0.36, 0.3, 30), marginTop: 20, maxWidth: 820, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 32, lineHeight: 1.35, color: rgba(theme.ink, 0.8) }}>{s.body || 'Free to start, forever. Your first sighting is waiting outside.'}</div>
        <div style={{ marginTop: 22 }}><TagRow progress={progress} at={0.42} tags={s.tags || ['NO CARD NEEDED', 'iOS + ANDROID', 'WEB']} theme={theme} cols={[theme.mustard, theme.sky, theme.coral]} /></div>
        <div style={{ ...btn, marginTop: 40, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '34px 0', borderRadius: 999, background: theme.teal, color: inkOn(theme.teal), border: `5px solid ${theme.ink}`, boxShadow: `0 14px 0 ${theme.ink}`, fontFamily: DISP, fontWeight: 800, fontSize: 52 }}>{s.cta || 'GET BIRDSONG'} 🐦</div>
          <div style={{ marginTop: 24, textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 32, color: rgba(theme.ink, 0.75) }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

const MAP = { Cover, Story, Feature, Gallery, Cards, Numbers, Join };

function BirdsongFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    brand: (t.brandName || 'BIRDSONG').toUpperCase(), url: t.url || 'birdsong.app',
    cream: '#FDF6E9', ink: '#1E2A24',
    teal: t.teal || '#0E9B8E', coral: t.coral || '#FF6B4A', mustard: t.mustard || '#FFC231',
    plum: '#7A4EC6', sky: '#4FC3F7', leaf: '#3FA65B',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.cream} transition="cut">{MAP}</window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Colour blocks" />
        <TweakColor label="Block 1" value={t.teal} options={['#0E9B8E', '#1F6FEB', '#7A4EC6', '#E23A6E']} onChange={v => setTweak('teal', v)} />
        <TweakColor label="Block 2" value={t.coral} options={['#FF6B4A', '#FF3D7F', '#FF9F1C', '#4FC3F7']} onChange={v => setTweak('coral', v)} />
        <TweakColor label="Block 3" value={t.mustard} options={['#FFC231', '#B9F18D', '#FFD9E8', '#C6B3FF']} onChange={v => setTweak('mustard', v)} />
        <TweakSection label="Brand" />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.BirdsongFilm = BirdsongFilm;
