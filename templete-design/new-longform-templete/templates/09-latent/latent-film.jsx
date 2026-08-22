/* KEYFRAME long-form template 09 — LATENT
   Motion world: generative computation. A living node lattice whose edges pulse
   with data, embedding clouds that reorganise, token streams, attention grids,
   kinetic typography that resolves out of noise. Transitions are computational:
   quantise, sample, converge, mask, dither. Premium AI product launch. */
const K = window.FilmKit;
const { ease, stg, rnd, rnd2, Words, Chars, Typed, Counter, Marquee, Slot, BrowserSlot, LogoSlot, Fill, alpha, lighten, darken } = K;
const W = 1920, H = 1080;

/* palette() needs real hex for its lighten/darken/alpha maths, so the bound
   Organic tokens are resolved once here rather than left as var(--*). */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-neutral-900', '#0f1114'),
  bg: DS('--color-neutral-800', '#15181c'),
  panel: DS('--color-neutral-700', '#1c2127'),
  edge: DS('--color-neutral-600', '#2a313a'),
  cream: DS('--color-bg', '#f5ead8'),
  mute: DS('--color-neutral-400', '#7d8794'),
  warm: DS('--color-accent-200', '#e8d5b8'),
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
const FH = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');
const lit = (c, s = 24) => `0 0 ${s}px ${alpha(c, 0.5)}`;

/* ---- transition language: computational ---- */
const TR = {
  quantise: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(16,1fr)', gridTemplateRows: 'repeat(9,1fr)' }}>
      {Array.from({ length: 144 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - rnd(i) * 0.08) / 0.1, 0, 1)), o);
        return <div key={i} style={{ background: col, opacity: v > 0.5 ? 1 : v * 2, transform: `scale(${0.86 + v * 0.14})` }} />;
      })}
    </div>;
  },
  converge: (p, col) => {
    const q = ease.inOut(clamp(p / 0.18, 0, 1)), o = p > 0.89 ? ease.inOut((p - 0.89) / 0.11) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ position: 'absolute', inset: 0, background: col, transform: `scale(${v * (1 + i * 0.35)})`, opacity: v * (1 - i * 0.18), borderRadius: v > 0.4 ? 999 : 0 }} />
      ))}
    </div>;
  },
  sample: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.012) / 0.1, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 91, height: 92, background: col, transform: `scaleX(${v})`, transformOrigin: i % 2 ? '100% 50%' : '0% 50%' }} />;
      })}
    </div>;
  },
  maskIn: (p, col) => {
    const q = ease.inOut(clamp(p / 0.19, 0, 1)), o = p > 0.89 ? ease.inOut((p - 0.89) / 0.11) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, clipPath: `inset(0 ${(1 - v) * 50}% 0 ${(1 - v) * 50}%)`, opacity: v > 0.02 ? 1 : 0 }} />;
  },
  dither: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gridTemplateRows: 'repeat(14,1fr)' }}>
      {Array.from({ length: 336 }).map((_, i) => {
        const v = Math.max(1 - clamp((p - rnd(i) * 0.11) / 0.09, 0, 1), o);
        return <div key={i} style={{ background: col, opacity: v > rnd(i + 300) ? 1 : 0 }} />;
      })}
    </div>;
  },
};
/* ---- cameras: latent-space traversal ---- */
const CAM = {
  traverse: (p) => ({ transform: `perspective(2600px) translateZ(${(1 - ease.out(p / 0.32)) * -520}px) rotateY(${(1 - ease.out(p / 0.4)) * 5}deg)` }),
  settle: (p) => ({ transform: `scale(${1.05 - ease.out(p / 0.42) * 0.05})` }),
  resolve: (p) => ({ filter: `blur(${(1 - ease.out(p / 0.24)) * 18}px)`, transform: `scale(${1.04 - ease.out(p / 0.4) * 0.04})` }),
  panR: (p) => ({ transform: `translateX(${26 - p * 58}px) scale(1.012)` }),
  panL: (p) => ({ transform: `translateX(${-26 + p * 58}px) scale(1.012)` }),
  float: (p) => ({ transform: `translateY(${Math.sin(p * 4.2) * 8}px)` }),
};
/* ---- world: the continuously running background ----
   Three-hue nebula wash, pulses travelling a fixed graph, a raking attention
   beam over a token row, two breathing probability ridges, falling samples. */
const AMB = 1.4;
const HUE = [C.accent, C.accent2, C.warm, '#6f8fb8'];
const NODES = Array.from({ length: 26 }).map((_, i) => [150 + K.rnd(i) * 1620, 120 + K.rnd(i + 40) * 840]);
const EDGES = (() => { const e = []; NODES.forEach((a, i) => NODES.forEach((b, j) => { if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < 340) e.push([i, j]); })); return e; })();
/* Which kind of beat each scene is; the engine reads this for brightness,
   particle energy, grid and flow strength, vignette tightness and sweep rate. */
const SCENE_STATE = {
  Open: 'INTRO',
  Hook: 'INTRO',
  Noise: 'MOMENT',
  Cloud: 'DATA',
  Ch1: 'PROBLEM',
  Opaque: 'DATA',
  Drift: 'DATA',
  Quote1: 'PROBLEM',
  Latency: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION',
  Trace: 'FEATURE',
  Attn: 'DATA',
  Stream: 'FEATURE',
  Console: 'FEATURE',
  Counter: 'FEATURE',
  Guard: 'FEATURE',
  Eval: 'DATA',
  Cluster: 'DATA',
  Versions: 'DATA',
  Eng: 'MOMENT',
  Ch3: 'DATA',
  Stats: 'DATA',
  Audit: 'FEATURE',
  Human: 'FEATURE',
  Compare: 'DATA',
  Reviews: 'SOLUTION',
  Ch4: 'CTA',
  Schema: 'FEATURE',
  Adopt: 'FEATURE',
  Teams: 'FEATURE',
  Plans: 'DATA',
  Founder: 'INTRO',
  Open2: 'MOMENT',
  CTA: 'CTA',
  End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* This template's own latent space as one decor layer. Scene energy drives the
   pulse traffic and the attention beam, so a data beat computes harder. */
const DECOR = (t, s, u) => {
  const W2 = W, H2 = H;
  const mu = (a) => K.alpha(C.mute, a);
  const ridge = (yy, s1, s2, amp) => Array.from({ length: 80 }).map((_, k) => {
    const g1 = Math.exp(-Math.pow((k - 22 + Math.sin(t * s1) * 6) / 11, 2));
    const g2 = Math.exp(-Math.pow((k - 52 + Math.cos(t * s2) * 7) / 15, 2));
    return `${k * (W2 / 79)},${yy - (g1 * amp + g2 * amp * 0.8)}`;
  }).join(' ');
  const beam = ((t * 0.28 * s.energy) % 1) * W2;
  return (
    <svg width={W2} height={H2} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[[0.24, 0.3, C.accent], [0.76, 0.66, C.accent2], [0.54, 0.14, C.warm]].map(([fx, fy, c], k) => (
        <ellipse key={k} cx={W2 * fx + Math.sin(t * (0.14 + k * 0.06)) * 90} cy={H2 * fy + Math.cos(t * (0.12 + k * 0.05)) * 70}
          rx={420 - k * 40} ry={340 - k * 30} fill={K.alpha(c, 0.07)} />))}
      {EDGES.map(([a, b], i) => {
        const pulse = (Math.sin(t * 1.2 + i * 0.6) + 1) / 2, on = pulse > 0.7;
        return <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]}
          stroke={on ? K.alpha(HUE[i % 4], 0.36) : mu(0.12)} strokeWidth={on ? 1.9 : 1} />;
      })}
      {EDGES.filter((_, i) => i % 4 === 0).map(([a, b], i) => {
        const ph = (t * 0.34 + i * 0.17) % 1;
        return <circle key={'p' + i} cx={NODES[a][0] + (NODES[b][0] - NODES[a][0]) * ph} cy={NODES[a][1] + (NODES[b][1] - NODES[a][1]) * ph}
          r={4.4} fill={K.alpha(HUE[i % 4], 0.7)} />;
      })}
      {NODES.map(([x, y], i) => {
        const b = (Math.sin(t * 1.7 + i) + 1) / 2;
        return <circle key={i} cx={x} cy={y} r={2.6 + b * 3.4} fill={i % 4 === 0 ? K.alpha(HUE[i % 4], 0.6) : mu(0.4)} />;
      })}
      <polyline points={ridge(H2 - 90, 0.4, 0.32, 130)} fill="none" stroke={K.alpha(C.accent, 0.3)} strokeWidth={2.4} />
      <polyline points={ridge(H2 - 90, 0.27, 0.44, 92)} fill="none" stroke={K.alpha(C.accent2, 0.26)} strokeWidth={2.2} />
      {Array.from({ length: 26 }).map((_, k) => {
        const x = 90 + k * 68, hot = Math.abs(x - beam) < 130;
        return <rect key={'tk' + k} x={x} y={H2 - 44} width={50} height={hot ? 24 : 10} rx={2}
          fill={hot ? K.alpha(HUE[k % 4], 0.55) : mu(0.16)} />;
      })}
      <rect x={beam - 3} y={H2 - 130} width={6} height={110} fill={K.alpha(C.warm, 0.4)} />
      {Array.from({ length: 22 }).map((_, k) => {
        const ph = (t * 0.07 + k * 0.045) % 1;
        return <circle key={'d' + k} cx={((k * 293) % W2) + Math.sin(t * 0.4 + k) * 44} cy={-20 + ph * (H2 + 40)} r={2.4}
          fill={K.alpha(k % 5 === 0 ? C.accent : C.mute, 0.3)} />;
      })}
      <circle cx={W2 / 2} cy={H2 / 2} r={430 + Math.sin(t * 0.3) * 26} fill="none" stroke={K.alpha(C.accent2, 0.09)} strokeWidth={1.6} />
      <circle cx={W2 / 2} cy={H2 / 2} r={300 + Math.cos(t * 0.26) * 22} fill="none" stroke={K.alpha(C.accent, 0.07)} strokeWidth={1.6} />
    </svg>);

};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'DATA',
  hues: [C.accent, C.accent2, C.warm, C.accent],
  ink: C.mute, light: C.cream, decor: DECOR,
});
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

const TAGS = ['LATENT · AN AI FILM', 'MODELS THAT EXPLAIN THEMSELVES', 'THE TRACE IS THE PRODUCT', 'INSPECTABLE BY DESIGN', 'THE SCHEMA IS OPEN'];
const FOOTS = ['every decision here carries its reasoning', 'two hundred and forty milliseconds, measured', 'the schema is published and versioned', 'no training on client data', 'audits answered live'];
const SIDES = ['TRACE · EXPLAIN · SHIP', 'FOUR MILLION DECISIONS A DAY', 'NINE OF US ARE EX-REGULATORS'];

/* Both composition-level: per-scene they would double at every cut. */
function Backdrop() {
  const a = K.useActive();
  const bg = a.bg || C.bg;
  return <div style={{ position: 'absolute', inset: 0, background: bg }}>{GROUND(bg, a.p, a.T, a.name)}
    {/* readability wash: one instance, so background contrast behind type holds
        steady through a cut rather than doubling with the neighbouring scene */}
    <div style={{ position: 'absolute', inset: 0, background: bg, opacity: 0.34, pointerEvents: 'none' }} />
  </div>;
}
function Garnish() {
  const a = K.useActive();
  const i = a.index, t = a.T * ENERGY;
  const c = K.isDark(a.bg) ? C.cream : C.ink;
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 44, right: 120, fontFamily: FB, fontWeight: 800, fontSize: 20, letterSpacing: '0.2em', textTransform: 'uppercase', color: alpha(c, 0.6), border: `2px solid ${alpha(c, 0.3)}`, borderRadius: 999, padding: '10px 26px', transform: `rotate(${Math.sin(t * 1.1 + i) * 1.4}deg)` }}>{TAGS[i % TAGS.length]}</div>
    <div style={{ position: 'absolute', bottom: 42, left: 120, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ width: 46, height: 4, borderRadius: 999, background: C.accent }} />
      <div style={{ fontFamily: FB, fontWeight: 600, fontStyle: 'italic', fontSize: 23, color: alpha(c, 0.6) }}>{FOOTS[i % FOOTS.length]}</div>
    </div>
    {i % 2 === 0
      ? <div style={{ position: 'absolute', left: 34, top: 340, writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: FB, fontWeight: 800, fontSize: 17, letterSpacing: '0.34em', textTransform: 'uppercase', color: alpha(c, 0.62) }}>{SIDES[(i >> 1) % SIDES.length]}</div>
      : <svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute', right: 62, bottom: 44, opacity: 0.55 }}>
          <g transform={`rotate(${t * 26} 35 35)`}>
            {[0, 1, 2, 3, 4, 5].map(k => <line key={k} x1={35} y1={10} x2={35} y2={26} stroke={C.accent} strokeWidth={5} strokeLinecap="round" transform={`rotate(${k * 60} 35 35)`} />)}
          </g>
        </svg>}
  </div>;
}

const STMT = (s, c) => ({ fontFamily: FH, fontSize: s, lineHeight: 1.04, color: c, margin: 0, fontWeight: 400 });
const NUM = (s, c) => ({ fontFamily: FB, fontWeight: 700, fontSize: s, letterSpacing: '-0.025em', lineHeight: 0.94, color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const TOK = (s, c) => ({ fontFamily: FB, fontSize: s, fontWeight: 700, letterSpacing: '0.24em', color: c, margin: 0, textTransform: 'uppercase' });
const BODY = (s, c) => ({ fontFamily: FB, fontSize: s, lineHeight: 1.52, color: c, margin: 0, fontWeight: 400 });
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 170px', boxSizing: 'border-box' };
const PAD = { position: 'absolute', inset: 0, padding: '150px 160px', boxSizing: 'border-box' };

/* ---- computational furniture ---- */
/* the living lattice — fixed topology, animated edge activation */
const LATTICE = (() => {
  const nodes = [];
  for (let i = 0; i < 26; i++) nodes.push([160 + rnd(i) * 1600, 140 + rnd(i + 40) * 800]);
  const links = [];
  nodes.forEach((a, i) => nodes.forEach((b, j) => {
    if (j <= i) return;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 330) links.push([i, j, d]);
  }));
  return { nodes, links };
})();
function Lattice({ T, o = 1, color = C.accent2, node = C.cream, activate = 1 }) {
  const { nodes, links } = LATTICE;
  return <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: o }}>
    {links.map(([a, b], i) => {
      const pulse = (Math.sin(T * 1.4 + i * 0.7) + 1) / 2;
      const on = pulse > 1 - activate;
      return <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
        stroke={on ? color : alpha(C.mute, 0.24)} strokeWidth={on ? 1.8 : 1} opacity={on ? 0.35 + pulse * 0.5 : 0.3} />;
    })}
    {nodes.map(([x, y], i) => {
      const b = (Math.sin(T * 1.9 + i) + 1) / 2;
      return <circle key={i} cx={x} cy={y} r={3 + b * 3.4} fill={i % 5 === 0 ? C.accent : node} opacity={0.4 + b * 0.5} />;
    })}
  </svg>;
}
/* embedding cloud that reorganises from scatter to clusters */
function Embedding({ p, T, n = 90, clusters = 3 }) {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {Array.from({ length: n }).map((_, i) => {
      const c = i % clusters;
      /* Centres spread over the frame for whatever count is asked for. At the default three
         this is the authored 480/960/1440 exactly; at four it is 384/768/1152/1536 instead of
         putting the fourth centre on x=1920, the frame's right edge, half out of shot. */
      const cx = (W / (clusters + 1)) * (c + 1), cy = 460 + (c % 2 ? 130 : -90);
      const sx = 120 + rnd(i) * 1680, sy = 120 + rnd(i + 30) * 840;
      const q = ease.inOut(clamp((p - 0.1 - rnd(i + 7) * 0.14) / 0.55, 0, 1));
      const jx = Math.cos(T * 0.8 + i) * 40 * (1 - q) + Math.cos(T * 1.4 + i) * 8 * q;
      const x = sx + (cx + (rnd(i + 11) - 0.5) * 210 - sx) * q + jx;
      const y = sy + (cy + (rnd(i + 19) - 0.5) * 200 - sy) * q;
      /* HUE (:88) is this film's own four-hue set, already carrying the world's edges, nodes,
         samples and attention beam. A fourth cluster takes its cool tone; at three clusters the
         first three entries are the accent/accent2/warm this always used. Wrapped, because an
         index past the end yields undefined, reaches lit(), and throws. */
      const col = HUE[c % HUE.length];
      return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 9, height: 9, borderRadius: 999, background: col, opacity: 0.4 + q * 0.5, boxShadow: q > 0.7 ? lit(col, 10) : 'none' }} />;
    })}
  </div>;
}
/* token stream */
function Tokens({ items, T, y, speed = 60, color, bg, size = 26 }) {
  const t = items.join('') + '';
  const wpx = t.length * size * 0.62;
  const x = -((T * speed) % wpx);
  return <div style={{ position: 'absolute', left: 0, top: y, whiteSpace: 'nowrap', transform: `translateX(${x}px)`, display: 'flex', gap: 8 }}>
    {items.concat(items).map((it, i) => (
      <span key={i} style={{ ...TOK(size, color), background: bg, border: `1px solid ${C.edge}`, borderRadius: 6, padding: '8px 14px' }}>{it}</span>
    ))}
  </div>;
}
/* attention heat grid */
function Attention({ p, rows = 8, cols = 14, color, cell = 66 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 5 }}>
    {Array.from({ length: rows * cols }).map((_, i) => {
      const w = rnd(i);
      const q = ease.out(stg(p, i % cols, 0.03, 0.3));
      return <div key={i} style={{ height: cell, background: alpha(color, 0.08 + w * 0.82 * q), borderRadius: 3 }} />;
    })}
  </div>;
}
function Panel({ children, label, style, q = 1 }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 12, padding: '26px 30px', opacity: q, ...style }}>
    {label ? <div style={{ ...TOK(14, C.mute), marginBottom: 16 }}>{label}</div> : null}
    {children}
  </div>;
}
/* type that resolves out of character noise */
const NOISE = '▚▞▖▘▝▗░▒▓#@%&';
function Resolve({ t, p, size, color, font, per = 0.035, d = 0 }) {
  return <span style={{ whiteSpace: 'nowrap' }}>{String(t).split('').map((ch, i) => {
    if (ch === ' ') return <span key={i} style={{ display: 'inline-block', width: size * 0.3 }} />;
    const q = stg(p - d, i, per, 0.26);
    const show = q >= 1 ? ch : NOISE[(i * 3 + Math.floor(q * 22)) % NOISE.length];
    return <span key={i} style={{ display: 'inline-block', fontFamily: font, fontSize: size, color: q >= 1 ? color : alpha(C.mute, 0.8), opacity: q > 0 ? 1 : 0 }}>{show}</span>;
  })}</span>;
}
function Chapter({ p, n, title, deck }) {
  return <div style={{ position: 'absolute', inset: 0, background: C.bg }}>
    <Lattice T={p * 26} o={0.55} activate={ease.inOut(p / 0.5)} />
    <div style={{ position: 'absolute', left: 160, top: 360 }}>
      <div style={{ ...TOK(17, C.accent), opacity: ease.out((p - 0.1) / 0.3) }}>{n}</div>
      <div style={{ marginTop: 18, opacity: ease.out((p - 0.2) / 0.3) }}>
        <Resolve t={title} p={p} d={0.2} size={92} color={C.cream} font={FH} per={0.026} />
      </div>
      {deck ? <div style={{ ...BODY(34, C.mute), marginTop: 22, maxWidth: 860, opacity: ease.out((p - 0.44) / 0.3) }}>{deck}</div> : null}
    </div>
  </div>;
}
function Chrome() {
  const { T } = useComposition();
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 44, left: 54, display: 'flex', alignItems: 'center', gap: 12, background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 8, padding: '8px 18px 8px 8px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, overflow: 'hidden' }}><Fill id="lt-mark" shape="circle" placeholder="LOGO" /></div>
      <span style={TOK(17, C.cream)}>{(window.OM_TWEAKS || {}).brandName || 'LATENT'}</span>
    </div>
    <div style={{ position: 'absolute', top: 44, right: 54, background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 8, padding: '9px 16px', ...TOK(14, C.cream) }}>STEP {String(Math.floor(T * 12)).padStart(5, '0')}</div>
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPEN ===== */}
      <Scene name="Open" bg={C.ink} wipe="converge" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Lattice T={T} o={0.8} activate={0.7} />
          <div style={MID}>
            <LogoSlot id="lt-logo" size={124} p={p} d={0.05} shape="circle" />
            <div style={{ marginTop: 28, position: 'relative' }}>
              <Resolve t="LATENT" p={p} d={0.18} size={210} color={C.cream} font={FH} per={0.05} />
            </div>
            <div style={{ ...TOK(21, C.accent), marginTop: 22, opacity: ease.out((p - 0.55) / 0.3) }}>MODELS THAT EXPLAIN THEMSELVES</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.bg} wipe="sample" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Lattice T={T} o={0.32} activate={0.4} />
          <div style={MID}>
            <div style={{ position: 'relative', maxWidth: 1520 }}>
              <Words t="Every model in production is a decision nobody can read." p={p} per={0.05} style={STMT(106, C.cream)} />
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Cloud" bg={C.ink} wipe="dither" wipeColor={C.panel}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Embedding p={p} T={T} n={100} />
          <div style={{ position: 'absolute', left: 160, bottom: 160, width: 1000 }}>
            <div style={{ ...TOK(17, C.accent) }}>EMBEDDING SPACE · 1,536 DIMENSIONS, PROJECTED</div>
            <div style={{ ...STMT(82, C.cream), marginTop: 20 }}>Meaning has a shape. It is just not one you can see.</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.bg} wipe="quantise" wipeColor={C.ink}>{(p) => <Chapter p={p} n="SECTION 01" title="The black box problem" deck="Accuracy was never the hard part. Explaining it to a regulator was." />}</Scene>

      <Scene name="Opaque" bg={C.panel} wipe="maskIn" wipeColor={C.accent}>{(p) => {
        const rows = [['Model calls per day', '4.2M'], ['Decisions logged with a reason', '0'], ['Audit requests last quarter', '38'], ['Answered in full', '2']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1500 }}>
          <div style={{ ...TOK(17, C.accent), marginBottom: 30 }}>WHAT THE LOGS ACTUALLY HELD</div>
          {rows.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 24, padding: '18px 0', borderBottom: `1px solid ${C.edge}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <span style={BODY(44, C.cream)}>{k}</span><span style={{ flex: 1 }} />
              <span style={{ ...NUM(48, i > 1 ? C.accent : C.cream), textShadow: i > 1 ? lit(C.accent, 16) : 'none' }}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Drift" bg={C.bg} wipe="sample" wipeColor={C.panel}>{(p) => {
        const series = Array.from({ length: 34 }).map((_, i) => 0.94 - (i > 18 ? (i - 18) * 0.022 : 0) + rnd(i) * 0.02);
        const q = ease.inOut(p / 0.7);
        const pts = series.map((v, i) => [200 + i * 45, 760 - (v - 0.5) * 900]);
        const shown = Math.max(2, Math.ceil(q * pts.length));
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 160, top: 190, ...STMT(78, C.cream) }}>Accuracy drifted for eleven weeks before anyone noticed.</div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.slice(0, shown).map(a => a.join(',')).join(' ')} fill="none" stroke={C.accent} strokeWidth="4" />
          </svg>
          <div style={{ position: 'absolute', left: 160, bottom: 170, ...TOK(15, C.mute) }}>F1 SCORE · WEEK 1 TO WEEK 34</div>
        </div>;
      }}</Scene>

      <Scene name="Quote1" bg={C.panel} wipe="converge" wipeColor={C.bg}>{(p, lt) => (
        <div style={MID}>
          <div style={{ maxWidth: 1480, minHeight: 300 }}>
            <Typed t="It works. We cannot ship it, because we cannot explain it." p={p} lt={lt} dur={0.58} caretColor={C.accent} style={STMT(88, C.cream)} />
          </div>
          <div style={{ ...TOK(17, C.accent2), marginTop: 34, opacity: ease.out((p - 0.72) / 0.2) }}>HEAD OF ML · REGULATED LENDER</div>
        </div>)}
      </Scene>

      <Scene name="Turn" bg={C.accent} wipe="maskIn" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Resolve t="So open the box." p={p} size={140} color={C.ink} font={FH} per={0.035} />
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.bg} wipe="dither" wipeColor={C.accent2}>{(p) => <Chapter p={p} n="SECTION 02" title="How Latent works" deck="Every inference returns its own reasoning trace, with the features that moved it." />}</Scene>

      <Scene name="Trace" bg={C.ink} wipe="sample" wipeColor={C.panel}>{(p) => {
        const feats = [['income_ratio', 0.34, C.accent], ['tenure_months', 0.22, C.accent2], ['prior_default', -0.18, C.accent], ['region_code', 0.09, C.accent2], ['channel', -0.04, C.mute]];
        return <div style={{ ...PAD, display: 'flex', gap: 70, alignItems: 'center' }}>
          <div style={{ flex: '0 0 620px' }}>
            <div style={TOK(17, C.accent)}>REASONING TRACE</div>
            <div style={{ ...STMT(84, C.cream), marginTop: 20 }}>Five features, ranked and signed.</div>
            <div style={{ ...BODY(34, C.mute), marginTop: 20 }}>Returned inline with every prediction, not reconstructed after the fact.</div>
          </div>
          <Panel label="CONTRIBUTIONS · REQUEST 8F21A" q={ease.out(p / 0.3)} style={{ flex: 1 }}>
            {feats.map(([n, v, col], i) => {
              const q = ease.inOut(stg(p - 0.15, i, 0.08, 0.28));
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '12px 0' }}>
                <span style={{ ...BODY(28, C.cream), width: 260 }}>{n}</span>
                <div style={{ flex: 1, height: 22, position: 'relative', background: alpha(C.mute, 0.12), borderRadius: 4 }}>
                  <div style={{ position: 'absolute', left: v > 0 ? '50%' : `${50 + v * 100}%`, width: `${Math.abs(v) * 100 * q}%`, height: 22, background: col, borderRadius: 4 }} />
                </div>
                <span style={{ ...NUM(26, col), width: 90, textAlign: 'right' }}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>
              </div>;
            })}
          </Panel>
        </div>;
      }}</Scene>

      <Scene name="Attn" bg={C.bg} wipe="quantise" wipeColor={C.ink}>{(p) => (
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...TOK(17, C.accent2), marginBottom: 26 }}>ATTENTION · LAYER 14, ALL HEADS</div>
          <Attention p={p} rows={8} cols={16} color={C.accent} />
          <div style={{ ...BODY(34, C.mute), marginTop: 30 }}>Where the model looked, per token, per head — exportable as a table.</div>
        </div>)}
      </Scene>

      <Scene name="Stream" bg={C.ink} wipe="sample" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Tokens items={['tok_4192', 'tok_0087', 'tok_9931', 'tok_2240', 'tok_6605']} T={T} y={230} speed={70} color={C.accent2} bg={C.panel} />
          <Tokens items={['logit 0.94', 'logit 0.71', 'logit 0.32', 'logit 0.08']} T={T} y={790} speed={52} color={C.warm} bg={C.panel} />
          <div style={MID}>
            <div style={{ background: C.ink, padding: '24px 44px' }}>
              <Words t="Every token, every logit, kept." p={p} style={STMT(92, C.cream)} />
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Console" bg={C.panel} wipe="maskIn" wipeColor={C.bg}>{(p) => (
        <div style={MID}>
          <BrowserSlot id="lt-console" w={1420} h={620} url="latent.ai/traces" p={p} bar={C.edge} ink={C.mute} />
          <div style={{ ...TOK(16, C.mute), marginTop: 26, opacity: ease.out((p - 0.5) / 0.3) }}>TRACE EXPLORER · SEARCHABLE BY FEATURE</div>
        </div>)}
      </Scene>

      <Scene name="Counter" bg={C.bg} wipe="dither" wipeColor={C.panel}>{(p, lt) => (
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30 }}>
          <Panel label="COUNTERFACTUAL QUERY" q={ease.out(p / 0.3)}>
            <div style={BODY(38, C.cream)}>
              <Typed t="what would have flipped this decision?" p={p} lt={lt} dur={0.48} caretColor={C.accent} style={BODY(38, C.cream)} />
            </div>
          </Panel>
          <Panel label="ANSWER · 240ms" q={ease.out((p - 0.45) / 0.3)}>
            <div style={BODY(36, C.accent2)}>income_ratio above 0.41, or tenure_months above 26. Nothing else in the top forty features.</div>
          </Panel>
        </div>)}
      </Scene>

      <Scene name="Guard" bg={C.ink} wipe="converge" wipeColor={C.accent2}>{(p) => {
        const rules = [['PII in prompt', 'blocked'], ['Protected attribute used', 'blocked'], ['Confidence below 0.6', 'escalated'], ['Novel input cluster', 'flagged']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          <div style={{ ...TOK(17, C.accent), marginBottom: 16 }}>GUARDRAILS · EVALUATED PRE-RESPONSE</div>
          {rules.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 10, padding: '22px 28px', opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: v === 'blocked' ? C.accent : C.accent2, boxShadow: lit(v === 'blocked' ? C.accent : C.accent2, 12) }} />
              <span style={{ ...BODY(36, C.cream), flex: 1 }}>{k}</span>
              <span style={TOK(16, v === 'blocked' ? C.accent : C.accent2)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Eng" bg={C.panel} wipe="quantise" wipeColor={C.accent}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="lt-eng" w={500} h={620} r={12} p={p} enter="left" />
          <div style={{ maxWidth: 880 }}>
            <Words t="“The trace is the product. The model is just the thing that produces it.”" p={p} d={0.15} per={0.04} style={STMT(72, C.cream)} />
            <div style={{ ...TOK(17, C.accent2), marginTop: 28, opacity: ease.out((p - 0.72) / 0.2) }}>RESEARCH LEAD · LATENT</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.bg} wipe="converge" wipeColor={C.accent}>{(p) => <Chapter p={p} n="SECTION 03" title="What it changed" deck="Ninety days across fourteen regulated deployments." />}</Scene>

      <Scene name="Stats" bg={C.ink} wipe="sample" wipeColor={C.panel}>{(p) => {
        const cols = [[100, '%', 'decisions traced', C.accent], [240, 'ms', 'added latency', C.accent2], [38, '', 'audits answered in full', C.cream]];
        return <div style={{ ...MID, flexDirection: 'row', gap: 28 }}>
          {cols.map(([n, sfx, lbl, col], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <Panel key={i} q={q} style={{ width: 470, padding: '46px 36px', transform: `translateY(${(1 - q) * 70}px)` }}>
              <div style={{ ...NUM(150, col), textShadow: lit(col, 30), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.42} suffix={sfx} /></div>
              <div style={{ ...BODY(30, C.mute), marginTop: 14 }}>{lbl}</div>
            </Panel>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Compare" bg={C.bg} wipe="dither" wipeColor={C.ink}>{(p) => {
        const rows = [['Reasoning returned inline', 'Reconstructed weeks later'], ['Counterfactuals in 240ms', 'A data-science ticket'], ['Guardrails pre-response', 'Post-hoc review'], ['One trace format', 'Four bespoke pipelines']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', gap: 16, opacity: q, transform: `translateY(${(1 - q) * 34}px)` }}>
              <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.accent}`, borderRadius: 10, padding: '22px 30px', ...BODY(36, C.cream) }}>{a}</div>
              <div style={{ flex: 1, border: `1px solid ${C.edge}`, borderRadius: 10, padding: '22px 30px', ...BODY(36, alpha(C.mute, 0.9)) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Reviews" bg={C.ink} wipe="quantise" wipeColor={C.accent2}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Lattice T={T} o={0.3} activate={0.5} />
          <Marquee items={['“our regulator asked for the trace format”', '“shipped in eleven days”', '“the counterfactuals sold it”']} T={T} speed={100} size={42} style={{ top: 240, ...BODY(42, alpha(C.mute, 0.5)) }} />
          <Marquee items={['“no measurable latency cost”', '“audit went from weeks to hours”', '“one format, every model”']} T={T} speed={78} dir={-1} size={42} style={{ bottom: 250, ...BODY(42, alpha(C.accent2, 0.5)) }} />
          <div style={MID}>
            <div style={{ background: C.ink, padding: '22px 48px' }}>
              <div style={{ ...NUM(180, C.cream), textShadow: lit(C.accent, 36) }}><Counter target={4200000} p={p} dur={0.6} /></div>
              <div style={{ ...TOK(18, C.accent), textAlign: 'center', marginTop: 12 }}>TRACED DECISIONS PER DAY</div>
            </div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.bg} wipe="maskIn" wipeColor={C.panel}>{(p) => <Chapter p={p} n="SECTION 04" title="Built to be inspected" deck="Open trace schema, on-prem inference, and no training on your data." />}</Scene>

      <Scene name="Schema" bg={C.panel} wipe="sample" wipeColor={C.bg}>{(p) => {
        const items = ['OPEN TRACE SCHEMA', 'ON-PREM INFERENCE', 'NO TRAINING ON CLIENT DATA', 'SOC 2 TYPE II', 'EU AI ACT ALIGNED', 'MODEL-AGNOSTIC ADAPTER'];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...STMT(80, C.cream), marginBottom: 40 }}>Inspectable by the people who have to sign it off.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {items.map((it, i) => {
              const q = ease.out(stg(p, i, 0.07, 0.24));
              return <div key={i} style={{ border: `1px solid ${C.accent2}`, borderRadius: 10, padding: '26px 26px', ...TOK(16, C.accent2), opacity: q, transform: `translateY(${(1 - q) * 28}px)` }}>{it}</div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Plans" bg={C.bg} wipe="converge" wipeColor={C.ink}>{(p) => {
        const plans = [['Research', '$0', 'one model, public traces'], ['Production', '$2,800', 'per month, unlimited models'], ['Regulated', 'Custom', 'on-prem, with an auditor seat']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 24 }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28)); const hero = i === 1;
            return <div key={i} style={{ width: 470, background: hero ? C.panel : 'transparent', border: `1px solid ${hero ? C.accent : C.edge}`, borderRadius: 12, padding: '46px 38px', boxSizing: 'border-box', textAlign: 'left', opacity: q, transform: `translateY(${(1 - q) * 80}px)`, boxShadow: hero ? lit(C.accent, 40) : 'none' }}>
              <div style={TOK(16, hero ? C.accent : C.mute)}>{n.toUpperCase()}</div>
              <div style={{ ...NUM(92, C.cream), marginTop: 14 }}>{price}</div>
              <div style={{ ...BODY(30, C.mute), marginTop: 10 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.panel} wipe="dither" wipeColor={C.accent}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="lt-founder" w={520} h={640} r={12} p={p} enter="left" />
          <div style={{ maxWidth: 860 }}>
            <div style={TOK(17, C.accent)}>WHY WE BUILT IT</div>
            <div style={{ ...STMT(70, C.cream), marginTop: 20 }}>We spent two years building a model we were not allowed to deploy.</div>
            <div style={{ ...BODY(34, C.mute), marginTop: 20 }}>Latent is the trace layer we built to get it past compliance — and then everyone asked for it.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.ink} wipe="quantise" wipeColor={C.accent}>{(p) => {
        const bq = ease.out((p - 0.25) / 0.32);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <Lattice T={T} o={0.7} activate={0.75} />
          <div style={MID}>
            <LogoSlot id="lt-logo-cta" size={116} p={p} d={0.05} shape="circle" />
            <div style={{ ...STMT(104, C.cream), marginTop: 28 }}>Trace your first model</div>
            <div style={{ ...STMT(104, C.accent), textShadow: lit(C.accent, 36) }}>this afternoon.</div>
            <div style={{ display: 'inline-block', marginTop: 40, opacity: bq, transform: `translateY(${(1 - bq) * 28}px) scale(${1 + Math.sin(T * 3) * 0.012})`, background: C.accent, color: C.ink, ...TOK(24, C.ink), padding: '22px 58px', borderRadius: 10, boxShadow: lit(C.accent, 40) }}>CONNECT A MODEL</div>
            <div style={{ ...TOK(17, C.mute), marginTop: 26 }}>LATENT.AI</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.ink} wipe="converge" wipeColor={C.accent}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
          <Lattice T={T} o={0.6} activate={0.6} />
          <div style={MID}>
            <Resolve t="LATENT" p={p} size={200} color={C.cream} font={FH} per={0.05} />
            <div style={{ ...TOK(19, C.accent2), marginTop: 24, opacity: ease.out((p - 0.5) / 0.3) }}>MODELS THAT EXPLAIN THEMSELVES</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Noise" bg={C.ink} wipe="dither" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <div style={{ position: 'relative' }}>
            <Resolve t="SIGNAL FROM NOISE" p={p} size={130} color={C.cream} font={FH} per={0.028} />
          </div>
          <div style={{ ...BODY(38, C.mute), marginTop: 34, maxWidth: 1100, opacity: ease.out((p - 0.5) / 0.3) }}>Every frame of this sentence existed as noise a moment ago. So did the decision.</div>
        </div>)}
      </Scene>

      <Scene name="Latency" bg={C.bg} wipe="sample" wipeColor={C.panel}>{(p) => {
        const rows = [['Inference', 0.62, C.accent], ['Trace assembly', 0.18, C.accent2], ['Guardrails', 0.12, C.warm], ['Serialise', 0.08, C.mute]];
        const q = ease.inOut(p / 0.65);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...TOK(17, C.accent), marginBottom: 30 }}>WHERE THE 240 MILLISECONDS GO</div>
          {rows.map(([k, v, col], i) => (
            <div key={i} style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={BODY(36, C.cream)}>{k}</span>
                <span style={NUM(34, col)}>{Math.round(v * 240 * q)}ms</span>
              </div>
              <div style={{ height: 14, background: alpha(C.mute, 0.14), borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${v * 100 * q}%`, background: col }} />
              </div>
            </div>))}
        </div>;
      }}</Scene>

      <Scene name="Eval" bg={C.ink} wipe="quantise" wipeColor={C.panel}>{(p) => {
        const suites = [['Fairness', 0.96], ['Robustness', 0.91], ['Calibration', 0.94], ['Toxicity', 0.99], ['Groundedness', 0.88]];
        const q = ease.inOut(p / 0.65);
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...STMT(78, C.cream), marginBottom: 40 }}>Five suites, run on every commit.</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {suites.map(([n, v], i) => {
              const vis = ease.out(stg(p, i, 0.08, 0.26));
              return <Panel key={i} q={vis} style={{ flex: 1, padding: '28px 24px' }}>
                <div style={{ ...NUM(66, v > 0.93 ? C.accent2 : C.accent) }}>{(v * q).toFixed(2)}</div>
                <div style={{ ...TOK(14, C.mute), marginTop: 12 }}>{n}</div>
              </Panel>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Cluster" bg={C.bg} wipe="converge" wipeColor={C.ink}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Embedding p={p} T={T} n={80} clusters={4} />
          <div style={{ position: 'absolute', left: 160, bottom: 160, width: 1000 }}>
            <div style={TOK(17, C.accent2)}>NOVEL INPUT DETECTION</div>
            <div style={{ ...STMT(78, C.cream), marginTop: 18 }}>A fourth cluster appeared in March. It was a new fraud pattern.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Versions" bg={C.panel} wipe="maskIn" wipeColor={C.bg}>{(p) => {
        const rows = [['v4.1', 'baseline', '0.91'], ['v4.2', 'reweighted features', '0.93'], ['v4.3', 'new tokeniser', '0.92'], ['v5.0', 'shipped', '0.96']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...TOK(17, C.accent), marginBottom: 26 }}>MODEL LINEAGE · EVERY VERSION TRACED</div>
          {rows.map(([v, note, score], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            const last = i === 3;
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 30, padding: '20px 0', borderBottom: `1px solid ${C.edge}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <span style={{ ...NUM(48, last ? C.accent : C.cream), width: 160 }}>{v}</span>
              <span style={{ ...BODY(34, C.mute), flex: 1 }}>{note}</span>
              <span style={{ ...NUM(40, last ? C.accent2 : C.mute) }}>{score}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Audit" bg={C.ink} wipe="sample" wipeColor={C.accent2}>{(p, lt) => (
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30 }}>
          <Panel label="AUDITOR REQUEST" q={ease.out(p / 0.3)}>
            <div style={BODY(38, C.cream)}>
              <Typed t="show every declined application from region 04, with reasons" p={p} lt={lt} dur={0.5} caretColor={C.accent} style={BODY(38, C.cream)} />
            </div>
          </Panel>
          <Panel label="RETURNED · 1,412 ROWS · 3.1s" q={ease.out((p - 0.45) / 0.3)}>
            <div style={BODY(36, C.accent2)}>Each with its own trace id, feature contributions and counterfactual threshold. Exported as CSV.</div>
          </Panel>
        </div>)}
      </Scene>

      <Scene name="Human" bg={C.bg} wipe="dither" wipeColor={C.accent}>{(p) => (
        <div style={{ ...PAD, display: 'flex', alignItems: 'center', gap: 80 }}>
          <Slot id="lt-human" w={780} h={620} r={12} p={p} enter="left" />
          <div style={{ maxWidth: 660 }}>
            <div style={TOK(17, C.accent2)}>HUMAN IN THE LOOP</div>
            <div style={{ ...STMT(76, C.cream), marginTop: 20 }}>Low-confidence cases go to a person, with the trace attached.</div>
            <div style={{ ...BODY(34, C.mute), marginTop: 20 }}>Eleven per cent of volume, reviewed in a median of ninety seconds.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Teams" bg={C.panel} wipe="quantise" wipeColor={C.bg}>{(p) => (
        <div style={MID}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const q = ease.out(stg(p, i, 0.08, 0.26));
              return <div key={i} style={{ width: 260, height: 300, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.edge}`, opacity: q, transform: `translateY(${(1 - q) * 100}px)` }}>
                <Fill id={`lt-team-${i}`} shape="rounded" radius={12} placeholder="DROP TEAM PHOTO" idle={C.ink} />
              </div>;
            })}
          </div>
          <div style={{ ...STMT(70, C.cream), marginTop: 44 }}>Fourteen people, nine of them ex-regulators.</div>
        </div>)}
      </Scene>

      <Scene name="Adopt" bg={C.ink} wipe="maskIn" wipeColor={C.accent2}>{(p) => {
        const steps = [['DAY 0', 'adapter in front of your model'], ['DAY 1', 'traces flowing, read-only'], ['DAY 4', 'guardrails on'], ['DAY 11', 'first audit answered live']];
        return <div style={{ ...PAD, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          <div style={{ ...TOK(17, C.accent), marginBottom: 16 }}>ELEVEN DAYS, NO MODEL CHANGES</div>
          {steps.map(([k, v], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 40, padding: '16px 0', borderBottom: `1px solid ${C.edge}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <span style={{ ...NUM(50, C.accent), width: 190 }}>{k}</span>
              <span style={BODY(40, C.cream)}>{v}</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Open2" bg={C.accent} wipe="converge" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Resolve t="THE SCHEMA IS OPEN." p={p} size={120} color={C.ink} font={FH} per={0.028} />
          <div style={{ ...BODY(38, alpha(C.ink, 0.8)), marginTop: 30, opacity: ease.out((p - 0.5) / 0.3) }}>Published, versioned, and adopted by four other vendors.</div>
        </div>)}
      </Scene>

      <Garnish />
    </div>
  );
}

window.LatentFilm = function LatentFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
    <Film />
  </CompositionStage>;
};
