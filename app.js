const $ = (selector) => document.querySelector(selector);
const sourceVideo = $("#sourceVideo");
const generatedVideo = $("#generatedVideo");
const fileInput = $("#fileInput");
const videoStage = $("#videoStage");
const timeline = $("#timeline");
const playhead = $("#playhead");
const insertMarker = $("#insertMarker");
const promptInput = $("#promptInput");
const durationSelect = $("#durationSelect");
const qualitySelect = $("#qualitySelect");
const generateButton = $("#generateButton");

const state = {
  file: null,
  sourceUrl: null,
  duration: 0,
  width: 0,
  height: 0,
  insertionTime: null,
  referenceFrame: null,
  balance: 0,
  attempts: [],
  currentAttemptId: null,
  selectedAttemptId: null,
  generatedUrl: null,
  generatedBlob: null,
  proofBlob: null,
  selected: false,
  generating: false,
  paymentAction: "generate",
};

const surprisePrompts = [
  "The hero lowers their weapon, steps closer, and gives the villain an unexpectedly tender kiss as the camera slowly pushes in.",
  "Everyone freezes mid-battle, pulls out tiny party hats, and begins an awkward synchronized dance while the camera circles them.",
  "The villain suddenly reveals a microphone and both characters perform an emotional power ballad under dramatic stage lights.",
  "The hero's weapon turns into a bouquet of flowers. They exchange a confused look, then burst into uncontrollable laughter.",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatTime(seconds, precise = true) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  const core = [hours, minutes, wholeSeconds].map((value) => String(value).padStart(2, "0")).join(":");
  return precise ? `${core}.${String(ms).padStart(3, "0")}` : core;
}

function priceParts() {
  const seconds = Number(durationSelect.value);
  const rate = qualitySelect.value === "cinema" ? 0.34 : 0.22;
  const subtotal = seconds * rate;
  return { subtotal, total: subtotal + 0.49 };
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function updatePrice() {
  const { subtotal, total } = priceParts();
  const label = money(total);
  $("#price").textContent = label;
  $("#buttonPrice").textContent = label;
  $("#fundAmount").min = total.toFixed(2);
  $("#fundAmount").value = total.toFixed(2);
  $("#orderDescription").textContent = `Minimum · one ${durationSelect.value}s ${qualitySelect.value === "cinema" ? "Cinema" : "Standard"} attempt`;
  updateWalletUI();
  updateTopupSummary();
}

function updateWalletUI() {
  state.balance = Math.round(state.balance * 100) / 100;
  $("#walletBalance").textContent = money(state.balance);
  $("#modalWalletBalance").textContent = money(state.balance);
  const enough = state.balance + 0.001 >= priceParts().total;
  generateButton.querySelector(".button-label").innerHTML = `${enough ? "Generate scene" : "Add funds & generate"} · <b id="buttonPrice">${money(priceParts().total)}</b>`;
}

function updateTopupSummary() {
  const minimum = priceParts().total;
  const input = $("#fundAmount");
  const amount = Number(input.value) || 0;
  const valid = amount + 0.001 >= minimum;
  $("#orderSubtotal").textContent = money(amount);
  $("#orderTotal").textContent = money(state.balance + amount);
  $("#payButton").innerHTML = `${state.paymentAction === "generate" ? "Add" : "Add"} <b id="payPrice">${money(amount)}</b>${state.paymentAction === "generate" ? " & generate" : " to wallet"}`;
  $("#payButton").disabled = !valid;
  input.setCustomValidity(valid ? "" : `Minimum top-up is ${money(minimum)}`);
}

function openPayment(action = "generate") {
  state.paymentAction = action;
  const cost = priceParts().total;
  $("#fundAmount").value = cost.toFixed(2);
  document.querySelectorAll(".topup-options button").forEach((button) => button.classList.toggle("active", button.dataset.attempts === "1"));
  updateWalletUI();
  updateTopupSummary();
  openModal("paymentModal");
}

function setStep(number) {
  document.querySelectorAll(".step").forEach((step) => {
    const value = Number(step.dataset.step);
    step.classList.toggle("active", value === number);
    step.classList.toggle("complete", value < number);
  });
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 2600);
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add("visible");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("visible");
  modal.setAttribute("aria-hidden", "true");
}

function revokeProjectUrls() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  new Set(state.attempts.map((attempt) => attempt.url)).forEach((url) => URL.revokeObjectURL(url));
}

function resetProject() {
  sourceVideo.pause();
  generatedVideo.pause();
  revokeProjectUrls();
  Object.assign(state, { file: null, sourceUrl: null, duration: 0, width: 0, height: 0, insertionTime: null, referenceFrame: null, attempts: [], currentAttemptId: null, selectedAttemptId: null, generatedUrl: null, generatedBlob: null, proofBlob: null, selected: false, generating: false, paymentAction: "generate" });
  sourceVideo.removeAttribute("src");
  generatedVideo.removeAttribute("src");
  sourceVideo.load();
  $("#fileName").textContent = "No video selected";
  $("#videoMeta").textContent = "—";
  $("#replaceVideoButton").hidden = true;
  $("#emptyState").classList.remove("hidden");
  videoStage.classList.remove("has-video");
  $("#generatedPreview").classList.remove("visible");
  $("#playerControls").classList.add("disabled");
  timeline.classList.add("disabled");
  insertMarker.classList.remove("visible");
  $("#markButton").disabled = true;
  $("#markButton").innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Insert AI scene here';
  $("#timelineHint").textContent = "Upload a video to start placing your scene.";
  $("#referenceCard").classList.add("locked");
  $("#referenceImage").style.backgroundImage = "";
  $("#referenceImage").innerHTML = '<div class="reference-empty"><svg viewBox="0 0 24 24"><path d="M4 18V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0-3 4-4 3 3 2-2 7 7M15 9h.01"/></svg><span>Your chosen frame<br>will appear here</span></div>';
  $("#referenceTime").textContent = "Not placed yet";
  [promptInput, durationSelect, qualitySelect].forEach((control) => control.disabled = true);
  $("#surpriseButton").disabled = true;
  promptInput.value = "";
  $("#charCount").textContent = "0";
  generateButton.disabled = true;
  generateButton.classList.remove("loading");
  generateButton.style.display = "flex";
  $("#addFundsButton").disabled = true;
  $("#resultActions").classList.remove("visible");
  $("#attemptLibrary").classList.remove("visible");
  $("#attemptList").innerHTML = "";
  $("#attemptCount").textContent = "0 attempts";
  document.getElementById("finishBar")?.remove();
  $("#filmstrip").innerHTML = Array(8).fill('<div class="filmstrip-placeholder"></div>').join("");
  $("#currentTime").textContent = formatTime(0);
  $("#totalTime").textContent = formatTime(0);
  playhead.style.left = "0%";
  fileInput.value = "";
  updateWalletUI();
  setStep(1);
}

async function loadVideo(file) {
  if (!file || !file.type.startsWith("video/")) {
    toast("Please choose a video file.");
    return;
  }
  resetProject();
  state.file = file;
  state.sourceUrl = URL.createObjectURL(file);
  sourceVideo.src = state.sourceUrl;
  sourceVideo.load();
  $("#fileName").textContent = file.name;
  $("#videoMeta").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · Reading video…`;
  $("#replaceVideoButton").hidden = false;
  $("#emptyState").classList.add("hidden");
  videoStage.classList.add("has-video");
  $("#playerControls").classList.remove("disabled");
  timeline.classList.remove("disabled");
  $("#markButton").disabled = false;
  $("#timelineHint").textContent = "Scrub the timeline, then mark the exact insertion frame.";
  setStep(2);
}

sourceVideo.addEventListener("loadedmetadata", () => {
  state.duration = sourceVideo.duration;
  state.width = sourceVideo.videoWidth;
  state.height = sourceVideo.videoHeight;
  $("#totalTime").textContent = formatTime(state.duration);
  $("#videoMeta").textContent = `${state.width}×${state.height} · ${formatTime(state.duration, false)}`;
  createFilmstrip().catch(() => {
    $("#filmstrip").innerHTML = Array(8).fill('<div class="filmstrip-placeholder"></div>').join("");
  });
});

sourceVideo.addEventListener("timeupdate", updatePlayhead);
sourceVideo.addEventListener("seeked", updatePlayhead);
sourceVideo.addEventListener("play", () => $("#playButton").classList.add("playing"));
sourceVideo.addEventListener("pause", () => $("#playButton").classList.remove("playing"));

function updatePlayhead() {
  const percentage = state.duration ? (sourceVideo.currentTime / state.duration) * 100 : 0;
  playhead.style.left = `${Math.min(100, Math.max(0, percentage))}%`;
  $("#currentTime").textContent = formatTime(sourceVideo.currentTime);
}

function seekTo(time) {
  if (!state.file) return;
  sourceVideo.currentTime = Math.min(state.duration, Math.max(0, time));
  $("#generatedPreview").classList.remove("visible");
  generatedVideo.pause();
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
    if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Could not seek video")); };
    const cleanup = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = target;
  });
}

async function createFilmstrip() {
  const preview = document.createElement("video");
  preview.src = state.sourceUrl;
  preview.muted = true;
  preview.preload = "auto";
  await new Promise((resolve, reject) => {
    preview.addEventListener("loadedmetadata", resolve, { once: true });
    preview.addEventListener("error", reject, { once: true });
  });
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 104;
  const context = canvas.getContext("2d");
  const images = [];
  for (let index = 0; index < 8; index += 1) {
    await seekVideo(preview, preview.duration * ((index + 0.5) / 8));
    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    images.push(`<img alt="Timeline frame ${index + 1}" src="${canvas.toDataURL("image/jpeg", .68)}">`);
  }
  $("#filmstrip").innerHTML = images.join("");
  preview.removeAttribute("src");
}

function clearAttempts() {
  generatedVideo.pause();
  new Set(state.attempts.map((attempt) => attempt.url)).forEach((url) => URL.revokeObjectURL(url));
  state.attempts = [];
  state.currentAttemptId = null;
  state.selectedAttemptId = null;
  state.generatedUrl = null;
  state.generatedBlob = null;
  state.proofBlob = null;
  state.selected = false;
  generatedVideo.removeAttribute("src");
  $("#generatedPreview").classList.remove("visible");
  $("#resultActions").classList.remove("visible");
  $("#attemptLibrary").classList.remove("visible");
  $("#attemptList").innerHTML = "";
  $("#attemptCount").textContent = "0 attempts";
  generateButton.style.display = "flex";
  document.getElementById("finishBar")?.remove();
}

function captureReferenceFrame() {
  if (!state.file || sourceVideo.readyState < 2) return;
  sourceVideo.pause();
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1280 / sourceVideo.videoWidth);
  canvas.width = Math.max(1, Math.round(sourceVideo.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceVideo.videoHeight * scale));
  canvas.getContext("2d").drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
  if (state.attempts.length) clearAttempts();
  state.insertionTime = sourceVideo.currentTime;
  state.referenceFrame = canvas.toDataURL("image/jpeg", .9);
  state.selected = false;
  const position = state.duration ? (state.insertionTime / state.duration) * 100 : 0;
  insertMarker.style.left = `${position}%`;
  insertMarker.classList.add("visible");
  const image = $("#referenceImage");
  image.innerHTML = "";
  image.style.backgroundImage = `url(${state.referenceFrame})`;
  $("#referenceCard").classList.remove("locked");
  $("#referenceTime").textContent = formatTime(state.insertionTime);
  [promptInput, durationSelect, qualitySelect].forEach((control) => control.disabled = false);
  $("#surpriseButton").disabled = false;
  $("#addFundsButton").disabled = false;
  $("#timelineHint").innerHTML = `Scene will be inserted after <strong>${formatTime(state.insertionTime)}</strong>. Scrub elsewhere and reselect to change it.`;
  $("#markButton").innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"/></svg> Reselect frame';
  setStep(3);
  validateGenerate();
  promptInput.focus();
  toast("Reference frame captured");
}

function validateGenerate() {
  generateButton.disabled = !state.referenceFrame || promptInput.value.trim().length < 8 || state.generating;
}

async function createGeneratedClip(referenceUrl, prompt, seconds, quality) {
  if (!window.MediaRecorder) throw new Error("This browser cannot render the demo clip.");
  const image = new Image();
  image.src = referenceUrl;
  await image.decode();
  const targetWidth = quality === "cinema" ? 960 : 800;
  const ratio = image.naturalWidth / image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round(targetWidth / ratio);
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const stopped = new Promise((resolve) => recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: "video/webm" })), { once: true }));
  const start = performance.now();
  const variant = state.attempts.length % 3;

  function draw(now) {
    const elapsed = (now - start) / 1000;
    const progress = Math.min(1, elapsed / seconds);
    const sway = Math.sin(progress * Math.PI * (variant + 1)) * (8 + variant * 3);
    const zoom = 1.03 + progress * (.06 + variant * .015);
    const drawWidth = canvas.width * zoom;
    const drawHeight = canvas.height * zoom;
    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2 + sway, canvas.height / 2 - progress * 5);
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    const glow = context.createRadialGradient(canvas.width * (.35 + progress * .3), canvas.height * .42, 5, canvas.width / 2, canvas.height / 2, canvas.width * .72);
    glow.addColorStop(0, variant === 1 ? "rgba(255,120,94,.14)" : "rgba(130,103,255,.14)");
    glow.addColorStop(.72, "rgba(0,0,0,.08)");
    glow.addColorStop(1, "rgba(0,0,0,.56)");
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(0,0,0,.42)";
    context.fillRect(0, canvas.height - 67, canvas.width, 67);
    context.fillStyle = "rgba(255,255,255,.92)";
    context.font = `600 ${Math.max(13, canvas.width / 52)}px system-ui`;
    context.textAlign = "center";
    const caption = prompt.length > 88 ? `${prompt.slice(0, 85)}…` : prompt;
    context.fillText(caption, canvas.width / 2, canvas.height - 31, canvas.width - 70);
    context.fillStyle = "#a18cff";
    context.font = `800 ${Math.max(9, canvas.width / 80)}px system-ui`;
    context.fillText("PLOT TWIST · AI PREVIEW", canvas.width / 2, 25);
    if (progress < 1) requestAnimationFrame(draw);
  }

  recorder.start(250);
  requestAnimationFrame(draw);
  await sleep(seconds * 1000 + 120);
  recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((track) => track.stop());
  return blob;
}

async function beginGeneration() {
  if (state.generating) return;
  const generationPrompt = promptInput.value.trim();
  if (generationPrompt.length < 8) {
    toast("Add a little more detail to the prompt first.");
    return;
  }
  const cost = priceParts().total;
  if (state.balance + 0.001 < cost) {
    openPayment("generate");
    return;
  }
  state.balance = Math.round((state.balance - cost) * 100) / 100;
  updateWalletUI();
  state.generating = true;
  validateGenerate();
  generateButton.classList.add("loading");
  $("#resultActions").classList.remove("visible");
  $("#generatedPreview").classList.remove("visible");
  const seconds = Number(durationSelect.value);
  const generationQuality = qualitySelect.value;

  try {
    const blobPromise = createGeneratedClip(state.referenceFrame, generationPrompt, seconds, generationQuality);
    const loadingLabel = generateButton.querySelector(".button-loading");
    loadingLabel.innerHTML = "<i></i> Matching the reference frame…";
    await sleep(Math.min(1400, seconds * 250));
    loadingLabel.innerHTML = "<i></i> Directing the new action…";
    await sleep(Math.min(1400, seconds * 250));
    loadingLabel.innerHTML = "<i></i> Finishing the scene…";
    const blob = await blobPromise;
    const attempt = {
      id: crypto.randomUUID?.() || `${Date.now()}-${state.attempts.length}`,
      number: state.attempts.length + 1,
      blob,
      url: URL.createObjectURL(blob),
      prompt: generationPrompt,
      seconds,
      quality: generationQuality,
      cost,
      createdAt: new Date().toISOString(),
    };
    state.attempts.push(attempt);
    selectAttempt(attempt.id, true);
    generateButton.style.display = "none";
    toast(`Attempt ${attempt.number} is ready — ${money(cost)} charged`);
  } catch (error) {
    console.error(error);
    state.balance = Math.round((state.balance + cost) * 100) / 100;
    updateWalletUI();
    toast(error.message || "Could not render the preview.");
  } finally {
    state.generating = false;
    generateButton.classList.remove("loading");
    validateGenerate();
  }
}

function renderAttemptLibrary() {
  const list = $("#attemptList");
  list.innerHTML = "";
  state.attempts.forEach((attempt) => {
    const card = document.createElement("button");
    card.className = "attempt-card";
    if (attempt.id === state.currentAttemptId) card.classList.add("active");
    if (attempt.id === state.selectedAttemptId) card.classList.add("chosen");
    card.type = "button";
    card.title = attempt.prompt;
    const image = document.createElement("img");
    image.src = state.referenceFrame;
    image.alt = `Attempt ${attempt.number}`;
    const label = document.createElement("span");
    label.textContent = `Attempt ${attempt.number}`;
    const detail = document.createElement("small");
    detail.textContent = `${attempt.seconds}s · ${attempt.quality === "cinema" ? "1080p" : "720p"}`;
    const viewing = document.createElement("i");
    viewing.textContent = "▶";
    const chosen = document.createElement("b");
    chosen.textContent = "FINAL";
    card.append(image, label, detail, viewing, chosen);
    card.addEventListener("click", () => selectAttempt(attempt.id, true));
    list.appendChild(card);
  });
  $("#attemptCount").textContent = `${state.attempts.length} attempt${state.attempts.length === 1 ? "" : "s"}`;
  $("#attemptLibrary").classList.toggle("visible", state.attempts.length > 0);
}

function selectAttempt(id, autoplay = false) {
  const attempt = state.attempts.find((item) => item.id === id);
  if (!attempt) return;
  state.currentAttemptId = id;
  state.generatedBlob = attempt.blob;
  state.generatedUrl = attempt.url;
  generatedVideo.src = attempt.url;
  generatedVideo.currentTime = 0;
  $("#attemptNumber").textContent = attempt.number;
  $("#resultActions").classList.add("visible");
  $("#useSceneButton").textContent = id === state.selectedAttemptId ? "Selected for export" : "Use this attempt";
  $("#generatedPreview").classList.add("visible");
  if (autoplay) generatedVideo.play().catch(() => {});
  renderAttemptLibrary();
}

function ensureFinishBar() {
  if (document.getElementById("finishBar")) return;
  document.body.appendChild($("#finishBarTemplate").content.cloneNode(true));
  $("#finishButton").addEventListener("click", exportProofCut);
}

function chooseScene() {
  if (!state.currentAttemptId) return;
  state.selectedAttemptId = state.currentAttemptId;
  state.selected = true;
  generatedVideo.pause();
  $("#generatedPreview").classList.remove("visible");
  $("#useSceneButton").textContent = "Selected for export";
  renderAttemptLibrary();
  ensureFinishBar();
  setStep(4);
  const attempt = state.attempts.find((item) => item.id === state.selectedAttemptId);
  toast(`Attempt ${attempt.number} selected for export`);
}

async function waitForVideoReady(video) {
  if (video.readyState >= 2) return;
  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve, { once: true });
    video.addEventListener("error", reject, { once: true });
  });
}

async function drawVideoRange(video, start, end, context, canvas) {
  await seekVideo(video, start);
  await video.play();
  return new Promise((resolve) => {
    function frame() {
      context.fillStyle = "black";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (video.currentTime >= end || video.ended) {
        video.pause();
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  });
}

async function renderProofBlob(onProgress) {
  const chosenAttempt = state.attempts.find((attempt) => attempt.id === state.selectedAttemptId);
  if (!window.MediaRecorder || !chosenAttempt) throw new Error("Proof-cut rendering is not supported in this browser.");
  const width = Math.min(960, state.width || 960);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width / ((state.width || 16) / (state.height || 9)));
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const stopped = new Promise((resolve) => recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: "video/webm" })), { once: true }));
  const original = document.createElement("video");
  original.src = state.sourceUrl;
  original.muted = true;
  original.playsInline = true;
  const ai = document.createElement("video");
  ai.src = chosenAttempt.url;
  ai.muted = true;
  ai.playsInline = true;
  await Promise.all([waitForVideoReady(original), waitForVideoReady(ai)]);
  recorder.start(250);
  onProgress(8);
  await drawVideoRange(original, Math.max(0, state.insertionTime - 2), state.insertionTime, context, canvas);
  onProgress(35);
  await drawVideoRange(ai, 0, Math.max(.1, ai.duration - .06), context, canvas);
  onProgress(82);
  await drawVideoRange(original, state.insertionTime, Math.min(state.duration, state.insertionTime + 2), context, canvas);
  onProgress(96);
  recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((track) => track.stop());
  original.removeAttribute("src");
  ai.removeAttribute("src");
  onProgress(100);
  return blob;
}

async function exportProofCut() {
  openModal("exportModal");
  $("#exportActions").classList.remove("visible");
  $("#exportTitle").textContent = "Rendering your proof-cut…";
  $("#exportCopy").textContent = "This takes about the length of the short preview because your browser is composing real video frames.";
  $("#exportProgress").querySelector("i").style.width = "2%";
  try {
    state.proofBlob = await renderProofBlob((value) => $("#exportProgress").querySelector("i").style.width = `${value}%`);
    $("#exportTitle").textContent = "Your plot twist is ready.";
    $("#exportCopy").textContent = "Download the silent proof-cut to share the concept, or save the edit plan for the production renderer.";
    $("#exportActions").classList.add("visible");
  } catch (error) {
    console.error(error);
    $("#exportTitle").textContent = "The edit plan is ready.";
    $("#exportCopy").textContent = "This browser could not compose WebM video, but you can still download the complete edit plan.";
    $("#downloadProofButton").disabled = true;
    $("#exportActions").classList.add("visible");
  }
}

function downloadBlob(blob, name) {
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadProject() {
  const chosenAttempt = state.attempts.find((attempt) => attempt.id === state.selectedAttemptId);
  const project = {
    version: 1,
    app: "PlotTwist prototype",
    source: { name: state.file.name, duration: state.duration, width: state.width, height: state.height },
    insertion: { afterSeconds: state.insertionTime, timecode: formatTime(state.insertionTime), generatedDuration: chosenAttempt?.seconds },
    generation: { prompt: chosenAttempt?.prompt, quality: chosenAttempt?.quality, chosenAttempt: chosenAttempt?.number, attemptCost: money(chosenAttempt?.cost || 0), totalAttemptsCreated: state.attempts.length },
    walletBalance: money(state.balance),
    note: "Use this edit plan with a server-side FFmpeg concat pipeline for the full movie and original audio.",
  };
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${state.file.name.replace(/\.[^.]+$/, "")}-plottwist.json`);
}

$("#chooseVideoButton").addEventListener("click", () => fileInput.click());
$("#replaceVideoButton").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => loadVideo(fileInput.files[0]));
$("#newProjectButton").addEventListener("click", () => {
  if (!state.file || confirm("Start a new project? The current local edit will be cleared.")) resetProject();
});

window.addEventListener("dragover", (event) => { event.preventDefault(); $("#dropOverlay").classList.add("visible"); });
window.addEventListener("dragleave", (event) => { if (!event.relatedTarget) $("#dropOverlay").classList.remove("visible"); });
window.addEventListener("drop", (event) => {
  event.preventDefault();
  $("#dropOverlay").classList.remove("visible");
  loadVideo([...event.dataTransfer.files].find((file) => file.type.startsWith("video/")));
});

$("#playButton").addEventListener("click", () => sourceVideo.paused ? sourceVideo.play() : sourceVideo.pause());
$("#backButton").addEventListener("click", () => seekTo(sourceVideo.currentTime - 5));
$("#forwardButton").addEventListener("click", () => seekTo(sourceVideo.currentTime + 5));
$("#previousFrame").addEventListener("click", () => { sourceVideo.pause(); seekTo(sourceVideo.currentTime - 1 / 30); });
$("#nextFrame").addEventListener("click", () => { sourceVideo.pause(); seekTo(sourceVideo.currentTime + 1 / 30); });
$("#muteButton").addEventListener("click", () => { sourceVideo.muted = !sourceVideo.muted; toast(sourceVideo.muted ? "Audio muted" : "Audio on"); });
$("#fullscreenButton").addEventListener("click", () => videoStage.requestFullscreen?.());
timeline.addEventListener("pointerdown", (event) => {
  const rect = timeline.getBoundingClientRect();
  seekTo(((event.clientX - rect.left) / rect.width) * state.duration);
});
$("#markButton").addEventListener("click", captureReferenceFrame);

promptInput.addEventListener("input", () => { $("#charCount").textContent = promptInput.value.length; validateGenerate(); });
$("#surpriseButton").addEventListener("click", () => {
  promptInput.value = surprisePrompts[Math.floor(Math.random() * surprisePrompts.length)];
  promptInput.dispatchEvent(new Event("input"));
});
[durationSelect, qualitySelect].forEach((control) => control.addEventListener("change", updatePrice));

generateButton.addEventListener("click", () => {
  if (state.balance + 0.001 < priceParts().total) openPayment("generate");
  else beginGeneration();
});
$("#addFundsButton").addEventListener("click", () => openPayment("topup"));
$("#fundAmount").addEventListener("input", () => {
  document.querySelectorAll(".topup-options button").forEach((button) => button.classList.remove("active"));
  updateTopupSummary();
});
document.querySelectorAll(".topup-options button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".topup-options button").forEach((item) => item.classList.toggle("active", item === button));
  $("#fundAmount").value = (priceParts().total * Number(button.dataset.attempts)).toFixed(2);
  updateTopupSummary();
}));
$("#payButton").addEventListener("click", async () => {
  const button = $("#payButton");
  const amount = Math.round(Number($("#fundAmount").value) * 100) / 100;
  if (!Number.isFinite(amount) || amount + 0.001 < priceParts().total) {
    $("#fundAmount").reportValidity();
    return;
  }
  const action = state.paymentAction;
  button.disabled = true;
  button.textContent = "Authorizing demo payment…";
  await sleep(900);
  state.balance = Math.round((state.balance + amount) * 100) / 100;
  updateWalletUI();
  closeModal("paymentModal");
  updateTopupSummary();
  toast(`${money(amount)} added to your wallet`);
  if (action === "generate") beginGeneration();
});
$("#regenerateButton").addEventListener("click", () => {
  generateButton.style.display = "flex";
  if (state.balance + 0.001 < priceParts().total) openPayment("generate");
  else beginGeneration();
});
$("#useSceneButton").addEventListener("click", chooseScene);
$("#closePreview").addEventListener("click", () => { generatedVideo.pause(); $("#generatedPreview").classList.remove("visible"); });

document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) closeModal(backdrop.id); }));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".modal-backdrop.visible").forEach((modal) => closeModal(modal.id));
  if (event.code === "Space" && state.file && document.activeElement !== promptInput) { event.preventDefault(); sourceVideo.paused ? sourceVideo.play() : sourceVideo.pause(); }
  if (event.key === "ArrowLeft" && state.file && document.activeElement !== promptInput) { event.preventDefault(); sourceVideo.pause(); seekTo(sourceVideo.currentTime - (event.shiftKey ? 1 : 1 / 30)); }
  if (event.key === "ArrowRight" && state.file && document.activeElement !== promptInput) { event.preventDefault(); sourceVideo.pause(); seekTo(sourceVideo.currentTime + (event.shiftKey ? 1 : 1 / 30)); }
});

$("#downloadProofButton").addEventListener("click", () => state.proofBlob && downloadBlob(state.proofBlob, `${state.file.name.replace(/\.[^.]+$/, "")}-proof-cut.webm`));
$("#downloadProjectButton").addEventListener("click", downloadProject);

updatePrice();
resetProject();
