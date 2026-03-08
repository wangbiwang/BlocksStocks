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

    init: async (catcheGetFunction, catcheSetFunction, dates, blockItem, blockType, blockName) => {
        const { tdcn } = dates
        const questions = getQuestions('block-行业', dates, blockItem, blockType, blockName)
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
    },
})

/** @description Concepts Module */
const Concepts = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: '概念策略', filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates, blockItem, blockType, blockName) => {
        const { tdcn } = dates
        const questions = getQuestions('block-概念', dates,blockItem, blockType, blockName)
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
    },
})

/** @description Match Chart Module - 用于管理匹配图的选中状态和筛选模式 */
const MatchChart = reactive({
    industryFilterMode: 'strong', // 行业筛选模式：'all' | 'strong'
    conceptFilterMode: 'strong', // 概念筛选模式：'all' | 'strong'
    stockFilterMode: 'strong', // Stock 筛选模式：'all' | 'strong'
})

/** @description Stocks Module */
const Stocks = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: 'Stock 策略', filters: [] }],
    requestStatus: [],
    selectedBlockName: null, // 当前选中的板块名称
    currentBlockType: null, // 当前板块类型：'行业' 或 '概念'

    init: async (catcheGetFunction, catcheSetFunction, dates, blockItem, blockType, blockName) => {
        const { tdcn } = dates
        Stocks.selectedBlockName = blockName
        Stocks.currentBlockType = blockType
        const questions = getQuestions('stock', dates, blockItem, blockType, blockName)
        const cache = (await catcheGetFunction('Stocks')) || {}
        // 使用复合 key: 日期#板块类型#板块名称
        const cacheKey = `${tdcn}#${blockType || 'none'}#${blockName || 'none'}`
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
        } else {
            Stocks.isFromCache = false
            await Stocks.getData(questions, catcheSetFunction, cache, dates, blockName, blockType)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates, blockName, blockType) => {
        const { tdcn, isToday } = dates
        Stocks.loading = true
        Stocks.isFromCache = false
        Stocks.Data[0].filters = []

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
            // 使用复合 key 保存缓存
            const cacheKey = `${tdcn}#${blockType || 'none'}#${blockName || 'none'}`
            cache[cacheKey] = results
            if (!isToday) await catcheSetFunction('Stocks', cache)
            handleStocksData(results)
        }
    },
})

/** @description Data Processing Functions */
async function handleIndustriesData(res) {
    // 内连接合并：只保留同时在 res[0] 和 res[1] 中存在的 code
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])

    const mergedArr = []
    map0.forEach((value0, code) => {
        if (map1.has(code)) {
            const merged = { ...value0, ...map1.get(code) }
            const obj = {}
            handleRate(obj, merged, 'block', Dates.shareDate)
            mergedArr.push(obj)
        }
    })

    Industries.Data[0].filters = mergedArr
}

async function handleConceptsData(res) {
    // 内连接合并：只保留同时在 res[0] 和 res[1] 中存在的 code
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])

    const mergedArr = []
    map0.forEach((value0, code) => {
        if (map1.has(code)) {
            const merged = { ...value0, ...map1.get(code) }
            const obj = {}
            handleRate(obj, merged, 'block', Dates.shareDate)
            mergedArr.push(obj)
        }
    })

    Concepts.Data[0].filters = mergedArr
}

async function handleStocksData(res) {
    // 内连接合并：只保留同时在 res[0] 和 res[1] 中存在的 code
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])

    const mergedArr = []
    map0.forEach((value0, code) => {
        if (map1.has(code)) {
            const merged = { ...value0, ...map1.get(code) }
            const obj = {}
            handleRate(obj, merged, 'stock', Dates.shareDate)
            mergedArr.push(obj)
        }
    })

    Stocks.Data[0].filters = mergedArr
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
            Stocks.loading = false // 初始不加载 Stock 数据

            // 清空数据
            Industries.Data[0].filters = []
            Concepts.Data[0].filters = []
            Stocks.Data[0].filters = []
            Industries.requestStatus = []
            Concepts.requestStatus = []
            Stocks.requestStatus = []
            Stocks.selectedBlockName = null

            Dates.setRequestDate(Dates.requestDate)
            Dates.setShareDate()

            try {
                // 并行请求行业和概念数据
                await Promise.all([
                    Industries.init(getLocalforage, setLocalforage, Dates.shareDate, null, null, null),
                    Concepts.init(getLocalforage, setLocalforage, Dates.shareDate, null, null, null),
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

        // 计算属性：显示的行业列表（根据筛选模式）
        const displayIndustries = computed(() => {
            let result = Industries.Data[0].filters

            // 强势筛选逻辑
            if (MatchChart.industryFilterMode === 'strong') {
                result = result.filter(item => {
                    const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const pd1NetInflow = item[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                    const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                    const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                    const pd1WinRate = item['昨日上涨家数占比'] ?? 0
                    const pd1LimitUpCount = item['昨日涨停数'] ?? 0
                    const M01 = item.M01 ?? 0
                    const M05 = item.M05 ?? 0
                    const M10 = item.M10 ?? 0
                    const M30 = item.M30 ?? 0
                    const M60 = item.M60 ?? 0

                    const baseCondition = pd1Change > 1.5 && pd1NetInflow > 0 && td0935Change > 0.5
                    const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
                    const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
                    const maBullish = pd1CapitalFlow > 0 && pd1NetInflow > 0
                        ? M01 > M05 && M01 > M10 && M01 > M30
                        : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60
                    const maOrFlowCondition = M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)

                    // 新增条件：如果 09:35 资金流向和大单净额都为负，则需要全面改善
                    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                    const allImproving = td0935Change > td0933Change && 
                                         td0935CapitalFlow > td0933CapitalFlow && 
                                         td0935NetInflow > td0933NetInflow
                    const flowCondition = !flowNegative || allImproving

                    // 剔除条件：如果 09:35 资金流向和大单净额都小于 09:33，则剔除
                    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

                    // 低涨幅补充条件：如果 09:35 涨跌幅<1，则需要资金流为正或改善
                    const lowChange = td0935Change < 1
                    const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
                    const flowImprovingBoth = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

                    const isStrong = baseCondition && (flowPositive || flowImproving) && blockHeat && maBullish && maOrFlowCondition && flowCondition && !flowWorsening && lowChangeCondition
                    
                    return isStrong
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

        // 计算属性：显示的概念列表（根据筛选模式）
        const displayConcepts = computed(() => {
            let result = Concepts.Data[0].filters

            // 强势筛选逻辑
            if (MatchChart.conceptFilterMode === 'strong') {
                result = result.filter(item => {
                    const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const pd1NetInflow = item[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                    const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                    const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                    const pd1WinRate = item['昨日上涨家数占比'] ?? 0
                    const pd1LimitUpCount = item['昨日涨停数'] ?? 0
                    const M01 = item.M01 ?? 0
                    const M05 = item.M05 ?? 0
                    const M10 = item.M10 ?? 0
                    const M30 = item.M30 ?? 0
                    const M60 = item.M60 ?? 0

                    const baseCondition = pd1Change > 1.5 && pd1NetInflow > 0 && td0935Change > 0.5
                    const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
                    const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
                    const maBullish = pd1CapitalFlow > 0 && pd1NetInflow > 0
                        ? M01 > M05 && M01 > M10 && M01 > M30
                        : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60
                    const maOrFlowCondition = M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)

                    // 新增条件：如果 09:35 资金流向和大单净额都为负，则需要全面改善
                    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                    const allImproving = td0935Change > td0933Change && 
                                         td0935CapitalFlow > td0933CapitalFlow && 
                                         td0935NetInflow > td0933NetInflow
                    const flowCondition = !flowNegative || allImproving

                    // 剔除条件：如果 09:35 资金流向和大单净额都小于 09:33，则剔除
                    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

                    // 低涨幅补充条件：如果 09:35 涨跌幅<1，则需要资金流为正或改善
                    const lowChange = td0935Change < 1
                    const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
                    const flowImprovingBoth = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

                    const isStrong = baseCondition && (flowPositive || flowImproving) && blockHeat && maBullish && maOrFlowCondition && flowCondition && !flowWorsening && lowChangeCondition
                    
                    return isStrong
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
            let result = Stocks.Data[0].filters

            // 强势筛选逻辑
            if (MatchChart.stockFilterMode === 'strong') {
                // 获取所点击指数的完整数据
                const blockName = Stocks.selectedBlockName
                const blockType = Stocks.currentBlockType
                let blockData = null
                let block0935Change = 0

                if (blockName && blockType) {
                    blockData = blockType === '行业'
                        ? Industries.Data[0].filters.find(item => item['指数简称'] === blockName)
                        : Concepts.Data[0].filters.find(item => item['指数简称'] === blockName)
                    block0935Change = blockData?.[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? 0
                }

                result = result.filter(item => {
                    const pd1Change = item[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const pd1NetInflowVol = item[Dates.shareDate.pd1]?.大单净量 ?? -Infinity
                    const pd1CapitalFlow = item[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const M01 = item.M01 ?? 0
                    const M05 = item.M05 ?? 0
                    const M30 = item.M30 ?? 0
                    const td0935Change = item[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const td0935CapitalFlow = item[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const td0935NetInflow = item[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const td0933CapitalFlow = item[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const td0933NetInflow = item[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                    const td0933Change = item[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity

                    // 获取 block 数据用于豁免条件判断
                    const block0935ChangeVal = blockData?.[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const block0935CapitalFlow = blockData?.[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                    const block0935NetInflow = blockData?.[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                    const block0933ChangeVal = blockData?.[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                    const block0933CapitalFlow = blockData?.[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                    const block0933NetInflow = blockData?.[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                    const blockPd1Change = blockData?.[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                    const blockPd1CapitalFlow = blockData?.[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                    const blockPd1NetInflow = blockData?.[Dates.shareDate.pd1]?.大单净额 ?? -Infinity

                    // 豁免条件：如果 block 非常强势且 stock 本身也强势，则豁免筛选
                    const blockTd0935AllPositive = block0935ChangeVal > 0 && block0935CapitalFlow > 0 && block0935NetInflow > 0
                    const blockTd0935Improving = block0935CapitalFlow > block0933CapitalFlow && block0935NetInflow > block0933NetInflow
                    const blockPd1AllPositive = blockPd1Change > 0 && blockPd1CapitalFlow > 0 && blockPd1NetInflow > 0
                    const stockTd0935Positive = td0935Change > 0
                    const stockPd1Strong = pd1Change > 9
                    const stockPd1AllPositive = pd1CapitalFlow > 0 && pd1NetInflowVol > 0

                    const isExempt = blockTd0935AllPositive && blockTd0935Improving && blockPd1AllPositive && stockTd0935Positive && stockPd1Strong && stockPd1AllPositive

                    if (isExempt) {
                        // 满足豁免条件，直接通过
                        return true
                    }

                    // 强势筛选条件
                    const condition1 = pd1Change > 4 // 昨日涨幅大于 4
                    const condition2Standard = pd1NetInflowVol > 0.4 // 昨日大单净量大于 0.4
                    // 组合条件：昨日资金流向为正&& (09:35 资金流向 > 09:33 资金流向 且 09:35 大单净额 > 09:33 大单净额)
                    const condition2Combo = pd1CapitalFlow > 0 && (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)
                    const condition2 = condition2Standard || condition2Combo // 满足标准条件或组合条件即可
                    const condition3 = M01 > M05 && M01 > M30 // M01 > M05 && M01 > M30
                    // condition4: 09:35 涨跌幅>3 或者 (09:35 资金流向>09:33 资金流向 且 09:35 大单净额>09:33 大单净额)，但至少大于 2
                    const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const condition4 = td0935Change > 2 && (td0935Change > 3 || flowImproving) // 最低>2，且满足>3 或资金流改善

                    const isStrong = condition1 && condition2 && condition3 && condition4

                    // 打印强势筛选各项条件状态（用于分析）
                    console.log(`=== 强势筛选分析 - ${item['股票简称']} ===`, {
                        '昨日涨幅': pd1Change,
                        '昨日大单净量': pd1NetInflowVol,
                        '昨日资金流向': pd1CapitalFlow,
                        'M01': M01,
                        'M05': M05,
                        'M30': M30,
                        '今日 09:35 涨跌幅': td0935Change,
                        '所点击指数 09:35 涨跌幅': block0935Change,
                        '条件 1(昨日涨幅>4)': condition1,
                        '条件 2(大单净量>0.4 或组合)': condition2,
                        '  - 标准条件 (大单净量>0.4)': condition2Standard,
                        '  - 组合条件 (资金流>0 且改善)': condition2Combo,
                        '条件 3(M01>M05&&M01>M30)': condition3,
                        '条件 4(09:35 涨幅>2 且 (>3 或改善))': condition4,
                        '  - 资金流改善': flowImproving,
                        '豁免条件': {
                            'block0935 全正': blockTd0935AllPositive,
                            'block0935 改善': blockTd0935Improving,
                            'block 昨日全正': blockPd1AllPositive,
                            'stock0935 为正': stockTd0935Positive,
                            'stock 昨日涨幅>9': stockPd1Strong,
                            'stock 昨日全正': stockPd1AllPositive,
                            '是否豁免': isExempt
                        },
                        '是否满足': isStrong
                    })

                    // 如果满足强势策略，直接返回
                    if (isStrong) {
                        return true
                    }

                    return false
                })
            }

            // 排序：按热度排名升序
            result.sort((a, b) => {
                const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                return aHeat - bHeat
            })

            return result
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
            const blockName = row['指数简称']
            Stocks.selectedBlockName = blockName

            // 打印强势筛选各项条件状态（用于分析）
            const pd1Change = row[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
            const pd1NetInflow = row[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
            const pd1CapitalFlow = row[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
            const td0935Change = row[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
            const td0935CapitalFlow = row[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
            const td0935NetInflow = row[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
            const pd1WinRate = row['昨日上涨家数占比'] ?? 0
            const pd1LimitUpCount = row['昨日涨停数'] ?? 0
            const M01 = row.M01 ?? 0
            const M05 = row.M05 ?? 0
            const M10 = row.M10 ?? 0
            const M30 = row.M30 ?? 0
            const M60 = row.M60 ?? 0
            const v01 = row.v01 ?? 0
            const v05 = row.v05 ?? 0

            const baseCondition = pd1Change > 1.5 && pd1NetInflow > 0 && td0935Change > 0.5
            const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
            const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
            const useSimpleMA = pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish = useSimpleMA
                ? M01 > M05 && M01 > M10 && M01 > M30
                : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60

            console.log(`=== 强势筛选分析 - ${blockName} ===`, {
                '基础条件': {
                    '昨日涨跌幅': pd1Change,
                    '昨日大单净额': pd1NetInflow,
                    '今日 09:35 涨跌幅': td0935Change,
                    '是否满足': baseCondition
                },
                '资金流向条件': {
                    '09:35 资金流向': td0935CapitalFlow,
                    '09:35 大单净额': td0935NetInflow,
                    '09:33 资金流向': td0933CapitalFlow,
                    '09:33 大单净额': td0933NetInflow,
                    '为正': flowPositive,
                    '改善': flowImproving,
                    '是否满足': flowPositive || flowImproving
                },
                '板块热度': {
                    '昨日上涨家数占比': pd1WinRate,
                    '昨日涨停数': pd1LimitUpCount,
                    '是否满足': blockHeat
                },
                '均线多头': {
                    'M01': M01,
                    'M05': M05,
                    'M10': M10,
                    'M30': M30,
                    'M60': M60,
                    '使用简化规则': useSimpleMA,
                    '是否满足': maBullish
                },
                '最终结果': baseCondition && (flowPositive || flowImproving) && blockHeat && maBullish
            })

            Stocks.loading = true
            await Stocks.init(getLocalforage, setLocalforage, Dates.shareDate, row, '行业', blockName)
            Stocks.loading = false
        }

        // 处理概念行点击 - 触发 Stock 数据请求
        const handleConceptRowClick = async (row) => {
            const blockName = row['指数简称']
            Stocks.selectedBlockName = blockName

            // 打印强势筛选各项条件状态（用于分析）
            const pd1Change = row[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
            const pd1NetInflow = row[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
            const pd1CapitalFlow = row[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
            const td0935Change = row[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
            const td0935CapitalFlow = row[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
            const td0935NetInflow = row[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
            const pd1WinRate = row['昨日上涨家数占比'] ?? 0
            const pd1LimitUpCount = row['昨日涨停数'] ?? 0
            const M01 = row.M01 ?? 0
            const M05 = row.M05 ?? 0
            const M10 = row.M10 ?? 0
            const M30 = row.M30 ?? 0
            const M60 = row.M60 ?? 0

            const baseCondition = pd1Change > 1.5 && pd1NetInflow > 0 && td0935Change > 0.5
            const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
            const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
            const useSimpleMA = pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish = useSimpleMA
                ? M01 > M05 && M01 > M10 && M01 > M30
                : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60

            console.log(`=== 强势筛选分析 - ${blockName} ===`, {
                '基础条件': {
                    '昨日涨跌幅': pd1Change,
                    '昨日大单净额': pd1NetInflow,
                    '今日 09:35 涨跌幅': td0935Change,
                    '是否满足': baseCondition
                },
                '资金流向条件': {
                    '09:35 资金流向': td0935CapitalFlow,
                    '09:35 大单净额': td0935NetInflow,
                    '09:33 资金流向': td0933CapitalFlow,
                    '09:33 大单净额': td0933NetInflow,
                    '为正': flowPositive,
                    '改善': flowImproving,
                    '是否满足': flowPositive || flowImproving
                },
                '板块热度': {
                    '昨日上涨家数占比': pd1WinRate,
                    '昨日涨停数': pd1LimitUpCount,
                    '是否满足': blockHeat
                },
                '均线多头': {
                    'M01': M01,
                    'M05': M05,
                    'M10': M10,
                    'M30': M30,
                    'M60': M60,
                    '使用简化规则': useSimpleMA,
                    '是否满足': maBullish
                },
                '最终结果': baseCondition && (flowPositive || flowImproving) && blockHeat && maBullish
            })

            Stocks.loading = true
            await Stocks.init(getLocalforage, setLocalforage, Dates.shareDate, row, '概念', blockName)
            Stocks.loading = false
        }

        // 处理 Stock 行点击 - 打印强势筛选分析信息
        const handleStockRowClick = (row) => {
            const stockName = row['股票简称']

            // 获取所点击指数的 09:35 涨跌幅
            const blockName = Stocks.selectedBlockName
            const blockType = Stocks.currentBlockType
            let block0935Change = 0

            if (blockName && blockType) {
                const blockData = blockType === '行业'
                    ? Industries.Data[0].filters.find(item => item['指数简称'] === blockName)
                    : Concepts.Data[0].filters.find(item => item['指数简称'] === blockName)
                block0935Change = blockData?.[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? 0
            }

            const pd1Change = row[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
            const pd1NetInflowVol = row[Dates.shareDate.pd1]?.大单净量 ?? -Infinity
            const pd1CapitalFlow = row[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
            const M01 = row.M01 ?? 0
            const M05 = row.M05 ?? 0
            const M30 = row.M30 ?? 0
            const td0935Change = row[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
            const td0935CapitalFlow = row[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
            const td0935NetInflow = row[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity

            // 强势筛选条件
            const condition1 = pd1Change > 4
            const condition2Standard = pd1NetInflowVol > 0.4
            const condition2Combo = pd1CapitalFlow > 0 && (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)
            const condition2 = condition2Standard || condition2Combo
            const condition3 = M01 > M05 && M01 > M30
            const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const condition4 = td0935Change > 2 && (td0935Change > 3 || flowImproving)

            const isStrong = condition1 && condition2 && condition3 && condition4

            console.log(`=== 强势筛选分析 - ${stockName} ===`, {
                '昨日涨幅': pd1Change,
                '昨日大单净量': pd1NetInflowVol,
                '昨日资金流向': pd1CapitalFlow,
                'M01': M01,
                'M05': M05,
                'M30': M30,
                '今日 09:35 涨跌幅': td0935Change,
                '所点击指数 09:35 涨跌幅': block0935Change,
                '条件 1(昨日涨幅>4)': condition1,
                '条件 2(大单净量>0.4 或组合)': condition2,
                '  - 标准条件 (大单净量>0.4)': condition2Standard,
                '  - 组合条件 (资金流>0 且改善)': condition2Combo,
                '条件 3(M01>M05&&M01>M30)': condition3,
                '条件 4(09:35 涨幅>2 且 (>3 或改善))': condition4,
                '  - 资金流改善': flowImproving,
                '是否满足': isStrong
            })
        }

        // 删除当前日期的缓存数据
        const clearCache = async () => {
            const { tdcn } = Dates.shareDate
            const industriesCache = (await getLocalforage('Industries')) || {}
            const conceptsCache = (await getLocalforage('Concepts')) || {}
            const stocksCache = (await getLocalforage('Stocks')) || {}

            delete industriesCache[tdcn]
            delete conceptsCache[tdcn]
            // 删除所有该日期的 Stock 缓存（包括不同板块类型和名称的）
            Object.keys(stocksCache).forEach((key) => {
                if (key.startsWith(`${tdcn}#`)) {
                    delete stocksCache[key]
                }
            })

            await setLocalforage('Industries', industriesCache)
            await setLocalforage('Concepts', conceptsCache)
            await setLocalforage('Stocks', stocksCache)

            // 清空当前数据
            Industries.Data[0].filters = []
            Concepts.Data[0].filters = []
            Stocks.Data[0].filters = []
            Industries.isFromCache = false
            Concepts.isFromCache = false
            Stocks.isFromCache = false
            Stocks.selectedBlockName = null
            Stocks.currentBlockType = null

            // 重新请求数据
            await Submit()
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
            toggleIndustryFilterMode,
            toggleConceptFilterMode,
            toggleStockFilterMode,
            handleIndustryRowClick,
            handleConceptRowClick,
            handleStockRowClick,
            clearCache,
            Backtest,
            startBacktest,
            stopBacktest,
        }
    },
}

const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })

// 注册 Element Plus 图标组件（同时注册 PascalCase 和 kebab-case 格式）
const icons = ['ArrowLeft', 'ArrowRight', 'Moon', 'Opportunity']
icons.forEach((name) => {
    const component = ElementPlusIconsVue[name]
    app.component(name, component)
    // 同时注册 kebab-case 格式
    const kebabName = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
    app.component(kebabName, component)
})

app.mount('#app')
