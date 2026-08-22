/* KEYFRAME long-form template 01 — PET STORY (v2, rebuilt)
   Direction: kennel-club broadsheet. Flat, architectural, set in Archivo on a
   visible modular grid — zero radius, 2px rules, one red accent, photography in
   pure black and white. Motion is mechanical: rules draw, cells step, columns
   wipe. Nothing here is rounded, soft or gradient-filled; the previous warm
   organic direction is gone entirely.
   Grounded in the Modernist design system tokens. */
const K = window.FilmKit;
const { ease, stg, rnd, Words, Chars, Typed, Counter, Marquee, Slot, Fill, alpha, lighten, darken, fitText } = K;
const W = 1920, H = 1080;

/* Theme resolved from the bound Organic design system rather than transcribed:
   this template's direction (warm paper, terracotta, sage) is Organic's, so its
   tokens are the source of truth and Caprasimo is its display voice. palette()
   needs real hex for its lighten/darken/alpha maths, so tokens are read once
   here instead of left as var(--*); fallbacks cover the first frame. */
const DS = (n, fb) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; }
};
const C = K.palette({
  ink: DS('--color-text', '#201e1d'),
  paper: DS('--color-bg', '#f5ead8'),
  white: DS('--color-neutral-100', '#fffdf8'),
  grey: DS('--color-neutral-300', '#cfc2ad'),
  mid: DS('--color-neutral-600', '#8a7c68'),
  near: DS('--color-neutral-900', '#1b1713'),
  sageT: DS('--color-accent-2-100', '#e7ecdd'),
  terraT: DS('--color-accent-100', '#f8e2d2'),
  desk: '#1c1614',
  accent: DS('--color-accent', '#c67139'),
  accent2: DS('--color-accent-2', '#7a8a5e'),
}, window.OM_TWEAKS);
const FD = DS('--font-heading', '"Caprasimo", serif');
const FB = DS('--font-body', '"Figtree", system-ui, sans-serif');
const ENERGY = ({ Calm: 0.6, Lively: 1, Bouncy: 1.4 })[(window.OM_TWEAKS || {}).energy] || 1;
 /* --font-heading-weight; the system ships Archivo at 400/600/800 */
const GUT = 120, COL = (W - GUT * 2) / 12;

/* ---- transitions: hard-edged, mechanical ---- */
const TR = {
  columns: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.012) / 0.11, 0, 1)), o);
        return <div key={i} style={{ flex: 1, background: col, transform: `translateY(${(1 - v) * (i % 2 ? -104 : 104)}%)` }} />;
      })}
    </div>;
  },
  bars: (p, col) => {
    const o = p > 0.9 ? clamp((p - 0.9) / 0.1, 0, 1) : 0;
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: 9 }).map((_, i) => {
        const v = Math.max(1 - ease.out(clamp((p - i * 0.014) / 0.11, 0, 1)), o);
        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 120, height: 121, background: col, transform: `scaleX(${v})`, transformOrigin: i % 2 ? '100% 50%' : '0% 50%' }} />;
      })}
    </div>;
  },
  blockOut: (p, col) => {
    const q = ease.out(clamp(p / 0.1, 0, 1)), o = p > 0.9 ? ease.in((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, transform: `translateX(${(1 - v) * -102}%)` }} />;
  },
  split: (p, col) => {
    const q = ease.out(clamp(p / 0.11, 0, 1)), o = p > 0.9 ? ease.in((p - 0.9) / 0.1) : 0;
    const v = Math.max(1 - q, o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50.2%', background: col, transform: `translateY(${(1 - v) * -101}%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50.2%', background: col, transform: `translateY(${(1 - v) * 101}%)` }} />
    </div>;
  },
  cut: (p, col) => {
    const o = p > 0.94 ? clamp((p - 0.94) / 0.06, 0, 1) : 0;
    const v = Math.max(1 - clamp(p / 0.05, 0, 1), o);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: col, opacity: v > 0.5 ? 1 : 0 }} />;
  },
};
/* ---- cameras: mechanical, small moves ---- */
const CAM = {
  hold: () => ({}),
  stepL: (p) => ({ transform: `translateX(${(1 - ease.out(Math.min(p / 0.2, 1))) * 90}px)` }),
  stepU: (p) => ({ transform: `translateY(${(1 - ease.out(Math.min(p / 0.2, 1))) * 70}px)` }),
  tightIn: (p) => ({ transform: `scale(${1 + ease.inOut(p) * 0.035})` }),
  wideOut: (p) => ({ transform: `scale(${1.035 - ease.inOut(p) * 0.035})` }),
  nudge: (p) => ({ transform: `translateX(${-ease.inOut(p) * 34}px)` }),
};

/* ---- world: the continuously running background ----
   A properly drawn dog, not a silhouette: two-segment legs on a trot gait,
   layered body forms, a flopping ear, a wagging tail, a collar and a tongue,
   built from curves in the system's warm ramp. Runs off the composition clock,
   so it never restarts at a cut. */
const AMB = 1.15;
const D_BODY = K.lighten(C.accent, 0.14);
const D_DARK = K.darken(C.accent, 0.3);
const D_PATCH = K.lighten(C.accent, 0.62);
const HILL_A = K.alpha(C.accent2, 0.16);
const HILL_B = K.alpha(C.accent, 0.14);

/* Figures come from the shared illustration system (kit/illo.js) so the dog is
   drawn by the same recipe — one light direction, one outline weight, one eye
   construction — as every other figure in the collection. */
const IL = window.Illo.make({ primary: C.accent, secondary: C.accent2 });
function Figure({ fn, t, x, y, h, ...rest }) {
  return <g transform={`translate(${x},${y}) scale(${h / (fn.h || 110)})`}>{fn(t, rest)}</g>;
}

/* Which kind of beat each scene is; the engine reads this to decide how bright,
   how energetic, how structured and how tightly focused the background should be. */
const SCENE_STATE = {
  Open: 'INTRO', Hook: 'INTRO', Sniff: 'INTRO', Portrait: 'INTRO',
  Ch1: 'PROBLEM', Label: 'PROBLEM', Stat1: 'DATA', Quote1: 'PROBLEM', Timeline: 'DATA', Cost: 'DATA',
  Turn: 'MOMENT',
  Ch2: 'SOLUTION', Pillars: 'SOLUTION', WeighIn: 'DATA',
  Feature1: 'FEATURE', Farms: 'FEATURE', Sourcing: 'FEATURE', Feature2: 'FEATURE', Kitchen: 'FEATURE',
  Texture: 'MOMENT', Feature3: 'FEATURE', Steps: 'FEATURE', Recipe: 'DATA', Packaging: 'FEATURE', Vet: 'MOMENT',
  Ch3: 'DATA', Stats: 'DATA', Coat: 'DATA', Energy: 'DATA', Sleep: 'DATA',
  BeforeAfter: 'DATA', Testimonial: 'MOMENT', Reviews: 'SOLUTION', Compare: 'DATA', Awards: 'SOLUTION',
  Ch4: 'SOLUTION', Montage: 'DATA', Breeds: 'FEATURE', Team: 'FEATURE', Plans: 'DATA',
  Delivery: 'FEATURE', Planet: 'DATA', FAQ: 'FEATURE', Founder: 'INTRO',
  Ch5: 'CTA', Guarantee: 'CTA', Referral: 'CTA', Free: 'MOMENT', CTA: 'CTA', End: 'CTA',
};
const SCENE_ORDER = Object.keys(SCENE_STATE);

/* Theme-specific decorative objects, handed to the engine as one layer. */
const DECOR = (t, s, u) => {
  const trot = (t * 0.062) % 1, dx = -340 + trot * (W + 680);
  const bt = (t * 0.3) % 1;
  const tints = [C.accent, C.accent2, C.terraT, C.sageT, K.lighten(C.accent, 0.3), K.lighten(C.accent2, 0.24)];
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
      <g transform={`rotate(${t * 7} ${W - 260} 210)`} opacity={0.5 * s.bright}>
        <circle cx={W - 260} cy={210} r={124} fill={K.alpha(C.accent, 0.14)} />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={W - 260} y1={210 - 146} x2={W - 260} y2={210 - 168} stroke={K.alpha(C.accent, 0.24)} strokeWidth={10} strokeLinecap="round"
            transform={`rotate(${i * 30} ${W - 260} 210)`} />))}
      </g>
      {Array.from({ length: 9 }).map((_, k) => {
        const ph = (t * 0.15 * s.energy + k * 0.111) % 1;
        const col = tints[k % tints.length];
        return <g key={'pw' + k} opacity={0.3 * (1 - ph)} transform={`translate(${90 + k * 230 - ph * 90},${H - 108 + (k % 3) * 26})`}>
          <ellipse rx={15} ry={12} fill={col} />
          {[-16, -5, 6, 17].map((ox, j) => <circle key={j} cx={ox} cy={-17} r={5.4} fill={col} />)}
        </g>;
      })}
      <g transform={`translate(${bt * W},${H - 250 - Math.abs(Math.sin(bt * Math.PI * 3)) * 270}) rotate(${t * 190})`} opacity={0.7}>
        <circle r={25} fill={K.lighten(C.accent2, 0.2)} />
        <path d="M -25 0 a 25 25 0 0 1 50 0 M -25 0 a 25 25 0 0 0 50 0" fill="none" stroke={K.alpha(C.white, 0.85)} strokeWidth={4} />
      </g>
      {/* The dog walks the bottom margin: scaled and dropped so its back clears the
         content band above and its shadow clears the footnote below. */}
      <g opacity={0.96}><Figure fn={IL.dog} t={t} x={dx} y={H - 118} h={176} pose="walk" speed={s.energy} /></g>
      <Figure fn={IL.plant} t={t} x={58} y={H - 116} h={92} seed={1} />
      <Figure fn={IL.bowl} t={t} x={W - 148} y={H - 116} h={92} />
      {IL.defs()}
    </svg>);
};

const GROUND = window.BGEngine.make({
  W: W, H: H, C: C, ambient: AMB, total: 300,
  states: SCENE_STATE, order: SCENE_ORDER, fallback: 'FEATURE',
  hues: [C.accent, C.accent2, K.lighten(C.accent, 0.3), C.sageT],
  ink: C.ink, light: C.white, decor: DECOR,
});
const TAGS = ["BARKWELL · A FILM ABOUT DINNER","REAL FOOD, NAMED","FIVE INGREDIENTS ONLY","THE BOWL, EXAMINED","COOKED LOW, NOT FAST"];
const FOOTS = ["everything here was eaten","weighed before cooking, not after","no ingredient hides behind a category","the oven runs at ninety degrees","written from the ingredients panel"];
const SIDES = ["NAME · WEIGH · COOK","FIVE INGREDIENTS, NO FILLER","READ THE PANEL ALOUD"];
function Garnish() {
  const a = K.useActive();
  const i = a.index, t = a.T * ENERGY;
  /* Ink comes from the ground actually painted — a hand-typed scene list drifts
     the moment a scene's bg changes, and silently prints invisible garnish. */
  const c = K.isDark(a.bg) ? C.white : C.ink;
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 42, right: GUT, ...LBL(20, alpha(c, 0.6)), border: `2px solid ${alpha(c, 0.3)}`, borderRadius: 999, padding: '10px 26px', transform: `rotate(${Math.sin(t * 1.1 + i) * 1.4}deg)` }}>
      {TAGS[i % TAGS.length]}
    </div>
    <div style={{ position: 'absolute', bottom: 40, left: GUT, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ width: 46, height: 4, borderRadius: 999, background: C.accent }} />
      <div style={FOOT(23, alpha(c, 0.6))}>{FOOTS[i % FOOTS.length]}</div>
    </div>
    {i % 2 === 0
      ? <div style={{ position: 'absolute', left: 34, top: 340, writingMode: 'vertical-rl', transform: 'rotate(180deg)', ...LBL(17, alpha(c, 0.62)), letterSpacing: '0.34em' }}>{SIDES[(i >> 1) % SIDES.length]}</div>
      : <svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute', right: 62, bottom: 42, opacity: 0.55 }}>
          <g transform={`rotate(${t * 26} 35 35)`}>
            {[0, 1, 2, 3, 4, 5].map(k => (
              <line key={k} x1={35} y1={10} x2={35} y2={26} stroke={C.accent} strokeWidth={5} strokeLinecap="round" transform={`rotate(${k * 60} 35 35)`} />))}
          </g>
        </svg>}
  </div>;
}
const Scene = K.makeScene(TR, CAM, 2.6, null, { paint: false });

/* One background for the whole film, coloured and state-driven from whichever
   scene is under the playhead. Scenes no longer paint their own ground — the
   backdrop paints it — so nothing covers the engine and nothing doubles. */
function Backdrop() {
  const a = K.useActive();
  const bg = a.bg || C.paper;
  return <div style={{ position: 'absolute', inset: 0, background: bg }}>{GROUND(bg, a.p, a.T, a.name)}
    {/* readability wash: one instance, so background contrast behind type holds
        steady through a cut rather than doubling with the neighbouring scene */}
    <div style={{ position: 'absolute', inset: 0, background: bg, opacity: 0.34, pointerEvents: 'none' }} />
  </div>;
}

/* ---- content contract ----
   Each scene declares the fields it consumes; window.OM_CONTENT supplies them
   per scene, keyed by scene name, and anything absent falls back to the demo
   copy below. This is what makes the film a template rather than a demo: a
   generated script can populate it without touching the JSX. */
const DEMO = {
  Open: { label: 'REAL FOOD FOR DOGS', title: 'BARKWELL', body: 'A five-minute account of what is actually in the bowl.' },
  Hook: { items: ['THEY GIVE US', 'EVERYTHING.', 'WE GIVE THEM', 'KIBBLE.'] },
  Sniff: { title: 'One question, asked properly, changes the whole shelf.' },
  Portrait: { kicker: 'MEET THE CUSTOMER', title: 'HE CANNOT READ THE LABEL.', body: 'So somebody has to. This is that reading, done once, in public.' },
  Ch1: { label: '01', title: "What's in the bowl", body: 'An ingredients panel, read line by line, with nothing skipped.' },
  Label: { kicker: 'THE PANEL, AS PRINTED', items: ['Meat meal', 'Corn gluten', 'Animal digest', 'BHA (preservative)', 'Caramel colour'], label: 'FIVE LINES, FIVE PROBLEMS' },
  Stat1: { stat: 68, unit: '%', body: 'of owners cannot name the first ingredient in their dog\'s food.' },
  Quote1: { quote: '“I read the label properly once. I switched that afternoon.”', source: 'PRIYA · AND OTIS, FOUR' },
  Cost: { kicker: 'THE ANNUAL RECEIPT', rows: [['Vet visits, avoidable', '£340'], ['Food they refuse', '£120'], ['Supplements to patch it', '£85'], ['Guilt', 'daily']], title: 'ALL OF IT UPSTREAM OF THE BOWL.' },
  Turn: { items: ['SO WE COOKED', 'SOMETHING ELSE.'] },
  Ch2: { label: '02', title: 'What we make', body: 'Five ingredients, weighed before cooking, printed by percentage.' },
  Feature1: { kicker: 'FEATURE 01', title: 'MEAT YOU CAN POINT AT.', body: 'Single-source protein, cut and weighed before cooking, printed on the pack by percentage rather than by promise.', items: ['65% CHICKEN', 'BRITISH FARMS', 'NO MEAL'] },
  Feature2: { kicker: 'FEATURE 02', title: 'COOKED AT 90°, NOT 400.', body: 'Low and slow keeps the protein structure intact, so it smells like dinner instead of dust.' },
  Ch3: { label: '03', title: 'Does it work', body: 'Twelve weeks, two thousand bowls, one measurable change.' },
  Testimonial: { quote: 'HE USED TO GRAZE AT IT ALL DAY. NOW THE BOWL IS EMPTY BEFORE I PUT THE LID BACK ON.', source: 'MARCUS · AND HAZEL, A VERY FAST BEAGLE' },
  Compare: { rows: [['Named meat first', 'Meat meal, unspecified'], ['Cooked at 90°', 'Extruded at 400°'], ['Portioned per dog', 'One bag, guess the scoop'], ['Five ingredients', 'Twenty-nine']] },
  Ch4: { label: '04', title: 'Who eats with us', body: 'Two thousand households and one very large newfoundland.' },
  Founder: { kicker: 'A NOTE FROM THE KITCHEN', title: 'WE STARTED BECAUSE A BEAGLE STOPPED EATING.', body: 'Everything since — the farms, the low ovens, the paper bags — came out of that one week.' },
  Ch5: { label: '05', title: 'Come and eat', body: 'Two weeks, cancel from the doorstep.' },
  CTA: { items: ['BUILD HIS PLAN', 'IN NINETY SECONDS.'], label: 'START THE PLAN', source: 'BARKWELL.COM' },
  Stats: { rows: [['94', '%', 'finished the bowl'], ['12', 'wks', 'to a coat change'], ['3', '×', 'less waste']] },
  Recipe: { kicker: 'THE WHOLE RECIPE, NO SMALL PRINT', rows: [['CHICKEN', '65%'], ['SWEET POTATO', '14%'], ['CARROT', '9%'], ['SPINACH', '6%'], ['SALMON OIL', '4%'], ['MINERALS', '2%']] },
  Plans: { rows: [['TASTER', '£14', 'two weeks, one dog'], ['REGULAR', '£39', 'every fortnight'], ['THE PACK', '£72', 'two dogs, one box']] },
  Steps: { rows: [['TELL US THE DOG', 'age, weight, quirks'], ['WE BUILD THE PLAN', 'portioned by the gram'], ['IT ARRIVES THURSDAY', 'chilled, in paper']] },
  FAQ: { rows: [['Does it need a freezer?', 'A shelf in the fridge is enough.'], ['What if he refuses it?', 'First box is free, no form.'], ['Can I pause?', 'From the doorstep, any week.']] },
  Pillars: { rows: [['WHOLE MEAT', 'first, and named'], ['VEGETABLES', 'you could plate'], ['NOTHING ELSE', 'no filler, no dye']] },
  Vet: { quote: 'NOTHING HERE I WOULD TAKE OFF A DOG\'S PLATE.', source: 'DR ALICE VANE · VETERINARY NUTRITIONIST' },
  Free: { title: 'TRY TWO WEEKS.', body: 'Cancel from the doorstep if the bowl says no.' },
  Guarantee: { title: 'THEY LOVE IT', label: "OR IT'S FREE", body: 'First box, no argument, no form.' },
  Breeds: { items: ['WHIPPETS', 'LABRADORS', 'TERRIERS', 'COLLIES', 'RESCUES', 'PUGS', 'LURCHERS', 'NEWFOUNDLANDS'] },
  End: { title: 'BARKWELL', label: 'REAL FOOD FOR DOGS', source: 'BARKWELL.COM' },
};
const CT = window.Content.make(DEMO);

/* ---- type roles ---- */
const DISP = (s, c) => ({ fontFamily: FD, fontWeight: 400, fontSize: s, lineHeight: 1.02, letterSpacing: '-0.015em', color: c, margin: 0 });
const SUB = (s, c) => ({ fontFamily: FB, fontWeight: 600, fontSize: s, lineHeight: 1.24, color: c, margin: 0 });
const BODY = (s, c) => ({ fontFamily: FB, fontWeight: 400, fontSize: s, lineHeight: 1.5, color: c, margin: 0 });
const LBL = (s, c) => ({ fontFamily: FB, fontWeight: 800, fontSize: s, letterSpacing: '0.2em', color: c, margin: 0, textTransform: 'uppercase' });
const FOOT = (s, c) => ({ fontFamily: FB, fontWeight: 600, fontSize: s, color: c, margin: 0, fontStyle: 'italic' });
const NUM = (s, c) => ({ fontFamily: FD, fontWeight: 400, fontSize: s, lineHeight: 0.86, letterSpacing: '-0.05em', color: c, margin: 0, fontVariantNumeric: 'tabular-nums' });
const PAGE = { position: 'absolute', inset: 0, padding: `104px ${GUT}px`, boxSizing: 'border-box' };
const MID = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `104px ${GUT}px`, boxSizing: 'border-box' };

/* ---- primitives ---- */
/* Display copy follows one rule, in three cases.
   · One line (default): fitted to its measure and held on a single line.
   · A statement meant to wrap: pass `lines`, and it is fitted against the
     capacity of that many lines, then capped by the measure so it wraps there —
     it keeps its authored size instead of being crushed to fit one line.
   · A lockup of several lines: `Lockup` sizes them as a unit from the longest
     line, so adjacent lines never render at different sizes. */
function Hd({ t, size, c, max, lines = 1, style }) {
  const w = max || (W - GUT * 2);
  const s = fitText(t, size, w * lines * 0.94, FD, 400);
  return <div style={{ ...DISP(s, c || C.ink), maxWidth: w, whiteSpace: lines === 1 ? 'nowrap' : 'normal', ...style }}>{t}</div>;
}
function Lockup({ lines, size, c, cols, max, style }) {
  const w = max || (W - GUT * 2);
  const s = Math.min.apply(null, lines.map(l => fitText(l, size, w, FD, 400)));
  return <div style={style}>
    {lines.map((l, i) => (
      <div key={i} style={{ ...DISP(s, (cols && cols[i]) || c || C.ink), whiteSpace: 'nowrap' }}>{l}</div>))}
  </div>;
}
function Rule({ q = 1, w = 2, c, style }) {
  return <div style={{ height: w, background: c || C.ink, transform: `scaleX(${q})`, transformOrigin: '0 50%', ...style }} />;
}
function Slug({ t, p, d = 0, c, fg }) {
  const q = ease.back((p - d) / 0.26);
  return <div style={{ display: 'inline-block', ...LBL(23, fg || C.white), background: c || C.accent, padding: '12px 26px', borderRadius: 999, opacity: q > 0 ? 1 : 0, transform: `scale(${q}) rotate(${(1 - q) * -5}deg)` }}>{t}</div>;
}
/* grayscale image cell with a hard 2px frame */
function Img({ id, w, h, p = 1, d = 0, from = 'up', ph = 'DROP IMAGE', style }) {
  const q = ease.out((p - d) / 0.3);
  const tr = from === 'left' ? `translateX(${(1 - q) * -140}px)` : from === 'right' ? `translateX(${(1 - q) * 140}px)` : `translateY(${(1 - q) * 110}px)`;
  return <div style={{ width: w, height: h, borderRadius: 26, boxSizing: 'border-box', overflow: 'hidden', boxShadow: '0 18px 44px rgba(36,31,26,0.18)', filter: 'saturate(0.72) contrast(0.96)', opacity: q, transform: tr, ...style }}>
    <image-slot id={id} shape="rect" placeholder={ph}></image-slot>
  </div>;
}
function Cell({ children, p, d = 0, fill, line, style }) {
  const q = ease.out((p - d) / 0.26);
  return <div style={{ border: `2px solid ${line || C.ink}`, background: fill || 'transparent', boxSizing: 'border-box', padding: '26px 28px', opacity: q, transform: `translateY(${(1 - q) * 44}px)`, ...style }}>{children}</div>;
}
/* red poster divider — the one place the accent runs as a field */
function Divider({ p, n, title, deck }) {
  const q = ease.out(p / 0.34);
  const size = fitText(title, 132, W - GUT * 2, FD, 400);
  return <div style={{ position: 'absolute', inset: 0, background: C.accent }}>
    <div style={{ position: 'absolute', left: GUT, top: 150, right: GUT }}>
      <div style={{ ...NUM(220, C.white), opacity: ease.out(p / 0.26), transform: `translateY(${(1 - ease.out(p / 0.26)) * -40}px)` }}>{n}</div>
      <Rule q={q} w={4} c={C.white} style={{ margin: '30px 0 34px' }} />
      <div style={{ ...DISP(size, C.white), opacity: ease.out((p - 0.2) / 0.3) }}>{title}</div>
      {deck ? <div style={{ ...BODY(34, alpha(C.white, 0.88)), marginTop: 26, maxWidth: COL * 7, opacity: ease.out((p - 0.4) / 0.3) }}>{deck}</div> : null}
    </div>
    <div style={{ position: 'absolute', right: GUT, bottom: 130, width: 220, height: 220, border: `4px solid ${C.white}`, transform: `rotate(${(1 - q) * 40}deg)`, opacity: q }} />
  </div>;
}
/* ruled table used by several data scenes, each with a different column plan */
function Table({ rows, p, head, strike, alignR = true }) {
  return <div>
    {head ? <div style={{ display: 'flex', ...LBL(19, C.mid), paddingBottom: 12, borderBottom: `2px solid ${C.ink}` }}>
      {head.map((hd, i) => <div key={i} style={{ flex: i === 0 ? 2 : 1, textAlign: i && alignR ? 'right' : 'left' }}>{hd}</div>)}
    </div> : null}
    {rows.map((r, i) => {
      const q = ease.out(stg(p, i, 0.07, 0.26));
      const sq = strike ? ease.inOut(stg(p - 0.4, i, 0.06, 0.2)) : 0;
      return <div key={i} style={{ display: 'flex', alignItems: 'baseline', padding: '18px 0', borderBottom: `1px solid ${alpha(C.ink, 0.28)}`, opacity: q, transform: `translateX(${(1 - q) * -30}px)`, position: 'relative' }}>
        {r.map((cellv, j) => (
          <div key={j} style={{ flex: j === 0 ? 2 : 1, textAlign: j && alignR ? 'right' : 'left', ...(j === 0 ? SUB(38, C.ink) : NUM(38, j === r.length - 1 ? C.accent : C.ink)) }}>{cellv}</div>))}
        {strike ? <div style={{ position: 'absolute', left: 0, top: '52%', height: 3, background: C.accent, width: '100%', transform: `scaleX(${sq})`, transformOrigin: '0 50%' }} /> : null}
      </div>;
    })}
  </div>;
}

function Film() {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, fontFamily: FB }}>
      <Backdrop />

      {/* ===== OPENING ===== */}
      <Scene name="Open" bg={C.paper} wipe="columns" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Rule q={ease.out(p / 0.22)} w={4} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 22 }}>
            <div style={LBL(22, C.mid)}>NO. 01</div>
            <div style={LBL(22, C.mid)}>{CT.of('Open').label('REAL FOOD FOR DOGS')}</div>
          </div>
          <div style={{ marginTop: 30 }}>
            <Chars t={CT.of('Open').title('BARKWELL')} p={p} d={0.16} size={CT.fit(CT.of('Open').title('BARKWELL'), 300, W - GUT * 2, FD, 400)} color={C.ink} font={FD} mode="drop" per={0.035} style={{ letterSpacing: '-0.02em' }} />
          </div>
          <Rule q={ease.out((p - 0.4) / 0.26)} w={4} style={{ marginTop: 26 }} />
          <div style={{ display: 'flex', gap: 40, marginTop: 26, opacity: ease.out((p - 0.55) / 0.3) }}>
            <div style={{ width: 22, height: 22, background: C.accent, flex: 'none', marginTop: 8 }} />
            <div style={{ ...SUB(38, C.ink), maxWidth: COL * 6 }}>{CT.of('Open').body('A five-minute account of what is actually in the bowl.')}</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Hook" bg={C.paper} wipe="bars" wipeColor={C.accent}>{(p) => {
        const cols = [[C.ink, C.paper], [C.paper, C.ink], [C.ink, C.paper], [C.paper, C.accent]];
        const lines = CT.of('Hook').items(['THEY GIVE US', 'EVERYTHING.', 'WE GIVE THEM', 'KIBBLE.'], 4)
          .map((txt, i) => [txt, cols[i % 4][0], cols[i % 4][1]]);
        return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {lines.map(([txt, fg, bgc], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ background: bgc, overflow: 'hidden', transform: `scaleY(${q})`, transformOrigin: '50% 100%' }}>
              <div style={{ ...DISP(CT.fit(txt, 132, W - GUT * 2, FD, 400), fg), padding: `18px ${GUT}px`, opacity: q }}>{txt}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Sniff" bg={C.paper} wipe="blockOut" wipeColor={C.ink}>{(p, lt) => (
        <div style={{ ...MID, flexDirection: 'row', alignItems: 'center', gap: 70 }}>
          <div style={NUM(420, C.accent)}>1</div>
          <div style={{ flex: 1 }}>
            <Rule q={ease.out(p / 0.3)} w={2} style={{ marginBottom: 26 }} />
            <div style={{ minHeight: 200 }}>
              <Typed t={CT.of('Sniff').title('One question, asked properly, changes the whole shelf.')} p={p} lt={lt} dur={0.55} caretColor={C.accent} style={{ ...DISP(76, C.ink), maxWidth: COL * 8 }} />
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Portrait" bg={C.paper} wipe="split" wipeColor={C.near}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', gap: 60, alignItems: 'stretch' }}>
          <Img id="pet-hero" w={COL * 5} h={780} p={p} from="left" ph="DROP HERO PORTRAIT" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <Slug t={CT.of('Portrait').kicker('MEET THE CUSTOMER')} p={p} d={0.15} />
            <Hd t={CT.of('Portrait').title('HE CANNOT READ THE LABEL.')} max={COL * 6} size={96} lines={2} style={{ marginTop: 24 }} />
            <Rule q={ease.out((p - 0.45) / 0.3)} w={4} c={C.accent} style={{ margin: '28px 0' }} />
            <div style={{ ...BODY(38, C.ink), maxWidth: COL * 5 }}>{CT.of('Portrait').body('So somebody has to. This is that reading, done once, in public.')}</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 01 ===== */}
      <Scene name="Ch1" bg={C.accent} wipe="columns" wipeColor={C.paper}>{(p) => <Divider p={p} n={CT.of('Ch1').label('01')} title={CT.of('Ch1').title("What's in the bowl")} deck={CT.of('Ch1').body('An ingredients panel, read line by line, with nothing skipped.')} />}</Scene>

      <Scene name="Label" bg={C.paper} wipe="bars" wipeColor={C.ink}>{(p) => (
        <div style={{ ...MID }}>
          <Slug t={CT.of('Label').kicker('THE PANEL, AS PRINTED')} p={p} />
          <div style={{ marginTop: 34 }}>
            <Table p={p} strike alignR={false} rows={CT.of('Label').items(['Meat meal', 'Corn gluten', 'Animal digest', 'BHA (preservative)', 'Caramel colour'], 6).map(x => [x])} />
          </div>
          <div style={{ ...LBL(21, C.accent), marginTop: 26, opacity: ease.out((p - 0.7) / 0.24) }}>{CT.of('Label').label('FIVE LINES, FIVE PROBLEMS')}</div>
        </div>)}
      </Scene>

      <Scene name="Stat1" bg={C.near} wipe="cut" wipeColor={C.accent}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: GUT + i * COL, top: 0, bottom: 0, width: 1, background: alpha(C.white, 0.1) }} />))}
          <div style={{ ...MID }}>
            <div style={{ ...NUM(400, C.white), display: 'flex', alignItems: 'baseline' }}>
              <Counter target={CT.of('Stat1').stat(68)} p={p} dur={0.5} /><span style={{ ...NUM(200, C.accent) }}>{CT.of('Stat1').unit('%')}</span>
            </div>
            <Rule q={ease.out((p - 0.4) / 0.3)} w={4} c={C.accent} style={{ margin: '30px 0 26px' }} />
            <div style={{ ...SUB(44, C.white), maxWidth: COL * 7 }}>{CT.of('Stat1').body("of owners cannot name the first ingredient in their dog's food.")}</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Quote1" bg={C.paper} wipe="blockOut" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <div style={{ border: `4px solid ${C.ink}`, borderRadius: 28, padding: '54px 60px', transform: `scaleY(${ease.out(p / 0.28)})`, transformOrigin: '50% 0' }}>
            <Words t={CT.of('Quote1').quote('“I read the label properly once. I switched that afternoon.”')} p={p} d={0.18} per={0.05} dy={30} style={DISP(CT.fit(CT.of('Quote1').quote(''), 74, COL * 9, FD, 400, 3), C.ink)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 30, opacity: ease.out((p - 0.66) / 0.24) }}>
            <div style={{ width: 40, height: 2, background: C.accent }} />
            <span style={LBL(24, C.mid)}>{CT.of('Quote1').source('PRIYA · AND OTIS, FOUR')}</span>
          </div>
        </div>)}
      </Scene>

      <Scene name="Timeline" bg={C.paper} wipe="split" wipeColor={C.ink}>{(p) => {
        const stops = [['1974', 'Extrusion arrives'], ['1990s', 'Shelf life wins'], ['2010s', 'Marketing wins'], ['TODAY', 'Nobody checks']];
        const q = ease.inOut(p / 0.66);
        return <div style={MID}>
          <Hd t="HOW THE BOWL GOT WORSE" size={76} c={C.ink} style={{ marginBottom: 80 }} />
          <div style={{ position: 'relative', height: 230 }}>
            <Rule q={q} w={2} style={{ width: COL * 11 }} />
            {stops.map(([y, l], i) => {
              const at = i / (stops.length - 1), vis = ease.out((q - at) / 0.16);
              const last = i === 3;
              return <div key={i} style={{ position: 'absolute', left: at * (COL * 11 - 10), top: -18, opacity: vis, transform: `translateY(${(1 - vis) * 20}px)` }}>
                <div style={{ width: last ? 26 : 18, height: last ? 26 : 18, background: last ? C.accent : C.ink, marginBottom: 26 }} />
                <div style={NUM(52, C.ink)}>{y}</div>
                <div style={{ ...BODY(26, C.mid), maxWidth: 210, marginTop: 6 }}>{l}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Cost" bg={C.paper} wipe="bars" wipeColor={C.grey}>{(p) => (
        <div style={MID}>
          <Slug t={CT.of('Cost').kicker('THE ANNUAL RECEIPT')} p={p} c={C.ink} />
          <div style={{ marginTop: 30 }}>
            <Table p={p} head={['ITEM', 'COST']} rows={CT.of('Cost').rows([['Vet visits, avoidable', '£340'], ['Food they refuse', '£120'], ['Supplements to patch it', '£85'], ['Guilt', 'daily']], 5)} />
          </div>
          <Hd t={CT.of('Cost').title('ALL OF IT UPSTREAM OF THE BOWL.')} size={64} c={C.accent} lines={2} style={{ marginTop: 34, opacity: ease.out((p - 0.66) / 0.26) }} />
        </div>)}
      </Scene>

      <Scene name="Turn" bg={C.accent} wipe="cut" wipeColor={C.near}>{(p) => (
        <div style={MID}>
          {CT.of('Turn').items(['SO WE COOKED', 'SOMETHING ELSE.'], 2).map((l, i) => (
            <Chars key={i} t={l} p={p} d={i * 0.25} size={CT.fit(l, 150, W - GUT * 2, FD, 400)} color={i ? C.near : C.white} font={FD} mode="rise" per={0.03} style={{ letterSpacing: '-0.02em' }} />))}
        </div>)}
      </Scene>

      {/* ===== 02 ===== */}
      <Scene name="Ch2" bg={C.accent} wipe="bars" wipeColor={C.paper}>{(p) => <Divider p={p} n={CT.of('Ch2').label('02')} title={CT.of('Ch2').title('What we make')} deck={CT.of('Ch2').body('Five ingredients, weighed before cooking, printed by percentage.')} />}</Scene>

      <Scene name="Pillars" bg={C.paper} wipe="columns" wipeColor={C.ink}>{(p) => {
        const skin = [[C.ink, C.paper], [C.accent, C.white], [C.near, C.paper]];
        const cols = CT.of('Pillars').rows([['WHOLE MEAT', 'first, and named'], ['VEGETABLES', 'you could plate'], ['NOTHING ELSE', 'no filler, no dye']], 3)
          .map(([t2, s2], i) => [t2, s2, skin[i % 3][0], skin[i % 3][1]]);
        return <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {cols.map(([t2, s2, bgc, fg], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.3));
            return <div key={i} style={{ flex: 1, background: bgc, transform: `translateY(${(1 - q) * (i % 2 ? 101 : -101)}%)`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 54, boxSizing: 'border-box' }}>
              <div style={NUM(120, alpha(fg, 0.45))}>{'0' + (i + 1)}</div>
              <div style={{ ...DISP(58, fg), marginTop: 20 }}>{t2}</div>
              <div style={{ ...BODY(30, alpha(fg, 0.82)), marginTop: 10 }}>{s2}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="WeighIn" bg={C.paper} wipe="split" wipeColor={C.accent}>{(p) => {
        const bars = [['CHICKEN', 65], ['SWEET POTATO', 14], ['CARROT', 9], ['SPINACH', 6], ['SALMON OIL', 4], ['MINERALS', 2]];
        const q = ease.inOut(p / 0.62);
        return <div style={MID}>
          <Hd t="WEIGHED, THEN PRINTED" size={72} c={C.ink} style={{ marginBottom: 40 }} />
          {bars.map(([n, v], i) => {
            const vis = ease.out(stg(p, i, 0.06, 0.24));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14, opacity: vis }}>
              <span style={{ ...LBL(20, C.mid), width: 250 }}>{n}</span>
              <div style={{ flex: 1, height: 34 }}>
                <div style={{ height: 34, width: `${v * q}%`, background: i === 0 ? C.accent : C.ink }} />
              </div>
              <span style={{ ...NUM(34, C.ink), width: 100, textAlign: 'right' }}>{Math.round(v * q)}%</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Feature1" bg={C.paper} wipe="blockOut" wipeColor={C.ink}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', gap: 60, alignItems: 'center' }}>
          <div style={{ flex: '0 0 ' + COL * 5 + 'px' }}>
            <Slug t={CT.of('Feature1').kicker('FEATURE 01')} p={p} />
            <Hd t={CT.of('Feature1').title('MEAT YOU CAN POINT AT.')} max={COL * 5} size={84} lines={2} style={{ marginTop: 22 }} />
            <div style={{ ...BODY(34, C.mid), marginTop: 22 }}>{CT.of('Feature1').body('Single-source protein, cut and weighed before cooking, printed on the pack by percentage rather than by promise.')}</div>
            <div style={{ display: 'flex', gap: 0, marginTop: 30, border: `2px solid ${C.ink}`, borderRadius: 24 }}>
              {CT.of('Feature1').items(['65% CHICKEN', 'BRITISH FARMS', 'NO MEAL'], 3).map((c, i) => {
                const q = ease.out(stg(p - 0.4, i, 0.07, 0.2));
                return <div key={i} style={{ ...LBL(18, i === 1 ? C.white : C.ink), background: i === 1 ? C.accent : 'transparent', padding: '14px 20px', borderRight: i < 2 ? `2px solid ${C.ink}` : 'none', opacity: q }}>{c}</div>;
              })}
            </div>
          </div>
          <Img id="pet-feat-1" w={COL * 6} h={700} p={p} d={0.15} from="right" />
        </div>)}
      </Scene>

      <Scene name="Farms" bg={C.near} wipe="cut" wipeColor={C.paper}>{(p) => {
        const pins = [[420, 380], [640, 560], [880, 300], [1100, 620], [1340, 420], [760, 760], [1180, 200]];
        return <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: GUT + i * COL, top: 0, bottom: 0, width: 1, background: alpha(C.white, 0.08) }} />))}
          {pins.map(([x, y], i) => {
            const q = ease.out(stg(p, i, 0.07, 0.24));
            return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 20, height: 20, background: i === 0 ? C.accent : C.white, opacity: q, transform: `scale(${q})` }} />;
          })}
          <div style={{ position: 'absolute', left: GUT, bottom: 130 }}>
            <div style={NUM(150, C.white)}><Counter target={7} p={p} dur={0.4} /></div>
            <div style={{ ...LBL(22, C.accent), marginTop: 14 }}>FARMS · ALL WITHIN 180 MILES</div>
          </div>
        </div>;
      }}</Scene>

      <Scene name="Sourcing" bg={C.paper} wipe="columns" wipeColor={C.grey}>{(p) => {
        const steps = ['FARM', 'CUT', 'WEIGH', 'COOK', 'PACK'];
        return <div style={MID}>
          <Slug t="FIVE HANDS, END TO END" p={p} />
          <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 46 }}>
            {steps.map((s, i) => {
              const q = ease.out(stg(p, i, 0.09, 0.26));
              return <React.Fragment key={i}>
                <div style={{ flex: 1, border: `2px solid ${C.ink}`, borderRadius: 24, background: i === 4 ? C.accent : 'transparent', padding: '38px 20px', textAlign: 'center', opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
                  <div style={NUM(46, i === 4 ? C.white : C.ink)}>{'0' + (i + 1)}</div>
                  <div style={{ ...LBL(20, i === 4 ? C.white : C.ink), marginTop: 14 }}>{s}</div>
                </div>
                {i < 4 ? <div style={{ width: 46, display: 'grid', placeItems: 'center', opacity: q }}><div style={{ width: 46, height: 2, background: C.ink }} /></div> : null}
              </React.Fragment>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Feature2" bg={C.near} wipe="bars" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <Slug t={CT.of('Feature2').kicker('FEATURE 02')} p={p} />
          <Hd t={CT.of('Feature2').title('COOKED AT 90°, NOT 400.')} size={140} c={C.white} lines={2} style={{ marginTop: 24 }} />
          <Rule q={ease.out((p - 0.4) / 0.3)} w={4} c={C.accent} style={{ margin: '32px 0 26px' }} />
          <div style={{ display: 'flex', gap: 70 }}>
            {[['90°', 'our oven'], ['400°', 'an extruder'], ['4h', 'not four seconds']].map(([n, l], i) => {
              const q = ease.out(stg(p - 0.4, i, 0.09, 0.26));
              return <div key={i} style={{ opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
                <div style={NUM(96, i === 1 ? C.grey : C.accent)}>{n}</div>
                <div style={{ ...LBL(19, alpha(C.white, 0.7)), marginTop: 12 }}>{l}</div>
              </div>;
            })}
          </div>
        </div>)}
      </Scene>

      <Scene name="Kitchen" bg={C.paper} wipe="split" wipeColor={C.ink}>{(p) => {
        const steps = [['06:00', 'Meat arrives whole'], ['08:20', 'Cut and weighed'], ['11:00', 'Ninety degrees, four hours'], ['16:40', 'Chilled and packed']];
        return <div style={{ ...PAGE, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Hd t="THE KITCHEN, TUESDAY" size={64} />
            <div style={LBL(20, C.mid)}>ONE SHIFT</div>
          </div>
          <Rule q={ease.out(p / 0.26)} w={2} style={{ margin: '22px 0 26px' }} />
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `2px solid ${C.ink}`, borderRadius: 24 }}>
            {steps.map(([t2, s2], i) => {
              const q = ease.out(stg(p, i, 0.09, 0.26));
              return <div key={i} style={{ padding: '38px 30px', borderRight: i < 3 ? `2px solid ${C.ink}` : 'none', opacity: q, transform: `translateY(${(1 - q) * 40}px)`, background: i === 2 ? C.accent : 'transparent' }}>
                <div style={NUM(72, i === 2 ? C.white : C.accent)}>{t2}</div>
                <Rule q={q} w={2} c={i === 2 ? C.white : C.ink} style={{ margin: '22px 0 18px' }} />
                <div style={SUB(32, i === 2 ? C.white : C.ink)}>{s2}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Texture" bg={C.near} wipe="cut" wipeColor={C.paper}>{(p) => (
        <div style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: GUT + i * COL, top: 0, bottom: 0, width: 1, background: alpha(C.white, 0.09) }} />))}
          <div style={{ ...MID }}>
            <Hd t="YOU CAN SEE THE CARROT." size={150} c={C.white} lines={2} />
            <Rule q={ease.out((p - 0.35) / 0.3)} w={4} c={C.accent} style={{ margin: '34px 0 24px' }} />
            <div style={{ ...BODY(36, alpha(C.white, 0.7)), maxWidth: COL * 6 }}>Nothing is milled to powder, so nothing has to be described on the back of the pack.</div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Feature3" bg={C.paper} wipe="columns" wipeColor={C.accent}>{(p) => {
        const bowls = [['PUPPY', '3 meals', '210g'], ['ADULT', '2 meals', '340g'], ['SENIOR', '2, softer', '290g']];
        return <div style={MID}>
          <Hd t="PORTIONED FOR THE DOG IN FRONT OF YOU" size={72} lines={2} style={{ marginBottom: 44 }} />
          <div style={{ display: 'flex', border: `2px solid ${C.ink}`, borderRadius: 24 }}>
            {bowls.map(([t2, s2, g], i) => {
              const q = ease.out(stg(p, i, 0.1, 0.28));
              return <div key={i} style={{ flex: 1, padding: '44px 36px', borderRight: i < 2 ? `2px solid ${C.ink}` : 'none', opacity: q, transform: `translateY(${(1 - q) * 50}px)` }}>
                <div style={LBL(20, C.mid)}>{t2}</div>
                <div style={{ ...NUM(110, C.ink), marginTop: 16 }}>{g}</div>
                <div style={{ ...LBL(20, C.accent), marginTop: 14 }}>{s2}</div>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Steps" bg={C.paper} wipe="bars" wipeColor={C.ink}>{(p) => {
        const steps = CT.of('Steps').rows([['TELL US THE DOG', 'age, weight, quirks'], ['WE BUILD THE PLAN', 'portioned by the gram'], ['IT ARRIVES THURSDAY', 'chilled, in paper']], 3);
        return <div style={MID}>
          {steps.map(([t2, s2], i) => {
            const q = ease.out(stg(p, i, 0.11, 0.3));
            return <div key={i} style={{ display: 'flex', gap: 46, alignItems: 'baseline', padding: '32px 0', borderTop: `2px solid ${C.ink}`, opacity: q, transform: `translateX(${(1 - q) * -50}px)` }}>
              <div style={{ ...NUM(110, C.accent), width: 170 }}>{'0' + (i + 1)}</div>
              <div style={{ flex: 1 }}>
                <div style={DISP(62, C.ink)}>{t2}</div>
                <div style={{ ...BODY(30, C.mid), marginTop: 8 }}>{s2}</div>
              </div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Recipe" bg={C.paper} wipe="split" wipeColor={C.grey}>{(p) => (
        <div style={MID}>
          <Slug t={CT.of('Recipe').kicker('THE WHOLE RECIPE, NO SMALL PRINT')} p={p} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 34, border: `2px solid ${C.ink}`, borderRadius: 24 }}>
            {CT.of('Recipe').rows([['CHICKEN', '65%'], ['SWEET POTATO', '14%'], ['CARROT', '9%'], ['SPINACH', '6%'], ['SALMON OIL', '4%'], ['MINERALS', '2%']], 6).map(([k, v], i) => {
              const q = ease.out(stg(p, i, 0.06, 0.22));
              return <div key={i} style={{ padding: '30px 32px', borderRight: (i % 3) < 2 ? `2px solid ${C.ink}` : 'none', borderBottom: i < 3 ? `2px solid ${C.ink}` : 'none', opacity: q, background: i === 0 ? C.accent : 'transparent' }}>
                <div style={LBL(19, i === 0 ? C.white : C.mid)}>{k}</div>
                <div style={{ ...NUM(70, i === 0 ? C.white : C.ink), marginTop: 10 }}>{v}</div>
              </div>;
            })}
          </div>
        </div>)}
      </Scene>

      <Scene name="Packaging" bg={C.paper} wipe="blockOut" wipeColor={C.near}>{(p) => (
        <div style={MID}>
          <Slug t="WHAT THE PACK TELLS YOU" p={p} />
          <div style={{ marginTop: 34 }}>
            {[['Percentages', 'on the front, not the back'], ['Batch and farm', 'printed, not looked up'], ['Paper', 'not plastic'], ['Kerbside', 'recyclable everywhere']].map(([k, v], i) => {
              const q = ease.out(stg(p, i, 0.09, 0.26));
              return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 40, padding: '26px 0', borderBottom: `2px solid ${C.ink}`, opacity: q, transform: `translateX(${(1 - q) * -44}px)` }}>
                <div style={{ width: 60, height: 2, background: C.accent, alignSelf: 'center' }} />
                <div style={{ ...DISP(58, C.ink), flex: 'none' }}>{k}</div>
                <div style={{ ...BODY(32, C.mid) }}>{v}</div>
              </div>;
            })}
          </div>
        </div>)}
      </Scene>

      <Scene name="Vet" bg={C.accent} wipe="cut" wipeColor={C.paper}>{(p) => (
        <div style={MID}>
          <div style={{ ...NUM(200, alpha(C.white, 0.5)), lineHeight: 0.5 }}>“</div>
          <div style={{ ...DISP(96, C.white), marginTop: 34, maxWidth: COL * 10 }}>
            <Words t={CT.of('Vet').quote("NOTHING HERE I WOULD TAKE OFF A DOG'S PLATE.")} p={p} d={0.16} per={0.045} dy={30} />
          </div>
          <Rule q={ease.out((p - 0.6) / 0.28)} w={4} c={C.near} style={{ margin: '34px 0 18px', width: COL * 5 }} />
          <div style={{ ...LBL(22, C.near), opacity: ease.out((p - 0.7) / 0.24) }}>{CT.of('Vet').source('DR ALICE VANE · VETERINARY NUTRITIONIST')}</div>
        </div>)}
      </Scene>

      {/* ===== 03 ===== */}
      <Scene name="Ch3" bg={C.accent} wipe="columns" wipeColor={C.paper}>{(p) => <Divider p={p} n={CT.of('Ch3').label('03')} title={CT.of('Ch3').title('Does it work')} deck={CT.of('Ch3').body('Twelve weeks, two thousand bowls, one measurable change.')} />}</Scene>

      <Scene name="Stats" bg={C.paper} wipe="bars" wipeColor={C.ink}>{(p) => {
        const cols = CT.of('Stats').rows([['94', '%', 'finished the bowl'], ['12', 'wks', 'to a coat change'], ['3', '×', 'less waste']], 3)
          .map(([n, sfx, lbl]) => [parseFloat(n) || 0, sfx, lbl]);
        return <div style={{ ...MID, flexDirection: 'row', gap: 0, border: `2px solid ${C.ink}`, borderRadius: 24 }}>
          {cols.map(([n, sfx, lbl], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ flex: 1, padding: '54px 40px', borderRight: i < 2 ? `2px solid ${C.ink}` : 'none', background: i === 0 ? C.accent : 'transparent', opacity: q }}>
              <div style={{ ...NUM(150, i === 0 ? C.white : C.ink), whiteSpace: 'nowrap' }}>
                <Counter target={n} p={p} d={i * 0.1} dur={0.42} /><span style={{ fontSize: 64 }}>{sfx}</span>
              </div>
              <div style={{ ...LBL(20, i === 0 ? C.white : C.mid), marginTop: 22 }}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Coat" bg={C.paper} wipe="split" wipeColor={C.accent}>{(p) => {
        const pts = [0.2, 0.24, 0.31, 0.42, 0.55, 0.68, 0.79, 0.88];
        const q = ease.inOut(p / 0.66);
        const shown = Math.max(2, Math.ceil(q * pts.length));
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: GUT, top: 130 }}>
            <div style={DISP(70, C.ink)}>COAT CONDITION SCORE</div>
            <div style={{ ...LBL(20, C.mid), marginTop: 14 }}>WEEK 1 TO WEEK 12 · VET ASSESSED</div>
          </div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <polyline points={pts.slice(0, shown).map((v, i) => `${GUT + i * (COL * 11 / 7)},${H - 200 - v * 480}`).join(' ')} fill="none" stroke={C.accent} strokeWidth={5} />
            {pts.slice(0, shown).map((v, i) => <rect key={i} x={GUT + i * (COL * 11 / 7) - 7} y={H - 207 - v * 480} width={14} height={14} fill={C.ink} />)}
            <line x1={GUT} y1={H - 200} x2={GUT + COL * 11} y2={H - 200} stroke={C.ink} strokeWidth={2} />
          </svg>
        </div>;
      }}</Scene>

      <Scene name="Energy" bg={C.paper} wipe="columns" wipeColor={C.grey}>{(p) => {
        const q = ease.inOut(p / 0.62);
        const rows = [['Before', 0.42, C.grey], ['Week 4', 0.61, C.mid], ['Week 8', 0.78, C.ink], ['Week 12', 0.94, C.accent]];
        return <div style={MID}>
          <Hd t="WALKS COMPLETED, UNPROMPTED" size={70} c={C.ink} style={{ marginBottom: 44 }} />
          {rows.map(([k, v, col], i) => {
            const vis = ease.out(stg(p, i, 0.08, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, marginBottom: 20, opacity: vis }}>
              <span style={{ ...LBL(20, C.mid), width: 190 }}>{k}</span>
              <div style={{ flex: 1, height: 58 }}><div style={{ height: 58, width: `${v * 100 * q}%`, background: col }} /></div>
              <span style={{ ...NUM(40, col), width: 110, textAlign: 'right' }}>{Math.round(v * 100 * q)}%</span>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Sleep" bg={C.near} wipe="cut" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <Hd t="NIGHTS SLEPT THROUGH · 28" size={66} c={C.white} style={{ marginBottom: 40 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 12 }}>
            {Array.from({ length: 28 }).map((_, i) => {
              const q = ease.out(stg(p, i, 0.016, 0.2));
              const bad = [2, 9, 17].includes(i);
              return <div key={i} style={{ height: 76, background: bad ? C.accent : alpha(C.white, 0.85), opacity: q, transform: `scale(${q})` }} />;
            })}
          </div>
          <div style={{ ...LBL(20, alpha(C.white, 0.6)), marginTop: 26 }}>RED MEANS DISTURBED · THREE IN TWENTY-EIGHT</div>
        </div>)}
      </Scene>

      <Scene name="BeforeAfter" bg={C.paper} wipe="blockOut" wipeColor={C.ink}>{(p) => {
        const rows = [['Bowl finished', 'Left half full', '94%'], ['Coat score', '2 of 5', '4 of 5'], ['Night waking', 'Most nights', '3 in 28'], ['Vet flags', 'Two', 'None']];
        return <div style={MID}>
          <div style={{ display: 'flex', ...LBL(20, C.mid), paddingBottom: 14, borderBottom: `2px solid ${C.ink}` }}>
            <div style={{ flex: 2 }}>MEASURE</div><div style={{ flex: 1 }}>WEEK 1</div><div style={{ flex: 1, color: C.accent }}>WEEK 12</div>
          </div>
          {rows.map(([k, a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', alignItems: 'baseline', padding: '28px 0', borderBottom: `1px solid ${alpha(C.ink, 0.28)}`, opacity: q, transform: `translateY(${(1 - q) * 26}px)` }}>
              <div style={{ flex: 2, ...SUB(38, C.ink) }}>{k}</div>
              <div style={{ flex: 1, ...BODY(38, C.grey) }}>{a}</div>
              <div style={{ flex: 1, ...NUM(46, C.accent) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Testimonial" bg={C.paper} wipe="split" wipeColor={C.near}>{(p) => (
        <div style={MID}>
          <div style={{ ...NUM(200, C.accent), lineHeight: 0.5, opacity: ease.out(p / 0.24) }}>“</div>
          <div style={{ ...DISP(80, C.ink), marginTop: 30, maxWidth: COL * 10 }}>
            <Words t={CT.of('Testimonial').quote('HE USED TO GRAZE AT IT ALL DAY. NOW THE BOWL IS EMPTY BEFORE I PUT THE LID BACK ON.')} p={p} d={0.18} per={0.035} dy={30} />
          </div>
          <Rule q={ease.out((p - 0.6) / 0.28)} w={2} style={{ margin: '34px 0 18px' }} />
          <div style={{ ...LBL(22, C.mid), opacity: ease.out((p - 0.7) / 0.22) }}>{CT.of('Testimonial').source('MARCUS · AND HAZEL, A VERY FAST BEAGLE')}</div>
        </div>)}
      </Scene>

      <Scene name="Reviews" bg={C.accent} wipe="columns" wipeColor={C.paper}>{(p) => (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <Marquee items={['EMPTY BOWL, EVERY TIME', 'THE COAT, HONESTLY', 'SHE HEARS THE PAPER', 'NO MORE SCRAPING']} T={T} speed={130} size={64} style={{ top: 210, ...DISP(64, alpha(C.white, 0.42)) }} />
          <Marquee items={['SWITCHED ALL THREE DOGS', 'VET ASKED WHAT CHANGED', 'WORTH EVERY PENNY']} T={T} speed={104} dir={-1} size={64} style={{ bottom: 220, ...DISP(64, alpha(C.near, 0.32)) }} />
          <div style={{ ...MID, alignItems: 'flex-start' }}>
            <div style={{ background: C.accent, padding: '10px 0' }}>
              <div style={NUM(180, C.white)}><Counter target={11406} p={p} dur={0.55} /></div>
              <div style={{ ...LBL(24, C.near), marginTop: 16 }}>FIVE-STAR BOWLS</div>
            </div>
          </div>
        </div>)}
      </Scene>

      <Scene name="Compare" bg={C.paper} wipe="bars" wipeColor={C.grey}>{(p) => {
        const rows = CT.of('Compare').rows([['Named meat first', 'Meat meal, unspecified'], ['Cooked at 90°', 'Extruded at 400°'], ['Portioned per dog', 'One bag, guess the scoop'], ['Five ingredients', 'Twenty-nine']], 5);
        return <div style={MID}>
          <div style={{ display: 'flex', ...LBL(20, C.mid), paddingBottom: 14, borderBottom: `2px solid ${C.ink}` }}>
            <div style={{ flex: 1, color: C.accent }}>BARKWELL</div><div style={{ flex: 1 }}>THE SUPERMARKET BAG</div>
          </div>
          {rows.map(([a, b], i) => {
            const q = ease.out(stg(p, i, 0.09, 0.26));
            return <div key={i} style={{ display: 'flex', padding: '26px 0', borderBottom: `1px solid ${alpha(C.ink, 0.28)}`, opacity: q, transform: `translateY(${(1 - q) * 26}px)` }}>
              <div style={{ flex: 1, ...SUB(38, C.ink) }}>{a}</div>
              <div style={{ flex: 1, ...BODY(38, C.grey) }}>{b}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Awards" bg={C.paper} wipe="split" wipeColor={C.ink}>{(p) => (
        <div style={MID}>
          <Slug t="ON THE RECORD" p={p} />
          <div style={{ display: 'flex', marginTop: 34, border: `2px solid ${C.ink}`, borderRadius: 24 }}>
            {[['“The clearest label on the shelf.”', 'THE GROCER'], ['“Five ingredients, all of them food.”', 'PET WEEKLY'], ['“A vet could read it aloud.”', 'VETERINARY REVIEW']].map(([q2, src], i) => {
              const q = ease.out(stg(p, i, 0.1, 0.28));
              return <div key={i} style={{ flex: 1, padding: '40px 34px', borderRight: i < 2 ? `2px solid ${C.ink}` : 'none', opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
                <div style={{ ...SUB(38, C.ink) }}>{q2}</div>
                <div style={{ ...LBL(19, C.accent), marginTop: 24 }}>{src}</div>
              </div>;
            })}
          </div>
        </div>)}
      </Scene>

      {/* ===== 04 ===== */}
      <Scene name="Ch4" bg={C.accent} wipe="bars" wipeColor={C.paper}>{(p) => <Divider p={p} n={CT.of('Ch4').label('04')} title={CT.of('Ch4').title('Who eats with us')} deck={CT.of('Ch4').body('Two thousand households and one very large newfoundland.')} />}</Scene>

      <Scene name="Montage" bg={C.paper} wipe="columns" wipeColor={C.near}>{(p) => (
        <div style={{ ...MID, flexDirection: 'row', gap: 0, border: `2px solid ${C.ink}`, borderRadius: 24 }}>
          {[[2000, '', 'households', C.paper, C.ink], [1, 'recipe book', '', C.accent, C.white]].map(([n, sfx, lbl, bgc, fg], i) => {
            const q = ease.out(stg(p, i, 0.12, 0.3));
            return <div key={i} style={{ flex: 1, background: bgc, padding: '70px 46px', borderRight: i === 0 ? `2px solid ${C.ink}` : 'none', opacity: q, transform: `translateY(${(1 - q) * 60}px)` }}>
              <div style={{ ...NUM(190, fg), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.12} dur={0.45} /></div>
              <Rule q={ease.out((p - 0.35) / 0.3)} w={2} c={i ? C.white : C.accent} style={{ margin: '26px 0 18px' }} />
              <div style={LBL(22, i ? alpha(C.white, 0.85) : C.mid)}>{sfx || lbl}</div>
            </div>;
          })}
        </div>)}
      </Scene>

      <Scene name="Breeds" bg={C.near} wipe="cut" wipeColor={C.paper}>{(p) => {
        const tags = CT.of('Breeds').items(['WHIPPETS', 'LABRADORS', 'TERRIERS', 'COLLIES', 'RESCUES', 'PUGS', 'LURCHERS', 'NEWFOUNDLANDS'], 8);
        return <div style={MID}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 60 }}>
            {tags.map((t2, i) => {
              const q = ease.out(stg(p, i, 0.06, 0.24));
              return <div key={i} style={{ ...DISP(72, i % 3 === 0 ? C.accent : C.white), padding: '14px 0', borderBottom: `1px solid ${alpha(C.white, 0.2)}`, opacity: q, transform: `translateX(${(1 - q) * -30}px)` }}>{t2}</div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Team" bg={C.paper} wipe="blockOut" wipeColor={C.accent}>{(p) => {
        const who = [['Ada', 'kitchen'], ['Ravi', 'sourcing'], ['Nell', 'nutrition'], ['Tom', 'packing'], ['Iris', 'the vans'], ['Sam', 'the phones'], ['Joy', 'the books'], ['Kit', 'the dogs']];
        return <div style={MID}>
          <Hd t="NINE PEOPLE, ONE KITCHEN" size={66} style={{ marginBottom: 32 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 60 }}>
            {who.map(([n, r], i) => {
              const q = ease.out(stg(p, i, 0.06, 0.24));
              return <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '18px 0', borderBottom: `1px solid ${alpha(C.ink, 0.28)}`, opacity: q, transform: `translateX(${(1 - q) * -26}px)` }}>
                <span style={{ ...DISP(46, C.ink) }}>{n}</span>
                <span style={{ ...LBL(19, C.accent) }}>{r}</span>
              </div>;
            })}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Plans" bg={C.paper} wipe="split" wipeColor={C.ink}>{(p) => {
        const plans = CT.of('Plans').rows([['TASTER', '£14', 'two weeks, one dog'], ['REGULAR', '£39', 'every fortnight'], ['THE PACK', '£72', 'two dogs, one box']], 3);
        return <div style={{ ...MID, flexDirection: 'row', gap: 0, border: `2px solid ${C.ink}`, borderRadius: 24, alignItems: 'stretch' }}>
          {plans.map(([n, price, sub], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28)); const hero = i === 1;
            return <div key={i} style={{ flex: 1, padding: '54px 40px', borderRight: i < 2 ? `2px solid ${C.ink}` : 'none', background: hero ? C.accent : 'transparent', opacity: q, transform: `translateY(${(1 - q) * 50}px)` }}>
              <div style={LBL(20, hero ? C.white : C.mid)}>{n}</div>
              <div style={{ ...NUM(120, hero ? C.white : C.ink), marginTop: 16 }}>{price}</div>
              <div style={{ ...BODY(28, hero ? alpha(C.white, 0.85) : C.mid), marginTop: 14 }}>{sub}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Delivery" bg={C.paper} wipe="columns" wipeColor={C.grey}>{(p) => {
        const q = ease.inOut(p / 0.72);
        return <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: GUT, top: 140, ...DISP(70, C.ink) }}>CHILLED, THIRTY-SIX HOURS</div>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <line x1={GUT} y1={620} x2={GUT + COL * 11} y2={620} stroke={C.ink} strokeWidth={2} />
            <line x1={GUT} y1={620} x2={GUT + COL * 11 * q} y2={620} stroke={C.accent} strokeWidth={8} />
            {[0, 0.34, 0.68, 1].map((at, i) => (
              <rect key={i} x={GUT + COL * 11 * at - 11} y={609} width={22} height={22} fill={q > at ? C.accent : C.grey} />))}
          </svg>
          <div style={{ position: 'absolute', left: GUT, top: 690, display: 'flex', width: COL * 11, justifyContent: 'space-between' }}>
            {['KITCHEN', 'CHILL', 'VAN', 'YOUR DOOR'].map((s, i) => <span key={i} style={LBL(19, C.mid)}>{s}</span>)}
          </div>
        </div>;
      }}</Scene>

      <Scene name="Planet" bg={C.near} wipe="cut" wipeColor={C.accent}>{(p) => {
        const cols = [[92, '%', 'paper packaging'], [0, '', 'plastic trays'], [180, 'mi', 'longest haul']];
        return <div style={{ ...MID, flexDirection: 'row', gap: 60 }}>
          {cols.map(([n, sfx, lbl], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ flex: 1, opacity: q, transform: `translateY(${(1 - q) * 40}px)` }}>
              <div style={{ ...NUM(150, i === 1 ? C.accent : C.white), whiteSpace: 'nowrap' }}><Counter target={n} p={p} d={i * 0.1} dur={0.42} suffix={sfx} /></div>
              <Rule q={ease.out((p - 0.3 - i * 0.08) / 0.3)} w={2} c={C.accent} style={{ margin: '22px 0 16px' }} />
              <div style={LBL(20, alpha(C.white, 0.7))}>{lbl}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="FAQ" bg={C.paper} wipe="bars" wipeColor={C.ink}>{(p) => {
        const qs = CT.of('FAQ').rows([['Does it need a freezer?', 'A shelf in the fridge is enough.'], ['What if he refuses it?', 'First box is free, no form.'], ['Can I pause?', 'From the doorstep, any week.']], 4);
        return <div style={MID}>
          {qs.map(([q2, a2], i) => {
            const q = ease.out(stg(p, i, 0.1, 0.28));
            return <div key={i} style={{ padding: '30px 0', borderTop: `2px solid ${C.ink}`, opacity: q, transform: `translateY(${(1 - q) * 34}px)` }}>
              <div style={DISP(54, C.ink)}>{q2}</div>
              <div style={{ ...BODY(34, C.accent), marginTop: 12 }}>{a2}</div>
            </div>;
          })}
        </div>;
      }}</Scene>

      <Scene name="Founder" bg={C.paper} wipe="split" wipeColor={C.near}>{(p) => (
        <div style={{ ...PAGE, display: 'flex', gap: 60, alignItems: 'center' }}>
          <Img id="pet-founder" w={COL * 4} h={700} p={p} from="left" />
          <div style={{ flex: 1 }}>
            <Slug t={CT.of('Founder').kicker('A NOTE FROM THE KITCHEN')} p={p} d={0.12} />
            <Hd t={CT.of('Founder').title('WE STARTED BECAUSE A BEAGLE STOPPED EATING.')} size={72} max={COL * 6} lines={3} style={{ marginTop: 24 }} />
            <div style={{ ...BODY(36, C.mid), marginTop: 24, maxWidth: COL * 5 }}>{CT.of('Founder').body('Everything since — the farms, the low ovens, the paper bags — came out of that one week.')}</div>
          </div>
        </div>)}
      </Scene>

      {/* ===== 05 ===== */}
      <Scene name="Ch5" bg={C.accent} wipe="columns" wipeColor={C.paper}>{(p) => <Divider p={p} n={CT.of('Ch5').label('05')} title={CT.of('Ch5').title('Come and eat')} deck={CT.of('Ch5').body('Two weeks, cancel from the doorstep.')} />}</Scene>

      <Scene name="Guarantee" bg={C.paper} wipe="cut" wipeColor={C.ink}>{(p) => {
        const sq = ease.out((p - 0.16) / 0.28);
        return <div style={MID}>
          <div style={{ border: `10px solid ${C.accent}`, borderRadius: 30, padding: '40px 70px', alignSelf: 'flex-start', transform: `scale(${sq})`, transformOrigin: '0 50%', opacity: sq }}>
            <Hd t={CT.of('Guarantee').title('THEY LOVE IT')} size={130} c={C.accent} />
            <div style={{ ...LBL(30, C.ink), marginTop: 12 }}>{CT.of('Guarantee').label("OR IT'S FREE")}</div>
          </div>
          <div style={{ ...BODY(38, C.mid), marginTop: 40, opacity: ease.out((p - 0.6) / 0.28) }}>{CT.of('Guarantee').body('First box, no argument, no form.')}</div>
        </div>;
      }}</Scene>

      <Scene name="Referral" bg={C.near} wipe="blockOut" wipeColor={C.accent}>{(p) => (
        <div style={MID}>
          <div style={{ ...LBL(22, C.accent), marginBottom: 20, opacity: ease.out(p / 0.26) }}>BRING A DOG YOU WALK WITH</div>
          <div style={{ border: `4px dashed ${alpha(C.white, 0.6)}`, borderRadius: 26, padding: '34px 60px', alignSelf: 'flex-start', transform: `scaleX(${ease.out((p - 0.2) / 0.3)})`, transformOrigin: '0 50%' }}>
            <div style={NUM(130, C.white)}>TWOBOWLS</div>
          </div>
          <div style={{ ...SUB(40, alpha(C.white, 0.8)), marginTop: 34, opacity: ease.out((p - 0.55) / 0.28) }}>Both boxes free.</div>
        </div>)}
      </Scene>

      <Scene name="Free" bg={C.accent} wipe="bars" wipeColor={C.paper}>{(p) => (
        <div style={MID}>
          <Chars t={CT.of('Free').title('TRY TWO WEEKS.')} p={p} size={CT.fit(CT.of('Free').title('TRY TWO WEEKS.'), 150, W - GUT * 2, FD, 400)} color={C.white} font={FD} mode="rise" per={0.032} style={{ letterSpacing: '-0.02em' }} />
          <div style={{ ...SUB(46, C.near), marginTop: 30, opacity: ease.out((p - 0.45) / 0.3) }}>{CT.of('Free').body('Cancel from the doorstep if the bowl says no.')}</div>
        </div>)}
      </Scene>

      <Scene name="CTA" bg={C.paper} wipe="split" wipeColor={C.ink}>{(p) => {
        const bq = ease.out((p - 0.3) / 0.28);
        return <div style={MID}>
          <Rule q={ease.out(p / 0.24)} w={4} />
          <Lockup lines={CT.of('CTA').items(['BUILD HIS PLAN', 'IN NINETY SECONDS.'], 2)} size={190} cols={[C.ink, C.accent]} style={{ marginTop: 26 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, marginTop: 40 }}>
            <div style={{ background: C.accent, padding: '24px 52px', opacity: bq, transform: `translateY(${(1 - bq) * 24}px)` }}>
              <span style={LBL(26, C.white)}>{CT.of('CTA').label('START THE PLAN')}</span>
            </div>
            <span style={{ ...LBL(24, C.mid), opacity: bq }}>{CT.of('CTA').source('BARKWELL.COM')}</span>
          </div>
        </div>;
      }}</Scene>

      <Scene name="End" bg={C.paper} wipe="columns" wipeColor={C.ink}>{(p, lt, raw) => {
        const fade = 1 - clamp((raw - 0.86) / 0.14, 0, 1);
        return <div style={{ ...MID, opacity: fade }}>
          <Rule q={ease.out(p / 0.26)} w={4} />
          <div style={{ marginTop: 30 }}>
            <Chars t={CT.of('End').title('BARKWELL')} p={p} d={0.1} size={CT.fit(CT.of('End').title('BARKWELL'), 300, W - GUT * 2, FD, 400)} color={C.ink} font={FD} mode="drop" per={0.035} style={{ letterSpacing: '-0.02em' }} />
          </div>
          <Rule q={ease.out((p - 0.4) / 0.3)} w={4} style={{ marginTop: 26 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, opacity: ease.out((p - 0.55) / 0.3) }}>
            <span style={LBL(22, C.accent)}>{CT.of('End').label('REAL FOOD FOR DOGS')}</span>
            <span style={LBL(22, C.mid)}>{CT.of('End').source('BARKWELL.COM')}</span>
          </div>
        </div>;
      }}</Scene>

      <Garnish />
    </div>
  );
}

/* Audit is on-demand, not on a timer: scenes are playhead-gated, so a timed run
   only ever sees the live scene and would report the rest as dead. Call
   window.PetStoryAudit() from the console — after a full playthrough for a
   complete answer, or any time for a partial one that says how much it saw. */
if (typeof window !== 'undefined') window.PetStoryAudit = () => CT.audit();

window.PetStoryFilm = function PetStoryFilm() {
  return <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.paper}>
    <Film />
  </CompositionStage>;
};
