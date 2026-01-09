/*
Block数据获取：
HY板块数据：90
GN板块数据：340(后续会增加)
数据源获取，只能获取100，又不能多次获取数据，所以GN板块数据是不完全的，需要获取核心数据100个。
calcLongTrend 和 calcYesterdayMomentum 中GN板块数据，获取昨日涨跌幅排名前100的板块数据，HY板块数据，获取昨日涨跌幅排名前100的板块数据，由于全量90，所以可以完全覆盖。
calcTodayAlignment 中GN板块数据，获取今日截至到09：35分时涨跌幅排名前100的板块数据，HY板块数据，获取今日截至到09：35分时涨跌幅排名前100的板块数据，由于全量90，所以可以完全覆盖。
最终获取的Block数据，有可能有calcLongTrend 和 calcYesterdayMomentum 板块数据，却缺失calcTodayAlignment 板块数据，也有可能反过来。

Stock数据获取：
stock数据：5000左右，但是拆分到每个板块，每个板块的stock数据只有100左右，有的板块stock数量多，有的少，所以有的可以完全覆盖，有的缺失，参照Block数据获取。
calcLongTrend 和 calcYesterdayMomentum 中的stock数据，获取昨日选中板块涨跌幅排名前100的stock数据。
calcTodayAlignment 中的stock数据，获取今日截至到09：35分时选中板块涨跌幅排名前100的stock数据。
最终获取的Stock数据，有可能有calcLongTrend 和 calcYesterdayMomentum 板块数据，却缺失calcTodayAlignment 板块数据，也有可能反过来。
**/

// 规则原则： 宁可少进，不可错进；一日游宁可放过，不可误判为主线。

// 趋势是否成立？（calcLongTrend）不成立 → 结束
function calcLongTrend(obj, dates) {
    const { pd1 } = dates
    // -------- Sigmoid 函数（连续化趋势力度） --------
    const sigmoid = (x) => 1 / (1 + Math.exp(-x))
    // ==== 防止 M1 或 v1 为 0 ====
    const M1 = obj.M01 > 0 ? obj.M01 : 1
    const v1 = obj.v01 > 0 ? obj.v01 : 1

    // -------- 计算价格趋势力度（连续）--------
    // 趋势力度 = M_long 与 M1 的比例差
    const priceStrength = (M_long) => {
        let diff = (M_long - M1) / M1 // 趋势斜率
        return sigmoid(-diff * 15) // K=8 可自行调节
    }
    obj.M05力度 = priceStrength(obj.M05)
    obj.M10力度 = priceStrength(obj.M10)
    obj.M21力度 = priceStrength(obj.M21)
    obj.M30力度 = priceStrength(obj.M30)
    obj.M60力度 = priceStrength(obj.M60)

    // -------- 计算量能趋势力度（连续）--------
    const volumeStrength = (vLong) => {
        if (vLong === 0) return 0
        let ratio = v1 / vLong // 当日量 / 长期均量
        return sigmoid((ratio - 1) * 15) // K=6，可调节
    }

    obj.V05力度 = volumeStrength(obj.v05)
    obj.V10力度 = volumeStrength(obj.v10)
    obj.V21力度 = volumeStrength(obj.v21)
    obj.V30力度 = volumeStrength(obj.v30)
    obj.V60力度 = volumeStrength(obj.v60)

    // ===== 均线力度 =====
    const m21 = obj.M21力度 ?? 0
    const m30 = obj.M30力度 ?? 0
    const m60 = obj.M60力度 ?? 0
    // ===== 1. 趋势_M分（结构是否成立,中期 + 长期）=====
    const trendM = 0.40 * m60 + 0.35 * m30 + 0.25 * m21
    obj['趋势_M分'] = trendM
    // ===== 2. 趋势_V分（是否有真实参与,只用中长期量）=====
    const v21 = obj.V21力度 ?? 0
    const v30 = obj.V30力度 ?? 0
    const v60 = obj.V60力度 ?? 0
    const trendV = 0.60 * ((v21 + v30) / 2) + 0.40 * v60
    obj['趋势_V分'] = trendV

    // -------- 计算突破潜力分--------
    const calcBreakoutPotential = (price, low60, high60) => {
        if (high60 <= low60) return 0.5
        const pos = (price - low60) / (high60 - low60)
        return Math.max(0, Math.min(1, pos))// 安全裁剪
    }
    // debugger
    obj['突破潜力分'] = calcBreakoutPotential(obj[pd1].收盘价, obj['60日区间最低价'], obj['60日区间最高价'])

    // ===== 3. 突破潜力分（只用于位置标签）=====
    const breakout = obj['突破潜力分'] ?? 0
    obj['突破潜力分'] = breakout

    // ===== 4. 趋势是否成立（硬门槛）=====
    obj._trendQualified = trendM >= 0.50 && trendV >= 0.45
    if (obj['突破潜力分'] >= 0.95) obj._trendQualified = false
    if (!obj.M60 || !obj.v60) obj._trendQualified = false // 防止数据缺失误判

    // ===== 5. 趋势位置标签 =====
    obj._trendPosition =
        breakout >= 0.85 ? 'crowded' :
            breakout <= 0.40 ? 'early' :
                'neutral'

    // ===== 6. Block 主线核心趋势强度（用于排序）=====
    obj._trendCore = 0.4 * m60 + 0.35 * m30 + 0.25 * m21
    obj._trendCore = Number(obj._trendCore.toFixed(4))

    return obj
}
// 是否值得优先关注？（calcYesterdayMomentum）决定排序，不决定生死
function calcYesterdayMomentum(obj, ele, type, dates) {
    const { pd1 } = dates

    // ===== 1. 昨日涨幅（归一化到 0~1）=====
    const pct = obj[pd1]['涨跌幅'] ?? 0
    const priceScore = Math.max(-5, Math.min(5, pct)) / 5   // -1 ~ 1

    // ===== 2. 情绪行为（涨停 - 跌停）=====
    const up = obj['昨日涨停数'] ?? 0
    const down = obj['昨日跌停数'] ?? 0
    const emotionScore = Math.max(-3, Math.min(3, up - down)) / 3

    // ===== 3. 资金确认（归一化）=====
    const fund = obj[pd1].大单净额 ?? 0
    const cap = obj[pd1].流通市值 ?? 1
    const fundScore = Math.max(-0.03, Math.min(0.03, fund / cap)) / 0.03

    // ===== 4. 昨日动能分（只用于确认）=====
    let momentum = 0.50 * priceScore + 0.30 * emotionScore + 0.20 * fundScore
    momentum = Number(momentum.toFixed(4))

    obj['_yesterdayActiveCore'] = momentum

    // ===== 5. 是否仍被市场参与 =====
    obj._yesterdayActive = momentum >= 0
    if (!(obj[pd1]['涨跌幅'] > 1 && obj[pd1].大单净额 > 0)) obj._yesterdayActive = false //加强判断：必须涨跌幅和大单净额都为正，才算被市场参与

    return obj
}
// 今天是否被否定？（calcTodayAlignment）否定 → 暂停 / 降级
async function calcTodayAlignment(obj, ele, type, dates, blockItem = null) {
    const { pd1 } = dates
    const t = obj['09:35'] || {}
    // ===== Block 否决条件（非常严格）=====
    obj._todayVeto = false
    if (t['涨跌幅'] < 1 && t['大单净额'] < 0 && t['资金流向'] < 0) obj._todayVeto = true //加强判断：必须涨跌幅和大单净额和资金流向都为负，才算被今日否决
    if (obj['09:35']['大单净额下趋势'] && obj['09:35']['资金流向下趋势']) obj._todayVeto = true
    if (t['涨跌幅'] < 0.5 || obj['09:33']['涨跌幅'] < 0) obj._todayVeto = true

    const priceToday = t['涨跌幅'] ?? 0;
    const priceYesterday = obj[pd1]['涨跌幅'] ?? 0;
    const fundToday = t['资金流向'] ?? 0;
    const bigToday = t['大单净额'] ?? 0;
    const cap = obj[pd1].流通市值 ?? 1;

    // 1. 涨跌幅维度（80%权重）
    const priceScore = Math.max(-1, Math.min(1, priceToday / 3));
    
    // 2. 机构信号维度（15%权重）
    const institutionalStrength = Math.sign(bigToday) * Math.min(1, Math.abs(bigToday) / cap * 10000);
    const divergenceBonus = (Math.sign(bigToday) !== Math.sign(fundToday)) ? Math.sign(bigToday) * Math.min(0.3, Math.abs(bigToday) / (Math.abs(fundToday) + 1) * 0.5) : 0;
    const institutionalScore = institutionalStrength + divergenceBonus;
    
    // 3. 资金流向维度（5%权重）
    const fundScore = Math.max(-1, Math.min(1, fundToday / cap * 10000)) * 0.5; // 进一步衰减

    // 最终得分
    obj._todayVetoCore = Math.max(-1, Math.min(1, 0.8 * priceScore + 0.15 * institutionalScore + 0.05 * fundScore));
    obj._todayVetoCore = Number(obj._todayVetoCore.toFixed(4))
    return obj
}
function selectStrongBlocks(blocks, maxCount = 8) {
    // debugger
    return blocks
        // 1️⃣ 趋势不过，直接扔
        .filter(b => b._trendQualified)
        // 2️⃣ 昨日已被市场抛弃，扔
        .filter(b => b._yesterdayActive)
        // 3️⃣ 今日明确否决，扔（强趋势容错你可自己加）
        .filter(b => !b._todayVeto)
        // 4️⃣ 计算 Block 主线强度
        .map(b => {
            const participation = 0.05 * b['趋势_V分'] + 0.95 * Math.max(0, b._todayVetoCore ?? 0)
            let strength = 0.3 * b._trendCore + 0.7 * participation
            // 突破潜力惩罚（只在极端位置）
            if (b['突破潜力分'] >= 0.90) strength *= 0.8
            b._blockStrength = Number(strength.toFixed(3))
            return b
        })
        // 5️⃣ 强排序
        .sort((a, b) => b._blockStrength - a._blockStrength)
        // 6️⃣ 只保留 Top-N
        .slice(0, maxCount)
}


function handleRate(obj, ele, type, datas) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { td, pd1 } = datas
    let t = type === 'block' ? '指数@' : ''
    obj[`${td}`] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${td}]`]),
        资金流向: num(ele[`${t}资金流向[${td}]`]),
        大单净额: num(ele[`${t}dde大单净额[${td}]`]),
    }
    obj[`09:35`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:35]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:35]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:35]`]),
    }
    obj[`09:33`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:33]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:33]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:33]`]),
    }
    obj[`09:31`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:31]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:31]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:31]`]),
    }
    obj[`09:30`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:30]`] || ele[`${t}分时涨跌幅:前复权[${td} 09:25]`]),
    }
    obj[pd1] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${pd1}]`] || ele[`${t}分时涨跌幅:前复权[${pd1} 15:00]`]),
        资金流向: num(ele[`${t}资金流向[${pd1}]`] || ele[`${t}分时资金流向[${pd1} 15:00]`]),
        大单净额: num(ele[`${t}dde大单净额[${pd1}]`] || ele[`${t}分时dde大单净额[${pd1} 15:00]`]),
        收盘价: num(ele[`1日指数${t}[${pd1}]`]),
    }
    // 计算并赋值：前5交易日、前10交易日区间涨跌幅（不复权）
    // debugger
    const idx = Dates.historicalDate.indexOf(pd1)
    // const start5 = Dates.historicalDate[idx - 4]
    // const start10 = Dates.historicalDate[idx - 9]
    const start60 = Dates.historicalDate[Math.max(0, idx - 59)]
    // obj['5日区间涨跌幅'] = num(ele[`${t}区间涨跌幅:不复权[${start5}-${pd1}]`])
    // obj['10日区间涨跌幅'] = num(ele[`${t}区间涨跌幅:不复权[${start10}-${pd1}]`])
    obj['60日区间最高价'] = num(ele[`${t}区间最高价:不复权[${start60}-${pd1}]`])
    obj['60日区间最低价'] = num(ele[`${t}区间最低价:不复权[${start60}-${pd1}]`])

    obj['09:35']['涨跌幅上趋势'] = obj['09:35']['涨跌幅'] >= obj['09:33']['涨跌幅']
    obj['09:35']['大单净额上趋势'] = obj['09:35']['大单净额'] >= obj['09:33']['大单净额']
    obj['09:35']['资金流向上趋势'] = obj['09:35']['资金流向'] >= obj['09:33']['资金流向']
    obj['09:35']['趋势上'] =
        obj['09:35']['涨跌幅上趋势'] && obj['09:35']['大单净额上趋势'] && obj['09:35']['资金流向上趋势']
    obj['09:33']['涨跌幅上趋势'] = obj['09:33']['涨跌幅'] >= obj['09:31']['涨跌幅']
    obj['09:33']['大单净额上趋势'] = obj['09:33']['大单净额'] >= obj['09:31']['大单净额']
    obj['09:33']['资金流向上趋势'] = obj['09:33']['资金流向'] >= obj['09:31']['资金流向']
    obj['09:33']['趋势上'] =
        obj['09:33']['涨跌幅上趋势'] && obj['09:33']['大单净额上趋势'] && obj['09:33']['资金流向上趋势']


    // 09:35时间段 - 下趋势字段
    obj['09:35']['涨跌幅下趋势'] = obj['09:35']['涨跌幅'] < obj['09:33']['涨跌幅']
    obj['09:35']['大单净额下趋势'] = obj['09:35']['大单净额'] < obj['09:33']['大单净额']
    obj['09:35']['资金流向下趋势'] = obj['09:35']['资金流向'] < obj['09:33']['资金流向']
    obj['09:35']['趋势下'] =
        obj['09:35']['涨跌幅下趋势'] &&
        obj['09:35']['大单净额下趋势'] &&
        obj['09:35']['资金流向下趋势']

    // 09:33时间段 - 下趋势字段  
    obj['09:33']['涨跌幅下趋势'] = obj['09:33']['涨跌幅'] < obj['09:31']['涨跌幅']
    obj['09:33']['大单净额下趋势'] = obj['09:33']['大单净额'] < obj['09:31']['大单净额']
    obj['09:33']['资金流向下趋势'] = obj['09:33']['资金流向'] < obj['09:31']['资金流向']
    obj['09:33']['趋势下'] =
        obj['09:33']['涨跌幅下趋势'] &&
        obj['09:33']['大单净额下趋势'] &&
        obj['09:33']['资金流向下趋势']

    obj['code'] = ele['code']
    obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名']
    obj['今日涨跌幅排名'] = ele['今日涨跌幅排名']
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

    if (type === 'block') {
        obj['指数简称'] = ele['指数简称']
        obj['板块类别'] = ele['指数@所属同花顺行业级别'] ? '二级行业' : '概念'
        obj['昨日涨停数'] = ele[`指数@涨停家数[${pd1}]`] || 0
        obj['昨日跌停数'] = ele[`指数@跌停家数[${pd1}]`] || 0
        obj[pd1].收盘价 = obj.M01
        obj[pd1].流通市值 = ele[`指数@流通市值[${pd1}]`]

    } else {
        obj['股票简称'] = ele['股票简称']
        obj['行业'] = ele['所属同花顺行业'] || ele['所属同花顺二级行业']
        obj['概念'] = ele['所属概念']
        obj['昨热度排名'] = ele[`stock热度排名[${pd1}]`]
        obj['今热度排名'] = ele[`stock热度排名[${td}]`]
        obj['流通市值'] = ele[`a股市值(不含限售股)[${td}]`]
        obj['股价'] = Number(ele[`收盘价:不复权[${td}]`] || ele[`最新价`])
    }
}

function getQuestions(type, datas, from, fromName) {
    // debugger
    const { td, tdcn, pd2, pd3, isToday } = datas
    const text1 = '前1交易日(vol1和vol5和vol10和vol21和vol30和vol60)'
    const text2 = '前1交易日(1日均线和M5和M10和M21和M30和M60)'        //备注：M20 ，THS平台不支持，所以统一改 21
    let res = []
    if (type == 'block') {
        const textA = `当日涨跌幅资金流向大单净额收盘价;09:30涨跌幅;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35涨跌幅降序资金流向大单净额;前60交易日区间最高价;前60交易日区间最低价;`
        const textB = `前1交易日涨跌幅降序;前1交易日资金流向大单净额;${text1};${text2};前1交易日涨停家数跌停家数;前1交易日流通市值`
        res = [`${textA}二级行业`, `${textB}二级行业`, `${textA}概念`, `${textB}概念`]
        if (!isToday) {
            res = res.map((el) => {
                return el
                    .replaceAll('当日', tdcn)
                    .replaceAll('09:', tdcn + '09:')
                    .replaceAll('前1交易日', td + '前1交易日')
                    .replaceAll('前5交易日', td + '前5交易日')
                    .replaceAll('前10交易日', td + '前10交易日')
                    .replaceAll('前60交易日', td + '前60交易日')
                    .replaceAll('流通市值', tdcn + '流通市值')
            })
        }
    } else if (type == 'stock') {
        res = [
            `当日涨跌幅资金流向大单净额收盘价;09:25涨跌幅;前1交易日热度排名升序当日热度排名流通市值;前1交易日涨跌幅资金流向大单净额rsi12;前2交易日涨跌幅大单净额macd;前5交易日区间最高价;行业概念`,
            `前1交易日热度排名升序前40交易日区间最高价不复权;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35涨跌幅资金流向大单净额股价;前3交易日涨跌幅macd;前1交易日涨停价;行业概念`,
            `前1交易日热度排名升序;${text1};${text2};前1交易日区间最高价后2交易日涨跌幅;前1交易日收盘价macd;行业概念`,
            `前1交易日热度排名升序;前5交易日的涨停次数;前15交易日的涨停次数;行业概念`, //原因1：2025-07-22 股票代码 002654 股票名称 华宏科技  前面连扳，小长期涨幅太高，接盘亏钱，所以不买入15天有超过3个涨停的股票！//原因2：2025-06-12 股票代码 003040 股票名称 楚 天 龙  前面连扳，近短期涨幅太高，接盘亏钱，所以也不买入5天有超过2个涨停的股票！
        ]
        if (!isToday) {
            res = res.map((el) => {
                el = el
                    .replaceAll('当日', tdcn)
                    .replaceAll('09:', tdcn + '09:')
                    .replaceAll('前1交易日', tdcn + '前1交易日')
                    .replaceAll('前5交易日', tdcn + '前5交易日')
                    .replaceAll('前15交易日', tdcn + '前15交易日')
                    .replaceAll('前20交易日', tdcn + '前20交易日')
                    .replaceAll('前40交易日', tdcn + '前40交易日')
                    .replaceAll('流通市值', tdcn + '流通市值')
                    .replaceAll('后2交易日涨跌幅', `${nd1}涨跌幅${nd2}涨跌幅`)
                if (from == '行业') {
                    el = el.replace('行业概念', `概念;所属二级行业包含${fromName}`)
                } else if (from == '概念') {
                    el = el.replace('行业概念', `行业概念;所属概念包含${fromName}`)
                }
                el = el.replaceAll('前2交易日', pd2).replaceAll('前3交易日', pd3)
                return el
            })
        }
    }

    console.log(
        type,
        res.map((e) => e.length)
    )
    return res
}


