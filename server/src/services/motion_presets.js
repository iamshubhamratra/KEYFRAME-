// MOTION SYSTEM — the one shared animation vocabulary every template composes from.
//
// WHY THIS EXISTS
// The motion vocabulary was not missing, it was TRAPPED. scene_kit.js owns a rich
// set of entrances, emphasis and cuts; the 8 family grammars and the dedicated
// composers each hand-rolled their own tweens. Two films built by two paths
// therefore moved like two different products. This module is the single place
// the motion language is defined, so "premium, minimal, physics-based, layered"
// is a property of the SYSTEM rather than of whoever wrote a given scene.
//
// Packs stay distinct through colour, type and layout — never through timing.
// Every preset here uses the same durations and eases (see TIMING) on purpose.
//
// ---------------------------------------------------------------------------
// THE SEEK CONTRACT — read before adding a preset
//
// The renderer captures frames by SEEKING a paused timeline, never by playing
// it. Every visible value must therefore be a pure function of tl.time(). That
// makes three things hard rules, not preferences:
//
//   1. NO infinite repeats. `repeat:-1` leaves a seeked frame dependent on how
//      the playhead arrived. Idle motion uses reps()/sreps() — a finite count
//      derived from the span it has to cover.
//   2. NO runtime randomness. Math.random() in emitted code renders a different
//      film every capture. Anything that wants jitter takes a seed at BUILD time
//      and bakes the number into the string.
//   3. fromTo() that starts after t=0 needs immediateRender:false. Otherwise GSAP
//      applies the from-state at build time and the element is wrong for every
//      frame before the tween — this is the documented cut-layer blank bug.
//
// Motion blur is faked, deliberately: a seeked renderer has no shutter, so there
// is no real blur to capture. Velocity-keyed CSS blur on the moving layer is the
// only honest way to get it, and it is what the camera whips already do.

// ---- THE SHARED VOCABULARY --------------------------------------------------
// One table. Every preset reads from it; nothing hardcodes a duration or ease.
const TIMING = {
  // text
  textDur: 0.5,
  textStagger: 0.04,          // 40ms between words, per the motion spec
  textEase: "power4.out",
  textBlur: 18,               // px, blur→sharp entrances start here
  textRise: 40,               // px
  // cards / UI
  cardDur: 0.7,
  cardEase: "expo.out",
  cardBlur: 12,
  cardRise: 80,
  // camera
  camEase: "sine.inOut",
  camPush: 0.06,              // 6% over the scene — slow enough to feel, not see
  // idle / ambient
  idleCycle: 5,               // seconds per float cycle (spec: 4-6s)
  idleY: 5,                   // px
  idleRot: 0.8,               // degrees
  idleEase: "sine.inOut",
  sweepEvery: 4,              // seconds between edge light sweeps
  // transitions
  transDur: 0.55,
  transEase: "expo.inOut",
  overlap: 0.2,               // scenes overlap rather than cut (spec: 200ms)
  // the overshoot that keeps a settle from reading as a stop
  overshoot: 1.02,
};

const r = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const q = (s) => JSON.stringify(String(s));

// ---- RUNTIME HELPERS --------------------------------------------------------
// Injected once into the composition's script preamble. These do DOM work the
// build step cannot: splitting live text into word/char spans means a preset can
// be applied to ANY family's markup without first rewriting that family's HTML.
// Splitting is text-node-only, so an emphasis <span> inside a headline survives.
function runtimeHelpers() {
  return `
  // --- motion system runtime (see services/motion_presets.js) ---
  function kfWrap(sel,cls,mode){
    var els=document.querySelectorAll(sel),out=0;
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.getAttribute("data-kf-split"))  { out+=el.querySelectorAll("."+cls).length; continue; }
      var walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),nodes=[],n;
      while((n=walk.nextNode())) if(n.nodeValue&&n.nodeValue.trim()) nodes.push(n);
      for(var j=0;j<nodes.length;j++){
        var t=nodes[j], parts=mode==="char"?t.nodeValue.split(""):t.nodeValue.split(/(\\s+)/);
        var frag=document.createDocumentFragment();
        for(var k=0;k<parts.length;k++){
          var p=parts[k];
          if(!p) continue;
          if(!p.trim()){ frag.appendChild(document.createTextNode(p)); continue; }
          var s=document.createElement("span");
          s.className=cls;
          // inline-block is what makes y/scale/blur animatable per word; the
          // parent keeps its own line-height so wrapping is unchanged.
          s.style.display="inline-block";
          s.style.willChange="transform,filter,opacity";
          s.textContent=p;
          frag.appendChild(s); out++;
        }
        t.parentNode.replaceChild(frag,t);
      }
      el.setAttribute("data-kf-split","1");
    }
    return out;
  }
  function kfWords(sel){ return kfWrap(sel,"kfmw","word"); }
  function kfChars(sel){ return kfWrap(sel,"kfmc","char"); }
  // A layer appended INSIDE a target, used by sweeps/ripples/glows so a preset
  // never requires the family to have authored a spare element for it.
  function kfLayer(sel,cls,css){
    var host=document.querySelector(sel);
    if(!host) return null;
    var d=document.createElement("div");
    d.className=cls; d.style.cssText=css;
    host.appendChild(d);
    return d;
  }
`;
}

// A build-time selector for the spans a runtime split produced.
const WORDS = (sel) => `${sel} .kfmw`;
const CHARS = (sel) => `${sel} .kfmc`;

// ---- PART 1: TYPOGRAPHY -----------------------------------------------------

// wordStaggerBlur — the house headline entrance. Word by word, blur→sharp, with
// a rise and a whisper of scale. Never a plain fade: a fade has no direction and
// reads as a slideshow dissolve.
function wordStaggerBlur(sel, at, opts = {}) {
  const t = TIMING;
  const dur = r(opts.dur || t.textDur);
  const stg = r(opts.stagger || t.textStagger);
  const from = r(opts.rise != null ? opts.rise : t.textRise);
  const blur = r(opts.blur != null ? opts.blur : t.textBlur);
  return [
    `kfWords(${q(sel)});`,
    // Families author their headline hosts at inline opacity:0 and used to fade
    // the host itself. Now the WORDS carry the entrance, so the host has to be
    // switched on at the same instant — set (not tween) so the host contributes
    // no fade of its own, and so a seek before `at` still finds it hidden.
    `tl.set(${q(sel)},{opacity:1},${r(at)});`,
    `tl.fromTo(${q(WORDS(sel))},{opacity:0,y:${from},scale:0.96,filter:"blur(${blur}px)"},`
      + `{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:${dur},ease:"${t.textEase}",`
      + `stagger:${stg},immediateRender:false},${r(at)});`,
  ];
}

// characterReveal — hero scenes only. Same physics, per character, tighter
// stagger so a long line does not take four seconds to land.
function characterReveal(sel, at, opts = {}) {
  const t = TIMING;
  return [
    `kfChars(${q(sel)});`,
    `tl.set(${q(sel)},{opacity:1},${r(at)});`,
    `tl.fromTo(${q(CHARS(sel))},{opacity:0,y:${r(t.textRise * 0.5)},filter:"blur(${r(t.textBlur * 0.6)}px)"},`
      + `{opacity:1,y:0,filter:"blur(0px)",duration:${r(opts.dur || t.textDur * 0.8)},ease:"${t.textEase}",`
      + `stagger:${r(opts.stagger || t.textStagger * 0.45)},immediateRender:false},${r(at)});`,
  ];
}

// outlineFillReveal — the first word arrives as an outline, then floods with the
// brand colour. -webkit-text-stroke is animated by crossfading a stroked copy
// against the filled original, because the stroke property itself does not
// interpolate reliably across engines.
function outlineFillReveal(sel, at, opts = {}) {
  const t = TIMING;
  const ink = opts.ink || "#FFFFFF";
  const dur = r(opts.dur || t.textDur * 1.4);
  return [
    `kfWords(${q(sel)});`,
    `tl.set(${q(sel)},{opacity:1},${r(at)});`,
    // Only the FIRST word gets the treatment — the whole line outlined reads as
    // a broken font, not as an effect.
    // A PURE outline (transparent fill) is genuinely unreadable while it holds —
    // the contrast checker measures such a glyph at ~1:1 from pixels, and it is
    // right to: almost every pixel inside the letterform is still background.
    // So the word never goes hollow. It starts on a muted fill with a strong
    // stroke (reads as outlined, still measurable), and the stroke fades out as
    // the fill comes up to full — the same "outline becomes filled" beat, without
    // a window where the headline cannot be read.
    // The word SETTLES on the pack's own headline ink, not on the accent. Ending
    // on the accent left one word permanently a different colour from the rest of
    // the headline — a design decision the pack never made — and on liquid-glass
    // that accent measured 2.87:1 against a 3:1 floor, so the finished frame
    // failed contrast long after the effect was over. The accent now lives only
    // in the STROKE, where it is transient and never the thing being read.
    `(function(){var w=document.querySelector(${q(WORDS(sel))});if(!w)return;`
      + `w.style.webkitTextStroke="0.055em ${opts.stroke || ink}";w.style.webkitTextFillColor="${opts.soft || ink}";`
      + `tl.to(w,{duration:${dur},ease:"${t.textEase}",webkitTextFillColor:"${ink}",`
      + `webkitTextStrokeColor:"rgba(0,0,0,0)",immediateRender:false},${r(at)});})();`,
  ];
}

// headlineGlowPulse — the keyword the narrator lands on. Scale 1→1.06→1 with a
// brightness lift. Only the emphasised word moves; animating the sentence is the
// single loudest amateur tell in the reference films.
function headlineGlowPulse(sel, at, opts = {}) {
  const t = TIMING;
  const dur = r(opts.dur || 0.42);
  return [
    `tl.to(${q(sel)},{scale:1.06,filter:"brightness(1.15)",duration:${dur},`
      + `ease:"${t.idleEase}",yoyo:true,repeat:1,immediateRender:false},${r(at)});`,
  ];
}

// textMorph — swap a word without dissolving the line around it. The outgoing
// word leaves upward under blur, the incoming arrives from below into the same
// slot, so the sentence holds still and only the changed token moves.
function textMorph(sel, at, words, opts = {}) {
  const t = TIMING;
  const hold = r(opts.hold || 0.9);
  const dur = r(opts.dur || 0.34);
  const list = (Array.isArray(words) ? words : []).filter(Boolean);
  if (!list.length) return [];
  const out = [`var _m=document.querySelector(${q(sel)});`];
  list.forEach((w, i) => {
    const tIn = r(at + i * (hold + dur));
    if (i > 0) {
      out.push(`tl.to(${q(sel)},{y:${r(-t.textRise * 0.35)},opacity:0,filter:"blur(6px)",`
        + `duration:${dur},ease:"${t.textEase}",immediateRender:false},${r(tIn - dur)});`);
    }
    out.push(`tl.set(${q(sel)},{textContent:${q(w)}},${tIn});`);
    out.push(`tl.fromTo(${q(sel)},{y:${r(t.textRise * 0.35)},opacity:0,filter:"blur(6px)"},`
      + `{y:0,opacity:1,filter:"blur(0px)",duration:${dur},ease:"${t.textEase}",`
      + `immediateRender:false},${tIn});`);
  });
  out.push(`void _m;`);
  return out;
}

// directionalSlide — every section enters from a different edge. The caller
// passes the scene index; the direction cycles so no two consecutive scenes
// share one, which is what turns a sequence into a sequence rather than a stack.
const SLIDE_DIRS = [
  { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];
function directionalSlide(sel, at, index, opts = {}) {
  const t = TIMING;
  const d = SLIDE_DIRS[((index % SLIDE_DIRS.length) + SLIDE_DIRS.length) % SLIDE_DIRS.length];
  const dist = r(opts.dist || 90);
  return [
    `tl.fromTo(${q(sel)},{x:${r(d.x * dist)},y:${r(d.y * dist)},opacity:0,filter:"blur(${r(t.cardBlur * 0.6)}px)"},`
      + `{x:0,y:0,opacity:1,filter:"blur(0px)",duration:${r(opts.dur || t.cardDur)},`
      + `ease:"${t.cardEase}",immediateRender:false},${r(at)});`,
  ];
}

// overshootSettle — 100 → 102 → 100. Applied to anything that "arrives"; a
// linear stop is the difference between a physics simulation and a slideshow.
function overshootSettle(sel, at, opts = {}) {
  const t = TIMING;
  const peak = r(opts.peak || t.overshoot);
  const dur = r(opts.dur || 0.26);
  return [
    `tl.to(${q(sel)},{scale:${peak},duration:${r(dur * 0.45)},ease:"power2.out",immediateRender:false},${r(at)});`,
    `tl.to(${q(sel)},{scale:1,duration:${r(dur * 0.55)},ease:"power2.inOut"},${r(at + dur * 0.45)});`,
  ];
}

// ---- PART 2: CARDS ----------------------------------------------------------

// cardRise3D — the onboarding-card entrance. Rises through perspective with a
// slight two-axis tilt, unblurring as it lands. The tilt is what separates a
// card from a rectangle: a flat translate reads as a panel, this reads as an
// object with a back.
function cardRise3D(sel, at, opts = {}) {
  const t = TIMING;
  const dur = r(opts.dur || t.cardDur);
  return [
    `tl.set(${q(sel)},{transformPerspective:1400,transformOrigin:"50% 60%"},0);`,
    `tl.fromTo(${q(sel)},{opacity:0,scale:0.92,rotationX:12,rotationY:-8,y:${t.cardRise},filter:"blur(${t.cardBlur}px)"},`
      + `{opacity:1,scale:1,rotationX:0,rotationY:0,y:0,filter:"blur(0px)",`
      + `duration:${dur},ease:"${t.cardEase}"${opts.stagger ? `,stagger:${r(opts.stagger)}` : ""},`
      + `immediateRender:false},${r(at)});`,
    ...overshootSettle(sel, r(at + dur * 0.78), { peak: 1.012 }),
  ];
}

// floatingIdle — a card that has landed must not go dead. Sub-pixel-ish drift on
// y and rotation over a 4-6s cycle. Finite repeats derived from the span, never
// repeat:-1: an infinite tween makes a seeked frame depend on playback history.
function floatingIdle(sel, at, span, opts = {}) {
  const t = TIMING;
  const cyc = r(opts.cycle || t.idleCycle);
  const dy = r(opts.y != null ? opts.y : t.idleY);
  const rot = r(opts.rot != null ? opts.rot : t.idleRot);
  const half = r(cyc / 2);
  return [
    `tl.to(${q(sel)},{y:"+=${dy}",rotation:${rot},duration:${half},ease:"${t.idleEase}",`
      + `yoyo:true,repeat:reps(${r(span)},${half}),immediateRender:false},${r(at)});`,
  ];
}

// cardStackTransition — the outgoing card does not vanish. It steps back into
// depth (left, smaller, blurred, dimmed) while the incoming one slides over it,
// overlapping by TIMING.overlap so the two are on screen together. This is the
// single change that stops screens reading as a slideshow.
function cardStackTransition(prevSel, nextSel, at, opts = {}) {
  const t = TIMING;
  const dur = r(opts.dur || t.cardDur);
  const ov = r(opts.overlap != null ? opts.overlap : t.overlap);
  const out = [];
  if (prevSel) {
    out.push(`tl.to(${q(prevSel)},{x:${r(-(opts.shift || 120))},scale:0.95,opacity:0.7,`
      + `filter:"blur(3px)",duration:${dur},ease:"${t.transEase}",immediateRender:false},${r(at)});`);
  }
  if (nextSel) {
    out.push(`tl.set(${q(nextSel)},{transformPerspective:1400},0);`);
    out.push(`tl.fromTo(${q(nextSel)},{x:${r(opts.shift || 120)},opacity:0,scale:0.96,filter:"blur(8px)"},`
      + `{x:0,opacity:1,scale:1,filter:"blur(0px)",duration:${dur},ease:"${t.transEase}",`
      + `immediateRender:false},${r(at + ov)});`);
  }
  return out;
}

// softShadow — the shadow is an animated property, not a static style. It grows
// and softens as the card rises, which is what sells the height.
function softShadow(sel, at, opts = {}) {
  const t = TIMING;
  const tint = opts.tint || "rgba(0,0,0,0.28)";
  return [
    `tl.fromTo(${q(sel)},{boxShadow:"0 8px 18px rgba(0,0,0,0.10)"},`
      + `{boxShadow:"0 26px 60px ${tint}",duration:${r(opts.dur || t.cardDur)},`
      + `ease:"${t.cardEase}",immediateRender:false},${r(at)});`,
  ];
}

// lightSweep — a slow specular pass along a card's top edge every few seconds.
// Very subtle by design; at full strength it reads as a glare, not as glass.
function lightSweep(sel, at, span, opts = {}) {
  const t = TIMING;
  const every = r(opts.every || t.sweepEvery);
  const dur = r(opts.dur || 1.1);
  const cls = `kfsw${Math.abs(hash(sel)) % 9973}`;
  return [
    `kfLayer(${q(sel)},${q(cls)},"position:absolute;inset:0;pointer-events:none;overflow:hidden;`
      + `border-radius:inherit;background:linear-gradient(105deg,transparent 38%,`
      + `rgba(255,255,255,${opts.strength || 0.16}) 50%,transparent 62%);opacity:0;");`,
    `tl.fromTo(${q(`${sel} .${cls}`)},{xPercent:-120,opacity:1},`
      + `{xPercent:120,opacity:1,duration:${dur},ease:"${t.idleEase}",`
      + `repeat:reps(${r(span)},${every}),repeatDelay:${r(Math.max(0, every - dur))},`
      + `immediateRender:false},${r(at)});`,
  ];
}

// cursorClickRipple — a cursor that travels, presses, and leaves a ripple the UI
// then answers. The point is causality: the click has to precede the reaction,
// or the screen looks like it is animating itself.
function cursorClickRipple(sel, at, opts = {}) {
  const t = TIMING;
  const x = r(opts.x || 0), y = r(opts.y || 0);
  const cls = `kfcur${Math.abs(hash(sel + x + y)) % 9973}`;
  const dot = `${sel} .${cls}`;
  return [
    `kfLayer(${q(sel)},${q(cls)},"position:absolute;left:0;top:0;width:18px;height:18px;`
      + `border-radius:50%;pointer-events:none;background:rgba(255,255,255,0.9);`
      + `box-shadow:0 2px 10px rgba(0,0,0,0.35);opacity:0;z-index:9;");`,
    `tl.fromTo(${q(dot)},{opacity:0,x:${r(x - 90)},y:${r(y + 60)},scale:1},`
      + `{opacity:1,x:${x},y:${y},scale:1,duration:${r(t.cardDur)},ease:"${t.cardEase}",`
      + `immediateRender:false},${r(at)});`,
    // press
    `tl.to(${q(dot)},{scale:0.78,duration:0.1,ease:"power2.in"},${r(at + t.cardDur)});`,
    `tl.to(${q(dot)},{scale:1,duration:0.18,ease:"power2.out"},${r(at + t.cardDur + 0.1)});`,
    // the ripple the press leaves behind
    `tl.fromTo(${q(dot)},{boxShadow:"0 0 0 0 rgba(255,255,255,0.5)"},`
      + `{boxShadow:"0 0 0 26px rgba(255,255,255,0)",duration:0.5,ease:"power2.out",`
      + `immediateRender:false},${r(at + t.cardDur + 0.08)});`,
  ];
}

// buttonPress / counterAnimate / scrollReveal — the small answers that make a UI
// look operated rather than screenshotted.
function buttonPress(sel, at, opts = {}) {
  return [
    `tl.to(${q(sel)},{scale:0.96,duration:0.09,ease:"power2.in",immediateRender:false},${r(at)});`,
    `tl.to(${q(sel)},{scale:1,duration:0.22,ease:"back.out(2.2)"},${r(at + 0.09)});`,
    ...(opts.glow ? [`tl.fromTo(${q(sel)},{filter:"brightness(1)"},{filter:"brightness(1.18)",`
      + `duration:0.16,ease:"power2.out",yoyo:true,repeat:1,immediateRender:false},${r(at + 0.09)});`] : []),
  ];
}
function counterAnimate(sel, at, to, opts = {}) {
  const dur = r(opts.dur || 1.1);
  return [`countTxt(${q(sel)},${Number(to) || 0},${r(at)},${dur},${q(opts.pre || "")},${q(opts.suf || "")},1);`];
}
function scrollReveal(sel, at, opts = {}) {
  const t = TIMING;
  const dist = r(opts.dist || 220);
  return [
    `tl.fromTo(${q(sel)},{y:${dist}},{y:${r(opts.to || 0)},duration:${r(opts.dur || 1.6)},`
      + `ease:"${t.idleEase}",immediateRender:false},${r(at)});`,
  ];
}

// ---- PART 3: CAMERA ---------------------------------------------------------

// slowCameraPush — continuous, sub-perceptual. The rule is that no scene is ever
// completely still; the rate is chosen so a viewer feels it without seeing it.
function slowCameraPush(sel, at, span, opts = {}) {
  const t = TIMING;
  const amt = r(opts.amount != null ? opts.amount : t.camPush);
  const dir = opts.out ? -1 : 1;
  return [
    `tl.fromTo(${q(sel)},{scale:${r(dir > 0 ? 1 : 1 + amt)}},`
      + `{scale:${r(dir > 0 ? 1 + amt : 1)},duration:${r(span)},ease:"none",immediateRender:false},${r(at)});`,
  ];
}
// The camera moves cycle so consecutive scenes never share one — a repeated
// drift direction is the "slideshow" tell even when everything else is right.
const CAMERA_MOVES = ["pushSlow", "pullSlow", "panLeft", "panRight", "tiltUp", "orbitSoft"];
function cameraMove(sel, at, span, move, opts = {}) {
  const t = TIMING;
  const s = r(span);
  const d = r(opts.dist || 26);
  switch (move) {
    case "pullSlow": return slowCameraPush(sel, at, span, { ...opts, out: true });
    case "panLeft":  return [`tl.fromTo(${q(sel)},{x:${d},scale:1.04},{x:${r(-d)},scale:1.04,duration:${s},ease:"none",immediateRender:false},${r(at)});`];
    case "panRight": return [`tl.fromTo(${q(sel)},{x:${r(-d)},scale:1.04},{x:${d},scale:1.04,duration:${s},ease:"none",immediateRender:false},${r(at)});`];
    case "tiltUp":   return [`tl.fromTo(${q(sel)},{y:${d},scale:1.04},{y:${r(-d)},scale:1.04,duration:${s},ease:"none",immediateRender:false},${r(at)});`];
    case "orbitSoft":return [`tl.fromTo(${q(sel)},{rotation:-0.5,scale:1.05},{rotation:0.5,scale:1.02,duration:${s},ease:"${t.camEase}",immediateRender:false},${r(at)});`];
    case "pushSlow":
    default:         return slowCameraPush(sel, at, span, opts);
  }
}

// parallaxLayers — background, card and foreground travel at different rates.
// Depth is the cheapest premium signal there is, and a single-rate move throws
// it away.
function parallaxLayers(sels, at, span, opts = {}) {
  const list = (Array.isArray(sels) ? sels : []).filter(Boolean);
  const amt = r(opts.amount || 34);
  return list.flatMap((sel, i) => {
    const depth = (i + 1) / list.length;          // 0..1, back to front
    const d = r(amt * depth);
    return [`tl.fromTo(${q(sel)},{x:${r(-d / 2)}},{x:${r(d / 2)},duration:${r(span)},`
      + `ease:"none",immediateRender:false},${r(at)});`];
  });
}

// ---- PART 4: TRANSITIONS ----------------------------------------------------
// Crossfade is deliberately absent. Every one of these has DIRECTION, which is
// what a dissolve lacks and why a dissolve reads as "slides advancing".
const TRANSITIONS = ["depthWipe", "panelSlide", "maskWipe", "lightPass", "cameraPush"];
function maskedSceneTransition(sel, at, kind, opts = {}) {
  const t = TIMING;
  const dur = r(opts.dur || t.transDur);
  // Direction alternates with the scene index (motion spec 1.6: never the same
  // direction twice). A wipe that always enters from the left is a house style
  // for one scene and a tic by the fourth.
  const flip = (Number(opts.index) || 0) % 2 === 1;
  switch (kind) {
    case "panelSlide":
      return [`tl.fromTo(${q(sel)},{clipPath:"inset(0 ${flip ? "0 0 100%" : "100% 0 0"})"},`
        + `{clipPath:"inset(0 0% 0 0%)",`
        + `duration:${dur},ease:"${t.transEase}",immediateRender:false},${r(at)});`];
    case "maskWipe":
      return [`tl.fromTo(${q(sel)},{clipPath:"inset(${flip ? "0 0 100% 0" : "100% 0 0 0"})"},`
        + `{clipPath:"inset(0% 0 0% 0)",`
        + `duration:${dur},ease:"${t.transEase}",immediateRender:false},${r(at)});`];
    case "lightPass":
      return [`tl.fromTo(${q(sel)},{opacity:0,filter:"brightness(2.2) blur(14px)"},`
        + `{opacity:1,filter:"brightness(1) blur(0px)",duration:${dur},ease:"${t.transEase}",`
        + `immediateRender:false},${r(at)});`];
    case "cameraPush":
      return [`tl.fromTo(${q(sel)},{scale:1.14,opacity:0,filter:"blur(10px)"},`
        + `{scale:1,opacity:1,filter:"blur(0px)",duration:${dur},ease:"${t.transEase}",`
        + `immediateRender:false},${r(at)});`];
    case "depthWipe":
    default:
      return [`tl.fromTo(${q(sel)},{scale:1.08,opacity:0,clipPath:"inset(0 0 100% 0)",filter:"blur(8px)"},`
        + `{scale:1,opacity:1,clipPath:"inset(0 0 0% 0)",filter:"blur(0px)",`
        + `duration:${dur},ease:"${t.transEase}",immediateRender:false},${r(at)});`];
  }
}

// ---- helpers ----------------------------------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

// ---- THE TOKEN CONTRACT -----------------------------------------------------
// A composer declares WHAT a scene should do, not how:
//
//   { enter:"cardRise3D", idle:"floatSoft", exit:"stackSlide",
//     camera:"pushSlow", text:"wordStaggerBlur", transition:"depthWipe" }
//
// resolveMotion() turns that into timeline source. Keeping composers on tokens
// is the point: an LLM or a deterministic kit picks vocabulary, never raw tween
// code, so the motion language cannot drift film to film.
const TOKENS = {
  text: ["wordStaggerBlur", "characterReveal", "outlineFillReveal", "directionalSlide", "none"],
  enter: ["cardRise3D", "directionalSlide", "depthWipe", "none"],
  idle: ["floatSoft", "floatStill", "none"],
  camera: CAMERA_MOVES,
  transition: TRANSITIONS,
};

/**
 * Turn one scene's animation tokens into GSAP source lines.
 *
 * @param {object} tokens {enter,idle,exit,camera,text,transition}
 * @param {object} ctx    { at, span, index, sel:{scene,card,text,shadow}, ink }
 * @returns {string[]}    timeline source, ready to join into the composition
 */
function resolveMotion(tokens = {}, ctx = {}) {
  const at = Number(ctx.at) || 0;
  const span = Math.max(0.5, Number(ctx.span) || 4);
  const i = Number(ctx.index) || 0;
  const sel = ctx.sel || {};
  const out = [];

  // 1. the scene arrives (transition), 2. its card builds, 3. its text lands,
  // 4. everything keeps breathing for the rest of the scene.
  if (tokens.transition && tokens.transition !== "none" && sel.scene) {
    out.push(...maskedSceneTransition(sel.scene, at, tokens.transition, { index: i }));
  }
  if (sel.card) {
    const cardAt = r(at + 0.12);
    // A stagger is harmless when the selector matches one card and essential
    // when it matches a row: three cards arriving together read as one block.
    if (tokens.enter === "cardRise3D") out.push(...cardRise3D(sel.card, cardAt, { stagger: 0.09 }));
    else if (tokens.enter === "directionalSlide") out.push(...directionalSlide(sel.card, cardAt, i));
    else if (tokens.enter && tokens.enter !== "none") out.push(...maskedSceneTransition(sel.card, cardAt, tokens.enter));
    if (sel.shadow !== false) out.push(...softShadow(sel.card, cardAt));
    if (tokens.idle === "floatSoft") {
      const idleAt = r(cardAt + TIMING.cardDur);
      out.push(...floatingIdle(sel.card, idleAt, Math.max(0.5, span - TIMING.cardDur - 0.12)));
      out.push(...lightSweep(sel.card, idleAt, Math.max(0.5, span - TIMING.cardDur - 0.12)));
    }
  }
  if (sel.text) {
    const textAt = r(at + (sel.card ? 0.3 : 0.18));
    if (tokens.text === "characterReveal") out.push(...characterReveal(sel.text, textAt));
    else if (tokens.text === "outlineFillReveal") out.push(...outlineFillReveal(sel.text, textAt, { ink: ctx.ink, soft: ctx.inkSoft, stroke: ctx.accent }));
    else if (tokens.text === "directionalSlide") out.push(...directionalSlide(sel.text, textAt, i + 1));
    else if (tokens.text !== "none") out.push(...wordStaggerBlur(sel.text, textAt));
  }
  if (tokens.camera && tokens.camera !== "none" && sel.camera) {
    out.push(...cameraMove(sel.camera, at, span, tokens.camera));
  }
  return out;
}

// Deterministic per-scene token assignment: rotates camera and transition so no
// two consecutive scenes share either, without any randomness.
function tokensForScene(i, { hasCard = false, hero = false } = {}) {
  return {
    text: hero ? "characterReveal" : "wordStaggerBlur",
    enter: hasCard ? "cardRise3D" : "none",
    idle: hasCard ? "floatSoft" : "none",
    camera: CAMERA_MOVES[i % CAMERA_MOVES.length],
    transition: TRANSITIONS[i % TRANSITIONS.length],
  };
}

module.exports = {
  TIMING, TOKENS, CAMERA_MOVES, TRANSITIONS,
  runtimeHelpers, resolveMotion, tokensForScene,
  // presets, exported so a composer can reach for one directly
  wordStaggerBlur, characterReveal, outlineFillReveal, headlineGlowPulse, textMorph,
  directionalSlide, overshootSettle,
  cardRise3D, floatingIdle, cardStackTransition, softShadow, lightSweep,
  cursorClickRipple, buttonPress, counterAnimate, scrollReveal,
  slowCameraPush, cameraMove, parallaxLayers, maskedSceneTransition,
};
