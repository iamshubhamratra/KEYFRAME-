// VIDEO EDIT IDS — every identifier the edit subsystem mints.
//
// WHY THIS EXISTS. Project ids appear in URLs, directory names and the index, so they must be
// unguessable (no enumeration of other users' projects), filesystem-safe on Windows (lowercase
// only: NTFS is case-insensitive, so mixed-case ids could collide as directories) and cheap to
// validate with one regex before any disk access. Element / run / render ids share the
// `<prefix>_<8>` shape from EDIT_PLAN so logs and plans read the same everywhere.
//
// CONTRACT: newProjectId() -> "ve_" + 16 [0-9a-z] · isProjectId(s) · newId(prefix) -> prefix + "_" + 8 [0-9a-z]
//           newRunId() -> "run_…" · newRenderId() -> "rd_…"

const { customAlphabet } = require("nanoid");

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const id16 = customAlphabet(ALPHABET, 16);
const id8 = customAlphabet(ALPHABET, 8);

const PROJECT_ID_RE = /^ve_[0-9a-z]{16}$/;
const PREFIX_RE = /^[a-z][a-z0-9]{0,15}$/;

function newProjectId() { return `ve_${id16()}`; }

function isProjectId(s) { return typeof s === "string" && PROJECT_ID_RE.test(s); }

function newId(prefix) {
  const p = String(prefix || "id");
  if (!PREFIX_RE.test(p)) throw new Error(`ids.newId: invalid prefix`);
  return `${p}_${id8()}`;
}

function newRunId() { return newId("run"); }
function newRenderId() { return newId("rd"); }

module.exports = { newProjectId, isProjectId, newId, newRunId, newRenderId, PROJECT_ID_RE };
