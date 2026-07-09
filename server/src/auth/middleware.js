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

module.exports = { requireAuth, optionalAuth, readUserId };
