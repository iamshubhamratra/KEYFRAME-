// Shapes shared by more than one request validator.

const config = require("../config");

// Job/project ids: nanoid over [0-9a-z] (see controllers/generate.js, projects.js).
const JOB_ID_RE = /^[0-9a-z]{6,20}$/;
const isJobId = (id) => JOB_ID_RE.test(String(id || ""));

// The pace modes a request may name. config.pacing also carries the
// `calibration` flag, which is a rollout switch and not a mode anyone can pick.
const PACE_MODES = Object.keys(config.pacing).filter((k) => k !== "calibration");

module.exports = { isJobId, PACE_MODES };
