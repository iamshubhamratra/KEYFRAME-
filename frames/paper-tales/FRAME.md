---
version: alpha
name: Paper Tales — Frame
description: >
  A pop-up storybook come alive. The film happens inside a picture book on a
  warm desk: rose cloth covers, cream paper spreads, chapter tabs, paper-cutout
  characters with blinking eyes, watercolor blooms and a pen that handwrites
  the asides in Caveat. Pages physically TURN between chapters; pop-ups fold up
  from the page crease with a cast shadow; confetti falls like torn paper.
  Sweet, gentle and sincere — nothing glossy, nothing loud. For stories,
  founders' letters, gifts, education and anything told from the heart.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
colors:
  paper: "#FFF9F0"
  cream: "#FBF1E1"
  ink: "#6B5B73"
  soft: "#A08D97"
  rose: "#E8938C"
  butter: "#F7C873"
  sky: "#9CCFE8"
  mint: "#9CCEA4"
  lilac: "#C5AEDD"
typography:
  body:       { fontFamily: "Quicksand", cqw: 1.0, weight: 600, lineHeight: 1.5, color: "soft" }
  hand:       { fontFamily: "Caveat", cqw: 2.15, weight: 600, color: "soft" }
  chapter:    { fontFamily: "Quicksand", px: 14, weight: 700, tracking: "0.24em", upper: true, onTab: true }
  heading-md: { fontFamily: "Quicksand", cqw: 2.7, weight: 700, lineHeight: 1.15 }
  heading-lg: { fontFamily: "Quicksand", cqw: 4.0, weight: 700, lineHeight: 1.05 }
atoms:
  page-spread: >
    Two cream paper pages joined at a soft spine crease, rounded outer corners,
    faint ruled ghost lines. Content lives ON the paper; the desk stays visible
    around the book.
  chapter-tab: >
    A colored tab hanging from the page top edge (rounded bottom corners),
    white uppercase letter-spaced label. One accent color per chapter.
  pop-up: >
    The signature atom. Any illustration folds UP from the page crease:
    rotateX -88 → 0 with a slight overshoot, while a soft elliptical cast
    shadow fades in and widens beneath it.
  pen-line: >
    A Caveat aside revealed left-to-right (clip-path) while a pen nib travels
    the same span with tiny bobbing strokes, lifting away at the period.
  paper-friend: >
    A cutout person: pastel rounded body, cream head, dot eyes that BLINK
    (scaleY squeeze), blush cheeks, tiny smile.
motion:
  page-turn: "chapters change by turning a leaf — never a bare cut"
  fold-up: "content pops up from the crease; exits fold back down or fade"
  handwrite: "asides are written, not shown"
  soak: "watercolor blooms scale in with multiply blending"
never:
  - hard shadows, neon, gradient-clipped chrome text (this is paper and ink)
  - fast whip motion; everything settles like paper — soft overshoot, no blur storms
  - more than one saturated accent per spread (chapters own one color each)
---

# Paper Tales

The film is a book being read to you. Headlines are page headings; asides are
handwritten by a pen; illustrations fold up out of the page like a pop-up book;
chapters change by physically turning a page. The palette is bedtime-soft and
the pacing is unhurried — a story, not a pitch.

Reference render: `frame-showcase.html` (36s, 1920×1080).
