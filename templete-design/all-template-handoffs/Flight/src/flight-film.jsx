/* flight-film.jsx — "SKYWARD" airplane-takeoff template: a jet rolls down the runway,
   rotates and climbs into the sky; product screenshots ride cabin-window / boarding cards.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#FF5630', brand: 'SKYWARD', url: 'skyward.air',
  skyA: '#BFE6FF', skyB: '#8FCBF5', skyC: '#E9F6FF', sun: '#FFE08A',
  ground: '#39404A', runway: '#474E58', mark: '#F2F5F9', ink: '#16222E', paper: '#FFFFFF', body: '#EEF3F8', bodyDk: '#C9D4DE',
});
const useTheme = () => React.useContext(ThemeContext);
const DISP = "'Manrope', system-ui, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.22, dist = 50) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.32, from = 0.6) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.58 ? '#16222E' : '#FFFFFF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

const GROUND_Y = 902;

// Camera: banking slide between scenes
function fcam(progress) {
  const IN = 0.12, OUT = 0.88;
  let tx = 0, sc = 1 + 0.03 * E.easeInOutSine(progress), op = 1, rot = 0;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); tx += (1 - t) * 240; rot += (1 - t) * -1.5; op = seg(progress, 0, IN * 0.7, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); tx += -t * 240; rot += t * 1.5; op = 1 - seg(progress, OUT + (1 - OUT) * 0.5, 1, E.easeInQuad); }
  return { transform: `translateX(${tx.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' };
}

// ═══════════════════════════ SKY + GROUND (SVG) ═════════════════════════════
function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}
function Cloud({ x, y, s = 1, o = 1 }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o} fill="#FFFFFF"><ellipse cx="0" cy="0" rx="96" ry="40" /><ellipse cx="76" cy="14" rx="62" ry="30" /><ellipse cx="-70" cy="16" rx="54" ry="26" /><rect x="-120" y="6" width="250" height="40" rx="20" /></g>;
}
function SkyBG({ theme, clock }) {
  const cx = (o, sp) => ((o - clock * sp) % 2400 + 2400) % 2400 - 240;
  return (
    <React.Fragment>
      <defs><linearGradient id="flSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.skyA} /><stop offset="0.7" stopColor={theme.skyB} /><stop offset="1" stopColor={theme.skyC} /></linearGradient></defs>
      <rect x="0" y="0" width="1920" height="1080" fill="url(#flSky)" />
      <circle cx="1520" cy="230" r="120" fill={theme.sun} opacity="0.5" /><circle cx="1520" cy="230" r="72" fill="#FFF3D0" />
      <Cloud x={cx(300, 16)} y={200} s={1} o={0.9} /><Cloud x={cx(1100, 16)} y={150} s={1.3} o={0.85} /><Cloud x={cx(1750, 16)} y={280} s={0.8} o={0.8} />
      <Cloud x={cx(700, 30)} y={430} s={0.7} o={0.7} /><Cloud x={cx(1500, 30)} y={520} s={0.9} o={0.6} />
    </React.Fragment>
  );
}
function Runway({ theme, clock, scroll = 0, drop = 0 }) {
  const unit = 200, off = ((scroll) % unit);
  return (
    <g transform={`translate(0 ${drop})`}>
      <rect x="0" y={GROUND_Y} width="1920" height={1080 - GROUND_Y + 200} fill={theme.ground} />
      <rect x="0" y={GROUND_Y} width="1920" height="86" fill={theme.runway} />
      <rect x="0" y={GROUND_Y} width="1920" height="4" fill={rgba('#FFFFFF', 0.25)} />
      {new Array(16).fill(0).map((_, i) => <rect key={i} x={i * unit - off - unit} y={GROUND_Y + 40} width={110} height="8" rx="4" fill={theme.mark} opacity="0.9" />)}
      {new Array(20).fill(0).map((_, i) => <circle key={'l' + i} cx={i * 110 - (scroll % 110)} cy={GROUND_Y + 82} r="4" fill={rgba(theme.accent, 0.8)} />)}
    </g>
  );
}

// ── The jet (side view, nose right); pitch rotates nose up on takeoff ─────────
function Plane({ x, y, scale = 1, pitch = 0, theme, contrail = 0, gear = true }) {
  const win = '#26506E';
  return (
    <g transform={`translate(${x} ${y}) rotate(${-pitch}) scale(${scale})`}>
      {contrail > 0 && <g opacity="0.7">{[26, 40].map((yy, i) => <path key={i} d={`M-150 ${yy} q -${120 * contrail} -6 -${300 * contrail} 4`} fill="none" stroke={rgba('#FFFFFF', 0.75)} strokeWidth="12" strokeLinecap="round" opacity={0.6 - i * 0.2} />)}</g>}
      {/* tail fin */}
      <path d="M-132 -14 L-186 -78 L-150 -78 L-108 -16 Z" fill={theme.accent} />
      <path d="M-120 -6 L-176 -10 L-150 12 L-120 14 Z" fill={theme.bodyDk} />
      {/* fuselage */}
      <path d="M-160 6 Q -172 0 -150 -18 L120 -22 Q 176 -18 186 0 Q 176 18 120 22 L-150 22 Q -168 12 -160 6 Z" fill={theme.body} />
      <path d="M-150 14 L186 6 Q 176 18 120 22 L-150 22 Q -168 18 -150 14 Z" fill={theme.bodyDk} opacity="0.6" />
      {/* livery stripe */}
      <rect x="-150" y="-4" width="330" height="8" rx="4" fill={theme.accent} />
      {/* wing (near, sweeping down-back) */}
      <path d="M40 8 L-58 76 L-6 76 L74 12 Z" fill={theme.bodyDk} />
      {/* engine */}
      <g transform="translate(2 40)"><ellipse cx="0" cy="0" rx="42" ry="18" fill="#3A4652" /><ellipse cx="38" cy="0" rx="9" ry="15" fill={theme.accent} /><ellipse cx="-40" cy="0" rx="7" ry="12" fill="#1B242C" /></g>
      {/* windows */}
      {new Array(11).fill(0).map((_, i) => <circle key={i} cx={-92 + i * 20} cy={-6} r="4.5" fill={win} />)}
      {/* cockpit */}
      <path d="M150 -14 Q 176 -12 182 -2 L156 0 L150 -12 Z" fill={win} />
      {/* nose */}
      <circle cx="176" cy="0" r="5" fill={theme.accent} opacity="0.0" />
      {/* landing gear */}
      {gear && <g stroke="#2A333C" strokeWidth="6" strokeLinecap="round"><line x1="-40" y1="22" x2="-40" y2="52" /><circle cx="-40" cy="56" r="10" fill="#20272E" /><line x1="120" y1="22" x2="120" y2="52" /><circle cx="120" cy="56" r="10" fill="#20272E" /></g>}
    </g>
  );
}
function SpeedLines({ x, y, theme, n = 5 }) {
  return <g stroke={rgba(theme.ink, 0.22)} strokeWidth="4" strokeLinecap="round">{new Array(n).fill(0).map((_, i) => <line key={i} x1={x} y1={y - 40 + i * 20} x2={x - 60 - i * 30} y2={y - 40 + i * 20} />)}</g>;
}

// ── Product mounts ───────────────────────────────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.025)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, border: `2px dashed ${rgba(theme.accent, 0.85)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 26 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: rgba(theme.ink, 0.3) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function DeviceCard({ theme, url, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 18, overflow: 'hidden', background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.12)}`, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.28)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, background: '#F4F7FB', borderBottom: `1px solid ${rgba(theme.ink, 0.08)}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 12, background: c }} />)}
        <div style={{ marginLeft: 12, flex: 1, maxWidth: 380, height: 24, borderRadius: 12, background: rgba(theme.ink, 0.06), display: 'flex', alignItems: 'center', padding: '0 12px', fontFamily: MONO, fontSize: 12, color: rgba(theme.ink, 0.5) }}>{url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 44, padding: 12, background: theme.ink, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.3)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 90, height: 22, borderRadius: 22, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 33, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.14)}`, boxShadow: `0 6px 18px ${rgba(theme.ink, 0.1)}`, fontFamily: DISP, fontWeight: 700, fontSize: 15, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 8, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }
function Instrument({ progress, at, theme, cx, cy, r, clock }) {
  const t = M.draw(progress, at, 0.7, E.easeOutCubic), a0 = 130, a1 = 410, ang = lerp(a0, a1, t) + Math.sin(clock * 2) * 3;
  const pt = (d, rr) => [cx + Math.cos(d * Math.PI / 180) * rr, cy + Math.sin(d * Math.PI / 180) * rr];
  const arc = (f, to, rr) => { const [x1, y1] = pt(f, rr), [x2, y2] = pt(to, rr); return `M${x1} ${y1} A ${rr} ${rr} 0 ${to - f > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
  const [nx, ny] = pt(ang, r - 22);
  return <g><circle cx={cx} cy={cy} r={r + 16} fill={theme.paper} stroke={theme.ink} strokeWidth="4" /><path d={arc(a0, a1, r)} fill="none" stroke={rgba(theme.ink, 0.14)} strokeWidth="12" strokeLinecap="round" />{new Array(9).fill(0).map((_, i) => { const d = lerp(a0, a1, i / 8); const [x1, y1] = pt(d, r - 20), [x2, y2] = pt(d, r - 6); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={theme.ink} strokeWidth="3" />; })}<path d={arc(a0, ang, r)} fill="none" stroke={theme.accent} strokeWidth="12" strokeLinecap="round" /><line x1={cx} y1={cy} x2={nx} y2={ny} stroke={theme.accent} strokeWidth="6" strokeLinecap="round" /><circle cx={cx} cy={cy} r="12" fill={theme.ink} /></g>;
}

// ── Chrome (flight HUD) ──────────────────────────────────────────────────────
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 44, left: 58, display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: theme.accent, display: 'grid', placeItems: 'center', color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 800, fontSize: 18 }}>{theme.brand.slice(0, 1)}</span>
        <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, color: theme.ink, letterSpacing: '-0.01em' }}>{theme.brand}</span>
        {label && <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.16em', color: rgba(theme.ink, 0.55), textTransform: 'uppercase' }}>· {label}</span>}
      </div>
      <div style={{ position: 'absolute', top: 50, right: 58, fontFamily: MONO, fontSize: 13, letterSpacing: '0.14em', color: rgba(theme.ink, 0.6) }}>FLT {theme.brand.slice(0, 2)}{String((index + 1) * 108).padStart(3, '0')}</div>
      <div style={{ position: 'absolute', bottom: 44, left: 58, right: 58, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: rgba(theme.ink, 0.5) }}>DEP</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: rgba(theme.ink, 0.5) }}>ARR</span>
      </div>
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.skyB, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...fcam(progress) }}>
        <Scene><SkyBG theme={theme} clock={clock} /></Scene>
        {children}
      </div>
      <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Gate({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const taxi = seg(progress, 0.06, 0.5, E.easeOutCubic);
  const px = lerp(-360, 720, taxi);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'PRE-FLIGHT'}>
      <Scene>
        <Runway theme={theme} clock={localTime} scroll={localTime * 120} />
        <Plane x={px} y={GROUND_Y - 56} scale={1.15} pitch={0} theme={theme} gear />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 190, textAlign: 'center' }}>
        <div style={{ ...M.pop(progress, 0.32, 0.44, 0.7), transformOrigin: 'center', fontFamily: DISP, fontWeight: 800, fontSize: 190, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.ink }}>{s.brand || theme.brand}</div>
        <div style={{ ...M.rise(progress, 0.5, 0.3, 34), display: 'inline-block', marginTop: 6, fontFamily: MONO, fontSize: 24, letterSpacing: '0.22em', color: inkOn(theme.accent), background: theme.accent, padding: '8px 22px', textTransform: 'uppercase' }}>{s.tagline || 'Cleared for takeoff'}</div>
        <div style={{ ...M.rise(progress, 0.62, 0.32, 28), maxWidth: 940, margin: '26px auto 0', fontFamily: DISP, fontWeight: 600, fontSize: 27, lineHeight: 1.5, color: rgba(theme.ink, 0.72) }}>{s.lead || 'Meet the platform your whole team boards together \u2014 one runway from first idea to full launch, cleared and ready the moment you are.'}</div>
      </div>
    </Frame>
  );
}

function Takeoff({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const roll = seg(progress, 0.05, 0.5, E.easeInCubic);       // accelerate
  const lift = seg(progress, 0.5, 0.95, E.easeOutCubic);      // rotate + climb
  const px = lerp(560, 1240, seg(progress, 0.05, 0.95, E.easeInOutSine));
  const py = GROUND_Y - 56 - lift * 520;
  const pitch = lift * 13;
  const scroll = localTime * 900 * (0.4 + roll);
  const drop = lift * 120;
  const head = M.rise(progress, 0.12, 0.3, 40);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'DEPARTURE'}>
      <Scene>
        <Runway theme={theme} clock={localTime} scroll={scroll} drop={drop} />
        <SpeedLines x={px - 160} y={py} theme={theme} n={6} />
        <Plane x={px} y={py} scale={1.35} pitch={pitch} theme={theme} contrail={lift} gear={lift < 0.3} />
      </Scene>
      <div style={{ position: 'absolute', left: 96, top: 150, ...head }}>
        <div style={{ display: 'inline-block', background: theme.accent, color: inkOn(theme.accent), padding: '8px 22px', borderRadius: 999, fontFamily: MONO, fontSize: 20, letterSpacing: '0.14em' }}>{s.eyebrow || 'V1 · ROTATE'}</div>
        <div style={{ marginTop: 14, fontFamily: DISP, fontWeight: 800, fontSize: 118, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'And we are|airborne.')}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 30), marginTop: 22, maxWidth: 680, fontFamily: DISP, fontWeight: 600, fontSize: 27, lineHeight: 1.5, color: rgba(theme.ink, 0.72) }}>{s.body || 'Hit the throttle and everything lifts at once. Setup takes minutes, not weeks, so your product leaves the ground the moment you decide to fly.'}</div>
      </div>
    </Frame>
  );
}

function Climb({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.12, 0.46, E.easeOutBack);
  const chips = s.chips || ['NONSTOP', 'ZERO LAG', 'FIRST CLASS UX'];
  const bob = Math.sin(localTime * 0.8) * 8;
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'CLIMB'}>
      <Scene><Plane x={430} y={640 + bob} scale={0.95} pitch={8} theme={theme} contrail={1} gear={false} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 230, width: 620, ...M.rise(progress, 0.12, 0.3, 40) }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.2em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || 'CRUISING ALTITUDE'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 84, lineHeight: 0.98, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'Smooth all|the way up.')}</div>
        <div style={{ marginTop: 18, fontFamily: DISP, fontWeight: 600, fontSize: 25, lineHeight: 1.55, color: rgba(theme.ink, 0.72) }}>{s.body || 'No turbulence, no waiting on the tarmac. Real-time sync keeps every seat in step as you climb, so the whole cabin shares one view at altitude.'}</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.52 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 150, top: 300, width: 656, height: 400, transform: `translate(${(1 - inT) * 700}px, ${bob}px)`, opacity: inT }}>
        <DeviceCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></DeviceCard>
      </div>
    </Frame>
  );
}

function Cruise({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [
    { x: 190, y: 340, w: 416, h: 240, k: 'desktop' }, { x: 720, y: 312, w: 288, h: 240, k: 'phone' },
    { x: 1160, y: 340, w: 528, h: 240, k: 'desktop' }, { x: 400, y: 636, w: 448, h: 200, k: 'desktop' }, { x: 1000, y: 636, w: 512, h: 200, k: 'shot' },
  ];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'IN-FLIGHT'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 110, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 30), zIndex: 6 }}>
        <div style={{ display: 'inline-block', fontFamily: DISP, fontWeight: 800, fontSize: 66, letterSpacing: '-0.02em', color: theme.ink }}>{s.headline || 'Everything on board.'}</div>
        <div style={{ ...M.rise(progress, 0.12, 0.26, 24), maxWidth: 1080, margin: '12px auto 0', fontFamily: DISP, fontWeight: 600, fontSize: 26, lineHeight: 1.5, color: rgba(theme.ink, 0.7) }}>{s.sub || 'Desktop, tablet and phone \u2014 every screen your customers touch travels in the same cabin, perfectly in sync from gate to gate.'}</div>
      </div>
      {tiles.map((t, i) => { const at = 0.16 + i * 0.09, e = seg(progress, at, at + 0.34, E.easeOutBack); const bob = Math.sin(localTime * 0.7 + i) * 8; return (
        <div key={i} style={{ position: 'absolute', left: t.x, top: t.y + bob, width: t.w, height: t.h, opacity: e, transform: `translateY(${(1 - e) * 60}px) scale(${lerp(0.92, 1, e)})` }}>
          <DeviceCard theme={theme} url={theme.url}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></DeviceCard>
        </div>
      ); })}
    </Frame>
  );
}

function Instruments({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 38, suf: 'K FT', l: 'ALTITUDE' }, { v: 560, suf: 'MPH', l: 'GROUND SPEED' }, { v: 2, suf: 'M', l: 'MILES FLOWN' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'FLIGHT DATA'}>
      <Scene><Instrument progress={progress} at={0.3} theme={theme} cx={1520} cy={370} r={160} clock={localTime} /><Plane x={1520} y={780} scale={0.5} pitch={6} theme={theme} contrail={1} gear={false} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 140, ...M.rise(progress, 0.08, 0.26, 36) }}>
        <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 92, lineHeight: 0.94, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'Numbers that|soar.')}</div>
        <div style={{ ...M.rise(progress, 0.2, 0.28, 26), marginTop: 18, maxWidth: 600, fontFamily: DISP, fontWeight: 600, fontSize: 25, lineHeight: 1.5, color: rgba(theme.ink, 0.72) }}>{s.body || 'The dials tell the story: teams reach cruising altitude fast and stay there. These are live readings from thousands of flights already underway.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 560, display: 'flex', gap: 30 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.34 + i * 0.12, 0.4, 0.6), background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.12)}`, borderRadius: 22, boxShadow: `0 20px 50px ${rgba(theme.ink, 0.12)}`, padding: '30px 42px', minWidth: 300 }}>
            <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 90, lineHeight: 1, letterSpacing: '-0.03em', color: theme.accent }}><Counter progress={progress} at={0.38 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.14em', color: rgba(theme.ink, 0.55), marginTop: 8 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Arrival({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.rise(progress, 0.12, 0.3, 44);
  const pill = M.pop(progress, 0.44, 0.4, 0.5);
  const logo = M.pop(progress, 0.22, 0.5, 0.5);
  const px = lerp(-300, 1440, seg(progress, 0.05, 0.7, E.easeOutCubic));
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'BOOK NOW'}>
      <Scene><Plane x={px} y={330} scale={0.9} pitch={-4} theme={theme} contrail={1} gear={false} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 250, width: 1040 }}>
        <div style={{ ...logo, width: 118, height: 118, borderRadius: 24, background: theme.paper, border: `1px solid ${rgba(theme.ink, 0.12)}`, boxShadow: `0 20px 50px ${rgba(theme.ink, 0.12)}`, overflow: 'hidden', padding: 15, marginBottom: 22 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 800, fontSize: 132, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'Ready for|takeoff?')}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 28), marginTop: 22, maxWidth: 780, fontFamily: DISP, fontWeight: 600, fontSize: 27, lineHeight: 1.5, color: rgba(theme.ink, 0.72) }}>{s.body || 'Board today and see how far your product can climb. Your first flight is free \u2014 no baggage fees, no delays, cancel any time.'}</div>
        <div style={{ ...pill, marginTop: 32, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 44px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 800, fontSize: 32, boxShadow: `0 14px 40px ${rgba(theme.accent, 0.4)}` }}>{s.cta || 'BOOK YOUR SEAT'} <span style={{ fontSize: 30 }}>✈</span></div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: rgba(theme.ink, 0.65) }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Gate, Takeoff, Climb, Cruise, Instruments, Arrival };

function FlightFilm() {
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
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.skyB} transition="cut">
          {MAP}
        </window.SceneStage>
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

window.FlightFilm = FlightFilm;
