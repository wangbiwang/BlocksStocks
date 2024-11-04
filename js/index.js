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
        return Dates.DateList.includes(dayjs(cell.date).format('YYYYMMDD'))
    },
})

//查询问题相关
const text01 = '涨跌幅降序资金流向大单净额上涨家数/(上涨家数+下跌家数)'
const text1 = '(前1交易日成交量-前1交易日20日均量线)/前1交易日20日均量线'
const text2 = '前1交易日(M5和M10和M30和M60)'
const Questions = reactive({
    block: [
        `当日涨跌幅资金流向大单净额大单净量;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35${text01}；前1交易日涨跌幅资金流向大单净额大单净量；二级行业`,
        `当日涨跌幅资金流向大单净额大单净量;09:35${text01}；${text1}；${text2}；前1交易日收盘价；二级行业`,
        `当日涨跌幅资金流向大单净额大单净量;09:31涨跌幅资金流向大单净额;09:33涨跌幅资金流向大单净额;09:35${text01}；前1交易日涨跌幅资金流向大单净额大单净量；概念`,
        `当日涨跌幅资金流向大单净额大单净量;09:35${text01}；${text1}；${text2}；前1交易日收盘价；概念`,
    ],
    stock: [
        `前1交易日热度排名升序当日热度排名流通市值非st；当日涨跌幅资金流向大单净额大单净量收盘价；行业概念`,
        `前1交易日热度排名升序前40交易日区间最高价不复权;09:31涨跌幅资金流向大单净额股价；09:33涨跌幅资金流向大单净额股价；09:35涨跌幅资金流向大单净额股价；前1交易日涨跌幅资金流向大单净额大单净量；行业概念`,
        `前1交易日热度排名升序；${text1}；${text2}；前1交易日收盘价前复权；行业概念`,
    ],
})
//指数板块相关
const Blocks = reactive({
    checked: { type: '-', name: '-' },
    loading: false,
    headerData: [],
    Data: [
        { name: '实时行业策略排行', base: [], default: [], filter: [] },
        { name: '实时行业概念排行', base: [], default: [], filter: [] },
    ],
    RateSort: (e, i) => {
        // if (e == '9:35打分') {
        //     Blocks.loading = !Blocks.loading
        //     Blocks.Data[0].default = Blocks.Data[0].default.sort((a, b) => {
        //         return b['9:35打分'] - a['9:35打分']
        //     })
        //     Blocks.Data[1].default = Blocks.Data[1].default.sort((a, b) => {
        //         return b['9:35打分'] - a['9:35打分']
        //     })
        //     console.log(Blocks.Data[0].default, Blocks.Data[1].default)
        //     Blocks.RateSort_selected = e
        //     Blocks.loading = !Blocks.loading
        //     return
        // }
        if (i < 1 || i > 5) return
        console.log(e, i)
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
    Data: [{ name: '实时策略', base: [], default: [], filter: [] }],
    CheckedOptimum: true,
    CheckedOptimumFN: () => {
        console.log(Stocks.CheckedOptimum)
        if (Stocks.CheckedOptimum) {
            Stocks.Data[0].default = Stocks.Data[0].filter
        } else {
            Stocks.Data[0].default = Stocks.Data[0].base
        }
    },
    hoverBlocks: [],
    openUrl: (e) => {
        console.log(e)
        window.open(e)
    },
    handleMouseOver: (e) => {
        Stocks.hoverBlocks = [e['行业'] && e['行业'].split('-')[1], e['行业'], ...e['概念'].split(';')]
    },
    handleMouseLeave: () => {
        Stocks.hoverBlocks = []
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
}

//最后操作状态记录
const FinalOperatingState = reactive({
    searchDate: '',
})

//-----------------------------
async function submit(e) {
    let FinalOperatingState = getLocalStorage('FinalOperatingState') || {}
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
        setLocalStorage('FinalOperatingState', FinalOperatingState)
    } else {
        Dates.Today = dayjs().format('YYYYMMDD')
        FinalOperatingState.searchDate = ''
        setLocalStorage('FinalOperatingState', FinalOperatingState)
    }
    Dates.HistoryBtn = e
    let year_month = `${dayjs(Dates.Today).format('YYYY-MM')}`
    let DateListvalue = getLocalStorage(year_month)
    if (!DateListvalue) {
        let baseUrl = 'https://www.szse.cn/api/report/exchange/onepersistenthour/monthList?month='
        let _p1 = dayjs(Dates.Today).subtract(1, 'month').format('YYYY-MM')
        let _1 = dayjs(Dates.Today).format('YYYY-MM')
        let _n1 = dayjs(Dates.Today).add(1, 'month').format('YYYY-MM')
        let res = await Promise.all([
            axios({ method: 'get', url: baseUrl + _p1 }),
            axios({ method: 'get', url: baseUrl + _1 }),
            axios({ method: 'get', url: baseUrl + _n1 }),
        ])
        res = res
            .map((e) => {
                return e.data.data
                    .filter((e) => e.jybz == 1)
                    .map((e) => e.jyrq)
                    .map((e) => e.replaceAll('-', ''))
            })
            .flat()
        setLocalStorage(_1, res)
        DateListvalue = res
    }
    if (!DateListvalue.some((el) => el == Dates.Today)) {
        ElNotification({
            title: '当前选中日期非交易日！',
            type: 'error',
            position: 'top-right',
            duration: 3000,
        })
        return
    }
    Dates.DateList = DateListvalue
    Dates.yesterday = Dates.DateList[Dates.DateList.findIndex((el) => el == Dates.Today) - 1]
    let TimeTilArr = [Dates.Today, `09:35`, `09:33`, `09:31`, Dates.yesterday]
    Blocks.headerData = ['指数简称', ...TimeTilArr, '放量', 'M05', 'M10', 'M30', 'M60', '9:35打分']
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
        '放量',
        'M05',
        'M10',
        'M30',
        'M60',
        '前40日',
        '9:35打分',
    ]
    Blocks.Data[0].default = []
    Blocks.Data[1].default = []
    Stocks.Data[0].default = []
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
                .replaceAll('09:35', cn + '09:35')
                .replaceAll('09:33', cn + '09:33')
                .replaceAll('09:31', cn + '09:31')
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
                    console.log(el)
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
            console.log('submitBlocks', ...res)
            let errKey = []
            res.forEach((el, i) => {
                if (el.length > 0 && !el[0]['指数简称']) {
                    console.log('错误项：', el[0])
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
        console.log(resArr, 'resArr')
        return resArr.map((ele) => {
            let obj = {}
            obj['code'] = ele['code']
            obj['指数简称'] = ele['指数简称']
            obj[`${d1}`] = {
                涨跌幅: num(ele[`指数@涨跌幅:前复权[${d1}]`]),
                资金流向: num(ele[`指数@资金流向[${d1}]`]),
                大单净额: num(ele[`指数@dde大单净额[${d1}]`]),
                大单净量: num(ele[`指数@dde大单净量[${d1}]`]),
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
            obj[pd1] = {
                涨跌幅: num(ele[`指数@涨跌幅:前复权[${pd1}]`]),
                资金流向: num(ele[`指数@资金流向[${pd1}]`]),
                大单净额: num(ele[`指数@dde大单净额[${pd1}]`]),
                大单净量: num(ele[`指数@dde大单净量[${pd1}]`]),
                收盘价: num(ele[`指数@收盘价:不复权[${pd1}]`]),
            }

            // obj['上涨占比'] =
            //     Number(
            //         (ele[findKeysWithPattern(ele, '{(}指数@分时上涨家数', '09:35]{)}{)}')[0]] * 100).toFixed(1)
            //     ) + '%'

            obj['p收盘价'] = num(ele[`指数@收盘价:不复权[${pd1}]`])
            obj['放量'] = num(ele[findKeysWithPattern(ele, '{(}{(}指数@成交量[', ']{)}')[0]])
            obj['放量达成'] = obj['放量'] > 0
            obj['M05'] = num(ele[`5日指数@均线[${pd1}]`])
            obj['M05达成'] = obj['M05'] <= obj['p收盘价']
            obj['M10'] = num(ele[`10日指数@均线[${pd1}]`])
            obj['M10达成'] = obj['M05达成'] && obj['M10'] <= obj['p收盘价']
            obj['M30'] = num(ele[`30日指数@均线[${pd1}]`])
            obj['M30达成'] = obj['M10达成'] && obj['M30'] <= obj['p收盘价']
            obj['M60'] = num(ele[`60日指数@均线[${pd1}]`])
            obj['M60达成'] = obj['M30达成'] && obj['M60'] <= obj['p收盘价']

            let 长期趋势 =
                (obj['M05达成'] ? 1 : 0) +
                (obj['M10达成'] ? 1 : 0) +
                (obj['M30达成'] ? 1 : 0) +
                (obj['M60达成'] ? 2 : 0) //长期趋势占比50%

            let p涨跌 = obj[pd1]['涨跌幅'] > 0 ? 1 : -1
            let p资金p大单p放量 = (obj[pd1]['资金流向'] > 0 || obj[pd1]['大单净额'] > 0) && obj['放量达成'] ? 1 : -1
            let 昨日集合 = p涨跌 + p资金p大单p放量

            let _35涨跌 = obj['09:35']['涨跌幅'] > obj['09:31']['涨跌幅'] ? 1 : 0
            let _35资金 = obj['09:35']['资金流向'] > obj['09:31']['资金流向'] ? 1 : 0
            let _35大单 = obj['09:35']['大单净额'] > obj['09:31']['大单净额'] ? 1 : 0
            let _35集合 = _35涨跌 + _35资金 + _35大单 //资金大单涨跌幅方向

            let 扣分1 = obj['09:35']['资金流向'] < 0 && obj['09:35']['大单净额'] < 0 ? 5 : 0
            let 扣分2 = 扣分1 && obj['09:33']['资金流向'] < 0 && obj['09:33']['大单净额'] < 0 ? 5 : 0
            let 扣分3 = obj['09:35']['涨跌幅'] < obj['09:33']['涨跌幅'] ? 1 : 0
            let 扣分4 = obj['09:35']['涨跌幅'] < 0 ? 5 : 0
            let 扣分5 = obj['09:33']['涨跌幅'] < 0 && obj['09:35']['涨跌幅'] < 0 ? 5 : 0
            let 扣分6 =
                obj['09:31']['资金流向'] > obj['09:33']['资金流向'] &&
                obj['09:33']['资金流向'] > obj['09:35']['资金流向'] &&
                obj['09:31']['大单净额'] > obj['09:33']['大单净额'] &&
                obj['09:33']['大单净额'] > obj['09:35']['大单净额']
                    ? 5
                    : 0
            let 扣分 = 扣分1 + 扣分2 + 扣分3 + 扣分4 + 扣分5 + 扣分6

            obj['9:35打分'] =
                // `${长期趋势} + ${昨日集合} + 【${_35涨跌} +${_35资金}  +${_35大单}】  - ${扣分}=` +
                Number(长期趋势 + 昨日集合 + _35集合 - 扣分)

            return obj
        })
        // .slice(0, 5)
    }
    Blocks.Data[0].default = handleArr(res[0], res[1])
    Blocks.Data[1].default = handleArr(res[2], res[3])
    submitTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}
function submitStocks() {
    if (Stocks.loading) return
    Stocks.loading = true
    const requests = Questions.stock.map((el) => {
        if (Blocks.checked.type != '-' && Blocks.checked.name != '-') {
            let _name = Blocks.checked.name
            if (Blocks.checked.type == '概念') {
                // _name = _name.replace('概念', '').replace(')', '').replace('(', '')
                _name = _name.replace('封装光学(CPO)', '封装光学')

                el = el.replace('行业概念', `行业概念；所属概念包含${_name}；`)
            } else if (Blocks.checked.type == '行业') {
                el = el.replace('行业概念', `概念；所属二级行业包含${_name}；`)
            }
        }
        if (Dates.HistoryBtn == '历史') {
            // let cn = dayjs(Dates.HistoryDate).format('YYYY年MM月DD日')
            let cn = dayjs(Dates.Today).format('YYYY年MM月DD日')
            
            el = el
                .replaceAll('当日', cn)
                .replaceAll('09:35', cn + '09:35')
                .replaceAll('09:33', cn + '09:33')
                .replaceAll('09:31', cn + '09:31')
                .replaceAll('前', cn + '前')
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
                    console.log(el)
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
            console.log('submitStocks', ...res)
            //----
            let errKey = []
            res.forEach((el, i) => {
                if (el.length > 0 && !el[0]['股票简称']) {
                    console.log('错误项：', el[0])
                    errKey.push(i)
                }
            })
            console.log('errKey:', errKey)
            if (errKey.length > 0) {
                let errRequests = errKey.map((el) => {
                    return (el = requests[el])
                })
                console.log('errRequests:', errRequests)
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
            console.error('error!!!', error)
        })
        .finally(() => (Stocks.loading = false))
}
function handleStocksData(res) {
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

    Stocks.Data[0].base = res[0]
        .map((ele) => {
            let obj = {}
            ele = {
                ...ele,
                ...res[1].filter((el) => el['股票简称'] === ele['股票简称'])[0],
                ...res[2].filter((el) => el['股票简称'] === ele['股票简称'])[0],
            }
            obj['股票简称'] = ele['股票简称']
            obj['code'] = ele['code']
            obj['行业'] = ele['所属同花顺行业'] || ele['所属同花顺二级行业']
            obj['概念'] = ele['所属概念']

            obj['昨热度排名'] = ele[`个股热度排名[${pd1}]`]
            obj['今热度排名'] = ele[`个股热度排名[${d1}]`]
            obj['流通市值'] = ele[`a股市值(不含限售股)[${d1}]`]
            obj['股价'] = Number(ele[`收盘价:不复权[${d1}]`] || ele[`最新价`])

            obj[`${d1}`] = {
                涨跌幅: num(ele[`涨跌幅:前复权[${d1}]`]),
                资金流向: num(ele[`资金流向[${d1}]`]),
                大单净额: num(ele[`dde大单净额[${d1}]`]),
                大单净量: num(ele[`dde大单净量[${d1}]`]),
            }
            obj[`09:35`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:35]`]),
                资金流向: num(ele[`分时资金流向[${d1} 09:35]`]),
                大单净额: num(ele[`分时dde大单净额[${d1} 09:35]`]),
            }
            obj[`09:33`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:33]`]),
                资金流向: num(ele[`分时资金流向[${d1} 09:33]`]),
                大单净额: num(ele[`分时dde大单净额[${d1} 09:33]`]),
            }
            obj[`09:31`] = {
                涨跌幅: num(ele[`分时涨跌幅:前复权[${d1} 09:31]`]),
                资金流向: num(ele[`分时资金流向[${d1} 09:31]`]),
                大单净额: num(ele[`分时dde大单净额[${d1} 09:31]`]),
            }
            obj[pd1] = {
                涨跌幅: num(ele[`涨跌幅:前复权[${pd1}]`]),
                资金流向: num(ele[`资金流向[${pd1}]`]),
                大单净额: num(ele[`dde大单净额[${pd1}]`]),
                大单净量: num(ele[`dde大单净量[${pd1}]`]),
                收盘价: num(ele[`收盘价:前复权[${pd1}]`]),
            }

            obj['p收盘价'] = num(ele[`收盘价:前复权[${pd1}]`])
            obj['放量'] = num(ele[findKeysWithPattern(ele, '{(}{(}成交量[', ']{)}')[0]])
            obj['放量达成'] = obj['放量'] > 0
            obj['M05'] = num(ele[`5日均线[${pd1}]`])
            obj['M05达成'] = obj['M05'] <= obj['p收盘价']
            obj['M10'] = num(ele[`10日均线[${pd1}]`])
            obj['M10达成'] = obj['M05达成'] && obj['M10'] <= obj['p收盘价']
            obj['M30'] = num(ele[`30日均线[${pd1}]`])
            obj['M30达成'] = obj['M10达成'] && obj['M30'] <= obj['p收盘价']
            obj['M60'] = num(ele[`60日均线[${pd1}]`])
            obj['M60达成'] = obj['M30达成'] && obj['M60'] <= obj['p收盘价']
            obj['前40日'] =
                Number(ele[`分时收盘价:不复权[${d1} 09:35]`]) >=
                Number(ele[findKeysWithPattern(ele, '区间最高价:不复权[', ']')[0]])

            let 长期趋势 =
                (obj['M05达成'] ? 1 : 0) +
                (obj['M10达成'] ? 1 : 0) +
                (obj['M30达成'] ? 1 : 0) +
                (obj['M60达成'] ? 1 : 0) +
                (obj['前40日'] ? 1 : 0) //长期趋势占比50%

            let p涨跌 = obj[pd1]['涨跌幅'] > 0 ? 1 : -1
            let p资金p大单p放量 = (obj[pd1]['资金流向'] > 0 || obj[pd1]['大单净额'] > 0) && obj['放量达成'] ? 1 : -1
            let 昨日集合 = p涨跌 + p资金p大单p放量

            let _35涨跌 = obj['09:35']['涨跌幅'] > obj['09:31']['涨跌幅'] ? 1 : 0
            let _35资金 = obj['09:35']['资金流向'] > obj['09:31']['资金流向'] ? 1 : 0
            let _35大单 = obj['09:35']['大单净额'] > obj['09:31']['大单净额'] ? 1 : 0
            let _35集合 = _35涨跌 + _35资金 + _35大单 //资金大单涨跌幅方向

            let 扣分1 = obj['09:35']['资金流向'] < 0 && obj['09:35']['大单净额'] < 0 ? 5 : 0
            let 扣分2 = 扣分1 && obj['09:33']['资金流向'] < 0 && obj['09:33']['大单净额'] < 0 ? 5 : 0
            let 扣分3 = obj['09:35']['涨跌幅'] < obj['09:33']['涨跌幅'] ? 1 : 0
            let 扣分4 = obj['09:35']['涨跌幅'] < 1 ? 5 : 0
            let 扣分5 = obj['09:33']['涨跌幅'] < 0 && obj['09:35']['涨跌幅'] < 0 ? 5 : 0
            let 扣分6 =
                obj['09:31']['资金流向'] > obj['09:33']['资金流向'] &&
                obj['09:33']['资金流向'] > obj['09:35']['资金流向'] &&
                obj['09:31']['大单净额'] > obj['09:33']['大单净额'] &&
                obj['09:33']['大单净额'] > obj['09:35']['大单净额']
                    ? 5
                    : 0
            let 扣分 = 扣分1 + 扣分2 + 扣分3 + 扣分4 + 扣分5 + 扣分6

            obj['9:35打分'] =
                // `${长期趋势} + ${昨日集合} + 【${_35涨跌} +${_35资金}  +${_35大单}】  - ${扣分}=` +
                Number(长期趋势 + 昨日集合 + _35集合 - 扣分)
            return obj
        })
        // ${obj['M05'] <= obj['p收盘价'] && obj['M30'] <= obj['p收盘价'] && obj['M60'] <= obj['p收盘价'] ? 1 : 0} +
        .sort((a, b) => {
            return a['昨热度排名'] - b['昨热度排名']
        })
        .filter((el) => {
            return !/^68/.test(el.code) && !/^8/.test(el.code)
        })
        .map((ele, idx) => {
            ele['序号'] = idx + 1
            return ele
        })
    Stocks.Data[0].filter = Stocks.Data[0].base.filter((obj) => {
        return obj['9:35打分'] >= 8 || (obj['前40日'] && obj['9:35打分'] >= 5)
    })
    Stocks.CheckedOptimumFN()

    submitTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}
function CheckedBlock(type, name) {
    if (Blocks.loading) return
    if (type == '' || type == '-' || type == undefined || name == undefined) {
        Blocks.checked.name = '-'
        Blocks.checked.type = '-'
    } else {
        Blocks.checked.name = name
        Blocks.checked.type = type
    }

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
        }
    },
}
const app = Vue.createApp(App)
console.log(ElementPlus, ElementPlusLocaleZhCn)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
app.mount('#app')
function findKeysWithPattern(obj, start, end) {
    return Object.keys(obj).filter((key) => key.startsWith(start) && key.endsWith(end))
}
