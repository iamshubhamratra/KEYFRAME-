// MongoDB connection — single lazy, cached client for the auth store
// (models/user.js). Free-tier Atlas: MONGODB_URI must include a database name
// (e.g. "...mongodb.net/keyframe?..."); if it doesn't, MONGODB_DB names it.
//
// Lazy + cached: server.js does not depend on Mongo being up to boot (mirrors
// the SECRET_KEY pattern — warn, don't crash unrelated features). The first
// auth request pays the connect cost and every one after reuses it.

const { MongoClient } = require("mongodb");

const URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.MONGODB_DB || "keyframe";

let client = null;
let dbPromise = null;

async function connect() {
  if (dbPromise) return dbPromise;
  if (!URI) throw new Error("MONGODB_URI not set — cannot reach the user store");
  dbPromise = (async () => {
    client = new MongoClient(URI, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`[mongo] connected (db: ${DB_NAME})`);
    // Idempotent — safe to run on every boot. email/id lookups are the hot path.
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ id: 1 }, { unique: true });
    await db.collection("otps").createIndex({ email: 1 }, { unique: true });
    // deleteAt (not expiresAt — see models/user.js) already includes the
    // post-verification grace window, so TTL cleanup never fires early.
    await db.collection("otps").createIndex({ deleteAt: 1 }, { expireAfterSeconds: 0 });
    return db;
  })();
  try {
    return await dbPromise;
  } catch (e) {
    dbPromise = null; // let the next call retry instead of caching a dead connection
    throw e;
  }
}

module.exports = { connect };
