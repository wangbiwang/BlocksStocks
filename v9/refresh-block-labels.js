/*
 * Recompute V9/V7 block labels in dataset.json from v8/cache raw answers.
 *
 * The generated dataset stores b_strong_v9 as a precomputed flag. When the
 * block strategy changes, those flags become stale without rebuilding the
 * full dataset or fetching new K-line data. This script refreshes block-level
 * flags and block context fields offline and preserves existing return labels.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CACHE_ROOT = path.join(__dirname, '..', 'v8', 'cache');
const DS = path.join(__dirname, 'dataset.json');
const CAL = path.join(__dirname, 'calendar.json');

const data = JSON.parse(fs.readFileSync(DS, 'utf8'));
const cal = JSON.parse(fs.readFileSync(CAL, 'utf8'));

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'strategy.js'), 'utf8'), sandbox);
const { handleRate, evaluateBlockStrong, evaluateBlockStrongV9 } = sandbox;

function loadRows(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return j?._raw?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas || [];
  } catch (e) {
    return null;
  }
}

function fieldDates(keys, pattern) {
  const out = new Set();
  for (const key of keys) {
    const m = key.match(pattern);
    if (m) out.add(m[1]);
  }
  return out;
}

function classify(arr) {
  const keys = Object.keys(arr[0] || {});
  return {
    t0935: fieldDates(keys, /(\d{8}) 09:35/),
    ma: fieldDates(keys, /均线\[(\d{8})\]/),
    macd: fieldDates(keys, /macd\((?:diff|dea)值\)\[(\d{8})\]/),
    has0935: keys.some((key) => key.includes('09:35')),
  };
}

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.json')) {
      const arr = loadRows(full);
      if (!arr || !arr.length) continue;
      const rel = full.slice(CACHE_ROOT.length + 1).split(path.sep).join('/');
      const seg = rel.split('/');
      const kind = seg.includes('stock') ? 'stock' : 'block';
      const typeFolder = kind === 'block' ? seg[1] : seg[2];
      files.push({ kind, typeFolder, arr });
    }
  }
})(CACHE_ROOT);

for (const file of files) file.sig = classify(file.arr);

const idxOf = new Map(cal.map((d, i) => [d, i]));
const dateInfo = (d) => {
  const i = idxOf.get(d);
  if (i === undefined) return null;
  return { td: d, pd1: cal[i - 1], pd2: cal[i - 2], pd3: cal[i - 3], pd4: cal[i - 4] };
};

function pick(kind, typeFolder, pred) {
  return files.filter((f) => f.kind === kind && f.typeFolder === typeFolder && pred(f.sig));
}

function folderKey(type, name) {
  return `${type}-${String(name || '').replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_').slice(0, 30)}`;
}

function buildBlockMetas(D) {
  const di = dateInfo(D);
  if (!di) return null;
  const pd1 = di.pd1;
  const metas = new Map();
  const byFolder = new Map();
  const counts = { 行业: 0, 概念: 0 };

  for (const bt of ['行业', '概念']) {
    const q0 = pick('block', bt, (s) => s.t0935.has(D) && s.has0935)[0];
    const q1 = pick('block', bt, (s) => s.ma.has(pd1) && !s.macd.has(pd1))[0];
    const q2 = pick('block', bt, (s) => s.macd.has(pd1))[0];
    if (!q0 || !q1 || !q2) continue;

    const m0 = new Map((q0.arr || []).map((it, i) => [it.code, { item: it, rank: i + 1 }]));
    const m1 = new Map((q1.arr || []).map((it) => [it.code, it]));
    const m2 = new Map((q2.arr || []).map((it) => [it.code, it]));
    const merged = [];

    m0.forEach((v0, code) => {
      if (!m1.has(code) || !m2.has(code)) return;
      const mr = { ...v0.item, ...m1.get(code), ...m2.get(code) };
      mr['09:35涨跌幅排名'] = v0.rank;
      const obj = {};
      handleRate(obj, mr, 'block', di);
      merged.push(obj);
    });

    merged.sort((a, b) => (b[pd1]?.涨跌幅 ?? -1e9) - (a[pd1]?.涨跌幅 ?? -1e9));
    merged.forEach((it, i) => { it['昨日涨跌幅排名'] = i + 1; });

    for (const obj of merged) {
      const name = obj['指数简称'] || '';
      const strong = evaluateBlockStrong(obj, di).isStrong;
      const strongV9 = evaluateBlockStrongV9(obj, di).isStrong;
      metas.set(`${bt}|${name}`, { bt, obj, strong, strongV9 });
      byFolder.set(folderKey(bt, name), { bt, obj, strong, strongV9 });
      if (strongV9) counts[bt]++;
    }
  }

  return { metas, byFolder, counts };
}

const rowsByDate = new Map();
for (const row of data) {
  if (!rowsByDate.has(row.D)) rowsByDate.set(row.D, []);
  rowsByDate.get(row.D).push(row);
}

let changed = 0;
let missing = 0;
for (const [D, rows] of rowsByDate) {
  const built = buildBlockMetas(D);
  if (!built) continue;
  const nStrongInd = built.counts.行业;
  const nStrongCon = built.counts.概念;

  for (const row of rows) {
    const meta = built.metas.get(`${row.blockType}|${row.block}`)
      || built.byFolder.get(folderKey(row.blockType, row.block));
    if (!meta) {
      missing++;
      continue;
    }
    row.b_strong = meta.strong ? 1 : 0;
    row.b_strong_v9 = meta.strongV9 ? 1 : 0;
    row.b_pd1Chg = meta.obj[dateInfo(D).pd1]?.涨跌幅 || 0;
    row.b_chg0935 = meta.obj[`${D} 09:35`]?.涨跌幅 || 0;
    row.b_limitUpCount = meta.obj.limitUpCount || 0;
    row.b_rank0935 = meta.obj['09:35涨跌幅排名'] || 9999;
    row.b_rankPd1 = meta.obj['昨日涨跌幅排名'] || 9999;
    row.nStrongInd = nStrongInd;
    row.nStrongCon = nStrongCon;
    row.nStrongBlocks = nStrongInd + nStrongCon;
    changed++;
  }
}

if (missing > 0) {
  console.error(`missing block meta for ${missing} rows; dataset not written`);
  process.exit(1);
}

fs.writeFileSync(DS, JSON.stringify(data, null, 0));
console.log(`refreshed block labels for ${changed}/${data.length} rows`);
