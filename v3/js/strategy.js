// v3 特定策略函数

/**
 * 处理数据并计算基本指标
 */
function handleRate(obj, ele, type, dates) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { nd1, td, pd1 } = dates
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
 * @param {string} type 类型 stock/block
 * @param {object} datas 数据
 * @returns {string[]} 问题数组
 */
function getQuestions(type, datas) {
    const { nd1, td, pd1, isToday } = datas
    let questions = []
    if (type === 'stock') {
        questions[0] = `${td}涨跌幅; ${td} 09:35涨跌幅资金流向大单净额;${pd1}资金流向大单净额；${pd1}大单净量>0.4；${pd1}涨跌幅>4；${pd1}成交量是 5 日均量 2 倍以上；${pd1}大单净额创${pd1}前 30 交易日新高 ；${pd1}收盘价大于 30 日均线；${pd1}热度排名升序；主板创业非 ST；行业或者概念 `
        questions[1] = `${td}涨跌幅; ${td} 09:35涨跌幅资金流向大单净额;${pd1}资金流向大单净额；${pd1}大单净量>0.4；${pd1}涨跌幅>4；${pd1}收盘价大于 60 日均线；${pd1}热度排名前 250；主板创业非 ST；行业或者概念 `

        if (nd1) {
            questions[0] = `${nd1}涨跌幅;` + questions[0]
            questions[1] = `${nd1}涨跌幅;` + questions[1]
        }
    } else if (type === 'block') {
        questions[0] = `${td}涨跌幅;${td} 09:35涨跌幅资金流向大单净额;${td} 09:33资金流向大单净额;${pd1}资金流向大单净额涨跌幅；${pd1}大单净量>0.2；${pd1}上涨家数占比>60；${pd1}涨停家数>0；${pd1}收盘价大于 30 日均线；${td}前 3 交易日资金流向正；${td}前 10 交易日涨幅<25`
        questions[1] = `${td}涨跌幅;${td} 09:35涨跌幅资金流向大单净额;${td} 09:33资金流向大单净额;${pd1}涨跌幅>1.5；${pd1}大单净量；${pd1}上涨家数占比>60；${pd1}涨停家数>0；${pd1}收盘价大于 60 日均线；${pd1}资金流向大单净额正`
        if (nd1) {
            questions[0] = `${nd1}涨跌幅;` + questions[0]
            questions[1] = `${nd1}涨跌幅;` + questions[1]
        }
    }

    return questions
}

/**
 * 查找 Block 和 Stock 之间的连接关系
 */
function findConnections(stocks, blocks) {
    const connections = []
    const blockMatchCounts = {} // 统计每个 Block 配对成功的 Stock 数量
    const stockMatchCounts = {} // 统计每个 Stock 配对成功的 Block 数量
    const seenPairs = new Set() // 用于去重

    // 遍历所有 Block 和 Stock，找出精确匹配
    blocks.forEach((block) => {
        const blockName = block['指数简称']
        if (!blockName) return

        stocks.forEach((stock) => {
            const stockName = stock['股票简称']
            const industry = stock['行业'] || ''
            const concepts = stock['概念'] || []

            // 检查是否精确匹配
            let matchType = null

            // 检查行业匹配（字符串精确匹配）
            if (industry === blockName) {
                matchType = '行业'
            }
            // 检查概念匹配（数组包含匹配）
            else if (Array.isArray(concepts) && concepts.includes(blockName)) {
                matchType = '概念'
            }

            // 如果找到匹配
            if (matchType) {
                // 检查是否已存在相同的配对
                const pairKey = `${blockName}-${stockName}`
                if (seenPairs.has(pairKey)) return
                seenPairs.add(pairKey)

                // 记录 Block 配对次数
                if (!blockMatchCounts[blockName]) {
                    blockMatchCounts[blockName] = 0
                }
                blockMatchCounts[blockName]++

                // 记录 Stock 配对次数
                if (!stockMatchCounts[stockName]) {
                    stockMatchCounts[stockName] = 0
                }
                stockMatchCounts[stockName]++

                // 添加到连接列表
                connections.push({
                    blockName: blockName,
                    stockName: stockName,
                    matchType: matchType,
                    blockMatchCount: blockMatchCounts[blockName], // 临时值，后面会更新
                    stockMatchCount: stockMatchCounts[stockName], // 临时值，后面会更新
                })
            }
        })
    })

    // 更新最终的配对次数
    connections.forEach((conn) => {
        conn.blockMatchCount = blockMatchCounts[conn.blockName]
        conn.stockMatchCount = stockMatchCounts[conn.stockName]
    })

    return connections
}
