/**
 * v4 策略函数模块
 * 优化内容：
 *   - 提取所有策略阈值为 STRATEGY_CONFIG 常量
 *   - 抽取 Block/Stock 强势筛选条件为可复用纯函数
 *   - 策略逻辑本身不变（过滤条件、阈值均与 v3 一致）
 */

/* ================================================================
 * 策略配置常量（原散布各处的魔法数字）
 * ================================================================ */
const STRATEGY_CONFIG = {
    // --- Block 策略阈值 ---
    BLOCK: {
        MIN_PD1_CHANGE: 1.5,          // 昨日最低涨跌幅
        MIN_TD0935_CHANGE: 0.75,      // 09:35最低涨跌幅（排名条件）
        MIN_TD0935_CHANGE_RELAX: 0.5, // 09:35最低涨跌幅（放宽条件）
        MIN_WIN_RATE: 60,             // 最低上涨家数占比(%)
        MIN_LIMIT_UP: 1,              // 最低涨停家数
        MIN_TD0933_CHANGE: 0,         // 09:33最低涨跌幅
        RANK_0935_MAX: 5,             // 09:35排名前N
        RANK_YESTERDAY_MAX: 10,       // 昨日排名前N
        REBOUND_PD1_CHANGE: 2,        // 排名放宽：昨日涨幅替代阈值
        MA_RELAX_PD1_CHANGE: 3,       // 均线放宽条件1：昨日涨幅>3
        MA_SUPER_RELAX_PD1_CHANGE: 5, // 均线超放宽条件：昨日涨幅>5
        SUPER_HOT_MIN_LIMIT_UP: 5,    // 极热板块最低涨停数
        SUPER_HOT_MIN_WIN_RATE: 85,   // 极热板块最低上涨家数占比
        BREAKOUT_RATIO: 0.965,        // 突破判断比例
        HOT_LIMIT_UP: 5,              // 极热板块涨停数阈值（isBlockStrong用）
        HOT_WIN_RATE: 85,             // 极热板块上涨家数占比阈值（isBlockStrong用）
    },

    // --- Stock 策略阈值 ---
    STOCK: {
        MIN_PD1_CHANGE: 5,            // 昨日最低涨跌幅
        MIN_NET_INFLOW_VOL: 0.4,      // 最低大单净量
        MIN_TD0935_CHANGE: 0,         // 09:35最低涨跌幅
        MA_SUPER_RELAX_PD1_CHANGE: 6, // Stock均线超放宽条件：昨日涨幅>6
        MAIN_BOARD_LIMIT_UP: 9.5,     // 主板涨停阈值
        GEM_BOARD_LIMIT_UP: 19.5,     // 创业板涨停阈值
    },
}

/* ================================================================
 * 基础数据处理
 * ================================================================ */

/**
 * 处理数据并计算基本指标（策略逻辑不变）
 * @param {object} obj   目标对象
 * @param {object} ele   原始数据
 * @param {string} type  'block' | 'stock'
 * @param {object} dates 日期集合 { nd1, td, pd1, pd2 }
 */
function handleRate(obj, ele, type, dates) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { nd1, td, pd1, pd2 } = dates
    let t = type === 'block' ? '指数@' : ''

    // 基础数据
    obj[`${td}`] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${td}]`]),
        资金流向: num(ele[`${t}资金流向[${td}]`]),
        大单净额: num(ele[`${t}dde大单净额[${td}]`]),
        大单净量: num(ele[`${t}大单净量[${td}]`] || ele[`${t}dde大单净量[${td}]`] || 0),
    }

    // 09:35 数据
    obj[`${td} 09:35`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:35]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:35]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:35]`]),
    }

    // 09:33 数据
    obj[`${td} 09:33`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:33]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:33]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:33]`]),
    }

    // 09:31 数据
    obj[`09:31`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:31]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:31]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:31]`]),
    }

    // 09:30 数据
    obj[`09:30`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:30]`] || ele[`${t}分时涨跌幅:前复权[${td} 09:25]`]),
    }

    // 前一交易日数据
    obj[pd1] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${pd1}]`] || ele[`${t}分时涨跌幅:前复权[${pd1} 15:00]`]),
        资金流向: num(ele[`${t}资金流向[${pd1}]`] || ele[`${t}分时资金流向[${pd1} 15:00]`]),
        大单净额: num(ele[`${t}dde大单净额[${pd1}]`] || ele[`${t}分时dde大单净额[${pd1} 15:00]`]),
        大单净量: num(ele[`${t}dde大单净量[${pd1}]`] || ele[`${t}分时dde大单净量[${pd1} 15:00]`]),
    }

    obj[nd1] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${nd1}]`] || ele[`${t}分时涨跌幅:前复权[${nd1} 15:00]`]),
    }
    // -------- 读取价格均线 --------
    obj.M01 = num(ele[`1日${t}均线[${pd1}]`])
    obj.M05 = num(ele[`5日${t}均线[${pd1}]`])
    obj.M10 = num(ele[`10日${t}均线[${pd1}]`])
    obj.M21 = num(ele[`21日${t}均线[${pd1}]`])
    obj.M30 = num(ele[`30日${t}均线[${pd1}]`])
    obj.M60 = num(ele[`60日${t}均线[${pd1}]`])

    // -------- 读取量能均线 --------
    obj.v01 = num(ele[`1日${t}vol[${pd1}]`])
    obj.v05 = num(ele[`5日${t}vol[${pd1}]`])
    obj.v10 = num(ele[`10日${t}vol[${pd1}]`])
    obj.v21 = num(ele[`21日${t}vol[${pd1}]`])
    obj.v30 = num(ele[`30日${t}vol[${pd1}]`])
    obj.v60 = num(ele[`60日${t}vol[${pd1}]`])

    // 类型特定数据
    let idx, start5, start30
    if (type === 'block') {
        obj['指数简称'] = ele['指数简称'] || ''
        obj['板块类别'] = ele['指数@所属同花顺行业级别'] ? '二级行业' : '概念'
        obj['昨日涨停数'] = ele[`指数@涨停家数[${pd1}]`] || 0
        obj['昨日上涨家数占比'] = ele[`指数@上涨家数占比[${pd1}]`] || 0
        obj[pd1]['成交量'] = num(ele[`${t}成交量[${pd1}]`])
        obj[pd2] = {
            成交量: num(ele[`${t}成交量[${pd2}]`]),
            涨跌幅: num(ele[`${t}涨跌幅:前复权[${pd2}]`]),
            大单净额: num(ele[`${t}dde大单净额[${pd2}]`]),
        }
        idx = Dates.historicalDate.indexOf(pd1)
        start5 = Dates.historicalDate[Math.max(0, idx - 5)]
        obj['前5交易日区间最高价'] = num(ele[`${t}区间最高价:不复权[${start5}-${pd2}]`])
        // 排名字段（已在数据合并时提取）
        obj['09:35涨跌幅排名'] = ele['09:35涨跌幅排名'] || 9999
        obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名'] || 9999
    } else {
        obj['股票简称'] = ele['股票简称'] || ''
        obj['行业'] = ele['所属同花顺行业']?.split('-')[1] || ''
        obj['概念'] = ele['所属概念']?.split(';') || []
        obj[pd1]['热度排名'] = ele[`个股热度排名[${pd1}]`] || ele[`个股热度排名[${td}]`]
        obj[pd1]['收盘价'] = num(ele[`收盘价:不复权[${pd1}]`]) || 0
        obj.M01 = obj[pd1]['收盘价']  // M01 作为昨日收盘价
        obj[`${td} 09:35`]['收盘价'] = num(ele[`分时收盘价:不复权[${td} 09:35]`]) || 0
        obj[pd1]['流通市值'] = ele[`a股市值(不含限售股)[${pd1}]`] || 0
        // 30日区间最高价（用于突破判断）
        idx = Dates.historicalDate.indexOf(pd1)
        start30 = Dates.historicalDate[Math.max(0, idx - 30)]
        obj['前30交易日区间最高价'] = num(ele[`区间最高价:不复权[${start30}-${pd2}]`])
        // 涨停判断（根据涨跌幅和代码判断）
        const code = ele['code'] || ''
        const isMainBoard = code.startsWith('60') || code.startsWith('00')
        const limitUpThreshold = isMainBoard
            ? STRATEGY_CONFIG.STOCK.MAIN_BOARD_LIMIT_UP
            : STRATEGY_CONFIG.STOCK.GEM_BOARD_LIMIT_UP
        const pd1Change = obj[pd1]['涨跌幅']
        const tdChange = obj[td]['涨跌幅']
        obj['昨日涨停'] = pd1Change >= limitUpThreshold
        obj['今日涨停'] = tdChange >= limitUpThreshold
        // 排名字段（在 handleStocksData 中计算）
        obj['09:35涨跌幅排名'] = ele['09:35涨跌幅排名'] || 9999
        obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名'] || 9999
    }
    obj['code'] = ele['code']
}

/* ================================================================
 * API 查询问题构建
 * ================================================================ */

/**
 * 生成查询问题
 * @param {string} type 类型 stock/block-行业/block-概念
 * @param {object} datas 日期数据
 * @param {string} [BlockType] 板块类型（stock时使用）
 * @param {string} [BlockName] 板块名称（stock时使用）
 * @returns {string[]} 问题数组
 */
function getQuestions(type, datas, BlockType, BlockName) {
    const { nd1, td, pd1, pd2 } = datas
    let questions = []
    if (type === 'block-行业') {
        questions[0] = `${td} 09:35涨跌幅降序资金流向大单净额；${td} 09:33涨跌幅资金流向大单净额;${td}涨跌幅;${pd2}涨跌幅成交量大单净额;${td}前3交易日涨跌幅；${td}前3交易日资金流向；${pd1}前5交易日区间最高价；二级行业`
        questions[1] = `${pd1}涨跌幅降序资金流向大单净额；${pd1}收盘价上涨家数占比涨停家数成交量；${td}前1交易日(vol1和vol5和vol10和vol21和vol60)；${td}前1交易日(1日均线和M5和M10和M21和M60)；二级行业`
    } else if (type === 'block-概念') {
        questions[0] = `${td} 09:35涨跌幅降序资金流向大单净额；${td} 09:33涨跌幅资金流向大单净额;${td}涨跌幅;${pd2}涨跌幅成交量大单净额;${td}前3交易日涨跌幅；${td}前3交易日资金流向；${pd1}前5交易日区间最高价；概念`
        questions[1] = `${pd1}涨跌幅降序资金流向大单净额；${pd1}收盘价上涨家数占比涨停家数成交量；${td}前1交易日(vol1和vol5和vol10和vol21和vol60)；${td}前1交易日(1日均线和M5和M10和M21和M60)；概念`
    }
    if (nd1) {
        questions[0] = `${nd1}涨跌幅;` + questions[0]
        questions[1] = `${nd1}涨跌幅;` + questions[1]
    }
    if (type === 'stock') {
        BlockType = BlockType == '行业' ? '所属行业包含' : '所属概念包含'
        questions[0] = `${td} 09:35涨跌幅资金流向大单净额；${td} 09:33涨跌幅资金流向大单净额;${pd1}涨跌幅资金流向大单净额大单净量;${pd1}收盘价;${td}涨跌幅流通市值;${td} 09:35收盘价;${pd1}热度排名升序;行业概念主板创业非ST;${BlockType}${BlockName}`
        questions[1] = `${pd1}(vol1和vol5和vol10和vol21和vol60)；${pd1}(1日均线和M5和M10和M21和M60);${td} 09:35收盘价不复权;${pd1}收盘价不复权;${pd1}前30交易日区间最高价不复权；${pd1}热度排名升序;行业概念主板创业非ST;${BlockType}${BlockName}`
        if (nd1) questions[0] = `${nd1}涨跌幅;` + questions[0]
    }

    return questions
}

/* ================================================================
 * 可复用的策略条件判断函数
 * （与 v3 逻辑完全一致，抽取为纯函数供各处复用）
 * ================================================================ */

/**
 * 从 item 中提取 Block 通用指标
 * @param {object} item 板块数据项
 * @param {object} dates 日期数据
 * @returns {object} 标准化指标对象
 */
function extractBlockIndicators(item, dates) {
    const { td, pd1 } = dates
    return {
        // 均线
        v01: item.v01 ?? 0,
        v05: item.v05 ?? 0,
        v10: item.v10 ?? 0,
        M01: item.M01 ?? 0,
        M05: item.M05 ?? 0,
        M10: item.M10 ?? 0,
        M21: item.M21 ?? 0,
        M60: item.M60 ?? 0,
        // 板块热度
        pd1WinRate: item['昨日上涨家数占比'] ?? 0,
        pd1LimitUpCount: item['昨日涨停数'] ?? 0,
        // 涨跌幅
        td0935Change: item[`${td} 09:35`]?.涨跌幅 ?? -Infinity,
        td0933Change: item[`${td} 09:33`]?.涨跌幅 ?? -Infinity,
        pd1Change: item[pd1]?.涨跌幅 ?? -Infinity,
        // 资金
        pd1NetInflow: item[pd1]?.大单净额 ?? -Infinity,
        pd1CapitalFlow: item[pd1]?.资金流向 ?? -Infinity,
        td0935CapitalFlow: item[`${td} 09:35`]?.资金流向 ?? -Infinity,
        td0935NetInflow: item[`${td} 09:35`]?.大单净额 ?? -Infinity,
        td0933CapitalFlow: item[`${td} 09:33`]?.资金流向 ?? -Infinity,
        td0933NetInflow: item[`${td} 09:33`]?.大单净额 ?? -Infinity,
        // 排名
        rank0935: item['09:35涨跌幅排名'] ?? 9999,
        rankYesterday: item['昨日涨跌幅排名'] ?? 9999,
    }
}

/**
 * 判断 Block 是否为新概念
 * v01>0 且 M01>0，但M05/M10/v05/v10都为0，且排名都为1
 */
function isNewConcept(ind) {
    return (
        ind.v01 > 0 &&
        ind.M01 > 0 &&
        ind.M05 === 0 &&
        ind.M10 === 0 &&
        ind.v05 === 0 &&
        ind.v10 === 0 &&
        ind.rankYesterday === 1 &&
        ind.rank0935 === 1
    )
}

/**
 * 判断 Block 排名条件
 */
function checkBlockRankCondition(ind) {
    const C = STRATEGY_CONFIG.BLOCK
    return (
        (ind.rankYesterday <= C.RANK_YESTERDAY_MAX || ind.pd1Change > C.REBOUND_PD1_CHANGE) &&
        ind.rank0935 <= C.RANK_0935_MAX &&
        ind.td0935Change > C.MIN_TD0935_CHANGE
    )
}

/**
 * 判断 Block 成交量条件
 */
function checkBlockVolumeCondition(ind) {
    return ind.v01 > ind.v05 && ind.v01 > ind.v10
}

/**
 * 判断 Block 热度条件
 */
function checkBlockHeat(ind) {
    const C = STRATEGY_CONFIG.BLOCK
    return ind.pd1WinRate >= C.MIN_WIN_RATE && ind.pd1LimitUpCount >= C.MIN_LIMIT_UP
}

/**
 * 判断 Block 均线多头（含放宽条件）
 */
function checkBlockMaBullish(ind) {
    const C = STRATEGY_CONFIG.BLOCK
    const maBullishFull =
        ind.M01 > ind.M05 &&
        ind.M01 > ind.M10 &&
        ind.M01 > ind.M21 &&
        ind.M01 > ind.M60 &&
        ind.M05 > 0 &&
        ind.M10 > 0 &&
        ind.M21 > 0 &&
        ind.M60 > 0
    const maBullishBasic =
        ind.M01 > ind.M05 && ind.M01 > ind.M10 && ind.M01 > ind.M21 && ind.M05 > 0 && ind.M10 > 0 && ind.M21 > 0
    const maRelaxCondition =
        ind.pd1Change > C.MA_RELAX_PD1_CHANGE && ind.pd1CapitalFlow > 0 && ind.pd1NetInflow > 0
    const maSuperRelaxCondition =
        ind.pd1Change > C.MA_SUPER_RELAX_PD1_CHANGE && ind.pd1CapitalFlow > 0 && ind.pd1NetInflow > 0

    return {
        isStrong: maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition,
        maBullishFull,
        maBullishBasic,
        maRelaxCondition,
        maSuperRelaxCondition,
    }
}

/**
 * 判断 Block 资金是否恶化（09:35 vs 09:33）
 */
function checkBlockFlowWorsening(ind) {
    return ind.td0935CapitalFlow < ind.td0933CapitalFlow && ind.td0935NetInflow < ind.td0933NetInflow
}

/**
 * 完整 Block 强势判断（策略不变）
 * @returns {{ isStrong: boolean, conditions: object }}
 */
function evaluateBlockStrong(item, dates) {
    const ind = extractBlockIndicators(item, dates)
    const C = STRATEGY_CONFIG.BLOCK

    const _isNewConcept = isNewConcept(ind)
    const rankCondition = checkBlockRankCondition(ind)
    const volumeCondition = checkBlockVolumeCondition(ind)
    const blockHeat = checkBlockHeat(ind)
    const td0933ChangeCondition = ind.td0933Change > C.MIN_TD0933_CHANGE
    const pd1ChangeCondition = ind.pd1Change > C.MIN_PD1_CHANGE
    const pd1NetInflowCondition = ind.pd1NetInflow > 0
    const td0935FlowCondition = ind.td0935CapitalFlow > 0 || ind.td0935NetInflow > 0
    const maResult = checkBlockMaBullish(ind)
    const flowWorsening = checkBlockFlowWorsening(ind)

    const isStrong =
        _isNewConcept ||
        (rankCondition &&
            volumeCondition &&
            blockHeat &&
            td0933ChangeCondition &&
            pd1ChangeCondition &&
            pd1NetInflowCondition &&
            td0935FlowCondition &&
            maResult.isStrong &&
            !flowWorsening)

    return {
        isStrong,
        indicators: ind,
        conditions: {
            isNewConcept: _isNewConcept,
            rank: rankCondition,
            volume: volumeCondition,
            heat: blockHeat,
            td0933Change: td0933ChangeCondition,
            pd1Change: pd1ChangeCondition,
            pd1NetInflow: pd1NetInflowCondition,
            td0935Flow: td0935FlowCondition,
            maBullish: maResult,
            flowWorsening,
        },
    }
}

/**
 * 从 item 提取 Stock 通用指标
 */
function extractStockIndicators(item, dates) {
    const { td, pd1 } = dates
    return {
        v01: item.v01 ?? 0,
        v05: item.v05 ?? 0,
        v10: item.v10 ?? 0,
        M01: item.M01 ?? 0,
        M05: item.M05 ?? 0,
        M10: item.M10 ?? 0,
        M21: item.M21 ?? 0,
        M60: item.M60 ?? 0,
        td0935Change: item[`${td} 09:35`]?.涨跌幅 ?? -Infinity,
        td0935CapitalFlow: item[`${td} 09:35`]?.资金流向 ?? -Infinity,
        td0935NetInflow: item[`${td} 09:35`]?.大单净额 ?? -Infinity,
        td0933CapitalFlow: item[`${td} 09:33`]?.资金流向 ?? -Infinity,
        td0933NetInflow: item[`${td} 09:33`]?.大单净额 ?? -Infinity,
        pd1Change: item[pd1]?.涨跌幅 ?? -Infinity,
        pd1NetInflowVol: item[pd1]?.大单净量 ?? -Infinity,
        pd1CapitalFlow: item[pd1]?.资金流向 ?? -Infinity,
        pd1NetInflow: item[pd1]?.大单净额 ?? -Infinity,
        isPd1LimitUp: item['昨日涨停'] || false,
    }
}

/**
 * 完整 Stock 强势判断（策略不变）
 * @param {object} item Stock数据项
 * @param {object} dates 日期数据
 * @param {object} blockContext 所属板块上下文 { maSuperRelax, td0935CapitalFlow, td0935NetInflow }
 * @returns {{ isStrong: boolean, conditions: object }}
 */
function evaluateStockStrong(item, dates, blockContext = {}) {
    const ind = extractStockIndicators(item, dates)
    const C = STRATEGY_CONFIG.STOCK
    const { maSuperRelax: blockMaSuperRelax = false, td0935CapitalFlow: blockTd0935CF = 0, td0935NetInflow: blockTd0935NI = 0 } = blockContext

    // 条件1：成交量
    const volumeCondition = ind.v01 > ind.v05 && ind.v01 > ind.v10

    // 条件2：均线多头（含放宽）
    const maBullishFull = ind.M01 > ind.M05 && ind.M01 > ind.M10 && ind.M01 > ind.M21 && ind.M01 > ind.M60
    const stockMaSuperRelax = ind.pd1Change > C.MA_SUPER_RELAX_PD1_CHANGE && ind.pd1CapitalFlow > 0 && ind.pd1NetInflow > 0
    const maBullish =
        maBullishFull ||
        ind.isPd1LimitUp ||
        (!maBullishFull && !ind.isPd1LimitUp && blockMaSuperRelax && stockMaSuperRelax)

    // 条件3：09:35涨跌幅
    const changeCondition = ind.td0935Change > C.MIN_TD0935_CHANGE

    // 条件4：昨日涨跌幅
    const pd1ChangeCondition = ind.pd1Change > C.MIN_PD1_CHANGE

    // 条件5：昨日大单
    const pd1NetInflowCondition =
        ind.pd1NetInflowVol > C.MIN_NET_INFLOW_VOL || (ind.pd1CapitalFlow > 0 && ind.pd1NetInflow > 0)

    // 排除条件1：资金恶化
    const flowWorsening =
        ind.td0935CapitalFlow > 0 &&
        ind.td0935CapitalFlow < ind.td0933CapitalFlow &&
        ind.td0935NetInflow > 0 &&
        ind.td0935NetInflow < ind.td0933NetInflow

    // 排除条件2：Block-Stock资金不匹配
    const stockTd0935FlowNegative = ind.td0935CapitalFlow < 0 && ind.td0935NetInflow < 0
    const blockTd0935NotAllPositive = !(blockTd0935CF > 0 && blockTd0935NI > 0)
    const blockStockFlowMismatch = blockTd0935NotAllPositive && stockTd0935FlowNegative

    const isStrong =
        volumeCondition &&
        maBullish &&
        changeCondition &&
        pd1ChangeCondition &&
        pd1NetInflowCondition &&
        !flowWorsening &&
        !blockStockFlowMismatch

    return {
        isStrong,
        indicators: ind,
        conditions: {
            volume: volumeCondition,
            maBullish: { isStrong: maBullish, maBullishFull, isPd1LimitUp: ind.isPd1LimitUp, blockMaSuperRelax, stockMaSuperRelax },
            change: changeCondition,
            pd1Change: pd1ChangeCondition,
            pd1NetInflow: pd1NetInflowCondition,
            flowWorsening,
            blockStockFlowMismatch,
        },
    }
}

/* ================================================================
 * isBlockStrong - 供 Stock 匹配用的 Block 强势判断（策略不变）
 * ================================================================ */

/**
 * 判断 Block 是否强势（用于 Stock 匹配场景）
 */
function isBlockStrong(item, dates) {
    const C = STRATEGY_CONFIG.BLOCK
    const pd1Change = item[dates.pd1]?.涨跌幅 ?? -Infinity
    const pd1NetInflow = item[dates.pd1]?.大单净额 ?? -Infinity
    const pd1CapitalFlow = item[dates.pd1]?.资金流向 ?? -Infinity
    const td0935Change = item[`${dates.td} 09:35`]?.涨跌幅 ?? -Infinity
    const td0935CapitalFlow = item[`${dates.td} 09:35`]?.资金流向 ?? -Infinity
    const td0935NetInflow = item[`${dates.td} 09:35`]?.大单净额 ?? -Infinity
    const td0933CapitalFlow = item[`${dates.td} 09:33`]?.资金流向 ?? -Infinity
    const td0933NetInflow = item[`${dates.td} 09:33`]?.大单净额 ?? -Infinity
    const td0933Change = item[`${dates.td} 09:33`]?.涨跌幅 ?? -Infinity
    const pd1WinRate = item['昨日上涨家数占比'] ?? 0
    const pd1LimitUpCount = item['昨日涨停数'] ?? 0
    const M01 = item.M01 ?? 0
    const M05 = item.M05 ?? 0
    const M10 = item.M10 ?? 0
    const M21 = item.M21 ?? 0
    const M60 = item.M60 ?? 0
    const v01 = item.v01 ?? 0
    const v05 = item.v05 ?? 0
    const v10 = item.v10 ?? 0

    // 新概念判断
    const _isNewConcept = v01 > 0 && M01 > 0 && M05 === 0 && M10 === 0 && v05 === 0 && v10 === 0

    const pd1Volume = item[dates.pd1]?.成交量 ?? -Infinity
    const pd2Volume = item[dates.pd2]?.成交量 ?? -Infinity
    const pd2NetInflow = item[dates.pd2]?.大单净额 ?? -Infinity
    const volumeCondition = pd1Volume > pd2Volume || pd1NetInflow > pd2NetInflow

    const high5 = item['前5交易日区间最高价'] ?? 0
    const breakoutCondition = M01 >= high5 * C.BREAKOUT_RATIO && high5 > 0

    const rank0935 = item['09:35涨跌幅排名'] ?? 9999
    const rankYesterday = item['昨日涨跌幅排名'] ?? 9999
    const rankCondition = rank0935 <= C.RANK_0935_MAX && rankYesterday <= C.RANK_YESTERDAY_MAX

    // 极热板块
    const isSuperHot = pd1LimitUpCount >= C.HOT_LIMIT_UP && pd1WinRate >= C.HOT_WIN_RATE

    // 极热板块资金全负且恶化时筛除（行业适用，新概念除外）
    const flowAllNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
    const flowAllWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
    const superHotButWeak = isSuperHot && flowAllNegative && flowAllWorsening && !_isNewConcept

    // 基础条件
    const baseCondition =
        pd1Change > C.MIN_PD1_CHANGE &&
        td0935Change > C.MIN_TD0935_CHANGE_RELAX &&
        (pd1NetInflow > 0 || isSuperHot)
    const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
    const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
    const blockHeat = pd1WinRate > C.MIN_WIN_RATE && pd1LimitUpCount > 0
    const maBullish =
        pd1CapitalFlow > 0 && pd1NetInflow > 0
            ? M01 > M05 && M01 > M10 && M01 > M21
            : M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60
    const maOrFlowCondition =
        M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)
    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
    const allImproving =
        td0935Change > td0933Change &&
        td0935CapitalFlow > td0933CapitalFlow &&
        td0935NetInflow > td0933NetInflow
    const flowCondition = isSuperHot || !flowNegative || allImproving
    const flowWorsening =
        td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
    const lowChange = td0935Change < 1
    const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
    const flowImprovingBoth =
        td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
    const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

    return (
        baseCondition &&
        (isSuperHot || flowPositive || flowImproving) &&
        blockHeat &&
        maBullish &&
        maOrFlowCondition &&
        flowCondition &&
        (isSuperHot || !flowWorsening) &&
        lowChangeCondition &&
        volumeCondition &&
        breakoutCondition &&
        rankCondition &&
        !superHotButWeak
    )
}
