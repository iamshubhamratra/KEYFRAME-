// CAN THE CHOSEN PACK ACTUALLY DRAW A VIDEO CLIP?
//
// The asset layer has been able to fetch stock VIDEO for a long time: the
// planner plans up to two clips, `acquire({type:"video"})` searches Pixabay's
// video API, `validateClip` gates it, and `reencodeForHyperframes` re-encodes it
// so the renderer can seek it frame-exactly. All of that works — verified live,
// the video API returns hits in ~400ms on the current key.
//
// What is NOT true is that anything draws the result. Auditing every composer:
//
//   scene_kit ............ DRAWS IT. Clips get their own pool and are placed as
//                          full-bleed <video> backgrounds, with currentTime
//                          driven off the GSAP timeline so hf-seek stays exact.
//   template_engine ...... drops it — plateOk() is displayOk(a,{allowVideo:false}),
//                          and it backs all eight families and all seven
//                          dedicated template ports.
//   omelette_adapter ..... drops it — its own plateOk() excludes type "video".
//   showcase ............. drops it (plateOk excludes type "video").
//   genesis .............. drops it (plateOk admits only images/image extensions).
//   flagship, brightlife . drop it (explicit /\.(mp4|webm|mov)$/ filter).
//   momentum, bauhaus,
//   bloom, blueprint ..... drop it (explicit type === "video" reject).
//
// And 197 of 261 packs render on omelette, with the rest on template_engine or a
// native composer — `npm run check:templates` reports "0 still on scene-kit". So
// today a planned clip is downloaded, probed, re-encoded through ffmpeg, and then
// discarded by the renderer on EVERY pack. That is pure cost: the slowest asset
// in the job, bought for a frame it can never reach.
//
// So the rule below is not a new restriction — it is the honest statement of what
// the renderers do. A pack without a "renderer" key composes on scene-kit, which
// draws clips; every declared renderer does not. When this is false the caller
// downgrades the need to a still image, which every renderer can draw.
//
// TO TURN VIDEO ON FOR A RENDERER: teach it to place a clip (scene_kit's
// videoBg() is the reference — a full-bleed <video> plus a timeline-driven
// currentTime, never an <img>), then add its renderer key to DRAWS_VIDEO. The
// audit that proves it is worth having before flipping the flag: a clip in an
// <img> renders as a broken-image glyph, not as a blank.

const { getManifest } = require("./frame_manifest");

// Renderer keys (pack.json "renderer") whose composer places a video clip.
// A pack with no "renderer" key composes on scene-kit and is handled below.
const DRAWS_VIDEO = new Set([]);

/**
 * Can a film on this pack show a fetched video clip?
 * Unknown packs answer like a pack with no renderer: scene-kit, which draws them.
 */
function packDrawsVideo(framePack) {
  if (!framePack) return true;                 // no pack pinned → scene-kit
  let renderer = "";
  try { renderer = String((getManifest(framePack) || {}).renderer || ""); }
  catch { return true; }                       // unreadable manifest → scene-kit
  if (!renderer) return true;                  // no dedicated renderer → scene-kit
  return DRAWS_VIDEO.has(renderer);
}

module.exports = { packDrawsVideo, DRAWS_VIDEO };
