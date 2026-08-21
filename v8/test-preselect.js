const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('v8/js/strategy.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('v8/js/strategy-preselect.js', 'utf8'), sandbox);
const P = sandbox.Preselect;
const dates = { td: '20240103', pd1: '20240102', pd2: '20231229', pd3: '20231228', nd1: '20240104' };

// 昨日查询组（block 行业/概念）不含 td 09:35
for (const t of ['block-行业', 'block-概念']) {
  for (const q of P.getYesterdayQuestions(t, dates)) {
    assert(!q.includes('20240103 09:35'), '昨日查询不应含 td 09:35: ' + q);
  }
}
// stock 昨日查询组（板块内）不含 td 09:35
for (const q of P.getYesterdayQuestions('stock', dates, '行业', '旅游及酒店')) {
  assert(!q.includes('20240103 09:35'), 'stock 昨日查询不应含 td 09:35');
  assert(q.includes('所属行业包含旅游及酒店'));
}
// Yesterday 评估：补齐 MACD/资金字段，且均线比值避开高位透支排除（M01/M10<=1.055）
const item = {
  [dates.pd1]: { 涨跌幅: 1, 大单净额: 100, 资金流向: 100 },
  M01: 10, M05: 9.9, M10: 9.8, M21: 9, M60: 8.8, prevM05: 8.5,
  macdDiff: 0.1, macdDea: 0.05, macdMacd: 0.2, prevMacdDiff: -0.1, prevMacdDea: -0.05, prevMacdMacd: 0.1,
  limitUpCount: 1, volPd1: 100, volPd2: 50, '昨日涨跌幅排名': 5,
};
const y = P.evaluateBlockYesterday(item, dates);
assert.strictEqual(y.isYesterday, true, '昨日条件应成立: ' + JSON.stringify(y.conditions));
assert(!('change2' in y.conditions) && !('flowOk' in y.conditions));
// YESTERDAY_FIELDS 含昨日键、不含 td
assert(P.YESTERDAY_FIELDS.includes('macdMacd'));
assert(!P.YESTERDAY_FIELDS.some(k => k === dates.td || k === dates.td + ' 09:35'));
// mergeYesterday：用缓存 obj 覆盖昨日字段、保留实时 td 字段
const cacheObj = { [dates.pd1]: { 涨跌幅: 1.5, 大单净额: 999 }, macdMacd: 0.5, [dates.td + ' 09:35']: { 涨跌幅: 99 } };
const liveObj = { [dates.pd1]: { 涨跌幅: 0.8, 大单净额: 10 }, macdMacd: 0.1, [dates.td + ' 09:35']: { 涨跌幅: 1.2 } };
P.mergeYesterday(liveObj, cacheObj, dates);
assert.strictEqual(liveObj[dates.pd1]['大单净额'], 999);          // 缓存覆盖
assert.strictEqual(liveObj[dates.td + ' 09:35']['涨跌幅'], 1.2);  // td 保留实时
console.log('preselect 单元测试通过');
