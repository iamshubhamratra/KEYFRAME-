// ASYNC ROUTE HANDLERS, MADE SAFE FOR EXPRESS 4.
//
// Express 4 forwards a SYNCHRONOUS throw from a handler to the error middleware. It does not
// know what a promise is, so an `async (req, res) => {}` that rejects is simply an unhandled
// rejection: nothing is sent, the response object is dropped on the floor, and the request hangs
// until the client gives up. The only trace is a line from the process-level unhandledRejection
// listener in server.js, which names neither the route nor the request.
//
// That is a strictly worse failure than a 500. A 500 is a fast, legible answer; a hang burns a
// socket, a browser tab and a user's patience, and looks like a network problem rather than a
// bug. Two handlers were shaped exactly that way — POST /api/generate had no try at all, and
// POST /api/admin/templates/:id/publish did work BEFORE entering its try — so a throw from
// db.insert or store.get would have hung the caller.
//
// wrap() converts a rejection into next(err), which is what Express already knows how to route.
// Express 5 does this natively; when this upgrades, wrap() becomes a no-op and can go.
//
// It deliberately returns a NON-async function, which is what makes the guard in
// scripts/test-authz.js possible: any AsyncFunction still sitting in a route stack is one nobody
// wrapped, and the test fails on it rather than waiting for a production hang to reveal it.
// BOTH FAILURE SHAPES, one path. `fn(req, res, next)` is called eagerly, so a SYNCHRONOUS throw
// escapes before Promise.resolve ever sees it. Express 4 would catch that particular case by
// itself — but "rejections go to next(), throws go somewhere else that happens to also work" is
// a contract nobody can hold in their head, and it makes the wrapper's behaviour depend on which
// line of the handler failed. The try/catch costs nothing and makes the rule flat: whatever goes
// wrong in here, next(err) hears about it.
function wrap(fn) {
  return function wrapped(req, res, next) {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { wrap };
