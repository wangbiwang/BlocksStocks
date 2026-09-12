const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'v9', 'js', 'strategy-v9.js'), 'utf8'), sandbox);
const { evaluateStockV9 } = sandbox.StrategyV9;

const td = '20260812';
const pd1 = '20260811';
const mkItem = ({ code, pd1Chg, heat = 100, chg0933 = 5.346, chg0935 = 7.664, f0933 = 0, f0935 = 0, n0933 = 0, n0935 = 0 }) => ({
  code,
  [pd1]: { 涨跌幅: pd1Chg, 热度排名: heat },
  [`${td} 09:33`]: { 涨跌幅: chg0933, 资金流向: f0933, 大单净额: n0933 },
  [`${td} 09:35`]: { 涨跌幅: chg0935, 资金流向: f0935, 大单净额: n0935 },
  '09:35涨跌幅排名': 1,
  '昨日涨跌幅排名': 1,
});
const ctx = { blockStrong: true, blockRank0935: 1, nStrongBlocks: 1, marketOk: true };

const CASES = [
  { name: '主板昨日 +8.18% 且今日资金弱仍通过', item: mkItem({ code: '600000', pd1Chg: 8.1766, f0933: 20000000, f0935: 16794982, n0935: -5093945 }), expect: true },
  { name: '创业板昨日 +8.18% 今日资金弱应剔除', item: mkItem({ code: '301230', pd1Chg: 8.1766, f0933: 20000000, f0935: 16794982, n0935: -5093945 }), expect: false },
  { name: '创业板昨日 +8.18% 即使今日资金健康也应剔除', item: mkItem({ code: '301230', pd1Chg: 8.1766, f0933: 10000000, f0935: 16000000, n0935: 5000000 }), expect: false },
  { name: '创业板昨日 +14.5% 折算后接近涨停仍通过', item: mkItem({ code: '301230', pd1Chg: 14.5, f0933: 20000000, f0935: 16794982, n0935: -5093945 }), expect: true },
  { name: '昨日涨停且昨日热度 600 应通过', item: mkItem({ code: '600000', pd1Chg: 10, heat: 600 }), expect: true },
  { name: '昨日未涨停且昨日热度 600 应剔除', item: mkItem({ code: '600000', pd1Chg: 8, heat: 600 }), expect: false },
  { name: '今日涨停但昨日未涨停且热度 600 应剔除', item: mkItem({ code: '600000', pd1Chg: 8, heat: 600, chg0935: 10 }), expect: false },
  { name: '昨日未涨停但昨日热度前 500 仍通过', item: mkItem({ code: '600000', pd1Chg: 8, heat: 5 }), expect: true },
];

let pass = 0;
let fail = 0;
for (const c of CASES) {
  const r = evaluateStockV9(c.item, { td, pd1 }, ctx);
  const ok = r.isHit === c.expect;
  if (ok) pass++; else fail++;
  const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(',');
  console.log(`${ok ? '✅' : '❌'} ${c.name}  ${ok ? '' : '未满足: ' + failed}`);
}
console.log(`\nStock V9 用例通过: ${pass}/${CASES.length}  失败: ${fail}/${CASES.length}`);
process.exit(fail === 0 ? 0 : 1);
