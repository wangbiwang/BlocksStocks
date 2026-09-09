/* V9 回测：从 dataset.json 读取数据，对比 V8 与 V9，并输出大盘门控结果 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const DS = path.join(__dirname, 'dataset.json');
const CAL = path.join(__dirname, 'calendar.json');
if (!fs.existsSync(DS)) { console.error('缺少 dataset.json，请先运行 scratch/extract_dataset.js 重建'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(DS, 'utf8'));
const cal = JSON.parse(fs.readFileSync(CAL, 'utf8'));
const lab = data.filter(r => r.o1 != null || r.r0 != null);

// 载入 V9 模块
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'strategy-v9.js'), 'utf8'), sandbox);
const { evaluateStockV9 } = sandbox.StrategyV9;

function fetchIdx(days) {
  return new Promise((res, rej) => {
    https.get('https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,,,' + days + ',qfq', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        try { const j = JSON.parse(d.replace('kline_dayqfq=', '')); res(j.data.sh000001.qfqday || j.data.sh000001.day || []); } catch (e) { rej(e); }
      });
    }).on('error', rej);
  });
}

function stat(arr) {
  const n = arr.length;
  const o1 = arr.filter(x => x.o1 != null); const r0 = arr.filter(x => x.r0 != null);
  const avg = v => v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const win = v => v.filter(x => x > 0).length / (v.length || 1) * 100;
  return {
    n,
    o1win: o1.length ? +win(o1.map(x => x.o1)).toFixed(1) : null,
    o1avg: o1.length ? +avg(o1.map(x => x.o1)).toFixed(2) : null,
    r0win: r0.length ? +win(r0.map(x => x.r0)).toFixed(1) : null,
    r0avg: r0.length ? +avg(r0.map(x => x.r0)).toFixed(2) : null,
    worstO1: o1.length ? +Math.min(...o1.map(x => x.o1)).toFixed(1) : null,
  };
}

(async () => {
  // 大盘环境：截至昨日(pd1)收盘的上证 MA20，已知于当日 09:35
  const bars = await fetchIdx(800);
  const closes = new Map(bars.map(b => [String(b[0]).replace(/-/g, ''), +b[2]]));
  const ma = (base, n) => {
    const bi = cal.indexOf(base); if (bi < n - 1) return null;
    let s = 0; for (let k = 0; k < n; k++) s += closes.get(cal[bi - k]);
    return s / n;
  };
  const marketOk = d => { const i = cal.indexOf(d); const pd1 = cal[i - 1]; if (!pd1) return false; const prev = closes.get(pd1); const m20 = ma(pd1, 20); return prev != null && m20 != null ? prev > m20 : false; };

  // 构造 item 并评估 V9
  const evalV9 = (r, gate, useV9Block = true) => {
    const pd1 = cal[cal.indexOf(r.D) - 1];
    const item = {
      code: r.code,
      [`${r.D} 09:35`]: { 涨跌幅: r.s_chg0935 },
      [`${r.D} 09:33`]: { 涨跌幅: r.s_chg0933 },
      [pd1]: { 热度排名: r.s_heat, 涨跌幅: r.s_pd1Chg },
      '09:35涨跌幅排名': r.s_rank0935,
      '昨日涨跌幅排名': r.s_rankPd1,
    };
    const ctx = { blockStrong: (useV9Block ? r.b_strong_v9 === 1 : r.b_strong === 1), blockChg0935: r.b_chg0935, blockRank0935: r.b_rank0935, nStrongBlocks: r.nStrongBlocks, marketOk: gate ? marketOk(r.D) : true };
    return evaluateStockV9(item, { td: r.D, pd1 }, ctx);
  };

  const dedupe = arr => { const m = new Map(); for (const x of arr) { const k = x.D + '|' + x.code; if (!m.has(k)) m.set(k, x); } return [...m.values()]; };
  const v8 = dedupe(lab.filter(r => r.s_v8strong === 1));
  const v9 = dedupe(lab.filter(r => evalV9(r, false, true).isHit));
  const v9v7 = dedupe(lab.filter(r => evalV9(r, false, false).isHit));
  const v9g = dedupe(lab.filter(r => evalV9(r, true, true).isHit));
  const board = dedupe(lab.filter(r => evalV9(r, false, true).isBoard));

  const splits = a => [['全样本', a], ['近期 >=0820', a.filter(x => x.D >= '20260820')], ['2026 全年', a.filter(x => x.D >= '20260727')], ['2026 之前', a.filter(x => x.D < '20260727')]];
  const print = (name, a) => {
    console.log('\n## ' + name + '  总信号 ' + a.length);
    for (const [l, s] of splits(a)) { const st = stat(s); console.log(`  ${l}: n=${st.n} 次日胜率=${st.o1win}% 次日均=${st.o1avg}% 日内胜率=${st.r0win}% 日内均=${st.r0avg}% 最差次日=${st.worstO1}%`); }
  };
  print('V8 基线', v8);
  print('V9 统一筛选（昨日强+今日持续，V9 Block）', v9);
  print('V9 统一筛选（V7 Block 对比）', v9v7);
  print('V9 + 大盘MA20门控', v9g);
  print('V9 打板池（09:35已封板）', board);

  console.log('\n== 四个历史龙头是否被 V9 选中 ==');
  const hist = [['603099','20240103'],['000560','20240516'],['600611','20240711'],['000062','20240816']];
  for (const [c, d] of hist) {
    const r = data.find(x => x.code === c && x.D === d);
    if (!r) { console.log(c, d, '不在数据集中'); continue; }
    const res = evalV9(r, false);
    console.log(c, d, r.name, 'isHit=', res.isHit, 'isBuy=', res.isBuy, 'tags=', res.tags.join('|'), 'failed=', Object.entries(res.checks).filter(([,v])=>!v).map(([k])=>k).join(','));
  }

  console.log('\n== 近期 V9 信号明细 ==');
  for (const r of v9.filter(x => x.D >= '20260820').sort((a, b) => a.D.localeCompare(b.D))) {
    const res = evalV9(r, false);
    console.log(`${r.D} ${r.name}${r.code} ${r.block} 板块内排名=${r.s_rank0935} 昨排名=${r.s_rankPd1} 0935=${r.s_chg0935}% 热度=${r.s_heat} 日内=${r.r0?.toFixed(1)}% 次日=${r.o1?.toFixed(1)}% tags=[${res.tags.join('|')}]`);
  }
})().catch(e => { console.error(e); process.exit(1); });
