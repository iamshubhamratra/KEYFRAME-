const $ = (id) => document.getElementById(id);

const form = $("genForm");
const submitBtn = $("submitBtn");
const statusCard = $("status");
const videoCard = $("videoWrap");
const errorBox = $("errorBox");
const videoEl = $("videoEl");
const resetBtn = $("resetBtn");

const STAGE_WEIGHTS = {
  storyboard: 10, composing: 30, validating: 40, rendering: 80, finalizing: 95,
};

let pollTimer = null;
let startTs = 0;
let elapsedTimer = null;

function setStage(stage) { $("stage").textContent = stage || "—"; }
function setState(state) { $("state").textContent = state || "—"; }
function setProgressFromStage(stage, done) {
  const bar = $("progressBar");
  bar.value = done ? 100 : (STAGE_WEIGHTS[stage] ?? 5);
}

function startElapsed() {
  startTs = Date.now();
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    $("elapsed").textContent = `${Math.floor((Date.now() - startTs) / 1000)}s`;
  }, 500);
}
function stopElapsed() { clearInterval(elapsedTimer); elapsedTimer = null; }

function resetUI() {
  clearTimeout(pollTimer); pollTimer = null;
  stopElapsed();
  statusCard.classList.add("hidden");
  videoCard.classList.add("hidden");
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "Generate video";
}
resetBtn.addEventListener("click", resetUI);

async function poll(statusUrl) {
  try {
    const r = await fetch(statusUrl);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const job = await r.json();

    setState(job.status);
    setStage(job.progress || (job.status === "queued" ? "queued" : ""));
    $("queuePos").textContent = job.queuePosition ?? (job.status === "queued" ? "—" : "started");
    $("fallback").textContent = job.usedFallback ? "yes" : "no";

    if (job.status === "done") {
      setProgressFromStage(null, true);
      stopElapsed();
      videoEl.dataset.orientation = job.orientation || "horizontal";
      videoEl.src = job.videoUrl + `?t=${Date.now()}`;
      $("downloadLink").href = job.videoUrl;
      videoCard.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate video";
      return;
    }
    if (job.status === "failed") {
      stopElapsed();
      errorBox.textContent = job.error || "unknown error";
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate video";
      return;
    }
    setProgressFromStage(job.progress);
    pollTimer = setTimeout(() => poll(statusUrl), 2000);
  } catch (e) {
    stopElapsed();
    errorBox.textContent = `polling failed: ${e.message}`;
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Generate video";
  }
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  resetUI();

  const body = {
    prompt: $("prompt").value.trim(),
    duration: Number($("duration").value),
    orientation: $("orientation").value,
    quality: $("quality").value,
    fps: Number($("fps").value),
    tts: $("ttsChk").checked,
    music: $("musicChk").checked,
    sound_effect: $("sfxChk").checked,
    images: $("imagesChk").checked,
    video: $("videoChk").checked,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";
  statusCard.classList.remove("hidden");
  startElapsed();

  try {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.error + (data.details ? `: ${data.details.join(", ")}` : ""));
    }
    $("jobId").textContent = data.jobId;
    submitBtn.textContent = "Generating…";
    poll(data.statusUrl);
  } catch (e) {
    stopElapsed();
    errorBox.textContent = e.message;
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Generate video";
  }
});
