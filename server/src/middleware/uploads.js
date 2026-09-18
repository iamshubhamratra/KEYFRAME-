// Multipart uploads for POST /api/projects. JSON bodies bypass multer entirely.
// Three file fields:
//   referenceVideo — 1 video, transcribed at intake
//   logo           — 1 image, the user's own brand logo (SVG allowed HERE ONLY)
//   assets         — up to 12 images, the user's own product material (tier-100 pins)

const path = require("node:path");
const multer = require("multer");
const { customAlphabet } = require("nanoid");
const config = require("../config");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
// SVG is logo-only: a vector logo is safe as an <img> in the headless render page
// (scripts don't execute in <img>), but arbitrary SVGs skip every ffprobe gate
// (asset_sources/util.validateImage returns ok:true for .svg WITHOUT probing),
// so the general assets field stays raster-only.
const LOGO_MIMES = new Set([...IMAGE_MIMES, "image/svg+xml"]);
const MAX_USER_IMAGES = 12;
const IMAGE_MAX_MB = 15;
// The saved extension comes from the MIME, never the client filename: the old
// `extname || ".mp4"` default mislabeled anything extension-less as video, and
// downstream code sniffs extensions.
const MIME_EXT = {
  "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.paths.uploadsDir),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || (path.extname(file.originalname) || ".bin").toLowerCase().slice(0, 8);
      cb(null, `${nanoid()}${ext}`);
    },
  }),
  // fileSize is multer-GLOBAL and video-sized; the tighter per-image cap is
  // enforced post-parse (validators/project.js) — multer cannot do per-field sizes.
  limits: { fileSize: (config.ingest?.maxUploadMb || 200) * 1024 * 1024, files: 2 + MAX_USER_IMAGES },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "referenceVideo") {
      if (VIDEO_MIMES.has(file.mimetype)) return cb(null, true);
      return cb(new Error(`unsupported video type ${file.mimetype} (mp4/mov/webm only)`));
    }
    if (file.fieldname === "logo") {
      if (LOGO_MIMES.has(file.mimetype)) return cb(null, true);
      return cb(new Error(`unsupported logo type ${file.mimetype} (png/jpg/webp/svg only)`));
    }
    if (file.fieldname === "assets") {
      if (IMAGE_MIMES.has(file.mimetype)) return cb(null, true);
      return cb(new Error(`unsupported image type ${file.mimetype} (png/jpg/webp only)`));
    }
    return cb(new Error(`unexpected file field "${file.fieldname}" (use referenceVideo, logo, or assets)`));
  },
});
const uploadFields = upload.fields([
  { name: "referenceVideo", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "assets", maxCount: MAX_USER_IMAGES },
]);

// Parse multipart bodies; pass JSON requests straight through.
function projectUploads(req, res, next) {
  if (!req.is("multipart/form-data")) return next();
  uploadFields(req, res, (err) => {
    if (err) {
      // Multer's field-count errors are cryptic ("Unexpected field") — translate.
      const msg = err.code === "LIMIT_UNEXPECTED_FILE"
        ? `too many files or unknown file field "${err.field}" (referenceVideo ×1, logo ×1, assets ×${MAX_USER_IMAGES})`
        : err.message;
      return res.status(400).json({ error: "upload failed", details: [msg] });
    }
    next();
  });
}

module.exports = { projectUploads, MIME_EXT, IMAGE_MAX_MB };
