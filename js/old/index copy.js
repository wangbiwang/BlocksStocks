const { createApp, onMounted, onUnmounted, ref, reactive, computed } = Vue
const { ElNotification } = ElementPlus

/*
      { setLocalforage,getLocalforage,getQuestions,precentformater } from ./utils.js
      { hexin_vJsRequests } from ../lib/hexin-v.js
       dayjs from ../lib/dayjs.js
      { calcLongTrend , calcYesterdayMomentum , calcTodayAlignment} from ./strategy.js
*/

/** @description Date Management Module - Contains all date logic and hardcoded configurations */
const Dates = reactive({
    requestDate: null,
    Today: dayjs().format('YYYYMMDD'),
    historicalDate: [],
    shareDate: {},

    // Initialization: includes fetching logic
    init: async (catcheGetFunction, catcheSetFunction) => {
        const FD = (await catcheGetFunction('Dates')) || { historicalDate: [] }

        try {
            // Calculate fetchSize directly within logic, without extracting constants
            const size = FD.historicalDate?.length > 0 ? 320 : (Number(dayjs().format('YYYY')) - 2021 + 1) * 270
            const url = `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,,,${size},qfq`

            const { status, data } = await axios.get(url)
            if (status === 200 && data) {
                const parsed = JSON.parse(String(data).replace('kline_dayqfq=', ''))
                const shData = parsed?.data?.sh000001
                if (shData?.day) {
                    const fetchedArr = shData.day.map((e) => dayjs(e[0]).format('YYYYMMDD'))
                    // Market open status compensation
                    const mt = shData.qt?.market?.[0]?.split('|') || []
                    if (mt[2]?.includes('open')) fetchedArr.push(dayjs().format('YYYYMMDD'))
                    // Merge, deduplicate, sort
                    FD.historicalDate = [...new Set([...(FD.historicalDate || []), ...fetchedArr])].sort((a, b) => a - b)
                    await catcheSetFunction('Dates', FD)
                }
            }
        } catch (err) {
            console.error('Dates.init Error', err)
        }

        Dates.historicalDate = FD.historicalDate || []
        Dates.requestDate = Dates.requestDate || Dates.Today
        return Dates.historicalDate
    },

    disabledDate: (time) => {
        const d = dayjs(time)
        const fmt = d.format('YYYYMMDD')
        // Range limit: 2021 to present
        if (d.isBefore('2021-01-01') || d.isAfter(dayjs()) || d.day() === 0 || d.day() === 6) return true
        return !Dates.historicalDate.includes(fmt)
    },

    setRequestDate: (date) => {
        Dates.requestDate = dayjs(date || Dates.Today).format('YYYYMMDD')
    },

    setShareDate: () => {
        const list = Dates.historicalDate || []
        const td = Dates.requestDate
        const idx = list.indexOf(td)
        // Closure function to safely get dates
        const getSafe = (offset) => (idx !== -1 && idx + offset >= 0 ? list[idx + offset] : null)
        dayjs(new Date()).format('YYYYMMDD') == td
        const isToday = dayjs(new Date()).format('YYYYMMDD') == td
        Dates.shareDate = {
            isToday,
            td,
            tdcn: dayjs(td).format('YYYY年MM月DD日'),
            pd1: getSafe(-1),
            pd2: getSafe(-2),
            pd3: getSafe(-3),
            nd1: getSafe(1),
            nd2: getSafe(2),
            nd3: getSafe(3),
            nd4: getSafe(4),
            nd5: getSafe(5),
            TimeTilArr: [td, '09:35', '09:33', '09:31', '09:30', getSafe(-1)].filter(Boolean),
        }
    },


})

/** @description Block Module - Built-in retry logic */
const Blocks = reactive({
    loading: false,
    isCache: false,
    Data: [
        { name: 'Blocks-HY', filters: [] },
        { name: 'Blocks-GN', filters: [] },
    ],
    checked: null,
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        // debugger
        const { tdcn } = dates
        const questions = getQuestions('block', dates)
        const cache = (await catcheGetFunction('Blocks')) || {}
        const target = cache[tdcn]

        // Validation logic: cache is valid as long as structure matches current questions
        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Blocks.isCache = true
            Blocks.requestStatus = questions.map((_, i) => ({
                name: `Block ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleBlocksData(target)
        } else {
            Blocks.isCache = false
            await Blocks.getData(questions, catcheSetFunction, cache, dates)
        }
    },
    getHistoryData: async (catcheGetFunction, catcheSetFunction, dates) => {
        // Implementation for fetching historical block data
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
        const { tdcn, isToday } = dates
        // debugger
        Blocks.loading = true
        Blocks.Data[0].filters = Blocks.Data[1].filters = []
        // 初始化每个请求的状态
        Blocks.requestStatus = questions.map((_, i) => ({
            name: `Block ${i + 1}`,
            status: 'wait',
            message: 'Not started',
        }))

        // 定义局部重试次数变量
        const MAX_RETRY_ATTEMPTS = 2

        const results = []
        for (let i = 0; i < questions.length; i++) {
            let success = false
            let attempt = 0
            const expected = i < 2 ? 90 : 100
            // 逐次初始化每个请求的状态
            Blocks.requestStatus[i] = {
                name: `Request ${i + 1}`,
                status: 'process',
                message: 'Loading...',
            }
            // 内置重试循环
            while (attempt <= MAX_RETRY_ATTEMPTS && !success) {
                try {
                    if (attempt > 0) {
                        Blocks.requestStatus[i].message = `Retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`
                        await new Promise((r) => setTimeout(r, 1000))
                    }
                    if (i === 4) type = 'stock'
                    const res = await axios(hexin_vJsRequests('zhishu', questions[i]))
                    const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                    const count = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.meta.extra.row_count
                    console.log('Block Data Fetched:', data)

                    if (Array.isArray(data) && (data.length >= expected || validateDataArray(data, BlockKeyArr))) {
                        results[i] = data.map((el, idx) => {
                            el.count = count
                            el.rank = idx + 1
                            return el
                        }) // 设置总数并返回对象
                        Blocks.requestStatus[i].status = 'success'
                        Blocks.requestStatus[i].message = `Success (${data.length})`
                        success = true
                    } else {
                        console.log('Invalid Length', res?.data?.data?.answer[0].txt[0].content.components[0].data.meta.extra.iwc_column_info)
                        throw new Error('Invalid Length')
                    }
                } catch (e) {
                    attempt++
                    if (attempt > MAX_RETRY_ATTEMPTS) {
                        Blocks.requestStatus[i].status = 'error'
                        Blocks.requestStatus[i].message = 'Failed to fetch'

                        // Stop subsequent requests if retries are exhausted
                        for (let j = i + 1; j < questions.length; j++) {
                            Blocks.requestStatus[j] = {
                                name: `Request ${j + 1}`,
                                status: 'wait',
                                message: 'Skipped (previous request failed)',
                            }
                        }

                        Blocks.loading = false
                        return
                    }
                }
            }
        }

        if (results.filter(Boolean).length === questions.length) {
            cache[tdcn] = results
            if (!isToday) await catcheSetFunction('Blocks', cache)
            handleBlocksData(results)
        }
        Blocks.loading = false
    },


})

// Single entry for block request progress UI display
Blocks.getDataStatus = () => {
    const list = Array.isArray(Blocks.requestStatus) ? Blocks.requestStatus : []
    const total = list.length

    if (!total) {
        return {
            total: 0,
            currentIndex: -1,
            currentReq: null,
            progressText: '-/-',
            statusClass: '',
        }
    }

    const idxProcess = list.findIndex((r) => r?.status === 'process')

    let currentIndex = idxProcess
    if (currentIndex < 0) {
        // No "process" means requests are either finished (success/error) or not started (wait)
        let lastActiveIndex = -1
        for (let k = list.length - 1; k >= 0; k--) {
            if (list[k]?.status && list[k].status !== 'wait') {
                lastActiveIndex = k
                break
            }
        }
        currentIndex = lastActiveIndex >= 0 ? lastActiveIndex : 0
    }

    const currentReq = list[currentIndex] || null

    const progressText = `${currentIndex + 1}/${total}`

    const status = currentReq?.status === 'error' ? 'error' : currentReq?.status
    const statusClass = status ? `status-${status}` : ''

    return { total, currentIndex, currentReq, progressText, statusClass }
}

/** @description Stock Module - Optimized multi-table aggregation efficiency */
const Stocks = reactive({
    loading: false,
    Data: [{ name: 'Real-time Strategy', base: [], filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates, blockItem, blockType, blockName) => {
        const { tdcn, isToday } = dates
        const questions = getQuestions('stock', dates, blockType, blockName)
        const cacheKey = `${tdcn}-${blockType}-${blockName}`
        const cache = (await catcheGetFunction('Stocks')) || {}

        if (cache[cacheKey]?.length === questions.length) {
            Stocks.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleStocksData(cache[cacheKey], blockItem)
        } else {
            await Stocks.getData(questions, catcheSetFunction, cache, cacheKey, blockItem, blockType, blockName, isToday)
        }
    },

    getData: async (questions, catcheSetFunction, cache, cacheKey, blockItem, blockType, blockName, isToday) => {
        Stocks.loading = true
        Stocks.Data[0].filters = []
        // 初始化每个请求的状态
        Stocks.requestStatus = questions.map((_, i) => ({
            name: `Request ${i + 1}`,
            status: 'wait',
            message: 'Not started',
        }))

        // 逐个处理请求而不是并行处理
        const results = []
        for (let i = 0; i < questions.length; i++) {
            // 更新状态为 process
            Stocks.requestStatus[i].status = 'process'
            Stocks.requestStatus[i].message = 'Loading...'

            try {
                const res = await axios(hexin_vJsRequests('stock', questions[i]))
                const data = res.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                const count = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.meta.extra.row_count
                results[i] = data.map((el, idx) => {
                    el.count = count
                    el.rank = idx + 1
                    return el
                }) // 设置总数并返回对象
                Stocks.requestStatus[i].status = 'success'
                Stocks.requestStatus[i].message = 'Request successful'
            } catch (err) {
                ElNotification.error({ title: 'Load Failed', message: `Request ${i + 1} failed` })
                Stocks.requestStatus[i].status = 'error'
                Stocks.requestStatus[i].message = 'Failed to fetch'
            }
        }

        if (results.every((res) => Array.isArray(res))) {
            cache[cacheKey] = results
            if (!isToday) await catcheSetFunction('Stocks', cache)
            handleStocksData(results, blockItem)
        } else {
            // 如果有请求失败，更新对应状态（catch 中已更新，这里可省略）
            for (let i = 0; i < results.length; i++) {
                if (!Array.isArray(results[i])) {
                    Stocks.requestStatus[i].status = 'error'
                    Stocks.requestStatus[i].message = 'Failed to fetch'
                }
            }
        }

        Stocks.loading = false
    },


})

// Single entry for stock request progress UI display
Stocks.getDataStatus = () => {
    const list = Array.isArray(Stocks.requestStatus) ? Stocks.requestStatus : []
    const total = list.length

    if (!total) {
        return {
            total: 0,
            currentIndex: -1,
            currentReq: null,
            progressText: '-/-',
            statusClass: '',
        }
    }

    const idxProcess = list.findIndex((r) => r?.status === 'process')

    let currentIndex = idxProcess
    if (currentIndex < 0) {
        // No "process" means requests are either finished (success/error) or not started (wait)
        let lastActiveIndex = -1
        for (let k = list.length - 1; k >= 0; k--) {
            if (list[k]?.status && list[k].status !== 'wait') {
                lastActiveIndex = k
                break
            }
        }
        currentIndex = lastActiveIndex >= 0 ? lastActiveIndex : 0
    }

    const currentReq = list[currentIndex] || null

    const progressText = `${currentIndex + 1}/${total}`

    const status = currentReq?.status === 'error' ? 'error' : currentReq?.status
    const statusClass = status ? `status-${status}` : ''

    return { total, currentIndex, currentReq, progressText, statusClass }
}

/** --- Data Processing and Calculation --- **/

async function handleBlocksData(res) {
    const process = (arr1, arr2) => {
        // Use Map for O(1) lookups, avoiding nested loops that cause O(n^2)
        const map2 = new Map(arr2.map(el => { el.qRank = el.rank; delete el.rank; return el }).map((i) => [i.code, i]))
        let arr = arr1
            .filter((i) => map2.has(i.code))
            .map((ele) => {
                const merged = { ...ele, ...map2.get(ele.code) }
                const obj = {}
                // if (ele['指数简称'] == "华为海思概念股") {
                //     debugger
                // }

                // Strategy calculation consolidation
                handleRate(obj, merged, 'block', Dates.shareDate)
                calcYesterdayMomentum(obj, 'block', Dates.shareDate)
                calcLongTrend(obj, 'block', Dates.shareDate)
                calcTodayAlignment(obj, 'block', Dates.shareDate)
                return obj
            })
        return selectStrong(arr, maxCount = 20, 'block')
    }
    Blocks.Data[0].filters = process(res[0], res[1])
    Blocks.Data[1].filters = process(res[2], res[3])
}

async function handleStocksData(res, blockItem) {
    if (!res[0]) return
    // Convert remaining tables to Maps
    const maps = res.slice(1).map((arr) => new Map(arr?.map((i) => [i.code, i]) || []))
    let arr = res[0].map((ele) => {
        // Use reduce to merge data from multiple tables into ele
        const merged = maps.reduce((acc, m) => ({ ...acc, ...(m.get(ele.code) || {}) }), { ...ele })
        const obj = {}
        handleRate(obj, merged, 'stock', Dates.shareDate)
        calcYesterdayMomentum(obj, 'stock', Dates.shareDate, blockItem)
        calcLongTrend(obj, 'stock', Dates.shareDate, blockItem)
        calcTodayAlignment(obj, merged, 'stock', Dates.shareDate, blockItem)
        return obj
    })
    Stocks.Data[0].base = selectStrong(arr, maxCount = 100, 'stock')
    // filters初始与base相同
    Stocks.Data[0].filters = [...Stocks.Data[0].base]
}

async function CheckedBlock(type, name, item = null) {
    if (Stocks.loading) return
    // 更新Blocks.checked状态
    Blocks.checked = { type, name, item }
    // 调用Stocks.init
    await Stocks.init(getLocalforage, setLocalforage, Dates.shareDate, item, type, name)
}

/** --- App Setup --- **/
const App = {
    setup() {
        const Intervals = reactive({
            timer: null,
            time: '-',
            updateTime: () => (Intervals.time = dayjs().format('YYYY-MM-DD HH:mm:ss')),
        })

        const Submit = async () => {
            Blocks.Data[0].filters = Blocks.Data[1].filters = []
            Stocks.Data[0].filters = Stocks.requestStatus = []
            Dates.setRequestDate(Dates.requestDate)
            Dates.setShareDate()
            Blocks.init(getLocalforage, setLocalforage, Dates.shareDate)

            // //----
            // const { td, tdcn, nd1, nd2, nd3, nd4, nd5 } = Dates.shareDate
            // const other = `${tdcn}(M5和M10和M30和M60)均小于${tdcn}收盘价;${tdcn}大单净量创${tdcn}前30交易日区间新高;${td}涨跌幅${nd1}涨跌幅资金流向大单净额${nd2}涨跌幅${nd3}涨跌幅${nd4}涨跌幅;${nd1}日09:35分涨跌幅
            //  ${td}热度排名${nd1}热度排名;`
            // const res = await axios(hexin_vJsRequests('stock', other))
            // let data = res.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
            // let newData = data.map(ele => {
            //     let obj = []
            //     obj['0'] = ele['股票简称']
            //     obj['nd0'] = Number(ele[`涨跌幅:前复权[${td}]`]).toFixed(1)
            //     obj['nd1'] = Number(ele[`涨跌幅:前复权[${nd1}]`]).toFixed(1)
            //     obj['nd2'] = Number(ele[`涨跌幅:前复权[${nd2}]`]).toFixed(1)
            //     obj['nd3'] = Number(ele[`涨跌幅:前复权[${nd3}]`]).toFixed(1)
            //     obj['nd4'] = Number(ele[`涨跌幅:前复权[${nd4}]`]).toFixed(1)
            //     // obj['nd5'] = Number(ele[`涨跌幅:前复权[${nd5}]`]).toFixed(1)

            //     obj['_nd0排名'] = ele[`个股热度排名[${td}]`] || 9999
            //     obj['_nd1排名'] = ele[`个股热度排名[${nd1}]`] || 9999
            //     obj[`09:35`] = {
            //         涨跌幅:   precentformater(ele[`分时涨跌幅:前复权[${nd1} 09:35]`]),
            //         资金流向: formatNumber(ele[`分时资金流向[${nd1} 09:35]`]),
            //         大单净额: formatNumber(ele[`分时dde大单净额[${nd1} 09:35]`]),
            //     }
            //     // obj['_nd2排名'] = ele[`个股热度排名[${nd2}]`] || 9999
            //     // obj['_nd3排名'] = ele[`个股热度排名[${nd3}]`] || 9999
            //     // obj['_nd4排名'] = ele[`个股热度排名[${nd4}]`] || 9999
            //     // obj['nd5排名'] = ele[`个股热度排名[${nd5}]`] || 9999


            //     return obj
            // }).filter(e => e['nd0'] > 0 && e['09:35'] > 0 )
            // const count = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.meta.extra.row_count
            // console.log(newData, data, count, other.length)
        }
        onMounted(async () => {
            Intervals.timer = setInterval(Intervals.updateTime, 1000)
            // Process: Date processing -> Get yesterday's block calcLongTrend and calcYesterdayMomentum data (cache) -> Get today's block calcTodayAlignment data
            // -> Get today's stock calcLongTrend, calcYesterdayMomentum and calcTodayAlignment data
            await Dates.init(getLocalforage, setLocalforage)
            Dates.setShareDate() // Get today's date
        })

        onUnmounted(() => clearInterval(Intervals.timer))



        return {
            Intervals,
            Dates,
            Blocks,
            Stocks,
            Submit,
            precentformater,
            formatNumber,
            isMobile,
            CheckedBlock
        }
    },


}

const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
app.mount('#app')
