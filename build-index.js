// build-index.js (ROOT)
// Scans: quick/, firstaid/, pathoma/, images/
// Outputs: app/index.json
//
// Convention:
//   quick/<system>/<topic>.txt
//   quick/<system>/<topic>2.txt
//   images/<system>/<topic>.jpg
//   images/<system>/<topic>2.jpg
//
// Run locally (recommended):
//   node build-index.js

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const OUT_FILE = path.join(ROOT, "app", "index.json");

const SOURCES = [
  { key: "quick",    dir: path.join(ROOT, "quick"),    kind: "txt" },
  { key: "firstaid", dir: path.join(ROOT, "firstaid"), kind: "txt" },
  { key: "pathoma",  dir: path.join(ROOT, "pathoma"),  kind: "txt" },
  { key: "images",   dir: path.join(ROOT, "images"),   kind: "img" },
];

const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function isDir(p){ try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p){ try { return fs.statSync(p).isFile(); } catch { return false; } }

function listDirs(dir){
  if(!isDir(dir)) return [];
  return fs.readdirSync(dir).map(n => path.join(dir, n)).filter(isDir);
}

function listFiles(dir){
  if(!isDir(dir)) return [];
  return fs.readdirSync(dir).map(n => path.join(dir, n)).filter(isFile);
}

function parseBasePart(filenameNoExt){
  // dic_hus_ttp -> base dic_hus_ttp, part 1
  // dic_hus_ttp2 -> base dic_hus_ttp, part 2
  const m = filenameNoExt.match(/^(.*?)(\d+)?$/);
  const base = (m && m[1]) ? m[1] : filenameNoExt;
  const part = (m && m[2]) ? parseInt(m[2], 10) : 1;
  return { base, part };
}

function toPosix(p){ return p.split(path.sep).join("/"); }
function relWebPath(absPath){ return toPosix(path.relative(ROOT, absPath)); }

function ensureTopic(index, sys, topic){
  index.systems[sys] ||= {};
  index.systems[sys][topic] ||= { sources: { quick: [], firstaid: [], pathoma: [], images: [] } };
  index.systems[sys][topic].sources ||= { quick: [], firstaid: [], pathoma: [], images: [] };
  return index.systems[sys][topic];
}

function build(){
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    systems: {}
  };

  console.log("🔎 Scanning content folders…");

  for(const src of SOURCES){
    console.log(`\n=== ${src.key.toUpperCase()} (${src.dir}) ===`);
    if(!isDir(src.dir)){
      console.log("  (missing folder — skipped)");
      continue;
    }

    const sysDirs = listDirs(src.dir);
    console.log(`  Systems found: ${sysDirs.map(d => path.basename(d)).join(", ") || "(none)"}`);

    for(const sysPath of sysDirs){
      const sysName = path.basename(sysPath);

      const files = listFiles(sysPath);
      console.log(`  - ${sysName}: ${files.length} file(s)`);

      const topicMap = new Map();

      for(const f of files){
        const ext = path.extname(f).toLowerCase();
        const nameNoExt = path.basename(f, ext);
        const { base, part } = parseBasePart(nameNoExt);

        if(src.kind === "txt" && ext !== ".txt") continue;
        if(src.kind === "img" && !IMG_EXTS.has(ext)) continue;

        if(!topicMap.has(base)) topicMap.set(base, []);
        topicMap.get(base).push({ part, path: relWebPath(f) });
      }

      for(const [topicBase, parts] of topicMap.entries()){
        parts.sort((a,b) => a.part - b.part);
        const topicObj = ensureTopic(index, sysName, topicBase);
        topicObj.sources[src.key] = parts.map(x => x.path);
      }
    }
  }

  // Remove topics that truly have nothing
  for(const sys of Object.keys(index.systems)){
    for(const topic of Object.keys(index.systems[sys])){
      const s = index.systems[sys][topic].sources;
      const any = Object.values(s).some(arr => Array.isArray(arr) && arr.length > 0);
      if(!any) delete index.systems[sys][topic];
    }
    if(Object.keys(index.systems[sys]).length === 0) delete index.systems[sys];
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2), "utf8");

  const sysCount = Object.keys(index.systems).length;
  const topicCount = Object.values(index.systems).reduce((acc, sysObj) => acc + Object.keys(sysObj).length, 0);

  console.log(`\n✅ Wrote ${relWebPath(OUT_FILE)} (${sysCount} systems, ${topicCount} topics)`);
}

build();
