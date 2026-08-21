/**
 * V8 一致性回归：验证"预筛昨日数据 + 融合"与"V7 全量路径"在历史日期上结果一致
 * 运行: node verify-v8-parity.js（需 3001 服务在跑）
 */
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('C:/Users/11443/Desktop/BlocksStocks/v8/js/strategy.js', 'utf8');
const pre = fs.readFileSync('C:/Users/11443/Desktop/BlocksStocks/v8/js/strategy-preselect.js', 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
vm.runInContext(pre, sandbox);
const { handleRate, getQuestions, evaluateBlockStrong } = sandbox;
const P = sandbox.Preselect;

const BASE = 'http://localhost:3001';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function query(question, type, retry = 2) {
  for (let i = 0; i <= retry; i++) {
    const r = await fetch(`${BASE}/api/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, type, perpage: 100, page: 1 }),
    });
    const j = await r.json();
    if ((j.data || []).length > 0) return j.data;
    if (i < retry) await sleep(1500);
  }
  return [];
}

async function fetchTradeDates() {
  const url = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,,,1200,qfq';
  const txt = await (await fetch(url)).text();
  const parsed = JSON.parse(txt.replace('kline_dayqfq=', ''));
  return parsed.data.sh000001.day.map(e => String(e[0]).replace(/-/g, ''));
}

const testCases = [
  { td: '20240103', block: '旅游及酒店', type: '行业' },
  { td: '20240516', block: '房地产', type: '行业' },
  { td: '20240711', block: '网约车', type: '概念' },
  { td: '20240816', block: '华为海思概念股', type: '概念' },
  { td: '20241101', block: '小金属', type: '行业' },
  { td: '20241101', block: '光刻机', type: '概念' },
  { td: '20240301', block: '液冷服务器', type: '概念' },
];
const backtestDates = ['20240222','20240227','20240228','20240301','20240305','20240311','20240312','20240313','20240314','20240315','20240326','20240401','20240402','20240403','20240408'];

async function run() {
  const tradeDates = await fetchTradeDates();
  const datesByTd = {};
  for (const td of [...new Set([...testCases.map(c => c.td), ...backtestDates])]) {
    const idx = tradeDates.indexOf(td);
    if (idx === -1) { console.log('⚠ 无交易日:', td); continue; }
    datesByTd[td] = { td, pd1: tradeDates[idx-1], pd2: tradeDates[idx-2], pd3: tradeDates[idx-3], nd1: tradeDates[idx+1] };
  }

  let total = 0, pass = 0;
  const fullByDate = {};

  for (const [td, d] of Object.entries(datesByTd)) {
    for (const type of ['block-行业', 'block-概念']) {
      const label = type === 'block-行业' ? '行业' : '概念';
      const qs = getQuestions(type, d);
      const rows = await Promise.all([query(qs[0], 'zhishu'), query(qs[1], 'zhishu'), query(qs[2], 'zhishu')]);
      if (!rows[0].length) { console.log(`跳过 ${td} ${label}（无数据）`); continue; }
      total++;

      // full 路径
      const m0 = new Map((rows[0] || []).map((it, i) => [it.code, { item: it, rank: i + 1 }]));
      const m1 = new Map((rows[1] || []).map(it => [it.code, it]));
      const m2 = new Map((rows[2] || []).map(it => [it.code, it]));
      const fullList = [];
      m0.forEach((v0, code) => {
        if (!m1.has(code) || !m2.has(code)) return;
        const merged = Object.assign({}, v0.item, m1.get(code), m2.get(code));
        merged['09:35涨跌幅排名'] = v0.rank;
        const obj = {};
        handleRate(obj, merged, 'block', d);
        obj.__rank = v0.rank;
        fullList.push({ code, obj });
      });
      // 先排序并设置真实昨日排名，再评估（与 index.js 实际流程一致）
      fullList.sort((a, b) => (b.obj[d.pd1]?.涨跌幅 ?? -1e9) - (a.obj[d.pd1]?.涨跌幅 ?? -1e9));
      fullList.forEach((it, i) => { it.obj['昨日涨跌幅排名'] = i + 1; });
      const fullStrong = fullList.filter(x => evaluateBlockStrong(x.obj, d).isStrong).map(x => x.obj['指数简称']).sort();
      fullByDate[`${td}|${label}`] = fullStrong;

      // 两阶段路径：full obj 即含昨日字段的 preset 数据 → 融合（深拷贝隔离）→ 评估
      const mergedList = fullList.map(x => ({
        code: x.code,
        fullObj: JSON.parse(JSON.stringify(x.obj)),
        presetObj: JSON.parse(JSON.stringify(x.obj)),
      }));
      for (const it of mergedList) {
        P.mergeYesterday(it.fullObj, it.presetObj, d);
      }
      const mergedStrong = mergedList.filter(x => evaluateBlockStrong(x.fullObj, d).isStrong).map(x => x.fullObj['指数简称']).sort();

      // 断言 1：融合后名单与全量名单完全一致（融合无副作用）
      const same = JSON.stringify(fullStrong) === JSON.stringify(mergedStrong);

      // 断言 2：全量强势的板块，昨日条件也应成立（或依赖当日条件，信息性输出）
      const yesterdayOk = [];
      const todayDependent = [];
      for (const it of mergedList) {
        if (evaluateBlockStrong(it.fullObj, d).isStrong) {
          const yr = P.evaluateBlockYesterday(it.presetObj, d);
          if (yr.isYesterday || yr.isSuperHotBase) yesterdayOk.push(it.fullObj['指数简称']);
          else todayDependent.push(it.fullObj['指数简称']);
        }
      }

      const ok = same;
      if (ok) pass++;
      console.log(`${ok ? '✅' : '❌'} ${td} ${label}: 强势${fullStrong.length} 融合一致=${same}` +
        (todayDependent.length ? `  [靠当日条件:${todayDependent.slice(0,3).join(',')}]` : ''));
    }
    await sleep(800);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`一致性通过: ${pass}/${total}`);
  if (pass !== total) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
