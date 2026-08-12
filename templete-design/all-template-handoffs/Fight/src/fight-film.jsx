/* fight-film.jsx — "MAIN EVENT" fight-night pitch-video template. Arena + spotlight,
   VS layout, impact/KO bursts, speed lines, screen-shake FLASH cuts, judges' scorecard.
   Distinct from prior templates. Mounted after animations-v2.jsx + tweaks-panel.jsx.
   Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#E23130', gold: '#F5C542', brand: 'MAIN EVENT', url: 'getcontender.app',
  bg: '#0B0B10', canvas: '#15151F', ring: '#20202C', ink: '#F5EFE6', sub: '#8A8496',
});
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Anton', system-ui, sans-serif";
const COND = "'Oswald', system-ui, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.2, dist = 40) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.1), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.3, from = 0.4) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.08, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  slam: (p, a = 0, d = 0.26, from = 1.6) => { const s = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + 0.06, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.55 ? '#0B0B10' : '#F5EFE6'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ═══════════════════════════ ARENA (SVG) ════════════════════════════════════
function Scene({ children, style }) {
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>{children}</svg>;
}
function Halftone({ theme, clock, o = 0.5 }) {
  const dx = (clock * 8) % 40, dy = (clock * 5) % 40;
  return <div style={{ position: 'absolute', inset: -40, backgroundImage: `radial-gradient(${rgba(theme.ink, 0.06)} 2px, transparent 2px)`, backgroundSize: '40px 40px', backgroundPosition: `${dx}px ${dy}px`, opacity: o, pointerEvents: 'none' }} />;
}
function Spotlight({ theme, clock }) {
  const sway = Math.sin(clock * 0.6) * 120;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs><radialGradient id="spot" cx="0.5" cy="0.1" r="0.9"><stop offset="0" stopColor={rgba(theme.gold, 0.22)} /><stop offset="0.5" stopColor={rgba(theme.gold, 0.05)} /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient></defs>
      <polygon points={`${960 + sway},-40 ${1240 + sway},-40 1720,1120 200,1120`} fill="url(#spot)" style={{ mixBlendMode: 'screen' }} />
    </svg>
  );
}
function Ropes({ theme }) {
  return <g>{[0, 1, 2].map(i => <g key={i}><line x1="0" y1={936 + i * 44} x2="1920" y2={936 + i * 44} stroke={rgba(theme.ink, 0.5)} strokeWidth="6" /><line x1="0" y1={936 + i * 44} x2="1920" y2={936 + i * 44} stroke={theme.accent} strokeWidth="2" /></g>)}{[120, 1800].map((x, i) => <rect key={i} x={x - 10} y="920" width="20" height="160" fill={theme.ring} />)}</g>;
}
function SpeedLines({ progress, at = 0, dur = 0.4, theme, color }) {
  const t = seg(progress, at, at + dur, E.easeOutExpo), fade = 1 - seg(progress, at + dur * 0.4, at + dur, E.easeInQuad);
  if (fade <= 0) return null;
  return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: fade }}>{[140, 300, 470, 640, 820, 940].map((y, i) => { const w = lerp(0, 1400, t) * (0.6 + (i % 3) * 0.2); return <rect key={i} x={0} y={y} width={w} height={i % 2 ? 4 : 7} fill={rgba(color || theme.accent, 0.8)} />; })}</svg>;
}
function Impact({ progress, at, cx, cy, theme, size = 260, label }) {
  const t = M.pop(progress, at, 0.32, 0.2), fade = 1 - seg(progress, at + 0.4, at + 0.8, E.easeInQuad);
  if (fade <= 0) return null;
  const pts = []; const spikes = 14;
  for (let i = 0; i < spikes * 2; i++) { const r = i % 2 ? size : size * 0.62; const a = (i / (spikes * 2)) * Math.PI * 2; pts.push(`${Math.cos(a) * r},${Math.sin(a) * r}`); }
  return (
    <div style={{ position: 'absolute', left: cx, top: cy, transform: `translate(-50%,-50%) ${t.transform || ''}`, opacity: (t.opacity != null ? t.opacity : 1) * fade }}>
      <svg width={size * 2.2} height={size * 2.2} viewBox={`${-size * 1.1} ${-size * 1.1} ${size * 2.2} ${size * 2.2}`}><polygon points={pts.join(' ')} fill={theme.gold} stroke={theme.bg} strokeWidth="6" /></svg>
      {label && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: size * 0.5, color: theme.bg, transform: 'rotate(-8deg)' }}>{label}</div>}
    </div>
  );
}

// ── Product mounts ───────────────────────────────────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.08)} 0 14px, ${rgba(theme.ink, 0.02)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 44, height: 44, border: `2px solid ${theme.gold}`, transform: 'rotate(45deg)', display: 'grid', placeItems: 'center', color: theme.gold }}><span style={{ transform: 'rotate(-45deg)', fontSize: 24, fontFamily: DISP }}>+</span></div>
      <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 14, letterSpacing: '0.18em', color: rgba(theme.ink, 0.7), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: COND, fontWeight: 500, fontSize: 11, letterSpacing: '0.2em', color: rgba(theme.ink, 0.35) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Jumbotron({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', padding: 14, background: `linear-gradient(${theme.ring}, ${theme.bg})`, border: `3px solid ${theme.gold}`, boxShadow: `0 0 60px ${rgba(theme.gold, 0.3)}, 0 40px 80px rgba(0,0,0,0.6)` }}>
      <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', width: 90, height: 18, background: theme.ring, borderLeft: `3px solid ${theme.gold}`, borderRight: `3px solid ${theme.gold}` }} />
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: theme.canvas }}>{children}</div>
    </div>
  );
}
function Phone({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 42, padding: 12, background: '#05050A', border: `2px solid ${theme.gold}`, boxShadow: `0 0 50px ${rgba(theme.gold, 0.25)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 88, height: 22, borderRadius: 22, background: '#05050A', zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 32, overflow: 'hidden', background: theme.canvas }}>{children}</div>
    </div>
  );
}
function Tag({ progress, at, text, theme, n }) {
  return <span style={{ ...M.slam(progress, at, 0.26, 1.5), display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: theme.canvas, border: `2px solid ${theme.accent}`, transform: 'skewX(-8deg)', fontFamily: COND, fontWeight: 600, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', transform: 'skewX(8deg)' }}><span style={{ color: theme.gold, fontFamily: DISP, marginRight: 8 }}>{n}</span>{text}</span></span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }
function HealthBar({ progress, at, label, frac, theme, color }) {
  const t = M.draw(progress, at, 0.6);
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: COND, fontWeight: 600, fontSize: 20, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.ink, marginBottom: 8 }}><span>{label}</span><span style={{ color: theme.gold }}>{Math.round(frac * t * 100)}</span></div>
      <div style={{ height: 20, background: theme.canvas, border: `2px solid ${rgba(theme.ink, 0.3)}`, transform: 'skewX(-12deg)' }}><div style={{ height: '100%', width: `${frac * t * 100}%`, background: `linear-gradient(90deg, ${color || theme.accent}, ${theme.gold})` }} /></div>
    </div>
  );
}

// ── Chrome (no scene numbers) ────────────────────────────────────────────────
function Chrome({ theme, clock, label }) {
  const blink = Math.floor(clock * 2) % 2 === 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 40, left: 60, display: 'flex', alignItems: 'center', gap: 12, fontFamily: DISP, fontSize: 26, color: theme.ink, letterSpacing: '0.02em' }}><span style={{ width: 16, height: 16, background: theme.accent, transform: 'rotate(45deg)' }} />{theme.brand}</div>
      <div style={{ position: 'absolute', top: 46, right: 60, display: 'flex', alignItems: 'center', gap: 10, fontFamily: COND, fontWeight: 600, fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase', color: theme.ink }}><span style={{ width: 10, height: 10, borderRadius: 10, background: theme.accent, opacity: blink ? 1 : 0.3 }} /> {label}</div>
      <div style={{ position: 'absolute', bottom: 40, left: 60, right: 60, display: 'flex', alignItems: 'center', gap: 14, fontFamily: COND, fontWeight: 600, fontSize: 15, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.sub }}><span style={{ color: theme.gold }}>★</span><div style={{ flex: 1, height: 2, background: rgba(theme.ink, 0.15) }} /><span>{theme.url}</span></div>
    </React.Fragment>
  );
}

// ── Frame: punch-in + continuous shake, FLASH cut (no opaque hold) ───────────
function Frame({ progress, index, count, label, children }) {
  const theme = useTheme();
  const clock = useClock();
  const IN = 0.12, OUT = 0.9;
  const punch = progress < IN ? (1 - seg(progress, 0, IN, E.easeOutCubic)) : (progress > OUT ? seg(progress, OUT, 1, E.easeInCubic) * 0.6 : 0);
  const shakeAmp = punch * 7 + 0.8;
  const sx = Math.sin(clock * 26) * shakeAmp, sy = Math.cos(clock * 23) * shakeAmp;
  let s = 1, op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); s = lerp(1.14, 1, t); op = seg(progress, 0, IN * 0.5, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); s = lerp(1, 1.12, t); op = 1 - seg(progress, OUT + 0.05, 1, E.easeInQuad); }
  const flash = progress < 0.07 ? 1 - seg(progress, 0, 0.07) : (progress > 0.94 ? seg(progress, 0.94, 1) : 0);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg, fontFamily: COND }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' }}>{children}</div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(125% 95% at 50% 40%, transparent 42%, ${rgba('#000000', 0.5)} 100%)` }} />
      <Chrome theme={theme} clock={clock} label={label} />
      {flash > 0 && <div style={{ position: 'absolute', inset: 0, background: flash > 0.5 ? '#fff' : theme.accent, opacity: flash * 0.9, mixBlendMode: 'screen', pointerEvents: 'none', zIndex: 60 }} />}
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function MainEvent({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'Tonight'}>
      <Scene><Spotlight theme={theme} clock={localTime} /><Ropes theme={theme} /></Scene>
      <Halftone theme={theme} clock={localTime} o={0.4} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210, textAlign: 'center' }}>
        <div style={{ ...M.rise(progress, 0.06, 0.24, 24), fontFamily: COND, fontWeight: 600, fontSize: 34, letterSpacing: '0.4em', textTransform: 'uppercase', color: theme.gold }}>{s.eyebrow || 'Tonight’s Main Event'}</div>
        <div style={{ ...M.slam(progress, 0.14, 0.32, 1.7), transformOrigin: 'center', fontFamily: DISP, fontSize: 250, lineHeight: 0.84, color: theme.ink, textShadow: `0 0 50px ${rgba(theme.accent, 0.5)}` }}>{splitLines(s.brand || theme.brand)}</div>
        <div style={{ ...M.rise(progress, 0.4, 0.26, 26), marginTop: 14, display: 'inline-block', background: theme.accent, color: inkOn(theme.accent), padding: '10px 28px', transform: 'skewX(-8deg)', fontFamily: COND, fontWeight: 700, fontSize: 26, letterSpacing: '0.14em', textTransform: 'uppercase' }}><span style={{ display: 'inline-block', transform: 'skewX(8deg)' }}>{s.tagline || 'The title fight for your workflow'}</span></div>
      </div>
      <SpeedLines progress={progress} at={0.12} dur={0.34} theme={theme} />
      <Impact progress={progress} at={0.16} cx={300} cy={760} theme={theme} size={120} />
      <Impact progress={progress} at={0.22} cx={1640} cy={720} theme={theme} size={150} />
    </Frame>
  );
}

function Challenger({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'Round 1'}>
      <Scene><Halftone theme={theme} clock={localTime} /><Ropes theme={theme} /></Scene>
      <div style={{ position: 'absolute', right: 90, top: 120, fontFamily: DISP, fontSize: 460, lineHeight: 0.8, color: rgba(theme.accent, 0.14) }}>VS</div>
      <div style={{ position: 'absolute', left: 96, top: 250, width: 900 }}>
        <div style={{ ...M.rise(progress, 0.06, 0.22, 22), fontFamily: COND, fontWeight: 600, fontSize: 30, letterSpacing: '0.28em', textTransform: 'uppercase', color: theme.gold }}>{s.eyebrow || 'In the red corner'}</div>
        <div style={{ ...M.slam(progress, 0.12, 0.3, 1.5), transformOrigin: 'left', marginTop: 10, fontFamily: DISP, fontSize: 150, lineHeight: 0.86, color: theme.ink }}>{splitLines(s.headline || 'The old way|hits hard.')}</div>
        <div style={{ ...M.rise(progress, 0.4, 0.26, 22), marginTop: 26, fontFamily: COND, fontWeight: 400, fontSize: 30, lineHeight: 1.5, color: rgba(theme.ink, 0.8), maxWidth: 720 }}>{s.body || 'Clunky tools, scattered tabs and slow hand-offs have been beating up your team round after round. It is time for a contender.'}</div>
      </div>
      <SpeedLines progress={progress} at={0.1} dur={0.32} theme={theme} color={theme.accent} />
      <Impact progress={progress} at={0.2} cx={1500} cy={520} theme={theme} size={200} label={s.pow || 'OOF'} />
    </Frame>
  );
}

function Champion({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const shot = M.slam(progress, 0.14, 0.34, 1.4);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'The Champion'}>
      <Scene><Spotlight theme={theme} clock={localTime} /><Halftone theme={theme} clock={localTime} o={0.3} /><Ropes theme={theme} /></Scene>
      <div style={{ position: 'absolute', left: 96, top: 240, width: 640 }}>
        <div style={{ ...M.rise(progress, 0.05, 0.22, 22), fontFamily: COND, fontWeight: 600, fontSize: 30, letterSpacing: '0.28em', textTransform: 'uppercase', color: theme.gold }}>{s.eyebrow || 'And the new champion'}</div>
        <div style={{ ...M.slam(progress, 0.1, 0.3, 1.5), transformOrigin: 'left', marginTop: 10, fontFamily: DISP, fontSize: 132, lineHeight: 0.86, color: theme.ink }}>{splitLines(s.headline || 'Enter the|contender.')}</div>
        <div style={{ ...M.rise(progress, 0.4, 0.26, 22), marginTop: 24, fontFamily: COND, fontWeight: 400, fontSize: 28, lineHeight: 1.5, color: rgba(theme.ink, 0.82), maxWidth: 560 }}>{s.body || 'One fast surface that lands every punch: design, review and ship without leaving the ring.'}</div>
      </div>
      <div style={{ position: 'absolute', right: 96, top: 210, width: 900, height: 560, ...shot, transformOrigin: 'center' }}>
        <Jumbotron theme={theme}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></Jumbotron>
      </div>
      <Impact progress={progress} at={0.16} cx={940} cy={430} theme={theme} size={140} label={s.pow || 'POW'} />
      <SpeedLines progress={progress} at={0.1} dur={0.3} theme={theme} color={theme.gold} />
    </Frame>
  );
}

function Combos({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const combos = s.combos || [{ n: '01', t: 'JAB — instant setup' }, { n: '02', t: 'HOOK — real-time sync' }, { n: '03', t: 'KO — ship on merge' }];
  const phoneIn = M.slam(progress, 0.16, 0.34, 1.5);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'The Combo'}>
      <Scene><Halftone theme={theme} clock={localTime} o={0.35} /><Ropes theme={theme} /></Scene>
      <div style={{ position: 'absolute', left: 96, top: 180, width: 900 }}>
        <div style={{ ...M.slam(progress, 0.06, 0.3, 1.5), transformOrigin: 'left', fontFamily: DISP, fontSize: 128, lineHeight: 0.86, color: theme.ink }}>{splitLines(s.headline || 'A three-hit|combo.')}</div>
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 20 }}>{combos.map((c, i) => <div key={i}><Tag progress={progress} at={0.34 + i * 0.12} text={c.t} n={c.n} theme={theme} /></div>)}</div>
      </div>
      <div style={{ position: 'absolute', right: 200, top: 150, width: 360, height: 760, ...phoneIn, transformOrigin: 'center bottom' }}>
        <Phone theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></Phone>
      </div>
      {combos.map((c, i) => <Impact key={i} progress={progress} at={0.36 + i * 0.12} cx={760} cy={340 + i * 150} theme={theme} size={70} />)}
    </Frame>
  );
}

function Scorecard({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 12, suf: 'K', l: 'FIGHTERS' }, { v: 98, suf: '%', l: 'WIN RATE' }, { v: 4.9, suf: '★', l: 'FAN SCORE' }];
  const bars = s.bars || [['SPEED', 0.94], ['POWER', 0.86], ['STAMINA', 0.99]];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'The Scorecard'}>
      <Scene><Halftone theme={theme} clock={localTime} o={0.3} /><Ropes theme={theme} /></Scene>
      <div style={{ position: 'absolute', left: 96, top: 170, ...M.slam(progress, 0.06, 0.3, 1.5), transformOrigin: 'left', fontFamily: DISP, fontSize: 120, lineHeight: 0.86, color: theme.ink }}>{splitLines(s.headline || 'The judges|agree.')}</div>
      <div style={{ position: 'absolute', left: 96, top: 430, display: 'flex', gap: 26 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.3 + i * 0.1, 0.34, 0.5), width: 280, background: theme.canvas, border: `2px solid ${rgba(theme.gold, 0.6)}`, padding: '26px 30px', transform: 'skewX(-6deg)' }}>
            <div style={{ transform: 'skewX(6deg)' }}>
              <div style={{ fontFamily: DISP, fontSize: 96, lineHeight: 0.9, color: theme.gold }}><Counter progress={progress} at={0.34 + i * 0.1} dur={0.5} value={st.v} suffix={st.suf} color={theme.gold} /></div>
              <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 18, letterSpacing: '0.16em', textTransform: 'uppercase', color: theme.ink, marginTop: 4 }}>{st.l}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 110, top: 430, width: 620 }}>{bars.map((b, i) => <HealthBar key={i} progress={progress} at={0.4 + i * 0.1} label={b[0]} frac={b[1]} theme={theme} />)}</div>
    </Frame>
  );
}

function StepInRing({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.slam(progress, 0.12, 0.32, 1.6);
  const pill = M.pop(progress, 0.42, 0.36, 0.5);
  const logo = M.pop(progress, 0.22, 0.4, 0.4);
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'Main Card'}>
      <Scene><Spotlight theme={theme} clock={localTime} /><Halftone theme={theme} clock={localTime} o={0.35} /><Ropes theme={theme} /></Scene>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...logo, width: 140, height: 140, background: theme.canvas, border: `3px solid ${theme.gold}`, transform: 'rotate(45deg)', display: 'grid', placeItems: 'center', overflow: 'hidden', marginBottom: 40 }}><div style={{ transform: 'rotate(-45deg)', width: 150, height: 150, padding: 18 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div></div>
        <div style={{ ...head, transformOrigin: 'center', fontFamily: DISP, fontSize: 190, lineHeight: 0.84, color: theme.ink, textAlign: 'center', textShadow: `0 0 50px ${rgba(theme.accent, 0.5)}` }}>{splitLines(s.headline || 'Step in|the ring.')}</div>
        <div style={{ ...pill, marginTop: 44, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 46px', background: theme.accent, color: inkOn(theme.accent), transform: 'skewX(-8deg)', boxShadow: `0 0 50px ${rgba(theme.accent, 0.5)}`, fontFamily: DISP, fontSize: 36 }}><span style={{ display: 'inline-block', transform: 'skewX(8deg)' }}>{s.cta || 'FIGHT NOW'} ★</span></div>
          <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 24, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.gold }}>{s.url || theme.url}</div>
        </div>
      </div>
      <Impact progress={progress} at={0.14} cx={360} cy={620} theme={theme} size={150} label={s.pow || 'KO'} />
      <SpeedLines progress={progress} at={0.1} dur={0.32} theme={theme} color={theme.gold} />
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { MainEvent, Challenger, Champion, Combos, Scorecard, StepInRing };

function FightFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#E23130', gold: t.gold || '#F5C542', brand: (t.brandName || 'MAIN EVENT').toUpperCase(), url: t.url || 'getcontender.app',
    bg: '#0B0B10', canvas: '#15151F', ring: '#20202C', ink: '#F5EFE6', sub: '#8A8496',
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
        <TweakSection label="Fight card" />
        <TweakColor label="Corner (accent)" value={t.accent} options={['#E23130', '#2F6BFF', '#12B37E', '#B5179E', '#F97316']} onChange={v => setTweak('accent', v)} />
        <TweakColor label="Belt (gold)" value={t.gold} options={['#F5C542', '#E6E6E6', '#FF7BD5', '#5AD1FF']} onChange={v => setTweak('gold', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.FightFilm = FightFilm;
