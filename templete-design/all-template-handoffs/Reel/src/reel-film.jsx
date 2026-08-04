/* reel-film.jsx — "REEL" vertical 9:16 social-story template. Animated gradient, stories
   progress bar, kinetic auto-captions, big phone/full-bleed screenshots, sticker tags,
   swipe-up push transitions. Built for 1080×1920. Mounted after animations-v2.jsx + tweaks-panel.jsx. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#D4FF3F', brand: 'REEL', url: '@getreel', c1: '#4326C9', c2: '#E1246E', c3: '#12C2E9',
  ink: '#FFFFFF', dark: '#150A2E', card: '#FFFFFF',
});
const useTheme = () => React.useContext(ThemeContext);
const useClock = () => window.useTimeline().time;
const DISP = "'Archivo', system-ui, sans-serif";
const RND = "'Baloo 2', system-ui, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.2, dist = 46) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.1), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.3, from = 0.3) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.08, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function inkOn(bg) { return lum(bg) > 0.55 ? '#150A2E' : '#FFFFFF'; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// ── Animated gradient backdrop + grain ───────────────────────────────────────
function Backdrop({ theme, clock }) {
  const blobs = [
    { c: theme.c1, x: 20, y: 18, s: 0.5 }, { c: theme.c2, x: 82, y: 30, s: 0.4 },
    { c: theme.c3, x: 30, y: 78, s: 0.45 }, { c: theme.c2, x: 78, y: 88, s: 0.5 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.dark }}>
      {blobs.map((b, i) => <div key={i} style={{ position: 'absolute', width: 760, height: 760, borderRadius: '50%', left: `${b.x}%`, top: `${b.y}%`, marginLeft: -380, marginTop: -380, background: rgba(b.c, 0.85), filter: 'blur(90px)', transform: `translate(${Math.sin(clock * b.s + i) * 60}px, ${Math.cos(clock * b.s * 0.8 + i) * 60}px)` }} />)}
      <div style={{ position: 'absolute', inset: -40, backgroundImage: `radial-gradient(${rgba('#FFFFFF', 0.05)} 1px, transparent 1px)`, backgroundSize: '30px 30px', backgroundPosition: `${(clock * 9) % 30}px ${(clock * 6) % 30}px`, opacity: 0.5, mixBlendMode: 'overlay' }} />
    </div>
  );
}

// ── Media (tall phone / full-bleed screenshot) ───────────────────────────────
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'SCREENSHOT', phone: 'APP SCREEN', product: 'PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba('#150A2E', 0.14)} 0 16px, ${rgba('#150A2E', 0.06)} 16px 32px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ width: 74, height: 74, borderRadius: 22, border: `3px dashed ${theme.c2}`, display: 'grid', placeItems: 'center', color: theme.c2, fontSize: 44, fontFamily: RND, fontWeight: 700 }}>+</div>
      <div style={{ fontFamily: RND, fontWeight: 700, fontSize: 26, letterSpacing: '0.06em', color: rgba('#150A2E', 0.6) }}>{lbl}</div>
      <div style={{ fontFamily: RND, fontWeight: 600, fontSize: 17, letterSpacing: '0.08em', color: rgba('#150A2E', 0.4) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function PhoneTall({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 66, padding: 16, background: '#0A0518', boxShadow: `0 50px 120px ${rgba('#000000', 0.5)}, 0 0 0 3px ${rgba(theme.accent, 0.5)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 34, left: '50%', transform: 'translateX(-50%)', width: 150, height: 34, borderRadius: 34, background: '#0A0518', zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 52, overflow: 'hidden', background: theme.card }}>{children}</div>
    </div>
  );
}
// Sticker tag — bold, rounded, tilted, pops with overshoot
function Sticker({ progress, at, text, theme, rot = -4, bg }) {
  return <div style={{ ...M.pop(progress, at, 0.34, 0.2), display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 30px', borderRadius: 999, background: bg || theme.accent, color: inkOn(bg || theme.accent), transform: `rotate(${rot}deg)`, boxShadow: `0 10px 0 ${rgba('#0A0518', 0.25)}`, fontFamily: RND, fontWeight: 800, fontSize: 34, whiteSpace: 'nowrap' }}>{text}</div>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }

// Kinetic auto-caption — word-by-word, active word highlighted (the signature)
function Caption({ progress, at = 0.2, words, theme, per = 0.12, size = 62 }) {
  const active = Math.floor((progress - at) / per);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 14px', maxWidth: 900 }}>
      {words.map((w, i) => {
        const shown = progress >= at + i * per * 0.6;
        const isOn = i === active;
        return <span key={i} style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(14px)', fontFamily: RND, fontWeight: 800, fontSize: size, lineHeight: 1.1, color: isOn ? inkOn(theme.accent) : theme.ink, background: isOn ? theme.accent : 'transparent', padding: isOn ? '2px 14px' : '2px 0', borderRadius: 14, textShadow: isOn ? 'none' : `0 3px 12px ${rgba('#000', 0.4)}` }}>{w}</span>;
      })}
    </div>
  );
}

// ── Chrome: stories progress bar (segmented) + handle ───────────────────────
function Stories({ theme, frac, count, index }) {
  return (
    <div style={{ position: 'absolute', top: 40, left: 40, right: 40, display: 'flex', gap: 8 }}>
      {new Array(count).fill(0).map((_, i) => { const f = i < index ? 1 : i > index ? 0 : frac; return <div key={i} style={{ flex: 1, height: 7, borderRadius: 7, background: rgba('#FFFFFF', 0.3), overflow: 'hidden' }}><div style={{ height: '100%', width: `${f * 100}%`, background: '#fff' }} /></div>; })}
    </div>
  );
}
function Handle({ theme }) {
  return (
    <div style={{ position: 'absolute', top: 68, left: 40, right: 40, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: theme.accent, display: 'grid', placeItems: 'center', fontFamily: RND, fontWeight: 800, fontSize: 28, color: inkOn(theme.accent) }}>{theme.brand.slice(0, 1)}</div>
      <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 30, color: theme.ink }}>{theme.url}</div>
    </div>
  );
}
function SwipeCue({ theme, clock }) {
  const b = Math.sin(clock * 3) * 8;
  return (
    <div style={{ position: 'absolute', bottom: 48, left: 0, right: 0, textAlign: 'center', transform: `translateY(${b}px)`, opacity: 0.9 }}>
      <div style={{ fontSize: 40 }}>︿</div>
      <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 26, letterSpacing: '0.1em', color: theme.ink }}>SWIPE UP</div>
    </div>
  );
}

// Rising social reactions in the side gutters (continuous, all scenes)
function FloatingLikes({ theme, clock }) {
  const items = ['❤️', '⭐', '🔥', '👏', '💯', '✨'];
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>{new Array(12).fill(0).map((_, i) => { const seed = i * 61.7, dur = 6 + (seed % 5); const t = (((clock + seed) % dur) / dur); const x = i % 2 ? 3 + (seed % 11) : 85 + (seed % 11); const y = 104 - t * 122; const op = Math.sin(t * Math.PI) * 0.7; return <div key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, fontSize: 38 + (i % 3) * 16, opacity: op, transform: `rotate(${Math.sin(clock + seed) * 12}deg)` }}>{items[i % items.length]}</div>; })}</div>;
}
// Pulsing multicolour halo (behind the phone)
function RingPulse({ theme, clock, size = 900 }) {
  const p = 0.5 + 0.5 * Math.sin(clock * 2);
  return <div style={{ position: 'absolute', left: '50%', top: '46%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: '50%', background: `conic-gradient(from ${clock * 40}deg, ${theme.accent}, ${theme.c2}, ${theme.c3}, ${theme.accent})`, filter: 'blur(46px)', opacity: 0.4 + p * 0.2, transform: `scale(${1 + p * 0.05})`, pointerEvents: 'none' }} />;
}
// Confetti burst
function Confetti({ theme, clock, progress, at = 0.35 }) {
  const on = M.draw(progress, at, 0.2); if (on <= 0) return null;
  const cols = [theme.accent, theme.c2, theme.c3, '#fff'];
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>{new Array(30).fill(0).map((_, i) => { const seed = i * 53.3, x = (seed % 96), t = ((clock * 0.6 + seed * 0.1) % 1), y = -6 + t * 112; return <div key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 18, height: 26, borderRadius: 4, background: cols[i % 4], opacity: on * (0.4 + 0.6 * Math.sin(t * Math.PI)), transform: `rotate(${clock * 180 + seed}deg)` }} />; })}</div>;
}

function Frame({ progress, index, count, children, cue = false, sceneScale = 'zoom' }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 28;
  const IN = 0.12, OUT = 0.9;
  let y = 0, op = 1, s = 1 + 0.03 * E.easeInOutSine(progress);
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); y = (1 - t) * 220; op = seg(progress, 0, IN * 0.6, E.easeOutQuad); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); y = -t * 220; op = 1 - seg(progress, OUT + 0.04, 1, E.easeInQuad); }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.dark, fontFamily: DISP }}>
      <Backdrop theme={theme} clock={clock} />
      <FloatingLikes theme={theme} clock={clock} />
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${y.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: op, willChange: 'transform, opacity' }}>{children}</div>
      <Handle theme={theme} />
      {cue && <SwipeCue theme={theme} clock={clock} />}
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Hook({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  return (
    <Frame progress={progress} index={index} count={count} cue>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 340, textAlign: 'center' }}>
        <div style={{ ...M.pop(progress, 0.08, 0.4, 0.3), display: 'inline-block' }}><Sticker progress={progress} at={0.08} text={s.eyebrow || 'WAIT FOR IT…'} theme={theme} rot={-3} /></div>
        <div style={{ ...M.rise(progress, 0.2, 0.3, 60), marginTop: 40, fontFamily: DISP, fontWeight: 900, fontSize: 190, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink, textShadow: `0 6px 30px ${rgba('#000', 0.4)}` }}>{splitLines(s.headline || 'YOUR APP|GOES|VIRAL.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 90, top: 300, ...M.pop(progress, 0.4, 0.4, 0.2) }}><Sticker progress={progress} at={0.4} text={s.tagA || '🔥 NEW'} theme={theme} rot={-10} bg={theme.c2} /></div>
      <div style={{ position: 'absolute', right: 70, top: 1200, ...M.pop(progress, 0.5, 0.4, 0.2) }}><Sticker progress={progress} at={0.5} text={s.tagB || '100% FASTER'} theme={theme} rot={8} bg="#fff" /></div>
    </Frame>
  );
}

function Show({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const phone = M.pop(progress, 0.1, 0.4, 0.5);
  return (
    <Frame progress={progress} index={index} count={count}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}><RingPulse theme={theme} clock={localTime} size={960} /></div>
      <div style={{ position: 'absolute', left: 180, right: 180, top: 200, height: 1180, ...phone, transformOrigin: 'center' }}>
        <PhoneTall theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></PhoneTall>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 1420, textAlign: 'center' }}>
        <Caption progress={progress} at={0.3} words={(s.caption || 'this is how it looks').split(' ')} theme={theme} per={0.13} />
      </div>
    </Frame>
  );
}

function Perks({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const perks = s.perks || ['⚡ Instant setup', '🔄 Real-time sync', '🎯 Zero clutter', '💸 Free to start'];
  const bgs = [theme.accent, '#fff', theme.c3, theme.c2];
  return (
    <Frame progress={progress} index={index} count={count}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 260, textAlign: 'center' }}>
        <div style={{ ...M.rise(progress, 0.06, 0.3, 50), fontFamily: DISP, fontWeight: 900, fontSize: 130, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'WHY YOU’LL|LOVE IT')}</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 660, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        {perks.map((p, i) => <div key={i}><Sticker progress={progress} at={0.24 + i * 0.12} text={p} theme={theme} rot={i % 2 ? 3 : -3} bg={bgs[i % bgs.length]} /></div>)}
      </div>
    </Frame>
  );
}

function Numbers({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 2, suf: 'M+', l: 'DOWNLOADS' }, { v: 4.9, suf: '★', l: 'APP RATING' }, { v: 60, suf: '%', l: 'FASTER' }];
  return (
    <Frame progress={progress} index={index} count={count}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 230, textAlign: 'center', ...M.rise(progress, 0.06, 0.3, 44), fontFamily: DISP, fontWeight: 900, fontSize: 120, lineHeight: 0.92, letterSpacing: '-0.03em', color: theme.ink }}>{splitLines(s.headline || 'THE|NUMBERS')}</div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 620, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.24 + i * 0.14, 0.4, 0.4), background: rgba('#FFFFFF', 0.1), border: `2px solid ${rgba('#FFFFFF', 0.25)}`, borderRadius: 40, backdropFilter: 'blur(10px)', padding: '40px 50px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: DISP, fontWeight: 900, fontSize: 150, lineHeight: 0.9, color: theme.accent }}><Counter progress={progress} at={0.28 + i * 0.14} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 34, letterSpacing: '0.04em', color: theme.ink, textAlign: 'right', maxWidth: 300 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Proof({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const words = (s.quote || 'honestly the best app I have downloaded all year').split(' ');
  return (
    <Frame progress={progress} index={index} count={count}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 420 }}>
        <div style={{ ...M.pop(progress, 0.1, 0.4, 0.4), fontSize: 90, letterSpacing: '0.1em', textAlign: 'center', marginBottom: 20 }}>⭐⭐⭐⭐⭐</div>
        <div style={{ textAlign: 'center' }}><Caption progress={progress} at={0.24} words={words} theme={theme} per={0.1} size={72} /></div>
        <div style={{ ...M.rise(progress, 0.72, 0.3, 30), marginTop: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ display: 'flex' }}>{[theme.c1, theme.c2, theme.c3].map((c, i) => <div key={i} style={{ width: 70, height: 70, borderRadius: 999, background: c, border: '4px solid #fff', marginLeft: i ? -22 : 0 }} />)}</div>
          <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 32, color: theme.ink }}>{s.by || 'loved by 12k+ users'}</div>
        </div>
      </div>
    </Frame>
  );
}

function CTA({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const logo = M.pop(progress, 0.14, 0.44, 0.3);
  const head = M.rise(progress, 0.28, 0.32, 60);
  const btn = M.pop(progress, 0.5, 0.4, 0.4);
  return (
    <Frame progress={progress} index={index} count={count} cue>
      <Confetti theme={theme} clock={localTime} progress={progress} at={0.3} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 70px' }}>
        <div style={{ ...logo, width: 220, height: 220, borderRadius: 60, background: '#fff', boxShadow: `0 30px 80px ${rgba('#000', 0.4)}`, overflow: 'hidden', padding: 30, marginBottom: 60 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, fontFamily: DISP, fontWeight: 900, fontSize: 170, lineHeight: 0.9, letterSpacing: '-0.03em', color: theme.ink, textAlign: 'center' }}>{splitLines(s.headline || 'GET IT|NOW')}</div>
        <div style={{ ...btn, marginTop: 60, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '38px 0', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), fontFamily: RND, fontWeight: 800, fontSize: 52, boxShadow: `0 14px 0 ${rgba('#0A0518', 0.3)}` }}>{s.cta || 'DOWNLOAD FREE'} →</div>
          <div style={{ marginTop: 34, textAlign: 'center', fontFamily: RND, fontWeight: 800, fontSize: 34, color: theme.ink }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Hook, Show, Perks, Numbers, Proof, CTA };

function ReelFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#D4FF3F', brand: (t.brandName || 'REEL').toUpperCase(), url: t.url || '@getreel',
    c1: t.c1 || '#4326C9', c2: t.c2 || '#E1246E', c3: '#12C2E9', ink: '#FFFFFF', dark: '#150A2E', card: '#FFFFFF',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.dark} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Vibe" />
        <TweakColor label="Accent" value={t.accent} options={['#D4FF3F', '#FF4D6D', '#3FE7D6', '#FFC24C', '#B388FF']} onChange={v => setTweak('accent', v)} />
        <TweakColor label="Gradient A" value={t.c1} options={['#4326C9', '#0A7B4F', '#B5179E', '#1F3A8A']} onChange={v => setTweak('c1', v)} />
        <TweakColor label="Gradient B" value={t.c2} options={['#E1246E', '#F97316', '#7C3AED', '#0EA5E9']} onChange={v => setTweak('c2', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="Handle / URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.ReelFilm = ReelFilm;
