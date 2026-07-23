/**
 * V6 策略函数模块
 *
 * Stock：趋势1-4 + 资金1 + 涨跌1 全通过 → 强势
 * Block：趋势1-4 + 资金1 + 涨跌1 全通过 → 强势
 */

/* ================================================================
 * 基础数据处理 (与原版 handleRate 相同)
 * ================================================================ */

function handleRate(obj, ele, type, dates) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { nd1, td, pd1, pd2, pd3, pd4 } = dates
    let t = type === 'block' ? '指数@' : ''

    obj[td] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${td}]`]),
        资金流向: num(ele[`${t}资金流向[${td}]`]),
        大单净额: num(ele[`${t}dde大单净额[${td}]`]),
        大单净量: num(ele[`${t}大单净量[${td}]`] || ele[`${t}dde大单净量[${td}]`] || 0),
    }
    obj[`${td} 09:35`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:35]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:35]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:35]`]),
    }
    obj[`${td} 09:33`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:33]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:33]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:33]`]),
    }
    obj[pd1] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${pd1}]`] || ele[`${t}分时涨跌幅:前复权[${pd1} 15:00]`]),
        资金流向: num(ele[`${t}资金流向[${pd1}]`] || ele[`${t}分时资金流向[${pd1} 15:00]`]),
        大单净额: num(ele[`${t}dde大单净额[${pd1}]`] || ele[`${t}分时dde大单净额[${pd1} 15:00]`]),
        大单净量: num(ele[`${t}dde大单净量[${pd1}]`] || ele[`${t}分时dde大单净量[${pd1} 15:00]`]),
    }
    obj[nd1] = { 涨跌幅: num(ele[`${t}涨跌幅:前复权[${nd1}]`]) }
    obj[pd2] = { 涨跌幅: num(ele[`${t}涨跌幅:前复权[${pd2}]`]) }

    // === 均线 (字段名：N日均线[DATE] / N日指数@均线[DATE]) ===
    const maPre = type === 'block' ? '日指数@均线' : '日均线'
    obj.M01 = num(ele[`1${maPre}[${pd1}]`])
    obj.M05 = num(ele[`5${maPre}[${pd1}]`])
    obj.M10 = num(ele[`10${maPre}[${pd1}]`])
    obj.M21 = num(ele[`21${maPre}[${pd1}]`])
    obj.M60 = num(ele[`60${maPre}[${pd1}]`])
    obj.prevM05 = num(ele[`5${maPre}[${pd2}]`] || 0)
    obj.prevM10 = num(ele[`10${maPre}[${pd2}]`] || 0)
    obj.prevM21 = num(ele[`21${maPre}[${pd2}]`] || 0)
    obj.prevM60 = num(ele[`60${maPre}[${pd2}]`] || 0)

    // === MACD (字段名：macd(diff值)[DATE] / 指数@macd(diff值)[DATE]) ===
    // Block: macd[DATE], Stock: macd(macd值)[DATE]
    const macdSuffix = type === 'block' ? '' : '(macd值)'
    obj.macdDiff = num(ele[`${t}macd(diff值)[${pd1}]`])
    obj.macdDea  = num(ele[`${t}macd(dea值)[${pd1}]`])
    obj.macdMacd = num(ele[`${t}macd${macdSuffix}[${pd1}]`])
    obj.prevMacdDiff = num(ele[`${t}macd(diff值)[${pd2}]`] || 0)
    obj.prevMacdDea  = num(ele[`${t}macd(dea值)[${pd2}]`] || 0)
    obj.prevMacdMacd = num(ele[`${t}macd${macdSuffix}[${pd2}]`] || 0)

    if (type !== 'block') {
        obj['股票简称'] = ele['股票简称'] || ''
        obj['行业'] = ele['所属同花顺行业']?.split('-')[1] || ''
        obj['三级行业'] = ele['所属同花顺行业']?.split('-')[2] || ''
        obj[pd1]['热度排名'] = ele[`个股热度排名[${pd1}]`] || ele[`个股热度排名[${td}]`]
        obj[pd1]['收盘价'] = num(ele[`收盘价:不复权[${pd1}]`]) || 0
        obj[`${td} 09:35`]['收盘价'] = num(ele[`分时收盘价:不复权[${td} 09:35]`]) || 0
        obj[pd1]['流通市值'] = ele[`a股市值(不含限售股)[${pd1}]`] || 0
        // 前5交易日区间最高价（突破判断）
        const highKey = Object.keys(ele).find(k => k.startsWith('区间最高价:不复权['))
        obj.rangeHigh5 = highKey ? num(ele[highKey]) : 0
        // vol5 对比
        obj.vol5Pd1 = num(ele[`5日vol[${pd1}]`])
        obj.vol5Pd2 = num(ele[`5日vol[${pd2}]`])
        // 日成交量对比
        obj.volDaily1 = num(ele[`成交量[${pd1}]`])
        obj.volDaily2 = num(ele[`成交量[${pd2}]`])
        obj.volDaily3 = num(ele[`成交量[${pd3}]`])
        const code = ele['code'] || ''
        obj['code'] = code
        const isMain = code.startsWith('60') || code.startsWith('00')
        obj['昨日涨停'] = obj[pd1]['涨跌幅'] >= (isMain ? 9.5 : 19.5)
        obj['09:35涨跌幅排名'] = ele['09:35涨跌幅排名'] || 9999
        obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名'] || 9999
    } else {
        obj['指数简称'] = ele['指数简称'] || ''
        obj[`${td} 09:35`]['成交量'] = num(ele[`${t}分时成交量[${td} 09:35]`])
        obj['09:35涨跌幅排名'] = ele['09:35涨跌幅排名'] || 9999
        obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名'] || 9999
        // 成交量对比用
        obj.volPd1 = num(ele[`${t}成交量[${pd1}]`])
        obj.volPd2 = num(ele[`${t}成交量[${pd2}]`])
        obj.volPd3 = num(ele[`${t}成交量[${pd3}]`] || 0)
        obj.volPd4 = num(ele[`${t}成交量[${pd4}]`] || 0)
    }
}

/* ================================================================
 * V6 Stock 策略
 * ================================================================ */

function evaluateStockStrong(item, dates) {
    const { pd1 } = dates

    const c = item['code'] || ''
    const isMain = c.startsWith('60') || c.startsWith('00')
    const isLimitUp = (item[pd1]?.涨跌幅 || 0) >= (isMain ? 9.5 : 19.5)
    const trend12ma = item.M01 > item.M05 && item.M01 > item.M10 && item.M01 > item.M21 && item.M01 > item.M60 && item.M05 > item.M10
        && item.M05 > item.prevM05 && item.M10 > item.prevM10 && item.M21 > item.prevM21
    const trend12 = trend12ma && (isLimitUp || item.M60 > item.prevM60)
    const trend3 = item.macdDiff > item.macdDea || item.macdMacd > item.prevMacdMacd
    const trend4 = item.macdMacd > item.prevMacdMacd && item.macdDiff > item.prevMacdDiff && item.macdDea > item.prevMacdDea
    const fund1 = (item[pd1]?.大单净额 || 0) > 0
    const change1 = (item[pd1]?.涨跌幅 || 0) > 0
    const change2 = (item[`${dates.td} 09:35`]?.涨跌幅 || 0) > 0
    // 前一交易日收盘价接近前5日新高（95%以上）
    const breakout = (item[pd1]?.收盘价 || 0) >= item.rangeHigh5 * 0.95
    // pd1成交量 > pd2（较前日放量），涨停豁免
    const volDailyBreak = (item.volDaily1 || 0) > (item.volDaily2 || 0) || isLimitUp

    return {
        isStrong: trend12 && trend3 && trend4 && fund1 && change1 && change2 && breakout && volDailyBreak,
        conditions: { trend12, trend3, trend4, fund1, change1, change2, breakout, volDailyBreak },
    }
}

/* ================================================================
 * V6 Block 策略
 * ================================================================ */

function evaluateBlockStrong(item, dates) {
    const { pd1 } = dates

    const trend12 = item.M01 > item.M05 && item.M01 > item.M10 && item.M01 > item.M21 && item.M01 > item.M60 && item.M05 > item.prevM05
    const trend3 = item.macdDiff > item.macdDea || item.macdMacd > item.prevMacdMacd
    const trend4 = item.macdMacd > item.prevMacdMacd && item.macdDiff > item.prevMacdDiff
    const fund1 = (item[pd1]?.大单净额 || 0) > 0
    const change1 = (item[pd1]?.涨跌幅 || 0) > 0
    const change2 = (item[`${dates.td} 09:35`]?.涨跌幅 || 0) > 0.5
    // 前1交易日成交量 > pd2（较前日放量）
    const volBreak = (item.volPd1 || 0) > (item.volPd2 || 0)
    // 09:35资金恶化筛除
    const f0935 = item[`${dates.td} 09:35`]?.资金流向 || 0
    const n0935 = item[`${dates.td} 09:35`]?.大单净额 || 0
    const f0933 = item[`${dates.td} 09:33`]?.资金流向 || 0
    const n0933 = item[`${dates.td} 09:33`]?.大单净额 || 0
    const flowOk = !(f0935 < 0 && n0935 < 0)

    // 特殊强势：前1日+09:35 资金/大单/涨跌全正，且09:35>09:33
    const pd1Flow = item[pd1]?.资金流向 || 0
    const pd1Net  = item[pd1]?.大单净额 || 0
    const pd1Chg  = item[pd1]?.涨跌幅 || 0
    const c0935   = item[`${dates.td} 09:35`]?.涨跌幅 || 0
    const c0933   = item[`${dates.td} 09:33`]?.涨跌幅 || 0
    const pd1AllPositive = pd1Flow > 0 && pd1Net > 0 && pd1Chg > 0
    const td0935Positive  = f0935 > 0 && n0935 > 0 && c0935 > 0
    const td0933Positive  = f0933 > 0 && n0933 > 0 && c0933 > 0
    const tdImproving     = f0935 > f0933 && n0935 > n0933 && c0935 > c0933
    const superHot = pd1AllPositive && td0935Positive && td0933Positive && tdImproving
        && item.M05 > item.M10 && item.M05 > item.prevM05

    // 共同前提：昨日排名前20 或 昨日涨跌幅>2%
    const rankTop20 = (item['昨日涨跌幅排名'] || 9999) <= 20
    const pd1ChgGt2 = pd1Chg > 2
    const rankOrChg = rankTop20 || pd1ChgGt2

    const normalStrong = trend12 && trend3 && trend4 && fund1 && change1 && change2 && volBreak && flowOk

    return {
        isStrong: (normalStrong || superHot) && rankOrChg,
        conditions: { trend12, trend3, trend4, fund1, change1, change2, volBreak, flowOk, superHot, rankOrChg },
    }
}

/* ================================================================
 * 查询构造 (增加 MACD + 前1日均线)
 * ================================================================ */

function getQuestions(type, datas, BlockType, BlockName) {
    const { nd1, td, pd1, pd2, pd3, pd4 } = datas
    let questions = []

    const macdBlock = `${pd1}(MACD(DIFF值);MACD(DEA值);MACD);${pd2}(MACD(DIFF值);MACD(DEA值);MACD)`
    const maBlock   = `${pd1}(1日均线和M5和M10和M21和M60);${pd2}(1日均线和M5和M10和M21和M60)`

    if (type === 'block-行业') {
        questions[0] = `${nd1}涨跌幅;${td} 09:35涨跌幅降序;${td} 09:35资金流向大单净额;${td} 09:33涨跌幅资金流向大单净额;${pd2}涨跌幅成交量大单净额;${td}前3交易日涨跌幅;${td}前3交易日资金流向;${pd1}前5交易日区间最高价;${pd1}资金流向大单净额;二级行业`
        questions[1] = `${pd1}涨跌幅降序;${pd1}成交量;${pd2}成交量;${pd3}成交量;${maBlock};二级行业`
        questions[2] = `${pd1}涨跌幅降序;${td}涨跌幅;${macdBlock};二级行业`
    } else if (type === 'block-概念') {
        questions[0] = `${nd1}涨跌幅;${td} 09:35涨跌幅降序;${td} 09:35资金流向大单净额;${td} 09:33涨跌幅资金流向大单净额;${pd2}涨跌幅成交量大单净额;${td}前3交易日涨跌幅;${td}前3交易日资金流向;${pd1}前5交易日区间最高价;${pd1}资金流向大单净额;概念`
        questions[1] = `${pd1}涨跌幅降序;${pd1}成交量;${pd2}成交量;${pd3}成交量;${maBlock};概念`
        questions[2] = `${pd1}涨跌幅降序;${td}涨跌幅;${macdBlock};概念`
    }
    if (type === 'stock') {
        BlockType = BlockType == '行业' ? '所属行业包含' : '所属概念包含'
        const macdStock = `${pd1}(MACD(DIFF值);MACD(DEA值);MACD);${pd2}(MACD(DIFF值);MACD(DEA值);MACD)`
        const maStock   = `${pd1}(1日均线和M5和M10和M21和M60);${pd2}(1日均线和M5和M10和M21和M60)`
        questions[0] = `${td} 09:35涨跌幅降序;${pd1}涨跌幅资金流向大单净额;${pd1}收盘价;${pd1}热度排名;${pd1}前5交易日区间最高价不复权;${pd1}成交量;${td} 09:35涨跌幅资金流向大单净额;行业概念主板创业非ST;${BlockType}${BlockName}`
        questions[1] = `${pd1}涨跌幅降序;${nd1}涨跌幅;${td}涨跌幅;${pd2}成交量;${pd3}成交量;${td} 09:33涨跌幅资金流向大单净额;三级行业;${maStock};行业概念主板创业非ST;${BlockType}${BlockName}`
        questions[2] = `${pd1}涨跌幅降序;${macdStock};行业概念主板创业非ST;${BlockType}${BlockName}`
    }
    return questions
}
