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
        `${pd1}涨跌幅降序;${pd1}资金流向大单净额;${pd1}前5交易日区间最高价;二级行业`,
      ];
    }
    if (type === 'block-概念') {
      return [
        `${pd1}涨跌幅降序;${pd1}成交量;${pd2}成交量;${pd3}成交量;${pd1}涨停家数;${maBlock};概念`,
        `${pd1}涨跌幅降序;${macdBlock};概念`,
        `${pd1}涨跌幅降序;${pd1}资金流向大单净额;${pd1}前5交易日区间最高价;概念`,
      ];
    }
    if (type === 'stock') {
      const bf = BlockType === '行业' ? '所属行业包含' : '所属概念包含';
      const macdStock = `${pd1}(MACD(DIFF值);MACD(DEA值);MACD);${pd2}(MACD(DIFF值);MACD(DEA值);MACD)`;
      // 拆成 4 个小查询，避免问财免费用户 chunk 数超限
      return [
        `${pd1}涨跌幅降序;${pd1}涨跌幅资金流向大单净额;${pd1}收盘价;${pd1}热度排名;${pd1}前5交易日区间最高价不复权;${pd1}成交量;三级行业;行业概念主板创业非ST;${bf}${BlockName}`,
        `${pd1}涨跌幅降序;${pd2}涨跌幅;${pd2}成交量;${pd2}大单净额;${pd1}(1日均线和M5);${pd2}(1日均线和M5);三级行业;行业概念主板创业非ST;${bf}${BlockName}`,
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
    '昨日涨跌幅排名',
    'code', '股票简称', '指数简称', '行业', '三级行业',
  ];

  // 用缓存 obj 覆盖 liveObj 的昨日字段；td 相关键始终保留实时值
  // 问财对指数查询的字段前缀不稳定（有时"指数@"有时无）：统一归一化为带前缀，供 handleRate(block) 解析
  const INDEX_FIELDS = [
    '涨跌幅:前复权', '资金流向', 'dde大单净额', 'dde大单净量', '成交量', '涨停家数',
    '区间最高价:不复权', '分时涨跌幅:前复权', '分时资金流向', '分时dde大单净额', '分时成交量', '分时dde大单净量',
  ];
  function normalizeIndexFields(merged) {
    if (Object.keys(merged).some(k => k.startsWith('指数@'))) return merged
    const out = Object.assign({}, merged)
    for (const k of Object.keys(merged)) {
      for (const f of INDEX_FIELDS) {
        if (k.startsWith(f)) { out['指数@' + k] = merged[k]; break }
      }
    }
    return out
  }

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

  global.Preselect = { PRESELECT_CONFIG, getYesterdayQuestions, evaluateBlockYesterday, evaluateStockYesterday, YESTERDAY_FIELDS, mergeYesterday, normalizeIndexFields };
})(typeof window !== 'undefined' ? window : globalThis);
