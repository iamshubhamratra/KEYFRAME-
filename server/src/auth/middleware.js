// JWT-cookie auth guard. Mirrors Taskmate's authFn: read the httpOnly cookie,
// verify the token, attach req.userId. requireAuth blocks (401); optionalAuth
// just annotates the request when a valid session exists.

const { COOKIE, verifyToken } = require("./helpers");
const store = require("./store");

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

// ADMIN GUARD — the backend half of the admin surface.
//
// The brief is explicit that hiding the UI is not authorization, and it is right
// to be: every render route in this app is anonymous today (requireAuth had
// exactly one call site, GET /api/auth/me), so an admin router that trusted the
// client would be the least protected thing in the codebase rather than the most.
//
// 401 vs 403 is deliberate: 401 means "log in", 403 means "logged in, not you" —
// the admin UI needs to tell those apart to know whether to show a login prompt
// or an access-denied page. The user is re-read from the store on every request
// so removing an address from the allowlist takes effect immediately, without
// waiting for the JWT (which carries only { id }) to expire.
function requireAdmin(req, res, next) {
  const id = readUserId(req);
  if (!id) return res.status(401).json({ error: "unauthorized" });
  const user = store.findUserById(id);
  if (!store.isAdmin(user)) return res.status(403).json({ error: "forbidden", detail: "admin only" });
  req.userId = id;
  req.user = store.publicUser(user);
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, readUserId };
