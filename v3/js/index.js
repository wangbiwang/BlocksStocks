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

/** @description Blocks Module */
const Blocks = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: 'Block策略', filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        const { tdcn } = dates
        const questions = getQuestions('block', dates)
        const cache = (await catcheGetFunction('Blocks')) || {}
        const target = cache[tdcn]

        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Blocks.isFromCache = true
            Blocks.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleBlocksData(target)
        } else {
            Blocks.isFromCache = false
            await Blocks.getData(questions, catcheSetFunction, cache, dates)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
        const { tdcn, isToday } = dates
        Blocks.loading = true
        Blocks.isFromCache = false
        Blocks.Data[0].filters = []

        Blocks.requestStatus = questions.map((_, i) => ({
            name: `Request ${i + 1}`,
            status: 'wait',
            message: 'Not started',
        }))

        const MAX_RETRY_ATTEMPTS = 2
        const results = []

        for (let i = 0; i < questions.length; i++) {
            let success = false
            let attempt = 0

            Blocks.requestStatus[i] = {
                name: `Request ${i + 1}`,
                status: 'process',
                message: 'Loading...',
            }

            while (attempt <= MAX_RETRY_ATTEMPTS && !success) {
                try {
                    if (attempt > 0) {
                        Blocks.requestStatus[i].message = `Retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`
                        await new Promise((r) => setTimeout(r, 1000))
                    }

                    const res = await axios(hexin_vJsRequests('zhishu', questions[i]))
                    const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas

                    if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) {
                        results[i] = data
                        Blocks.requestStatus[i].status = 'success'
                        Blocks.requestStatus[i].message = `Success (${data.length})`
                        success = true
                    } else {
                        throw new Error('Invalid data')
                    }
                } catch (e) {
                    attempt++
                    if (attempt > MAX_RETRY_ATTEMPTS) {
                        Blocks.requestStatus[i].status = 'error'
                        Blocks.requestStatus[i].message = 'Failed to fetch'
                        for (let j = i + 1; j < questions.length; j++) {
                            Blocks.requestStatus[j] = {
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
            if (!isToday) await catcheSetFunction('Blocks', cache)
            handleBlocksData(results)
        }
    },
})

/** @description Connection Chart Module */
const ConnectionChart = reactive({
    data: [],
    totalPairs: 0,

    updateData: (stocks, blocks) => {
        const connectionData = findConnections(stocks, blocks)
        ConnectionChart.data = connectionData
        ConnectionChart.totalPairs = connectionData.length
    },
})

/** @description Match Chart Module - 用于管理匹配图的选中状态和筛选模式 */
const MatchChart = reactive({
    selectedBlock: null, // 当前选中的Block名称
    selectedStock: null, // 当前选中的Stock名称
    blockFilterMode: 'matched', // Block筛选模式：'all' | 'matched'
    stockFilterMode: 'matched', // Stock筛选模式：'all' | 'matched'
})

/** @description Stocks Module */
const Stocks = reactive({
    loading: false,
    isFromCache: false,
    Data: [{ name: 'Stock策略', filters: [] }],
    requestStatus: [],

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
            cache[tdcn] = results
            if (!isToday) await catcheSetFunction('Stocks', cache)
            handleStocksData(results)
        }
    },
})

/** @description Data Processing Functions */
async function handleBlocksData(res) {
    // 合并两个数组，按 code 去重，res[0] 的数据优先
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])
    const mergedMap = new Map()

    // 先添加 res[0] 的所有数据，标记 source = '1'
    map0.forEach((value, key) => {
        mergedMap.set(key, { ...value, source: '1' })
    })

    // 遍历 res[1]，如果 code 已存在则更新 source 为 '1,2'，否则添加并标记 '2'
    map1.forEach((value, key) => {
        if (mergedMap.has(key)) {
            mergedMap.set(key, { ...mergedMap.get(key), source: '1,2' })
        } else {
            mergedMap.set(key, { ...value, source: '2' })
        }
    })

    // 转换为数组并处理
    const arr = Array.from(mergedMap.values()).map((ele) => {
        const obj = {}
        handleRate(obj, ele, 'block', Dates.shareDate)
        // 保留 source 字段
        obj['source'] = ele.source
        return obj
    })

    Blocks.Data[0].filters = arr

    // 注意：连线图统一在 Submit 中更新，避免并行执行时的竞争条件
}

async function handleStocksData(res) {
    // 合并两个数组，按 code 去重，res[0] 的数据优先
    const map0 = new Map(res[0]?.map((item) => [item['code'], item]) || [])
    const map1 = new Map(res[1]?.map((item) => [item['code'], item]) || [])
    const mergedMap = new Map()

    // 先添加 res[0] 的所有数据，标记 source = '1'
    map0.forEach((value, key) => {
        mergedMap.set(key, { ...value, source: '1' })
    })

    // 遍历 res[1]，如果 code 已存在则更新 source 为 '1,2'，否则添加并标记 '2'
    map1.forEach((value, key) => {
        if (mergedMap.has(key)) {
            mergedMap.set(key, { ...mergedMap.get(key), source: '1,2' })
        } else {
            mergedMap.set(key, { ...value, source: '2' })
        }
    })

    // 转换为数组并处理
    const arr = Array.from(mergedMap.values()).map((ele) => {
        const obj = {}
        handleRate(obj, ele, 'stock', Dates.shareDate)
        // 保留 source 字段
        obj['source'] = ele.source
        return obj
    })

    Stocks.Data[0].filters = arr

    // 注意：连线图统一在 Submit 中更新，避免并行执行时的竞争条件
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
            Blocks.loading = true
            Stocks.loading = true

            // 清空数据
            Stocks.Data[0].filters = []
            Blocks.Data[0].filters = []
            Stocks.requestStatus = []
            Blocks.requestStatus = []
            ConnectionChart.data = []
            ConnectionChart.totalPairs = 0
            MatchChart.selectedBlock = null
            MatchChart.selectedStock = null
            MatchChart.blockFilterMode = 'matched'
            MatchChart.stockFilterMode = 'matched'

            Dates.setRequestDate(Dates.requestDate)
            Dates.setShareDate()

            try {
                // 并行获取Block和Stock数据
                await Promise.all([
                    Blocks.init(getLocalforage, setLocalforage, Dates.shareDate),
                    Stocks.init(getLocalforage, setLocalforage, Dates.shareDate),
                ])
                // 数据都加载完成后，统一更新连线图（避免并行执行时的竞争条件）
                ConnectionChart.updateData(Stocks.Data[0].filters, Blocks.Data[0].filters)
            } finally {
                // 无论成功失败都恢复按钮状态
                GlobalState.isRequesting = false
                Blocks.loading = false
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

        // 计算属性：显示的Block列表（根据筛选模式）
        const displayBlocks = computed(() => {
            // 添加依赖：当 selectedBlock 或 selectedStock 变化时重新计算
            const _selectedBlock = MatchChart.selectedBlock
            const _selectedStock = MatchChart.selectedStock

            if (!ConnectionChart.data || ConnectionChart.data.length === 0) {
                Blocks.Data[0].filters.forEach((block) => {
                    block.matchCount = 0
                })
                // 没有连接数据时：matched模式返回空数组，strong模式返回强势数据
                if (MatchChart.blockFilterMode === 'matched') {
                    return []
                }
                let result = Blocks.Data[0].filters

                // 强势筛选
                if (MatchChart.blockFilterMode === 'strong') {
                    result = result.filter((block) => {
                        const data0935 = block[`${Dates.shareDate.td} 09:35`]
                        if (!data0935) return false
                        const _35涨跌幅 = data0935.涨跌幅 || 0
                        const _35资金流向 = data0935.资金流向 || 0
                        const _35大单净额 = data0935.大单净额 || 0
                        const _33资金流向 = block[`${Dates.shareDate.td} 09:33`]?.资金流向 || 0
                        const _33大单净额 = block[`${Dates.shareDate.td} 09:33`]?.大单净额 || 0

                        return (
                            _35涨跌幅 > 0.5 &&
                            (_35资金流向 > 0 ||
                                _35大单净额 > 0 ||
                                (_35资金流向 > _33资金流向 && _35大单净额 > _33大单净额)) &&
                            !(_35资金流向 < _33资金流向 && _35大单净额 < _33大单净额)
                        )
                    })
                }

                // 按09:35涨跌幅降序排序（涨幅大的在前）
                result.sort((a, b) => {
                    const aChange = a[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    const bChange = b[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                    return bChange - aChange
                })

                // 返回新对象引用以强制刷新
                return result.map((b) => ({ ...b }))
            }

            // 根据筛选模式返回数据（返回新对象引用以强制刷新）
            // 三级递进：all -> strong -> matched
            let result = Blocks.Data[0].filters

            // 强势筛选
            if (MatchChart.blockFilterMode === 'strong' || MatchChart.blockFilterMode === 'matched') {
                result = result.filter((block) => {
                    const data0935 = block[`${Dates.shareDate.td} 09:35`]
                    if (!data0935) return false
                    const _35涨跌幅 = data0935.涨跌幅 || 0
                    const _35资金流向 = data0935.资金流向 || 0
                    const _35大单净额 = data0935.大单净额 || 0
                    const _33资金流向 = block[`${Dates.shareDate.td} 09:33`]?.资金流向 || 0
                    const _33大单净额 = block[`${Dates.shareDate.td} 09:33`]?.大单净额 || 0

                    return (
                        _35涨跌幅 > 0.5 &&
                        (_35资金流向 > 0 || _35大单净额 > 0 || (_35资金流向 > _33资金流向 && _35大单净额 > _33大单净额)) &&
                        !(_35资金流向 < _33资金流向 && _35大单净额 < _33大单净额)
                    )
                })
            }

            // 在强势数据基础上重新计算匹配数量
            // 使用与 displayStocks 相同的筛选逻辑
            const strongBlockData = result

            // 计算所有可能的连接（用于匹配计算）
            const allConnections = findConnections(Stocks.Data[0].filters, strongBlockData)

            // 为每个Stock找到匹配的强势Block的最高涨幅
            const stockToMaxBlockChange = new Map()
            allConnections.forEach((conn) => {
                const block = strongBlockData.find((b) => b['指数简称'] === conn.blockName)
                if (block) {
                    const blockChange = block[`${Dates.shareDate.td} 09:35`]?.涨跌幅 || 0
                    const stockName = conn.stockName
                    const currentMax = stockToMaxBlockChange.get(stockName) || -Infinity
                    if (blockChange > currentMax) {
                        stockToMaxBlockChange.set(stockName, blockChange)
                    }
                }
            })

            // 筛选出符合 displayStocks 强势条件的 Stock
            const strongStockData = Stocks.Data[0].filters.filter((stock) => {
                const data0935 = stock[`${Dates.shareDate.td} 09:35`]
                if (!data0935) return false
                const 涨跌幅 = data0935.涨跌幅 || 0
                const maxBlockChange = stockToMaxBlockChange.get(stock['股票简称'])
                // 如果没有匹配的强势Block，则不满足条件
                if (maxBlockChange === undefined) return false
                return 涨跌幅 > 0 && 涨跌幅 > maxBlockChange
            })

            // 基于筛选后的 Stock 重新计算连接关系
            const dynamicConnections = findConnections(strongStockData, strongBlockData)
            const dynamicBlockSet = new Set(dynamicConnections.map((c) => c.blockName))

            result.forEach((block) => {
                const matchCount = dynamicBlockSet.has(block['指数简称'])
                    ? dynamicConnections.filter((c) => c.blockName === block['指数简称']).length
                    : 0
                block.matchCount = matchCount
            })

            // 有匹配筛选（在强势基础上）
            if (MatchChart.blockFilterMode === 'matched') {
                result = result.filter((block) => block.matchCount > 0)
            }

            // 按09:35涨跌幅降序排序（涨幅大的在前）
            result.sort((a, b) => {
                const aChange = a[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                const bChange = b[`${Dates.shareDate.td} 09:35`]?.涨跌幅 ?? -Infinity
                return bChange - aChange
            })

            return result.map((b) => ({ ...b }))
        })

        // 计算属性：显示的Stock列表（根据筛选模式）
        const displayStocks = computed(() => {
            // 添加依赖：当 selectedBlock 或 selectedStock 变化时重新计算
            const _selectedBlock = MatchChart.selectedBlock
            const _selectedStock = MatchChart.selectedStock

            if (!ConnectionChart.data || ConnectionChart.data.length === 0) {
                Stocks.Data[0].filters.forEach((stock) => {
                    stock.matchCount = 0
                })
                // 没有连接数据时：matched模式返回空数组，strong模式返回强势数据
                if (MatchChart.stockFilterMode === 'matched') {
                    return []
                }
                let result = Stocks.Data[0].filters

                // 强势筛选
                if (MatchChart.stockFilterMode === 'strong') {
                    result = result.filter((stock) => {
                        const data0935 = stock[`${Dates.shareDate.td} 09:35`]
                        if (!data0935) return false
                        const 涨跌幅 = data0935.涨跌幅 || 0
                        return 涨跌幅 > 0
                    })
                }

                // 按热度排名升序排序（排名越小越热门）
                result.sort((a, b) => {
                    const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                    const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                    return aHeat - bHeat
                })

                // 返回新对象引用以强制刷新
                return result.map((s) => ({ ...s }))
            }

            // 根据筛选模式返回数据（返回新对象引用以强制刷新）
            // 三级递进：all -> strong -> matched
            let result = Stocks.Data[0].filters

            // 声明变量用于强势筛选和匹配计算
            let strongBlockData = []
            let dynamicConnections = []
            let stockToMaxBlockChange = new Map()

            // 强势筛选
            if (MatchChart.stockFilterMode === 'strong' || MatchChart.stockFilterMode === 'matched') {
                // 先计算强势Block数据
                strongBlockData = Blocks.Data[0].filters.filter((block) => {
                    const data0935 = block[`${Dates.shareDate.td} 09:35`]
                    if (!data0935) return false
                    const _35涨跌幅 = data0935.涨跌幅 || 0
                    const _35资金流向 = data0935.资金流向 || 0
                    const _35大单净额 = data0935.大单净额 || 0
                    const _33资金流向 = block[`${Dates.shareDate.td} 09:33`]?.资金流向 || 0
                    const _33大单净额 = block[`${Dates.shareDate.td} 09:33`]?.大单净额 || 0

                    return (
                        _35涨跌幅 > 0.5 &&
                        (_35资金流向 > 0 || _35大单净额 > 0 || (_35资金流向 > _33资金流向 && _35大单净额 > _33大单净额)) &&
                        !(_35资金流向 < _33资金流向 && _35大单净额 < _33大单净额)
                    )
                })

                // 计算动态连接关系
                const strongStockDataForMatch = result
                dynamicConnections = findConnections(strongStockDataForMatch, strongBlockData)

                // 为每个Stock找到匹配的强势Block的最高涨幅
                stockToMaxBlockChange = new Map()
                dynamicConnections.forEach((conn) => {
                    const block = strongBlockData.find((b) => b['指数简称'] === conn.blockName)
                    if (block) {
                        const blockChange = block[`${Dates.shareDate.td} 09:35`]?.涨跌幅 || 0
                        const stockName = conn.stockName
                        const currentMax = stockToMaxBlockChange.get(stockName) || -Infinity
                        if (blockChange > currentMax) {
                            stockToMaxBlockChange.set(stockName, blockChange)
                        }
                    }
                })

                // 强势筛选（Stock的09:35涨跌幅 > 0 且 > 匹配Block的最高涨幅）
                result = result.filter((stock) => {
                    const data0935 = stock[`${Dates.shareDate.td} 09:35`]
                    if (!data0935) return false
                    const 涨跌幅 = data0935.涨跌幅 || 0
                    const maxBlockChange = stockToMaxBlockChange.get(stock['股票简称'])
                    // 如果没有匹配的强势Block，则不满足条件
                    if (maxBlockChange === undefined) return false
                    return 涨跌幅 > 0 && 涨跌幅 > maxBlockChange
                })
            }

            // 在强势数据基础上重新计算匹配数量
            // 使用之前计算的 strongBlockData 和 dynamicConnections
            const dynamicStockSet = new Set(dynamicConnections.map((c) => c.stockName))

            result.forEach((stock) => {
                const matchCount = dynamicStockSet.has(stock['股票简称'])
                    ? dynamicConnections.filter((c) => c.stockName === stock['股票简称']).length
                    : 0
                stock.matchCount = matchCount
            })

            // 有匹配筛选（在强势基础上）
            if (MatchChart.stockFilterMode === 'matched') {
                result = result.filter((stock) => stock.matchCount > 0)
            }

            // 按热度排名升序排序（排名越小越热门）
            result.sort((a, b) => {
                const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                return aHeat - bHeat
            })

            return result.map((s) => ({ ...s }))
        })

        // 切换Block筛选模式
        const toggleBlockFilterMode = (mode) => {
            MatchChart.blockFilterMode = mode
            MatchChart.selectedBlock = null
            MatchChart.selectedStock = null
        }

        // 切换Stock筛选模式
        const toggleStockFilterMode = (mode) => {
            MatchChart.stockFilterMode = mode
            MatchChart.selectedBlock = null
            MatchChart.selectedStock = null
        }

        // 处理Block行点击
        const handleBlockRowClick = (row) => {
            MatchChart.selectedBlock = row['指数简称']
            MatchChart.selectedStock = null
        }

        // 处理Stock行点击
        const handleStockRowClick = (row) => {
            MatchChart.selectedStock = row['股票简称']
            MatchChart.selectedBlock = null
        }

        // 获取Block行的class名
        const getBlockRowClassName = ({ row }) => {
            const blockName = row['指数简称']

            // 如果选中的是Stock，检查当前Block是否与该Stock匹配
            if (MatchChart.selectedStock) {
                const isMatch = ConnectionChart.data.some(
                    (conn) => conn.stockName === MatchChart.selectedStock && conn.blockName === blockName,
                )
                if (isMatch) return 'highlight-row'
            }

            // 如果选中的是Block，检查是否是当前选中的
            if (MatchChart.selectedBlock === blockName) {
                return 'selected-row'
            }

            return ''
        }

        // 获取Stock行的class名
        const getStockRowClassName = ({ row }) => {
            const stockName = row['股票简称']

            // 如果选中的是Block，检查当前Stock是否与该Block匹配
            if (MatchChart.selectedBlock) {
                const isMatch = ConnectionChart.data.some(
                    (conn) => conn.blockName === MatchChart.selectedBlock && conn.stockName === stockName,
                )
                if (isMatch) return 'highlight-row'
            }

            // 如果选中的是Stock，检查是否是当前选中的
            if (MatchChart.selectedStock === stockName) {
                return 'selected-row'
            }

            return ''
        }

        // 删除当前日期的缓存数据
        const clearCache = async () => {
            const { tdcn } = Dates.shareDate
            const blocksCache = (await getLocalforage('Blocks')) || {}
            const stocksCache = (await getLocalforage('Stocks')) || {}

            delete blocksCache[tdcn]
            delete stocksCache[tdcn]

            await setLocalforage('Blocks', blocksCache)
            await setLocalforage('Stocks', stocksCache)

            // 清空当前数据
            Blocks.Data[0].filters = []
            Stocks.Data[0].filters = []
            Blocks.isFromCache = false
            Stocks.isFromCache = false

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
                console.log(`[自动切换] 切换到下一个交易日: ${nextDate}`)
                Dates.requestDate = nextDate
                Dates.setShareDate()

                try {
                    // 执行数据加载
                    await Submit()
                    
                    // 数据加载成功，重置连续错误计数器
                    Backtest.consecutiveErrors = 0
                    
                    // 检查数据是否来自缓存
                    const isFromCache = Blocks.isFromCache && Stocks.isFromCache
                    
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
                    console.log(`[自动切换] 连续错误次数: ${Backtest.consecutiveErrors}`)
                    
                    // 如果连续错误达到3次，自动停止
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
            Blocks,
            Stocks,
            ConnectionChart,
            MatchChart,
            GlobalState,
            Submit,
            changeDate,
            precentformater,
            formatNumber,
            isMobile,
            displayBlocks,
            displayStocks,
            toggleBlockFilterMode,
            toggleStockFilterMode,
            handleBlockRowClick,
            handleStockRowClick,
            getBlockRowClassName,
            getStockRowClassName,
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
