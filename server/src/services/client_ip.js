// THE CALLER'S IP, as far as this process can tell.
//
// Extracted because three call sites needed it and two already had byte-identical private
// copies (routes/projects.js, routes/generate.js). The third is the auth rate limiter, and a
// limiter that keys on a SLIGHTLY different notion of "who is calling" than the quota next to
// it is a bug waiting to happen — it is the kind of difference nobody notices until one of the
// two is trivially evaded.
//
// app.set("trust proxy", true) is on, so req.ip already honours X-Forwarded-For. The header is
// read first anyway to keep behaviour identical to the copies this replaces.
//
// NOT A SECURITY BOUNDARY BY ITSELF. X-Forwarded-For is client-supplied and forgeable unless a
// trusted proxy overwrites it, so an IP quota raises the cost of an attack rather than ending
// it. That is exactly why the auth limits pair every IP quota with a per-ACCOUNT counter that
// no amount of address rotation can shake off.
function clientIp(req) {
  const xff = req && req.headers ? req.headers["x-forwarded-for"] : null;
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || "unknown";
}

module.exports = { clientIp };
