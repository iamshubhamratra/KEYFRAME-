/* fetchvert-film.jsx — "FETCH" vertical 9:16 edition. A dog runs a ball to its master in a
   portrait park; product screenshots ride wooden signboards / phone. Reuses window.FetchKit
   primitives (Dog, Master, Ball, Park vectors). Built 1080×1920.
   Mounted after animations-v2.jsx + tweaks-panel.jsx + fetch-film.jsx. */

const K = window.FetchKit;
const { ThemeContext, useTheme, DISP, BODY, E, M, seg, lerp, clamp01, rgba, inkOn, splitLines,
  Sun, Cloud, Tree, Bush, Fence, GrassTuft, Dog, Master, Ball, Dust, MotionLines, Hearts, Sparkle,
  MediaSlot, PawGlyph, Counter } = K;

const useClock = () => window.useTimeline().time;
const GY = 1500; // ground line

// Portrait sky + ground world (own SVG, 1080×1920)
function World({ theme, clock, children }) {
  const cx = (o) => ((o - clock * 18) % 1500 + 1500) % 1500 - 240;
  return (
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs><linearGradient id="fvSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.skyTop} /><stop offset="1" stopColor={theme.sky} /></linearGradient></defs>
      <rect x="0" y="0" width="1080" height={GY + 40} fill="url(#fvSky)" />
      <Sun theme={theme} clock={clock} x={900} y={240} r={76} />
      <Cloud x={cx(300)} y={360} s={1} o={0.95} /><Cloud x={cx(900)} y={250} s={1.2} o={0.9} /><Cloud x={cx(1300)} y={470} s={0.8} o={0.85} />
      <rect x="0" y={GY} width="1080" height={1920 - GY} fill={theme.grass} />
      <path d={`M0 ${GY} Q 270 ${GY - 26} 540 ${GY} T 1080 ${GY} V1920 H0 Z`} fill={theme.grass} />
      <rect x="0" y={GY + 80} width="1080" height={1920} fill={theme.grassDk} opacity="0.5" />
      <Tree x={90} y={GY + 6} s={1.15} theme={theme} /><Tree x={1000} y={GY + 10} s={1.25} theme={theme} />
      <Bush x={250} y={GY + 20} s={1} /><Bush x={860} y={GY + 26} s={1.15} />
      <Fence x={-30} y={GY + 34} posts={17} gap={70} />
      {new Array(9).fill(0).map((_, i) => <GrassTuft key={i} x={40 + i * 130} y={GY + 150} clock={clock} i={i} />)}
      {children}
    </svg>
  );
}

// ── Vertical chrome (paw brand + stories progress; no scene numbers) ─────────
function Chrome({ theme, clock, total }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', top: 44, left: 44, right: 44, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 60, height: 60, borderRadius: 999, background: theme.accent, display: 'grid', placeItems: 'center', border: `3px solid ${theme.ink}` }}><PawGlyph size={34} color={theme.paper} /></span>
        <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 44, color: theme.ink }}>{theme.brand}</span>
        <span style={{ marginLeft: 'auto', fontFamily: BODY, fontWeight: 800, fontSize: 26, color: theme.ink }}>{theme.url}</span>
      </div>
    </React.Fragment>
  );
}
function SignBoard({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: 26, padding: 18, background: `linear-gradient(${theme.wood}, ${theme.woodDk})`, border: `6px solid ${theme.woodDk}`, boxShadow: `0 30px 60px ${rgba('#08160E', 0.5)}` }}>
      <div style={{ position: 'absolute', top: 10, left: 22, right: 22, height: 6, borderRadius: 6, background: rgba('#FFFFFF', 0.14) }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function PhoneTall({ theme, children }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 60, padding: 16, background: '#0a0908', border: `3px solid ${rgba(theme.ink, 0.5)}`, boxShadow: `0 40px 90px ${rgba('#08160E', 0.5)}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', width: 130, height: 30, borderRadius: 30, background: '#0a0908', zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 46, overflow: 'hidden', background: theme.paper }}>{children}</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.32, 0.5), display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 28px', borderRadius: 999, background: theme.paper, boxShadow: `0 8px 0 ${rgba(theme.ink, 0.16)}`, border: `3px solid ${theme.ink}`, fontFamily: BODY, fontWeight: 800, fontSize: 30, color: theme.ink, whiteSpace: 'nowrap' }}><span style={{ width: 12, height: 12, borderRadius: 12, background: theme.accent }} />{text}</span>;
}

const TRANS = ['zoom', 'right', 'drop', 'left', 'scaleout', 'rise'];
function cam(kind, progress) {
  const IN = 0.12, OUT = 0.9;
  let x = 0, y = 0, s = 1 + 0.02 * E.easeInOutSine(progress), op = 1;
  if (progress < IN) {
    const t = seg(progress, 0, IN, E.easeOutCubic); op = seg(progress, 0, IN * 0.6, E.easeOutQuad);
    if (kind === 'zoom') s *= lerp(1.16, 1, t);
    else if (kind === 'right') x = (1 - t) * 900;
    else if (kind === 'left') x = -(1 - t) * 900;
    else if (kind === 'drop') y = -(1 - t) * 280;
    else if (kind === 'scaleout') s *= lerp(0.85, 1, t);
    else y = (1 - t) * 240;
  }
  if (progress > OUT) {
    const t = seg(progress, OUT, 1, E.easeInCubic); op = 1 - seg(progress, OUT + 0.04, 1, E.easeInQuad);
    if (kind === 'zoom') s *= lerp(1, 1.12, t);
    else if (kind === 'right') x = -t * 900;
    else if (kind === 'left') x = t * 900;
    else if (kind === 'drop') y = t * 280;
    else if (kind === 'scaleout') s *= lerp(1, 0.9, t);
    else y = -t * 240;
  }
  return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: op };
}
function Frame({ progress, children }) {
  const theme = useTheme();
  const clock = useClock();
  const sc = window.useScene ? window.useScene() : null;
  const total = sc && sc.total ? sc.total : 28;
  const index = sc && sc.index != null ? sc.index : 0;
  const kind = TRANS[index % TRANS.length];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.skyTop, fontFamily: DISP }}>
      <div style={{ position: 'absolute', inset: 0, ...cam(kind, progress), willChange: 'transform, opacity' }}>{children}</div>
      <Chrome theme={theme} clock={clock} total={total} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Title({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const ph = localTime * 8;
  const enter = seg(progress, 0.06, 0.55, E.easeOutCubic);
  const dogX = lerp(-240, 560, enter);
  const running = progress < 0.55;
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}>
        <Sparkle x={260} y={640} clock={localTime} theme={theme} /><Sparkle x={860} y={720} clock={localTime} theme={theme} s={0.8} />
        {running && <Dust x={dogX - 66} y={GY + 84} phase={ph} theme={theme} />}
        {running && <MotionLines x={dogX - 96} y={GY + 10} theme={theme} />}
        <Dog x={dogX} y={GY + 62} scale={1.7} phase={running ? ph : localTime * 2} running={running} carrying={true} wag={running ? 1 : 3} theme={theme} />
        <Master x={900} y={GY + 54} scale={1.25} wave={localTime * 4} theme={theme} />
      </World>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 180, textAlign: 'center' }}>
        <div style={{ ...M.pop(progress, 0.24, 0.5, 0.5), transformOrigin: 'center', fontFamily: DISP, fontWeight: 700, fontSize: 176, lineHeight: 0.86, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.brand || theme.brand)}</div>
        <div style={{ ...M.rise(progress, 0.4, 0.3, 36), marginTop: 18, display: 'inline-block', fontFamily: BODY, fontWeight: 800, fontSize: 38, color: theme.ink, background: theme.accent, padding: '12px 34px', borderRadius: 999, border: `3px solid ${theme.ink}` }}>{s.tagline || 'Every good boy delivers.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 130, right: 130, top: 620, height: 470, ...M.pop(progress, 0.5, 0.5, 0.6) }}>
        <SignBoard theme={theme}><MediaSlot src={s.shot} kind="desktop" label="SCREENSHOT" theme={theme} /></SignBoard>
      </div>
    </Frame>
  );
}

function Run({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const ph = localTime * 9;
  const run = seg(progress, 0.08, 0.92, E.easeInOutSine);
  const dogX = lerp(120, 720, run);
  const armLift = seg(progress, 0.6, 0.95, E.easeOutCubic) * 14;
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}>
        <Master x={930} y={GY + 54} scale={1.3} wave={localTime * 5} armLift={armLift} theme={theme} />
        <Dust x={dogX - 70} y={GY + 84} phase={ph} theme={theme} />
        <MotionLines x={dogX - 110} y={GY + 10} theme={theme} n={5} />
        <Dog x={dogX} y={GY + 62} scale={1.75} phase={ph} running={true} carrying={true} theme={theme} />
      </World>
      <div style={{ position: 'absolute', left: 90, width: 620, top: 190, height: 320, ...M.pop(progress, 0.12, 0.5, 0.6) }}>
        <SignBoard theme={theme}><MediaSlot src={s.shot} kind="desktop" label="SCREENSHOT" theme={theme} /></SignBoard>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', ...M.rise(progress, 0.1, 0.28, 44) }}>
        <div style={{ display: 'inline-block', background: theme.ink, color: theme.paper, padding: '14px 40px', borderRadius: 999, fontFamily: DISP, fontWeight: 600, fontSize: 44, letterSpacing: '0.02em' }}>{s.eyebrow || 'INCOMING!'}</div>
        <div style={{ marginTop: 20, fontFamily: DISP, fontWeight: 700, fontSize: 190, lineHeight: 0.9, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.headline || 'RUN, BOY,|RUN!')}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 26), marginTop: 16, marginLeft: 'auto', marginRight: 'auto', maxWidth: 840, fontFamily: BODY, fontWeight: 700, fontSize: 34, lineHeight: 1.4, color: rgba(theme.ink, 0.82) }}>{s.body || 'Here he comes — ball locked in, tail going, straight down the line to you.'}</div>
      </div>
    </Frame>
  );
}

function Fetch({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const arrive = seg(progress, 0, 0.32, E.easeOutBack);
  const dogX = lerp(360, 480, arrive);
  const carrying = progress < 0.4;
  const ballDrop = seg(progress, 0.38, 0.66, E.easeInQuad);
  const ballX = lerp(560, 800, seg(progress, 0.38, 0.72, E.easeOutCubic));
  const ballY = GY - 40 - Math.sin(ballDrop * Math.PI) * 220;
  const armLift = seg(progress, 0.4, 0.7, E.easeOutBack) * 28;
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}>
        <Hearts progress={progress} at={0.6} cx={820} cy={GY - 300} theme={theme} />
        <Sparkle x={360} y={680} clock={localTime} theme={theme} />
        <Dog x={dogX} y={GY + 62} scale={1.7} phase={localTime * 2} running={false} carrying={carrying} wag={2.6} theme={theme} />
        {!carrying && <Ball cx={ballX} cy={ballY} r={22} spin={ballDrop * 420} theme={theme} />}
        <Master x={860} y={GY + 54} scale={1.35} armLift={armLift} wave={progress > 0.7 ? localTime * 6 : 0} theme={theme} />
      </World>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', ...M.pop(progress, 0.55, 0.5, 0.5) }}>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 210, lineHeight: 0.88, color: theme.ink, textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{s.headline || 'GOOD BOY!'}</div>
        <div style={{ marginTop: 10, fontFamily: BODY, fontWeight: 800, fontSize: 38, color: theme.accent }}>{s.sub || 'Delivered — tail wags included.'}</div>
      </div>
    </Frame>
  );
}

function Feature({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const phoneIn = seg(progress, 0.1, 0.44, E.easeOutBack);
  const chips = s.chips || ['LIVE TRACKING', 'TREAT REWARDS', 'PAW-FECT MATCH'];
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}>
        <Dog x={230} y={GY + 62} scale={1.35} phase={localTime * 1.6} running={false} carrying={false} wag={1.8} theme={theme} />
      </World>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 180, textAlign: 'center', ...M.rise(progress, 0.08, 0.28, 40) }}>
        <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 34, letterSpacing: '0.14em', color: theme.accent, textTransform: 'uppercase', marginBottom: 12 }}>{s.eyebrow || 'IN YOUR POCKET'}</div>
        <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 130, lineHeight: 0.94, color: theme.ink }}>{splitLines(s.headline || 'Track every|fetch.')}</div>
        <div style={{ marginTop: 16, marginLeft: 'auto', marginRight: 'auto', maxWidth: 780, fontFamily: BODY, fontWeight: 700, fontSize: 30, lineHeight: 1.4, color: rgba(theme.ink, 0.82) }}>{s.body || 'Live GPS routes, treat streaks and a leaderboard for the goodest boys.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 300, top: 720, width: 480, height: 820, transform: `translateY(${(1 - phoneIn) * 1100}px)` }}>
        <PhoneTall theme={theme}><MediaSlot src={s.shot} kind="phone" theme={theme} /></PhoneTall>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 620, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.46 + i * 0.09} text={c} theme={theme} />)}</div>
    </Frame>
  );
}

function Stats({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 2, suf: 'M', l: 'BALLS FETCHED' }, { v: 98, suf: '%', l: 'HAPPY PUPS' }, { v: 4.9, suf: '★', l: 'APP RATING' }];
  const bounce = Math.abs(Math.sin(localTime * 3));
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}>
        <Ball cx={860} cy={GY - 40 - bounce * 240} r={34} spin={localTime * 260} theme={theme} />
        <ellipse cx="860" cy={GY + 6} rx={48 - bounce * 18} ry="12" fill={rgba(theme.ink, 0.25)} />
        <Dog x={240} y={GY + 62} scale={1.2} phase={localTime * 1.4} running={false} carrying={false} wag={2} theme={theme} />
      </World>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 220, textAlign: 'center', ...M.rise(progress, 0.06, 0.28, 40), fontFamily: DISP, fontWeight: 700, fontSize: 140, lineHeight: 0.92, color: theme.ink }}>{splitLines(s.headline || 'Tails don’t lie.')}</div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 400, textAlign: 'center', ...M.rise(progress, 0.16, 0.28, 26), fontFamily: BODY, fontWeight: 700, fontSize: 32, lineHeight: 1.4, color: rgba(theme.ink, 0.82) }}>{s.sub || 'Two million balls fetched and counting — the whole pack agrees.'}</div>
      <div style={{ position: 'absolute', left: 70, right: 70, top: 520, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.3 + i * 0.12, 0.4, 0.5), background: theme.paper, border: `4px solid ${theme.ink}`, borderRadius: 34, boxShadow: `0 12px 0 ${rgba(theme.ink, 0.16)}`, padding: '30px 46px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 150, lineHeight: 0.9, color: theme.accent }}><Counter progress={progress} at={0.34 + i * 0.12} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 34, letterSpacing: '0.04em', color: theme.ink, textAlign: 'right', maxWidth: 340 }}>{st.l}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function CTA({ progress, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const head = M.pop(progress, 0.14, 0.5, 0.5);
  const pill = M.pop(progress, 0.5, 0.4, 0.5);
  const logo = M.pop(progress, 0.22, 0.5, 0.4);
  return (
    <Frame progress={progress}>
      <World theme={theme} clock={localTime}>
        <Sparkle x={220} y={640} clock={localTime} theme={theme} /><Sparkle x={880} y={720} clock={localTime} theme={theme} s={0.8} />
        <Dog x={540} y={GY + 62} scale={1.75} phase={localTime * 2.4} running={false} carrying={true} wag={3} theme={theme} />
      </World>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 70px' }}>
        <div style={{ ...logo, width: 200, height: 200, borderRadius: 44, background: theme.paper, border: `4px solid ${theme.ink}`, boxShadow: `0 12px 0 ${rgba(theme.ink, 0.16)}`, overflow: 'hidden', padding: 24, marginBottom: 36 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ ...head, transformOrigin: 'center', fontFamily: DISP, fontWeight: 700, fontSize: 190, lineHeight: 0.9, color: theme.ink, textAlign: 'center', textShadow: `0 8px 0 ${rgba(theme.ink, 0.12)}` }}>{splitLines(s.headline || 'Bring joy|home.')}</div>
        <div style={{ ...M.rise(progress, 0.34, 0.3, 26), marginTop: 24, maxWidth: 820, textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 34, lineHeight: 1.45, color: rgba(theme.ink, 0.82) }}>{s.body || 'Join thousands of happy humans and their very good boys. Your first fetch is free.'}</div>
        <div style={{ ...pill, marginTop: 50, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '34px 0', borderRadius: 999, background: theme.accent, color: inkOn(theme.accent), border: `4px solid ${theme.ink}`, boxShadow: `0 12px 0 ${rgba(theme.ink, 0.28)}`, fontFamily: DISP, fontWeight: 600, fontSize: 56 }}>{s.cta || 'GET FETCH'} <PawGlyph size={44} color={inkOn(theme.accent)} /></div>
          <div style={{ marginTop: 26, textAlign: 'center', fontFamily: BODY, fontWeight: 800, fontSize: 38, color: theme.ink }}>{s.url || theme.url}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Title, Run, Fetch, Feature, Stats, CTA };

function FetchVertFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const dogs = { Golden: ['#E6A95C', '#CE9142'], Choco: ['#9A6B45', '#7E5637'], Snow: ['#F3EEE4', '#D9D2C4'], Charcoal: ['#6E6A63', '#57534C'] };
  const dc = dogs[t.dogColor] || dogs.Golden;
  const theme = {
    accent: t.accent || '#F2683C', brand: (t.brandName || 'FETCH').toUpperCase(), url: t.url || 'fetch.dog',
    skyTop: '#EAF7FB', sky: '#C7E7F1', grass: '#8FC15A', grassDk: '#7CAF49',
    ink: '#3A352C', paper: '#FFFDF6', sun: '#FFC24C', dog: dc[0], dogDk: dc[1], nose: '#3A352C',
    wood: '#8A5A2B', woodDk: '#6E4620', leaf: '#3E8E4F',
  };
  const { TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;
  return (
    <React.Fragment>
      <ThemeContext.Provider value={theme}>
        <window.SceneStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={theme.skyTop} transition="cut">
          {MAP}
        </window.SceneStage>
      </ThemeContext.Provider>
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={['#F2683C', '#3FA9F5', '#57B894', '#F25C8A', '#8B5CF6']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="URL" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="The dog" />
        <TweakRadio label="Coat" value={t.dogColor} options={['Golden', 'Choco', 'Snow', 'Charcoal']} onChange={v => setTweak('dogColor', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.FetchVertFilm = FetchVertFilm;
