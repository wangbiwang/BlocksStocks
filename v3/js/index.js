const { createApp, onMounted, onUnmounted, reactive, computed } = Vue

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
                    FD.historicalDate = [...new Set([...(FD.historicalDate || []), ...fetchedArr])].sort(
                        (a, b) => a - b,
                    )
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
        const isToday = dayjs(new Date()).format('YYYYMMDD') == td
        Dates.shareDate = {
            isToday,
            td,
            tdcn: dayjs(td).format('YYYY年MM月DD日'),
            pd1: getSafe(-1),
            pd1cn: dayjs(getSafe(-1)).format('YYYY年MM月DD日'),
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

/** @description Industries Module */
const Industries = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: '行业策略', filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        const { tdcn } = dates
        const questions = getQuestions('block-行业', dates)
        const cache = (await catcheGetFunction('Industries')) || {}
        const target = cache[tdcn]

        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Industries.isFromCache = true
            Industries.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleIndustriesData(target)
            Industries.loading = false
        } else {
            Industries.isFromCache = false
            await Industries.getData(questions, catcheSetFunction, cache, dates)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
        const { tdcn, isToday } = dates
        Industries.loading = true
        Industries.isFromCache = false
        Industries.Data[0].filters = []

        Industries.requestStatus = questions.map((_, i) => ({
            name: `Request ${i + 1}`,
            status: 'wait',
            message: 'Not started',
        }))

        const MAX_RETRY_ATTEMPTS = 2
        const results = []

        for (let i = 0; i < questions.length; i++) {
            let success = false
            let attempt = 0

            Industries.requestStatus[i] = {
                name: `Request ${i + 1}`,
                status: 'process',
                message: 'Loading...',
            }

            while (attempt <= MAX_RETRY_ATTEMPTS && !success) {
                try {
                    if (attempt > 0) {
                        Industries.requestStatus[i].message = `Retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`
                        await new Promise((r) => setTimeout(r, 1000))
                    }

                    const res = await axios(hexin_vJsRequests('zhishu', questions[i]))
                    const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                    console.log('行业',data)
                    if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) {
                        results[i] = data
                        Industries.requestStatus[i].status = 'success'
                        Industries.requestStatus[i].message = `Success (${data.length})`
                        success = true
                    } else {
                        throw new Error('Invalid data')
                    }
                } catch (e) {
                    attempt++
                    if (attempt > MAX_RETRY_ATTEMPTS) {
                        Industries.requestStatus[i].status = 'error'
                        Industries.requestStatus[i].message = 'Failed to fetch'
                        for (let j = i + 1; j < questions.length; j++) {
                            Industries.requestStatus[j] = {
                                name: `Request ${j + 1}`,
                                status: 'wait',
                                message: 'Skipped',
                            }
                        }
                        Industries.loading = false
                        return
                    }
                }
            }
        }

        if (results.filter(Boolean).length === questions.length) {
            cache[tdcn] = results
            if (!isToday) await catcheSetFunction('Industries', cache)
            handleIndustriesData(results)
        }
        Industries.loading = false
    },
})

/** @description Concepts Module */
const Concepts = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: '概念策略', filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        const { tdcn } = dates
        const questions = getQuestions('block-概念', dates)
        const cache = (await catcheGetFunction('Concepts')) || {}
        const target = cache[tdcn]

        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Concepts.isFromCache = true
            Concepts.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleConceptsData(target)
            Concepts.loading = false
        } else {
            Concepts.isFromCache = false
            await Concepts.getData(questions, catcheSetFunction, cache, dates)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
        const { tdcn, isToday } = dates
        Concepts.loading = true
        Concepts.isFromCache = false
        Concepts.Data[0].filters = []

        Concepts.requestStatus = questions.map((_, i) => ({
            name: `Request ${i + 1}`,
            status: 'wait',
            message: 'Not started',
        }))

        const MAX_RETRY_ATTEMPTS = 2
        const results = []

        for (let i = 0; i < questions.length; i++) {
            let success = false
            let attempt = 0

            Concepts.requestStatus[i] = {
                name: `Request ${i + 1}`,
                status: 'process',
                message: 'Loading...',
            }

            while (attempt <= MAX_RETRY_ATTEMPTS && !success) {
                try {
                    if (attempt > 0) {
                        Concepts.requestStatus[i].message = `Retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`
                        await new Promise((r) => setTimeout(r, 1000))
                    }

                    const res = await axios(hexin_vJsRequests('zhishu', questions[i]))
                    const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                    console.log('概念',data)
                    if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) {
                        results[i] = data
                        Concepts.requestStatus[i].status = 'success'
                        Concepts.requestStatus[i].message = `Success (${data.length})`
                        success = true
                    } else {
                        throw new Error('Invalid data')
                    }
                } catch (e) {
                    attempt++
                    if (attempt > MAX_RETRY_ATTEMPTS) {
                        Concepts.requestStatus[i].status = 'error'
                        Concepts.requestStatus[i].message = 'Failed to fetch'
                        for (let j = i + 1; j < questions.length; j++) {
                            Concepts.requestStatus[j] = {
                                name: `Request ${j + 1}`,
                                status: 'wait',
                                message: 'Skipped',
                            }
                        }
                        Concepts.loading = false
                        return
                    }
                }
            }
        }

        if (results.filter(Boolean).length === questions.length) {
            cache[tdcn] = results
            if (!isToday) await catcheSetFunction('Concepts', cache)
            handleConceptsData(results)
        }
        Concepts.loading = false
    },
})

/** @description Match Chart Module - 用于管理匹配图的选中状态和筛选模式 */
const MatchChart = reactive({
    industryFilterMode: 'strong', // 行业筛选模式：'all' | 'strong'
    conceptFilterMode: 'strong', // 概念筛选模式：'all' | 'strong'
    stockFilterMode: 'all', // Stock 筛选模式：'all' | 'strong'
    selectedStock: null, // 当前选中的 Stock
})

/** @description Stocks Module */
const Stocks = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: 'Stock 策略', filters: [] }],
    requestStatus: [],
    selectedBlockName: null, // 当前选中的板块名称
    currentBlockType: null, // 当前板块类型：'行业' 或 '概念'

    // 按板块请求 Stock 数据（支持缓存）
    fetchByBlock: async (blockName, blockType, dates) => {
        const { tdcn, isToday } = dates
        const cacheKey = `${tdcn}_${blockType}_${blockName}`

        Stocks.loading = true
        Stocks.selectedBlockName = blockName
        Stocks.currentBlockType = blockType
        Stocks.Data[0].filters = []

        const questions = getQuestions('stock', dates, blockType, blockName)

        // 检查缓存
        const cache = (await getLocalforage('Stocks')) || {}
        const target = cache[cacheKey]
        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Stocks.isFromCache = true
            Stocks.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleStocksData(target)
            Stocks.loading = false
            return
        }

        // 无缓存，请求数据
        Stocks.isFromCache = false
        Stocks.requestStatus = questions.map((_, i) => ({
            name: `Request ${i + 1}`,
            status: 'wait',
            message: 'Not started',
        }))

        const MAX_RETRY_ATTEMPTS = 2
        const results = []

        for (let i = 0; i < questions.length; i++) {
            let success = false
            let attempt = 0

            Stocks.requestStatus[i].status = 'process'
            Stocks.requestStatus[i].message = 'Loading...'

            while (attempt <= MAX_RETRY_ATTEMPTS && !success) {
                try {
                    if (attempt > 0) {
                        Stocks.requestStatus[i].message = `Retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`
                        await new Promise((r) => setTimeout(r, 1000))
                    }

                    const res = await axios(hexin_vJsRequests('stock', questions[i]))
                    const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
                    console.log('Stocks',data)
                    if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) {
                        results[i] = data
                        Stocks.requestStatus[i].status = 'success'
                        Stocks.requestStatus[i].message = `Success (${data.length})`
                        success = true
                    } else {
                        throw new Error('Invalid data')
                    }
                } catch (e) {
                    attempt++
                    if (attempt > MAX_RETRY_ATTEMPTS) {
                        Stocks.requestStatus[i].status = 'error'
                        Stocks.requestStatus[i].message = 'Failed to fetch'
                    }
                }
            }
        }

        if (results.filter(Boolean).length === questions.length) {
            cache[cacheKey] = results
            if (!isToday) await setLocalforage('Stocks', cache)
            handleStocksData(results)
        }
        Stocks.loading = false
    },

    // 清空 Stock 数据
    clear: async () => {
        const { tdcn } = Dates.shareDate
        const blockName = Stocks.selectedBlockName
        const blockType = Stocks.currentBlockType

        // 清除当前板块的缓存
        if (blockName && blockType) {
            const cacheKey = `${tdcn}_${blockType}_${blockName}`
            const cache = (await getLocalforage('Stocks')) || {}
            delete cache[cacheKey]
            await setLocalforage('Stocks', cache)
        }

        Stocks.Data[0].filters = []
        Stocks.requestStatus = []
        Stocks.selectedBlockName = null
        Stocks.currentBlockType = null
        Stocks.isFromCache = false
    },
})

/** @description Data Processing Functions */
async function handleIndustriesData(res) {
    // 内连接合并：只保留同时在 res[0] 和 res[1] 中存在的 code
    // res[0] 按09:35涨跌幅降序，下标即为09:35排名
    // res[1] 按昨日涨跌幅降序，下标即为昨日排名
    const map0 = new Map(res[0]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])
    const map1 = new Map(res[1]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])

    const mergedArr = []
    map0.forEach((value0, code) => {
        if (map1.has(code)) {
            const value1 = map1.get(code)
            const merged = { ...value0.item, ...value1.item }
            // 排名字段：根据数组下标确定
            merged['09:35涨跌幅排名'] = value0.rank
            merged['昨日涨跌幅排名'] = value1.rank
            const obj = {}
            handleRate(obj, merged, 'block', Dates.shareDate)
            mergedArr.push(obj)
        }
    })

    Industries.Data[0].filters = mergedArr
}

async function handleConceptsData(res) {
    // 内连接合并：只保留同时在 res[0] 和 res[1] 中存在的 code
    // res[0] 按09:35涨跌幅降序，下标即为09:35排名
    // res[1] 按昨日涨跌幅降序，下标即为昨日排名
    const map0 = new Map(res[0]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])
    const map1 = new Map(res[1]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])

    const mergedArr = []
    map0.forEach((value0, code) => {
        if (map1.has(code)) {
            const value1 = map1.get(code)
            const merged = { ...value0.item, ...value1.item }
            // 排名字段：根据数组下标确定
            merged['09:35涨跌幅排名'] = value0.rank
            merged['昨日涨跌幅排名'] = value1.rank
            const obj = {}
            handleRate(obj, merged, 'block', Dates.shareDate)
            mergedArr.push(obj)
        }
    })

    Concepts.Data[0].filters = mergedArr
}

async function handleStocksData(res) {
    const { td, pd1 } = Dates.shareDate
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])

    // 先合并所有数据
    const mergedArr = []
    map0.forEach((item0, code) => {
        let merged = { ...item0 }
        if (map1.has(code)) {
            merged = { ...merged, ...map1.get(code) }
        }
        mergedArr.push({ code, merged })
    })

    // 计算09:35涨跌幅排名
    const sortedBy0935 = [...mergedArr].sort((a, b) => {
        const aChange = Number(a.merged[`分时涨跌幅:前复权[${td} 09:35]`]) || -Infinity
        const bChange = Number(b.merged[`分时涨跌幅:前复权[${td} 09:35]`]) || -Infinity
        return bChange - aChange
    })
    const rank0935Map = new Map(sortedBy0935.map((item, index) => [item.code, index + 1]))

    // 计算昨日涨跌幅排名
    const sortedByPd1 = [...mergedArr].sort((a, b) => {
        const aChange = Number(a.merged[`涨跌幅:前复权[${pd1}]`]) || -Infinity
        const bChange = Number(b.merged[`涨跌幅:前复权[${pd1}]`]) || -Infinity
        return bChange - aChange
    })
    const rankPd1Map = new Map(sortedByPd1.map((item, index) => [item.code, index + 1]))

    // 最终处理
    const result = []
    mergedArr.forEach(({ code, merged }) => {
        merged['09:35涨跌幅排名'] = rank0935Map.get(code) || 9999
        merged['昨日涨跌幅排名'] = rankPd1Map.get(code) || 9999

        const obj = {}
        handleRate(obj, merged, 'stock', Dates.shareDate)
        result.push(obj)
    })

    Stocks.Data[0].filters = result
}

/**
 * 判断 Block 是否强势（用于 Stock 匹配）
 */
function isBlockStrong(item, dates) {
    const pd1Change = item[dates.pd1]?.涨跌幅 ?? -Infinity
    const pd1NetInflow = item[dates.pd1]?.大单净额 ?? -Infinity
    const pd1CapitalFlow = item[dates.pd1]?.资金流向 ?? -Infinity
    const td0935Change = item[`${dates.td} 09:35`]?.涨跌幅 ?? -Infinity
    const td0935CapitalFlow = item[`${dates.td} 09:35`]?.资金流向 ?? -Infinity
    const td0935NetInflow = item[`${dates.td} 09:35`]?.大单净额 ?? -Infinity
    const td0933CapitalFlow = item[`${dates.td} 09:33`]?.资金流向 ?? -Infinity
    const td0933NetInflow = item[`${dates.td} 09:33`]?.大单净额 ?? -Infinity
    const td0933Change = item[`${dates.td} 09:33`]?.涨跌幅 ?? -Infinity
    const pd1WinRate = item['昨日上涨家数占比'] ?? 0
    const pd1LimitUpCount = item['昨日涨停数'] ?? 0
    const M01 = item.M01 ?? 0
    const M05 = item.M05 ?? 0
    const M10 = item.M10 ?? 0
    const M21 = item.M21 ?? 0
    const M60 = item.M60 ?? 0
    const v01 = item.v01 ?? 0
    const v05 = item.v05 ?? 0
    const v10 = item.v10 ?? 0

    // 新概念判断：v01和M01有值，但M05、M10、v05、v10都没有值
    const isNewConcept = v01 > 0 && M01 > 0 && M05 === 0 && M10 === 0 && v05 === 0 && v10 === 0

    const pd1Volume = item[dates.pd1]?.成交量 ?? -Infinity
    const pd2Volume = item[dates.pd2]?.成交量 ?? -Infinity
    const pd2NetInflow = item[dates.pd2]?.大单净额 ?? -Infinity
    const volumeCondition = pd1Volume > pd2Volume || pd1NetInflow > pd2NetInflow

    const high5 = item['前5交易日区间最高价'] ?? 0
    const breakoutCondition = M01 >= high5 * 0.965 && high5 > 0

    const rank0935 = item['09:35涨跌幅排名'] ?? 9999
    const rankYesterday = item['昨日涨跌幅排名'] ?? 9999
    const rankCondition = rank0935 <= 5 && rankYesterday <= 10

    // 极热板块：涨停数>=5 且 上涨家数占比>=85%
    const isSuperHot = pd1LimitUpCount >= 5 && pd1WinRate >= 85

    // 极热板块资金全负且恶化时筛除（行业适用，新概念除外）
    const flowAllNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
    const flowAllWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
    const superHotButWeak = isSuperHot && flowAllNegative && flowAllWorsening && !isNewConcept

    // 基础条件：涨跌幅和资金，但极热板块放宽资金要求
    const baseCondition = pd1Change > 1.5 && td0935Change > 0.5 && (pd1NetInflow > 0 || isSuperHot)
    const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
    const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
    const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
    const maBullish =
        pd1CapitalFlow > 0 && pd1NetInflow > 0
            ? M01 > M05 && M01 > M10 && M01 > M21
            : M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60
    const maOrFlowCondition = M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)
    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
    const allImproving =
        td0935Change > td0933Change && td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
    const flowCondition = isSuperHot || !flowNegative || allImproving
    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
    const lowChange = td0935Change < 1
    const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
    const flowImprovingBoth = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
    const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

    return (
        baseCondition &&
        (isSuperHot || flowPositive || flowImproving) &&
        blockHeat &&
        maBullish &&
        maOrFlowCondition &&
        flowCondition &&
        (isSuperHot || !flowWorsening) &&
        lowChangeCondition &&
        volumeCondition &&
        breakoutCondition &&
        rankCondition &&
        !superHotButWeak
    )
}

/** @description App Setup */
const App = {
    setup() {
        const Intervals = reactive({
            timer: null,
            time: '-',
            updateTime: () => (Intervals.time = dayjs().format('YYYY-MM-DD HH:mm:ss')),
        })

        const GlobalState = reactive({
            isRequesting: false,
            isDarkTheme: true,

            toggleTheme: () => {
                GlobalState.isDarkTheme = !GlobalState.isDarkTheme
                const body = document.body
                if (GlobalState.isDarkTheme) {
                    body.classList.add('dark-theme')
                    body.classList.remove('light-theme')
                } else {
                    body.classList.add('light-theme')
                    body.classList.remove('dark-theme')
                }
            },
        })

        // 自动切换状态
        const Backtest = reactive({
            isRunning: false,
            shouldStop: false,
            timeoutId: null, // 存储定时器引用
            intervalSeconds: 30, // 切换间隔时间（秒），可配置
            consecutiveErrors: 0, // 连续错误计数器
            result: {
                totalDays: 0,
                buyableDays: 0,
                winDays: 0,
                winRate: '0%',
            },
        })

        // 初始化主题
        onMounted(() => {
            if (GlobalState.isDarkTheme) {
                document.body.classList.add('dark-theme')
            } else {
                document.body.classList.add('light-theme')
            }
        })

        const Submit = async () => {
            // 设置请求状态
            GlobalState.isRequesting = true
            Industries.loading = true
            Concepts.loading = true

            // 清空数据
            Industries.Data[0].filters = []
            Concepts.Data[0].filters = []
            Industries.requestStatus = []
            Concepts.requestStatus = []

            // 清空 Stock 数据
            Stocks.clear()

            Dates.setRequestDate(Dates.requestDate)
            Dates.setShareDate()

            try {
                // 只请求 Block 数据，Stock 点击板块时再请求
                await Promise.all([
                    Industries.init(getLocalforage, setLocalforage, Dates.shareDate),
                    Concepts.init(getLocalforage, setLocalforage, Dates.shareDate),
                ])
            } finally {
                // 无论成功失败都恢复按钮状态
                GlobalState.isRequesting = false
                Industries.loading = false
                Concepts.loading = false
            }
        }

        const changeDate = (direction) => {
            const list = Dates.historicalDate || []
            const current = Dates.requestDate
            const idx = list.indexOf(current)

            if (idx === -1) return

            const newIdx = idx + direction
            if (newIdx >= 0 && newIdx < list.length) {
                Dates.requestDate = list[newIdx]
                Submit()
            }
        }

        // 跳转到下一个有 Block 强势筛选结果的日期
        const jumpToValidDate = async (direction) => {
            const list = Dates.historicalDate || []
            const current = Dates.requestDate
            const idx = list.indexOf(current)

            if (idx === -1) return

            GlobalState.isRequesting = true
            Industries.loading = true
            Concepts.loading = true

            try {
                // 从下一个日期开始遍历
                for (let i = idx + direction; i >= 0 && i < list.length; i += direction) {
                    const targetDate = list[i]

                    // 临时设置日期
                    Dates.requestDate = targetDate
                    Dates.setRequestDate(targetDate)
                    Dates.setShareDate()

                    // 清空并重新加载数据
                    Industries.Data[0].filters = []
                    Concepts.Data[0].filters = []
                    Stocks.Data[0].filters = []

                    // 等待数据加载完成
                    await Promise.all([
                        Industries.init(getLocalforage, setLocalforage, Dates.shareDate, null, null, null),
                        Concepts.init(getLocalforage, setLocalforage, Dates.shareDate, null, null, null),
                    ])

                    // 检查是否有强势筛选结果
                    const industryCount = displayIndustries.value?.length || 0
                    const conceptCount = displayConcepts.value?.length || 0

                    if (industryCount > 0 || conceptCount > 0) {
                        // 找到有效日期，停止遍历
                        console.log(`找到有效日期：${targetDate}, 行业：${industryCount}, 概念：${conceptCount}`)
                        break
                    }
                }
            } finally {
                GlobalState.isRequesting = false
                Industries.loading = false
                Concepts.loading = false
            }
        }

        // 计算属性：强势行业数量（用于 badge 显示）
        const strongIndustriesCount = computed(() => {
            const result = Industries.Data[0].filters.filter((item) => {
                const v01 = item.v01 ?? 0
                const v05 = item.v05 ?? 0
                const v10 = item.v10 ?? 0
                const M01 = item.M01 ?? 0
                const M05 = item.M05 ?? 0
                const M10 = item.M10 ?? 0
                const M21 = item.M21 ?? 0
                const M60 = item.M60 ?? 0
                const pd1WinRate = item['昨日上涨家数占比'] ?? 0
                const pd1LimitUpCount = item['昨日涨停数'] ?? 0
                const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const pd1NetInflow = item[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                const rank0935 = item['09:35涨跌幅排名'] ?? 9999
                const rankYesterday = item['昨日涨跌幅排名'] ?? 9999
                const isNewConcept =
                    v01 > 0 && M01 > 0 && M05 === 0 && M10 === 0 && v05 === 0 && v10 === 0 && rankYesterday === 1 && rank0935 === 1
                const rankCondition = (rankYesterday <= 10 || pd1Change > 2) && rank0935 <= 5 && td0935Change > 0.75
                const volumeCondition = v01 > v05 && v01 > v10
                const blockHeat = pd1WinRate >= 60 && pd1LimitUpCount >= 1
                const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                const td0933ChangeCondition = td0933Change > 0
                const pd1ChangeCondition = pd1Change > 1.5
                const pd1NetInflowCondition = pd1NetInflow > 0
                const td0935FlowCondition = td0935CapitalFlow > 0 || td0935NetInflow > 0
                const maBullishFull = M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60 && M05 > 0 && M10 > 0 && M21 > 0 && M60 > 0
                const maBullishBasic = M01 > M05 && M01 > M10 && M01 > M21 && M05 > 0 && M10 > 0 && M21 > 0
                const maRelaxCondition = pd1Change > 3 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                const maSuperRelaxCondition = pd1Change > 5 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                const maBullish = maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition
                const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
                return (
                    isNewConcept ||
                    (rankCondition && volumeCondition && blockHeat && td0933ChangeCondition && pd1ChangeCondition && pd1NetInflowCondition && td0935FlowCondition && maBullish && !flowWorsening)
                )
            })
            return result.length
        })

        // 计算属性：显示的行业列表（根据筛选模式）
        const displayIndustries = computed(() => {
            let result = Industries.Data[0].filters

            // 强势筛选逻辑
            if (MatchChart.industryFilterMode === 'strong') {
                result = result.filter((item) => {
                    const v01 = item.v01 ?? 0
                    const v05 = item.v05 ?? 0
                    const v10 = item.v10 ?? 0
                    const M01 = item.M01 ?? 0
                    const M05 = item.M05 ?? 0
                    const M10 = item.M10 ?? 0
                    const M21 = item.M21 ?? 0
                    const M60 = item.M60 ?? 0
                    const pd1WinRate = item['昨日上涨家数占比'] ?? 0
                    const pd1LimitUpCount = item['昨日涨停数'] ?? 0
                    const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const pd1NetInflow = item[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                    const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity

                    // 排名
                    const rank0935 = item['09:35涨跌幅排名'] ?? 9999
                    const rankYesterday = item['昨日涨跌幅排名'] ?? 9999

                    // 新概念判断：v01>0 且 M01>0，但M05/M10/v05/v10都为0，且排名都为1
                    const isNewConcept =
                        v01 > 0 &&
                        M01 > 0 &&
                        M05 === 0 &&
                        M10 === 0 &&
                        v05 === 0 &&
                        v10 === 0 &&
                        rankYesterday === 1 &&
                        rank0935 === 1

                    // 条件1：排名条件 - (昨日排名前10 或 昨日涨幅>2) 且 (09:35排名<=5 且 09:35涨幅>0.75)
                    const rankCondition = (rankYesterday <= 10 || pd1Change > 2) && rank0935 <= 5 && td0935Change > 0.75

                    // 条件2：成交量条件 - v1 > v5 且 v1 > v10
                    const volumeCondition = v01 > v05 && v01 > v10

                    // 条件3：板块热度 - 昨日上涨家数占比 >= 60% 且 昨日涨停数 >= 1
                    const blockHeat = pd1WinRate >= 60 && pd1LimitUpCount >= 1

                    // 条件4：09:33涨跌幅 > 0
                    const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                    const td0933ChangeCondition = td0933Change > 0

                    // 条件5：昨日涨跌幅 > 1.5
                    const pd1ChangeCondition = pd1Change > 1.5

                    // 条件6：昨日大单净额 > 0
                    const pd1NetInflowCondition = pd1NetInflow > 0

                    // 条件7：09:35资金流向或大单净额至少一个为正
                    const td0935FlowCondition = td0935CapitalFlow > 0 || td0935NetInflow > 0

                    // 条件8：均线多头 - M01 > M05 且 M01 > M10 且 M01 > M21 且 M01 > M60
                    // 放宽条件1：昨日涨跌幅>3 且 昨日资金流向>0 且 昨日大单净额>0 时，只需 M01 > M05 > M10 > M21
                    // 放宽条件2：昨日涨跌幅>5 且 昨日资金流向>0 且 昨日大单净额>0 时，不需要均线条件
                    // 注意：M05/M10/M21/M60 必须都 > 0 才有意义
                    const maBullishFull =
                        M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60 && M05 > 0 && M10 > 0 && M21 > 0 && M60 > 0
                    const maBullishBasic = M01 > M05 && M01 > M10 && M01 > M21 && M05 > 0 && M10 > 0 && M21 > 0
                    const maRelaxCondition = pd1Change > 3 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                    const maSuperRelaxCondition = pd1Change > 5 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                    const maBullish = maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition

                    // 排除条件：09:35资金流向和大单净额都小于09:33（资金恶化）
                    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

                    return (
                        isNewConcept ||
                        (rankCondition &&
                            volumeCondition &&
                            blockHeat &&
                            td0933ChangeCondition &&
                            pd1ChangeCondition &&
                            pd1NetInflowCondition &&
                            td0935FlowCondition &&
                            maBullish &&
                            !flowWorsening)
                    )
                })
            }

            // 排序：按 09:35 涨跌幅降序
            result.sort((a, b) => {
                const aChange = a[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const bChange = b[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                return bChange - aChange
            })

            return result
        })

        // 计算属性：强势概念数量（用于 badge 显示）
        const strongConceptsCount = computed(() => {
            const result = Concepts.Data[0].filters.filter((item) => {
                const v01 = item.v01 ?? 0
                const v05 = item.v05 ?? 0
                const v10 = item.v10 ?? 0
                const M01 = item.M01 ?? 0
                const M05 = item.M05 ?? 0
                const M10 = item.M10 ?? 0
                const M21 = item.M21 ?? 0
                const M60 = item.M60 ?? 0
                const pd1WinRate = item['昨日上涨家数占比'] ?? 0
                const pd1LimitUpCount = item['昨日涨停数'] ?? 0
                const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const pd1NetInflow = item[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                const rank0935 = item['09:35涨跌幅排名'] ?? 9999
                const rankYesterday = item['昨日涨跌幅排名'] ?? 9999
                const isNewConcept =
                    v01 > 0 && M01 > 0 && M05 === 0 && M10 === 0 && v05 === 0 && v10 === 0 && rankYesterday === 1 && rank0935 === 1
                const rankCondition = (rankYesterday <= 10 || pd1Change > 2) && rank0935 <= 5 && td0935Change > 0.75
                const volumeCondition = v01 > v05 && v01 > v10
                const blockHeat = pd1WinRate >= 60 && pd1LimitUpCount >= 1
                const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                const td0933ChangeCondition = td0933Change > 0
                const pd1ChangeCondition = pd1Change > 1.5
                const pd1NetInflowCondition = pd1NetInflow > 0
                const td0935FlowCondition = td0935CapitalFlow > 0 || td0935NetInflow > 0
                const maBullishFull = M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60 && M05 > 0 && M10 > 0 && M21 > 0 && M60 > 0
                const maBullishBasic = M01 > M05 && M01 > M10 && M01 > M21 && M05 > 0 && M10 > 0 && M21 > 0
                const maRelaxCondition = pd1Change > 3 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                const maSuperRelaxCondition = pd1Change > 5 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                const maBullish = maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition
                const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
                return (
                    isNewConcept ||
                    (rankCondition && volumeCondition && blockHeat && td0933ChangeCondition && pd1ChangeCondition && pd1NetInflowCondition && td0935FlowCondition && maBullish && !flowWorsening)
                )
            })
            return result.length
        })

        // 计算属性：显示的概念列表（根据筛选模式）
        const displayConcepts = computed(() => {
            let result = Concepts.Data[0].filters

            // 强势筛选逻辑
            if (MatchChart.conceptFilterMode === 'strong') {
                result = result.filter((item) => {
                    const v01 = item.v01 ?? 0
                    const v05 = item.v05 ?? 0
                    const v10 = item.v10 ?? 0
                    const M01 = item.M01 ?? 0
                    const M05 = item.M05 ?? 0
                    const M10 = item.M10 ?? 0
                    const M21 = item.M21 ?? 0
                    const M60 = item.M60 ?? 0
                    const pd1WinRate = item['昨日上涨家数占比'] ?? 0
                    const pd1LimitUpCount = item['昨日涨停数'] ?? 0
                    const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const pd1NetInflow = item[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                    const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity

                    // 排名
                    const rank0935 = item['09:35涨跌幅排名'] ?? 9999
                    const rankYesterday = item['昨日涨跌幅排名'] ?? 9999

                    // 新概念判断：v01>0 且 M01>0，但M05/M10/v05/v10都为0，且排名都为1
                    const isNewConcept =
                        v01 > 0 &&
                        M01 > 0 &&
                        M05 === 0 &&
                        M10 === 0 &&
                        v05 === 0 &&
                        v10 === 0 &&
                        rankYesterday === 1 &&
                        rank0935 === 1

                    // 条件1：排名条件 - (昨日排名前10 或 昨日涨幅>2) 且 (09:35排名<=5 且 09:35涨幅>0.75)
                    const rankCondition = (rankYesterday <= 10 || pd1Change > 2) && rank0935 <= 5 && td0935Change > 0.75

                    // 条件2：成交量条件 - v1 > v5 且 v1 > v10
                    const volumeCondition = v01 > v05 && v01 > v10

                    // 条件3：板块热度 - 昨日上涨家数占比 >= 60% 且 昨日涨停数 >= 1
                    const blockHeat = pd1WinRate >= 60 && pd1LimitUpCount >= 1

                    // 条件4：09:33涨跌幅 > 0
                    const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                    const td0933ChangeCondition = td0933Change > 0

                    // 条件5：昨日涨跌幅 > 1.5
                    const pd1ChangeCondition = pd1Change > 1.5

                    // 条件6：昨日大单净额 > 0
                    const pd1NetInflowCondition = pd1NetInflow > 0

                    // 条件7：09:35资金流向或大单净额至少一个为正
                    const td0935FlowCondition = td0935CapitalFlow > 0 || td0935NetInflow > 0

                    // 条件8：均线多头 - M01 > M05 且 M01 > M10 且 M01 > M21 且 M01 > M60
                    // 放宽条件1：昨日涨跌幅>3 且 昨日资金流向>0 且 昨日大单净额>0 时，只需 M01 > M05 > M10 > M21
                    // 放宽条件2：昨日涨跌幅>5 且 昨日资金流向>0 且 昨日大单净额>0 时，不需要均线条件
                    // 注意：M05/M10/M21/M60 必须都 > 0 才有意义
                    const maBullishFull =
                        M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60 && M05 > 0 && M10 > 0 && M21 > 0 && M60 > 0
                    const maBullishBasic = M01 > M05 && M01 > M10 && M01 > M21 && M05 > 0 && M10 > 0 && M21 > 0
                    const maRelaxCondition = pd1Change > 3 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                    const maSuperRelaxCondition = pd1Change > 5 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                    const maBullish = maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition

                    // 排除条件：09:35资金流向和大单净额都小于09:33（资金恶化）
                    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

                    return (
                        isNewConcept ||
                        (rankCondition &&
                            volumeCondition &&
                            blockHeat &&
                            td0933ChangeCondition &&
                            pd1ChangeCondition &&
                            pd1NetInflowCondition &&
                            td0935FlowCondition &&
                            maBullish &&
                            !flowWorsening)
                    )
                })
            }

            // 排序：按 09:35 涨跌幅降序
            result.sort((a, b) => {
                const aChange = a[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const bChange = b[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                return bChange - aChange
            })

            return result
        })

        // 计算属性：显示的 Stock 列表（根据筛选模式）
        const displayStocks = computed(() => {
            // 如果没有选中板块，返回空数组
            if (!Stocks.selectedBlockName) {
                return []
            }

            // 获取当前选中Block的数据，判断是否满足均线放宽条件2
            const blockName = Stocks.selectedBlockName
            const blockList = Stocks.currentBlockType === '行业' ? Industries.Data[0].filters : Concepts.Data[0].filters
            const currentBlock = blockList.find((b) => b['指数简称'] === blockName)
            let blockMaSuperRelax = false
            let blockTd0935CapitalFlow = 0
            let blockTd0935NetInflow = 0
            if (currentBlock) {
                const blockPd1Change = currentBlock[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const blockPd1CapitalFlow = currentBlock[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const blockPd1NetInflow = currentBlock[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                blockMaSuperRelax = blockPd1Change > 5 && blockPd1CapitalFlow > 0 && blockPd1NetInflow > 0
                // Block 09:35资金流向和大单净额
                blockTd0935CapitalFlow = currentBlock[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                blockTd0935NetInflow = currentBlock[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            }

            // 根据筛选模式返回数据
            let result = Stocks.Data[0].filters

            // 强势筛选：应用强势条件
            if (MatchChart.stockFilterMode === 'strong') {
                result = result.filter((stock) => {
                    const v01 = stock['v01'] || 0
                    const v05 = stock['v05'] || 0
                    const v10 = stock['v10'] || 0
                    const M01 = stock['M01'] || 0
                    const M05 = stock['M05'] || 0
                    const M10 = stock['M10'] || 0
                    const M21 = stock['M21'] || 0
                    const M60 = stock['M60'] || 0
                    const td0935Change = stock[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const td0935CapitalFlow = stock[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const td0935NetInflow = stock[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const td0933CapitalFlow = stock[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const td0933NetInflow = stock[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                    const pd1Change = stock[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const pd1NetInflowVol = stock[Dates.shareDate.pd1]?.大单净量 ?? -Infinity
                    const pd1CapitalFlow = stock[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const pd1NetInflow = stock[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                    const isPd1LimitUp = stock['昨日涨停'] || false

                    // 条件1：成交量条件 - v01 > v05 且 v01 > v10
                    const volumeCondition = v01 > v05 && v01 > v10

                    // 条件2：均线多头 - M01 > M05 且 M01 > M10 且 M01 > M21 且 M01 > M60
                    // 放宽条件1：昨日涨停时不需要均线条件
                    // 放宽条件2：完整多头取反 且 放宽1取反 且 Block放宽2(涨幅>5且资金正) 且 Stock涨幅>6且资金正
                    const maBullishFull = M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60
                    const stockMaSuperRelax = pd1Change > 6 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                    const maBullish =
                        maBullishFull ||
                        isPd1LimitUp ||
                        (!maBullishFull && !isPd1LimitUp && blockMaSuperRelax && stockMaSuperRelax)

                    // 条件3：09:35涨跌幅 > 0
                    const changeCondition = td0935Change > 0

                    // 条件4：昨日涨跌幅 > 5
                    const pd1ChangeCondition = pd1Change > 5

                    // 条件5：昨日大单净量 > 0.4 或者 昨日资金流向>0 且 昨日大单净额>0
                    const pd1NetInflowCondition = pd1NetInflowVol > 0.4 || (pd1CapitalFlow > 0 && pd1NetInflow > 0)

                    // 排除条件1：0 < 09:35资金流向 < 09:33资金流向 且 0 < 09:35大单净额 < 09:33大单净额
                    const flowWorsening =
                        td0935CapitalFlow > 0 &&
                        td0935CapitalFlow < td0933CapitalFlow &&
                        td0935NetInflow > 0 &&
                        td0935NetInflow < td0933NetInflow

                    // 排除条件2：Block 09:35资金或大单有其中一个不为正 且 Stock 09:35资金流向和大单净额都为负 → 排除
                    const stockTd0935FlowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                    const blockTd0935NotAllPositive = !(blockTd0935CapitalFlow > 0 && blockTd0935NetInflow > 0)
                    const blockStockFlowMismatch = blockTd0935NotAllPositive && stockTd0935FlowNegative

                    return (
                        volumeCondition &&
                        maBullish &&
                        changeCondition &&
                        pd1ChangeCondition &&
                        pd1NetInflowCondition &&
                        !flowWorsening &&
                        !blockStockFlowMismatch
                    )
                })
            }

            // 按热度排名升序排序
            result.sort((a, b) => {
                const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                return aHeat - bHeat
            })

            return result.map((s) => ({ ...s }))
        })

        // 计算属性：强势Stock数量（用于 badge 显示）
        const strongStocksCount = computed(() => {
            if (!Stocks.selectedBlockName) {
                return 0
            }
            const blockName = Stocks.selectedBlockName
            const blockList = Stocks.currentBlockType === '行业' ? Industries.Data[0].filters : Concepts.Data[0].filters
            const currentBlock = blockList.find((b) => b['指数简称'] === blockName)
            let blockMaSuperRelax = false
            let blockTd0935CapitalFlow = 0
            let blockTd0935NetInflow = 0
            if (currentBlock) {
                const blockPd1Change = currentBlock[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const blockPd1CapitalFlow = currentBlock[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const blockPd1NetInflow = currentBlock[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                blockMaSuperRelax = blockPd1Change > 5 && blockPd1CapitalFlow > 0 && blockPd1NetInflow > 0
                blockTd0935CapitalFlow = currentBlock[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                blockTd0935NetInflow = currentBlock[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            }
            const result = Stocks.Data[0].filters.filter((stock) => {
                const v01 = stock['v01'] || 0
                const v05 = stock['v05'] || 0
                const v10 = stock['v10'] || 0
                const M01 = stock['M01'] || 0
                const M05 = stock['M05'] || 0
                const M10 = stock['M10'] || 0
                const M21 = stock['M21'] || 0
                const M60 = stock['M60'] || 0
                const td0935Change = stock[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const td0935CapitalFlow = stock[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                const td0935NetInflow = stock[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                const td0933CapitalFlow = stock[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                const td0933NetInflow = stock[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                const pd1Change = stock[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const pd1NetInflowVol = stock[Dates.shareDate.pd1]?.大单净量 ?? -Infinity
                const pd1CapitalFlow = stock[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const pd1NetInflow = stock[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                const isPd1LimitUp = stock['昨日涨停'] || false
                const volumeCondition = v01 > v05 && v01 > v10
                const maBullishFull = M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60
                const stockMaSuperRelax = pd1Change > 6 && pd1CapitalFlow > 0 && pd1NetInflow > 0
                const maBullish =
                    maBullishFull ||
                    isPd1LimitUp ||
                    (!maBullishFull && !isPd1LimitUp && blockMaSuperRelax && stockMaSuperRelax)
                const changeCondition = td0935Change > 0
                const pd1ChangeCondition = pd1Change > 5
                const pd1NetInflowCondition = pd1NetInflowVol > 0.4 || (pd1CapitalFlow > 0 && pd1NetInflow > 0)
                const flowWorsening =
                    td0935CapitalFlow > 0 &&
                    td0935CapitalFlow < td0933CapitalFlow &&
                    td0935NetInflow > 0 &&
                    td0935NetInflow < td0933NetInflow
                const stockTd0935FlowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                const blockTd0935NotAllPositive = !(blockTd0935CapitalFlow > 0 && blockTd0935NetInflow > 0)
                const blockStockFlowMismatch = blockTd0935NotAllPositive && stockTd0935FlowNegative
                return (
                    volumeCondition &&
                    maBullish &&
                    changeCondition &&
                    pd1ChangeCondition &&
                    pd1NetInflowCondition &&
                    !flowWorsening &&
                    !blockStockFlowMismatch
                )
            })
            return result.length
        })

        // 切换行业筛选模式
        const toggleIndustryFilterMode = (mode) => {
            MatchChart.industryFilterMode = mode
        }

        // 切换概念筛选模式
        const toggleConceptFilterMode = (mode) => {
            MatchChart.conceptFilterMode = mode
        }

        // 切换 Stock 筛选模式
        const toggleStockFilterMode = (mode) => {
            MatchChart.stockFilterMode = mode
        }

        // 处理行业行点击 - 触发 Stock 数据请求
        const handleIndustryRowClick = async (row) => {
            MatchChart.selectedStock = null
            const blockName = row['指数简称']

            // 请求该板块的 Stock 数据
            await Stocks.fetchByBlock(blockName, '行业', Dates.shareDate)

            // 打印强势筛选各项条件状态
            const v01 = row.v01 ?? 0
            const v05 = row.v05 ?? 0
            const v10 = row.v10 ?? 0
            const M01 = row.M01 ?? 0
            const M05 = row.M05 ?? 0
            const M10 = row.M10 ?? 0
            const M21 = row.M21 ?? 0
            const M60 = row.M60 ?? 0
            const pd1WinRate = row['昨日上涨家数占比'] ?? 0
            const pd1LimitUpCount = row['昨日涨停数'] ?? 0
            const td0935Change = row[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
            const pd1Change = row[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
            const pd1NetInflow = row[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
            const pd1CapitalFlow = row[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
            const td0935CapitalFlow = row[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
            const td0935NetInflow = row[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
            const rank0935 = row['09:35涨跌幅排名'] ?? 9999
            const rankYesterday = row['昨日涨跌幅排名'] ?? 9999

            // 新概念判断
            const isNewConcept =
                v01 > 0 &&
                M01 > 0 &&
                M05 === 0 &&
                M10 === 0 &&
                v05 === 0 &&
                v10 === 0 &&
                rankYesterday === 1 &&
                rank0935 === 1

            // 条件1：排名条件 - (昨日排名前10 或 昨日涨幅>2) 且 (09:35排名<=5 且 09:35涨幅>0.75)
            const rankCondition = (rankYesterday <= 10 || pd1Change > 2) && rank0935 <= 5 && td0935Change > 0.75

            // 条件2：成交量条件 - v1 > v5 且 v1 > v10
            const volumeCondition = v01 > v05 && v01 > v10

            // 条件3：板块热度
            const blockHeat = pd1WinRate >= 60 && pd1LimitUpCount >= 1

            // 条件4：09:33涨跌幅 > 0
            const td0933Change = row[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
            const td0933ChangeCondition = td0933Change > 0

            // 条件5：昨日涨跌幅
            const pd1ChangeCondition = pd1Change > 1.5

            // 条件6：昨日大单净额
            const pd1NetInflowCondition = pd1NetInflow > 0

            // 条件7：09:35资金流向或大单净额至少一个为正
            const td0935FlowCondition = td0935CapitalFlow > 0 || td0935NetInflow > 0

            // 条件8：均线多头
            const maBullishFull =
                M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60 && M05 > 0 && M10 > 0 && M21 > 0 && M60 > 0
            const maBullishBasic = M01 > M05 && M01 > M10 && M01 > M21 && M05 > 0 && M10 > 0 && M21 > 0
            const maRelaxCondition = pd1Change > 3 && pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maSuperRelaxCondition = pd1Change > 5 && pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish = maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition

            // 排除条件：资金恶化
            const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

            // 最终结果
            const isStrong =
                isNewConcept ||
                (rankCondition &&
                    volumeCondition &&
                    blockHeat &&
                    td0933ChangeCondition &&
                    pd1ChangeCondition &&
                    pd1NetInflowCondition &&
                    td0935FlowCondition &&
                    maBullish &&
                    !flowWorsening)

            console.log(`=== 行业强势筛选分析 - ${blockName} ===`, {
                新概念判断: {
                    v01: v01,
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    v05: v05,
                    v10: v10,
                    昨日排名: rankYesterday,
                    '09:35排名': rank0935,
                    是否新概念: isNewConcept,
                },
                '条件1-排名': {
                    昨日排名: rankYesterday,
                    昨日涨跌幅: pd1Change,
                    '09:35排名': rank0935,
                    '09:35涨跌幅': td0935Change,
                    是否满足: rankCondition,
                },
                '条件2-成交量': {
                    v01: v01,
                    v05: v05,
                    v10: v10,
                    是否满足: volumeCondition,
                },
                '条件3-板块热度': {
                    昨日上涨家数占比: pd1WinRate,
                    昨日涨停数: pd1LimitUpCount,
                    是否满足: blockHeat,
                },
                '条件4-09:33涨幅': {
                    '09:33涨跌幅': td0933Change,
                    是否满足: td0933ChangeCondition,
                },
                '条件5-昨日涨幅': {
                    昨日涨跌幅: pd1Change,
                    是否满足: pd1ChangeCondition,
                },
                '条件6-昨日大单': {
                    昨日大单净额: pd1NetInflow,
                    是否满足: pd1NetInflowCondition,
                },
                '条件7-09:35资金': {
                    '09:35资金流向': td0935CapitalFlow,
                    '09:35大单净额': td0935NetInflow,
                    是否满足: td0935FlowCondition,
                },
                '条件8-均线多头': {
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    M21: M21,
                    M60: M60,
                    均线完整多头: maBullishFull,
                    均线基本多头: maBullishBasic,
                    '放宽条件(昨日涨幅>3且资金正)': maRelaxCondition,
                    '超放宽条件(昨日涨幅>5且资金正)': maSuperRelaxCondition,
                    是否满足: maBullish,
                },
                '排除条件-资金恶化': {
                    '09:35资金流向': td0935CapitalFlow,
                    '09:33资金流向': td0933CapitalFlow,
                    '09:35大单净额': td0935NetInflow,
                    '09:33大单净额': td0933NetInflow,
                    是否恶化: flowWorsening,
                },
                最终结果: isStrong,
            })
        }

        // 处理概念行点击 - 触发 Stock 数据请求
        const handleConceptRowClick = async (row) => {
            MatchChart.selectedStock = null
            const blockName = row['指数简称']

            // 请求该板块的 Stock 数据
            await Stocks.fetchByBlock(blockName, '概念', Dates.shareDate)

            // 打印强势筛选各项条件状态
            const v01 = row.v01 ?? 0
            const v05 = row.v05 ?? 0
            const v10 = row.v10 ?? 0
            const M01 = row.M01 ?? 0
            const M05 = row.M05 ?? 0
            const M10 = row.M10 ?? 0
            const M21 = row.M21 ?? 0
            const M60 = row.M60 ?? 0
            const pd1WinRate = row['昨日上涨家数占比'] ?? 0
            const pd1LimitUpCount = row['昨日涨停数'] ?? 0
            const td0935Change = row[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
            const pd1Change = row[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
            const pd1NetInflow = row[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
            const pd1CapitalFlow = row[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
            const td0935CapitalFlow = row[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
            const td0935NetInflow = row[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
            const rank0935 = row['09:35涨跌幅排名'] ?? 9999
            const rankYesterday = row['昨日涨跌幅排名'] ?? 9999

            // 新概念判断
            const isNewConcept =
                v01 > 0 &&
                M01 > 0 &&
                M05 === 0 &&
                M10 === 0 &&
                v05 === 0 &&
                v10 === 0 &&
                rankYesterday === 1 &&
                rank0935 === 1

            // 条件1：排名条件 - (昨日排名前10 或 昨日涨幅>2) 且 (09:35排名<=5 且 09:35涨幅>0.75)
            const rankCondition = (rankYesterday <= 10 || pd1Change > 2) && rank0935 <= 5 && td0935Change > 0.75

            // 条件2：成交量条件 - v1 > v5 且 v1 > v10
            const volumeCondition = v01 > v05 && v01 > v10

            // 条件3：板块热度
            const blockHeat = pd1WinRate >= 60 && pd1LimitUpCount >= 1

            // 条件4：09:33涨跌幅 > 0
            const td0933Change = row[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
            const td0933ChangeCondition = td0933Change > 0

            // 条件5：昨日涨跌幅
            const pd1ChangeCondition = pd1Change > 1.5

            // 条件6：昨日大单净额
            const pd1NetInflowCondition = pd1NetInflow > 0

            // 条件7：09:35资金流向或大单净额至少一个为正
            const td0935FlowCondition = td0935CapitalFlow > 0 || td0935NetInflow > 0

            // 条件8：均线多头
            const maBullishFull =
                M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60 && M05 > 0 && M10 > 0 && M21 > 0 && M60 > 0
            const maBullishBasic = M01 > M05 && M01 > M10 && M01 > M21 && M05 > 0 && M10 > 0 && M21 > 0
            const maRelaxCondition = pd1Change > 3 && pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maSuperRelaxCondition = pd1Change > 5 && pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish = maBullishFull || (maRelaxCondition && maBullishBasic) || maSuperRelaxCondition

            // 排除条件：资金恶化
            const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

            // 最终结果
            const isStrong =
                isNewConcept ||
                (rankCondition &&
                    volumeCondition &&
                    blockHeat &&
                    td0933ChangeCondition &&
                    pd1ChangeCondition &&
                    pd1NetInflowCondition &&
                    td0935FlowCondition &&
                    maBullish &&
                    !flowWorsening)

            console.log(`=== 概念强势筛选分析 - ${blockName} ===`, {
                新概念判断: {
                    v01: v01,
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    v05: v05,
                    v10: v10,
                    昨日排名: rankYesterday,
                    '09:35排名': rank0935,
                    是否新概念: isNewConcept,
                },
                '条件1-排名': {
                    昨日排名: rankYesterday,
                    昨日涨跌幅: pd1Change,
                    '09:35排名': rank0935,
                    '09:35涨跌幅': td0935Change,
                    是否满足: rankCondition,
                },
                '条件2-成交量': {
                    v01: v01,
                    v05: v05,
                    v10: v10,
                    是否满足: volumeCondition,
                },
                '条件3-板块热度': {
                    昨日上涨家数占比: pd1WinRate,
                    昨日涨停数: pd1LimitUpCount,
                    是否满足: blockHeat,
                },
                '条件4-09:33涨幅': {
                    '09:33涨跌幅': td0933Change,
                    是否满足: td0933ChangeCondition,
                },
                '条件5-昨日涨幅': {
                    昨日涨跌幅: pd1Change,
                    是否满足: pd1ChangeCondition,
                },
                '条件6-昨日大单': {
                    昨日大单净额: pd1NetInflow,
                    是否满足: pd1NetInflowCondition,
                },
                '条件7-09:35资金': {
                    '09:35资金流向': td0935CapitalFlow,
                    '09:35大单净额': td0935NetInflow,
                    是否满足: td0935FlowCondition,
                },
                '条件8-均线多头': {
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    M21: M21,
                    M60: M60,
                    均线完整多头: maBullishFull,
                    均线基本多头: maBullishBasic,
                    '放宽条件(昨日涨幅>3且资金正)': maRelaxCondition,
                    '超放宽条件(昨日涨幅>5且资金正)': maSuperRelaxCondition,
                    是否满足: maBullish,
                },
                '排除条件-资金恶化': {
                    '09:35资金流向': td0935CapitalFlow,
                    '09:33资金流向': td0933CapitalFlow,
                    '09:35大单净额': td0935NetInflow,
                    '09:33大单净额': td0933NetInflow,
                    是否恶化: flowWorsening,
                },
                最终结果: isStrong,
            })
        }

        // 处理 Stock 行点击 - 打印强势筛选分析信息
        const handleStockRowClick = (row) => {
            const stockName = row['股票简称']

            // 设置选中的 Stock
            MatchChart.selectedStock = { name: stockName }

            // 获取当前选中Block的数据，判断是否满足均线放宽条件2
            const blockName = Stocks.selectedBlockName
            const blockList = Stocks.currentBlockType === '行业' ? Industries.Data[0].filters : Concepts.Data[0].filters
            const currentBlock = blockList.find((b) => b['指数简称'] === blockName)
            let blockMaSuperRelax = false
            let blockTd0935CapitalFlow = 0
            let blockTd0935NetInflow = 0
            if (currentBlock) {
                const blockPd1Change = currentBlock[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const blockPd1CapitalFlow = currentBlock[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const blockPd1NetInflow = currentBlock[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                blockMaSuperRelax = blockPd1Change > 5 && blockPd1CapitalFlow > 0 && blockPd1NetInflow > 0
                blockTd0935CapitalFlow = currentBlock[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                blockTd0935NetInflow = currentBlock[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            }
            const blockTd0935FlowPositive = blockTd0935CapitalFlow > 0 && blockTd0935NetInflow > 0

            const v01 = row.v01 ?? 0
            const v05 = row.v05 ?? 0
            const v10 = row.v10 ?? 0
            const M01 = row.M01 ?? 0
            const M05 = row.M05 ?? 0
            const M10 = row.M10 ?? 0
            const M21 = row.M21 ?? 0
            const M60 = row.M60 ?? 0
            const td0935Change = row[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
            const td0935CapitalFlow = row[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
            const td0935NetInflow = row[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
            const pd1Change = row[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
            const pd1NetInflowVol = row[Dates.shareDate.pd1]?.大单净量 ?? -Infinity
            const pd1CapitalFlow = row[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
            const pd1NetInflow = row[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
            const isPd1LimitUp = row['昨日涨停'] || false

            // 条件1：成交量条件
            const volumeCondition = v01 > v05 && v01 > v10

            // 条件2：均线多头
            // 放宽条件1：昨日涨停时不需要均线条件
            // 放宽条件2：完整多头取反 且 放宽1取反 且 Block放宽2(涨幅>5且资金正) 且 Stock涨幅>6且资金正
            const maBullishFull = M01 > M05 && M01 > M10 && M01 > M21 && M01 > M60
            const stockMaSuperRelax = pd1Change > 6 && pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish =
                maBullishFull ||
                isPd1LimitUp ||
                (!maBullishFull && !isPd1LimitUp && blockMaSuperRelax && stockMaSuperRelax)

            // 条件3：09:35涨跌幅
            const changeCondition = td0935Change > 0

            // 条件4：昨日涨跌幅
            const pd1ChangeCondition = pd1Change > 5

            // 条件5：昨日大单净量 > 0.4 或者 昨日资金流向>0 且 昨日大单净额>0
            const pd1NetInflowCondition = pd1NetInflowVol > 0.4 || (pd1CapitalFlow > 0 && pd1NetInflow > 0)

            // 排除条件1：资金恶化
            const flowWorsening =
                td0935CapitalFlow > 0 &&
                td0935CapitalFlow < td0933CapitalFlow &&
                td0935NetInflow > 0 &&
                td0935NetInflow < td0933NetInflow

            // 排除条件2：Block 09:35资金或大单有其中一个不为正 且 Stock 09:35资金流向和大单净额都为负 → 排除
            const stockTd0935FlowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
            const blockTd0935NotAllPositive = !(blockTd0935CapitalFlow > 0 && blockTd0935NetInflow > 0)
            const blockStockFlowMismatch = blockTd0935NotAllPositive && stockTd0935FlowNegative

            // 最终结果
            const isStrong =
                volumeCondition &&
                maBullish &&
                changeCondition &&
                pd1ChangeCondition &&
                pd1NetInflowCondition &&
                !flowWorsening &&
                !blockStockFlowMismatch

            console.log(`=== Stock强势筛选分析 - ${stockName} ===`, {
                所属板块: blockName,
                'Block均线放宽条件2(涨幅>5且资金正)': blockMaSuperRelax,
                '条件1-成交量': {
                    v01: v01,
                    v05: v05,
                    v10: v10,
                    是否满足: volumeCondition,
                },
                '条件2-均线多头': {
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    M21: M21,
                    M60: M60,
                    均线完整多头: maBullishFull,
                    '昨日涨停(放宽1)': isPd1LimitUp,
                    'Block放宽条件2(涨幅>5且资金正)': blockMaSuperRelax,
                    'Stock放宽条件2(涨幅>6且资金正)': stockMaSuperRelax,
                    放宽条件2满足: !maBullishFull && !isPd1LimitUp && blockMaSuperRelax && stockMaSuperRelax,
                    是否满足: maBullish,
                },
                '条件3-涨幅': {
                    '09:35涨跌幅': td0935Change,
                    是否满足: changeCondition,
                },
                '条件4-昨日涨幅': {
                    昨日涨跌幅: pd1Change,
                    是否满足: pd1ChangeCondition,
                },
                '条件5-昨日大单': {
                    昨日大单净量: pd1NetInflowVol,
                    昨日资金流向: pd1CapitalFlow,
                    昨日大单净额: pd1NetInflow,
                    '标准条件(大单净量>0.4)': pd1NetInflowVol > 0.4,
                    '组合条件(资金流向>0且大单净额>0)': pd1CapitalFlow > 0 && pd1NetInflow > 0,
                    是否满足: pd1NetInflowCondition,
                },
                '排除条件1-资金恶化': {
                    '09:35资金流向': td0935CapitalFlow,
                    '09:33资金流向': td0933CapitalFlow,
                    '09:35大单净额': td0935NetInflow,
                    '09:33大单净额': td0933NetInflow,
                    是否恶化: flowWorsening,
                },
                '排除条件2-BlockStock资金不匹配': {
                    'Block 09:35资金流向': blockTd0935CapitalFlow,
                    'Block 09:35大单净额': blockTd0935NetInflow,
                    Block资金或大单有其中一个不为正: blockTd0935NotAllPositive,
                    'Stock 09:35资金流向': td0935CapitalFlow,
                    'Stock 09:35大单净额': td0935NetInflow,
                    Stock资金都为负: stockTd0935FlowNegative,
                    是否排除: blockStockFlowMismatch,
                },
                最终结果: isStrong,
            })
        }

        // 清除行业缓存
        const clearIndustriesCache = async () => {
            Industries.loading = true
            const { tdcn } = Dates.shareDate
            const industriesCache = (await getLocalforage('Industries')) || {}
            delete industriesCache[tdcn]
            await setLocalforage('Industries', industriesCache)

            Industries.Data[0].filters = []
            Industries.isFromCache = false
            await Industries.init(getLocalforage, setLocalforage, Dates.shareDate)
        }

        // 清除概念缓存
        const clearConceptsCache = async () => {
            Concepts.loading = true
            const { tdcn } = Dates.shareDate
            const conceptsCache = (await getLocalforage('Concepts')) || {}
            delete conceptsCache[tdcn]
            await setLocalforage('Concepts', conceptsCache)

            Concepts.Data[0].filters = []
            Concepts.isFromCache = false
            await Concepts.init(getLocalforage, setLocalforage, Dates.shareDate)
        }

        // 清除 Stock 缓存并重新请求
        const clearStocksCache = async () => {
            const blockName = Stocks.selectedBlockName
            const blockType = Stocks.currentBlockType
            await Stocks.clear()
            // 如果有选中的板块，重新请求
            if (blockName && blockType) {
                await Stocks.fetchByBlock(blockName, blockType, Dates.shareDate)
            }
        }

        // 下载当天缓存数据（打包成ZIP文件夹）
        const downloadCacheData = async () => {
            const { td, tdcn } = Dates.shareDate
            if (!td) {
                ElementPlus.ElMessage.warning('请先选择日期')
                return
            }

            try {
                // 获取当前显示的数据（已处理过的完整数据）
                const industriesData = Industries.Data[0].filters || []
                const conceptsData = Concepts.Data[0].filters || []
                const stocksData = Stocks.Data[0].filters || []

                if (!industriesData.length && !conceptsData.length && !stocksData.length) {
                    ElementPlus.ElMessage.warning('没有可下载的数据')
                    return
                }

                // 创建 ZIP 文件
                const zip = new JSZip()
                const folderName = td // 文件夹名称为日期
                const folder = zip.folder(folderName)

                // 添加行业数据
                if (industriesData.length > 0) {
                    folder.file(
                        `industry_${td}.json`,
                        JSON.stringify(
                            {
                                fetchTime: new Date().toISOString(),
                                date: td,
                                dateCn: tdcn,
                                count: industriesData.length,
                                dates: Dates.shareDate,
                                data: industriesData,
                            },
                            null,
                            2,
                        ),
                    )
                }

                // 添加概念数据
                if (conceptsData.length > 0) {
                    folder.file(
                        `concept_${td}.json`,
                        JSON.stringify(
                            {
                                fetchTime: new Date().toISOString(),
                                date: td,
                                dateCn: tdcn,
                                count: conceptsData.length,
                                dates: Dates.shareDate,
                                data: conceptsData,
                            },
                            null,
                            2,
                        ),
                    )
                }

                // 添加股票数据
                if (stocksData.length > 0) {
                    folder.file(
                        `stock_${td}.json`,
                        JSON.stringify(
                            {
                                fetchTime: new Date().toISOString(),
                                date: td,
                                dateCn: tdcn,
                                count: stocksData.length,
                                dates: Dates.shareDate,
                                data: stocksData,
                            },
                            null,
                            2,
                        ),
                    )
                }

                // 生成并下载 ZIP 文件
                const blob = await zip.generateAsync({ type: 'blob' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${td}.zip`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)

                ElementPlus.ElMessage.success(
                    `已下载 ${td}.zip：行业${industriesData.length} 概念${conceptsData.length} 股票${stocksData.length}`,
                )
            } catch (error) {
                console.error('下载数据失败:', error)
                ElementPlus.ElMessage.error('下载数据失败')
            }
        }

        // 自动切换到下一个交易日函数（原回测按钮功能）
        const startBacktest = async () => {
            Backtest.isRunning = true
            Backtest.shouldStop = false
            Backtest.result = { totalDays: 0, buyableDays: 0, winDays: 0, winRate: '0%' }
            Backtest.consecutiveErrors = 0 // 重置连续错误计数器

            // 清空之前的定时器
            if (Backtest.timeoutId) {
                clearTimeout(Backtest.timeoutId)
                Backtest.timeoutId = null
            }

            // 开始自动切换循环
            const autoSwitch = async () => {
                // 检查停止信号
                if (Backtest.shouldStop) {
                    Backtest.isRunning = false
                    return
                }

                // 检查是否已是最后一个交易日
                const list = Dates.historicalDate || []
                const current = Dates.requestDate
                const idx = list.indexOf(current)

                if (idx === -1 || idx >= list.length - 1) {
                    Backtest.isRunning = false
                    console.log('[自动切换] 已到达最后一个交易日，停止自动切换')
                    return
                }

                // 切换到下一个交易日
                const nextDate = list[idx + 1]
                console.log(`[自动切换] 切换到下一个交易日：${nextDate}`)
                Dates.requestDate = nextDate
                Dates.setShareDate()

                try {
                    // 执行数据加载
                    await Submit()

                    // 数据加载成功，重置连续错误计数器
                    Backtest.consecutiveErrors = 0

                    // 检查数据是否来自缓存
                    const isFromCache = Industries.isFromCache && Concepts.isFromCache

                    if (isFromCache) {
                        // 数据来自缓存，无需等待，立即进行下一次切换
                        console.log('[自动切换] 数据来自缓存，立即切换到下一个交易日')
                        autoSwitch()
                    } else {
                        // 数据加载完成后，等待配置的间隔时间再进行下一次切换
                        console.log(`[自动切换] 数据加载完成，等待${Backtest.intervalSeconds}秒后进行下一次切换`)
                        Backtest.timeoutId = setTimeout(autoSwitch, Backtest.intervalSeconds * 1000)
                    }
                } catch (error) {
                    console.error('[自动切换] 数据加载失败:', error)

                    // 增加连续错误计数器
                    Backtest.consecutiveErrors = (Backtest.consecutiveErrors || 0) + 1
                    console.log(`[自动切换] 连续错误次数：${Backtest.consecutiveErrors}`)

                    // 如果连续错误达到 3 次，自动停止
                    if (Backtest.consecutiveErrors >= 3) {
                        console.log('[自动切换] 连续三次错误，自动停止')
                        Backtest.shouldStop = true
                        Backtest.isRunning = false
                        if (Backtest.timeoutId) {
                            clearTimeout(Backtest.timeoutId)
                            Backtest.timeoutId = null
                        }
                        return
                    }

                    // 即使失败，也等待配置的间隔时间后继续尝试下一个日期
                    console.log(`[自动切换] 等待${Backtest.intervalSeconds}秒后继续尝试`)
                    Backtest.timeoutId = setTimeout(autoSwitch, Backtest.intervalSeconds * 1000)
                }
            }

            // 立即开始第一次切换
            console.log('[自动切换] 开始自动切换到下一个交易日')
            autoSwitch()
        }

        // 停止自动切换
        const stopBacktest = () => {
            Backtest.shouldStop = true
            if (Backtest.timeoutId) {
                clearTimeout(Backtest.timeoutId)
                Backtest.timeoutId = null
            }
            Backtest.isRunning = false
            Backtest.consecutiveErrors = 0 // 重置错误计数器
            console.log('[自动切换] 已停止')
        }

        onMounted(async () => {
            Intervals.timer = setInterval(Intervals.updateTime, 1000)

            await Dates.init(getLocalforage, setLocalforage)
            Dates.setShareDate()

            // await Submit()
        })

        // 行业表格行类名 - 用于高亮选中的行
        const industryRowClassName = ({ row }) => {
            const blockName = row['指数简称']
            if (Stocks.selectedBlockName === blockName && Stocks.currentBlockType === '行业') {
                return 'row-highlight'
            }
            return ''
        }

        // 概念表格行类名 - 用于高亮选中的行
        const conceptRowClassName = ({ row }) => {
            const blockName = row['指数简称']
            if (Stocks.selectedBlockName === blockName && Stocks.currentBlockType === '概念') {
                return 'row-highlight'
            }
            return ''
        }

        // Stock 表格行类名 - 用于高亮选中的行
        const stockRowClassName = ({ row }) => {
            const stockName = row['股票简称']
            if (MatchChart.selectedStock?.name === stockName) {
                return 'row-highlight'
            }
            return ''
        }

        onUnmounted(() => {
            clearInterval(Intervals.timer)
        })

        return {
            Intervals,
            Dates,
            Industries,
            Concepts,
            Stocks,
            MatchChart,
            GlobalState,
            Submit,
            changeDate,
            jumpToValidDate,
            precentformater,
            formatNumber,
            isMobile,
            displayIndustries,
            displayConcepts,
            displayStocks,
            strongIndustriesCount,
            strongConceptsCount,
            strongStocksCount,
            toggleIndustryFilterMode,
            toggleConceptFilterMode,
            toggleStockFilterMode,
            handleIndustryRowClick,
            handleConceptRowClick,
            handleStockRowClick,
            industryRowClassName,
            conceptRowClassName,
            stockRowClassName,
            clearIndustriesCache,
            clearConceptsCache,
            clearStocksCache,
            downloadCacheData,
            Backtest,
            startBacktest,
            stopBacktest,
        }
    },
}

const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })

// 注册 Element Plus 图标组件（同时注册 PascalCase 和 kebab-case 格式）
const icons = ['ArrowLeft', 'ArrowRight', 'DArrowLeft', 'DArrowRight', 'Moon', 'Opportunity']
icons.forEach((name) => {
    const component = ElementPlusIconsVue[name]
    app.component(name, component)
    // 同时注册 kebab-case 格式
    const kebabName = name
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')
    app.component(kebabName, component)
})

app.mount('#app')
