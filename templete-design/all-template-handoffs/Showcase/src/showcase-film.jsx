/* showcase-film.jsx — "SHOWCASE" annotated product-tour template.
   Screenshot-forward: device frames, zoom-ins, drawn annotation arrows + callouts,
   highlight boxes, a moving cursor, and a multi-screenshot montage.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#2F6BFF', brand: 'SHOWCASE', url: 'yourapp.com',
  bg: '#EEF1F7', panel: '#FFFFFF', ink: '#131722', sub: '#5B6472', line: '#D9DEE8', mark: '#FFC53D',
});
const useTheme = () => React.useContext(ThemeContext);
const DISP = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.22, dist = 50) => { const t = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.32, from = 0.5) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.6 ? '#131722' : '#FFFFFF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ── Camera: clean slide-push flow between scenes ─────────────────────────────
function scam(progress) {
  const IN = 0.12, OUT = 0.88;
  let tx = 0, sc = 1 + 0.03 * E.easeInOutSine(progress), op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); tx += (1 - t) * 200; op = seg(progress, 0, IN * 0.7, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); tx += -t * 200; op = 1 - seg(progress, OUT + (1 - OUT) * 0.5, 1, E.easeInQuad); }
  return { transform: `translateX(${tx.toFixed(1)}px) scale(${sc.toFixed(4)})`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' };
}

// ── Backdrop (colorful animated blobs + gradient wash + grid) ────────────────
function Backdrop({ theme, clock }) {
  const blobs = [
    { c: theme.accent, w: 660, x: -190, y: -250, sx: 0.5, sy: 0.4, o: 0.17 },
    { c: '#3FA9F5', w: 560, x: 1430, y: -230, sx: 0.4, sy: 0.5, o: 0.16 },
    { c: '#57B894', w: 520, x: -170, y: 700, sx: 0.45, sy: 0.35, o: 0.15 },
    { c: '#FFC53D', w: 600, x: 1370, y: 640, sx: 0.5, sy: 0.45, o: 0.17 },
    { c: '#8B5CF6', w: 440, x: 780, y: 800, sx: 0.6, sy: 0.5, o: 0.11 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${theme.bg} 0%, #FFFFFF 52%, ${theme.bg} 100%)`, overflow: 'hidden' }}>
      {blobs.map((b, i) => (
        <div key={i} style={{ position: 'absolute', width: b.w, height: b.w, borderRadius: '50%', left: b.x, top: b.y, background: rgba(b.c, b.o), filter: 'blur(52px)', transform: `translate(${Math.sin(clock * b.sx + i) * 28}px, ${Math.cos(clock * b.sy + i) * 24}px)` }} />
      ))}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${rgba(theme.ink, 0.045)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(theme.ink, 0.045)} 1px, transparent 1px)`, backgroundSize: '52px 52px', opacity: 0.5 }} />
    </div>
  );
}

// ── Ambient sky: paper planes on dashed trails, a flock of birds, floaty dots ─
const SKY_HUES = ['#3FA9F5', '#57B894', '#FFC53D', '#F25C8A', '#8B5CF6'];
function Bird({ x, y, s, clock, ph, color }) {
  const flap = 6 + Math.sin(clock * 6 + ph) * 9;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke={color} strokeWidth="4" strokeLinecap="round" fill="none">
      <path d={`M-19 0 Q -10 ${-flap} 0 0`} /><path d={`M19 0 Q 10 ${-flap} 0 0`} />
    </g>
  );
}
function Plane({ x, y, rot, color }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M-16 0 q -90 -4 -168 -32" stroke={color} strokeWidth="3" strokeDasharray="2 11" fill="none" opacity="0.55" strokeLinecap="round" />
      <path d="M24 0 L-20 -15 L-7 0 L-20 15 Z" fill={color} />
      <path d="M-7 0 L-20 -15 L-11 0 Z" fill={rgba('#000000', 0.16)} />
    </g>
  );
}
function SkyLife({ clock, theme }) {
  const W = 1920;
  const p1x = ((clock * 118 + 200) % (W + 520)) - 260;
  const p2x = W - (((clock * 92 + 940) % (W + 520)) - 260);
  const birds = [0, 1, 2, 3, 4].map(i => ({ x: ((clock * 52 + i * 96) % (W + 320)) - 160, y: 150 + (i % 3) * 24 + Math.sin(clock * 0.9 + i) * 10, s: 1 - (i % 3) * 0.12, ph: i * 0.8 }));
  const dots = [[300, 520], [1600, 470], [900, 300], [1420, 830], [500, 840], [1150, 640], [720, 470]];
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {dots.map((d, i) => <circle key={i} cx={d[0]} cy={d[1] + Math.sin(clock * 0.7 + i) * 16} r={7 + (i % 3) * 3} fill={i === 0 ? theme.accent : SKY_HUES[i % SKY_HUES.length]} opacity="0.5" />)}
      {birds.map((b, i) => <Bird key={i} x={b.x} y={b.y} s={b.s} clock={clock} ph={b.ph} color={rgba(theme.ink, 0.42)} />)}
      <g opacity="0.9"><Plane x={p1x} y={190 + Math.sin(clock * 0.8) * 40} rot={-9 + Math.sin(clock) * 4} color={theme.accent} /></g>
      <g opacity="0.75" transform="scale(-1 1)" style={{ transformOrigin: 'center' }}><Plane x={W - p2x} y={350 + Math.cos(clock * 0.7) * 32} rot={-7 + Math.cos(clock) * 4} color={'#3FA9F5'} /></g>
    </svg>
  );
}

// ── Device frames ────────────────────────────────────────────────────────────
function BrowserFrame({ theme, url, children, badge }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: theme.panel, border: `1px solid ${theme.line}`, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.18)}`, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ height: 46, flexShrink: 0, background: '#F6F8FC', borderBottom: `1px solid ${theme.line}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 12, background: c }} />)}
        <div style={{ marginLeft: 14, flex: 1, maxWidth: 420, height: 26, borderRadius: 13, background: '#EAEEF5', display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: MONO, fontSize: 12, color: theme.sub }}>{url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{children}</div>
      {badge}
    </div>
  );
}
function PhoneFrame({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 46, padding: 12, background: theme.ink, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.28)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', width: 100, height: 26, borderRadius: 26, background: theme.ink, zIndex: 3 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: theme.panel, position: 'relative' }}>{children}</div>
    </div>
  );
}

function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.045)} 0 13px, ${rgba(theme.ink, 0.02)} 13px 26px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, border: `2px dashed ${rgba(theme.accent, 0.8)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 26, fontWeight: 400 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.12em', color: theme.sub, textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: rgba(theme.ink, 0.3) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}

// Screenshot that zooms/pans to a focus region within its frame ("Ken Burns to a spot")
function ZoomShot({ src, kind, label, theme, progress, at = 0, dur = 0.7, zoom = 1.35, fx = 50, fy = 40 }) {
  const t = M.draw(progress, at, dur, E.easeInOutCubic);
  const sc = lerp(1, zoom, t);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${sc})`, transformOrigin: `${fx}% ${fy}%`, willChange: 'transform' }}>
        <MediaSlot src={src} kind={kind} label={label} theme={theme} />
      </div>
    </div>
  );
}

// ── Annotation arrow (draws itself, curved, arrowhead) ───────────────────────
function Arrow({ progress, at, dur = 0.42, from, to, bend = 70, color, width = 5 }) {
  const t = M.draw(progress, at, dur, E.easeOutCubic);
  if (t <= 0) return null;
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const cx = mx - dy / len * bend, cy = my + dx / len * bend;
  const L = 1600;
  const ang = Math.atan2(to[1] - cy, to[0] - cx) * 180 / Math.PI;
  const headOn = t > 0.82 ? seg(t, 0.82, 1, E.easeOutBack) : 0;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <path d={`M${from[0]} ${from[1]} Q ${cx} ${cy} ${to[0]} ${to[1]}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - t)} />
      <g transform={`translate(${to[0]} ${to[1]}) rotate(${ang}) scale(${headOn})`}><path d="M2 0 L-20 -12 L-13 0 L-20 12 Z" fill={color} /></g>
    </svg>
  );
}

// Callout label bubble that pops at a point
function Callout({ progress, at, x, y, num, text, theme, align = 'left' }) {
  return (
    <div style={{ ...M.pop(progress, at, 0.3, 0.5), position: 'absolute', left: x, top: y, transform: `translate(${align === 'right' ? '-100%' : '0'}, 0)`, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 10px', background: theme.ink, color: '#fff', borderRadius: 12, boxShadow: `0 10px 30px ${rgba(theme.ink, 0.3)}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: theme.accent, display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 14, color: inkOn(theme.accent) }}>{num}</span>
      <span style={{ fontFamily: DISP, fontWeight: 600, fontSize: 20 }}>{text}</span>
    </div>
  );
}

// Pulsing highlight box around a UI region
function Highlight({ progress, at, x, y, w, h, theme, pulse = 0 }) {
  const on = M.draw(progress, at, 0.3, E.easeOutBack);
  const p = 0.5 + 0.5 * Math.sin(pulse * 4);
  if (on <= 0) return null;
  return <div style={{ position: 'absolute', left: x, top: y, width: w * on, height: h, borderRadius: 12, border: `3px solid ${theme.accent}`, boxShadow: `0 0 0 ${6 + p * 6}px ${rgba(theme.accent, 0.14)}`, pointerEvents: 'none' }} />;
}

// Moving cursor with a click ripple
function Cursor({ progress, at = 0, dur = 0.7, from, to, clickAt, theme }) {
  const t = seg(progress, at, at + dur, E.easeInOutCubic);
  const x = lerp(from[0], to[0], t), y = lerp(from[1], to[1], t);
  const rip = clickAt != null ? seg(progress, clickAt, clickAt + 0.4, E.easeOutCubic) : 0;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {rip > 0 && rip < 1 && <circle cx={to[0]} cy={to[1]} r={10 + rip * 42} fill="none" stroke={theme.accent} strokeWidth={3} opacity={1 - rip} />}
      <g transform={`translate(${x} ${y})`}>
        <path d="M0 0 L0 26 L7 19 L12 30 L16 28 L11 18 L20 18 Z" fill="#fff" stroke={theme.ink} strokeWidth="2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, background: theme.panel, border: `1px solid ${theme.line}`, boxShadow: `0 4px 14px ${rgba(theme.ink, 0.08)}`, fontFamily: MONO, fontSize: 14, letterSpacing: '0.04em', color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 7, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

// ── Chrome (clean tour HUD) ──────────────────────────────────────────────────
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 46, left: 60, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: theme.accent, display: 'grid', placeItems: 'center', color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 700, fontSize: 18 }}>{theme.brand.slice(0, 1)}</span>
        <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 22, color: theme.ink, letterSpacing: '-0.01em' }}>{theme.brand}</span>
        {label && <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.14em', color: theme.sub, textTransform: 'uppercase' }}>／ {label}</span>}
      </div>
      <div style={{ position: 'absolute', bottom: 52, left: 60, right: 60, height: 4, borderRadius: 4, background: rgba(theme.ink, 0.08) }}>
      </div>
    </React.Fragment>
  );
}

function Frame({ progress, index, count, label, children }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 31;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...scam(progress) }}>
        <Backdrop theme={theme} clock={clock} />
        <SkyLife clock={clock} theme={theme} />
        {children}
      </div>
      <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════

function Intro({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const shot = seg(progress, 0.16, 0.5, E.easeOutBack);
  const head = M.rise(progress, 0.05, 0.28, 44);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'GUIDED TOUR'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', ...head }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.22em', color: theme.accent, textTransform: 'uppercase', marginBottom: 14 }}>{s.eyebrow || 'A 30-SECOND TOUR'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 104, lineHeight: 0.96, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'See how it works.')}</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 400, width: 1120, height: 590, transform: `translateX(-50%) translateY(${(1 - shot) * 520}px) scale(${lerp(0.94, 1, shot)})`, transformOrigin: 'center bottom' }}>
        <BrowserFrame theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" label="HERO SCREENSHOT" theme={theme} /></BrowserFrame>
      </div>
      <Cursor progress={progress} at={0.5} dur={0.4} from={[1180, 900]} to={[980, 640]} clickAt={0.9} theme={theme} />
    </Frame>
  );
}

function Tour({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.08, 0.36, E.easeOutBack);
  const head = M.rise(progress, 0.12, 0.28, 40);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'FEATURE'}>
      <div style={{ position: 'absolute', left: 96, top: 190, width: 560, ...head }}>
        <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.2em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || '01 — THE DASHBOARD'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 76, lineHeight: 0.98, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'One view,|zero noise.')}</div>
        <div style={{ marginTop: 22, fontFamily: DISP, fontWeight: 400, fontSize: 22, lineHeight: 1.5, color: theme.sub, maxWidth: 440 }}>{s.body || 'Everything that matters, surfaced the moment you land.'}</div>
      </div>
      <div style={{ position: 'absolute', right: 90, top: 200, width: 1000, height: 620, transform: `translateX(${(1 - inT) * 900}px)` }}>
        <BrowserFrame theme={theme} url={s.url || theme.url}>
          <ZoomShot src={s.shot} kind="desktop" theme={theme} progress={progress} at={0.42} dur={0.55} zoom={1.4} fx={68} fy={40} />
        </BrowserFrame>
      </div>
      <Highlight progress={progress} at={0.52} x={1300} y={330} w={330} h={150} theme={theme} pulse={localTime} />
      <Arrow progress={progress} at={0.6} from={[720, 470]} to={[1290, 400]} bend={-90} color={theme.accent} />
      <Callout progress={progress} at={0.64} x={470} y={470} num={s.calloutNum || '1'} text={s.callout || 'Live metrics'} theme={theme} />
    </Frame>
  );
}

function Detail({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.08, 0.36, E.easeOutBack);
  const spots = s.spots || [{ n: '1', t: 'One-click actions', ax: 560, ay: 300, tx: 980, ty: 330 }, { n: '2', t: 'Real-time sync', ax: 560, ay: 560, tx: 1000, ty: 560 }, { n: '3', t: 'Your whole team', ax: 1560, ay: 760, tx: 1360, ty: 640 }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'HOW IT WORKS'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', ...M.rise(progress, 0.08, 0.26, 36) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 58, letterSpacing: '-0.02em', color: theme.ink }}>{s.headline || 'Three things to notice.'}</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 250, width: 1180, height: 660, transform: `translateX(-50%) scale(${lerp(0.95, 1, inT)})`, transformOrigin: 'center top', opacity: inT }}>
        <BrowserFrame theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></BrowserFrame>
      </div>
      {spots.map((sp, i) => (
        <React.Fragment key={i}>
          <Arrow progress={progress} at={0.4 + i * 0.16} from={[sp.ax, sp.ay]} to={[sp.tx, sp.ty]} bend={i % 2 ? 60 : -60} color={theme.accent} />
          <Callout progress={progress} at={0.44 + i * 0.16} x={sp.ax} y={sp.ay - 20} num={sp.n} text={sp.t} theme={theme} align={sp.ax > 960 ? 'right' : 'left'} />
        </React.Fragment>
      ))}
    </Frame>
  );
}

function Mobile({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.1, 0.4, E.easeOutBack);
  const head = M.rise(progress, 0.16, 0.28, 40);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'ON MOBILE'}>
      <div style={{ position: 'absolute', right: 130, top: 300, width: 620, textAlign: 'right', ...head }}>
        <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.2em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || '02 — POCKET-SIZED'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 82, lineHeight: 0.98, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'Take it|with you.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 380, top: 130, width: 372, height: 780, transform: `translateY(${(1 - inT) * 820}px)` }}>
        <PhoneFrame theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></PhoneFrame>
      </div>
      <Arrow progress={progress} at={0.5} from={[820, 420]} to={[610, 380]} bend={50} color={theme.accent} />
      <Callout progress={progress} at={0.54} x={840} y={400} num={s.calloutNum || '1'} text={s.callout || 'Instant alerts'} theme={theme} />
      <Cursor progress={progress} at={0.62} dur={0.4} from={[900, 780]} to={[566, 620]} clickAt={0.86} theme={theme} />
    </Frame>
  );
}

function Montage({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const drift = Math.sin(localTime * 0.6) * 10;
  // 6 tiles fly in from staggered directions
  const tiles = [
    { x: 96, y: 250, w: 540, h: 320, dir: [-1, 0], k: 'desktop' },
    { x: 670, y: 250, w: 380, h: 320, dir: [0, -1], k: 'shot' },
    { x: 1084, y: 250, w: 740, h: 320, dir: [1, 0], k: 'desktop' },
    { x: 96, y: 606, w: 380, h: 320, dir: [0, 1], k: 'shot' },
    { x: 510, y: 606, w: 620, h: 320, dir: [0, 1], k: 'desktop' },
    { x: 1164, y: 606, w: 660, h: 320, dir: [1, 1], k: 'shot' },
  ];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'EVERYTHING'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 36), zIndex: 5 }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 66, letterSpacing: '-0.02em', color: theme.ink }}>{s.headline || 'Every screen, one glance.'}</div>
      </div>
      <div style={{ transform: `translateY(${drift}px)` }}>
        {tiles.map((t, i) => {
          const at = 0.16 + i * 0.08;
          const e = seg(progress, at, at + 0.34, E.easeOutBack);
          const ox = t.dir[0] * 500 * (1 - e), oy = t.dir[1] * 400 * (1 - e);
          return (
            <div key={i} style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, opacity: seg(progress, at, at + 0.12, E.easeOutQuad), transform: `translate(${ox}px, ${oy}px) scale(${lerp(0.9, 1, e)})` }}>
              <BrowserFrame theme={theme} url={theme.url}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></BrowserFrame>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function Proof({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 12, suf: 'K+', l: 'TEAMS' }, { v: 4.9, suf: '★', l: 'RATING' }, { v: 99.9, suf: '%', l: 'UPTIME' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'BY THE NUMBERS'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 200, textAlign: 'center', ...M.rise(progress, 0.06, 0.26, 36) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 80, letterSpacing: '-0.02em', color: theme.ink }}>{s.headline || 'Loved at scale.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 420, display: 'flex', justifyContent: 'center', gap: 60 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.3 + i * 0.12, 0.4, 0.6), background: theme.panel, border: `1px solid ${theme.line}`, borderRadius: 24, boxShadow: `0 20px 50px ${rgba(theme.ink, 0.1)}`, padding: '44px 60px', textAlign: 'center', minWidth: 320 }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 108, lineHeight: 1, letterSpacing: '-0.03em', color: theme.accent }}><Counter progress={progress} at={0.34 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.16em', color: theme.sub, marginTop: 10 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function CTA({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.rise(progress, 0.1, 0.3, 50);
  const pill = M.pop(progress, 0.4, 0.4, 0.5);
  const logo = M.pop(progress, 0.2, 0.5, 0.4);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'GET STARTED'}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...logo, width: 132, height: 132, borderRadius: 30, background: theme.panel, border: `1px solid ${theme.line}`, boxShadow: `0 20px 50px ${rgba(theme.ink, 0.12)}`, overflow: 'hidden', padding: 16, marginBottom: 30 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 700, fontSize: 118, lineHeight: 0.94, letterSpacing: '-0.03em', color: theme.ink, textAlign: 'center' }}>{splitLines(s.headline || 'Start the|free trial.')}</div>
        <div style={{ ...pill, marginTop: 40, display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 42px', borderRadius: 14, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 600, fontSize: 28, boxShadow: `0 14px 34px ${rgba(theme.accent, 0.4)}` }}>{s.cta || 'GET STARTED'} <span style={{ fontSize: 30 }}>→</span></div>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.1em', color: theme.sub }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Intro, Tour, Detail, Mobile, Montage, Proof, CTA };

function ShowcaseFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#2F6BFF', brand: (t.brandName || 'SHOWCASE').toUpperCase(), url: t.url || 'yourapp.com',
    bg: '#EEF1F7', panel: '#FFFFFF', ink: '#131722', sub: '#5B6472', line: '#D9DEE8', mark: '#FFC53D',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.bg} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#2F6BFF', '#F2683C', '#10B981', '#8B5CF6', '#EC4899']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.ShowcaseFilm = ShowcaseFilm;
