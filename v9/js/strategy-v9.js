/**
 * V9 选股策略 —— 昨日强 + 今日持续（统一强度筛选）
 *
 * 定位：筛出“昨日强、今日持续走强”的主线龙头。今日是否涨停都展示——
 * 涨停只说明更强；买不买、怎么买由用户自己判断，策略不再区分“分歧低吸/打板”。
 *
 * 核心四问：
 *   1. 板块是不是主线（evaluateBlockStrongV9）；
 *   2. 昨日强不强：昨日涨幅归一主板基准后 >= 7%（创业板/科创板原值 ÷2）；
 *   3. 今日是否持续：09:35 涨幅 >= 4%，且是板块内今日涨幅前 5；
 *   4. 质量护栏：昨日热度榜前 500（昨日涨停可忽略）+ 09:35 不跳水 + 板块今早全市场涨幅前 5。
 *
 * 与旧版区别：不再把 chg0935<9.5（分歧低吸）和 rankPd1<=5（昨日板块内前 5）
 * 当硬门槛——昨日涨停但板块内只排第 6~N、今天直接一字/封板的强票同样入选。
 *
 * 用法（浏览器端，与 index.js 一起加载）：
 *   const ctx = {
 *     block: <当前点击板块的 handleRate obj>,
 *     blockStrong / blockChg0935 / blockRank0935 / nStrongBlocks / marketOk
 *   };
 *   const r = evaluateStockV9(stockObj, Dates.shareDate, ctx);
 *   // r.isHit / r.score / r.tags / r.checks
 */
(function (global) {
  'use strict';

  // ===== 可调参数 =====
  const V9_CONFIG = {
    chg0935Min: 4,          // 今日 09:35 涨幅下限（今日确实在走强；无上限，涨停也接受）
    pd1ChgMin: 7,           // 归一主板基准后的昨日强线（创业板/科创板原值 ÷2）
    rank0935Max: 5,         // 板块内 09:35 涨幅排名前 5（今日持续领涨）
    deltaMin: -3,           // 09:35 - 09:33 跌幅容忍度（防高开跳水）
    heatMin: 1,             // 热度榜越靠前越有人气
    heatMax: 500,           // 昨日热度榜前 500 才有人气；昨日涨停可忽略
    blockRank0935Max: 5,    // 板块今早 09:35 涨幅全市场排名前 5（主线）
    nStrongBlocksMax: 999,  // 当日强势板块总数上限（默认放宽）
  };

  function isMainBoard(code) {
    const c = String(code || '');
    return /^(60|00)/.test(c);
  }

  /**
   * 个股是否入选（返回详细结果，便于页面展示每项原因）
   */
  function evaluateStockV9(item, dates, ctx) {
    const { td, pd1 } = dates;
    const c = item['code'] || '';
    const mainBoard = isMainBoard(c);

    const chg0935 = item[td + ' 09:35']?.涨跌幅 || 0;
    const chg0933 = item[td + ' 09:33']?.涨跌幅 || 0;
    const pd1Chg = item[pd1]?.涨跌幅 || 0;
    const pd1ChgNorm = mainBoard ? pd1Chg : pd1Chg / 2;   // 折算到主板 10% 基准
    const delta = chg0935 - chg0933;
    const rank0935 = item['09:35涨跌幅排名'] || 9999;
    const rankPd1 = item['昨日涨跌幅排名'] || 9999;
    const heat = item[pd1]?.热度排名;
    const heatVal = (heat === undefined || heat === null || heat === '' || Number(heat) === 0) ? 9999 : Number(heat);
    const limit = mainBoard ? 9.5 : 19.5;          // 涨停线
    const pd1LimitUp = pd1Chg >= limit;            // 昨日涨停/封板
    const isLimitUp = chg0935 >= limit;            // 今日 09:35 已封板/涨停

    // 板块主线判断：ctx 传入优先，否则用 V9 版 block 判断
    const blockStrong = ctx && ctx.blockStrong !== undefined ? !!ctx.blockStrong :
      (ctx && ctx.block ? (typeof evaluateBlockStrongV9 === 'function'
        ? evaluateBlockStrongV9(ctx.block, dates).isStrong
        : evaluateBlockStrong(ctx.block, dates).isStrong) : false);
    const blockRank0935 = ctx && ctx.blockRank0935 !== undefined ? ctx.blockRank0935 : 9999;
    const nStrongBlocks = (ctx && ctx.nStrongBlocks) || 0;
    const marketOk = ctx && ctx.marketOk !== undefined ? !!ctx.marketOk : true;

    const checks = {
      blockStrong: !!blockStrong,                          // 主线板块
      marketOk: !!marketOk,                                // 大盘环境（可选门控）
      pd1Chg: pd1ChgNorm >= V9_CONFIG.pd1ChgMin,           // 昨日强（归一主板基准）
      chg0935: chg0935 >= V9_CONFIG.chg0935Min,            // 今日持续（涨停也接受）
      rank0935: rank0935 <= V9_CONFIG.rank0935Max,         // 板块内今日涨幅前 5
      deltaOk: delta >= V9_CONFIG.deltaMin,                // 09:35 不跳水
      heatOk: pd1LimitUp || (heatVal >= V9_CONFIG.heatMin && heatVal <= V9_CONFIG.heatMax),
      blockRank0935: blockRank0935 <= V9_CONFIG.blockRank0935Max,
      nStrongBlocksOk: nStrongBlocks <= V9_CONFIG.nStrongBlocksMax,
    };

    const isHit = Object.values(checks).every(Boolean);

    // 质量分（排序用，越高越靠前）
    let score = 0;
    score += Math.max(0, V9_CONFIG.rank0935Max - rank0935) * 10;  // 今日板块排名越靠前越强
    score += Math.max(0, 2 - rankPd1) * 2;                        // 昨日排名小加分（前2）
    score += Math.min(Math.max(chg0935, 0), 10) * 0.8;            // 今日涨幅越高越强
    if (pd1LimitUp) score += 6;                                   // 昨日涨停（连板潜质）
    if (isLimitUp) score += 8;                                    // 今日封板/涨停
    if (delta >= -3 && delta < 0) score += 4;                     // 小幅分歧
    else if (delta >= 0) score += 6;                              // 持续走强
    score += (heatVal >= 30 && heatVal <= 180) ? 6 : 3;           // 热度适中
    score = Math.round(score * 10) / 10;

    // 标签（信息性，不参与门槛）
    const tags = [];
    if (blockStrong) tags.push('主线板块');
    tags.push(mainBoard ? '主板' : '创业板/科创');
    if (rank0935 <= 2 && rankPd1 <= 2) tags.push('双榜龙头');
    else if (rank0935 <= V9_CONFIG.rank0935Max) tags.push('板块领涨');
    if (pd1LimitUp && isLimitUp) tags.push('连板');
    else if (isLimitUp) tags.push('涨停');
    else if (delta >= -3 && delta < 0) tags.push('分歧低吸');
    else if (delta >= 0) tags.push('加速走强');
    if (rankPd1 > 5) tags.push('昨日非前5');
    if (!marketOk) tags.push('大盘过滤');
    if (nStrongBlocks > V9_CONFIG.nStrongBlocksMax) tags.push('情绪过热');

    return {
      isHit,                                  // 统一命中：昨日强 + 今日持续
      isBuy: isHit && !isLimitUp,             // 兼容旧字段：未封板（可市价买入）
      isBoard: isHit && isLimitUp,            // 兼容旧字段：已封板/涨停
      score, checks, tags, config: V9_CONFIG,
    };
  }

  global.StrategyV9 = { V9_CONFIG, evaluateStockV9, isMainBoard };
})(typeof window !== 'undefined' ? window : globalThis);
