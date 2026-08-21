# V8 当日预筛页面 + 昨日数据融合实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 V7 基础上创建 V8（v7 保留备份，单服务 3001）。新增"当日预筛"页面（与当前页布局/日期筛选框一致、可互相切换），筛选条件只使用策略中 pd1 及更早数据可判定的条件，并把昨日数据缓存为 JSON；当前页面布局与请求逻辑不变，仅在处理 09:35 返回结果中"昨日部分"数据时，读取预筛缓存做比对融合以保证昨日数据完整可靠，无缓存则直接用源数据。

**架构：** 单服务 3001，browser-proxy.js 静态目录与缓存指向 v8。新增：① `v8/js/strategy-preselect.js`（昨日查询组、昨日条件评估、昨日字段定义、缓存读写）；② `v8/preselect.html` + `v8/js/preselect.js`（当日预筛页面：布局复制 index.html，日期选择框一致，三表格+全部/强势切换+Block 点击联动，查询昨日数据→昨日条件评估→写 data/preset/{td}.json）；③ `v8/js/index.js` 仅加"昨日数据融合"逻辑（读缓存按 code 覆盖昨日字段，无缓存走原逻辑）；④ 两页面顶部导航互切。

**技术栈：** Node.js、Vue 3.4.14（本地 lib）、Express + Playwright（代理服务）、问财 API、本地 JSON 存储。

---

## 时间线与数据流

```
任意时刻（用户在预筛页选 T 并点查询）：
  预筛页面：查询 pd1(T-1)/pd2/pd3 昨日数据
    - Block：行业 3 查询 + 概念 3 查询（全量板块）
    - Stock：点击板块时 4 查询（板块内，V7 原查询格式）
  → handleRate 归一化 → 昨日条件评估（evaluateBlockYesterday / evaluateStockYesterday）
  → 页面展示昨日强势候选；同时把全量昨日归一化数据写入 data/preset/{T}.json
    （blocks: 全量行业+概念 obj；stocks: 已获取板块的 obj；均含昨日字段与 __conditions）

T 日 09:35（原页面，布局/请求不变）：
  查询返回的数据中包含昨日(pd1)字段 → dataHandler 中：
    读 data/preset/{T}.json → Map<code, 昨日 obj>
    对每条记录：若缓存存在该 code → 用缓存昨日字段覆盖/补全实时数据的昨日部分
    若缓存不存在/文件缺失 → 直接使用源数据（V7 原逻辑）
  → handleRate → 完整策略评估（evaluateBlockStrong / evaluateStockStrong，与 V7 完全一致）
```

## 关键设计决策

- **D1 服务**：端口保持 3001；`service/browser-proxy.js` 的 `CACHE_DIR` 改 `v8/cache`、静态根改 `v8/`、`/m` 改 `v8/mobile`；v7 目录保留备份。
- **D2 昨日条件定义**：`evaluateBlockYesterday` = Block 策略中仅依赖 pd1/pd2/pd3 及均线/MACD 前值的条件（trend12/trend3/trend4/trendStage/fund1/change1/volBreak/hasLeader/rankOrChg/superHotBase）；`evaluateStockYesterday` 同理（trend12/trend3/trend4/fund1/change1/fund2/openQualityBase/breakout/volDailyBreak/macdSeq/accelBase）。不含 td 09:35 相关条件（change2/flowOk/openQuality 贡献度/accel 今早分支/superHot 当日部分）。
- **D3 昨日字段清单**：`YESTERDAY_FIELDS` 定义 handleRate 输出中属于昨日的数据键：`pd1/pd2/pd3 日期对象`、`M01/M05/M10/M21/M60`、`prevM05/prevM10/prevM21/prevM60`、`macdDiff/macdDea/macdMacd/prevMacdDiff/prevMacdDea/prevMacdMacd`、`volPd1/volPd2/volPd3/volPd4`、`limitUpCount`、`vol5Pd1/vol5Pd2`、`volDaily1/volDaily2/volDaily3`、`rangeHigh5`、`昨日涨跌幅排名`、`09:35涨跌幅排名`、热度排名/收盘价/流通市值/涨停时间/连板天数（stock 的 pd1 子对象字段）、`code/股票简称/指数简称/行业/三级行业`。td 相关（`td`、`td 09:35`、`td 09:33`）**不融合**，始终用实时数据。
- **D4 融合规则**：缓存存在且 code 匹配 → 昨日字段以缓存为准覆盖（缓存为收盘后稳定数据）；实时数据中缓存没有的昨日字段保留；td 字段不变。融合后 handleRate 不再重复执行（避免 td 字段被预筛 obj 的 0 覆盖）——实现上：预筛 obj 已含全部字段，融合只把实时 td 字段写回预筛 obj，再走完整评估。
- **D5 缓存 key**：`data/preset/{查询日 td}.json`；预筛页面选日期 T 时，查询昨日(pd1)数据并存 `{T}.json`；原页面查询 T 时读 `{T}.json`。

- **D6 页面切换**：index.html 顶部加"当日预筛"链接 → preselect.html；preselect.html 顶部加"策略分析"链接 → index.html。

## 文件结构

**创建：**
- `v8/`（复制自 `v7/**`）
- `v8/js/strategy-preselect.js`（昨日查询组、Yesterday 评估、YESTERDAY_FIELDS、缓存读写）
- `v8/preselect.html`、`v8/js/preselect.js`（当日预筛页面）

- `v8/test-preselect.js`、`v8/test-merge.js`（单元测试）
- `data/preset/`（运行期输出，.gitignore）
- `docs/superpowers/specs/2026-08-21-v8-preselect-design.md`（设计规格）
- `verify-v8-parity.js`（一致性回归）

**修改：**
- `service/browser-proxy.js`（缓存/静态目录改 v8；新增 `/api/preset` 保存接口）
- `v8/index.html`（版本号 V8；顶部导航链接）
- `v8/js/index.js`（仅 dataHandler 增加昨日融合：读缓存→覆盖昨日字段；无缓存走原逻辑）
- `.gitignore`（追加 `data/preset/`）

**不修改：** `v8/js/strategy.js`、`v8/js/utils.js`、`v8/js/proxy-client.js`、`v8/css/*`。

---

## 任务 1：复制 V7 → V8 并把服务切换到 V8

**文件：**
- 创建：`v8/**`
- 修改：`service/browser-proxy.js`、`v8/index.html`、`.gitignore`

- [ ] **步骤 1：复制目录**

运行：`Copy-Item -Recurse v7 v8`
预期：`v8/index.html`、`v8/js/*.js`、`v8/lib/**`、`v8/cache/**` 存在；`node --check v8/js/strategy.js` 无错误。

- [ ] **步骤 2：修改 v8/index.html 版本号**

两处 `V7.20260716-9` → `V8.20260821-1`。

- [ ] **步骤 3：切换服务到 v8**

修改 `service/browser-proxy.js`（根目录）：
```js
const PORT = 3001;                                            // 不变
const CACHE_DIR = path.join(__dirname, '../v8/cache');        // 原 ../v7/cache
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use(express.static(path.join(__dirname, '../v8')));       // 原 ../v7
app.use('/m', express.static(path.join(__dirname, '../v8/mobile')));  // 原 ../v6/mobile
```

- [ ] **步骤 4：.gitignore 追加**

追加一行：`data/preset/`

- [ ] **步骤 5：启动验证**

运行：`node start.js`，轮询 `http://localhost:3001/api/health` 直到 ok（≤90 秒）。
预期：`http://localhost:3001/index.html` 返回 V8 页面（标题含 BlocksStocks V8）。

- [ ] **步骤 6：Commit**

```bash
git add v8 service/browser-proxy.js .gitignore
git commit -m "feat(v8): 复制 V7 为 V8，服务切换到 v8（v7 保留备份）"
```

---

## 任务 2：strategy-preselect.js（昨日查询/评估/字段清单/缓存读写）

**文件：**
- 创建：`v8/js/strategy-preselect.js`
- 测试：`v8/test-preselect.js`

- [ ] **步骤 1：编写失败测试 `v8/test-preselect.js`**

```js
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
// Yesterday 评估不含当日条件
const item = { [dates.pd1]: { 涨跌幅: 1, 大单净额: 100, 资金流向: 100 }, M01: 10, M05: 9, M10: 8, M21: 7, M60: 6, prevM05: 8.5, limitUpCount: 1, volPd1: 100, volPd2: 50, '昨日涨跌幅排名': 5 };
const y = P.evaluateBlockYesterday(item, dates);
assert.strictEqual(y.isYesterday, true);
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
```

- [ ] **步骤 2：运行确认失败**

运行：`node v8/test-preselect.js`
预期：报错 `Cannot read properties of undefined`（文件不存在）。

- [ ] **步骤 3：实现 `v8/js/strategy-preselect.js`**

```js
/**
 * V8 当日预筛支持模块
 * - getYesterdayQuestions：pd1 及更早数据的查询（不含 td 09:35）
 * - evaluateBlockYesterday / evaluateStockYesterday：昨日可判定条件
 * - YESTERDAY_FIELDS：昨日数据键清单（融合时覆盖）
 * - mergeYesterday：把缓存昨日字段覆盖进实时 obj（td 字段保留实时）
 */
(function (global) {
  const PRESELECT_CONFIG = {
    requestIntervalMs: 3000,
    batchSize: 5,
    batchIntervalMs: 15000,
    maxRetries: 2,
    retryDelayMs: 5000,
  };

  function getYesterdayQuestions(type, dates, BlockType, BlockName) {
    const { pd1, pd2, pd3 } = dates;
    const macdBlock = `${pd1}(MACD(DIFF值);MACD(DEA值);MACD);${pd2}(MACD(DIFF值);MACD(DEA值);MACD)`;
    const maBlock = `${pd1}(1日均线和M5和M10和M21和M60);${pd2}(1日均线和M5和M10和M21和M60)`;
    if (type === 'block-行业') {
      return [
        `${pd1}涨跌幅降序;${pd1}成交量;${pd2}成交量;${pd3}成交量;${pd1}涨停家数;${maBlock};二级行业`,
        `${pd1}涨跌幅降序;${macdBlock};二级行业`,
        `${pd1}涨跌幅;${pd1}资金流向大单净额;${pd1}前5交易日区间最高价;二级行业`,
      ];
    }
    if (type === 'block-概念') {
      return [
        `${pd1}涨跌幅降序;${pd1}成交量;${pd2}成交量;${pd3}成交量;${pd1}涨停家数;${maBlock};概念`,
        `${pd1}涨跌幅降序;${macdBlock};概念`,
        `${pd1}涨跌幅;${pd1}资金流向大单净额;${pd1}前5交易日区间最高价;概念`,
      ];
    }
    if (type === 'stock') {
      const bf = BlockType === '行业' ? '所属行业包含' : '所属概念包含';
      const macdStock = `${pd1}(MACD(DIFF值);MACD(DEA值);MACD);${pd2}(MACD(DIFF值);MACD(DEA值);MACD)`;
      return [
        `${pd1}涨跌幅降序;${pd1}涨跌幅资金流向大单净额;${pd1}收盘价;${pd1}热度排名;${pd1}前5交易日区间最高价不复权;${pd1}成交量;${pd2}涨跌幅;${pd2}成交量;${pd2}大单净额;三级行业;${pd1}(1日均线和M5);${pd2}(1日均线和M5);行业概念主板创业非ST;${bf}${BlockName}`,
        `${pd1}涨跌幅降序;${macdStock};${pd1}(M10和M21和M60);${pd2}(M10和M21和M60);行业概念主板创业非ST;${bf}${BlockName}`,
        `${pd1} 首次涨停时间;${pd1} 连续涨停天数;行业概念主板创业非ST;${bf}${BlockName}`,
      ];
    }
    return [];
  }

  function evaluateBlockYesterday(item, dates) {
    const { pd1 } = dates;
    const trend12 = item.M01 > item.M05 && item.M01 > item.M10 && item.M01 > item.M21 && item.M01 > item.M60 && item.M05 > item.prevM05;
    const trend3 = item.macdDiff > item.macdDea || item.macdMacd > item.prevMacdMacd;
    const trend4 = item.macdMacd > item.prevMacdMacd && item.macdDiff > item.prevMacdDiff;
    const trendStage = item.M60 > 0 && !(item.M01 / item.M10 > 1.055 && item.M01 / item.M60 > 1.15);
    const fund1 = (item[pd1]?.大单净额 || 0) > 0;
    const change1 = (item[pd1]?.涨跌幅 || 0) > 0;
    const volBreak = (item.volPd1 || 0) > (item.volPd2 || 0);
    const hasLeader = (item.limitUpCount || 0) > 0;
    const rankTop20 = (item['昨日涨跌幅排名'] || 9999) <= 20;
    const pd1Chg = item[pd1]?.涨跌幅 || 0;
    const rankOrChg = rankTop20 || pd1Chg > 2;
    const superHotBase = (item[pd1]?.资金流向 || 0) > 0 && (item[pd1]?.大单净额 || 0) > 0 && pd1Chg > 0
      && item.M05 > item.M10 && item.M05 > item.prevM05;
    return {
      isYesterday: trend12 && trend3 && trend4 && trendStage && fund1 && change1 && volBreak && hasLeader && rankOrChg,
      isSuperHotBase: superHotBase,
      conditions: { trend12, trend3, trend4, trendStage, fund1, change1, volBreak, hasLeader, rankOrChg, superHotBase },
    };
  }

  function evaluateStockYesterday(item, dates) {
    const { pd1, pd2 } = dates;
    const c = item['code'] || '';
    const isMain = c.startsWith('60') || c.startsWith('00');
    const isLimitUp = (item[pd1]?.涨跌幅 || 0) >= (isMain ? 9.5 : 19.5);
    const trend12ma = item.M01 > item.M05 && item.M01 > item.M10 && item.M01 > item.M21 && item.M01 > item.M60 && item.M05 > item.M10
      && item.M05 > item.prevM05 && item.M10 > item.prevM10 && item.M21 > item.prevM21;
    const trend12 = trend12ma && (isLimitUp || item.M60 > item.prevM60);
    const trend3 = item.macdDiff > item.macdDea || item.macdMacd > item.prevMacdMacd;
    const trend4 = item.macdMacd > item.prevMacdMacd && item.macdDiff > item.prevMacdDiff && item.macdDea > item.prevMacdDea;
    const fund1 = (item[pd1]?.大单净额 || 0) > 0;
    const change1 = (item[pd1]?.涨跌幅 || 0) > 0;
    const fund2 = (item[pd2]?.大单净额 || 0) > 0 || (fund1 && change1);
    const pd1Chg = item[pd1]?.涨跌幅 || 0;
    const openQualityBase = pd1Chg > 0.5;
    const breakout = (item[pd1]?.收盘价 || 0) >= item.rangeHigh5 * 0.95;
    const volDailyBreak = (item.volDaily1 || 0) > (item.volDaily2 || 0) || isLimitUp;
    const macdSeq = item.macdMacd > item.prevMacdMacd;
    const pd2Chg = item[pd2]?.涨跌幅 || 0;
    const accelBase = pd1Chg > pd2Chg;
    return {
      isYesterday: trend12 && trend3 && trend4 && fund1 && fund2 && change1 && openQualityBase && breakout && volDailyBreak && macdSeq && accelBase,
      conditions: { trend12, trend3, trend4, fund1, fund2, change1, openQualityBase, breakout, volDailyBreak, macdSeq, accelBase },
    };
  }

  // 昨日字段清单（handleRate 输出的 obj 键）
  const YESTERDAY_FIELDS = [
    'M01', 'M05', 'M10', 'M21', 'M60',
    'prevM05', 'prevM10', 'prevM21', 'prevM60',
    'macdDiff', 'macdDea', 'macdMacd',
    'prevMacdDiff', 'prevMacdDea', 'prevMacdMacd',
    'volPd1', 'volPd2', 'volPd3', 'volPd4',
    'limitUpCount',
    'vol5Pd1', 'vol5Pd2',
    'volDaily1', 'volDaily2', 'volDaily3',
    'rangeHigh5',
    '昨日涨跌幅排名', '09:35涨跌幅排名',
    'code', '股票简称', '指数简称', '行业', '三级行业',
  ];

  // 用缓存 obj 覆盖 liveObj 的昨日字段；td 相关键（td / td 09:35 / td 09:33）与 pd1 子对象内的热度排名等
  // 均保留实时值，仅覆盖 pd1/pd2/pd3 子对象中由缓存补齐的字段。
  function mergeYesterday(liveObj, cacheObj, dates) {
    const { td, pd1, pd2, pd3 } = dates;
    for (const k of YESTERDAY_FIELDS) {
      if (cacheObj[k] !== undefined && cacheObj[k] !== null) liveObj[k] = cacheObj[k];
    }
    // 日期子对象：pd1/pd2/pd3 以缓存为准（缓存为收盘后完整数据），缺失字段保留实时
    for (const d of [pd1, pd2, pd3]) {
      if (!cacheObj[d] || typeof cacheObj[d] !== 'object') continue;
      liveObj[d] = liveObj[d] || {};
      for (const f of ['涨跌幅', '资金流向', '大单净额', '大单净量', '热度排名', '收盘价', '流通市值', '涨停时间', '连板天数']) {
        if (cacheObj[d][f] !== undefined && cacheObj[d][f] !== null) liveObj[d][f] = cacheObj[d][f];
      }
    }
    return liveObj;
  }

  global.Preselect = { PRESELECT_CONFIG, getYesterdayQuestions, evaluateBlockYesterday, evaluateStockYesterday, YESTERDAY_FIELDS, mergeYesterday };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **步骤 4：运行测试确认通过**

运行：`node v8/test-preselect.js`
预期：输出 `preselect 单元测试通过`，exit 0。

- [ ] **步骤 5：Commit**

```bash
git add v8/js/strategy-preselect.js v8/test-preselect.js
git commit -m "feat(v8): 昨日查询/评估/融合模块"
```

---

## 任务 3：当日预筛页面 preselect.html

**文件：**
- 创建：`v8/preselect.html`（复制 index.html 布局）
- 创建：`v8/js/preselect.js`
- 创建：`v8/preselect-core.js`（Node 侧核心，供页面与服务共用逻辑参考/测试）

- [ ] **步骤 1：复制布局生成 preselect.html**

从 `v8/index.html` 复制，改动：
- 标题 `BlocksStocks V8 - 当日预筛`
- 保留：全局控制栏的日期选择框与"查询"按钮、行业/概念/Stock 三表格、全部/强势切换、状态点、缓存/重试按钮
- 删除：上一页/下一页/跳转按钮、回测按钮、下载按钮
- 顶部控制栏加切换链接：`<a href="./index.html">策略分析</a>`
- 脚本区：`./js/strategy-preselect.js` 与 `./js/preselect.js`（替换 `./js/index.js`）
- 表格列改为**昨日指标 + 日期**：所有列头副标题用 `Dates.shareDate.pd1cn`（如“2024年01月02日”），主标题为指标名，不再出现“今日 09:35”列。
  行业/概念表列：`指数简称 | 涨跌幅(pd1) | 资金流向(pd1) | 大单净额(pd1) | 涨停家数(pd1) | 昨日排名(pd1) | M01/M05/M10/M21/M60 | MACD`
  Stock 表列：`股票简称 | 涨跌幅(pd1) | 大单净额(pd1) | 资金流向(pd1) | 热度排名(pd1) | 收盘价 | 涨停时间 | 连板天数`
  渲染函数复用 precentformater/formatNumber；排序：全部按 pd1 涨跌幅降序（Stock 按热度排名升序），与当前页一致。

- [ ] **步骤 2：实现 `v8/js/preselect.js`**

主体复用 v8/js/index.js 的模块结构（Dates/Industries/Concepts/Stocks/createDataModule/fetchWithRetry），差异：
- dataHandler 评估改为 `Preselect.evaluateBlockYesterday / evaluateStockYesterday`，结果写入 `obj.__isCandidate` 与 `obj.__conditions`；
- display 过滤与计数（全部/强势切换、强势 N 徽标）直接读取 `__isCandidate`，不重复评估；
- 数据请求用 `Preselect.getYesterdayQuestions`（替换 `getQuestions`）
- `Submit()` 在拿到数据、`handleRate` 之后，**额外写缓存**：

```js
const buildEntry = (obj, type) => ({
  __type: type,                      // '行业' | '概念' | 'stock'
  __code: obj['code'] || obj['指数简称'] || '',
  __name: obj['股票简称'] || obj['指数简称'] || '',
  __isCandidate: !!obj.__isCandidate, // 昨日条件评估结果
  __conditions: obj.__conditions || null,
  obj,                               // 全量归一化 obj（含 pd1/pd2/pd3 子对象、均线、MACD、vol、limitUpCount、昨日排名）
});

const savePreset = async () => {
  const { td, pd1 } = Dates.shareDate;
  try {
    const payload = {
      schema: 1,
      targetDate: td,
      sourceDate: pd1,
      createdAt: new Date().toISOString(),
      blocks: [
        ...Industries.Data[0].filters.map(b => buildEntry(b, '行业')),
        ...Concepts.Data[0].filters.map(b => buildEntry(b, '概念')),
      ],
      stocks: Stocks.Data[0].filters.map(b => buildEntry(b, 'stock')),
      meta: {
        blocksTotal: Industries.Data[0].filters.length + Concepts.Data[0].filters.length,
        blocksCandidates: Industries.Data[0].filters.filter(b => b.__isCandidate).length + Concepts.Data[0].filters.filter(b => b.__isCandidate).length,
        stocksTotal: Stocks.Data[0].filters.length,
        stocksCandidates: Stocks.Data[0].filters.filter(b => b.__isCandidate).length,
        partial: Industries.metaError || Concepts.metaError ? { 行业: !!Industries.metaError, 概念: !!Concepts.metaError } : undefined,
      },
    };
    await fetch('/api/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    ElementPlus.ElMessage.success(`已保存预筛缓存 ${td}.json（板块${payload.blocks.length} 候选${payload.meta.blocksCandidates} 个股${payload.meta.stocksTotal}）`);
  } catch (e) { console.error('保存预筛缓存失败:', e); }
};
    await fetch('/api/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    ElementPlus.ElMessage.success(`已保存预筛缓存 ${td}.json（板块${payload.blocks.length} 个股${payload.stocks.length}）`);
  } catch (e) { console.error('保存预筛缓存失败:', e); }
};
```
- `Submit()` 末尾调用 `savePreset()`
- 页面顶部徽标：`预筛模式：条件仅含昨日(pd1)数据`

- [ ] **步骤 3：服务端保存接口**

在 `service/browser-proxy.js` 增加：
```js
const PRESET_DIR = path.join(__dirname, '../data/preset');
app.post('/api/preset', (req, res) => {
  const { targetDate, blocks, stocks, meta } = req.body || {};
  if (!targetDate || !Array.isArray(blocks)) return res.status(400).json({ error: 'bad payload' });
  if (!fs.existsSync(PRESET_DIR)) fs.mkdirSync(PRESET_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRESET_DIR, `${targetDate}.json`), JSON.stringify({ ...req.body, savedAt: new Date().toISOString() }, null, 2), 'utf8');
  res.json({ ok: true, file: `${targetDate}.json`, blocks: blocks.length, stocks: (stocks || []).length });
});
```

- [ ] **步骤 4：功能验证**

启动 3001；打开 `http://localhost:3001/preselect.html`；选日期 20240103 点查询。
预期：页面展示基于昨日(20240102)数据的强势板块/个股（按昨日条件过滤）；`data/preset/20240103.json` 生成，
结构符合 schema（blocks 含全量行业+概念板块，每项含 `__type/__code/__name/__isCandidate/__conditions/obj`；meta 计数正确）；
重复查询同一日期后文件 updatedAt 更新、内容覆盖。

- [ ] **步骤 5：Commit**

```bash
git add v8/preselect.html v8/js/preselect.js v8/preselect-core.js service/browser-proxy.js
git commit -m "feat(v8): 当日预筛页面与缓存保存"
```

---

## 任务 4：原页面昨日数据融合

**文件：**
- 修改：`v8/js/index.js`

- [ ] **步骤 1：加载缓存工具函数**

在 `v8/js/index.js` 顶部新增：
```js
let _presetCache = null;
let _presetLoadedFor = null;
async function loadPresetCache(td) {
  if (_presetLoadedFor === td) return _presetCache;
  _presetLoadedFor = td;
  _presetCache = null;
  try {
    const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const resp = await fetch(`/data/preset/${td}.json`, { signal: ctrl.signal });
        clearTimeout(tid);
    if (resp.ok) _presetCache = await resp.json();
  } catch {}
  return _presetCache;
}
function buildPresetMap(preset, type) {
  const m = new Map();
  if (!preset || !Array.isArray(preset.blocks)) return m;
  for (const b of preset.blocks) {
    if (!type || b.__type === type) {
      if (b.__code) m.set(b.__code, b.obj);           // 优先按 code
      if (b.obj && b.obj['code']) m.set(b.obj['code'], b.obj);
    }
  }
  return m;
}
```

- [ ] **步骤 2：Industries/Concepts dataHandler 融合**

`Industries.dataHandler` 与 `Concepts.dataHandler` 中，在 `handleRate(obj, merged, ...)` **之前**插入：
```js
const preset = await loadPresetCache(Dates.shareDate.td);   // dataHandler 改为 async
const pmap = buildPresetMap(preset, '行业');                // 概念用 '概念'
const cacheObj = pmap.get(code);
if (cacheObj) Preselect.mergeYesterday(obj, cacheObj, Dates.shareDate);
```
即：先用实时 merged 跑 `handleRate` 生成 obj，再用缓存 obj `mergeYesterday` 覆盖昨日字段（td 字段保留实时）。`Stocks.dataHandler` 同理（map key 用 code；缓存 stocks 数组）。

- [ ] **步骤 3：无缓存回退**

`loadPresetCache` 返回 null 或 pmap 无该 code 时，不调用 mergeYesterday，完全走 V7 原逻辑。文件缺失/解析失败均静默。

- [ ] **步骤 4：验证**

打开 `http://localhost:3001/index.html`，选日期 20240103 点查询（preset/20240103.json 已由任务 3 生成）。
预期：表格数据正常，控制台可见融合日志（可选 DEBUG）；与无缓存时对比，昨日字段（如 macdMacd、大单净额）来自缓存值。
删除 preset/20240103.json 后再查询：结果与 V7 原逻辑一致。

- [ ] **步骤 5：Commit**

```bash
git add v8/js/index.js
git commit -m "feat(v8): 原页面昨日数据融合（有缓存用缓存，无缓存走源数据）"
```

---

## 任务 5：页面切换链接

**文件：**
- 修改：`v8/index.html`
- 修改：`v8/preselect.html`

- [ ] **步骤 1：index.html 加链接**

在全局控制栏追加：
```html
<a href="./preselect.html" class="page-switch">当日预筛</a>
```

- [ ] **步骤 2：preselect.html 加链接**

在全局控制栏追加：
```html
<a href="./index.html" class="page-switch">策略分析</a>
```

- [ ] **步骤 3：CSS 样式**

在 `v8/css/index.css` 末尾追加 `.page-switch` 样式（与现有按钮风格一致：小号、间距、hover）。

- [ ] **步骤 4：验证与 Commit**

打开两页验证互切链接可用。
```bash
git add v8/index.html v8/preselect.html v8/css/index.css
git commit -m "feat(v8): 策略分析页与当日预筛页互切"
```

---

## 任务 6：日期筛选组件夜晚主题适配（选中/今天/hover/禁用）

**根因（已实测确认）：** Element Plus 2.7.7 日期单元格 DOM 为 `<div class="el-date-table-cell"><span class="el-date-table-cell__text">`，现有 CSS 选择器写的是旧版 `.cell`，导致选中日、今天、hover、禁用四类样式规则全部失效——选中日只有白字无主色背景块，禁用日颜色与正常日相同，夜晚主题下不协调。

**原则：** 只修正选择器与样式值，不新增任何 DOM 元素，不加“周几”等。

**文件：**
- 修改：`v8/css/index.css`（当前页与预筛页共用）

- [ ] **步骤 1：替换失效的日期单元格选择器**

将 `.el-picker__popper` 区块中 current/today/hover/disabled 的 `.cell` 选择器替换为 `.el-date-table-cell` / `.el-date-table-cell__text`：
```css
/* 选中日：主色圆角块，白字加粗 */
.el-picker__popper .el-date-table td.current:not(.disabled) .el-date-table-cell {
    background-color: var(--color-accent);
    border-radius: 6px;
}
.el-picker__popper .el-date-table td.current:not(.disabled) .el-date-table-cell__text {
    color: #ffffff;
    font-weight: 600;
}
/* hover：浅色圆角块，不抢选中态 */
.el-picker__popper .el-date-table td.available:not(.disabled):hover .el-date-table-cell {
    background-color: var(--bg-table-hover);
    border-radius: 6px;
}
/* 今天（未选中时）：主色文字，选中时让位给选中态 */
.el-picker__popper .el-date-table td.today:not(.current) .el-date-table-cell__text {
    color: var(--color-accent);
    font-weight: 500;
}
/* 禁用日：弱化文字，消除与正常日的视觉冲突 */
.el-picker__popper .el-date-table td.disabled .el-date-table-cell__text {
    color: var(--text-muted);
}
```

- [ ] **步骤 2：输入框聚焦态（保留并微调）**

确保输入框聚焦时有明确选中反馈（与夜晚主题一致）：
```css
.global-control-bar .date-picker .el-input__wrapper.is-focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}
```

- [ ] **步骤 3：验证**

打开 `http://localhost:3001/index.html`，点击日期选择器。用浏览器检查（或 Playwright evaluate）：
- `td.current .el-date-table-cell` 背景为主色（var(--color-accent)）、圆角 6px、文字白色加粗；
- `td.disabled .el-date-table-cell__text` 颜色为 text-muted（弱化）；
- `td.today:not(.current)` 文字为主色；
- 输入框聚焦时主色边框+柔和光晕；
- 面板背景/文字保持现有深色适配不变。
两个页面（index/preselect）表现一致。

- [ ] **步骤 4：Commit**

```bash
git add v8/css/index.css
git commit -m "fix(v8): 日期筛选组件夜晚主题适配（修复 .cell 选择器失效）"
```

---

## 任务 7：一致性回归验证

**文件：**
- 创建：`verify-v8-parity.js`

- [ ] **步骤 1：编写一致性脚本**

对 7 个测试案例日期 + backtest-result.json 的 13 个日期验证两条性质：
1. **融合无副作用**：同一日期，有缓存融合后的完整评估名单，与纯源数据评估名单**完全一致**（缓存昨日字段完整时不应改变 isStrong 结论——除非源数据昨日字段缺失，此时融合应"修复"而非翻转；断言：融合后名单 ⊇ 纯源名单）。
2. **昨日条件正确性**：预筛页面用昨日条件筛出的候选 ⊇ 完整策略（含当日条件）通过集合的昨日部分——即任何最终强势的板块在昨日条件下也必须通过（除非当日条件由 09:35 数据导致，如 superHot 当日部分），保证预筛不漏掉最终候选。

```js
const assert = require('assert');
// 读取 v8/cache 中对应日期的行业/概念 q0/q1/q2 缓存，构造：
//   fullObj = handleRate(实时三表) + evaluateBlockStrong
//   presetObj = handleRate(昨日三表) + evaluateBlockYesterday（候选标记）
//   mergedObj = mergeYesterday(fullObj, presetObj) + evaluateBlockStrong
// 断言 merged 名单与 full 名单的强势集合一致；preset 候选包含 full 名单中昨日条件成立者
```

- [ ] **步骤 2：运行并修复**

运行：`node verify-v8-parity.js`
预期：`一致性通过: N/N 日期`。不一致时重点检查 `YESTERDAY_FIELDS` 是否漏字段、`mergeYesterday` 是否误覆盖 td 字段。

- [ ] **步骤 3：Commit**

```bash
git add verify-v8-parity.js
git commit -m "test(v8): 融合一致性回归"
```

---

## 自检记录

- **规格覆盖度**：新增当日预筛页面且与当前页切换（任务 5）；布局与日期筛选框一致（任务 3 复制 index.html 框架）；筛选条件 = pd1 及之前策略（任务 2 Yesterday 评估 + 任务 3 用昨日查询组）；原页面布局与请求不变（任务 4 只在 dataHandler 加融合，不改请求/模板）；昨日部分数据有缓存则比对融合、无缓存用源数据（任务 4 loadPresetCache 回退）；缓存 JSON（任务 3/6 data/preset/{td}.json）；单服务 3001、v7 备份（任务 1）。
- **占位符扫描**：无 TODO/待定；关键代码完整；`nextTradingDate` 在任务 6 注明实现（腾讯日历，与 preselect.js resolveDates 同源）。
- **类型一致性**：`mergeYesterday(liveObj, cacheObj, dates)` 任务 2 定义、任务 4/7 调用签名一致；`YESTERDAY_FIELDS` 任务 2 导出、任务 4 隐式使用一致；`preset.blocks[].__type` 任务 3/6 写入、任务 4 buildPresetMap 读取一致。
- **已知取舍**：融合以缓存昨日数据为准（收盘后稳定），td 字段始终用实时；缓存仅对查询日 td 生效；预筛页面 Stock 数据仅在点击板块后获取并缓存，未点击板块无 stock 缓存（原页面 stock 融合仅在点击板块时生效）。
