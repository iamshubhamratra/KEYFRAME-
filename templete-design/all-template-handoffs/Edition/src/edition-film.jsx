/* edition-film.jsx — "EDITION" Swiss editorial / print-magazine kinetic-typography template.
   Modular cream-and-ink grid, Anton display type, hairline rules that draw, clip-path headline
   reveals, figure-captioned screenshot plates, a rolling number ledger, COLUMN-SHUTTER wipes.
   Motion pass: a persistent always-moving press layer + continuous life on every element (no
   static holds), reveals fire early and fast.
   Mounted after animations-v2.jsx + tweaks-panel.jsx. Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#DA3A24', brand: 'EDITION', url: 'edition.press', blue: '#1F3A8A',
  paper: '#EFE9DA', ink: '#16130D', sub: '#6A6252', rule: '#16130D',
});
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Anton', system-ui, sans-serif";
const SERIF = "'Spectral', Georgia, serif";
const GROT = "'Archivo', system-ui, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.18, dist = 34) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.1), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  draw: (p, a = 0, d = 0.4, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.5 ? '#16130D' : '#EFE9DA'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ── Persistent "press" layer — always moving, independent of scene progress ──
function LiveBG({ theme, dark = false }) {
  const clock = useClock();
  const ink = dark ? theme.paper : theme.ink;
  const cols = 12, colW = 1920 / cols, dx = (clock * 10) % colW;
  const dot = (clock * 14) % 34, dot2 = (clock * 9) % 34;
  const reg = [[180, 210], [1740, 250], [230, 900], [1700, 880]];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: -40, backgroundImage: `radial-gradient(${rgba(ink, dark ? 0.09 : 0.06)} 1.6px, transparent 1.6px)`, backgroundSize: '34px 34px', backgroundPosition: `${dot}px ${dot2}px`, opacity: 0.7 }} />
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        {new Array(cols + 1).fill(0).map((_, i) => <line key={i} x1={i * colW - dx} y1="0" x2={i * colW - dx} y2="1080" stroke={rgba(ink, 0.05)} strokeWidth="1" />)}
        <g transform={`translate(1560 300) rotate(${clock * 6})`} opacity={dark ? 0.14 : 0.07}><circle r="360" fill="none" stroke={theme.accent} strokeWidth="2" strokeDasharray="40 26" /><circle r="250" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="14 20" /></g>
        {reg.map((p, i) => { const a = 0.2 + 0.5 * (Math.sin(clock * 2.4 + i) * 0.5 + 0.5); return <g key={i} stroke={rgba(theme.accent, a)} strokeWidth="1.5"><line x1={p[0] - 12} y1={p[1]} x2={p[0] + 12} y2={p[1]} /><line x1={p[0]} y1={p[1] - 12} x2={p[0]} y2={p[1] + 12} /><circle cx={p[0]} cy={p[1]} r="7" fill="none" /></g>; })}
      </svg>
    </div>
  );
}

// ── Per-scene transitions — a different move for every slide ─────────────────
function Transition({ progress, theme, kind = 'columns' }) {
  const IN = 0.1, OUT = 0.9;
  let c = null; // coverage: 1 = fully covered, 0 = clear
  if (progress < IN) c = 1 - seg(progress, 0, IN, E.easeInOutCubic);
  else if (progress > OUT) c = seg(progress, OUT, 1, E.easeInOutCubic);
  else return null;
  const wrap = { position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none', overflow: 'hidden' };
  if (kind === 'blinds') { // venetian: horizontal rows slide out alternately
    const R = 9, st = 0.05;
    return <div style={wrap}>{new Array(R).fill(0).map((_, i) => { const cc = clamp01((c - (R - 1 - i) * st) / (1 - st * (R - 1))); const dir = i % 2 ? 1 : -1; return <div key={i} style={{ position: 'absolute', left: '-1%', right: '-1%', top: `${i * 100 / R}%`, height: `${100 / R + 0.6}%`, background: i % 2 ? theme.ink : theme.accent, transform: `translateX(${(1 - cc) * 112 * dir}%)` }} />; })}</div>;
  }
  if (kind === 'barn') { // barn doors: top & bottom halves meet/part
    return <div style={wrap}><div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50.5%', background: theme.ink, transform: `translateY(${-(1 - c) * 100}%)` }} /><div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50.5%', background: theme.ink, transform: `translateY(${(1 - c) * 100}%)` }} /><div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 5, background: theme.accent, transform: `translateY(-50%) scaleX(${c})` }} /></div>;
  }
  if (kind === 'iris') { // ink disc irises open/closed from centre
    return <div style={{ ...wrap, background: theme.ink, clipPath: `circle(${c * 75}% at 50% 50%)` }}><div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><div style={{ width: 360, height: 360, border: `3px solid ${theme.accent}`, borderRadius: '50%', transform: `scale(${0.4 + c})`, opacity: c }} /></div></div>;
  }
  if (kind === 'inkblot') { // spreading ink blots
    const spots = [[28, 38], [72, 60], [50, 18], [82, 34], [18, 76], [60, 88]];
    return <div style={wrap}>{spots.map((p, i) => <div key={i} style={{ position: 'absolute', left: `${p[0]}%`, top: `${p[1]}%`, width: 1120, height: 1120, marginLeft: -560, marginTop: -560, borderRadius: '50%', background: i % 3 === 0 ? theme.accent : theme.ink, transform: `scale(${clamp01(c * 1.9 - i * 0.1)})` }} />)}</div>;
  }
  if (kind === 'diagonal') { // skewed bar sweeps across
    return <div style={wrap}><div style={{ position: 'absolute', top: '-12%', bottom: '-12%', left: '-24%', width: '150%', background: theme.ink, transform: `translateX(${(1 - c) * 150}%) skewX(-10deg)` }} /><div style={{ position: 'absolute', top: '-12%', bottom: '-12%', left: '-28%', width: 70, background: theme.accent, transform: `translateX(${(1 - c) * 150 + 150}%) skewX(-10deg)` }} /></div>;
  }
  // 'columns' (default) — vertical bars
  const N = 6, st = 0.04;
  return <div style={{ ...wrap, display: 'flex' }}>{new Array(N).fill(0).map((_, i) => { const cc = clamp01((c - i * st) / (1 - st * (N - 1))); return <div key={i} style={{ width: `${100 / N}%`, height: '100%', background: i % 2 === 0 ? theme.ink : theme.accent, transform: `translateY(${-(1 - cc) * 100}%)` }} />; })}</div>;
}

// Rules
function RuleH({ progress, at = 0.06, dur = 0.4, top, left = 0, right = 0, color, w = 2 }) {
  const t = M.draw(progress, at, dur, E.easeInOutCubic);
  return <div style={{ position: 'absolute', top, left, right, height: w, background: color, transform: `scaleX(${t})`, transformOrigin: 'left center' }} />;
}
function RuleV({ progress, at = 0.06, dur = 0.4, left, top = 0, bottom = 0, color, w = 2 }) {
  const t = M.draw(progress, at, dur, E.easeInOutCubic);
  return <div style={{ position: 'absolute', left, top, bottom, width: w, background: color, transform: `scaleY(${t})`, transformOrigin: 'top center' }} />;
}
// Headline clip reveal + a continuous "breathing" accent measure underneath
function ClipHead({ progress, at = 0.04, dur = 0.42, children, style, measure = true, theme }) {
  const t = M.draw(progress, at, dur, E.easeInOutCubic);
  const clock = useClock();
  const bw = measure ? (0.6 + 0.4 * (Math.sin(clock * 1.6) * 0.5 + 0.5)) : 0;
  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ clipPath: `inset(0 ${(1 - t) * 100}% 0 0)`, ...style }}>{children}</div>
      {measure && <div style={{ marginTop: 14, height: 6, width: `${bw * 100}%`, maxWidth: 340, background: theme.accent, opacity: seg(progress, at + 0.1, at + 0.3) }} />}
    </div>
  );
}

// ── Plate: bordered, captioned, exposure reveal + continuous bob & sweeping sheen ──
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.07)} 0 13px, ${rgba(theme.ink, 0.02)} 13px 26px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 40, height: 40, border: `2px solid ${theme.accent}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 24, fontFamily: DISP }}>+</div>
      <div style={{ fontFamily: GROT, fontWeight: 700, fontSize: 13, letterSpacing: '0.14em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: GROT, fontWeight: 600, fontSize: 10, letterSpacing: '0.16em', color: rgba(theme.ink, 0.32) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Plate({ progress, at = 0.1, fig, label, theme, src, kind = 'shot', style, seed = 0 }) {
  const clock = useClock();
  const t = M.draw(progress, at, 0.42, E.easeInOutCubic);
  const bob = Math.sin(clock * 0.8 + seed) * 6;
  const sweep = ((clock * 0.32 + seed * 0.5) % 1.6);
  return (
    <div style={{ position: 'absolute', border: `2px solid ${theme.ink}`, background: theme.paper, display: 'flex', flexDirection: 'column', transform: `translateY(${bob}px)`, ...style }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: '100%', height: '100%', clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` }}><MediaSlot src={src} kind={kind} label={label} theme={theme} /></div>
        {t > 0.99 && sweep < 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${sweep * 130 - 30}%`, width: '22%', background: `linear-gradient(100deg, transparent, ${rgba('#FFFFFF', 0.35)}, transparent)`, mixBlendMode: 'screen', transform: 'skewX(-12deg)' }} />}
      </div>
      <div style={{ flexShrink: 0, borderTop: `2px solid ${theme.ink}`, padding: '7px 12px', display: 'flex', justifyContent: 'space-between', fontFamily: GROT, fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.ink, opacity: seg(progress, at, at + 0.16) }}>
        <span>FIG. {fig}</span><span style={{ color: theme.accent }}>{label || 'PLATE'}</span>
      </div>
    </div>
  );
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

// Drifting oversized numeral (continuous)
function GhostNum({ children, style, color, amp = 14, rot = 1.5 }) {
  const clock = useClock();
  return <div style={{ position: 'absolute', color, transform: `translateY(${Math.sin(clock * 0.5) * amp}px) rotate(${Math.sin(clock * 0.4) * rot}deg)`, ...style }}>{children}</div>;
}

// ── Chrome: masthead + marquee footer + live traveling tick ──────────────────
function Marquee({ theme, clock, text }) {
  const unit = `${text}`; const line = new Array(6).fill(unit).join('  —  ');
  return <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, height: 26, overflow: 'hidden', display: 'flex', alignItems: 'center' }}><div style={{ whiteSpace: 'nowrap', transform: `translateX(${-((clock * 90) % 1200)}px)`, fontFamily: GROT, fontWeight: 700, fontSize: 15, letterSpacing: '0.18em', color: rgba(theme.ink, 0.55), textTransform: 'uppercase' }}>{line}   {line}</div></div>;
}
function Chrome({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  const tick = (clock * 120) % 1792;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 40, left: 64, right: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: GROT, fontWeight: 800, fontSize: 15, letterSpacing: '0.16em', textTransform: 'uppercase', color: theme.ink }}>
        <span>{theme.brand}</span><span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'none', fontSize: 18, color: theme.sub }}>{label}</span><span>{theme.url}</span>
      </div>
      <Marquee theme={theme} clock={clock} text={`${theme.brand} · ${theme.url}`} />
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children, dark = false, trans = 'columns' }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 30;
  const dir = index % 2 ? 1 : -1, IN = 0.14, OUT = 0.86;
  let x = dir * (54 - 108 * progress);
  let y = Math.sin(progress * Math.PI) * -16;
  let s = 1.035 + 0.05 * progress;
  let op = 1;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); x += (1 - t) * dir * 1100; s -= (1 - t) * 0.05; op = seg(progress, 0, IN * 0.65, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); x -= dir * t * 1100; s += t * 0.05; op = 1 - seg(progress, OUT + (1 - OUT) * 0.35, 1, E.easeInQuad); }
  const swipe = progress < IN ? seg(progress, 0, IN, E.easeInOutCubic) : (progress > OUT ? seg(progress, OUT, 1, E.easeInOutCubic) : null);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: dark ? theme.ink : theme.paper, fontFamily: GROT }}>
      <LiveBG theme={theme} dark={dark} />
      <div style={{ position: 'absolute', inset: 0, opacity: op, transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`, transformOrigin: 'center center', willChange: 'transform, opacity' }}>{children}</div>
      {!dark && <Chrome theme={theme} clock={clock} total={total} count={count} index={index} label={label} />}
      {swipe !== null && <div style={{ position: 'absolute', top: 0, bottom: 0, width: '7%', left: `${dir < 0 ? lerp(107, -10, swipe) : lerp(-10, 107, swipe)}%`, background: theme.accent, zIndex: 55, boxShadow: `0 0 60px ${rgba(theme.accent, 0.6)}` }} />}
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Cover({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'The Masthead'} trans="columns">
      <GhostNum color={rgba(theme.ink, 0.06)} style={{ right: 64, top: 150, fontFamily: DISP, fontSize: 620, lineHeight: 0.8 }} amp={20}>{s.issue || '01'}</GhostNum>
      <div style={{ position: 'absolute', left: 64, top: 210 }}>
        <div style={{ ...M.rise(progress, 0.03, 0.22, 26), fontFamily: SERIF, fontStyle: 'italic', fontSize: 34, color: theme.accent, marginBottom: 8 }}>{s.eyebrow || 'The first issue of'}</div>
        <ClipHead progress={progress} at={0.06} dur={0.42} theme={theme} style={{ fontFamily: DISP, fontSize: 260, lineHeight: 0.82, color: theme.ink, textTransform: 'uppercase' }}>{splitLines(s.brand || theme.brand)}</ClipHead>
      </div>
      <RuleH progress={progress} at={0.2} top={664} left={64} right={64} color={theme.ink} w={3} />
      <div style={{ position: 'absolute', left: 64, top: 690, ...M.rise(progress, 0.24, 0.24, 22), fontFamily: SERIF, fontSize: 30, lineHeight: 1.4, color: theme.ink, maxWidth: 760 }}>{s.tagline || 'A field manual for the product, printed in motion — set, exposed and pressed one page at a time.'}</div>
      <Plate progress={progress} at={0.14} fig="I" label="COVER" theme={theme} src={s.shot} kind="desktop" seed={1} style={{ right: 64, top: 730, width: 720, height: 280 }} />
    </Frame>
  );
}

function Lead({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const chips = s.chips || ['SET IN SECONDS', 'NO PROOFS', 'PRESS-READY'];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'Lead Feature'} trans="blinds">
      <GhostNum color={theme.accent} style={{ left: 64, top: 150, fontFamily: DISP, fontSize: 300, lineHeight: 0.8 }} amp={10} rot={2}>{String(index + 1).padStart(2, '0')}</GhostNum>
      <RuleV progress={progress} at={0.08} left={64} top={470} bottom={140} color={theme.ink} w={3} />
      <div style={{ position: 'absolute', left: 96, top: 480, width: 780 }}>
        <ClipHead progress={progress} at={0.04} dur={0.4} theme={theme} style={{ fontFamily: DISP, fontSize: 118, lineHeight: 0.9, color: theme.ink, textTransform: 'uppercase' }}>{splitLines(s.headline || 'One layout,|zero clutter.')}</ClipHead>
        <div style={{ ...M.rise(progress, 0.24, 0.24, 22), marginTop: 22, fontFamily: SERIF, fontSize: 27, lineHeight: 1.5, color: theme.ink, maxWidth: 640 }}>{s.body || 'Everything that matters is set above the fold and locked to a strict grid, so the reader lands exactly where the story begins.'}</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 0, flexWrap: 'wrap', borderTop: `2px solid ${theme.ink}` }}>{chips.map((c, i) => <span key={i} style={{ ...M.rise(progress, 0.34 + i * 0.06, 0.2, 14), padding: '12px 22px', borderRight: `2px solid ${theme.ink}`, fontFamily: GROT, fontWeight: 800, fontSize: 15, letterSpacing: '0.08em', color: theme.ink }}>{c}</span>)}</div>
      </div>
      <Plate progress={progress} at={0.1} fig="II" label="DASHBOARD" theme={theme} src={s.shot} kind="desktop" seed={2} style={{ right: 64, top: 150, width: 900, height: 780 }} />
    </Frame>
  );
}

function Spread({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'The Spread'} trans="barn">
      <ClipHead progress={progress} at={0.04} dur={0.42} theme={theme} style={{ position: 'absolute', left: 64, top: 140, fontFamily: DISP, fontSize: 132, lineHeight: 0.86, color: theme.ink, textTransform: 'uppercase' }}>{splitLines(s.headline || 'Every page,|on the grid.')}</ClipHead>
      <div style={{ position: 'absolute', left: 64, top: 420, ...M.rise(progress, 0.18, 0.24, 18), fontFamily: SERIF, fontSize: 26, lineHeight: 1.5, color: theme.ink, maxWidth: 620 }}>{s.body || 'Desktop, tablet and phone laid out as plates in a single spread — each captioned, each aligned to the same baseline.'}</div>
      <Plate progress={progress} at={0.12} fig="III" label="OVERVIEW" theme={theme} src={s.shot1} kind="desktop" seed={0} style={{ left: 720, top: 300, width: 620, height: 340 }} />
      <Plate progress={progress} at={0.2} fig="IV" label="MOBILE" theme={theme} src={s.shot2} kind="phone" seed={2} style={{ left: 1370, top: 210, width: 300, height: 520 }} />
      <Plate progress={progress} at={0.28} fig="V" label="DETAIL" theme={theme} src={s.shot3} kind="desktop" seed={4} style={{ left: 720, top: 668, width: 620, height: 300 }} />
    </Frame>
  );
}

function Ledger({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = useClock();
  const stats = s.stats || [{ v: 2.4, suf: 'M', l: 'COPIES IN PRINT' }, { v: 128, suf: '', l: 'EDITIONS SHIPPED' }, { v: 99, suf: '%', l: 'ON DEADLINE' }];
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'By the Numbers'} trans="iris">
      <ClipHead progress={progress} at={0.04} dur={0.42} theme={theme} style={{ position: 'absolute', left: 64, top: 150, fontFamily: DISP, fontSize: 150, lineHeight: 0.86, color: theme.ink, textTransform: 'uppercase' }}>{splitLines(s.headline || 'The ledger.')}</ClipHead>
      <div style={{ position: 'absolute', left: 64, right: 64, top: 410 }}>
        {stats.map((st, i) => { const rt = M.draw(progress, 0.1 + i * 0.1, 0.4); const tickX = (clock * 90 + i * 300) % 1792; return (
          <div key={i} style={{ position: 'relative' }}>
            <RuleH progress={progress} at={0.1 + i * 0.1} dur={0.4} top={0} left={0} right={0} color={theme.ink} w={2} />
            {rt > 0.99 && <div style={{ position: 'absolute', top: -3, left: tickX, width: 60, height: 8, background: theme.accent, opacity: 0.6 }} />}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '18px 4px 26px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 30 }}>
                <span style={{ fontFamily: GROT, fontWeight: 800, fontSize: 22, color: theme.accent }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 40, color: theme.ink }}>{st.l}</span>
              </div>
              <span style={{ fontFamily: DISP, fontSize: 130, lineHeight: 0.8, color: theme.ink }}><Counter progress={progress} at={0.14 + i * 0.1} dur={0.5} value={st.v} suffix={st.suf} color={theme.ink} /></span>
            </div>
          </div>
        ); })}
        <RuleH progress={progress} at={0.5} dur={0.4} top={510} left={0} right={0} color={theme.ink} w={2} />
      </div>
    </Frame>
  );
}

function PullQuote({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const clock = useClock();
  const words = (s.quote || 'The best interface is one you can read like a well-set page.').split(' ');
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'Marginalia'} dark trans="inkblot">
      {[[1560, 120, 300, 120], [120, 820, 200, 90]].map((b, i) => <div key={i} style={{ position: 'absolute', left: b[0] + Math.sin(clock * 0.6 + i) * 30, top: b[1] + Math.cos(clock * 0.5 + i) * 20, width: b[2], height: b[3], background: rgba(theme.accent, 0.9) }} />)}
      <div style={{ position: 'absolute', left: 64, top: 120, fontFamily: DISP, fontSize: 300, color: theme.accent, lineHeight: 0.7, transform: `scale(${1 + Math.sin(clock * 1.5) * 0.03})`, transformOrigin: 'left top' }}>“</div>
      <div style={{ position: 'absolute', left: 120, right: 140, top: 330, display: 'flex', flexWrap: 'wrap' }}>
        {words.map((w, i) => { const o = seg(progress, 0.06 + i * 0.022, 0.06 + i * 0.022 + 0.12, E.easeOutQuad); return <span key={i} style={{ opacity: o, transform: `translateY(${(1 - o) * 16}px)`, fontFamily: SERIF, fontStyle: 'italic', fontWeight: 500, fontSize: 92, lineHeight: 1.12, color: theme.paper, marginRight: 24 }}>{w}</span>; })}
      </div>
      <div style={{ position: 'absolute', left: 122, bottom: 180, ...M.rise(progress, 0.5, 0.26, 20), display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: M.draw(progress, 0.5, 0.26) * 80, height: 3, background: theme.accent }} />
        <span style={{ fontFamily: GROT, fontWeight: 800, fontSize: 22, letterSpacing: '0.08em', color: theme.paper, textTransform: 'uppercase' }}>{s.author || 'The Editors'}</span>
      </div>
    </Frame>
  );
}

function Colophon({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} label={s.kicker || 'Colophon'} trans="diagonal">
      <Plate progress={progress} at={0.08} fig="VI" label="LOGO" theme={theme} src={s.logo} kind="logo" seed={3} style={{ left: 64, top: 200, width: 260, height: 260 }} />
      <ClipHead progress={progress} at={0.06} dur={0.44} theme={theme} style={{ position: 'absolute', left: 64, top: 500, fontFamily: DISP, fontSize: 210, lineHeight: 0.84, color: theme.ink, textTransform: 'uppercase' }}>{splitLines(s.headline || 'Go to|press.')}</ClipHead>
      <RuleV progress={progress} at={0.12} left={1080} top={200} bottom={200} color={theme.ink} w={3} />
      <div style={{ position: 'absolute', left: 1140, top: 210, width: 700 }}>
        <div style={{ ...M.rise(progress, 0.2, 0.24, 22), fontFamily: SERIF, fontSize: 30, lineHeight: 1.5, color: theme.ink }}>{s.body || 'Subscribe today and every future edition of your product lands, printed in motion, on your reader’s desk.'}</div>
        <div style={{ ...M.rise(progress, 0.32, 0.24, 18), marginTop: 40, display: 'inline-flex', alignItems: 'center', gap: 16, background: theme.accent, color: inkOn(theme.accent), padding: '20px 40px', fontFamily: DISP, fontSize: 34, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{s.cta || 'SUBSCRIBE'} <span>→</span></div>
        <div style={{ ...M.rise(progress, 0.42, 0.24, 14), marginTop: 26, fontFamily: GROT, fontWeight: 800, fontSize: 20, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.ink }}>{s.url || theme.url}</div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Cover, Lead, Spread, Ledger, PullQuote, Colophon };

function EditionFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#DA3A24', brand: (t.brandName || 'EDITION').toUpperCase(), url: t.url || 'edition.press', blue: '#1F3A8A',
    paper: '#EFE9DA', ink: '#16130D', sub: '#6A6252', rule: '#16130D',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.paper} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Press" />
        <TweakColor label="Ink accent" value={t.accent} options={['#DA3A24', '#1F3A8A', '#0E7C58', '#B5179E', '#16130D']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Masthead" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.EditionFilm = EditionFilm;
