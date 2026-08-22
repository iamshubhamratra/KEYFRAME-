/* KEYFRAME long-form film kit — shared primitives for the 16:9 template collection.
   Loaded after animations-v3.jsx. Exposes window.FilmKit.
   Every template supplies its own palette, transition set and scene bodies;
   this file only carries mechanics that would otherwise be duplicated. */
(function () {
  const { useComposition } = window;

  /* ---------- colour: brand adaptation ---------- */
  const hex2 = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const rgb2 = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hex2(a), y = hex2(b); return rgb2(x.map((v, i) => v + (y[i] - v) * t)); };
  const lighten = (c, t) => mix(c, '#ffffff', t);
  const darken = (c, t) => mix(c, '#000000', t);
  /* Relative luminance of a token, for choosing ink over a ground. */
  const isDark = (c) => {
    const [r, g, b] = hex2(c || '#ffffff');
    const s = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return (0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]) < 0.4;
  };
  const alpha = (c, a) => { const [r, g, b] = hex2(c); return `rgba(${r},${g},${b},${a})`; };

  /* Builds a full working palette from a theme's base tokens plus any brand
     colours the host injects (OM_TWEAKS.brand / brand2). Ramps are derived, so a
     new brand colour flows through fills, glows, borders and type accents. */
  function palette(base, tw) {
    tw = tw || {};
    const accent = tw.brand || base.accent;
    const accent2 = tw.brand2 || base.accent2;
    return Object.assign({}, base, {
      accent, accent2,
      accentLo: lighten(accent, 0.62), accentMid: lighten(accent, 0.28),
      accentHi: darken(accent, 0.3), accentDeep: darken(accent, 0.52),
      accent2Lo: lighten(accent2, 0.6), accent2Mid: lighten(accent2, 0.26),
      accent2Hi: darken(accent2, 0.3), accent2Deep: darken(accent2, 0.5),
      glow: alpha(accent, 0.45), glowSoft: alpha(accent, 0.16),
      veil: alpha(base.ink, 0.5),
    });
  }

  /* ---------- timing ---------- */
  const ease = {
    out: (t) => Easing.easeOutCubic(clamp(t, 0, 1)),
    inOut: (t) => Easing.easeInOutCubic(clamp(t, 0, 1)),
    back: (t) => Easing.easeOutBack(clamp(t, 0, 1)),
    elastic: (t) => Easing.easeOutElastic(clamp(t, 0, 1)),
    sine: (t) => Easing.easeInOutSine(clamp(t, 0, 1)),
    in: (t) => Easing.easeInCubic(clamp(t, 0, 1)),
  };
  /* staggered sub-progress: item i of a sequence */
  const stg = (p, i, per = 0.09, win = 0.3) => clamp((p - i * per) / win, 0, 1);
  /* deterministic pseudo-random, stable across frames (frame-accurate export) */
  const rnd = (i) => (((Math.sin(i * 127.1 + 3.7) * 43758.5453) % 1) + 1) % 1;
  const rnd2 = (i, j) => rnd(i * 37.3 + j * 11.7);

  /* Reads the span of the named scene from the host cue table, and returns both
     the raw progress and a `pa` accelerated progress (choreography finishes
     before the scene does, so held frames still carry ambient motion). */
  function useSpan(name, accel) {
    const { T, CUES, authoredTotal } = useComposition();
    const start = CUES[name];
    let end = authoredTotal;
    for (const k in CUES) { const v = CUES[k]; if (v > start && v < end) end = v; }
    const dur = (end - start) || 1;
    const p = clamp((T - start) / dur, 0, 1);
    return { start, end, dur, p, pa: clamp(p * (accel || 1), 0, 1), lt: T - start, T };
  }

  /* ---------- text mechanics ---------- */
  function Words({ t, p, d = 0, per = 0.05, style, dy = 60, dx = 0, rot = 0, blur = 0, scale = 0 }) {
    return React.createElement('span', { style },
      String(t).split(' ').map((w, i) => {
        const q = ease.out((p - d - i * per) / 0.32);
        return React.createElement('span', {
          key: i,
          style: {
            display: 'inline-block', opacity: q, marginRight: '0.26em',
            filter: blur ? `blur(${(1 - q) * blur}px)` : undefined,
            transform: `translate(${(1 - q) * dx}px,${(1 - q) * dy}px) rotate(${(1 - q) * rot}deg) scale(${scale ? 1 - (1 - q) * scale : 1})`,
          },
        }, w);
      }));
  }
  function Chars({ t, p, d = 0, per = 0.04, size, color, font, mode = 'pop', style }) {
    return React.createElement('span', { style: Object.assign({ whiteSpace: 'nowrap' }, style) },
      String(t).split('').map((ch, i) => {
        const q = mode === 'pop' ? ease.back(stg(p - d, i, per, 0.3)) : ease.out(stg(p - d, i, per, 0.26));
        const tr = mode === 'flipX' ? `rotateX(${(1 - q) * 95}deg)`
          : mode === 'flipY' ? `rotateY(${(1 - q) * 100}deg)`
            : mode === 'rise' ? `translateY(${(1 - q) * size * 0.7}px)`
              : mode === 'drop' ? `translateY(${(1 - q) * -size * 0.7}px)`
                : `scale(${q})`;
        if (ch === ' ') return React.createElement('span', { key: i, style: { display: 'inline-block', width: size * 0.28 } });
        return React.createElement('span', {
          key: i, style: { display: 'inline-block', fontFamily: font, fontSize: size, color, transform: tr, opacity: q > 0 ? Math.min(q * 2, 1) : 0 },
        }, ch);
      }));
  }
  function Typed({ t, p, lt, dur = 0.6, caret = '|', caretColor, style }) {
    const n = Math.floor(clamp(p / dur, 0, 1) * String(t).length);
    return React.createElement('span', { style },
      String(t).slice(0, n),
      React.createElement('span', { style: { opacity: Math.floor(lt * 2.5) % 2, color: caretColor } }, caret));
  }
  function Counter({ target, p, d = 0, dur = 0.55, prefix = '', suffix = '', decimals = 0, style }) {
    const v = ease.inOut((p - d) / dur) * target;
    const s = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
    return React.createElement('span', { style: Object.assign({ fontVariantNumeric: 'tabular-nums' }, style) }, prefix + s + suffix);
  }
  /* vertical slot-machine word roll */
  function Roll({ words, lt, step = 0.8, size, color, font, weight, align = 'center' }) {
    const idx = Math.min(Math.floor(lt / step), words.length - 1);
    const pos = idx === 0 ? 0 : (idx - 1) + ease.out(clamp((lt - idx * step) / 0.26, 0, 1));
    const lh = size * 1.16;
    return React.createElement('div', { style: { height: lh, overflow: 'hidden', display: 'inline-block' } },
      React.createElement('div', { style: { transform: `translateY(${-pos * lh}px)` } },
        words.map((w, i) => React.createElement('div', {
          key: i, style: { height: lh, fontFamily: font, fontWeight: weight, fontSize: size, color, lineHeight: lh + 'px', whiteSpace: 'nowrap', textAlign: align },
        }, w))));
  }
  /* horizontal ticker; wpx auto-estimated from text length */
  function Marquee({ items, T, sep = '  ·  ', speed = 120, dir = 1, size = 44, style }) {
    const t = items.join(sep) + sep;
    const wpx = t.length * size * 0.6;
    const x = -((T * speed) % wpx) * dir;
    return React.createElement('div', {
      style: Object.assign({ position: 'absolute', whiteSpace: 'nowrap', fontSize: size }, style, { transform: `translateX(${dir === 1 ? x : x - wpx}px)` }),
    }, t + t);
  }
  /* type set on a rotating circle */
  function RingText({ t, T, r = 330, size = 44, color, font, weight = 800, speed = 16, cx = '50%', cy = '50%' }) {
    const chars = String(t).split('');
    return React.createElement('div', { style: { position: 'absolute', left: cx, top: cy, width: 0, height: 0, transform: `rotate(${T * speed}deg)` } },
      chars.map((ch, i) => React.createElement('span', {
        key: i,
        style: { position: 'absolute', fontFamily: font, fontWeight: weight, fontSize: size, color, letterSpacing: '0.05em', transform: `rotate(${(i / chars.length) * 360}deg) translateY(${-r}px)`, transformOrigin: '0 0' },
      }, ch)));
  }

  /* ---------- asset slots ---------- */
  /* Scenes stay mounted for the whole film, so <image-slot> (a shadow-DOM web
     component, ~30 nodes + 4.5KB style each) must not exist for all scenes at
     once — it makes DOM capture, thumbnails and frame export time out. Scene
     provides this context; slots mount the real element only near the playhead
     and render an inert panel otherwise. Drops persist: image-slot rehydrates
     from storage whenever it mounts. */
  const SlotCtx = React.createContext(true);
  function Fill({ id, shape = 'rounded', radius = 20, placeholder = 'DROP IMAGE', idle }) {
    const live = React.useContext(SlotCtx);
    if (!live) return React.createElement('div', { 'data-slot-id': id, style: { width: '100%', height: '100%', background: idle || 'rgba(0,0,0,0.12)' } });
    return React.createElement('image-slot', { id, shape, radius: String(radius), placeholder });
  }
  /* Large, host-fillable image area. shape: rounded | circle | pill | arch | blob */
  function Slot({ id, w, h, r = 22, shape = 'rounded', cap, capStyle, p = 1, d = 0, enter = 'rise', tilt = 0, shadow = '0 22px 54px rgba(0,0,0,0.28)', frame, style }) {
    const q = ease.back((p - d) / 0.3);
    const tr = enter === 'rise' ? `translateY(${(1 - q) * 150}px) scale(${q})`
      : enter === 'drop' ? `translateY(${(1 - q) * -260}px) scale(${q})`
        : enter === 'left' ? `translateX(${(1 - q) * -400}px) scale(${q})`
          : enter === 'right' ? `translateX(${(1 - q) * 400}px) scale(${q})`
            : enter === 'zoom' ? `scale(${0.7 + q * 0.3})`
              : `scale(${q})`;
    const clip = shape === 'arch' ? 'polygon(0 100%, 0 38%, 50% 0, 100% 38%, 100% 100%)'
      : shape === 'blob' ? 'ellipse(50% 50% at 50% 50%)' : undefined;
    return React.createElement('div', { style: Object.assign({ transform: `${tr} rotate(${tilt}deg)`, opacity: q > 0 ? 1 : 0 }, style) },
      React.createElement('div', {
        style: {
          width: w, height: h, borderRadius: shape === 'circle' || shape === 'pill' ? 999 : r,
          overflow: 'hidden', boxShadow: shadow, clipPath: clip, border: frame,
        },
      }, React.createElement(Fill, {
        id, shape: shape === 'circle' ? 'circle' : shape === 'pill' ? 'pill' : 'rounded', radius: r,
      })),
      cap ? React.createElement('div', { style: Object.assign({ marginTop: 14, letterSpacing: '0.12em', fontWeight: 800 }, capStyle) }, cap) : null);
  }
  /* Browser chrome around a screenshot slot */
  function BrowserSlot({ id, w, h, url = 'yoursite.com', p = 1, d = 0, bar = '#e8e8e8', ink = '#666', screen = '#23262b', tilt = 0, style }) {
    const q = ease.back((p - d) / 0.32);
    return React.createElement('div', {
      style: Object.assign({ width: w, borderRadius: 18, overflow: 'hidden', background: bar, boxShadow: '0 26px 60px rgba(0,0,0,0.32)', transform: `translateY(${(1 - q) * 140}px) rotate(${tilt}deg) scale(${q})`, opacity: q > 0 ? 1 : 0 }, style),
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' } },
        ['#ff5f57', '#febc2e', '#28c840'].map((c, i) => React.createElement('div', { key: i, style: { width: 14, height: 14, borderRadius: 999, background: c } })),
        React.createElement('div', { style: { flex: 1, marginLeft: 12, height: 30, borderRadius: 999, background: 'rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 18, fontWeight: 600, color: ink } }, url)),
      React.createElement('div', { style: { height: h, background: screen } },
        React.createElement(Fill, { id, shape: 'rect', placeholder: 'DROP SCREENSHOT', idle: screen })));
  }
  /* Laptop shell around a screenshot slot */
  function LaptopSlot({ id, w, p = 1, d = 0, shell = '#d8d8dc', p2 = '#b9b9c0', style }) {
    const q = ease.back((p - d) / 0.34);
    const h = Math.round(w * 0.58);
    return React.createElement('div', { style: Object.assign({ transform: `translateY(${(1 - q) * 180}px) scale(${q})`, opacity: q > 0 ? 1 : 0 }, style) },
      React.createElement('div', { style: { width: w, height: h, background: shell, borderRadius: 20, padding: 14, boxSizing: 'border-box', boxShadow: '0 30px 70px rgba(0,0,0,0.35)' } },
        React.createElement('div', { style: { width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', background: '#000' } },
          React.createElement(Fill, { id, shape: 'rect', placeholder: 'DROP SCREENSHOT', idle: '#1a1a1e' }))),
      React.createElement('div', { style: { width: w * 1.14, height: 18, background: p2, borderRadius: '0 0 16px 16px', margin: '0 auto' } }));
  }
  function LogoSlot({ id, size = 200, p = 1, d = 0, shape = 'circle', style }) {
    const q = ease.back((p - d) / 0.3);
    return React.createElement('div', {
      style: Object.assign({ width: size, height: size, borderRadius: shape === 'circle' ? 999 : 24, overflow: 'hidden', flex: 'none', transform: `scale(${q})`, opacity: q > 0 ? 1 : 0 }, style),
    }, React.createElement(Fill, { id, shape, placeholder: 'DROP LOGO' }));
  }

  /* ---------- interaction motifs ---------- */
  function Cursor({ x, y, click = 0, color = '#fff', ink = '#111', size = 54 }) {
    return React.createElement('div', { style: { position: 'absolute', left: x, top: y, pointerEvents: 'none' } },
      click > 0 && click < 1 ? React.createElement('div', { style: { position: 'absolute', left: -66, top: -66, width: 132, height: 132, borderRadius: 999, border: `6px solid ${color}`, transform: `scale(${0.3 + click})`, opacity: 1 - click } }) : null,
      React.createElement('svg', { width: size, height: size * 1.1, viewBox: '0 0 54 60' },
        React.createElement('path', { d: 'M6 4 L6 46 L18 36 L26 54 L34 50 L26 32 L42 30 Z', fill: ink, stroke: color, strokeWidth: 4, strokeLinejoin: 'round' })));
  }
  function Keycaps({ keys, p, d = 0, up, down, shadow, size = 30 }) {
    return React.createElement('div', { style: { display: 'flex', gap: 14 } },
      keys.map((k, i) => {
        const q = stg(p - d, i, 0.08, 0.16), isDown = q > 0 && q < 1;
        return React.createElement('div', {
          key: i,
          style: {
            background: isDown ? down.bg : up.bg, color: isDown ? down.fg : up.fg, fontSize: size, fontWeight: 800,
            padding: '14px 24px', borderRadius: 14, transform: `translateY(${isDown ? 8 : 0}px)`,
            boxShadow: isDown ? 'none' : `0 8px 0 ${shadow}`, fontFamily: up.font,
          },
        }, k);
      }));
  }
  /* radial burst of particles from centre */
  function Burst({ p, T, n = 40, colors, spread = 700, gravity = 220, size = 18 }) {
    return React.createElement('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
      Array.from({ length: n }).map((_, i) => {
        const q = clamp((p - rnd(i) * 0.12) / 0.7, 0, 1);
        const a = rnd(i + 3) * Math.PI * 2, dist = q * (spread * 0.35 + rnd(i + 8) * spread);
        return React.createElement('div', {
          key: i,
          style: {
            position: 'absolute', left: 960 + Math.cos(a) * dist, top: 540 + Math.sin(a) * dist * 0.62 + q * q * gravity,
            width: size * (0.6 + rnd(i + 2) * 0.9), height: size * (0.6 + rnd(i + 5) * 1.2),
            background: colors[i % colors.length], borderRadius: i % 3 ? 4 : 999,
            transform: `rotate(${T * 90 + i * 40}deg)`, opacity: 1 - q * q,
          },
        });
      }));
  }
  /* drifting field — snow, pollen, dust, sparks */
  function Drift({ T, n = 26, colors, w = 1920, h = 1080, speed = 26, size = 8, sway = 40, opacity = 0.3 }) {
    return React.createElement('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' } },
      Array.from({ length: n }).map((_, i) => {
        const x = rnd(i) * w + Math.sin(T * 0.4 + i) * sway;
        const y = h + 80 - ((rnd(i + 40) * (h + 160) + T * (speed * (0.6 + rnd(i + 7)))) % (h + 200));
        const s = size * (0.5 + rnd(i + 9) * 1.4);
        return React.createElement('div', { key: i, style: { position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: 999, background: colors[i % colors.length], opacity } });
      }));
  }

  /* Auto-fit display type: shrinks `size` until `text` fits `maxW` at `family`.
     Fixed pixel sizes were the cause of headline collisions and copy running off
     the frame whenever real content was longer than the demo string. */
  const _fit = (typeof document !== 'undefined' && document.createElement('canvas').getContext('2d')) || null;
  function fitText(text, size, maxW, family, weight) {
    if (!_fit || !text) return size;
    let ratio = 1;
    for (const raw of String(text).split('|')) {
      const ln = raw.trim(); if (!ln) continue;
      _fit.font = (weight ? weight + ' ' : '') + size + 'px ' + String(family || 'sans-serif').replace(/"/g, '');
      const w = _fit.measureText(ln).width * 1.04;
      if (w > maxW) ratio = Math.min(ratio, maxW / w);
    }
    return ratio < 1 ? Math.max(size * 0.46, size * ratio) : size;
  }

  const SCENE_BG = {};

  /* The scene under the playhead, by name and playback index — what a
     composition-level garnish layer needs to colour itself correctly. */
  function useActive() {
    const { T, CUES, authoredTotal } = useComposition();
    const order = Object.keys(CUES).sort(function (a, b) { return CUES[a] - CUES[b]; });
    let i = 0;
    for (let j = 0; j < order.length; j++) { if (T >= CUES[order[j]]) i = j; }
    const name = order[i];
    const start = CUES[name];
    const end = i + 1 < order.length ? CUES[order[i + 1]] : authoredTotal;
    return { name: name, index: i, bg: SCENE_BG[name], p: clamp((T - start) / ((end - start) || 1), 0, 1), T: T };
  }

  /* ---------- structure ---------- */
  /* Scene wrapper. `transitions` is a template-owned map of name → render fn
     (p, colorToken) so every template can have its own transition language.
     `camera` is likewise template-owned: name → style fn (p).
     `ground` (optional) is the template's own background world: a fn
     (bg, p, T, name) => JSX rendered behind the camera layer in EVERY scene, so
     no scene ever sits on a flat fill. It must be capture-safe — static
     gradients/clip-paths computed once, transforms only. */
  function makeScene(transitions, cameras, accel, ground, opts) {
    const paint = !(opts && opts.paint === false);
    return function Scene({ name, bg, wipe, wipeColor, camera, ground: gOverride, children }) {
      const s = useSpan(name, accel);
      /* Every scene keeps moving after its choreography lands: named cameras
         where given, otherwise a slow ambient drift. */
      const amb = { transform: 'translate(' + (Math.sin(s.T * 0.32) * 12) + 'px,' + (Math.cos(s.T * 0.26) * 9) + 'px) scale(' + (1.006 + Math.sin(s.T * 0.2) * 0.006) + ')' };
      SCENE_BG[name] = bg;
      const CUES0 = useComposition().CUES;
      const ord0 = Object.keys(CUES0).sort(function (a, b) { return CUES0[a] - CUES0[b]; });
      const i0 = Math.max(0, ord0.indexOf(name));
      /* No explicit camera: cycle the template's move list on scene index with a
         stride, so neighbours never share a move (the reference's camStride). */
      const keys = Object.keys(cameras);
      const auto = keys.length ? cameras[keys[(i0 * 3 + 1) % keys.length]] : null;
      const cam = camera && cameras[camera] ? cameras[camera](s.p) : (auto ? auto(s.p) : amb);
      /* Scenes outside the playhead window render an empty positioned div: the
         engine keeps every Shot mounted, and 50 live scene subtrees make DOM
         capture (thumbnails, frame export) time out. Nothing morphs across
         scene boundaries in these templates, so nothing visual is lost. */
      const live = s.T >= s.start - 1.5 && s.T <= s.end + 1.5;
      /* Wipes run on the SAME accelerated clock as the choreography. Driving them
         from raw `p` left tiles/bands sitting opaque over content that had
         already landed (content lands at p*accel, the wipe cleared at p). The
         intro half is scaled by accel and clamped at 0.5 — where every
         transition renders nothing — while the tail past 0.5 passes through so
         out-transitions still fire at their authored p. */
      const tp = s.p < 0.5 ? Math.min(s.p * (accel || 1), 0.5) : s.p;
      /* Scene index in playback order — the template's furniture cycles on it
         (tag lines, footnotes, side type, camera order), the way the reference
         films vary their garnish scene to scene. */
      return React.createElement(Shot, { from: s.start, to: s.end },
        live
          ? React.createElement(SlotCtx.Provider, { value: true },
            React.createElement('div', { style: { position: 'absolute', inset: 0, background: paint ? bg : 'transparent', overflow: 'hidden' } },
              /* The readability veil used to sit over a per-scene world. Now that
                 the background is one composition-level instance, a per-scene veil
                 just doubles at every cut — two different scene grounds blended,
                 lifting the wash from 34% to 56% exactly on the transition. The
                 wash belongs in the Backdrop; scenes only paint a ground when they
                 own one. */
              gOverride === false || !ground ? null : React.createElement('div', { style: { position: 'absolute', inset: 0 } },
                ground(bg, s.p, s.T, name),
                React.createElement('div', { style: { position: 'absolute', inset: 0, background: bg, opacity: 0.34, pointerEvents: 'none' } })),
              React.createElement('div', { style: Object.assign({ position: 'absolute', inset: 0 }, cam) },
                typeof children === 'function' ? children(s.pa, s.lt, s.p, s.T) : children),
              wipe && transitions[wipe] ? transitions[wipe](tp, wipeColor) : null))
          : React.createElement('div', { style: { position: 'absolute', inset: 0, background: paint ? bg : 'transparent' } }));
    };
  }

  window.FilmKit = {
    mix, lighten, darken, alpha, isDark, palette, fitText,
    ease, stg, rnd, rnd2, useSpan, useActive, makeScene,
    Words, Chars, Typed, Counter, Roll, Marquee, RingText,
    Slot, BrowserSlot, LaptopSlot, LogoSlot, Fill, SlotCtx,
    Cursor, Keycaps, Burst, Drift,
  };
})();
