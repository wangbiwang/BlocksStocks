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

    obj.factor = obj.factor || {}
    obj.score = obj.score || {}

    /* ======================
     *  一、读取昨日基础数据
     * ====================== */
    let 涨幅 = 0
    let 大单 = 0
    let 资金 = 0
    let 排名 = 9999
    let 涨停数 = 0
    let 热度排名 = 9999

    if (type === 'block') {
        涨幅 =
            num(ele[`指数@分时涨跌幅:前复权[${pd1} 15:00]`]) ||
            num(ele[`指数@涨跌幅:前复权[${pd1}]`]) ||
            num(obj[pd1]?.涨跌幅)

        大单 = num(ele[`指数@dde大单净额[${pd1}]`] ?? obj[pd1]?.大单净额)
        资金 = num(ele[`指数@资金流向[${pd1}]`] ?? obj[pd1]?.资金流向)
        排名 = ele['昨日涨跌幅排名'] || 9999
        涨停数 = ele[`指数@涨停家数[${pd1}]`] || 0
        // calcBlockConcentration(blockItem, stockListForThisBlock, dates.pd1)
    } else {
        涨幅 = num(obj[pd1]?.涨跌幅)
        大单 = num(obj[pd1]?.大单净额)
        资金 = num(obj[pd1]?.资金流向)
        热度排名 = ele[`stock热度排名[${pd1}]`] || 9999
        涨停数 = 涨幅 >= 9.8 ? 1 : 0
    }

    /* ======================
     *  二、昨日动能分（你原逻辑，略微结构化）
     * ====================== */
    let momentumScore = 0

    // 涨幅（0~4）
    if (涨幅 >= 4) momentumScore += 0.4
    else if (涨幅 >= 2) momentumScore += 0.3
    else if (涨幅 >= 1) momentumScore += 0.2
    else if (涨幅 >= 0.5) momentumScore += 0.1

    // 强度（0~3）
    if (type === 'block') {
        if (涨停数 >= 1) momentumScore += 0.3
        else if (排名 <= 10) momentumScore += 0.3
        else if (排名 <= 20) momentumScore += 0.2
        else if (排名 <= 40) momentumScore += 0.1
    } else {
        if (涨停数 >= 1) momentumScore += 3
        else if (热度排名 <= 20) momentumScore += 0.2
        else if (热度排名 <= 40) momentumScore += 0.1
    }
    //     对于行业板块（90个）：

    // 前10名（前11%）：0.3分
    // 11-20名（前22%）：0.2分
    // 21-40名（前44%）：0.1分
    // 涨停数≥1：+0.15分
    // 涨停数≥3或占比>5%：+0.25分
    // 对于概念板块（324个）：

    // 前10名（前3%）：0.3分 × 规模系数（约0.8）= 0.24分
    // 11-30名（前9%）：0.2分 × 规模系数 = 0.16分
    // 31-60名（前19%）：0.1分 × 规模系数 = 0.08分
    // 涨停数≥2或占比>3%：+0.2分
    // 涨停数≥5或占比>7%：+0.3分

    // 资金（-1~3）
    if (大单 > 0 && 资金 > 0) momentumScore += 0.3
    else if (大单 > 0 || 资金 > 0) momentumScore += 0.2
    else if (大单 < 0 && 资金 < 0) momentumScore -= 0.1


    // Keep both root field and score field for compatibility
    obj['昨日动能分'] = momentumScore
    obj.score['昨日动能分'] = momentumScore
    obj.score['昨日动能等级'] =
        momentumScore >= 0.75 ? '强启动' : momentumScore >= 0.6 ? '启动' : momentumScore >= 0.4 ? '弱动能' : '无动能'


    /* ======================
     *  三、强势日判断（核心新增）
     * ====================== */

    let strongHit = 0

    if (type === 'block') {
        if (涨幅 >= 2) strongHit++
        if (排名 <= 20) strongHit++
        if (大单 > 0 && 资金 > 0) strongHit++
        if (涨停数 >= 1) strongHit++
        obj.factor['昨日是否强势'] = strongHit >= 2
    } else {
        if (涨停数 >= 1) strongHit += 2 // 涨停权重更高
        if (涨幅 >= 5) strongHit++
        if (大单 > 0) strongHit++
        if (热度排名 <= 30) strongHit++
        obj.factor['昨日是否强势'] = strongHit >= 2
    }

    /* ======================
     *  四、强势天数累计（基于历史缓存）
     *  说明：
     *  - 依赖 obj.strongDays 缓存
     *  - 每天跑一次，向前累计
     * ====================== */

    const prevDays = obj.strongDays || 0
    const todayStrong = obj.factor['昨日是否强势']

    obj.strongDays = todayStrong ? prevDays + 1 : 0

    /* ======================
     *  五、阶段识别（block / stock 不同）
     * ====================== */

    let stage = '未知'

    if (type === 'block') {
        if (obj.strongDays <= 2) stage = '主升早段'
        else if (obj.strongDays <= 4) stage = '主升中段'
        else stage = '情绪高潮'
    } else {
        if (obj.strongDays <= 1) stage = '启动'
        else if (obj.strongDays <= 2) stage = '主升'
        else if (obj.strongDays === 3) stage = '接力'
        else stage = '高位博弈'
    }

    obj.score['强势天数'] = obj.strongDays
    obj.score['强势阶段'] = stage

    /* ======================
     *  六、阶段风控（直接给后续用）
     * ====================== */

    obj.score['阶段风险'] = stage === '情绪高潮' || stage === '高位博弈' ? '高' : stage === '接力' ? '中' : '低'

    return obj
}

async function calcTodayAlignment(obj, ele, type, dates, blockItem = null) {
    const 涨跌35 = obj['09:35']?.涨跌幅 || 0
    const 大单35 = obj['09:35']?.大单净额 || 0

    let score = 0

    /* 顺长期 */
    if (obj['趋势总分'] >= 0.6) score += 0.4
    if (obj['趋势总分'] < 0.45) score -= 0.4

    /* 延续昨日 */
    if (obj['昨日动能分'] >= 0.6 && 涨跌35 > 0) score += 0.4
    if (obj['昨日动能分'] >= 0.6 && 涨跌35 < 0) score -= 0.4

    /* 资金确认 */
    if (大单35 > 0) score += 0.2
    if (大单35 < 0) score -= 0.2

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
    obj['今日配合评价'] = score >= 0.4 ? '强配合' : score >= 0.2 ? '配合' : score <= -0.3 ? '背离' : '中性'

    const trend = Number(obj['趋势总分'] || 0) 
    const momentum = Number(obj['昨日动能分'] ?? obj.score?.['昨日动能分'] ?? 0)
    const alignment = Number(obj['今日配合分'] || 0) 
    let Weight1,Weight2,Weight3;
    if(type === 'block'){
        // 板块权重 趋势:0.45, 动能:0.35, 配合:0.20
        Weight1=0.45,Weight2=0.35,Weight3=0.20
        obj['总分'] = Number((trend*Weight1 + momentum*Weight2 + alignment*Weight3).toFixed(3))
    } else {
        // 股票权重 趋势:0.25, 动能:0.55, 配合:0.20
        Weight1=0.25,Weight2=0.55,Weight3=0.20
        obj['总分'] = Number((trend*Weight1 + momentum*Weight2 + alignment*Weight3).toFixed(3))
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
    let res = []
    if (type == 'block') {
        const textA = `当日涨跌幅资金流向大单净额收盘价;09:30涨跌幅;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35涨跌幅降序资金流向大单净额;`
        const textB = `前1交易日涨跌幅降序;前1交易日资金流向大单净额;${text1};${text2};前1交易日涨停家数;`
        res = [`${textA}二级行业`, `${textB}二级行业`, `${textA}概念`, `${textB}概念`]
        if (!isToday) {
            res = res.map((el) => {
                return el
                    .replaceAll('当日', tdcn)
                    .replaceAll('09:', tdcn + '09:')
                    .replaceAll('前1交易日', td + '前1交易日')
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

function calcBlockConcentration(blockObj, stockList, pd1) {
    blockObj.factor = blockObj.factor || {}
    blockObj.score = blockObj.score || {}

    // 获取昨日涨幅 ≥3%的强势股票
    const strongStocks = stockList.filter((s) => (s[pd1]?.涨跌幅 || 0) >= 0.03)
    const strongCount = strongStocks.length

    // 获取昨日涨停股票
    const涨停Stocks = stockList.filter((s) => s['昨日涨停'] === true)
    const涨停Count = 涨停Stocks.length

    const totalStocks = stockList.length

    // 样本不足或者没有涨停
    if (totalStocks < 3 || 涨停Count === 0) {
        blockObj.factor['集中度'] = 0
        blockObj.score['集中度等级'] = '样本不足或无涨停'
        return blockObj
    }

    // α:比例权重，β:绝对数权重
    const α = 0.7
    const β = 0.3

    // 防止除零
    const baseStrongCount = Math.max(strongCount, 1)

    // 统一集中度公式
    const concentration = α * (涨停Count / baseStrongCount) + β * Math.log(1 + 涨停Count)

    blockObj.factor['集中度'] = Number(concentration.toFixed(3))

    // 集中度等级（可根据历史数据微调阈值）
    if (concentration >= 1.0) {
        blockObj.score['集中度等级'] = '高度集中'
    } else if (concentration >= 0.5) {
        blockObj.score['集中度等级'] = '中度集中'
    } else {
        blockObj.score['集中度等级'] = '分散'
    }

    return blockObj
}
