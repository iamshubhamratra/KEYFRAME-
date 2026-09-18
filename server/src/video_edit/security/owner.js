// VIDEO EDIT OWNERSHIP — who is asking, and is this project theirs.
//
// WHY THIS EXISTS. Template jobs are anonymous and publicly listed; edit projects hold a person's
// raw footage and must be private. Two checks run on every non-health route (API.md §2 steps 3, 6):
//   requireEditUser  — the JWT cookie (middleware/auth.readUserId) must name a user that STILL exists
//                      in models/user (a deleted account's cookie is dead immediately, not at JWT expiry).
//                      Media and SSE routes may instead present a playback token (`?t=`, §6); a token
//                      that is present but bad or expired is 403 MEDIA_TOKEN_INVALID, never ignored.
//   loadOwnedProject — `:id` must match the id regex BEFORE any disk access, and an unknown id, another
//                      user's project and a project being deleted all answer the same 404 NOT_FOUND, so
//                      ids cannot be probed. A token bound to a different project of the same user is 403.
// The auth modules are required lazily: models/user loads config (and server/.env), which offline tests
// must never pull in — they inject readUserId / findUserById instead.
//
// CONTRACT:
//   requireEditUser({ readUserId, findUserById, verifyMediaToken, allowToken=false, tokenSecret, env, now })
//     -> middleware `requireEditUser`: sets req.userId (+ req.mediaToken when a token authorized it)
//   loadOwnedProject({ store, touch=false, now, touchEveryMs=60000 })
//     -> middleware `loadOwnedProject`: sets req.project (deep clone); `touch` debounces lastOpenedAt
//   readEditUser({ readUserId, findUserById }) -> (req) => userId | null
//     the same cookie + account-exists check, answering instead of rejecting (used by /health to decide
//     whether operational details may be shown). Never accepts a playback token.

const ids = require("../ids");
const { EditError, toErrorBody } = require("../errors");

function userResolver({ readUserId, findUserById } = {}) {
  let read = typeof readUserId === "function" ? readUserId : null;
  let find = typeof findUserById === "function" ? findUserById : null;
  const readFn = () => read || (read = require("../../middleware/auth").readUserId);
  const findFn = () => find || (find = require("../../models/user").findUserById);
  return {
    cookieUser(req) {
      let u = null;
      try { u = readFn()(req) || null; } catch { u = null; }
      return typeof u === "string" && u ? u : null;
    },
    // findUserById is async (Mongo-backed, models/user.js) — await it and fail
    // closed (not authenticated) on any lookup error, same as a missing user.
    async exists(userId) {
      try { return !!(await findFn()(userId)); } catch { return false; }
    },
  };
}

function readEditUser(opts = {}) {
  const users = userResolver(opts);
  return async function readEditUser(req) {
    const userId = users.cookieUser(req);
    return userId && (await users.exists(userId)) ? userId : null;
  };
}

function sendError(req, res, err) {
  res.status(err.status).json(toErrorBody(err, req.requestId || null));
}

const authRequired = () => new EditError("AUTH_REQUIRED", { status: 401, errorClass: "input" });
const tokenInvalid = () => new EditError("MEDIA_TOKEN_INVALID", { status: 403, errorClass: "input" });
const notFound = () => new EditError("NOT_FOUND", { status: 404, errorClass: "input" });

function requireEditUser({
  readUserId, findUserById, verifyMediaToken, allowToken = false, tokenSecret, env = process.env, now = Date.now,
} = {}) {
  const users = userResolver({ readUserId, findUserById });
  let verify = typeof verifyMediaToken === "function" ? verifyMediaToken : null;
  const verifyFn = () => verify || (verify = require("./media_token").verifyMediaToken);

  return async function requireEditUser(req, res, next) {
    try {
      const cookieUser = users.cookieUser(req);
      let userId = cookieUser;
      const t = allowToken && req.query ? req.query.t : undefined;
      if (t !== undefined) {
        const payload = typeof t === "string" ? verifyFn()(t, { secret: tokenSecret, env, now }) : null;
        if (!payload) return sendError(req, res, tokenInvalid());
        if (cookieUser && cookieUser !== payload.userId) return sendError(req, res, tokenInvalid());
        req.mediaToken = payload;
        userId = payload.userId;
      }
      if (!userId) return sendError(req, res, authRequired());
      if (!(await users.exists(userId))) return sendError(req, res, authRequired());
      req.userId = userId;
      return next();
    } catch {
      return sendError(req, res, authRequired());
    }
  };
}

function loadOwnedProject({ store, touch = false, now = Date.now, touchEveryMs = 60 * 1000 } = {}) {
  if (!store) throw new TypeError("video_edit/owner: store is required");
  return function loadOwnedProject(req, res, next) {
    const id = req.params ? req.params.id : undefined;
    if (!ids.isProjectId(id)) return sendError(req, res, notFound());
    let project = null;
    try { project = store.get(id); } catch { project = null; }
    if (!project || project.status === "DELETING" || !req.userId || project.ownerId !== req.userId) {
      return sendError(req, res, notFound());
    }
    if (req.mediaToken && req.mediaToken.projectId !== id) return sendError(req, res, tokenInvalid());
    req.project = project;
    if (touch && !project.storeCorrupt) {
      const t = now();
      if (t - (Number(project.lastOpenedAt) || 0) >= touchEveryMs) {
        Promise.resolve()
          .then(() => store.update(id, (d) => { d.lastOpenedAt = t; }))
          .catch(() => { /* lastOpenedAt only steers retention; never fail a read on it */ });
      }
    }
    return next();
  };
}

module.exports = { requireEditUser, loadOwnedProject, readEditUser };
