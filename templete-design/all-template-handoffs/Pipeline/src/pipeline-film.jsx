/* pipeline-film.jsx — "PIPELINE" assembly-line template: product screenshots ride a
   working conveyor through turning gears, a robotic arm and a stamping press.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#FF8A00', brand: 'PIPELINE', url: 'pipeline.dev',
  bg: '#EAEDF2', panel: '#FFFFFF', ink: '#1E2230', steel: '#AEB6C4', steelDk: '#6B7385',
  belt: '#2A2E3A', beltDk: '#1A1D26',
});
const useTheme = () => React.useContext(ThemeContext);
const DISP = "'Chakra Petch', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

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
function inkOn(bg) { return lum(bg) > 0.58 ? '#1E2230' : '#FFFFFF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

const BELT_Y = 858;

// ── Per-scene machine cuts ──────────────────────────────────────────────────
// Every scene enters and leaves on a DIFFERENT mechanical move, fast and
// motion-blurred so the cut carries momentum instead of reading as a slide.
const CUTS = ['advance', 'slam', 'whip', 'punch', 'rail', 'liftout'];
function pcam(kind, progress, depth = 1) {
  const IN = 0.1, OUT = 0.91;
  // A real camera JOURNEY across the whole scene (not a token drift), so the
  // frame is always travelling. `depth` scales it: background layers get less
  // than the content layer, which reads as parallax depth.
  const dir = /advance|whip/.test(kind) ? 1 : -1;
  const j = E.easeInOutSine(progress);
  // Amplitude is bounded so the travel + centre-origin scale push can never
  // carry the left text column or the right screenshot mount off-canvas.
  let tx = dir * (30 - 60 * j) * depth;
  let ty = (Math.sin(progress * Math.PI) * -18 + (dir > 0 ? 0 : 12 - 24 * j)) * depth;
  let sc = 1 + (0.028 * j) * depth, rot = 0, blur = 0, op = 1;
  if (progress < IN) {
    const t = seg(progress, 0, IN, E.easeOutExpo);
    op = seg(progress, 0, IN * 0.45, E.easeOutQuad);
    if (kind === 'advance') { tx += (1 - t) * 620; blur += (1 - t) * 16; }
    else if (kind === 'whip') { tx += -(1 - t) * 900; blur += (1 - t) * 26; }
    else if (kind === 'slam') { ty += -(1 - t) * 420; sc *= lerp(1.06, 1, t); blur += (1 - t) * 12; }
    else if (kind === 'punch') { sc *= lerp(1.2, 1, t); blur += (1 - t) * 20; }
    else if (kind === 'rail') { ty += (1 - t) * 460; blur += (1 - t) * 12; }
    else { ty += (1 - t) * 300; rot += (1 - t) * -3; }
  }
  if (progress > OUT) {
    const t = seg(progress, OUT, 1, E.easeInExpo);
    op = 1 - seg(progress, OUT + 0.035, 1, E.easeInQuad);
    if (kind === 'advance') { tx += -t * 620; blur += t * 16; }
    else if (kind === 'whip') { tx += t * 900; blur += t * 26; }
    else if (kind === 'slam') { ty += t * 300; sc *= lerp(1, 0.94, t); blur += t * 12; }
    else if (kind === 'punch') { sc *= lerp(1, 1.16, t); blur += t * 20; }
    else if (kind === 'rail') { ty += -t * 460; blur += t * 12; }
    else { ty += -t * 380; rot += t * 3; }
  }
  return {
    transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`,
    filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none',
    opacity: op, transformOrigin: 'center center', willChange: 'transform, filter, opacity',
  };
}

// ═══════════════════════════ MACHINERY (SVG) ════════════════════════════════
function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}

function Gear({ cx, cy, r, teeth = 12, spin = 0, color, hub }) {
  const t = [];
  for (let i = 0; i < teeth; i++) t.push(<rect key={i} x={-7} y={-(r + 15)} width={14} height={20} rx={3} fill={color} transform={`rotate(${i * 360 / teeth})`} />);
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${spin})`}>
      {t}<circle r={r} fill={color} /><circle r={r * 0.62} fill={rgba('#FFFFFF', 0.12)} /><circle r={r} fill="none" stroke={rgba('#000000', 0.14)} strokeWidth="3" />
      {[0, 90, 180, 270].map(a => <circle key={a} cx={Math.cos(a * Math.PI / 180) * r * 0.42} cy={Math.sin(a * Math.PI / 180) * r * 0.42} r={r * 0.09} fill={hub || rgba('#000000', 0.22)} />)}
      <circle r={r * 0.16} fill={hub || rgba('#000000', 0.3)} />
    </g>
  );
}

// Conveyor belt: scrolling tread + spinning rollers + support legs
function Belt({ theme, clock }) {
  const treadW = 44, off = (clock * 340) % treadW;
  const rollGap = 150, roff = (clock * 340) % rollGap;
  const top = BELT_Y, h = 62;
  return (
    <g>
      {/* legs */}
      {[220, 700, 1180, 1660].map((x, i) => <rect key={i} x={x} y={top + h} width="26" height={1080 - top - h} fill={theme.steelDk} />)}
      <rect x="0" y={top + h + 8} width="1920" height="10" fill={rgba('#000000', 0.18)} />
      {/* belt body */}
      <rect x="-40" y={top} width="2000" height={h} rx="8" fill={theme.belt} />
      <rect x="-40" y={top} width="2000" height="10" fill={rgba('#FFFFFF', 0.08)} />
      {/* scrolling tread */}
      <g clipPath="url(#beltClip)"><defs><clipPath id="beltClip"><rect x="0" y={top} width="1920" height={h} /></clipPath></defs>
        {new Array(48).fill(0).map((_, i) => <rect key={i} x={i * treadW - off - treadW} y={top + h - 16} width={treadW * 0.5} height="8" rx="4" fill={rgba('#FFFFFF', 0.14)} />)}
      </g>
      {/* rollers */}
      {new Array(16).fill(0).map((_, i) => { const x = i * rollGap - roff; return <g key={i} transform={`translate(${x} ${top + h + 22})`}><circle r="20" fill={theme.steelDk} /><g transform={`rotate(${-(clock * 340) / 20 * 57.3})`}><line x1="-14" y1="0" x2="14" y2="0" stroke={theme.steel} strokeWidth="4" /><line x1="0" y1="-14" x2="0" y2="14" stroke={theme.steel} strokeWidth="4" /></g></g>; })}
      {/* warning stripe */}
      <rect x="0" y={top - 12} width="1920" height="10" fill={`repeating-linear-gradient(45deg)`} />
    </g>
  );
}

// Robotic arm mounted top-right, gently articulating (idle) with optional reach
function RoboArm({ theme, clock, baseX = 1620, baseY = 250, reach = 0 }) {
  const a1 = 40 + Math.sin(clock * 1.2) * 8 + reach * 12;
  const a2 = -70 + Math.cos(clock * 1.5) * 10 - reach * 20;
  const L1 = 220, L2 = 180;
  const ex = baseX + Math.cos(a1 * Math.PI / 180) * L1, ey = baseY + Math.sin(a1 * Math.PI / 180) * L1;
  const gx = ex + Math.cos((a1 + a2) * Math.PI / 180) * L2, gy = ey + Math.sin((a1 + a2) * Math.PI / 180) * L2;
  const grip = 18 + Math.sin(clock * 3) * 6;
  return (
    <g>
      <rect x={baseX - 40} y={baseY - 50} width="80" height="50" rx="8" fill={theme.steelDk} />
      <line x1={baseX} y1={baseY} x2={ex} y2={ey} stroke={theme.steel} strokeWidth="26" strokeLinecap="round" />
      <line x1={baseX} y1={baseY} x2={ex} y2={ey} stroke={rgba('#FFFFFF', 0.12)} strokeWidth="8" strokeLinecap="round" />
      <line x1={ex} y1={ey} x2={gx} y2={gy} stroke={theme.steel} strokeWidth="20" strokeLinecap="round" />
      <circle cx={baseX} cy={baseY} r="22" fill={theme.accent} /><circle cx={ex} cy={ey} r="18" fill={theme.accent} />
      <g transform={`translate(${gx} ${gy}) rotate(${(a1 + a2) + 90})`}>
        <rect x={-grip} y="-6" width="10" height="34" rx="4" fill={theme.steelDk} /><rect x={grip - 10} y="-6" width="10" height="34" rx="4" fill={theme.steelDk} />
      </g>
    </g>
  );
}

// Stamping press: plunger slams down once (per scene), spark burst on impact
function Stamp({ theme, progress, at, cx = 960, topY = 150, downY = 470 }) {
  const cyc = seg(progress, at, at + 0.5, E.easeInOutCubic);
  const hit = Math.abs(Math.sin(cyc * Math.PI));
  const py = lerp(topY, downY, hit);
  const spark = hit > 0.85 ? (hit - 0.85) / 0.15 : 0;
  return (
    <g>
      <rect x={cx - 260} y={topY - 60} width="80" height={downY + 200} fill={theme.steelDk} /><rect x={cx + 180} y={topY - 60} width="80" height={downY + 200} fill={theme.steelDk} />
      <rect x={cx - 280} y={topY - 80} width="560" height="50" rx="8" fill={theme.steel} />
      <rect x={cx - 30} y={topY - 30} width="60" height={py - topY + 60} fill={theme.steelDk} />
      <rect x={cx - 130} y={py + 40} width="260" height="70" rx="10" fill={theme.accent} />
      <rect x={cx - 130} y={py + 40} width="260" height="14" fill={rgba('#FFFFFF', 0.2)} />
      {spark > 0 && new Array(10).fill(0).map((_, i) => { const a = (i / 10) * Math.PI * 2; const r = 30 + spark * 60; return <line key={i} x1={cx + Math.cos(a) * 20} y1={py + 120 + Math.sin(a) * 8} x2={cx + Math.cos(a) * r} y2={py + 120 + Math.sin(a) * r} stroke="#FFD23F" strokeWidth="4" strokeLinecap="round" opacity={1 - spark} />; })}
    </g>
  );
}

// blueprint backdrop + persistent machinery (gears + belt run continuously)
function MachineBG({ theme, clock }) {
  return (
    <React.Fragment>
      <rect x="0" y="0" width="1920" height="1080" fill={theme.bg} />
      <g opacity="0.5" stroke={rgba(theme.steelDk, 0.18)} strokeWidth="1">
        {new Array(24).fill(0).map((_, i) => <line key={'v' + i} x1={i * 80} y1="0" x2={i * 80} y2="1080" />)}
        {new Array(14).fill(0).map((_, i) => <line key={'h' + i} x1="0" y1={i * 80} x2="1920" y2={i * 80} />)}
      </g>
      {/* corner gears (persistent turning) */}
      <Gear cx={-40} cy={520} r={110} teeth={16} spin={clock * 26} color={theme.steel} />
      <Gear cx={96} cy={640} r={56} teeth={10} spin={-clock * 40} color={theme.steelDk} />
      <Gear cx={1850} cy={980} r={110} teeth={16} spin={-clock * 22} color={theme.steel} />
      <Belt theme={theme} clock={clock} />
    </React.Fragment>
  );
}

// ── Product cards / slots (the hero payload) ─────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.025)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, border: `2px dashed ${rgba(theme.accent, 0.85)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 26 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: rgba(theme.ink, 0.32) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
// Continuous float — hero mounts never sit perfectly still
function useFloat(seed = 0, amp = 1) {
  const clock = window.useTimeline().time;
  const x = Math.sin(clock * 0.42 + seed) * 9 * amp;
  const y = Math.cos(clock * 0.33 + seed * 1.7) * 11 * amp;
  const r = Math.sin(clock * 0.27 + seed) * 0.5 * amp;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg)`;
}
function BrowserCard({ theme, url, children, seed = 0 }) {
  const float = useFloat(seed);
  return (
    <div style={{ width: '100%', height: '100%', transform: float, willChange: 'transform' }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden', background: theme.panel, border: `1px solid ${rgba(theme.ink, 0.14)}`, boxShadow: `0 30px 60px ${rgba(theme.ink, 0.22)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, background: '#F1F3F7', borderBottom: `1px solid ${rgba(theme.ink, 0.1)}`, display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 12, background: c }} />)}
        <div style={{ marginLeft: 12, flex: 1, maxWidth: 380, height: 24, borderRadius: 12, background: rgba(theme.ink, 0.06), display: 'flex', alignItems: 'center', padding: '0 12px', fontFamily: MONO, fontSize: 11, color: rgba(theme.ink, 0.55) }}>{url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
    </div>
  );
}
// A product on the belt: a card sitting on a small crate/pallet
function BeltProduct({ x, w, h, theme, src, label, kind = 'shot' }) {
  return (
    <div style={{ position: 'absolute', left: x, top: BELT_Y * 1080 / 1080 - h - 6, width: w }}>
      <div style={{ width: w, height: h }}><BrowserCard theme={theme} url={theme.url}><MediaSlot src={src} kind={kind} label={label} theme={theme} /></BrowserCard></div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 42, padding: 12, background: theme.ink, boxShadow: `0 30px 60px ${rgba(theme.ink, 0.3)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 88, height: 22, borderRadius: 22, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 32, overflow: 'hidden', background: theme.panel }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8, background: theme.panel, border: `2px solid ${theme.ink}`, fontFamily: MONO, fontWeight: 600, fontSize: 15, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }
function Gauge({ progress, at, theme, cx, cy, r, clock }) {
  const t = M.draw(progress, at, 0.7, E.easeOutCubic), a0 = 135, a1 = 405, ang = lerp(a0, a1, t) + Math.sin(clock * 2) * 3;
  const pt = (d, rr) => [cx + Math.cos(d * Math.PI / 180) * rr, cy + Math.sin(d * Math.PI / 180) * rr];
  const arc = (f, to, rr) => { const [x1, y1] = pt(f, rr), [x2, y2] = pt(to, rr); return `M${x1} ${y1} A ${rr} ${rr} 0 ${to - f > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
  const [nx, ny] = pt(ang, r - 22);
  return <g><circle cx={cx} cy={cy} r={r + 14} fill={theme.panel} stroke={theme.ink} strokeWidth="4" /><path d={arc(a0, a1, r)} fill="none" stroke={rgba(theme.ink, 0.14)} strokeWidth="12" strokeLinecap="round" /><path d={arc(a0, ang, r)} fill="none" stroke={theme.accent} strokeWidth="12" strokeLinecap="round" /><line x1={cx} y1={cy} x2={nx} y2={ny} stroke={theme.ink} strokeWidth="6" strokeLinecap="round" /><circle cx={cx} cy={cy} r="11" fill={theme.accent} /></g>;
}

// ── Chrome (industrial HUD) ──────────────────────────────────────────────────
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  const on = Math.sin(clock * 5) > -0.2;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 42, left: 58, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 6, background: theme.accent, display: 'grid', placeItems: 'center', color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 700, fontSize: 18 }}>{theme.brand.slice(0, 1)}</span>
        <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 24, color: theme.ink, letterSpacing: '0.02em' }}>{theme.brand}</span>
        {label && <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.16em', color: rgba(theme.ink, 0.55), textTransform: 'uppercase' }}>· {label}</span>}
      </div>
      <div style={{ position: 'absolute', top: 48, right: 58, display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 13, letterSpacing: '0.14em', color: rgba(theme.ink, 0.6) }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: '#2ECC71', opacity: on ? 1 : 0.3 }} /> RUNNING
      </div>
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...pcam(CUTS[index % CUTS.length], progress, 0.38) }}>
        <Scene><MachineBG theme={theme} clock={clock} /></Scene>
      </div>
      <div style={{ position: 'absolute', inset: 0, ...pcam(CUTS[index % CUTS.length], progress, 1) }}>
        {children}
      </div>
      <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Boot({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const prod = seg(progress, 0.4, 0.7, E.easeOutBack);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'SYSTEM ONLINE'}>
      <Scene><RoboArm theme={theme} clock={localTime} /></Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center' }}>
        <div style={{ ...M.pop(progress, 0.14, 0.4, 0.6), transformOrigin: 'center', fontFamily: DISP, fontWeight: 700, fontSize: 200, lineHeight: 0.9, letterSpacing: '0.02em', color: theme.ink }}>{s.brand || theme.brand}</div>
        <div style={{ ...M.rise(progress, 0.32, 0.3, 40), display: 'inline-block', marginTop: 8, fontFamily: MONO, fontWeight: 600, fontSize: 24, letterSpacing: '0.1em', color: inkOn(theme.accent), background: theme.accent, padding: '8px 22px' }}>{s.tagline || 'Ship your product down the line.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 810, top: BELT_Y - 296, width: 300, height: 290, transform: `translateY(${(1 - prod) * 300}px) scale(${prod})`, transformOrigin: 'center bottom', opacity: prod }}>
        <BrowserCard theme={theme} url={theme.url}><MediaSlot src={s.shot} kind="shot" theme={theme} /></BrowserCard>
      </div>
    </Frame>
  );
}

function Line({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const scroll = seg(progress, 0.04, 0.96, E.easeInOutSine) * 2200;
  const bp = (base, w) => base - scroll + 300;
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'ON THE LINE'}>
      <Scene><RoboArm theme={theme} clock={localTime} reach={Math.sin(localTime * 1.5) * 0.5 + 0.5} /></Scene>
      <div style={{ position: 'absolute', left: bp(760), top: BELT_Y - 296, width: 330, height: 290 }}><BrowserCard theme={theme} url={theme.url}><MediaSlot src={s.shot1} kind="desktop" label="SCREENSHOT 1" theme={theme} /></BrowserCard></div>
      <div style={{ position: 'absolute', left: bp(1360), top: BELT_Y - 262, width: 250, height: 256 }}><Phone theme={theme}><MediaSlot src={s.shot2} kind="phone" theme={theme} /></Phone></div>
      <div style={{ position: 'absolute', left: bp(1980), top: BELT_Y - 292, width: 340, height: 286 }}><BrowserCard theme={theme} url={theme.url}><MediaSlot src={s.shot3} kind="desktop" label="SCREENSHOT 3" theme={theme} /></BrowserCard></div>
      <div style={{ position: 'absolute', left: 96, top: 200, width: 640, ...M.rise(progress, 0.1, 0.28, 40) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 88, lineHeight: 0.95, color: theme.ink }}>{splitLines(s.headline || 'Every screen,|down the line.')}</div>
      </div>
    </Frame>
  );
}

function Inspect({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.1, 0.44, E.easeOutBack);
  const chips = s.chips || ['AUTO-BUILD', 'ZERO DOWNTIME', 'SHIP ON MERGE'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'INSPECTION'}>
      <Scene><RoboArm theme={theme} clock={localTime} baseX={1360} baseY={200} reach={1} /></Scene>
      <div style={{ position: 'absolute', left: 96, top: 200, width: 620, ...M.rise(progress, 0.12, 0.28, 40) }}>
        <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 18, letterSpacing: '0.16em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || 'QUALITY CHECKED'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 84, lineHeight: 0.95, color: theme.ink }}>{splitLines(s.headline || 'Built right,|every time.')}</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.46 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 130, top: 250, width: 780, height: 470, transform: `translateY(${(1 - inT) * 560}px) scale(${lerp(0.94, 1, inT)})`, transformOrigin: 'center bottom' }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></BrowserCard>
      </div>
    </Frame>
  );
}

function Assemble({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [
    { x: 150, y: 560, w: 380, h: 250, k: 'desktop' }, { x: 560, y: 560, w: 380, h: 250, k: 'phone' },
    { x: 970, y: 560, w: 380, h: 250, k: 'desktop' }, { x: 1380, y: 560, w: 380, h: 250, k: 'shot' },
  ];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'ASSEMBLY'}>
      <Scene><Stamp theme={theme} progress={progress} at={0.16} cx={960} topY={140} downY={430} /></Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center', ...M.rise(progress, 0.55, 0.24, 30), zIndex: 6 }}>
        <div style={{ display: 'inline-block', fontFamily: DISP, fontWeight: 700, fontSize: 76, color: theme.ink }}>{s.headline || 'BUILT PIECE BY PIECE'}</div>
      </div>
      {tiles.map((t, i) => { const at = 0.5 + i * 0.09, e = seg(progress, at, at + 0.32, E.easeOutBack); return (
        <div key={i} style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, opacity: seg(progress, at, at + 0.12, E.easeOutQuad), transform: `translateY(${(1 - e) * -120}px) scale(${lerp(0.85, 1, e)})` }}>
          <BrowserCard theme={theme} url={theme.url}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`PART ${i + 1}`} theme={theme} /></BrowserCard>
        </div>
      ); })}
    </Frame>
  );
}

function Throughput({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 8, suf: 'K', l: 'BUILDS / DAY' }, { v: 99.9, suf: '%', l: 'UPTIME' }, { v: 42, suf: 's', l: 'AVG SHIP TIME' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'THROUGHPUT'}>
      <Scene><Gauge progress={progress} at={0.28} theme={theme} cx={1540} cy={340} r={150} clock={localTime} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 190, ...M.rise(progress, 0.08, 0.26, 36) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 90, lineHeight: 0.92, color: theme.ink }}>{splitLines(s.headline || 'Runs at|full speed.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 420, display: 'flex', gap: 30 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.34 + i * 0.12, 0.4, 0.6), background: theme.panel, border: `3px solid ${theme.ink}`, borderRadius: 16, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.16)}`, padding: '26px 38px', minWidth: 280 }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 96, lineHeight: 1, color: theme.accent }}><Counter progress={progress} at={0.38 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16, letterSpacing: '0.08em', color: theme.ink, marginTop: 6 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Ship({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.rise(progress, 0.12, 0.3, 44);
  const pill = M.pop(progress, 0.44, 0.4, 0.5);
  const logo = M.pop(progress, 0.24, 0.5, 0.4);
  const box = seg(progress, 0.1, 0.5, E.easeInOutCubic);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'SHIP IT'}>
      <Scene>
        {/* a product rides to the end and drops into a shipping box */}
        <g transform={`translate(${lerp(1200, 1560, box)} ${lerp(BELT_Y - 140, BELT_Y - 40, box)})`}><rect x="-70" y="-60" width="140" height="110" rx="12" fill={theme.accent} /><rect x="-70" y="-60" width="140" height="16" fill={rgba('#FFFFFF', 0.25)} /></g>
        <g transform="translate(1560 0)"><path d={`M-120 ${BELT_Y - 20} h240 v130 h-240 z`} fill={theme.steelDk} /><path d={`M-120 ${BELT_Y - 20} l120 -40 l120 40 l-120 40 z`} fill={theme.steel} /></g>
      </Scene>
      <div style={{ position: 'absolute', left: 110, top: 230, width: 980 }}>
        <div style={{ ...logo, width: 132, height: 132, borderRadius: 20, background: theme.panel, border: `3px solid ${theme.ink}`, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.16)}`, overflow: 'hidden', padding: 15, marginBottom: 22 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 700, fontSize: 132, lineHeight: 0.9, color: theme.ink }}>{splitLines(s.headline || 'Ship it|today.')}</div>
        <div style={{ ...pill, marginTop: 34, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 44px', borderRadius: 10, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', boxShadow: `0 8px 0 ${rgba(theme.ink, 0.24)}` }}>{s.cta || 'START BUILDING'} <span style={{ fontSize: 30 }}>→</span></div>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 22, color: theme.ink }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Boot, Line, Inspect, Assemble, Throughput, Ship };

function PipelineFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#FF8A00', brand: (t.brandName || 'PIPELINE').toUpperCase(), url: t.url || 'pipeline.dev',
    bg: '#EAEDF2', panel: '#FFFFFF', ink: '#1E2230', steel: '#AEB6C4', steelDk: '#6B7385', belt: '#2A2E3A', beltDk: '#1A1D26',
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
        <TweakColor label="Accent" value={t.accent} options={['#FF8A00', '#2F6BFF', '#12B37E', '#E23A6E', '#8B5CF6']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.PipelineFilm = PipelineFilm;
