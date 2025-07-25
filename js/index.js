const { createApp, onMounted, onUnmounted, ref, reactive } = Vue
const { ElNotification } = ElementPlus

//日期时间相关
const Dates = reactive({
    baseUrl: 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=',
    DateList: [],
    shareDate: { TimeTilArr: ['-', `09:35`, `09:33`, `09:31`, `09:30`, '-'] },
    keyDate: '',
    SelectedDate: '',
    disabledDate: (time) => {
        const minDate = new Date('2021-01-01')
        const maxDate = new Date()
        const week = time.getDay() // 周六是6，周日是0
        return (
            time.getTime() > maxDate.getTime() ||
            time.getTime() < minDate.getTime() ||
            week === 6 ||
            week === 0 ||
            !Dates.DateList.includes(dayjs(time).format('YYYYMMDD'))
        )
    },
    getDateList: async () => {
        const FD = (await getLocalStorage('FinalOperatingState')) || {
            searchDate: '', //查询的历史日期
            TradingDay: [], //历史可交易日组
            updateTradingDay: '', //上次请求可交易日期时间
        }
        let { baseUrl, SelectedDate } = Dates
        const oldYear = 2021,
            newyYear = Number(dayjs().format('YYYY')) + 1
        // 第一次请求获取[2021至今]历史所有数据 每年余量270day,之后每天请求一次当年数据
        let url = `${baseUrl}sh000001,day,,,320,qfq`
        if (FD.TradingDay.length == 0) {
            url = `${baseUrl}sh000001,day,,,${Number((newyYear - oldYear) * 270)},qfq`
        } else {
            let sd = dayjs(SelectedDate || new Date()).format('YYYYMMDD')
            if (SelectedDate != '' && sd != dayjs().format('YYYYMMDD') && FD.TradingDay.includes(sd)) {
                Dates.DateList = [...FD.TradingDay]
                Dates.keyDate = FD.keyDate
                return
            }
        }
        let { status, data } = await axios({ method: 'get', url })
        if (status == 200 && data) {
            let d = JSON.parse(data.replace('kline_dayqfq=', '')).data
            if (d && d.sh000001 && d.sh000001.day.length > 0) {
                let mt = d.sh000001.qt.market[0].split('|')
                d = d.sh000001.day.map((e) => dayjs(e[0]).format('YYYYMMDD'))
                if (mt[2].includes('open')) d.push(dayjs().format('YYYYMMDD'))
                FD.TradingDay = Dates.DateList = [...new Set([...FD.TradingDay, ...d])]
                if (dayjs(SelectedDate).format('YYYYMMDD') == '20221121') FD.keyDate = '20221121'
                if (FD.keyDate) Dates.keyDate = FD.keyDate
                setLocalStorage('FinalOperatingState', FD)
            }
        }
    },
    setShareDate: () => {
        let l = Dates.DateList
        let td = dayjs(Dates.SelectedDate || new Date()).format('YYYYMMDD')
        let pd1 = l[l.findIndex((el) => el == td) - 1]
        Dates.shareDate = {
            nd1: l[l.findIndex((el) => el == td) + 1],
            nd2: l[l.findIndex((el) => el == td) + 2],
            td,
            pd1,
            pd2: l[l.findIndex((el) => el == td) - 2],
            pd3: l[l.findIndex((el) => el == td) - 3],
            tdcn: dayjs(Dates.SelectedDate || new Date()).format('YYYY年MM月DD日'),
            TimeTilArr: [td, `09:35`, `09:33`, `09:31`, `09:30`, pd1],
        }
    },
})

//查询问题相关
const text0 = '涨跌幅降序资金流向大单净额收盘价'
const text1 = '前1交易日(vol1和vol5和vol10和vol30和vol60)'
const text2 = '前1交易日(1日均线和M5和M10和M30和M60)'
const textA = `当日涨跌幅资金流向大单净额收盘价;09:30涨跌幅；09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35${text0}；前1交易日涨停家数；前1交易日上涨家数占比`
const textB = `当日涨跌幅;09:35涨跌幅降序；${text1}；${text2}；前1交易日开盘价前1交易日收盘价;前1交易日15:00涨跌幅资金流向大单净额；`
const Questions = {
    block: [`${textA}二级行业`, `${textB}二级行业`, `${textA}概念`, `${textB}概念`],
    stock: [
        `当日涨跌幅资金流向大单净额收盘价；09:30涨跌幅；前1交易日热度排名升序当日热度排名流通市值；前1交易日涨跌幅资金流向大单净额rsi12;前2交易日涨跌幅大单净额macd；主板创业非ST；行业概念`,
        `前1交易日热度排名升序前40交易日区间最高价不复权;09:31涨跌幅资金流向大单净额；09:33涨跌幅资金流向大单净额；09:35涨跌幅资金流向大单净额股价；前3交易日涨跌幅macd；前1交易日涨停价；行业概念`,
        `前1交易日热度排名升序；${text1}；${text2}；后2交易日涨跌幅;前1交易日开盘价前1交易日收盘价macd;行业概念`,
        `前1交易日热度排名升序；前5交易日的涨停次数;前15交易日的涨停次数;行业概念`, //原因1：2025-07-22 股票代码 002654 股票名称 华宏科技  前面连扳，小长期涨幅太高，接盘亏钱，所以不买入15天有超过3个涨停的股票！
        //原因2：2025-06-12 股票代码 003040 股票名称 楚 天 龙  前面连扳，近短期涨幅太高，接盘亏钱，所以也不买入5天有超过2个涨停的股票！
    ],
}

//指数板块相关
const Blocks = reactive({
    isCache: false,
    timer: undefined,
    run: () => {
        if (!Blocks.timer) {
            Blocks.timer = setInterval(() => {
                Submit(1)
            }, 50000)
        } else {
            clearInterval(Blocks.timer)
            Blocks.timer = undefined
        }
    },
    loading: false,
    setCache: async (e) => {
        let logName = 'FetchLog-Blocks-' + Dates.shareDate.tdcn.slice(0, 5)
        let logValue = (await getLocalStorage(logName)) || {}
        if (e == 'clean') {
            delete logValue[`${Dates.shareDate.tdcn}-Blocks-${Blocks.RateSort_selected}`]
            Blocks.isCache = false
            Blocks.requestStatus = []
        } else {
            logValue[`${Dates.shareDate.tdcn}-Blocks-${Blocks.RateSort_selected}`] = e
        }
        setLocalStorage(logName, logValue)
    },
    checkboxList: [
        { name: '长期趋势', model: true },
        { name: '昨日趋势', model: true },
        { name: '今日趋势', model: true },
        { name: '特殊趋势', model: false },
    ],
    CheckedOptimumFN: () => {
        Blocks.Data = Blocks.Data.map((el) => {
            el.default = el.base
            return el
        })
        // debugger
        if (Blocks.checkboxList[3].model == true) {
            //特殊趋势操作
            Blocks.checkboxList[0].model = false
            Blocks.checkboxList[1].model = false
            Blocks.checkboxList[2].model = false
            Stocks.checkboxList[3].model = true // 同步Stocks的特殊趋势
            Stocks.checkboxList[0].model = false
            Stocks.checkboxList[1].model = false
            Stocks.checkboxList[2].model = false
        } else {
            Stocks.checkboxList[3].model = false
            Stocks.checkboxList[0].model = true
            Stocks.checkboxList[1].model = true
            Stocks.checkboxList[2].model = true
        }

        Blocks.checkboxList.forEach((item) => {
            if (item.model) {
                Blocks.Data = Blocks.Data.map((el) => {
                    el.default = el.default.filter((ele) => ele[item.name])
                    return el
                })
            }
        })
    },
    checked: { type: '-', name: '-', item: null },
    headerData: [],
    Data: [
        { name: '实时行业策略排行', base: [], default: [] },
        { name: '实时行业概念排行', base: [], default: [] },
    ],
    requestStatus: [],
    updateRequestStatus: (index, status, message) => {
        Blocks.requestStatus[index] = {
            name: index + 1,
            status,
            message,
        }
    },
    RateSort: (e, i) => {
        if (i < 2 || i > 6) return
        Questions.block = Questions.block.map((el) => {
            el = el.replaceAll('涨跌幅降序', '涨跌幅')
            return el
        })
        if (e == '09:35' || e == '09:33' || e == '09:31') {
            Questions.block = Questions.block.map((el) => {
                el = el.replaceAll(e + '涨跌幅', e + '涨跌幅降序')
                return el
            })
        } else {
            Questions.block = Questions.block.map((el) => {
                el = el.replaceAll('当日涨跌幅', '当日涨跌幅降序')
                return el
            })
        }
        Blocks.RateSort_selected = e
        beforeSubmitBlocks()
    },
    RateSort_selected: '09:35',
})
//个股相关
const Stocks = reactive({
    isCache: false,
    loading: false,
    setCache: async (e) => {
        let logName = 'FetchLog-Stocks-' + Dates.shareDate.tdcn.slice(0, 5)
        let logValue = (await getLocalStorage(logName)) || {}
        if (e == 'clean') {
            delete logValue[`${Dates.shareDate.tdcn}-Stocks-${Blocks.checked.name}`]
            Stocks.isCache = false
            Stocks.requestStatus = []
        } else {
            logValue[`${Dates.shareDate.tdcn}-Stocks-${Blocks.checked.name}`] = e
        }
        setLocalStorage(logName, logValue)
    },
    headerData: [],
    Data: [{ name: '实时策略', base: [], default: [] }],
    checkboxList: [
        { name: '长期趋势', model: true },
        { name: '昨日趋势', model: true },
        { name: '今日趋势', model: true },
        { name: '特殊趋势', model: false },
    ],
    CheckedOptimumFN: () => {
        Stocks.Data = Stocks.Data.map((el) => {
            el.default = el.base
            return el
        })
        Stocks.checkboxList.forEach((item) => {
            if (item.model) {
                Stocks.Data = Stocks.Data.map((el) => {
                    el.default = el.default.filter((ele) => ele[item.name])
                    return el
                })
            }
        })
    },
    openUrl: (e) => {
        window.open(e)
    },
    hoverBlocks: [],
    handleMouseOver: (e) => {
        Stocks.hoverBlocks = [e['行业'] && e['行业'].split('-')[1], e['行业'], ...e['概念'].split(';')]
    },
    handleMouseLeave: () => {
        Stocks.hoverBlocks = []
    },
    mySort: (ea, eb) => {
        Stocks.Data[0].base = Stocks.Data[0].base.sort((a, b) => {
            if (ea && eb) {
                return b[ea][eb] - a[ea][eb]
            } else {
                if (ea == '昨热度排名' || ea == '今热度排名') return a[ea] - b[ea]
                return b[ea] - a[ea]
            }
        })
        Stocks.CheckedOptimumFN()
        Stocks.Sort_selected = [ea, eb ? eb : null]
    },
    Sort_selected: ['昨热度排名', null],
    requestStatus: [],
    updateRequestStatus: (index, status, message) => {
        Stocks.requestStatus[index] = {
            name: index + 1,
            status,
            message,
        }
    },
})
//防爬虫点击验证
let goToTHSUrl_flag = false
function goToTHSUrl() {
    if (goToTHSUrl_flag) return
    window.open(
        decodeURIComponent(
            'https://www.iwencai.com/unifiedwap/result?w=%E6%94%BE%E9%87%8F%E6%B6%A8%E8%B7%8C%E5%B9%85%E6%AD%A3%E4%B8%94%28M5%E5%92%8CM10%E5%92%8CM30%E5%92%8CM60%29%E5%9D%87%E5%B0%8F%E4%BA%8E%E6%94%B6%E7%9B%98%E4%BB%B7%EF%BC%9B%E6%B6%A8%E8%B7%8C%E5%B9%85%E9%99%8D%E5%BA%8F%E8%B5%84%E9%87%91%E6%B5%81%E5%90%91%E5%A4%A7%E5%8D%95%E5%87%80%E9%A2%9D%E6%AD%A39%3A35%E6%B6%A8%E8%B7%8C%E5%B9%85%E8%B5%84%E9%87%91%E6%B5%81%E5%90%91%E5%A4%A7%E5%8D%95%E5%87%80%E9%A2%9D9%3A33%E6%B6%A8%E8%B7%8C%E5%B9%85%E8%B5%84%E9%87%91%E6%B5%81%E5%90%91%E5%A4%A7%E5%8D%95%E5%87%80%E9%A2%9D9%3A31%E6%B6%A8%E8%B7%8C%E5%B9%85%E8%B5%84%E9%87%91%E6%B5%81%E5%90%91%E5%A4%A7%E5%8D%95%E5%87%80%E9%A2%9D%EF%BC%9B9%3A35%E6%B6%A8%E8%B7%8C%E5%B9%85%EF%BC%9B%E8%A1%8C%E4%B8%9A%E6%88%96%E8%80%85%E6%A6%82%E5%BF%B5&querytype=zhishu&addSign=1726739477376'
        ),
        '_blank'
    )
    goToTHSUrl_flag = true
    clearInterval(Blocks.timer)
    Blocks.timer = undefined
}

//-----------------------------
async function Submit(direction, catche) {
    if (Blocks.loading) return
    await Dates.getDateList()
    let directionDate = dayjs(Dates.SelectedDate || new Date()).format('YYYYMMDD')
    let DateList = Dates.DateList
    let m_SelectedDate = dayjs(Dates.SelectedDate || new Date()).format('YYYYMMDD')
    if (catche) {
        DateList = [
            ...(await getLocalStorage('FetchLog-Blocks-Click-2021年')),
            ...(await getLocalStorage('FetchLog-Blocks-Click-2022年')),
            ...(await getLocalStorage('FetchLog-Blocks-Click-2023年')),
            ...(await getLocalStorage('FetchLog-Blocks-Click-2024年')),
            ...(await getLocalStorage('FetchLog-Blocks-Click-2025年')),
        ]
        if (Dates.SelectedDate && DateList.includes(m_SelectedDate)) {
            directionDate = m_SelectedDate
        } else {
            directionDate = DateList[DateList.length - 1]
        }
    }
    if (direction == -1) {
        Dates.SelectedDate = DateList[DateList.findIndex((el) => el == directionDate) - 1]
    } else if (direction == 1) {
        Dates.SelectedDate = DateList[DateList.findIndex((el) => el == directionDate) + 1]
    }
    if (catche && !DateList.includes(m_SelectedDate)) Dates.SelectedDate = DateList[DateList.length - 1]

    Dates.setShareDate()
    let D = Dates.shareDate
    let VolumePriceArr = ['M05', 'M10', 'M30', 'M60']
    Blocks.headerData = ['序号', '指数简称', ...D.TimeTilArr, ...VolumePriceArr]
    Stocks.headerData = [
        '序号',
        'code',
        '股票简称',
        '流通市值',
        '股价',
        '行业',
        '昨热度排名',
        '今热度排名',
        '概念',
        ...D.TimeTilArr,
        ...VolumePriceArr,
        '后2日',
        '前40日',
    ]
    Blocks.Data = Blocks.Data.map((el) => {
        el.default = []
        return el
    })
    Stocks.Data = Stocks.Data.map((el) => {
        el.default = []
        return el
    })
    // 清除个股表格的请求状态
    Stocks.requestStatus = []
    Stocks.isCache = false

    // if (!Dates.keyDate) return ElNotification({ title: 'key error', type: 'error' })
    beforeSubmitBlocks()
}
async function beforeSubmitBlocks() {
    Blocks.isCache = false
    Blocks.requestStatus = [] // 清空请求状态
    // //判断入口来源 当日查询 历史查询
    if (dayjs(Dates.SelectedDate || new Date()).format('YYYYMMDD') == dayjs(new Date()).format('YYYYMMDD')) {
        SubmitBlocks(Questions.block)
    } else {
        //是否存在历史缓存数据
        let logName = 'FetchLog-Blocks-' + Dates.shareDate.tdcn.slice(0, 5)
        let logValue = (await getLocalStorage(logName)) || {}
        let { tdcn, td } = Dates.shareDate
        let res = logValue[`${tdcn}-Blocks-${Blocks.RateSort_selected}`]
        if (res && res.length > 0) {
            //使用缓存数据
            Blocks.isCache = true
            handleBlocksData(res)
        } else {
            //处理Questions
            let newQ_block = Questions.block.map((el) => {
                return el
                    .replaceAll('当日', td)
                    .replaceAll('09:', tdcn + '09:')
                    .replaceAll('前1交易日', tdcn + '前1交易日')
                    .replaceAll('流通市值', tdcn + '流通市值')
            })
            SubmitBlocks(newQ_block, '缓存')
        }
    }
}
//获取板块数据
async function SubmitBlocks(block, catche) {
    if (Blocks.loading) return
    Blocks.loading = true

    try {
        // 初始化请求状态
        if (!catche) {
            Blocks.requestStatus = block.map((_, index) => ({
                name: ['行业策略排行', '行业概念排行', '概念策略排行', '概念概念排行'][index],
                status: 'pending',
                message: '请求中...',
            }))
        }

        const requests = block.map((el) => axios(handle_requestsData('zhishu', el)))
        const responses = await Promise.allSettled(requests)

        const successResponses = []
        const failedRequests = []

        responses.forEach((response, index) => {
            const data = response.value?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
            if (response.status === 'fulfilled' && Array.isArray(data) && data.length > 0) {
                successResponses.push(data)
                if (!catche) {
                    Blocks.updateRequestStatus(index, 'success', `请求成功 (${data.length}条数据)`)
                }
            } else {
                failedRequests.push(block[index])
                if (!catche) {
                    Blocks.updateRequestStatus(index, 'error', '请求失败: 数据无效或为空')
                }
            }
        })

        if (failedRequests.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000))

            // 更新失败请求的状态为重试中
            if (!catche) {
                failedRequests.forEach((_, index) => {
                    const originalIndex = block.indexOf(failedRequests[index])
                    Blocks.updateRequestStatus(originalIndex, 'pending', '重试中...')
                })
            }

            const retryRequests = failedRequests.map((el) => axios(handle_requestsData('zhishu', el)))
            const retryResponses = await Promise.allSettled(retryRequests)

            retryResponses.forEach((response, index) => {
                const originalIndex = block.indexOf(failedRequests[index])
                const data = response.value?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                if (response.status === 'fulfilled' && Array.isArray(data) && data.length > 0) {
                    successResponses.push(data)
                    if (!catche) {
                        Blocks.updateRequestStatus(originalIndex, 'success', `重试成功 (${data.length}条数据)`)
                    }
                } else {
                    if (!catche) {
                        Blocks.updateRequestStatus(originalIndex, 'error', '重试失败: 数据无效或为空')
                    }
                }
            })

            if (successResponses.length < block.length) {
                throw new Error(`部分请求失败，成功: ${successResponses.length}/${block.length}`)
            }
        }

        if (catche) Blocks.setCache(successResponses)
        handleBlocksData(successResponses)
    } catch (err) {
        ElNotification({
            title: '请求失败',
            message: err.message,
            type: 'error',
        })
        goToTHSUrl()
    } finally {
        Blocks.loading = false
    }
}
//处理板块数据
async function handleBlocksData(res) {
    function handleArr(arr1, arr2) {
        let { td, pd1 } = Dates.shareDate
        let resArr = []
        arr1.forEach((el) => {
            let foundItem2 = arr2.find((ele) => ele['指数简称'] == el['指数简称'])
            if (foundItem2) resArr.push(Object.assign({}, el, foundItem2))
        })
        return resArr
            .map((ele, idx) => {
                let obj = {}
                obj['序号'] = idx + 1
                obj['code'] = ele['code']
                obj['指数简称'] = ele['指数简称']
                obj['板块类别'] = ele['指数@所属同花顺行业级别'] ? '二级行业' : '概念'
                obj['昨日涨停数'] = ele[`指数@涨停家数[${pd1}]`] || 0
                obj['昨日上涨比'] = ele[`指数@上涨家数占比[${pd1}]`] || 0

                handleVM(obj, ele, 'block', pd1)
                handleRate(obj, ele, 'block', td, pd1)

                let 涨跌35 = obj['09:35']['涨跌幅']
                //获取昨日涨跌幅排名
                let 涨幅text = `指数@分时涨跌幅:前复权[${pd1} 15:00]`
                let 昨日涨幅 = num(ele[涨幅text])
                let 昨日涨停数 = ele[`指数@涨停家数[${pd1}]`]
                let 昨日涨跌幅排名 =
                    [...resArr]
                        .sort((a, b) => num(b[涨幅text]) - num(a[涨幅text]))
                        .findIndex((e) => e['指数简称'] == obj['指数简称']) + 1
                let 大单净额text = `指数@分时dde大单净额[${pd1} 15:00]`
                let 昨日大单净额 = num(ele[大单净额text])
                let 昨日大单净额排名 =
                    [...resArr]
                        .sort((a, b) => num(b[大单净额text]) - num(a[大单净额text]))
                        .findIndex((e) => e['指数简称'] == obj['指数简称']) + 1
                // 1. 主力资金介入（必要条件） 大单净流入值 > 0
                // 2. 涨跌幅排名（核心指标）强势市场（大盘指数涨幅 > 0.5%）：板块涨幅排名 前10%(二级行业目前总数90个，前10%为9个；概念目前总数397个，前10%为40个)
                // 3. 涨停数量（动态要求）强势市场：板块内涨停个股 ≥ 1只（需真实封板，非炸板）；弱势市场：允许涨停数量 = 0，但需满足：板块内涨幅TOP3个股平均涨幅 ≥ 5%；板块内无个股跌停。

                // if (obj['指数简称'] == '雅下水电概念') debugger

                let 长期趋势 = false
                if (obj['v60达成'] && obj['M60达成']) 长期趋势 = true
                if (昨日涨幅 > 5 && ((obj['M10达成'] && obj['v10达成']) || (obj['M60'] == '-' && obj['v60'] == '-'))) {
                    长期趋势 = true // 2025-07-22 指数长期趋势补充条件
                }

                let 昨日趋势 = false
                if (昨日大单净额 > 0 && 昨日涨幅 > 1 && 昨日涨停数 > 0) {
                    let a1 = Number(昨日涨幅 > 1.5)
                    let a2 = Number(昨日大单净额排名 <= 5)
                    let a3 = Number(昨日涨跌幅排名 <= 10)

                    if (
                        obj['板块类别'] == '二级行业' &&
                        a1 + a2 + a3 >= 2 &&
                        (昨日涨跌幅排名 <= 5 || obj['昨日上涨比'] >= 70)
                    ) {
                        昨日趋势 = true
                    }
                    let b1 = Number(昨日涨幅 > 2)
                    let b2 = Number(昨日大单净额排名 <= 20)
                    let b3 = Number(昨日涨跌幅排名 <= 40)
                    if (
                        obj['板块类别'] == '概念' &&
                        b1 + b2 + b3 >= 2 &&
                        (昨日涨跌幅排名 <= 10 || obj['昨日上涨比'] >= 70)
                    ) {
                        昨日趋势 = true
                    }
                }

                let 今日趋势 = false
                if (涨跌35 >= 0.5 && obj['序号'] <= 20) 今日趋势 = true
                if (涨跌35 >= 1.0 && obj['序号'] <= 40) 今日趋势 = true
                if (涨跌35 >= 1.5) 今日趋势 = true
                if (
                    (obj['09:35']['大单净额'] < 0 && obj['09:35']['资金流向'] < 0) ||
                    (obj['09:33']['大单净额'] < 0 && obj['09:33']['资金流向'] < 0) ||
                    (obj['09:31']['大单净额'] < 0 && obj['09:31']['资金流向'] < 0)
                ) {
                    if (obj['板块类别'] == '二级行业' && 昨日涨跌幅排名 > 5 && 昨日大单净额排名 > 5) {
                        今日趋势 = false
                    }
                    if (obj['板块类别'] == '概念' && 昨日涨跌幅排名 > 5 && 昨日大单净额排名 > 5) {
                        今日趋势 = false
                    }
                }
                let 特殊趋势 = false
                if (涨跌35 > 3 && obj['09:35']['大单净额'] > 0) {
                    特殊趋势 = true // 2025-07-22 指数趋势补充条件
                }

                obj['长期趋势'] = Boolean(长期趋势)
                obj['昨日趋势'] = Boolean(昨日趋势)
                obj['今日趋势'] = Boolean(今日趋势)

                obj['特殊趋势'] = Boolean(特殊趋势)

                return obj
            })
            .filter((el) => {
                // 过滤名称为：科创次新股
                return el['指数简称'] === '科创次新股' ? false : true
            })
    }
    Blocks.Data[0].base = handleArr(res[0], res[1])
    Blocks.Data[1].base = handleArr(res[2], res[3])
    Blocks.loading = false
    Blocks.CheckedOptimumFN()
    Blocks.checked = { type: '-', name: '-', item: null }
    Stocks.Data = [{ name: '实时策略', base: [], default: [] }]
    BlocksClickauto()
}
//点击选中板块
async function CheckedBlock(type, name, item = null) {
    if (Blocks.loading) return
    Stocks.Data = [{ name: '实时策略', base: [], default: [] }]
    Stocks.isCache = false
    Blocks.checked.type = type ? type : '-'
    Blocks.checked.name = name ? name : '-'
    Blocks.checked.item = item
    // 重置Stocks的筛选状态
    Stocks.checkboxList.forEach((item) => {
        item.model = true
    })
    if (Blocks.checkboxList[3].model == true) {
        //特殊趋势操作
        Stocks.checkboxList[0].model = false
        Stocks.checkboxList[1].model = false
        Stocks.checkboxList[2].model = false
        Stocks.checkboxList[3].model = true // 同步Stocks的特殊趋势状态
    }else {
        //特殊趋势操作
        Stocks.checkboxList[0].model = true
        Stocks.checkboxList[1].model = true
        Stocks.checkboxList[2].model = true
        Stocks.checkboxList[3].model = false // 同步Stocks的特殊趋势状态
    }

    // //判断入口来源 当日查询 历史查询
    let { tdcn, nd1, nd2 } = Dates.shareDate
    if (dayjs(Dates.SelectedDate || new Date()).format('YYYYMMDD') == dayjs(new Date()).format('YYYYMMDD')) {
        SubmitStocks(Questions.stock, type, name, item)
    } else {
        //是否存在历史缓存数据
        let logName = 'FetchLog-Stocks-' + Dates.shareDate.tdcn.slice(0, 5)
        let logValue = (await getLocalStorage(logName)) || {}
        let d = logValue[`${tdcn}-Stocks-${name}`]
        if (d && d.length > 0) {
            //使用缓存数据
            Stocks.isCache = true
            handleStocksData(d, item, type, name)
        } else {
            //处理Questions
            let newQ_stock = Questions.stock.map((el) => {
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
                return el
            })
            SubmitStocks(newQ_stock, type, name, item, '缓存')
        }
    }
}
//获取个股数据
async function SubmitStocks(stock, blockType, blockName, blockItem, catche) {
    if (Stocks.loading) return
    Stocks.loading = true

    try {
        // 初始化请求状态
        Stocks.requestStatus = stock.map((_, index) => ({
            name: `个股数据请求 ${index + 1}`,
            status: 'pending',
            message: '请求中...',
        }))

        const { pd2, pd3 } = Dates.shareDate
        const requests = stock.map((el) => {
            let _name = blockName
            if (blockType === '概念') {
                _name = _name.replace('封装光学(CPO)', '封装光学').replace('IP经济(谷子经济)', '谷子经济')
                el = el.replace('行业概念', `行业概念；所属概念包含${_name}；`)
            } else if (blockType === '行业') {
                el = el.replace('行业概念', `概念；所属二级行业包含${_name}；`)
            }
            el = el.replaceAll('前2交易日', pd2).replaceAll('前3交易日', pd3)
            return axios(handle_requestsData('stock', el))
        })

        const responses = await Promise.allSettled(requests)

        const successResponses = []
        const failedRequests = []

        responses.forEach((response, index) => {
            const data = response.value?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
            if (response.status === 'fulfilled' && Array.isArray(data) && data.length > 0) {
                successResponses.push(data)
                Stocks.updateRequestStatus(index, 'success', `请求成功 f'v(${data.length}条数据)`)
            } else {
                if (
                    response.status === 'fulfilled' &&
                    stock[index].includes('涨停次数') &&
                    Array.isArray(data) &&
                    data.length == 0
                ) {
                    // 特殊处理：如果请求的是涨停次数且数据为空，则可以认为是成功
                    successResponses.push(data)
                    Stocks.updateRequestStatus(index, 'success', `请求成功 (${data.length}条数据)`)
                } else {
                    failedRequests.push(stock[index])
                    Stocks.updateRequestStatus(index, 'error', '请求失败: 数据无效或为空')
                }
            }
        })

        if (failedRequests.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000))

            // 更新失败请求的状态为重试中
            failedRequests.forEach((_, index) => {
                const originalIndex = stock.indexOf(failedRequests[index])
                Stocks.updateRequestStatus(originalIndex, 'pending', '重试中...')
            })

            const retryRequests = failedRequests.map((el) => {
                let _name = blockName
                if (blockType === '概念') {
                    _name = _name.replace('封装光学(CPO)', '封装光学').replace('IP经济(谷子经济)', '谷子经济')
                    el = el.replace('行业概念', `行业概念；所属概念包含${_name}；`)
                } else if (blockType === '行业') {
                    el = el.replace('行业概念', `概念；所属二级行业包含${_name}；`)
                }
                el = el.replaceAll('前2交易日', pd2).replaceAll('前3交易日', pd3)
                return axios(handle_requestsData('stock', el))
            })

            const retryResponses = await Promise.allSettled(retryRequests)

            retryResponses.forEach((response, index) => {
                const originalIndex = stock.indexOf(failedRequests[index])
                const data = response.value?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                if (response.status === 'fulfilled' && Array.isArray(data) && data.length > 0) {
                    successResponses.push(data)
                    Stocks.updateRequestStatus(originalIndex, 'success', `重试成功 (${data.length}条数据)`)
                } else {
                    Stocks.updateRequestStatus(originalIndex, 'error', '重试失败: 数据无效或为空')
                }
            })

            if (successResponses.length < stock.length) {
                throw new Error(`部分请求失败，成功: ${successResponses.length}/${stock.length}`)
            }
        }

        if (catche) Stocks.setCache(successResponses)
        handleStocksData(successResponses, blockItem, blockType, blockName)
    } catch (err) {
        ElNotification({
            title: '请求失败',
            message: err.message,
            type: 'error',
        })
        goToTHSUrl()
    } finally {
        Stocks.loading = false
    }
}
//处理个股数据
async function handleStocksData(res, blockItem, blockType, blockName) {
    let { td, pd1, pd2, pd3, nd1, nd2 } = Dates.shareDate
    const num = (e) => (e ? Number(Number(e).toFixed(2)) : 0)

    // 确保res数组中的每个元素都是有效的
    if (!Array.isArray(res) || res.length === 0) {
        console.error('Invalid response data:', res)
        return
    }

    // 创建数据映射以提高查找效率
    const dataMap1 = new Map(res[1]?.map((item) => [item['股票简称'], item]) || [])
    const dataMap2 = new Map(res[2]?.map((item) => [item['股票简称'], item]) || [])
    const dataMap3 = new Map(res[3]?.map((item) => [item['股票简称'], item]) || [])
    let ztArr = 0 // 涨停符合数
    let _0935zhang = 0 // 0935涨跌幅>0

    Stocks.Data[0].base = res[0]
        .map((ele) => {
            // 使用Map进行数据查找和合并
            const match1 = dataMap1.get(ele['股票简称']) || {}
            const match2 = dataMap2.get(ele['股票简称']) || {}
            const match3 = dataMap3.get(ele['股票简称']) || {}

            // 合并数据，确保不会覆盖原始数据
            return {
                ...ele,
                ...match1,
                ...match2,
                ...match3,
            }
        })
        .map((ele, idx) => {
            let obj = ele
            let t = ''
            let rate = num(ele[`${t}涨跌幅:前复权[${pd1}]`] || ele[`${t}分时涨跌幅:前复权[${pd1} 15:00]`])
            obj['涨停'] = ele[`涨停价[${pd1}]`] == ele[`收盘价:不复权[${pd1}]`] && rate >= 9.5
            if (obj['涨停']) ztArr++
            if (num(ele[`${t}分时涨跌幅:前复权[${td} 09:35]`]) > 0) _0935zhang++ // 统计0935涨跌幅>0的个股
            return obj
        })
        .map((ele, idx) => {
            let obj = {}
            obj['序号'] = idx + 1
            obj['股票简称'] = ele['股票简称']
            obj['code'] = ele['code']
            obj['行业'] = ele['所属同花顺行业'] || ele['所属同花顺二级行业']
            obj['概念'] = ele['所属概念']
            obj['昨热度排名'] = ele[`个股热度排名[${pd1}]`]
            obj['今热度排名'] = ele[`个股热度排名[${td}]`]
            obj['流通市值'] = ele[`a股市值(不含限售股)[${td}]`]
            obj['股价'] = Number(ele[`收盘价:不复权[${td}]`] || ele[`最新价`])
            obj['涨停'] = ele['涨停']
            obj['前5涨停数'] = getLimitUpArrayDynamic(ele)[1] || 0 // 获取前5日涨停数
            obj['前15涨停数'] = getLimitUpArrayDynamic(ele)[0] || 0 // 获取前15日涨停数
            // 确保MACD数据存在且为数字
            obj['macd'] = {
                pd1: Number(Number(ele[`macd(macd值)[${pd1}]`] || 0).toFixed(2)),
                pd2: Number(Number(ele[`macd(macd值)[${pd2}]`] || 0).toFixed(2)),
                pd3: Number(Number(ele[`macd(macd值)[${pd3}]`] || 0).toFixed(2)),
            }

            handleVM(obj, ele, 'stock', pd1)
            handleRate(obj, ele, 'stock', td, pd1)

            // 确保历史数据存在
            obj[pd2] = {
                涨跌幅: num(ele[`涨跌幅:前复权[${pd2}]`]),
                大单净额: num(ele[`dde大单净额[${pd2}]`]),
            }
            obj[pd3] = {
                涨跌幅: num(ele[`涨跌幅:前复权[${pd3}]`]),
            }

            // 处理未来数据
            obj['后2日'] = [num(ele[`涨跌幅:前复权[${nd1}]`]), num(ele[`涨跌幅:前复权[${nd2}]`])]

            // 处理区间最高价
            const 最高价Keys = findKeysWithPattern(ele, '区间最高价:不复权[', ']')
            let 区间最高价 = 最高价Keys.length > 0 ? Number(ele[最高价Keys[0]]) : 0
            let _35收盘价 = ele[`分时收盘价:不复权[${td} 09:35]`]
            obj['前40日'] = _35收盘价 ? Number(_35收盘价) >= 区间最高价 : obj['股价'] >= 区间最高价
            //---------------------------------------

            // if (obj['股票简称'] == '凯莱英') debugger

            // 计算趋势
            let 昨日趋势 = false
            if (
                obj[pd1]['大单净额'] > 0 &&
                (obj[pd1]['涨跌幅'] > blockItem[pd1]['涨跌幅'] * 1.5 ||
                    obj[pd1]['涨跌幅'] > 5 ||
                    (obj[pd1]['涨跌幅'] > 2 && obj[pd1]['大单净额'] > 0 && obj[pd1]['资金流向'] > 0))
            ) {
                if (obj['macd']['pd1'] >= obj['macd']['pd2'] && obj['macd']['pd1'] >= obj['macd']['pd3']) {
                    if (Number(ele[`rsi(rsi12值)[${pd1}]`] || 0) >= 60) 昨日趋势 = true
                }
            }
            if (obj['涨停']) 昨日趋势 = true
            if (ztArr == 0) 昨日趋势 = false // 指数板块实际涨停数为0时，昨日趋势不成立
            if (obj['前15涨停数'] > 3 || obj['前5涨停数'] > 2) 昨日趋势 = false
            // if (_0935zhang < Math.floor(res[0].length * 0.7)) 昨日趋势 = false //09:35 指数板块涨跌幅大于0占比率超70%

            let 今日趋势 = false
            let 涨跌35 = obj['09:35']['涨跌幅'] || 0
            if (涨跌35 >= blockItem['09:35']['涨跌幅'] || 涨跌35 >= 5) 今日趋势 = true
            if (涨跌35 < blockItem['09:35']['涨跌幅'] * 1.5 && 涨跌35 < 3) 今日趋势 = false //2025-07-22 今日趋势补充条件

            let 长期趋势 = false
            if (obj['v60达成'] && obj['M60达成'] && obj['前40日']) 长期趋势 = true
            if (obj['v60达成'] && obj['M60达成'] && obj['涨停']) 长期趋势 = true
            if (obj['v30达成'] && obj['M30达成'] && obj['涨停'] && obj['前40日']) 长期趋势 = true
            if (Number(obj['流通市值']) > 100000000000) 长期趋势 = false // 流通市值大于1000亿的个股不考虑

            let 特殊趋势 = false
            if (
                涨跌35 > blockItem['09:35']['涨跌幅'] ||
                (涨跌35 > 0 && obj['09:35']['资金流向'] > 0 && obj['09:35']['大单净额'] > 0)
            ) {
                特殊趋势 = true // 2025-07-22 指数趋势补充条件
            }

            obj['昨日趋势'] = Boolean(昨日趋势)
            obj['今日趋势'] = Boolean(今日趋势)
            obj['长期趋势'] = Boolean(长期趋势)

            obj['特殊趋势'] = Boolean(特殊趋势)

            return obj
        })
        .sort((a, b) => {
            return (a['昨热度排名'] || 0) - (b['昨热度排名'] || 0)
        })
    // if (ztArr == 0) {
    //     debugger
    //     if (blockType === '行业') {
    //         Blocks.Data[0].base = Blocks.Data[0].base.filter((item) => blockItem['code'] != item['code'])
    //     } else {
    //         Blocks.Data[1].base = Blocks.Data[1].base.filter((item) => blockItem['code'] != item['code'])
    //     }
    //     Blocks.loading = false
    //     Blocks.CheckedOptimumFN()
    //     Blocks.checked = { type: '-', name: '-', item: null }
    //     Stocks.Data = [{ name: '实时策略', base: [], default: [] }]
    //     BlocksClickauto()
    // }

    Stocks.mySort(...Stocks.Sort_selected)
}

async function BlocksClickauto() {
    let { tdcn, td } = Dates.shareDate
    const allModelTrue = Blocks.checkboxList.every((item) => item.model === true)
    if (td != dayjs().format('YYYYMMDD') && allModelTrue) {
        let logName = 'FetchLog-Blocks-Click-' + tdcn.slice(0, 5)
        let logValue = (await getLocalStorage(logName)) || []
        if (Blocks.Data[0].default.length > 0 || Blocks.Data[1].default.length > 0) {
            logValue.push(td)
        } else {
            logValue = logValue.filter((item) => item !== td)
        }
        logValue = [...new Set(logValue)].sort((a, b) => Number(a) - Number(b))
        setLocalStorage(logName, logValue)
    }

    if (Blocks.Data[0].default.length > 0) {
        CheckedBlock('行业', Blocks.Data[0].default[0]['指数简称'], Blocks.Data[0].default[0])
    } else if (Blocks.Data[1].default.length > 0) {
        CheckedBlock('概念', Blocks.Data[1].default[0]['指数简称'], Blocks.Data[1].default[0])
    }
}

function findKeysWithPattern(obj, start, end) {
    let res = Object.keys(obj).filter((key) => key.startsWith(start) && key.endsWith(end))
    if (res.length > 1) {
        res = res.sort((a, b) => {
            return Number(a.substring(10, 18)) - Number(b.substring(10, 18))
        })
    }
    return res
}
function getLimitUpValue(obj) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (key.includes('涨停次数')) {
                const value = obj[key]
                return Number(value)
            }
        }
    }
    return 0 // 没找到 key，返回 0
}
function getLimitUpArrayDynamic(obj) {
    const results = []

    // 正则匹配：匹配 "涨停次数[YYYYMMDD-YYYYMMDD]" 格式
    const regex = /^涨停次数\[(\d{8})-(\d{8})\]$/

    for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue

        const match = key.match(regex)
        if (match) {
            const startDate = match[1] // 开始日期字符串
            const endDate = match[2] // 结束日期字符串
            const value = Number(obj[key]) || 0

            results.push({
                start: startDate,
                end: endDate,
                value: value,
                rawKey: key,
            })
        }
    }

    // 按开始日期排序（升序：从早到晚）
    results.sort((a, b) => a.start.localeCompare(b.start))

    // 提取排序后的 value 数组
    const values = results.map((item) => item.value)

    // 确保返回长度为2的数组，不足补0
    return [values[0] || 0, values[1] || 0]
}
function num(e) {
    return e ? Number(Number(e).toFixed(2)) : '-'
}
function nTOs(e) {
    if (typeof num === 'number') {
        return e + ''
    } else {
        return e
    }
}
function handleVM(obj, ele, type, pd1) {
    let t = type === 'block' ? '指数@' : ''
    obj['M01'] = num(ele[`1日${t}均线[${pd1}]`])
    obj['M05'] = num(ele[`5日${t}均线[${pd1}]`])
    obj['M05达成'] = obj['M05'] <= obj['M01']
    obj['M10'] = num(ele[`10日${t}均线[${pd1}]`])
    obj['M10达成'] = obj['M05达成'] && obj['M10'] <= obj['M01']
    obj['M30'] = num(ele[`30日${t}均线[${pd1}]`])
    obj['M30达成'] = obj['M10达成'] && obj['M30'] <= obj['M01']
    obj['M60'] = num(ele[`60日${t}均线[${pd1}]`])
    let ts_m =
        obj['M05'] >= obj['M30'] || obj['M05'] >= obj['M60'] || obj['M10'] >= obj['M30'] || obj['M10'] >= obj['M60']
    ts_m = type === 'block' ? true : ts_m
    obj['M60达成'] = obj['M30达成'] && obj['M60'] <= obj['M01'] && ts_m

    obj['v01'] = num(ele[`1日${t}vol[${pd1}]`])
    obj['v05'] = num(ele[`5日${t}vol[${pd1}]`])
    obj['v05达成'] = obj['v05'] <= obj['v01']
    obj['v10'] = num(ele[`10日${t}vol[${pd1}]`])
    obj['v10达成'] = obj['v05达成'] && obj['v10'] <= obj['v01']
    obj['v30'] = num(ele[`30日${t}vol[${pd1}]`])
    obj['v30达成'] = obj['v10达成'] && obj['v30'] <= obj['v01']
    obj['v60'] = num(ele[`60日${t}vol[${pd1}]`])
    obj['v60达成'] = obj['v30达成'] && obj['v60'] <= obj['v01']
}
function handleRate(obj, ele, type, td, pd1) {
    let t = type === 'block' ? '指数@' : ''
    obj[`${td}`] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${td}]`]),
        资金流向: num(ele[`${t}资金流向[${td}]`]),
        大单净额: num(ele[`${t}dde大单净额[${td}]`]),
    }
    obj['09:35'] = {
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
        涨跌幅: num(ele[`${t}分时涨跌幅:前复权[${td} 09:30]`]),
    }
    obj[pd1] = {
        涨跌幅: num(ele[`${t}涨跌幅:前复权[${pd1}]`] || ele[`${t}分时涨跌幅:前复权[${pd1} 15:00]`]),
        资金流向: num(ele[`${t}资金流向[${pd1}]`] || ele[`${t}分时资金流向[${pd1} 15:00]`]),
        大单净额: num(ele[`${t}dde大单净额[${pd1}]`] || ele[`${t}分时dde大单净额[${pd1} 15:00]`]),
        收盘价: num(ele[`1日指数${t}[${pd1}]`]),
    }
}
const App = {
    setup() {
        const Intervals = reactive({
            timer: null,
            time: '-',
            updateTime: () => (Intervals.time = dayjs().format('YYYY-MM-DD HH:mm:ss')),
        })
        onMounted(() => {
            Intervals.timer = setInterval(Intervals.updateTime, 1000) // 每秒更新一次时间
            Submit()
        })
        onUnmounted(() => {
            clearInterval(Intervals.timer) // 清除定时器
        })
        return {
            Intervals,
            Dates,
            Submit,
            Blocks,
            CheckedBlock,
            Stocks,
            precentformater,
            formatNumber,
            nTOs,
            isMobile,
        }
    },
}
const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
app.mount('#app')
