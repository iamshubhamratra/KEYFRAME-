// Deterministic in-process emulator of the OpenRouter and KIE endpoints AI Video Edit analysis calls.
//
// WHY THIS EXISTS. The STT chain's value is its failure handling — a 400 for verbose_json, a 200 with
// an empty billed transcript, a KIE task that sits in `waiting`, a chat model that renames island ids —
// and none of that can be exercised against real providers on demand, offline, for free. This server
// reproduces the live-verified behaviour (ANALYSIS.md §1) from a fixture TRUTH (words with filler
// flags) so tests run the real transport, breaker and validation code. Tests point providers at it
// with settings.providerBaseOverride (honoured only outside production).
//
// USAGE:
//   const mock = await startMockProviders({ truth, pcm });
//   settings = makeSettings(root, { env: { VIDEO_EDIT_OPENROUTER_BASE: mock.openrouterBase, VIDEO_EDIT_KIE_BASE: mock.kieBase } })
//   mock.enqueue(route, spec)       route: 'stt' | 'stt:<model>' | 'chat' | 'chat:<model>' | 'kie:upload' | 'kie:create' |
//                                   'kie:record' | 'key' | 'credits'; spec: { status=200, headers, json|text, times=1 } or
//                                   fn(ctx) -> spec | undefined (fall through to the emulator)
//   mock.setTruth(truth) · mock.setPcm(wavBuffer) · mock.setChunkResolver(fn({durationSec, body}) -> offsetSec) ·
//   mock.useChunkPlan(chunks) · mock.setModel(model, patch) · mock.setChatModel(model, { badIdsTimes, invalidTimes,
//   status, cost, serveModel }) · mock.setChatResponder(fn(body) -> object) · mock.setKie({ mode:'stall'|'success'|'fail'|
//   'create500'|'generating', waitPolls, credits, languageCode }) · mock.setBudget({ limitRemaining, limit, totalCredits,
//   totalUsage }) · mock.scenarios[name] = { [route]: spec } (selected by request header x-mock-scenario)
//   mock.calls (never audio bytes) · mock.count({ route, model }) · mock.reset() · await mock.close()
// truth = { language, durationSec, words:[{ text, start, end, filler? }] }  (source seconds)

const http = require("node:http");
const crypto = require("node:crypto");

const FILLER_RE = /^(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|eh|em)$/i;
const LANG_NAMES = { en: "english", es: "spanish", fr: "french", de: "german", pt: "portuguese", hi: "hindi", ar: "arabic", ja: "japanese" };
const ISO3 = { en: "eng", es: "spa", fr: "fra", de: "deu", pt: "por", hi: "hin", ar: "ara", ja: "jpn" };
const VERBOSE_REJECT = { error: { message: "The selected model does not support response_format \"verbose_json\". Use \"json\" instead.", code: 400 } };

const DEFAULT_MODELS = Object.freeze({
  "microsoft/mai-transcribe-2": { segments: true, jitterMs: 25, costPerHour: 0.1, billRoundUp: true },
  "openai/whisper-large-v3-turbo": { dropFillers: true, collapseRepeats: true, leadingSpace: true, jitterMs: 60, costPerHour: 0.012, task: true },
  "deepgram/nova-3": { dropFillers: true, foldFillers: true, segments: true, jitterMs: 40, costPerHour: 0.258, emptyWithoutLanguage: true, echoLanguage: true },
  "openai/whisper-1": { dropFillers: true, languageName: true, zeroLengthEvery: 7, jitterMs: 50, costPerHour: 0.36, billRoundUp: true, task: true },
  "openai/gpt-4o-mini-transcribe": { rejectVerbose: true },
  "mistralai/voxtral-mini-transcribe": { rejectVerbose: true },
  "qwen/qwen3-asr-flash-2026-02-10": { rejectVerbose: true },
  "google/chirp-3": { rejectVerbose: true },
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const norm = (t) => String(t || "").toLowerCase().replace(/[\p{P}]+/gu, "").trim();

function seeded(seed) {
  let h = crypto.createHash("sha1").update(String(seed)).digest().readUInt32LE(0);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mp3DurationSec(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  let i = 0;
  if (buf.toString("latin1", 0, 3) === "ID3" && buf.length > 10) {
    i = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let samples = 0, sr = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3;
    const brIdx = (buf[i + 2] >> 4) & 15, srIdx = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
    const mpeg1 = ver === 3;
    const bitrate = (mpeg1 ? BR1 : BR2)[brIdx] * 1000;
    const rate = SR[ver][srIdx];
    const spf = mpeg1 ? 1152 : 576;
    const len = Math.floor(((spf / 8) * bitrate) / rate) + pad;
    if (len < 4) { i++; continue; }
    sr = rate;
    samples += spf;
    i += len;
  }
  return sr ? samples / sr : null;
}

function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  let off = 12, fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), blockAlign: buf.readUInt16LE(off + 20) };
    if (id === "data" && fmt) return { ...fmt, data: buf.subarray(off + 8, Math.min(buf.length, off + 8 + size)) };
    off += 8 + size + (size % 2);
  }
  return null;
}

function readBody(req, limit = 96 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let n = 0;
    req.on("data", (d) => { n += d.length; if (n > limit) { reject(new Error("body too large")); req.destroy(); } else parts.push(d); });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ""));
  const out = { fields: {}, file: null };
  if (!m) return out;
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  let pos = buf.indexOf(boundary);
  while (pos >= 0) {
    const start = pos + boundary.length;
    const next = buf.indexOf(boundary, start);
    if (next < 0) break;
    const part = buf.subarray(start + 2, next - 2);
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd > 0) {
      const head = part.subarray(0, headEnd).toString("utf8");
      const body = part.subarray(headEnd + 4);
      const name = (/name="([^"]*)"/i.exec(head) || [])[1];
      const filename = (/filename="([^"]*)"/i.exec(head) || [])[1];
      if (filename != null) out.file = { name: filename, field: name, bytes: Buffer.from(body) };
      else if (name) out.fields[name] = body.toString("utf8");
    }
    pos = next;
  }
  return out;
}

function send(res, status, payload, headers = {}) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": typeof payload === "string" ? "text/plain" : "application/json", ...headers });
  res.end(text);
}

async function startMockProviders(options = {}) {
  const state = {
    truth: options.truth || null,
    pcm: null,
    pcmInfo: null,
    models: JSON.parse(JSON.stringify(DEFAULT_MODELS)),
    queues: new Map(),
    calls: [],
    chunkResolver: null,
    budget: { limitRemaining: 50, limit: 100, totalCredits: 100, totalUsage: 10 },
    kie: { mode: "stall", waitPolls: 1, credits: 2.2, languageCode: null },
    tasks: new Map(),
    uploads: new Map(),
    chat: { models: {}, responder: null, defaultCost: 0.00022 },
    seq: 0,
    unauthorized: 0,   // requests without a bearer token; never reset
  };
  const scenarios = {};

  const api = {};
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => { try { send(res, 500, { error: { message: `mock crash: ${e.message}`, code: 500 } }); } catch { /* socket gone */ } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  function scripted(route, model, ctx) {
    const headerScenario = ctx.req && ctx.req.headers["x-mock-scenario"];
    const sc = headerScenario && scenarios[headerScenario];
    const keys = model ? [`${route}:${model}`, route] : [route];
    if (sc) for (const k of keys) if (sc[k]) return typeof sc[k] === "function" ? sc[k](ctx) : sc[k];
    for (const k of keys) {
      const q = state.queues.get(k);
      if (!q || !q.length) continue;
      for (let i = 0; i < q.length; i++) {
        const entry = q[i];
        const spec = typeof entry.spec === "function" ? entry.spec(ctx) : entry.spec;
        if (!spec) continue;
        entry.times--;
        if (entry.times <= 0) q.splice(i, 1);
        return spec;
      }
    }
    return null;
  }

  function reply(res, spec, call) {
    const status = spec.status || 200;
    call.status = status;
    call.scripted = true;
    if (spec.json && spec.json.usage && typeof spec.json.usage.cost === "number") call.cost = spec.json.usage.cost;
    if (spec.text != null) return send(res, status, String(spec.text), spec.headers || {});
    return send(res, status, spec.json !== undefined ? spec.json : {}, spec.headers || {});
  }

  function authorized(req) { return /^Bearer\s+\S+/.test(String(req.headers.authorization || "")); }

  function truthWindow(offset, dur) {
    const t = state.truth;
    if (!t || !Array.isArray(t.words)) return [];
    return t.words
      .filter((w) => { const mid = (w.start + w.end) / 2; return mid >= offset - 1e-6 && mid < offset + dur; })
      .map((w) => ({ text: w.text, start: w.start - offset, end: w.end - offset, filler: !!w.filler || FILLER_RE.test(norm(w.text)) }));
  }

  function transcription(model, beh, body, offset, dur) {
    const lang = (state.truth && state.truth.language) || "en";
    const usageSeconds = beh.billRoundUp ? Math.ceil(dur) : r3(dur);
    const usage = { seconds: usageSeconds, cost: (usageSeconds / 3600) * (beh.costPerHour || 0.1) };
    if (beh.emptyWithoutLanguage && !body.language && lang !== "en") {
      return { text: "", usage, duration: r3(dur), segments: [{ id: 0, start: 0, end: r3(dur), text: "" }], words: [] };
    }
    let words = truthWindow(offset, dur);
    if (beh.dropFillers) {
      const kept = [];
      let folded = null;
      for (const w of words) {
        if (w.filler) { if (beh.foldFillers && folded == null) folded = w.start; continue; }
        kept.push(folded != null ? { ...w, start: folded } : w);
        folded = null;
      }
      words = kept;
    }
    if (beh.collapseRepeats) words = words.filter((w, k) => k === 0 || norm(w.text) !== norm(words[k - 1].text));
    const rng = seeded(`${model}|${offset}|${dur}`);
    const jit = (beh.jitterMs || 0) / 1000;
    const out = words.map((w, k) => {
      let s = Math.max(0, w.start + (rng() * 2 - 1) * jit);
      let e = Math.max(s + 0.02, w.end + (rng() * 2 - 1) * jit);
      if (beh.zeroLengthEvery && k % beh.zeroLengthEvery === 3) e = s;
      return { word: `${beh.leadingSpace ? " " : ""}${w.text}`, start: s, end: e };
    });
    const text = words.map((w) => w.text).join(" ");
    const resp = { text: beh.leadingSpace ? ` ${text}` : text, usage };
    if (beh.task) resp.task = "transcribe";
    if (beh.echoLanguage) { if (body.language) resp.language = body.language; }
    else resp.language = beh.languageName ? (LANG_NAMES[lang] || lang) : lang;
    resp.duration = r3(dur);
    if (beh.segments) resp.segments = [{ id: 0, start: 0, end: r3(dur), text }];
    resp.words = out;
    return resp;
  }

  function offsetFor(dur, body) {
    if (typeof state.chunkResolver !== "function") return 0;
    const v = Number(state.chunkResolver({ durationSec: dur, body }));
    return Number.isFinite(v) ? v : 0;
  }

  function findPcmOffset(wavBuf) {
    const w = parseWav(wavBuf);
    if (!w || !state.pcm || !state.pcmInfo || w.data.length < 3200) return null;
    const ba = w.blockAlign || 2;
    const probeLen = 960;
    const mid = Math.floor(w.data.length / 2 / ba) * ba;
    const probe = w.data.subarray(mid, mid + probeLen);
    let idx = state.pcm.indexOf(probe);
    while (idx >= 0) {
      const startBytes = idx - mid;
      if (startBytes >= 0 && startBytes % ba === 0
          && state.pcm.compare(w.data, 0, probeLen, startBytes, startBytes + probeLen) === 0) {
        return { offset: startBytes / ba / state.pcmInfo.sampleRate, dur: w.data.length / ba / w.sampleRate };
      }
      idx = state.pcm.indexOf(probe, idx + 1);
    }
    return null;
  }

  function defaultIslandResponder(body) {
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    const user = msgs.find((m) => m && m.role === "user");
    const parts = user && Array.isArray(user.content) ? user.content : [];
    const islands = [];
    let current = null;
    for (const p of parts) {
      if (p && p.type === "text") {
        const m = /^ISLAND ([A-Z]+) \(/.exec(p.text || "");
        if (m) current = m[1];
        continue;
      }
      let b64 = null;
      if (p && p.type === "input_audio" && p.input_audio) b64 = p.input_audio.data;
      if (p && p.type === "image_url" && p.image_url && /^data:audio\/wav;base64,/.test(p.image_url.url || "")) b64 = p.image_url.url.split(",")[1];
      if (!b64 || !current) continue;
      const hit = findPcmOffset(Buffer.from(b64, "base64"));
      const words = hit ? truthWindow(hit.offset, hit.dur) : [];
      islands.push({
        id: current, speech: words.length > 0, lang: (state.truth && state.truth.language) || "en",
        words: words.map((w) => ({ w: w.text, filler: w.filler })), conf: hit ? 0.9 : 0.3,
      });
      current = null;
    }
    return { islands };
  }

  async function handle(req, res) {
    const url = new URL(req.url, baseUrl);
    const p = url.pathname;
    const raw = await readBody(req);
    const call = { route: null, model: null, method: req.method, path: p, status: 0, at: Date.now() };
    const ctx = { req, url };

    if (p.startsWith("/tempfile/")) {
      const up = state.uploads.get(p.slice("/tempfile/".length).replace(/\.[a-z0-9]+$/i, ""));
      if (!up) return send(res, 404, { error: "gone" });
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      return res.end(up.bytes);
    }

    const routes = {
      "/api/v1/audio/transcriptions": "stt", "/api/v1/chat/completions": "chat", "/api/v1/key": "key", "/api/v1/credits": "credits",
      "/api/file-stream-upload": "kie:upload", "/api/v1/jobs/createTask": "kie:create", "/api/v1/jobs/recordInfo": "kie:record",
    };
    call.route = routes[p] || "unknown";
    state.calls.push(call);
    if (call.route === "unknown") { call.status = 404; return send(res, 404, { error: { message: "not found", code: 404 } }); }
    if (!authorized(req)) {
      call.status = 401;
      state.unauthorized++;
      return send(res, 401, { error: { message: "No auth credentials found", code: 401 } });
    }

    if (call.route === "stt") {
      let body;
      try { body = JSON.parse(raw.toString("utf8")); } catch { call.status = 400; return send(res, 400, { error: { message: "invalid JSON body", code: 400 } }); }
      call.model = body.model || null;
      call.language = body.language || null;
      call.responseFormat = body.response_format || null;
      const b64 = body.input_audio && body.input_audio.data;
      if (!b64) { call.status = 400; return send(res, 400, { error: { message: "input_audio required", code: 400 } }); }
      call.format = body.input_audio.format || null;
      const dur = mp3DurationSec(Buffer.from(b64, "base64")) || (state.truth && state.truth.durationSec) || 1;
      call.durationSec = r3(dur);
      Object.assign(ctx, { body, durationSec: dur, call });
      const sp = scripted("stt", call.model, ctx);
      if (sp) return reply(res, sp, call);
      const beh = state.models[call.model];
      if (!beh) { call.status = 404; return send(res, 404, { error: { message: `${call.model} is not a valid model ID`, code: 404 } }); }
      if (beh.rejectVerbose && body.response_format === "verbose_json") { call.status = 400; return send(res, 400, VERBOSE_REJECT); }
      call.status = 200;
      const resp = transcription(call.model, beh, body, offsetFor(dur, body), dur);
      call.cost = resp.usage.cost;
      call.words = resp.words.length;
      return send(res, 200, resp);
    }

    if (call.route === "chat") {
      let body;
      try { body = JSON.parse(raw.toString("utf8")); } catch { call.status = 400; return send(res, 400, { error: { message: "invalid JSON body", code: 400 } }); }
      call.model = body.model || null;
      const user = (body.messages || []).find((m) => m && m.role === "user");
      const parts = user && Array.isArray(user.content) ? user.content : [];
      call.audioPartTypes = parts.filter((x) => x && x.type !== "text").map((x) => x.type);
      call.islandIds = parts.filter((x) => x && x.type === "text" && /^ISLAND /.test(x.text || "")).map((x) => /^ISLAND ([A-Z]+)/.exec(x.text)[1]);
      call.repair = parts.some((x) => x && x.type === "text" && /failed validation/.test(x.text || ""));
      Object.assign(ctx, { body, call });
      const sp = scripted("chat", call.model, ctx);
      const m = state.chat.models[call.model] || {};
      let content;
      if (sp && (sp.status || 200) !== 200) return reply(res, sp, call);
      if (sp) content = sp.json !== undefined ? sp.json : sp.text;
      else if (m.status) { call.status = m.status; return send(res, m.status, { error: { message: `mock status ${m.status}`, code: m.status } }); }
      else content = typeof state.chat.responder === "function" ? state.chat.responder(body, ctx) : defaultIslandResponder(body);
      if (m.badIdsTimes > 0 && content && Array.isArray(content.islands)) {
        m.badIdsTimes--;
        content = { islands: content.islands.map((x, k) => ({ ...x, id: `i${100 + k}:00` })) };
        call.badIds = true;
      } else if (m.invalidTimes > 0) {
        m.invalidTimes--;
        content = "Sorry, I cannot help with that.";
        call.invalid = true;
      }
      call.status = 200;
      call.cost = m.cost != null ? m.cost : state.chat.defaultCost;
      return send(res, 200, {
        id: `gen-mock-${++state.seq}`, model: m.serveModel || call.model,
        choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 320, completion_tokens: 90, total_tokens: 410, cost: m.cost != null ? m.cost : state.chat.defaultCost },
      });
    }

    if (call.route === "key" || call.route === "credits") {
      const sp = scripted(call.route, null, ctx);
      if (sp) return reply(res, sp, call);
      call.status = 200;
      const b = state.budget;
      if (call.route === "key") return send(res, 200, { data: { label: "mock", limit: b.limit, limit_remaining: b.limitRemaining, usage: 1 } });
      return send(res, 200, { data: { total_credits: b.totalCredits, total_usage: b.totalUsage } });
    }

    if (call.route === "kie:upload") {
      const mp = parseMultipart(raw, req.headers["content-type"]);
      Object.assign(ctx, { upload: mp, call });
      const sp = scripted("kie:upload", null, ctx);
      if (sp) return reply(res, sp, call);
      if (!mp.file) { call.status = 400; return send(res, 400, { success: false, code: 400, msg: "file required" }); }
      const id = `u${++state.seq}`;
      state.uploads.set(id, { bytes: mp.file.bytes, name: mp.file.name });
      call.status = 200;
      call.bytes = mp.file.bytes.length;
      return send(res, 200, {
        success: true, code: 200, msg: "File uploaded successfully",
        data: { success: true, fileName: mp.fields.fileName || mp.file.name, filePath: `kieai/mock/${mp.fields.uploadPath || "x"}/${mp.file.name}`, downloadUrl: `${baseUrl}/tempfile/${id}.mp3`, fileSize: mp.file.bytes.length, mimeType: "audio/mpeg", uploadedAt: new Date().toISOString() },
      });
    }

    if (call.route === "kie:create") {
      let body = {};
      try { body = JSON.parse(raw.toString("utf8")); } catch { body = {}; }
      call.model = body.model || null;
      Object.assign(ctx, { body, call });
      const sp = scripted("kie:create", call.model, ctx);
      if (sp) return reply(res, sp, call);
      call.status = 200;
      if (state.kie.mode === "create500") return send(res, 200, { code: 500, msg: "Server exception, please try again later", data: null });
      const taskId = crypto.createHash("sha1").update(`task${++state.seq}`).digest("hex").slice(0, 32);
      state.tasks.set(taskId, { model: body.model, input: body.input || {}, polls: 0, mode: state.kie.mode, waitPolls: state.kie.waitPolls, createdAt: Date.now() });
      call.taskId = taskId;
      return send(res, 200, { code: 200, msg: "success", data: { taskId, recordId: taskId } });
    }

    if (call.route === "kie:record") {
      const taskId = url.searchParams.get("taskId");
      const task = state.tasks.get(taskId);
      Object.assign(ctx, { task, taskId, call });
      const sp = scripted("kie:record", task ? task.model : null, ctx);
      if (sp) return reply(res, sp, call);
      call.status = 200;
      if (!task) return send(res, 200, { code: 422, msg: "recordInfo is null", data: null });
      task.polls++;
      let st = "waiting";
      if (task.mode === "generating") st = "generating";
      else if (task.mode === "success" && task.polls > task.waitPolls) st = "success";
      else if (task.mode === "fail" && task.polls > task.waitPolls) st = "fail";
      call.state = st;
      const data = {
        taskId, model: task.model, state: st, param: JSON.stringify({ model: task.model }), resultJson: "", failCode: null, failMsg: null,
        costTime: null, completeTime: null, createTime: task.createdAt, creditsConsumed: 0, successFlag: 0,
      };
      if (st === "fail") Object.assign(data, { failCode: "500", failMsg: "The upstream API service timed out and no results were returned, please try again.", errorCode: 500, successFlag: 3 });
      if (st === "success") {
        const upId = /\/tempfile\/([^./]+)/.exec(String(task.input.audio_url || ""));
        const up = upId ? state.uploads.get(upId[1]) : null;
        const dur = (up && mp3DurationSec(up.bytes)) || (state.truth && state.truth.durationSec) || 1;
        const words = truthWindow(offsetFor(dur, task.input), dur);
        const items = [{ text: "(breath)", start: 0, end: 0.05, type: "audio_event" }];
        words.forEach((w, k) => {
          if (k) items.push({ text: " ", start: words[k - 1].end, end: w.start, type: "spacing" });
          items.push({ text: w.text, start: r3(w.start), end: r3(w.end), type: "word", logprob: -0.01 });
        });
        const lang = (state.truth && state.truth.language) || "en";
        data.resultJson = JSON.stringify({ language_code: state.kie.languageCode || ISO3[lang] || lang, language_probability: 0.99, text: words.map((w) => w.text).join(" "), words: items });
        Object.assign(data, { creditsConsumed: state.kie.credits, successFlag: 1, costTime: 4200, completeTime: Date.now() });
      }
      return send(res, 200, { code: 200, msg: "success", data });
    }
    call.status = 404;
    return send(res, 404, { error: { message: "not found", code: 404 } });
  }

  Object.assign(api, {
    baseUrl, openrouterBase: `${baseUrl}/api/v1`, kieBase: baseUrl, state, calls: state.calls, scenarios,
    setTruth(truth) { state.truth = truth; },
    setPcm(wavBuffer) {
      const w = parseWav(wavBuffer);
      if (!w) throw new Error("mock.setPcm: not a WAV buffer");
      state.pcm = Buffer.from(w.data);
      state.pcmInfo = { sampleRate: w.sampleRate, blockAlign: w.blockAlign };
    },
    setChunkResolver(fn) { state.chunkResolver = typeof fn === "function" ? fn : null; },
    useChunkPlan(chunks) {
      const list = (chunks || []).map((c) => ({ start: c.start, dur: c.end - c.start }));
      state.chunkResolver = ({ durationSec }) => {
        let best = null;
        for (const c of list) if (!best || Math.abs(c.dur - durationSec) < Math.abs(best.dur - durationSec)) best = c;
        return best ? best.start : 0;
      };
    },
    enqueue(route, spec) {
      const times = spec && typeof spec === "object" && Number.isFinite(spec.times) ? spec.times : (typeof spec === "function" ? Infinity : 1);
      if (!state.queues.has(route)) state.queues.set(route, []);
      state.queues.get(route).push({ spec, times });
    },
    setModel(model, patch) { state.models[model] = { ...(state.models[model] || {}), ...patch }; },
    setChatModel(model, patch) { state.chat.models[model] = { ...(state.chat.models[model] || {}), ...patch }; },
    setChatResponder(fn) { state.chat.responder = typeof fn === "function" ? fn : null; },
    setKie(patch) { Object.assign(state.kie, patch); },
    setBudget(patch) { Object.assign(state.budget, patch); },
    count({ route = null, model = null } = {}) { return state.calls.filter((c) => (!route || c.route === route) && (!model || c.model === model)).length; },
    reset() {
      state.calls.length = 0;
      state.queues.clear();
      state.tasks.clear();
      state.uploads.clear();
      state.models = JSON.parse(JSON.stringify(DEFAULT_MODELS));
      state.chat = { models: {}, responder: null, defaultCost: 0.00022 };
      state.kie = { mode: "stall", waitPolls: 1, credits: 2.2, languageCode: null };
      state.budget = { limitRemaining: 50, limit: 100, totalCredits: 100, totalUsage: 10 };
      state.chunkResolver = null;
      for (const k of Object.keys(scenarios)) delete scenarios[k];
    },
    close() {
      return new Promise((resolve) => {
        try { server.closeAllConnections(); } catch { /* older node */ }
        server.close(() => resolve());
      });
    },
  });
  return api;
}

module.exports = { startMockProviders, mp3DurationSec, parseWav, DEFAULT_MODELS };
