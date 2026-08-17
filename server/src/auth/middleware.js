// JWT-cookie auth guard. Mirrors Taskmate's authFn: read the httpOnly cookie,
// verify the token, attach req.userId. requireAuth blocks (401); optionalAuth
// just annotates the request when a valid session exists.

const { COOKIE, verifyToken } = require("./helpers");

function readUserId(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const decoded = verifyToken(token);
  return decoded?.id || null;
}

function requireAuth(req, res, next) {
  const id = readUserId(req);
  if (!id) return res.status(401).json({ error: "unauthorized" });
  req.userId = id;
  next();
}

function optionalAuth(req, _res, next) {
  req.userId = readUserId(req);
  next();
}

// ADMIN GATE. Every /api/admin route sits behind this.
//
// THE ROLE IS READ FROM THE USER RECORD, NOT FROM THE TOKEN. The JWT carries only `{id}`, and
// deliberately keeps carrying only that: a role baked into a 7-day token cannot be revoked for
// 7 days, so demoting an account would leave a live admin session behind it. Loading the record
// per request costs an array scan over a file-backed store — nothing, at this scale — and makes
// the allowlist take effect immediately in both directions.
//
// It answers 404 rather than 403 for a signed-in non-admin. There is no product reason for an
// ordinary user to learn that an admin API exists at this path, and the admin surface can
// create and publish templates.
function requireAdmin(req, res, next) {
  const id = readUserId(req);
  if (!id) return res.status(401).json({ error: "unauthorized" });
  const store = require("./store");
  const user = store.findUserById(id);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!store.isAdmin(user)) return res.status(404).json({ error: "not found" });
  req.userId = id;
  req.user = user;
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, readUserId };
