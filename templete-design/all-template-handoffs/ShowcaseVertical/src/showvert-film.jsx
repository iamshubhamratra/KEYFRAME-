/* showvert-film.jsx — "SHOWCASE" vertical 9:16 annotated product-tour template
   (existing Showcase idea, portrait). Big screenshots, drawn arrows + numbered callouts,
   tile montage, stat cards. Self-contained. 1080×1920.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

const ThemeContext = React.createContext({
  accent: '#2F6BFF', brand: 'SHOWCASE', url: 'yourapp.com',
  bg: '#EEF1F7', panel: '#FFFFFF', ink: '#131722', sub: '#5B6472', line: '#D9DEE8', mark: '#FFC53D',
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
function inkOn(bg) { return lum(bg) > 0.6 ? '#131722' : '#FFFFFF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// Varied per-scene transitions
const TRANS = ['zoom', 'up', 'left', 'right', 'up', 'zoom'];
function cam(kind, progress) {
  const IN = 0.12, OUT = 0.9;
  let x = 0, y = 0, s = 1 + 0.02 * E.easeInOutSine(progress), op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); op = seg(progress, 0, IN * 0.6, E.easeOutQuad); if (kind === 'zoom') s *= lerp(1.14, 1, t); else if (kind === 'left') x = (1 - t) * 800; else if (kind === 'right') x = -(1 - t) * 800; else y = (1 - t) * 240; }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); op = 1 - seg(progress, OUT + 0.04, 1, E.easeInQuad); if (kind === 'zoom') s *= lerp(1, 1.1, t); else if (kind === 'left') x = -t * 800; else if (kind === 'right') x = t * 800; else y = -t * 240; }
  return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: op };
}

function Backdrop({ theme, clock }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `linear-gradient(170deg, ${theme.bg}, #FFFFFF 55%, ${theme.bg})` }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${rgba(theme.ink, 0.05)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(theme.ink, 0.05)} 1px, transparent 1px)`, backgroundSize: '60px 60px', opacity: 0.5 }} />
      <div style={{ position: 'absolute', width: 640, height: 640, borderRadius: '50%', left: -160, top: 120, background: rgba(theme.accent, 0.12), filter: 'blur(60px)', transform: `translateY(${Math.sin(clock * 0.5) * 30}px)` }} />
      <div style={{ position: 'absolute', width: 560, height: 560, borderRadius: '50%', right: -160, bottom: 120, background: rgba(theme.mark, 0.14), filter: 'blur(60px)', transform: `translateY(${Math.cos(clock * 0.4) * 30}px)` }} />
    </div>
  );
}
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'SCREENSHOT', phone: 'APP SCREEN', product: 'PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.05)} 0 15px, ${rgba(theme.ink, 0.02)} 15px 30px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, border: `3px dashed ${rgba(theme.accent, 0.8)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 38 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: '0.1em', color: theme.sub, textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.12em', color: rgba(theme.ink, 0.3) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 60, padding: 16, background: theme.ink, boxShadow: `0 50px 100px ${rgba(theme.ink, 0.28)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', width: 150, height: 34, borderRadius: 34, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 46, overflow: 'hidden', background: theme.panel }}>{children}</div>
    </div>
  );
}
function Card({ theme, url, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden', background: theme.panel, border: `1px solid ${theme.line}`, boxShadow: `0 40px 90px ${rgba(theme.ink, 0.2)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 56, flexShrink: 0, background: '#F6F8FC', borderBottom: `1px solid ${theme.line}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px' }}>{['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 16, height: 16, borderRadius: 16, background: c }} />)}<div style={{ marginLeft: 14, flex: 1, height: 30, borderRadius: 15, background: '#EAEEF5', display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: MONO, fontSize: 15, color: theme.sub }}>{url}</div></div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Arrow({ progress, at, from, to, bend, color }) {
  const t = M.draw(progress, at, 0.4, E.easeOutCubic); if (t <= 0) return null;
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2, dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const cx = mx - dy / len * bend, cy = my + dx / len * bend, L = 1600, ang = Math.atan2(to[1] - cy, to[0] - cx) * 180 / Math.PI;
  const head = t > 0.82 ? seg(t, 0.82, 1, E.easeOutBack) : 0;
  return <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}><path d={`M${from[0]} ${from[1]} Q ${cx} ${cy} ${to[0]} ${to[1]}`} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - t)} /><g transform={`translate(${to[0]} ${to[1]}) rotate(${ang}) scale(${head})`}><path d="M3 0 L-26 -16 L-17 0 L-26 16 Z" fill={color} /></g></svg>;
}
function Callout({ progress, at, x, y, num, text, theme }) {
  return <div style={{ ...M.pop(progress, at, 0.3, 0.5), position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px 14px 14px', background: theme.ink, color: '#fff', borderRadius: 18, boxShadow: `0 14px 40px ${rgba(theme.ink, 0.3)}`, whiteSpace: 'nowrap' }}><span style={{ width: 40, height: 40, borderRadius: 12, background: theme.accent, display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 22, color: inkOn(theme.accent) }}>{num}</span><span style={{ fontFamily: DISP, fontWeight: 600, fontSize: 30 }}>{text}</span></div>;
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderRadius: 14, background: theme.panel, border: `1px solid ${theme.line}`, boxShadow: `0 6px 18px ${rgba(theme.ink, 0.08)}`, fontFamily: MONO, fontSize: 24, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 11, height: 11, borderRadius: 11, background: theme.accent }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

function Chrome({ theme, clock, total }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 46, left: 56, display: 'flex', alignItems: 'center', gap: 16 }}><span style={{ width: 44, height: 44, borderRadius: 12, background: theme.accent, display: 'grid', placeItems: 'center', color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 700, fontSize: 26 }}>{theme.brand.slice(0, 1)}</span><span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 34, color: theme.ink }}>{theme.brand}</span><span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 22, color: theme.sub }}>{theme.url}</span></div>
    </React.Fragment>
  );
}
function Frame({ progress, children }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null;
  const total = sc && sc.total ? sc.total : 26;
  const index = sc && sc.index != null ? sc.index : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg, fontFamily: DISP }}>
      <Backdrop theme={theme} clock={clock} />
      <div style={{ position: 'absolute', inset: 0, ...cam(TRANS[index % TRANS.length], progress), willChange: 'transform, opacity' }}>{children}</div>
      <Chrome theme={theme} clock={clock} total={total} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Intro({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const shot = M.pop(progress, 0.16, 0.4, 0.6);
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 210, textAlign: 'center', ...M.rise(progress, 0.04, 0.26, 40) }}>
        <div style={{ fontFamily: MONO, fontSize: 28, letterSpacing: '0.22em', color: theme.accent, textTransform: 'uppercase', marginBottom: 16 }}>{s.eyebrow || 'A QUICK TOUR'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 130, lineHeight: 0.96, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'See how|it works.')}</div>
        <div style={{ marginTop: 22, marginLeft: 'auto', marginRight: 'auto', maxWidth: 820, fontFamily: DISP, fontWeight: 400, fontSize: 34, lineHeight: 1.4, color: theme.sub }}>{s.body || 'Thirty seconds, six screens — everything your product does, start to finish.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 300, top: 780, width: 480, height: 980, ...shot, transformOrigin: 'center bottom' }}><Phone theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></Phone></div>
    </Frame>
  );
}

function Tour({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = M.pop(progress, 0.1, 0.4, 0.6);
  const chips = s.chips || ['REAL-TIME', 'ONE-TAP', 'OFFLINE'];
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 200, textAlign: 'center', ...M.rise(progress, 0.06, 0.26, 40) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 110, lineHeight: 0.96, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'One view,|zero noise.')}</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.4 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 640, height: 720, ...inT, transformOrigin: 'center' }}><Card theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></Card></div>
      <Arrow progress={progress} at={0.55} from={[300, 1420]} to={[520, 1180]} bend={70} color={theme.accent} />
      <Callout progress={progress} at={0.6} x={120} y={1430} num={s.calloutNum || '1'} text={s.callout || 'Live metrics'} theme={theme} />
    </Frame>
  );
}

function Detail({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = M.pop(progress, 0.08, 0.38, 0.7);
  const spots = s.spots || [{ n: '1', t: 'Filters', ax: 120, ay: 620, tx: 420, ty: 720 }, { n: '2', t: 'One-tap actions', ax: 560, ay: 1440, tx: 640, ty: 1200 }];
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 190, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 34), fontFamily: DISP, fontWeight: 700, fontSize: 92, letterSpacing: '-0.02em', color: theme.ink }}>{splitLines(s.headline || 'Things to notice.')}</div>
      <div style={{ position: 'absolute', left: 100, right: 100, top: 460, height: 1040, ...inT, transformOrigin: 'center top' }}><Card theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></Card></div>
      {spots.map((sp, i) => <React.Fragment key={i}><Arrow progress={progress} at={0.44 + i * 0.16} from={[sp.ax, sp.ay]} to={[sp.tx, sp.ty]} bend={i % 2 ? 60 : -60} color={theme.accent} /><Callout progress={progress} at={0.48 + i * 0.16} x={sp.ax - 20} y={sp.ay - 30} num={sp.n} text={sp.t} theme={theme} /></React.Fragment>)}
    </Frame>
  );
}

function Gallery({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [{ y: 340, h: 420, k: 'desktop' }, { y: 800, h: 420, k: 'desktop' }, { y: 1260, h: 420, k: 'phone' }];
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 190, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 34), fontFamily: DISP, fontWeight: 700, fontSize: 92, letterSpacing: '-0.02em', color: theme.ink }}>{s.headline || 'Every screen.'}</div>
      {tiles.map((t, i) => { const at = 0.16 + i * 0.12, e = M.pop(progress, at, 0.36, 0.7); return <div key={i} style={{ position: 'absolute', left: i % 2 ? 340 : 80, right: i % 2 ? 80 : 340, top: t.y, height: t.h, ...e }}><Card theme={theme} url={theme.url}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></Card></div>; })}
    </Frame>
  );
}

function Stats({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 12, suf: 'K+', l: 'TEAMS' }, { v: 4.9, suf: '★', l: 'RATING' }, { v: 99.9, suf: '%', l: 'UPTIME' }];
  return (
    <Frame progress={progress}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 300, textAlign: 'center', ...M.rise(progress, 0.06, 0.26, 40), fontFamily: DISP, fontWeight: 700, fontSize: 110, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'Loved|at scale.')}</div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 680, display: 'flex', flexDirection: 'column', gap: 34 }}>
        {stats.map((st, i) => <div key={i} style={{ ...M.pop(progress, 0.28 + i * 0.12, 0.4, 0.5), background: theme.panel, border: `1px solid ${theme.line}`, borderRadius: 30, boxShadow: `0 20px 50px ${rgba(theme.ink, 0.1)}`, padding: '40px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 150, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.accent }}><Counter progress={progress} at={0.32 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div><div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: '0.14em', color: theme.sub }}>{st.l}</div></div>)}
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
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
        <div style={{ ...logo, width: 200, height: 200, borderRadius: 48, background: theme.panel, border: `1px solid ${theme.line}`, boxShadow: `0 30px 70px ${rgba(theme.ink, 0.14)}`, overflow: 'hidden', padding: 26, marginBottom: 56 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 700, fontSize: 150, lineHeight: 0.94, letterSpacing: '-0.03em', color: theme.ink, textAlign: 'center' }}>{splitLines(s.headline || 'Start the|free trial.')}</div>
        <div style={{ ...btn, marginTop: 60, width: '100%' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '38px 0', borderRadius: 22, background: theme.accent, color: inkOn(theme.accent), fontFamily: DISP, fontWeight: 600, fontSize: 50, boxShadow: `0 20px 50px ${rgba(theme.accent, 0.4)}` }}>{s.cta || 'GET STARTED'} →</div><div style={{ marginTop: 30, textAlign: 'center', fontFamily: MONO, fontSize: 30, color: theme.sub }}>{s.url || theme.url}</div></div>
      </div>
    </Frame>
  );
}

const MAP = { Intro, Tour, Detail, Gallery, Stats, CTA };

function ShowVertFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#2F6BFF', brand: (t.brandName || 'SHOWCASE').toUpperCase(), url: t.url || 'yourapp.com',
    bg: '#EEF1F7', panel: '#FFFFFF', ink: '#131722', sub: '#5B6472', line: '#D9DEE8', mark: '#FFC53D',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.bg} transition="cut">{MAP}</window.SceneStage>
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
window.ShowVertFilm = ShowVertFilm;
