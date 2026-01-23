// tools/build.js
// Usage: node tools/build.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// Inputs
const SRC = path.join(ROOT, "sources");

// Web root outputs (GitHub Pages will publish these)
const OUT_INDEX = path.join(ROOT, "index.json");
const OUT_BUILD = path.join(ROOT, "build");
const OUT_CONTENT = path.join(OUT_BUILD, "content");
const OUT_MEDIA = path.join(OUT_BUILD, "media");

fs.mkdirSync(OUT_CONTENT, { recursive: true });
fs.mkdirSync(OUT_MEDIA, { recursive: true });

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\.docx$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const docxs = walk(SRC).filter(f => f.toLowerCase().endsWith(".docx"));
const items = [];

for (const docxPath of docxs) {
  // sources/<source>/<system>/<file>.docx
  const rel = path.relative(SRC, docxPath);
  const parts = rel.split(path.sep);
  const source = parts[0] || "unknown";
  const system = parts[1] || "misc";
  const filename = parts[parts.length - 1];

  const slug = slugify(filename);
  const title = filename.replace(/\.docx$/i, "");

  const outDir = path.join(OUT_CONTENT, source, system);
  fs.mkdirSync(outDir, { recursive: true });

  // Extract embedded media to: build/media/<source>/<system>/<slug>/*
  const mediaDir = path.join(OUT_MEDIA, source, system, slug);
  fs.mkdirSync(mediaDir, { recursive: true });

  let html = "";
  try {
    html = execSync(
      `pandoc "${docxPath}" -f docx -t html --wrap=none --extract-media="${mediaDir}"`,
      { encoding: "utf8" }
    );
  } catch (err) {
    console.error("❌ Pandoc failed:", docxPath);
    console.error(String(err));
    continue;
  }

  // Normalize image src to be web-root relative:
  // anything containing "media/..." -> "build/media/..."
  html = html.replace(/src="[^"]*?(media\/[^"]+)"/g, (_, p1) => {
    const fixed = p1.replace(/\\/g, "/");
    return `src="build/${fixed}"`;
  });

  const fragment = `<h1>${escapeHtml(title)}</h1>\n${html}`;
  const outFile = path.join(outDir, `${slug}.html`);
  fs.writeFileSync(outFile, fragment, "utf8");

  const stat = fs.statSync(docxPath);
  items.push({
    source,
    system,
    title,
    slug,
    url: `build/content/${source}/${system}/${slug}.html`.replace(/\\/g, "/"),
    updated: stat.mtime.toISOString()
  });
}

items.sort((a, b) =>
  a.source.localeCompare(b.source) ||
  a.system.localeCompare(b.system) ||
  a.title.localeCompare(b.title)
);

fs.writeFileSync(
  OUT_INDEX,
  JSON.stringify({ generated: new Date().toISOString(), items }, null, 2)
);

console.log(`✅ Built ${items.length} chapters`);
console.log(`✅ Wrote ${path.relative(ROOT, OUT_INDEX)}`);

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
