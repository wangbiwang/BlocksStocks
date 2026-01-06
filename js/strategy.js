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

function calcLongTrend(
    obj,
    ele,
    type,
    dates,
    Mw = { M05: 1.0, M10: 1.2, M21: 1.5, M30: 2.0, M60: 3.0 },
    Vw = { v05: 1.0, v10: 1.1, v21: 1.3, v30: 1.6, v60: 2.0 },
    Mfactor = 0.55,
    Vfactor = 0.45
) {
    const { pd1 } = dates
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const t = type === 'block' ? '指数@' : ''

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

    // ==== 防止 M1 或 v1 为 0 ====
    const M1 = obj.M01 > 0 ? obj.M01 : 1
    const v1 = obj.v01 > 0 ? obj.v01 : 1

    // -------- Sigmoid 函数（连续化趋势力度） --------
    const sigmoid = (x) => 1 / (1 + Math.exp(-x))

    // -------- 计算价格趋势力度（连续）--------
    // 趋势力度 = M_long 与 M1 的比例差
    const priceStrength = (M_long) => {
        let diff = (M_long - M1) / M1 // 趋势斜率
        return sigmoid(-diff * 8) // K=8 可自行调节
    }

    obj.M05力度 = priceStrength(obj.M05)
    obj.M10力度 = priceStrength(obj.M10)
    obj.M21力度 = priceStrength(obj.M21)
    obj.M30力度 = priceStrength(obj.M30)
    obj.M60力度 = priceStrength(obj.M60)

    // -------- 加权价格趋势分 --------
    obj['趋势_M分'] =
        (obj.M05力度 * Mw.M05 +
            obj.M10力度 * Mw.M10 +
            obj.M21力度 * Mw.M21 +
            obj.M30力度 * Mw.M30 +
            obj.M60力度 * Mw.M60) /
        (Mw.M05 + Mw.M10 + Mw.M21 + Mw.M30 + Mw.M60)

    // -------- 计算量能趋势力度（连续）--------
    const volumeStrength = (vLong) => {
        if (vLong === 0) return 0
        let ratio = v1 / vLong // 当日量 / 长期均量
        return sigmoid((ratio - 1) * 6) // K=6，可调节
    }

    obj.v05力度 = volumeStrength(obj.v05)
    obj.v10力度 = volumeStrength(obj.v10)
    obj.v21力度 = volumeStrength(obj.v21)
    obj.v30力度 = volumeStrength(obj.v30)
    obj.v60力度 = volumeStrength(obj.v60)

    // -------- 加权量能趋势分 --------
    obj['趋势_V分'] =
        (obj.v05力度 * Vw.v05 +
            obj.v10力度 * Vw.v10 +
            obj.v21力度 * Vw.v21 +
            obj.v30力度 * Vw.v30 +
            obj.v60力度 * Vw.v60) /
        (Vw.v05 + Vw.v10 + Vw.v21 + Vw.v30 + Vw.v60)

    // -------- 最终趋势总分（0–1）--------
    obj['趋势总分'] = obj['趋势_M分'] * Mfactor + obj['趋势_V分'] * Vfactor

    return obj
}

function calcYesterdayMomentum(obj, ele, type, dates) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { pd1 } = dates

    /* ======================
     *  一、读取昨日基础数据
     * ====================== */
    let 涨幅 = 0
    let 大单 = 0
    let 资金 = 0
    let 排名 = 100
    let 涨停数 = 0
    let 热度排名 = 9999

    if (type === 'block') {
        涨幅 =
            num(ele[`指数@分时涨跌幅:前复权[${pd1} 15:00]`]) ||
            num(ele[`指数@涨跌幅:前复权[${pd1}]`]) ||
            num(obj[pd1]?.涨跌幅)

        大单 = num(ele[`指数@dde大单净额[${pd1}]`] ?? obj[pd1]?.大单净额)
        资金 = num(ele[`指数@资金流向[${pd1}]`] ?? obj[pd1]?.资金流向)
        排名 = ele['昨日涨跌幅排名'] || 100
        涨停数 = ele[`指数@涨停家数[${pd1}]`] || 0
        // calcBlockConcentration(blockItem, stockListForThisBlock, dates.pd1)
    } else {
        涨幅 = num(obj[pd1]?.涨跌幅)
        大单 = num(obj[pd1]?.大单净额)
        资金 = num(obj[pd1]?.资金流向)
        热度排名 = ele[`stock热度排名[${pd1}]`] || 9999
        涨停数 = 涨幅 >= 9.8 ? 1 : 0
    }


    let momentumScore = 0
    // 涨幅（0~4）
    if (涨幅 >= 4) momentumScore += 0.4
    else if (涨幅 >= 2) momentumScore += 0.3
    else if (涨幅 >= 1) momentumScore += 0.2
    else if (涨幅 >= 0.5) momentumScore += 0.1

    // 强度（0~3）
    if (type === 'block') {
        if (涨停数 >= 1) momentumScore += 0.3

    } else {
        if (涨停数 >= 1) momentumScore += 3
        else if (热度排名 <= 20) momentumScore += 0.2
        else if (热度排名 <= 40) momentumScore += 0.1
    }



    // 资金（-1~3）
    if (大单 > 0 && 资金 > 0) momentumScore += 0.3
    else if (大单 > 0 && 资金 < 0) momentumScore += 0.2
    else if (大单 < 0 && 资金 < 0) momentumScore -= 0.1


    // Keep both root field and score field for compatibility
    obj['昨日动能分'] = momentumScore

    return obj
}

async function calcTodayAlignment(obj, ele, type, dates, blockItem = null) {
    const 涨跌35 = obj['09:35']?.涨跌幅 || 0
    const 大单35 = obj['09:35']?.大单净额 || 0

    let score = 0

    /* 顺长期 */
    if (obj['趋势总分'] >= 0.65) score += 0.4
    if (obj['趋势总分'] <= 0.50) score -= 0.4

    /* 延续昨日 */
    if (obj['昨日动能分'] >= 0.6 && 涨跌35 > 0) score += 0.4
    if (obj['昨日动能分'] >= 0.6 && 涨跌35 < 0) score -= 0.4

    /* 资金确认 */
    if (大单35 > 0) score += 0.2
    if (大单35 < 0) score -= 0.2

    /* 4. 趋势动量评分（新增，作为配合分的内在增强） */
    let trendScore = 0
    // 1. 09:35综合趋势方向（权重最高：±0.15）
    if (obj['09:35']['趋势上']) {
        trendScore += 0.15  // 三者同时向上，强势信号
    } else if (obj['09:35']['趋势下']) {
        trendScore -= 0.15  // 三者同时向下，弱势信号
    }

    // 2. 关键指标趋势（大单净额趋势：±0.10）
    if (obj['09:35']['大单净额上趋势']) {
        trendScore += 0.10  // 大单净额改善，积极信号
    } else if (obj['09:35']['大单净额下趋势']) {
        trendScore -= 0.10  // 大单净额恶化，消极信号
    }
    // 3. 涨跌幅趋势验证（±0.05）
    if (obj['09:35']['涨跌幅上趋势']) {
        trendScore += 0.05  // 价格短期向上
    } else if (obj['09:35']['涨跌幅下趋势']) {
        trendScore -= 0.05  // 价格短期向下
    }
    // 4. 趋势一致性奖励（09:33→09:35延续：±0.05）
    if (obj['09:33']['趋势上'] && obj['09:35']['趋势上']) {
        trendScore += 0.05  // 持续上升，动量强劲
    } else if (obj['09:33']['趋势下'] && obj['09:35']['趋势下']) {
        trendScore -= 0.05  // 持续下降，弱势延续
    }
    // 限制分数范围在-0.35到+0.35之间（避免过度影响）
    trendScore = Math.max(-0.35, Math.min(0.35, trendScore))

    score += trendScore

    // 根据类型处理特定逻辑
    if (type === 'block') {
        // 板块类型暂无特殊处理
    } else {
        // stock类型，增加板块约束
        if (blockItem) {
            if (blockItem['09:35']?.涨跌幅 < 0 && 涨跌35 < 0) {
                score -= 0.3
            }
        }
    }

    obj['今日配合分'] = score


    const trend = Number(obj['趋势总分'] || 0)
    const momentum = Number(obj['昨日动能分'] || 0)
    const alignment = Number(obj['今日配合分'] || 0)
    let Weight1, Weight2, Weight3;
    if (type === 'block') {
        // 板块权重 趋势:0.45, 动能:0.35, 配合:0.20
        Weight1 = 0.45, Weight2 = 0.35, Weight3 = 0.20
        obj['总分'] = Number((trend * Weight1 + momentum * Weight2 + alignment * Weight3).toFixed(3))
    } else {
        // 股票权重 趋势:0.25, 动能:0.55, 配合:0.20
        Weight1 = 0.25, Weight2 = 0.55, Weight3 = 0.20
        obj['总分'] = Number((trend * Weight1 + momentum * Weight2 + alignment * Weight3).toFixed(3))
    }


    return obj
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
    const start5 = Dates.historicalDate[idx - 4]
    const start10 = Dates.historicalDate[idx - 9]
    obj['5日区间涨跌幅'] = num(ele[`${t}区间涨跌幅:不复权[${start5}-${pd1}]`])
    obj['10日区间涨跌幅'] = num(ele[`${t}区间涨跌幅:不复权[${start10}-${pd1}]`])

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

    if (type === 'block') {
        obj['指数简称'] = ele['指数简称']
        obj['板块类别'] = ele['指数@所属同花顺行业级别'] ? '二级行业' : '概念'
        obj['昨日涨停数'] = ele[`指数@涨停家数[${pd1}]`] || 0
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
/* //处理查询问题相关
    type: block|| stock
    dates
    from: '行业'||'概念' //type=stock存在该参数
    fromName: '行业名称||概念名称' //type=stock存在该参数
*/
function getQuestions(type, datas, from, fromName) {
    // debugger
    const { td, tdcn, pd2, pd3, isToday } = datas
    const text1 = '前1交易日(vol1和vol5和vol10和vol21和vol30和vol60)'
    const text2 = '前1交易日(1日均线和M5和M10和M21和M30和M60)'        //备注：M20 ，THS平台不支持，所以统一改 21
    const text3 = '前5交易日区间涨幅和前10交易日区间涨幅'
    let res = []
    if (type == 'block') {
        const textA = `当日涨跌幅资金流向大单净额收盘价;09:30涨跌幅;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35涨跌幅降序资金流向大单净额;`
        const textB = `前1交易日涨跌幅降序;前1交易日资金流向大单净额;${text1};${text2};${text3};前1交易日涨停家数;`
        res = [`${textA}二级行业`, `${textB}二级行业`, `${textA}概念`, `${textB}概念`]
        if (!isToday) {
            res = res.map((el) => {
                return el
                    .replaceAll('当日', tdcn)
                    .replaceAll('09:', tdcn + '09:')
                    .replaceAll('前1交易日', td + '前1交易日')
                    .replaceAll('前5交易日', td + '前5交易日')
                    .replaceAll('前10交易日', td + '前10交易日')
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


