/* orbit-film.jsx — "ORBIT" space / rocket-launch template. Starfield, launching rocket with
   flame + smoke, orbit rings, floating holo panels; product screenshots on mission consoles.
   Self-contained. 1920×1080. Mounted after animations-v2.jsx + tweaks-panel.jsx. */

const ThemeContext = React.createContext({
  accent: '#5B8CFF', flame: '#FF7A2C', gold: '#FFC24C', brand: 'ORBIT', url: 'orbit.space',
  bg: '#060814', panel: '#0E1426', ink: '#EAF0FF', sub: '#8A93B2', line: '#26304A',
});
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.2, dist = 44) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.1), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.32, from = 0.4) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.55 ? '#060814' : '#EAF0FF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

const TRANS = ['zoom', 'left', 'up', 'right', 'zoom', 'up'];
function cam(kind, progress) {
  const IN = 0.12, OUT = 0.9;
  let x = 0, y = 0, s = 1 + 0.02 * E.easeInOutSine(progress), op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); op = seg(progress, 0, IN * 0.6, E.easeOutQuad); if (kind === 'zoom') s *= lerp(1.16, 1, t); else if (kind === 'left') x = (1 - t) * 900; else if (kind === 'right') x = -(1 - t) * 900; else y = (1 - t) * 240; }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); op = 1 - seg(progress, OUT + 0.04, 1, E.easeInQuad); if (kind === 'zoom') s *= lerp(1, 1.12, t); else if (kind === 'left') x = -t * 900; else if (kind === 'right') x = t * 900; else y = -t * 240; }
  return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: op };
}

// Starfield + nebula + orbit rings (continuous)
function Space({ theme, clock, drift = 0 }) {
  const stars = [];
  for (let i = 0; i < 90; i++) { const seed = i * 41.7; const x = (seed * 7 % 1920); const y = (seed * 13 % 1080); const tw = 0.3 + 0.7 * (Math.sin(clock * 2 + i) * 0.5 + 0.5); stars.push(<circle key={i} cx={x} cy={y} r={i % 7 === 0 ? 2.6 : 1.4} fill="#fff" opacity={tw * (i % 5 === 0 ? 0.9 : 0.5)} />); }
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs><radialGradient id="neb" cx="0.7" cy="0.3" r="0.7"><stop offset="0" stopColor={rgba(theme.accent, 0.22)} /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient><radialGradient id="neb2" cx="0.2" cy="0.8" r="0.6"><stop offset="0" stopColor={rgba(theme.flame, 0.16)} /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient></defs>
      <rect x="0" y="0" width="1920" height="1080" fill={theme.bg} />
      <rect x="0" y="0" width="1920" height="1080" fill="url(#neb)" /><rect x="0" y="0" width="1920" height="1080" fill="url(#neb2)" />
      <g transform={`translate(${-drift * 0.3 % 1920} 0)`}>{stars}</g>
      <g transform={`translate(1560 250) rotate(${clock * 8})`} opacity="0.5"><ellipse rx="230" ry="70" fill="none" stroke={rgba(theme.accent, 0.5)} strokeWidth="2" /><circle cx="230" cy="0" r="7" fill={theme.accent} /></g>
    </svg>
  );
}
function Planet({ x, y, r, c1, c2 }) {
  return <svg style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2 }} viewBox={`0 0 ${r * 2} ${r * 2}`}><defs><radialGradient id={'pl' + x} cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient></defs><circle cx={r} cy={r} r={r} fill={`url(#pl${x})`} /></svg>;
}
// Rocket: body + fins + window + animated flame; y is nose tip area, draws downward
function Rocket({ x, y, scale = 1, thrust = 0, clock, theme }) {
  const fl = thrust > 0 ? (0.7 + 0.3 * Math.sin(clock * 30)) : 0;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {thrust > 0 && <g opacity={thrust}><path d={`M-26 130 Q 0 ${210 + fl * 120} 26 130 Q 12 ${170 + fl * 60} 0 ${150 + fl * 90} Q -12 ${170 + fl * 60} -26 130 Z`} fill={theme.flame} /><path d={`M-14 130 Q 0 ${180 + fl * 80} 14 130 Q 0 ${160 + fl * 50} -14 130 Z`} fill={theme.gold} /></g>}
      <path d="M0 -80 Q 34 -20 34 60 L 34 130 L -34 130 L -34 60 Q -34 -20 0 -80 Z" fill="#EEF2FA" />
      <path d="M0 -80 Q 34 -20 34 60 L 34 130 L 0 130 Z" fill="#C6CFE0" />
      <path d="M-34 70 L-70 140 L-34 120 Z" fill={theme.accent} /><path d="M34 70 L70 140 L34 120 Z" fill={theme.accent} />
      <rect x="-34" y="86" width="68" height="10" fill={theme.accent} />
      <circle cx="0" cy="20" r="18" fill={theme.bg} stroke={theme.accent} strokeWidth="4" /><circle cx="0" cy="20" r="9" fill={rgba(theme.accent, 0.6)} />
    </g>
  );
}
function Smoke({ progress, at, cx, cy, theme }) {
  const on = M.draw(progress, at, 0.4);
  if (on <= 0) return null;
  return <g opacity={on}>{[0, 1, 2, 3, 4].map(i => { const t = clamp01(on * 1.6 - i * 0.14); const r = t * (90 + i * 20); return <circle key={i} cx={cx + (i - 2) * 70} cy={cy + Math.sin(i) * 20} r={r} fill={rgba('#C6CFE0', 0.5 * (1 - t))} />; })}</g>;
}

function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'SCREENSHOT', phone: 'APP SCREEN', product: 'PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.accent, 0.1)} 0 14px, ${rgba(theme.accent, 0.03)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, border: `2px solid ${theme.accent}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 28 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.12em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: rgba(theme.ink, 0.32) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Console({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: theme.panel, border: `1px solid ${rgba(theme.accent, 0.4)}`, boxShadow: `0 0 60px ${rgba(theme.accent, 0.22)}, 0 40px 80px rgba(0,0,0,0.5)`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, background: '#0A1020', borderBottom: `1px solid ${rgba(theme.accent, 0.3)}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>{[theme.flame, theme.gold, theme.accent].map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 11, background: c }} />)}<span style={{ marginLeft: 10, fontFamily: MONO, fontSize: 12, color: rgba(theme.ink, 0.5) }}>{theme.url}</span></div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 999, background: rgba(theme.accent, 0.1), border: `1px solid ${rgba(theme.accent, 0.5)}`, fontFamily: MONO, fontSize: 15, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 7, background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

function Chrome({ theme, clock, total }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  const on = Math.floor(clock * 2) % 2 === 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 44, left: 60, display: 'flex', alignItems: 'center', gap: 13 }}><span style={{ width: 14, height: 14, borderRadius: 14, background: theme.accent, boxShadow: `0 0 14px ${theme.accent}` }} /><span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 26, letterSpacing: '0.1em', color: theme.ink }}>{theme.brand}</span></div>
      <div style={{ position: 'absolute', top: 50, right: 60, display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 13, letterSpacing: '0.18em', color: rgba(theme.ink, 0.6) }}><span style={{ width: 9, height: 9, borderRadius: 9, background: theme.flame, opacity: on ? 1 : 0.3 }} /> MISSION LIVE</div>
    </React.Fragment>
  );
}
function Frame({ progress, children, drift = 0 }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null;
  const total = sc && sc.total ? sc.total : 28;
  const index = sc && sc.index != null ? sc.index : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg, fontFamily: DISP }}>
      <Space theme={theme} clock={clock} drift={drift} />
      <div style={{ position: 'absolute', inset: 0, ...cam(TRANS[index % TRANS.length], progress), willChange: 'transform, opacity' }}>{children}</div>
      <Chrome theme={theme} clock={clock} total={total} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Countdown({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const idle = Math.sin(localTime * 2) * 4;
  return (
    <Frame progress={progress}>
      <Planet x={300} y={880} r={220} c1={rgba(theme.accent, 0.5)} c2="#0A1430" />
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}><Rocket x={1480} y={560 + idle} scale={1.4} thrust={0} clock={localTime} theme={theme} /></svg>
      <div style={{ position: 'absolute', left: 96, top: 300 }}>
        <div style={{ ...M.rise(progress, 0.06, 0.24, 24), fontFamily: MONO, fontSize: 26, letterSpacing: '0.3em', color: theme.accent }}>{s.eyebrow || 'T‑MINUS 10… 9… 8…'}</div>
        <div style={{ ...M.pop(progress, 0.16, 0.4, 0.5), transformOrigin: 'left', marginTop: 14, fontFamily: DISP, fontWeight: 700, fontSize: 220, lineHeight: 0.86, letterSpacing: '-0.03em', color: theme.ink, textShadow: `0 0 60px ${rgba(theme.accent, 0.5)}` }}>{splitLines(s.brand || theme.brand)}</div>
        <div style={{ ...M.rise(progress, 0.42, 0.3, 26), marginTop: 20, maxWidth: 720, fontFamily: DISP, fontWeight: 500, fontSize: 34, lineHeight: 1.4, color: theme.sub }}>{s.tagline || 'Your product is cleared for launch — all systems go.'}</div>
      </div>
    </Frame>
  );
}
function Liftoff({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const lift = seg(progress, 0.2, 0.95, E.easeInCubic);
  const ry = lerp(720, -260, lift);
  const rx = 960 + Math.sin(localTime * 3) * 12 * (1 - lift);
  return (
    <Frame progress={progress} drift={lift * 1200}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <Smoke progress={progress} at={0.16} cx={960} cy={900} theme={theme} />
        <Rocket x={rx} y={ry} scale={1.5} thrust={1} clock={localTime} theme={theme} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 30) }}>
        <div style={{ display: 'inline-block', background: theme.flame, color: inkOn(theme.flame), padding: '10px 30px', borderRadius: 999, fontFamily: MONO, fontSize: 22, letterSpacing: '0.16em' }}>{s.eyebrow || 'IGNITION'}</div>
        <div style={{ marginTop: 16, fontFamily: DISP, fontWeight: 700, fontSize: 150, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.ink, textShadow: `0 0 50px ${rgba(theme.flame, 0.5)}` }}>{splitLines(s.headline || 'We have liftoff.')}</div>
      </div>
    </Frame>
  );
}
function Feature({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = M.pop(progress, 0.1, 0.4, 0.6);
  const chips = s.chips || ['REAL-TIME', 'AUTO-PILOT', 'ZERO-G UX'];
  const bob = Math.sin(localTime * 0.8) * 10;
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 110, top: 300, width: 640, ...M.rise(progress, 0.1, 0.28, 40) }}>
        <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.2em', color: theme.accent, marginBottom: 14 }}>{s.eyebrow || 'MISSION CONTROL'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 0.96, color: theme.ink }}>{splitLines(s.headline || 'One console,|full control.')}</div>
        <div style={{ marginTop: 22, fontFamily: DISP, fontWeight: 400, fontSize: 24, lineHeight: 1.5, color: theme.sub, maxWidth: 520 }}>{s.body || 'Every system, telemetry and control on a single fast surface — no context switching in flight.'}</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.44 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 110, top: 210, width: 900, height: 560, ...inT, transform: `translateY(${bob}px) ${inT.transform || ''}` }}><Console theme={theme}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></Console></div>
    </Frame>
  );
}
function Fleet({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [{ x: 150, y: 300, w: 520, h: 300 }, { x: 710, y: 260, w: 500, h: 340 }, { x: 1250, y: 300, w: 520, h: 300 }, { x: 430, y: 640, w: 500, h: 260 }, { x: 990, y: 640, w: 540, h: 260 }];
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 30), fontFamily: DISP, fontWeight: 700, fontSize: 74, letterSpacing: '-0.02em', color: theme.ink }}>{s.headline || 'The whole constellation.'}</div>
      {tiles.map((t, i) => { const at = 0.16 + i * 0.09, e = M.pop(progress, at, 0.36, 0.6); const bob = Math.sin(localTime * 0.7 + i) * 10; return <div key={i} style={{ position: 'absolute', left: t.x, top: t.y + bob, width: t.w, height: t.h, ...e }}><Console theme={theme}><MediaSlot src={s['shot' + (i + 1)]} kind="desktop" label={`SCREENSHOT ${i + 1}`} theme={theme} /></Console></div>; })}
    </Frame>
  );
}
function Telemetry({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 240, suf: 'K', l: 'LAUNCHES' }, { v: 99.9, suf: '%', l: 'UPTIME' }, { v: 12, suf: 'MS', l: 'LATENCY' }];
  return (
    <Frame progress={progress}>
      <Planet x={1650} y={240} r={150} c1={rgba(theme.flame, 0.6)} c2="#2A0E06" />
      <div style={{ position: 'absolute', left: 110, top: 220, ...M.rise(progress, 0.06, 0.26, 36), fontFamily: DISP, fontWeight: 700, fontSize: 96, lineHeight: 0.94, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'Telemetry|checks out.')}</div>
      <div style={{ position: 'absolute', left: 110, top: 470, display: 'flex', gap: 30 }}>
        {stats.map((st, i) => <div key={i} style={{ ...M.pop(progress, 0.3 + i * 0.12, 0.4, 0.5), background: theme.panel, border: `1px solid ${rgba(theme.accent, 0.4)}`, borderRadius: 22, boxShadow: `0 0 50px ${rgba(theme.accent, 0.16)}`, padding: '34px 46px', minWidth: 320 }}><div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 100, lineHeight: 1, color: theme.accent, textShadow: `0 0 30px ${rgba(theme.accent, 0.5)}` }}><Counter progress={progress} at={0.34 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div><div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.16em', color: theme.sub, marginTop: 8 }}>{st.l}</div></div>)}
      </div>
    </Frame>
  );
}
function CTA({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const logo = M.pop(progress, 0.2, 0.44, 0.4);
  const head = M.rise(progress, 0.3, 0.3, 50);
  const btn = M.pop(progress, 0.5, 0.4, 0.4);
  return (
    <Frame progress={progress}>
      <Planet x={960} y={1180} r={420} c1={rgba(theme.accent, 0.4)} c2="#0A1430" />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 120 }}>
        <div style={{ ...logo, width: 150, height: 150, borderRadius: 34, background: theme.panel, border: `1px solid ${rgba(theme.accent, 0.5)}`, boxShadow: `0 0 60px ${rgba(theme.accent, 0.3)}`, overflow: 'hidden', padding: 20, marginBottom: 40 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 700, fontSize: 150, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink, textAlign: 'center', textShadow: `0 0 60px ${rgba(theme.accent, 0.5)}` }}>{splitLines(s.headline || 'Reach orbit.')}</div>
        <div style={{ ...btn, marginTop: 44, display: 'flex', alignItems: 'center', gap: 22 }}><div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '20px 48px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 700, fontSize: 32, boxShadow: `0 0 50px ${rgba(theme.accent, 0.5)}` }}>{s.cta || 'LAUNCH NOW'} ↑</div><div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.1em', color: theme.sub }}>{s.url || theme.url}</div></div>
      </div>
    </Frame>
  );
}

const MAP = { Countdown, Liftoff, Feature, Fleet, Telemetry, CTA };

function OrbitFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#5B8CFF', flame: t.flame || '#FF7A2C', gold: '#FFC24C', brand: (t.brandName || 'ORBIT').toUpperCase(), url: t.url || 'orbit.space',
    bg: '#060814', panel: '#0E1426', ink: '#EAF0FF', sub: '#8A93B2', line: '#26304A',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.bg} transition="cut">{MAP}</window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Mission" />
        <TweakColor label="Accent" value={t.accent} options={['#5B8CFF', '#12C2E9', '#8B5CF6', '#12B37E', '#FF4D9D']} onChange={v => setTweak('accent', v)} />
        <TweakColor label="Flame" value={t.flame} options={['#FF7A2C', '#FFC24C', '#FF4D5E', '#5B8CFF']} onChange={v => setTweak('flame', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.OrbitFilm = OrbitFilm;
