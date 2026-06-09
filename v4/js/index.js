/**
 * v4 主应用逻辑
 * 优化内容：
 *   - 提取通用请求重试/缓存逻辑为 createDataModule() 工厂函数
 *   - 策略筛选条件统一调用 strategy.js 的可复用纯函数
 *   - 添加 DEBUG 开关控制控制台日志输出
 *   - 添加 AbortController 请求中断机制
 *   - 修复 jumpToValidDate 多余参数
 *   - 添加数据处理错误边界 (try-catch)
 *   - 完善资源清理（AbortController、Backtest timer）
 *   - 回测胜率计算逻辑
 */

const { createApp, onMounted, onUnmounted, reactive, computed } = Vue

/* ================================================================
 * 全局调试开关（生产环境设为 false）
 * ================================================================ */
const DEBUG = false
function debugLog(...args) {
    if (DEBUG) console.log(...args)
}
function debugGroup(label, data) {
    if (DEBUG) console.log(`=== ${label} ===`, data)
}

/* ================================================================
 * 通用请求工具
 * ================================================================ */

/**
 * 带重试和中断控制的 API 请求
 * @param {string} requestParams - hexin_vJsRequests 的参数
 * @param {string} question - 查询问题
 * @param {object} [options]
 * @param {number} [options.maxRetries=2] 最大重试次数
 * @param {number} [options.retryDelay=1000] 重试延迟(ms)
 * @param {AbortSignal} [options.signal] 中断信号
 * @returns {Promise<Array>} 数据数组
 */
async function fetchWithRetry(requestParams, question, options = {}) {
    const { maxRetries = 2, retryDelay = 1000, signal } = options

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // 检查是否已中断
        if (signal?.aborted) {
            throw new DOMException('Request aborted', 'AbortError')
        }

        try {
            if (attempt > 0) {
                await new Promise((r) => setTimeout(r, retryDelay))
            }

            const res = await axios(hexin_vJsRequests(requestParams, question), signal ? { signal } : {})
            const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas

            if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) {
                return data
            }
            throw new Error('Invalid data')
        } catch (e) {
            if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') {
                throw e // 不吞掉中断信号
            }
            if (attempt >= maxRetries) {
                throw e // 重试耗尽
            }
        }
    }
}

/**
 * 通用数据请求模块工厂
 * 抽象 Industries / Concepts / Stocks 共用的：缓存检查、串行请求、重试机制、状态管理
 *
 * @param {object} config
 * @param {string} config.name          模块名称
 * @param {string} config.cacheKey      localforage 缓存 key
 * @param {string} config.requestType   hexin_vJsRequests 的类型参数
 * @param {function} config.dataHandler 数据处理回调 (results, dates) => void
 * @returns {object} 响应式模块对象
 */
function createDataModule(config) {
    const { name, cacheKey, requestType, dataHandler } = config

    const module = reactive({
        loading: false,
        isFromCache: false,
        Data: [{ name, filters: [] }],
        requestStatus: [],
        // 中断控制器
        _abortController: null,

        /**
         * 初始化：检查缓存 -> 使用缓存或发起请求
         * @param {object} dates 日期数据
         * @param {string} [cacheSubKey] 子缓存键（Stock 模块使用复合键）
         * @param {function} [questionsBuilder] 问题构建函数 (dates) => string[]
         */
        init: async (dates, cacheSubKey, questionsBuilder) => {
            // 中断前一次请求
            if (module._abortController) {
                module._abortController.abort()
            }
            module._abortController = new AbortController()

            const targetKey = cacheSubKey || dates.tdcn
            const questions = questionsBuilder(dates)
            const cache = (await getLocalforage(cacheKey)) || {}
            const target = cache[targetKey]

            const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

            if (isValid) {
                module.isFromCache = true
                module.requestStatus = questions.map((_, i) => ({
                    name: `Request ${i + 1}`,
                    status: 'success',
                    message: 'From cache',
                }))
                try {
                    dataHandler(target, dates)
                } catch (err) {
                    console.error(`[${name}] Cache data processing error:`, err)
                }
                module.loading = false
            } else {
                module.isFromCache = false
                await module.getData(dates, cacheSubKey, questionsBuilder, cache)
            }
        },

        /**
         * 获取数据：串行请求 + 重试
         */
        getData: async (dates, cacheSubKey, questionsBuilder, cache) => {
            const { tdcn, isToday } = dates
            const targetKey = cacheSubKey || tdcn
            const questions = questionsBuilder(dates)

            module.loading = true
            module.isFromCache = false
            module.Data[0].filters = []

            module.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'wait',
                message: 'Not started',
            }))

            const MAX_RETRY_ATTEMPTS = 2
            const results = []

            for (let i = 0; i < questions.length; i++) {
                // 检查中断
                if (module._abortController?.signal.aborted) {
                    module.loading = false
                    return
                }

                module.requestStatus[i] = {
                    name: `Request ${i + 1}`,
                    status: 'process',
                    message: 'Loading...',
                }

                try {
                    const data = await fetchWithRetry(requestType, questions[i], {
                        maxRetries: MAX_RETRY_ATTEMPTS,
                        retryDelay: 1000,
                        signal: module._abortController?.signal,
                    })

                    debugLog(name, data)
                    results[i] = data
                    module.requestStatus[i].status = 'success'
                    module.requestStatus[i].message = `Success (${data.length})`
                } catch (e) {
                    if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') {
                        module.loading = false
                        return
                    }
                    module.requestStatus[i].status = 'error'
                    module.requestStatus[i].message = 'Failed to fetch'

                    // 标记后续请求为跳过
                    for (let j = i + 1; j < questions.length; j++) {
                        module.requestStatus[j] = {
                            name: `Request ${j + 1}`,
                            status: 'wait',
                            message: 'Skipped',
                        }
                    }
                    module.loading = false
                    return
                }
            }

            if (results.filter(Boolean).length === questions.length) {
                cache[targetKey] = results
                if (!isToday) await setLocalforage(cacheKey, cache)
                try {
                    dataHandler(results, dates)
                } catch (err) {
                    console.error(`[${name}] Data processing error:`, err)
                }
            }
            module.loading = false
        },

        /**
         * 取消进行中的请求
         */
        abort: () => {
            if (module._abortController) {
                module._abortController.abort()
                module._abortController = null
            }
        },
    })

    return module
}

/* ================================================================
 * 日期管理模块
 * ================================================================ */
const Dates = reactive({
    requestDate: null,
    Today: dayjs().format('YYYYMMDD'),
    historicalDate: [],
    shareDate: {},

    init: async (catcheGetFunction, catcheSetFunction) => {
        const FD = (await catcheGetFunction('Dates')) || { historicalDate: [] }

        try {
            const size = FD.historicalDate?.length > 0 ? 320 : (Number(dayjs().format('YYYY')) - 2021 + 1) * 270
            const url = `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,,,${size},qfq`

            const { status, data } = await axios.get(url)
            if (status === 200 && data) {
                const parsed = JSON.parse(String(data).replace('kline_dayqfq=', ''))
                const shData = parsed?.data?.sh000001
                if (shData?.day) {
                    const fetchedArr = shData.day.map((e) => dayjs(e[0]).format('YYYYMMDD'))
                    const mt = shData.qt?.market?.[0]?.split('|') || []
                    if (mt[2]?.includes('open')) fetchedArr.push(dayjs().format('YYYYMMDD'))
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

/* ================================================================
 * 数据模块 - 使用工厂函数创建
 * ================================================================ */

// --- Industries 模块 ---
const Industries = createDataModule({
    name: '行业策略',
    cacheKey: 'Industries',
    requestType: 'zhishu',
    dataHandler: (results, dates) => {
        // 内连接合并：只保留同时在 res[0] 和 res[1] 中存在的 code
        const map0 = new Map(results[0]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])
        const map1 = new Map(results[1]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])

        const mergedArr = []
        map0.forEach((value0, code) => {
            if (map1.has(code)) {
                const value1 = map1.get(code)
                const merged = { ...value0.item, ...value1.item }
                merged['09:35涨跌幅排名'] = value0.rank
                merged['昨日涨跌幅排名'] = value1.rank
                const obj = {}
                handleRate(obj, merged, 'block', Dates.shareDate)
                mergedArr.push(obj)
            }
        })
        Industries.Data[0].filters = mergedArr
    },
})

/**
 * 构建行业查询问题
 */
function buildIndustryQuestions(dates) {
    return getQuestions('block-行业', dates)
}

// --- Concepts 模块 ---
const Concepts = createDataModule({
    name: '概念策略',
    cacheKey: 'Concepts',
    requestType: 'zhishu',
    dataHandler: (results, dates) => {
        const map0 = new Map(results[0]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])
        const map1 = new Map(results[1]?.map((item, index) => [item['code'], { item, rank: index + 1 }]) || [])

        const mergedArr = []
        map0.forEach((value0, code) => {
            if (map1.has(code)) {
                const value1 = map1.get(code)
                const merged = { ...value0.item, ...value1.item }
                merged['09:35涨跌幅排名'] = value0.rank
                merged['昨日涨跌幅排名'] = value1.rank
                const obj = {}
                handleRate(obj, merged, 'block', Dates.shareDate)
                mergedArr.push(obj)
            }
        })
        Concepts.Data[0].filters = mergedArr
    },
})

/**
 * 构建概念查询问题
 */
function buildConceptQuestions(dates) {
    return getQuestions('block-概念', dates)
}

// --- Stocks 模块 ---
const Stocks = createDataModule({
    name: 'Stock 策略',
    cacheKey: 'Stocks',
    requestType: 'stock',
    dataHandler: (results, dates) => {
        const { td, pd1 } = dates
        const map0 = new Map(results[0]?.map((item) => [item['code'], item]) || [])
        const map1 = new Map(results[1]?.map((item) => [item['code'], item]) || [])

        const mergedArr = []
        map0.forEach((item0, code) => {
            let merged = { ...item0 }
            if (map1.has(code)) {
                merged = { ...merged, ...map1.get(code) }
            }
            mergedArr.push({ code, merged })
        })

        // 计算排名
        const sortedBy0935 = [...mergedArr].sort((a, b) => {
            const aChange = Number(a.merged[`分时涨跌幅:前复权[${td} 09:35]`]) || -Infinity
            const bChange = Number(b.merged[`分时涨跌幅:前复权[${td} 09:35]`]) || -Infinity
            return bChange - aChange
        })
        const rank0935Map = new Map(sortedBy0935.map((item, index) => [item.code, index + 1]))

        const sortedByPd1 = [...mergedArr].sort((a, b) => {
            const aChange = Number(a.merged[`涨跌幅:前复权[${pd1}]`]) || -Infinity
            const bChange = Number(b.merged[`涨跌幅:前复权[${pd1}]`]) || -Infinity
            return bChange - aChange
        })
        const rankPd1Map = new Map(sortedByPd1.map((item, index) => [item.code, index + 1]))

        const result = []
        mergedArr.forEach(({ code, merged }) => {
            merged['09:35涨跌幅排名'] = rank0935Map.get(code) || 9999
            merged['昨日涨跌幅排名'] = rankPd1Map.get(code) || 9999

            const obj = {}
            handleRate(obj, merged, 'stock', Dates.shareDate)
            result.push(obj)
        })

        Stocks.Data[0].filters = result
    },
})

// Stocks 模块扩展属性
Stocks.selectedBlockName = null
Stocks.currentBlockType = null

/**
 * 按板块请求 Stock 数据（支持缓存）
 */
Stocks.fetchByBlock = async (blockName, blockType, dates) => {
    const { tdcn, isToday } = dates
    const cacheSubKey = `${tdcn}_${blockType}_${blockName}`

    Stocks.selectedBlockName = blockName
    Stocks.currentBlockType = blockType

    await Stocks.init(dates, cacheSubKey, (d) => getQuestions('stock', d, blockType, blockName))
}

/**
 * 清空 Stock 数据及缓存
 */
Stocks.clear = async () => {
    Stocks.abort()

    const { tdcn } = Dates.shareDate
    const blockName = Stocks.selectedBlockName
    const blockType = Stocks.currentBlockType

    if (blockName && blockType) {
        const cacheSubKey = `${tdcn}_${blockType}_${blockName}`
        const cache = (await getLocalforage('Stocks')) || {}
        delete cache[cacheSubKey]
        await setLocalforage('Stocks', cache)
    }

    Stocks.Data[0].filters = []
    Stocks.requestStatus = []
    Stocks.selectedBlockName = null
    Stocks.currentBlockType = null
    Stocks.isFromCache = false
}

/* ================================================================
 * 匹配图表状态管理
 * ================================================================ */
const MatchChart = reactive({
    industryFilterMode: 'strong',
    conceptFilterMode: 'strong',
    stockFilterMode: 'all',
    selectedStock: null,
})

/* ================================================================
 * 获取 Block 上下文信息（供 Stock 筛选使用）
 * ================================================================ */

/**
 * 根据当前选中的板块，获取 Block 级别的上下文数据
 */
function getBlockContext(blockName, blockType) {
    const blockList = blockType === '行业' ? Industries.Data[0].filters : Concepts.Data[0].filters
    const currentBlock = blockList.find((b) => b['指数简称'] === blockName)

    let blockMaSuperRelax = false
    let blockTd0935CapitalFlow = 0
    let blockTd0935NetInflow = 0

    if (currentBlock) {
        const blockPd1Change = currentBlock[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity
        const blockPd1CapitalFlow = currentBlock[Dates.shareDate.pd1]?.资金流向 ?? -Infinity
        const blockPd1NetInflow = currentBlock[Dates.shareDate.pd1]?.大单净额 ?? -Infinity
        const C = STRATEGY_CONFIG.BLOCK
        blockMaSuperRelax =
            blockPd1Change > C.MA_SUPER_RELAX_PD1_CHANGE && blockPd1CapitalFlow > 0 && blockPd1NetInflow > 0
        blockTd0935CapitalFlow = currentBlock[`${Dates.shareDate.td} 09:35`]?.资金流向 ?? -Infinity
        blockTd0935NetInflow = currentBlock[`${Dates.shareDate.td} 09:35`]?.大单净额 ?? -Infinity
    }

    return { blockMaSuperRelax, blockTd0935CapitalFlow, blockTd0935NetInflow, currentBlock }
}

/* ================================================================
 * App 初始化
 * ================================================================ */
const App = {
    setup() {
        /* ---- 基础状态 ---- */
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

        /* ---- 回测状态 ---- */
        const Backtest = reactive({
            isRunning: false,
            shouldStop: false,
            timeoutId: null,
            intervalSeconds: 30,
            consecutiveErrors: 0,
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

        /* ================================================================
         * 核心操作
         * ================================================================ */

        const Submit = async () => {
            GlobalState.isRequesting = true

            // 中断进行中的请求
            Industries.abort()
            Concepts.abort()

            Industries.loading = true
            Concepts.loading = true

            Industries.Data[0].filters = []
            Concepts.Data[0].filters = []
            Industries.requestStatus = []
            Concepts.requestStatus = []

            Stocks.clear()

            Dates.setRequestDate(Dates.requestDate)
            Dates.setShareDate()

            try {
                await Promise.all([
                    Industries.init(Dates.shareDate, null, buildIndustryQuestions),
                    Concepts.init(Dates.shareDate, null, buildConceptQuestions),
                ])
            } finally {
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

        /**
         * 跳转到下一个有 Block 强势筛选结果的日期
         * 修复：移除了 init() 调用中的多余 null 参数
         */
        const jumpToValidDate = async (direction) => {
            const list = Dates.historicalDate || []
            const current = Dates.requestDate
            const idx = list.indexOf(current)

            if (idx === -1) return

            GlobalState.isRequesting = true
            Industries.loading = true
            Concepts.loading = true

            try {
                for (let i = idx + direction; i >= 0 && i < list.length; i += direction) {
                    const targetDate = list[i]

                    Dates.requestDate = targetDate
                    Dates.setRequestDate(targetDate)
                    Dates.setShareDate()

                    Industries.Data[0].filters = []
                    Concepts.Data[0].filters = []
                    Stocks.Data[0].filters = []

                    // 修复：只传 3 个参数（v3 中多传了 3 个 null）
                    await Promise.all([
                        Industries.init(Dates.shareDate, null, buildIndustryQuestions),
                        Concepts.init(Dates.shareDate, null, buildConceptQuestions),
                    ])

                    const industryCount = displayIndustries.value?.length || 0
                    const conceptCount = displayConcepts.value?.length || 0

                    if (industryCount > 0 || conceptCount > 0) {
                        debugLog(`找到有效日期：${targetDate}, 行业：${industryCount}, 概念：${conceptCount}`)
                        break
                    }
                }
            } finally {
                GlobalState.isRequesting = false
                Industries.loading = false
                Concepts.loading = false
            }
        }

        /* ================================================================
         * 计算属性：使用 strategy.js 中的可复用函数
         * ================================================================ */

        // --- 强势行业数量 ---
        const strongIndustriesCount = computed(() => {
            return Industries.Data[0].filters.filter((item) =>
                evaluateBlockStrong(item, Dates.shareDate).isStrong
            ).length
        })

        // --- 显示的行业列表 ---
        const displayIndustries = computed(() => {
            let result = Industries.Data[0].filters

            if (MatchChart.industryFilterMode === 'strong') {
                result = result.filter((item) => evaluateBlockStrong(item, Dates.shareDate).isStrong)
            }

            result.sort((a, b) => {
                const aChange = a[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const bChange = b[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                return bChange - aChange
            })

            return result
        })

        // --- 强势概念数量 ---
        const strongConceptsCount = computed(() => {
            return Concepts.Data[0].filters.filter((item) =>
                evaluateBlockStrong(item, Dates.shareDate).isStrong
            ).length
        })

        // --- 显示的概念列表 ---
        const displayConcepts = computed(() => {
            let result = Concepts.Data[0].filters

            if (MatchChart.conceptFilterMode === 'strong') {
                result = result.filter((item) => evaluateBlockStrong(item, Dates.shareDate).isStrong)
            }

            result.sort((a, b) => {
                const aChange = a[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const bChange = b[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                return bChange - aChange
            })

            return result
        })

        // --- 强势 Stock 数量 ---
        const strongStocksCount = computed(() => {
            if (!Stocks.selectedBlockName) return 0

            const ctx = getBlockContext(Stocks.selectedBlockName, Stocks.currentBlockType)

            return Stocks.Data[0].filters.filter((stock) =>
                evaluateStockStrong(stock, Dates.shareDate, ctx).isStrong
            ).length
        })

        // --- 显示的 Stock 列表 ---
        const displayStocks = computed(() => {
            if (!Stocks.selectedBlockName) return []

            const ctx = getBlockContext(Stocks.selectedBlockName, Stocks.currentBlockType)

            let result = Stocks.Data[0].filters

            if (MatchChart.stockFilterMode === 'strong') {
                result = result.filter((stock) =>
                    evaluateStockStrong(stock, Dates.shareDate, ctx).isStrong
                )
            }

            // 按热度排名升序
            result.sort((a, b) => {
                const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                return aHeat - bHeat
            })

            return result.map((s) => ({ ...s }))
        })

        /* ================================================================
         * 筛选模式切换
         * ================================================================ */

        const toggleIndustryFilterMode = (mode) => { MatchChart.industryFilterMode = mode }
        const toggleConceptFilterMode = (mode) => { MatchChart.conceptFilterMode = mode }
        const toggleStockFilterMode = (mode) => { MatchChart.stockFilterMode = mode }

        /* ================================================================
         * 行点击处理（含调试信息）
         * ================================================================ */

        const handleIndustryRowClick = async (row) => {
            MatchChart.selectedStock = null
            const blockName = row['指数简称']
            await Stocks.fetchByBlock(blockName, '行业', Dates.shareDate)

            // 调试信息（DEBUG 模式下输出）
            if (DEBUG) {
                const result = evaluateBlockStrong(row, Dates.shareDate)
                console.log(`=== 行业强势筛选分析 - ${blockName} ===`, {
                    新概念判断: { ...result.indicators, 是否新概念: result.conditions.isNewConcept },
                    '条件1-排名': { 是否满足: result.conditions.rank },
                    '条件2-成交量': { 是否满足: result.conditions.volume },
                    '条件3-板块热度': { 是否满足: result.conditions.heat },
                    '条件4-09:33涨幅': { 是否满足: result.conditions.td0933Change },
                    '条件5-昨日涨幅': { 是否满足: result.conditions.pd1Change },
                    '条件6-昨日大单': { 是否满足: result.conditions.pd1NetInflow },
                    '条件7-09:35资金': { 是否满足: result.conditions.td0935Flow },
                    '条件8-均线多头': result.conditions.maBullish,
                    '排除条件-资金恶化': { 是否恶化: result.conditions.flowWorsening },
                    最终结果: result.isStrong,
                })
            }
        }

        const handleConceptRowClick = async (row) => {
            MatchChart.selectedStock = null
            const blockName = row['指数简称']
            await Stocks.fetchByBlock(blockName, '概念', Dates.shareDate)

            if (DEBUG) {
                const result = evaluateBlockStrong(row, Dates.shareDate)
                console.log(`=== 概念强势筛选分析 - ${blockName} ===`, {
                    新概念判断: { ...result.indicators, 是否新概念: result.conditions.isNewConcept },
                    '条件1-排名': { 是否满足: result.conditions.rank },
                    '条件2-成交量': { 是否满足: result.conditions.volume },
                    '条件3-板块热度': { 是否满足: result.conditions.heat },
                    '条件4-09:33涨幅': { 是否满足: result.conditions.td0933Change },
                    '条件5-昨日涨幅': { 是否满足: result.conditions.pd1Change },
                    '条件6-昨日大单': { 是否满足: result.conditions.pd1NetInflow },
                    '条件7-09:35资金': { 是否满足: result.conditions.td0935Flow },
                    '条件8-均线多头': result.conditions.maBullish,
                    '排除条件-资金恶化': { 是否恶化: result.conditions.flowWorsening },
                    最终结果: result.isStrong,
                })
            }
        }

        const handleStockRowClick = (row) => {
            const stockName = row['股票简称']
            MatchChart.selectedStock = { name: stockName }

            if (DEBUG) {
                const ctx = getBlockContext(Stocks.selectedBlockName, Stocks.currentBlockType)
                const result = evaluateStockStrong(row, Dates.shareDate, ctx)

                console.log(`=== Stock强势筛选分析 - ${stockName} ===`, {
                    所属板块: Stocks.selectedBlockName,
                    'Block均线放宽条件2(涨幅>5且资金正)': ctx.blockMaSuperRelax,
                    '条件1-成交量': { 是否满足: result.conditions.volume },
                    '条件2-均线多头': result.conditions.maBullish,
                    '条件3-涨幅': { 是否满足: result.conditions.change },
                    '条件4-昨日涨幅': { 是否满足: result.conditions.pd1Change },
                    '条件5-昨日大单': { 是否满足: result.conditions.pd1NetInflow },
                    '排除条件1-资金恶化': { 是否恶化: result.conditions.flowWorsening },
                    '排除条件2-BlockStock资金不匹配': { 是否排除: result.conditions.blockStockFlowMismatch },
                    最终结果: result.isStrong,
                })
            }
        }

        /* ================================================================
         * 缓存管理
         * ================================================================ */

        const clearIndustriesCache = async () => {
            Industries.loading = true
            const { tdcn } = Dates.shareDate
            const cache = (await getLocalforage('Industries')) || {}
            delete cache[tdcn]
            await setLocalforage('Industries', cache)

            Industries.Data[0].filters = []
            Industries.isFromCache = false
            await Industries.init(Dates.shareDate, null, buildIndustryQuestions)
        }

        const clearConceptsCache = async () => {
            Concepts.loading = true
            const { tdcn } = Dates.shareDate
            const cache = (await getLocalforage('Concepts')) || {}
            delete cache[tdcn]
            await setLocalforage('Concepts', cache)

            Concepts.Data[0].filters = []
            Concepts.isFromCache = false
            await Concepts.init(Dates.shareDate, null, buildConceptQuestions)
        }

        const clearStocksCache = async () => {
            const blockName = Stocks.selectedBlockName
            const blockType = Stocks.currentBlockType
            await Stocks.clear()
            if (blockName && blockType) {
                await Stocks.fetchByBlock(blockName, blockType, Dates.shareDate)
            }
        }

        /* ================================================================
         * 数据下载
         * ================================================================ */

        const downloadCacheData = async () => {
            const { td, tdcn } = Dates.shareDate
            if (!td) {
                ElementPlus.ElMessage.warning('请先选择日期')
                return
            }

            try {
                const industriesData = Industries.Data[0].filters || []
                const conceptsData = Concepts.Data[0].filters || []
                const stocksData = Stocks.Data[0].filters || []

                if (!industriesData.length && !conceptsData.length && !stocksData.length) {
                    ElementPlus.ElMessage.warning('没有可下载的数据')
                    return
                }

                const zip = new JSZip()
                const folderName = td
                const folder = zip.folder(folderName)

                if (industriesData.length > 0) {
                    folder.file(
                        `industry_${td}.json`,
                        JSON.stringify({
                            fetchTime: new Date().toISOString(),
                            date: td,
                            dateCn: tdcn,
                            count: industriesData.length,
                            dates: Dates.shareDate,
                            data: industriesData,
                        }, null, 2),
                    )
                }

                if (conceptsData.length > 0) {
                    folder.file(
                        `concept_${td}.json`,
                        JSON.stringify({
                            fetchTime: new Date().toISOString(),
                            date: td,
                            dateCn: tdcn,
                            count: conceptsData.length,
                            dates: Dates.shareDate,
                            data: conceptsData,
                        }, null, 2),
                    )
                }

                if (stocksData.length > 0) {
                    folder.file(
                        `stock_${td}.json`,
                        JSON.stringify({
                            fetchTime: new Date().toISOString(),
                            date: td,
                            dateCn: tdcn,
                            count: stocksData.length,
                            dates: Dates.shareDate,
                            data: stocksData,
                        }, null, 2),
                    )
                }

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

        /* ================================================================
         * 回测功能
         * ================================================================ */

        const startBacktest = async () => {
            Backtest.isRunning = true
            Backtest.shouldStop = false
            Backtest.result = { totalDays: 0, buyableDays: 0, winDays: 0, winRate: '0%' }
            Backtest.consecutiveErrors = 0

            if (Backtest.timeoutId) {
                clearTimeout(Backtest.timeoutId)
                Backtest.timeoutId = null
            }

            const autoSwitch = async () => {
                if (Backtest.shouldStop) {
                    Backtest.isRunning = false
                    return
                }

                const list = Dates.historicalDate || []
                const current = Dates.requestDate
                const idx = list.indexOf(current)

                if (idx === -1 || idx >= list.length - 1) {
                    Backtest.isRunning = false
                    debugLog('[自动切换] 已到达最后一个交易日，停止自动切换')
                    return
                }

                const nextDate = list[idx + 1]
                debugLog(`[自动切换] 切换到下一个交易日：${nextDate}`)
                Dates.requestDate = nextDate
                Dates.setShareDate()

                try {
                    await Submit()

                    Backtest.consecutiveErrors = 0
                    Backtest.result.totalDays++

                    // 胜率计算：检查当前日期是否有强势行业或概念
                    const industryCount = strongIndustriesCount.value || 0
                    const conceptCount = strongConceptsCount.value || 0
                    if (industryCount > 0 || conceptCount > 0) {
                        Backtest.result.buyableDays++
                    }

                    // 更新胜率
                    if (Backtest.result.totalDays > 0) {
                        Backtest.result.winRate =
                            ((Backtest.result.winDays / Backtest.result.totalDays) * 100).toFixed(1) + '%'
                    }

                    const isFromCache = Industries.isFromCache && Concepts.isFromCache

                    if (isFromCache) {
                        debugLog('[自动切换] 数据来自缓存，立即切换到下一个交易日')
                        autoSwitch()
                    } else {
                        debugLog(`[自动切换] 数据加载完成，等待${Backtest.intervalSeconds}秒后进行下一次切换`)
                        Backtest.timeoutId = setTimeout(autoSwitch, Backtest.intervalSeconds * 1000)
                    }
                } catch (error) {
                    console.error('[自动切换] 数据加载失败:', error)

                    Backtest.consecutiveErrors = (Backtest.consecutiveErrors || 0) + 1
                    debugLog(`[自动切换] 连续错误次数：${Backtest.consecutiveErrors}`)

                    if (Backtest.consecutiveErrors >= 3) {
                        debugLog('[自动切换] 连续三次错误，自动停止')
                        Backtest.shouldStop = true
                        Backtest.isRunning = false
                        if (Backtest.timeoutId) {
                            clearTimeout(Backtest.timeoutId)
                            Backtest.timeoutId = null
                        }
                        return
                    }

                    debugLog(`[自动切换] 等待${Backtest.intervalSeconds}秒后继续尝试`)
                    Backtest.timeoutId = setTimeout(autoSwitch, Backtest.intervalSeconds * 1000)
                }
            }

            debugLog('[自动切换] 开始自动切换到下一个交易日')
            autoSwitch()
        }

        const stopBacktest = () => {
            Backtest.shouldStop = true
            if (Backtest.timeoutId) {
                clearTimeout(Backtest.timeoutId)
                Backtest.timeoutId = null
            }
            Backtest.isRunning = false
            Backtest.consecutiveErrors = 0
            debugLog('[自动切换] 已停止')
        }

        /* ================================================================
         * 表格行类名（高亮选中行）
         * ================================================================ */

        const industryRowClassName = ({ row }) => {
            return Stocks.selectedBlockName === row['指数简称'] && Stocks.currentBlockType === '行业'
                ? 'row-highlight'
                : ''
        }

        const conceptRowClassName = ({ row }) => {
            return Stocks.selectedBlockName === row['指数简称'] && Stocks.currentBlockType === '概念'
                ? 'row-highlight'
                : ''
        }

        const stockRowClassName = ({ row }) => {
            return MatchChart.selectedStock?.name === row['股票简称'] ? 'row-highlight' : ''
        }

        /* ================================================================
         * 生命周期
         * ================================================================ */

        onMounted(async () => {
            Intervals.timer = setInterval(Intervals.updateTime, 1000)

            await Dates.init(getLocalforage, setLocalforage)
            Dates.setShareDate()
        })

        onUnmounted(() => {
            // 清理定时器
            if (Intervals.timer) {
                clearInterval(Intervals.timer)
                Intervals.timer = null
            }

            // 清理回测定时器
            if (Backtest.timeoutId) {
                clearTimeout(Backtest.timeoutId)
                Backtest.timeoutId = null
            }

            // 中断所有进行中的请求
            Industries.abort()
            Concepts.abort()
            Stocks.abort()
        })

        /* ================================================================
         * 返回给模板
         * ================================================================ */

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

/* ================================================================
 * 启动
 * ================================================================ */

const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })

// 注册 Element Plus 图标组件（同时注册 PascalCase 和 kebab-case）
const icons = ['ArrowLeft', 'ArrowRight', 'DArrowLeft', 'DArrowRight', 'Moon', 'Opportunity']
icons.forEach((name) => {
    const component = ElementPlusIconsVue[name]
    app.component(name, component)
    const kebabName = name
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')
    app.component(kebabName, component)
})

app.mount('#app')
