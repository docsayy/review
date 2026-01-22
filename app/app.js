// app/app.js
// Reads app/index.json (manually maintained) and renders tiles + cards.

const INDEX_URL = "app/index.json";

const LS_PROGRESS = "rd_progress_v1"; // per system/topic/source
const LS_THEME = "rd_theme_v1";       // auto|dark|light

const el = (id) => document.getElementById(id);

const statusLine = el("statusLine");

const screenSystems = el("screenSystems");
const screenTopics  = el("screenTopics");
const screenReview  = el("screenReview");

const systemsGrid = el("systemsGrid");
const topicsGrid  = el("topicsGrid");

const crumbSystem = el("crumbSystem");
const crumbTopic  = el("crumbTopic");

const backToSystems = el("backToSystems");
const backToTopics  = el("backToTopics");

const pathLine  = el("pathLine");
const countPill = el("countPill");
const cardText  = el("cardText");
const hintLine  = el("hintLine");

const prevBtn = el("prevBtn");
const nextBtn = el("nextBtn");
const swipeSurface = el("swipeSurface");

const srcQuick   = el("srcQuick");
const srcFA      = el("srcFA");
const srcPathoma = el("srcPathoma");
const imagesBtn  = el("imagesBtn");

/* Images overlay */
const imgOverlay = el("imgOverlay");
const closeImages = el("closeImages");
const imgEl = el("imgEl");
const imgPrev = el("imgPrev");
const imgNext = el("imgNext");
const imgSub = el("imgSub");
const imgCaption = el("imgCaption");
const imgSwipeSurface = el("imgSwipeSurface");

/* Settings overlay */
const settingsBtn = el("settingsBtn");
const settingsOverlay = el("settingsOverlay");
const closeSettings = el("closeSettings");
const themeButtons = Array.from(document.querySelectorAll(".segBtn"));

const state = {
  index: null,
  system: null,
  topic: null,
  source: "quick", // quick|firstaid|pathoma
  cards: [],
  cardIdx: 0,
  images: [],
  imgIdx: 0
};

function show(screen){
  [screenSystems, screenTopics, screenReview].forEach(s => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function pretty(s){ return String(s).replace(/_/g, " "); }

function progressKey(){
  return `${state.system}::${state.topic}::${state.source}`;
}
function loadAllProgress(){
  try{
    const raw = localStorage.getItem(LS_PROGRESS);
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}
function saveProgress(){
  const all = loadAllProgress();
  all[progressKey()] = { idx: state.cardIdx, t: Date.now() };
  localStorage.setItem(LS_PROGRESS, JSON.stringify(all));
}
function loadProgress(){
  const all = loadAllProgress();
  return all[progressKey()] || null;
}

/* Theme */
function isNightByTime(){
  const h = new Date().getHours();
  return (h >= 19 || h < 7);
}
function prefersDark(){
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function updateThemeUI(mode){
  themeButtons.forEach(b => b.classList.toggle("active", b.dataset.theme === mode));
}
function getThemeMode(){
  return localStorage.getItem(LS_THEME) || "auto";
}
function applyTheme(mode){
  if(!mode) mode = "auto";
  document.documentElement.removeAttribute("data-theme");

  let resolved = mode;
  if(mode === "auto"){
    resolved = (prefersDark() || isNightByTime()) ? "dark" : "light";
  }
  if(resolved === "light"){
    document.documentElement.setAttribute("data-theme", "light");
  }
  localStorage.setItem(LS_THEME, mode);
  updateThemeUI(mode);
}

/* Fetch */
async function fetchText(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.text();
}
function splitIntoCards(text){
  return text.replace(/\r\n/g,"\n")
    .split(/\n\s*\n+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

/* Render systems */
function renderSystems(){
  systemsGrid.innerHTML = "";
  const systems = Object.keys(state.index.systems || {}).sort();
  for(const sys of systems){
    const topicCount = Object.keys(state.index.systems[sys] || {}).length;
    const div = document.createElement("div");
    div.className = "tile";
    div.innerHTML = `<b>${pretty(sys)}</b><span>${topicCount} topic${topicCount===1?"":"s"}</span>`;
    div.onclick = () => openSystem(sys);
    systemsGrid.appendChild(div);
  }
  show(screenSystems);
  statusLine.textContent = `Loaded ${systems.length} systems • ${new Date(state.index.generatedAt).toLocaleString()}`;
}

function renderTopics(system){
  topicsGrid.innerHTML = "";
  crumbSystem.textContent = pretty(system);

  const topics = Object.keys(state.index.systems[system] || {}).sort();
  for(const topic of topics){
    const srcs = state.index.systems[system][topic].sources;
    const q = srcs.quick?.length || 0;
    const f = srcs.firstaid?.length || 0;
    const p = srcs.pathoma?.length || 0;
    const im = srcs.images?.length || 0;

    const div = document.createElement("div");
    div.className = "tile";
    div.innerHTML = `<b>${pretty(topic)}</b><span>Q:${q} • FA:${f} • P:${p} • Img:${im}</span>`;
    div.onclick = () => openTopic(system, topic);
    topicsGrid.appendChild(div);
  }
  show(screenTopics);
}

function openSystem(sys){
  state.system = sys;
  state.topic = null;
  renderTopics(sys);
}

async function loadSourceDeck(system, topic, sourceKey){
  const srcs = state.index.systems[system][topic].sources;
  const files = srcs[sourceKey] || [];
  const cards = [];
  for(const file of files){
    const text = await fetchText(file);
    cards.push(...splitIntoCards(text));
  }
  return cards;
}

async function openTopic(system, topic){
  state.system = system;
  state.topic = topic;

  const srcs = state.index.systems[system][topic].sources;

  // Choose first available source
  if(srcs.quick?.length) state.source = "quick";
  else if(srcs.firstaid?.length) state.source = "firstaid";
  else if(srcs.pathoma?.length) state.source = "pathoma";
  else state.source = "quick";

  crumbTopic.textContent = `${pretty(system)} › ${pretty(topic)}`;
  show(screenReview);

  await setSource(state.source);

  state.images = srcs.images || [];
  updateButtons();
  renderCard();
}

async function setSource(sourceKey){
  state.source = sourceKey;
  state.cards = await loadSourceDeck(state.system, state.topic, sourceKey);

  const prog = loadProgress();
  state.cardIdx = prog ? clamp(prog.idx || 0, 0, Math.max(0, state.cards.length - 1)) : 0;

  updateButtons();
  renderCard();
}

function updateButtons(){
  const srcs = state.index.systems[state.system][state.topic].sources;
  const hasQ = (srcs.quick?.length || 0) > 0;
  const hasF = (srcs.firstaid?.length || 0) > 0;
  const hasP = (srcs.pathoma?.length || 0) > 0;
  const hasI = (srcs.images?.length || 0) > 0;

  srcQuick.disabled = !hasQ;
  srcFA.disabled = !hasF;
  srcPathoma.disabled = !hasP;
  imagesBtn.disabled = !hasI;

  srcQuick.classList.toggle("primary", state.source === "quick");
  srcFA.classList.toggle("primary", state.source === "firstaid");
  srcPathoma.classList.toggle("primary", state.source === "pathoma");

  imagesBtn.textContent = hasI ? `🖼️ Images (${srcs.images.length})` : "🖼️ Images (0)";
}

function renderCard(){
  const total = state.cards.length;
  state.cardIdx = clamp(state.cardIdx, 0, Math.max(0, total - 1));

  pathLine.textContent = `${pretty(state.system)} › ${pretty(state.topic)} • ${state.source.toUpperCase()}`;
  countPill.textContent = total ? `Card ${state.cardIdx+1} / ${total}` : "No cards";
  cardText.textContent = total ? state.cards[state.cardIdx] : "No text files found for this source/topic.";

  hintLine.textContent = "One paragraph = one card. Swipe left/right.";
  saveProgress();
}

function nextCard(){
  if(!state.cards.length) return;
  state.cardIdx = clamp(state.cardIdx + 1, 0, state.cards.length - 1);
  renderCard();
}
function prevCard(){
  if(!state.cards.length) return;
  state.cardIdx = clamp(state.cardIdx - 1, 0, state.cards.length - 1);
  renderCard();
}

/* Images */
function openImages(){
  const imgs = state.index.systems[state.system][state.topic].sources.images || [];
  state.images = imgs;
  state.imgIdx = 0;
  imgOverlay.classList.add("show");
  renderImage();
}
function closeImagesOverlay(){
  imgOverlay.classList.remove("show");
}
function renderImage(){
  const total = state.images.length;
  if(!total){
    imgSub.textContent = `${pretty(state.system)} › ${pretty(state.topic)} • 0 images`;
    imgCaption.textContent = "No images found.";
    imgEl.removeAttribute("src");
    return;
  }
  state.imgIdx = clamp(state.imgIdx, 0, total - 1);
  const url = state.images[state.imgIdx];
  imgEl.src = url;
  imgSub.textContent = `${pretty(state.system)} › ${pretty(state.topic)} • ${state.imgIdx+1}/${total}`;
  imgCaption.textContent = url.split("/").pop();
}
function imgNextFn(){
  if(!state.images.length) return;
  state.imgIdx = clamp(state.imgIdx + 1, 0, state.images.length - 1);
  renderImage();
}
function imgPrevFn(){
  if(!state.images.length) return;
  state.imgIdx = clamp(state.imgIdx - 1, 0, state.images.length - 1);
  renderImage();
}

/* Swipe */
function attachSwipe(el, onLeft, onRight){
  let x0=null, y0=null, t0=0;
  el.addEventListener("touchstart", (e)=>{
    if(!e.touches || e.touches.length!==1) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    t0 = Date.now();
  }, {passive:true});

  el.addEventListener("touchend", (e)=>{
    if(x0===null || y0===null) return;
    const dt = Date.now()-t0;
    const touch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if(!touch) return;

    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;

    if(Math.abs(dx) < 45) { x0=y0=null; return; }
    if(Math.abs(dx) < Math.abs(dy)*1.4) { x0=y0=null; return; }
    if(dt > 800) { x0=y0=null; return; }

    if(dx < 0) onLeft(); else onRight();
    x0=y0=null;
  }, {passive:true});
}

/* Settings overlay */
function openSettings(){
  settingsOverlay.classList.add("show");
  updateThemeUI(getThemeMode());
}
function closeSettingsOverlay(){
  settingsOverlay.classList.remove("show");
}

/* Events */
backToSystems.onclick = () => renderSystems();
backToTopics.onclick = () => renderTopics(state.system);

prevBtn.onclick = prevCard;
nextBtn.onclick = nextCard;

srcQuick.onclick   = () => setSource("quick");
srcFA.onclick      = () => setSource("firstaid");
srcPathoma.onclick = () => setSource("pathoma");

imagesBtn.onclick = openImages;
closeImages.onclick = closeImagesOverlay;
imgPrev.onclick = imgPrevFn;
imgNext.onclick = imgNextFn;
imgOverlay.addEventListener("click", (e)=>{ if(e.target === imgOverlay) closeImagesOverlay(); });

settingsBtn.onclick = openSettings;
closeSettings.onclick = closeSettingsOverlay;
settingsOverlay.addEventListener("click", (e)=>{ if(e.target === settingsOverlay) closeSettingsOverlay(); });

themeButtons.forEach(b => b.addEventListener("click", ()=> applyTheme(b.dataset.theme)));

window.addEventListener("keydown", (e)=>{
  if(imgOverlay.classList.contains("show")){
    if(e.key==="ArrowRight") imgNextFn();
    if(e.key==="ArrowLeft") imgPrevFn();
    if(e.key==="Escape") closeImagesOverlay();
    return;
  }
  if(settingsOverlay.classList.contains("show")){
    if(e.key==="Escape") closeSettingsOverlay();
    return;
  }
  if(!screenReview.classList.contains("hidden")){
    if(e.key==="ArrowRight") nextCard();
    if(e.key==="ArrowLeft") prevCard();
    if(e.key==="Escape") renderTopics(state.system);
  }
});

attachSwipe(swipeSurface, nextCard, prevCard);
attachSwipe(imgSwipeSurface, imgNextFn, imgPrevFn);

/* Boot */
async function boot(){
  applyTheme(getThemeMode());
  window.addEventListener("focus", ()=> { if(getThemeMode()==="auto") applyTheme("auto"); });

  const res = await fetch(INDEX_URL, { cache: "no-store" });
  if(!res.ok){
    statusLine.textContent = "Missing app/index.json — create it (sample below).";
    return;
  }
  state.index = await res.json();
  renderSystems();
}

boot();
