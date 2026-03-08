// v3 特定策略函数

/**
 * 处理数据并计算基本指标
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
    } else {
        obj['股票简称'] = ele['股票简称'] || ''
        obj['行业'] = ele['所属同花顺行业']?.split('-')[1] || ''
        obj['概念'] = ele['所属概念']?.split(';') || []

        obj[pd1]['热度排名'] = ele[`个股热度排名[${pd1}]`] || ele[`个股热度排名[${td}]`]
    }

    obj['code'] = ele['code']
}

/**
 * 生成查询问题
 *
 * @param {string} type 类型 stock/block-行业/block-概念
 * @param {object} datas 数据
 * @returns {string[]} 问题数组
 */
function getQuestions(type, datas) {
    const { nd1, td, pd1, pd2 } = datas
    let questions = []
    if (type === 'block-行业') {
        questions[0] = `${td} 09:35涨跌幅降序资金流向大单净额；${td} 09:33涨跌幅资金流向大单净额;${td}涨跌幅;${pd2}涨跌幅成交量大单净额;${td}前3交易日涨跌幅；${td}前3交易日资金流向；${td}前10交易日涨跌幅；二级行业`
        questions[1] = `${pd1}涨跌幅降序资金流向大单净额；${pd1}收盘价上涨家数占比涨停家数成交量；${td}前1交易日(vol1和vol5和vol10和vol30和vol60)；${td}前1交易日(1日均线和M5和M10和M30和M60)；二级行业`
    } else if (type === 'block-概念') {
        questions[0] = `${td} 09:35涨跌幅降序资金流向大单净额；${td} 09:33涨跌幅资金流向大单净额;${td}涨跌幅;${pd2}涨跌幅成交量大单净额;${td}前3交易日涨跌幅；${td}前3交易日资金流向；${td}前10交易日涨跌幅；概念`
        questions[1] = `${pd1}涨跌幅降序资金流向大单净额；${pd1}收盘价上涨家数占比涨停家数成交量；${td}前1交易日(vol1和vol5和vol10和vol30和vol60)；${td}前1交易日(1日均线和M5和M10和M30和M60)；概念`
    }
    if (nd1) {
        questions[0] = `${nd1}涨跌幅;` + questions[0]
        questions[1] = `${nd1}涨跌幅;` + questions[1]
    }
    if (type === 'stock') {
        let q = `${td} 09:35涨跌幅>0.5;${td}前1交易日(M5和M10和M30和M60)均小于收盘价;${pd1}涨跌幅>4；${pd1}大单净量>0.4大单净额正；${pd1}热度排名升序;行业概念主板创业非ST;`
        questions[0] = q + `${td} 09:35资金流向大单净额；${td} 09:33涨跌幅资金流向大单净额;`
        questions[1] = q + `${pd1}资金流向；${td}涨跌幅;${pd1}市值`
        if (nd1) questions[1] = `${nd1}涨跌幅;` + questions[1]
    }

    return questions
}
