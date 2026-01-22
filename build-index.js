// build-index.js (ROOT)
// Scans: quick/, firstaid/, pathoma/, images/
// Outputs: app/index.json
//
// Topic base rule:
//   dic_hus_ttp.txt    -> base=dic_hus_ttp, part=1
//   dic_hus_ttp2.txt   -> base=dic_hus_ttp, part=2
// Same for images: dic_hus_ttp.jpg, dic_hus_ttp2.jpg, etc.
//
// Usage:
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

const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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
  const m = filenameNoExt.match(/^(.*?)(\d+)?$/);
  const base = (m && m[1]) ? m[1] : filenameNoExt;
  const part = (m && m[2]) ? parseInt(m[2], 10) : 1;
  return { base, part };
}

function toPosix(p){
  return p.split(path.sep).join("/");
}

function relWebPath(absPath){
  return toPosix(path.relative(ROOT, absPath)); // e.g. quick/hematology/dic_hus_ttp2.txt
}

// Ensure object path exists: systems[sys][topic].sources[sourceKey] = []
function ensureTopic(obj, sys, topic){
  if(!obj.systems[sys]) obj.systems[sys] = {};
  if(!obj.systems[sys][topic]) {
    obj.systems[sys][topic] = { sources: { quick: [], firstaid: [], pathoma: [], images: [] } };
  } else if(!obj.systems[sys][topic].sources) {
    obj.systems[sys][topic].sources = { quick: [], firstaid: [], pathoma: [], images: [] };
  }
  return obj.systems[sys][topic];
}

function build(){
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    systems: {}
  };

  for(const src of SOURCES){
    if(!isDir(src.dir)){
      // not fatal: you can omit folders early on
      continue;
    }

    // each system is a folder inside src.dir
    for(const sysPath of listDirs(src.dir)){
      const sysName = path.basename(sysPath);

      // topicBase -> list of parts
      const topicMap = new Map();

      for(const f of listFiles(sysPath)){
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

  // Drop empty topics (no quick/firstaid/pathoma/images at all)
  for(const sys of Object.keys(index.systems)){
    for(const topic of Object.keys(index.systems[sys])){
      const s = index.systems[sys][topic].sources;
      const any = Object.values(s).some(arr => arr && arr.length);
      if(!any) delete index.systems[sys][topic];
    }
    if(Object.keys(index.systems[sys]).length === 0) delete index.systems[sys];
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2), "utf8");
  console.log(`✅ Wrote ${relWebPath(OUT_FILE)}`);
}

build();
