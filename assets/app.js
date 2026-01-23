(async function () {
  const $ = (id) => document.getElementById(id);

  const drawer = $("drawer");
  const settings = $("settings");
  const nav = $("nav");
  const search = $("search");
  const reader = $("reader");
  const welcome = $("welcome");

  const btnMenu = $("btnMenu");
  const btnCloseDrawer = $("btnCloseDrawer");
  const btnSettings = $("btnSettings");
  const btnCloseSettings = $("btnCloseSettings");
  const btnHighlight = $("btnHighlight");
  const btnClearHighlights = $("btnClearHighlights");

  const fontSize = $("fontSize");
  const fontSizeVal = $("fontSizeVal");

  // ---------- Settings persistence ----------
  const PREF_KEY = "sr:prefs";
  const prefs = loadJson(PREF_KEY, { theme: "dark", fontSize: 19 });

  function applyPrefs() {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.style.setProperty("--readerSize", `${prefs.fontSize}px`);
    fontSize.value = String(prefs.fontSize);
    fontSizeVal.textContent = `${prefs.fontSize}px`;

    document.querySelectorAll(".segbtn").forEach(b => {
      b.classList.toggle("active", b.dataset.theme === prefs.theme);
    });
  }

  document.querySelectorAll(".segbtn").forEach(b => {
    b.addEventListener("click", () => {
      prefs.theme = b.dataset.theme;
      saveJson(PREF_KEY, prefs);
      applyPrefs();
    });
  });

  fontSize.addEventListener("input", () => {
    prefs.fontSize = Number(fontSize.value);
    saveJson(PREF_KEY, prefs);
    applyPrefs();
  });

  applyPrefs();

  // ---------- Drawer + Settings open/close ----------
  function openDrawer(){ drawer.classList.add("open"); drawer.setAttribute("aria-hidden","false"); }
  function closeDrawer(){ drawer.classList.remove("open"); drawer.setAttribute("aria-hidden","true"); }
  function openSettings(){ settings.classList.add("open"); settings.setAttribute("aria-hidden","false"); }
  function closeSettings(){ settings.classList.remove("open"); settings.setAttribute("aria-hidden","true"); }

  btnMenu.addEventListener("click", openDrawer);
  btnCloseDrawer.addEventListener("click", closeDrawer);
  btnSettings.addEventListener("click", openSettings);
  btnCloseSettings.addEventListener("click", closeSettings);

  // ---------- Load index (ROOT/index.json) ----------
  let index;
  try {
    index = await fetch("index.json", { cache: "no-store" }).then(r => r.json());
  } catch (e) {
    welcome.style.display = "block";
    welcome.innerHTML = `<h1>Missing index.json</h1>
      <p class="muted">Run the build script (or push to GitHub so Actions builds it).</p>`;
    return;
  }

  const items = index.items || [];

  // Build groups: source/system
  function groupKey(it){ return `${it.source}|||${it.system}`; }

  function renderNav(list) {
    nav.innerHTML = "";
    const grouped = new Map();
    for (const it of list) {
      const k = groupKey(it);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(it);
    }

    const keys = [...grouped.keys()].sort((a,b)=>a.localeCompare(b));
    for (const k of keys) {
      const [source, system] = k.split("|||");
      const h = document.createElement("div");
      h.className = "groupTitle";
      h.textContent = `${source} / ${system}`;
      nav.appendChild(h);

      for (const it of grouped.get(k)) {
        const b = document.createElement("button");
        b.className = "navItem";
        b.innerHTML = `${esc(it.title)}<span class="sub">${esc(it.updated.slice(0,10))}</span>`;
        b.addEventListener("click", () => openChapter(it));
        nav.appendChild(b);
      }
    }
  }

  renderNav(items);

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) return renderNav(items);
    const filtered = items.filter(it => {
      const hay = `${it.source} ${it.system} ${it.title}`.toLowerCase();
      return hay.includes(q);
    });
    renderNav(filtered);
  });

  // ---------- Chapter loading (full-screen reader) ----------
  const LAST_KEY = "sr:last";
  const last = loadJson(LAST_KEY, null);

  let current = null; // current item

  // Restore last
  if (last?.url) {
    const match = items.find(x => x.url === last.url);
    if (match) await openChapter(match, { restoreScroll: true, silent: true });
  }

  async function openChapter(it, opts = {}) {
    current = it;
    closeDrawer();

    // mark active nav item
    document.querySelectorAll(".navItem").forEach(el => el.classList.remove("active"));
    // best-effort: re-render nav to ensure we can highlight, then highlight by matching title
    // (simple and stable without IDs)
    // We won't force re-render here; instead highlight after load by searching in existing buttons.
    highlightActiveButton(it);

    welcome.style.display = "none";
    reader.style.display = "block";
    reader.innerHTML = `<div class="muted">Loading…</div>`;

    let html;
    try {
      html = await fetch(it.url, { cache: "no-store" }).then(r => r.text());
    } catch (e) {
      reader.innerHTML = `<h1>Error</h1><p class="muted">Could not load: ${esc(it.url)}</p>`;
      return;
    }

    // IMPORTANT: chapter HTML is a fragment. We inject it directly.
    reader.innerHTML = html;

    // Fix relative URLs inside the fragment so images/links work:
    // Any src/href that does NOT start with (http, https, /, #, mailto, data)
    // will be resolved relative to the chapter file location.
    fixRelativeUrls(reader, it.url);

    // Apply stored highlights for this chapter (AFTER HTML injected)
    applyHighlights(it.url);

    // Restore scroll
    const main = document.querySelector(".main");
    const scrollKey = `sr:scroll:${it.url}`;
    if (opts.restoreScroll) {
      const y = Number(localStorage.getItem(scrollKey) || "0");
      main.scrollTop = y;
    } else {
      main.scrollTop = 0;
    }

    saveJson(LAST_KEY, { url: it.url });

    if (!opts.silent) {
      // close settings if open
      closeSettings();
    }
  }

  function highlightActiveButton(it) {
    const buttons = [...document.querySelectorAll(".navItem")];
    for (const b of buttons) {
      // title is first line before sub; easiest is check for title text match
      if (b.textContent && b.textContent.includes(it.title)) {
        b.classList.add("active");
        break;
      }
    }
  }

  function fixRelativeUrls(rootEl, chapterUrl) {
    const baseDir = chapterUrl.split("/").slice(0, -1).join("/") + "/";
    const isRelative = (u) => {
      if (!u) return false;
      return !(
        u.startsWith("http://") ||
        u.startsWith("https://") ||
        u.startsWith("/") ||
        u.startsWith("#") ||
        u.startsWith("mailto:") ||
        u.startsWith("data:")
      );
    };

    rootEl.querySelectorAll("[src]").forEach(el => {
      const u = el.getAttribute("src");
      if (isRelative(u)) el.setAttribute("src", baseDir + u);
    });
    rootEl.querySelectorAll("[href]").forEach(el => {
      const u = el.getAttribute("href");
      if (isRelative(u)) el.setAttribute("href", baseDir + u);
    });
  }

  // Track scroll per chapter
  const main = document.querySelector(".main");
  main.addEventListener("scroll", () => {
    if (!current) return;
    localStorage.setItem(`sr:scroll:${current.url}`, String(main.scrollTop));
  }, { passive: true });

  // ---------- Highlighting ----------
  btnHighlight.addEventListener("click", () => {
    if (!current) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    if (!reader.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) return;

    const h = serializeRange(range, reader);
    if (!h) return;

    wrapRangeWithMark(range);

    const key = highlightsKey(current.url);
    const arr = loadJson(key, []);
    arr.push(h);
    saveJson(key, arr);

    sel.removeAllRanges();
  });

  btnClearHighlights.addEventListener("click", () => {
    if (!current) return;
    reader.querySelectorAll("mark.hl").forEach(m => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    localStorage.removeItem(highlightsKey(current.url));
  });

  function highlightsKey(url){ return `sr:hl:${url}`; }

  function applyHighlights(url) {
    const arr = loadJson(highlightsKey(url), []);
    if (!Array.isArray(arr) || arr.length === 0) return;

    for (const h of arr) {
      const range = deserializeRange(h, reader);
      if (!range) continue;
      wrapRangeWithMark(range);
    }
  }

  function wrapRangeWithMark(range) {
    try {
      const mark = document.createElement("mark");
      mark.className = "hl";
      range.surroundContents(mark);
    } catch {
      const mark = document.createElement("mark");
      mark.className = "hl";
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
    }
  }

  function serializeRange(range, root) {
    const start = nodePathAndOffset(range.startContainer, range.startOffset, root);
    const end = nodePathAndOffset(range.endContainer, range.endOffset, root);
    if (!start || !end) return null;
    return { start, end };
  }

  function deserializeRange(obj, root) {
    try {
      const s = resolvePath(obj.start.path, root);
      const e = resolvePath(obj.end.path, root);
      if (!s || !e) return null;

      const r = document.createRange();
      r.setStart(s, obj.start.offset);
      r.setEnd(e, obj.end.offset);
      return r;
    } catch {
      return null;
    }
  }

  function nodePathAndOffset(node, offset, root) {
    const path = [];
    let cur = node;

    if (cur.nodeType === Node.ELEMENT_NODE) {
      const child = cur.childNodes[offset] || cur.childNodes[cur.childNodes.length - 1];
      if (child) cur = child;
    }

    while (cur && cur !== root) {
      const parent = cur.parentNode;
      if (!parent) return null;
      const idx = Array.prototype.indexOf.call(parent.childNodes, cur);
      path.push(idx);
      cur = parent;
    }
    if (cur !== root) return null;
    return { path: path.reverse(), offset };
  }

  function resolvePath(pathArr, root) {
    let cur = root;
    for (const idx of pathArr) {
      if (!cur || !cur.childNodes || !cur.childNodes[idx]) return null;
      cur = cur.childNodes[idx];
    }
    return cur;
  }

  // ---------- Helpers ----------
  function esc(s){
    return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }
  function loadJson(key, fallback){
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function saveJson(key, val){
    localStorage.setItem(key, JSON.stringify(val));
  }
})();
