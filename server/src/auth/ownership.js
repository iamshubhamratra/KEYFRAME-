// WHO MAY TOUCH A JOB.
//
// THE HOLE THIS CLOSES. KEYFRAME shipped a full auth system — signup, login, an httpOnly JWT
// cookie, an admin allowlist — and used `requireAuth` in exactly ONE place: GET /api/auth/me.
// Every route that did actual work was open to the internet. Measured against a running server
// with no cookie at all:
//
//   GET  /api/projects              200 — the 30 most recent films of EVERY user
//   GET  /api/projects/:id          200 — any project's prompt, brief, script and video
//   GET  /api/jobs/:id              200 — the same record through the older door
//   POST /api/projects/:id/approve  202 — approve somebody else's script
//   POST /api/projects/:id/regenerate     — and spend their render budget
//
// There was no owner column either, so "whose project is this" had no answer to give. The list
// was not even a safe reduction: db.listRecent fell back to `prompt.slice(0, 80)` for its title,
// so the anonymous gallery published the opening of every user's prompt.
//
// TWO RULES, ONE PLACE. Everything that reads or mutates a job goes through here, because a
// second copy of "is this yours" is how one of the doors ends up with the older answer — which
// is precisely what /api/jobs/:id was: the same db.get() behind a route nobody re-secured.
//
// 404, NOT 403, for a job that exists but is not yours. This matches requireAdmin's existing
// reasoning: a 403 confirms the id is real, which hands an enumerator exactly the signal they
// came for. A non-owner and a nonexistent id are told the same thing.
//
// LEGACY ROWS ARE ADMIN-ONLY. The 310 records that predate this change carry no user_id and
// there is no honest way to attribute them — client_ip is not an identity, and guessing would
// hand somebody a film they may not have made. They are readable by an admin and invisible to
// everyone else. Nothing is deleted.
const db = require("../db");
const { readUserId } = require("./middleware");
const store = require("./store");

const ID_RE = /^[0-9a-z]{6,20}$/;

/** The owning user id of a job, or null for a legacy/ownerless record. */
function ownerOf(rawJob) {
  return (rawJob && rawJob.user_id) || null;
}

/**
 * May this user see/act on this job?
 * @returns {boolean}
 */
function canAccess(rawJob, userId, isAdmin) {
  if (!rawJob) return false;
  if (isAdmin) return true;              // admins see everything, including the legacy rows
  const owner = ownerOf(rawJob);
  if (!owner) return false;              // ownerless => admin-only
  return owner === userId;
}

/**
 * Express middleware. Resolves :id into `req.job` (the RAW record) and `req.jobIsAdminView`,
 * or ends the request. Mount it on every route that reads or mutates one job.
 *
 * Ordering is deliberate: the id is validated before the session is read so a malformed id is
 * still a 400 for an anonymous caller, and the session is read before the lookup so an
 * unauthenticated caller gets 401 rather than a 404 that leaks whether the id exists.
 */
function requireJobAccess(req, res, next) {
  const id = String(req.params.id || "").trim();
  if (!ID_RE.test(id)) return res.status(400).json({ error: "bad id" });

  const userId = readUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const user = store.findUserById(userId);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  const isAdmin = store.isAdmin(user);

  const raw = db.getRaw(id);
  if (!canAccess(raw, userId, isAdmin)) return res.status(404).json({ error: "not found" });

  req.userId = userId;
  req.user = user;
  req.job = raw;
  req.jobIsAdminView = isAdmin && ownerOf(raw) !== userId;
  next();
}

module.exports = { requireJobAccess, canAccess, ownerOf, ID_RE };
