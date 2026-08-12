/* flightvert-film.jsx — "SKYWARD" vertical 9:16 flight-takeoff template (existing Flight idea,
   portrait). Runway roll, rotate & climb with contrail, cabin-window screenshots, instruments.
   Self-contained. 1080×1920. Mounted after animations-v2.jsx + tweaks-panel.jsx. */

const ThemeContext = React.createContext({
  accent: '#FF5630', brand: 'SKYWARD', url: 'skyward.air',
  skyA: '#BFE6FF', skyB: '#8FCBF5', skyC: '#E9F6FF', sun: '#FFE08A',
  ground: '#39404A', runway: '#474E58', mark: '#F2F5F9', ink: '#16222E', paper: '#FFFFFF', body: '#EEF3F8', bodyDk: '#C9D4DE',
});
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Manrope', system-ui, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.2, dist = 44) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.1), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.32, from = 0.5) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.58 ? '#16222E' : '#FFFFFF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

const TRANS = ['zoom', 'up', 'right', 'left', 'up', 'zoom'];
function cam(kind, progress) {
  const IN = 0.12, OUT = 0.9;
  let x = 0, y = 0, s = 1 + 0.02 * E.easeInOutSine(progress), op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); op = seg(progress, 0, IN * 0.6, E.easeOutQuad); if (kind === 'zoom') s *= lerp(1.14, 1, t); else if (kind === 'left') x = (1 - t) * 800; else if (kind === 'right') x = -(1 - t) * 800; else y = (1 - t) * 240; }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); op = 1 - seg(progress, OUT + 0.04, 1, E.easeInQuad); if (kind === 'zoom') s *= lerp(1, 1.1, t); else if (kind === 'left') x = -t * 800; else if (kind === 'right') x = t * 800; else y = -t * 240; }
  return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: op };
}

const GY = 1560;
function Cloud({ x, y, s = 1, o = 1 }) { return <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o} fill="#FFFFFF"><ellipse cx="0" cy="0" rx="96" ry="40" /><ellipse cx="76" cy="14" rx="62" ry="30" /><ellipse cx="-70" cy="16" rx="54" ry="26" /><rect x="-120" y="6" width="250" height="40" rx="20" /></g>; }
function Plane({ x, y, scale = 1, pitch = 0, contrail = 0, theme, gear = true }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${-pitch}) scale(${scale})`}>
      {contrail > 0 && [22, 36].map((yy, i) => <path key={i} d={`M-150 ${yy} q -120 -6 -${300 * contrail} 4`} stroke={rgba('#FFFFFF', 0.75)} strokeWidth="12" fill="none" strokeLinecap="round" opacity={0.6 - i * 0.2} />)}
      <path d="M-132 -14 L-186 -78 L-150 -78 L-108 -16 Z" fill={theme.accent} />
      <path d="M-160 6 Q -172 0 -150 -18 L120 -22 Q 176 -18 186 0 Q 176 18 120 22 L-150 22 Q -168 12 -160 6 Z" fill={theme.body} />
      <rect x="-150" y="-4" width="330" height="8" rx="4" fill={theme.accent} />
      <path d="M40 8 L-58 76 L-6 76 L74 12 Z" fill={theme.bodyDk} />
      <g transform="translate(2 40)"><ellipse rx="42" ry="18" fill="#3A4652" /><ellipse cx="38" rx="9" ry="15" fill={theme.accent} /></g>
      {new Array(11).fill(0).map((_, i) => <circle key={i} cx={-92 + i * 20} cy="-6" r="4.5" fill="#26506E" />)}
      <path d="M150 -14 Q 176 -12 182 -2 L156 0 Z" fill="#26506E" />
      {gear && <g stroke="#2A333C" strokeWidth="6" strokeLinecap="round"><line x1="-40" y1="22" x2="-40" y2="52" /><circle cx="-40" cy="56" r="10" fill="#20272E" /><line x1="120" y1="22" x2="120" y2="52" /><circle cx="120" cy="56" r="10" fill="#20272E" /></g>}
    </g>
  );
}
function World({ theme, clock, runway = false, scroll = 0, children }) {
  const cx = (o) => ((o - clock * 26) % 1500 + 1500) % 1500 - 240;
  const unit = 200, off = (scroll) % unit;
  return (
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs><linearGradient id="fvSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.skyA} /><stop offset="0.7" stopColor={theme.skyB} /><stop offset="1" stopColor={theme.skyC} /></linearGradient></defs>
      <rect x="0" y="0" width="1080" height="1920" fill="url(#fvSky)" />
      <circle cx="880" cy="250" r="120" fill={theme.sun} opacity="0.5" /><circle cx="880" cy="250" r="72" fill="#FFF3D0" />
      <Cloud x={cx(220)} y={430} s={0.9} o={0.9} /><Cloud x={cx(780)} y={340} s={1.1} o={0.85} /><Cloud x={cx(1200)} y={560} s={0.7} o={0.8} />
      {runway && <g><rect x="0" y={GY} width="1080" height={1920 - GY} fill={theme.ground} /><rect x="0" y={GY} width="1080" height="70" fill={theme.runway} /><rect x="0" y={GY} width="1080" height="4" fill={rgba('#FFFFFF', 0.25)} />{new Array(9).fill(0).map((_, i) => <rect key={i} x={i * unit - off - unit} y={GY + 30} width={110} height="8" rx="4" fill={theme.mark} opacity="0.9" />)}</g>}
      {children}
    </svg>
  );
}

function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'SCREENSHOT', phone: 'APP SCREEN', product: 'PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 15px, ${rgba(theme.ink, 0.02)} 15px 30px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 58, height: 58, borderRadius: 15, border: `3px dashed ${rgba(theme.accent, 0.85)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 36 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: '0.1em', color: rgba(theme.ink, 0.55), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.12em', color: rgba(theme.ink, 0.3) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Card({ theme, url, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden', background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.12)}`, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.26)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 54, flexShrink: 0, background: '#F4F7FB', borderBottom: `1px solid ${rgba(theme.ink, 0.08)}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px' }}>{['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 15, height: 15, borderRadius: 15, background: c }} />)}<div style={{ marginLeft: 12, flex: 1, height: 28, borderRadius: 14, background: rgba(theme.ink, 0.06), display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: MONO, fontSize: 15, color: rgba(theme.ink, 0.5) }}>{url}</div></div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 60, padding: 16, background: theme.ink, boxShadow: `0 50px 100px ${rgba(theme.ink, 0.3)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', width: 150, height: 34, borderRadius: 34, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 46, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 26px', borderRadius: 999, background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.14)}`, boxShadow: `0 8px 20px ${rgba(theme.ink, 0.1)}`, fontFamily: DISP, fontWeight: 700, fontSize: 26, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 11, height: 11, borderRadius: 11, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

function Chrome({ theme, clock, total }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 46, left: 56, display: 'flex', alignItems: 'center', gap: 16 }}><span style={{ width: 44, height: 44, borderRadius: 12, background: theme.accent, display: 'grid', placeItems: 'center', color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 800, fontSize: 26 }}>{theme.brand.slice(0, 1)}</span><span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 34, color: theme.ink }}>{theme.brand}</span><span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 22, color: rgba(theme.ink, 0.6) }}>{theme.url}</span></div>
    </React.Fragment>
  );
}
function Frame({ progress, children }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null;
  const total = sc && sc.total ? sc.total : 27;
  const index = sc && sc.index != null ? sc.index : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.skyB, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...cam(TRANS[index % TRANS.length], progress), willChange: 'transform, opacity' }}>{children}</div>
      <Chrome theme={theme} clock={clock} total={total} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Gate({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const taxi = seg(progress, 0.06, 0.6, E.easeOutCubic);
  const px = lerp(-240, 540, taxi);
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime} runway scroll={localTime * 120}><Plane x={px} y={GY - 44} scale={1.35} theme={theme} gear /></World>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center' }}>
        <div style={{ ...M.pop(progress, 0.26, 0.5, 0.5), transformOrigin: 'center', fontFamily: DISP, fontWeight: 800, fontSize: 210, lineHeight: 0.88, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.brand || theme.brand)}</div>
        <div style={{ ...M.rise(progress, 0.44, 0.3, 34), marginTop: 18, display: 'inline-block', fontFamily: MONO, fontSize: 30, letterSpacing: '0.2em', color: inkOn(theme.accent), background: theme.accent, padding: '12px 30px', textTransform: 'uppercase' }}>{s.tagline || 'Cleared for takeoff'}</div>
        <div style={{ ...M.rise(progress, 0.56, 0.3, 26), marginTop: 24, marginLeft: 'auto', marginRight: 'auto', maxWidth: 840, fontFamily: DISP, fontWeight: 600, fontSize: 34, lineHeight: 1.4, color: rgba(theme.ink, 0.7) }}>{s.body || 'Your whole team boards together — one runway from idea to launch.'}</div>
      </div>
    </Frame>
  );
}

function Takeoff({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const roll = seg(progress, 0.05, 0.5, E.easeInCubic);
  const lift = seg(progress, 0.45, 0.95, E.easeOutCubic);
  const px = lerp(180, 760, seg(progress, 0.05, 0.95, E.easeInOutSine));
  const py = (GY - 44) - lift * 1120;
  const pitch = lift * 16;
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime} runway scroll={localTime * 900 * (0.4 + roll)}>
        <g stroke={rgba(theme.ink, 0.2)} strokeWidth="5" strokeLinecap="round">{[0, 1, 2, 3].map(i => <line key={i} x1={px - 150} y1={py - 40 + i * 24} x2={px - 260 - i * 30} y2={py - 40 + i * 24} opacity={lift > 0.1 ? 1 : 0} />)}</g>
        <Plane x={px} y={py} scale={1.5} pitch={pitch} contrail={lift} theme={theme} gear={lift < 0.3} />
      </World>
      <div style={{ position: 'absolute', left: 150, right: 150, top: 900, height: 380, ...M.pop(progress, 0.34, 0.44, 0.6) }}>
        <Card theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" label="SCREENSHOT" theme={theme} /></Card>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 260, textAlign: 'center', ...M.rise(progress, 0.1, 0.28, 40) }}>
        <div style={{ display: 'inline-block', background: theme.accent, color: inkOn(theme.accent), padding: '12px 30px', borderRadius: 999, fontFamily: MONO, fontSize: 28, letterSpacing: '0.14em' }}>{s.eyebrow || 'V1 · ROTATE'}</div>
        <div style={{ marginTop: 18, fontFamily: DISP, fontWeight: 800, fontSize: 150, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'And we are|airborne.')}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 26), marginTop: 20, marginLeft: 'auto', marginRight: 'auto', maxWidth: 800, fontFamily: DISP, fontWeight: 600, fontSize: 34, lineHeight: 1.4, color: rgba(theme.ink, 0.72) }}>{s.body || 'Full throttle — setup takes minutes, not weeks, and your product leaves the ground the moment you decide to fly.'}</div>
      </div>
    </Frame>
  );
}

function Climb({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const phoneIn = M.pop(progress, 0.12, 0.4, 0.5);
  const chips = s.chips || ['NONSTOP', 'ZERO LAG', 'FIRST CLASS'];
  const bob = Math.sin(localTime * 0.8) * 10;
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}><Plane x={760} y={520 + bob} scale={0.8} pitch={10} contrail={1} theme={theme} gear={false} /></World>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 210, textAlign: 'center', ...M.rise(progress, 0.06, 0.26, 40) }}>
        <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: '0.2em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || 'CRUISING ALTITUDE'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 118, lineHeight: 0.96, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'Smooth all|the way up.')}</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.4 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', left: 300, top: 760, width: 480, height: 1000, ...phoneIn, transformOrigin: 'center bottom' }}><Phone theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></Phone></div>
    </Frame>
  );
}

function Cruise({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [{ y: 340, h: 420, k: 'desktop' }, { y: 800, h: 420, k: 'desktop' }, { y: 1260, h: 420, k: 'phone' }];
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime} />
      <div style={{ position: 'absolute', left: 60, right: 60, top: 190, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 34), fontFamily: DISP, fontWeight: 800, fontSize: 100, letterSpacing: '-0.03em', color: theme.ink }}>{s.headline || 'On board.'}</div>
      {tiles.map((t, i) => { const at = 0.16 + i * 0.12, e = M.pop(progress, at, 0.36, 0.7); const bob = Math.sin(localTime * 0.7 + i) * 8; return <div key={i} style={{ position: 'absolute', left: i % 2 ? 340 : 80, right: i % 2 ? 80 : 340, top: t.y + bob, height: t.h, ...e }}><Card theme={theme} url={theme.url}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></Card></div>; })}
    </Frame>
  );
}

function Instruments({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 38, suf: 'K FT', l: 'ALTITUDE' }, { v: 560, suf: 'MPH', l: 'SPEED' }, { v: 2, suf: 'M', l: 'MILES FLOWN' }];
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}><Plane x={820} y={1400} scale={0.55} pitch={8} contrail={1} theme={theme} gear={false} /></World>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 260, textAlign: 'center', ...M.rise(progress, 0.06, 0.26, 40), fontFamily: DISP, fontWeight: 800, fontSize: 118, lineHeight: 0.94, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'Numbers|that soar.')}</div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 640, display: 'flex', flexDirection: 'column', gap: 32 }}>
        {stats.map((st, i) => <div key={i} style={{ ...M.pop(progress, 0.28 + i * 0.12, 0.4, 0.5), background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.12)}`, borderRadius: 30, boxShadow: `0 20px 50px ${rgba(theme.ink, 0.12)}`, padding: '40px 54px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 130, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.accent }}><Counter progress={progress} at={0.32 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div><div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: '0.14em', color: rgba(theme.ink, 0.55), textAlign: 'right', maxWidth: 260 }}>{st.l}</div></div>)}
      </div>
    </Frame>
  );
}

function Arrival({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const logo = M.pop(progress, 0.2, 0.44, 0.4);
  const head = M.rise(progress, 0.3, 0.3, 50);
  const btn = M.pop(progress, 0.5, 0.4, 0.4);
  const px = lerp(-300, 1300, seg(progress, 0.05, 0.75, E.easeOutCubic));
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}><Plane x={px} y={430} scale={0.8} pitch={-4} contrail={1} theme={theme} gear={false} /></World>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 720, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 80px' }}>
        <div style={{ ...logo, width: 190, height: 190, borderRadius: 44, background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.12)}`, boxShadow: `0 30px 70px ${rgba(theme.ink, 0.14)}`, overflow: 'hidden', padding: 24, marginBottom: 48 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 800, fontSize: 150, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink, textAlign: 'center' }}>{splitLines(s.headline || 'Ready for|takeoff?')}</div>
        <div style={{ ...btn, marginTop: 56, width: '100%' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '38px 0', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 800, fontSize: 50, boxShadow: `0 20px 50px ${rgba(theme.accent, 0.4)}` }}>{s.cta || 'BOOK YOUR SEAT'} ✈</div><div style={{ marginTop: 30, textAlign: 'center', fontFamily: MONO, fontSize: 30, color: rgba(theme.ink, 0.6) }}>{s.url || theme.url}</div></div>
      </div>
    </Frame>
  );
}

const MAP = { Gate, Takeoff, Climb, Cruise, Instruments, Arrival };

function FlightVertFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#FF5630', brand: (t.brandName || 'SKYWARD').toUpperCase(), url: t.url || 'skyward.air',
    skyA: '#BFE6FF', skyB: '#8FCBF5', skyC: '#E9F6FF', sun: '#FFE08A',
    ground: '#39404A', runway: '#474E58', mark: '#F2F5F9', ink: '#16222E', paper: '#FFFFFF', body: '#EEF3F8', bodyDk: '#C9D4DE',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.skyB} transition="cut">{MAP}</window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand / livery" />
        <TweakColor label="Livery" value={t.accent} options={['#FF5630', '#1F6FEB', '#12B37E', '#8B5CF6', '#E23A6E']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.FlightVertFilm = FlightVertFilm;
