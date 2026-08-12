/* drive-film.jsx — "DRIVE" golden-hour highway template, PRODUCT-FIRST.
   The product screenshots are the hero (center stage); cars are a continuously-
   driving ambient strip along the bottom (constant motion). Mounted after
   animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#12B5C8', brand: 'DRIVE', url: 'drive.app', car: '#F2C14E',
  skyA: '#FFE3A3', skyB: '#FCA26A', skyC: '#EE7B7B', sun: '#FFD36B',
  skyline: '#5A3F66', skylineFar: '#835F8E', road: '#2B2733', roadEdge: '#4C4655', dash: '#F5E7C6',
  ink: '#2A2233', paper: '#FFF7EA',
});
const useTheme = () => React.useContext(ThemeContext);
const DISP = "'Barlow Semi Condensed', system-ui, sans-serif";
const BODY = "'Sora', system-ui, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.22, dist = 54) => { const t = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.32, from = 0.5) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.58 ? '#2A2233' : '#FFF7EA'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

const HORIZON = 892, ROAD_Y = 1004;

// Camera: smooth drive-by slide between scenes
function dcam(progress) {
  const IN = 0.12, OUT = 0.88;
  let tx = 0, sc = 1 + 0.02 * E.easeInOutSine(progress), op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); tx += (1 - t) * 240; op = seg(progress, 0, IN * 0.7, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); tx += -t * 240; op = 1 - seg(progress, OUT + (1 - OUT) * 0.5, 1, E.easeInQuad); }
  return { transform: `translateX(${tx.toFixed(1)}px) scale(${sc.toFixed(4)})`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' };
}

// ═══════════════════════════ VECTOR WORLD ═══════════════════════════════════
function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}
function Building({ x, y, w, h, color, lit }) {
  const wins = [];
  for (let r = 0; r < Math.floor(h / 46) - 1; r++) for (let c = 0; c < Math.floor(w / 34); c++) if ((r * 7 + c * 3) % 4 === 0) wins.push(<rect key={r + '-' + c} x={x + 12 + c * 34} y={y + 18 + r * 46} width="15" height="22" fill={lit} opacity="0.7" />);
  return <g><rect x={x} y={y} width={w} height={h} fill={color} /><rect x={x} y={y} width={w} height="5" fill={rgba('#000000', 0.12)} />{wins}</g>;
}
function Wheel({ cx, cy, r, spin }) {
  return <g transform={`translate(${cx} ${cy})`}><circle r={r} fill="#211E28" /><g transform={`rotate(${spin})`}><circle r={r * 0.5} fill="#726C7E" />{[0, 72, 144, 216, 288].map(a => <rect key={a} x="-2" y={-r * 0.5} width="4" height={r * 0.5} rx="2" fill="#8E8898" transform={`rotate(${a})`} />)}<circle r={r * 0.16} fill="#B8B2C0" /></g></g>;
}
function Car({ x, y, scale = 1, facing = 1, color, spin = 0, lights = true }) {
  const win = rgba('#0E1626', 0.5);
  return (
    <g transform={`translate(${x} ${y}) scale(${facing * scale} ${scale})`}>
      <ellipse cx="0" cy="12" rx="118" ry="14" fill={rgba('#000000', 0.22)} />
      <Wheel cx={-62} cy={0} r={30} spin={spin} /><Wheel cx={64} cy={0} r={30} spin={spin} />
      <path d="M-52 -50 L-34 -86 Q-28 -94 -14 -94 L38 -94 Q52 -94 60 -82 L78 -50 Z" fill={color} />
      <rect x="-104" y="-58" width="212" height="50" rx="20" fill={color} />
      <rect x="-104" y="-30" width="212" height="14" fill={rgba('#000000', 0.16)} />
      <path d="M-30 -54 L-16 -84 L14 -84 L14 -54 Z" fill={win} /><path d="M22 -54 L22 -84 L34 -84 L50 -54 Z" fill={win} />
      {lights && <rect x="100" y="-46" width="12" height="15" rx="5" fill="#FFF3C4" />}
      {lights && <rect x="-112" y="-46" width="9" height="15" rx="4" fill="#FF5A4E" />}
    </g>
  );
}
// Full backdrop incl. the ambient, always-driving car strip (constant motion)
function RoadWorld({ theme, clock }) {
  const unit = 210, off = (clock * 260) % unit;
  const cloudX = (o) => ((o - clock * 26) % 2400 + 2400) % 2400 - 240;
  const farX = -((clock * 40) % 420), nearX = -((clock * 90) % 520);
  const cars = [{ c: theme.car, sp: 150, o: 0, s: 0.5 }, { c: '#F2683C', sp: 108, o: 760, s: 0.44 }, { c: theme.paper, sp: 205, o: 1500, s: 0.4 }];
  return (
    <React.Fragment>
      <defs>
        <linearGradient id="dvSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.skyA} /><stop offset="0.55" stopColor={theme.skyB} /><stop offset="1" stopColor={theme.skyC} /></linearGradient>
        <radialGradient id="dvSun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#FFF3C8" /><stop offset="0.5" stopColor={theme.sun} /><stop offset="1" stopColor={rgba(theme.sun, 0)} /></radialGradient>
      </defs>
      <rect x="0" y="0" width="1920" height={HORIZON + 20} fill="url(#dvSky)" />
      <circle cx="1300" cy={HORIZON - 250} r="340" fill="url(#dvSun)" opacity="0.8" />
      <circle cx="1300" cy={HORIZON - 250} r="120" fill="#FFEFC2" opacity="0.9" />
      {[[300, 150, 1.0], [900, 120, 0.8], [1600, 175, 0.95]].map((c, i) => (
        <g key={i} transform={`translate(${cloudX(c[0])} ${c[1]}) scale(${c[2]})`} fill={rgba('#FFFFFF', 0.6)}><ellipse cx="0" cy="0" rx="86" ry="30" /><ellipse cx="66" cy="10" rx="54" ry="24" /><ellipse cx="-60" cy="12" rx="48" ry="22" /></g>
      ))}
      <g transform={`translate(${farX} 0)`} opacity="0.8">{[0, 420, 840, 1260, 1680, 2100].map((bx, i) => <Building key={i} x={bx + 40} y={HORIZON - 150 - (i % 3) * 40} w={150} h={150 + (i % 3) * 40} color={theme.skylineFar} lit={theme.sun} />)}</g>
      <g transform={`translate(${nearX} 0)`}>{[0, 520, 1040, 1560, 2080].map((bx, i) => <Building key={i} x={bx} y={HORIZON - 210 - (i % 3) * 56} w={210} h={210 + (i % 3) * 56} color={theme.skyline} lit={theme.sun} />)}</g>
      <rect x="0" y={HORIZON} width="1920" height={1080 - HORIZON} fill={theme.road} />
      <rect x="0" y={HORIZON} width="1920" height="8" fill={theme.roadEdge} />
      <rect x="0" y={HORIZON + 8} width="1920" height="3" fill={rgba(theme.sun, 0.35)} />
      {new Array(16).fill(0).map((_, i) => <rect key={i} x={i * unit - off - unit} y={ROAD_Y + 30} width={120} height="8" rx="4" fill={theme.dash} opacity="0.85" />)}
      {cars.map((c, i) => { const x = ((clock * c.sp + c.o) % (1920 + 520)) - 260; return <Car key={i} x={x} y={ROAD_Y} scale={c.s} color={c.c} spin={clock * c.sp * 2.4} lights />; })}
    </React.Fragment>
  );
}

// ── Product device frames (the hero) ─────────────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.025)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, border: `2px dashed ${rgba(theme.accent, 0.85)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 28 }}>+</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 15, letterSpacing: '0.1em', color: rgba(theme.ink, 0.62), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 11, letterSpacing: '0.14em', color: rgba(theme.ink, 0.32) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function BrowserCard({ theme, url, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 18, overflow: 'hidden', background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.15)}`, boxShadow: `0 50px 100px ${rgba('#2A1420', 0.4)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 50, flexShrink: 0, background: '#FBEFDD', borderBottom: `1px solid ${rgba(theme.ink, 0.1)}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 13, height: 13, borderRadius: 13, background: c }} />)}
        <div style={{ marginLeft: 14, flex: 1, maxWidth: 440, height: 26, borderRadius: 13, background: rgba(theme.ink, 0.06), display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: BODY, fontWeight: 600, fontSize: 13, color: rgba(theme.ink, 0.55) }}>{url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 46, padding: 13, background: theme.ink, boxShadow: `0 50px 100px ${rgba('#2A1420', 0.45)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', width: 96, height: 24, borderRadius: 24, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, background: theme.paper, border: `2px solid ${theme.ink}`, boxShadow: `0 5px 0 ${rgba(theme.ink, 0.16)}`, fontFamily: BODY, fontWeight: 700, fontSize: 16, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 8, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }
function Speedo({ progress, at, theme, cx, cy, r }) {
  const t = M.draw(progress, at, 0.7, E.easeOutCubic), a0 = 140, a1 = 400, ang = lerp(a0, a1, t);
  const pt = (deg, rr) => [cx + Math.cos(deg * Math.PI / 180) * rr, cy + Math.sin(deg * Math.PI / 180) * rr];
  const arc = (f, to, rr) => { const [x1, y1] = pt(f, rr), [x2, y2] = pt(to, rr); return `M${x1} ${y1} A ${rr} ${rr} 0 ${to - f > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
  const [nx, ny] = pt(ang, r - 24);
  return <g><circle cx={cx} cy={cy} r={r + 16} fill={theme.paper} stroke={theme.ink} strokeWidth="4" /><path d={arc(a0, a1, r)} fill="none" stroke={rgba(theme.ink, 0.14)} strokeWidth="13" strokeLinecap="round" /><path d={arc(a0, ang, r)} fill="none" stroke={theme.accent} strokeWidth="13" strokeLinecap="round" /><line x1={cx} y1={cy} x2={nx} y2={ny} stroke={theme.accent} strokeWidth="6" strokeLinecap="round" /><circle cx={cx} cy={cy} r="12" fill={theme.ink} /></g>;
}
// Headline plate for legibility over the sky
function Plate({ children, style }) { const theme = useTheme(); return <div style={{ display: 'inline-block', background: rgba(theme.paper, 0.82), backdropFilter: 'blur(4px)', borderRadius: 18, padding: '14px 30px', boxShadow: `0 10px 30px ${rgba(theme.ink, 0.12)}`, ...style }}>{children}</div>; }

// ── Chrome ───────────────────────────────────────────────────────────────────
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 40, left: 58, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ padding: '6px 14px', borderRadius: 8, background: theme.ink, color: theme.paper, fontFamily: DISP, fontWeight: 700, fontSize: 24, letterSpacing: '0.04em' }}>{theme.brand}</span>
        {label && <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 13, letterSpacing: '0.18em', color: theme.ink, textTransform: 'uppercase' }}>{label}</span>}
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 44, paddingBottom: 22, paddingLeft: 58, paddingRight: 58, display: 'flex', alignItems: 'center', gap: 14, background: `linear-gradient(0deg, ${rgba(theme.ink, 0.62)} 0%, ${rgba(theme.ink, 0.3)} 55%, transparent 100%)` }}>
        <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 14, letterSpacing: '0.12em', color: theme.paper }}>{theme.url}</span>
      </div>
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 28;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.skyB, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...dcam(progress) }}>
        <Scene><RoadWorld theme={theme} clock={clock} /></Scene>
        {children}
      </div>
      <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES (product = hero) ════════════════════════
function Intro({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const shot = seg(progress, 0.18, 0.52, E.easeOutBack);
  const kb = 1 + 0.04 * M.draw(progress, 0.5, 0.5, E.easeInOutSine);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'THE PRODUCT'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', ...M.rise(progress, 0.05, 0.26, 40) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 128, lineHeight: 0.9, letterSpacing: '0.02em', color: theme.ink, textShadow: `0 5px 0 ${rgba(theme.ink, 0.12)}` }}>{s.brand || theme.brand}</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 26, color: theme.ink, background: theme.accent, display: 'inline-block', padding: '7px 22px', borderRadius: 999, marginTop: 4 }}>{s.tagline || 'Your product, in the driver seat.'}</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 300, width: 1160, height: 600, transform: `translateX(-50%) translateY(${(1 - shot) * 520}px) scale(${lerp(0.94, 1, shot) * kb})`, transformOrigin: 'center bottom' }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" label="HERO SCREENSHOT" theme={theme} /></BrowserCard>
      </div>
    </Frame>
  );
}

function Billboards({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const big = seg(progress, 0.08, 0.4, E.easeOutBack);
  const kb = 1 + 0.05 * M.draw(progress, 0.4, 0.55, E.easeInOutSine);
  const ph = seg(progress, 0.34, 0.62, E.easeOutBack);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'SHOWCASE'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 66, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 34), zIndex: 6 }}>
        <Plate><span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 66, letterSpacing: '0.02em', color: theme.ink }}>{s.headline || 'SEEN EVERYWHERE YOU GO'}</span></Plate>
      </div>
      <div style={{ position: 'absolute', left: 150, top: 220, width: 1080, height: 610, transform: `translateY(${(1 - big) * 540}px) scale(${kb})`, transformOrigin: 'center bottom' }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot1} kind="desktop" label="SCREENSHOT 1" theme={theme} /></BrowserCard>
      </div>
      <div style={{ position: 'absolute', right: 130, top: 300, width: 330, height: 620, transform: `translateY(${(1 - ph) * 620}px)`, zIndex: 5 }}>
        <Phone theme={theme}><MediaSlot src={s.shot2} kind="phone" theme={theme} /></Phone>
      </div>
    </Frame>
  );
}

function Feature({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const deskIn = seg(progress, 0.1, 0.42, E.easeOutBack);
  const phoneIn = seg(progress, 0.24, 0.54, E.easeOutBack);
  const chips = s.chips || ['LIVE NAV', 'ONE-TAP PAY', 'TRIP HISTORY'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'FEATURES'}>
      <div style={{ position: 'absolute', left: 96, top: 96, width: 760, ...M.rise(progress, 0.08, 0.26, 36), zIndex: 6 }}>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 20, letterSpacing: '0.14em', color: theme.ink, background: theme.accent, display: 'inline-block', padding: '6px 16px', borderRadius: 8, textTransform: 'uppercase', marginBottom: 14 }}>{s.eyebrow || 'RIDES ALONG'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 86, lineHeight: 0.92, color: theme.ink, textShadow: `0 4px 0 ${rgba(theme.ink, 0.1)}` }}>{splitLines(s.headline || 'Right on your|dashboard.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 96, top: 384, width: 760, height: 470, transform: `translateX(${(1 - deskIn) * -900}px)` }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></BrowserCard>
      </div>
      <div style={{ position: 'absolute', right: 150, top: 210, width: 360, height: 660, transform: `translateY(${(1 - phoneIn) * 700}px)`, zIndex: 5 }}>
        <Phone theme={theme}><MediaSlot src={s.shot2} kind="phone" theme={theme} /></Phone>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 300, display: 'flex', flexDirection: 'column', gap: 14, zIndex: 6 }}>{chips.map((c, i) => <div key={i}><Chip progress={progress} at={0.5 + i * 0.09} text={c} theme={theme} /></div>)}</div>
    </Frame>
  );
}

function Fleet({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [
    { x: 96, y: 250, w: 560, h: 300, k: 'desktop', d: [-1, 0] },
    { x: 690, y: 250, w: 380, h: 300, k: 'phone', d: [0, -1] },
    { x: 1104, y: 250, w: 720, h: 300, k: 'desktop', d: [1, 0] },
    { x: 96, y: 590, w: 720, h: 280, k: 'desktop', d: [0, 1] },
    { x: 852, y: 590, w: 380, h: 280, k: 'phone', d: [0, 1] },
    { x: 1268, y: 590, w: 556, h: 280, k: 'desktop', d: [1, 1] },
  ];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'THE WHOLE APP'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 32), zIndex: 6 }}>
        <Plate><span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 64, color: theme.ink }}>{s.headline || 'EVERY SCREEN, ONE APP'}</span></Plate>
      </div>
      {tiles.map((t, i) => {
        const at = 0.16 + i * 0.08, e = seg(progress, at, at + 0.36, E.easeOutBack);
        return (
          <div key={i} style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, opacity: seg(progress, at, at + 0.12, E.easeOutQuad), transform: `translate(${t.d[0] * 460 * (1 - e)}px, ${t.d[1] * 360 * (1 - e)}px) scale(${lerp(0.9, 1, e)})` }}>
            <BrowserCard theme={theme} url={theme.url}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></BrowserCard>
          </div>
        );
      })}
    </Frame>
  );
}

function Stats({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 2.4, suf: 'M', l: 'TRIPS / DAY' }, { v: 120, suf: '+', l: 'CITIES' }, { v: 4.9, suf: '\u2605', l: 'RIDER RATING' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'BY THE NUMBERS'}>
      <Scene><Speedo progress={progress} at={0.3} theme={theme} cx={1540} cy={360} r={150} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 150, ...M.rise(progress, 0.08, 0.26, 36), zIndex: 6 }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 0.92, color: theme.ink, textShadow: `0 4px 0 ${rgba(theme.ink, 0.1)}` }}>{splitLines(s.headline || 'Built for|the long haul.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 420, display: 'flex', gap: 32 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.34 + i * 0.12, 0.4, 0.6), background: theme.paper, border: `3px solid ${theme.ink}`, borderRadius: 22, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.16)}`, padding: '28px 40px', minWidth: 290 }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 100, lineHeight: 1, color: theme.accent }}><Counter progress={progress} at={0.38 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 18, letterSpacing: '0.08em', color: theme.ink, marginTop: 6 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function CTA({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const shot = seg(progress, 0.12, 0.44, E.easeOutBack);
  const head = M.rise(progress, 0.1, 0.3, 44);
  const pill = M.pop(progress, 0.44, 0.4, 0.5);
  const logo = M.pop(progress, 0.24, 0.5, 0.4);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'GET STARTED'}>
      <div style={{ position: 'absolute', right: 120, top: 220, width: 720, height: 480, transform: `translateY(${(1 - shot) * 560}px) scale(${lerp(0.94, 1, shot)})`, transformOrigin: 'center bottom' }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></BrowserCard>
      </div>
      <div style={{ position: 'absolute', left: 100, top: 210, width: 820, zIndex: 6 }}>
        <div style={{ ...logo, width: 132, height: 132, borderRadius: 26, background: theme.paper, border: `3px solid ${theme.ink}`, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.16)}`, overflow: 'hidden', padding: 15, marginBottom: 22 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 700, fontSize: 128, lineHeight: 0.9, color: theme.ink, textShadow: `0 6px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.headline || 'Let\u2019s get|moving.')}</div>
        <div style={{ ...pill, marginTop: 34, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 44px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 700, fontSize: 34, letterSpacing: '0.02em', boxShadow: `0 8px 0 ${rgba(theme.ink, 0.24)}` }}>{s.cta || 'DOWNLOAD NOW'} <span style={{ fontSize: 32 }}>→</span></div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 22, color: theme.ink }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Intro, Billboards, Feature, Fleet, Stats, CTA };

function DriveFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#12B5C8', brand: (t.brandName || 'DRIVE').toUpperCase(), url: t.url || 'drive.app',
    skyA: '#FFE3A3', skyB: '#FCA26A', skyC: '#EE7B7B', sun: '#FFD36B',
    skyline: '#5A3F66', skylineFar: '#835F8E', road: '#2B2733', roadEdge: '#4C4655', dash: '#F5E7C6',
    ink: '#2A2233', paper: '#FFF7EA', car: t.carColor || '#F2C14E',
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
        <TweakColor label="Accent" value={t.accent} options={['#12B5C8', '#F2683C', '#2F6BFF', '#12B37E', '#E23A6E']} onChange={v => setTweak('accent', v)} />
        <TweakColor label="Car color" value={t.carColor} options={['#F2C14E', '#12B5C8', '#F2683C', '#FFF7EA', '#2A2233']} onChange={v => setTweak('carColor', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.DriveFilm = DriveFilm;
