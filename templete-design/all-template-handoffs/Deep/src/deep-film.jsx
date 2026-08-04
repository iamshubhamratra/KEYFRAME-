/* deep-film.jsx — "DEEP" bioluminescent deep-sea template. Product screenshots glow
   inside underwater viewport panels amid bubbles, jellyfish, fish, kelp and caustic light.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#3FE7D6', brand: 'DEEP', url: 'deep.io', glow2: '#B36BFF',
  bgTop: '#0A3A44', bgMid: '#062632', bgDeep: '#02101A', ink: '#E9FBF8', sub: '#7FB8B8',
});
const useTheme = () => React.useContext(ThemeContext);
const DISP = "'Outfit', system-ui, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.24, dist = 46) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.16), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.36, from = 0.6) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.12, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// Camera: gentle underwater float + soft dissolve at boundaries
function ocam(progress) {
  const IN = 0.14, OUT = 0.86;
  let sc = 1 + 0.03 * E.easeInOutSine(progress), ty = Math.sin(progress * Math.PI) * -8, op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); ty += (1 - t) * 70; sc *= (0.96 + 0.04 * t); op = seg(progress, 0, IN * 0.7, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); ty += -t * 60; op = 1 - seg(progress, OUT + (1 - OUT) * 0.45, 1, E.easeInQuad); }
  return { transform: `translateY(${ty.toFixed(1)}px) scale(${sc.toFixed(4)})`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' };
}

// ═══════════════════════════ OCEAN WORLD (SVG) ══════════════════════════════
function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}

function Caustics({ theme, clock }) {
  const beams = [{ x: 260, w: 220, s: 0.5 }, { x: 720, w: 300, s: 0.35 }, { x: 1240, w: 260, s: 0.6 }, { x: 1640, w: 200, s: 0.45 }];
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      {beams.map((b, i) => {
        const sh = Math.sin(clock * b.s + i) * 40;
        const o = 0.06 + 0.05 * (Math.sin(clock * b.s * 1.3 + i) * 0.5 + 0.5);
        return <polygon key={i} points={`${b.x + sh},-40 ${b.x + b.w + sh},-40 ${b.x + b.w * 2.4 + sh * 2},1120 ${b.x + b.w * 1.2 + sh * 2},1120`} fill={rgba(theme.accent, o)} />;
      })}
    </g>
  );
}

function Bubbles({ theme, clock, n = 40 }) {
  return (
    <g>{new Array(n).fill(0).map((_, i) => {
      const seed = i * 97.13, x0 = (seed % 1920), sp = 60 + (seed % 90), r = 3 + (seed % 5) + (i % 3);
      const y = 1080 - (((clock * sp + seed * 3) % 1200));
      const x = x0 + Math.sin(clock * 0.8 + i) * 22;
      const o = clamp01(y / 1080) * 0.5;
      if (y < -20) return null;
      return <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={rgba(theme.accent, o)} strokeWidth="1.5" />;
    })}</g>
  );
}

function Plankton({ theme, clock, n = 30 }) {
  return (
    <g>{new Array(n).fill(0).map((_, i) => {
      const seed = i * 53.7, x = (seed % 1920) + Math.sin(clock * 0.4 + i) * 30, y = (seed * 7 % 1080) + Math.cos(clock * 0.3 + i) * 24;
      const tw = 0.3 + 0.7 * (Math.sin(clock * 1.5 + i) * 0.5 + 0.5);
      return <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 3 : 1.8} fill={i % 5 === 0 ? theme.glow2 : theme.accent} opacity={tw * 0.6} />;
    })}</g>
  );
}

function Jelly({ x, y, s = 1, clock, phase = 0, color }) {
  const pulse = Math.sin(clock * 1.6 + phase);
  const belly = 1 + pulse * 0.12, bellW = 1 - pulse * 0.06;
  const drift = Math.sin(clock * 0.5 + phase) * 20;
  return (
    <g transform={`translate(${x + drift} ${y + Math.cos(clock * 0.4 + phase) * 22}) scale(${s})`}>
      <circle r="110" fill={rgba(color, 0.14)} style={{ filter: 'blur(6px)' }} />
      <g transform={`scale(${bellW} ${belly})`}>
        <path d="M-70 6 Q -70 -78 0 -78 Q 70 -78 70 6 Q 40 22 34 6 Q 22 22 12 6 Q 0 22 -12 6 Q -22 22 -34 6 Q -40 22 -70 6 Z" fill={rgba(color, 0.5)} stroke={rgba(color, 0.85)} strokeWidth="2" />
        <path d="M-46 -40 Q 0 -66 46 -40" fill="none" stroke={rgba('#FFFFFF', 0.4)} strokeWidth="2" />
      </g>
      {[-42, -22, 0, 22, 42].map((tx, i) => {
        const w = Math.sin(clock * 2 + i + phase) * 14;
        return <path key={i} d={`M${tx} 8 Q ${tx + w} 90 ${tx + w * 0.6} 190`} fill="none" stroke={rgba(color, 0.5)} strokeWidth="4" strokeLinecap="round" />;
      })}
    </g>
  );
}

function Fish({ clock, y, sp, off, s, color }) {
  const x = ((clock * sp + off) % (1920 + 300)) - 150;
  const wig = Math.sin(clock * 8 + off) * 8;
  return (
    <g transform={`translate(${x} ${y + Math.sin(clock + off) * 12}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="26" ry="13" fill={color} />
      <path d={`M-24 0 L-44 ${-12 + wig} L-44 ${12 + wig} Z`} fill={color} />
      <circle cx="14" cy="-3" r="2.5" fill="#02101A" />
    </g>
  );
}

function Kelp({ x, h, clock, phase, color }) {
  const segs = 8, pts = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(`${x + Math.sin(clock * 1.2 + phase + t * 3) * 26 * t},${1080 - t * h}`); }
  return <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" opacity="0.7" />;
}

function Sonar({ progress, at, cx, cy, theme, n = 3 }) {
  return <g>{new Array(n).fill(0).map((_, i) => { const t = M.draw(progress, at + i * 0.16, 0.7, E.easeOutCubic); const r = t * 360; return t > 0 && t < 1 ? <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={rgba(theme.accent, (1 - t) * 0.6)} strokeWidth="3" /> : null; })}</g>;
}

function OceanBG({ theme, clock }) {
  return (
    <React.Fragment>
      <defs><linearGradient id="dpSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.bgTop} /><stop offset="0.5" stopColor={theme.bgMid} /><stop offset="1" stopColor={theme.bgDeep} /></linearGradient></defs>
      <rect x="0" y="0" width="1920" height="1080" fill="url(#dpSea)" />
      <Caustics theme={theme} clock={clock} />
      <Plankton theme={theme} clock={clock} />
      <Kelp x={120} h={340} clock={clock} phase={0} color={rgba(theme.accent, 0.25)} />
      <Kelp x={210} h={260} clock={clock} phase={1.4} color={rgba(theme.glow2, 0.2)} />
      <Kelp x={1780} h={380} clock={clock} phase={0.6} color={rgba(theme.accent, 0.25)} />
      <Kelp x={1850} h={280} clock={clock} phase={2.1} color={rgba(theme.accent, 0.18)} />
      <Fish clock={clock} y={760} sp={70} off={0} s={0.9} color={rgba(theme.accent, 0.5)} />
      <Fish clock={clock} y={800} sp={70} off={70} s={0.7} color={rgba(theme.accent, 0.45)} />
      <Fish clock={clock} y={730} sp={70} off={150} s={0.8} color={rgba(theme.accent, 0.4)} />
      <Bubbles theme={theme} clock={clock} />
    </React.Fragment>
  );
}

// ── Product mounts (glowing viewport panels) ─────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.02)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, border: `2px dashed ${rgba(theme.accent, 0.9)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 26 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: rgba(theme.ink, 0.32) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Viewport({ theme, glow, children, radius = 22, chrome }) {
  const g = glow || theme.accent;
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: radius, overflow: 'hidden', background: rgba('#02101A', 0.5), border: `2px solid ${rgba(g, 0.7)}`, boxShadow: `0 0 70px ${rgba(g, 0.45)}, inset 0 0 50px ${rgba(g, 0.14)}`, backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column' }}>
      {chrome && <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', borderBottom: `1px solid ${rgba(g, 0.3)}` }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 10, height: 10, borderRadius: 10, background: rgba(g, 0.6) }} />)}<div style={{ marginLeft: 10, fontFamily: MONO, fontSize: 12, color: rgba(theme.ink, 0.55) }}>{theme.url}</div></div>}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Porthole({ theme, glow, children }) {
  const g = glow || theme.accent;
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: '50%', padding: 16, background: rgba('#02101A', 0.6), border: `4px solid ${rgba(g, 0.7)}`, boxShadow: `0 0 70px ${rgba(g, 0.5)}, inset 0 0 40px ${rgba(g, 0.16)}`, position: 'relative' }}>
      {[0, 90, 180, 270].map(a => <span key={a} style={{ position: 'absolute', width: 12, height: 12, borderRadius: 12, background: rgba(g, 0.8), left: '50%', top: '50%', transform: `rotate(${a}deg) translateY(-${50}%) translateY(4px)`, transformOrigin: 'center', marginLeft: -6, marginTop: -6 }} />)}
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
function Phone({ theme, glow, children }) {
  const g = glow || theme.accent;
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 44, padding: 12, background: '#02101A', border: `2px solid ${rgba(g, 0.6)}`, boxShadow: `0 0 60px ${rgba(g, 0.4)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 88, height: 22, borderRadius: 22, background: '#02101A', zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 33, overflow: 'hidden', background: rgba(theme.ink, 0.04) }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.34, 0.6), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: rgba(theme.accent, 0.08), border: `1px solid ${rgba(theme.accent, 0.5)}`, backdropFilter: 'blur(6px)', fontFamily: MONO, fontSize: 15, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 7, background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} />{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

// ── Chrome ───────────────────────────────────────────────────────────────────
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 44, left: 58, display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 12, height: 12, borderRadius: 12, background: theme.accent, boxShadow: `0 0 14px ${theme.accent}` }} />
        <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 24, letterSpacing: '0.06em', color: theme.ink }}>{theme.brand}</span>
        {label && <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.16em', color: theme.sub, textTransform: 'uppercase' }}>· {label}</span>}
      </div>
      <div style={{ position: 'absolute', top: 50, right: 58, fontFamily: MONO, fontSize: 13, letterSpacing: '0.14em', color: theme.sub }}>DEPTH {String((index + 1) * 400).padStart(4, '0')}M</div>
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bgDeep, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...ocam(progress) }}>
        <Scene><OceanBG theme={theme} clock={clock} /></Scene>
        {children}
      </div>
      <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Descend({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const panel = seg(progress, 0.42, 0.72, E.easeOutCubic);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'DESCENT'}>
      <Scene><Jelly x={1480} y={360} s={1.15} clock={localTime} phase={0} color={theme.glow2} /><Jelly x={360} y={720} s={0.7} clock={localTime} phase={2} color={theme.accent} /></Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 200, textAlign: 'center' }}>
        <div style={{ ...M.pop(progress, 0.16, 0.44, 0.7), transformOrigin: 'center', fontFamily: DISP, fontWeight: 700, fontSize: 200, lineHeight: 0.9, letterSpacing: '0.08em', color: theme.ink, textShadow: `0 0 60px ${rgba(theme.accent, 0.6)}` }}>{s.brand || theme.brand}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 34), fontFamily: MONO, fontSize: 24, letterSpacing: '0.28em', color: theme.accent, textTransform: 'uppercase' }}>{s.tagline || 'Go deeper.'}</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 560, width: 940, height: 440, transform: `translateX(-50%) translateY(${(1 - panel) * 120}px) scale(${lerp(0.95, 1, panel)})`, opacity: panel }}>
        <Viewport theme={theme} chrome><MediaSlot src={s.shot} kind="desktop" label="HERO SCREENSHOT" theme={theme} /></Viewport>
      </div>
    </Frame>
  );
}

function Discover({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.12, 0.46, E.easeOutCubic);
  const chips = s.chips || ['REAL-TIME DEPTH', 'ZERO NOISE', 'ALWAYS LIT'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'DISCOVER'}>
      <Scene><Jelly x={470} y={760} s={0.9} clock={localTime} phase={1} color={theme.glow2} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 250, width: 640, ...M.rise(progress, 0.12, 0.3, 40) }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.2em', color: theme.accent, marginBottom: 16 }}>{s.eyebrow || 'INTO THE DARK'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 88, lineHeight: 0.98, color: theme.ink }}>{splitLines(s.headline || 'See what|others miss.')}</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.48 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 110, top: 210, width: 900, height: 620, transform: `translateX(${(1 - inT) * 700}px)`, opacity: inT }}>
        <Viewport theme={theme} chrome><MediaSlot src={s.shot} kind="desktop" theme={theme} /></Viewport>
      </div>
    </Frame>
  );
}

function Explore({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const tiles = [
    { x: 150, y: 300, w: 500, h: 300, k: 'desktop', g: theme.accent }, { x: 700, y: 250, w: 360, h: 300, k: 'phone', g: theme.glow2 },
    { x: 1120, y: 300, w: 640, h: 300, k: 'desktop', g: theme.accent }, { x: 320, y: 640, w: 560, h: 250, k: 'desktop', g: theme.glow2 },
    { x: 960, y: 640, w: 640, h: 250, k: 'shot', g: theme.accent },
  ];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'EXPLORE'}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 110, textAlign: 'center', ...M.rise(progress, 0.06, 0.24, 30), zIndex: 6 }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 68, color: theme.ink, textShadow: `0 0 40px ${rgba(theme.accent, 0.5)}` }}>{s.headline || 'A world of screens.'}</div>
      </div>
      {tiles.map((t, i) => { const at = 0.16 + i * 0.09, e = seg(progress, at, at + 0.34, E.easeOutCubic); const fl = Math.sin(localTime * 0.6 + i) * 10; return (
        <div key={i} style={{ position: 'absolute', left: t.x, top: t.y + fl, width: t.w, height: t.h, opacity: e, transform: `translateY(${(1 - e) * 60}px) scale(${lerp(0.92, 1, e)})` }}>
          <Viewport theme={theme} glow={t.g}><MediaSlot src={s['shot' + (i + 1)]} kind={t.k} label={`SCREENSHOT ${i + 1}`} theme={theme} /></Viewport>
        </div>
      ); })}
    </Frame>
  );
}

function Signals({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 4000, suf: 'M', l: 'DEPTH REACHED' }, { v: 99.9, suf: '%', l: 'SIGNAL CLARITY' }, { v: 24, suf: '/7', l: 'ALWAYS ON' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'SIGNALS'}>
      <Scene><Sonar progress={progress} at={0.2} cx={1500} cy={420} theme={theme} /><Jelly x={1500} y={420} s={0.6} clock={localTime} phase={0} color={theme.accent} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 210, ...M.rise(progress, 0.08, 0.26, 36) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 0.94, color: theme.ink }}>{splitLines(s.headline || 'Clear at|any depth.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 440, display: 'flex', gap: 34 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.34 + i * 0.12, 0.4, 0.6), background: rgba(theme.accent, 0.06), border: `1px solid ${rgba(theme.accent, 0.4)}`, borderRadius: 24, boxShadow: `0 0 50px ${rgba(theme.accent, 0.16)}`, backdropFilter: 'blur(6px)', padding: '32px 44px', minWidth: 300 }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 1, color: theme.accent, textShadow: `0 0 30px ${rgba(theme.accent, 0.6)}` }}><Counter progress={progress} at={0.38 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.12em', color: theme.sub, marginTop: 8 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Pocket({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.12, 0.46, E.easeOutCubic);
  const chips = s.chips || ['OFFLINE DIVES', 'GLOW ALERTS', 'DEPTH LOG'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'IN HAND'}>
      <Scene><Jelly x={1440} y={720} s={0.8} clock={localTime} phase={1.5} color={theme.glow2} /></Scene>
      <div style={{ position: 'absolute', right: 130, top: 260, width: 620, textAlign: 'right', ...M.rise(progress, 0.14, 0.3, 40) }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.2em', color: theme.accent, marginBottom: 16 }}>{s.eyebrow || 'CARRY THE LIGHT'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 88, lineHeight: 0.98, color: theme.ink }}>{splitLines(s.headline || 'In your|pocket.')}</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.46 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', left: 340, top: 150, width: 360, height: 760, transform: `translateY(${(1 - inT) * 780}px)`, opacity: inT }}>
        <Phone theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></Phone>
      </div>
    </Frame>
  );
}

function Surface({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.rise(progress, 0.12, 0.3, 44);
  const pill = M.pop(progress, 0.44, 0.4, 0.5);
  const logo = M.pop(progress, 0.22, 0.5, 0.5);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'RESURFACE'}>
      <Scene><Sonar progress={progress} at={0.2} cx={960} cy={470} theme={theme} n={4} /><Jelly x={520} y={300} s={0.7} clock={localTime} phase={0} color={theme.glow2} /><Jelly x={1420} y={720} s={0.8} clock={localTime} phase={2} color={theme.accent} /></Scene>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...logo, width: 132, height: 132, borderRadius: '50%', border: `2px solid ${rgba(theme.accent, 0.6)}`, boxShadow: `0 0 60px ${rgba(theme.accent, 0.4)}`, background: rgba('#02101A', 0.5), overflow: 'hidden', padding: 20, marginBottom: 30 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 700, fontSize: 128, lineHeight: 0.92, letterSpacing: '0.02em', color: theme.ink, textAlign: 'center', textShadow: `0 0 60px ${rgba(theme.accent, 0.5)}` }}>{splitLines(s.headline || 'Dive in.')}</div>
        <div style={{ ...pill, marginTop: 40, display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 46px', borderRadius: 999, background: theme.accent, color: '#02101A', fontFamily: DISP, fontWeight: 700, fontSize: 30, boxShadow: `0 0 50px ${rgba(theme.accent, 0.6)}` }}>{s.cta || 'START FREE'} <span style={{ fontSize: 28 }}>→</span></div>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.1em', color: theme.sub }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Descend, Discover, Explore, Signals, Pocket, Surface };

function DeepFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#3FE7D6', glow2: t.glow2 || '#B36BFF', brand: (t.brandName || 'DEEP').toUpperCase(), url: t.url || 'deep.io',
    bgTop: '#0A3A44', bgMid: '#062632', bgDeep: '#02101A', ink: '#E9FBF8', sub: '#7FB8B8',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.bgDeep} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Bioluminescence" value={t.accent} options={['#3FE7D6', '#35A7FF', '#57F2A0', '#FF7BD5', '#FFD24A']} onChange={v => setTweak('accent', v)} />
        <TweakColor label="Creature glow" value={t.glow2} options={['#B36BFF', '#3FE7D6', '#FF7BD5', '#35A7FF']} onChange={v => setTweak('glow2', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.DeepFilm = DeepFilm;
