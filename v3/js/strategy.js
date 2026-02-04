// v3 特定策略函数

/**
 * 处理数据并计算基本指标
 */
function handleRate(obj, ele, type, dates) {
    const num = (e) => (e ? Number(Number(e).toFixed(3)) : 0)
    const { td, pd1 } = dates
    let t = type === 'block' ? '指数@' : ''

    // 基础数据
    obj[`${td}`] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${td}]`]),
        资金流向: num(ele[`${t}资金流向[${td}]`]),
        大单净额: num(ele[`${t}dde大单净额[${td}]`]),
        大单净量: num(ele[`${t}大单净量[${td}]`] || ele[`${t}dde大单净量[${td}]`] || 0),
    }

    // 09:35 数据
    obj[`09:35`] = {
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:35]`]),
        资金流向: num(ele[`${t}分时资金流向[${td} 09:35]`]),
        大单净额: num(ele[`${t}分时dde大单净额[${td} 09:35]`]),
    }

    // 09:33 数据
    obj[`09:33`] = {
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
        大单净量: num(ele[`${t}dde大单净量[${pd1}]`] || ele[`${t}分时dde大单净量[${pd1} 15:00]`]),
    }

    // 类型特定数据
    if (type === 'block') {
        obj['指数简称'] = ele['指数简称'] || ''
        obj['板块类别'] = ele['指数@所属同花顺行业级别'] ? '二级行业' : '概念'
    } else {
        obj['股票简称'] = ele['股票简称'] || ''
        obj['行业'] = ele['所属同花顺行业']?.split('-')[1] || ''
        obj['概念'] = ele['所属概念']?.split(';') || []

        obj[pd1]['热度排名'] = ele[`个股热度排名[${pd1}]`]
    }

    obj['code'] = ele['code']
}

/**
 * 查找Block和Stock之间的连接关系
 */
function findConnections(stocks, blocks) {
    const connections = []
    const blockMatchCounts = {} // 统计每个Block配对成功的Stock数量
    const stockMatchCounts = {} // 统计每个Stock配对成功的Block数量
    const seenPairs = new Set() // 用于去重

    // 遍历所有Block和Stock，找出精确匹配
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

                // 记录Block配对次数
                if (!blockMatchCounts[blockName]) {
                    blockMatchCounts[blockName] = 0
                }
                blockMatchCounts[blockName]++

                // 记录Stock配对次数
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

/**
 * 渲染集合图
 */
function renderCollectionChart(stocks, blocks, dates) {
    const chartDiv = document.getElementById('collection-chart')
    if (!chartDiv || !window.echarts) return

    const { td } = dates

    // 准备数据
    const stockData = stocks.map((item) => ({
        name: item['股票简称'],
        value: [item[td]?.涨跌幅 || 0, item[td]?.大单净量 || 0],
        category: 'Stock',
        itemStyle: { color: '#f56c6c' },
        extra: {
            热度排名: item['热度排名'],
            行业: item['行业'],
            概念: item['概念'],
        },
    }))

    const blockData = blocks.map((item) => ({
        name: item['指数简称'],
        value: [item[td]?.涨跌幅 || 0, item[td]?.大单净量 || 0],
        category: 'Block',
        itemStyle: { color: '#67c23a' },
        extra: {
            板块类别: item['板块类别'],
            涨停家数: item['涨停家数'],
            上涨家数占比: item['上涨家数占比'],
        },
    }))

    // 初始化图表
    const chart = echarts.init(chartDiv)

    const option = {
        title: {
            text: 'Block和Stock集合分布图',
            left: 'center',
            top: 10,
            textStyle: {
                fontSize: 18,
                fontWeight: 600,
                color: '#2c3e50',
            },
        },
        tooltip: {
            trigger: 'item',
            formatter: function (params) {
                const data = params.data
                const category = data.category
                let html = `<div style="padding: 8px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${data.name}</div>
                    <div style="color: ${category === 'Stock' ? '#f56c6c' : '#67c23a'}">${category}</div>
                    <div>涨跌幅: ${data.value[0].toFixed(2)}%</div>
                    <div>大单净量: ${data.value[1].toFixed(3)}</div>`

                if (category === 'Stock' && data.extra) {
                    html += `<div>热度排名: ${data.extra.热度排名 || '-'}</div>`
                    html += `<div>行业: ${data.extra.行业 || '-'}</div>`
                    html += `<div>概念: ${data.extra.概念 || '-'}</div>`
                } else if (category === 'Block' && data.extra) {
                    html += `<div>板块类别: ${data.extra.板块类别 || '-'}</div>`
                    html += `<div>涨停家数: ${data.extra.涨停家数 || 0}</div>`
                    html += `<div>上涨占比: ${data.extra.上涨家数占比?.toFixed(2)}%</div>`
                }

                html += '</div>'
                return html
            },
        },
        legend: {
            data: ['Stock', 'Block'],
            top: 45,
            right: 20,
        },
        grid: {
            left: 60,
            right: 20,
            top: 80,
            bottom: 60,
        },
        xAxis: {
            name: '涨跌幅(%)',
            nameLocation: 'middle',
            nameGap: 30,
            type: 'value',
            scale: true,
            splitLine: {
                lineStyle: {
                    type: 'dashed',
                },
            },
        },
        yAxis: {
            name: '大单净量',
            nameLocation: 'middle',
            nameGap: 40,
            type: 'value',
            scale: true,
            splitLine: {
                lineStyle: {
                    type: 'dashed',
                },
            },
        },
        series: [
            {
                name: 'Stock',
                type: 'scatter',
                data: stockData,
                symbolSize: 12,
                itemStyle: {
                    color: '#f56c6c',
                    borderColor: '#fff',
                    borderWidth: 2,
                },
                emphasis: {
                    itemStyle: {
                        color: '#ff8787',
                        borderWidth: 3,
                        shadowBlur: 10,
                        shadowColor: 'rgba(245, 108, 108, 0.5)',
                    },
                },
            },
            {
                name: 'Block',
                type: 'scatter',
                data: blockData,
                symbolSize: 15,
                itemStyle: {
                    color: '#67c23a',
                    borderColor: '#fff',
                    borderWidth: 2,
                },
                emphasis: {
                    itemStyle: {
                        color: '#85ce61',
                        borderWidth: 3,
                        shadowBlur: 10,
                        shadowColor: 'rgba(103, 194, 58, 0.5)',
                    },
                },
            },
        ],
    }

    chart.setOption(option)

    // 响应式
    window.addEventListener('resize', () => {
        chart.resize()
    })

    return chart
}

/**
 * 生成查询问题
 */
function getQuestions(type, datas) {
    const { td, pd1 } = datas
    if (type === 'stock') {
        return [
            `${td}涨跌幅;${pd1}大单净量>0.4；${pd1}涨跌幅>4；${pd1}成交量是5日均量2倍以上；${pd1}大单净额创${pd1}前30交易日新高 ；${pd1}收盘价大于30日均线；${pd1}热度排名升序；主板创业非ST；行业或者概念 `,
        ]
    } else if (type === 'block') {
        return [
            `${td}涨跌幅;${pd1}涨跌幅>1.5；${pd1}大单净量>0.2；${pd1}上涨家数占比>60；${pd1}上涨家数占比增长值>0；${pd1}涨停家数>0；${pd1}收盘价大于30日均线；${td}前3交易日资金流向正；$${td}前10交易日涨幅 < 25；${pd1}涨跌幅降序；二级行业或者概念`,
        ]
    }

    return []
}
