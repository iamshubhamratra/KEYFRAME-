// FLIGHT VERTICAL — the 9:16 cut of `flight`.
//
// The reference ships this as a separate 25K file that is the same film re-laid for the tall
// frame. Here it is the SAME module at a different stage: `flight_composer` closes its builders
// over a stage object, so the horizon, the climb arc, the cabin-window row and the instrument
// dials re-proportion themselves rather than being duplicated. Duplicating five builders to
// change a handful of numbers is how two copies of one film drift apart.
//
// The pack still exists separately because `orientation` is what gates selection: a portrait
// job must be able to pick this and a landscape job must not.

const flight = require("./flight_composer");

module.exports = { buildComposition: flight.vertical.buildComposition, STRINGS: flight.STRINGS };
module.exports.__test = flight.__test;
