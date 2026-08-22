// AUTHORIZATION GUARD — nobody may read or drive somebody else's film, and nobody may guess a
// password or a reset code at leisure.
//
// This suite exists because the defect it covers was invisible to every other one. KEYFRAME had
// signup, login, an httpOnly JWT cookie and an admin allowlist, and used `requireAuth` in exactly
// ONE place: GET /api/auth/me. Every route that did real work answered an anonymous caller —
// GET /api/projects returned the 30 most recent films of every account, GET /api/projects/:id
// returned any project's prompt and script, and POST .../approve let a stranger drive someone
// else's render. 53 suites were green throughout, because none of them ever asked "who is
// calling".
//
// THE ROUTE-TABLE TEST IS THE LOAD-BEARING ONE. Checking a handful of paths by hand proves those
// paths; it does not stop the NEXT route from landing unguarded, which is exactly how
// /api/jobs/:id came to be a second, older door onto the same db.get(). So the last section
// walks the real Express route tables and fails on any route that carries no guard at all.
const assert = require("node:assert");

let pass = 0, fail = 0;
// Accepts a sync OR async body. An async one returns a promise, so it is queued and awaited at
// the end — calling fn() and reporting "ok" immediately would mark a test green the instant its
// promise was CREATED, which is how a suite ends up passing while asserting nothing.
const pending = [];
function test(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === "function") {
      pending.push(out.then(
        () => { console.log(`  ok   ${name}`); pass++; },
        (e) => { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
      ));
      return;
    }
    console.log(`  ok   ${name}`); pass++;
  } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}
function section(t) { console.log(`\n${t}`); }

// ---------------------------------------------------------------- 1. the ownership rule
section("ownership — who may touch a job");

const { canAccess, ownerOf } = require("../src/auth/ownership");

const ALICE = "user-alice";
const BOB = "user-bob";
const hers = { id: "aaaaaa", user_id: ALICE };
const legacy = { id: "bbbbbb" };            // one of the 310 pre-ownership records

test("the owner may access their own job", () => {
  assert.strictEqual(canAccess(hers, ALICE, false), true);
});
test("another signed-in user may NOT — this is the IDOR", () => {
  assert.strictEqual(canAccess(hers, BOB, false), false);
});
test("a missing job is refused rather than throwing", () => {
  assert.strictEqual(canAccess(null, ALICE, false), false);
});
test("an ownerless legacy row is refused for an ordinary user", () => {
  assert.strictEqual(canAccess(legacy, ALICE, false), false);
});
test("an ownerless legacy row IS readable by an admin", () => {
  assert.strictEqual(canAccess(legacy, ALICE, true), true);
});
test("an admin may read another user's job", () => {
  assert.strictEqual(canAccess(hers, BOB, true), true);
});
test("ownerOf reports null for a legacy row, never undefined", () => {
  assert.strictEqual(ownerOf(legacy), null);
  assert.strictEqual(ownerOf(hers), ALICE);
});
test("a job whose user_id is empty string is treated as ownerless, not as a match", () => {
  // Guards the shape of the check itself: `owner === userId` with two falsy values must not
  // become "everyone owns the orphans".
  assert.strictEqual(canAccess({ id: "cccccc", user_id: "" }, "", false), false);
});

// ---------------------------------------------------------------- 2. the list is scoped
section("db.listRecent — scoped, and it cannot be scoped by accident");

const db = require("../src/db");

test("omitting userId THROWS rather than silently listing everyone", () => {
  // The whole defect in one line: this used to default to the entire install.
  assert.throws(() => db.listRecent({ limit: 5 }), /userId is required/);
});
test("allUsers:true is the explicit, greppable opt-out", () => {
  assert.doesNotThrow(() => db.listRecent({ limit: 1, allUsers: true }));
});
test("a scoped list never returns another user's rows", () => {
  const rows = db.listRecent({ limit: 50, userId: "nobody-by-that-name" });
  assert.strictEqual(rows.length, 0, `expected no rows, saw ${rows.length}`);
});
test("the legacy rows do not leak into a scoped list", () => {
  // 310 records predate the owner column; every one must be invisible to a scoped query.
  const all = db.listRecent({ limit: 1000, allUsers: true });
  const ownerless = all.filter((r) => !r.userId);
  const scoped = db.listRecent({ limit: 1000, userId: "nobody-by-that-name" });
  assert.ok(all.length > 0, "expected the fixture store to hold records");
  assert.strictEqual(scoped.length, 0, `${ownerless.length} ownerless row(s) exist and none may appear in a scoped list`);
});

// ---------------------------------------------------------------- 3. credential guessing
section("auth throttles — a code and a password are not free to guess");

const store = require("../src/auth/store");

test("an OTP is burnt after repeated wrong guesses, not merely rejected", () => {
  const email = `otp-guard-${Date.now()}@example.test`;
  store.saveOtp({ email, otp: "123456" });
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const r = store.verifyOtp(email, "000000");
    seen.push(r);
    if (r === "locked") break;
  }
  assert.ok(seen.includes("locked"), `expected a lockout, saw ${seen.join(",")}`);
  assert.ok(seen.length <= 5, `expected <= 5 guesses before lockout, took ${seen.length}`);
  // Burnt means BURNT: the right code no longer works either.
  assert.strictEqual(store.verifyOtp(email, "123456"), "missing");
  store.clearOtp(email);
});

test("a correct code still works within the attempt budget", () => {
  const email = `otp-ok-${Date.now()}@example.test`;
  store.saveOtp({ email, otp: "654321" });
  assert.strictEqual(store.verifyOtp(email, "111111"), "wrong");
  assert.strictEqual(store.verifyOtp(email, "654321"), "ok");
  assert.strictEqual(store.hasVerifiedOtp(email), true);
  store.clearOtp(email);
});

test("repeated failed logins lock the ACCOUNT, so rotating IP buys nothing", () => {
  const email = `login-guard-${Date.now()}@example.test`;
  assert.strictEqual(store.loginLockedUntil(email), 0, "should start unlocked");
  for (let i = 0; i < 12; i++) store.noteFailedLogin(email);
  assert.ok(store.loginLockedUntil(email) > Date.now(), "expected the account to be locked");
  store.clearFailedLogins(email);
});

test("a successful login clears the counter", () => {
  const email = `login-clear-${Date.now()}@example.test`;
  for (let i = 0; i < 12; i++) store.noteFailedLogin(email);
  store.clearFailedLogins(email);
  assert.strictEqual(store.loginLockedUntil(email), 0);
});

// ---------------------------------------------------------------- 4. no unguarded route
section("route tables — every job route carries a guard");

// The guards, by function name. Named function declarations, so these survive into the Express
// layer stack and can be asserted on without exporting anything for the test's benefit.
const GUARDS = new Set(["requireAuth", "requireJobAccess", "requireAdmin"]);

function routesOf(router) {
  const out = [];
  for (const layer of router.stack || []) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
    const handlers = (layer.route.stack || []).map((h) => h.name);
    const handlersRaw = (layer.route.stack || []).map((h) => h.handle);
    out.push({ path: layer.route.path, methods, handlers, handlersRaw });
  }
  return out;
}

const noop = () => {};
const projectsRouter = require("../src/routes/projects").buildRouter({ enqueueIntake: noop, enqueueProduction: noop });
const generateRouter = require("../src/routes/generate").buildRouter({ enqueue: noop });
const jobsRouter = require("../src/routes/jobs");

for (const [label, router] of [["projects", projectsRouter], ["generate", generateRouter], ["jobs", jobsRouter]]) {
  const routes = routesOf(router);
  test(`${label}: every route is guarded (${routes.length} route(s))`, () => {
    assert.ok(routes.length > 0, "expected to find routes");
    const naked = routes.filter((r) => !r.handlers.some((h) => GUARDS.has(h)));
    assert.strictEqual(
      naked.length, 0,
      `unguarded: ${naked.map((r) => `${r.methods.join("/")} ${r.path}`).join(", ")}`
    );
  });
}

// EXPRESS 4 CANNOT SEE A REJECTED PROMISE. An `async (req, res) => {}` registered directly is a
// request that HANGS on any throw — no response, no status, just a dropped socket and a
// process-level unhandledRejection naming neither the route nor the caller. routes/wrap.js
// converts that into next(err); it returns a plain function, so anything still async in a route
// stack is something nobody wrapped.
test("no route handler is a bare async function (Express 4 would hang on a throw)", () => {
  const bare = [];
  for (const [label, router] of [["projects", projectsRouter], ["generate", generateRouter], ["jobs", jobsRouter],
                                 ["admin", require("../src/routes/admin_templates").buildRouter({ enqueueIntake: noop })],
                                 ["auth", require("../src/routes/auth").buildRouter()]]) {
    for (const r of routesOf(router)) {
      // ONLY THE TERMINAL HANDLER. The layers before it are middleware, and the library ones
      // (express-rate-limit v7, multer) are themselves async functions that manage their own
      // rejections — flagging those would be noise that trains people to ignore this test.
      // The last layer is the route's own handler, which is the one that must not be bare.
      const h = (r.handlersRaw || [])[r.handlersRaw.length - 1];
      if (h && h.constructor && h.constructor.name === "AsyncFunction") {
        bare.push(`${label} ${r.methods.join("/")} ${r.path}`);
      }
    }
  }
  assert.strictEqual(bare.length, 0, `unwrapped async handler(s): ${bare.join(", ")}`);
});

test("the admin router guards by router.use, so a new route is protected by default", () => {
  const adminRouter = require("../src/routes/admin_templates").buildRouter({ enqueueIntake: noop });
  const hasUseGuard = (adminRouter.stack || []).some((l) => !l.route && GUARDS.has(l.name));
  assert.ok(hasUseGuard, "expected requireAdmin mounted with router.use()");
});

// ---------------------------------------------------------------- 5. the async safety net
section("wrap() — a rejected handler becomes next(err), not a hung socket");

const { wrap } = require("../src/routes/wrap");

test("a rejecting async handler reaches next(err) instead of vanishing", async () => {
  const boom = new Error("boom");
  let handed = null;
  await new Promise((resolve) => {
    wrap(async () => { throw boom; })({}, {}, (e) => { handed = e; resolve(); });
  });
  assert.strictEqual(handed, boom, "the rejection must arrive at next()");
});

test("a synchronous throw is forwarded too", async () => {
  let handed = null;
  await new Promise((resolve) => {
    wrap(() => { throw new Error("sync boom"); })({}, {}, (e) => { handed = e; resolve(); });
  });
  assert.ok(handed instanceof Error, "a sync throw must also reach next()");
});

test("a handler that resolves never calls next", async () => {
  let called = false;
  await new Promise((resolve) => {
    wrap(async () => {})({}, {}, () => { called = true; });
    setTimeout(resolve, 20);
  });
  assert.strictEqual(called, false);
});

test("wrap returns a NON-async function, which is what the route guard keys on", () => {
  assert.notStrictEqual(wrap(async () => {}).constructor.name, "AsyncFunction");
});

test("server.js registers a 4-arg error handler that redacts a 500", () => {
  // The ARITY is the registration: Express only treats a 4-argument middleware as an error
  // handler, so a 3-arg one would be silently skipped and the default HTML-plus-stack-trace
  // page would come back with nothing failing to say so.
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.ok(/app\.use\(\(err, req, res, _next\)/.test(src), "expected a 4-arg error middleware in server.js");
  assert.ok(/"internal error"/.test(src), "a 500 must not echo the thrown message back to the caller");
});

// ---------------------------------------------------------------- verdict
Promise.all(pending).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
