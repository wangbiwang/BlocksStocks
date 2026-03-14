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
    stockFilterMode: 'strong', // Stock 筛选模式：'all' | 'strong' | 'matched'
    selectedBlock: null, // 当前选中的 Block（行业或概念）
    selectedStock: null, // 当前选中的 Stock
    matchedStocks: [], // 与选中 Block 匹配的 Stock 列表
    matchedBlocks: [], // 与选中 Stock 匹配的 Block 列表
})

/** @description Stocks Module */
const Stocks = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: 'Stock 策略', filters: [] }],
    requestStatus: [],
    selectedBlockName: null, // 当前选中的板块名称
    currentBlockType: null, // 当前板块类型：'行业' 或 '概念'

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        const { tdcn } = dates
        const questions = getQuestions('stock', dates)
        const cache = (await catcheGetFunction('Stocks')) || {}
        const target = cache[tdcn]

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
            await Stocks.getData(questions, catcheSetFunction, cache, dates)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
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
            // 使用日期 key 保存缓存（Stock 独立请求，不依赖 Block）
            cache[tdcn] = results
            if (!isToday) await catcheSetFunction('Stocks', cache)
            handleStocksData(results)
        }
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
    // 外连接合并：合并 res[0] 和 res[1] 的所有股票
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])

    const mergedArr = []
    const allCodes = new Set([...map0.keys(), ...map1.keys()])

    allCodes.forEach((code) => {
        const hasSource0 = map0.has(code)
        const hasSource1 = map1.has(code)

        // 合并数据（优先使用 source[0] 的数据，如果有 source[1] 则覆盖）
        let merged = {}
        if (hasSource0) {
            merged = { ...map0.get(code) }
        }
        if (hasSource1) {
            merged = { ...merged, ...map1.get(code) }
        }

        const obj = {}
        handleRate(obj, merged, 'stock', Dates.shareDate)

        mergedArr.push(obj)
    })

    Stocks.Data[0].filters = mergedArr
}

/**
 * 查找 Block 和 Stock 之间的连接关系
 */
function findConnections(stocks, blocks) {
    const connections = []
    const blockMatchCounts = {}
    const stockMatchCounts = {}
    const seenPairs = new Set()

    blocks.forEach((block) => {
        const blockName = block['指数简称']
        if (!blockName) return

        stocks.forEach((stock) => {
            const stockName = stock['股票简称']
            const industry = stock['行业'] || ''
            const concepts = stock['概念'] || []

            let matchType = null

            if (industry === blockName) {
                matchType = '行业'
            } else if (Array.isArray(concepts) && concepts.includes(blockName)) {
                matchType = '概念'
            }

            if (matchType) {
                const pairKey = `${blockName}-${stockName}`
                if (seenPairs.has(pairKey)) return
                seenPairs.add(pairKey)

                if (!blockMatchCounts[blockName]) {
                    blockMatchCounts[blockName] = 0
                }
                blockMatchCounts[blockName]++

                if (!stockMatchCounts[stockName]) {
                    stockMatchCounts[stockName] = 0
                }
                stockMatchCounts[stockName]++

                connections.push({
                    blockName: blockName,
                    stockName: stockName,
                    matchType: matchType,
                    blockMatchCount: blockMatchCounts[blockName],
                    stockMatchCount: stockMatchCounts[stockName],
                })
            }
        })
    })

    connections.forEach((conn) => {
        conn.blockMatchCount = blockMatchCounts[conn.blockName]
        conn.stockMatchCount = stockMatchCounts[conn.stockName]
    })

    return connections
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
    const M30 = item.M30 ?? 0
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
    const rankCondition = rank0935 <= 5 && (rankYesterday <= 10 || pd1Change > 2)

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
            ? M01 > M05 && M01 > M10 && M01 > M30
            : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60
    const maOrFlowCondition =
        M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)
    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
    const allImproving =
        td0935Change > td0933Change &&
        td0935CapitalFlow > td0933CapitalFlow &&
        td0935NetInflow > td0933NetInflow
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

        /**
         * 计算 Stock 的匹配数
         * 在三个表数据都加载完成后调用，为每个 Stock 计算与强势 Block 的匹配数量
         */
        const calculateStockMatchCounts = () => {
            // 使用统一的强势筛选函数
            const strongIndustries = Industries.Data[0].filters.filter((item) => isBlockStrong(item, Dates.shareDate))
            const strongConcepts = Concepts.Data[0].filters.filter((item) => isBlockStrong(item, Dates.shareDate))
            const strongBlocks = [...strongIndustries, ...strongConcepts]

            // 获取所有强势Block的"指数简称"列表
            const strongBlockNames = new Set(strongBlocks.map((b) => b['指数简称']))

            // DEBUG: 输出强势Block信息
            console.log('=== 匹配调试信息 ===')
            console.log('强势行业数量:', strongIndustries.length)
            console.log('强势概念数量:', strongConcepts.length)

            // 输出每个强势Block的名称和数据样例
            console.log('--- 强势行业 ---')
            strongIndustries.forEach((item, i) => {
                console.log(`[${i}] ${item['指数简称']} | 09:35排名:${item['09:35涨跌幅排名']} | 昨日排名:${item['昨日涨跌幅排名']}`)
            })
            console.log('--- 强势概念 ---')
            strongConcepts.forEach((item, i) => {
                console.log(`[${i}] ${item['指数简称']} | 09:35排名:${item['09:35涨跌幅排名']} | 昨日排名:${item['昨日涨跌幅排名']}`)
            })

            console.log('强势Block名称集合:', [...strongBlockNames])

            // 遍历每个Stock，用它的"概念"数组去匹配强势Block的"指数简称"
            Stocks.Data[0].filters.forEach((stock) => {
                let matchCount = 0
                const industry = stock['行业'] || ''
                const concepts = stock['概念'] || []

                // 匹配行业
                if (industry && strongBlockNames.has(industry)) {
                    matchCount++
                }

                // 匹配概念
                if (Array.isArray(concepts)) {
                    concepts.forEach((concept) => {
                        if (strongBlockNames.has(concept)) {
                            matchCount++
                        }
                    })
                }

                stock.matchCount = matchCount

                // DEBUG: 输出匹配数>0的Stock信息
                if (matchCount > 0) {
                    console.log(`Stock: ${stock['股票简称']}, 行业: ${industry}, 概念: ${concepts.slice(0, 5).join(',')}..., 匹配数: ${matchCount}`)
                }
            })

            // DEBUG: 输出前5个Stock的详细信息（用于调试）
            console.log('--- 前5个Stock样例 ---')
            Stocks.Data[0].filters.slice(0, 5).forEach((stock, i) => {
                console.log(`[${i}] ${stock['股票简称']} | 行业: ${stock['行业']} | 概念数量: ${(stock['概念'] || []).length}`)
                console.log(`    概念列表(前10): ${(stock['概念'] || []).slice(0, 10).join(', ')}`)
            })
            console.log('=== 匹配调试结束 ===')
        }

        const Submit = async () => {
            // 设置请求状态
            GlobalState.isRequesting = true
            Industries.loading = true
            Concepts.loading = true
            Stocks.loading = true

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
                // 并行请求 Block 和 Stock 数据
                await Promise.all([
                    Industries.init(getLocalforage, setLocalforage, Dates.shareDate),
                    Concepts.init(getLocalforage, setLocalforage, Dates.shareDate),
                    Stocks.init(getLocalforage, setLocalforage, Dates.shareDate),
                ])

                // 三个表数据都加载完成后，计算 Stock 的匹配数
                calculateStockMatchCounts()
            } finally {
                // 无论成功失败都恢复按钮状态
                GlobalState.isRequesting = false
                Industries.loading = false
                Concepts.loading = false
                Stocks.loading = false
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
                result = result.filter((item) => {
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
                    const v01 = item.v01 ?? 0
                    const v05 = item.v05 ?? 0
                    const v10 = item.v10 ?? 0

                    // 新概念判断：v01和M01有值，但M05、M10、v05、v10都没有值
                    const isNewConcept = v01 > 0 && M01 > 0 && M05 === 0 && M10 === 0 && v05 === 0 && v10 === 0

                    // 新增：pd1 成交量与 pd2 对比
                    const pd1Volume = item[Dates.shareDate.pd1]?.成交量 ?? -Infinity
                    const pd2Volume = item[Dates.shareDate.pd2]?.成交量 ?? -Infinity
                    // 新增：pd1 大单净额与 pd2 对比
                    const pd2NetInflow = item[Dates.shareDate.pd2]?.大单净额 ?? -Infinity
                    const volumeCondition = pd1Volume > pd2Volume || pd1NetInflow > pd2NetInflow

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
                            ? M01 > M05 && M01 > M10 && M01 > M30
                            : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60
                    const maOrFlowCondition =
                        M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)

                    // 新增条件：如果 09:35 资金流向和大单净额都为负，则需要全面改善
                    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                    const allImproving =
                        td0935Change > td0933Change &&
                        td0935CapitalFlow > td0933CapitalFlow &&
                        td0935NetInflow > td0933NetInflow
                    const flowCondition = isSuperHot || !flowNegative || allImproving

                    // 剔除条件：如果 09:35 资金流向和大单净额都小于 09:33，则剔除
                    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

                    // 低涨幅补充条件：如果 09:35 涨跌幅<1，则需要资金流为正或改善
                    const lowChange = td0935Change < 1
                    const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
                    const flowImprovingBoth = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

                    // 突破判断
                    const high5 = item['前5交易日区间最高价'] ?? 0
                    const breakoutCondition = M01 >= high5 * 0.965 && high5 > 0

                    // 排名判断：行业需要 09:35排名前5 且 (昨日排名前10 或 昨日涨幅>2)
                    const rank0935 = item['09:35涨跌幅排名'] ?? 9999
                    const rankYesterday = item['昨日涨跌幅排名'] ?? 9999
                    const rankCondition = rank0935 <= 5 && (rankYesterday <= 10 || pd1Change > 2)

                    const isStrong =
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
                result = result.filter((item) => {
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
                    const v01 = item.v01 ?? 0
                    const v05 = item.v05 ?? 0
                    const v10 = item.v10 ?? 0

                    // 新概念判断：v01和M01有值，但M05、M10、v05、v10都没有值
                    const isNewConcept = v01 > 0 && M01 > 0 && M05 === 0 && M10 === 0 && v05 === 0 && v10 === 0

                    // 新增：pd1 成交量与 pd2 对比
                    const pd1Volume = item[Dates.shareDate.pd1]?.成交量 ?? -Infinity
                    const pd2Volume = item[Dates.shareDate.pd2]?.成交量 ?? -Infinity
                    // 新增：pd1 大单净额与 pd2 对比
                    const pd2NetInflow = item[Dates.shareDate.pd2]?.大单净额 ?? -Infinity
                    const volumeCondition = pd1Volume > pd2Volume || pd1NetInflow > pd2NetInflow

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
                            ? M01 > M05 && M01 > M10 && M01 > M30
                            : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60
                    const maOrFlowCondition =
                        M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)

                    // 新增条件：如果 09:35 资金流向和大单净额都为负，则需要全面改善
                    const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                    const allImproving =
                        td0935Change > td0933Change &&
                        td0935CapitalFlow > td0933CapitalFlow &&
                        td0935NetInflow > td0933NetInflow
                    const flowCondition = isSuperHot || !flowNegative || allImproving

                    // 剔除条件：如果 09:35 资金流向和大单净额都小于 09:33，则剔除
                    const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow

                    // 低涨幅补充条件：如果 09:35 涨跌幅<1，则需要资金流为正或改善
                    const lowChange = td0935Change < 1
                    const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
                    const flowImprovingBoth = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                    const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

                    // 突破判断
                    const high5 = item['前5交易日区间最高价'] ?? 0
                    const breakoutCondition = M01 >= high5 * 0.965 && high5 > 0

                    // 排名判断：概念需要 09:35排名前5 且 (昨日排名前10 或 昨日涨幅>2)
                    const rank0935 = item['09:35涨跌幅排名'] ?? 9999
                    const rankYesterday = item['昨日涨跌幅排名'] ?? 9999
                    const rankCondition = rank0935 <= 5 && (rankYesterday <= 10 || pd1Change > 2)

                    const isStrong =
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
            // 添加依赖：当 selectedBlock 或 selectedStock 变化时重新计算
            const _selectedBlock = MatchChart.selectedBlock
            const _selectedStock = MatchChart.selectedStock

            // 始终使用强势筛选的Block数据来计算匹配数（独立于筛选模式）
            const strongIndustries = Industries.Data[0].filters.filter((item) => isBlockStrong(item, Dates.shareDate))
            const strongConcepts = Concepts.Data[0].filters.filter((item) => isBlockStrong(item, Dates.shareDate))
            const strongBlockData = [...strongIndustries, ...strongConcepts]

            // 获取所有强势Block的"指数简称"列表
            const strongBlockNames = new Set(strongBlockData.map((b) => b['指数简称']))

            // 没有强势Block时，matched和strong模式都返回空数组
            if (strongBlockNames.size === 0) {
                Stocks.Data[0].filters.forEach((stock) => {
                    stock.matchCount = 0
                })
                // matched 和 strong 模式返回空数组（因为没有强势Block可匹配）
                if (MatchChart.stockFilterMode === 'matched' || MatchChart.stockFilterMode === 'strong') {
                    console.log(`[Stock筛选] 无强势Block，${MatchChart.stockFilterMode}模式返回空数组`)
                    return []
                }
                // all 模式返回所有数据
                let result = Stocks.Data[0].filters

                // 按热度排名升序排序（排名越小越热门）
                result.sort((a, b) => {
                    const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                    const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                    return aHeat - bHeat
                })

                // 返回新对象引用以强制刷新
                return result.map((s) => ({ ...s }))
            }

            // 遍历每个Stock，用它的"概念"数组去匹配强势Block的"指数简称"
            Stocks.Data[0].filters.forEach((stock) => {
                let matchCount = 0
                const industry = stock['行业'] || ''
                const concepts = stock['概念'] || []

                // 匹配行业
                if (industry && strongBlockNames.has(industry)) {
                    matchCount++
                }

                // 匹配概念
                if (Array.isArray(concepts)) {
                    concepts.forEach((concept) => {
                        if (strongBlockNames.has(concept)) {
                            matchCount++
                        }
                    })
                }

                stock.matchCount = matchCount
            })

            // 根据筛选模式返回数据（返回新对象引用以强制刷新）
            // 三级递进：all -> matched -> strong
            let result = Stocks.Data[0].filters

            // 匹配筛选：先筛选 matchCount > 0 的 Stock
            if (MatchChart.stockFilterMode === 'matched' || MatchChart.stockFilterMode === 'strong') {
                const beforeFilter = result.length
                result = result.filter((stock) => {
                    if (stock.matchCount <= 0) {
                        // 只在强势模式下输出调试信息
                        if (MatchChart.stockFilterMode === 'strong') {
                            console.log(`[Stock筛选] ${stock['股票简称']} matchCount=0 被筛选`)
                        }
                        return false
                    }
                    return true
                })
                console.log(`[Stock筛选] 匹配筛选: ${beforeFilter} -> ${result.length} (筛除了 ${beforeFilter - result.length} 只matchCount=0的股票)`)
            }

            // 强势筛选：在匹配基础上再应用强势条件
            if (MatchChart.stockFilterMode === 'strong') {
                result = result.filter((stock) => {
                    const stockName = stock['股票简称']
                    const data0935 = stock[`${Dates.shareDate.td} 09:35`]
                    const data0933 = stock[`${Dates.shareDate.td} 09:33`]
                    const pd1Data = stock[Dates.shareDate.pd1]
                    if (!data0935 || !data0933) {
                        console.log(`[Stock筛选] ${stockName} 缺少09:35或09:33数据`)
                        return false
                    }

                    const change0935 = data0935.涨跌幅 || 0
                    const flow0935 = data0935.资金流向 || 0
                    const net0935 = data0935.大单净额 || 0
                    const change0933 = data0933.涨跌幅 || 0
                    const flow0933 = data0933.资金流向 || 0
                    const net0933 = data0933.大单净额 || 0

                    // 基础条件：09:35 涨跌幅 > 0
                    if (change0935 <= 0) {
                        console.log(`[Stock筛选] ${stockName} 09:35涨跌幅<=0: ${change0935}`)
                        return false
                    }

                    // 炸板判断：09:33涨停但09:35炸板则排除
                    const code = stock['code'] || ''
                    const isMainBoard = code.startsWith('60') || code.startsWith('00')
                    const limitUpThreshold = isMainBoard ? 9.5 : 19.5
                    const is0933LimitUp = change0933 >= limitUpThreshold
                    const is0935LimitUp = change0935 >= limitUpThreshold
                    if (is0933LimitUp && !is0935LimitUp) {
                        console.log(`[Stock筛选] ${stockName} 炸板: 09:33涨停(${change0933}%)但09:35炸板(${change0935}%)`)
                        return false
                    }

                    // 数据有效性检查：收盘价必须有效
                    const pd1Close = pd1Data?.收盘价 || 0
                    if (pd1Close <= 0) {
                        console.log(`[Stock筛选] ${stockName} 收盘价无效: ${pd1Close}`)
                        return false
                    }

                    // 突破前高条件：昨日收盘价 >= 前30日区间最高价 * 0.965（3.5%容差）
                    const high30 = stock['前30交易日区间最高价'] || 0
                    if (high30 > 0 && pd1Close < high30 * 0.965) {
                        console.log(`[Stock筛选] ${stockName} 未突破前高: 收盘价${pd1Close} < 前30日最高${high30}*0.965=${(high30 * 0.965).toFixed(2)}`)
                        return false
                    }

                    // 量能均线多头条件：v01 > v05 && v01 > v10
                    const v01 = stock['v01'] || 0
                    const v05 = stock['v05'] || 0
                    const v10 = stock['v10'] || 0
                    if (v01 <= v05 || v01 <= v10) {
                        console.log(`[Stock筛选] ${stockName} 量能均线非多头: v01=${v01}, v05=${v05}, v10=${v10}`)
                        return false
                    }

                    // 冲高回落判断：从高点大幅回落且大单净额为负
                    // 如果09:33涨幅>5%且回落幅度>1.5%，且09:35大单净额为负，说明是"冲高出货"
                    const pullbackRate = change0933 - change0935
                    if (change0933 > 5 && pullbackRate > 1.5 && net0935 < 0) {
                        console.log(`[Stock筛选] ${stockName} 冲高回落: 09:33涨幅${change0933.toFixed(2)}% -> 09:35涨幅${change0935.toFixed(2)}%, 回落${pullbackRate.toFixed(2)}%, 大单净额${net0935}`)
                        return false
                    }

                    // 新增条件：如果 09:35 涨跌幅/资金流向/大单净额 全部 < 09:33，则需要检查例外
                    const changeDecline = change0935 < change0933
                    const flowDecline = flow0935 < flow0933
                    const netDecline = net0935 < net0933

                    // 如果三项全部下降，需要检查是否有例外
                    if (changeDecline && flowDecline && netDecline) {
                        // 查找该 Stock 对应的所有 Block（行业和概念）
                        const industry = stock['行业'] || ''
                        const concepts = stock['概念'] || []

                        // 收集所有匹配的 Block
                        const matchedBlockList = []
                        if (industry) {
                            const industryBlock = Industries.Data[0].filters.find(
                                (item) => item['指数简称'] === industry,
                            )
                            if (industryBlock) matchedBlockList.push(industryBlock)
                        }
                        if (Array.isArray(concepts)) {
                            concepts.forEach((concept) => {
                                const conceptBlock = Concepts.Data[0].filters.find(
                                    (item) => item['指数简称'] === concept,
                                )
                                if (conceptBlock) matchedBlockList.push(conceptBlock)
                            })
                        }

                        // 检查是否有 Block 满足例外条件
                        const hasException = matchedBlockList.some((block) => {
                            const blockFlow0935 = block[`${Dates.shareDate.td} 09:35`]?.资金流向 || 0
                            const blockNet0935 = block[`${Dates.shareDate.td} 09:35`]?.大单净额 || 0
                            const blockFlow0933 = block[`${Dates.shareDate.td} 09:33`]?.资金流向 || 0
                            const blockNet0933 = block[`${Dates.shareDate.td} 09:33`]?.大单净额 || 0

                            // 例外条件1：Block资金流向和大单净额都改善且为正
                            const fundImproving = (
                                blockFlow0935 > blockFlow0933 &&
                                blockNet0935 > blockNet0933 &&
                                blockFlow0935 > 0 &&
                                blockNet0935 > 0
                            )

                            // 例外条件2：Block是极热板块（涨停数>=5 且 上涨家数占比>=85%）
                            const pd1WinRate = block['昨日上涨家数占比'] ?? 0
                            const pd1LimitUpCount = block['昨日涨停数'] ?? 0
                            const isSuperHot = pd1LimitUpCount >= 5 && pd1WinRate >= 85

                            return fundImproving || isSuperHot
                        })

                        // 如果没有例外情况，则筛出
                        if (!hasException) {
                            console.log(`[Stock筛选] ${stockName} 三项全部下降且无例外`)
                            return false
                        }
                    }

                    // 相对强度条件：Stock 09:35涨跌幅 > 所有匹配的强势Block的09:35涨跌幅，或者Stock涨跌幅 > 3
                    // 例外：如果匹配的Block中有极热板块，则放宽此条件
                    if (change0935 <= 3) {
                        const industry = stock['行业'] || ''
                        const concepts = stock['概念'] || []
                        const matchedStrongBlocks = []

                        // 收集匹配的强势Block
                        strongBlockData.forEach((block) => {
                            const blockName = block['指数简称']
                            if (blockName === industry || (Array.isArray(concepts) && concepts.includes(blockName))) {
                                matchedStrongBlocks.push(block)
                            }
                        })

                        // 检查是否有极热板块
                        const hasSuperHotBlock = matchedStrongBlocks.some((block) => {
                            const pd1WinRate = block['昨日上涨家数占比'] ?? 0
                            const pd1LimitUpCount = block['昨日涨停数'] ?? 0
                            return pd1LimitUpCount >= 5 && pd1WinRate >= 85
                        })

                        // 如果没有极热板块，则检查相对强度
                        if (!hasSuperHotBlock && matchedStrongBlocks.length > 0) {
                            const blockChanges = matchedStrongBlocks.map((block) => {
                                return {
                                    name: block['指数简称'],
                                    change: block[`${Dates.shareDate.td} 09:35`]?.涨跌幅 || 0
                                }
                            })
                            const allStronger = matchedStrongBlocks.every((block) => {
                                const blockChange0935 = block[`${Dates.shareDate.td} 09:35`]?.涨跌幅 || 0
                                return change0935 > blockChange0935
                            })
                            if (!allStronger) {
                                console.log(`[Stock筛选] ${stockName} 相对强度不足: 股票涨跌幅${change0935}% <= Block涨跌幅`, blockChanges)
                                return false
                            }
                        }
                    }

                    return true
                })
                console.log(`[Stock筛选] 强势模式筛选结果: ${result.length} 只股票通过`)
            }

            // 按热度排名升序排序（排名越小越热门）
            result.sort((a, b) => {
                const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                return aHeat - bHeat
            })

            return result.map((s) => ({ ...s }))
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
            // 清除所有旧的高亮状态
            MatchChart.matchedStocks = []
            MatchChart.matchedBlocks = []
            MatchChart.selectedStock = null

            const blockName = row['指数简称']
            Stocks.selectedBlockName = blockName
            Stocks.currentBlockType = '行业'

            // 设置选中的 Block
            MatchChart.selectedBlock = { name: blockName, type: '行业' }

            // 计算匹配的 Stock（行业匹配或概念匹配）
            const matchedStocks = []
            Stocks.Data[0].filters.forEach((stock) => {
                const stockName = stock['股票简称']
                const industry = stock['行业'] || ''
                const concepts = stock['概念'] || []

                if (industry === blockName || (Array.isArray(concepts) && concepts.includes(blockName))) {
                    matchedStocks.push(stockName)
                }
            })
            MatchChart.matchedStocks = matchedStocks
            MatchChart.matchedBlocks = [] // 清除匹配的 Block

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

            // 极热板块判断
            const isSuperHot = pd1LimitUpCount >= 5 && pd1WinRate >= 85

            // 基础条件：极热板块放宽资金要求
            const baseCondition = pd1Change > 1.5 && td0935Change > 0.5 && (pd1NetInflow > 0 || isSuperHot)
            const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
            const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
            const useSimpleMA = pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish = useSimpleMA
                ? M01 > M05 && M01 > M10 && M01 > M30
                : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60

            console.log(`=== 强势筛选分析 - ${blockName} ===`, {
                极热板块: {
                    昨日涨停数: pd1LimitUpCount,
                    昨日上涨家数占比: pd1WinRate,
                    是否极热: isSuperHot,
                },
                基础条件: {
                    昨日涨跌幅: pd1Change,
                    昨日大单净额: pd1NetInflow,
                    '今日 09:35 涨跌幅': td0935Change,
                    '极热板块放宽资金': isSuperHot,
                    是否满足: baseCondition,
                },
                资金流向条件: {
                    '09:35 资金流向': td0935CapitalFlow,
                    '09:35 大单净额': td0935NetInflow,
                    '09:33 资金流向': td0933CapitalFlow,
                    '09:33 大单净额': td0933NetInflow,
                    为正: flowPositive,
                    改善: flowImproving,
                    '极热板块放宽': isSuperHot,
                    是否满足: isSuperHot || flowPositive || flowImproving,
                },
                板块热度: {
                    昨日上涨家数占比: pd1WinRate,
                    昨日涨停数: pd1LimitUpCount,
                    是否满足: blockHeat,
                },
                均线多头: {
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    M30: M30,
                    M60: M60,
                    使用简化规则: useSimpleMA,
                    是否满足: maBullish,
                },
                最终结果: baseCondition && (isSuperHot || flowPositive || flowImproving) && blockHeat && maBullish,
            })
        }

        // 处理概念行点击 - 触发 Stock 数据请求
        const handleConceptRowClick = async (row) => {
            // 清除所有旧的高亮状态
            MatchChart.matchedStocks = []
            MatchChart.matchedBlocks = []
            MatchChart.selectedStock = null

            const blockName = row['指数简称']
            Stocks.selectedBlockName = blockName
            Stocks.currentBlockType = '概念'

            // 设置选中的 Block
            MatchChart.selectedBlock = { name: blockName, type: '概念' }

            // 计算匹配的 Stock（概念匹配）
            const matchedStocks = []
            Stocks.Data[0].filters.forEach((stock) => {
                const stockName = stock['股票简称']
                const concepts = stock['概念'] || []

                if (Array.isArray(concepts) && concepts.includes(blockName)) {
                    matchedStocks.push(stockName)
                }
            })
            MatchChart.matchedStocks = matchedStocks
            MatchChart.matchedBlocks = [] // 清除匹配的 Block

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

            // 极热板块判断
            const isSuperHot = pd1LimitUpCount >= 5 && pd1WinRate >= 85

            // 基础条件：极热板块放宽资金要求
            const baseCondition = pd1Change > 1.5 && td0935Change > 0.5 && (pd1NetInflow > 0 || isSuperHot)
            const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
            const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
            const useSimpleMA = pd1CapitalFlow > 0 && pd1NetInflow > 0
            const maBullish = useSimpleMA
                ? M01 > M05 && M01 > M10 && M01 > M30
                : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60

            console.log(`=== 强势筛选分析 - ${blockName} ===`, {
                极热板块: {
                    昨日涨停数: pd1LimitUpCount,
                    昨日上涨家数占比: pd1WinRate,
                    是否极热: isSuperHot,
                },
                基础条件: {
                    昨日涨跌幅: pd1Change,
                    昨日大单净额: pd1NetInflow,
                    '今日 09:35 涨跌幅': td0935Change,
                    '极热板块放宽资金': isSuperHot,
                    是否满足: baseCondition,
                },
                资金流向条件: {
                    '09:35 资金流向': td0935CapitalFlow,
                    '09:35 大单净额': td0935NetInflow,
                    '09:33 资金流向': td0933CapitalFlow,
                    '09:33 大单净额': td0933NetInflow,
                    为正: flowPositive,
                    改善: flowImproving,
                    '极热板块放宽': isSuperHot,
                    是否满足: isSuperHot || flowPositive || flowImproving,
                },
                板块热度: {
                    昨日上涨家数占比: pd1WinRate,
                    昨日涨停数: pd1LimitUpCount,
                    是否满足: blockHeat,
                },
                均线多头: {
                    M01: M01,
                    M05: M05,
                    M10: M10,
                    M30: M30,
                    M60: M60,
                    使用简化规则: useSimpleMA,
                    是否满足: maBullish,
                },
                最终结果: baseCondition && (isSuperHot || flowPositive || flowImproving) && blockHeat && maBullish,
            })
        }

        // 处理 Stock 行点击 - 打印强势筛选分析信息
        const handleStockRowClick = (row) => {
            // 清除所有旧的高亮状态
            MatchChart.matchedStocks = []
            MatchChart.matchedBlocks = []
            MatchChart.selectedBlock = null

            const stockName = row['股票简称']
            const industry = row['行业'] || ''
            const concepts = row['概念'] || []

            // 设置选中的 Stock
            MatchChart.selectedStock = { name: stockName, industry, concepts }

            // 计算匹配的 Block（行业或概念）
            const matchedBlocks = []

            // 查找匹配的行业 Block
            if (industry) {
                const industryBlock = Industries.Data[0].filters.find((item) => item['指数简称'] === industry)
                if (industryBlock) {
                    matchedBlocks.push({ name: industry, type: '行业' })
                }
            }

            // 查找匹配的概念 Block
            if (Array.isArray(concepts)) {
                concepts.forEach((concept) => {
                    const conceptBlock = Concepts.Data[0].filters.find((item) => item['指数简称'] === concept)
                    if (conceptBlock) {
                        matchedBlocks.push({ name: concept, type: '概念' })
                    }
                })
            }

            MatchChart.matchedBlocks = matchedBlocks
            MatchChart.matchedStocks = [] // 清除匹配的 Stock

            // 获取所点击指数的 09:35 涨跌幅
            const blockName = Stocks.selectedBlockName
            const blockType = Stocks.currentBlockType
            let block0935Change = 0

            if (blockName && blockType) {
                const blockData =
                    blockType === '行业'
                        ? Industries.Data[0].filters.find((item) => item['指数简称'] === blockName)
                        : Concepts.Data[0].filters.find((item) => item['指数简称'] === blockName)
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
            const td0933Change = row[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
            const td0933CapitalFlow = row[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
            const td0933NetInflow = row[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity

            // 判断涨停阈值：主板9.5%，创业板/科创板19.5%
            const code = row['code'] || ''
            const isMainBoard = code.startsWith('60') || code.startsWith('00')
            const limitUpThreshold = isMainBoard ? 9.5 : 19.5

            // 炸板判断：09:33涨停但09:35炸板
            const is0933LimitUp = td0933Change >= limitUpThreshold
            const is0935LimitUp = td0935Change >= limitUpThreshold
            const isBrokenBoard = is0933LimitUp && !is0935LimitUp

            // 强势筛选条件
            const condition1 = pd1Change > 4
            const condition2Standard = pd1NetInflowVol > 0.4
            const condition2Combo =
                pd1CapitalFlow > 0 && td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const condition2 = condition2Standard || condition2Combo
            const condition3 = M01 > M05 && M01 > M30
            const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
            const condition4 = td0935Change > 2 && (td0935Change > 3 || flowImproving)
            // 条件5：排除炸板
            const condition5 = !isBrokenBoard

            const isStrong = condition1 && condition2 && condition3 && condition4 && condition5

            // 判断 Block 是否为强势的函数（与 isBlockStrong 保持一致）
            const isStrongBlock = (blockData) => {
                const pd1Change = blockData[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
                const pd1NetInflow = blockData[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
                const pd1CapitalFlow = blockData[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
                const td0935Change = blockData[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const td0935CapitalFlow = blockData[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
                const td0935NetInflow = blockData[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
                const td0933CapitalFlow = blockData[`${Dates.shareDate.td} 09:33`]?.资金流向 ?? -Infinity
                const td0933NetInflow = blockData[`${Dates.shareDate.td} 09:33`]?.大单净额 ?? -Infinity
                const td0933Change = blockData[`${Dates.shareDate.td} 09:33`]?.涨跌幅 ?? -Infinity
                const pd1WinRate = blockData['昨日上涨家数占比'] ?? 0
                const pd1LimitUpCount = blockData['昨日涨停数'] ?? 0
                const M01 = blockData.M01 ?? 0
                const M05 = blockData.M05 ?? 0
                const M10 = blockData.M10 ?? 0
                const M30 = blockData.M30 ?? 0
                const M60 = blockData.M60 ?? 0

                // 成交量和突破条件
                const pd1Volume = blockData[Dates.shareDate.pd1]?.成交量 ?? -Infinity
                const pd2Volume = blockData[Dates.shareDate.pd2]?.成交量 ?? -Infinity
                const pd2NetInflow = blockData[Dates.shareDate.pd2]?.大单净额 ?? -Infinity
                const volumeCondition = pd1Volume > pd2Volume || pd1NetInflow > pd2NetInflow

                const high5 = blockData['前5交易日区间最高价'] ?? 0
                const breakoutCondition = M01 >= high5 * 0.965 && high5 > 0

                // 排名条件
                const rank0935 = blockData['09:35涨跌幅排名'] ?? 9999
                const rankYesterday = blockData['昨日涨跌幅排名'] ?? 9999
                const rankCondition = rank0935 <= 5 && (rankYesterday <= 10 || pd1Change > 2)

                // 极热板块判断
                const isSuperHot = pd1LimitUpCount >= 5 && pd1WinRate >= 85

                // 基础条件：极热板块放宽资金要求
                const baseCondition = pd1Change > 1.5 && td0935Change > 0.5 && (pd1NetInflow > 0 || isSuperHot)
                const flowPositive = td0935CapitalFlow > 0 || td0935NetInflow > 0
                const flowImproving = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                const blockHeat = pd1WinRate > 60 && pd1LimitUpCount > 0
                const maBullish =
                    pd1CapitalFlow > 0 && pd1NetInflow > 0
                        ? M01 > M05 && M01 > M10 && M01 > M30
                        : M01 > M05 && M01 > M10 && M01 > M30 && M01 > M60
                const maOrFlowCondition =
                    M01 > M60 || (td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow)
                const flowNegative = td0935CapitalFlow < 0 && td0935NetInflow < 0
                const allImproving =
                    td0935Change > td0933Change &&
                    td0935CapitalFlow > td0933CapitalFlow &&
                    td0935NetInflow > td0933NetInflow
                const flowCondition = isSuperHot || !flowNegative || allImproving
                const flowWorsening = td0935CapitalFlow < td0933CapitalFlow && td0935NetInflow < td0933NetInflow
                const lowChange = td0935Change < 1
                const flowPositiveBoth = td0935CapitalFlow > 0 && td0935NetInflow > 0
                const flowImprovingBoth = td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow
                const lowChangeCondition = !lowChange || flowPositiveBoth || flowImprovingBoth

                const result = (
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
                    rankCondition
                )

                // 输出各条件详情
                if (!result) {
                    console.log(`[Block条件详情] ${blockData['指数简称']}:`, {
                        '极热板块': isSuperHot,
                        '基础条件(涨跌幅+资金)': baseCondition,
                        '成交量/大单改善': volumeCondition,
                        '突破条件': breakoutCondition,
                        '排名条件': rankCondition,
                        '均线多头': maBullish,
                        '热度条件': blockHeat,
                        '最终结果': result
                    })
                }

                return result
            }

            // 收集所有匹配 Block 的详细数据（用于例外判断）- 只包含强势 Block
            const matchedBlockDetails = matchedBlocks
                .map((block) => {
                    const blockData =
                        block.type === '行业'
                            ? Industries.Data[0].filters.find((item) => item['指数简称'] === block.name)
                            : Concepts.Data[0].filters.find((item) => item['指数简称'] === block.name)

                    if (!blockData) return null

                    // 只处理强势 Block
                    if (!isStrongBlock(blockData)) return null

                    const blockTd0935 = blockData[`${Dates.shareDate.td} 09:35`]
                    const blockTd0933 = blockData[`${Dates.shareDate.td} 09:33`]
                    const blockPd1 = blockData[Dates.shareDate.pd1]

                    return {
                        'Block 名称': block.name,
                        'Block 类型': block.type,
                        '09:35 涨跌幅': blockTd0935?.涨跌幅 ?? 0,
                        '09:35 资金流向': blockTd0935?.资金流向 ?? 0,
                        '09:35 大单净额': blockTd0935?.大单净额 ?? 0,
                        '09:33 涨跌幅': blockTd0933?.涨跌幅 ?? 0,
                        '09:33 资金流向': blockTd0933?.资金流向 ?? 0,
                        '09:33 大单净额': blockTd0933?.大单净额 ?? 0,
                        '09:35 vs 09:33 涨跌幅对比':
                            (blockTd0935?.涨跌幅 ?? 0) > (blockTd0933?.涨跌幅 ?? 0) ? '改善' : '下降',
                        '09:35 vs 09:33 资金流向对比':
                            (blockTd0935?.资金流向 ?? 0) > (blockTd0933?.资金流向 ?? 0) ? '改善' : '下降',
                        '09:35 vs 09:33 大单净额对比':
                            (blockTd0935?.大单净额 ?? 0) > (blockTd0933?.大单净额 ?? 0) ? '改善' : '下降',
                        昨日涨跌幅: blockPd1?.涨跌幅 ?? 0,
                        昨日资金流向: blockPd1?.资金流向 ?? 0,
                        昨日大单净额: blockPd1?.大单净额 ?? 0,
                        '是否满足例外条件 (资金流向和大单净额均改善且为正)':
                            (blockTd0935?.资金流向 ?? 0) > (blockTd0933?.资金流向 ?? 0) &&
                            (blockTd0935?.大单净额 ?? 0) > (blockTd0933?.大单净额 ?? 0) &&
                            (blockTd0935?.资金流向 ?? 0) > 0 &&
                            (blockTd0935?.大单净额 ?? 0) > 0,
                    }
                })
                .filter(Boolean)

            console.log(`=== 强势筛选分析 - ${stockName} ===`, {
                'Stock 自身数据': {
                    昨日涨幅: pd1Change,
                    昨日大单净量: pd1NetInflowVol,
                    昨日资金流向: pd1CapitalFlow,
                    M01: M01,
                    M05: M05,
                    M30: M30,
                    '今日 09:35 涨跌幅': td0935Change,
                    '今日 09:35 资金流向': td0935CapitalFlow,
                    '今日 09:35 大单净额': td0935NetInflow,
                    '今日 09:33 涨跌幅': td0933Change,
                    '今日 09:33 资金流向': td0933CapitalFlow,
                    '今日 09:33 大单净额': td0933NetInflow,
                    '09:35 vs 09:33 涨跌幅对比': td0935Change > td0933Change ? '改善' : '下降',
                    '09:35 vs 09:33 资金流向对比': td0935CapitalFlow > td0933CapitalFlow ? '改善' : '下降',
                    '09:35 vs 09:33 大单净额对比': td0935NetInflow > td0933NetInflow ? '改善' : '下降',
                },
                '所点击指数 09:35 涨跌幅': block0935Change,
                强势筛选条件: {
                    '条件 1(昨日涨幅>4)': condition1,
                    '条件 2(大单净量>0.4 或组合)': condition2,
                    '  - 标准条件 (大单净量>0.4)': condition2Standard,
                    '  - 组合条件 (资金流>0 且改善)': condition2Combo,
                    '条件 3(M01>M05&&M01>M30)': condition3,
                    '条件 4(09:35 涨幅>2 且 (>3 或改善))': condition4,
                    '  - 资金流改善': flowImproving,
                    是否满足: isStrong,
                },
                '匹配的强势 Block 详情 (数组)': matchedBlockDetails,
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
            // 删除该日期的 Stock 缓存（使用简单日期 key）
            delete stocksCache[tdcn]

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
                    folder.file(`industry_${td}.json`, JSON.stringify({
                        fetchTime: new Date().toISOString(),
                        date: td,
                        dateCn: tdcn,
                        count: industriesData.length,
                        dates: Dates.shareDate,
                        data: industriesData,
                    }, null, 2))
                }

                // 添加概念数据
                if (conceptsData.length > 0) {
                    folder.file(`concept_${td}.json`, JSON.stringify({
                        fetchTime: new Date().toISOString(),
                        date: td,
                        dateCn: tdcn,
                        count: conceptsData.length,
                        dates: Dates.shareDate,
                        data: conceptsData,
                    }, null, 2))
                }

                // 添加股票数据
                if (stocksData.length > 0) {
                    folder.file(`stock_${td}.json`, JSON.stringify({
                        fetchTime: new Date().toISOString(),
                        date: td,
                        dateCn: tdcn,
                        count: stocksData.length,
                        dates: Dates.shareDate,
                        data: stocksData,
                    }, null, 2))
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

                ElementPlus.ElMessage.success(`已下载 ${td}.zip：行业${industriesData.length} 概念${conceptsData.length} 股票${stocksData.length}`)
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

        // 行业表格行类名 - 用于高亮选中的行或与选中 Stock 匹配的行
        const industryRowClassName = ({ row }) => {
            const blockName = row['指数简称']
            // 当前选中的 Block 高亮
            if (MatchChart.selectedBlock?.name === blockName) {
                return 'row-highlight'
            }
            // 与选中 Stock 匹配的 Block 高亮
            if (MatchChart.selectedStock && MatchChart.matchedBlocks.some((b) => b.name === blockName)) {
                return 'row-highlight'
            }
            return ''
        }

        // 概念表格行类名 - 用于高亮选中的行或与选中 Stock 匹配的行
        const conceptRowClassName = ({ row }) => {
            const blockName = row['指数简称']
            // 当前选中的 Block 高亮
            if (MatchChart.selectedBlock?.name === blockName) {
                return 'row-highlight'
            }
            // 与选中 Stock 匹配的 Block 高亮
            if (MatchChart.selectedStock && MatchChart.matchedBlocks.some((b) => b.name === blockName)) {
                return 'row-highlight'
            }
            return ''
        }

        // Stock 表格行类名 - 用于高亮选中的行或与选中 Block 匹配的行
        const stockRowClassName = ({ row }) => {
            const stockName = row['股票简称']
            // 当前选中的 Stock 高亮
            if (MatchChart.selectedStock?.name === stockName) {
                return 'row-highlight'
            }
            // 与选中 Block 匹配的 Stock 高亮
            if (MatchChart.selectedBlock && MatchChart.matchedStocks.includes(stockName)) {
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
            toggleIndustryFilterMode,
            toggleConceptFilterMode,
            toggleStockFilterMode,
            handleIndustryRowClick,
            handleConceptRowClick,
            handleStockRowClick,
            industryRowClassName,
            conceptRowClassName,
            stockRowClassName,
            clearCache,
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
