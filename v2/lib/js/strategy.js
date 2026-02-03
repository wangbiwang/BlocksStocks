//昨日资金介入？
function calcYesterdayMomentum(obj, type, dates) {
    const { pd1 } = dates
    let result = false, resultScore = 0;
    // if (type == 'block'&&obj['指数简称'] == '房地产') debugger
    // if (type == 'block'&&obj['指数简称'] == '房地产') debugger
    if (type === 'block') {
        if (obj.昨日涨跌幅排名 <= 10 || obj[pd1].涨跌幅 >= 2) {
            if (obj[pd1].大单净额 >= 0 && obj[pd1].大单净额 + obj[pd1].资金流向 > 0 && obj['昨日涨停数'] > 0) {
                result = true
                resultScore = 1
            }
        }
    } else {
        // if(obj['股票简称']=='光线传媒')debugger
        let zt = obj[pd1].收盘价 == obj[pd1].涨停价
        if (obj[pd1].大单净额 >= 0 && (obj[pd1].大单净额 + obj[pd1].资金流向 > 0 || zt)) {
            result = true
            resultScore = 1
            if (zt) resultScore += 0.5
        }

    }


    obj._yesterdayActive = result
    obj._yesterdayActiveCore = Number(resultScore.toFixed(2))
    return obj
}
//趋势形态怎么样？
function calcLongTrend(obj, type, dates) {
    let result = false, resultScore = 0;
    let M1 = obj.M01, M5 = obj.M05, M10 = obj.M10, M21 = obj.M21, M30 = obj.M30, M60 = obj.M60;
    let V1 = obj.v01, V5 = obj.v05, V10 = obj.v10, V21 = obj.v21, V30 = obj.v30, V60 = obj.v60;
    if (M1 >= M5 && M1 >= M10 && M1 >= M21 && (M30 ? M1 >= M30 : true) && (M60 ? M1 >= M60 : true)) {
        if (V1 >= V5 && V1 >= V10 && V1 >= V21 && (V30 ? V1 >= V30 : true) && (V60 ? V1 >= V60 : true)) {
            result = true
            resultScore = 1
        }
    }
    obj._trendQualified = result
    obj._trendCore = Number(resultScore.toFixed(2))
    return obj
}
//今天早上表现怎么样？
async function calcTodayAlignment(obj, type, dates, blockItem = null) {
    // if (type == 'block'&&obj['指数简称'] == '华为海思概念股') debugger
    // if (type == 'block'&&obj['指数简称'] == '房地产') debugger

    const { pd1 } = dates
    const t = obj['09:35']
    let result = false, resultScore = 0;
    if (type === 'block') {
        if (t.涨跌幅 > 0.7 && !obj['09:35']['趋势下']) {
            if (obj['09:35'].大单净额 >= 0 || obj['09:35'].资金流向 >= 0) {
                result = true
                resultScore = 1
                resultScore += 0.1 * (t.涨跌幅 - 1)
                let bonus1 = Math.max(Math.min((obj['09:35'].大单净额 / obj[pd1].流通市值) * 10000, 1), -1) * 0.1
                let bonus2 = Math.max(Math.min((obj['09:35'].资金流向 / obj[pd1].流通市值) * 10000, 0.8), -0.8) * 0.1
                // console.log(obj['指数简称'], bonus1, bonus2)
                resultScore += bonus1
                resultScore += bonus2
                if (obj['09:35']['涨跌幅下趋势']) resultScore += -0.1
                if (obj['09:35']['大单净额下趋势']) resultScore += -0.1
                if (obj['09:35']['资金流向下趋势']) resultScore += -0.1
            }
        }
    } else {
        if (t.涨跌幅 > 1 && (obj['09:35'].大单净额 >= 0 || obj['09:35'].资金流向 >= 0) && obj['09:35'].收盘价 >= obj['40日区间最高价']) {
            result = true
            resultScore = 1
            // resultScore += 0.1 * (t.涨跌幅 - 1)
            // let bonus1 = Math.max(Math.min((obj['09:35'].大单净额 / obj[pd1].流通市值) * 10000, 1), -1) * 0.1
            // let bonus2 = Math.max(Math.min((obj['09:35'].资金流向 / obj[pd1].流通市值) * 10000, 0.8), -0.8) * 0.1
            // console.log(bonus1, bonus2)
            // resultScore += bonus1
            // resultScore += bonus2
            // if (obj['09:35']['涨跌幅下趋势']) resultScore += -0.1
            // if (obj['09:35']['大单净额下趋势']) resultScore += -0.1
            // if (obj['09:35']['资金流向下趋势']) resultScore += -0.1
        }
    }


    obj._todayVeto = result
    obj._todayVetoCore = Number(resultScore.toFixed(2))
    return obj
}
function selectStrong(Item, maxCount = 8, type) {
    if (type == 'stock') {
        return Item
            .filter(b => b._yesterdayActive)
            .filter(b => b._trendQualified)
            .filter(b => b._todayVeto)
            .map(b => {
                // let strength = b._trendCore + b._yesterdayActiveCore + b._todayVetoCore
                // b._Strength = Number(strength.toFixed(2))
                b._Strength = b['昨热度排名']
                return b
            })

            .sort((a, b) => a._Strength - b._Strength)
            .slice(0, maxCount)
    }
    return Item
        .filter(b => b._yesterdayActive)
        .filter(b => b._trendQualified)
        .filter(b => b._todayVeto)

        .map(b => {
            let strength = b._trendCore + b._yesterdayActiveCore + b._todayVetoCore
            b._Strength = Number(strength.toFixed(2))
            // if (type == 'block'&&b['指数简称'] == '房地产') debugger
            return b
        })

        .sort((a, b) => b._Strength - a._Strength)
        .slice(0, maxCount)
}

function handleRate(obj, ele, type, datas) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { td, pd1, nd1, nd2 } = datas
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

    }

    // 计算并赋值：前5交易日、前10交易日区间涨跌幅（不复权）
    // debugger
    const idx = Dates.historicalDate.indexOf(pd1)
    // const start5 = Dates.historicalDate[idx - 4]
    // const start10 = Dates.historicalDate[idx - 9]
    const start40 = Dates.historicalDate[Math.max(0, idx - 39)]
    // const start60 = Dates.historicalDate[Math.max(0, idx - 59)]
    // obj['5日区间涨跌幅'] = num(ele[`${t}区间涨跌幅:不复权[${start5}-${pd1}]`])
    // obj['10日区间涨跌幅'] = num(ele[`${t}区间涨跌幅:不复权[${start10}-${pd1}]`])
    obj['40日区间最高价'] = num(ele[`${t}区间最高价:不复权[${start40}-${pd1}]`])
    // obj['60日区间最高价'] = num(ele[`${t}区间最高价:不复权[${start60}-${pd1}]`])
    // obj['60日区间最低价'] = num(ele[`${t}区间最低价:不复权[${start60}-${pd1}]`])

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
    obj['昨日涨跌幅排名'] = ele['qRank']
    obj['今日涨跌幅排名'] = ele['rank']
    obj['row_count'] = ele['count']
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
        obj['昨热度排名'] = ele[`个股热度排名[${pd1}]`] || 9999
        obj['流通市值'] = ele[`a股市值(不含限售股)[${pd1}]`]
        obj['股价'] = Number(ele[`收盘价:不复权[${td}]`] || ele[`最新价`])
        obj[pd1].收盘价 = num(ele[`收盘价:不复权[${pd1}]`])
        obj[pd1].涨停价 = num(ele[`涨停价[${pd1}]`])  //
        obj['09:35'].收盘价 = num(ele[`分时收盘价:不复权[${td} 09:35]`])
        // debugger
        let n1 = ele[`${t}涨跌幅:前复权[${nd1}]`] 
        let n2 = ele[`${t}涨跌幅:前复权[${nd2}]`] 
        obj['nd1涨跌幅'] = n1 ? Number(Number(n1).toFixed(2)) : '-'
        obj['nd2涨跌幅'] = n2 ? Number(Number(n2).toFixed(2)) : '-'
    }
}

function getQuestions(type, datas, from, fromName) {
    // debugger
    const { td, tdcn, pd2, pd3, isToday, nd1, nd2 } = datas
    const text1 = '前1交易日(vol1和vol5和vol10和vol21和vol30和vol60)'
    const text2 = '前1交易日(1日均线和M5和M10和M21和M30和M60)'        //备注：M20 ，THS平台不支持，所以统一改 21
    let res = []
    if (type == 'block') {
        const textA = `当日涨跌幅资金流向大单净额;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35涨跌幅降序资金流向大单净额;`
        const textB = `前1交易日涨跌幅降序;前1交易日资金流向大单净额;${text1};${text2};前1交易日涨停家数跌停家数;前1交易日流通市值;`
       
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
            `当日涨跌幅资金流向大单净额;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35涨跌幅资金流向大单净额股价;前1交易日热度排名升序;前1交易日涨停价;后2.2交易日涨跌幅;后2.1交易日涨跌幅;行业概念`,
            `前1交易日热度排名升序;前1交易日涨跌幅资金流向大单净额收盘价;${text1};${text2};前40交易日区间最高价不复权;行业概念`,
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
                    .replaceAll('前60交易日', tdcn + '前60交易日')
                    .replaceAll('流通市值', tdcn + '流通市值')
                    .replaceAll('后2.1交易日涨跌幅', `${nd1}涨跌幅`)
                    .replaceAll('后2.2交易日涨跌幅', `${nd2}涨跌幅`)
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

    console.log(type, res.map((e) => e.length))
    return res
}


