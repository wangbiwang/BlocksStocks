const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 载入 V9 策略（含 evaluateBlockStrongV9）
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'v9', 'js', 'strategy.js'), 'utf8'), sandbox);
const { handleRate, evaluateBlockStrongV9 } = sandbox;

const ROOT = path.join(__dirname, 'v8', 'cache');

function loadRows(f) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return j?._raw?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas || [];
  } catch (e) { return null; }
}
function fd(k, p) { const s = new Set(); for (const x of k) { const m = x.match(p); if (m) s.add(m[1]); } return s; }
function classify(arr) {
  const k = Object.keys(arr[0] || {});
  return {
    t0935: fd(k, /(\d{8}) 09:35/),
    ma: fd(k, /均线\[(\d{8})\]/),
    macd: fd(k, /macd\((?:diff|dea)值\)\[(\d{8})\]/),
    has0935: k.some(x => x.includes('09:35')),
  };
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) {
      const arr = loadRows(p);
      if (!arr || !arr.length) return;
      const rel = p.slice(ROOT.length + 1).split(path.sep).join('/');
      const seg = rel.split('/');
      const kind = seg.includes('stock') ? 'stock' : 'block';
      const tf = kind === 'block' ? seg[1] : seg[2];
      files.push({ rel, kind, typeFolder: tf, arr });
    }
  }
})(ROOT);
for (const f of files) f.sig = classify(f.arr);

const cal = JSON.parse(fs.readFileSync(path.join(__dirname, 'v9', 'calendar.json'), 'utf8'));
const idxOf = new Map(cal.map((d, i) => [d, i]));
const dateInfo = d => { const i = idxOf.get(d); if (i === undefined) return null; return { td: d, pd1: cal[i - 1], pd2: cal[i - 2] }; };
const pick = (kind, tf, pred) => files.filter(f => f.kind === kind && f.typeFolder === tf && pred(f.sig));

function getBlock(D, bt, name) {
  const di = dateInfo(D);
  if (!di) return null;
  const pd1 = di.pd1;
  const q0 = pick('block', bt, s => s.t0935.has(D) && s.has0935);
  const q1 = pick('block', bt, s => s.ma.has(pd1) && !s.macd.has(pd1));
  const q2 = pick('block', bt, s => s.macd.has(pd1));
  const a0 = q0[0]?.arr, a1 = q1[0]?.arr, a2 = q2[0]?.arr;
  if (!a0 || !a1 || !a2) return null;
  const m0 = new Map(a0.map((it, i) => [it.code, { item: it, rank: i + 1 }]));
  const m1 = new Map(a1.map(it => [it.code, it]));
  const m2 = new Map(a2.map(it => [it.code, it]));
  let found = null;
  m0.forEach((v0, code) => {
    if (m1.has(code) && m2.has(code)) {
      const mr = { ...v0.item, ...m1.get(code), ...m2.get(code) };
      mr['09:35涨跌幅排名'] = v0.rank;
      const obj = {};
      handleRate(obj, mr, 'block', di);
      if ((obj['指数简称'] || '') === name) found = obj;
    }
  });
  return found;
}

// 历史测试用例（Block 层面）：V9 必须判定为主线板块
const CASES = [
  { td: '20240103', block: '旅游及酒店', type: '行业', stock: '长白山' },
  { td: '20240516', block: '房地产', type: '行业', stock: '我爱我家' },
  { td: '20240711', block: '网约车', type: '概念', stock: '大众交通' },
  { td: '20240816', block: '华为海思概念股', type: '概念', stock: '深圳华强' },
  { td: '20241101', block: '小金属', type: '行业', stock: '云南锗业' },
  { td: '20241101', block: '光刻机', type: '概念', stock: '海立股份' },
  { td: '20240301', block: '液冷服务器', type: '概念', stock: '光迅科技' },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  const di = dateInfo(c.td);
  const blockItem = getBlock(c.td, c.type, c.block);
  if (!blockItem) { console.log('🔍', c.td, c.block, '数据缺失'); fail++; continue; }
  const r = evaluateBlockStrongV9(blockItem, di);
  const ok = r.isStrong;
  if (ok) pass++; else fail++;
  const failed = Object.entries(r.conditions).filter(([, v]) => !v).map(([k]) => k).join(',');
  console.log(`${ok ? '✅' : '❌'} ${c.td} ${c.block}(${c.type}) → ${c.stock}  ${ok ? '' : '未满足: ' + failed}`);
}
console.log(`\nBlock 历史用例通过: ${pass}/${CASES.length}  失败: ${fail}/${CASES.length}`);
process.exit(fail === 0 ? 0 : 1);
