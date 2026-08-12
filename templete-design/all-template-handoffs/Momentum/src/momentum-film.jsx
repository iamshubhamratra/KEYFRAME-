/* momentum-film.jsx — "MOMENTUM" kinetic velocity hype template.
   Mounted via <x-import> after animations-v2.jsx + tweaks-panel.jsx.
   Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS (declared in the .dc.html helmet). */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#FF4B2B', ground: '#131210', ink: '#F5F2EA', brand: 'MOMENTUM', url: 'momentum.app',
});
const useTheme = () => React.useContext(ThemeContext);

const DISP = "'Hanken Grotesk', system-ui, sans-serif";
const MONO = "'Space Mono', ui-monospace, monospace";

// ── Color helpers ──────────────────────────────────────────────────────────
function hexToRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) {
  const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
// Ink that reads on a given background (dark ink on light accents, off-white on dark).
function inkOn(bg, theme) { return lum(bg) > 0.45 ? '#141210' : theme.ink; }

// ── Motion (all timing funnels through these three + seg) ───────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  // slam up + fade in
  rise: (p, a = 0, d = 0.22, dist = 64) => {
    const t = seg(p, a, a + d, E.easeOutBack);
    return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` };
  },
  // scale overshoot in (badges, chips, numbers)
  pop: (p, a = 0, d = 0.34, from = 0.5) => {
    const s = seg(p, a, a + d, E.easeOutBack);
    return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` };
  },
  // eased 0..1 progress (draws, counters, sweeps, gauges)
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
// Headlines break on '|' — no escaping needed in JSON or JS.
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ── Camera rig ──────────────────────────────────────────────────────────────
// Continuous push-in + drift on every shot, plus motion-blurred whip / dolly
// transitions that carry momentum THROUGH each cut. This is what turns a set of
// static compositions into an edited film. KIND/DIR are indexed by the ENTERING
// scene (index 0 = the loop seam CTA→Intro); a scene's EXIT reuses the next
// boundary's kind/dir so both sides of a cut move the same way (seamless whip).
const CAM_KIND = ['zoom', 'whip', 'whip', 'zoom', 'whip', 'zoom', 'whip', 'whip'];
const CAM_DIR = [0, 1, -1, 0, 1, 0, -1, 1];
function cam(progress, index, count) {
  const W = 1920, IN = 0.13, OUT = 0.87;
  const eK = CAM_KIND[index % CAM_KIND.length], eD = CAM_DIR[index % CAM_DIR.length];
  const nx = (index + 1) % count;
  const xK = CAM_KIND[nx % CAM_KIND.length], xD = CAM_DIR[nx % CAM_DIR.length];
  let tx = 0, ty = 0, sc = 1 + 0.06 * E.easeInOutSine(progress), blur = 0, op = 1;
  const dr = [-1, 1, -1, 1, 1, -1, 1, -1][index % 8];
  tx += dr * 30 * (progress - 0.5);
  ty += (index % 2 ? 1 : -1) * 12 * (progress - 0.5);
  if (progress < IN) {
    const t = seg(progress, 0, IN, E.easeOutExpo);
    if (eK === 'whip') { tx += -eD * W * 0.62 * (1 - t); blur += 34 * (1 - t); }
    else { sc *= (1.26 - 0.26 * t); blur += 26 * (1 - t); op = seg(progress, 0, IN * 0.55, E.easeOutQuad); }
  }
  if (progress > OUT) {
    const t = seg(progress, OUT, 1, E.easeInExpo);
    if (xK === 'whip') { tx += xD * W * 0.62 * t; blur += 34 * t; }
    else { sc *= (1 + 0.28 * t); blur += 26 * t; op = 1 - seg(progress, OUT + (1 - OUT) * 0.45, 1, E.easeInQuad); }
  }
  return {
    transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sc.toFixed(4)})`,
    filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : 'none',
    opacity: op, transformOrigin: 'center center', willChange: 'transform, filter, opacity',
  };
}

// ── Shared chrome ───────────────────────────────────────────────────────────

// Drifting dot grid (continuous, driven by localTime → export-safe)
function GridBG({ localTime, theme, opacity = 0.5 }) {
  const off = (localTime * 22) % 46;
  return (
    <div style={{ position: 'absolute', inset: -46, opacity, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${-off}px, ${-off * 0.4}px)`,
        backgroundImage: `radial-gradient(${rgba(theme.ink, 0.5)} 1.3px, transparent 1.3px)`,
        backgroundSize: '46px 46px',
      }} />
    </div>
  );
}

function Vignette({ ground }) {
  return <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: `radial-gradient(120% 90% at 50% 42%, transparent 40%, ${rgba(ground, 0.85)} 100%)`,
  }} />;
}

// Corner crop marks — persistent HUD frame (never resets between scenes)
function CropMarks({ color }) {
  const L = 46, T = 3;
  const mark = (pos) => (
    <div style={{ position: 'absolute', width: L, height: L, ...pos }}>
      <div style={{ position: 'absolute', ...(pos.left != null ? { left: 0 } : { right: 0 }), ...(pos.top != null ? { top: 0 } : { bottom: 0 }), width: L, height: T, background: color }} />
      <div style={{ position: 'absolute', ...(pos.left != null ? { left: 0 } : { right: 0 }), ...(pos.top != null ? { top: 0 } : { bottom: 0 }), width: T, height: L, background: color }} />
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 54, pointerEvents: 'none' }}>
      {mark({ top: 0, left: 0 })}{mark({ top: 0, right: 0 })}
      {mark({ bottom: 0, left: 0 })}{mark({ bottom: 0, right: 0 })}
    </div>
  );
}

// Top ticker/marquee (continuous scroll from localTime)
function Marquee({ localTime, theme, text }) {
  const unit = `${text}`;
  const line = new Array(8).fill(unit).join('     ◆     ');
  const shift = (localTime * 90) % 1000;
  return (
    <div style={{
      position: 'absolute', top: 24, left: 0, right: 0, height: 22, overflow: 'hidden',
      display: 'flex', alignItems: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        whiteSpace: 'nowrap', transform: `translateX(${-shift}px)`,
        fontFamily: MONO, fontSize: 13, letterSpacing: '0.24em', color: rgba(theme.ink, 0.32),
        textTransform: 'uppercase',
      }}>{line}   {line}</div>
    </div>
  );
}

// Pumping chevrons »»» (cyclic from localTime)
function Chevrons({ localTime, color, x, y, n = 3, size = 26, dir = 1 }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, display: 'flex', gap: size * 0.28, transform: dir < 0 ? 'scaleX(-1)' : 'none' }}>
      {new Array(n).fill(0).map((_, i) => {
        const ph = (localTime * 2.2 - i * 0.32) % 1.4;
        const a = ph > 0 && ph < 1 ? 0.25 + 0.75 * Math.sin(ph * Math.PI) : 0.18;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ opacity: a }}>
            <path d="M7 4l9 8-9 8" fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      })}
    </div>
  );
}

// Speed streak lines (entrance burst)
function Streaks({ progress, color, from = 0, dur = 0.4 }) {
  const t = seg(progress, from, from + dur, E.easeOutExpo);
  const fade = 1 - seg(progress, from + dur * 0.4, from + dur, E.easeInQuad);
  if (fade <= 0) return null;
  const rows = [18, 34, 50, 66, 82];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: fade }}>
      {rows.map((top, i) => {
        const w = lerp(0, 130, t) * (0.6 + (i % 3) * 0.2);
        const x = lerp(-30, 120, t);
        return <div key={i} style={{
          position: 'absolute', top: `${top}%`, left: `${x - w}%`, width: `${w}%`, height: i % 2 ? 2 : 3,
          background: `linear-gradient(90deg, transparent, ${rgba(color, 0.9)})`,
        }} />;
      })}
    </div>
  );
}

// ── Animated vector layer ──────────────────────────────────────────────
// Dense glowing SVG primitives that ride the margins of EVERY scene — the pack's
// vector identity: a drifting constellation + connectors, rotating arc rings with
// an orbiting node, a dashed trajectory with a node travelling it, plus-marks and
// a live oscilloscope trace. All animated off the global clock.
function VectorField({ clock, ink, accent }) {
  const nodes = [[250, 300], [372, 214], [188, 436], [430, 356], [300, 508]];
  const far = [[1600, 300], [1742, 232], [1682, 430], [1820, 372]];
  const wave = new Array(46).fill(0).map((_, i) => `${1180 + i * 15},${928 + Math.sin(clock * 3 + i * 0.5) * 9}`).join(' ');
  const orbit = Math.sin(clock * 0.9) * 0.5 + 0.5;
  const bx = (1 - orbit) * (1 - orbit) * 150 + 2 * (1 - orbit) * orbit * 720 + orbit * orbit * 1240;
  const by = (1 - orbit) * (1 - orbit) * 760 + 2 * (1 - orbit) * orbit * 560 + orbit * orbit * 800;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <g opacity="0.55">
        {nodes.map((n, i) => nodes.slice(i + 1).map((m, j) => Math.hypot(n[0] - m[0], n[1] - m[1]) < 210
          ? <line key={i + '-' + j} x1={n[0]} y1={n[1]} x2={m[0]} y2={m[1]} stroke={rgba(ink, 0.16)} strokeWidth="1" /> : null))}
        {nodes.map((n, i) => <circle key={i} cx={n[0] + Math.sin(clock * 0.8 + i) * 6} cy={n[1] + Math.cos(clock * 0.7 + i) * 6} r={i % 2 ? 3.5 : 2.5} fill={i === 0 ? accent : rgba(ink, 0.5)} />)}
        {far.map((n, i) => <circle key={i} cx={n[0]} cy={n[1]} r="2.5" fill={rgba(ink, 0.4)} />)}
        {far.map((n, i) => i < far.length - 1 ? <line key={i} x1={n[0]} y1={n[1]} x2={far[i + 1][0]} y2={far[i + 1][1]} stroke={rgba(ink, 0.14)} strokeWidth="1" /> : null)}
      </g>
      <g transform={`translate(1700 250) rotate(${clock * 22})`} opacity="0.8">
        <circle r="92" fill="none" stroke={rgba(accent, 0.55)} strokeWidth="2" strokeDasharray="58 30" />
        <circle r="62" fill="none" stroke={rgba(ink, 0.22)} strokeWidth="1.5" strokeDasharray="18 14" />
        <circle cx="92" cy="0" r="5" fill={accent} />
      </g>
      <path d="M 150 760 Q 720 560 1240 800" fill="none" stroke={rgba(ink, 0.16)} strokeWidth="1.5" strokeDasharray="6 9" />
      <circle cx={bx} cy={by} r="6" fill={accent} opacity="0.9" />
      {[[110, 150], [1810, 150], [960, 116], [110, 940], [1500, 470]].map((p, i) => (
        <g key={i} stroke={rgba(ink, 0.28)} strokeWidth="1.5"><line x1={p[0] - 8} y1={p[1]} x2={p[0] + 8} y2={p[1]} /><line x1={p[0]} y1={p[1] - 8} x2={p[0]} y2={p[1] + 8} /></g>
      ))}
      <polyline points={wave} fill="none" stroke={rgba(accent, 0.45)} strokeWidth="2" />
    </svg>
  );
}

// Corner reticle brackets that draw around a media slot / asset.
function Reticle({ progress, at = 0.3, color, inset = -16, dur = 0.3 }) {
  const L = 28 * M.draw(progress, at, dur, E.easeOutCubic), T = 3;
  const c = (pos) => (
    <div style={{ position: 'absolute', width: L, height: L, ...pos }}>
      <div style={{ position: 'absolute', ...(pos.left != null ? { left: 0 } : { right: 0 }), ...(pos.top != null ? { top: 0 } : { bottom: 0 }), width: L, height: T, background: color }} />
      <div style={{ position: 'absolute', ...(pos.left != null ? { left: 0 } : { right: 0 }), ...(pos.top != null ? { top: 0 } : { bottom: 0 }), width: T, height: L, background: color }} />
    </div>
  );
  return <div style={{ position: 'absolute', inset, pointerEvents: 'none' }}>{c({ top: 0, left: 0 })}{c({ top: 0, right: 0 })}{c({ bottom: 0, left: 0 })}{c({ bottom: 0, right: 0 })}</div>;
}

// A trend line that draws itself along given points, dots popping on arrival.
function TrendLine({ progress, at, dur = 0.5, points, color }) {
  const t = M.draw(progress, at, dur, E.easeInOutCubic);
  const LEN = 2600;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - t)} />
      {points.map((p, i) => t > (i + 0.5) / points.length ? <circle key={i} cx={p[0]} cy={p[1]} r="6" fill={color} /> : null)}
    </svg>
  );
}

// A radial burst of lines shooting out then settling.
function Burst({ progress, at, color, cx, cy, n = 16, r0 = 70, r1 = 300 }) {
  const t = M.draw(progress, at, 0.5, E.easeOutExpo);
  const fade = 1 - seg(progress, at + 0.4, at + 0.75, E.easeInQuad);
  if (fade <= 0) return null;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: fade }}>
      {new Array(n).fill(0).map((_, i) => {
        const a = (i / n) * Math.PI * 2, re = r0 + (r1 - r0) * t;
        return <line key={i} x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0} x2={cx + Math.cos(a) * re} y2={cy + Math.sin(a) * re} stroke={color} strokeWidth="3" strokeLinecap="round" />;
      })}
    </svg>
  );
}

// Bottom "forward rail" HUD — the pack signature. A PERSISTENT timeline whose
// playhead runs continuously off the GLOBAL clock (never resets per scene), so
// it reads like an editor's scrubber riding under the footage.
function RailHUD({ clock, total, index, count, theme }) {
  const railL = 96, railR = 96;
  const w = 1920 - railL - railR;
  const frac = total > 0 ? clamp01(clock / total) : 0;
  const headX = railL + w * frac;
  const step = w / Math.max(1, count);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, height: 60, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: railL, bottom: 30, fontFamily: MONO, fontSize: 14, letterSpacing: '0.2em', color: rgba(theme.ink, 0.6), whiteSpace: 'nowrap' }}>
        {theme.brand}
      </div>
      <div style={{ position: 'absolute', right: railR, bottom: 30, fontFamily: MONO, fontSize: 14, letterSpacing: '0.2em', color: rgba(theme.ink, 0.6), whiteSpace: 'nowrap' }}>
        {theme.brand} <span style={{ color: theme.accent }}>▸</span> RUNTIME
      </div>
    </div>
  );
}

// Top-left status light — persistent, blinks off the global clock.
function Status({ clock, theme, label }) {
  const on = Math.sin(clock * 6) > -0.3;
  return (
    <div style={{ position: 'absolute', left: 96, top: 60, display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 14, letterSpacing: '0.22em', color: rgba(theme.ink, 0.65) }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: theme.accent, opacity: on ? 1 : 0.3, boxShadow: `0 0 10px ${theme.accent}` }} />
      {label}
    </div>
  );
}

// The scene shell: a MOVING camera layer (grid + hero content) under a LOCKED,
// continuously-running HUD — like graphics composited over live footage.
// bg/ink/accent override the theme (Stats runs on an accent-flooded ground).
function Frame({ progress, index, count, statusLabel, children, marquee = true, bg, ink, accent }) {
  const theme = useTheme();
  bg = bg || theme.ground; ink = ink || theme.ink; accent = accent || theme.accent;
  const sc = window.useScene ? window.useScene() : null;
  const total = sc && sc.total ? sc.total : 35;
  const clock = window.useTimeline().time;
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden', fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...cam(progress, index, count) }}>
        <GridBG localTime={clock} theme={{ ink }} />
        <VectorField clock={clock} ink={ink} accent={accent} />
        {children}
      </div>
      <Vignette ground={bg} />
      <CropMarks color={rgba(ink, 0.5)} />
      {marquee && <Marquee localTime={clock} theme={{ ink }} text={`${theme.brand}  ◆  ${theme.url}`} />}
      <Status clock={clock} theme={{ ink, accent }} label={statusLabel} />
      <RailHUD clock={clock} total={total} index={index} count={count} theme={{ ink, accent, brand: theme.brand }} />
    </div>
  );
}

// ── Media slot (screenshot / photo / logo drop target) ──────────────────────
function MediaSlot({ src, kind = 'shot', label }) {
  const theme = useTheme();
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.02)} 14px 28px)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 10, border: `2px dashed ${rgba(theme.accent, 0.7)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 30, fontWeight: 300, lineHeight: 1 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.18em', color: rgba(theme.ink, 0.5), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: rgba(theme.ink, 0.28) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}

// Browser chrome frame
function BrowserFrame({ theme, url, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: '#0c0b0a', border: `1px solid ${rgba(theme.ink, 0.14)}`, boxShadow: `0 40px 90px ${rgba('#000000', 0.55)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 46, flexShrink: 0, background: rgba(theme.ink, 0.06), display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 12, background: c }} />)}
        <div style={{ marginLeft: 14, flex: 1, maxWidth: 380, height: 24, borderRadius: 12, background: rgba(theme.ink, 0.08), display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: MONO, fontSize: 12, color: rgba(theme.ink, 0.5), letterSpacing: '0.06em' }}>{url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

// Phone bezel
function PhoneFrame({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 42, padding: 12, background: '#0a0908', border: `2px solid ${rgba(theme.ink, 0.16)}`, boxShadow: `0 40px 90px ${rgba('#000000', 0.6)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 96, height: 22, borderRadius: 22, background: '#0a0908', zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 32, overflow: 'hidden', background: '#151311' }}>{children}</div>
    </div>
  );
}

// Callout chip with leader line
function ChipCallout({ progress, at, theme, text, x, y, lineTo }) {
  const s = M.pop(progress, at, 0.3, 0.6);
  const dl = M.draw(progress, at - 0.04, 0.28);
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 5 }}>
      {lineTo && (
        <svg style={{ position: 'absolute', left: lineTo.ox, top: lineTo.oy, overflow: 'visible', pointerEvents: 'none' }} width="1" height="1">
          <line x1="0" y1="0" x2={lineTo.dx * dl} y2={lineTo.dy * dl} stroke={theme.accent} strokeWidth="2" />
          <circle cx={lineTo.dx * dl} cy={lineTo.dy * dl} r="4" fill={theme.accent} />
        </svg>
      )}
      <div style={{
        ...s, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999,
        background: rgba(theme.ink, 0.07), border: `1px solid ${rgba(theme.accent, 0.5)}`, backdropFilter: 'blur(6px)',
        fontFamily: MONO, fontSize: 15, letterSpacing: '0.1em', color: theme.ink, textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 7, background: theme.accent }} />{text}
      </div>
    </div>
  );
}

// Kinetic counter
function Counter({ progress, at, dur, value, prefix = '', suffix = '', color }) {
  const t = M.draw(progress, at, dur, E.easeOutExpo);
  const isFloat = String(value).includes('.');
  const v = value * t;
  const shown = isFloat ? v.toFixed(1) : Math.round(v);
  return <span style={{ color }}>{prefix}{shown}{suffix}</span>;
}

// ═══════════════════════════ SCENES ═══════════════════════════════════════

function Intro({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const badge = M.pop(progress, 0.1, 0.42, 0.3);
  const ring = M.draw(progress, 0.12, 0.55);
  const brandRise = M.rise(progress, 0.34, 0.24, 70);
  const tagRise = M.rise(progress, 0.46, 0.22, 40);
  const ringR = 150;
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'NOW LAUNCHING'}>
      <Streaks progress={progress} color={theme.accent} from={0.05} dur={0.42} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', marginBottom: 40 }}>
          <Reticle progress={progress} at={0.2} color={theme.accent} inset={-26} />
          <svg width={ringR * 2 + 40} height={ringR * 2 + 40} style={{ position: 'absolute', transform: `rotate(${localTime * 30}deg)` }}>
            <circle cx={ringR + 20} cy={ringR + 20} r={ringR} fill="none" stroke={rgba(theme.accent, 0.9)} strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * ringR * 0.16} ${2 * Math.PI * ringR * 0.09}`} strokeDashoffset={2 * Math.PI * ringR * (1 - ring)} strokeLinecap="round" />
          </svg>
          <div style={{ ...badge, width: 210, height: 210, borderRadius: 30, background: rgba(theme.ink, 0.05), border: `1px solid ${rgba(theme.ink, 0.16)}`, display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 30 }}>
            <MediaSlot src={s.logo} kind="logo" />
          </div>
          <Chevrons localTime={localTime} color={theme.accent} x={-ringR - 130} y={ringR - 15} n={3} size={30} />
          <Chevrons localTime={localTime} color={theme.accent} x={ringR * 2 + 60} y={ringR - 15} n={3} size={30} dir={-1} />
        </div>
        <div style={{ ...brandRise, fontWeight: 900, fontSize: 150, letterSpacing: '-0.05em', color: theme.ink, textTransform: 'uppercase', lineHeight: 0.9 }}>{s.brand || theme.brand}</div>
        <div style={{ ...tagRise, marginTop: 18, fontFamily: MONO, fontSize: 22, letterSpacing: '0.28em', color: theme.accent, textTransform: 'uppercase' }}>{s.tagline || 'THE LAUNCH, ENGINEERED'}</div>
      </div>
    </Frame>
  );
}

function Statement({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const lines = s.lines || ['BUILD', 'BOLD.', 'SHIP', 'FASTER.'];
  const accentIdx = s.accentLine != null ? s.accentLine : 1;
  const bigNum = s.bignum || '/01';
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'MANIFESTO'}>
      <Streaks progress={progress} color={theme.accent} from={0.02} dur={0.36} />
      <div style={{ position: 'absolute', right: 90, top: 120, fontWeight: 900, fontSize: 340, lineHeight: 0.8, color: rgba(theme.ink, 0.05), letterSpacing: '-0.05em' }}>{bigNum}</div>
      <div style={{ position: 'absolute', left: 96, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        {lines.map((ln, i) => {
          const r = M.rise(progress, 0.06 + i * 0.09, 0.24, 90);
          const isA = i === accentIdx;
          return (
            <div key={i} style={{ ...r, display: 'flex', alignItems: 'center' }}>
              {isA && <span style={{ display: 'inline-block', width: seg(progress, 0.06 + i * 0.09 + 0.1, 0.06 + i * 0.09 + 0.34, E.easeOutExpo) * 44, height: 44, background: theme.accent, marginRight: 24 }} />}
              <span style={{ fontWeight: 900, fontSize: 158, lineHeight: 0.92, letterSpacing: '-0.05em', textTransform: 'uppercase', color: isA ? theme.accent : theme.ink }}>{ln}</span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function Feature({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  // Screenshot flies in from the right, overshoots, Ken-Burns push
  const inT = seg(progress, 0.06, 0.34, E.easeOutBack);
  const kb = M.draw(progress, 0.34, 0.6, E.easeInOutSine);
  const shotX = lerp(760, 0, inT);
  const scale = 1 + 0.05 * kb;
  const headRise = M.rise(progress, 0.12, 0.24, 50);
  const chips = s.chips || ['REAL-TIME', 'AI-NATIVE', '1-CLICK DEPLOY'];
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'FEATURE // 01'}>
      <div style={{ position: 'absolute', left: 96, top: 150, width: 620 }}>
        <div style={{ ...headRise }}>
          <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.24em', color: theme.accent, marginBottom: 18 }}>{s.eyebrow || 'SEE IT LIVE'}</div>
          <div style={{ fontWeight: 900, fontSize: 92, lineHeight: 0.94, letterSpacing: '-0.04em', textTransform: 'uppercase', color: theme.ink, whiteSpace: 'pre-line' }}>{splitLines(s.headline || 'Everything,|in one canvas.')}</div>
        </div>
        <div style={{ ...M.rise(progress, 0.24, 0.22, 30), marginTop: 26, fontFamily: MONO, fontSize: 18, lineHeight: 1.6, color: rgba(theme.ink, 0.66), maxWidth: 460 }}>{s.body || 'Design, review and ship from a single fast surface — no context-switching.'}</div>
        <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {chips.map((c, i) => (
            <span key={i} style={{ ...M.pop(progress, 0.4 + i * 0.08, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, border: `1px solid ${rgba(theme.accent, 0.5)}`, background: rgba(theme.ink, 0.05), fontFamily: MONO, fontSize: 14, letterSpacing: '0.1em', color: theme.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: theme.accent }} />{c}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 96, top: 168, width: 900, height: 620, transform: `translateX(${shotX}px) scale(${scale})`, transformOrigin: 'right center' }}>
        <BrowserFrame theme={theme} url={s.url || theme.url}>
          <MediaSlot src={s.shot} kind="desktop" />
        </BrowserFrame>
        <Reticle progress={progress} at={0.42} color={theme.accent} inset={-18} />
      </div>
      <Chevrons localTime={localTime} color={theme.accent} x={710} y={470} n={4} size={22} />
    </Frame>
  );
}

function Mobile({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.06, 0.36, E.easeOutBack);
  const y = lerp(720, 0, inT);
  const kb = M.draw(progress, 0.36, 0.6);
  const headRise = M.rise(progress, 0.16, 0.24, 50);
  const chips = s.chips || ['OFFLINE-FIRST', 'PUSH SYNC', 'FACE ID'];
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'FEATURE // 02'}>
      <div style={{ position: 'absolute', right: 120, top: 130, width: 640 }}>
        <div style={{ ...headRise, textAlign: 'right' }}>
          <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.24em', color: theme.accent, marginBottom: 18 }}>{s.eyebrow || 'ON THE GO'}</div>
          <div style={{ fontWeight: 900, fontSize: 96, lineHeight: 0.94, letterSpacing: '-0.04em', textTransform: 'uppercase', color: theme.ink, whiteSpace: 'pre-line' }}>{splitLines(s.headline || 'In your|pocket.')}</div>
        </div>
        <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {chips.map((c, i) => (
            <span key={i} style={{ ...M.pop(progress, 0.42 + i * 0.08, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, border: `1px solid ${rgba(theme.accent, 0.5)}`, background: rgba(theme.ink, 0.05), fontFamily: MONO, fontSize: 14, letterSpacing: '0.1em', color: theme.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: theme.accent }} />{c}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 210, top: 120, width: 356, height: 760, transform: `translateY(${y}px) scale(${1 + 0.03 * kb})`, transformOrigin: 'center bottom' }}>
        <PhoneFrame theme={theme}><MediaSlot src={s.shot} kind="phone" /></PhoneFrame>
        <Reticle progress={progress} at={0.44} color={theme.accent} inset={-18} />
      </div>
      <Chevrons localTime={localTime} color={theme.accent} x={600} y={520} n={4} size={22} />
    </Frame>
  );
}

function Stats({ progress, index, count, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const ink = inkOn(theme.accent, theme);
  const dim = rgba(ink, 0.62);
  const stats = s.stats || [{ v: 240, suf: '%', l: 'FASTER SHIPS' }, { v: 12, suf: 'K', l: 'TEAMS ONBOARD' }, { v: 99.9, suf: '%', l: 'UPTIME SLA' }];
  const bars = [0.45, 0.7, 0.55, 0.88, 1.0, 0.75, 0.92];
  return (
    <Frame progress={progress} index={index} count={count} statusLabel={s.kicker || 'BY THE NUMBERS'} bg={theme.accent} ink={ink} accent={ink}>
      <div style={{ position: 'absolute', right: 90, bottom: 210, display: 'flex', alignItems: 'flex-end', gap: 18, height: 420 }}>
        {bars.map((h, i) => {
          const g = M.draw(progress, 0.1 + i * 0.05, 0.4, E.easeOutCubic);
          return <div key={i} style={{ width: 46, height: 420 * h * g, background: i === 4 ? ink : rgba(ink, 0.22), transformOrigin: 'bottom' }} />;
        })}
      </div>
      <TrendLine progress={progress} at={0.42} dur={0.5} color={ink} points={[[1423, 681], [1487, 576], [1551, 639], [1615, 500], [1679, 450], [1743, 555], [1807, 484]]} />
      <div style={{ position: 'absolute', left: 96, top: 150 }}>
        <div style={{ ...M.rise(progress, 0.06, 0.22, 40), fontFamily: MONO, fontSize: 18, letterSpacing: '0.26em', color: ink }}>{s.kicker || 'BY THE NUMBERS'}</div>
        <div style={{ ...M.rise(progress, 0.12, 0.24, 60), marginTop: 14, maxWidth: 900, fontWeight: 900, fontSize: 104, lineHeight: 0.92, letterSpacing: '-0.04em', textTransform: 'uppercase', color: ink, whiteSpace: 'pre-line' }}>{splitLines(s.headline || 'Proof, not|promises.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 96, bottom: 190, display: 'flex', gap: 90 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.rise(progress, 0.34 + i * 0.1, 0.22, 40) }}>
            <div style={{ fontWeight: 900, fontSize: 128, lineHeight: 1, letterSpacing: '-0.05em', color: ink }}>
              <Counter progress={progress} at={0.34 + i * 0.1} dur={0.5} value={st.v} suffix={st.suf} color={ink} />
            </div>
            <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.16em', color: dim, marginTop: 8 }}>{st.l}</div>
            <div style={{ width: seg(progress, 0.4 + i * 0.1, 0.7, E.easeOutCubic) * 120, height: 4, background: ink, marginTop: 14 }} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Quote({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const words = (s.quote || 'This is the fastest we have ever shipped. Full stop.').split(' ');
  const markPop = M.pop(progress, 0.06, 0.4, 0.4);
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'TESTIMONIAL'}>
      <div style={{ position: 'absolute', left: 150, top: 140, ...markPop, transformOrigin: 'left top', fontFamily: DISP, fontWeight: 900, fontSize: 360, lineHeight: 0.7, color: rgba(theme.accent, 0.9) }}>“</div>
      <div style={{ position: 'absolute', left: 150, right: 150, top: 340, display: 'flex', flexWrap: 'wrap' }}>
        {words.map((w, i) => {
          const o = seg(progress, 0.18 + i * 0.028, 0.18 + i * 0.028 + 0.14, E.easeOutQuad);
          const ty = (1 - o) * 22;
          return <span key={i} style={{ opacity: o, transform: `translateY(${ty}px)`, fontWeight: 800, fontSize: 76, lineHeight: 1.15, letterSpacing: '-0.03em', color: theme.ink, marginRight: 22 }}>{w}</span>;
        })}
      </div>
      <div style={{ position: 'absolute', left: 152, bottom: 210, display: 'flex', alignItems: 'center', gap: 20, ...M.rise(progress, 0.62, 0.24, 40) }}>
        <div style={{ width: seg(progress, 0.62, 0.86, E.easeOutExpo) * 64, height: 5, background: theme.accent }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 30, color: theme.ink, letterSpacing: '-0.01em' }}>{s.author || 'Alex Rivera'}</div>
          <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', color: rgba(theme.ink, 0.55), marginTop: 4 }}>{s.role || 'HEAD OF PRODUCT · NORTHWIND'}</div>
        </div>
      </div>
    </Frame>
  );
}

function Gallery({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const headRise = M.rise(progress, 0.08, 0.22, 50);
  const pan = lerp(0, -30, M.draw(progress, 0.3, 0.65, E.easeInOutSine));
  const tile = (at, dir) => {
    const t = seg(progress, at, at + 0.3, E.easeOutBack);
    return { opacity: seg(progress, at, at + 0.14, E.easeOutQuad), transform: `translate(${lerp(dir * 120, 0, t)}px, ${lerp(40, 0, t)}px)` };
  };
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'SHOWCASE'}>
      <div style={{ position: 'absolute', left: 96, top: 122, ...headRise }}>
        <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.24em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || 'THE FULL PICTURE'}</div>
        <div style={{ maxWidth: 1000, fontWeight: 900, fontSize: 88, lineHeight: 0.92, letterSpacing: '-0.04em', textTransform: 'uppercase', color: theme.ink, whiteSpace: 'pre-line' }}>{splitLines(s.headline || 'Everything|you need.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 96, right: 96, top: 350, height: 560, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gridTemplateRows: '1fr 1fr', gap: 22, transform: `translateY(${pan}px)` }}>
        <div style={{ gridRow: 'span 2', borderRadius: 16, overflow: 'hidden', border: `1px solid ${rgba(theme.ink, 0.14)}`, ...tile(0.24, -1) }}>
          <MediaSlot src={s.shotA} kind="product" label="PRODUCT PHOTO" />
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${rgba(theme.ink, 0.14)}`, ...tile(0.34, 1) }}>
          <MediaSlot src={s.shotB} kind="shot" label="DASHBOARD SHOT" />
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${rgba(theme.accent, 0.5)}`, background: rgba(theme.accent, 0.1), display: 'grid', placeItems: 'center', ...tile(0.44, 1) }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontWeight: 900, fontSize: 84, lineHeight: 1, color: theme.accent, letterSpacing: '-0.04em' }}>{s.badge || '4.9★'}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.16em', color: rgba(theme.ink, 0.6), marginTop: 8 }}>{s.badgeLabel || '10K+ REVIEWS'}</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function CTA({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const brandRise = M.rise(progress, 0.1, 0.26, 80);
  const pill = M.pop(progress, 0.4, 0.4, 0.5);
  const ringR = 300;
  const ring = M.draw(progress, 0.15, 0.7, E.easeInOutCubic);
  return (
    <Frame progress={progress} index={index} count={count} localTime={localTime} statusLabel={s.kicker || 'GET STARTED'}>
      <Streaks progress={progress} color={theme.accent} from={0.02} dur={0.34} />
      <Burst progress={progress} at={0.36} color={theme.accent} cx={960} cy={500} />
      <svg width={ringR * 2} height={ringR * 2} style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)' }}>
        <circle cx={ringR} cy={ringR} r={ringR - 20} fill="none" stroke={rgba(theme.accent, 0.28)} strokeWidth="2"
          strokeDasharray={2 * Math.PI * (ringR - 20)} strokeDashoffset={2 * Math.PI * (ringR - 20) * (1 - ring)}
          strokeLinecap="round" transform={`rotate(-90 ${ringR} ${ringR})`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...M.rise(progress, 0.06, 0.22, 30), fontFamily: MONO, fontSize: 20, letterSpacing: '0.3em', color: theme.accent, textTransform: 'uppercase', marginBottom: 18 }}>{s.eyebrow || 'READY WHEN YOU ARE'}</div>
        <div style={{ ...brandRise, maxWidth: 1300, fontWeight: 900, fontSize: 168, lineHeight: 0.88, letterSpacing: '-0.05em', textTransform: 'uppercase', color: theme.ink, textAlign: 'center', whiteSpace: 'pre-line' }}>{splitLines(s.headline || 'Start|building.')}</div>
        <div style={{ ...pill, marginTop: 44, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '20px 40px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent, theme), fontWeight: 800, fontSize: 28, letterSpacing: '0.02em', boxShadow: `0 0 60px ${rgba(theme.accent, 0.5)}` }}>
            {s.cta || 'START FREE'} <span style={{ fontSize: 30 }}>→</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.14em', color: rgba(theme.ink, 0.7) }}>{s.url || theme.url}</div>
        </div>
      </div>
      <Chevrons localTime={localTime} color={theme.accent} x={480} y={540} n={4} size={26} />
      <Chevrons localTime={localTime} color={theme.accent} x={1300} y={540} n={4} size={26} dir={-1} />
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const SCENE_MAP = { Intro, Statement, Feature, Mobile, Stats, Quote, Gallery, CTA };

function MomentumFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const grounds = { Graphite: '#131210', Midnight: '#0A0E16', Ink: '#17130F' };
  const theme = {
    accent: t.accent || '#FF4B2B',
    ground: grounds[t.ground] || grounds.Graphite,
    ink: '#F5F2EA',
    brand: (t.brandName || 'MOMENTUM').toUpperCase(),
    url: t.url || 'momentum.app',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.ground} transition="cut">
          {SCENE_MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#FF4B2B', '#3D7BFF', '#12C7A6', '#8B5CF6', '#FF2E88']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Stage" />
        <TweakRadio label="Ground" value={t.ground} options={['Graphite', 'Midnight', 'Ink']} onChange={v => setTweak('ground', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.MomentumFilm = MomentumFilm;
