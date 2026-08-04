/* launch-film.jsx — "LAUNCH" product-launch template in the FETCH playful style.
   Reuses window.FetchKit (from fetch-film.jsx). Mounted after animations-v2 + tweaks-panel + fetch-film. */

const K = window.FetchKit;
const { ThemeContext, useTheme, DISP, BODY, GROUND_Y, E, M, seg, lerp, clamp01, rgba, inkOn, splitLines,
  Scene, Park, Dog, Ball, Dust, MotionLines, PawTrail, Hearts, Sparkle, MediaSlot, Chip, Counter, PawGlyph, FetchFrame } = K;

// Falling confetti (playful launch FX)
function Confetti({ progress, at, clock, theme, n = 22 }) {
  const on = M.draw(progress, at, 0.2);
  if (on <= 0) return null;
  const cols = [theme.accent, theme.sun, '#57B894', '#F25C8A', '#3FA9F5'];
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {new Array(n).fill(0).map((_, i) => {
        const seed = i * 137.5, x = (seed % 1720) + 100;
        const t = ((clock * 0.5 + i * 0.13) % 1);
        const y = -40 + t * 760, rot = clock * 200 + i * 40;
        return <rect key={i} x={x} y={y} width="14" height="20" rx="3" fill={cols[i % cols.length]} opacity={on * (0.5 + 0.5 * Math.sin(t * Math.PI))} transform={`rotate(${rot} ${x + 7} ${y + 10})`} />;
      })}
    </svg>
  );
}

// Playful browser card (rounded, ink border, hard shadow)
function BrowserCard({ theme, url, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 26, overflow: 'hidden', background: theme.paper, border: `3px solid ${theme.ink}`, boxShadow: `0 16px 0 ${rgba(theme.ink, 0.18)}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 52, flexShrink: 0, background: theme.paper, borderBottom: `3px solid ${theme.ink}`, display: 'flex', alignItems: 'center', gap: 9, padding: '0 20px' }}>
        {[theme.accent, theme.sun, '#57B894'].map((c, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 14, background: c, border: `2px solid ${theme.ink}` }} />)}
        <div style={{ marginLeft: 14, flex: 1, maxWidth: 360, height: 26, borderRadius: 13, background: rgba(theme.ink, 0.06), border: `2px solid ${rgba(theme.ink, 0.35)}`, display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: BODY, fontWeight: 800, fontSize: 13, color: rgba(theme.ink, 0.6) }}>{url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function PhoneCard({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 44, padding: 12, background: theme.ink, boxShadow: `0 20px 0 ${rgba(theme.ink, 0.18)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', width: 92, height: 20, borderRadius: 20, background: theme.ink, zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════

function Hook({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const ph = localTime * 8;
  const enter = seg(progress, 0.06, 0.5, E.easeOutCubic);
  const dogX = lerp(-260, 720, enter);
  const running = progress < 0.5;
  const kicker = M.pop(progress, 0.42, 0.4, 0.5);
  const name = M.pop(progress, 0.52, 0.5, 0.55);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'SOON'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Sparkle x={520} y={250} clock={localTime} theme={theme} /><Sparkle x={1460} y={300} clock={localTime} theme={theme} s={0.8} />
        {running && <Dust x={dogX - 60} y={GROUND_Y + 84} phase={ph} theme={theme} />}
        {running && <MotionLines x={dogX - 96} y={GROUND_Y + 8} theme={theme} />}
        <Dog x={dogX} y={GROUND_Y + 78} scale={1.5} phase={running ? ph : localTime * 2} running={running} carrying={true} wag={running ? 1 : 3} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 220, textAlign: 'center' }}>
        <div style={{ ...kicker, display: 'inline-block', background: theme.ink, color: theme.paper, padding: '10px 30px', borderRadius: 999, fontFamily: DISP, fontWeight: 600, fontSize: 30, letterSpacing: '0.04em' }}>{s.eyebrow || 'INTRODUCING'}</div>
        <div style={{ ...name, transformOrigin: 'center', marginTop: 12, fontFamily: DISP, fontWeight: 700, fontSize: 176, lineHeight: 0.9, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{s.brand || theme.brand}</div>
        <div style={{ ...M.rise(progress, 0.6, 0.3, 36), fontFamily: BODY, fontWeight: 800, fontSize: 30, color: theme.accent }}>{s.tagline || 'The launch worth chasing.'}</div>
      </div>
    </FetchFrame>
  );
}

function Reveal({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const rise = seg(progress, 0.12, 0.44, E.easeOutBack);
  const head = M.rise(progress, 0.05, 0.28, 44);
  const dogPresent = M.pop(progress, 0.5, 0.4, 0.5);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'THE REVEAL'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Confetti progress={progress} at={0.4} clock={localTime} theme={theme} />
        <Hearts progress={progress} at={0.55} cx={960} cy={300} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', ...head }}>
        <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 20, letterSpacing: '0.16em', color: theme.accent, textTransform: 'uppercase' }}>{s.eyebrow || 'SAY HELLO'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 0.95, color: theme.ink, marginTop: 6 }}>{splitLines(s.headline || 'Meet the new|good boy.')}</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 300, width: 980, height: 560, transform: `translateX(-50%) translateY(${(1 - rise) * 620}px) scale(${lerp(0.9, 1, rise)})`, transformOrigin: 'center bottom' }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="shot" label="PRODUCT SCREENSHOT" theme={theme} /></BrowserCard>
      </div>
      <div style={{ position: 'absolute', left: 150, bottom: 40, ...dogPresent, transformOrigin: 'left bottom' }}>
        <Scene style={{ width: 320, height: 320, left: 'auto', position: 'relative', inset: 'auto' }}>
          <Dog x={150} y={300} scale={1.5} phase={localTime * 2} running={false} carrying={false} wag={3} theme={theme} />
        </Scene>
      </div>
    </FetchFrame>
  );
}

function Feature({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.1, 0.42, E.easeOutBack);
  const chips = s.chips || ['REAL-TIME SYNC', 'ONE-TAP SETUP', 'WORKS OFFLINE'];
  const headRise = M.rise(progress, 0.14, 0.3, 50);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'FEATURE 01'}>
      <Scene><Park theme={theme} clock={localTime} drift={0} /></Scene>
      <div style={{ position: 'absolute', left: 110, top: 210, width: 640, ...headRise }}>
        <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 20, letterSpacing: '0.14em', color: theme.accent, textTransform: 'uppercase', marginBottom: 12 }}>{s.eyebrow || 'SEE IT WORK'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 88, lineHeight: 0.95, color: theme.ink }}>{splitLines(s.headline || 'Everything|in one place.')}</div>
        <div style={{ marginTop: 22, fontFamily: BODY, fontWeight: 700, fontSize: 22, lineHeight: 1.5, color: rgba(theme.ink, 0.7), maxWidth: 500 }}>{s.body || 'A calm, fast home for your whole team. No mess, no fuss.'}</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 14, flexWrap: 'wrap' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.46 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', right: 100, top: 210, width: 860, height: 540, transform: `translateX(${(1 - inT) * 760}px)` }}>
        <BrowserCard theme={theme} url={s.url || theme.url}><MediaSlot src={s.shot} kind="shot" label="DESKTOP SCREENSHOT" theme={theme} /></BrowserCard>
      </div>
    </FetchFrame>
  );
}

function Mobile({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const inT = seg(progress, 0.1, 0.4, E.easeOutBack);
  const chips = s.chips || ['PUSH ALERTS', 'FACE ID', 'DARK MODE'];
  const headRise = M.rise(progress, 0.16, 0.3, 50);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'FEATURE 02'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Dog x={430} y={GROUND_Y + 78} scale={1.28} phase={localTime * 1.6} running={false} carrying={false} wag={1.8} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', right: 120, top: 190, width: 620, textAlign: 'right', ...headRise }}>
        <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 20, letterSpacing: '0.14em', color: theme.accent, textTransform: 'uppercase', marginBottom: 12 }}>{s.eyebrow || 'ON THE GO'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 92, lineHeight: 0.95, color: theme.ink }}>{splitLines(s.headline || 'In your|pocket.')}</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.44 + i * 0.09} text={c} theme={theme} />)}</div>
      </div>
      <div style={{ position: 'absolute', left: 300, top: 150, width: 356, height: 750, transform: `translateY(${(1 - inT) * 800}px)` }}>
        <PhoneCard theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></PhoneCard>
      </div>
    </FetchFrame>
  );
}

function Proof({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 40, suf: 'K', l: 'ON THE WAITLIST' }, { v: 4.9, suf: '\u2605', l: 'BETA RATING' }, { v: 60, suf: '%', l: 'FASTER SETUP' }];
  const bounce = Math.abs(Math.sin(localTime * 3));
  const headRise = M.rise(progress, 0.1, 0.28, 44);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'THE PROOF'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Ball cx={1580} cy={GROUND_Y - 40 - bounce * 220} r={30} spin={localTime * 260} theme={theme} />
        <ellipse cx="1580" cy={GROUND_Y + 6} rx={44 - bounce * 16} ry="10" fill={rgba(theme.ink, 0.25)} />
      </Scene>
      <div style={{ position: 'absolute', left: 110, top: 200, ...headRise }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 90, color: theme.ink }}>{splitLines(s.headline || 'People are|fetching it.')}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 400, display: 'flex', gap: 36 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.3 + i * 0.12, 0.4, 0.6), background: theme.paper, border: `3px solid ${theme.ink}`, borderRadius: 28, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.14)}`, padding: '30px 40px', minWidth: 300 }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 98, lineHeight: 1, color: theme.accent }}><Counter progress={progress} at={0.34 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 20, letterSpacing: '0.08em', color: theme.ink, marginTop: 6 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </FetchFrame>
  );
}

function Launch({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const dogWag = localTime * 2.4;
  const head = M.pop(progress, 0.12, 0.5, 0.5);
  const pill = M.pop(progress, 0.44, 0.4, 0.5);
  const logoPop = M.pop(progress, 0.22, 0.5, 0.4);
  return (
    <FetchFrame progress={progress} index={index} count={count} label={s.kicker || 'LAUNCH DAY'}>
      <Scene>
        <Park theme={theme} clock={localTime} drift={0} />
        <Confetti progress={progress} at={0.1} clock={localTime} theme={theme} />
        <Dog x={1380} y={GROUND_Y + 78} scale={1.5} phase={dogWag} running={false} carrying={true} wag={3} theme={theme} />
        <Sparkle x={520} y={250} clock={localTime} theme={theme} />
      </Scene>
      <div style={{ position: 'absolute', left: 130, top: 240, width: 1020 }}>
        <div style={{ ...logoPop, width: 150, height: 150, borderRadius: 34, background: theme.paper, border: `3px solid ${theme.ink}`, boxShadow: `0 10px 0 ${rgba(theme.ink, 0.14)}`, overflow: 'hidden', marginBottom: 24, padding: 18 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, transformOrigin: 'left center', fontFamily: DISP, fontWeight: 700, fontSize: 128, lineHeight: 0.92, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.headline || 'Launch day|is here.')}</div>
        <div style={{ ...pill, marginTop: 38, display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 44px', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), border: `3px solid ${theme.ink}`, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.22)}`, fontFamily: DISP, fontWeight: 600, fontSize: 32 }}>
            {s.cta || 'GET IT NOW'} <PawGlyph size={26} color={inkOn(theme.accent)} />
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 24, color: theme.ink }}>{s.url || theme.url}</div>
        </div>
      </div>
    </FetchFrame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Hook, Reveal, Feature, Mobile, Proof, Launch };

function LaunchFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const dogs = { Golden: ['#E6A95C', '#CE9142'], Choco: ['#9A6B45', '#7E5637'], Snow: ['#F3EEE4', '#D9D2C4'], Charcoal: ['#6E6A63', '#57534C'] };
  const dc = dogs[t.dogColor] || dogs.Golden;
  const theme = {
    accent: t.accent || '#F2683C', brand: (t.brandName || 'FETCH').toUpperCase(), url: t.url || 'fetch.dog',
    skyTop: '#EAF7FB', sky: '#C7E7F1', grass: '#8FC15A', grassDk: '#7CAF49',
    ink: '#3A352C', paper: '#FFFDF6', sun: '#FFC24C', dog: dc[0], dogDk: dc[1], nose: '#3A352C',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.skyTop} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#F2683C', '#3FA9F5', '#57B894', '#F25C8A', '#8B5CF6']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Mascot" />
        <TweakRadio label="Coat" value={t.dogColor} options={['Golden', 'Choco', 'Snow', 'Charcoal']} onChange={v => setTweak('dogColor', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.LaunchFilm = LaunchFilm;
