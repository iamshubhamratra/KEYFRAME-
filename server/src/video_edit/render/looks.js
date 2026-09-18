// VIDEO EDIT LOOKS — one-tap colour grades for the whole edit (settings.look).
//
// WHY THIS EXISTS. Phone footage and stock B-roll rarely match, and "make it look like a film" is the most common
// ask after captions. A look is a short, fixed ffmpeg chain applied in the composite AFTER the A-roll, transitions
// and B-roll are laid down (so the cut-aways are graded with the speaker and the whole edit reads as one piece) but
// BEFORE cards, captions and the logo (so brand colours and text stay exactly as designed). Every chain is mild on
// purpose: skin must stay skin. "natural" (and any unknown value) is no filter at all, so plans written before
// looks existed render byte-for-byte as they did.
//
// CONTRACT:
//   LOOKS — ordered ids ("natural" first) · LOOK_LABELS
//   lookFilter(id, { w, h }) -> ffmpeg filter chain string, or "" for natural / unknown

const LOOKS = Object.freeze(["natural", "warm", "cool", "vivid", "cinematic", "mono", "vintage"]);
const LOOK_LABELS = Object.freeze({
  natural: "Natural", warm: "Warm", cool: "Cool", vivid: "Vivid", cinematic: "Cinematic", mono: "Mono", vintage: "Vintage",
});

function lookFilter(id, { w = 1080 } = {}) {
  // grain scales with resolution so preview (540) and export (1080) read the same
  const grain = Math.max(3, Math.round((w / 1080) * 7));
  switch (id) {
    case "warm":
      return "colorbalance=rm=0.05:gm=0.01:bm=-0.05:rh=0.04:gh=0.01:bh=-0.04,eq=saturation=1.06";
    case "cool":
      return "colorbalance=rm=-0.03:gm=0.005:bm=0.05:rh=-0.02:bh=0.04,eq=saturation=1.02";
    case "vivid":
      return "eq=contrast=1.06:saturation=1.28,unsharp=5:5:0.4:5:5:0";
    case "cinematic":
      // teal shadows, warm highlights, a touch of contrast and a soft vignette
      return "colorbalance=rs=-0.02:bs=0.025:rm=-0.02:bm=0.03:rh=0.06:gh=0.02:bh=-0.05,eq=contrast=1.07:saturation=1.04,vignette=angle=PI/5";
    case "mono":
      return "hue=s=0,eq=contrast=1.12:brightness=0.01";
    case "vintage":
      // faded warm film: blacks lifted a touch (warm, not purple), highlights rolled off, grain
      return `curves=r='0/0.04 0.5/0.53 1/0.96':g='0/0.035 0.5/0.5 1/0.93':b='0/0.03 0.5/0.45 1/0.86',eq=saturation=0.86,vignette=angle=PI/4.5,noise=alls=${grain}:allf=t`;
    default:
      return "";
  }
}

module.exports = { LOOKS, LOOK_LABELS, lookFilter };
