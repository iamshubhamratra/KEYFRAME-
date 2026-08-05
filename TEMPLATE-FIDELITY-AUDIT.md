# Template fidelity audit — Claude Design reference vs KEYFRAME

**Phase 1 deliverable.** Every difference documented before any change is made.
**Source of truth:** `templete-design/all-template-handoffs/*/src/*-film.jsx`.
**Date:** 5 Aug 2026 · **Scope:** all 20 reference templates, 16 of them ported.

---

## 0. The one hard constraint

The references are React components re-evaluated **every frame**. `useClock()` feeds live
trigonometry straight into styles:

```jsx
const bob = Math.sin(clock * 0.8 + seed) * 6;          // Edition Plate
transform: `translateY(${Math.sin(clock*0.5)*amp}px) rotate(${Math.sin(clock*0.4)*rot}deg)`
```

KEYFRAME renders through HyperFrames, which **seeks** one paused GSAP timeline at
`window.__timelines["vid"]`. There is no per-frame evaluation to hook into. Continuous motion
must therefore be re-expressed as repeating tweens tracing the same curve — same amplitude,
same period, same easing, visually equivalent, authored differently.

This is the only category where "identical" means "equivalent" rather than "the same code".
Everything else — layout, typography, colour, gradients, decoration, spacing, timing, easing —
transcribes exactly via `U(px) = px / STAGE_W * 100` → cqw.

**Reference trigonometry density**, i.e. how much of each template is continuous motion and so
needs this treatment:

| Heavy (15+ trig calls) | Moderate (5–14) | Light (<5) |
| --- | --- | --- |
| Pipeline 23 · Jungle 20 · Fetch/FetchVertical 17 · Stomp 17 · Deep 15 | Birdsong 11 · Showcase 11 · Momentum 10 · Edition 9 · Orbit 7 · Reel 7 · Fight 5 · Flight 5 | Hacker 3 · Drive 2 · Launch 2 · FlightVertical 2 · ShowcaseVertical 2 |

---

## 1. Provenance — why the gap exists

Only **3 of 15** packs were built from the readable JSX. The rest were reverse-engineered from
the gzip+base64 `.dc.html` bundles, then patched scene-by-scene.

| How it was built | Packs | Commit |
| --- | --- | --- |
| **Rebuilt from readable JSX** | drive, momentum, teampulse (Stomp) | `895feaf` |
| **Decompiled from bundle**, later patched | deep, edition, fetch, fight, flight, hacker, jungle, orbit, pipeline, reel, showcase, showcase-vertical | `23f91e9` |
| **Never ported** | Launch, FetchVertical, Birdsong, Cadence | — |

Decompiling recovers **structure** and loses **atmosphere**. Layout and headlines survive
minification because they carry semantic markers; ambient layers are just loops that draw
things, so they vanish. That is precisely the pattern the audit below measures.

---

## 2. Scene coverage — largely NOT the problem

143 reference scenes across 20 templates. After `23f91e9` restored nine dropped scenes, scene
coverage on ported packs is near-complete. Naming differs; the beats exist.

| Template | Reference scenes | KEYFRAME roles | Verdict |
| --- | --- | --- | --- |
| Deep | Descend,Discover,Explore,Signals,Pocket,Surface | descend,discover,explore,pocket,signals,surface | 6/6 (order differs) |
| Drive | Intro,Billboards,Feature,Fleet,Stats,CTA | intro,billboards,feature,fleet,stats,cta | 6/6 exact |
| Edition | Cover,Lead,Spread,Ledger,PullQuote,Colophon | cover,lead,spread,ledger,quote,colophon | 6/6 exact |
| Fetch | Title,**Run**,Fetch,Feature,Stats,CTA | title,fetch,feature,stats,comeplay | **5/6 — `Run` absent** |
| Fight | MainEvent,Challenger,Champion,Combos,Scorecard,StepInRing | main,challenger,champion,tape,combos,card,stepin | 6/6 + extra `tape` |
| Flight | Gate,Takeoff,Climb,Cruise,Instruments,Arrival | gate,climb,cruise,instruments,takeoff,arrival | 6/6 (Takeoff reordered) |
| Hacker | Boot,Access,Compile,Deploy,Metrics,**Run** | boot,access,nodes,compile,metrics,deploy | **5/6 — `Run` absent** |
| Jungle | Enter,Discover,Trek,Sightings,Census,Join | enter,discover,trek,sightings,census,comealong | 6/6 |
| Momentum | Intro,Statement,Feature,Mobile,Stats,Quote,Gallery,CTA | intro,feature,statement,mobile,stats,quote,gallery,cta | 8/8 |
| Orbit | Countdown,Liftoff,Feature,Fleet,Telemetry,CTA | countdown,liftoff,feature,fleet,telemetry,go | 6/6 |
| Pipeline | Boot,Line,Inspect,Assemble,Throughput,Ship | boot,line,inspect,assemble,throughput,ship | 6/6 exact |
| Reel | Hook,Show,Perks,Numbers,Proof,CTA | hook,show,perks,numbers,proof,cta | 6/6 exact |
| ShowcaseVertical | Intro,Tour,Detail,Gallery,Stats,CTA | intro,tour,detail,gallery,stats,cta | 6/6 exact |
| Stomp | 14 scenes | 14 roles | 14/14 |
| **Launch** | Hook,Reveal,Feature,Mobile,Proof,Launch | — | **unported** |
| **FetchVertical** | Title,Run,Fetch,Feature,Stats,CTA | — | **unported** |
| **Birdsong** | Cover,Story,Feature,Gallery,Cards,Numbers,Join | — | **unported** |
| **Cadence** | 17 scenes | — | **unported** |

**Conclusion:** the complaint is not missing beats. It is fidelity *inside* the beats.

---

## 3. Signature-furniture audit — this IS the problem

Presence of each reference's own furniture in our composer. `·` = not in the reference either.

| Template | ambient bg | chrome | ticker | counter | ghost num | clip head | svg cast | blur | mix-blend |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Deep | yes | **MISS** | · | yes | · | · | **MISS** | **MISS** | **MISS** |
| Drive | yes | yes | · | yes | · | · | yes | **MISS** | · |
| Edition | **MISS** | **MISS** | **MISS** | **MISS** | **MISS** | **MISS** | **MISS** | · | **MISS** |
| Fetch | yes | · | · | yes | · | · | **MISS** | · | · |
| Fight | · | **MISS** | · | yes | · | · | **MISS** | · | **MISS** |
| Flight | · | **MISS** | · | yes | · | · | yes | · | · |
| Hacker | yes | · | **MISS** | yes | · | · | **MISS** | · | **MISS** |
| Jungle | yes | **MISS** | · | yes | · | · | **MISS** | · | **MISS** |
| Momentum | yes | · | yes | yes | · | · | yes | **MISS** | · |
| Orbit | yes | **MISS** | · | yes | · | · | **MISS** | · | · |
| Pipeline | yes | **MISS** | · | yes | · | · | **MISS** | **MISS** | · |
| Reel | yes | · | yes | yes | · | · | · | **MISS** | **MISS** |
| Showcase | **MISS** | **MISS** | · | yes | · | · | yes | yes | · |
| ShowcaseVertical | yes | **MISS** | · | yes | · | · | **MISS** | **MISS** | · |
| Stomp | · | yes | yes | yes | · | · | yes | **MISS** | **MISS** |
| FlightVertical | · | **MISS** | · | **MISS** | · | · | **MISS** | · | · |

**Most-missed across the library**

| Missing in | Feature | Why it matters |
| --- | --- | --- |
| **10 of 16** | persistent chrome | The reference draws a masthead/HUD on *every* scene. Without it each beat reads as a standalone slide instead of a page in one publication. |
| **10 of 16** | SVG cast | Hand-drawn decorative SVG (registration marks, instruments, creatures, machinery). The single largest visual-density loss. |
| **7 of 16** | blur | Depth, glass, focus falloff. |
| **7 of 16** | mix-blend-mode | Sheens, screen-blended highlights, ink overprint. |
| 2 | ambient background | Edition's press layer, Showcase's field. |
| 2 | marquee/ticker | Edition, Hacker. |
| 2 | counter | Edition's rolling ledger, FlightVertical. |
| 1 each | ghost numeral, clip-reveal headline, gradient, per-scene wipe | Edition (all four), FlightVertical. |

**These probes measure presence, not treatment — so the real gap is larger than the table.**
Edition scores "yes" on media-caption-bar, but the treatment is still wrong (see §4).

---

## 4. Worked example — Edition, line by line

Full read of `Edition/src/edition-film.jsx` (325 lines) against `edition_composer.js` (359).
Scene coverage 6/6. Every item below is a fidelity defect *within* correct scenes.

### Missing — persistent press layer (`LiveBG`, on every scene)
| Reference | Ours |
| --- | --- |
| Drifting dot grid, 34px, `rgba(ink,0.06)` 1.6px, drifting at `clock*14` / `clock*9` | static radial highlight |
| 12 drifting column rules, `colW=160`, drift `clock*10` (16s cycle) | 5 static rules at `rgba(ink,0.1)` |
| Rotating registration circles at (1560,300) — r360 accent dashed 40/26, r250 ink dashed 14/20, `rotate(clock*6)` = 60s/rev | absent |
| 4 pulsing crosshairs at (180,210) (1740,250) (230,900) (1700,880), alpha 0.2→0.7 at `sin(clock*2.4+i)` | absent |

### Missing — chrome
| Reference | Ours |
| --- | --- |
| Masthead top:40 left/right:64 — `brand` / italic Spectral 18 label / `url` | per-scene dateline only |
| Marquee bottom:40 h26 — `EDITION · edition.press` ×6, scrolling `-(clock*90 % 1200)`, Archivo 700/15/.18em | absent |

### Wrong — plate treatment
| Reference | Ours |
| --- | --- |
| Caption bar **inside** the 2px border: `FIG. III` left, accent label right, Archivo 700/13/.12em | caption **below** the box, mono, no FIG, no accent label |
| Continuous bob `sin(clock*0.8+seed)*6` | none |
| Sheen sweep, 22% wide, `skewX(-12deg)`, `mixBlendMode:screen` | none |
| Hatch placeholder + `+` box + "DROP IMAGE TO REPLACE" | n/a — KEYFRAME never draws an empty container (correct divergence, see §6) |

### Wrong — typography & headline motion
| Reference | Ours |
| --- | --- |
| `ClipHead` — `clipPath: inset(0 X% 0 0)` wipe | `yPercent:112` slide-up |
| Breathing accent measure under headline, `0.6–1.0` width at `sin(clock*1.6)`, max 340px | absent |
| Body copy **Spectral serif** 27–30/1.4–1.5 | JetBrains Mono 24/1.62 in Cover & Lead |
| Label face **Archivo** 800/15/.16em | JetBrains Mono |

### Wrong — per-scene
| Scene | Reference | Ours |
| --- | --- | --- |
| Cover | GhostNum issue "01" Anton **620px** at `rgba(ink,.06)`; eyebrow Spectral italic 34 accent; brand Anton **260** | no ghost numeral, no eyebrow, `fitLines` at ≤190 |
| Lead | GhostNum "02" Anton **300 accent**; chips row bordered top + right dividers; Anton 118 | no ghost numeral; numbered list instead of chips |
| Spread | Plates at exactly (720,300,620×340) (1370,210,300×520) (720,668,620×300) | re-spaced to avoid caption overlap — **no longer needed once the caption moves inside the border** |
| Ledger | Rolling `Counter`, travelling accent tick on each rule, Spectral italic 40 labels, Anton **130** values | plain numbered bullet list, no counters, no ticks |
| PullQuote | **DARK ground** (`#16130D`), giant `"` Anton 300 accent, per-word Spectral **italic 92**, 2 drifting accent blocks, no chrome | cream sheet, uppercase Anton, no quote mark, no blocks |
| Colophon | **Paper** ground, logo plate FIG.VI 260×260, RuleV at x=1080, Spectral 30 body, accent CTA button Anton 34 with `→` | **full-bleed accent**, no logo plate, no rule, no CTA button |

### Missing — the six named wipes
`columns` · `blinds` · `barn` · `iris` · `inkblot` · `diagonal` — one per scene. Ours deals from
`transition_kit` under `signature:"editorial"`.

---

## 5. Typography — reference faces vs ours

All reference faces are bundled (`src/fonts/pack_fonts.js`, 26 families), so substitution is a
choice, not a constraint.

| Template | Reference faces | Notes |
| --- | --- | --- |
| Edition | Anton · Spectral · Archivo | ours substitutes JetBrains Mono for both Spectral and Archivo |
| Deep | Outfit · DM Mono | |
| Drive | Barlow Semi Condensed · Sora | measured-advance pass still owed |
| Fight | Anton · Oswald | measured-advance pass still owed |
| Flight/FlightVertical | Manrope · DM Mono | |
| Hacker | JetBrains Mono | single face |
| Jungle | Chewy · Nunito | |
| Momentum | Hanken Grotesk · Space Mono | |
| Orbit | Space Grotesk · JetBrains Mono | |
| Pipeline | Chakra Petch · IBM Plex Mono | |
| Reel | Archivo · Baloo 2 | |
| Showcase/ShowcaseVertical | Space Grotesk · JetBrains Mono | |
| Stomp/Cadence | Caprasimo · Figtree | |
| Fetch/FetchVertical | Fredoka · Nunito | |
| Birdsong | Bricolage Grotesque · Karla | |

---

## 6. Deliberate divergences — to keep, and why

Not every difference is a defect. These are load-bearing KEYFRAME rules and should **not** be
"fixed" toward the reference:

1. **Never draw an empty container.** The reference ships hatch placeholders reading "DROP IMAGE
   TO REPLACE" — correct for a design handoff, wrong for a delivered customer film. KEYFRAME
   collapses to a pictureless layout instead.
2. **Never leave an empty frame.** Pictureless beats fall back to `statement`.
3. **Dynamic type must fit.** The reference hard-codes font sizes against known copy; ours
   measures with `fitLines`/`fitOne` because the headline is AI-authored and variable-length.
   Sizes should match the reference *when the copy is the same length*, not unconditionally.
4. **Picture-bearing roles lead `spec.middle`.** Short films have one middle slot; the rotating
   cursor must land on a role that can hold an image (see the momentum `FAIL_TEXT_ONLY` fix).
5. **Repeating tweens instead of per-frame trig** — §0.

---

## 7. Remediation plan

Rebuild each decompiled pack against the readable JSX, the method proven on drive/momentum/
teampulse. Order by furniture density — most to gain first:

| Wave | Templates | Rationale |
| --- | --- | --- |
| 1 | **edition**, **hacker** | Heaviest furniture; Edition fully specified in §4 already |
| 2 | **pipeline**, **deep**, **jungle** | Highest trig density (23/15/20) — richest ambient systems |
| 3 | **orbit**, **fight**, **flight**, **flight-vertical** | Moderate density, shared idioms |
| 4 | **showcase**, **showcase-vertical**, **reel** | Closest to correct already |
| 5 | **fetch** (+ `Run` scene), **hacker `Run`** | Needs the SVG dog/park cast |
| 6 | **Launch**, **FetchVertical**, **Birdsong**, **Cadence** | Net-new ports (Cadence is 17 scenes / own design system) |

Cost, measured against the three rebuilds already done: **roughly one session per template.**

### Cross-cutting fixes worth doing once, not sixteen times
- A shared **`press`/ambient layer helper** in `om_port_kit` — 10 of 16 need persistent chrome.
- A shared **captioned-plate** primitive (caption bar inside the border, bob, sheen).
- A shared **clip-reveal headline** + breathing measure.
- **~100 bare `.slice(0,N)`** calls on user-facing text across the family — each one a clipped
  line waiting to surface (momentum's poster already did).

---

## 8. Validation method

Lint, goldens, `npm test`, portrait and transitions have passed through **every** visual defect
this library has had. They are necessary and not sufficient. Each rebuilt template must be
validated by:

1. `node scratchpad/shot-ref.js <Template> ref/<Template>` — reference frames (this harness is
   new; previously the reference could only be read as code, never watched).
2. `node scripts/make-pack-preview.js <pack> --force` — our render + `asset-check` status.
3. Frame-by-frame comparison against §4-style checklist for that template.
4. `npm test && npm run test:transitions && npm run test:portrait && npm run test:golden`.

Status: **Phase 1 complete. No code changed yet.**
