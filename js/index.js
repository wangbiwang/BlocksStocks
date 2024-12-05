const { createApp, onMounted, onUnmounted, ref, reactive } = Vue
const { ElNotification } = ElementPlus
//循环获取时间
const Intervals = reactive({
    arr: [],
    Id: null,
    time: '-',
    updateTime: () => {
        Intervals.time = dayjs().format('YYYY-MM-DD HH:mm:ss')
    },
})
const submitTime = ref('-') //请求时间
//日期时间相关
const Dates = reactive({
    DateList: [],
    Today: dayjs().format('YYYYMMDD'),
    yesterday: dayjs().subtract(1, 'day').format('YYYYMMDD'),
    HistoryDate: '',
    HistoryBtn: false,
    isHoliday: (cell) => {
        // console.log(cell,'cell',dayjs(cell.date).format('YYYYMMDD'),Dates.DateList.includes(dayjs(cell.date).format('YYYYMMDD')),Dates.DateList)
        return Dates.DateList.includes(dayjs(cell).format('YYYYMMDD'))
    },
})

//查询问题相关
const text01 = '涨跌幅降序资金流向大单净额收盘价'
const text1 = '前1交易日(vol1和vol5和vol10和vol30和vol60)'
const text2 = '前1交易日(M5和M10和M30和M60)'
const Questions = reactive({
    block: [
        `当日涨跌幅资金流向大单净额收盘价;09:30涨跌幅；09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35${text01}；前1交易日涨跌幅资金流向大单净额收盘价；前5交易日区间最高价不复权；二级行业`,
        `当日涨跌幅资金流向大单净额收盘价;09:35${text01}；${text1}；${text2}；前1交易日成交量环比率；二级行业`,
        `当日涨跌幅资金流向大单净额收盘价;09:30涨跌幅；09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35${text01}；前1交易日涨跌幅资金流向大单净额收盘价；前5交易日区间最高价不复权；概念`,
        `当日涨跌幅资金流向大单净额收盘价;09:35${text01}；${text1}；${text2}；前1交易日成交量环比率；概念`,
    ],
    stock: [
        `当日涨跌幅资金流向大单净额收盘价；09:30涨跌幅；前1交易日热度排名升序当日热度排名流通市值非st；前1交易日涨跌幅资金流向大单净额收盘价前复权；行业概念`,
        `前1交易日热度排名升序前40交易日区间最高价不复权;09:31涨跌幅资金流向大单净额；09:33涨跌幅资金流向大单净额；09:35涨跌幅资金流向大单净额股价；行业概念`,
        `前1交易日热度排名升序前5交易日区间最高价不复权；${text1}；${text2}；前1交易日成交量环比率；行业概念`,
        `前1交易日涨停封单；行业概念`,
    ],
})
//指数板块相关
const Blocks = reactive({
    checked: { type: '-', name: '-', item: null },
    loading: false,
    headerData: [],
    Data: [
        { name: '实时行业策略排行', base: [], default: [] },
        { name: '实时行业概念排行', base: [], default: [] },
    ],
    CheckedOptimum: { _p10: true, YesterdayTrend: true, LongTrend: true, TodayTrend: true },
    CheckedOptimumFN: () => {
        Blocks.Data = Blocks.Data.map((el) => {
            el.default = el.base
            return el
        })
        if (Blocks.CheckedOptimum._p10) {
            Blocks.Data = Blocks.Data.map((el) => {
                let arr = el.default.sort((a, b) => b['09:35']['涨跌幅'] - a['09:35']['涨跌幅']).slice(0, 10)
                el.default = el.default.filter((ele) => arr.some((itme) => itme.code == ele.code))
                return el
            })
        }
        if (Blocks.CheckedOptimum._分值) {
            Blocks.Data = Blocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['9:35打分'] >= 7)
                return el
            })
        }
        if (Blocks.CheckedOptimum.TodayTrend) {
            Blocks.Data = Blocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['今日趋势'])
                return el
            })
        }
        if (Blocks.CheckedOptimum.YesterdayTrend) {
            Blocks.Data = Blocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['昨日趋势'])
                return el
            })
        }
        if (Blocks.CheckedOptimum.LongTrend) {
            Blocks.Data = Blocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['长期趋势'])
                return el
            })
        }
    },
    RateSort: (e, i) => {
        if (i < 2 || i > 6) return
        // console.log(e, i)
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
        submitBlocks()
    },
    RateSort_selected: '09:35',
})
//个股相关
const Stocks = reactive({
    loading: false,
    headerData: [],
    Data: [{ name: '实时策略', base: [], default: [] }],
    CheckedOptimum: { _p10: true, YesterdayTrend: true, LongTrend: true, TodayTrend: true },
    CheckedOptimumFN: () => {
        Stocks.Data = Stocks.Data.map((el) => {
            el.default = el.base
            return el
        })
        if (Stocks.CheckedOptimum._分值) {
            Stocks.Data = Stocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['9:35打分'] >= 7)
                return el
            })
        }
        if (Stocks.CheckedOptimum.TodayTrend) {
            Stocks.Data = Stocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['今日趋势'])
                return el
            })
        }
        if (Stocks.CheckedOptimum.YesterdayTrend) {
            Stocks.Data = Stocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['昨日趋势'])
                return el
            })
        }
        if (Stocks.CheckedOptimum.LongTrend) {
            Stocks.Data = Stocks.Data.map((el) => {
                el.default = el.default.filter((ele) => ele['长期趋势'])
                return el
            })
        }
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
        console.log(ea, eb, Stocks.Data[0].default)
        Stocks.Data[0].base = Stocks.Data[0].base.sort((a, b) => {
            if (eb) {
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
}

//-----------------------------
async function submit(e) {
    //最后操作状态记录
    let FinalOperatingState = getLocalStorage('FinalOperatingState') || {
        searchDate: '', //查询的历史日期
        TradingDay: [], //历史可交易日组
        updateTradingDay: '', //上次请求可交易日期时间
    }
    if (FinalOperatingState.searchDate && !e) {
        e = '历史'
        Dates.HistoryDate = FinalOperatingState.searchDate
    }
    if (e == '历史') {
        if (Dates.HistoryDate == '') {
            ElNotification({
                title: '请选择日期！',
                type: 'error',
                position: 'top-right',
                duration: 1000,
            })
            return
        }
        Dates.Today = dayjs(Dates.HistoryDate).format('YYYYMMDD')
        FinalOperatingState.searchDate = Dates.HistoryDate
    } else {
        Dates.Today = dayjs().format('YYYYMMDD')
        FinalOperatingState.searchDate = ''
    }
    Dates.HistoryBtn = e
    // console.log(FinalOperatingState)
    //---------
    // https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,2021-01-01,2025-01-01,1040,qfq
    let baseUrl = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param='
    let dayArr,
        oldYear = 2021,
        newyYear = Number(dayjs(new Date()).format('YYYY')) + 1
    // 第一次请求获取[2021至今]历史所有数据 每年余量270day
    if (FinalOperatingState.TradingDay.length == 0) {
        dayArr = await axios({
            method: 'get',
            url: `${baseUrl}sh000001,day,,,${Number((newyYear - oldYear) * 270)},qfq`,
        })
    }
    // 之后每天请求一次当年数据
    // https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,,,320,qfq
    else if (Number(FinalOperatingState.updateTradingDay) < Number(dayjs(new Date()).format('YYYYMMDD') + '0930')) {
        dayArr = await axios({
            method: 'get',
            url: `${baseUrl}sh000001,day,,,320,qfq`,
        })
    }
    if (dayArr && dayArr.status == 200 && dayArr.data) {
        let data = JSON.parse(dayArr.data.replace('kline_dayqfq=', ''))
        if (data.data && data.data.sh000001 && data.data.sh000001.day.length > 0) {
            data = data.data.sh000001.day.map((e) => dayjs(e[0]).format('YYYYMMDD'))
            FinalOperatingState.TradingDay = Array.from(new Set([...FinalOperatingState.TradingDay, ...data]))
            FinalOperatingState.updateTradingDay = dayjs(new Date()).format('YYYYMMDDHHmm')
        }
    }
    Dates.DateList = FinalOperatingState.TradingDay

    Dates.yesterday = Dates.DateList[Dates.DateList.findIndex((el) => el == Dates.Today) - 1]
    let TimeTilArr = [Dates.Today, `09:35`, `09:33`, `09:31`, `09:30`, Dates.yesterday]
    let VolumePriceArr = ['量价05', '量价10', '量价30', '量价60']
    Blocks.headerData = ['序号', '指数简称', ...TimeTilArr, '环比', 'M05', 'M10', 'M30', 'M60', '前5日', '9:35打分']
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
        ...TimeTilArr,
        '环比',
        'M05',
        'M10',
        'M30',
        'M60',
        '前5日',
        '前40日',
        '9:35打分',
    ]
    Blocks.Data = Blocks.Data.map((el) => {
        el.default = []
        return el
    })
    Stocks.Data = Stocks.Data.map((el) => {
        el.default = []
        return el
    })
    //---------------
    if (Dates.HistoryBtn == '历史') {
        let d = dayjs(Dates.HistoryDate).format('YYYYMMDD')
        if (d == 20221121) FinalOperatingState.keyDate = d
    }
    if (!FinalOperatingState.keyDate) return
    //---------------
    setLocalStorage('FinalOperatingState', FinalOperatingState)
    submitBlocks()
}
function submitBlocks() {
    if (Blocks.loading) return
    Blocks.loading = true
    const requests = Questions.block.map((el) => {
        if (Dates.HistoryBtn == '历史') {
            let cn = dayjs(Dates.HistoryDate).format('YYYY年MM月DD日')
            el = el
                .replaceAll('当日', cn)
                .replaceAll('09:3', cn + '09:3')
                .replaceAll('前5交易日', cn + '前5交易日')
                .replaceAll('前1交易日', cn + '前1交易日')
        }
        return axios(handle_requestsData('zhishu', el))
    })
    Promise.all(requests)
        .then(async (responses) => {
            let res = responses.map((el) => {
                if (el.data && el.data.data && el.data.data.answer && el.data.data.answer.length > 0) {
                    return el.data.data.answer[0].txt[0].content.components[0].data.datas
                } else {
                    // console.log(el)
                    ElNotification({
                        title: ' 刷新重试！3秒后尝试打开同花顺官网测试连通性！',
                        type: 'error',
                        position: 'top-right',
                        duration: 3000,
                    })
                    setTimeout(() => {
                        goToTHSUrl()
                    }, 3000)
                }
            })
            // console.log('submitBlocks', ...res)
            let errKey = []
            res.forEach((el, i) => {
                if (el.length > 0 && !el[0]['指数简称']) {
                    // console.log('错误项：', el[0])
                    errKey.push(i)
                }
            })
            if (errKey.length > 0) {
                let errRequests = errKey.map((el) => {
                    return (el = requests[el])
                })
                Promise.all(errRequests)
                    .then(async (errResponses) => {
                        errResponses = errResponses.map((el) => {
                            return el.data.data.answer[0].txt[0].content.components[0].data.datas
                        })
                        errResponses.forEach((el, i) => {
                            res[errKey[i]] = el
                        })
                        handleBlocksData(res)
                    })
                    .catch((error) => {
                        ElNotification({
                            title: error,
                            type: 'error',
                            position: 'top-right',
                            duration: 3000,
                        })
                    })
                    .finally(() => (Blocks.loading = false))
            } else {
                handleBlocksData(res)
            }
        })
        .catch((error) => {
            ElNotification({
                title: error,
                type: 'error',
                position: 'top-right',
                duration: 3000,
            })
        })
        .finally(() => (Blocks.loading = false))
}
function handleBlocksData(res) {
    function handleArr(arr1, arr2) {
        let d1 = Dates.Today
        let pd1 = Dates.yesterday
        function num(e) {
            if (e) {
                if (Number(e).toFixed(2) == '0.00') {
                    return 0.01
                }
                return Number(Number(e).toFixed(2))
            }
            return '-'
        }
        let resArr = []
        arr1.forEach((el) => {
            let foundItem = arr2.find((ele) => ele['指数简称'] == el['指数简称'])
            if (foundItem) {
                resArr.push(Object.assign({}, el, foundItem))
            }
        })
        return resArr.map((ele, idx) => {
            let obj = {}
            obj['序号'] = idx + 1
            obj['code'] = ele['code']
            obj['指数简称'] = ele['指数简称']
            obj[`${d1}`] = {
                涨跌幅: num(ele[`指数@涨跌幅:前复权[${d1}]`]),
                资金流向: num(ele[`指数@资金流向[${d1}]`]),
                大单净额: num(ele[`指数@dde大单净额[${d1}]`]),
                // 大单净量: num(ele[`指数@dde大单净量[${d1}]`]),
                收盘价: num(ele[`指数@收盘价:不复权[${pd1}]`]),
            }
            obj['09:35'] = {
                涨跌幅: num(ele[`指数@分时涨跌幅:前复权[${d1} 09:35]`]),
                资金流向: num(ele[`指数@分时资金流向[${d1} 09:35]`]),
                大单净额: num(ele[`指数@分时dde大单净额[${d1} 09:35]`]),
            }
            obj[`09:33`] = {
                涨跌幅: num(ele[`指数@分时涨跌幅:前复权[${d1} 09:33]`]),
                资金流向: num(ele[`指数@分时资金流向[${d1} 09:33]`]),
                大单净额: num(ele[`指数@分时dde大单净额[${d1} 09:33]`]),
            }
            obj[`09:31`] = {
                涨跌幅: num(ele[`指数@分时涨跌幅:前复权[${d1} 09:31]`]),
                资金流向: num(ele[`指数@分时资金流向[${d1} 09:31]`]),
                大单净额: num(ele[`指数@分时dde大单净额[${d1} 09:31]`]),
            }
            obj[`09:30`] = {
                涨跌幅: num(ele[`指数@分时涨跌幅:前复权[${d1} 09:30]`]),
            }
            obj[pd1] = {
                涨跌幅: num(ele[`指数@涨跌幅:前复权[${pd1}]`]),
                资金流向: num(ele[`指数@资金流向[${pd1}]`]),
                大单净额: num(ele[`指数@dde大单净额[${pd1}]`]),
                // 大单净量: num(ele[`指数@dde大单净量[${pd1}]`]),
                收盘价: num(ele[`指数@收盘价:不复权[${pd1}]`]),
            }
            obj['p成交量环比率'] = num(ele[`指数@成交量环比增长率[${pd1}]`])
            obj['p收盘价'] = num(ele[`指数@收盘价:不复权[${pd1}]`])
            obj['M05'] = num(ele[`5日指数@均线[${pd1}]`])
            obj['M05达成'] = obj['M05'] <= obj['p收盘价']
            obj['M10'] = num(ele[`10日指数@均线[${pd1}]`])
            obj['M10达成'] = obj['M05达成'] && obj['M10'] <= obj['p收盘价']
            obj['M30'] = num(ele[`30日指数@均线[${pd1}]`])
            obj['M30达成'] = obj['M10达成'] && obj['M30'] <= obj['p收盘价']
            obj['M60'] = num(ele[`60日指数@均线[${pd1}]`])
            obj['M60达成'] = obj['M30达成'] && obj['M60'] <= obj['p收盘价']
            obj['p成交量'] = num(ele[`1日指数@vol[${pd1}]`])
            obj['v05'] = num(ele[`5日指数@vol[${pd1}]`])
            obj['v05达成'] = obj['v05'] <= obj['p成交量']
            obj['v10'] = num(ele[`10日指数@vol[${pd1}]`])
            obj['v10达成'] = obj['v05达成'] && obj['v10'] <= obj['p成交量']
            obj['v30'] = num(ele[`30日指数@vol[${pd1}]`])
            obj['v30达成'] = obj['v10达成'] && obj['v30'] <= obj['p成交量']
            obj['v60'] = num(ele[`60日指数@vol[${pd1}]`])
            obj['v60达成'] = obj['v30达成'] && obj['v60'] <= obj['p成交量']

            obj['前5日'] = ele[`指数@分时收盘价:不复权[${d1} 09:35]`]
                ? Number(ele[`指数@分时收盘价:不复权[${d1} 09:35]`]) >=
                  Number(ele[findKeysWithPattern(ele, '指数@区间最高价:不复权[', ']')[0]])
                : Number(ele[`指数@收盘价:不复权[${d1}]`]) >=
                  Number(ele[findKeysWithPattern(ele, '指数@区间最高价:不复权[', ']')[0]])

            let 昨日趋势 = 0
            if (obj[pd1]['涨跌幅'] > 0.5) {
                if (obj[pd1]['大单净额'] > 0) 昨日趋势 = 4
            }
            let 今日趋势 = 0
            if (
                obj['09:35']['涨跌幅'] > 0 &&
                obj['09:35']['涨跌幅'] >= obj['09:30']['涨跌幅'] &&
                (obj['09:35']['资金流向'] > 0 || obj['09:35']['大单净额'] > 0)
            ) {
                if (
                    obj['09:35']['资金流向'] >= obj['09:33']['资金流向'] ||
                    obj['09:35']['大单净额'] >= obj['09:33']['大单净额']
                ) {
                    今日趋势 = 3
                }
            }

            let 长期趋势 = obj['v60达成'] && obj['M60达成'] ? 3 : 0
            obj['昨日趋势'] = Boolean(昨日趋势)
            obj['今日趋势'] = Boolean(今日趋势)
            obj['长期趋势'] = Boolean(长期趋势)

            let 扣分 = [
                (obj['09:35']['大单净额'] < 0 && obj['09:35']['资金流向'] < 0) ||
                (obj['09:31']['大单净额'] < 0 &&
                    obj['09:31']['资金流向'] < 0 &&
                    ((obj['09:31']['大单净额'] >= obj['09:33']['大单净额'] &&
                        obj['09:33']['大单净额'] >= obj['09:35']['大单净额'] &&
                        obj['09:35']['大单净额'] < 0) ||
                        (obj['09:31']['资金流向'] >= obj['09:33']['资金流向'] &&
                            obj['09:33']['资金流向'] >= obj['09:35']['资金流向'] &&
                            obj['09:35']['资金流向'] < 0)))
                    ? -3
                    : 0,
                obj[pd1]['涨跌幅'] < 1 || obj[pd1]['大单净额'] < 0 ? -4 : 0,
                obj['09:35']['大单净额'] < 0 &&
                obj['09:35']['资金流向'] < 0 &&
                obj['09:33']['大单净额'] < 0 &&
                obj['09:33']['资金流向'] < 0
                    ? -3
                    : 0,
                obj['09:35']['资金流向'] < obj['09:33']['资金流向'] &&
                obj['09:35']['大单净额'] < obj['09:33']['大单净额']
                    ? -3
                    : 0,
            ].reduce((accumulator, currentValue) => accumulator + currentValue, 0)

            obj['9:35打分'] =
                // `${昨日趋势} + ${今日趋势} + ${长期趋势}   + ${扣分}=` +
                Number(昨日趋势 + 今日趋势 + 长期趋势 + 扣分)

            return obj
        })
        // .slice(0, 5)
    }
    Blocks.Data[0].base = handleArr(res[0], res[1])
    Blocks.Data[1].base = handleArr(res[2], res[3])
    Blocks.CheckedOptimumFN()
    submitTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}
function submitStocks() {
    if (Stocks.loading) return
    Stocks.loading = true
    const requests = Questions.stock.map((el) => {
        if (Blocks.checked.type == 'Max') {
            el = el.replace('前1交易日热度排名升序', `当日收盘价>=前20交易日区间最高价不复权;前1交易日热度排名升序`)
        } else if (Blocks.checked.type == '100') {
        } else {
            let _name = Blocks.checked.name
            if (Blocks.checked.type == '概念') {
                _name = _name.replace('封装光学(CPO)', '封装光学')
                el = el.replace('行业概念', `行业概念；所属概念包含${_name}；`)
            } else if (Blocks.checked.type == '行业') {
                el = el.replace('行业概念', `概念；所属二级行业包含${_name}；`)
            }
        }
        if (Dates.HistoryBtn == '历史') {
            let cn = dayjs(Dates.Today).format('YYYY年MM月DD日')
            let us = dayjs(Dates.Today).format('YYYYMMDD')
            if (Stocks.Sort_selected[1] && !Stocks.Sort_selected[0].includes('09:')) Stocks.Sort_selected[0] = us
            el = el
                .replaceAll('当日', cn)
                .replaceAll('09:', cn + '09:')
                .replaceAll('前1交易日', cn + '前1交易日')
                .replaceAll('前5交易日', cn + '前5交易日')
                .replaceAll('前20交易日', cn + '前20交易日')
                .replaceAll('前40交易日', cn + '前40交易日')
                .replaceAll('流通市值', cn + '流通市值')
        }
        return axios(handle_requestsData('stock', el))
    })

    Promise.all(requests)
        .then(async (responses) => {
            let res = responses.map((el) => {
                if (el.data && el.data.data && el.data.data.answer && el.data.data.answer.length > 0) {
                    return el.data.data.answer[0].txt[0].content.components[0].data.datas
                } else {
                    // console.log(el)
                    ElNotification({
                        title: ' 刷新重试！3秒后尝试打开同花顺官网测试连通性！',
                        type: 'error',
                        position: 'top-right',
                        duration: 3000,
                    })
                    setTimeout(() => {
                        goToTHSUrl()
                    }, 3000)
                }
            })
            // console.log('submitStocks', ...res)
            //----
            let errKey = []
            res.forEach((el, i) => {
                if (el.length > 0 && !el[0]['股票简称']) {
                    // console.log('错误项：', el[0])
                    errKey.push(i)
                }
            })
            // console.log('errKey:', errKey)
            if (errKey.length > 0) {
                let errRequests = errKey.map((el) => {
                    return (el = requests[el])
                })
                // console.log('errRequests:', errRequests)
                Promise.all(errRequests)
                    .then(async (errResponses) => {
                        errResponses = errResponses.map((el) => {
                            return el.data.data.answer[0].txt[0].content.components[0].data.datas
                        })
                        errResponses.forEach((el, i) => {
                            res[errKey[i]] = el
                        })
                        handleStocksData(res)
                    })
                    .catch((error) => {
                        ElNotification({
                            title: error,
                            type: 'error',
                            position: 'top-right',
                            duration: 3000,
                        })
                    })
                    .finally(() => (Stocks.loading = false))
            } else {
                handleStocksData(res)
            }
            //----
        })
        .catch((error) => {
            ElNotification({
                title: error,
                type: 'error',
                position: 'top-right',
                duration: 3000,
            })
            // console.error('error!!!', error)
        })
        .finally(() => (Stocks.loading = false))
}
function handleStocksData(res) {
    let d1 = Dates.Today
    let pd1 = Dates.yesterday
    function num(e) {
        if (e) {
            if (Number(e).toFixed(2) == '0.00') return 0.01
            return Number(Number(e).toFixed(2))
        }
        return '-'
    }
    let _0935上涨个数 = 0
    let _当日上涨个数 = 0
    let 涨停股池 = res[3]
    console.log('涨停股池', 涨停股池)
    Stocks.Data[0].base = res[0]
        .filter((el) => {
            return !/^68/.test(el.code) && !/^8/.test(el.code)
        })
        .map((ele, idx) => {
            let obj = {}
            ele = {
                ...ele,
                ...res[1].filter((el) => el['股票简称'] === ele['股票简称'])[0],
                ...res[2].filter((el) => el['股票简称'] === ele['股票简称'])[0],
            }
            obj['序号'] = idx + 1
            obj['股票简称'] = ele['股票简称']
            obj['code'] = ele['code']
            obj['行业'] = ele['所属同花顺行业'] || ele['所属同花顺二级行业']
            obj['概念'] = ele['所属概念']

            obj['昨热度排名'] = ele[`个股热度排名[${pd1}]`]
            obj['今热度排名'] = ele[`个股热度排名[${d1}]`]
            obj['流通市值'] = ele[`a股市值(不含限售股)[${d1}]`]
            obj['股价'] = Number(ele[`收盘价:不复权[${d1}]`] || ele[`最新价`])

            obj['涨停'] = 涨停股池.some((item) => item.code == obj['code'])

            if (ele[`涨跌幅:前复权[${d1}]`] > 0) _当日上涨个数++
            if (ele[`分时涨跌幅:前复权[${d1} 09:35]`] > 0) _0935上涨个数++

            obj[`${d1}`] = {
                涨跌幅: num(ele[`涨跌幅:前复权[${d1}]`]),
                资金流向: num(ele[`资金流向[${d1}]`]),
                大单净额: num(ele[`dde大单净额[${d1}]`]),
                // 大单净量: num(ele[`dde大单净量[${d1}]`]),
                // 涨跌幅趋势:
                //     num(ele[`涨跌幅:前复权[${d1}`]) >= num(ele[`分时涨跌幅:前复权[${d1} 09:35]`]) ? 'j1' : '-j1',
                // 资金流向趋势: num(ele[`资金流向[${d1}]`]) >= num(ele[`分时资金流向[${d1} 09:35]`]) ? 'j1' : '-j1',
                // 大单净量趋势: num(ele[`dde大单净量[${d1}]`]) >= num(ele[`分时dde大单净量[${d1} 09:35]`]) ? 'j1' : '-j1',
            }
            obj[`09:35`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:35]`]),
                资金流向: num(ele[`分时资金流向[${d1} 09:35]`]),
                大单净额: num(ele[`分时dde大单净额[${d1} 09:35]`]),
                // 大单净量: num(ele[`分时dde大单净量[${d1} 09:35]`]),
                // 涨跌幅趋势:
                //     num(ele[`分时涨跌幅:前复权[${d1} 09:35]`]) >= num(ele[`分时涨跌幅:前复权[${d1} 09:33]`])
                //         ? 'j1'
                //         : '-j1',
                // 资金流向趋势:
                //     num(ele[`分时资金流向[${d1} 09:35]`]) >= num(ele[`分时资金流向[${d1} 09:33]`]) ? 'j1' : '-j1',
                // 大单净量趋势:
                //     num(ele[`分时dde大单净量[${d1} 09:35]`]) >= num(ele[`分时dde大单净量[${d1} 09:33]`]) ? 'j1' : '-j1',
            }
            obj[`09:33`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:33]`]),
                资金流向: num(ele[`分时资金流向[${d1} 09:33]`]),
                大单净额: num(ele[`分时dde大单净额[${d1} 09:33]`]),
                // 大单净量: num(ele[`分时dde大单净量[${d1} 09:33]`]),
                // 涨跌幅趋势:
                //     num(ele[`分时涨跌幅:前复权[${d1} 09:33]`]) >= num(ele[`分时涨跌幅:前复权[${d1} 09:31]`])
                //         ? 'j1'
                //         : '-j1',
                // 资金流向趋势:
                //     num(ele[`分时资金流向[${d1} 09:33]`]) >= num(ele[`分时资金流向[${d1} 09:31]`]) ? 'j1' : '-j1',
                // 大单净量趋势:
                //     num(ele[`分时dde大单净量[${d1} 09:33]`]) >= num(ele[`分时dde大单净量[${d1} 09:31]`]) ? 'j1' : '-j1',
            }
            obj[`09:31`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:31]`]),
                资金流向: num(ele[`分时资金流向[${d1} 09:31]`]),
                大单净额: num(ele[`分时dde大单净额[${d1} 09:31]`]),
                // 大单净量: num(ele[`分时dde大单净量[${d1} 09:31]`]),
                // 涨跌幅趋势:
                //     num(ele[`分时涨跌幅:前复权[${d1} 09:31]`]) >= num(ele[`分时涨跌幅:前复权[${d1} 09:30]`])
                //         ? 'j1'
                //         : '-j1',
            }
            obj[`09:30`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:30]`]),
            }
            obj[pd1] = {
                涨跌幅: num(ele[`涨跌幅:前复权[${pd1}]`]),
                资金流向: num(ele[`资金流向[${pd1}]`]),
                大单净额: num(ele[`dde大单净额[${pd1}]`]),
                // 大单净量: num(ele[`dde大单净量[${pd1}]`]),
                收盘价: num(ele[`收盘价:前复权[${pd1}]`]),
            }

            obj['p成交量环比率'] = num(ele[`成交量环比增长率[${pd1}]`])
            obj['p收盘价'] = num(ele[`收盘价:前复权[${pd1}]`])
            obj['M05'] = num(ele[`5日均线[${pd1}]`])
            obj['M05达成'] = obj['M05'] <= obj['p收盘价']
            obj['M10'] = num(ele[`10日均线[${pd1}]`])
            obj['M10达成'] = obj['M05达成'] && obj['M10'] <= obj['p收盘价']
            obj['M30'] = num(ele[`30日均线[${pd1}]`])
            obj['M30达成'] = obj['M10达成'] && obj['M30'] <= obj['p收盘价']
            obj['M60'] = num(ele[`60日均线[${pd1}]`])
            obj['M60达成'] = obj['M30达成'] && obj['M60'] <= obj['p收盘价']
            obj['p成交量'] = num(ele[`1日vol[${pd1}]`])
            obj['v05'] = num(ele[`5日vol[${pd1}]`])
            obj['v05达成'] = obj['v05'] <= obj['p成交量']
            obj['v10'] = num(ele[`10日vol[${pd1}]`])
            obj['v10达成'] = obj['v05达成'] && obj['v10'] <= obj['p成交量']
            obj['v30'] = num(ele[`30日vol[${pd1}]`])
            obj['v30达成'] = obj['v10达成'] && obj['v30'] <= obj['p成交量']
            obj['v60'] = num(ele[`60日vol[${pd1}]`])
            obj['v60达成'] = obj['v30达成'] && obj['v60'] <= obj['p成交量']

            obj['前5日'] = ele[`分时收盘价:不复权[${d1} 09:35]`]
                ? Number(ele[`分时收盘价:不复权[${d1} 09:35]`]) >=
                  Number(ele[findKeysWithPattern(ele, '区间最高价:不复权[', ']')[1]])
                : Number(ele[`收盘价:不复权[${d1}]`]) >=
                  Number(ele[findKeysWithPattern(ele, '区间最高价:不复权[', ']')[1]])
            obj['前40日'] = ele[`分时收盘价:不复权[${d1} 09:35]`]
                ? Number(ele[`分时收盘价:不复权[${d1} 09:35]`]) >=
                  Number(ele[findKeysWithPattern(ele, '区间最高价:不复权[', ']')[0]])
                : Number(ele[`收盘价:不复权[${d1}]`]) >=
                  Number(ele[findKeysWithPattern(ele, '区间最高价:不复权[', ']')[0]])

            let 昨日趋势 = 0
            if (obj[pd1]['涨跌幅'] > 2) {
                if (obj[pd1]['大单净额'] > 0) 昨日趋势 = 4
                if (obj['涨停'] && obj[pd1]['大单净额'] < 0) {
                    if (obj[pd1]['资金流向'] > 0) 昨日趋势 = 4
                    if (obj[pd1]['大单净额'] > obj[pd1]['资金流向']) 昨日趋势 = 4
                }
            }
            let 今日趋势 = 0
            if (
                obj['09:35']['涨跌幅'] > 0 &&
                obj['09:35']['涨跌幅'] >= obj['09:30']['涨跌幅'] &&
                (obj['09:35']['资金流向'] > 0 || obj['09:35']['大单净额'] > 0)
            ) {
                if (Blocks.checked.item && obj['09:35']['涨跌幅'] >= Blocks.checked.item['09:35']['涨跌幅']) {
                    今日趋势 = 3
                }
            }
            let 长期趋势 = obj['v60达成'] && obj['M60达成'] && obj['前40日'] ? 3 : 0

            obj['昨日趋势'] = Boolean(昨日趋势)
            obj['今日趋势'] = Boolean(今日趋势)
            obj['长期趋势'] = Boolean(长期趋势)

            let 扣分 = [
                obj['09:31']['大单净额'] < 0 &&
                obj['09:31']['资金流向'] < 0 &&
                ((obj['09:31']['大单净额'] >= obj['09:33']['大单净额'] &&
                    obj['09:33']['大单净额'] >= obj['09:35']['大单净额'] &&
                    obj['09:35']['大单净额'] < 0) ||
                    (obj['09:31']['资金流向'] >= obj['09:33']['资金流向'] &&
                        obj['09:33']['资金流向'] >= obj['09:35']['资金流向'] &&
                        obj['09:35']['资金流向'] < 0))
                    ? -3
                    : 0,
                obj['09:35']['大单净额'] < 0 &&
                obj['09:35']['资金流向'] < 0 &&
                obj['09:33']['大单净额'] < 0 &&
                obj['09:33']['资金流向'] < 0
                    ? -3
                    : 0,
                Blocks.checked.item && Blocks.checked.item['09:35']['涨跌幅'] > obj['09:35']['涨跌幅'] ? -6 : 0,
            ].reduce((accumulator, currentValue) => accumulator + currentValue, 0)
            obj['9:35打分'] =
                // `${昨日趋势} + ${今日趋势} + ${长期趋势}   + ${扣分}=` +
                Number(昨日趋势 + 今日趋势 + 长期趋势 + 扣分)
            return obj
        })
        .sort((a, b) => {
            return a['昨热度排名'] - b['昨热度排名']
        })
        .map((ele) => {
            ele[`_0935上涨个数`] = _0935上涨个数
            ele[`_当日上涨个数`] = _当日上涨个数
            return ele
        })
    console.log(Stocks.Data[0].base, '-----')
    Stocks.mySort(...Stocks.Sort_selected)
    submitTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}
function CheckedBlock(type, name, item = null) {
    if (Blocks.loading) return
    // if (type == '' || type == '-' || type == undefined || name == undefined) {
    //     Blocks.checked.name = '-'
    //     Blocks.checked.type = '-'
    // } else {
    Blocks.checked.name = name
    Blocks.checked.type = type
    Blocks.checked.item = item
    // }

    submitStocks()
}
const App = {
    setup() {
        onMounted(() => {
            Intervals.Id = [
                setInterval(Intervals.updateTime, 1000), // 每秒更新一次时间
            ]
            submit()
        })
        onUnmounted(() => {
            Intervals.arr.forEach((Id) => {
                clearInterval(Id) // 清除定时器
            })
        })
        return {
            Dates,
            submit,
            Blocks,
            CheckedBlock,
            Stocks,
            precentformater,
            formatNumber,
            Intervals,
            submitTime,
            nTOs,
            isMobile,
        }
    },
}
const app = Vue.createApp(App)
// console.log(ElementPlus, ElementPlusLocaleZhCn)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
app.mount('#app')
function findKeysWithPattern(obj, start, end) {
    let res = Object.keys(obj).filter((key) => key.startsWith(start) && key.endsWith(end))
    if (res.length > 1) {
        res = res.sort((a, b) => {
            return Number(a.substring(10, 18)) - Number(b.substring(10, 18))
        })
        console.log('findKeysWithPattern', res)
    }

    return res
}
function nTOs(e) {
    console.log(e, 'nTOsnTOs')
    if (typeof num === 'number') {
        return e + ''
    } else {
        return e
    }
}
