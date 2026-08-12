/* hacker-film.jsx — "TERMINAL" hacker-vibe template: matrix rain, self-typing code,
   glitch titles, terminal windows, scanlines. Mounted after animations-v2.jsx + tweaks-panel.jsx.
   Reads window.OM_SCENES / OM_PLAYBACK / OM_TWEAKS. */

// ── Theme ────────────────────────────────────────────────────────────────
const ThemeContext = React.createContext({
  accent: '#37FF7A', brand: 'TERMINAL', url: 'root@node',
  bg: '#05080B', panel: '#0B1016', ink: '#D7F5E1', dim: '#4C6B58', cyan: '#35E0FF', amber: '#FFC24C', mag: '#FF4D9D',
});
const useTheme = () => React.useContext(ThemeContext);
const MONO = "'JetBrains Mono', ui-monospace, monospace";

// ── Helpers ──────────────────────────────────────────────────────────────
const E = window.Easing;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b, ease) => { const t = clamp01(b - a === 0 ? 0 : (p - a) / (b - a)); return ease ? ease(t) : t; };
const M = {
  rise: (p, a = 0, d = 0.22, dist = 40) => { const t = seg(p, a, a + d, E.easeOutCubic); return { opacity: seg(p, a, a + Math.min(d, 0.14), E.easeOutQuad), transform: `translateY(${(1 - t) * dist}px)` }; },
  pop: (p, a = 0, d = 0.32, from = 0.6) => { const s = seg(p, a, a + d, E.easeOutBack); return { opacity: seg(p, a, a + 0.1, E.easeOutQuad), transform: `scale(${lerp(from, 1, s)})` }; },
  draw: (p, a = 0, d = 0.5, ease = E.easeInOutCubic) => seg(p, a, a + d, ease),
};
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
const splitLines = (t) => String(t).split('|').map((ln, i) => React.createElement('span', { key: i, style: { display: 'block' } }, ln));

// Camera: glitch jitter + fade at boundaries
function hcam(progress) {
  const IN = 0.12, OUT = 0.88;
  let op = 1, tx = 0;
  if (progress < IN) { const t = seg(progress, 0, IN, E.easeOutCubic); op = t; tx = (1 - t) * ((Math.floor(progress * 60) % 2) ? 18 : -18); }
  if (progress > OUT) { const t = seg(progress, OUT, 1, E.easeInCubic); op = 1 - t; tx = t * ((Math.floor(progress * 60) % 2) ? 18 : -18); }
  return { transform: `translateX(${tx.toFixed(1)}px)`, opacity: op, transformOrigin: 'center center', willChange: 'transform, opacity' };
}

// ═══════════════════════════ FX ═════════════════════════════════════════════
const GLYPHS = 'ｱｦｧｨｩ01<>{}[]/*+=$#%&アカサ01'.split('');
function Matrix({ theme, clock, cols = 40 }) {
  const colW = 1920 / cols, rows = 20, step = 1080 / rows;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {new Array(cols).fill(0).map((_, c) => {
        const sp = 1.1 + (c % 7) * 0.35, drop = (clock * sp * step + c * 131) % (1080 + step * rows);
        return new Array(rows).fill(0).map((__, r) => {
          const y = (drop - r * step) % (1080 + step); if (y < -step || y > 1080) return null;
          const ch = GLYPHS[(r * 3 + c + Math.floor(clock * 7 + c)) % GLYPHS.length];
          const head = r === 0;
          return <text key={c + '-' + r} x={c * colW + 6} y={y} fontFamily={MONO} fontSize="20" fill={head ? '#EAFFF2' : theme.accent} opacity={head ? 1 : Math.max(0, 0.42 - r * 0.02)} style={head ? { filter: `drop-shadow(0 0 7px ${theme.accent})` } : undefined}>{ch}</text>;
        });
      })}
    </svg>
  );
}
function Scanlines({ theme }) {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `repeating-linear-gradient(0deg, ${rgba('#000000', 0.28)} 0 1px, transparent 1px 3px)`, mixBlendMode: 'multiply' }} />;
}
// Full CRT stack: fine scanlines, screen-refresh roll band, curvature vignette,
// chromatic edge fringing and a subtle flicker.
function CRT({ clock }) {
  const roll = ((clock * 240) % 1240) - 80;
  const flick = 0.95 + 0.05 * Math.sin(clock * 26) + 0.02 * Math.sin(clock * 61);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.34) 0 1px, transparent 1px 3px)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: roll, height: 150, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.05), transparent)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 50%, transparent 52%, rgba(0,0,0,0.5) 86%, rgba(0,0,0,0.9) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 5px 0 18px rgba(53,224,255,0.16), inset -5px 0 18px rgba(255,77,157,0.16)' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: Math.max(0, 1 - flick) }} />
    </div>
  );
}
function Cursor({ clock, color }) {
  const on = Math.floor(clock * 2.4) % 2 === 0;
  return <span style={{ display: 'inline-block', width: '0.62em', height: '1.05em', verticalAlign: '-0.15em', background: on ? color : 'transparent', marginLeft: 2 }} />;
}
function Glitch({ text, clock, size, weight = 800, ink, intensity = 1 }) {
  const j = ((Math.floor(clock * 22) % 3) - 1) * 4 * intensity;
  const base = { fontFamily: MONO, fontSize: size, fontWeight: weight, letterSpacing: '0.02em', lineHeight: 1, whiteSpace: 'pre' };
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ ...base, position: 'absolute', left: j, top: -j * 0.4, color: '#FF4D9D', opacity: 0.75, mixBlendMode: 'screen' }}>{text}</span>
      <span style={{ ...base, position: 'absolute', left: -j, top: j * 0.4, color: '#35E0FF', opacity: 0.75, mixBlendMode: 'screen' }}>{text}</span>
      <span style={{ ...base, position: 'relative', color: ink }}>{text}</span>
    </div>
  );
}
// Types code/text line-by-line, cumulative, syntax-colored, with a live cursor
function CodeBlock({ lines, clock, start = 0, cps = 46, theme, size = 24, colors, lineNums }) {
  const cmap = colors || { cm: theme.dim, kw: theme.accent, fn: theme.cyan, str: theme.amber, num: theme.mag, op: theme.dim, def: theme.ink, ok: theme.accent };
  let budget = Math.max(0, Math.floor((clock - start) * cps));
  return (
    <div style={{ fontFamily: MONO, fontSize: size, lineHeight: 1.6, textShadow: `0 0 7px ${rgba(theme.accent, 0.35)}` }}>
      {lines.map((line, li) => {
        const spans = []; let cursorHere = false; const started = budget > 0 || li === 0;
        for (let k = 0; k < line.length; k++) {
          const [txt, key] = line[k];
          if (budget <= 0) { spans.push(<span key={k}></span>); continue; }
          const take = Math.min(txt.length, budget);
          spans.push(<span key={k} style={{ color: cmap[key] || cmap.def }}>{txt.slice(0, take)}</span>);
          if (take < txt.length) cursorHere = true;
          budget -= take;
        }
        const lineLen = line.reduce((s, t) => s + t[0].length, 0);
        return (
          <div key={li} style={{ minHeight: size * 1.6, opacity: started ? 1 : 0.25, display: 'flex' }}>
            {lineNums && <span style={{ width: size * 1.6, flexShrink: 0, color: rgba(theme.accent, 0.3), textAlign: 'right', paddingRight: 14, userSelect: 'none' }}>{String(li + 1).padStart(2, '0')}</span>}
            <span>{spans}{cursorHere && <Cursor clock={clock} color={theme.accent} />}{lineLen === 0 && <span> </span>}</span>
          </div>
        );
      })}
    </div>
  );
}
// A terminal window shell
function Term({ theme, title, children, style }) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', background: theme.panel, border: `1px solid ${rgba(theme.accent, 0.35)}`, boxShadow: `0 30px 80px ${rgba('#000000', 0.6)}, 0 0 60px ${rgba(theme.accent, 0.12)}`, display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ height: 40, flexShrink: 0, background: '#070B0F', borderBottom: `1px solid ${rgba(theme.accent, 0.25)}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 12, background: c }} />)}
        <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 13, color: rgba(theme.ink, 0.5) }}>{title || 'bash — 80×24'}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '22px 26px', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
function MediaSlot({ src, kind = 'shot', label, theme }) {
  const lbl = label || { desktop: 'DESKTOP SCREENSHOT', phone: 'PHONE SCREEN', product: 'PRODUCT PHOTO', logo: 'LOGO', shot: 'SCREENSHOT' }[kind];
  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: kind === 'logo' ? 'contain' : 'cover', display: 'block' }} />;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: `repeating-linear-gradient(135deg, ${rgba(theme.accent, 0.07)} 0 14px, ${rgba(theme.accent, 0.02)} 14px 28px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, border: `2px dashed ${rgba(theme.accent, 0.85)}`, display: 'grid', placeItems: 'center', color: theme.accent, fontSize: 26 }}>+</div>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em', color: rgba(theme.ink, 0.6), textTransform: 'uppercase' }}>{lbl}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: rgba(theme.ink, 0.3) }}>DROP IMAGE TO REPLACE</div>
    </div>
  );
}
function Chip({ progress, at, text, theme }) {
  return <span style={{ ...M.pop(progress, at, 0.3, 0.6), display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, background: rgba(theme.accent, 0.08), border: `1px solid ${rgba(theme.accent, 0.45)}`, fontFamily: MONO, fontSize: 15, color: theme.accent, whiteSpace: 'nowrap' }}>--{text}</span>;
}
function Counter({ progress, at, dur, value, suffix = '', color }) { const t = M.draw(progress, at, dur, E.easeOutExpo); const v = value * t; return <span style={{ color }}>{String(value).includes('.') ? v.toFixed(1) : Math.round(v)}{suffix}</span>; }
function Bar({ progress, at, label, frac, theme }) {
  const t = M.draw(progress, at, 0.6);
  const cells = 28, filled = Math.round(cells * frac * t);
  return <div style={{ fontFamily: MONO, fontSize: 18, color: theme.ink, display: 'flex', gap: 14, alignItems: 'center' }}><span style={{ width: 130, color: theme.dim }}>{label}</span><span style={{ color: theme.accent }}>[{'█'.repeat(filled)}{'░'.repeat(cells - filled)}]</span><span style={{ color: theme.accent }}>{Math.round(frac * t * 100)}%</span></div>;
}

// ── Dense animated HUD (fills the margins) ───────────────────────────────────
function Hud({ theme, clock, total, count, index, label }) {
  const frac = total > 0 ? clamp01(clock / total) : 0;
  const on = Math.floor(clock * 2) % 2 === 0;
  const braille = '\u280b\u2819\u2839\u2838\u283c\u2834\u2826\u2827\u2807\u280f'[Math.floor(clock * 12) % 10];
  const tc = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(Math.floor(clock % 60)).padStart(2, '0')}:${String(Math.floor((clock * 100) % 100)).padStart(2, '0')}`;
  const glow = { textShadow: `0 0 9px ${rgba(theme.accent, 0.6)}` };
  const corner = (pos) => <div style={{ position: 'absolute', width: 26, height: 26, ...pos }}><div style={{ position: 'absolute', [pos.left != null ? 'left' : 'right']: 0, [pos.top != null ? 'top' : 'bottom']: 0, width: 26, height: 2, background: theme.accent }} /><div style={{ position: 'absolute', [pos.left != null ? 'left' : 'right']: 0, [pos.top != null ? 'top' : 'bottom']: 0, width: 2, height: 26, background: theme.accent }} /></div>;
  const ticker = '  [sys] link up  ::  [net] 12ms  ::  [gpu] 61C  ::  [io] 4.2MB/s  ::  [ok] tests 214/214  ::  [deploy] queued  ::  [mem] 48%  ::  [auth] root  ';
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', inset: 24, border: `1px solid ${rgba(theme.accent, 0.22)}`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 18, pointerEvents: 'none' }}>{corner({ top: 0, left: 0 })}{corner({ top: 0, right: 0 })}{corner({ bottom: 0, left: 0 })}{corner({ bottom: 0, right: 0 })}</div>
      <div style={{ position: 'absolute', top: 44, left: 58, fontFamily: MONO, fontSize: 20, color: theme.accent, fontWeight: 700, ...glow }}>{theme.url}:~$ <span style={{ color: rgba(theme.ink, 0.6) }}>{label || 'run'}</span><Cursor clock={clock} color={theme.accent} /></div>
      <div style={{ position: 'absolute', top: 48, right: 58, display: 'flex', alignItems: 'center', gap: 16, fontFamily: MONO, fontSize: 13, letterSpacing: '0.12em', color: rgba(theme.ink, 0.6) }}>
        <span style={{ color: theme.accent, ...glow }}>{braille} sync</span><span style={{ color: theme.mag }}>● REC</span><span>{tc}</span><span><span style={{ color: theme.accent, opacity: on ? 1 : 0.3 }}>▉</span> LIVE</span>
      </div>
      <div style={{ position: 'absolute', left: 34, top: 130, bottom: 130, width: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: rgba(theme.accent, 0.32) }}>{new Array(13).fill(0).map((_, i) => <span key={i}>{(i * 16).toString(16).padStart(2, '0').toUpperCase()}</span>)}</div>
      <div style={{ position: 'absolute', right: 34, bottom: 130, width: 30, height: 200, display: 'flex', alignItems: 'flex-end', gap: 3 }}>{new Array(9).fill(0).map((_, i) => { const h = 10 + (Math.sin(clock * 3.2 + i * 0.7) * 0.5 + 0.5) * 150; return <div key={i} style={{ width: 12, height: h, background: rgba(theme.accent, 0.35 + 0.4 * (i / 9)), boxShadow: `0 0 6px ${rgba(theme.accent, 0.4)}` }} />; })}</div>
      <div style={{ position: 'absolute', bottom: 66, left: 58, right: 58, overflow: 'hidden', height: 20 }}><div style={{ whiteSpace: 'nowrap', transform: `translateX(${-((clock * 90) % 1500)}px)`, fontFamily: MONO, fontSize: 14, color: rgba(theme.accent, 0.5) }}>{ticker}{ticker}{ticker}</div></div>
    </React.Fragment>
  );
}
function Frame({ progress, index, count, label, children, matrix = true }) {
  const theme = useTheme();
  const clock = window.useTimeline().time;
  const sc = window.useScene ? window.useScene() : null; const total = sc && sc.total ? sc.total : 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg, fontFamily: MONO }}>
      <div style={{ position: 'absolute', inset: 0, ...hcam(progress) }}>
        {matrix && <div style={{ position: 'absolute', inset: 0, opacity: 0.72 }}><Matrix theme={theme} clock={clock} /></div>}
        {children}
      </div>
      <Hud theme={theme} clock={clock} total={total} count={count} index={index} label={label} />
      <CRT clock={clock} />
    </div>
  );
}

// ═══════════════════════════ SCENES ═════════════════════════════════════════
function Boot({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const boot = (s.boot || ['$ ./boot --brand', 'loading kernel......... ok', 'mount /dev/pipe........ ok', 'auth root@node........ ok', '> system ready_']).map(l => [[l, l.includes('ok') || l.includes('ready') ? 'ok' : 'def']]);
  const titleAt = 0.5;
  return (
    <Frame progress={progress} index={index} count={count} label="boot">
      <div style={{ position: 'absolute', left: 120, top: 200, width: 900, opacity: seg(progress, 0.32, 0.55, E.easeInQuad) < 1 ? 1 : (progress > 0.5 ? 0.35 : 1) }}>
        <CodeBlock lines={boot} clock={localTime} start={0.15} cps={22} theme={theme} size={26} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center', ...M.pop(progress, titleAt, 0.4, 0.8) }}>
        <div style={{ display: 'inline-block' }}><Glitch text={s.brand || theme.brand} clock={localTime} size={190} weight={800} ink={theme.ink} intensity={progress < 0.65 ? 1.6 : 0.5} /></div>
        <div style={{ ...M.rise(progress, 0.62, 0.3, 30), marginTop: 18, fontFamily: MONO, fontSize: 24, letterSpacing: '0.24em', color: theme.accent }}>{s.tagline || '// ship at the speed of thought'}</div>
      </div>
    </Frame>
  );
}

function Access({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const cmds = (s.cmds || ['$ ssh deploy@prod', 'authenticating.......', 'fingerprint OK', '$ grant --scope=all']).map(l => [[l, l.includes('OK') ? 'ok' : 'def']]);
  const granted = M.pop(progress, 0.62, 0.4, 0.7);
  return (
    <Frame progress={progress} index={index} count={count} label="access">
      <div style={{ position: 'absolute', left: '50%', top: 210, width: 1120, transform: 'translateX(-50%)', ...M.rise(progress, 0.08, 0.24, 30) }}>
        <Term theme={theme} title="ssh — prod.node">
          <CodeBlock lines={cmds} clock={localTime} start={0.14} cps={24} theme={theme} size={26} />
        </Term>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 620, textAlign: 'center', ...granted }}>
        <div style={{ display: 'inline-block', padding: '18px 44px', border: `3px solid ${theme.accent}`, color: theme.accent, fontFamily: MONO, fontWeight: 800, fontSize: 72, letterSpacing: '0.06em', boxShadow: `0 0 50px ${rgba(theme.accent, 0.4)}`, transform: `rotate(-3deg)` }}>{s.stamp || 'ACCESS GRANTED'}</div>
      </div>
    </Frame>
  );
}

function Compile({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const CODE = [
    [['// deploy.ts', 'cm']],
    [['import ', 'kw'], ['{ ship } ', 'def'], ['from ', 'kw'], ['"@core/pipe"', 'str']],
    [['', 'def']],
    [['export ', 'kw'], ['async ', 'kw'], ['function ', 'kw'], ['deploy', 'fn'], ['(env) {', 'def']],
    [['  const ', 'kw'], ['res', 'def'], [' = ', 'op'], ['await ', 'kw'], ['ship', 'fn'], ['(env, ', 'def'], ['{ fast: ', 'def'], ['true', 'num'], [' })', 'def']],
    [['  return ', 'kw'], ['res', 'def'], ['.status', 'def']],
    [['}', 'def']],
  ];
  const mon = seg(progress, 0.12, 0.46, E.easeOutCubic);
  const chips = s.chips || ['--fast', '--zero-downtime', '--on-merge'];
  return (
    <Frame progress={progress} index={index} count={count} label="compile" matrix={false}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.16 }}><Matrix theme={theme} clock={localTime} cols={30} /></div>
      <div style={{ position: 'absolute', left: 96, top: 150, width: 780, height: 620, ...M.rise(progress, 0.08, 0.24, 30) }}>
        <Term theme={theme} title="deploy.ts — vim" style={{ height: '100%' }}>
          <CodeBlock lines={CODE} clock={localTime} start={0.16} cps={40} theme={theme} size={24} lineNums />
          <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 20, color: theme.accent, opacity: seg(progress, 0.6, 0.72), textShadow: `0 0 9px ${rgba(theme.accent, 0.6)}` }}>{'\u280b\u2819\u2839\u2838\u283c\u2834\u2826\u2827\u2807\u280f'[Math.floor(localTime * 12) % 10]} building bundle... <span style={{ color: theme.dim }}>[{'\u2588'.repeat(Math.floor(seg(progress, 0.55, 0.95) * 14))}{'\u2591'.repeat(14 - Math.floor(seg(progress, 0.55, 0.95) * 14))}]</span></div>
        </Term>
      </div>
      <div style={{ position: 'absolute', right: 90, top: 190, width: 850, height: 500, transform: `translateX(${(1 - mon) * 760}px)` }}>
        <Term theme={theme} title={s.url || 'preview — localhost:3000'} style={{ height: '100%' }}>
          <div style={{ width: '100%', height: '100%', margin: -1 }}><MediaSlot src={s.shot} kind="desktop" theme={theme} /></div>
        </Term>
      </div>
      <div style={{ position: 'absolute', right: 90, top: 720, display: 'flex', gap: 12 }}>{chips.map((c, i) => <Chip key={i} progress={progress} at={0.5 + i * 0.09} text={c} theme={theme} />)}</div>
    </Frame>
  );
}

function Deploy({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const logs = [['[12:00:01] build started', 'def'], ['[12:00:03] bundling.... ok', 'ok'], ['[12:00:04] tests 214/214', 'ok'], ['[12:00:06] pushing image', 'def'], ['[12:00:08] deploy OK', 'ok']].map(l => [l]);
  const tiles = [{ x: 96, y: 280, w: 540, h: 300, shot: true }, { x: 1284, y: 280, w: 540, h: 300, shot: true }];
  return (
    <Frame progress={progress} index={index} count={count} label="deploy">
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', ...M.rise(progress, 0.06, 0.22, 26) }}>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 66, color: theme.ink }}>{s.headline || 'ship it everywhere'}</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 300, width: 600, transform: 'translateX(-50%)', ...M.rise(progress, 0.14, 0.24, 30) }}>
        <Term theme={theme} title="logs — deploy" style={{ height: 300 }}>
          <CodeBlock lines={logs} clock={localTime} start={0.2} cps={26} theme={theme} size={18} />
        </Term>
      </div>
      {tiles.map((t, i) => { const at = 0.28 + i * 0.14, e = seg(progress, at, at + 0.34, E.easeOutCubic); return (
        <div key={i} style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
          <Term theme={theme} title={`node-${i + 1} — preview`} style={{ height: '100%' }}><div style={{ width: '100%', height: '100%' }}><MediaSlot src={s['shot' + (i + 1)]} kind="desktop" label={`SCREENSHOT ${i + 1}`} theme={theme} /></div></Term>
        </div>
      ); })}
    </Frame>
  );
}

function Metrics({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const stats = s.stats || [{ v: 8, suf: 'K', l: 'builds/day' }, { v: 42, suf: 'ms', l: 'p99 latency' }, { v: 100, suf: '%', l: 'green tests' }];
  const bars = s.bars || [['cpu', 0.62], ['mem', 0.48], ['net', 0.86], ['io', 0.35]];
  return (
    <Frame progress={progress} index={index} count={count} label="top">
      <div style={{ position: 'absolute', left: 110, top: 180, ...M.rise(progress, 0.06, 0.22, 30) }}>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 76, color: theme.ink }}>{splitLines(s.headline || '$ status --all')}</div>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 350, display: 'flex', gap: 30 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...M.pop(progress, 0.28 + i * 0.1, 0.4, 0.6), border: `1px solid ${rgba(theme.accent, 0.4)}`, background: rgba(theme.accent, 0.05), padding: '24px 40px', minWidth: 300 }}>
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 92, lineHeight: 1, color: theme.accent, textShadow: `0 0 24px ${rgba(theme.accent, 0.5)}` }}><Counter progress={progress} at={0.32 + i * 0.1} dur={0.5} value={st.v} suffix={st.suf} color={theme.accent} /></div>
            <div style={{ fontFamily: MONO, fontSize: 16, color: theme.dim, marginTop: 6 }}>&gt; {st.l}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 110, top: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {bars.map((b, i) => <Bar key={i} progress={progress} at={0.5 + i * 0.08} label={b[0]} frac={b[1]} theme={theme} />)}
      </div>
    </Frame>
  );
}

function Run({ progress, index, count, localTime, scene }) {
  const theme = useTheme();
  const s = scene || {};
  const line = [[[s.cmd || '$ run deploy --prod', 'def']]];
  const done = M.pop(progress, 0.5, 0.4, 0.7);
  const pill = M.pop(progress, 0.6, 0.4, 0.6);
  const logo = M.pop(progress, 0.3, 0.5, 0.5);
  return (
    <Frame progress={progress} index={index} count={count} label="run">
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <div style={{ ...logo, width: 120, height: 120, borderRadius: 16, border: `1px solid ${rgba(theme.accent, 0.4)}`, background: rgba(theme.accent, 0.05), overflow: 'hidden', padding: 16, marginBottom: 26 }}><MediaSlot src={s.logo} kind="logo" theme={theme} /></div>
        <div style={{ fontFamily: MONO, fontSize: 40, color: theme.ink }}><CodeBlock lines={line} clock={localTime} start={0.14} cps={20} theme={theme} size={40} /></div>
        <div style={{ ...done, marginTop: 14 }}><Glitch text={s.headline || 'DEPLOYED ✓'} clock={localTime} size={128} weight={800} ink={theme.accent} intensity={progress < 0.75 ? 1.4 : 0.4} /></div>
        <div style={{ ...pill, marginTop: 34, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '18px 42px', background: theme.accent, color: theme.bg, fontFamily: MONO, fontWeight: 800, fontSize: 30, boxShadow: `0 0 50px ${rgba(theme.accent, 0.5)}` }}>{s.cta || 'START BUILDING'} <span>▸</span></div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: theme.dim }}>{s.url || 'terminal.dev'}</div>
        </div>
      </div>
    </Frame>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════════════════════
const MAP = { Boot, Access, Compile, Deploy, Metrics, Run };

function HackerFilm() {
  const [t, setTweak] = window.useTweaks(window.OM_TWEAKS);
  const theme = {
    accent: t.accent || '#37FF7A', brand: (t.brandName || 'TERMINAL').toUpperCase(), url: t.url || 'root@node',
    bg: '#05080B', panel: '#0B1016', ink: '#D7F5E1', dim: '#4C6B58', cyan: '#35E0FF', amber: '#FFC24C', mag: '#FF4D9D',
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
        <TweakColor label="Phosphor" value={t.accent} options={['#37FF7A', '#FFB000', '#35E0FF', '#FF4D9D', '#E8ECEF']} onChange={v => setTweak('accent', v)} />
        <TweakText label="Brand name" value={t.brandName} onChange={v => setTweak('brandName', v)} />
        <TweakText label="Prompt / host" value={t.url} onChange={v => setTweak('url', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.HackerFilm = HackerFilm;
