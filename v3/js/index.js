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
    Data: [{ name: 'Block策略', filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        const { tdcn } = dates
        const questions = getQuestions('block', dates)
        const cache = (await catcheGetFunction('Blocks')) || {}
        const target = cache[tdcn]

        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Blocks.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleBlocksData(target)
        } else {
            await Blocks.getData(questions, catcheSetFunction, cache, dates)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
        const { tdcn, isToday } = dates
        Blocks.loading = true
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
    Data: [{ name: 'Stock策略', filters: [] }],
    requestStatus: [],

    init: async (catcheGetFunction, catcheSetFunction, dates) => {
        const { tdcn } = dates
        const questions = getQuestions('stock', dates)
        const cache = (await catcheGetFunction('Stocks')) || {}
        const target = cache[tdcn]

        const isValid = target?.length === questions.length && target.every((d) => Array.isArray(d))

        if (isValid) {
            Stocks.requestStatus = questions.map((_, i) => ({
                name: `Request ${i + 1}`,
                status: 'success',
                message: 'From cache',
            }))
            handleStocksData(target)
        } else {
            await Stocks.getData(questions, catcheSetFunction, cache, dates)
        }
    },

    getData: async (questions, catcheSetFunction, cache, dates) => {
        const { tdcn, isToday } = dates
        Stocks.loading = true
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

        Stocks.loading = false
    },
})

/** @description Data Processing Functions */
async function handleBlocksData(res) {
    const arr = res[0].map((ele) => {
        const obj = {}
        handleRate(obj, ele, 'block', Dates.shareDate)
        return obj
    })
    // 按指数简称去重
    const uniqueArr = Array.from(new Map(arr.map((item) => [item['指数简称'], item])).values())
    Blocks.Data[0].filters = uniqueArr

    // 更新连线图
    ConnectionChart.updateData(Stocks.Data[0].filters, Blocks.Data[0].filters)

    // 渲染集合图
    setTimeout(() => {
        renderCollectionChart(Stocks.Data[0].filters, Blocks.Data[0].filters, Dates.shareDate)
    }, 100)
}

async function handleStocksData(res) {
    const map1 = new Map(res[1]?.map((item) => [item['股票简称'], item]) || [])

    const arr = res[0].map((ele) => {
        const match1 = map1.get(ele['股票简称']) || {}
        const merged = { ...ele, ...match1 }
        const obj = {}
        handleRate(obj, merged, 'stock', Dates.shareDate)
        return obj
    })
    // 按股票简称去重
    const uniqueArr = Array.from(new Map(arr.map((item) => [item['股票简称'], item])).values())
    Stocks.Data[0].filters = uniqueArr

    // 更新连线图
    ConnectionChart.updateData(Stocks.Data[0].filters, Blocks.Data[0].filters)

    // 渲染集合图
    setTimeout(() => {
        renderCollectionChart(Stocks.Data[0].filters, Blocks.Data[0].filters, Dates.shareDate)
    }, 100)
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
            }
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
            } finally {
                // 无论成功失败都恢复按钮状态
                GlobalState.isRequesting = false
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
            if (!ConnectionChart.data || ConnectionChart.data.length === 0) {
                Blocks.Data[0].filters.forEach((block) => {
                    block.matchCount = 0
                })
                return Blocks.Data[0].filters
            }

            const blockSet = new Set(ConnectionChart.data.map((c) => c.blockName))

            // 为所有Block计算匹配数量
            Blocks.Data[0].filters.forEach((block) => {
                const matchCount = blockSet.has(block['指数简称'])
                    ? ConnectionChart.data.filter((c) => c.blockName === block['指数简称']).length
                    : 0
                block.matchCount = matchCount
            })

            // 根据筛选模式返回数据
            if (MatchChart.blockFilterMode === 'matched') {
                return Blocks.Data[0].filters.filter((block) => block.matchCount > 0)
            } else {
                return Blocks.Data[0].filters
            }
        })

        // 计算属性：显示的Stock列表（根据筛选模式）
        const displayStocks = computed(() => {
            if (!ConnectionChart.data || ConnectionChart.data.length === 0) {
                Stocks.Data[0].filters.forEach((stock) => {
                    stock.matchCount = 0
                })
                return Stocks.Data[0].filters
            }

            const stockSet = new Set(ConnectionChart.data.map((c) => c.stockName))

            // 为所有Stock计算匹配数量
            Stocks.Data[0].filters.forEach((stock) => {
                const matchCount = stockSet.has(stock['股票简称'])
                    ? ConnectionChart.data.filter((c) => c.stockName === stock['股票简称']).length
                    : 0
                stock.matchCount = matchCount
            })

            // 根据筛选模式返回数据
            if (MatchChart.stockFilterMode === 'matched') {
                return Stocks.Data[0].filters.filter((stock) => stock.matchCount > 0)
            } else {
                return Stocks.Data[0].filters
            }
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
        }
    },
}

const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
app.mount('#app')
